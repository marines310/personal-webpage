/**
 * The fire.
 *
 * Every so often a building catches light. Smoke goes up so you can find it
 * from across the water; get a fire engine alongside and hold it there, and
 * the fire goes out.
 *
 * No THREE in here - the same split as seasons.js, cameraPose.js and
 * vehicleLights.js. Everything with a decision in it is arithmetic on plain
 * objects, so a test can run a whole incident in a millisecond instead of
 * needing a browser and ten minutes. World.js turns the state into smoke and
 * a ladder; UI.js turns it into a banner and a bar. Neither decides anything.
 *
 * WHO IS ALLOWED TO PUT IT OUT
 * ----------------------------
 * This is the rule the whole thing hangs on, and it is deliberately not
 * symmetrical:
 *
 *   - If you are driving a fire engine, ONLY your engine can contain it. The
 *     AI engines still turn out, and they still fill the street with lights,
 *     but they cannot finish the job. Otherwise the game plays itself while
 *     you watch, which is not a game.
 *   - If you are driving anything else, the AI engines deal with it. You see
 *     the smoke and the response; there is no bar, because you are not the
 *     one containing it.
 *
 * One flag, `playerIsFire`, decides which of those is in force, and it is
 * asked in exactly one place - `whoIsFighting()`.
 */

/** How long after the world loads before the first fire. Long enough to arrive. */
export const FIRST_FIRE = 40

/**
 * And the gap between them afterwards, in seconds.
 *
 * Two minutes, as asked, and deliberately exact rather than a range: "every
 * two minutes" is a promise you can feel, and a 70-150 second window - which
 * is what this was - reads as random rather than as regular. If it ever wants
 * jitter, widen MAX and the rest of the file needs no changes.
 */
export const FIRE_GAP_MIN = 120
export const FIRE_GAP_MAX = 120

/**
 * How close a fire engine has to be to count as on station.
 *
 * Measured to the BUILDING, not to a marker beside it, and generous enough
 * that you can park anywhere along the frontage rather than hunting for a
 * spot. A town plot is nine units across, so sixteen is roughly "pulled up
 * outside" rather than "in the exact right place".
 */
export const ON_STATION = 16

/** How long you have to hold it there. */
export const CONTAIN_SECONDS = 14

/**
 * How fast the bar falls back when the PLAYER leaves the scene.
 *
 * Slower than it fills, on purpose. Nipping round the block because you
 * overshot should cost you something, but not everything - a bar that
 * emptied as fast as it filled would punish a bad approach far harder than
 * it rewards a good one.
 *
 * It does not apply when the AI is fighting the fire, and that is not a
 * kindness to the AI - it is because there is no bar. The decay exists to
 * make holding position a skill; an engine passing the scene on its way
 * round the block is not failing at anything. Measured with decay applied to
 * both: a responding engine crossed the map, reached the fire, got the bar to
 * 8.3 of 14, drove on round the block and lost it all again, and the fire was
 * still burning after 320 seconds. Fires would simply never go out for
 * anybody who was not driving the engine themselves, which is exactly the
 * half of this Mike asked for.
 */
export const CONTAIN_DECAY = 0.35

/**
 * How much faster several engines put a fire out than one does.
 *
 * Capped, so a convoy cannot trivialise it. Only reachable by the AI, since
 * when you are driving the engine only your engine counts at all.
 */
export const MAX_CREWS = 2

/**
 * How long a fire can burn before it is given up on.
 *
 * Only reachable if nobody ever turns up. Generous, because "the player is
 * reading the CV" is a perfectly good reason for a fire to go unattended for
 * a few minutes, and a failure message for that would be nagging.
 */
export const BURN_LIMIT = 420

/** How long a banner stays on screen once the incident is over. */
export const MESSAGE_TIME = 5

/**
 * How many AI engines are sent. The rest carry on with their day.
 *
 * Three is enough to look like a response and few enough that the streets
 * do not empty of fire engines every time something catches light.
 */
export const RESPONDERS = 3

export function newFireState() {
  return {
    phase: 'idle',        // idle | burning | over
    timer: FIRST_FIRE,
    fire: null,
    message: null,
    messageFor: 0
  }
}

/**
 * Who is allowed to contain this fire, and are they here?
 *
 * Returns { fighting, playerOnStation, engines } - `fighting` being the only
 * thing the bar cares about. See the note at the top of the file for why the
 * two cases are different.
 */
export function whoIsFighting(fire, ctx) {
  const near = (p) => p &&
    Math.hypot(p.x - fire.x, p.z - fire.z) <= ON_STATION

  const playerOnStation = !!(ctx.player && ctx.player.isFire && near(ctx.player))
  const enginesOnStation = (ctx.engines || []).filter(near).length

  const playerIsFire = !!(ctx.player && ctx.player.isFire)

  return {
    playerOnStation,
    enginesOnStation,
    playerIsFire,
    // The asymmetry, in one line: your engine or theirs, never both.
    fighting: playerIsFire ? playerOnStation : enginesOnStation > 0,
    // And how fast. Several crews are faster than one, which only the AI can
    // ever have - see MAX_CREWS.
    rate: playerIsFire
      ? (playerOnStation ? 1 : 0)
      : Math.min(enginesOnStation, MAX_CREWS)
  }
}

/**
 * Choose a building to set alight.
 *
 * Anything with a footprint will do, but not one on top of the player: a fire
 * that starts fifteen units away is already contained before the banner has
 * finished appearing, and reads as a bug rather than as luck. Sixty units is
 * far enough to have to drive somewhere.
 */
export const MIN_FIRE_DISTANCE = 60

export function chooseBuilding(buildings, ctx, rand) {
  if (!buildings || !buildings.length) return null

  const player = ctx.player
  const faraway = player
    ? buildings.filter(b =>
        Math.hypot(b.x - player.x, b.z - player.z) > MIN_FIRE_DISTANCE)
    : buildings

  // If everything is close - a small map, or the player is in the middle of
  // it - take the whole list rather than returning nothing. A fire somewhere
  // beats no fire at all.
  const pool = faraway.length ? faraway : buildings
  return pool[Math.floor(rand() * pool.length)] || null
}

/**
 * One frame of the fire game.
 *
 * `ctx` is: {
 *    buildings: [{ x, z, island, height }],
 *    player:    { x, z, isFire } or null,
 *    engines:   [{ x, z }],       AI fire engines, wherever they happen to be
 *    rand:      () => 0..1
 * }
 *
 * Mutates and returns `state`. Nothing here draws, routes or knows what an
 * island looks like.
 */
export function stepFire(state, delta, ctx) {
  if (state.messageFor > 0) {
    state.messageFor -= delta
    if (state.messageFor <= 0) { state.messageFor = 0; state.message = null }
  }

  if (state.phase === 'idle' || state.phase === 'over') {
    state.timer -= delta
    if (state.timer > 0) return state

    const building = chooseBuilding(ctx.buildings, ctx, ctx.rand)
    if (!building) { state.timer = 10; return state }

    state.phase = 'burning'
    state.fire = {
      x: building.x,
      z: building.z,
      top: building.height || 6,
      island: building.island || '',
      building,
      burning: 0,
      contained: 0
    }
    state.message = `FIRE AT ${(building.island || 'THE ISLAND').toUpperCase()}`
    state.messageFor = MESSAGE_TIME
    return state
  }

  // --- Burning ---
  const fire = state.fire
  fire.burning += delta

  const who = whoIsFighting(fire, ctx)
  fire.playerOnStation = who.playerOnStation
  fire.enginesOnStation = who.enginesOnStation

  if (who.fighting) {
    fire.contained = Math.min(CONTAIN_SECONDS, fire.contained + delta * who.rate)
  } else if (who.playerIsFire) {
    // Only the player's bar falls back. See the note on CONTAIN_DECAY.
    fire.contained = Math.max(0, fire.contained - delta * CONTAIN_DECAY)
  }

  if (fire.contained >= CONTAIN_SECONDS) {
    state.phase = 'over'
    state.message = 'FIRE CONTAINED'
    state.messageFor = MESSAGE_TIME
    state.timer = FIRE_GAP_MIN + ctx.rand() * (FIRE_GAP_MAX - FIRE_GAP_MIN)
    state.fire = null
    return state
  }

  if (fire.burning > BURN_LIMIT) {
    state.phase = 'over'
    state.message = 'FIRE BURNED OUT'
    state.messageFor = MESSAGE_TIME
    state.timer = FIRE_GAP_MIN + ctx.rand() * (FIRE_GAP_MAX - FIRE_GAP_MIN)
    state.fire = null
  }

  return state
}

/**
 * What the HUD should show. One object, so UI.js has nothing to work out.
 *
 * The bar appears only when the player is driving a fire engine, because
 * only then is it the player's bar. In anything else you get the banner and
 * the smoke, and the AI deals with it - which is what was asked for.
 */
export function fireHud(state, playerIsFire) {
  const fire = state.fire
  return {
    message: state.message,
    showBar: !!(fire && playerIsFire),
    barLabel: 'FIRE CONTAINMENT',
    progress: fire ? fire.contained / CONTAIN_SECONDS : 0,
    onStation: !!(fire && fire.playerOnStation)
  }
}

/**
 * Where to point the arrow, and how far away the fire is.
 *
 * `viewer` is { x, z, yaw } - the CAMERA's position and facing, not the car's.
 * The arrow is drawn on the screen, and what "left" means on a screen is
 * decided by where the camera is looking. Pointing it relative to the car
 * would swing it about every time you looked over your shoulder, while the
 * world stayed still.
 *
 * `angle` comes back in SCREEN terms: 0 is straight up the screen, and it
 * grows CLOCKWISE, because that is what a CSS rotation does and the only
 * consumer is a CSS rotation. Headings in this world grow anticlockwise (the
 * car's nose is +Z, so its right is -X - see turnDirection in
 * vehicleLights.js), so the sign is flipped exactly once, here, rather than
 * being flipped in the renderer where nobody would find it.
 */
export function missionArrow(state, viewer) {
  const fire = state && state.fire
  if (!fire || !viewer) return { show: false, angle: 0, distance: 0 }

  const dx = fire.x - viewer.x
  const dz = fire.z - viewer.z

  let relative = Math.atan2(dx, dz) - (viewer.yaw || 0)
  while (relative > Math.PI) relative -= Math.PI * 2
  while (relative < -Math.PI) relative += Math.PI * 2

  return {
    show: true,
    angle: -relative,
    distance: Math.hypot(dx, dz)
  }
}

/** How thick the smoke is: full while burning, dying back as it is contained. */
export function smokeStrength(state) {
  if (!state.fire) return 0
  return 1 - 0.75 * (state.fire.contained / CONTAIN_SECONDS)
}
