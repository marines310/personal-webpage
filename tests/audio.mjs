/**
 * The sound of the world.
 *
 * Sound is the one part of this project that a screenshot cannot check. There
 * is no picture to look at and no geometry to ask, which is exactly why the
 * whole of it that can be wrong lives in `audioMix.js` as a pure function from
 * the frame's state to a set of gains and frequencies. Everything below is a
 * claim about that function.
 *
 * The one that matters most is the last: a non-finite value handed to an
 * AudioParam throws, the frame's update aborts part-built, and every voice
 * after it in the loop is left where it was - a graph that dies silently, mid
 * drive, and stays dead. So every field of every voice is swept against
 * nonsense inputs.
 */
import {
  mix,
  audible,
  engineNote,
  gearBounds,
  VOICES,
  MASTER,
  ENGINE_GEARS,
  ENGINE_SPAN,
  ENGINE_IDLE_HZ,
  ENGINE_GAIN_IDLE,
  ENGINE_GAIN_FULL,
  ROAD_FROM,
  SIREN_LOW,
  SIREN_HIGH,
  SEA_REACH,
  SNOW_QUIET
} from '../src/systems/audioMix.js'
import { sirenBeat } from '../src/world/vehicleLights.js'
import { SIREN_RATE } from '../src/world/islandLayout.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const TOP = 18
const driving = (over = {}) => mix({
  enabled: true, volume: 1, topSpeed: TOP, running: true, ...over
})

// ---------------------------------------------------------------------------
console.log('1. Silence is a state, not an accident\n')

const muted = mix({ enabled: false, speed: TOP, siren: true, rain: 1, wind: 1 })
chk('muted means master zero', muted.master === 0)
chk('and audible() agrees, so the context can be suspended', !audible(muted))

// The per-voice gains are deliberately NOT zeroed when muted: master is the
// one place silence is decided, so unmuting is instant and nothing has to be
// rebuilt. This checks that the single gate is the only gate.
chk('the voices keep their levels behind the master gate',
    muted.engine.gain > 0 && muted.rain.gain > 0)

const quiet = mix({ enabled: true, volume: 0 })
chk('volume zero is silence too', quiet.master === 0)

chk('an empty world is silent rather than an exception', mix().master === 0)
chk('and every voice still exists in it',
    VOICES.every(v => mix()[v] && typeof mix()[v].gain === 'number'))

const full = driving()
chk(`full volume is the master trim (${MASTER})`, full.master === MASTER)

// ---------------------------------------------------------------------------
console.log('\n2. The engine has gears\n')

const bounds = gearBounds()
console.log('   shifts at ' +
  bounds.slice(0, -1).map(b => `${Math.round(b * 100)}%`).join(', ') + ' of top speed')

chk(`there are ${ENGINE_GEARS} of them`, bounds.length === ENGINE_GEARS)
chk('they run in order and end at top speed',
    bounds.every((b, i) => i === 0 || b > bounds[i - 1]) &&
    Math.abs(bounds[bounds.length - 1] - 1) < 1e-9)

// The whole point of the curve: first gear is a small slice of the range and
// top gear a big one. Evenly spaced gears sound like a machine, not a car.
const first = bounds[0]
const last = bounds[bounds.length - 1] - bounds[bounds.length - 2]
console.log(`   first gear covers ${(first * 100).toFixed(0)}% of the range,` +
            ` top gear ${(last * 100).toFixed(0)}%`)
chk('first gear is much shorter than top gear', last > first * 2.5)

chk('at rest the engine idles', engineNote(0, TOP).hz === ENGINE_IDLE_HZ)
chk('and idling is gear zero', engineNote(0, TOP).gear === 0)

// THE CLAIM THAT MAKES IT AN ENGINE: the note drops when it shifts. Walked
// across the whole speed range rather than sampled at the boundaries, because
// a shift that happens to land between two samples is a shift nobody hears.
const walk = []
for (let s = 0; s <= TOP; s += 0.05) walk.push(engineNote(s, TOP))
let drops = 0
for (let i = 1; i < walk.length; i++) {
  if (walk[i].hz < walk[i - 1].hz - 1e-9) drops++
}
console.log(`   ${drops} points where the note falls as the speed rises`)
chk(`the note drops ${ENGINE_GEARS - 1} times, once per shift`,
    drops === ENGINE_GEARS - 1, `${drops}`)

chk('it climbs within a gear',
    engineNote(TOP * 0.95, TOP).hz > engineNote(TOP * 0.75, TOP).hz)
chk(`and never past the span (x${ENGINE_SPAN})`,
    walk.every(n => n.hz <= ENGINE_IDLE_HZ * ENGINE_SPAN + 1e-9))

// Reverse is first gear, because that is what reverse is.
chk('reversing sounds like pulling away, not like nothing',
    engineNote(-3, TOP).hz === engineNote(3, TOP).hz &&
    engineNote(-3, TOP).hz > ENGINE_IDLE_HZ)

chk('the engine is louder under load',
    driving({ speed: TOP }).engine.gain > driving({ speed: 0 }).engine.gain)
chk('idle and full match the constants',
    Math.abs(driving({ speed: 0 }).engine.gain - ENGINE_GAIN_IDLE) < 1e-9 &&
    Math.abs(driving({ speed: TOP }).engine.gain - ENGINE_GAIN_FULL) < 1e-9)

// You are standing in a garage choosing a car, not sitting in one.
chk('the engine is off while the picker is open',
    driving({ speed: 0, running: false }).engine.gain === 0)

// ---------------------------------------------------------------------------
console.log('\n3. The siren is the light bar\n')

// One clock for both, so a police car's lights and its siren cannot drift out
// of step - which is the only thing anybody would ever notice about either.
let agreed = 0
let both = 0
for (let t = 0; t < 20; t += 0.017) {
  const beat = sirenBeat(t, SIREN_RATE)
  const note = driving({ siren: true, elapsed: t, sirenRate: SIREN_RATE }).siren.hz
  both++
  if ((note === SIREN_HIGH) === beat) agreed++
}
chk('the two notes follow the same beat the beacons flash on',
    agreed === both, `${agreed} of ${both}`)

chk('and it really is two notes',
    SIREN_HIGH > SIREN_LOW && SIREN_HIGH / SIREN_LOW < 1.5)

// A roof bar is not a callout. Police cars, ambulances and fire engines flash
// their beacons the whole time they are on the road; a siren running for the
// entire session because you picked the ambulance would be unbearable.
chk('no callout, no siren', driving({ siren: false }).siren.gain === 0)
chk('a callout sounds it', driving({ siren: true }).siren.gain > 0)

// ---------------------------------------------------------------------------
console.log('\n4. Weather, and the sea\n')

const storm = driving({ rain: 1, flake: 0, wind: 1 })
const blizzard = driving({ rain: 1, flake: 1, wind: 1 })
console.log(`   rain ${storm.rain.gain.toFixed(3)}, ` +
            `the same fall as snow ${blizzard.rain.gain.toFixed(3)}`)

// The detail that sells a winter storm: the wind is still there, the tyres are
// still there, and the hiss of rain simply is not.
chk('snow falls almost silently', blizzard.rain.gain < storm.rain.gain * 0.2)
chk('but not silently, which would read as a bug in the weather',
    blizzard.rain.gain > 0)
chk('and the ratio is the constant it says it is',
    Math.abs(blizzard.rain.gain / storm.rain.gain - SNOW_QUIET) < 1e-9)
chk('a clear sky has no rain in it', driving({ rain: 0 }).rain.gain === 0)

chk('the wind rises with the weather',
    driving({ wind: 1 }).wind.gain > driving({ wind: 0 }).wind.gain)
chk('and with speed, because that is a real noise too',
    driving({ speed: TOP }).wind.gain > driving({ speed: 0 }).wind.gain)

chk('the sea is loudest at the water',
    driving({ toShore: 0 }).sea.gain > driving({ toShore: SEA_REACH / 2 }).sea.gain)
chk('and inaudible out of earshot of it',
    driving({ toShore: SEA_REACH }).sea.gain === 0)
chk('over the water it is at full volume, which is where the piers are',
    driving({ toShore: 0 }).sea.gain > 0)

// ---------------------------------------------------------------------------
console.log('\n5. Tyres and the indicator\n')

chk('there is no tyre noise at a standstill', driving({ speed: 0 }).road.gain === 0)
chk('nor at a crawl below the threshold',
    driving({ speed: ROAD_FROM - 0.1 }).road.gain === 0)
chk('and it grows with speed',
    driving({ speed: TOP }).road.gain > driving({ speed: TOP / 2 }).road.gain)
chk('it gets brighter with speed as well as louder',
    driving({ speed: TOP }).road.cutoff > driving({ speed: 0 }).road.cutoff)
chk('reversing makes tyre noise too',
    driving({ speed: -TOP }).road.gain > 0)

chk('the tick needs both an indicator and a blink',
    driving({ indicator: 1, blink: true }).tick.on &&
    !driving({ indicator: 1, blink: false }).tick.on &&
    !driving({ indicator: 0, blink: true }).tick.on)
chk('and it works on the left as well as the right',
    driving({ indicator: -1, blink: true }).tick.on)

// ---------------------------------------------------------------------------
console.log('\n6. Nothing can hand the audio graph a NaN\n')

/**
 * One non-finite value thrown into an AudioParam takes the whole graph down
 * for the rest of the session, and it does it silently: the update aborts
 * part-built and every voice after it in the loop stays where it was. So the
 * mix is swept against everything a half-loaded game could plausibly pass it.
 */
const nonsense = [undefined, null, NaN, Infinity, -Infinity, 'fast', {}, [], -1, 1e9]
const bad = []

for (const value of nonsense) {
  for (const field of ['speed', 'topSpeed', 'volume', 'rain', 'flake', 'wind',
                       'toShore', 'elapsed', 'sirenRate', 'indicator']) {
    const m = mix({ enabled: true, running: true, [field]: value })
    for (const voice of VOICES) {
      for (const [key, n] of Object.entries(m[voice])) {
        if (typeof n === 'number' && !Number.isFinite(n)) {
          bad.push(`${field}=${String(value)} -> ${voice}.${key}`)
        }
      }
    }
    if (!Number.isFinite(m.master)) bad.push(`${field}=${String(value)} -> master`)
  }
}

console.log(`   swept ${nonsense.length} bad values across 10 fields`)
chk('every gain and frequency is finite whatever it is fed',
    bad.length === 0, bad.slice(0, 4).join(', '))

// And nothing goes negative, which a filter cutoff or a gain cannot be.
const negative = []
for (const value of nonsense) {
  const m = mix({ enabled: true, running: true, speed: value, wind: value, rain: value })
  for (const voice of VOICES) {
    for (const [key, n] of Object.entries(m[voice])) {
      if (typeof n === 'number' && n < 0) negative.push(`${voice}.${key}=${n}`)
    }
  }
}
chk('and nothing is negative', negative.length === 0, negative.slice(0, 4).join(', '))

// The levels have to stay somewhere a mixer can add them up. Six voices
// summing into one output clip long before any one of them is loud.
const loudest = driving({ speed: TOP, siren: true, rain: 1, wind: 1, toShore: 0 })
const total = VOICES.reduce((sum, v) => sum + loudest[v].gain, 0)
console.log(`   everything at once sums to ${total.toFixed(2)} before the master trim`)
chk('the whole world at once still fits inside one', total * loudest.master < 1,
    `${(total * loudest.master).toFixed(2)}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
