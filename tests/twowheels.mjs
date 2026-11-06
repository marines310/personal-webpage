/**
 * The motorcycle and the motor scooter. What these guard:
 *
 *   1. **They are in every table** a vehicle has to be in, and in none of
 *      the ones it must not be (the traffic fleet).
 *   2. **Two wheels, in line**, and the one at the front is the one that
 *      steers - Vehicle.js has to ask, not count to two.
 *   3. **The lean is a lean**: into the turn, more with speed, nothing at a
 *      standstill, nothing in reverse, nothing for anything on four wheels,
 *      and it settles without wobbling.
 *   4. **The pivot is the road**, not the middle of the bike.
 *   5. **The handling is in the right order**: scooter under the truck,
 *      motorcycle between the saloon and the racing car.
 *   6. **World.js and Vehicle.js are wired**, by reading the source, the way
 *      fireworks.mjs and wheelie.mjs do.
 */
import {
  TWO_WHEEL_KINDS, isTwoWheeler, twoWheelPositions, BIKE_WHEEL_RADIUS,
  LEAN_TUNING, newLeanState, leanTarget, stepLean, leanPose
} from '../src/world/twoWheels.js'
import {
  TRAFFIC_LENGTHS, TRAFFIC_WIDTHS, TRAFFIC_FLEET
} from '../src/world/islandLayout.js'
import { VEHICLE_MASSES, massOf } from '../src/world/impacts.js'
import { VEHICLE_MASS } from '../src/systems/Physics.js'
import { TANK_SECONDS } from '../src/world/gasGame.js'
import { VEHICLE_TUNING, tuningFor } from '../src/world/driving.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(HERE, '..', f), 'utf8')

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

// ---------------------------------------------------------------------------
console.log('1. In every table\n')

chk('there are two of them, and they are the two Mike asked for',
    TWO_WHEEL_KINDS.length === 2 && isTwoWheeler('motorcycle') && isTwoWheeler('scooter'))
chk('and a car is not one', !isTwoWheeler('sedan') && !isTwoWheeler('race') && !isTwoWheeler(undefined))

for (const kind of TWO_WHEEL_KINDS) {
  chk(`${kind.padEnd(11)} has a length and a width, so the garage lists it`,
      TRAFFIC_LENGTHS[kind] > 0 && TRAFFIC_WIDTHS[kind] > 0)
  chk(`${kind.padEnd(11)} is the narrowest kind of thing on the road`,
      TRAFFIC_WIDTHS[kind] < Math.min(...Object.entries(TRAFFIC_WIDTHS)
        .filter(([k]) => !isTwoWheeler(k)).map(([, w]) => w)))
  chk(`${kind.padEnd(11)} has a knock mass, and it is the lightest`,
      VEHICLE_MASSES[kind] > 0 && massOf(kind) < VEHICLE_MASSES.race)
  chk(`${kind.padEnd(11)} has a solver mass`, VEHICLE_MASS[kind] > 0)
  chk(`${kind.padEnd(11)} has a tank`, TANK_SECONDS[kind] > 0)
  chk(`${kind.padEnd(11)} has handling of its own`, kind in VEHICLE_TUNING)
  chk(`${kind.padEnd(11)} has a wheel size`, BIKE_WHEEL_RADIUS[kind] > 0)
  chk(`${kind.padEnd(11)} is NOT in the traffic fleet`, !(kind in TRAFFIC_FLEET))
}

// ---------------------------------------------------------------------------
console.log('\n2. Two wheels, in line\n')

for (const kind of TWO_WHEEL_KINDS) {
  const r = BIKE_WHEEL_RADIUS[kind]
  const w = twoWheelPositions(TRAFFIC_LENGTHS[kind], r)
  chk(`${kind.padEnd(11)} has exactly two`, w.length === 2)
  chk(`${kind.padEnd(11)} both on the centreline`, w.every(p => p.x === 0 && p.side === 0))
  chk(`${kind.padEnd(11)} front first, and it says so`, w[0].front === true && w[1].front === false)
  chk(`${kind.padEnd(11)} one ahead of the middle and one behind`, w[0].z > 0 && w[1].z < 0)
  chk(`${kind.padEnd(11)} standing on the ground`, w.every(p => p.y === r))
  chk(`${kind.padEnd(11)} and inside its own length`,
      Math.max(...w.map(p => Math.abs(p.z) + r)) <= TRAFFIC_LENGTHS[kind] / 2 + 1e-9,
      `${Math.max(...w.map(p => Math.abs(p.z) + r)).toFixed(2)} in ${TRAFFIC_LENGTHS[kind]}`)
}

// ---------------------------------------------------------------------------
console.log('\n3. The lean\n')

const MAX_STEER = 0.95, TOP = 23.4
const t = (steer, speed, kind = 'motorcycle') => leanTarget(kind, steer, MAX_STEER, speed, TOP)

chk('a car never leans', t(MAX_STEER, TOP, 'sedan') === 0 && t(MAX_STEER, TOP, 'race') === 0)
chk('a bike at a standstill does not lean, however hard it is steered', t(MAX_STEER, 0) === 0)
chk('nor in reverse', t(MAX_STEER, -5) === 0)
chk('nor going straight', t(0, TOP) === 0)
chk('it leans INTO the turn: a left steer is a left (positive) lean',
    t(MAX_STEER, TOP) > 0 && t(-MAX_STEER, TOP) < 0)
chk('more with speed', t(MAX_STEER, TOP * 0.1) < t(MAX_STEER, TOP * 0.3) &&
    t(MAX_STEER, TOP * 0.3) < t(MAX_STEER, TOP * 0.45))
chk('up to the kind\'s maximum, and no further',
    Math.abs(t(MAX_STEER, TOP) - LEAN_TUNING.motorcycle.max) < 1e-9 &&
    t(MAX_STEER * 3, TOP * 3) === LEAN_TUNING.motorcycle.max)
chk('and more with lock', t(MAX_STEER * 0.5, TOP) < t(MAX_STEER, TOP))
chk('a scooter leans less than a motorcycle',
    LEAN_TUNING.scooter.max < LEAN_TUNING.motorcycle.max)
chk('the full lean is well under forty degrees on both',
    Object.values(LEAN_TUNING).every(l => l.max > 0.3 && l.max < 0.7))

// Settling: step towards full lock at speed and watch it approach without
// ever passing the target.
{
  const st = newLeanState()
  let overshoot = false, last = 0
  for (let i = 0; i < 120; i++) {
    stepLean(st, 'motorcycle', MAX_STEER, MAX_STEER, TOP, TOP, 1 / 60)
    if (st.roll > LEAN_TUNING.motorcycle.max + 1e-9) overshoot = true
    if (st.roll < last - 1e-9) overshoot = true
    last = st.roll
  }
  chk('it rolls in without overshooting', !overshoot)
  chk('and is nearly all the way over within two seconds',
      st.roll > LEAN_TUNING.motorcycle.max * 0.97, `${st.roll.toFixed(3)}`)
  chk('it takes more than a frame to get there, so it is a movement',
      stepLean(newLeanState(), 'motorcycle', MAX_STEER, MAX_STEER, TOP, TOP, 1 / 60).roll <
      LEAN_TUNING.motorcycle.max * 0.5)

  // Let go of the bars: it comes back up and snaps to exactly zero.
  for (let i = 0; i < 240; i++) stepLean(st, 'motorcycle', 0, MAX_STEER, TOP, TOP, 1 / 60)
  chk('let go and it comes back upright, exactly', st.roll === 0)

  // Hand the same state to a car and it is flat at once.
  st.roll = 0.4
  stepLean(st, 'sedan', MAX_STEER, MAX_STEER, TOP, TOP, 1 / 60)
  chk('a kind that cannot lean is put flat immediately', st.roll === 0)
}

// ---------------------------------------------------------------------------
console.log('\n4. The pivot\n')

{
  const flat = leanPose(newLeanState(), 'motorcycle', 0.88)
  chk('upright, there is nothing to draw', flat.active === false)
  const car = leanPose({ roll: 0.3 }, 'sedan', 0.88)
  chk('and never anything for a car, whatever the state says', car.active === false)
  const over = leanPose({ roll: 0.3 }, 'motorcycle', 0.88)
  chk('leaning, the roll is handed back as it is', over.active && over.roll === 0.3)
  chk('about the ROAD: half the chassis height below the mesh origin',
      over.pivot.y === -0.44, `${over.pivot.y}`)
}

// ---------------------------------------------------------------------------
console.log('\n5. The handling\n')

const base = {
  maxForwardSpeed: 18, forwardAccel: 15, boostMultiplier: 1.6, maxSteerAngle: 0.7,
  highSpeedSteerReduction: 0.82, handbrakeStrength: 34, engineBrakeStrength: 21,
  rollingResistance: 5, maxReverseSpeed: 6.5, reverseAccel: 7.5
}
const bike = tuningFor('motorcycle', base)
const moped = tuningFor('scooter', base)
const truck = tuningFor('monster', base)
const f1 = tuningFor('race', base)
console.log(`   top speeds: scooter ${moped.maxForwardSpeed.toFixed(1)}, truck ${truck.maxForwardSpeed.toFixed(1)}, ` +
            `saloon ${base.maxForwardSpeed}, motorcycle ${bike.maxForwardSpeed.toFixed(1)}, race ${f1.maxForwardSpeed.toFixed(1)}`)
chk('the scooter is the slowest thing in the world, under the truck',
    moped.maxForwardSpeed < truck.maxForwardSpeed)
chk('the motorcycle is quicker than a saloon', bike.maxForwardSpeed > base.maxForwardSpeed)
chk('but the racing car is still the fastest', bike.maxForwardSpeed < f1.maxForwardSpeed)
chk('neither has a bigger boost than the saloon',
    bike.boostMultiplier <= base.boostMultiplier && moped.boostMultiplier <= base.boostMultiplier)
chk('both turn tighter than a saloon at walking pace',
    bike.maxSteerAngle > base.maxSteerAngle && moped.maxSteerAngle > base.maxSteerAngle)
chk('and the scooter tightest of all', moped.maxSteerAngle > bike.maxSteerAngle)
chk('both crawl in reverse - you paddle a bike backwards',
    bike.maxReverseSpeed < base.maxReverseSpeed * 0.6 && moped.maxReverseSpeed < base.maxReverseSpeed * 0.6)
chk('both brake worse than a saloon', bike.handbrakeStrength < base.handbrakeStrength &&
    moped.handbrakeStrength < base.handbrakeStrength)
chk('neither has the truck\'s authority in the air',
    bike.airControl < 1 && moped.airControl < 1)
chk('the scooter has the biggest tank, because a 50cc engine burns nothing',
    TANK_SECONDS.scooter === Math.max(...Object.values(TANK_SECONDS)))

// ---------------------------------------------------------------------------
console.log('\n6. Wired up\n')

const vehicle = read('src/world/Vehicle.js')
chk('Vehicle.js steps the lean and draws it after the body sync',
    /stepLean\(this\.lean,/.test(vehicle) && /this\.applyLean\(delta\)/.test(vehicle))
chk('about the pivot, with the same p - R.p shift as the wheelie',
    /_leanShift\.copy\(this\._leanPivot\)/.test(vehicle) && /\.negate\(\)/.test(vehicle))
chk('with the sign cashed in once: -pose.roll about +Z',
    /LEAN_AXIS = new THREE\.Vector3\(0, 0, 1\)/.test(vehicle) &&
    /setFromAxisAngle\(LEAN_AXIS, -pose\.roll\)/.test(vehicle))
chk('and it steers the wheels that SAY they are at the front',
    /const steers = front !== undefined \? front : i < 2/.test(vehicle))
chk('the lean is reset when the kind changes', (vehicle.match(/this\.lean = newLeanState\(\)/g) || []).length >= 3)

const world = read('src/world/World.js')
chk('World.js builds both', /case 'motorcycle': return this\.buildMotorcycle\(v\)/.test(world) &&
    /case 'scooter': return this\.buildScooter\(v\)/.test(world))
chk('from two inline wheels with the shared wheel code',
    /opts\.inline\s*\?\s*twoWheelPositions\(/.test(world) &&
    (world.match(/\{ inline: true/g) || []).length === 2)
chk('with the wheel sizes from the one table',
    (world.match(/BIKE_WHEEL_RADIUS\[v\.kind\]/g) || []).length === 2)
chk('the fork and bars hang off the FRONT wheel\'s pivot, so they steer',
    (world.match(/const frontPivot = wheels\[0\]\.pivot/g) || []).length === 2 &&
    (world.match(/frontPivot\.add\(bars\)/g) || []).length === 2)
chk('each has somebody riding it', (world.match(/this\.addRider\(group, \{/g) || []).length === 2)
chk('and a height for the lamps and the garage preview',
    /motorcycle: 1\.65/.test(world) && /scooter: 1\.7/.test(world))
chk('a single headlamp, not a car\'s pair', /opts\.style === 'bike'/.test(world))

const selector = read('src/ui/VehicleSelector.js')
chk('and they have names', /motorcycle: 'Motorcycle'/.test(selector) && /scooter: 'Motor Scooter'/.test(selector))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
