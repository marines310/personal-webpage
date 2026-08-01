/**
 * Headlights, tail lights and indicators.
 *
 * THE BUG THIS SUITE EXISTS FOR
 * -----------------------------
 * There were two lighting systems. The traffic registered its headlights with
 * the world's night-emissive list; the player's car had its own materials and
 * its own updateLights(). They already disagreed - the player's answered to
 * weather and the traffic's only to nightfall - and then `setKind()` started
 * rebuilding the player's mesh from the traffic builder, and the player's
 * Vehicle went on driving `this.headlightMaterial`: the SEDAN's material,
 * from before the swap. So every vehicle out of the garage but the sedan
 * drove around unlit while the code carefully lit a mesh that was no longer
 * in the scene.
 *
 * Sections 5 and 6 are the ones that would have caught it: one lamp builder,
 * and lamps read off the mesh rather than held in a field.
 */
import {
  LAMP_ROLES, BLINK_HZ, SIGNAL_HOLD, STEER_TO_INDICATE, INDICATE_HOLD,
  STALK_CANCEL_TURN, SIGNAL_TURN,
  blinkOn, gloomLevel, headlightLevel, lampBrightness,
  steerIndicator, resolveIndicator, stalkCancels, turnDirection, turnAmount
} from '../src/world/vehicleLights.js'
import {
  getLaneNetwork, makeTraffic, stepTraffic, pointAlong,
  TRAFFIC_FLEET, getBusStops
} from '../src/world/islandLayout.js'
import { Inputs } from '../src/systems/Inputs.js'
import { readFileSync } from 'fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)

// ---------------------------------------------------------------------------
console.log('1. When the lights come on\n')

chk('broad daylight is no gloom at all',
    gloomLevel({ nightFactor: 0, current: { cloud: 0.06, rain: 0 } }) < 0.1)
chk('and the lamps are off there',
    headlightLevel(gloomLevel({ nightFactor: 0, current: { cloud: 0.06, rain: 0 } })) === 0)

chk('night turns them on',
    headlightLevel(gloomLevel({ nightFactor: 1, current: { cloud: 0, rain: 0 } })) === 1)

// The traffic's headlights used to answer to nightfall ALONE, so a storm at
// two in the afternoon left every car on the road dark while the player's
// were on. One number for both is most of the point of the shared module.
const storm = gloomLevel({ nightFactor: 0, current: { cloud: 1, rain: 1 } })
console.log(`   a storm at noon reads as gloom ${storm.toFixed(2)}`)
chk('a storm at noon lights them too', headlightLevel(storm) > 0.5, `${storm}`)
chk('and a bright breezy day does not',
    headlightLevel(gloomLevel({ nightFactor: 0, current: { cloud: 0.22, rain: 0 } })) === 0)

chk('the ramp is monotonic, so they fade up rather than snap', (() => {
  let last = -1
  for (let g = 0; g <= 1.0001; g += 0.02) {
    const v = headlightLevel(g)
    if (v < last - 1e-9) return false
    last = v
  }
  return true
})())

// ---------------------------------------------------------------------------
console.log('\n2. What each lamp does')

const day = lampBrightness({ gloom: 0 })
const night = lampBrightness({ gloom: 1 })
chk('headlights are dark by day and lit at night', day.head === 0 && night.head > 1)
chk('tail lights follow them', day.tail === 0 && night.tail > 0)

// A brake light is bright in full sun; a tail light at night is a dim red
// presence. Sharing a lamp does not mean sharing a level, and the brake has
// to WIN rather than add to whatever the headlights happen to be doing.
const brakingByDay = lampBrightness({ gloom: 0, braking: true })
chk('braking in daylight lights the tail lamps fully',
    brakingByDay.tail > night.tail * 2, `${brakingByDay.tail} vs ${night.tail}`)
chk('and braking at night is no brighter than braking by day',
    lampBrightness({ gloom: 1, braking: true }).tail === brakingByDay.tail)
chk('a stopped vehicle holds its brake lights on',
    lampBrightness({ gloom: 0, stopped: true }).tail === brakingByDay.tail)

chk('indicators are off when not indicating',
    lampBrightness({ indicate: 0, blink: true }).left === 0 &&
    lampBrightness({ indicate: 0, blink: true }).right === 0)
chk('the left one lights on the left, and only the left',
    (() => { const l = lampBrightness({ indicate: -1, blink: true })
             return l.left > 0 && l.right === 0 })())
chk('and the right one on the right',
    (() => { const r = lampBrightness({ indicate: 1, blink: true })
             return r.right > 0 && r.left === 0 })())
chk('both go dark on the off half of the blink',
    (() => { const b = lampBrightness({ indicate: -1, blink: false })
             return b.left === 0 && b.right === 0 })())
chk('indicators do not care whether it is dark',
    lampBrightness({ gloom: 0, indicate: 1, blink: true }).right ===
    lampBrightness({ gloom: 1, indicate: 1, blink: true }).right)

chk('every role the builder makes is one this function sets',
    LAMP_ROLES.every(r => r in lampBrightness({})),
    LAMP_ROLES.filter(r => !(r in lampBrightness({}))).join(','))

// ---------------------------------------------------------------------------
console.log('\n3. The blink')

let changes = 0
for (let t = 0; t < 10; t += 1 / 240) {
  if (blinkOn(t, 0) !== blinkOn(t + 1 / 240, 0)) changes++
}
// A FLASH is on-and-off again: two changes. Counting changes as flashes is
// how you get an indicator that measures at twice the rate it looks.
const flashesPerMinute = (changes / 2) / 10 * 60
console.log(`   ${changes} changes in ten seconds = ${flashesPerMinute} flashes a minute`)
chk('it flashes at roughly the legal rate (60-120 a minute)',
    flashesPerMinute >= 55 && flashesPerMinute <= 125, `${flashesPerMinute}`)
chk('it is on for about half the time', (() => {
  let on = 0, n = 0
  for (let t = 0; t < 20; t += 1 / 240) { if (blinkOn(t)) on++; n++ }
  return Math.abs(on / n - 0.5) < 0.02
})())

// Every vehicle carries its own offset, or a queue at a red blinks in unison
// and reads as one mechanism rather than a hundred cars.
chk('a phase offset actually shifts the cycle',
    (() => {
      for (let t = 0; t < 3; t += 0.01) {
        if (blinkOn(t, 0) !== blinkOn(t, 0.35)) return true
      }
      return false
    })())

// ---------------------------------------------------------------------------
console.log('\n4. The player: steering, and the stalk')

const drive = (state, steering, seconds) => {
  let side = 0
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    side = steerIndicator(state, steering, 1 / 60)
  }
  return side
}

let st = { side: 0, held: 0 }
chk('holding a lane between the lines does not set it flickering',
    drive(st, STEER_TO_INDICATE * 0.6, 2) === 0)

st = { side: 0, held: 0 }
chk('a real turn does', drive(st, 1, 0.2) === -1)     // +steering is LEFT
chk('and the other way', drive({ side: 0, held: 0 }, -1, 0.2) === 1)

// Without a hold the lamps stutter through every corner, because you unwind
// the wheel on the way out of a bend and the steering passes back through
// centre while you are still turning.
st = { side: 0, held: 0 }
drive(st, 1, 0.5)
chk(`it holds briefly after you straighten (${INDICATE_HOLD}s)`,
    drive(st, 0, INDICATE_HOLD * 0.5) === -1)
chk('and then goes out', drive(st, 0, INDICATE_HOLD) === 0)

chk('a latched stalk beats the steering', resolveIndicator(1, -1) === 1)
chk('and with no stalk the steering has it', resolveIndicator(0, -1) === -1)

// A real stalk is knocked off by the wheel coming back through centre AFTER
// the turn, not by the turn starting - cancelling on the first straight
// moment would switch it off between the two halves of a lane change.
chk('the stalk survives the start of the turn', !stalkCancels(1, 0.2))
chk('and a lane change, which straightens in the middle', !stalkCancels(1, 0.05))
chk(`it cancels once actually round (${(STALK_CANCEL_TURN * 57.3).toFixed(0)} deg)`,
    stalkCancels(1, STALK_CANCEL_TURN + 0.01))
chk('turning the OTHER way never cancels it',
    !stalkCancels(1, -2.0) && !stalkCancels(-1, 2.0))
chk('and with no stalk there is nothing to cancel', !stalkCancels(0, 3))

// ---------------------------------------------------------------------------
console.log('\n5. Which way a vehicle is turning')

// Headings are atan2(x, z): north is 0, east is +PI/2, so turning right
// increases the heading. Everything downstream depends on that sign.
// Measured in the running game rather than reasoned from a compass: the
// car's nose is +Z, so its RIGHT is -X, and turning right DECREASES
// atan2(x, z). Written the compass way round first, and every AI indicator
// was on the wrong side.
chk('heading increasing is a turn to the LEFT', turnDirection(0, Math.PI / 2) === -1)
chk('and heading decreasing is a turn to the right', turnDirection(0, -Math.PI / 2) === 1)
chk('turnAmount converts a heading change into the indicator\'s sign',
    turnAmount(0.5) < 0 && turnAmount(-0.5) > 0)
chk('straight on is neither', turnDirection(0.3, 0.3) === 0)
chk('a slight kink in the road is not a turn',
    turnDirection(0, SIGNAL_TURN * 0.8) === 0)
chk('but a proper corner is', turnDirection(0, SIGNAL_TURN * 1.2) === -1)
// A real wrap: 2.9 rad to -2.9 rad is a 0.48 rad turn to the RIGHT across
// the +/-PI seam, not a 5.8 rad swing to the left.
chk('it wraps across the seam rather than going the long way round',
    turnDirection(2.9, -2.9) === -1, `${turnDirection(2.9, -2.9)}`)

// ---------------------------------------------------------------------------
console.log('\n6. The traffic signals turns it actually takes')

// The real question: does a lit indicator ever disagree with what the vehicle
// then does? Signalling BEFORE the junction was built first and abandoned -
// see the note on SIGNAL_HOLD - precisely because the version that could
// disagree was the version that cost a red light.
const network = getLaneNetwork()
const fleet = makeTraffic(network, TRAFFIC_FLEET, getBusStops())
const seen = { signalled: 0, turns: 0, wrongWay: 0, stuckOn: 0 }
const lastLane = new Map()
const wasHeading = new Map()

const laneEndHeading = (index) =>
  pointAlong(network.lanes[index], network.lanes[index].length).heading

for (const v of fleet) {
  lastLane.set(v, v.lane)
  wasHeading.set(v, laneEndHeading(v.lane))
}

for (let i = 0; i < 60 * 90; i++) {
  stepTraffic(network, fleet, 1 / 60, i / 60)

  for (const v of fleet) {
    if (v.signal !== 0 && v.signal !== 1 && v.signal !== -1) seen.stuckOn++
    if (v.lane === lastLane.get(v)) continue

    // It changed lane this frame. If it signalled, the sign has to match the
    // direction it actually went.
    //
    // Measured from the END of the old lane, which is where the junction is -
    // NOT from wherever the vehicle happened to be on it. Measuring from
    // mid-lane made nine turns in three hundred look mis-signalled, and all
    // nine were curved lanes whose heading at the car was not their heading
    // at the corner. The code says "the direction change through the
    // junction"; the test has to ask the same question.
    const before = wasHeading.get(v)
    const after = pointAlong(network.lanes[v.lane], 0).heading
    const actual = turnDirection(before, after)
    if (actual !== 0) seen.turns++
    if (v.signal !== 0) {
      seen.signalled++
      if (actual !== 0 && v.signal !== actual) seen.wrongWay++
    }
    lastLane.set(v, v.lane)
  }
  for (const v of fleet) {
    wasHeading.set(v, laneEndHeading(v.lane))
  }
}

// An INDEPENDENT check of the sign, because the one below cannot give it.
//
// Comparing v.signal against turnDirection() compares the function with
// itself: flip the function and both sides flip together and it agrees
// perfectly - which is exactly what happened. Every AI indicator was on the
// wrong side and this suite passed. So the handedness is settled here with a
// cross product on the actual direction vectors, which knows nothing about
// atan2 or about which way anybody decided a heading grows.
//
// The car's nose is +Z. For forward f and up u, right is f x u; with
// f = (0,0,1) and u = (0,1,0) that is (-1, 0, 0). So a vehicle turning RIGHT
// swings its nose toward -x, and (before x after).y comes out negative.
const handed = []
for (const lane of network.lanes) {
  for (const nextIndex of lane.next) {
    const a = pointAlong(lane, lane.length).heading
    const b = pointAlong(network.lanes[nextIndex], 0).heading
    const said = turnDirection(a, b)
    if (!said) continue

    const bx = Math.sin(a), bz = Math.cos(a)
    const ax = Math.sin(b), az = Math.cos(b)
    const crossY = bz * ax - bx * az        // (before x after).y, Y-up
    const truth = crossY > 0 ? -1 : 1       // toward +x is the car's LEFT
    handed.push(said === truth)
  }
}
const wrongHand = handed.filter(ok => !ok).length
console.log(`   ${handed.length} junction turns checked against the geometry, ` +
            `${wrongHand} on the wrong side`)
chk('there are real turns in the network to check', handed.length > 30, `${handed.length}`)
chk('and every one indicates the side it actually goes', wrongHand === 0, `${wrongHand}`)

console.log(`   ${seen.turns} turns taken, ${seen.signalled} of them signalled, ` +
            `${seen.wrongWay} signalled the wrong way`)
chk('the traffic does turn corners', seen.turns > 20, `${seen.turns}`)
chk('turns get an indicator', seen.signalled > 0, `${seen.signalled}`)
chk('and NOT ONE of them indicated the wrong way', seen.wrongWay === 0,
    `${seen.wrongWay}`)
chk('the signal is always -1, 0 or +1', seen.stuckOn === 0, `${seen.stuckOn}`)

// It has to go out again, or every car in the city drives round permanently
// indicating.
const lit = fleet.filter(v => v.signal !== 0).length
console.log(`   ${lit} of ${fleet.length} indicating at the end of the run`)
chk('most of the fleet is not indicating at any given moment',
    lit < fleet.length * 0.5, `${lit}/${fleet.length}`)
chk(`the lamp is held for ${SIGNAL_HOLD}s, long enough to see`,
    SIGNAL_HOLD >= 0.8 && SIGNAL_HOLD <= 3)

// ---------------------------------------------------------------------------
console.log('\n7. One lamp builder, and one thing writing each material')

const world = readFileSync(ROOT + 'src/world/World.js', 'utf8')

const builders = ['buildCar', 'buildPickup', 'buildSUV', 'buildPoliceCar',
                  'buildAmbulance', 'buildFireEngine', 'buildBus']
const lamped = (world.match(/this\.addVehicleLamps\(/g) || []).length
console.log(`   ${builders.length} vehicle builders, ${lamped} calls to the lamp builder`)
chk('every kind of vehicle gets lamps from the one builder',
    lamped === builders.length, `${lamped} vs ${builders.length}`)
chk('and there is no second lamp builder left behind',
    !/addLampsAndTail/.test(world))

// Two headlights and two tail lights on every vehicle, and four indicators.
// Built in a `for (const side of [1, -1])` loop, so the count follows from
// the loop rather than from someone remembering to write the second one.
chk('lamps are built per side, so there are always two of each',
    /addVehicleLamps[\s\S]{0,2400}for \(const side of \[1, -1\]\)/.test(world))
chk('and indicators at both ends of each side, which is four',
    /for \(const z of \[nose, tailZ\]\)/.test(world))

// The trap: leaving the headlights on the night-emissive list AND driving
// them from lampBrightness means two systems writing one emissiveIntensity,
// with whichever ran last winning. Only shows up at dusk.
// Checked as "is not CALLED", not "is not mentioned" - the note explaining
// why it was removed contains the name, and a test that forbids the word
// forbids the explanation with it.
chk('vehicle lamps are not also on the night-emissive list',
    !/^\s*this\.registerNightLight\(head/m.test(world))
chk('the traffic drives its lamps from the shared function',
    /lampBrightness\(\{/.test(world) && /gloomLevel\(this\.game\.environment\)/.test(world))
chk('the lamps are handed back on the mesh, not to the caller',
    /group\.userData\.lights = \{ head, tail, left, right \}/.test(world))
chk('the wheels are too, with pivots so they can be steered',
    /group\.userData\.wheels = wheels/.test(world))

// ---------------------------------------------------------------------------
console.log('\n8. The player is one of the cars on the road')

const vehicle = readFileSync(ROOT + 'src/world/Vehicle.js', 'utf8')

chk('the player reads its lamps off the mesh each frame',
    /this\.mesh && this\.mesh\.userData\.lights/.test(vehicle))
chk('and holds no stale reference to the last vehicle\'s',
    !/^\s*this\.headlightMaterial\s*=/m.test(vehicle) &&
    !/^\s*this\.taillightMaterial\s*=/m.test(vehicle))
chk('it uses the shared brightness function', /lampBrightness\(\{/.test(vehicle))
chk('a traffic-built body is offset to the chassis centre',
    /inner\.position\.y = -CAR_HEIGHT \/ 2/.test(vehicle))
chk('and its own wheels are used rather than four more added on top',
    /this\.mesh\.userData\.wheels/.test(vehicle))
chk('every vehicle the player drives gets a beam, not just the sedan',
    /this\.addBeam\(group\)/.test(vehicle))
chk('the signed speed still drives the reverse camera', /getSignedSpeed/.test(vehicle))

// ---------------------------------------------------------------------------
console.log('\n9. The indicator keys')

const resolve = (code) => Inputs.prototype.resolveKey.call(null, code)
chk('comma indicates left', resolve('Comma') === 'indicateLeft')
chk('and full stop right', resolve('Period') === 'indicateRight')

const DRIVING = ['forward', 'backward', 'left', 'right', 'boost', 'brake']
chk('neither is a driving control',
    !DRIVING.includes(resolve('Comma')) && !DRIVING.includes(resolve('Period')))

// Both at once has to resolve to nothing, rather than to whichever of two
// lines happens to be read first.
const stub = { pulses: { indicateLeft: true, indicateRight: true } }
chk('pressing both at once does nothing',
    Inputs.prototype.consumeIndicator.call(stub) === 0)
chk('and reading clears them', stub.pulses.indicateLeft === false)

const onlyLeft = { pulses: { indicateLeft: true, indicateRight: false } }
chk('one at a time works', Inputs.prototype.consumeIndicator.call(onlyLeft) === -1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
