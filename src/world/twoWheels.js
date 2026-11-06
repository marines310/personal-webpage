/**
 * Two wheels: the motorcycle and the motor scooter.
 *
 * Mike: "I want to add 2 new vehicles: 1. Motorcycle 2. Motor Scooter."
 *
 * Everything the rest of the game knows about a vehicle - its length, width,
 * mass, tank, handling, name - is a row in a table that already exists, and
 * the two new rows are in those tables, not here. This file owns the two
 * things a two-wheeler does that nothing with four does:
 *
 *   1. It has TWO wheels, in line, on the centreline. `wheelPositions()` in
 *      vehicleParts.js puts four at the corners and everything on the road is
 *      built from it; a bike is built from `twoWheelPositions()` instead, and
 *      Vehicle.js steers whichever wheels say they are at the front rather
 *      than "the first two".
 *   2. It LEANS into corners. A bike that corners bolt upright is the single
 *      thing that makes a low-poly bike read as a toy on castors, and it costs
 *      one angle a frame.
 *
 * No THREE in here, like wheelie.js and donut.js, and for the same reason.
 *
 * THE LEAN IS DRAWN, NOT PHYSICAL - AND NOT EVEN BY A SPRING
 * ---------------------------------------------------------
 * The chassis is a plain box the width of the bike and `tiltRates()` holds it
 * upright, exactly as it holds the sedan. A physical lean would mean aiming
 * that spring sideways by the right amount, and wheelie.js has eleven lines
 * of a table showing what happened the last time the spring was asked to hold
 * a pose it was not built for: a pogo stick. So the collider stays flat and
 * the MESH is rolled about the line where the tyres meet the road - the same
 * trick as the wheelie, which turns the mesh about the axle it is standing on
 * so the wheels stay where they are and the body moves. Here the pivot is the
 * contact patch, so the tyres stay on the tarmac and the rider swings over.
 *
 * How far it leans is steering times speed: full lock at walking pace is a
 * bike being wheeled round a corner and does not lean at all; full lock at
 * half the top speed is as far over as it goes. Reversing never leans -
 * nobody has ever leaned a motorcycle backwards into a parking space.
 */

/** The kinds that stand on two wheels. */
export const TWO_WHEEL_KINDS = ['motorcycle', 'scooter']

export function isTwoWheeler(kind) {
  return TWO_WHEEL_KINDS.includes(kind)
}

/**
 * How big each kind's wheels are. Here rather than in the builders because
 * the wheel has to fit inside the length the collider is sized from, and
 * that is a thing a test can check only if it knows the radius: a scooter's
 * ten-inch wheel against a motorcycle's seventeen.
 */
export const BIKE_WHEEL_RADIUS = {
  motorcycle: 0.36,
  scooter: 0.27
}

/**
 * Where the two wheels go: on the centreline, front first so that the one
 * that steers is the one marked `front`. Same shape of record as
 * `wheelPositions()` so World.addWheels can use either without caring.
 *
 * `atFront` and `atRear` are fractions of the length from the middle, the
 * way the four-wheel version takes them. A bike's wheels sit nearer its ends
 * than a car's do - a motorcycle is very nearly all wheelbase - so the
 * defaults are wider than the car's 0.31.
 */
export function twoWheelPositions(length, radius, atFront = 0.34, atRear = 0.34) {
  return [
    { x: 0, y: radius, z: length * atFront, side: 0, front: true },
    { x: 0, y: radius, z: -length * atRear, side: 0, front: false }
  ]
}

/**
 * How each kind leans.
 *
 *   max     - radians at full lock and speed. 0.6 is about 35 degrees, which
 *             is a brisk road rider; a scooter is more upright because its
 *             rider is sitting on a chair.
 *   fullAt  - the fraction of top speed at which the lean reaches `max`.
 *             Below that it scales down to nothing at a standstill.
 *   rate    - how quickly the lean follows the steering, per second. A bike
 *             rolls in faster than a car's steering returns, which is why
 *             this is above the saloon's steerReturnRate of 5.
 */
export const LEAN_TUNING = {
  motorcycle: { max: 0.6, fullAt: 0.45, rate: 6 },
  scooter: { max: 0.42, fullAt: 0.5, rate: 6.5 }
}

export function newLeanState() {
  return { roll: 0 }
}

/**
 * The angle a bike WANTS to be at, given what it is doing.
 *
 * Positive is a lean to the LEFT, which is the side a positive steering angle
 * turns the nose to (Vehicle.js: "+ left, - right"), so the sign of the lean
 * is the sign of the steering and the bike leans into the turn rather than
 * out of it. Returns 0 for anything that is not a two-wheeler, so a caller
 * can ask without checking first.
 */
export function leanTarget(kind, steering, maxSteer, speed, maxSpeed) {
  const tune = LEAN_TUNING[kind]
  if (!tune || !maxSteer || !maxSpeed) return 0

  const lock = Math.max(-1, Math.min(1, steering / maxSteer))
  // Forward speed only. A bike being backed up does not lean, and a negative
  // here would lean it the wrong way.
  const pace = Math.max(0, Math.min(1, speed / (maxSpeed * tune.fullAt)))
  return lock * pace * tune.max
}

/**
 * Move the lean towards where it wants to be. Exponential approach, so it
 * settles without overshooting - a bike that wobbled past its lean and back
 * would look drunk, and the wheelie has its own ease for the same reason.
 */
export function stepLean(state, kind, steering, maxSteer, speed, maxSpeed, delta) {
  const tune = LEAN_TUNING[kind]
  if (!tune) { state.roll = 0; return state }

  const target = leanTarget(kind, steering, maxSteer, speed, maxSpeed)
  const k = Math.min(1, tune.rate * delta)
  state.roll += (target - state.roll) * k
  if (Math.abs(state.roll) < 1e-4) state.roll = 0
  return state
}

/**
 * The pose Vehicle.js draws.
 *
 *   active - whether there is anything to do this frame
 *   roll   - radians, positive leaning left, see leanTarget()
 *   pivot  - the point the mesh turns about, in the mesh's own space. The
 *            mesh origin is the chassis centre, `height / 2` above the road,
 *            so the contact line is that far below it. Turning about the
 *            origin instead would swing the tyres sideways through the air
 *            by height/2 * sin(roll) - a quarter of a unit at full lean -
 *            which is a bike skating on nothing.
 *
 * The caller cashes in the sign: a lean to the left tips the top of the bike
 * towards +X, and a rotation about the nose axis (+Z) by a POSITIVE angle
 * takes +Y towards -X. So the quaternion is built from `-roll`, and this
 * comment is where that is written down.
 */
export function leanPose(state, kind, height) {
  if (!isTwoWheeler(kind) || state.roll === 0) {
    return { active: false, roll: 0, pivot: { y: 0 } }
  }
  return { active: true, roll: state.roll, pivot: { y: -height / 2 } }
}
