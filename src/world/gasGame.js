/**
 * Fuel.
 *
 * Every vehicle you can drive carries a tank, it empties as you drive, and
 * you fill it again by pulling onto a marked bay at a gas station. Run it
 * dry and the tow truck comes for you.
 *
 * No THREE in here - the same split as fireGame.js, policeGame.js and
 * towGame.js. Everything with a decision in it is arithmetic on plain
 * objects, so a test can drive a whole tank down and back up in a
 * millisecond instead of needing a browser. World.js turns the state into a
 * canopy, a pump and a walking attendant; UI.js turns it into a gauge.
 * Neither decides anything.
 *
 * THE MONORAIL HAS NO TANK, AND NOT BY A SPECIAL CASE
 * ---------------------------------------------------
 * It is simply absent from TANK_SECONDS. An unknown kind gets no tank and
 * burns nothing, so the rule is "what is in the table has fuel" rather than
 * "everything has fuel except these". A `kind === 'monorail'` test at the
 * call site is one more place to forget when the next unfuelled thing turns
 * up, and there is already a `kind === 'monorail'` early return in
 * Vehicle.js that exists for exactly that reason.
 */

/**
 * How long each kind runs at FULL throttle, in seconds.
 *
 * Mike asked for this to vary by vehicle, and the ordering is the point
 * rather than the exact figures: a sedan sips, a fire engine drinks, and the
 * monster truck is the worst of the lot. Eight minutes is the middle of it,
 * which is long enough to explore an island or finish a callout and short
 * enough that you have to think about it.
 *
 * Measured against the driving, not the clock: 480 seconds here is 480
 * seconds of your foot down, and a lap of the map at speed is nothing like
 * that long. See burnRate().
 */
export const TANK_SECONDS = {
  sedan: 540,
  convertible: 540,
  suv: 480,
  pickup: 480,
  police: 480,
  tow: 420,
  ambulance: 420,
  bus: 360,
  fire: 330,
  race: 300,
  monster: 270
}

/**
 * What an idling engine costs, as a share of the full-throttle rate.
 *
 * Not zero, because a car parked for ten minutes with the engine running
 * should not be exactly as full as when you left it, and not large, because
 * being punished for stopping to read the CV is the opposite of the point.
 * At 0.08 a full tank idles away in an hour and a half.
 */
export const IDLE_SHARE = 0.08

/** Below this the gauge warns and the arrow comes up. A quarter, as asked. */
export const LOW_FUEL = 0.25

/** How long a bone-dry tank takes to fill, in seconds. */
export const FILL_SECONDS = 9

/**
 * Full enough not to bother the attendant.
 *
 * Not 1, and the reason is a loop the tests found: parked on the bay with a
 * brim-full tank, the engine idles a few millionths away, the tank is then
 * "not full", a fill starts, it reaches full, and round again - a FILLING UP
 * banner every few frames forever. Anything within half a percent is full.
 */
export const TOP_UP = 0.995

/**
 * How close to the bay you have to stop, and how still you have to be.
 *
 * Generous on both. The bay is a painted outline you aim at, not a parking
 * test, and a vehicle settling on its springs still reads a little speed for
 * a moment after you let go.
 */
export const AT_PUMP = 5
export const STOPPED_SPEED = 0.8

/** How long a banner stays up once something has happened. */
export const MESSAGE_TIME = 4

/** Does this kind carry fuel at all? */
export function hasTank(kind) {
  return Object.prototype.hasOwnProperty.call(TANK_SECONDS, kind)
}

/**
 * Fraction of a tank burned per second, at this speed.
 *
 * Proportional to how hard you are driving rather than to wall-clock time.
 * A tank measured in minutes-of-existing would empty while you sat reading a
 * zone panel, which reads as the game taking something from you rather than
 * as fuel.
 *
 * `speed` and `maxSpeed` are whatever units the vehicle uses; only their
 * ratio matters here, which is why this does not import either.
 */
export function burnRate(kind, speed, maxSpeed) {
  const seconds = TANK_SECONDS[kind]
  if (!seconds) return 0

  const top = Math.abs(maxSpeed) > 1e-6 ? Math.abs(maxSpeed) : 1
  const effort = Math.min(1, Math.abs(speed || 0) / top)

  return (IDLE_SHARE + (1 - IDLE_SHARE) * effort) / seconds
}

export function newGasState() {
  return {
    phase: 'driving',     // driving | filling | dry
    kind: null,           // what the tank currently belongs to
    fuel: 1,              // 0 to 1, or null for a kind with no tank
    bay: null,            // the bay being filled at
    target: null,         // the station the arrow points to while low
    towRequested: false,
    message: null,
    messageFor: 0
  }
}

/** Whichever bay is nearest a point, or null if there are none. */
export function nearestBay(bays, to) {
  if (!bays || !bays.length || !to) return null

  let best = null
  let bestDistance = Infinity

  for (const bay of bays) {
    const d = Math.hypot(bay.x - to.x, bay.z - to.z)
    if (d < bestDistance) { bestDistance = d; best = bay }
  }

  return best
}

/**
 * One frame of the fuel game.
 *
 * `ctx` is: {
 *    player:   { x, z, kind, speed } or null,
 *    maxSpeed: the player's top speed, in the same units as `speed`,
 *    bays:     [{ x, z, heading, station }],
 *    tow:      () => void     called ONCE when the tank runs dry
 * }
 *
 * Mutates and returns `state`. Nothing here draws, routes, or knows what a
 * gas station looks like.
 */
export function stepGas(state, delta, ctx) {
  if (state.messageFor > 0) {
    state.messageFor -= delta
    if (state.messageFor <= 0) { state.messageFor = 0; state.message = null }
  }

  const player = ctx && ctx.player

  // Nothing to fuel: no vehicle, or one that does not take fuel.
  if (!player || !hasTank(player.kind)) {
    state.phase = 'driving'
    state.kind = player ? player.kind : null
    state.fuel = null
    state.bay = null
    state.target = null
    return state
  }

  // A SWAP IS A FULL TANK. You change vehicle at the garage, and a garage
  // that hands you an empty one is a garage you would never use twice. It
  // also keeps the tank attached to the vehicle rather than to the player,
  // which is what the gauge is showing.
  if (state.kind !== player.kind) {
    state.kind = player.kind
    state.fuel = 1
    state.phase = 'driving'
    state.bay = null
    state.target = null
    state.towRequested = false
  }

  const bay = nearestBay(ctx.bays, player)
  const atPump = !!bay && Math.hypot(bay.x - player.x, bay.z - player.z) <= AT_PUMP
  const stopped = Math.abs(player.speed || 0) <= STOPPED_SPEED

  // --- Filling ---
  //
  // You may leave at any time, which is the whole of the rule: anything that
  // is not "stopped, on the bay" ends the fill and keeps whatever went in.
  if (state.phase === 'filling') {
    if (!atPump || !stopped) {
      state.phase = 'driving'
      state.bay = null
      return state
    }

    state.fuel = Math.min(1, state.fuel + delta / FILL_SECONDS)

    if (state.fuel >= 1) {
      state.fuel = 1
      state.phase = 'driving'
      state.bay = null
      state.message = 'TANK FULL'
      state.messageFor = MESSAGE_TIME
    }
    return state
  }

  // --- Pulling onto a bay ---
  //
  // Only worth starting if there is room in the tank. Stopping on the bay
  // with a full one should not pin an attendant to your window.
  if (atPump && stopped && state.fuel < TOP_UP) {
    state.phase = 'filling'
    state.bay = bay
    state.towRequested = false
    state.message = 'FILLING UP'
    state.messageFor = MESSAGE_TIME
    return state
  }

  // --- Driving, and running out ---
  state.phase = state.phase === 'dry' && state.fuel <= 0 ? 'dry' : 'driving'
  state.bay = null

  // STOPPED ON THE BAY BURNS NOTHING. You are parked at a pump with the
  // engine off, and the alternative is the loop above: idle down, top up,
  // idle down. It also means sitting on the forecourt reading the map is
  // free, which is the same kindness the idle rate is about.
  if (!(atPump && stopped)) {
    state.fuel = Math.max(0,
      state.fuel - burnRate(player.kind, player.speed, ctx.maxSpeed) * delta)
  }

  if (state.fuel <= 0) {
    // ONCE, not every frame. A tow asked for sixty times a second is sixty
    // tow trucks, and the flag is cleared by filling up rather than by
    // getting moving - otherwise being dragged along by the truck clears it
    // and the next frame asks for another one.
    if (!state.towRequested) {
      state.towRequested = true
      state.phase = 'dry'
      state.message = 'OUT OF FUEL'
      state.messageFor = MESSAGE_TIME
      if (ctx.tow) ctx.tow()
    }
  }

  // Which station to point at while low. Chosen when the warning starts and
  // then kept, rather than re-evaluated every frame: two stations roughly
  // equidistant make the arrow flick between them, which is worse than
  // pointing at the second-nearest one.
  if (state.fuel <= LOW_FUEL) {
    if (!state.target) state.target = bay
  } else {
    state.target = null
  }

  return state
}

/**
 * What the HUD should show, in the shape chooseMission() takes.
 *
 * Listed AFTER the three callouts in World.js, so a fire you are actually
 * fighting keeps the arrow. The gauge is drawn separately and is always on
 * screen, so being outranked here never leaves you without the information -
 * it only decides who gets the one arrow.
 */
export function gasHud(state, playerHasTank) {
  if (!playerHasTank || state.fuel === null) {
    return { active: false, mine: false }
  }

  if (state.phase === 'filling') {
    return {
      active: true,
      mine: true,
      title: state.message || 'FILLING UP',
      target: null,
      showBar: true,
      barLabel: 'TANK',
      progress: state.fuel,
      good: true
    }
  }

  const low = state.fuel <= LOW_FUEL

  return {
    active: low || !!state.message,
    mine: true,
    title: state.message || (state.fuel <= 0 ? 'OUT OF FUEL' : 'LOW FUEL'),
    target: low && state.target
      ? { x: state.target.x, z: state.target.z }
      : null,
    showBar: false,
    barLabel: '',
    progress: 0,
    good: false
  }
}

/**
 * What the gauge needs: a fraction, and whether to look worried about it.
 *
 * UI.js works nothing out for itself - the same rule the fire HUD already
 * follows, and the reason the banner and the bar cannot disagree about what
 * is happening.
 */
export function fuelGauge(state) {
  if (state.fuel === null) return { show: false, fuel: 0, low: false, empty: false }

  return {
    show: true,
    fuel: state.fuel,
    low: state.fuel <= LOW_FUEL,
    empty: state.fuel <= 0,
    filling: state.phase === 'filling'
  }
}
