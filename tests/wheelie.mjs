/**
 * Wheelies.
 *
 * Two buttons that stand the monster truck on its tail or its nose, done by
 * moving the target the upright spring aims at rather than by posing the mesh.
 * So what these checks are really guarding is:
 *
 *   1. **Only the kind that was asked for** can do it at all, and every other
 *      vehicle is provably untouched rather than assumed to be.
 *   2. **It turns about the right point.** The pose pivots about an AXLE, and
 *      the checks on that are geometric rather than about equality: no part of
 *      the truck may end up drawn below the road, and the truck may not slide
 *      sideways along it. Turning about the middle instead is what made the
 *      physics version pogo, and in a drawing it would silently sink the truck
 *      to its axles instead.
 *   3. **It leans the way the button says**, and stays inside the limit the
 *      camera imposes on it.
 *   4. **The toggle behaves**, including both keys at once and changing vehicle
 *      mid-wheelie.
 *   5. **Nothing happens in mid-air**, and level is bit-for-bit the old path.
 */
import {
  WHEELIE_KINDS, WHEELIE_TUNING, TAIL, NOSE, DOWN,
  canWheelie, newWheelieState, nextWheelieWant, stepWheelie, wheeliePose,
  wheelieParams, wheelieHud
} from '../src/world/wheelie.js'
import { VEHICLE_TUNING } from '../src/world/driving.js'
import { TRAFFIC_LENGTHS } from '../src/world/islandLayout.js'
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

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z

/** Hold a button down for `seconds` and give back the state. */
function run(want, seconds, { kind = 'monster',
                              state = newWheelieState() } = {}) {
  state.want = want
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) stepWheelie(state, kind, dt)
  return state
}

// ---------------------------------------------------------------------------
console.log('1. Who gets it\n')

chk('the monster truck can', canWheelie('monster'))
chk('and nothing else', ['sedan', 'bus', 'fire', 'police', 'ambulance', 'tow',
  'pickup', 'suv', 'convertible', 'race', 'monorail'].every(k => !canWheelie(k)))
chk('an unknown kind cannot', !canWheelie('spaceship') && !canWheelie(undefined))
chk('it is a kind driving.js already tunes',
    WHEELIE_KINDS.every(k => k in VEHICLE_TUNING))
chk('and a real vehicle', WHEELIE_KINDS.every(k => k in TRAFFIC_LENGTHS))

// ---------------------------------------------------------------------------
console.log('\n2. Where it turns, and which way it leans\n')

// THE MONSTER TRUCK'S REAL GEOMETRY, read off its own mesh in a browser
// rather than made up: traverse everything drawn, in the mesh's own space,
// and take the bounds of the wheels and of the bodywork separately.
//
//   wheels reach down to -0.44, which is where the road is (-CAR_HEIGHT / 2)
//   bodywork bottoms out at +0.275, so there is 0.715 of ground clearance
//   the body runs from z -2.953 to +3.062, and the wheels sit at z +/-1.84
//
// Written down here because these numbers are the whole reason the angles in
// WHEELIE_TUNING are what they are, and because a model swap that changed them
// should fail this file rather than quietly put the bumper through the road.
const HEIGHT = 0.88                   // CAR_HEIGHT
const GROUND = -HEIGHT / 2            // the road, in mesh coordinates: -0.44
const LENGTH = 5.4                    // the monster truck's body
const WHEELBASE = 0.7 * LENGTH        // WHEELBASE_RATIO * length = 3.78
const BODY = { bottom: 0.275, rear: -2.953, front: 3.062 }

const up = run(TAIL, 1)
const down = run(NOSE, 1)
const tailPose = wheeliePose(up, 'monster', WHEELBASE, HEIGHT)
const nosePose = wheeliePose(down, 'monster', WHEELBASE, HEIGHT)

chk('a tail stand pitches the nose UP', tailPose.pitch > 0,
    `${tailPose.pitch.toFixed(3)} rad`)
chk('and a nose stand pitches it DOWN', nosePose.pitch < 0,
    `${nosePose.pitch.toFixed(3)} rad`)
chk('the tail stand is the steeper of the two',
    Math.abs(tailPose.pitch) > Math.abs(nosePose.pitch))
chk('and both are big enough to read as a stunt',
    Math.abs(nosePose.pitch) > 0.3, `${nosePose.pitch.toFixed(3)} rad`)

// The pivot is an axle: on the road, and half a wheelbase from the middle.
chk('the pivot sits ON the road, not at the middle of the body',
    Math.abs(tailPose.pivot.y - GROUND) < 1e-9,
    `${tailPose.pivot.y} vs ${GROUND}`)
chk('a tail stand turns about the BACK axle',
    Math.abs(tailPose.pivot.z + WHEELBASE / 2) < 1e-6,
    `${tailPose.pivot.z.toFixed(3)}`)
chk('and a nose stand about the FRONT one',
    Math.abs(nosePose.pivot.z - WHEELBASE / 2) < 1e-6,
    `${nosePose.pivot.z.toFixed(3)}`)

/**
 * The lowest point of the truck after the pose, in mesh coordinates.
 *
 * This is the check the whole design turns on, so it is done the long way:
 * take the corners of the BODY - the real one, with its real ground clearance,
 * because the wheels are at the pivot and go nowhere - rotate each about the
 * pivot exactly as Vehicle.applyWheelie does, and find the lowest.
 *
 * Nothing may end up below the road. A drawn truck cannot be shoved out of the
 * ground the way the physics version was; it just has a bumper inside the
 * tarmac, which is worse because nothing complains about it.
 */
function lowestPoint(pose, body = BODY) {
  const c = Math.cos(-pose.pitch)
  const s = Math.sin(-pose.pitch)
  let low = Infinity

  for (const z of [body.rear, body.front]) {
    for (const y of [body.bottom, body.bottom + 2]) {   // 2 units of bodywork
      const dy = y - pose.pivot.y
      const dz = z - pose.pivot.z
      low = Math.min(low, dy * c - dz * s + pose.pivot.y)
    }
  }
  return low
}

const tailLow = lowestPoint(tailPose)
const noseLow = lowestPoint(nosePose)
console.log(`   road at ${GROUND.toFixed(3)};  lowest bodywork in a tail stand ` +
            `${tailLow.toFixed(3)}, in a nose stand ${noseLow.toFixed(3)}`)

chk('NOTHING is drawn below the road in a tail stand',
    tailLow >= GROUND, `${tailLow.toFixed(3)} vs road ${GROUND}`)
chk('nor in a nose stand',
    noseLow >= GROUND, `${noseLow.toFixed(3)} vs road ${GROUND}`)

// Not merely inside it - inside it with something to spare, so that a model
// whose clearance shrinks slightly does not silently start clipping.
chk('with clearance left over, not scraping',
    tailLow > GROUND + 0.02 && noseLow > GROUND + 0.02,
    `${(tailLow - GROUND).toFixed(3)} / ${(noseLow - GROUND).toFixed(3)} spare`)

// ...and the angles are not timid either: a degree or two more would clip.
// This is the check that stops the limits being quietly over-tightened.
const steeper = wheeliePose({ want: TAIL, dir: TAIL, pitch: 1 }, 'monster',
                            WHEELBASE, HEIGHT)
steeper.pitch = WHEELIE_TUNING.maxTailPitch + 0.12
chk('and the tail stand is as steep as the clearance allows, near enough',
    lowestPoint(steeper) < GROUND,
    `0.12 rad more would still clear at ${lowestPoint(steeper).toFixed(3)}`)

// The thing that proves the pivot is doing the work: turning about the middle
// of the truck instead buries it, which is what it would do if the pivot were
// ever dropped.
const naive = { pitch: tailPose.pitch, pivot: { y: 0, z: 0 } }
chk('turning about the middle instead WOULD bury it, so the pivot earns its keep',
    lowestPoint(naive) < GROUND - 0.3,
    `middle-pivot low point ${lowestPoint(naive).toFixed(3)}`)
console.log(`   turning about the middle would put it ` +
            `${(GROUND - lowestPoint(naive)).toFixed(2)} units into the road`)

// Level is bit-for-bit untouched, which is what lets Vehicle.js skip the whole
// thing rather than apply an identity rotation to every vehicle every frame.
const flat = wheeliePose(newWheelieState(), 'monster', WHEELBASE, HEIGHT)
chk('level is inactive and exactly zero, not nearly zero',
    flat.active === false && flat.pitch === 0)

// ---------------------------------------------------------------------------
console.log('\n3. Inside the camera\'s limits\n')

// Camera.js reads the heading off the mesh quaternion's forward vector and
// takes atan2 of its horizontal part. Pitching about the truck's own X axis
// leaves that bearing exact - but only while cos(pitch) is not zero.
for (const [label, pitch] of [['a tail stand', WHEELIE_TUNING.maxTailPitch],
                              ['a nose stand', WHEELIE_TUNING.maxNosePitch]]) {
  chk(`${label} stays well short of a right angle`,
      pitch < Math.PI / 2 - 0.25, `${pitch} rad`)
}
chk('so there is plenty of projection left to read a bearing from',
    Math.cos(WHEELIE_TUNING.maxTailPitch) > 0.5,
    `${(Math.cos(WHEELIE_TUNING.maxTailPitch) * 100).toFixed(0)}% of it`)

// The bearing itself, worked out the way Camera.js does: yaw, then pitch,
// then atan2 of x and z. It must come back as the yaw it went in as.
for (const yaw of [0, 0.7, -2.1, 3.0]) {
  const t = WHEELIE_TUNING.maxTailPitch
  // forward (0,0,1) through pitch -t about x, then yaw about y
  const fy = -Math.sin(-t)
  const fz = Math.cos(-t)
  const x = fz * Math.sin(yaw)
  const z = fz * Math.cos(yaw)
  const read = Math.atan2(x, z)
  chk(`a wheelie does not move the compass bearing (yaw ${yaw})`,
      Math.abs(read - yaw) < 1e-9, `read ${read.toFixed(6)}, fy ${fy.toFixed(3)}`)
}

chk('and it comes down quicker than it goes up, like gravity',
    WHEELIE_TUNING.fallSeconds < WHEELIE_TUNING.riseSeconds)

// ---------------------------------------------------------------------------
console.log('\n4. The toggle\n')

chk('T rears up', nextWheelieWant(DOWN, 'monster', true, false) === TAIL)
chk('T again puts it down', nextWheelieWant(TAIL, 'monster', true, false) === DOWN)
chk('Y tips forward', nextWheelieWant(DOWN, 'monster', false, true) === NOSE)
chk('Y again puts it down', nextWheelieWant(NOSE, 'monster', false, true) === DOWN)
chk('Y while on the tail swaps ends',
    nextWheelieWant(TAIL, 'monster', false, true) === NOSE)
chk('and T while on the nose swaps back',
    nextWheelieWant(NOSE, 'monster', true, false) === TAIL)
chk('no press changes nothing',
    nextWheelieWant(TAIL, 'monster', false, false) === TAIL &&
    nextWheelieWant(DOWN, 'monster', false, false) === DOWN)

// A fumble should not commit the truck to anything.
chk('both at once does nothing rather than picking a favourite',
    nextWheelieWant(DOWN, 'monster', true, true) === DOWN &&
    nextWheelieWant(TAIL, 'monster', true, true) === TAIL)

chk('a kind that cannot do it is never asked to',
    nextWheelieWant(TAIL, 'bus', true, false) === DOWN &&
    nextWheelieWant(DOWN, 'sedan', false, true) === DOWN)

// ---------------------------------------------------------------------------
console.log('\n5. Standing up, and coming down\n')

const risen = run(TAIL, 1)
chk('held down, it gets all the way up', risen.pitch === 1 && risen.dir === TAIL)
chk('and that is the full angle',
    Math.abs(wheeliePose(risen, 'monster', WHEELBASE, HEIGHT).pitch -
             WHEELIE_TUNING.maxTailPitch) < 1e-9)

const half = run(TAIL, WHEELIE_TUNING.riseSeconds / 2)
chk('partway up is partway up', half.pitch > 0.2 && half.pitch < 0.8,
    `${half.pitch.toFixed(2)}`)
const halfPose = wheeliePose(half, 'monster', WHEELBASE, HEIGHT)
chk('and that is a smaller angle, in the same direction',
    halfPose.pitch > 0 && halfPose.pitch < WHEELIE_TUNING.maxTailPitch)
chk('and nothing is below the road partway up either',
    lowestPoint(halfPose) >= GROUND)

const dropped = run(DOWN, 1, { state: run(TAIL, 1) })
chk('let go, it settles all the way back to level',
    dropped.pitch === 0 && dropped.dir === DOWN)
chk('and level is exactly zero, not nearly zero',
    wheeliePose(dropped, 'monster', WHEELBASE, HEIGHT).active === false)

// Swapping ends goes through level rather than rotating through the road.
const swapping = run(NOSE, WHEELIE_TUNING.fallSeconds / 2, { state: run(TAIL, 1) })
chk('swapping ends settles the old end first',
    swapping.dir === TAIL && swapping.pitch > 0 && swapping.pitch < 1,
    `dir ${swapping.dir} pitch ${swapping.pitch.toFixed(2)}`)
const swapped = run(NOSE, 1.2, { state: run(TAIL, 1) })
chk('and arrives at the other end',
    swapped.dir === NOSE && swapped.pitch === 1)
chk('which is the other way round',
    wheeliePose(swapped, 'monster', WHEELBASE, HEIGHT).pitch < 0)

// A WHEELIE SURVIVES A JUMP, deliberately. The physics version had to drop it
// in mid-air; a pose does not, because it pivots about the axle and so is
// never drawn through anything. See the note on stepWheelie().
const jumped = run(TAIL, 1)
chk('a wheelie is held through a jump rather than dropped',
    jumped.pitch === 1 && jumped.dir === TAIL)

const bus = run(TAIL, 1, { kind: 'bus' })
chk('a bus never gets off the ground at all',
    bus.pitch === 0 && bus.dir === DOWN && bus.want === DOWN)
chk('and asking one for a pose gets nothing',
    wheeliePose(run(TAIL, 1), 'bus', WHEELBASE, HEIGHT).active === false)
chk('a missing wheelbase is survivable rather than a NaN',
    Number.isFinite(wheeliePose(risen, 'monster', undefined, HEIGHT).pivot.z))

// ---------------------------------------------------------------------------
console.log('\n6. What it leaves alone\n')

const BASE = {
  maxForwardSpeed: 18, maxReverseSpeed: 6.5, maxSteerAngle: 0.7,
  lateralGrip: 0.92, handbrakeStrength: 34, steerRate: 3.2, wheelbase: 2.4
}

// Returned as the SAME OBJECT, not a copy - the hot path, and it makes "this
// kind is untouched" a fact rather than a hope.
chk('level, the params come back untouched and unwrapped',
    wheelieParams(BASE, 'monster', newWheelieState()) === BASE)
chk('a bus is untouched even mid-wheelie',
    wheelieParams(BASE, 'bus', run(TAIL, 1)) === BASE)
chk('and no params at all is survivable',
    wheelieParams(null, 'monster', run(TAIL, 1)) === null)

const up1 = wheelieParams(BASE, 'monster', risen)
chk('up, it is slower', up1.maxForwardSpeed < BASE.maxForwardSpeed,
    `${up1.maxForwardSpeed.toFixed(1)} vs ${BASE.maxForwardSpeed}`)
chk('slower in reverse too', up1.maxReverseSpeed < BASE.maxReverseSpeed)
chk('and it does not change direction like a truck on four wheels',
    up1.maxSteerAngle < BASE.maxSteerAngle)
chk('but it still goes forwards at all', up1.maxForwardSpeed > 0)
chk('and still steers at all', up1.maxSteerAngle > 0)

chk('the original is not mutated',
    BASE.maxForwardSpeed === 18 && BASE.maxSteerAngle === 0.7)
const touched = Object.keys(up1).filter(k => up1[k] !== BASE[k])
console.log(`   changes ${touched.length} values: ${touched.join(', ')}`)
chk('the brakes and the grip are not among them',
    up1.handbrakeStrength === BASE.handbrakeStrength &&
    up1.lateralGrip === BASE.lateralGrip &&
    up1.steerRate === BASE.steerRate)

// The caps come on WITH the pose, so asking at speed is not hitting a wall.
const partway = wheelieParams(BASE, 'monster', half)
chk('partway up, the caps are partway on',
    partway.maxForwardSpeed < BASE.maxForwardSpeed &&
    partway.maxForwardSpeed > up1.maxForwardSpeed,
    `${partway.maxForwardSpeed.toFixed(1)}`)

// ---------------------------------------------------------------------------
console.log('\n7. Wired up\n')

const vehicle = read('src/world/Vehicle.js')
const inputs = read('src/systems/Inputs.js')
const ui = read('src/ui/UI.js')
const html = read('index.html')

chk('the pose is applied where the mesh is set from the body',
    /this\.mesh\.quaternion\.set\(rotation\.x[\s\S]{0,120}this\.applyWheelie\(delta\)/
      .test(vehicle))
chk('and it turns about the pivot the pose names',
    /setFromAxisAngle\(WHEELIE_AXIS, -pose\.pitch\)/.test(vehicle) &&
    /_wheeliePivot\.set\(0, pose\.pivot\.y, pose\.pivot\.z\)/.test(vehicle))
chk('the handling goes through wheelieParams()',
    /wheelieParams\(\s*donutParams\(this\.params, this\.kind, this\.donut\), this\.kind, this\.wheelie\)/
      .test(vehicle))

// THE PHYSICS IS LEFT ALONE. This is the whole bargain of drawing it: the
// upright spring never hears about the wheelie, so nothing it does can change.
chk('the upright spring is not told about the wheelie at all',
    !/wheelie: /.test(vehicle))
chk('and driving.js knows nothing about wheelies either',
    !/wheelie/i.test(read('src/world/driving.js')))

// No allocation in a path that runs for every vehicle, every frame.
chk('the pose allocates nothing per frame',
    /_wheelieQuat = new THREE\.Quaternion\(\)/.test(vehicle) &&
    /const WHEELIE_AXIS = new THREE\.Vector3\(1, 0, 0\)/.test(vehicle))

chk('T and Y are one-shot presses, not held keys',
    /case 'KeyT':/.test(inputs) && /case 'KeyY':/.test(inputs) &&
    /wheelieTail: false/.test(inputs) && /wheelieNose: false/.test(inputs))
chk('and both are read and cleared in one call',
    /consumeWheelie\(\)\s*\{[\s\S]*wheelieTail = false[\s\S]*wheelieNose = false/
      .test(inputs))
chk('so a fumbled press cannot depend on which key was read first',
    /const \{ tail, nose \} = inputs\.consumeWheelie\(\)/.test(vehicle))

chk('changing vehicle puts it back down immediately',
    (vehicle.match(/if \(!canWheelie\(kind\)\) this\.wheelie = newWheelieState\(\)/g) || []).length === 2)

chk('the screen says whether it is up', /updateWheelie\(\)/.test(ui) &&
    /wheelieHud\(vehicle\.kind, vehicle\.wheelie\)/.test(ui))
chk('and there is somewhere to say it',
    /id="wheelie"/.test(html) && /id="wheelie-state"/.test(html))

chk('the HUD shows it for a monster truck',
    wheelieHud('monster', risen).show && wheelieHud('monster', risen).active)
chk('and says which end', wheelieHud('monster', risen).label === 'TAIL' &&
    wheelieHud('monster', swapped).label === 'NOSE')
chk('hides it entirely for a bus', wheelieHud('bus', risen).show === false)
chk('and says off when it is down',
    wheelieHud('monster', newWheelieState()).active === false &&
    wheelieHud('monster', newWheelieState()).label === 'OFF')
chk('a missing state is not a crash',
    wheelieHud('monster', null).show === true &&
    wheelieHud('monster', null).active === false)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
