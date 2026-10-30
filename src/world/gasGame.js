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
 * STAGE TWO: SOMEBODY HAS TO HOLD THE NOZZLE
 * ------------------------------------------
 * Each station has an attendant. Pull onto a bay and they walk to its pump,
 * lift the nozzle, walk to your filler and plug it in - and only THEN does
 * the tank start to rise. Leave and they unplug at once, hang it up and walk
 * back. All of that is stepAttendant() below, still plain objects, so a test
 * can watch a whole visit in a millisecond. The figure and the hose are
 * World.js's, and they only draw what this says.
 *
 * Without attendants in `ctx` the pump is self-serve and fills at once,
 * which is exactly what stage one did - nothing that ran before has to know
 * this stage exists.
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

/**
 * The attendant: a walk, not a jog. Measured against the walk cycle's stride
 * in pedestrians.js, this is an unhurried pace - and it is short enough that
 * the whole trip from the end of the island to your filler is a couple of
 * seconds, which is the right amount of waiting to be watching someone work.
 */
export const ATTENDANT_SPEED = 1.5

/** Lifting the nozzle off the pump, and plugging it into the car. */
export const HOOKUP_SECONDS = 0.7

/** Close enough to a spot to count as standing on it. */
export const ARRIVED = 0.08

/**
 * Where the attendant stands to work the pump: off its face, on the bay
 * side, so they are not standing inside the island.
 */
export const PUMP_STAND = 0.9

/**
 * The filler: on the side of the car facing the pump, a little behind the
 * middle (where a filler cap is), and far enough out from the bodywork to
 * stand at.
 */
export const FILLER_BACK = 0.2
export const FILLER_STAND = 0.45

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
    flowing: false,       // is fuel actually going in this frame
    message: null,
    messageFor: 0
  }
}

/**
 * One attendant per station, standing at the first bay's waiting spot.
 *
 * `bays` are that station's bays, each carrying `pump` and
 * `attendantHome` from the layout.
 */
export function newAttendant(station, bays) {
  const first = bays && bays.find(b => b.station === station && b.attendantHome)
  if (!first) return null

  const home = { x: first.attendantHome.x, z: first.attendantHome.z }
  return {
    station,
    x: home.x,
    z: home.z,
    home,
    heading: faceTowards(home, first.pump),
    task: 'idle',      // idle | toPump | toCar | hooking | fuelling | hangUp | toHome
    pump: null,        // the pump the hose comes from while it is off its hook
    filler: null,      // where the nozzle goes
    hose: false,       // nozzle off the pump
    nozzleIn: false,   // nozzle in the car - the only state fuel flows in
    timer: 0,
    travelled: 0,      // for the walk cycle, which runs off distance
    walking: false
  }
}

/** Every station's attendant, from the flattened bays. */
export function makeAttendants(bays) {
  const ids = [...new Set((bays || []).map(b => b.station))]
  return ids.map(id => newAttendant(id, bays)).filter(Boolean)
}

function faceTowards(from, to) {
  if (!to) return 0
  return Math.atan2(to.x - from.x, to.z - from.z)
}

/** Where the attendant stands to lift the nozzle off this bay's pump. */
export function pumpStand(bay) {
  const p = bay.pump
  const dx = bay.x - p.x
  const dz = bay.z - p.z
  const d = Math.hypot(dx, dz) || 1
  const step = Math.min(PUMP_STAND, d * 0.5)
  return { x: p.x + dx / d * step, z: p.z + dz / d * step }
}

/**
 * Where the nozzle goes on THIS car, parked where it is.
 *
 * Off the side that faces the pump, not off whichever side is nearest the
 * attendant - that is the side the filler is on at a real pump, because you
 * chose it when you pulled in. `heading` and `width`/`length` are optional;
 * without them it is a point on a sedan-sized car, pointing at the pump.
 */
export function fillerPoint(player, pump) {
  const width = player.width || 1.9
  const length = player.length || 4.4
  const dx = pump.x - player.x
  const dz = pump.z - player.z

  if (!Number.isFinite(player.heading)) {
    const d = Math.hypot(dx, dz) || 1
    const r = width / 2 + FILLER_STAND
    return { x: player.x + dx / d * r, z: player.z + dz / d * r }
  }

  const fx = Math.sin(player.heading)
  const fz = Math.cos(player.heading)
  // Right-hand side of the car, and whether the pump is on it
  const sx = -fz
  const sz = fx
  const side = dx * sx + dz * sz >= 0 ? 1 : -1
  const out = width / 2 + FILLER_STAND
  const back = length * FILLER_BACK

  return {
    x: player.x + sx * side * out - fx * back,
    z: player.z + sz * side * out - fz * back
  }
}

/**
 * Walk towards a spot. Returns true on arrival.
 *
 * Distance travelled is kept so the figure's legs can follow the ground
 * rather than a clock - see walkCycle() in pedestrians.js for why.
 */
function walkTo(a, to, delta) {
  const dx = to.x - a.x
  const dz = to.z - a.z
  const d = Math.hypot(dx, dz)

  if (d <= ARRIVED) {
    a.x = to.x
    a.z = to.z
    a.walking = false
    return true
  }

  const step = Math.min(d, ATTENDANT_SPEED * delta)
  a.x += dx / d * step
  a.z += dz / d * step
  a.travelled += step
  a.heading = Math.atan2(dx, dz)
  a.walking = true
  return d - step <= ARRIVED
}

/**
 * One frame of one attendant.
 *
 * `job` is null (nobody to serve) or { bay, filler }. The whole visit is a
 * short list of places and one rule: the nozzle comes OUT of the car the
 * moment there is no job, wherever the walk had got to. Fuel only flows
 * while `nozzleIn` is true, so a car that drives off cannot leave a hose
 * plugged into it, and an attendant still walking out never puts fuel in.
 */
export function stepAttendant(a, delta, job) {
  if (!a) return a

  // --- No job: unplug, hang up, go back ---
  if (!job) {
    a.nozzleIn = false
    a.filler = null

    if (a.hose) {
      // Back to the pump the hose belongs to before anything else; an
      // attendant walking home trailing a nozzle has stretched it across the
      // forecourt.
      a.task = 'hangUp'
      if (walkTo(a, a.pumpStand, delta)) {
        a.hose = false
        a.pump = null
        a.task = 'toHome'
      }
      return a
    }

    if (a.task === 'idle') {
      a.walking = false
      return a
    }

    a.task = 'toHome'
    if (walkTo(a, a.home, delta)) {
      a.task = 'idle'
      a.walking = false
    }
    return a
  }

  // --- A job, at a bay ---
  const bay = job.bay

  // A different pump from the one in hand: hang this one up first. Not
  // reachable from a single visit, but two bays at one station and a player
  // who hops between them would otherwise teleport the hose.
  if (a.hose && a.pump && bay.pump &&
      (a.pump.x !== bay.pump.x || a.pump.z !== bay.pump.z)) {
    return stepAttendant(a, delta, null)
  }

  a.filler = job.filler

  if (!a.hose) {
    a.task = 'toPump'
    const stand = pumpStand(bay)
    if (walkTo(a, stand, delta)) {
      a.hose = true
      a.pump = { x: bay.pump.x, z: bay.pump.z }
      a.pumpStand = stand
      a.task = 'toCar'
    }
    return a
  }

  if (!a.nozzleIn) {
    if (a.task !== 'hooking') {
      a.task = 'toCar'
      if (walkTo(a, job.filler, delta)) {
        a.task = 'hooking'
        a.timer = HOOKUP_SECONDS
        a.heading = faceTowards(a, job.carAt || job.filler)
      }
      return a
    }

    a.walking = false
    a.timer -= delta
    if (a.timer <= 0) {
      a.timer = 0
      a.nozzleIn = true
      a.task = 'fuelling'
    }
    return a
  }

  a.task = 'fuelling'
  a.walking = false
  return a
}

/** This bay's station's attendant, if it has one. */
export function attendantFor(attendants, bay) {
  if (!attendants || !bay) return null
  return attendants.find(a => a.station === bay.station) || null
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
    state.flowing = false
    return serveAttendants(state, delta, ctx)
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
      state.flowing = false
      return serveAttendants(state, delta, ctx)
    }

    // Nothing goes in until the nozzle is in the car. No attendant at all is
    // a self-serve pump, which is stage one exactly.
    const attendant = attendantFor(ctx.attendants, state.bay)
    state.flowing = !attendant || attendant.nozzleIn
    if (state.flowing) {
      state.fuel = Math.min(1, state.fuel + delta / FILL_SECONDS)
    }

    if (state.fuel >= 1) {
      state.fuel = 1
      state.phase = 'driving'
      state.bay = null
      state.flowing = false
      state.message = 'TANK FULL'
      state.messageFor = MESSAGE_TIME
    }
    return serveAttendants(state, delta, ctx)
  }

  // --- Pulling onto a bay ---
  //
  // Only worth starting if there is room in the tank. Stopping on the bay
  // with a full one should not pin an attendant to your window.
  if (atPump && stopped && state.fuel < TOP_UP) {
    state.phase = 'filling'
    state.bay = bay
    state.towRequested = false
    // With an attendant on the way, the banner says so (see gasHud) rather
    // than claiming FILLING UP over a tank that is not yet rising.
    const attendant = attendantFor(ctx.attendants, bay)
    state.flowing = !attendant
    state.message = attendant ? null : 'FILLING UP'
    state.messageFor = attendant ? 0 : MESSAGE_TIME
    return serveAttendants(state, delta, ctx)
  }

  // --- Driving, and running out ---
  state.phase = state.phase === 'dry' && state.fuel <= 0 ? 'dry' : 'driving'
  state.bay = null
  state.flowing = false

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

  return serveAttendants(state, delta, ctx)
}

/**
 * Every attendant, one frame: the one at the bay being filled has a job,
 * everybody else is going home or already there.
 */
function serveAttendants(state, delta, ctx) {
  const attendants = ctx && ctx.attendants
  if (!attendants || !attendants.length) return state

  const player = ctx.player
  const bay = state.phase === 'filling' ? state.bay : null

  for (const a of attendants) {
    if (bay && a.station === bay.station && bay.pump && player) {
      stepAttendant(a, delta, {
        bay,
        filler: fillerPoint(player, bay.pump),
        carAt: { x: player.x, z: player.z }
      })
    } else {
      stepAttendant(a, delta, null)
    }
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
      title: state.message ||
        (state.flowing === false ? 'ATTENDANT COMING' : 'FILLING UP'),
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
