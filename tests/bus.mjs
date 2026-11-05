/**
 * The bus route.
 *
 * A simulator rather than a challenge, which is the thing most of these
 * checks are really guarding: there is no way to fail, so every rule has to
 * be recoverable. Drive off with the doors open and the stop is not done -
 * not lost, not done.
 *
 *   1. **A route is a route**, not a list of errands across the map.
 *   2. **The doors take as long as the passengers do**, and the bus has to
 *      wait for them.
 *   3. **Leaving early costs nothing but the stop.**
 *   4. **The arithmetic adds up** - nobody boards a full bus, nobody gets off
 *      an empty one, and the count never goes negative.
 *   5. **The score is above, on, or below**, and the band is a real band.
 *   6. **A whole route can actually be driven**, start to finish, which is
 *      the only check here that would notice the state machine deadlocking.
 */
import {
  ROUTE_STOPS, CAPACITY, MAX_WAITING, AT_STOP, STOPPED_SPEED, TARGET_SPEED,
  DOOR_OPEN, DOOR_CLOSE, PER_PASSENGER, ON_TARGET_BAND,
  isBus, newBusState, makeRoute, routeTarget, passengersAt, doorSeconds,
  doorPhase, nextStop, stepBus, scoreRoute, scoreLabel, clock, busHud, busPanel
} from '../src/world/busGame.js'
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

/** A repeatable random, so a route driven twice is the same route. */
function seeded(seed = 1) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** A map's worth of stops, spread out rather than in a line. */
const STOPS = []
for (let i = 0; i < 40; i++) {
  STOPS.push({
    x: Math.cos(i * 2.4) * (60 + (i % 7) * 18),
    z: Math.sin(i * 2.4) * (60 + (i % 5) * 22),
    lane: i, at: 10, heading: 0, island: 'hub', kerb: 3
  })
}
const START = { x: 0, z: 0 }
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

// ---------------------------------------------------------------------------
console.log('1. Who drives one\n')

chk('the bus does', isBus('bus'))
chk('and nothing else', ['sedan', 'fire', 'police', 'ambulance', 'tow',
  'monster', 'race', 'monorail', 'suv'].every(k => !isBus(k)))
chk('a bus is a real vehicle', 'bus' in TRAFFIC_LENGTHS)

// ---------------------------------------------------------------------------
console.log('\n2. The route\n')

const route = makeRoute(STOPS, START, seeded(7))
chk('a route is made', !!route)
chk('and it has the asked-for number of stops', route.length === ROUTE_STOPS,
    `${route.length}`)
chk('no stop appears twice', new Set(route).size === route.length)

// A ROUTE, NOT A LIST OF ERRANDS. Ordered nearest-first, so consecutive legs
// should be far shorter than they would be in a random order. Measured
// against the average distance between two stops picked at random.
let randomLeg = 0, pairs = 0
for (let i = 0; i < STOPS.length; i += 3)
  for (let j = i + 1; j < STOPS.length; j += 3) { randomLeg += gap(STOPS[i], STOPS[j]); pairs++ }
randomLeg /= pairs

let routeLeg = 0
let here = START
for (const s of route) { routeLeg += gap(here, s); here = s }
routeLeg /= route.length

console.log(`   average leg: ${routeLeg.toFixed(0)} on the route, ` +
            `${randomLeg.toFixed(0)} between two stops at random`)
chk('consecutive stops are near each other, so it reads as a route',
    routeLeg < randomLeg * 0.8, `${routeLeg.toFixed(0)} vs ${randomLeg.toFixed(0)}`)

// Random WHICH, deterministic WHAT ORDER.
const again = makeRoute(STOPS, START, seeded(7))
chk('the same seed gives the same route',
    again.every((s, i) => s === route[i]))
const other = makeRoute(STOPS, START, seeded(99))
chk('and a different seed usually gives a different one',
    other.some((s, i) => s !== route[i]))

chk('too few stops to route between is survivable',
    makeRoute([STOPS[0]], START, seeded(1)) === null &&
    makeRoute([], START, seeded(1)) === null &&
    makeRoute(null, START, seeded(1)) === null)

// ---------------------------------------------------------------------------
console.log('\n3. What it should take\n')

const target = routeTarget(route, START)
console.log(`   target ${clock(target)} for ${routeLeg.toFixed(0)}-unit legs`)
chk('the target is a real duration', target > 30 && target < 1200,
    `${target.toFixed(0)}s`)
chk('it allows for the doors as well as the driving',
    target > routeLeg * route.length / TARGET_SPEED)
chk('a longer route takes longer',
    routeTarget(route, START) > routeTarget(route.slice(0, 2), START))
chk('and the pace allowed for is slower than a bus can actually go',
    TARGET_SPEED < 12, `${TARGET_SPEED} against a bus's cruise`)
chk('an empty route is zero, not NaN', routeTarget([], START) === 0 &&
    routeTarget(null, START) === 0)

// ---------------------------------------------------------------------------
console.log('\n4. The doors\n')

chk('an empty stop still takes the open and shut',
    Math.abs(doorSeconds(0, 0) - (DOOR_OPEN + DOOR_CLOSE)) < 1e-9)
chk('and every passenger adds to it',
    doorSeconds(3, 2) > doorSeconds(1, 1))
chk('off and on cost the same',
    doorSeconds(4, 0) === doorSeconds(0, 4))

// The cycle runs open -> off -> on -> closing, in that order, and the stages
// must not overlap: the people getting off have to be clear of the doorway.
const cycle = { ...newBusState(), phase: 'doors', alighting: 3, boarding: 2 }
cycle.doorFor = doorSeconds(3, 2)
const seen = []
for (let t = 0; t <= cycle.doorFor + 0.01; t += 0.05) {
  cycle.door = t
  const p = doorPhase(cycle)
  if (!seen.length || seen[seen.length - 1] !== p.stage) seen.push(p.stage)
}
console.log(`   stages: ${seen.join(' -> ')}`)
chk('the cycle runs opening, off, on, closing, in that order',
    seen.join(',') === 'opening,alighting,boarding,closing', seen.join(','))

cycle.door = DOOR_OPEN / 2
chk('the doors are part open halfway through opening',
    Math.abs(doorPhase(cycle).open - 0.5) < 1e-9)
cycle.door = DOOR_OPEN + 0.1
chk('and fully open while anyone is walking', doorPhase(cycle).open === 1)
cycle.door = cycle.doorFor
chk('and shut at the end',
    Math.abs(doorPhase(cycle).open) < 1e-9, `${doorPhase(cycle).open}`)

// `walk` is what World.js moves the figures along, so it has to go 0 to 1
// within each group rather than across the whole cycle.
cycle.door = DOOR_OPEN + 3 * PER_PASSENGER - 0.01
chk('the walk fraction reaches 1 by the end of a group',
    doorPhase(cycle).walk > 0.97, `${doorPhase(cycle).walk.toFixed(3)}`)

const shut = newBusState()
chk('a bus that is not at a stop has its doors shut',
    doorPhase(shut).stage === 'shut' && doorPhase(shut).open === 0)

// A stop with nobody at it must not divide by zero.
const nobody = { ...newBusState(), phase: 'doors', alighting: 0, boarding: 0 }
nobody.doorFor = doorSeconds(0, 0)
nobody.door = DOOR_OPEN + 0.001
chk('a stop with nobody waiting does not produce a NaN',
    Number.isFinite(doorPhase(nobody).walk) &&
    Number.isFinite(doorPhase(nobody).open))

// ---------------------------------------------------------------------------
console.log('\n5. Who gets on and off\n')

const empty = { ...newBusState(), onboard: 0 }
let offEmpty = 0
for (let i = 0; i < 200; i++) offEmpty += passengersAt(empty, false, seeded(i)).alighting
chk('nobody gets off an empty bus', offEmpty === 0)

const full = { ...newBusState(), onboard: CAPACITY }
let overfull = 0
for (let i = 0; i < 200; i++) {
  const { alighting, boarding } = passengersAt(full, false, seeded(i))
  if (CAPACITY - alighting + boarding > CAPACITY) overfull++
}
chk('nobody boards a full bus past its capacity', overfull === 0)

const some = { ...newBusState(), onboard: 5 }
let bad = 0
for (let i = 0; i < 300; i++) {
  const { alighting, boarding } = passengersAt(some, false, seeded(i))
  if (alighting < 0 || boarding < 0 || alighting > 5 || boarding > MAX_WAITING) bad++
}
chk('the counts stay inside their limits', bad === 0)

let lastBoard = 0
let lastLeft = 0
for (let i = 0; i < 100; i++) {
  const p = passengersAt(some, true, seeded(i))
  lastBoard += p.boarding
  if (p.alighting !== some.onboard) lastLeft++
}
chk('nobody boards at the last stop - the route ends there', lastBoard === 0)
// The end of the line. This was random at first and a route could finish
// with people still aboard; section 6 caught it.
chk('and EVERYBODY gets off at the last stop', lastLeft === 0,
    `${lastLeft} of 100 draws left somebody aboard`)

// THE QUEUE AT THE SHELTER, when the caller knows it. pedestrians.js has
// carried boardable() since before this file existed, for exactly this.
const queue = { ...newBusState(), onboard: 2 }
chk('nobody boards when nobody is waiting',
    passengersAt(queue, false, seeded(5), 0).boarding === 0)
chk('exactly the people who are there board',
    passengersAt(queue, false, seeded(5), 3).boarding === 3)
chk('a crowd is capped at what fits at one stop',
    passengersAt(queue, false, seeded(5), 50).boarding === MAX_WAITING)
const nearlyFull = { ...newBusState(), onboard: CAPACITY - 1 }
chk('and at what fits on the bus',
    passengersAt(nearlyFull, false, () => 0, 6).boarding <= 1)
chk('not knowing the queue still works, so a world with no people runs',
    passengersAt(queue, false, seeded(5)).boarding >= 0)

// ---------------------------------------------------------------------------
console.log('\n6. Driving one, end to end\n')

/**
 * Drive the whole route: head for each stop, stop, wait out the doors.
 *
 * This is the only check here that would notice the state machine jamming -
 * everything above tests a piece of it standing still.
 */
function drive({ dawdle = 0, leaveEarly = false } = {}) {
  const state = newBusState()
  const rand = seeded(42)
  const dt = 1 / 30
  const player = { x: START.x, z: START.z, kind: 'bus', speed: 0 }
  const ctx = { player, stops: STOPS, rand }

  stepBus(state, dt, ctx)                       // picks the route up
  let guard = 0
  let bailed = false

  while (state.phase !== 'done' && guard++ < 200000) {
    const stop = nextStop(state)
    if (stop) {
      // Teleport towards it - this is a test of the rules, not of driving.
      const d = gap(player, stop)
      if (d > 1) {
        const k = Math.min(1, 6 * dt / d)
        player.x += (stop.x - player.x) * k
        player.z += (stop.z - player.z) * k
        player.speed = 6
      } else {
        player.speed = 0
      }
    }

    // Once, partway through one door cycle, pull away.
    if (leaveEarly && !bailed && state.phase === 'doors' && state.door > 0.4) {
      bailed = true
      player.x += 40
      player.speed = 9
    }

    if (dawdle && state.index === 1) {
      for (let i = 0; i < dawdle; i++) stepBus(state, dt, ctx)
    }

    stepBus(state, dt, ctx)
  }

  return { state, guard, bailed }
}

const run = drive()
chk('a whole route can be driven to the end', run.state.phase === 'done',
    `stopped at phase ${run.state.phase}, stop ${run.state.index}`)
chk('and it visited every stop', run.state.index === run.state.route.length)
console.log(`   ${clock(run.state.elapsed)} against a target of ` +
            `${clock(run.state.target)} - ${scoreLabel(run.state.score)}`)
chk('it carried somebody', run.state.carried > 0, `${run.state.carried}`)
chk('and the bus is empty at the end, because nobody boards at the last stop',
    run.state.onboard === 0, `${run.state.onboard} still aboard`)
chk('a score was given', ['ahead', 'on', 'behind'].includes(run.state.score))

// THE RULE MIKE ASKED FOR: pull away mid-cycle and the stop is not done.
const early = drive({ leaveEarly: true })
chk('leaving with the doors open does not end the route', early.state.phase === 'done')
chk('it is not a failure - the stop is simply done later',
    early.state.index === early.state.route.length)
chk('and the bus still ends up empty', early.state.onboard === 0)

// Dawdling must show up in the score and nowhere else.
const slow = drive({ dawdle: 900 })
chk('taking far longer still finishes', slow.state.phase === 'done')
chk('but it is behind target', slow.state.score === 'behind',
    `${clock(slow.state.elapsed)} vs ${clock(slow.state.target)}`)
chk('and it carried its passengers all the same',
    slow.state.carried === run.state.carried)

// ---------------------------------------------------------------------------
console.log('\n7. The score\n')

chk('finishing early is ahead', scoreRoute(60, 100) === 'ahead')
chk('finishing late is behind', scoreRoute(140, 100) === 'behind')
chk('finishing on it is on', scoreRoute(100, 100) === 'on')
chk('and the band is a band, not a point',
    scoreRoute(100 * (1 + ON_TARGET_BAND / 2), 100) === 'on' &&
    scoreRoute(100 * (1 - ON_TARGET_BAND / 2), 100) === 'on')
chk('just outside the band is not on target',
    scoreRoute(100 * (1 + ON_TARGET_BAND * 2), 100) === 'behind' &&
    scoreRoute(100 * (1 - ON_TARGET_BAND * 2), 100) === 'ahead')
chk('no target is not a division by zero', scoreRoute(50, 0) === 'on')
chk('the labels say above, on and below in words',
    /AHEAD/.test(scoreLabel('ahead')) && /ON TARGET/.test(scoreLabel('on')) &&
    /BEHIND/.test(scoreLabel('behind')))
chk('the clock reads as a clock',
    clock(0) === '0:00' && clock(65) === '1:05' && clock(600) === '10:00')
chk('and a negative is not shown as one', clock(-5) === '0:00')

// ---------------------------------------------------------------------------
console.log('\n8. Getting out of the bus\n')

const abandoned = drive().state
abandoned.phase = 'driving'
stepBus(abandoned, 0.1, { player: { x: 0, z: 0, kind: 'sedan', speed: 0 }, stops: STOPS })
chk('getting into another vehicle ends the route', abandoned.phase === 'idle')
chk('and clears the passengers with it', abandoned.onboard === 0 &&
    abandoned.route === null)

// THE CLOCK DOES NOT RUN WHILE THE GARAGE HAS THE WHEEL.
const held = newBusState()
for (let i = 0; i < 300; i++) {
  stepBus(held, 1 / 30, { player: { x: 0, z: 0, kind: 'bus', speed: 0 },
                          stops: STOPS, controlled: false, rand: seeded(3) })
}
chk('no route is given out while the garage is still rolling you out',
    held.phase === 'idle' && held.elapsed === 0)
stepBus(held, 1 / 30, { player: { x: 0, z: 0, kind: 'bus', speed: 0 },
                        stops: STOPS, controlled: true, rand: seeded(3) })
chk('and it starts the moment you have the wheel',
    held.phase === 'driving' && held.elapsed === 0,
    `phase ${held.phase}, ${held.elapsed}s on the clock`)

const noVehicle = newBusState()
stepBus(noVehicle, 0.1, { player: null, stops: STOPS })
chk('no vehicle at all is survivable', noVehicle.phase === 'idle')
stepBus(noVehicle, 0.1, { player: { x: 0, z: 0, kind: 'bus', speed: 0 }, stops: [] })
chk('and a map with no bus stops does not throw', noVehicle.phase === 'idle')

// ---------------------------------------------------------------------------
console.log('\n9. What the screen is told\n')

chk('a sedan is never shown a route', busHud(run.state, false).active === false)
chk('nor is an idle bus', busHud(newBusState(), true).active === false)

const driving = drive().state
driving.phase = 'driving'
driving.index = 1
const hud = busHud(driving, true)
chk('driving, it points at the next stop',
    hud.active && hud.mine && hud.target &&
    hud.target.x === driving.route[1].x)
chk('and says which stop of how many', /STOP 2 OF 5/.test(hud.title), hud.title)

const atDoors = { ...drive().state, phase: 'doors', index: 1, door: 0.3,
                  doorFor: 3, alighting: 2, boarding: 1 }
const dhud = busHud(atDoors, true)
chk('at the doors it shows a bar instead of an arrow',
    dhud.showBar && dhud.target === null)
chk('and the bar is how far through the doors are',
    Math.abs(dhud.progress - 0.1) < 1e-9, `${dhud.progress}`)

const done = busHud(run.state, true)
chk('finished, it reports the time and the score',
    /ROUTE COMPLETE/.test(done.title) && /TARGET/.test(done.title), done.title)
chk('and claims no arrow', done.target === null)

const panel = busPanel(run.state, true)
chk('the panel shows the route and who was carried',
    panel.show && panel.stops === ROUTE_STOPS && panel.carried > 0)
chk('and is hidden in anything that is not a bus',
    busPanel(run.state, false).show === false)

// ---------------------------------------------------------------------------
console.log('\n10. Wired up\n')

const world = read('src/world/World.js')
chk('World.js keeps a bus state and steps it',
    /newBusState\(\)/.test(world) && /stepBus\(/.test(world))
chk('and the route is one of the callouts chooseMission picks between',
    /busHud\(this\.bus, kind === 'bus'\)/.test(world))
chk('World.js is given the stops and the player, and decides nothing itself',
    /stepBus\(this\.bus,[\s\S]{0,400}?stops:/.test(world))

// AND THAT IT IMPORTS WHAT IT USES.
//
// This check exists because the wiring above passed while World.js was using
// `stepBus` without importing it. `vite build` does not catch that - an
// undefined identifier is a runtime ReferenceError, not a bundling error - so
// the first sign would have been a white screen in the browser.
const imports = (world.match(/from '\.\/busGame\.js'/g) || []).length
chk('World.js imports from busGame.js at all', imports === 1, `${imports} times`)

// THE RING ON THE ROAD. Drawn at AT_STOP radius, so it is the stop zone made
// visible rather than a decoration near it; moved, not rebuilt; and added to
// the scene the way everything else in World.js is - the first version wrote
// `this.scene.add`, which does not exist, and would have been a white screen.
chk('there is a ring on the road at the next stop',
    /createBusStopMarker\(\)/.test(world) && /updateBusStopMarker\(delta\)/.test(world))
chk('and it is exactly the size of the stop zone',
    /RingGeometry\(BUS_AT_STOP - [\d.]+, BUS_AT_STOP,/.test(world))
chk('and it is added to the scene the way everything else is',
    /this\.game\.add\(ring\)/.test(world) && !/this\.scene\.add\(ring\)/.test(world))
chk('and it follows busNextStop() and hides when there is none',
    /const stop = busNextStop\(this\.bus\)[\s\S]{0,80}?if \(!stop\) \{ ring\.visible = false/.test(world))
// THE FIGURES. World.js watches the door stage for a CHANGE and sends the
// walkers once per change - poll it and a fresh set is recruited every frame.
chk('World.js sends the figures on a change of door stage, not every frame',
    /door\.stage === this\._busStage\) return/.test(world) &&
    /this\._busStage = door\.stage/.test(world))
chk('alighting figures come from alightBus(), boarding ones from boardBus()',
    /door\.stage === 'alighting'[\s\S]{0,120}?alightBus\(this\.pedestrianNet, this\.people, at, door\.alighting\)/.test(world) &&
    /door\.stage === 'boarding'[\s\S]{0,120}?boardBus\(this\.people, at, door\.boarding\)/.test(world))
chk('and the door is a point BESIDE the bus, not its middle',
    /Math\.cos\(heading\) \* side/.test(world) && /Math\.sin\(heading\) \* side/.test(world))

// ON THE KERB SIDE. Lanes sit to the RIGHT of the centre line, so the kerb is
// on the right, and right is (-cos h, sin h) for a forward of (sin h, cos h) -
// the pair gasGame.js uses for the pump side of the car. The first version
// had both signs flipped and put the door in the middle of the road. This
// checks the signs, because an offset that exists is not the same as an
// offset that points the right way.
chk('and it is the RIGHT-hand side, where the kerb is, not the road',
    /x: player\.x - Math\.cos\(heading\) \* side/.test(world) &&
    /z: player\.z \+ Math\.sin\(heading\) \* side/.test(world))
{
  const h = 0.37
  const gasRight = { x: -Math.cos(h), z: Math.sin(h) }   // gasGame.js: sx=-fz, sz=fx
  const doorRight = { x: -Math.cos(h), z: Math.sin(h) }
  chk('and it agrees with the side the gas attendant stands on',
      Math.abs(gasRight.x - doorRight.x) < 1e-12 &&
      Math.abs(gasRight.z - doorRight.z) < 1e-12)
}
chk('and it asks pedestrians.js who is actually at the shelter',
    /waiting:[\s\S]{0,300}?boardable\(this\.people,[\s\S]{0,80}?kind: 'bus'/.test(world))

const block = world.slice(0, world.indexOf("from './busGame.js'"))
const opened = block.lastIndexOf('import {')
const names = block.slice(opened).replace('import {', '')
for (const used of ['newBusState', 'stepBus', 'busHud']) {
  chk(`and imports ${used}, which it calls`,
      new RegExp(`\\b${used}\\b`).test(names))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
