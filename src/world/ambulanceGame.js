/**
 * The ambulance run.
 *
 * A crash somewhere in the world. Get to it, load the patient, and get them
 * to a hospital before the clock runs out.
 *
 * No THREE, like fireGame.js and policeGame.js. A whole run takes a
 * millisecond here; the same thing through the browser takes four minutes.
 *
 * THE ASYMMETRY, FOR THE THIRD TIME
 * ---------------------------------
 *   - Driving the ambulance, it is yours: your bar, your clock, your failure.
 *   - Driving anything else, the AI ambulances do it - the same sequence, but
 *     WITHOUT the ten-second load and the two-minute clock. You see the wreck
 *     and the response; there is no bar, because there is nothing you are
 *     being measured against.
 *
 * That last point is the third time this project has arrived at the same
 * rule: the pressure mechanic belongs to the player. The fire's bar decays
 * only for you; only your police car can end a pursuit; and only your run to
 * hospital is against a clock. Each time it was found by measuring, not by
 * design - see CREW_LOAD_SECONDS for what happened when the AI was held to
 * the player's standard here.
 *
 * WHY THE RUN IS IN TWO HALVES
 * ----------------------------
 * Getting there is a search - you have a direction and a distance and no
 * route. Getting back is a race - you know exactly where you are going and
 * the only question is whether you are quick enough. Those want different
 * things on screen, which is why `phase` distinguishes them rather than one
 * "on a job" flag: the arrow points at different things and the bar means
 * different things in each.
 */

/** How long after the world loads before the first crash. */
export const FIRST_CRASH = 50

/** And between them: one to three minutes, as asked. */
export const CRASH_GAP_MIN = 60
export const CRASH_GAP_MAX = 180

/**
 * How close counts as being at the scene, and at the hospital.
 *
 * The hospital's is looser because its door is a building frontage you pull
 * up outside, while a crash is two cars in the road you can stop right next
 * to.
 */
export const ON_SCENE = 14
export const AT_HOSPITAL = 20

/** Loading the patient. Ten seconds, as asked. */
export const LOAD_SECONDS = 10

/** And the run to hospital. Two minutes, as asked. */
export const TRANSPORT_SECONDS = 120

/** How long a banner stays up once the run is over. */
export const MESSAGE_TIME = 5

/** How far from the player a crash must happen. Same reasoning as the fire. */
export const MIN_CRASH_DISTANCE = 60

/**
 * How long the AI's version of a run takes once a crew is at the scene.
 *
 * The player's run is a ten-second load and a two-minute race. The AI cannot
 * do either, and this is measured rather than assumed: a crew reached the
 * scene after 38 seconds, then took until 270 seconds to accumulate ten
 * seconds of being within fourteen units, because it drives past rather than
 * parking - and then sat 102 units from the hospital while the clock ran out.
 * Every background crash would have ended in PATIENT LOST.
 *
 * So the clock, like the fire's decay and the pursuit's bump, belongs to the
 * PLAYER. Once a crew is on scene the AI's run proceeds on its own and
 * finishes off-screen. What you see is the sequence Mike asked for - a crash,
 * an ambulance turning up, the wreck cleared - without a two-minute deadline
 * being failed by a driver that was never able to meet it.
 */
export const CREW_LOAD_SECONDS = 20
export const CREW_RUN_SECONDS = 55

/**
 * How long a crash nobody attends sits there.
 *
 * Generous, and it exists for the same reason the fire has one: without it
 * the world quietly accumulates wrecks nobody ever cleared.
 */
export const ABANDON_AFTER = 300

export function newAmbulanceState() {
  return {
    phase: 'idle',        // idle | crash | loading | transport | over
    timer: FIRST_CRASH,
    incident: null,
    message: null,
    messageFor: 0
  }
}

/**
 * Who is dealing with this, and are they here?
 *
 * The same one-line asymmetry as the fire: your ambulance or theirs, never
 * both. `rate` is deliberately 1 either way - unlike the fire, a second crew
 * cannot load a patient twice as fast.
 */
export function whoIsResponding(at, ctx, radius = ON_SCENE) {
  const near = (p) => p && Math.hypot(p.x - at.x, p.z - at.z) <= radius

  const playerIsAmbulance = !!(ctx.player && ctx.player.isAmbulance)
  const playerHere = playerIsAmbulance && near(ctx.player)
  const crewHere = (ctx.ambulances || []).some(near)

  return {
    playerIsAmbulance,
    playerHere,
    crewHere,
    here: playerIsAmbulance ? playerHere : crewHere
  }
}

/**
 * How much clear road a crash needs around it.
 *
 * A crash is two stationary cars appearing in a lane, and anything already
 * standing there is inside them from the first frame. Those cars can drive out
 * - the traffic simulation exempts a vehicle already inside an obstacle, or it
 * would be welded there for ever - but while they do it looks exactly like
 * what it is, which is a wreck materialising on top of a bus.
 *
 * Measured before this existed: 798 vehicle-frames spent inside a crashed car
 * in the first twenty seconds of a crash placed on the busiest lane in the
 * city.
 */
export const CRASH_CLEARANCE = 9

/**
 * THE CRASH LEAVES ONE SIDE OF THE ROAD OPEN.
 *
 * This is the single most important number in the whole incident, and it was
 * found by measuring rather than by design. The two wrecked cars were first
 * laid nose to nose ACROSS the lane, centred on it. On a seven-unit road that
 * spans the entire carriageway - both sides - and no rule about giving way,
 * routing round or crossing the centre line can do anything at all, because
 * there is no gap to use. Traffic simply stopped, which is exactly what Mike
 * reported.
 *
 * So the wreck is shunted to one side. The cars end up against the kerb, which
 * is where they end up in life, and the far side of the road stays open - which
 * is what makes "one at a time past the obstruction" a thing that can happen
 * rather than a thing to hope for.
 *
 * The layout lives here, in the module with no THREE in it, because THREE
 * places are interested in it: World draws the cars, World hands the boxes to
 * the traffic simulation, and the test builds the same crash. Three copies of
 * a set of offsets is three chances for the picture and the physics to
 * disagree about where the wreck is.
 */
export const CRASH_SIDE_OFFSET = 3.4

/**
 * The two cars, in the crash's own frame: +z along the road, +x across it.
 *
 * Tucked closer together than they look - they are angled into each other, so
 * the width they occupy is much less than two car widths laid side by side.
 */
export const CRASH_CARS = [
  { kind: 'sedan', x: -0.35, z: 1.5, turn: 0.30, roll: 0.09 },
  { kind: 'suv', x: 0.45, z: -1.5, turn: -0.16, roll: -0.07 }
]

/**
 * How far across the road a crashed car actually reaches.
 *
 * NOT its width. A car turned across the road presents its length as well, and
 * the first version of this measured half-widths and reported a comfortable
 * gap beside a wreck that was in fact sitting on the centre of the lane. At a
 * half-radian angle a 4.4-long sedan reaches 1.9 units across, not 0.95 - it
 * had twice the footprint the arithmetic claimed, which is why traffic kept
 * driving through a crash that "left one side open".
 *
 * That is also why the cars are angled far less now than they were. Nose to
 * nose at half a radian each they cannot be fitted beside a lane at all; as a
 * shunt, which is the commoner accident anyway, they tuck in.
 */
export function crashReach(car, dims) {
  const d = dims[car.kind]
  return (Math.abs(d.length * Math.sin(car.turn)) +
          Math.abs(d.width * Math.cos(car.turn))) / 2
}

/**
 * Where the two wrecked cars actually are in the world.
 *
 * `dims` is { sedan: {length, width}, suv: {...} } - passed in rather than
 * imported, because this module does not know what a vehicle is and the whole
 * point of it having no imports is that a test can run it in a millisecond.
 */
export function crashBlocks(job, dims) {
  const h = job.heading || 0
  const sh = Math.sin(h)
  const ch = Math.cos(h)

  return CRASH_CARS.map(car => {
    const lx = car.x + CRASH_SIDE_OFFSET
    return {
      x: job.x + lx * ch + car.z * sh,
      z: job.z - lx * sh + car.z * ch,
      heading: h + car.turn,
      length: dims[car.kind].length,
      width: dims[car.kind].width
    }
  })
}

/**
 * Somewhere to crash: on a road, not on top of the player, and not on top of
 * the traffic.
 *
 * `busy` is where everything else currently is. Both filters fall back to the
 * unfiltered list rather than returning null - on a small map, or with the
 * fleet spread thinly, "no site satisfies everything" is a real possibility,
 * and a crash somewhere beats no crash at all.
 */
export function chooseCrash(sites, player, rand, busy = null) {
  if (!sites || !sites.length) return null

  const faraway = player
    ? sites.filter(s =>
        Math.hypot(s.x - player.x, s.z - player.z) > MIN_CRASH_DISTANCE)
    : sites

  let pool = faraway.length ? faraway : sites

  if (busy && busy.length) {
    const clear = pool.filter(s => !busy.some(b =>
      b && Math.hypot(b.x - s.x, b.z - s.z) < CRASH_CLEARANCE))
    if (clear.length) pool = clear
  }

  return pool[Math.floor(rand() * pool.length)] || null
}

/** Whichever hospital is nearest a point. */
export function nearestHospital(hospitals, to) {
  let best = null
  let gap = Infinity
  for (const h of hospitals || []) {
    const d = Math.hypot(h.x - to.x, h.z - to.z)
    if (d < gap) { gap = d; best = h }
  }
  return best
}

/**
 * One frame of the ambulance run.
 *
 * `ctx` is: {
 *    sites:      [{ x, z, island }],   places a crash can happen
 *    hospitals:  [{ x, z, island }],
 *    player:     { x, z, isAmbulance } or null,
 *    ambulances: [{ x, z }],
 *    rand:       () => 0..1
 * }
 */
export function stepAmbulance(state, delta, ctx) {
  if (state.messageFor > 0) {
    state.messageFor -= delta
    if (state.messageFor <= 0) { state.messageFor = 0; state.message = null }
  }

  const done = (message, wait) => {
    state.phase = 'over'
    state.incident = null
    state.message = message
    state.messageFor = MESSAGE_TIME
    state.timer = wait !== undefined
      ? wait
      : CRASH_GAP_MIN + ctx.rand() * (CRASH_GAP_MAX - CRASH_GAP_MIN)
    return state
  }

  if (state.phase === 'idle' || state.phase === 'over') {
    state.timer -= delta
    if (state.timer > 0) return state

    const site = chooseCrash(ctx.sites, ctx.player, ctx.rand, ctx.busy)
    if (!site) { state.timer = 10; return state }

    state.phase = 'crash'
    state.incident = {
      x: site.x, z: site.z,
      heading: site.heading || 0,
      island: site.island || '',
      waiting: 0,
      loaded: 0,
      remaining: TRANSPORT_SECONDS,
      hospital: null
    }
    state.message = `CAR CRASH AT ${(site.island || 'THE ISLAND').toUpperCase()}`
    state.messageFor = MESSAGE_TIME
    return state
  }

  const job = state.incident
  if (!job) return done(null, 5)

  // --- Getting there ---
  if (state.phase === 'crash') {
    job.waiting += delta
    const who = whoIsResponding(job, ctx)
    job.playerHere = who.playerHere

    if (who.here) {
      state.phase = 'loading'
      job.loaded = 0
      // Remembered, because the AI's version proceeds from here on its own -
      // see CREW_LOAD_SECONDS. Having ARRIVED is the thing an AI driver can
      // demonstrate; staying parked for ten seconds is not.
      job.attended = true
      return state
    }

    if (job.waiting > ABANDON_AFTER) return done('CASUALTY RECOVERED')
    return state
  }

  // --- Loading ---
  //
  // Progress PAUSES if the responder leaves rather than falling back. The
  // fire's bar decays because holding position at a fire is the skill being
  // asked for; here the skill was getting there, and it has already been
  // demonstrated. Punishing a nudge forward while the doors are open would be
  // punishing nothing.
  if (state.phase === 'loading') {
    const who = whoIsResponding(job, ctx)
    job.playerHere = who.playerHere

    if (who.playerIsAmbulance) {
      if (who.here) job.loaded = Math.min(LOAD_SECONDS, job.loaded + delta)
    } else {
      // The crew is working the scene. It got there; it does not have to
      // stay parked in a fourteen-unit circle to prove it.
      job.loaded = Math.min(LOAD_SECONDS,
        job.loaded + delta * (LOAD_SECONDS / CREW_LOAD_SECONDS))
    }

    if (job.loaded >= LOAD_SECONDS) {
      state.phase = 'transport'
      job.hospital = nearestHospital(ctx.hospitals, job)
      job.remaining = TRANSPORT_SECONDS
      // No hospital in the world at all: nothing to drive to, so the run
      // ends here rather than starting a clock that cannot be beaten.
      if (!job.hospital) return done('CASUALTY RECOVERED')
    }
    return state
  }

  // --- The run ---
  if (state.phase === 'transport') {
    const who = whoIsResponding(job.hospital, ctx, AT_HOSPITAL)

    if (!who.playerIsAmbulance) {
      // Off screen, and no deadline. See CREW_RUN_SECONDS.
      job.offScreen = (job.offScreen || 0) + delta
      if (who.here || job.offScreen >= CREW_RUN_SECONDS) {
        return done('PATIENT DELIVERED')
      }
      return state
    }

    job.remaining -= delta
    if (who.here) return done('PATIENT DELIVERED')
    if (job.remaining <= 0) return done('PATIENT LOST')
  }

  return state
}

/**
 * What the HUD should show. The same shape fireHud() and policeHud() return.
 *
 * The bar means two different things across a run and says which, because a
 * bar that fills and then a bar that drains are not the same instrument. The
 * arrow points at the crash on the way out and the hospital on the way back -
 * which is the whole reason the two halves are separate phases.
 */
export function ambulanceHud(state, playerIsAmbulance) {
  const job = state.incident
  const mine = !!playerIsAmbulance

  let target = null
  let showBar = false
  let barLabel = ''
  let progress = 0
  let title = state.message

  if (job) {
    if (state.phase === 'transport') {
      target = job.hospital
      showBar = mine
      barLabel = 'TIME TO HOSPITAL'
      // DRAINS. It is a countdown, and a countdown that fills up is a
      // countdown you read backwards.
      progress = Math.max(0, job.remaining / TRANSPORT_SECONDS)
      if (!title) title = 'TO HOSPITAL'
    } else if (state.phase === 'loading') {
      target = { x: job.x, z: job.z }
      showBar = mine
      barLabel = 'LOADING PATIENT'
      progress = job.loaded / LOAD_SECONDS
      if (!title) title = 'LOADING PATIENT'
    } else {
      target = { x: job.x, z: job.z }
      if (!title) title = 'CASUALTY WAITING'
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
    // Green while the patient is aboard and there is comfortable time left.
    good: state.phase === 'transport' && job
      ? job.remaining > TRANSPORT_SECONDS * 0.4
      : state.phase === 'loading' && !!(job && job.playerHere)
  }
}

/** Where an AI ambulance should be heading right now, or null. */
export function crewTarget(state) {
  const job = state.incident
  if (!job) return null
  if (state.phase === 'transport') return job.hospital
  if (state.phase === 'crash' || state.phase === 'loading') return { x: job.x, z: job.z }
  return null
}
