/**
 * Driving the monorail.
 *
 * Mike: "Let's also add the ability to drive the monorail train... If the
 * player selects the monorail, he will spawn as one of those monorails
 * currently in the track... the player will just move forward and/or backwards
 * using the W and S keys... We can make this a game by showing how
 * close/aligned with the station is when the monorail approaches a station...
 * After it's aligned and the passengers get off the station, a signal light
 * shows when I should go to the next station."
 *
 * No THREE, like the other five game modules.
 *
 * WHY THIS ONE IS NOT LIKE THE OTHERS
 * -----------------------------------
 * The fire, the pursuit, the ambulance run and the recovery are all about
 * getting somewhere. This one is about STOPPING somewhere, precisely, and that
 * inverts the whole shape of it. There is no route to find - the beam decides
 * where you go - and no clock to beat. The only thing being asked of the
 * player is: can you bring thirty-three metres of train to rest against a
 * twenty-six metre platform?
 *
 * That is a real thing train drivers are graded on, it is legible to a
 * six-year-old as two bars lining up, and it is the only mini-game in this
 * world where the skill is being GENTLE.
 *
 * THE TRAIN IS ONE OF THE THREE ALREADY RUNNING
 * ---------------------------------------------
 * Mike was explicit: "We will not create another train for this game, we'll be
 * spawning into an existing train." So this module never makes a train. It
 * takes one that `makeMonorailTrains()` already put on the line, marks it
 * `driven`, and hands its speed over to the player - which means the other two
 * go on running to their own schedule and the one in front is a real
 * constraint rather than a prop.
 */

/**
 * How the driver's throttle behaves.
 *
 * A train is not a car. It takes a long time to get going, a long time to
 * stop, and - the part that makes the game a game - it keeps rolling when you
 * let go. `COAST` is what stops "drive to the platform and release W" from
 * being a solved problem: you have to start braking before you think you do.
 */
export const POWER = 7          // units/s^2 under power
export const SERVICE_BRAKE = 9  // units/s^2 on the brake
export const COAST = 1.1        // and what rolling friction takes off
export const MAX_REVERSE = 6    // shunting backwards is slow, on purpose

/**
 * The station game.
 *
 * `PLATFORM` is the platform's own length and comes from the layout. A train
 * is three 11-unit cars, so it is LONGER than the platform it stops at - which
 * is true of plenty of real ones, and is why the target is centring rather
 * than fitting.
 */
export const PERFECT = 1.5      // within this, the stop is called perfect
export const GOOD = 4.0
export const USABLE = 9.0       // outside this the doors will not open

/** How long the doors take, and how long the passengers take to get off. */
export const DOOR_SECONDS = 1.2
export const ALIGHT_SECONDS = 3.5

/**
 * How much clear line the train in front needs to leave before the signal
 * clears. Longer than MONORAIL_HEADWAY, because a signal is meant to be read
 * and obeyed rather than crept up to.
 */
export const SIGNAL_CLEAR = 70

/** How slow counts as stopped. A train that is still rolling has not arrived. */
export const STOPPED = 0.35

export function newMonorailState() {
  return {
    phase: 'running',   // running | doors | alighting | held | ready
    station: null,      // the platform being served
    offset: 0,          // how far past its centre we are, signed
    doors: 0,
    alighting: 0,
    signal: 'red',      // red | amber | green
    stops: 0,
    perfect: 0,
    best: null,
    message: null,
    messageFor: 0
  }
}

/**
 * The signed distance from `from` to `to` around a loop, shortest way.
 *
 * Signed and shortest, because the whole game is "how far past the middle am
 * I" and that question has a sign. Taking it the long way round a 2km loop
 * would report a train a metre short of the platform as 2km late.
 */
export function loopDelta(from, to, length) {
  let d = to - from
  while (d > length / 2) d -= length
  while (d < -length / 2) d += length
  return d
}

/** Which platform the train is closest to, and how far off centre it is. */
export function nearestStation(route, distance) {
  if (!route || !route.stations || !route.stations.length) return null
  let best = null
  let bestGap = Infinity
  for (const station of route.stations) {
    const d = loopDelta(station.at, distance, route.length)
    if (Math.abs(d) < Math.abs(bestGap)) { bestGap = d; best = station }
  }
  return best ? { station: best, offset: bestGap } : null
}

/**
 * How well the train is lined up, as the two bars the HUD draws.
 *
 * Returned as fractions of the platform rather than as units, because that is
 * what a bar is: `platform` is the whole width of the thing you are aiming at
 * and `train` is where your train sits across it, both in the same scale, so
 * the renderer can draw one over the other and the overlap IS the answer.
 *
 * `score` is 1 at dead centre and 0 at the point the doors will not open, so
 * it can colour the bar without knowing any of the distances.
 */
export function alignment(offset, platform, rake) {
  const half = platform / 2
  const score = Math.max(0, 1 - Math.abs(offset) / USABLE)
  return {
    offset,
    // Where the train's middle sits across the platform, -1 to 1, clamped so
    // a train a long way off still draws at the end of the bar rather than
    // disappearing off it.
    at: Math.max(-1.4, Math.min(1.4, offset / half)),
    // How long the train is relative to the platform - greater than 1 here,
    // and the reason the game is about centring.
    span: rake / platform,
    score,
    grade: Math.abs(offset) <= PERFECT ? 'perfect'
      : Math.abs(offset) <= GOOD ? 'good'
        : Math.abs(offset) <= USABLE ? 'poor' : 'short'
  }
}

/**
 * What the driver's controls do to the train's speed.
 *
 * Split out from stepMonorail() so it can be tested on its own, and because
 * it is the whole feel of the vehicle: everything else in this module is
 * bookkeeping around it.
 *
 * `throttle` is -1..1 - S..W. A held signal clamps the train to a stand
 * however hard the player is pulling, which is what a signal is for.
 */
export function driveSpeed(speed, throttle, delta, opts = {}) {
  const { maxSpeed = 26, held = false, blocked = false } = opts

  let next = speed
  if (held || blocked) {
    // Under a red, or nose to tail with the train in front. The brake goes on
    // whatever the driver is asking for.
    next -= Math.sign(next) * SERVICE_BRAKE * delta
    if (Math.abs(next) < SERVICE_BRAKE * delta) next = 0
    return next
  }

  if (throttle > 0.01) {
    next += POWER * throttle * delta
  } else if (throttle < -0.01) {
    // S is a brake first and reverse second: pulled back from a standstill it
    // shunts, pulled back on the move it stops you. A key that reverses a
    // moving train would be a key that derails it.
    next += SERVICE_BRAKE * throttle * delta
  } else {
    // Coasting. THIS is what makes the stop a skill - let go and the train
    // keeps going, so the braking point has to be judged rather than reacted
    // to.
    const drag = COAST * delta
    next = Math.abs(next) <= drag ? 0 : next - Math.sign(next) * drag
  }

  return Math.max(-MAX_REVERSE, Math.min(maxSpeed, next))
}

/**
 * One frame of driving.
 *
 * `ctx` is: {
 *    route:     the monorail route, for its stations and its length
 *    train:     the train being driven - `distance` and `speed` are written
 *    throttle:  -1..1
 *    gapAhead:  units of clear line to the back of the train in front
 *    rake:      how long this train is
 *    delta
 * }
 */
export function stepMonorail(state, delta, ctx) {
  if (state.messageFor > 0) {
    state.messageFor -= delta
    if (state.messageFor <= 0) { state.messageFor = 0; state.message = null }
  }

  const { route, train, rake = 33 } = ctx
  if (!route || !train) return state

  const near = nearestStation(route, train.distance)
  state.station = near ? near.station : null
  state.offset = near ? near.offset : 0

  // The signal is a fact about the line, not about the phase: it is red while
  // the train in front is too close, whatever this train happens to be doing.
  // Amber is the warning that it is about to matter.
  const gap = ctx.gapAhead ?? Infinity
  state.signal = gap > SIGNAL_CLEAR ? 'green'
    : gap > SIGNAL_CLEAR * 0.55 ? 'amber' : 'red'

  const held = state.phase === 'doors' || state.phase === 'alighting' ||
               state.phase === 'held'
  const blocked = state.signal === 'red'

  train.speed = driveSpeed(train.speed, ctx.throttle || 0, delta, {
    maxSpeed: ctx.maxSpeed ?? 26,
    held,
    blocked
  })
  train.distance += train.speed * delta
  while (train.distance >= route.length) train.distance -= route.length
  while (train.distance < 0) train.distance += route.length

  const stopped = Math.abs(train.speed) < STOPPED
  const atPlatform = near && Math.abs(near.offset) <= USABLE

  switch (state.phase) {
    case 'running':
      // Arriving is stopping AT a platform, not passing one. A train that
      // rolls through at speed has not called there.
      if (stopped && atPlatform) {
        train.speed = 0
        state.phase = 'doors'
        state.doors = 0
        state.alighting = 0
        const a = alignment(near.offset, ctx.platform ?? 26, rake)
        state.grade = a.grade
        state.message = a.grade === 'perfect' ? 'PERFECT STOP'
          : a.grade === 'good' ? 'GOOD STOP' : 'MIND THE GAP'
        state.messageFor = 3
        state.stops++
        if (a.grade === 'perfect') state.perfect++
        state.best = state.best === null
          ? Math.abs(near.offset)
          : Math.min(state.best, Math.abs(near.offset))
      }
      break

    case 'doors':
      state.doors = Math.min(DOOR_SECONDS, state.doors + delta)
      if (state.doors >= DOOR_SECONDS) state.phase = 'alighting'
      break

    case 'alighting':
      state.alighting = Math.min(ALIGHT_SECONDS, state.alighting + delta)
      if (state.alighting >= ALIGHT_SECONDS) {
        state.phase = 'held'
        state.doors = DOOR_SECONDS
      }
      break

    case 'held':
      // Doors shutting, then wait for the signal. The wait is real: it is set
      // by where the train in front actually is, which is what makes the
      // signal mean something rather than being a countdown with a lamp on it.
      state.doors = Math.max(0, state.doors - delta)
      if (state.doors <= 0 && state.signal === 'green') {
        state.phase = 'ready'
        state.message = 'RIGHT AWAY'
        state.messageFor = 2.5
      }
      break

    case 'ready':
      // Cleared to go. Back to running as soon as the train is actually
      // moving, so the platform it is standing at cannot be scored twice.
      if (Math.abs(train.speed) > STOPPED) state.phase = 'running'
      break
  }

  return state
}

/**
 * What the HUD should show.
 *
 * Deliberately NOT the shape chooseMission() takes. The other five callouts
 * are things happening somewhere else that you may go and deal with; this one
 * is the vehicle you are sitting in, and it wants an instrument panel rather
 * than an arrow and a bar. Trying to squeeze it into the mission shape would
 * have meant one bar for two independent things - alignment and the doors -
 * which is exactly the mistake the ambulance's bar label exists to avoid.
 */
export function monorailHud(state, ctx = {}) {
  const rake = ctx.rake ?? 33
  const platform = ctx.platform ?? 26
  const a = alignment(state.offset, platform, rake)

  return {
    active: true,
    phase: state.phase,
    // The two bars Mike asked for: the platform, and the train across it.
    platform: { span: 1 },
    train: { at: a.at, span: a.span },
    score: a.score,
    grade: a.grade,
    // Only worth drawing while the stop is live - a bar showing your alignment
    // with a station four hundred units away is noise.
    showAlign: Math.abs(state.offset) < platform * 2.5,
    doors: state.doors / DOOR_SECONDS,
    alighting: state.alighting / ALIGHT_SECONDS,
    signal: state.signal,
    // Green only counts as "go" once the doors are shut; a green signal while
    // people are still getting off is not permission to leave.
    clear: state.signal === 'green' && state.phase === 'ready',
    station: state.station ? (state.station.name || state.station.id || '') : '',
    stops: state.stops,
    perfect: state.perfect,
    best: state.best,
    title: state.message
  }
}
