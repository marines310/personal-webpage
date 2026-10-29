/**
 * How each vehicle drives, and what happens when it leaves the ground.
 *
 * No THREE, like the mission games and for the same reason: this is
 * arithmetic, and arithmetic can be tested in a millisecond without a
 * browser. `Vehicle.js` owns the body and the input; this owns the numbers.
 *
 * WHY THIS FILE EXISTS AT ALL
 * ---------------------------
 * Until now every vehicle drove identically - `Vehicle.js` said so in a
 * comment, and it was the right call while the fleet was eight road cars that
 * differ only in shape. It stops being the right call the moment there is a
 * monster truck and a racing car, because those two ARE their handling. A
 * monster truck that corners like a saloon is a saloon wearing big wheels.
 */

/**
 * What each kind changes about the baseline in `Vehicle.js`.
 *
 * Every value is a MULTIPLIER of the base, not a replacement, so retuning the
 * car retunes the fleet and nothing silently keeps an old absolute number.
 * A kind with no entry here drives exactly as it always has - which is all
 * eight of the original vehicles, deliberately, because none of them was
 * broken.
 */
export const VEHICLE_TUNING = {
  /**
   * The monster truck: slow, heavy, enormous grip, and it does not care what
   * it drives over.
   *
   * `airControl` is the one that matters. It is what makes a jump feel like a
   * jump rather than an interruption - see `airborneVelocity()`.
   */
  monster: {
    maxForwardSpeed: 0.78,      // 14 - it is a truck
    forwardAccel: 0.85,
    // A SHOVE, NOT A ROCKET - and this is the one number in this table that
    // was written down wrong first time and caught by measuring rather than
    // by reading. Everything here multiplies the BASE, and the base boost is
    // 1.65, so 1.15 did not mean "a mild boost", it meant "15% more boost
    // than a saloon gets" - 1.90, the strongest in the fleet, on the vehicle
    // the comment beside it called a truck. Driven at the ramp it came off the
    // lip at 26 rather than 14. 0.72 of the base is 1.19, which takes a
    // 14-unit truck to about 16.6 and leaves it comfortably the slowest thing
    // in the world, which is the whole point of it.
    boostMultiplier: 0.72,
    maxSteerAngle: 1.05,        // huge lock: it turns like a toy, on purpose
    highSpeedSteerReduction: 0.6,
    handbrakeStrength: 0.8,     // heavy things do not stop quickly
    rollingResistance: 0.75,
    airControl: 1,              // full authority in the air
    label: 'clearance'
  },

  /**
   * The racing car: fast, sharp, and unforgiving of a lazy line.
   *
   * The steering LOCK is smaller, not larger. A racing car does not turn
   * tighter than a saloon at walking pace - it turns better at speed, which is
   * `highSpeedSteerReduction`: the fraction of the lock taken away as the
   * speed rises. Multiplying the base 0.82 by 0.45 leaves 0.37, so it keeps
   * well over half its lock flat out where a saloon keeps under a fifth. That
   * one number is most of what makes it feel planted through a fast corner.
   */
  race: {
    maxForwardSpeed: 1.55,      // 28
    forwardAccel: 1.7,
    // 0.80 of the base 1.65 is 1.32, so about 37 flat out. Under 1 for the
    // same reason as the truck's: these are multipliers of the saloon's boost,
    // and a car that is already the fastest thing in the world does not also
    // need the biggest overtaking button.
    boostMultiplier: 0.8,
    maxReverseSpeed: 0.7,       // nobody reverses one of these anywhere
    maxSteerAngle: 0.72,
    highSpeedSteerReduction: 0.45,
    handbrakeStrength: 1.35,    // carbon brakes
    engineBrakeStrength: 1.2,
    rollingResistance: 1.1,
    airControl: 0.25,           // it is not supposed to be off the ground
    label: 'downforce'
  }
}

/**
 * The baseline with one kind's multipliers applied.
 *
 * Returns a NEW object; the base is never mutated. `Vehicle.setKind()` calls
 * this on every change, so switching from the racing car back to the sedan
 * has to restore the sedan exactly - which it does, because the base it
 * starts from is untouched.
 */
export function tuningFor(kind, base) {
  const out = { ...base }
  const tune = VEHICLE_TUNING[kind]
  if (!tune) return out

  for (const [key, factor] of Object.entries(tune)) {
    // `airControl` and `label` are values in their own right, not multipliers
    // of anything in the base.
    if (key === 'airControl' || key === 'label') { out[key] = factor; continue }
    if (typeof base[key] === 'number') out[key] = base[key] * factor
  }
  return out
}

/** How much of the horizontal velocity a grounded vehicle sets outright. */
export const GROUNDED = 1

/**
 * How much of the steering yaw survives once the wheels are off the ground.
 *
 * 1 - the same rate it turns at on the ground, no more - and the ceiling is
 * the point of the number. The yaw on the ground comes from the bicycle model,
 * which is speed times the tangent of the steering angle over the wheelbase,
 * and that model is entirely about TYRES. Off the ground it has no meaning at
 * all, so there is nothing stopping this being 3 except a decision, and a
 * monster truck that can spin faster in the air than on the tarmac is a
 * cartoon rather than a stunt.
 *
 * Then scaled by the kind's own `airControl`, which is what actually separates
 * the three: the truck keeps all of its rotation, the racing car a quarter of
 * it, and the saloon none, so a saloon is pointed wherever it left the ramp
 * pointing until it lands. One number doing both jobs, deliberately - a
 * vehicle that can point itself somewhere in mid-air and a vehicle that can GO
 * there ought to be the same vehicle.
 */
export const AIR_YAW = 1

/**
 * The yaw rate a vehicle actually gets while airborne.
 *
 * @param {number} yawRate  what the bicycle model asked for
 * @param {object} params   the vehicle's tuned parameters
 */
export function airYaw(yawRate, params) {
  const air = (params && params.airControl) || 0
  return yawRate * air * AIR_YAW
}

/**
 * What the horizontal velocity should be this frame.
 *
 * ON THE GROUND this is unchanged from what the game has always done: the
 * velocity IS the heading times the speed, set outright every frame. That is
 * what makes the car feel like it is on rails rather than on ice, and it is
 * the right feel for driving round a town.
 *
 * IN THE AIR it is wrong, and it was wrong in a way nobody had noticed because
 * nothing in the world could launch a car. Overwriting the horizontal velocity
 * while airborne means:
 *
 *   - the car keeps its full speed no matter how long it is up there, so a
 *     jump is a flat glide rather than an arc;
 *   - and steering in mid-air instantly redirects all of that speed sideways,
 *     so you can turn a corner while off the ground.
 *
 * Both are fine in a game about driving to a fire. Neither survives a ramp.
 *
 * So in the air the velocity it had when it took off is kept, and steering is
 * blended in at `airControl` - 1 for the monster truck, which should feel like
 * a toy and be steerable in flight, near zero for the racing car, which should
 * feel like a mistake. The vertical component is not this function's business:
 * gravity has it, and it was already correct.
 */
export function airborneVelocity(desired, current, grounded, airControl = 0) {
  if (grounded) return { x: desired.x, z: desired.z }

  const blend = Math.max(0, Math.min(1, airControl))
  return {
    x: current.x + (desired.x - current.x) * blend,
    z: current.z + (desired.z - current.z) * blend
  }
}

/**
 * How level a surface has to be before standing on it counts as being on the
 * ground.
 *
 * 0.4 is the cosine of about 66 degrees, and nothing in this world is remotely
 * that steep - the terrain caps its own gradient at 25%, which is 14 degrees,
 * and the steepest ramp on the stunt course is under 20. So this is not a fine
 * distinction between two similar things. It separates a floor, whose contact
 * normal points straight up, from a wall, whose contact normal points sideways.
 *
 * Walls are the reason this is a test on the NORMAL and not a count of
 * contacts. A car pinned against a building is touching something; it is not
 * standing on it. Measured in the garage doorway, a wedged car reported
 * twenty-two contact pairs and every one of them had a Y component of zero.
 */
export const GROUND_NORMAL = 0.4

/**
 * Is the vehicle standing on something?
 *
 * Takes the contact normals from `Physics.contactNormals()` - the upward
 * component of each - rather than a raycast distance, which is what this used
 * to take and why it sat unfinished for a whole stage. The full argument is on
 * `Physics.contactNormals()`. The short version: the ray needs a threshold,
 * there is no honest value for one, and the engine already knows the answer
 * exactly.
 *
 * No contacts means airborne. That is the entire rule.
 *
 * One thing worth knowing before adding anything to it. Over 2700 frames of
 * hard driving with the wheel swinging about, twelve came back with no contact
 * at all. Those are real - a kerb or a road seam genuinely throws the car -
 * and they are 0.4% of the time. A single frame of `airborne` costs a vehicle
 * with `airControl: 0` nothing at all: its velocity carries over instead of
 * being re-set from the steering, and on that frame those are the same number.
 * So there is no hysteresis here on purpose. Adding some would blunt the first
 * frames of a real jump, and the first frames are the ones that decide where
 * it lands.
 */
/**
 * How long a vehicle goes on counting as grounded after it stops touching.
 *
 * "Coyote time", after the cartoon. This was left out on purpose at first, and
 * the reasoning written down here was that a stray airborne frame costs
 * nothing - which was true of a stray FRAME and wrong about what actually
 * happens, because the test feeds back into the driving.
 *
 * Measured, with the contact test wired in and no coyote time: a saloon driven
 * flat out with the wheel swinging about spent 28.7% of its frames off the
 * ground, in 73 separate flights with a median length of three frames. Those
 * are kerbs, junction patches and the crest where a verge meets a road - and
 * they are REAL, the downward ray agreed at 20.9%, the median height was a
 * unit and the median vertical speed was -1.96. The car genuinely was in the
 * air. The trouble is that being in the air cuts the throttle and stops the
 * steering setting the velocity, which makes the next bump worse, and a road
 * car that skitters a third of the time is not what anybody asked for.
 *
 * 0.12 seconds is over seven frames at 60fps, which swallows the median flight
 * whole, and a twentieth of the 1.25 seconds a monster truck spends in the air
 * off the big jump - so the thing this exists to protect is untouched.
 */
export const COYOTE_TIME = 0.12

/**
 * How close underneath still counts, when the contacts say nothing.
 *
 * A second opinion, and it is the OLD one: before any of this, the game asked
 * `physics.isGrounded(body, 1.2)` - a downward ray with a 1.2-unit reach - and
 * the world was tuned with that answer. A settled car reads 0.57 under its
 * centre, so 1.2 is roughly double the resting clearance: generous enough to
 * ride out a kerb, tight enough that a car off a ramp lip is past it within a
 * frame or two.
 *
 * Keeping it matters because of what "grounded" now decides. It gates the
 * throttle and it decides whether the steering sets the velocity, so a car
 * that flickers off the ground flickers out of DRIVE - and the contact test,
 * being exact, flickers. Measured over 1800 frames of hard driving, contacts
 * said airborne 28.7% of the time and the ray said 19.3%, and both were
 * telling the truth about the same car: it really was leaving the ground over
 * kerbs and junction patches. Only one of those two answers makes a car you
 * can drive.
 *
 * So: contacts are believed when they fire, and the ray covers the rest.
 */
export const GROUND_REACH = 1.2

/**
 * Grounded, allowing for the ray and for coyote time.
 *
 * @param {boolean} touching   what isGrounded() said about the contacts
 * @param {number|null} below  distance to the ground under the body, or null
 * @param {number}  offFor     how long it has been since the last contact
 */
export function groundedWithCoyote(touching, below, offFor) {
  if (touching) return true
  if (below !== null && below !== undefined && below <= GROUND_REACH) return true
  return (offFor || 0) < COYOTE_TIME
}

export function isGrounded(normals) {
  if (!normals || !normals.length) return false
  for (const y of normals) {
    if (Math.abs(y) > GROUND_NORMAL) return true
  }
  return false
}

// ---------------------------------------------------------------------------
// PITCH AND ROLL
// ---------------------------------------------------------------------------
//
// Mike, having driven the arena: "the jump mechanics seem kinda flat. When I
// went on the monster truck jumps, it feels kinda flat / unrealistic."
//
// He was describing exactly what the code did. Every chassis had its pitch and
// roll LOCKED - `setEnabledRotations(false, true, false, true)` - and on top of
// that the driving model wrote `setAngvel({x: 0, y: yawRate, z: 0})` every
// single frame, which zeroed any pitch or roll rate the physics had managed to
// build up. So a car left a four-unit mound perfectly level, flew perfectly
// level, and landed perfectly level. There was nothing to see.
//
// The lock is off now. What replaces it is not "let Rapier do whatever it
// likes" - a free box with no tyres barrel-rolls off the first kerb it clips -
// but a controller with three parts:
//
//   1. AN UPRIGHT SPRING. A torque that rotates the vehicle's own up axis back
//      towards the world's. Stiff on the ground, where four tyres and a
//      suspension would be doing it; weak in the air, where nothing is.
//   2. PATH ALIGNMENT. In the air, a gentle torque that swings the nose
//      towards the direction of travel - so a car pitches UP as it climbs off
//      a ramp and noses DOWN as it falls. This is the single thing that makes
//      a jump look like a jump, and it costs one cross product.
//   3. A RATE CAP, so a bad landing is a lurch rather than a barrel roll.
//
// All of it returns RATES rather than torques. Torque would be the more
// physical choice and needs the inertia tensor, the mass and a tuning pass per
// vehicle; rates are exact, testable without a physics engine, and cannot
// diverge. The cost is that a collision cannot spin the car faster than the
// cap - which is the behaviour wanted anyway.

/**
 * How hard the vehicle fights to stay level, and how freely it rotates.
 *
 * `groundSpring` is deliberately high. On the ground a car does not lean five
 * degrees and stay there; it leans, and it comes back. What survives is the
 * transient - the pitch as you crest a mound, the roll as you turn in - which
 * is what "subtle" means here.
 */
export const TILT = {
  /** Restoring rate towards upright, per radian of tilt, on the ground. */
  groundSpring: 11,
  groundDamp: 8,
  /** In the air the wheels are not holding it up, so it barely fights. */
  airSpring: 0.9,
  airDamp: 3,
  /** How hard the nose swings towards the direction of flight. */
  pathAlign: 2.6,
  /** Radians per second, on pitch and roll together. */
  maxRate: 3.4,
  /** Upside down for longer than this and it rights itself. */
  flipSeconds: 2.2,
  /** up.y below this counts as on its roof. */
  flippedBelow: -0.15
}

/** Cross product, because three of these are needed and none of them is THREE. */
function cross(a, b) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }
}

/**
 * The rotation that would put a vehicle back upright, as an axis-times-angle.
 *
 * `up` is the vehicle's own up axis in world space. Its cross product with the
 * world's up is an axis to turn about whose LENGTH is the sine of the angle
 * between them - so it is both the direction and the amount, and it is zero
 * exactly when the vehicle is level. The y component is dropped because
 * turning about y is yaw, and yaw belongs to the steering.
 */
export function uprightError(up, target = { x: 0, y: 1, z: 0 }) {
  const e = cross({ x: up.x, y: up.y, z: up.z }, target)
  return { x: e.x, z: e.z }
}

/**
 * The rotation that would swing the nose onto the direction of travel.
 *
 * Only meaningful in the air, and only when actually moving - below a walking
 * pace the direction of travel is noise, and aligning to noise is a twitch.
 */
export function pathError(forward, velocity, minSpeed = 3) {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z)
  if (speed < minSpeed) return { x: 0, z: 0 }
  const dir = { x: velocity.x / speed, y: velocity.y / speed, z: velocity.z / speed }
  const e = cross(forward, dir)
  return { x: e.x, z: e.z }
}

/**
 * The pitch and roll rates to hand to the body this frame.
 *
 * Returns `{ x, z }` in radians per second. Yaw is not this function's
 * business: it comes from the bicycle model and is written straight onto the
 * body's y.
 */
export function tiltRates({ up, forward, angVel, velocity, grounded,
                            groundNormal, delta = 1 / 60 }) {
  const t = TILT
  const spring = grounded ? t.groundSpring : t.airSpring
  const damp = grounded ? t.groundDamp : t.airDamp

  // ON THE GROUND, LEVEL MEANS THE SLOPE - not the horizon.
  //
  // Aiming at world up while standing on a 25-degree mound means the spring
  // spends the whole climb trying to keep the car horizontal on a hill, so it
  // fights the terrain, wins, and the car crosses the arena as flat as it did
  // when the axis was locked. Aiming at the surface normal instead means the
  // car lies ALONG whatever it is on, which is what a car does, and the whole
  // pitch of a ramp shows up for free.
  //
  // Blended rather than taken outright: a contact normal from a trimesh edge
  // can point somewhere silly for a frame, and following it exactly is a
  // twitch. Three parts slope to one part horizon is enough to swallow that.
  let target = { x: 0, y: 1, z: 0 }
  if (grounded && groundNormal && groundNormal.y > 0.35) {
    const bx = groundNormal.x * 0.75
    const by = groundNormal.y * 0.75 + 0.25
    const bz = groundNormal.z * 0.75
    const len = Math.hypot(bx, by, bz) || 1
    target = { x: bx / len, y: by / len, z: bz / len }
  }

  const level = uprightError(up, target)
  let ax = level.x * spring
  let az = level.z * spring

  if (!grounded && velocity) {
    // Nose towards the flight path. On the way up that is a pitch back; on
    // the way down it is a pitch forward, which is what a car does.
    const path = pathError(forward, velocity)
    ax += path.x * t.pathAlign
    az += path.z * t.pathAlign
  }

  // Damped towards the target rate rather than snapped to it, so the spring
  // overshoots slightly and settles - a critically damped car looks dead.
  const blend = Math.min(1, damp * delta)
  let x = (angVel ? angVel.x : 0) + (ax - (angVel ? angVel.x : 0)) * blend
  let z = (angVel ? angVel.z : 0) + (az - (angVel ? angVel.z : 0)) * blend

  const rate = Math.hypot(x, z)
  if (rate > t.maxRate) {
    const k = t.maxRate / rate
    x *= k
    z *= k
  }
  return { x, z }
}

/** On its roof, as opposed to merely leaning. */
export function isFlipped(up) {
  return up.y < TILT.flippedBelow
}
