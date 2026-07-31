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
  PAVEMENT_WIDTH
} from '../src/world/islandLayout.js'

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

chk('vehicles come and go from their bays', parkings.length > 25,
    `${parkings.length} in ten minutes`)

// The specific failure: they reached the door and drove past it, because the
// patience valve had moved them on while they queued at the red before it.
chk('a vehicle that reaches its own street turns in',
    passes.length > 10 && turnedIn / passes.length > 0.85,
    `${turnedIn} of ${passes.length}`)

chk('every station gets used',
    new Set(parkings.map(p => p.station)).size === stations.length,
    [...new Set(parkings.map(p => p.station))].join(' '))

chk('all three kinds of service vehicle park up',
    new Set(parkings.map(p => p.kind)).size === 3,
    [...new Set(parkings.map(p => p.kind))].join(' '))

// The car parks have to LOOK used, which is a different question from whether
// the parking works: an eighteen-second dwell against a ninety-second shift
// left one vehicle parked in the whole world at any given moment.
chk('there are usually several vehicles in their bays',
    median(sortedParked) >= 3, `median ${median(sortedParked)}`)

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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
