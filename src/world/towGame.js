/**
 * The tow truck run.
 *
 * A crash has happened, the ambulance has been and gone, and the two wrecked
 * cars are still lying in the road. Get the tow truck, hook one up, drag it
 * back to the garage, then go back for the other one.
 *
 * No THREE, like fireGame.js, policeGame.js and ambulanceGame.js. A whole job
 * runs in under a millisecond here; the same thing through a browser is
 * minutes.
 *
 * WHAT IS DIFFERENT ABOUT THIS ONE
 * --------------------------------
 * The other three callouts are about GETTING somewhere in time. This one is
 * about bringing something back, and that changes two things.
 *
 *   1. **There is no clock.** A fire decays, a patient dies, a robber gets
 *      away. A wrecked car does not get worse while you drive to it. Putting a
 *      countdown on it would be inventing jeopardy that the fiction does not
 *      have, and this game already has three timed callouts. What this one has
 *      instead is DISTANCE - two round trips to the garage from wherever the
 *      crash happened, which on this map is a real drive.
 *
 *   2. **The job has state in the world, not just in the state machine.** The
 *      other three finish and the world goes back to how it was. Here, one car
 *      leaves the scene and one stays, and then two cars are parked in the
 *      garage. `job.cars` is the record of that, and World.js reads it every
 *      frame to decide where two lumps of geometry are. It is the only one of
 *      the four whose state a player can SEE.
 *
 * THE ASYMMETRY, FOR THE FOURTH TIME
 * ----------------------------------
 * Driving the tow truck, the job is yours. Driving anything else, an AI tow
 * truck turns up and clears the scene off-screen - the same rule the fire, the
 * pursuit and the ambulance run all arrived at independently. See
 * `CREW_CLEAR_SECONDS`.
 */

// ---------------------------------------------------------------------------
// THE RIG
// ---------------------------------------------------------------------------

/**
 * Where the wheel-lift is, in the truck's own frame: +z forward, +y up,
 * origin at the middle of the truck on the ground.
 *
 * THIS LIVES HERE AND NOT IN World.js ON PURPOSE. Two things need to agree
 * about where the yoke is: the mesh that draws the boom, and the arithmetic
 * that decides where a towed car hangs off it. Those are in different files,
 * and every fitting in this project that came adrift came adrift because the
 * same number was typed in two places.
 *
 * A wheel-lift is a boom that slides out from under the back of the body, ends
 * in a crossbar, and picks a car up by its front tyres - so the car's front
 * axle sits AT the yoke and its back wheels stay on the road and roll. That is
 * why `lift` matters to the maths and not just to the picture: it is what
 * decides the angle the car is dragged at.
 */
export const TOW_RIG = {
  /** Where the boom hinges, under the back of the service body. */
  pivotY: 1.02,
  pivotZ: -2.35,
  /** How far the boom reaches back from the hinge, stowed and run out. */
  stowed: 1.15,
  extended: 2.75,
  /** The yoke's height off the road with the boom down, and how far it rises. */
  restY: 0.34,
  lift: 0.58,
  /** The crossbar the car's front tyres sit on. */
  yokeWidth: 1.75
}

/**
 * Where the yoke is, in the truck's own frame, at a given reach and lift.
 *
 * `reach01` and `lift01` are both 0..1. Returned as a point because that point
 * IS the coupling: a towed car's front axle is exactly here, and everything
 * else about where the car is follows from that plus its own wheelbase.
 */
export function yokeAt(reach01, lift01) {
  const r = TOW_RIG.stowed + (TOW_RIG.extended - TOW_RIG.stowed) * reach01
  return {
    x: 0,
    y: TOW_RIG.restY + TOW_RIG.lift * lift01,
    z: TOW_RIG.pivotZ - r,
    reach: r
  }
}

/**
 * How a car hangs off a raised yoke.
 *
 * The car is held by its front axle and rolling on its back wheels, so it is
 * tilted nose-up by whatever the lift is over its own wheelbase - and its rear
 * axle trails the yoke by LESS than its wheelbase, because a tilted car is
 * shorter along the ground than a flat one. Both of those come out of the same
 * right-angled triangle, and getting the second one wrong is what makes a
 * towed car creep forwards into the truck over a long drive.
 *
 * `wheelbase` is the axle-to-axle distance; the fleet's wheels sit at 0.31 of
 * the length either side of centre, so it is 0.62 of the length.
 */
export function towGeometry(wheelbase, liftHeight) {
  const rise = Math.min(liftHeight, wheelbase * 0.9)
  const pitch = Math.asin(rise / wheelbase)
  return {
    pitch,
    /** Horizontal distance from the rear axle to the yoke. */
    trail: wheelbase * Math.cos(pitch),
    rise
  }
}

/**
 * One step of the trailer, which is the whole reason the towing is smooth.
 *
 * The rear axle is dragged to sit exactly `trail` behind the yoke, and the car
 * points at the yoke. That is not an approximation of a tow bar, it IS a tow
 * bar - the constraint is re-satisfied exactly every frame, so it cannot drift,
 * cannot oscillate and cannot explode, which is the thing a physics joint
 * between a heavy car and a boom absolutely can do.
 *
 * It also has the property Mike asked for without being asked to: a car
 * dragged this way sweeps INSIDE the truck's line through a corner and swings
 * out again on the exit, because that is what the arithmetic does. Nothing
 * about the cornering had to be authored.
 *
 * `rear` is { x, z } and is modified in place and returned.
 */
export function dragStep(rear, yoke, trail) {
  let dx = yoke.x - rear.x
  let dz = yoke.z - rear.z
  let len = Math.hypot(dx, dz)

  // Degenerate only on the first frame of a hitch, and only if the car was
  // sitting exactly under the yoke. Point it along the truck rather than
  // dividing by zero.
  if (len < 1e-6) { dx = 0; dz = 1; len = 1 }

  rear.x = yoke.x - (dx / len) * trail
  rear.z = yoke.z - (dz / len) * trail
  return { x: rear.x, z: rear.z, heading: Math.atan2(dx, dz) }
}

// ---------------------------------------------------------------------------
// TIMINGS
// ---------------------------------------------------------------------------

/**
 * Hooking a car up, in three stages you can watch.
 *
 * Mike: "make the design and attachment to the tow truck in a SMOOTH fashion.
 * No jagged moves and no warping to a new location. The car has to be 'pulled'
 * and/or 'attached' to the tow truck."
 *
 * So it is three things happening in order rather than one bar filling:
 *
 *   REACH  the boom slides out from under the body and the yoke drops
 *   WINCH  the car is dragged round and in until its front wheels are on the
 *          yoke - eased, over two seconds, from wherever it was lying
 *   LIFT   the boom raises and the car's nose comes up off the road
 *
 * Every one of those is an interpolation from the car's ACTUAL current pose to
 * a pose computed from the truck's ACTUAL current pose, recomputed each frame.
 * That matters more than it sounds: it means the player driving off in the
 * middle of the winch does not tear the car out of the world, it just changes
 * where the car is being dragged to.
 */
export const HITCH_REACH = 1.2
export const HITCH_WINCH = 2.2
export const HITCH_LIFT = 1.6
export const HITCH_SECONDS = HITCH_REACH + HITCH_WINCH + HITCH_LIFT

/** Dropping one off: lower the boom, roll the car back, stow the boom. */
export const DROP_LOWER = 1.4
export const DROP_RELEASE = 1.6
export const DROP_SECONDS = DROP_LOWER + DROP_RELEASE

/**
 * Where a hitch has got to, as three separate 0..1 numbers.
 *
 * Three and not one, because the boom, the winch and the lift are three
 * different mechanisms and a single progress bar cannot drive them. World.js
 * reads this and moves geometry; nothing here knows what a mesh is.
 */
export function hitchStage(t) {
  const clamp = (v) => Math.max(0, Math.min(1, v))
  return {
    reach: clamp(t / HITCH_REACH),
    winch: clamp((t - HITCH_REACH) / HITCH_WINCH),
    lift: clamp((t - HITCH_REACH - HITCH_WINCH) / HITCH_LIFT),
    stage: t < HITCH_REACH ? 'reach'
      : t < HITCH_REACH + HITCH_WINCH ? 'winch' : 'lift'
  }
}

/** And the same on the way out, in reverse order. */
export function dropStage(t) {
  const clamp = (v) => Math.max(0, Math.min(1, v))
  return {
    lift: 1 - clamp(t / DROP_LOWER),
    winch: 1 - clamp((t - DROP_LOWER) / DROP_RELEASE),
    reach: 1 - clamp((t - DROP_LOWER) / DROP_RELEASE),
    stage: t < DROP_LOWER ? 'lower' : 'release'
  }
}

/**
 * Smoothstep, which is what stops any of this looking mechanical.
 *
 * A linear interpolation between two poses starts and stops instantly, and an
 * instant start is exactly the "jagged move" that was being complained about.
 * This one leaves and arrives at zero speed.
 */
export function ease(t) {
  const x = Math.max(0, Math.min(1, t))
  return x * x * (3 - 2 * x)
}

/** The shortest way round from one heading to another. */
export function turnToward(from, to, t) {
  let d = to - from
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return from + d * t
}

/** How close the truck has to be to a car before it can hook it up. */
export const ON_SCENE = 12

/**
 * How long the wrecks sit there before somebody else deals with them.
 *
 * Five minutes, matching the ambulance's ABANDON_AFTER, and for the same
 * reason: without it the world quietly accumulates crashes nobody collected.
 * Mike chose an AI tow truck rather than a timer, so this is when one is
 * considered to have turned up rather than when the cars evaporate.
 */
export const ABANDON_AFTER = 300

/**
 * How long the AI's version of a recovery takes once a truck is at the scene.
 *
 * The player's version is two round trips to the garage. The AI cannot do
 * that, for the same measured reason the AI ambulance cannot beat a two-minute
 * clock: a traffic vehicle drives its lane, it does not park next to a job and
 * it does not go where you tell it. So arriving is the thing an AI driver can
 * demonstrate, and the rest finishes off-screen.
 */
export const CREW_CLEAR_SECONDS = 30

/** How long a banner stays up once the job is over. */
export const MESSAGE_TIME = 5

export function newTowState() {
  return {
    phase: 'idle',       // idle | waiting | hitching | hauling | dropping | over
    job: null,
    message: null,
    messageFor: 0
  }
}

/**
 * The ambulance hands a finished incident over rather than clearing it.
 *
 * `cars` is what World.js has already drawn: one entry per wreck, with where
 * it actually is. They are copied rather than referenced, because the crash's
 * own layout table describes where cars START and this list is about to stop
 * being true of them.
 */
export function startTow(state, incident, cars) {
  if (!incident || !cars || !cars.length) return state
  state.phase = 'waiting'
  state.job = {
    x: incident.x,
    z: incident.z,
    island: incident.island || '',
    cars: cars.map((c, i) => ({
      index: i,
      kind: c.kind,
      x: c.x,
      z: c.z,
      heading: c.heading,
      state: 'down'          // down | towed | delivered
    })),
    waiting: 0,
    hitch: 0,
    drop: 0,
    towing: null,
    delivered: 0
  }
  state.message = 'WRECKS TO RECOVER'
  state.messageFor = MESSAGE_TIME
  return state
}

/** The cars still lying at the scene. */
export function carsDown(job) {
  return job ? job.cars.filter(c => c.state === 'down') : []
}

/** The one on the hook, if any. */
export function carOnHook(job) {
  if (!job || job.towing === null) return null
  return job.cars[job.towing] || null
}

/**
 * Which car to go for next: the nearest one still lying there.
 *
 * Nearest to the TRUCK, not to the crash - after the first recovery the player
 * comes back from the garage, and the near one from the garage's direction is
 * not necessarily the one they hooked up first.
 */
export function nextCar(job, from) {
  const down = carsDown(job)
  if (!down.length) return null
  if (!from) return down[0]
  let best = down[0]
  let gap = Infinity
  for (const c of down) {
    const d = Math.hypot(c.x - from.x, c.z - from.z)
    if (d < gap) { gap = d; best = c }
  }
  return best
}

/**
 * One frame of the recovery.
 *
 * `ctx` is: {
 *    player:    { x, z, isTow } or null,
 *    tows:      [{ x, z }],       AI tow trucks in the traffic
 *    garage:    { x, z },         where to bring them back to
 *    atGarage:  boolean,          the player is parked in the bay
 *    rand:      () => 0..1
 * }
 *
 * `atGarage` is a boolean rather than a distance because the garage's bay is a
 * RECTANGLE the vehicle selector already tests against, and two different
 * answers to "am I in the garage" is one more than this world needs.
 */
export function stepTow(state, delta, ctx) {
  if (state.messageFor > 0) {
    state.messageFor -= delta
    if (state.messageFor <= 0) { state.messageFor = 0; state.message = null }
  }

  const done = (message) => {
    state.phase = 'over'
    state.job = null
    state.message = message
    state.messageFor = MESSAGE_TIME
    return state
  }

  if (state.phase === 'idle' || state.phase === 'over') return state

  const job = state.job
  if (!job) return done(null)

  const player = ctx.player
  const isTow = !!(player && player.isTow)
  const near = (to) =>
    !!(player && to && Math.hypot(player.x - to.x, player.z - to.z) <= ON_SCENE)

  // --- Nobody has come for them ---
  //
  // Checked in every phase EXCEPT while the player is actually working the
  // job. A recovery that is under way is not abandoned, however long the drive
  // back turns out to be.
  if (state.phase === 'waiting') {
    job.waiting += delta

    if (!isTow) {
      // An AI truck's whole contribution is turning up; see
      // CREW_CLEAR_SECONDS. It is credited with arriving either by being here
      // or by enough time passing that one plausibly did.
      const crewHere = (ctx.tows || []).some(t =>
        Math.hypot(t.x - job.x, t.z - job.z) <= ON_SCENE)
      if (crewHere) job.crewFor = (job.crewFor || 0) + delta
      if ((job.crewFor || 0) >= CREW_CLEAR_SECONDS ||
          job.waiting > ABANDON_AFTER) {
        return done('WRECKS RECOVERED')
      }
      return state
    }

    const target = nextCar(job, player)
    if (target && near(target)) {
      state.phase = 'hitching'
      job.towing = target.index
      job.hitch = 0
    }
    return state
  }

  // --- Hooking one up ---
  //
  // Progress PAUSES rather than falling back if the truck wanders off, which
  // is the rule the ambulance's loading arrived at: the skill being asked for
  // was getting here, and it has already been demonstrated. Backing up a foot
  // to line the boom up should not cost you the hook-up.
  if (state.phase === 'hitching') {
    const car = carOnHook(job)
    if (!car) { state.phase = 'waiting'; job.towing = null; return state }

    if (near(car)) job.hitch = Math.min(HITCH_SECONDS, job.hitch + delta)

    if (job.hitch >= HITCH_SECONDS) {
      car.state = 'towed'
      state.phase = 'hauling'
      state.message = 'TAKE IT TO THE GARAGE'
      state.messageFor = MESSAGE_TIME
    }
    return state
  }

  // --- The drive back ---
  if (state.phase === 'hauling') {
    if (ctx.atGarage) {
      state.phase = 'dropping'
      job.drop = 0
    }
    return state
  }

  // --- Unhooking in the bay ---
  if (state.phase === 'dropping') {
    const car = carOnHook(job)
    if (!car) { state.phase = 'hauling'; return state }

    // Leaving the bay half way through puts it back on the hook, because the
    // car is still physically hanging off the boom - there is nowhere else for
    // it to be.
    if (!ctx.atGarage) { state.phase = 'hauling'; job.drop = 0; return state }

    job.drop = Math.min(DROP_SECONDS, job.drop + delta)
    if (job.drop >= DROP_SECONDS) {
      car.state = 'delivered'
      job.delivered++
      job.towing = null

      if (carsDown(job).length === 0) return done('ALL WRECKS RECOVERED')

      state.phase = 'waiting'
      state.message = 'ONE MORE TO GO'
      state.messageFor = MESSAGE_TIME
    }
    return state
  }

  return state
}

/**
 * What the HUD should show. The same shape the other three return.
 *
 * The arrow points at the car on the way out and at the garage on the way
 * back, which is why those are separate phases rather than one "on a job"
 * flag - it is the same split the ambulance run makes between the search and
 * the race, and for the same reason.
 *
 * `from` is where the truck is, used only to pick which of two wrecks to point
 * at. `garage` is passed in because this module does not know where the
 * garage is and should not: it is a fact about the map, and the map is
 * islandLayout.js's business.
 */
export function towHud(state, playerIsTow, from, garage) {
  const job = state.job
  const mine = !!playerIsTow

  let target = null
  let showBar = false
  let barLabel = ''
  let progress = 0
  let title = state.message

  if (job) {
    if (state.phase === 'hitching') {
      const car = carOnHook(job)
      target = car ? { x: car.x, z: car.z } : { x: job.x, z: job.z }
      showBar = mine
      barLabel = 'HOOKING UP'
      progress = job.hitch / HITCH_SECONDS
      if (!title) title = 'HOOKING UP'
    } else if (state.phase === 'dropping') {
      target = garage || null
      showBar = mine
      barLabel = 'UNHOOKING'
      progress = job.drop / DROP_SECONDS
      if (!title) title = 'UNHOOKING'
    } else if (state.phase === 'hauling') {
      target = garage || null
      if (!title) title = 'TOW IT TO THE GARAGE'
    } else {
      const car = nextCar(job, from)
      target = car ? { x: car.x, z: car.z } : { x: job.x, z: job.z }
      if (!title) {
        title = job.delivered > 0 ? 'ONE WRECK LEFT' : 'WRECKS TO RECOVER'
      }
    }
  }

  return {
    active: !!job || !!state.message,
    mine,
    title,
    target,
    showBar,
    barLabel,
    progress,
    good: state.phase === 'hauling' || state.phase === 'dropping'
  }
}

/** Where an AI tow truck should be heading right now, or null. */
export function crewTarget(state) {
  const job = state.job
  if (!job || state.phase !== 'waiting') return null
  return { x: job.x, z: job.z }
}
