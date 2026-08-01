/**
 * The ambulance run.
 *
 * Third of the three callouts, and it arrives at the same rule the other two
 * did: THE PRESSURE MECHANIC BELONGS TO THE PLAYER. The fire's bar decays
 * only for you; only your police car can end a pursuit; and only your run to
 * hospital is against a clock.
 *
 * Each time that was found by measuring rather than by design, and section 4
 * is this one's version. Held to the player's standard, an AI crew reached
 * the scene in 38 seconds, then took until 270 to accumulate ten seconds of
 * standing within fourteen units of it - because it drives past rather than
 * parking - and then sat 102 units from the hospital while the two-minute
 * clock ran out. Every background crash would have ended in PATIENT LOST.
 */
import {
  FIRST_CRASH, CRASH_GAP_MIN, CRASH_GAP_MAX, ON_SCENE, AT_HOSPITAL,
  LOAD_SECONDS, TRANSPORT_SECONDS, MESSAGE_TIME, MIN_CRASH_DISTANCE,
  ABANDON_AFTER, CREW_LOAD_SECONDS, CREW_RUN_SECONDS,
  newAmbulanceState, stepAmbulance, whoIsResponding, chooseCrash,
  nearestHospital, ambulanceHud, crewTarget
} from '../src/world/ambulanceGame.js'
import { chooseMission } from '../src/world/missions.js'
import { fireHud, newFireState } from '../src/world/fireGame.js'
import { policeHud, newPoliceState } from '../src/world/policeGame.js'
import { readFileSync } from 'fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const SITES = [
  { x: 0, z: 0, island: 'HUB' },
  { x: 300, z: 0, island: 'ABOUT' },
  { x: 0, z: 300, island: 'PROJECTS' },
  { x: -300, z: -300, island: 'SKILLS' }
]
const HOSPITALS = [
  { x: 260, z: 20, island: 'ABOUT' },
  { x: -280, z: 40, island: 'CONTACT' }
]

const run = (state, seconds, ctx, delta = 1 / 30) => {
  for (let i = 0; i < Math.round(seconds / delta); i++) stepAmbulance(state, delta, ctx)
  return state
}

// ---------------------------------------------------------------------------
console.log('1. A crash happens, on a road you can reach\n')

const state = newAmbulanceState()
const ctx = {
  sites: SITES, hospitals: HOSPITALS,
  player: { x: 0, z: 0, isAmbulance: true },
  ambulances: [],
  rand: seeded(11)
}

run(state, FIRST_CRASH - 5, ctx)
chk('nothing has happened yet', state.phase === 'idle')
run(state, 10, ctx)
chk('then one does', state.phase === 'crash' && !!state.incident)
console.log(`   ${state.message}`)
chk('and it says where', /^CAR CRASH AT /.test(state.message || ''), `${state.message}`)

const gap = Math.hypot(state.incident.x, state.incident.z)
console.log(`   ${gap.toFixed(0)} units away`)
chk(`not on top of the player (needs ${MIN_CRASH_DISTANCE})`, gap > MIN_CRASH_DISTANCE)

chk('a world with no roads has no crash',
    chooseCrash([], { x: 0, z: 0 }, seeded(3)) === null)
chk('and one where everything is close still has one',
    !!chooseCrash([{ x: 1, z: 1, island: 'HUB' }], { x: 0, z: 0 }, seeded(3)))

chk('the nearest hospital is the nearest one',
    nearestHospital(HOSPITALS, { x: 250, z: 0 }).island === 'ABOUT')
chk('and with none there is none', nearestHospital([], { x: 0, z: 0 }) === null)

// ---------------------------------------------------------------------------
console.log('\n2. Being at the scene')

const at = { x: 100, z: 100 }
chk('an ambulance pulled up counts',
    whoIsResponding(at, { player: { x: 100 + ON_SCENE - 2, z: 100, isAmbulance: true } }).here)
chk('one down the road does not',
    !whoIsResponding(at, { player: { x: 100 + ON_SCENE + 5, z: 100, isAmbulance: true } }).here)
chk('and a car, however close, is not an ambulance',
    !whoIsResponding(at, { player: { x: 100, z: 100, isAmbulance: false } }).playerHere)
chk('the hospital is judged more loosely than the scene', AT_HOSPITAL > ON_SCENE)

// ---------------------------------------------------------------------------
console.log('\n3. Your run, end to end')

const mine = newAmbulanceState()
const mineCtx = {
  sites: SITES, hospitals: HOSPITALS,
  player: { x: 0, z: 0, isAmbulance: true },
  ambulances: [],
  rand: seeded(29)
}
run(mine, FIRST_CRASH + 2, mineCtx)
chk('a crash is waiting', mine.phase === 'crash')

// Sitting a street away does nothing.
mineCtx.player.x = mine.incident.x + ON_SCENE + 10
mineCtx.player.z = mine.incident.z
run(mine, 20, mineCtx)
chk('parking nearby is not being there', mine.phase === 'crash', mine.phase)

mineCtx.player.x = mine.incident.x
mineCtx.player.z = mine.incident.z
run(mine, 0.2, mineCtx)
chk('arriving starts the loading', mine.phase === 'loading')

run(mine, LOAD_SECONDS / 2, mineCtx)
const half = mine.incident.loaded / LOAD_SECONDS
console.log(`   half the load time fills the bar to ${(half * 100).toFixed(0)}%`)
chk('the bar fills while you are there', half > 0.45 && half < 0.55, `${half}`)

// It PAUSES rather than falling back. The fire's bar decays because holding
// position is the skill being asked for; here the skill was getting there,
// and it has already been demonstrated.
mineCtx.player.x = mine.incident.x + 400
run(mine, 10, mineCtx)
chk('nudging forward mid-load does not lose progress',
    Math.abs(mine.incident.loaded / LOAD_SECONDS - half) < 1e-9,
    `${mine.incident.loaded}`)

mineCtx.player.x = mine.incident.x
// One frame at a time up to the moment loading finishes, and read THERE.
// Running a fixed ten seconds and then reading measures a clock that has been
// counting down since the transition somewhere in the middle of them - which
// is the same mistake this suite's siblings made, twice each, and it always
// looks like the product code is wrong. A phase change is an event, not a
// state you can arrive at late and still ask when it happened.
let loadFrames = 0
while (mine.phase === 'loading' && loadFrames++ < 2000) {
  stepAmbulance(mine, 1 / 30, mineCtx)
}
chk('loading finishes', mine.phase === 'transport', mine.phase)
chk('and a hospital is chosen', !!mine.incident.hospital)
chk('the nearest one to the CRASH, not to you',
    mine.incident.hospital === nearestHospital(HOSPITALS, mine.incident))
console.log(`   ${TRANSPORT_SECONDS}s to reach ${mine.incident.hospital.island}`)
chk('with the full two minutes on the clock',
    Math.abs(mine.incident.remaining - TRANSPORT_SECONDS) < 0.1)

run(mine, 30, mineCtx)
chk('the clock runs down', mine.incident.remaining < TRANSPORT_SECONDS - 25)

mineCtx.player.x = mine.incident.hospital.x
mineCtx.player.z = mine.incident.hospital.z
run(mine, 0.5, mineCtx)
console.log(`   ${mine.message}`)
chk('reaching the hospital delivers the patient',
    mine.phase === 'over' && mine.message === 'PATIENT DELIVERED',
    `${mine.phase} / ${mine.message}`)
chk('and another crash is one to three minutes away',
    mine.timer >= CRASH_GAP_MIN && mine.timer <= CRASH_GAP_MAX, `${mine.timer}`)

// And failing it says so rather than silently resetting.
const late = newAmbulanceState()
const lateCtx = {
  sites: SITES, hospitals: HOSPITALS,
  player: { x: 0, z: 0, isAmbulance: true },
  ambulances: [], rand: seeded(31)
}
run(late, FIRST_CRASH + 2, lateCtx)
lateCtx.player.x = late.incident.x
lateCtx.player.z = late.incident.z
run(late, LOAD_SECONDS + 1, lateCtx)
chk('loaded, and running', late.phase === 'transport')
lateCtx.player.x = 9999
while (late.phase === 'transport') stepAmbulance(late, 0.25, lateCtx)
console.log(`   ${late.message}`)
chk('running out of time says so', late.message === 'PATIENT LOST', `${late.message}`)

// ---------------------------------------------------------------------------
console.log('\n4. The city\'s version, which cannot be held to yours')

// MEASURED, not assumed. Held to the player's standard an AI crew reached the
// scene in 38 seconds, took until 270 to accumulate ten seconds within
// fourteen units - it drives past rather than parking - and then sat 102
// units from the hospital while the clock ran out. Every background crash
// would have ended in PATIENT LOST.
chk('the crew is given longer to load than you are', CREW_LOAD_SECONDS > LOAD_SECONDS)
chk('and its run has no two-minute deadline at all', CREW_RUN_SECONDS < TRANSPORT_SECONDS)

const city = newAmbulanceState()
const cityCtx = {
  sites: SITES, hospitals: HOSPITALS,
  player: { x: 0, z: 0, isAmbulance: false },
  ambulances: [],
  rand: seeded(37)
}
run(city, FIRST_CRASH + 2, cityCtx)
chk('a crash still happens when you are in a car', city.phase === 'crash')

// A crew arrives once, and then drives on - which is all an AI ever does.
cityCtx.ambulances = [{ x: city.incident.x, z: city.incident.z }]
run(city, 1, cityCtx)
chk('a crew arriving starts the loading', city.phase === 'loading')
chk('and that arrival is remembered', city.incident.attended === true)

cityCtx.ambulances = [{ x: 5000, z: 5000 }]
run(city, CREW_LOAD_SECONDS + 1, cityCtx)
chk('the crew finishes loading without having to stay parked',
    city.phase === 'transport', city.phase)

run(city, CREW_RUN_SECONDS + 2, cityCtx)
console.log(`   ${city.message}`)
chk('and completes the run off screen',
    city.phase === 'over' && city.message === 'PATIENT DELIVERED',
    `${city.phase} / ${city.message}`)
// The point of all of the above: the background version must never fail.
chk('a background run never reports a lost patient',
    city.message !== 'PATIENT LOST')

// A crash nobody ever attends still has to clear, or the world accumulates
// wrecks nobody dealt with.
const ignored = newAmbulanceState()
const ignoredCtx = {
  sites: SITES, hospitals: HOSPITALS, player: null, ambulances: [],
  rand: seeded(43)
}
run(ignored, FIRST_CRASH + ABANDON_AFTER + 5, ignoredCtx, 0.5)
chk(`an unattended crash clears eventually (${ABANDON_AFTER}s)`,
    ignored.phase !== 'crash', ignored.phase)
chk('and is not reported as a failure', ignored.message !== 'PATIENT LOST')

// ---------------------------------------------------------------------------
console.log('\n5. The HUD')

const waiting = newAmbulanceState()
const hudCtx = {
  sites: SITES, hospitals: HOSPITALS,
  player: { x: 0, z: 0, isAmbulance: true },
  ambulances: [], rand: seeded(47)
}
run(waiting, FIRST_CRASH + MESSAGE_TIME + 2, hudCtx)

const onTheWay = ambulanceHud(waiting, true)
chk('on the way there, the arrow points at the crash',
    onTheWay.target.x === waiting.incident.x)
chk('and there is no bar yet, because nothing is being measured',
    !onTheWay.showBar)
chk('the banner still says something after the first one clears',
    onTheWay.title === 'CASUALTY WAITING', onTheWay.title)

hudCtx.player.x = waiting.incident.x
hudCtx.player.z = waiting.incident.z
run(waiting, 1, hudCtx)
const loading = ambulanceHud(waiting, true)
chk('loading shows a bar that fills', loading.showBar &&
    loading.barLabel === 'LOADING PATIENT', loading.barLabel)

run(waiting, LOAD_SECONDS, hudCtx)
const running = ambulanceHud(waiting, true)
console.log(`   ${running.title} / ${running.barLabel} at ${(running.progress * 100).toFixed(0)}%`)
chk('the run points at the hospital instead',
    running.target === waiting.incident.hospital)
chk('and the bar becomes a countdown', running.barLabel === 'TIME TO HOSPITAL')
// A countdown that fills up is a countdown you read backwards.
chk('which DRAINS rather than filling', running.progress > 0.9)
const before = running.progress
run(waiting, 40, hudCtx)
chk('and keeps draining', ambulanceHud(waiting, true).progress < before)
chk('it stops being comfortable when time is short',
    ambulanceHud(waiting, true).good === true &&
    (() => { waiting.incident.remaining = 5; return !ambulanceHud(waiting, true).good })())

// No bar at all in anything but an ambulance.
chk('no bar when it is not your run', !ambulanceHud(waiting, false).showBar)
// And nothing on screen at all - the same rule the fire and the pursuit
// follow. Not a quieter banner: none. The wreck is still in the road.
chk('and nothing on the HUD either, because you cannot do anything about it',
    chooseMission([ambulanceHud(waiting, false)]) === null)
chk('while in the ambulance it is right there',
    chooseMission([ambulanceHud(waiting, true)]) !== null)

// crewTarget is what the AI is sent to, and it has to follow the phase.
chk('the crew is sent to the crash first',
    crewTarget({ phase: 'crash', incident: { x: 5, z: 6 } }).x === 5)
chk('and to the hospital once loaded',
    crewTarget({ phase: 'transport', incident: { hospital: { x: 9, z: 9 } } }).x === 9)
chk('and nowhere when there is nothing on', crewTarget({ phase: 'idle' }) === null)

// ---------------------------------------------------------------------------
console.log('\n6. Three games, one HUD')

const quiet = [fireHud(newFireState(), false),
               policeHud(newPoliceState(), false, []),
               ambulanceHud(newAmbulanceState(), false)]
chk('nothing happening, nothing shown', chooseMission(quiet) === null)

chk('all three hand over the same shape', (() => {
  const keys = ['active', 'mine', 'title', 'target', 'showBar', 'barLabel',
                'progress', 'good']
  return quiet.every(h => keys.every(k => k in h))
})())

// The arbitration: a callout you can act on beats one you can only watch.
const burning = { active: true, mine: false, title: 'FIRE AT ABOUT' }
const myRun = { active: true, mine: true, title: 'TO HOSPITAL' }
chk('your run beats a fire you are only watching',
    chooseMission([burning, myRun]).title === 'TO HOSPITAL' &&
    chooseMission([myRun, burning]).title === 'TO HOSPITAL')

// ---------------------------------------------------------------------------
console.log('\n7. World.js, read rather than run')

const world = readFileSync(ROOT + 'src/world/World.js', 'utf8')

// Crashes happen ON ROADS. Scattered across the map, some would land on
// beaches and hillsides where the run could never be completed - a failure
// the player would read as their own.
chk('crash sites come from the lanes', /findCrashSites\(\)/.test(world) &&
    /this\.lanes\.lanes\[i\]/.test(world))
// Which island, by asking which one it is INSIDE. The nearest CENTRE to a
// road on the edge of a big island is regularly a small island across water.
chk('the island is the one the road is on, not the nearest centre',
    /inlandDistance\(here, at\.x - here\.x, at\.z - here\.z\) > 0/.test(world))
chk('the wreck is built once and moved, like the fire',
    /createWreck\(\)/.test(world))
chk('crews are sent by the same callout machinery as the engines',
    /callOutAmbulances/.test(world))
chk('and to wherever the run currently needs them',
    /callOutAmbulances\(crewTarget\(this\.ambulance\)\)/.test(world))
chk('the ambulance is the third entry in the one mission list',
    /ambulanceHud\(this\.ambulance, kind === 'ambulance'\)/.test(world))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
