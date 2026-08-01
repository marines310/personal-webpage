/**
 * The fire.
 *
 * The rule the whole game hangs on is deliberately asymmetric, and section 3
 * is the one that matters:
 *
 *   - driving a fire engine, ONLY your engine can contain it. The AI turns
 *     out and fills the street with lights and cannot finish the job, because
 *     otherwise the game plays itself while you watch;
 *   - driving anything else, the AI deals with it and there is no bar.
 *
 * Both halves have to be true. A test that only checked the first would pass
 * against a version where nothing ever puts a fire out unless you do, and the
 * world would quietly accumulate burning buildings for anyone who never picks
 * the fire engine.
 */
import {
  FIRST_FIRE, ON_STATION, CONTAIN_SECONDS, CONTAIN_DECAY, BURN_LIMIT,
  MESSAGE_TIME, MIN_FIRE_DISTANCE, RESPONDERS, FIRE_GAP_MIN, FIRE_GAP_MAX,
  MAX_CREWS,
  newFireState, stepFire, whoIsFighting, chooseBuilding, fireHud, smokeStrength
} from '../src/world/fireGame.js'
// The arrow moved to missions.js when the pursuit needed it too - one arrow,
// not one per game.
import { missionArrow, chooseMission } from '../src/world/missions.js'
import {
  getLaneNetwork, routeToPoint, makeTraffic, stepTraffic,
  TRAFFIC_FLEET, getBusStops, ISLANDS, getIsland
} from '../src/world/islandLayout.js'
import { readFileSync } from 'fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)

// A handful of buildings spread far enough apart to be told apart.
const BUILDINGS = [
  { x: 0, z: 0, island: 'HUB', height: 8 },
  { x: 200, z: 0, island: 'ABOUT', height: 12 },
  { x: 0, z: 200, island: 'PROJECTS', height: 6 },
  { x: -200, z: -200, island: 'SKILLS', height: 9 }
]

/** A deterministic rand, so a failure is a failure and not a bad afternoon. */
const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

const run = (state, seconds, ctx, delta = 1 / 30) => {
  for (let i = 0; i < Math.round(seconds / delta); i++) stepFire(state, delta, ctx)
  return state
}

// ---------------------------------------------------------------------------
console.log('1. A fire starts, somewhere you have to drive to\n')

let state = newFireState()
chk('nothing is alight to begin with', state.phase === 'idle' && !state.fire)

const ctx = {
  buildings: BUILDINGS,
  player: { x: 0, z: 0, isFire: false },
  engines: [],
  rand: seeded(7)
}

run(state, FIRST_FIRE - 5, ctx)
chk('and nothing has caught in the first half minute', !state.fire)

run(state, 10, ctx)
chk('but one does', state.phase === 'burning' && !!state.fire)
console.log(`   ${state.message}`)
chk('and it says where', /^FIRE AT /.test(state.message || ''), `${state.message}`)
chk('the banner names a real island',
    BUILDINGS.some(b => state.message.endsWith(b.island)), `${state.message}`)

// A fire that starts on top of you is contained before the banner has
// finished appearing, and reads as a bug rather than as luck.
const gap = Math.hypot(state.fire.x - ctx.player.x, state.fire.z - ctx.player.z)
console.log(`   it is ${gap.toFixed(0)} units away`)
chk(`it is not on top of the player (needs ${MIN_FIRE_DISTANCE})`,
    gap > MIN_FIRE_DISTANCE, `${gap.toFixed(0)}`)

// ...but a map where everything is close must still catch fire, rather than
// returning nothing and quietly never having a fire again.
chk('a building is still chosen when everything is close',
    !!chooseBuilding([{ x: 1, z: 1, island: 'HUB' }],
                     { player: { x: 0, z: 0 } }, seeded(3)))
chk('and an empty world simply has no fire',
    chooseBuilding([], { player: { x: 0, z: 0 } }, seeded(3)) === null)

chk('the fire knows how high the building is', state.fire.top > 0)

// ---------------------------------------------------------------------------
console.log('\n2. Being on station')

const fire = { x: 100, z: 100 }
const at = (dx) => ({ x: 100 + dx, z: 100 })

chk('a truck parked outside counts',
    whoIsFighting(fire, { player: { ...at(ON_STATION - 2), isFire: true } }).playerOnStation)
chk('one down the road does not',
    !whoIsFighting(fire, { player: { ...at(ON_STATION + 4), isFire: true } }).playerOnStation)
chk('and neither does a car, however close',
    !whoIsFighting(fire, { player: { ...at(1), isFire: false } }).playerOnStation)

chk('AI engines are counted too',
    whoIsFighting(fire, { player: null, engines: [at(3), at(4), at(80)] })
      .enginesOnStation === 2)

// ---------------------------------------------------------------------------
console.log('\n3. Who is allowed to put it out')

/** Drive a whole incident and say how it ended. */
const incident = (opts) => {
  const s = newFireState()
  const c = {
    buildings: BUILDINGS,
    player: opts.player,
    engines: opts.engines || [],
    rand: seeded(opts.seed || 11)
  }
  run(s, FIRST_FIRE + 2, c)
  if (!s.fire) return { ended: 'never started' }

  // Put whoever is meant to be there, there.
  if (opts.playerAttends) { c.player.x = s.fire.x; c.player.z = s.fire.z }
  if (opts.enginesAttend) c.engines = [{ x: s.fire.x, z: s.fire.z }]

  run(s, CONTAIN_SECONDS + 4, c)
  return { ended: s.phase === 'over' ? s.message : 'still burning', state: s }
}

// The player IS the fire engine: the AI turning up must not finish it.
const aiOnly = incident({
  player: { x: 0, z: 0, isFire: true },
  enginesAttend: true, playerAttends: false
})
console.log(`   player is the engine, AI attends: ${aiOnly.ended}`)
chk('the AI cannot contain it while you are the fire engine',
    aiOnly.ended === 'still burning', aiOnly.ended)

const playerAttends = incident({
  player: { x: 0, z: 0, isFire: true },
  enginesAttend: true, playerAttends: true
})
console.log(`   player is the engine and attends: ${playerAttends.ended}`)
chk('but you can', playerAttends.ended === 'FIRE CONTAINED', playerAttends.ended)

// The player is NOT the fire engine: the AI has to be able to finish it, or
// the world fills up with fires for anyone who never picks the engine.
const aiHandlesIt = incident({
  player: { x: 0, z: 0, isFire: false },
  enginesAttend: true
})
console.log(`   player is a car, AI attends: ${aiHandlesIt.ended}`)
chk('the AI deals with it when you are driving something else',
    aiHandlesIt.ended === 'FIRE CONTAINED', aiHandlesIt.ended)

const nobody = incident({ player: { x: 0, z: 0, isFire: false } })
chk('and nobody attending leaves it burning', nobody.ended === 'still burning',
    nobody.ended)

// ---------------------------------------------------------------------------
console.log('\n4. The bar')

const bar = newFireState()
const barCtx = {
  buildings: BUILDINGS,
  player: { x: 0, z: 0, isFire: true },
  engines: [],
  rand: seeded(5)
}
run(bar, FIRST_FIRE + 2, barCtx)
chk('it starts empty', bar.fire.contained === 0)

barCtx.player.x = bar.fire.x
barCtx.player.z = bar.fire.z
run(bar, CONTAIN_SECONDS / 2, barCtx)
const half = bar.fire.contained / CONTAIN_SECONDS
console.log(`   half the time on station fills it to ${(half * 100).toFixed(0)}%`)
chk('it fills while you are there', half > 0.4 && half < 0.6, `${half}`)

// Nipping round the block because you overshot should cost something, but a
// bar that empties as fast as it fills punishes a bad approach far harder
// than it rewards a good one.
barCtx.player.x = bar.fire.x + 200
run(bar, CONTAIN_SECONDS / 2, barCtx)
const afterLeaving = bar.fire.contained / CONTAIN_SECONDS
console.log(`   and leaving for the same time drops it to ${(afterLeaving * 100).toFixed(0)}%`)
chk('it falls back when you leave', afterLeaving < half, `${afterLeaving}`)
chk('but more slowly than it filled', afterLeaving > 0, `${afterLeaving}`)
chk('the decay is deliberately gentler than the fill', CONTAIN_DECAY < 1)

// The decay is the PLAYER's challenge and must not apply to the AI.
//
// Applied to both, a responding engine crossed the map, reached the fire, got
// the bar to 8.3 of 14, drove on round the block and lost the lot - and the
// fire was still burning after 320 seconds. Fires would never go out at all
// for anybody not driving the engine themselves. Measured in the running
// game, which is the only place it shows.
const passing = newFireState()
const passCtx = {
  buildings: BUILDINGS,
  player: { x: 0, z: 0, isFire: false },
  engines: [],
  rand: seeded(9)
}
run(passing, FIRST_FIRE + 2, passCtx)
passCtx.engines = [{ x: passing.fire.x, z: passing.fire.z }]
run(passing, 4, passCtx)
const gained = passing.fire.contained
passCtx.engines = [{ x: passing.fire.x + 300, z: passing.fire.z }]
run(passing, 20, passCtx)
console.log(`   an engine passing by banked ${gained.toFixed(1)}s, ` +
            `and still has ${passing.fire.contained.toFixed(1)}s twenty seconds later`)
chk('an engine driving on does not lose what it did',
    passing.fire.contained === gained, `${passing.fire.contained} vs ${gained}`)

// And several crews are faster than one, which only the AI can ever have.
const oneCrew = whoIsFighting({ x: 0, z: 0 }, { player: null, engines: [{ x: 0, z: 0 }] })
const manyCrews = whoIsFighting({ x: 0, z: 0 },
  { player: null, engines: [{ x: 0, z: 0 }, { x: 1, z: 1 }, { x: 2, z: 2 }] })
chk('two crews beat one', manyCrews.rate > oneCrew.rate)
chk('and a convoy does not trivialise it', manyCrews.rate === MAX_CREWS,
    `${manyCrews.rate}`)
chk('your own engine is worth exactly one crew, whoever else turns up',
    whoIsFighting({ x: 0, z: 0 }, {
      player: { x: 0, z: 0, isFire: true },
      engines: [{ x: 0, z: 0 }, { x: 1, z: 1 }]
    }).rate === 1)

// The HUD only shows the bar when it is YOUR bar.
const hudAsEngine = fireHud(bar, true)
const hudAsCar = fireHud(bar, false)
chk('the bar shows when you are driving the engine', hudAsEngine.showBar)
chk('and not when you are not', !hudAsCar.showBar)
chk('the banner shows either way', hudAsCar.message === hudAsEngine.message)
chk('the bar is labelled FIRE CONTAINMENT',
    hudAsEngine.barLabel === 'FIRE CONTAINMENT', hudAsEngine.barLabel)
chk('progress is a fraction, not seconds',
    hudAsEngine.progress >= 0 && hudAsEngine.progress <= 1, `${hudAsEngine.progress}`)

// Mike, 1 August: "if a user is not a firetruck, it should not see fire
// missions in the game world". Not a quieter banner, not a greyed-out one -
// none at all, arrow included.
//
// The filtering is chooseMission's job rather than fireHud's, and the split
// is deliberate: fireHud describes the fire, chooseMission decides what is
// worth putting on your screen. One place knows the rule and all three
// callouts obey it. Note the fire itself is untouched - it still burns, the
// smoke still goes up over the roof, and the AI engines still turn out. You
// are simply not being told about a job you have no way of doing.
chk('driving anything else, the fire is not on the HUD at all',
    chooseMission([hudAsCar]) === null)
chk('driving the engine, it is', chooseMission([hudAsEngine]) === hudAsEngine)
chk('and the fire is still burning either way - it is the HUD that changed',
    !!hudAsCar.target && hudAsCar.target.x === hudAsEngine.target.x &&
    hudAsCar.target.z === hudAsEngine.target.z)

// ---------------------------------------------------------------------------
console.log('\n5. It ends, and another one comes along')

const cycle = newFireState()
const cycleCtx = {
  buildings: BUILDINGS,
  player: { x: 0, z: 0, isFire: false },
  engines: [],
  rand: seeded(23)
}
run(cycle, FIRST_FIRE + 2, cycleCtx)
const firstAt = { x: cycle.fire.x, z: cycle.fire.z }
cycleCtx.engines = [{ x: cycle.fire.x, z: cycle.fire.z }]
run(cycle, CONTAIN_SECONDS + 2, cycleCtx)
chk('the fire goes out', cycle.phase === 'over' && !cycle.fire)
chk('and says so', cycle.message === 'FIRE CONTAINED', `${cycle.message}`)

run(cycle, MESSAGE_TIME + 1, cycleCtx)
chk('the banner clears itself', cycle.message === null, `${cycle.message}`)
console.log(`   next one in ${cycle.timer.toFixed(0)}s`)
chk('and another is on the way',
    cycle.timer > 0 && cycle.timer <= FIRE_GAP_MAX, `${cycle.timer}`)

cycleCtx.engines = []
run(cycle, cycle.timer + 2, cycleCtx)
chk('which duly arrives', cycle.phase === 'burning' && !!cycle.fire)

// A fire nobody ever attends must not burn for the whole session. This is the
// only way to reach it, and it is deliberately generous - reading the CV for
// four minutes is a perfectly good reason not to have gone.
const ignored = newFireState()
const ignoredCtx = { buildings: BUILDINGS, player: null, engines: [], rand: seeded(2) }
run(ignored, FIRST_FIRE + BURN_LIMIT + 5, ignoredCtx, 0.25)
chk(`an ignored fire eventually burns out (${BURN_LIMIT}s)`,
    ignored.message === 'FIRE BURNED OUT' || ignored.phase !== 'burning',
    `${ignored.phase} / ${ignored.message}`)
chk('and it is long enough not to nag', BURN_LIMIT > 240)

// ---------------------------------------------------------------------------
console.log('\n5b. Every two minutes')

chk('the gap is exactly two minutes',
    FIRE_GAP_MIN === 120 && FIRE_GAP_MAX === 120, `${FIRE_GAP_MIN}-${FIRE_GAP_MAX}`)

// Asked for as "every two minutes", so it is exact rather than a window. A
// range reads as random; a fixed gap is a promise you can feel.
const spacing = newFireState()
const spacingCtx = {
  buildings: BUILDINGS,
  player: { x: 0, z: 0, isFire: false },
  engines: [],
  rand: seeded(41)
}
run(spacing, FIRST_FIRE + 2, spacingCtx)
spacingCtx.engines = [{ x: spacing.fire.x, z: spacing.fire.z }]

// Stepped one frame at a time up to the moment it goes out, and read there.
// Running on past containment and then reading the clock measured 118, not
// 120 - because the clock had been counting down for the two seconds since.
// The gap is right; the measurement was late.
while (spacing.phase === 'burning') stepFire(spacing, 1 / 30, spacingCtx)
spacingCtx.engines = []
console.log(`   next fire due in ${spacing.timer.toFixed(1)}s`)
chk('and that is what the clock is set to', Math.abs(spacing.timer - 120) < 0.1,
    `${spacing.timer}`)

run(spacing, 118, spacingCtx)
chk('nothing has caught at 118 seconds', !spacing.fire)
run(spacing, 4, spacingCtx)
chk('and something has by 122', !!spacing.fire)

// ---------------------------------------------------------------------------
console.log('\n5c. The arrow')

// The angle comes back in SCREEN terms: 0 straight up, growing CLOCKWISE,
// because a CSS rotation is the only thing that reads it. Verified in the
// running game against the camera's own matrix rather than derived from the
// heading convention - which is exactly the check that was missing when
// turnDirection came out backwards and its test agreed with it.
const arrowTarget = { x: 0, z: 0 }
const deg = (a) => Math.round((a * 180) / Math.PI)

chk('no fire, no arrow', !missionArrow(null, { x: 0, z: 0, yaw: 0 }).show)
chk('and no viewer, no arrow', !missionArrow(arrowTarget, null).show)

// Facing +Z (yaw 0). The car's nose is +Z and its right is -X, so a fire at
// -X is to the viewer's RIGHT and must turn the glyph clockwise.
const ahead = missionArrow({ x: 0, z: 80 }, { x: 0, z: 0, yaw: 0 })
const right = missionArrow({ x: -80, z: 0 }, { x: 0, z: 0, yaw: 0 })
const left = missionArrow({ x: 80, z: 0 }, { x: 0, z: 0, yaw: 0 })
const behind = missionArrow({ x: 0, z: -80 }, { x: 0, z: 0, yaw: 0 })

console.log(`   ahead ${deg(ahead.angle)}, right ${deg(right.angle)}, ` +
            `left ${deg(left.angle)}, behind ${Math.abs(deg(behind.angle))}`)
chk('straight ahead points straight up', deg(ahead.angle) === 0)
chk('to the right turns it clockwise', deg(right.angle) === 90, `${deg(right.angle)}`)
chk('to the left turns it anticlockwise', deg(left.angle) === -90, `${deg(left.angle)}`)
chk('behind points straight down', Math.abs(deg(behind.angle)) === 180)

// Turning the camera has to turn the arrow the opposite way, or it is not
// pointing at anything - it is just decoration that happens to move.
const turned = missionArrow({ x: 0, z: 80 }, { x: 0, z: 0, yaw: Math.PI / 2 })
chk('turning the view swings the arrow the other way',
    deg(turned.angle) === 90, `${deg(turned.angle)}`)

chk('it never winds past half a turn either way',
    [0, 1, 2, 3, 4, 5, 6].every(y =>
      Math.abs(missionArrow({ x: 40, z: -70 }, { x: 0, z: 0, yaw: y }).angle)
        <= Math.PI + 1e-9))

chk('the distance is the distance',
    Math.abs(missionArrow({ x: 30, z: 40 }, { x: 0, z: 0, yaw: 0 }).distance - 50) < 1e-9)

// ---------------------------------------------------------------------------
console.log('\n6. The smoke is what you navigate by')

const smoky = newFireState()
const smokyCtx = { buildings: BUILDINGS, player: null, engines: [], rand: seeded(31) }
chk('no fire, no smoke', smokeStrength(smoky) === 0)
run(smoky, FIRST_FIRE + 2, smokyCtx)
chk('a fresh fire smokes fully', smokeStrength(smoky) === 1)
smoky.fire.contained = CONTAIN_SECONDS
chk('and a contained one hardly at all', smokeStrength(smoky) < 0.3,
    `${smokeStrength(smoky)}`)

// ---------------------------------------------------------------------------
console.log('\n7. The engines can actually get there')

// A fire on a building the road network cannot reach is a fire that never
// goes out for anybody driving a car - so every building has to be routable.
const network = getLaneNetwork()
console.log(`   ${network.lanes.length} lanes`)

const sample = []
for (const island of ISLANDS) {
  const it = getIsland(island.id)
  sample.push({ x: it.x, z: it.z, id: island.id })
}

let routed = 0, worstGap = 0
for (const point of sample) {
  const route = routeToPoint(network, point.x, point.z)
  if (route && isFinite(route.gap)) { routed++; worstGap = Math.max(worstGap, route.gap) }
}
chk('every island centre finds a lane', routed === sample.length,
    `${routed}/${sample.length}`)
console.log(`   furthest island centre from a lane: ${worstGap.toFixed(1)}u`)

// And the hops table has to be usable from most of the network, or an engine
// on the wrong island simply wanders.
const route = routeToPoint(network, sample[1].x, sample[1].z)
const reachable = route.hops.filter(h => isFinite(h)).length
console.log(`   ${reachable} of ${network.lanes.length} lanes can reach it`)
chk('most of the network can reach a given fire',
    reachable > network.lanes.length * 0.8, `${reachable}`)
chk('and the target lane is zero hops from itself', route.hops[route.lane] === 0)

// ---------------------------------------------------------------------------
console.log('\n8. A callout costs the simulation nothing')

// The traffic is tuned to within a vehicle. Giving a fire engine somewhere to
// be must not disturb anybody else - which is why `mission` goes through the
// SAME scoring branch as going home, drawing the same one rand() per option.
// Moving a rand() draw is what re-shuffled the whole city and cost a red
// light when the indicators were first built.
const layout = readFileSync(ROOT + 'src/world/islandLayout.js', 'utf8')
chk('a callout reuses the going-home branch rather than adding one',
    /const goingHome = v\.mission \|\|/.test(layout))
// One branch scores a route, whether the route is "to the fire" or "home".
// A second branch would be a second set of preferences to keep in step.
chk('and there is only one place that scores a route',
    (layout.match(/goingHome\[index\]/g) || []).length === 1)

const quiet = makeTraffic(network, TRAFFIC_FLEET, getBusStops())
let moved = 0
for (let i = 0; i < 60 * 40; i++) stepTraffic(network, quiet, 1 / 60, i / 60)
for (const v of quiet) if (v.mission) moved++
chk('no vehicle has a mission unless one is given', moved === 0, `${moved}`)
chk('at most a handful are ever sent', RESPONDERS <= 4 && RESPONDERS >= 1)

// ---------------------------------------------------------------------------
console.log('\n9. World.js and the HUD, read rather than run')

const world = readFileSync(ROOT + 'src/world/World.js', 'utf8')

chk('buildings are recorded as they are built', /this\.buildings\.push\(\{/.test(world))
// The height that went in is regularly not the height that came out: under
// the monorail a building loses storeys, and a model is squashed. A smoke
// column started at the requested roof would hang above a shorter building.
chk('and with the height they actually came out at',
    /const built = this\.addBuilding\(/.test(world) && /height: built/.test(world))
chk('nothing is recorded for a building that was not built',
    /if \(built > 0\)/.test(world))

chk('the fire has smoke, flame and a light', /this\.smoke\b/.test(world) &&
    /this\.flames\b/.test(world) && /this\.fireLight\b/.test(world))
chk('and a ladder and a jet from the player\'s truck',
    /this\.ladderGroup/.test(world) && /this\.jet\b/.test(world))
chk('the ladder points from the truck to the fire rather than assuming',
    /Math\.atan2\(dx, dz\)/.test(world))
chk('the effects are built once, not per fire',
    /createFireEffects\(\)/.test(world))

// ---------------------------------------------------------------------------
// The aerial, from Mike's photographs of tower ladders. Four things, each of
// which was wrong in the first version and each of which was then MEASURED in
// the running game rather than judged from a screenshot - the numbers are in
// the comments so the next person does not have to take it on trust.

// 1. Rear-mounted. The turntable is at the BACK of the truck; it was rising
//    out of the middle of the roof. Measured at 2.10 units behind centre on a
//    7-unit truck, 2.05 up - which is the top of the rear bodywork.
chk('the turntable is mounted at the back of the truck, not on the roof',
    /LADDER_MOUNT_BACK/.test(world) &&
    /baseX = from\.x - Math\.sin\(heading\) \* back/.test(world))
chk('and in the TRUCK\'s frame, so it stays at the back when it turns',
    /const heading = vehicle\.mesh\.rotation\.y/.test(world))

// 2. A box truss, not a ladder: four chords, rungs across the bottom pair,
//    and a diagonal each side per bay. Measured: 4 chords, 11 rungs and 11
//    braced bays at 9.4 units of extension.
chk('it is a box truss with a depth, not two rails',
    /LADDER_DEPTH/.test(world))
chk('the bracing is placed rather than scaled, so it cannot shear flat',
    /this\.ladderBraces\[i\]/.test(world) && /brace\.rotation\.x =/.test(world))
chk('and the bays stay about the same length however far it runs out',
    /Math\.round\(length \/ LADDER_BAY\)/.test(world))

// 3. The water comes out of the BASKET. Measured from the drawn buffer: the
//    nearest droplet sits 0.12 units from the nozzle and the farthest 0.74
//    from the burning roof - both ends, because a stream that starts in the
//    right place and points out to sea is still wrong.
chk('there is a basket at the tip, carried out unscaled',
    /this\.ladderTip/.test(world) && /this\.ladderTip\.position\.z = length/.test(world))
chk('and the jet starts at its nozzle, not at the truck',
    /this\.basketNozzle/.test(world) &&
    /this\.jetPositions\[i3\] = nozzleX/.test(world))

// 3b. THE BASKET STAYS LEVEL. Mike again, on the first attempt: "the baskets
//     are all level". A real platform hangs on a levelling mechanism and is
//     horizontal at every elevation - people stand in it. Bolted rigidly to
//     the tip it rode up with the ladder and sat at 45 degrees.
//
//     Measured in the running game with the ladder at 45.8 degrees: the arm
//     tilts 45.8, the basket floor and every railing 0.00.
chk('the basket cancels the ladder\'s pitch, so it hangs level',
    /this\.ladderTip\.rotation\.x = this\.ladderNow\.pitch/.test(world))
// And the consequence that is easy to miss: once the platform is levelled the
// nozzle's offset from the tip is horizontal-and-vertical, NOT along the
// ladder. Rotating it with the ladder leaves the stream starting beside the
// basket instead of in it.
chk('and the nozzle offset is added level too, not along the ladder',
    /const alongFlat = tipFlat \+ this\.basketNozzle\.z/.test(world) &&
    /const nozzleY = tipY \+ this\.basketNozzle\.y/.test(world))

// 4. The basket stands off the building - Mike: "the basket is a bit
//    separated from the building it's working on". Measured 7.4 units from
//    the centre of a building whose mean half-extent is about 4.2.
chk('the basket parks clear of the building rather than touching it',
    /LADDER_STANDOFF/.test(world) &&
    /flat - halfSpan - LADDER_STANDOFF/.test(world))
chk('measured off the building\'s own footprint, not a fixed distance',
    /\(b\.width \|\| 6\) \+ \(b\.depth \|\| 6\)/.test(world))
chk('and above its roof, so it is not hidden behind the parapet',
    /BASKET_ABOVE_ROOF/.test(world))

// And the stowed one comes off the roof while the aerial is out, or the truck
// carries two ladders - one lying down and one in the air.
chk('the stowed ladder is hidden while the aerial is deployed',
    /showStowedLadder\(!alongside\)/.test(world))
chk('and put back when the fire is over',
    /if \(!fire\) \{[\s\S]{0,400}showStowedLadder\(true\)/.test(world))
chk('asked of the mesh each time, never held across a setKind',
    /userData\.stowedLadder/.test(world))

const ui = readFileSync(ROOT + 'src/ui/UI.js', 'utf8')
chk('the HUD works nothing out for itself', /world\.activeMission\(\)/.test(ui))
// Aimed from the CAMERA, not the car: what "left" means on a screen is
// decided by where the camera is looking, and an arrow aimed from the car
// would swing about every time you looked over your shoulder.
chk('the arrow is aimed from the camera, not the car',
    /missionArrow\(target, \{[\s\S]{0,140}camera\.instance\.position/.test(ui))
// The banner clears after five seconds and the fire burns for minutes, so
// the panel has to stay up for the arrow or the arrow is never seen.
// The banner clears after five seconds and the fire burns for minutes, so
// having a target to point at has to be reason enough to stay on screen.
chk('having somewhere to point keeps the panel up after the banner goes',
    /!!mission\.title \|\| !!mission\.target/.test(ui))
chk('and the elements are named for callouts generally, not for fires',
    /mission-bar-fill/.test(ui) && !/fire-bar/.test(ui))
chk('and it no longer mentions fires at all',
    !/fireHud|world\.fire/.test(ui))

const html = readFileSync(ROOT + 'index.html', 'utf8')
for (const id of ['mission', 'mission-title', 'mission-bar', 'mission-bar-fill',
                  'mission-arrow', 'mission-arrow-point', 'mission-arrow-distance']) {
  chk(`the page has ${id}`, html.includes(`id="${id}"`))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
