/**
 * The sound of the world, as arithmetic.
 *
 * No Web Audio and no THREE, for exactly the reason `seasons.js`, `holidays.js`
 * and `fireGame.js` have neither: everything with a decision in it belongs
 * where a test can run it. `Audio.js` is the other half - oscillators, filters
 * and gain nodes - and it contains no decisions at all. It reads this.
 *
 * That split matters more here than usual, because sound is the one part of
 * this project that cannot be measured from a screenshot. There is no picture
 * to look at and no geometry to ask. What there is, is a pure function from the
 * frame's state to a set of gains and frequencies, and `tests/audio.mjs` can
 * assert every claim about it: that a stationary car idles, that the siren is
 * silent unless the beacons are on, that snow falls almost quietly, that
 * muting really does mean silence rather than a very small noise, and - the one
 * that would otherwise be found by the whole graph dying mid-drive - that
 * nothing anywhere returns NaN.
 *
 * EVERYTHING IS SYNTHESISED. No files, no licensing, nothing added to the
 * deploy. That is not only thrift: it is the same principle as the rest of the
 * world, which stores no positions and derives everything. A siren here is two
 * numbers and a clock, in the same way the airport is a search rather than a
 * pair of coordinates.
 */

import { sirenBeat } from '../world/vehicleLights.js'

/**
 * Every voice the world has. `Audio.js` builds one node chain per entry and
 * nothing else, so a voice that is not in this list cannot make a sound.
 */
export const VOICES = ['engine', 'road', 'siren', 'wind', 'sea', 'rain']

/**
 * The master trim, before the player's own volume.
 *
 * Deliberately low. Six voices summing into one output clip long before any of
 * them is individually loud, and a portfolio site that distorts is worse than
 * one that is quiet.
 */
export const MASTER = 0.5

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

/**
 * How many gears, and how far the note climbs across one of them.
 *
 * A single tone rising from idle to top speed is the sound of a vacuum
 * cleaner, and it is what this had first. What makes an engine an engine is
 * the SHIFT: the note climbs, drops, and climbs again. Five of them across the
 * speed range is enough to be unmistakable without turning a drive down the
 * ring road into a gear-change exercise.
 */
export const ENGINE_GEARS = 5
export const ENGINE_SPAN = 2.1
export const ENGINE_IDLE_HZ = 46

/** How loud the engine is at rest, and flat out. */
export const ENGINE_GAIN_IDLE = 0.14
export const ENGINE_GAIN_FULL = 0.3

/**
 * Where the gears change, as fractions of top speed.
 *
 * NOT evenly spaced, because real ones are not: first gear covers a small
 * slice of the speed range and top gear a big one, which is why the shifts
 * come quickly as you pull away and then space out. The exponent is the whole
 * of the model - at 1.6 and five gears the changes land at 8%, 25%, 45% and
 * 70% of top speed, which is about right for a road car.
 */
export const GEAR_CURVE = 1.6

export function gearBounds(gears = ENGINE_GEARS) {
  const out = []
  for (let i = 1; i <= gears; i++) out.push(Math.pow(i / gears, GEAR_CURVE))
  return out
}

/**
 * The engine note at a given speed: which gear, how far through it, and the
 * frequency that falls out.
 *
 * Reverse uses the absolute speed, so backing out of the garage sounds like
 * first gear - which is what it is.
 */
export function engineNote(speed, topSpeed, gears = ENGINE_GEARS) {
  const top = Math.max(1, topSpeed || 1)
  const frac = clamp(Math.abs(speed || 0) / top, 0, 1)
  const bounds = gearBounds(gears)

  let gear = 0
  while (gear < gears - 1 && frac > bounds[gear]) gear++

  const from = gear === 0 ? 0 : bounds[gear - 1]
  const to = bounds[gear]
  const within = to > from ? clamp((frac - from) / (to - from), 0, 1) : 0
  const ratio = 1 + within * (ENGINE_SPAN - 1)

  return { gear, within, ratio, hz: ENGINE_IDLE_HZ * ratio, load: frac }
}

// ---------------------------------------------------------------------------
// Tyres, siren, weather
// ---------------------------------------------------------------------------

/** Below this there is no tyre noise; by top speed there is all of it. */
export const ROAD_FROM = 2.5
export const ROAD_GAIN = 0.19

/** How bright the tyre roar is, in Hz of low-pass, at rest and flat out. */
export const ROAD_CUTOFF_LOW = 320
export const ROAD_CUTOFF_HIGH = 1500

/**
 * The two notes of the siren.
 *
 * A real two-tone is roughly a minor third apart. These are the pitches; the
 * CLOCK comes from `sirenBeat()` in vehicleLights.js, which is the same clock
 * the roof bar flashes on. One fact, one implementation - so the lights and
 * the siren cannot drift out of step, which is the only thing anybody would
 * ever notice about either.
 */
export const SIREN_LOW = 620
export const SIREN_HIGH = 810
export const SIREN_GAIN = 0.2

/** Wind in the weather, and the sea when you are near it. */
export const WIND_GAIN = 0.26
export const SEA_GAIN = 0.22

/**
 * How far inland you can still hear the water.
 *
 * The islands are 80-130 units across, so at 90 the sea is audible over most
 * of a small one and fades out in the middle of a big one - which is the right
 * answer for a place where you are never more than a minute from a beach.
 */
export const SEA_REACH = 90

/** Rain, and how much quieter snow is than rain. */
export const RAIN_GAIN = 0.3

/**
 * Snow at 0.12 of rain, not zero.
 *
 * Falling snow is very nearly silent and this is the detail that sells a
 * winter storm: the wind is still there, the tyres are still there, and the
 * hiss of rain simply is not. Not zero, because a heavy fall does make a sound
 * and going to exactly nothing reads as a bug in the weather rather than as
 * weather.
 */
export const SNOW_QUIET = 0.12

/** The indicator relay. Two clicks per flash, like a real one. */
export const TICK_GAIN = 0.3

// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  const n = Number(v)
  if (!Number.isFinite(n)) return lo
  return n < lo ? lo : n > hi ? hi : n
}

/**
 * The whole mix for one frame.
 *
 * Every field of `state` is optional and every missing one means "none of
 * that": an empty object is a silent world rather than an exception. That is
 * not defensive tidiness, it is the only sane contract for something whose
 * inputs come from four different systems that each finish loading at a
 * different moment.
 *
 * `master` is applied by `Audio.js` on the output, not folded into each voice,
 * so the per-voice gains here mean what they say and a test can read them.
 */
export function mix(state = {}) {
  const enabled = !!state.enabled
  const volume = clamp(state.volume ?? 1, 0, 1)
  const master = enabled ? MASTER * volume : 0

  const speed = Number.isFinite(state.speed) ? state.speed : 0
  const top = clamp(state.topSpeed ?? 18, 1, 200)
  const fast = clamp(Math.abs(speed) / top, 0, 1)

  // The engine is OFF while the picker is open. You are standing in a garage
  // choosing a car, not sitting in one - and an idle under the vehicle
  // selector was the first thing that sounded wrong when this was wired up.
  const running = state.running !== false
  const note = engineNote(speed, top)

  const rain = clamp(state.rain ?? 0, 0, 1)
  const flake = clamp(state.flake ?? 0, 0, 1)
  const wind = clamp(state.wind ?? 0, 0, 1)

  // How much of the way inland you are, 0 at the water's edge and 1 once the
  // sea is out of earshot.
  const inland = clamp((state.toShore ?? SEA_REACH) / SEA_REACH, 0, 1)

  const siren = !!state.siren
  const beat = sirenBeat(state.elapsed || 0, state.sirenRate || 1)

  return {
    master,
    engine: {
      hz: note.hz,
      // Louder under load, and the load is the speed. A throttle-driven
      // version was tried and is wrong in the one place it matters: coasting
      // downhill at 18 units a second is not quiet.
      gain: running
        ? ENGINE_GAIN_IDLE + (ENGINE_GAIN_FULL - ENGINE_GAIN_IDLE) * fast
        : 0,
      // The second, detuned oscillator - what turns a tone into an engine.
      // It comes in with the revs rather than sitting there at idle.
      buzz: running ? clamp(note.within * 0.6 + fast * 0.4, 0, 1) : 0,
      gear: note.gear
    },
    road: {
      gain: ROAD_GAIN * clamp((Math.abs(speed) - ROAD_FROM) / top, 0, 1),
      cutoff: ROAD_CUTOFF_LOW + (ROAD_CUTOFF_HIGH - ROAD_CUTOFF_LOW) * fast
    },
    siren: {
      hz: beat ? SIREN_HIGH : SIREN_LOW,
      gain: siren ? SIREN_GAIN : 0
    },
    wind: {
      // Speed adds to it: wind noise past a moving car is real and it is the
      // cheapest way to make eighteen units a second feel like a speed.
      gain: WIND_GAIN * clamp(wind * 0.75 + fast * 0.45, 0, 1),
      cutoff: 500 + 900 * clamp(wind * 0.5 + fast * 0.5, 0, 1)
    },
    sea: {
      gain: SEA_GAIN * (1 - inland)
    },
    rain: {
      // Rain hisses; snow does not. `flake` is how much of what is falling is
      // snow rather than rain, and it comes straight from the Environment.
      gain: RAIN_GAIN * rain * (1 - flake * (1 - SNOW_QUIET))
    },
    // An edge, not a level: `Audio.js` fires one click when this changes.
    tick: {
      on: !!(state.indicator && state.blink),
      gain: TICK_GAIN
    }
  }
}

/**
 * Is anything in this mix actually going to be heard?
 *
 * `Audio.js` suspends the context when nothing is, which is what stops a
 * muted, parked page holding an audio thread open for the rest of the session.
 */
export function audible(m) {
  if (!m || m.master <= 0) return false
  return VOICES.some(v => (m[v] && m[v].gain) > 0.001) || m.tick.on
}
