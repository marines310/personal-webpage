/**
 * Fuel: the tank, the burn, the warning and the pump.
 *
 * All of it is arithmetic on plain objects, so this drives a whole tank down
 * and back up without a browser. What it is really guarding is the set of
 * promises the feature makes to the player, each stated as a measurement:
 *
 *   1. **Everything you can drive has a tank, and the monorail does not.**
 *   2. **A tank lasts what it says it lasts** - and lasts longer if you lift
 *      off, because the burn follows the driving and not the clock.
 *   3. **The warning comes at a quarter**, not at a third and not at empty.
 *   4. **You can leave at any time**, and you keep what went in.
 *   5. **Nothing runs past its ends** - no tank over full, none below empty.
 *   6. **Running dry asks for help once**, not sixty times a second.
 */
import {
  TANK_SECONDS, IDLE_SHARE, LOW_FUEL, FILL_SECONDS, TOP_UP, AT_PUMP,
  STOPPED_SPEED,
  hasTank, burnRate, newGasState, nearestBay, stepGas, gasHud, fuelGauge
} from '../src/world/gasGame.js'
import {
  getLaneNetwork, getFuelStations, getFuelBays, getStations, getBusStops,
  getIslandRoads, distanceToNearestRoad, blocksStationEntrance,
  fuelApron, fuelApronClearance, PAVEMENT_WIDTH, APRON_PAVEMENT_GAP,
  TRAFFIC_LENGTHS, pointAlong, BUS_STOP_REACH
} from '../src/world/islandLayout.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const HERE = dirname(fileURLToPath(import.meta.url))

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const MAX_SPEED = 18

// A player standing still at the origin, unless a test says otherwise.
const driver = (over = {}) =>
  ({ x: 0, z: 0, kind: 'sedan', speed: 0, ...over })

/**
 * A state already attached to a vehicle, with a chosen amount in the tank.
 *
 * Needed because a fresh state has `kind: null`, and the first step attaches
 * it to whatever you are driving and hands you a FULL tank - which is correct
 * (a garage that gives you an empty vehicle is a garage you use once) and
 * quietly undid every test below that set `fuel` by hand. Six of them failed
 * on it, all reading as model bugs and none of them being one.
 */
const tank = (fuel, kind = 'sedan') => {
  const s = newGasState()
  s.kind = kind
  s.fuel = fuel
  return s
}

/** Run the model for `seconds` at a fixed sixtieth, which is what the game does. */
function run(state, ctx, seconds) {
  const dt = 1 / 60
  for (let i = 0; i < seconds / dt; i++) stepGas(state, dt, ctx)
  return state
}

// ---------------------------------------------------------------------------
console.log('1. Who has a tank\n')

chk('every vehicle the player can drive has one',
    ['sedan', 'convertible', 'pickup', 'suv', 'police', 'ambulance',
     'tow', 'fire', 'bus', 'monster', 'race'].every(hasTank),
    ['sedan', 'convertible', 'pickup', 'suv', 'police', 'ambulance',
     'tow', 'fire', 'bus', 'monster', 'race'].filter(k => !hasTank(k)).join(' '))

// The one exclusion Mike asked for, and it is an absence from the table
// rather than a special case at the call site - so the next unfuelled thing
// is excluded by not being added, not by remembering to add an `if`.
chk('the monorail does not', !hasTank('monorail'))
chk('and neither does something that is not a vehicle at all',
    !hasTank('lamppost') && !hasTank(undefined) && !hasTank(null))

// Every kind in the game should be accounted for one way or the other: a kind
// that is neither in the table nor deliberately excluded is one somebody
// forgot, and it would silently drive forever.
const EXCLUDED = ['monorail']
const unaccounted = Object.keys(TRAFFIC_LENGTHS)
  .filter(k => !hasTank(k) && !EXCLUDED.includes(k))
chk('no kind is left unaccounted for', unaccounted.length === 0,
    unaccounted.join(' '))

chk('a fire engine drinks faster than a sedan',
    TANK_SECONDS.fire < TANK_SECONDS.sedan)
chk('and the monster truck is the worst of the lot',
    Math.min(...Object.values(TANK_SECONDS)) === TANK_SECONDS.monster)

// ---------------------------------------------------------------------------
console.log('\n2. The burn follows the driving, not the clock\n')

chk('flat out, a tank lasts what the table says',
    Math.abs(1 / burnRate('sedan', MAX_SPEED, MAX_SPEED) - TANK_SECONDS.sedan) < 1e-9,
    `${(1 / burnRate('sedan', MAX_SPEED, MAX_SPEED)).toFixed(1)}s`)

// The whole reason burn is tied to effort: a tank measured in
// minutes-of-existing empties while you sit reading a zone panel, which reads
// as the game taking something from you rather than as fuel.
const idling = 1 / burnRate('sedan', 0, MAX_SPEED)
console.log(`   idling lasts ${(idling / 60).toFixed(0)} minutes`)
chk('idling costs something, but not much',
    burnRate('sedan', 0, MAX_SPEED) > 0 && idling > TANK_SECONDS.sedan * 5,
    `${idling.toFixed(0)}s`)
chk('and it is exactly the stated share of the full rate',
    Math.abs(burnRate('sedan', 0, MAX_SPEED) /
             burnRate('sedan', MAX_SPEED, MAX_SPEED) - IDLE_SHARE) < 1e-9)

chk('half speed burns less than full speed',
    burnRate('sedan', MAX_SPEED / 2, MAX_SPEED) <
    burnRate('sedan', MAX_SPEED, MAX_SPEED))
chk('reversing burns fuel too, rather than making it',
    burnRate('sedan', -MAX_SPEED, MAX_SPEED) > 0)
chk('and going faster than the stated top speed cannot burn more than flat out',
    burnRate('sedan', MAX_SPEED * 3, MAX_SPEED) ===
    burnRate('sedan', MAX_SPEED, MAX_SPEED))

chk('a kind with no tank burns nothing',
    burnRate('monorail', MAX_SPEED, MAX_SPEED) === 0)
// A zero max speed would be a divide by zero, and the result would be NaN
// fuel - a gauge that renders as an empty bar and never moves again.
chk('a zero top speed does not produce a NaN tank',
    Number.isFinite(burnRate('sedan', 5, 0)))

// ---------------------------------------------------------------------------
console.log('\n3. Driving it down\n')

const far = [{ x: 9000, z: 9000, heading: 0, station: 'far' }]

let state = newGasState()
run(state, { player: driver({ speed: MAX_SPEED }), maxSpeed: MAX_SPEED, bays: far },
    TANK_SECONDS.sedan / 2)
chk('half a tank of driving leaves about half a tank',
    Math.abs(state.fuel - 0.5) < 0.02, `${state.fuel.toFixed(3)}`)

chk('and it has not warned yet', state.fuel > LOW_FUEL && !state.target)

run(state, { player: driver({ speed: MAX_SPEED }), maxSpeed: MAX_SPEED, bays: far },
    TANK_SECONDS.sedan * 0.3)
chk('a quarter of a tank puts a station on the arrow',
    state.fuel <= LOW_FUEL && !!state.target, `${state.fuel.toFixed(3)}`)

// The arrow must not dither. Two stations roughly equidistant made it flick
// between them, which is worse than pointing at the second-nearest.
const two = [
  { x: 100, z: 0, heading: 0, station: 'a' },
  { x: -100.5, z: 0, heading: 0, station: 'b' }
]
const dither = tank(LOW_FUEL - 0.01)
let chosen = null
let changes = 0
for (let i = 0; i < 600; i++) {
  // Wander across the midpoint, where the nearest station keeps swapping
  const x = Math.sin(i / 7) * 3
  stepGas(dither, 1 / 60,
    { player: driver({ x, speed: MAX_SPEED }), maxSpeed: MAX_SPEED, bays: two })
  if (dither.target && dither.target.station !== chosen) {
    chosen = dither.target.station
    changes++
  }
}
chk('the arrow picks one station and keeps it', changes === 1, `${changes} changes`)

// Dry
const dry = tank(0.02)
let towCalls = 0
run(dry, { player: driver({ speed: MAX_SPEED }), maxSpeed: MAX_SPEED, bays: far,
           tow: () => towCalls++ }, 120)
chk('the tank stops at empty rather than going negative', dry.fuel === 0,
    `${dry.fuel}`)
chk('and running dry asks for a tow exactly once, not every frame',
    towCalls === 1, `${towCalls} calls`)
chk('the banner says so', dry.phase === 'dry')

// ---------------------------------------------------------------------------
console.log('\n4. Filling up\n')

const bay = [{ x: 0, z: 0, heading: 0, station: 'here' }]

const fill = tank(0.1)
run(fill, { player: driver(), maxSpeed: MAX_SPEED, bays: bay }, 1)
chk('stopping on the bay starts a fill', fill.phase === 'filling')

run(fill, { player: driver(), maxSpeed: MAX_SPEED, bays: bay }, FILL_SECONDS)
chk('and it fills to the brim and stops there', fill.fuel >= TOP_UP,
    `${fill.fuel}`)
chk('the pump turns itself off', fill.phase === 'driving')

// A fill may not run past full, however long you sit there.
run(fill, { player: driver(), maxSpeed: MAX_SPEED, bays: bay }, 30)
// Parked at a pump with a full tank, nothing should happen at all - no
// trickle of idle burn, and above all no FILLING UP banner every few frames,
// which is what a `< 1` test here produced.
chk('sitting on the bay with a full tank does nothing',
    fill.fuel >= TOP_UP && fill.phase === 'driving', `${fill.fuel}`)

// Leaving early. This is the rule Mike asked for in so many words - "the
// player can leave/drive away at any time" - so it is a rule in the model,
// not a check in the renderer.
const leave = tank(0.1)
run(leave, { player: driver(), maxSpeed: MAX_SPEED, bays: bay }, FILL_SECONDS / 3)
const partial = leave.fuel
chk('a part fill puts some in', partial > 0.1 && partial < 1,
    `${partial.toFixed(3)}`)

stepGas(leave, 1 / 60,
  { player: driver({ speed: MAX_SPEED }), maxSpeed: MAX_SPEED, bays: bay })
chk('driving off ends the fill', leave.phase !== 'filling')
chk('and you keep what went in', leave.fuel > partial - 0.01,
    `${leave.fuel.toFixed(3)} vs ${partial.toFixed(3)}`)

// Out of reach of the pump
const away = tank(0.3)
run(away, { player: driver({ x: AT_PUMP + 4 }), maxSpeed: MAX_SPEED, bays: bay }, 2)
chk('stopping near the station but off the bay does not fill',
    away.phase !== 'filling')

// Rolling through
const rolling = tank(0.3)
run(rolling, { player: driver({ speed: STOPPED_SPEED + 2 }), maxSpeed: MAX_SPEED,
               bays: bay }, 2)
chk('and neither does rolling across it', rolling.phase !== 'filling')

// A swap is a full tank: the garage handing you an empty vehicle is a garage
// you would never use twice.
const swap = tank(0.1)
stepGas(swap, 1 / 60,
  { player: driver({ kind: 'bus', speed: 1 }), maxSpeed: MAX_SPEED, bays: far })
chk('changing vehicle gives you its own full tank',
    swap.fuel > 0.99 && swap.kind === 'bus', `${swap.fuel.toFixed(3)}`)

// ---------------------------------------------------------------------------
console.log('\n5. What the screen is told\n')

const none = newGasState()
stepGas(none, 1 / 60,
  { player: driver({ kind: 'monorail' }), maxSpeed: MAX_SPEED, bays: far })
chk('the monorail gets no gauge at all', fuelGauge(none).show === false)
chk('and no arrow either', gasHud(none, false).active === false)

const ok = newGasState()
chk('a full tank is not worth a banner', gasHud(ok, true).active === false)
chk('but the gauge is on screen anyway', fuelGauge(ok).show === true)

const low = tank(LOW_FUEL - 0.01)
low.target = { x: 50, z: 0 }
const lowHud = gasHud(low, true)
chk('a low tank is the player\'s own business, so it can take the arrow',
    lowHud.active && lowHud.mine && !!lowHud.target)
chk('and the gauge says low', fuelGauge(low).low === true)

const filling = tank(0.4)
filling.phase = 'filling'
const fillHud = gasHud(filling, true)
chk('filling shows a bar rather than an arrow',
    fillHud.showBar && fillHud.progress === 0.4 && !fillHud.target)

// ---------------------------------------------------------------------------
console.log('\n6. There is somewhere to fill up\n')

const net = getLaneNetwork()
const stations = getFuelStations(net)
const bays = getFuelBays(net)

console.log(`   ${stations.length} stations, ${bays.length} bays, on ` +
            stations.map(s => s.island.id).join(', '))

chk('the world has several gas stations', stations.length >= 4,
    `${stations.length}`)
chk('each has somewhere to actually park',
    stations.every(s => s.bays && s.bays.length >= 1))
chk('and every bay is a real place', bays.every(b =>
  Number.isFinite(b.x) && Number.isFinite(b.z) && Number.isFinite(b.heading)))

// A pump on the same spot as a fire station is two buildings in one place.
// It happened: the first version of the fallback pass dropped the spacing
// entirely and sited one at distance 0.0.
const emergency = getStations(net)
let closest = Infinity
for (const f of stations) {
  for (const e of emergency) {
    closest = Math.min(closest, Math.hypot(f.x - e.x, f.z - e.z))
  }
}
console.log(`   closest pump to an emergency station: ${closest.toFixed(1)}`)
chk('no pump is built on top of another station', closest > 24,
    `${closest.toFixed(1)}`)

let apart = Infinity
for (let i = 0; i < stations.length; i++) {
  for (let j = i + 1; j < stations.length; j++) {
    apart = Math.min(apart, Math.hypot(stations[i].x - stations[j].x,
                                       stations[i].z - stations[j].z))
  }
}
chk('and no two pumps are on top of each other', apart > 24, `${apart.toFixed(1)}`)

// THE ONE THAT MATTERS FOR PLAYING IT. A tank is worth nothing if the nearest
// pump is further away than the tank can carry you.
let furthest = 0
let where = ''
for (const lane of net.lanes) {
  for (let at = 0; at < lane.length; at += 20) {
    const p = pointAlong(lane, at)
    let d = Infinity
    for (const b of bays) d = Math.min(d, Math.hypot(b.x - p.x, b.z - p.z))
    if (d > furthest) { furthest = d; where = lane.island }
  }
}
// A quarter tank at 18 units a second is well over a thousand units of
// driving, so the warning always comes with time in hand.
const quarterTank = TANK_SECONDS.monster * LOW_FUEL * MAX_SPEED
console.log(`   furthest any road is from a pump: ${furthest.toFixed(0)} ` +
            `(${where}); a quarter tank carries the thirstiest vehicle ` +
            `${quarterTank.toFixed(0)}`)
chk('the warning always leaves enough fuel to reach a pump',
    furthest < quarterTank / 2, `${furthest.toFixed(0)} vs ${quarterTank.toFixed(0)}`)

// nearestBay has to cope with an empty world without throwing - the editor
// can produce a map with no stations on it at all.
chk('no stations anywhere is survivable', nearestBay([], { x: 0, z: 0 }) === null)
chk('and so is no player', nearestBay(bays, null) === null)

const empty = newGasState()
run(empty, { player: driver({ speed: MAX_SPEED }), maxSpeed: MAX_SPEED, bays: [] }, 5)
chk('and the model keeps running with nowhere to fill up',
    Number.isFinite(empty.fuel) && empty.fuel < 1)

// ---------------------------------------------------------------------------
console.log('\n7. The forecourt stays off the road, and you pull in alongside\n')

// Mike photographed a white block running out of the forecourt into the
// carriageway. Same fault as the emergency stations' aprons had, same fix:
// the layout sizes the concrete, not the renderer.
for (const station of stations) {
  const yard = fuelApron(station)
  chk(`the ${station.island.id} station has a forecourt`, !!yard)
  if (!yard) continue

  // The gap is measured the same way the apron is sized, against every road
  // on the island rather than only the one it fronts - a station beside a
  // junction has room towards its own road and none towards the other.
  chk('  it leaves bare ground between itself and the nearest road',
      fuelApronClearance(station) >= APRON_PAVEMENT_GAP - 1e-9,
      `${fuelApronClearance(station).toFixed(2)}`)

  chk('  it starts at the kiosk wall',
      Math.abs((yard.offset - yard.depth / 2) - station.depth / 2) < 1e-9)

  // Wide enough for a bay, which is the thing that actually has to fit. The
  // bays stack in depth, so the frontage only ever holds one.
  chk('  and it is wide enough for a bay',
      yard.width >= station.bayWidth,
      `${yard.width} for a ${station.bayWidth} bay`)
}

// THE ROTATION. bayPositions() aims a bay at the building, which is right for
// a fire engine backing out of its door and wrong for a pump - you pull in
// alongside it. Mike: "the direction the bus is currently facing the station
// should rotate 90 degrees."
for (const station of stations) {
  for (const bay of station.bays) {
    const turn = Math.abs(((bay.heading - station.heading) % (Math.PI * 2)))
    const quarter = Math.min(Math.abs(turn - Math.PI / 2),
                             Math.abs(turn - Math.PI * 1.5))
    chk(`a ${station.island.id} bay lies along the frontage, not across it`,
        quarter < 1e-9, `${(turn * 180 / Math.PI).toFixed(0)} degrees`)
  }
}

// A bay has to be long enough for the longest thing that can use it, and now
// that they lie along the frontage the SPACING is what provides that.
chk('a bay is long enough for the longest vehicle',
    stations.every(s => s.bayWidth >= TRAFFIC_LENGTHS.bus + 1),
    `${stations[0].bayWidth} vs a ${TRAFFIC_LENGTHS.bus} bus`)

// THE ONE MIKE PHOTOGRAPHED. Not the frontage it faces - every road on the
// island, at all four corners of the concrete. The first version checked the
// building and passed while laying 6.4 units of apron across a side street.
let intoRoad = []
for (const station of stations) {
  const roads = getIslandRoads(station.island)
  const yard = fuelApron(station)
  const fx = Math.sin(station.heading)
  const fz = Math.cos(station.heading)
  for (const alongSide of [-0.5, 0.5]) {
    for (const acrossSide of [-0.5, 0.5]) {
      const cx = station.x + fx * (yard.offset + alongSide * yard.depth)
                           - fz * (acrossSide * yard.width)
      const cz = station.z + fz * (yard.offset + alongSide * yard.depth)
                           + fx * (acrossSide * yard.width)
      const d = distanceToNearestRoad(roads, cx - station.island.x,
                                      cz - station.island.z)
      if (d < 0) intoRoad.push(`${station.id}:${d.toFixed(2)}`)
    }
  }
}
chk('no forecourt corner lies in a carriageway', intoRoad.length === 0,
    intoRoad.join(' '))

// ---------------------------------------------------------------------------
console.log('\n8. Nothing parked in the way\n')

// Mike, twice: entrances hidden behind trees, benches and bus shelters, and
// objects standing in the middle of the road. Both are one rule asked in more
// places, so these check the rule is asked rather than re-deriving it.
const world = readFileSync(join(HERE, '..', 'src/world/World.js'), 'utf8')

chk('gas stations count as a way in that must stay clear',
    /this\.accessStations = \[\.\.\.this\.stations, \.\.\.this\.fuelStations\]/
      .test(world))
chk('the street dressing asks before it puts anything on a pavement',
    /const clearHere = !blocksStationEntrance\(kx, kz, this\.accessStations\)/
      .test(world))
chk('and so does a street tree',
    /if \(!blocksStationEntrance\(gapX, gapZ, this\.accessStations\)\)/.test(world))

// The road guard lives inside each placer, not at the call sites, so the next
// thing that puts an object on a pavement cannot forget it.
for (const fn of ['addBench', 'addBin', 'addPlanter', 'addStreetTree']) {
  const body = world.slice(world.indexOf(`  ${fn}(`))
  chk(`${fn}() refuses to stand in the road`,
      /^[^]{0,220}if \(this\.onCarriageway\(x, z\)\) return/.test(body))
}
chk('and the guard measures from the kerb, not the centre line',
    /distanceToNearestRoad\(\s*getIslandRoads\(island\)/.test(world))

// The things the LAYOUT places can be checked outright rather than read.
let onRoad = []
for (const stop of getBusStops(getLaneNetwork())) {
  const island = stop.island
  if (!island) continue
  const roads = getIslandRoads(typeof island === 'object' ? island : { id: island })
  if (!roads || !roads.length) continue
  const d = distanceToNearestRoad(roads, stop.x - (stop.islandX || 0),
                                  stop.z - (stop.islandZ || 0))
  if (Number.isFinite(d) && d < -1.5) onRoad.push(stop)
}
chk('no bus stop stands in a carriageway', onRoad.length === 0,
    `${onRoad.length}`)

// A stop in a pump's way is slid along the kerb, not dropped (dropping them
// failed traffic.mjs and incident.mjs) - so check it really did move clear.
const pumpStops = getBusStops(getLaneNetwork()).filter(stop =>
  blocksStationEntrance(stop.x, stop.z, getFuelStations(), BUS_STOP_REACH))
chk('no bus stop stands across a forecourt', pumpStops.length === 0,
    `${pumpStops.length}`)

// And a pump bay is somewhere you can actually stop: on its own concrete,
// off the carriageway.
let baysOnRoad = 0
for (const station of stations) {
  const roads = getIslandRoads(station.island)
  for (const bay of station.bays) {
    const d = distanceToNearestRoad(roads, bay.x - station.island.x,
                                    bay.z - station.island.z)
    if (d < 0) baysOnRoad++
  }
}
chk('no pump bay is in the road', baysOnRoad === 0, `${baysOnRoad} of ${bays.length}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
