/**
 * Driving the monorail, without a browser.
 *
 * `tests/monorail.mjs` covers the LINE - where the beam goes, where the piers
 * stand, whether the timetable keeps three trains apart. This file covers the
 * one being driven.
 *
 * The thing it is really for is the question no amount of reading the code
 * answers: IS THE STOP ACTUALLY MAKEABLE? A station game whose target cannot
 * be hit with the controls provided is not a hard game, it is a broken one -
 * and the only way to know is to drive it. Section 3 puts a driver in the cab,
 * gives it the same W and S the player has, and sees where it stops.
 */
import {
  newMonorailState, stepMonorail, monorailHud, driveSpeed, alignment,
  loopDelta, nearestStation,
  SERVICE_BRAKE, MAX_REVERSE,
  PERFECT, GOOD, USABLE, ALIGHT_SECONDS
} from '../src/world/monorailGame.js'
import {
  getMonorailRoute, makeMonorailTrains, stepMonorailTrains,
  MONORAIL_SPEED, MONORAIL_CARS, MONORAIL_CAR_LENGTH,
  MONORAIL_PLATFORM_LENGTH, MONORAIL_TRAINS,
  TRAFFIC_LENGTHS, TRAFFIC_WIDTHS, TRAFFIC_FLEET
} from '../src/world/islandLayout.js'
import { VEHICLE_MASS } from '../src/systems/Physics.js'

let pass = 0, fail = 0
const chk = (what, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${what}`) } else {
    fail++
    console.log(`  FAIL  ${what}${detail ? '  ' + detail : ''}`)
  }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

const dt = 1 / 30
const RAKE = MONORAIL_CARS * MONORAIL_CAR_LENGTH
const route = getMonorailRoute()
const P = MONORAIL_PLATFORM_LENGTH

// ---------------------------------------------------------------------------
console.log('\n1. Taking over a train that is already on the line\n')

chk('there is a route with stations on it',
    !!route && route.stations.length >= 3, `${route && route.stations.length}`)

{
  const trains = makeMonorailTrains(route)
  chk(`the line runs ${MONORAIL_TRAINS} trains`, trains.length === MONORAIL_TRAINS)

  // MIKE WAS EXPLICIT: "We will not create another train for this game, we'll
  // be spawning into an existing train." So driving is a flag on one of the
  // three, and the count must not change when it is set.
  trains[1].driven = true
  const held = trains[1].distance
  for (let i = 0; i < 900; i++) stepMonorailTrains(route, trains, dt)

  chk('taking one over does not add a fourth', trains.length === MONORAIL_TRAINS)
  chk('and the timetable stops moving the one being driven',
      trains[1].distance === held, `moved ${(trains[1].distance - held).toFixed(2)}`)
  chk('while the other two carry on to their own schedule',
      trains[0].stops > 0 && trains[2].stops > 0,
      `${trains[0].stops} and ${trains[2].stops} stops`)
  chk('the driven train is still told what is in front of it',
      trains[1].gapAhead !== undefined, `${trains[1].gapAhead}`)
}

{
  chk('a train is longer than a platform, so stopping is centring',
      RAKE > P, `${RAKE} against ${P}`)

  // THE TRAP THIS FLEET HAS FALLEN INTO ONCE. GARAGE_DEPTH is a max over
  // TRAFFIC_LENGTHS, so a 33-unit entry here would grow the player's garage by
  // twenty-two units, which moves the plot it stands on and the town around
  // it. The monster truck did exactly that at 100mm too wide.
  chk('the monorail is listed at one car, not a whole train',
      TRAFFIC_LENGTHS.monorail <= TRAFFIC_LENGTHS.bus,
      `${TRAFFIC_LENGTHS.monorail} against the bus's ${TRAFFIC_LENGTHS.bus}`)
  chk('and no wider than the widest thing already here',
      TRAFFIC_WIDTHS.monorail <= TRAFFIC_WIDTHS.bus)
  chk('it has a mass like everything else', VEHICLE_MASS.monorail > 0)
  chk('but the city never drives one', !TRAFFIC_FLEET.monorail)
}

// ---------------------------------------------------------------------------
console.log('\n2. The controls\n')

{
  chk('W accelerates', driveSpeed(0, 1, dt, {}) > 0)
  chk('and it takes a while - a train is not a car',
      driveSpeed(0, 1, 1, {}) < MONORAIL_SPEED, `${driveSpeed(0, 1, 1, {})}`)
  chk('S brakes a train that is moving', driveSpeed(10, -1, dt, {}) < 10)

  // The one that would be a derailment: S must not throw a moving train into
  // reverse, it must stop it first.
  let v = 20
  let flipped = false
  for (let i = 0; i < 200; i++) {
    const before = v
    v = driveSpeed(v, -1, dt, {})
    if (v < 0 && before > 2) flipped = true
  }
  chk('S never flips a moving train straight into reverse', !flipped)
  chk('but it does shunt backwards from a stand', v < 0, `${v.toFixed(1)}`)
  chk('and shunting is slow', Math.abs(v) <= MAX_REVERSE + 1e-9, `${v}`)

  // COASTING IS THE GAME. Let go and the train keeps rolling, so the braking
  // point has to be judged rather than reacted to. A train that stopped dead
  // when you released W would make the alignment trivial.
  const coasted = driveSpeed(20, 0, 1, {})
  chk('letting go coasts rather than stopping',
      coasted > 20 - SERVICE_BRAKE && coasted < 20, `${coasted.toFixed(1)}`)
  chk('and it does eventually come to rest', driveSpeed(0.02, 0, dt, {}) === 0)

  chk('a red signal stops the train whatever the driver is asking for',
      driveSpeed(20, 1, dt, { blocked: true }) < 20)
  chk('and so does standing at a platform with the doors open',
      driveSpeed(5, 1, dt, { held: true }) < 5)
  chk('the brake under a signal cannot push it backwards',
      driveSpeed(0.1, 1, dt, { blocked: true }) === 0)
}

// ---------------------------------------------------------------------------
console.log('\n3. Can the stop actually be made?\n')

{
  // A DRIVER, with the same two keys the player has. It brakes when what is
  // left is what it would take to stop - which is what a real driver does and,
  // crucially, is something a person can learn to eyeball. If a controller
  // this simple cannot land the train, the target is not reachable and the
  // game is broken rather than hard.
  const drive = (margin) => {
    const line = { length: 1000, stations: [{ at: 400, name: 'TEST' }] }
    const train = { distance: 0, speed: 0 }
    const state = newMonorailState()
    for (let i = 0; i < 60 * 90; i++) {
      const togo = loopDelta(train.distance, line.stations[0].at, line.length)
      const need = (train.speed * train.speed) / (2 * SERVICE_BRAKE) + margin
      const throttle = state.phase !== 'running' ? 0 : (togo > need ? 1 : -1)
      stepMonorail(state, dt, { route: line, train, throttle, gapAhead: 9999,
        rake: RAKE, platform: P })
      if (state.phase !== 'running') break
    }
    return state
  }

  const runs = [0, 0.5, 1, 1.5, 2, 3].map(drive)
  console.log('   offsets a simple driver achieved: ' +
    runs.map(r => r.offset.toFixed(2)).join(' '))
  const best = runs.reduce((a, b) => Math.abs(a.offset) < Math.abs(b.offset) ? a : b)

  chk('a driver using only W and S can stop at the platform',
      runs.every(r => r.stops === 1), 'not every run called at all')
  chk('and can get inside the "good" band',
      Math.abs(best.offset) <= GOOD, `best ${best.offset.toFixed(2)}`)
  chk('perfect is reachable', Math.abs(best.offset) <= PERFECT,
      `best ${best.offset.toFixed(2)} against ${PERFECT}`)
  chk('but not every approach is perfect - it is a skill',
      runs.some(r => Math.abs(r.offset) > PERFECT))
  chk('the grades run tightest first', PERFECT < GOOD && GOOD < USABLE)
}

// ---------------------------------------------------------------------------
console.log('\n4. The station sequence\n')

{
  const line = { length: 1000, stations: [{ at: 200, name: 'ONE' }] }
  const train = { distance: 200, speed: 0 }
  const state = newMonorailState()
  // Seeded with the phase BEFORE the first step. Recording only after each
  // step misses the starting state entirely, and this train begins stopped at
  // the platform so it leaves 'running' on step one.
  const seen = [state.phase]

  for (let i = 0; i < 60 * 30; i++) {
    // The signal is at danger for the first few seconds, so the wait is a real
    // wait rather than a formality.
    const gap = i < 60 * 4 ? 10 : 9999
    stepMonorail(state, dt, { route: line, train, throttle: 0, gapAhead: gap,
      rake: RAKE, platform: P })
    if (seen[seen.length - 1] !== state.phase) seen.push(state.phase)
    if (state.phase === 'ready') break
  }

  chk('stopping at a platform runs doors, passengers, then a hold',
      seen.join(' > ') === 'running > doors > alighting > held > ready',
      seen.join(' > '))
  chk('and it counts the call', state.stops === 1)

  // The signal is a fact about the LINE, not a timer with a lamp on it.
  const stuck = newMonorailState()
  const t2 = { distance: 200, speed: 0 }
  for (let i = 0; i < 60 * 30; i++) {
    stepMonorail(stuck, dt, { route: line, train: t2, throttle: 1, gapAhead: 10,
      rake: RAKE, platform: P })
  }
  chk('a train in front holds you at the platform however long it takes',
      stuck.phase === 'held' && stuck.signal === 'red', stuck.phase)
  chk('and you cannot creep out under a red',
      Math.abs(t2.speed) < 1e-6 &&
      Math.abs(loopDelta(200, t2.distance, line.length)) < 0.5,
      `moved ${loopDelta(200, t2.distance, line.length).toFixed(2)}`)

  for (let i = 0; i < 60 * 5; i++) {
    stepMonorail(stuck, dt, { route: line, train: t2, throttle: 0, gapAhead: 9999,
      rake: RAKE, platform: P })
  }
  chk('and once the line is clear it says right away',
      stuck.phase === 'ready' && stuck.signal === 'green', stuck.phase)

  const before = stuck.stops
  for (let i = 0; i < 60 * 3; i++) {
    stepMonorail(stuck, dt, { route: line, train: t2, throttle: 0, gapAhead: 9999,
      rake: RAKE, platform: P })
  }
  chk('standing at a platform does not score it twice', stuck.stops === before)
}

{
  // Rolling THROUGH a station is not calling at it.
  const line = { length: 1000, stations: [{ at: 200, name: 'ONE' }] }
  const train = { distance: 100, speed: 20 }
  const state = newMonorailState()
  for (let i = 0; i < 60 * 10; i++) {
    stepMonorail(state, dt, { route: line, train, throttle: 1, gapAhead: 9999,
      rake: RAKE, platform: P })
  }
  chk('a train that runs through a platform has not called there',
      state.stops === 0, `${state.stops}`)
}

// ---------------------------------------------------------------------------
console.log('\n5. The two bars\n')

{
  const dead = alignment(0, P, RAKE)
  chk('dead centre scores 1 and reads perfect',
      near(dead.at, 0) && dead.score === 1 && dead.grade === 'perfect')
  chk('a train at the end of the platform sits at the end of the bar',
      near(alignment(P / 2, P, RAKE).at, 1))
  chk('the train bar is wider than the platform bar, because it is',
      dead.span > 1, `${dead.span.toFixed(2)}`)
  chk('overshooting and undershooting are mirror images',
      near(alignment(3, P, RAKE).at, -alignment(-3, P, RAKE).at) &&
      alignment(3, P, RAKE).grade === alignment(-3, P, RAKE).grade)
  chk('a long way off, the bar clamps rather than flying off screen',
      Math.abs(alignment(500, P, RAKE).at) <= 1.4)
  chk('and scores nothing', alignment(500, P, RAKE).score === 0)
  chk('the grades run perfect, good, poor, short as you get worse',
      alignment(PERFECT - 0.1, P, RAKE).grade === 'perfect' &&
      alignment(GOOD - 0.1, P, RAKE).grade === 'good' &&
      alignment(USABLE - 0.1, P, RAKE).grade === 'poor' &&
      alignment(USABLE + 1, P, RAKE).grade === 'short')
}

{
  const state = newMonorailState()
  state.offset = 0.4
  state.phase = 'alighting'
  state.alighting = ALIGHT_SECONDS / 2
  state.signal = 'red'
  const hud = monorailHud(state, { rake: RAKE, platform: P })
  chk('the panel says which platform, how aligned, and what the signal is',
      hud.showAlign && hud.grade === 'perfect' && hud.signal === 'red')

  // Green while people are still getting off is NOT permission to leave.
  state.signal = 'green'
  chk('a green signal mid-alighting is not "right away"',
      !monorailHud(state, { rake: RAKE, platform: P }).clear)
  state.phase = 'ready'
  chk('but it is once the doors are shut',
      monorailHud(state, { rake: RAKE, platform: P }).clear)
}

// ---------------------------------------------------------------------------
console.log('\n6. Going round the loop\n')

{
  // loopDelta is the whole reason the game can tell "a metre short" from "a
  // lap and a metre short".
  chk('a metre short is a metre, not a lap', near(loopDelta(99, 100, 1000), 1))
  chk('and a metre PAST is minus a metre', near(loopDelta(101, 100, 1000), -1))
  chk('the shortest way round the back of the loop is backwards',
      near(loopDelta(5, 995, 1000), -10))

  const found = nearestStation(route, route.stations[2].at + 3)
  chk('the nearest platform is the one you are next to',
      found.station.id === route.stations[2].id, found.station.id)
  chk('and the offset is signed, so overshoot reads as overshoot',
      found.offset > 0, `${found.offset.toFixed(2)}`)
  chk('no route, no station', nearestStation(null, 0) === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
