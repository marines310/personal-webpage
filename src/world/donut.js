/**
 * Donut mode.
 *
 * A switch on the race car and the monster truck that makes the back end let
 * go, so you can hold a donut instead of fighting the car into one.
 *
 * No THREE in here, like driving.js and the mission games, and for the same
 * reason: this is arithmetic, and arithmetic can be tested in a millisecond
 * without a browser. `Vehicle.js` owns the body and the input; this owns the
 * numbers.
 *
 * WHY IT IS A SET OF MULTIPLIERS AND NOT A NEW DRIVING MODEL
 * ----------------------------------------------------------
 * `Vehicle.js` already models grip: it splits velocity into "along the car"
 * and "sideways", and keeps `(1 - lateralGrip) ^ delta` of the sideways part
 * each frame. High grip means the car tracks its nose; low grip means it
 * slides. A donut is just that number turned a long way down, plus enough
 * steering lock to keep the arc tight and a low enough speed that you stay in
 * one place rather than drifting across the island.
 *
 * So donut mode changes four numbers and nothing else. No second velocity
 * path, no special case in the physics, nothing to keep in step with the
 * normal one - which is the trap `driving.js` was written to avoid when the
 * monster truck and the racing car first needed to handle differently.
 */

/**
 * Who gets it.
 *
 * Mike asked for the race car and the monster truck. A kind not in this list
 * cannot turn it on at all - the rule is "what is in the list can donut",
 * not "everything can except these", for the same reason the fuel tanks are
 * a table rather than a list of exclusions.
 */
export const DONUT_KINDS = ['race', 'monster']

/**
 * What it does to the handling, as multipliers of whatever that kind already
 * drives like. Multipliers, not replacements, so retuning the race car in
 * driving.js retunes its donuts too and nothing silently keeps an old number.
 */
export const DONUT_TUNING = {
  /**
   * THE ONE THAT MATTERS. The base is 0.92 - very nearly on rails - and a
   * fifth of that is a car whose back end goes where the weight takes it.
   * Everything else here only shapes the arc; this is what breaks traction.
   */
  lateralGrip: 0.2,

  /**
   * Pivot tighter. The bicycle model is `yawRate = speed * tan(steer) /
   * wheelbase`, so a shorter wheelbase spins the car faster for the same
   * speed and lock. It is a lie about the car's geometry, and the honest
   * alternative - leaving the wheelbase alone and winding the lock up until
   * the arc is tight enough - needs a steering angle past 90 degrees, where
   * `tan` goes to infinity and the car snaps round.
   */
  wheelbase: 0.55,

  /** Keep the lock at speed; the base takes 82% of it away flat out. */
  highSpeedSteerReduction: 0.35,
  maxSteerAngle: 1.25,

  /**
   * Donuts are slow. Left at full speed the car describes an enormous
   * circle and leaves the car park, which is not a donut, it is a lap.
   */
  maxForwardSpeed: 0.5,

  /** And it should not scrub off all its speed the moment it steps out. */
  corneringDrag: 0.45
}

/** Can this kind do donuts at all? */
export function canDonut(kind) {
  return DONUT_KINDS.includes(kind)
}

/**
 * The handling to drive with this frame.
 *
 * Returns the params UNCHANGED - the same object, not a copy - when donut
 * mode is off or this kind cannot do it. That matters twice: it is the hot
 * path, called every frame for every vehicle, and it means a kind that never
 * donuts is provably untouched by this file rather than merely expected to
 * be.
 */
export function donutParams(params, kind, active) {
  if (!active || !params || !canDonut(kind)) return params

  const out = { ...params }
  for (const [key, factor] of Object.entries(DONUT_TUNING)) {
    if (typeof params[key] === 'number') out[key] = params[key] * factor
  }
  return out
}

/**
 * Whether donut mode should be on, given what it was and what just happened.
 *
 * A toggle rather than a held key: a donut lasts as long as you want it to,
 * and holding a key down while also steering and accelerating is a lot of
 * hands. Switching to a vehicle that cannot donut turns it off, so you never
 * get into a bus and find the handling mysteriously wrong.
 */
export function nextDonutState(was, kind, pressed) {
  if (!canDonut(kind)) return false
  return pressed ? !was : was
}

/** What the screen should say about it. UI.js works nothing out for itself. */
export function donutHud(kind, active) {
  return {
    show: canDonut(kind),
    active: !!active && canDonut(kind)
  }
}
