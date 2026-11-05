/**
 * The bus route.
 *
 * Get in the bus and you are given a route: a handful of stops, in order,
 * with an arrow to the next one. Pull up at each, the doors open, passengers
 * get off and on, and you wait for the doors to close before you drive away.
 * At the end you get a time against what the route was expected to take.
 *
 * No THREE in here, like fireGame.js, policeGame.js, towGame.js, gasGame.js
 * and donut.js, and for the same reason: this is arithmetic and a state
 * machine, and both can be tested in a millisecond without a browser.
 * `World.js` draws the shelter, the queue and the figures walking on and off;
 * `UI.js` draws the banner. Neither decides anything.
 *
 * A SIMULATOR, NOT A CHALLENGE
 * ----------------------------
 * Mike's words: "for now it's more like a simulator". So there is no fail
 * state anywhere in this file. Drive off with the doors open and you have not
 * lost - the stop simply is not done, and the arrow still points at it. Take
 * twenty minutes and the route still completes; you are told you were below
 * target and that is all. The expected time is a yardstick, not a timer.
 *
 * That is a real design constraint rather than a soft one. The moment a rule
 * here can end your run, every other rule has to be fair, and "fair" is a
 * much more expensive thing to build than "informative".
 */

/** How many stops a route has. */
export const ROUTE_STOPS = 5

/**
 * How many candidate stops to draw before ordering them.
 *
 * The route is built by taking a random handful and then walking them
 * nearest-first (see makeRoute). Drawing more than are needed is what makes
 * the result a ROUTE rather than a list: with a pool exactly the size of the
 * route there is nothing to choose between, and the bus is sent back and
 * forth across the map. A pool of three times the route gives the ordering
 * something to work with and still leaves every run different.
 */
export const ROUTE_POOL = ROUTE_STOPS * 3

/**
 * Door timings, in seconds.
 *
 * The cycle is open, then everyone off, then everyone on, then closed - in
 * that order, because that is the order it happens at a real stop and because
 * the alighting passengers have to be out of the doorway before the boarding
 * ones can use it. World.js animates the figures straight off these numbers.
 */
export const DOOR_OPEN = 0.9
export const DOOR_CLOSE = 1.1
export const PER_PASSENGER = 0.45

/** The most that will ever be waiting at one stop, and the bus's capacity. */
export const MAX_WAITING = 6
export const CAPACITY = 24

/**
 * How close, and how still, counts as "at the stop".
 *
 * Generous on both, like the fuel bays: this is a bus route, not a parking
 * test, and a bus settling on its springs still reads a little speed for a
 * moment after you let go.
 */
export const AT_STOP = 7
export const STOPPED_SPEED = 0.8

/**
 * The speed the expected time is worked out at, in world units a second.
 *
 * Well under the bus's own top speed, because the target has to include the
 * things that are not driving: red lights, traffic, pulling in and pulling
 * out again. Set so that a competent run comes out near target rather than
 * always ahead of it - a yardstick everybody beats is not a yardstick.
 */
export const TARGET_SPEED = 7.5

/** How long a banner stays up. */
export const MESSAGE_TIME = 4

/**
 * How near target still counts as on it.
 *
 * Without a band there is effectively no "on target" - you are a tenth of a
 * second over or under and the game says so, which reads as pedantry rather
 * than as a result.
 */
export const ON_TARGET_BAND = 0.08

/** Does this kind run a route? */
export function isBus(kind) {
  return kind === 'bus'
}

export function newBusState() {
  return {
    phase: 'idle',      // idle | driving | doors | done
    route: null,        // the stops, in order
    index: 0,           // which one we are heading for
    elapsed: 0,         // seconds since the route started
    target: 0,          // what it was expected to take
    onboard: 0,         // passengers currently aboard
    carried: 0,         // how many have been carried in total
    door: 0,            // seconds into the door cycle
    doorFor: 0,         // how long this stop's cycle lasts
    alighting: 0,       // this stop: how many are getting off
    boarding: 0,        // and how many are getting on
    score: null,        // 'ahead' | 'on' | 'behind', once done
    message: null,
    messageFor: 0
  }
}

/** Distance between two things that have an x and a z. */
function gap(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/**
 * Build a route: a few stops, in an order that reads as a route.
 *
 * Random WHICH stops, deliberate WHAT ORDER. A purely random order sends the
 * bus across the island and back between consecutive stops, which is not a
 * route, it is a list of errands. So a pool is drawn at random and then
 * walked nearest-first from the one closest to `from`, which gives a line
 * that wanders through the map the way a real route does.
 *
 * Nearest-first is not the shortest tour and is not trying to be - the
 * travelling salesman is a famously expensive thing to answer exactly, and
 * the difference would not be visible from the driver's seat.
 *
 * `rand` is passed in rather than taken from Math.random, like
 * chooseBuilding() in fireGame.js, so a test can run the same route twice.
 */
export function makeRoute(stops, from, rand = Math.random, count = ROUTE_STOPS) {
  if (!stops || stops.length < 2) return null

  const want = Math.min(count, stops.length)

  // The pool: distinct stops, drawn at random.
  const pool = []
  const taken = new Set()
  const tries = Math.min(ROUTE_POOL, stops.length)
  for (let i = 0; i < tries * 4 && pool.length < tries; i++) {
    const at = Math.floor(rand() * stops.length)
    if (taken.has(at)) continue
    taken.add(at)
    pool.push(stops[at])
  }
  if (pool.length < 2) return null

  // Walk it nearest-first from wherever the bus happens to be.
  const route = []
  let here = from || pool[0]
  const left = pool.slice()

  while (route.length < want && left.length) {
    let best = 0
    let bestGap = Infinity
    for (let i = 0; i < left.length; i++) {
      const d = gap(here, left[i])
      if (d < bestGap) { bestGap = d; best = i }
    }
    here = left[best]
    route.push(left.splice(best, 1)[0])
  }

  return route.length >= 2 ? route : null
}

/**
 * How long the route ought to take, in seconds.
 *
 * The driving, at a speed that already allows for lights and traffic, plus
 * the time the doors will take. The door time is estimated from an average
 * stop rather than the real passenger counts, because those are not decided
 * until you arrive - and a target that moved as you drove would not be a
 * target.
 */
export function routeTarget(route, from) {
  if (!route || !route.length) return 0

  let distance = 0
  let here = from || route[0]
  for (const stop of route) {
    distance += gap(here, stop)
    here = stop
  }

  const doors = route.length *
    (DOOR_OPEN + DOOR_CLOSE + PER_PASSENGER * (MAX_WAITING / 2) * 2)

  return distance / TARGET_SPEED + doors
}

/**
 * Who is getting off and on at this stop.
 *
 * Kept here rather than in World.js because the door cycle's LENGTH depends
 * on it, and the length is what the player is waiting through. Deterministic
 * given `rand`, so a test can drive a whole route twice and get the same one.
 *
 * Nobody gets off at the first stop - there is nobody aboard yet.
 *
 * THE LAST STOP IS THE END OF THE LINE: everybody off, nobody on. Both halves
 * matter, and the first was wrong at first - alighting was a random share
 * there like anywhere else, so a route could finish with people still aboard.
 * The end-to-end test caught it on the run where the player pulled away from
 * a stop and came back, because that reshuffled the draws. A bus that reaches
 * its terminus still carrying passengers has not finished its route; it has
 * abandoned them.
 */
export function passengersAt(state, isLast, rand = Math.random, waiting = null) {
  if (isLast) return { alighting: state.onboard, boarding: 0 }

  const alighting = Math.min(state.onboard, Math.floor(rand() * (state.onboard + 1)))

  // WHO IS ACTUALLY STANDING THERE, when the caller knows.
  //
  // `pedestrians.js` has carried a `boardable()` since before this file
  // existed, left by whoever built the waiting people - "THE HOOK FOR THE
  // NEXT GAME, and the reason the waiting people exist at all". This is that
  // game, so the number who get on is the number you can see at the shelter
  // rather than a dice roll that happens to disagree with it.
  //
  // `null` means the caller does not know - a test, or a frame before the
  // pedestrians exist - and then it falls back to a draw, so the route still
  // works in a world with nobody in it.
  const want = waiting === null
    ? Math.floor(rand() * (MAX_WAITING + 1))
    : Math.min(waiting, MAX_WAITING)

  const boarding = Math.min(CAPACITY - (state.onboard - alighting), want)

  return { alighting, boarding }
}

/** How long a door cycle with these passengers takes. */
export function doorSeconds(alighting, boarding) {
  return DOOR_OPEN + DOOR_CLOSE + (alighting + boarding) * PER_PASSENGER
}

/**
 * What the doors are doing, as a fraction and a name.
 *
 * World.js animates the figures from this and works nothing out for itself -
 * the same rule the fuel gauge follows. `walk` is 0 to 1 through whichever
 * group is currently moving, so a figure's position along its path is just
 * that number.
 */
export function doorPhase(state) {
  if (state.phase !== 'doors') {
    return { open: 0, stage: 'shut', walk: 0, alighting: 0, boarding: 0 }
  }

  const t = state.door
  const offFor = state.alighting * PER_PASSENGER
  const onFor = state.boarding * PER_PASSENGER

  if (t < DOOR_OPEN) {
    return { open: t / DOOR_OPEN, stage: 'opening', walk: 0,
             alighting: state.alighting, boarding: state.boarding }
  }
  if (t < DOOR_OPEN + offFor) {
    return { open: 1, stage: 'alighting',
             walk: offFor ? (t - DOOR_OPEN) / offFor : 1,
             alighting: state.alighting, boarding: state.boarding }
  }
  if (t < DOOR_OPEN + offFor + onFor) {
    return { open: 1, stage: 'boarding',
             walk: onFor ? (t - DOOR_OPEN - offFor) / onFor : 1,
             alighting: state.alighting, boarding: state.boarding }
  }

  const closing = t - DOOR_OPEN - offFor - onFor
  return { open: Math.max(0, 1 - closing / DOOR_CLOSE), stage: 'closing', walk: 1,
           alighting: state.alighting, boarding: state.boarding }
}

/** Where the bus is being sent, or null. */
export function nextStop(state) {
  if (!state.route || state.phase === 'idle' || state.phase === 'done') return null
  return state.route[state.index] || null
}

/**
 * One frame of the route.
 *
 * `ctx` is: {
 *    player:     { x, z, kind, speed } or null,
 *    stops:      every bus stop on the map,
 *    waiting:    how many people are at this stop, from pedestrians.js's
 *                boardable(); omit and a number is drawn instead,
 *    controlled: false while the garage still has the wheel, optional,
 *    rand:       () => number, optional
 * }
 *
 * Mutates and returns `state`.
 */
export function stepBus(state, delta, ctx) {
  if (state.messageFor > 0) {
    state.messageFor -= delta
    if (state.messageFor <= 0) { state.messageFor = 0; state.message = null }
  }

  const player = ctx && ctx.player
  const rand = (ctx && ctx.rand) || Math.random

  // GET OUT OF THE BUS AND THE ROUTE IS OVER. Not paused: a route you can
  // leave halfway through and come back to means the clock either keeps
  // running while you do something else - which makes the target nonsense -
  // or stops, which makes it free to go and refuel. Neither is worth the
  // bookkeeping for a mode whose whole point is that nothing is at stake.
  if (!player || !isBus(player.kind)) {
    if (state.phase !== 'idle') {
      const fresh = newBusState()
      Object.assign(state, fresh)
    }
    return state
  }

  // NOT UNTIL YOU HAVE THE WHEEL.
  //
  // Selecting the bus is not the same as driving it: the garage rolls you out
  // to the apron first, and for those seconds `VehicleSelector` is placing the
  // body and your input is held. Starting the route there means the clock runs
  // while you are a passenger in your own bus, and the first thing you see on
  // taking control is a target you are already losing against.
  //
  // Caught in a headless run that parked the bus on its first stop and watched
  // nothing happen: the route had started, the clock was running, and the
  // teleport was being overwritten every frame by a roll-out that had not
  // finished. The clock was the real bug; the teleport was the test's.
  if (ctx && ctx.controlled === false) return state

  // A fresh route on getting in.
  if (state.phase === 'idle') {
    const route = makeRoute(ctx.stops, player, rand)
    if (!route) return state

    state.route = route
    state.index = 0
    state.phase = 'driving'
    state.elapsed = 0
    state.target = routeTarget(route, player)
    state.onboard = 0
    state.carried = 0
    state.message = 'ROUTE STARTED'
    state.messageFor = MESSAGE_TIME
    return state
  }

  if (state.phase === 'done') return state

  state.elapsed += delta

  const stop = state.route[state.index]
  if (!stop) return state

  const near = gap(player, stop) <= AT_STOP
  const still = Math.abs(player.speed || 0) <= STOPPED_SPEED

  // --- At the doors ---
  if (state.phase === 'doors') {
    // DRIVE OFF AND THE STOP IS SIMPLY NOT DONE. No penalty, no message
    // telling you off - the arrow still points here and you can come back.
    // This is the whole of "the bus needs to wait until the doors are
    // closed": not a rule that punishes you, a thing that has not finished.
    if (!near || !still) {
      state.phase = 'driving'
      state.door = 0
      return state
    }

    state.door += delta
    if (state.door < state.doorFor) return state

    // Done: the passengers are aboard and the doors are shut.
    state.onboard = state.onboard - state.alighting + state.boarding
    state.carried += state.boarding
    state.door = 0
    state.index++

    if (state.index >= state.route.length) {
      state.phase = 'done'
      state.score = scoreRoute(state.elapsed, state.target)
      state.message = 'ROUTE COMPLETE'
      state.messageFor = MESSAGE_TIME
    } else {
      state.phase = 'driving'
      state.message = 'DOORS CLOSED'
      state.messageFor = 2
    }
    return state
  }

  // --- Pulling in ---
  if (near && still) {
    const isLast = state.index === state.route.length - 1
    const { alighting, boarding } = passengersAt(
      state, isLast, rand,
      typeof ctx.waiting === 'number' ? ctx.waiting : null)

    state.phase = 'doors'
    state.door = 0
    state.alighting = alighting
    state.boarding = boarding
    state.doorFor = doorSeconds(alighting, boarding)
    state.message = 'DOORS OPEN'
    state.messageFor = 2
  }

  return state
}

/**
 * Above, on, or below target.
 *
 * Mike asked for exactly these three. Named from the DRIVER's point of view
 * rather than the clock's: finishing in less time than expected is 'ahead',
 * even though the number is smaller.
 */
export function scoreRoute(elapsed, target) {
  if (!target) return 'on'
  const ratio = elapsed / target
  if (ratio < 1 - ON_TARGET_BAND) return 'ahead'
  if (ratio > 1 + ON_TARGET_BAND) return 'behind'
  return 'on'
}

/** The score as something to put on the screen. */
export function scoreLabel(score) {
  return score === 'ahead' ? 'AHEAD OF TARGET'
       : score === 'behind' ? 'BEHIND TARGET'
       : 'ON TARGET'
}

/** mm:ss, for the banner. */
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * What the HUD should show, in the shape chooseMission() takes.
 *
 * Listed with the other callouts in World.js. It only ever claims the arrow
 * when the player is actually driving a bus, so it cannot take it from a fire
 * you are fighting.
 */
export function busHud(state, playerIsBus) {
  if (!playerIsBus || state.phase === 'idle') {
    return { active: false, mine: false }
  }

  if (state.phase === 'done') {
    return {
      active: true,
      mine: true,
      title: `ROUTE COMPLETE  ${clock(state.elapsed)}  ${scoreLabel(state.score)}`,
      target: null,
      showBar: false,
      barLabel: '',
      progress: 0,
      good: state.score !== 'behind'
    }
  }

  const stop = state.route[state.index]
  const which = `STOP ${state.index + 1} OF ${state.route.length}`

  if (state.phase === 'doors') {
    const phase = doorPhase(state)
    const what = phase.stage === 'alighting' ? 'PASSENGERS OFF'
               : phase.stage === 'boarding' ? 'PASSENGERS ON'
               : phase.stage === 'closing' ? 'DOORS CLOSING'
               : 'DOORS OPENING'
    return {
      active: true,
      mine: true,
      title: `${which}  ${what}`,
      // No arrow while you are standing at the stop you were sent to - it
      // would be pointing at the bus's own front wheel.
      target: null,
      showBar: true,
      barLabel: 'DOORS',
      progress: state.doorFor ? Math.min(1, state.door / state.doorFor) : 1,
      good: true
    }
  }

  return {
    active: true,
    mine: true,
    title: `${which}  ${clock(state.elapsed)} / ${clock(state.target)}`,
    target: stop ? { x: stop.x, z: stop.z } : null,
    showBar: false,
    barLabel: '',
    progress: 0,
    good: state.elapsed <= state.target
  }
}

/**
 * What the passenger panel needs: who is aboard and how the route is going.
 *
 * Separate from busHud() because it is always on screen while you are driving
 * the bus, the way the fuel gauge is, rather than competing for the one
 * callout.
 */
export function busPanel(state, playerIsBus) {
  if (!playerIsBus || state.phase === 'idle') {
    return { show: false }
  }

  return {
    show: true,
    onboard: state.onboard,
    carried: state.carried,
    stop: Math.min(state.index + 1, state.route ? state.route.length : 0),
    stops: state.route ? state.route.length : 0,
    elapsed: state.elapsed,
    target: state.target,
    done: state.phase === 'done',
    score: state.score,
    behind: state.phase !== 'done' && state.elapsed > state.target
  }
}
