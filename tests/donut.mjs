/**
 * Donut mode.
 *
 * A switch on the race car and the monster truck that lets the back end go.
 * All of it is multipliers on the handling the kind already has, so what
 * these checks are really guarding is that it changes what it should and
 * nothing else:
 *
 *   1. **Only the two kinds that were asked for** can do it at all.
 *   2. **It breaks traction** - that is the point, and it is one number.
 *   3. **It tightens the arc** rather than making the car faster.
 *   4. **Everything else is untouched**, including every vehicle that cannot
 *      donut, which must be provably unaffected rather than assumed to be.
 *   5. **The toggle behaves**, including when you change vehicle.
 */
import {
  DONUT_KINDS, DONUT_TUNING, canDonut, donutParams, nextDonutState, donutHud
} from '../src/world/donut.js'
import { VEHICLE_TUNING, tuningFor } from '../src/world/driving.js'
import { TRAFFIC_LENGTHS } from '../src/world/islandLayout.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const HERE = dirname(fileURLToPath(import.meta.url))

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

// The real baseline, near enough: the numbers donutParams() multiplies.
const BASE = {
  maxForwardSpeed: 18,
  maxSteerAngle: 0.7,
  highSpeedSteerReduction: 0.82,
  lateralGrip: 0.92,
  wheelbase: 2.4,
  corneringDrag: 0.5,
  steerRate: 3,
  handbrakeStrength: 34
}

// ---------------------------------------------------------------------------
console.log('1. Who gets it\n')

chk('the race car can', canDonut('race'))
chk('the monster truck can', canDonut('monster'))
chk('and nothing else', ['sedan', 'bus', 'fire', 'police', 'ambulance',
  'tow', 'pickup', 'suv', 'convertible', 'monorail'].every(k => !canDonut(k)))
chk('an unknown kind cannot', !canDonut('spaceship') && !canDonut(undefined))

// The two kinds that have it are the two that have their own handling in
// driving.js. If a third ever gets tuning, this is the reminder to decide
// rather than to discover.
chk('both donut kinds are kinds driving.js already tunes',
    DONUT_KINDS.every(k => k in VEHICLE_TUNING),
    DONUT_KINDS.filter(k => !(k in VEHICLE_TUNING)).join(' '))
chk('and both are real vehicles',
    DONUT_KINDS.every(k => k in TRAFFIC_LENGTHS))

// ---------------------------------------------------------------------------
console.log('\n2. What it changes\n')

const off = donutParams(BASE, 'race', false)
const on = donutParams(BASE, 'race', true)

// THE ONE THAT MATTERS. Vehicle.js keeps (1 - lateralGrip)^delta of the
// sideways velocity each frame: high grip tracks the nose, low grip slides.
chk('it breaks traction', on.lateralGrip < BASE.lateralGrip * 0.5,
    `${on.lateralGrip.toFixed(3)} from ${BASE.lateralGrip}`)

// How much sideways speed survives, measured over a SECOND rather than over
// a frame.
//
// Per frame the two look almost identical - 0.959 against 0.997 - and a first
// version of this check failed for that reason and looked like a tuning
// problem. It is not: the decay is `(1 - grip) ^ delta`, so a sixtieth-second
// exponent squashes everything towards 1 and the per-frame figure says
// nothing useful. Compounded over a second it is 8% against 82%, which is the
// difference you can feel through a corner.
const keptNormally = Math.pow(1 - BASE.lateralGrip, 1)
const keptInDonut = Math.pow(1 - on.lateralGrip, 1)
console.log(`   sideways velocity surviving one second: ` +
            `${(keptNormally * 100).toFixed(0)}% normally, ` +
            `${(keptInDonut * 100).toFixed(0)}% in a donut`)
chk('and the slide survives long enough to hold an arc',
    keptInDonut > keptNormally * 5,
    `${keptInDonut.toFixed(3)} vs ${keptNormally.toFixed(3)}`)

chk('it pivots tighter', on.wheelbase < BASE.wheelbase)
chk('it keeps more lock at speed',
    on.highSpeedSteerReduction < BASE.highSpeedSteerReduction)
chk('and more lock to begin with', on.maxSteerAngle > BASE.maxSteerAngle)

// A donut is not a drag race. Left at full speed the car describes a circle
// the size of the island, which is a lap rather than a donut.
chk('it does NOT make the car faster', on.maxForwardSpeed < BASE.maxForwardSpeed,
    `${on.maxForwardSpeed} vs ${BASE.maxForwardSpeed}`)

// The steering angle goes through tan() in the bicycle model, so a lock at or
// past a right angle sends the yaw rate to infinity and the car snaps round.
chk('the steering lock stays well short of a right angle',
    on.maxSteerAngle < Math.PI / 2 - 0.1,
    `${on.maxSteerAngle.toFixed(3)} rad`)
chk('and it stays a positive wheelbase, not a negative one',
    on.wheelbase > 0)

// ---------------------------------------------------------------------------
console.log('\n3. What it leaves alone\n')

// Returned as the SAME OBJECT, not a copy: it is called every frame for every
// vehicle, and it makes "this kind is untouched" a fact rather than a hope.
chk('off, the params come back untouched and unwrapped', off === BASE)
chk('a bus is untouched even with it switched on',
    donutParams(BASE, 'bus', true) === BASE)
chk('and so is the monorail', donutParams(BASE, 'monorail', true) === BASE)

chk('on, the original is not mutated',
    BASE.lateralGrip === 0.92 && BASE.wheelbase === 2.4)

const touched = Object.keys(on).filter(k => on[k] !== BASE[k])
console.log(`   changes ${touched.length} values: ${touched.join(', ')}`)
chk('it changes only what DONUT_TUNING lists',
    touched.every(k => k in DONUT_TUNING), touched.join(' '))
chk('and the brakes and the steering speed are not among them',
    on.handbrakeStrength === BASE.handbrakeStrength &&
    on.steerRate === BASE.steerRate)

// Multipliers, not replacements - so retuning the race car in driving.js
// retunes its donuts too, rather than silently keeping an old absolute.
const raceParams = tuningFor('race', BASE)
const raceDonut = donutParams(raceParams, 'race', true)
chk('it multiplies the kind\'s own handling, not the baseline',
    Math.abs(raceDonut.lateralGrip -
             raceParams.lateralGrip * DONUT_TUNING.lateralGrip) < 1e-12)
chk('so a faster car still donuts faster than a slower one',
    donutParams(tuningFor('race', BASE), 'race', true).maxForwardSpeed >
    donutParams(tuningFor('monster', BASE), 'monster', true).maxForwardSpeed)

// Nonsense in, something sane out: this runs every frame and a throw here is
// a black screen.
chk('no params at all is survivable', donutParams(null, 'race', true) === null)

// ---------------------------------------------------------------------------
console.log('\n4. The toggle\n')

chk('a press turns it on', nextDonutState(false, 'race', true) === true)
chk('another press turns it off', nextDonutState(true, 'race', true) === false)
chk('no press leaves it alone',
    nextDonutState(true, 'race', false) === true &&
    nextDonutState(false, 'race', false) === false)

// You should never get into a bus and find the handling mysteriously wrong.
chk('a kind that cannot donut can never be in donut mode',
    nextDonutState(true, 'bus', false) === false &&
    nextDonutState(true, 'bus', true) === false)

// ---------------------------------------------------------------------------
console.log('\n5. Wired up\n')

const vehicle = readFileSync(join(HERE, '..', 'src/world/Vehicle.js'), 'utf8')
const inputs = readFileSync(join(HERE, '..', 'src/systems/Inputs.js'), 'utf8')
const ui = readFileSync(join(HERE, '..', 'src/ui/UI.js'), 'utf8')
const html = readFileSync(join(HERE, '..', 'index.html'), 'utf8')

// Wrapped by wheelieParams() since the wheelies went in, so this no longer
// matches a whole line - but what it is checking is unchanged and is still
// exact: the params the frame drives with pass through donutParams(), with
// this kind and this vehicle's switch, on their way to being driven with.
chk('the handling the frame drives with goes through donutParams()',
    /const p = wheelieParams\(\s*donutParams\(this\.params, this\.kind, this\.donut\),/
      .test(vehicle))

// One-shot, read once per frame in the same place as the indicator stalk.
// Read anywhere else and a press is either missed or counted twice.
chk('G is a one-shot press, not a held key',
    /case 'KeyG':/.test(inputs) && /donut: false/.test(inputs) &&
    /consumeDonut\(\)/.test(inputs))
chk('and it is consumed once per frame',
    /this\.donut = nextDonutState\(this\.donut, this\.kind, inputs\.consumeDonut\(\)\)/
      .test(vehicle))

// Changing vehicle clears it on the swap rather than on the next press, so
// the handling never lies for even one frame.
chk('changing vehicle clears it immediately',
    /if \(!canDonut\(kind\)\) this\.donut = false/.test(vehicle))

chk('the screen says whether it is on', /updateDonut\(\)/.test(ui) &&
    /donutHud\(vehicle\.kind, vehicle\.donut\)/.test(ui))
chk('and there is somewhere to say it', /id="donut"/.test(html) &&
    /id="donut-state"/.test(html))

const hud = donutHud('race', true)
chk('the HUD shows it for a race car', hud.show && hud.active)
chk('hides it entirely for a bus', donutHud('bus', true).show === false)
chk('and says off when it is off', donutHud('monster', false).active === false)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
