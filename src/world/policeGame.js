/**
 * The pursuit.
 *
 * A car flashes and runs. Drive the police car into it and it is over.
 *
 * No THREE, like fireGame.js and for the same reason: a whole chase runs in a
 * millisecond here, where the same test through the browser takes minutes.
 *
 * THE ASYMMETRY, AGAIN
 * --------------------
 * Same shape as the fire, and for the same reason:
 *
 *   - Driving the police car, ONLY you can catch it. Other patrol cars join
 *     the chase and fill the mirror with blue lights, and none of them can
 *     end it. Otherwise the game plays itself.
 *   - Driving anything else, there are one to three chases running somewhere
 *     in the world as background. They resolve on their own, off screen, the
 *     way a city does.
 *
 * WHY THE ROBBER IS SLOWER
 * ------------------------
 * Mike's specification, and it is the whole design: unboosted, the robber is
 * a little slower than a police car. So a chase is winnable by driving well
 * rather than by holding the boost, and it cannot be lost by a car that is
 * simply faster than you. The margin is small enough that a bad line still
 * loses ground.
 */

/** How long after the world loads before the first one. */
export const FIRST_CHASE = 55

/** And between them. A minute to two, as asked. */
export const CHASE_GAP_MIN = 60
export const CHASE_GAP_MAX = 120

/**
 * How close counts as bumping it.
 *
 * A police car is 4.4 long and a sedan 4.4, so nose to tail is 4.4 between
 * centres. Five gives you the contact you can see rather than demanding a
 * measured touch, and it is short enough that passing in the other lane -
 * about 3.6 units across - does not count, because the check is on distance
 * between centres and an oncoming car is never within five AND alongside.
 */
export const BUMP_DISTANCE = 5

/**
 * How much slower the robber is than a police car, as a fraction.
 *
 * 0.92, so a police car at 18 catches a robber at 16.6 - closing at 1.4 units
 * a second. Over a 200-unit street that is enough to reel it in, and slow
 * enough that a missed corner gives it back.
 */
export const ROBBER_SPEED = 0.92

/**
 * How long before a suspect the player never catches is written off.
 *
 * Long, because a pursuit is the most fun thing in the world to be bad at,
 * and cutting it short after a minute would be punishing someone for
 * enjoying it.
 */
export const ESCAPE_AFTER = 240

/** How long a banner stays up once it is over. */
export const MESSAGE_TIME = 5

/**
 * THE RUN TO THE CELLS.
 *
 * Mike's addition, and the shape is the ambulance's: the crash is not over
 * when you reach it, and the chase is not over when you catch the car. You
 * have the suspect in the back and you drive them to a station.
 *
 * WHAT IT DELIBERATELY DOES NOT HAVE IS A CLOCK. The ambulance's two minutes
 * are there because a patient is dying; nothing is dying in the back of a
 * police car, and putting a timer on it would be inventing jeopardy to match a
 * shape rather than because the fiction asks for one. The pursuit already had
 * its pressure - it was the pursuit.
 *
 * So this half is a delivery, not a race, and the only number it needs is how
 * close counts as arriving. `ABANDON_CUSTODY` exists for the same reason the
 * fire has a burn limit: a player who drives off and never books the suspect
 * should not leave the game holding a chase that can never end.
 */
export const AT_STATION = 20
export const ABANDON_CUSTODY = 420

/**
 * How many chases run in the background when the player is not the police.
 *
 * One to three, as asked. Re-rolled each time the set changes rather than
 * fixed, so the city does not feel like it has a quota.
 */
export const BACKGROUND_MIN = 1
export const BACKGROUND_MAX = 3

/**
 * How long a background chase lasts before it resolves itself.
 *
 * It has to end somehow. The AI cannot catch a robber - that is the rule
 * that makes the player's version a game - so a background chase that never
 * timed out would run for the whole session and the world would slowly fill
 * with flashing cars. This is the off-screen arrest nobody sees.
 */
export const BACKGROUND_MIN_LIFE = 70
export const BACKGROUND_MAX_LIFE = 150

/** How far from the player a chase must start. Same reasoning as the fire. */
export const MIN_CHASE_DISTANCE = 50

export function newPoliceState() {
  return {
    phase: 'idle',        // idle | chase | over
    timer: FIRST_CHASE,
    chases: [],           // { id, life } - the player's is always chases[0]
    playerChase: false,   // is chases[0] the player's to end?
    message: null,
    messageFor: 0
  }
}

/**
 * Choose a car to be the robber.
 *
 * Any ordinary vehicle will do - not a bus, which cannot plausibly outrun
 * anything, and not a service vehicle, which has somewhere to be. Not one
 * already fleeing, and not one sitting on top of the player.
 */
export const ROBBER_KINDS = ['sedan', 'convertible', 'pickup', 'suv']

export function chooseRobber(candidates, player, rand) {
  const eligible = (candidates || []).filter(v =>
    ROBBER_KINDS.includes(v.kind) && !v.robber)
  if (!eligible.length) return null

  const faraway = player
    ? eligible.filter(v =>
        Math.hypot(v.x - player.x, v.z - player.z) > MIN_CHASE_DISTANCE)
    : eligible

  const pool = faraway.length ? faraway : eligible
  return pool[Math.floor(rand() * pool.length)] || null
}

/** Has the player's car actually hit it? */
export function caught(player, robber) {
  if (!player || !robber || !player.isPolice) return false
  return Math.hypot(player.x - robber.x, player.z - robber.z) <= BUMP_DISTANCE
}

/**
 * How many background chases there should be right now.
 *
 * Only when the player is NOT the police car. When they are, there is exactly
 * one and it is theirs - three simultaneous pursuits would turn the thing
 * you are meant to be chasing into one of a crowd.
 */
export function backgroundWanted(playerIsPolice, rand) {
  if (playerIsPolice) return 0
  return BACKGROUND_MIN +
         Math.floor(rand() * (BACKGROUND_MAX - BACKGROUND_MIN + 1))
}

/**
 * One frame of the pursuit game.
 *
 * `ctx` is: {
 *    player:     { x, z, isPolice } or null,
 *    robbers:    [{ id, x, z }],   whatever is currently fleeing
 *    spawn:      () => id | null,  make a new robber, return its id
 *    release:    (id) => void,     let one go back to being traffic
 *    rand:       () => 0..1
 * }
 *
 * Everything to do with lanes, meshes and flashing paint is the caller's.
 * This decides who is being chased and when it stops.
 */
/** Whichever police station is nearest a point. */
export function nearestStation(stations, to) {
  if (!stations || !stations.length || !to) return null
  let best = null
  let gap = Infinity
  for (const s of stations) {
    const d = Math.hypot(s.x - to.x, s.z - to.z)
    if (d < gap) { gap = d; best = s }
  }
  return best
}

/** Wrap the whole thing up and set the clock for the next one. */
function finish(state, ctx, message) {
  state.phase = 'over'
  state.chases = []
  state.custody = null
  state.message = message
  state.messageFor = MESSAGE_TIME
  state.timer = CHASE_GAP_MIN + ctx.rand() * (CHASE_GAP_MAX - CHASE_GAP_MIN)
  return state
}

export function stepPolice(state, delta, ctx) {
  if (state.messageFor > 0) {
    state.messageFor -= delta
    if (state.messageFor <= 0) { state.messageFor = 0; state.message = null }
  }

  const playerIsPolice = !!(ctx.player && ctx.player.isPolice)

  // Changing vehicle changes the game. Stepping out of a police car mid-chase
  // hands the pursuit back to the city; getting into one takes it over.
  if (state.playerChase !== playerIsPolice && state.chases.length) {
    for (const chase of state.chases) ctx.release(chase.id)
    state.chases = []
    state.phase = 'over'
    state.timer = 2
  }
  state.playerChase = playerIsPolice

  // --- Driving the suspect in ---
  //
  // Ahead of the pursuit branch, because while you are holding somebody there
  // is no chase to run and no new one to start.
  if (state.phase === 'custody' && state.custody) {
    if (!playerIsPolice) {
      // Got out of the police car with a suspect in the back. They are not
      // yours to deliver any more, so the arrest stands and the leg ends.
      return finish(state, ctx, 'SUSPECT HANDED OVER')
    }

    state.custody.held += delta

    const at = state.custody.station
    const here = ctx.player &&
      Math.hypot(ctx.player.x - at.x, ctx.player.z - at.z) <= AT_STATION
    if (here) return finish(state, ctx, 'SUSPECT BOOKED')

    if (state.custody.held > ABANDON_CUSTODY) {
      return finish(state, ctx, 'SUSPECT HANDED OVER')
    }
    return state
  }

  // --- The player's pursuit ---
  if (playerIsPolice) {
    if (state.phase === 'chase' && state.chases.length) {
      const chase = state.chases[0]
      const robber = (ctx.robbers || []).find(r => r.id === chase.id)

      // It stopped existing - respawned by the traffic, or picked up by the
      // stuck-vehicle valve. Not a failure; just start another.
      if (!robber) {
        state.chases = []
        state.phase = 'over'
        state.timer = 4
        return state
      }

      chase.life += delta

      if (caught(ctx.player, robber)) {
        ctx.release(chase.id)
        state.chases = []
        // Not over: you have them in the back and a station to get to.
        state.phase = 'custody'
        state.custody = {
          station: nearestStation(ctx.stations, ctx.player),
          held: 0
        }
        state.message = 'SUSPECT APPREHENDED'
        state.messageFor = MESSAGE_TIME
        // No station in the world at all - nothing to drive to, so it ends
        // here rather than opening a leg that cannot be completed.
        if (!state.custody.station) return finish(state, ctx, 'SUSPECT APPREHENDED')
        return state
      }

      if (chase.life > ESCAPE_AFTER) {
        ctx.release(chase.id)
        state.chases = []
        state.phase = 'over'
        state.message = 'SUSPECT ESCAPED'
        state.messageFor = MESSAGE_TIME
        state.timer = CHASE_GAP_MIN + ctx.rand() * (CHASE_GAP_MAX - CHASE_GAP_MIN)
      }
      return state
    }

    state.timer -= delta
    if (state.timer > 0) return state

    const id = ctx.spawn()
    if (id === null || id === undefined) { state.timer = 8; return state }

    state.chases = [{ id, life: 0 }]
    state.phase = 'chase'
    state.message = 'PURSUIT IN PROGRESS'
    state.messageFor = MESSAGE_TIME
    return state
  }

  // --- The city's own chases, one to three of them ---
  for (const chase of state.chases) chase.life += delta

  // Anything whose robber has gone, or whose time is up, is over.
  const before = state.chases.length
  state.chases = state.chases.filter(chase => {
    const alive = (ctx.robbers || []).some(r => r.id === chase.id)
    if (!alive) return false
    if (chase.life > chase.until) { ctx.release(chase.id); return false }
    return true
  })

  state.timer -= delta
  if (state.timer > 0 && state.chases.length) return state

  const wanted = backgroundWanted(false, ctx.rand)
  while (state.chases.length < wanted) {
    const id = ctx.spawn()
    if (id === null || id === undefined) break
    state.chases.push({
      id,
      life: 0,
      until: BACKGROUND_MIN_LIFE +
             ctx.rand() * (BACKGROUND_MAX_LIFE - BACKGROUND_MIN_LIFE)
    })
  }

  state.phase = state.chases.length ? 'chase' : 'idle'
  // Checked again shortly rather than every frame: spawning is the expensive
  // part and the answer cannot change quickly.
  if (state.chases.length !== before || state.timer <= 0) state.timer = 12

  return state
}

/**
 * What the HUD should show. The same shape fireHud() returns, so
 * chooseMission() can pick between them without knowing what either is.
 *
 * There is no bar. A pursuit has nothing to fill up - you have either hit it
 * or you have not - and inventing one would be a progress bar for a thing
 * that has no progress.
 *
 * AND NOTHING AT ALL FOR A CHASE THAT IS NOT YOURS.
 * -------------------------------------------------
 * A background chase gets no banner and no arrow. It is scenery: something
 * the city is doing, which you may drive past and notice. An arrow to it was
 * built and taken out again at Mike's request - pointing at a thing you have
 * no part in turns the HUD into a list of everything happening in the world,
 * which is the opposite of a callout. If you want to be in a chase, get in
 * the police car.
 */
export function policeHud(state, playerIsPolice, robbers) {
  const chase = state.playerChase && state.chases.length ? state.chases[0] : null
  const robber = chase
    ? (robbers || []).find(r => r.id === chase.id)
    : null

  // Holding a suspect: the arrow points at the station instead, the same way
  // the ambulance's turns from the crash to the hospital.
  if (state.phase === 'custody' && state.custody) {
    const at = state.custody.station
    return {
      active: true,
      mine: !!playerIsPolice,
      title: state.message || 'TAKE HIM IN',
      target: at ? { x: at.x, z: at.z } : null,
      showBar: false,
      barLabel: '',
      progress: 0,
      good: false
    }
  }

  return {
    active: !!robber || !!state.message,
    mine: !!playerIsPolice,
    // The banner says what just happened for a few seconds, and then CHASE
    // MODE takes over for as long as the chase is on. Without the second half
    // the screen goes quiet thirty seconds into a pursuit and there is nothing
    // left saying you are in one - only an arrow, which could be pointing at
    // anything.
    title: state.message || (robber ? 'CHASE MODE' : null),
    target: robber ? { x: robber.x, z: robber.z } : null,
    showBar: false,
    barLabel: '',
    progress: 0,
    good: false
  }
}
