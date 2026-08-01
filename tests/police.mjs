/**
 * The pursuit.
 *
 * Same asymmetry as the fire, and section 2 is the one that matters:
 *
 *   - driving the police car, ONLY you can catch it. Other patrol cars join
 *     the chase and none of them can end it, or the game plays itself;
 *   - driving anything else, one to three chases run in the background and
 *     resolve on their own.
 *
 * And the thing that makes it a game rather than a chore: the robber is a
 * little SLOWER than a police car, so it can be caught by driving well, and
 * cannot be lost to something simply faster than you.
 */
import {
  FIRST_CHASE, CHASE_GAP_MIN, CHASE_GAP_MAX, BUMP_DISTANCE, ROBBER_SPEED,
  ESCAPE_AFTER, MESSAGE_TIME, BACKGROUND_MIN, BACKGROUND_MAX,
  BACKGROUND_MIN_LIFE, BACKGROUND_MAX_LIFE, MIN_CHASE_DISTANCE, ROBBER_KINDS,
  newPoliceState, stepPolice, chooseRobber, caught, backgroundWanted, policeHud
} from '../src/world/policeGame.js'
import { chooseMission, missionArrow, formatDistance } from '../src/world/missions.js'
import { fireHud, newFireState } from '../src/world/fireGame.js'
import {
  getLaneNetwork, makeTraffic, stepTraffic, TRAFFIC_FLEET, getBusStops,
  TRAFFIC_SPEEDS, signalState, pointAlong
} from '../src/world/islandLayout.js'
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

/** A little world of robbers the state machine can spawn from and release. */
const makeWorld = (opts = {}) => {
  let next = 0
  const robbers = []
  return {
    robbers,
    spawned: 0,
    released: 0,
    spawn() { this.spawned++; const id = ++next
              robbers.push({ id, x: opts.x ?? 300, z: opts.z ?? 0 }); return id },
    release(id) {
      this.released++
      const i = robbers.findIndex(r => r.id === id)
      if (i >= 0) robbers.splice(i, 1)
    }
  }
}

const run = (state, seconds, ctx, delta = 1 / 30) => {
  for (let i = 0; i < Math.round(seconds / delta); i++) stepPolice(state, delta, ctx)
  return state
}

// ---------------------------------------------------------------------------
console.log('1. Picking a car to run\n')

const cars = [
  { kind: 'sedan', x: 0, z: 0 },          // on top of the player, so excluded
  { kind: 'sedan', x: 200, z: 0 },
  { kind: 'convertible', x: 205, z: 0 },
  { kind: 'pickup', x: 240, z: 0 },
  { kind: 'suv', x: 300, z: 0 },
  { kind: 'bus', x: 210, z: 0 },
  { kind: 'police', x: 215, z: 0 },
  { kind: 'ambulance', x: 220, z: 0 },
  { kind: 'fire', x: 310, z: 0 }
]

// ONE generator across the loop, not a fresh one per draw. A fresh generator
// seeded with a small number returns a first value near zero every time, so
// sixty "random" draws all picked the first item and the test would have
// passed against a chooseRobber that ignored its randomness entirely.
const pickRand = seeded(97)
let picks = new Set()
for (let i = 0; i < 60; i++) {
  const r = chooseRobber(cars, { x: 0, z: 0 }, pickRand)
  if (r) picks.add(r.kind)
}
console.log(`   over sixty draws it picked: ${[...picks].join(', ')}`)
chk('only ordinary cars are chosen',
    [...picks].every(k => ROBBER_KINDS.includes(k)), [...picks].join(','))
chk('never a bus, which could not plausibly outrun anything',
    !picks.has('bus'))
chk('and never a service vehicle, which has somewhere to be',
    !picks.has('police') && !picks.has('ambulance') && !picks.has('fire'))

// A chase that starts on top of you is over before the banner appears.
let closest = Infinity
for (let i = 0; i < 60; i++) {
  const r = chooseRobber(cars, { x: 0, z: 0 }, pickRand)
  if (r) closest = Math.min(closest, Math.hypot(r.x, r.z))
}
chk(`the robber never starts on top of the player (nearest ${closest}u, ` +
    `needs ${MIN_CHASE_DISTANCE})`,
    closest > MIN_CHASE_DISTANCE, `${closest}`)

chk('a car already running is not chosen again',
    chooseRobber([{ kind: 'sedan', x: 300, z: 0, robber: true }],
                 { x: 0, z: 0 }, seeded(2)) === null)
chk('and a world of buses simply has no robber',
    chooseRobber([{ kind: 'bus', x: 300, z: 0 }], null, seeded(2)) === null)

// ---------------------------------------------------------------------------
console.log('\n2. Who can end it')

chk('bumping it counts', caught({ x: 0, z: 0, isPolice: true }, { x: BUMP_DISTANCE - 1, z: 0 }))
chk('being near it does not', !caught({ x: 0, z: 0, isPolice: true }, { x: BUMP_DISTANCE + 3, z: 0 }))
// The rule the whole game rests on: a car is not a police car.
chk('and neither does hitting it in something else',
    !caught({ x: 0, z: 0, isPolice: false }, { x: 0, z: 0 }))

const world = makeWorld()
const state = newPoliceState()
const asPolice = {
  player: { x: 0, z: 0, isPolice: true },
  robbers: world.robbers,
  spawn: () => world.spawn(),
  release: (id) => world.release(id),
  rand: seeded(13)
}

run(state, FIRST_CHASE + 2, asPolice)
chk('a chase starts', state.phase === 'chase' && state.chases.length === 1)
console.log(`   ${state.message}`)
chk('and says so', state.message === 'PURSUIT IN PROGRESS', `${state.message}`)
chk('exactly one, because three at once would hide the one you want',
    state.chases.length === 1)

// Sitting next to it for a long time does nothing. Only contact ends it.
run(state, 60, asPolice)
chk('driving around near it does not end it', state.phase === 'chase')

asPolice.player.x = world.robbers[0].x
asPolice.player.z = world.robbers[0].z
// One frame at a time up to the moment it ends, and read THERE. Running on
// past the end and then reading measured a timer that had been counting down
// since, and a message that had already expired.
while (state.phase === 'chase') stepPolice(state, 1 / 30, asPolice)
console.log(`   ${state.message}`)
chk('hitting it does', state.phase === 'over' && state.message === 'SUSPECT APPREHENDED',
    `${state.phase} / ${state.message}`)
chk('and the car goes back to being traffic', world.released === 1, `${world.released}`)
console.log(`   next one in ${state.timer.toFixed(0)}s`)
chk('another is one to two minutes away',
    state.timer >= CHASE_GAP_MIN && state.timer <= CHASE_GAP_MAX, `${state.timer}`)

// ---------------------------------------------------------------------------
console.log('\n3. Losing it')

const lost = newPoliceState()
const lostWorld = makeWorld()
const chasing = {
  player: { x: 0, z: 0, isPolice: true },
  robbers: lostWorld.robbers,
  spawn: () => lostWorld.spawn(),
  release: (id) => lostWorld.release(id),
  rand: seeded(17)
}
run(lost, FIRST_CHASE + 2, chasing)
chk('it is on', lost.phase === 'chase')

run(lost, ESCAPE_AFTER - 20, chasing, 0.25)
chk('a long chase is not cut short for being long', lost.phase === 'chase')

while (lost.phase === 'chase') stepPolice(lost, 0.25, chasing)
console.log(`   ${lost.message}`)
chk('but it does eventually get away', lost.phase === 'over')
chk('and says so rather than just stopping', lost.message === 'SUSPECT ESCAPED',
    `${lost.message}`)
chk('the car goes back to being traffic either way', lostWorld.released === 1)
chk(`you get four minutes to be bad at it (${ESCAPE_AFTER}s)`, ESCAPE_AFTER >= 180)

// A robber that stops existing - respawned by the stuck-vehicle valve, say -
// must not be a failure. Nothing went wrong; there is just nothing to chase.
const vanished = newPoliceState()
const vanishWorld = makeWorld()
const vanishCtx = {
  player: { x: 0, z: 0, isPolice: true },
  robbers: vanishWorld.robbers,
  spawn: () => vanishWorld.spawn(),
  release: (id) => vanishWorld.release(id),
  rand: seeded(19)
}
run(vanished, FIRST_CHASE + 2, vanishCtx)
vanishWorld.robbers.length = 0
run(vanished, 1, vanishCtx)
chk('a robber that vanishes ends the chase quietly', vanished.phase === 'over')
chk('with no accusation of failure', vanished.message === 'PURSUIT IN PROGRESS' ||
    vanished.message === null, `${vanished.message}`)

// ---------------------------------------------------------------------------
console.log('\n4. The city, when you are not the police')

chk('no background chases while you ARE the police',
    backgroundWanted(true, seeded(1)) === 0)

const countRand = seeded(53)
const counts = new Set()
for (let i = 1; i < 80; i++) counts.add(backgroundWanted(false, countRand))
console.log(`   background chases wanted: ${[...counts].sort().join(', ')}`)
chk(`between ${BACKGROUND_MIN} and ${BACKGROUND_MAX} of them`,
    [...counts].every(c => c >= BACKGROUND_MIN && c <= BACKGROUND_MAX),
    [...counts].join(','))
chk('and it does vary rather than always being the same number', counts.size > 1)

const city = newPoliceState()
const cityWorld = makeWorld()
const asCar = {
  player: { x: 0, z: 0, isPolice: false },
  robbers: cityWorld.robbers,
  spawn: () => cityWorld.spawn(),
  release: (id) => cityWorld.release(id),
  rand: seeded(29)
}
run(city, 20, asCar)
console.log(`   ${city.chases.length} running`)
chk('the city starts its own',
    city.chases.length >= BACKGROUND_MIN && city.chases.length <= BACKGROUND_MAX,
    `${city.chases.length}`)

// They have to END. The AI cannot catch a robber - that is the rule that makes
// the player's version a game - so a background chase that never timed out
// would run all session and the world would fill with flashing cars.
run(city, BACKGROUND_MAX_LIFE + 30, asCar, 0.25)
console.log(`   after ${BACKGROUND_MAX_LIFE + 50}s: ${cityWorld.released} resolved, ` +
            `${city.chases.length} running`)
chk('background chases resolve themselves', cityWorld.released > 0, `${cityWorld.released}`)
chk('and the world never fills up with them',
    city.chases.length <= BACKGROUND_MAX, `${city.chases.length}`)

// Getting into a police car takes the pursuit over; getting out hands it back.
asCar.player.isPolice = true
run(city, 1, asCar)
chk('stepping into a police car clears the background chases',
    city.chases.length <= 1, `${city.chases.length}`)
run(city, FIRST_CHASE + CHASE_GAP_MAX + 5, asCar)
chk('and you get one of your own', city.playerChase === true)

// ---------------------------------------------------------------------------
console.log('\n5. The robber is slower than you, on purpose')

const layout = readFileSync(ROOT + 'src/world/islandLayout.js', 'utf8')
const world_ = readFileSync(ROOT + 'src/world/World.js', 'utf8')
const vehicle = readFileSync(ROOT + 'src/world/Vehicle.js', 'utf8')

chk('the robber is slower than a police car', ROBBER_SPEED < 1)
chk('but not so much slower that it is not a chase', ROBBER_SPEED > 0.8)

// PLAYER_TOP_SPEED is a second copy of Vehicle's maxForwardSpeed, and two
// numbers that must agree are two numbers that will eventually disagree. So
// they are read from both files and compared.
const declared = Number((world_.match(/PLAYER_TOP_SPEED = (\d+(?:\.\d+)?)/) || [])[1])
const actual = Number((vehicle.match(/maxForwardSpeed: (\d+(?:\.\d+)?)/) || [])[1])
console.log(`   World says ${declared}, Vehicle says ${actual}, ` +
            `robber cruises at ${(declared * ROBBER_SPEED).toFixed(1)}`)
chk('the top speed World uses is the one Vehicle actually has',
    declared === actual, `${declared} vs ${actual}`)
chk('and the robber ends up just under it',
    declared * ROBBER_SPEED < actual && declared * ROBBER_SPEED > actual * 0.8)

// It also has to be faster than the traffic it is hiding in, or it is not
// running away from anything.
const fastest = Math.max(...Object.values(TRAFFIC_SPEEDS))
console.log(`   ordinary traffic tops out at ${fastest}`)
chk('a robber outruns ordinary traffic', declared * ROBBER_SPEED > fastest,
    `${declared * ROBBER_SPEED} vs ${fastest}`)

// ---------------------------------------------------------------------------
console.log('\n6. It runs red lights, and it runs away')

chk('a robber is skipped when the lights are handed out',
    /if \(v\.robber\) continue/.test(layout))
// Not an exception to the deadlock rule: it REMOVES a reason to stop rather
// than adding one, so a robber can still be stopped by the car in front and
// is still vetoed out of anything it would hit.
chk('and that removes a reason to stop rather than adding one',
    /REMOVES a reason to stop/.test(layout))

chk('it steers away from whoever is nearest',
    /const fleeFrom = v\.robber \? v\.fleeFrom : null/.test(layout))
// Judged where the option ENDS. Every lane out of a junction starts in the
// same few units, so scoring the entrances scores four numbers that barely
// differ and the choice comes out as noise - a car dithering at every corner
// rather than running.
chk('judged by where each way OUT goes, not where it starts',
    /pointAlong\(lanes\[index\], lanes\[index\]\.length\)/.test(layout))

// Every branch of the scoring draws the same number of rand()s, so a chase
// cannot shift anybody else's sequence. That is the discipline that kept the
// fire callout free, and the lack of it is what cost a red light when the
// indicators were first tried.
const branchRands = (layout.match(/score = [^\n]*v\.rand\(\)/g) || []).length
console.log(`   ${branchRands} scoring branches, each drawing one rand()`)
chk('each scoring branch draws exactly one rand', branchRands === 2)

const network = getLaneNetwork()
const fleet = makeTraffic(network, TRAFFIC_FLEET, getBusStops())
for (let i = 0; i < 60 * 30; i++) stepTraffic(network, fleet, 1 / 60, i / 60)
chk('no vehicle is a robber unless one is made', fleet.every(v => !v.robber))

// And with one, it must actually get somewhere rather than sitting still.
const runner = fleet.find(v => ROBBER_KINDS.includes(v.kind))
runner.robber = true
runner.cruise = 16.5
const startLane = runner.lane
let moved = 0
for (let i = 0; i < 60 * 40; i++) {
  runner.fleeFrom = { x: 0, z: 0 }
  stepTraffic(network, fleet, 1 / 60, 1800 + i / 60)
  if (runner.lane !== startLane) moved++
}
console.log(`   a robber changed lane on ${moved} of 2400 frames`)
chk('a robber actually goes somewhere', moved > 0)

// ---------------------------------------------------------------------------
console.log('\n7. One HUD, two games')

const quietFire = newFireState()
const quietPolice = newPoliceState()
chk('nothing happening, nothing on screen',
    chooseMission([fireHud(quietFire, false),
                   policeHud(quietPolice, false, [])]) === null)

// The arbitration, which is the whole reason chooseMission exists: a callout
// you can ACT on beats one you can only watch, whatever order they arrived
// in. Without it a fire that started first would sit on screen mid-pursuit.
const burning = { active: true, mine: false, title: 'FIRE AT ABOUT' }
const pursuing = { active: true, mine: true, title: 'PURSUIT IN PROGRESS' }
chk('the one you can act on wins, whatever the order',
    chooseMission([burning, pursuing]).title === 'PURSUIT IN PROGRESS' &&
    chooseMission([pursuing, burning]).title === 'PURSUIT IN PROGRESS')
// And the half of the rule that arrived later, at Mike's asking - twice, once
// for the pursuit and then for the fire, which is what turned it into a
// principle. A callout that is not yours is not shown AT ALL: not lower down
// the list, not in grey. The HUD is a list of things you can DO, not a list
// of things that are happening. The fire is still burning out there and the
// smoke still goes up; you find it by looking out of the window.
chk('with neither yours, nothing shows at all',
    chooseMission([burning, { active: true, mine: false, title: 'X' }]) === null)
chk('something inactive is never chosen',
    chooseMission([{ active: false, mine: true, title: 'no' },
                   { active: true, mine: true, title: 'yes' }]).title === 'yes')
chk('and an inactive one of yours does not fall back to somebody else\'s',
    chooseMission([{ active: false, mine: true, title: 'no' }, burning]) === null)

// A pursuit has nothing to fill up - you have either hit it or you have not -
// and a progress bar for a thing with no progress is a lie.
const hud = policeHud(state, true, [])
chk('a pursuit has no progress bar', hud.showBar === false)

// The banner says what just happened for a few seconds and then clears. With
// nothing after it, the screen goes quiet thirty seconds into a pursuit and
// there is nothing left saying you are in one - only an arrow, which could be
// pointing at anything.
const running = { playerChase: true, chases: [{ id: 9 }], message: null }
chk('CHASE MODE stays up for as long as the chase does',
    policeHud(running, true, [{ id: 9, x: 50, z: 0 }]).title === 'CHASE MODE',
    policeHud(running, true, [{ id: 9, x: 50, z: 0 }]).title)
chk('but the fresh banner still wins while it is up',
    policeHud({ ...running, message: 'PURSUIT IN PROGRESS' }, true,
              [{ id: 9, x: 50, z: 0 }]).title === 'PURSUIT IN PROGRESS')
chk('and with no chase there is nothing to say',
    policeHud({ playerChase: true, chases: [], message: null }, true, []).title === null)

// A chase that is not yours gets NOTHING - no banner and no arrow. It is
// scenery: something the city is doing that you may drive past and notice.
// An arrow to it was built and taken out again at Mike's request, because
// pointing at a thing you have no part in turns the HUD into a list of
// everything happening in the world, which is the opposite of a callout.
const backdrop = { playerChase: false, chases: [{ id: 1 }, { id: 2 }], message: null }
const others = [{ id: 1, x: 400, z: 0 }, { id: 2, x: 60, z: 0 }]
const watching = policeHud(backdrop, false, others)
chk('a chase that is not yours puts nothing on screen',
    !watching.active && watching.target === null && watching.title === null,
    JSON.stringify(watching))
// Even with robbers running, and even close by.
chk('however many are running, and however close',
    policeHud(backdrop, false, [{ id: 1, x: 1, z: 1 }]).target === null)
chk('but it does have an arrow when there is something to point at', (() => {
  const live = policeHud({ playerChase: true, chases: [{ id: 9 }], message: null },
                         true, [{ id: 9, x: 50, z: 0 }])
  return !!live.target && live.active
})())

chk('the fire and the pursuit hand over the same shape', (() => {
  const a = fireHud(quietFire, true)
  const b = policeHud(quietPolice, true, [])
  return ['active', 'mine', 'title', 'target', 'showBar', 'barLabel', 'progress', 'good']
    .every(k => k in a && k in b)
})())

// ---------------------------------------------------------------------------
console.log('\n8. World.js and the HUD, read rather than run')

chk('a robber is a car already on the road, not a new one',
    /v\.robber = true/.test(world_) && !/createRobberVehicle/.test(world_))
chk('and it goes back to being traffic afterwards',
    /releaseRobber\(id\)/.test(world_) && /v\.cruise = v\.wasCruise/.test(world_))
chk('patrol cars converge using the same callout machinery as the engines',
    /callOutPolice/.test(world_) && /routeToPoint\(this\.lanes, robber\.x/.test(world_))
// A BFS per robber per frame would be sixty a second for a table stale by a
// lane at most.
chk('and are not re-routed every single frame', /CHASE_REROUTE/.test(world_))
chk('the robber runs from every police car, not only the player',
    /kind === 'police'/.test(world_) && /pursuers\.push\(player\)/.test(world_))
chk('the paintwork is recorded so a robber can flash',
    (world_.match(/group\.userData\.body = body/g) || []).length >= 3)

const ui = readFileSync(ROOT + 'src/ui/UI.js', 'utf8')
chk('the HUD asks World for one mission and draws it',
    /world\.activeMission\(\)/.test(ui))
chk('and the pursuit is not told where the player is, because it has no use for it',
    /policeHud\(this\.police, kind === 'police', robbers\)/.test(world_))
// The arrow is cleared explicitly when there is no callout, not merely
// hidden by its parent. It looks right either way, and leaving the arrow's
// own state saying "visible, 270 metres" is a bug waiting for the day it
// moves out of the panel.
// The window is 900 rather than 400 because the block grew: with a callout
// that is not yours now hidden entirely, the banner text and the bar had to
// be cleared alongside the arrow. Measured before it was fixed - driving a
// bus past a fire, the hidden panel still read "FIRE AT ABOUT · 300m".
chk('the arrow is cleared when nothing is going on, not just covered up',
    /if \(!showing\) \{[\s\S]{0,900}this\.updateMissionArrow\(null\)/.test(ui))
chk('and so are the banner and the bar',
    /if \(!showing\) \{[\s\S]{0,900}this\.missionTitle\.textContent = ''/.test(ui) &&
    /if \(!arrow\.show\) \{[\s\S]{0,400}this\.missionArrowDistance\.textContent = ''/.test(ui))
chk('and knows nothing about fires or pursuits',
    !/fireHud|policeHud|world\.fire|world\.police/.test(ui))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
