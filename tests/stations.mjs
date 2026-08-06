/**
 * Fire stations, police stations and hospitals: where they are, and whether
 * their vehicles actually use them.
 *
 * Two different things are being checked here and they fail in different ways.
 *
 * The GEOMETRY - is the door wide enough, is the run-in square to it, is the
 * building clear of the road - is static, and a single measurement settles it.
 * The BEHAVIOUR is not: "a fire engine comes and goes from its garage" cannot
 * be seen in a snapshot, and every version of it that was wrong looked
 * perfectly fine standing still. Three of them:
 *
 *   - vehicles only went home if their wandering happened to take them past
 *     their own door. Twice in ten minutes, out of twenty-two vehicles.
 *   - the ones that did get to their own street were teleported away by the
 *     patience valve while queueing at a red, two seconds from the door.
 *   - the bays were full for eighteen seconds in every hundred and fifty, so
 *     the car parks read as empty however well the rest of it worked.
 *
 * None of those is visible without running the thing and counting. So this
 * runs ten minutes of traffic and counts.
 */
import {
  getLaneNetwork,
  getBusStops,
  getStations,
  getIslandRoads,
  distanceToNearestRoad,
  makeTraffic,
  stepTraffic,
  trafficPosition,
  vehicleBox,
  boxesOverlap,
  pointAlong,
  STATION_KINDS,
  STATION_SETBACK,
  STATION_ROAD_CLEARANCE,
  STATION_DWELL,
  STUCK_LIMIT,
  TRAFFIC_FLEET,
  TRAFFIC_WIDTHS,
  TRAFFIC_LENGTHS,
  PAVEMENT_WIDTH,
  stationSignBoard,
  STATION_SIGN_GAP,
  STATION_SIGN_CLEAR,
  STATION_SIGN_MAX_H,
  STATION_SIGN_ASPECT,
  STATION_SIGN_MARGIN
} from '../src/world/islandLayout.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const net = getLaneNetwork()
const stops = getBusStops(net)
const stations = getStations(net)

// ---------------------------------------------------------------------------
console.log('1. There are stations, and they are where they say they are\n')

const byKind = stations.reduce((a, s) => ((a[s.kind] = (a[s.kind] || 0) + 1), a), {})
console.log(`   ${stations.length} stations ${JSON.stringify(byKind)}`)

chk('at least one of each kind',
    ['fire', 'police', 'hospital'].every(k => byKind[k] > 0),
    JSON.stringify(byKind))

chk('every station has the bays its kind calls for',
    stations.every(s => s.bays.length === STATION_KINDS[s.kind].bayCount),
    stations.map(s => `${s.id}:${s.bays.length}`).join(' '))

// The first version tested the circle around the building instead of the
// building, demanded 16 clear units for a fire station, and placed none at
// all. So: how much room does each one actually have?
const tooClose = []
for (const s of stations) {
  const roads = getIslandRoads(s.island)
  // Every corner of the rectangle, not just the centre
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading)
  const sx = -fz, sz = fx

  for (const along of [-1, 1]) {
    for (const across of [-1, 1]) {
      const x = s.x + fx * along * s.depth / 2 + sx * across * s.width / 2
      const z = s.z + fz * along * s.depth / 2 + sz * across * s.width / 2
      const d = distanceToNearestRoad(roads, x - s.island.x, z - s.island.z)
      if (d < STATION_ROAD_CLEARANCE) tooClose.push(`${s.id} ${d.toFixed(1)}`)
    }
  }
}
chk('no corner of any station is in a road', tooClose.length === 0,
    tooClose.join(', '))

chk('every station stands off its own street',
    stations.every(s => {
      const on = pointAlong(net.lanes[s.lane], s.at)
      return Math.hypot(on.x - s.x, on.z - s.z) > PAVEMENT_WIDTH + 4
    }))

// ---------------------------------------------------------------------------
console.log('\n2. A fire engine fits through its own garage door\n')

// `doorWidth` is what World.js builds the openings from, so this is the
// question that matters: how much air is there either side of the widest
// thing that has to go through one?
const clearances = []
for (const s of stations.filter(s => s.garage)) {
  const truck = TRAFFIC_WIDTHS[STATION_KINDS[s.kind].vehicle]
  clearances.push({ id: s.id, each: (s.doorWidth - truck) / 2, truck })
}
for (const c of clearances) {
  console.log(`   ${c.id}: ${c.each.toFixed(2)} units either side of a ${c.truck}-wide engine`)
}
chk('every garage door has clear air either side of the engine',
    clearances.every(c => c.each > 1), clearances.map(c => c.each.toFixed(2)).join(' '))

// And a door must fit inside its own bay, or two openings meet and the front
// of the building is one long hole instead of three doors.
chk('a door is narrower than the bay it serves',
    stations.every(s => s.doorWidth <= s.bayWidth - 0.8),
    stations.map(s => `${s.kind} ${s.doorWidth}/${s.bayWidth}`).join(' '))

// Square to the door, or it catches the frame on the way through. The bay
// heading and the approach->bay direction have to be the same line.
const skew = []
for (const s of stations) {
  for (const bay of s.bays) {
    const dx = bay.x - bay.approach.x
    const dz = bay.z - bay.approach.z
    const heading = Math.atan2(dx, dz)
    let d = heading - bay.heading
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    if (Math.abs(d) > 1e-6) skew.push(`${s.id}#${bay.index} ${d.toFixed(4)}`)
  }
}
chk('every run-in is dead straight and square to the door', skew.length === 0,
    skew.join(', '))

chk('the run-in is long enough to be a manoeuvre, not a jump',
    stations.every(s => s.bays.every(b =>
      Math.hypot(b.x - b.approach.x, b.z - b.approach.z) > 4)))

// Bays inside their own building's width, or a vehicle parks through a wall
const outside = []
for (const s of stations) {
  const sx = -Math.cos(s.heading), sz = Math.sin(s.heading)
  const fx = Math.sin(s.heading), fz = Math.cos(s.heading)
  for (const bay of s.bays) {
    // How far across the frontage, in the building's own axes
    const across = (bay.x - s.x) * fx + (bay.z - s.z) * fz
    if (Math.abs(across) > s.width / 2 - 0.5) outside.push(`${s.id}#${bay.index}`)
  }
}
chk('every bay is within the frontage of its own building',
    outside.length === 0, outside.join(', '))

// ---------------------------------------------------------------------------
console.log('\n3. Four times the fleet, and each has somewhere to go\n')

const vehicles = makeTraffic(net, TRAFFIC_FLEET, stops, stations)
const service = vehicles.filter(v => ['police', 'ambulance', 'fire'].includes(v.kind))
const homed = vehicles.filter(v => v.home)

console.log(`   ${vehicles.length} vehicles, ${service.length} of them service, ` +
            `${homed.length} with a home bay`)

// The numbers themselves are Mike's to choose; what this guards is that there
// are enough of each to fill the bays and still have some out on the streets.
chk('there is a service fleet of every kind',
    TRAFFIC_FLEET.police >= 4 && TRAFFIC_FLEET.ambulance >= 4 &&
    TRAFFIC_FLEET.fire >= 4,
    JSON.stringify(TRAFFIC_FLEET))

chk('no bay is promised to two vehicles',
    new Set(homed.map(v => v.home.station.id + '#' + v.home.bay.index)).size
      === homed.length)

chk('every vehicle is sent to a station of its own kind',
    homed.every(v => STATION_KINDS[v.home.station.kind].vehicle === v.kind),
    homed.filter(v => STATION_KINDS[v.home.station.kind].vehicle !== v.kind)
         .map(v => v.kind).join(' '))

chk('every station can be reached from every lane',
    stations.every(s => s.toHome.every(h => h !== Infinity)),
    stations.filter(s => s.toHome.some(h => h === Infinity)).map(s => s.id).join(' '))

// ---------------------------------------------------------------------------
console.log('\n4. Ten minutes of it, and the bays get used\n')

const dt = 1 / 30
const parkings = []            // one per completed turn-in
const waits = []               // shift end -> in the bay
const since = vehicles.map(() => null)
const wasParking = vehicles.map(() => false)
const parkedOverTime = []
const passes = []              // every run down the home street
const onHome = vehicles.map(() => null)
let overlaps = 0
let streak = 0, worstStreak = 0
let longestStill = 0
const still = vehicles.map(() => 0)

for (let step = 0; step < 600 / dt; step++) {
  const t = step * dt
  stepTraffic(net, vehicles, dt, t)

  vehicles.forEach((v, i) => {
    if (!v.parking) {
      still[i] = v.speed < 0.3 ? still[i] + dt : 0
      longestStill = Math.max(longestStill, still[i])
    } else still[i] = 0

    if (!v.home) return

    const home = !v.parking && v.patrol <= 0 && v.lane === v.home.station.lane
    if (home) onHome[i] = true
    else if (onHome[i]) { passes.push(!!v.parking); onHome[i] = null }

    if (v.patrol <= 0 && !v.parking && since[i] === null) since[i] = t
    if (v.parking && !wasParking[i]) {
      parkings.push({ kind: v.kind, station: v.home.station.id })
      if (since[i] !== null) { waits.push(t - since[i]); since[i] = null }
    }
    wasParking[i] = !!v.parking
  })

  // Collisions, on the road only - a vehicle on its bay path is off the
  // network and cannot be hit
  if (step % 3 === 0) {
    const where = vehicles.map(v => ({ v, ...trafficPosition(net, v) }))
    let any = false
    for (let a = 0; a < where.length; a++) {
      if (where[a].v.parking) continue
      for (let b = a + 1; b < where.length; b++) {
        if (where[b].v.parking) continue
        if (boxesOverlap(vehicleBox(where[a], where[a].v),
                         vehicleBox(where[b], where[b].v))) { overlaps++; any = true }
      }
    }
    // How long one lasts matters more than whether one ever happens. Two
    // vehicles that interpenetrate for a thirtieth of a second and are pulled
    // apart on the next step cannot be seen; a welded pair blocks the road
    // behind it for the rest of the run, and once did for 7,530 frames.
    streak = any ? streak + 1 : 0
    worstStreak = Math.max(worstStreak, streak)
  }

  if (step % 150 === 0) {
    parkedOverTime.push(vehicles.filter(v => v.parking).length)
  }
}

waits.sort((a, b) => a - b)
const sortedParked = [...parkedOverTime].sort((a, b) => a - b)
const median = (a) => a[a.length >> 1]
const turnedIn = passes.filter(Boolean).length

console.log(`   ${parkings.length} vehicles parked, ` +
            `${turnedIn}/${passes.length} runs down the home street turned in`)
console.log(`   shift end to bay: median ${median(waits)?.toFixed(0)}s, ` +
            `slowest ${waits[waits.length - 1]?.toFixed(0)}s`)
console.log(`   parked at once: median ${median(sortedParked)}, ` +
            `most ${sortedParked[sortedParked.length - 1]}`)

// A COUNT, and counts here move with things that are not faults.
//
// How many parkings happen in ten minutes is the fleet size divided by how
// long a round trip takes, and the round trip got longer when the junctions
// were fixed: the median wait from shift end to bay went from 40s to 77s
// because there are fewer junctions to turn at and the runs between them are
// longer. That took the count from 31 to 24 with nothing broken - 24 of 24
// runs down the home street turned in, and there were still three vehicles
// parked at any moment.
//
// So this is kept as a "the parking works at all" floor, and the two checks
// that say whether it works WELL are below: the turn-in rate, and how many
// are in their bays at once.
chk('vehicles come and go from their bays', parkings.length > 20,
    `${parkings.length} in ten minutes`)

// The specific failure: they reached the door and drove past it, because the
// patience valve had moved them on while they queued at the red before it.
chk('a vehicle that reaches its own street turns in',
    passes.length > 10 && turnedIn / passes.length > 0.85,
    `${turnedIn} of ${passes.length}`)

// EVERY STATION IS SOMEBODY'S HOME. Asked of the allocation, not of the
// simulation, and the difference matters.
//
// The bug this was written for was in the allocation: bays were handed out a
// whole station at a time instead of one from each in turn, so with eight
// police cars and three stations of four bays the first two took all eight
// and the third never saw a vehicle. That is a fact about makeTraffic() and
// it can be checked by asking makeTraffic().
//
// It used to be checked by watching ten simulated minutes and seeing whether
// a car turned up at each station, which is a different and weaker question.
// Sixteen service vehicles staggered over nine stations with a ninety-second
// shift each will not all get home inside ten minutes - one station missing
// out is a short window, not a broken station. Over thirty minutes they all
// do. So the allocation is checked exactly, and the simulation is asked the
// question it can answer: are most of the stations busy.
const homes = new Set(vehicles.filter(v => v.home).map(v => v.home.station.id))
chk('every station is somebody\'s home',
    homes.size === stations.length,
    `${homes.size} of ${stations.length}: ` +
    stations.filter(s => !homes.has(s.id)).map(s => s.id).join(' '))

// HOW MANY get a visit in ten minutes is fourteen service vehicles divided
// among however many stations the map ended up with, and the second of those
// is derived. Moving the hub's hospital off the player's garage freed the
// spot it had taken and a tenth station qualified, so the same fourteen
// vehicles are now spread one thinner - 7 of 10 rather than 8 of 9, with
// nothing broken and 22 of 22 runs still turning in.
//
// Two thirds is the floor, and it is a floor for "the service fleet is
// using its stations" rather than a target. If this is ever to read as
// every station busy, the fix is more service vehicles - which the road
// network will not currently carry, see TRAFFIC_FLEET.
const visited = new Set(parkings.map(p => p.station))
chk(`most stations see a vehicle within ten minutes (${visited.size}/${stations.length})`,
    visited.size >= Math.ceil(stations.length * 0.66),
    [...visited].join(' '))

chk('all three kinds of service vehicle park up',
    new Set(parkings.map(p => p.kind)).size === 3,
    [...new Set(parkings.map(p => p.kind))].join(' '))

// The car parks have to LOOK used, which is a different question from whether
// the parking works: an eighteen-second dwell against a ninety-second shift
// left one vehicle parked in the whole world at any given moment.
// Same arithmetic, same cause: fourteen vehicles over ten stations, on
// shifts, is a median of two in their bays at any moment rather than three.
chk('there are usually several vehicles in their bays',
    median(sortedParked) >= 2, `median ${median(sortedParked)}`)

chk('getting home does not take all day',
    median(waits) < 240, `median ${median(waits)?.toFixed(0)}s`)

// And none of this may cost the things that were already true.
//
// Not "never" but "never for long": everything decides from the same
// start-of-step picture, so two vehicles can move into the same gap and be
// pulled apart again by resolveOverlaps on the next step. Over ten minutes
// that happens about once. What must not happen is a pair that stays stuck
// together.
console.log(`   overlapping samples: ${overlaps}, longest run ${worstStreak}`)
chk('no pair of vehicles stays interpenetrated', worstStreak <= 1,
    `${worstStreak} samples in a row`)
chk('and it hardly ever happens at all', overlaps <= 3, `${overlaps}`)

// The backstop fires at STUCK_LIMIT, but a vehicle it cannot find clear ground
// for waits two seconds and asks again - so the real bound is the fuse plus a
// retry or two, not the fuse itself.
chk(`nothing stands still much past the ${STUCK_LIMIT}s fuse`,
    longestStill < STUCK_LIMIT + 20, `${longestStill.toFixed(0)}s`)

// ---------------------------------------------------------------------------
console.log('\n5. The signboard over the doors, and what it may not cover\n')

// The heights World.js builds each kind at, and the door head that goes with
// it. Repeated here rather than imported because World.js needs a browser -
// so the check below reads it as text and fails if these ever drift apart.
const BUILT = {
  fire: { height: 8.5, doorHeight: 5.2 },
  police: { height: 9.5, doorHeight: 3.2 },
  hospital: { height: 14, doorHeight: 3.2 }
}

const world = readFileSync(join(ROOT, 'src/world/World.js'), 'utf8')

for (const [kind, built] of Object.entries(BUILT)) {
  chk(`World.js still builds a ${kind} station ${built.height} tall`,
      new RegExp(`${kind}: \\{\\s*height: ${built.height},`).test(world))
}
chk('and still opens its doors at the heights assumed here',
    /const doorHeight = station\.garage \? 5\.2 : 3\.2/.test(world))

for (const station of stations) {
  const built = BUILT[station.kind]
  const board = stationSignBoard(station, built.height, built.doorHeight)

  chk(`the ${station.kind} station gets a board at all`, !!board)
  if (!board) continue

  const bottom = board.y - board.height / 2
  const top = board.y + board.height / 2

  // THE ONE THAT MATTERS. A fire station has 1.3 units of wall between its
  // door head and its roof band; a board sized to suit the hospital is 2.2
  // and hangs across the opening the engine drives out of.
  chk(`  and it is clear of the ${station.kind} station's doors`,
      bottom >= built.doorHeight + STATION_SIGN_CLEAR - 1e-9,
      `board from ${bottom.toFixed(2)}, door head ${built.doorHeight}`)

  chk('  and clear of the roof band above it',
      top <= built.height - STATION_SIGN_GAP + 1e-9,
      `board to ${top.toFixed(2)}, band at ${(built.height - STATION_SIGN_GAP).toFixed(2)}`)

  chk('  and inside the width of the front wall',
      board.width <= station.width - STATION_SIGN_MARGIN + 1e-9,
      `${board.width.toFixed(2)} on ${station.width}`)

  chk('  and not squeezed out of proportion',
      Math.abs(board.width / board.height - STATION_SIGN_ASPECT) < 1e-6,
      `${(board.width / board.height).toFixed(3)}`)

  chk('  and no taller than a signboard has any business being',
      board.height <= STATION_SIGN_MAX_H + 1e-9, `${board.height.toFixed(2)}`)
}

// The hospital keeps its cross, and the cross and the board are on the same
// wall - so they have to be told apart rather than assumed to miss.
const hospital = stations.find(s => s.kind === 'hospital')
if (hospital) {
  const board = stationSignBoard(hospital, BUILT.hospital.height, BUILT.hospital.doorHeight)
  const crossAt = BUILT.hospital.height * 0.5      // World.js: height * 0.5
  const crossTop = crossAt + 3.4 / 2               // the 3.4-tall upright
  chk('the hospital cross does not run into the signboard',
      crossTop < board.y - board.height / 2,
      `cross to ${crossTop.toFixed(2)}, board from ${(board.y - board.height / 2).toFixed(2)}`)
  chk('and World.js still hangs it where that was worked out',
      /const at = height \* 0\.5/.test(world))
}

// A squat building with a tall door has nowhere to put a sign. It must say so
// rather than returning a board that hangs over the opening.
chk('nowhere to hang one means no board, not a board over the door',
    stationSignBoard({ width: 22 }, 7, 5.2) === null)
chk('and a station with no height at all is not a station',
    stationSignBoard({ width: 22 }, 0, 0) === null)

// A narrow front crops the board rather than letting it overhang the corners
const narrow = stationSignBoard({ width: 6 }, 14, 3.2)
chk('a narrow front crops the board to fit',
    narrow && narrow.width <= 6 - STATION_SIGN_MARGIN + 1e-9,
    `${narrow?.width}`)

chk('World.js asks the layout where the board goes rather than deciding',
    /stationSignBoard\(station, height, doorHeight\)/.test(world))
chk('and draws the badge and the lettering onto one canvas',
    /stationSignMaterial\(/.test(world) && /drawStationBadge\(/.test(world))
chk('every kind of station has a name and a badge to draw',
    /label: 'FIRE STATION', badge: 'maltese'/.test(world) &&
    /label: 'POLICE', badge: 'shield'/.test(world) &&
    /label: 'HOSPITAL', badge: 'cross'/.test(world))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
