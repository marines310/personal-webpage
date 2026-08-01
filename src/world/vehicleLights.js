/**
 * What a vehicle's lamps are doing, as arithmetic.
 *
 * No THREE in here, so a test can run the whole of it - the same split as
 * cameraPose.js and seasons.js.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * There were two lighting systems. The traffic registered its headlights with
 * the world's night-emissive list, driven by `setTimeOfDay(day, night)`. The
 * player's car had its own materials and its own `updateLights()`, driven by
 * night AND weather. So on a stormy afternoon the player's lights were on and
 * every other car on the road had theirs off, and neither knew about the
 * other.
 *
 * Worse: `setKind()` rebuilds the player's mesh from the TRAFFIC builder, and
 * the old code kept `this.headlightMaterial` pointing at the sedan's material
 * from before the swap. So the moment you picked anything but a sedan out of
 * the garage, `updateLights()` spent every frame carefully lighting a mesh
 * that was no longer in the scene. That is the bug Mike found, and it is what
 * two implementations of one thing always eventually costs.
 *
 * Now there is one lamp set, discovered from the mesh, and one function that
 * says how bright each lamp should be. The player and the traffic both call it.
 */

/** Every lamp a vehicle has. Indicators are amber; the rest speak for themselves. */
export const LAMP_ROLES = ['head', 'tail', 'left', 'right']

/**
 * Indicators blink at about 1.4Hz, which is roughly the legal 60-120 flashes
 * a minute. Each vehicle carries a fixed phase offset so a queue at a red
 * light doesn't blink in unison like a chorus line - real ones drift apart
 * within seconds and it is the drift you notice, not the rate.
 */
export const BLINK_HZ = 1.4

export function blinkOn(elapsed, phase = 0) {
  return Math.floor((elapsed + phase) * BLINK_HZ * 2) % 2 === 0
}

/**
 * How dark it is, as far as headlights are concerned: 0 broad daylight,
 * 1 pitch black.
 *
 * Night AND weather, because a storm at two in the afternoon is darker than
 * dusk. This is the number the traffic never had - its headlights came on at
 * night only - and giving both systems the same one is most of the point of
 * this file.
 */
export function gloomLevel(env) {
  if (!env) return 0
  const weather = env.current
    ? env.current.cloud * 0.55 + env.current.rain * 0.35
    : 0
  return Math.max(env.nightFactor || 0, weather)
}

/** Lamps on from `gloom`, ramped so they fade up through dusk rather than snap. */
export function headlightLevel(gloom) {
  const t = (gloom - 0.25) / 0.35
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/**
 * How bright every lamp on one vehicle should be, right now.
 *
 * One function for the car you drive and the hundred you don't. The inputs
 * are deliberately all plain numbers and booleans: nothing in here knows
 * whether it is describing the player or a bus on the far side of the map.
 *
 *   gloom     0..1, from gloomLevel()
 *   braking   the brake is on, or the vehicle is slowing hard
 *   stopped   it has come to a stand - brake lights hold on
 *   indicate  -1 left, 0 none, +1 right
 *   blink     whether the blink cycle is currently in its ON half
 */
export function lampBrightness({ gloom = 0, braking = false, stopped = false,
                                 indicate = 0, blink = false } = {}) {
  const on = headlightLevel(gloom)

  // Brake lights are not "tail lights, brighter". A tail light at night is a
  // dim red presence; a brake light is bright in full sun. So the two share a
  // lamp but not a level, and the brake wins outright rather than adding to
  // whatever the headlights happen to be doing.
  const tail = (braking || stopped) ? 3.2 : on * 1.1

  return {
    head: on * 1.8,
    beam: on,                     // the player's spotlight, scaled by the caller
    tail,
    left: indicate < 0 && blink ? 2.6 : 0,
    right: indicate > 0 && blink ? 2.6 : 0
  }
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

/**
 * How much steering counts as a turn rather than a correction.
 *
 * As a fraction of full lock. Below this the indicators stay off, or they
 * would flicker the whole way down a straight road while you held the car
 * between the lines.
 */
export const STEER_TO_INDICATE = 0.45

/**
 * How long the indicator stays on after you stop steering.
 *
 * Without it, the lamps stutter through a corner every time the steering
 * passes back through centre - which happens constantly, because you unwind
 * the wheel on the way out of every bend.
 */
export const INDICATE_HOLD = 0.9

/**
 * The indicator the player's steering is asking for, with hysteresis.
 *
 * `state` is carried by the caller: { side, held }.
 * `steering` is -1..1 as the inputs report it, POSITIVE LEFT (the same sign
 * convention `getInput()` uses, so nothing has to be flipped on the way in).
 */
export function steerIndicator(state, steering, delta) {
  const wants = steering > STEER_TO_INDICATE ? -1
              : steering < -STEER_TO_INDICATE ? 1
              : 0

  if (wants !== 0) {
    state.side = wants
    state.held = INDICATE_HOLD
  } else if (state.held > 0) {
    state.held -= delta
    if (state.held <= 0) state.side = 0
  }

  return state.side
}

/**
 * The indicator, taking a manual stalk into account.
 *
 * Manual wins while it is latched, which is the whole point of being able to
 * override: signalling BEFORE a junction means signalling while the wheel is
 * still straight, and a steering-driven indicator would sit there dark.
 *
 * `manual` is -1, 0 or +1. Anything else is the automatic answer.
 */
export function resolveIndicator(manual, automatic) {
  return manual !== 0 ? manual : automatic
}

/**
 * Should a latched manual indicator cancel itself?
 *
 * A real stalk is knocked off by the steering wheel coming back through
 * centre after a turn - not by the turn starting. So this waits until the car
 * has actually swung round by a decent angle IN THE SIGNALLED DIRECTION, and
 * only then cancels. Cancelling on the first straight moment instead would
 * switch it off between the two halves of a lane change.
 *
 * `turned` is how far the heading has moved since the stalk was set, signed
 * the same way as the indicator (+ right).
 */
export const STALK_CANCEL_TURN = 1.1     // radians, about 63 degrees

export function stalkCancels(side, turned) {
  if (!side) return false
  return side * turned >= STALK_CANCEL_TURN
}

// ---------------------------------------------------------------------------
// What the traffic is about to do
// ---------------------------------------------------------------------------

/**
 * How long an AI vehicle's indicator stays on after it takes a turn.
 *
 * The lamp comes on AS the vehicle enters the new lane, not before it. That
 * is not the ideal - a real driver signals on the approach - and signalling
 * early was built first: the onward lane was chosen a couple of seconds ahead
 * by the same function with the same randomness, and remembered. It worked
 * and it read correctly.
 *
 * It also moved every vehicle's `rand()` draws, which re-shuffled every route
 * in the city, and one car in the re-shuffled 94-vehicle run crossed a red
 * light - measured over four durations where the old code never did. A red
 * light is one of only three things allowed to stop a vehicle in this world.
 * An indicator is not worth paying for with one.
 *
 * So it signals from the turn it is committed to and already taking. The
 * heading eases round at 2.6 rad/s, so the car is still visibly swinging
 * through the junction for most of the time the lamp is lit, and the
 * simulation is bit-identical to one with no indicators at all.
 */
export const SIGNAL_HOLD = 1.3

/**
 * How sharp a change of direction counts as a turn worth indicating.
 *
 * Roads meet at all sorts of angles here, and a lane that kinks by ten
 * degrees is a bend, not a turn. Twenty-five degrees is about where a driver
 * would reach for the stalk.
 */
export const SIGNAL_TURN = 0.44

/**
 * Which way a vehicle turned: -1 left, 0 straight on, +1 right.
 *
 * THE SIGN, WHICH WAS WRONG FIRST TIME
 * ------------------------------------
 * Headings here are `atan2(x, z)` and the car's nose is +Z. For a vehicle
 * facing +Z, "right" is the direction `forward x up` = (0,0,1) x (0,1,0),
 * which is **-X**. So turning right moves the nose toward -x, x decreases,
 * and the heading DECREASES.
 *
 * It was written the other way round on the reasoning that "north is 0 and
 * east is +PI/2, so right increases the heading" - which is true of a compass
 * and false here, because +X is the car's left. Every AI indicator was on the
 * wrong side.
 *
 * What is worth noting is why the test did not catch it: it compared this
 * function's answer against this function's answer, computed from the lane
 * headings either side of the junction. Both were flipped together and it
 * agreed with itself perfectly. The measurement that settled it was a cross
 * product against the car's actual direction of travel in the running game -
 * ask the geometry where the thing ends up, never a proxy for it.
 */
export function turnDirection(fromHeading, toHeading) {
  let delta = toHeading - fromHeading
  while (delta > Math.PI) delta -= Math.PI * 2
  while (delta < -Math.PI) delta += Math.PI * 2
  if (Math.abs(delta) < SIGNAL_TURN) return 0
  return delta > 0 ? -1 : 1
}

/**
 * The same fact for a heading CHANGE rather than two headings: how far the
 * vehicle has turned, expressed in the indicator's sign (+ right).
 *
 * One place converts between "which way the heading moved" and "which
 * indicator that is", so the two conventions meet exactly once.
 */
export function turnAmount(headingChange) {
  return -headingChange
}

/**
 * Which side of the vehicle a point in its own coordinates is on.
 *
 * -1 left, +1 right, matching the indicator's own sign.
 *
 * THIS EXISTS BECAUSE THE INDICATORS CAME OUT ON THE WRONG SIDES.
 * `turnDirection` was checked against the geometry with a cross product and
 * was right; the lamps were then hung on the vehicle by whoever wrote the
 * builder, who assumed +X was the right-hand side because that is what it is
 * on a screen. It is not: the nose is +Z, so right is forward x up =
 * (0,0,1) x (0,1,0) = (-1,0,0). Every indicator in the world was on the wrong
 * side of every vehicle, and the test could not see it because it verified
 * which WAY to signal and never which LAMP that lit - one link of the chain
 * checked, the next one assumed.
 *
 * So the answer lives here now, where a test can ask it directly, instead of
 * being re-derived by eye at each place that hangs something on a car.
 */
export function sideOfVehicle(localX) {
  return localX > 0 ? -1 : 1
}
