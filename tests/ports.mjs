/**
 * Ports, shipping lanes and the fleet.
 *
 * The thing that can't be checked by looking is whether a ship ever sails
 * over an island. It happens rarely and briefly, out at the edge of the map,
 * and you'd have to be watching the right patch of sea at the right moment.
 * So the fleet is run for a quarter of an hour of simulated time here and
 * every hull is asked, every frame, whether it is standing on land.
 *
 * The lane routing lives in islandLayout.js rather than World.js for the
 * same reason the train timetable does: World.js needs a browser, so the
 * tests can only read it. Logic goes where a test can run it.
 */
import {
  ISLANDS,
  getPort,
  getPorts,
  getPortRoad,
  getPortYard,
  distanceToNearestRoad,
  getSeaGraph,
  seaPath,
  seaVoyage,
  seaLegIsClear,
  makeShips,
  stepShips,
  shipPosition,
  pointAlong,
  measurePath,
  islandAt,
  inlandDistance,
  islandReach,
  getIslandRing,
  getIslandRoads,
  getRoadNetwork,
  getMapExtent,
  PORT_BIG_REACH,
  PORT_APPROACH,
  PIER_LENGTH_BIG,
  PIER_LENGTH_SMALL,
  OFF_WORLD_RADIUS,
  SEA_LANE_MARGIN,
  SHIP_SPEED_CARGO,
  BERTH_RUN_IN,
  SHIP_SPEED_BOAT,
  CARGO_SHIPS,
  SMALL_BOATS,
  CONTAINER_LONG,
  CONTAINER_WIDE,
  CONTAINER_ROAD_CLEARANCE,
  SHED_ROAD_CLEARANCE
} from '../src/world/islandLayout.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const ports = getPorts()
const graph = getSeaGraph()

// ---------------------------------------------------------------------------
console.log('1. Every island gets a port, in a sensible place\n')

chk(`one port per island (${ports.length} of ${ISLANDS.length})`,
    ports.length === ISLANDS.length)

const big = ports.filter(p => p.big)
console.log(`   ${big.length} cargo ports: ${big.map(p => p.id).join(', ')}`)
chk('the big islands get the cargo ports, and only those',
    ports.every(p => p.big === (islandReach(p.island) >= PORT_BIG_REACH)))
chk('there is at least one of each kind',
    big.length > 0 && big.length < ports.length,
    `${big.length} big of ${ports.length}`)

for (const port of ports) {
  const isl = port.island
  const rootInland = inlandDistance(isl, port.localRoot.x, port.localRoot.z)
  const headInland = inlandDistance(isl, port.localHead.x, port.localHead.z)
  const bearing = ((Math.atan2(port.dirX, port.dirZ) * 180) / Math.PI + 360) % 360

  console.log(`   ${port.id.padEnd(9)} ${(port.big ? 'cargo' : 'jetty').padEnd(6)}` +
              ` bearing ${bearing.toFixed(0).padStart(3)}°,` +
              ` root ${rootInland.toFixed(1).padStart(5)} inland,` +
              ` head ${headInland.toFixed(0).padStart(5)},` +
              ` fetch ${port.openWater.toFixed(0)}`)

  // The pier has to start on land and end in the water. Either way round is
  // a pier that either floats or runs inland into a field.
  chk(`${port.id}: the pier root is on land (${rootInland.toFixed(1)})`,
      rootInland > 0, `${rootInland}`)
  chk(`${port.id}: and the head is out in the water (${headInland.toFixed(0)})`,
      headInland < 0, `${headInland}`)
  chk(`${port.id}: the pier is the right length for its size`,
      Math.abs(port.length - (port.big ? PIER_LENGTH_BIG : PIER_LENGTH_SMALL)
        - 5) < 0.01,
      `${port.length}`)

  // Berths must be in the water, or a ship ties up on the beach
  for (const berth of port.berths) {
    const wet = inlandDistance(isl, berth.x - isl.x, berth.z - isl.z)
    chk(`${port.id}: berth is afloat (${wet.toFixed(0)})`, wet < -4, `${wet}`)
  }

  chk(`${port.id}: a cargo port has two berths, a jetty one`,
      port.berths.length === (port.big ? 2 : 1), `${port.berths.length}`)

  // And the approach point has to be reachable water, not inside a headland
  chk(`${port.id}: the approach point is at sea`, !islandAt(port.approach.x, port.approach.z))
  chk(`${port.id}: with a clear run in to the pier head`,
      seaLegIsClear(port.approach, port.head), 'the approach crosses land')
}

// ---------------------------------------------------------------------------
console.log('\n2. You can drive out to the quay')

const net = getRoadNetwork()

for (const port of ports) {
  const road = getPortRoad(port.island)
  chk(`${port.id}: there is a port road`, !!road)

  // It has to start on the ring, or the quay is an island of tarmac
  const ring = getIslandRing(port.island)
  if (ring && road) {
    let onRing = Infinity
    for (const p of ring) {
      onRing = Math.min(onRing,
        Math.hypot(p.x - road.points[0].x, p.z - road.points[0].z))
    }
    chk(`${port.id}: and it starts on the ring road (${onRing.toFixed(2)})`,
        onRing < 0.5, `${onRing}`)
  }

  // and finish on the pier head
  const last = road.points[road.points.length - 1]
  const gap = Math.hypot(
    port.island.x + last.x - port.head.x, port.island.z + last.z - port.head.z)
  chk(`${port.id}: and finishes at the quay (${gap.toFixed(2)})`, gap < 0.5, `${gap}`)

  // The road must be in the drivable network, not just drawn
  const found = net.nodes.some(n =>
    Math.hypot(n.x - port.head.x, n.z - port.head.z) < 8)
  chk(`${port.id}: the quay is part of the road network`, found)

  // And it must be emitted as a road the world will build
  const roads = getIslandRoads(port.island)
  chk(`${port.id}: the world builds it (marked as a spur)`,
      roads.some(r => r.spur), 'no spur road on the island')
}

// ---------------------------------------------------------------------------
console.log('\n3. The lanes are all water')

const kinds = graph.nodes.reduce((a, n) => ((a[n.kind] = (a[n.kind] || 0) + 1), a), {})
let edgeCount = 0
for (const list of graph.edges.values()) edgeCount += list.length
console.log(`   ${graph.nodes.length} nodes ${JSON.stringify(kinds)},` +
            ` ${edgeCount / 2} lanes, ring radius ${graph.radius.toFixed(0)}`)

chk('a berth for every berth in every port',
    kinds.berth === ports.reduce((n, p) => n + p.berths.length, 0))
chk('one approach per port', kinds.approach === ports.length)
chk('and somewhere to sail off to', kinds.offworld > 1)

// The whole reason the lane ring works without obstacle tests between its
// waypoints: every one of them is outside every island.
const laneOnLand = graph.lane.filter(i => islandAt(graph.nodes[i].x, graph.nodes[i].z))
chk('every lane waypoint is in open water', laneOnLand.length === 0,
    `${laneOnLand.length} on land`)
chk(`the lane ring clears the whole map (${graph.radius.toFixed(0)} vs ${getMapExtent().toFixed(0)})`,
    graph.radius >= getMapExtent() + SEA_LANE_MARGIN - 0.01)

// Off-world nodes must be far enough out that a ship vanishing there can't
// be seen. The fog is opaque well before 600 units.
const offNodes = graph.nodes.filter(n => n.kind === 'offworld')
chk(`ships leave beyond sight (${OFF_WORLD_RADIUS} units)`,
    offNodes.every(n => Math.hypot(n.x, n.z) > 600),
    `${Math.min(...offNodes.map(n => Math.hypot(n.x, n.z))).toFixed(0)}`)

// Every edge in the graph, walked
let dirtyEdges = 0
for (const [from, list] of graph.edges) {
  for (const { to } of list) {
    if (!seaLegIsClear(graph.nodes[from], graph.nodes[to], 6)) dirtyEdges++
  }
}
chk('no lane crosses an island', dirtyEdges === 0, `${dirtyEdges / 2} bad legs`)

// A ship comes alongside on a straight run PARALLEL to the quay, from a
// holding point well out to sea. Straight from the approach point to the berth
// kept the ship's centre line clear of the pier but not its hull: a 46-unit
// ship turning in swings its bow seven or eight units sideways, through the
// deck. So what's checked is the swept HULL, not the path.
console.log('\n3b. Ships come alongside without touching the quay')

const HULLS = { cargo: { length: 46, width: 9.5 }, boat: { length: 13, width: 3.8 } }

for (const port of ports) {
  const fx = port.dirX, fz = port.dirZ
  const sx = -fz, sz = fx
  const hull = HULLS[port.big ? 'cargo' : 'boat']

  for (const berth of port.berths) {
    const hold = { x: berth.x + fx * BERTH_RUN_IN, z: berth.z + fz * BERTH_RUN_IN }

    // The run-in must be parallel to the pier, so no turn happens near it
    const dx = berth.x - hold.x, dz = berth.z - hold.z
    const len = Math.hypot(dx, dz)
    const parallel = Math.abs((dx / len) * fx + (dz / len) * fz)

    let closest = Infinity
    for (let t = 0; t <= 1; t += 0.02) {
      const x = hold.x + dx * t
      const z = hold.z + dz * t
      for (const along of [-hull.length / 2, hull.length / 2]) {
        for (const across of [-hull.width / 2, hull.width / 2]) {
          const cx = x + (dx / len) * along + sx * across
          const cz = z + (dz / len) * along + sz * across
          const ox = cx - port.mid.x, oz = cz - port.mid.z
          closest = Math.min(closest, Math.max(
            Math.abs(ox * sx + oz * sz) - port.width / 2,
            Math.abs(oz * fz + ox * fx) - port.length / 2))
        }
      }
    }

    chk(`${port.id}: the run-in is parallel to the quay (${parallel.toFixed(3)})`,
        parallel > 0.999, `${parallel}`)
    chk(`${port.id}: and the hull clears the deck by ${closest.toFixed(2)}`,
        closest > 1, `${closest}`)
  }
}

chk('every berth has a holding point to line up from',
    graph.nodes.filter(n => n.kind === 'hold').length ===
    ports.reduce((n, p) => n + p.berths.length, 0))

// ---------------------------------------------------------------------------
console.log('\n4. Anywhere can be reached from anywhere')

const berthNodes = graph.nodes.map((n, i) => ({ n, i }))
  .filter(x => x.n.kind === 'berth').map(x => x.i)
const offIdx = graph.nodes.map((n, i) => ({ n, i }))
  .filter(x => x.n.kind === 'offworld').map(x => x.i)

let unreachable = 0
for (const a of berthNodes) {
  for (const b of [...berthNodes, ...offIdx]) {
    if (a !== b && !seaPath(graph, a, b)) unreachable++
  }
}
chk('every berth can reach every other berth and the open sea',
    unreachable === 0, `${unreachable} pairs`)

let longest = 0
let crossings = 0
for (const a of berthNodes) {
  for (const b of berthNodes) {
    if (a === b) continue
    const voyage = seaVoyage(graph, a, b)
    if (!voyage) continue
    longest = Math.max(longest, voyage.length)
    for (let d = 0; d < voyage.length; d += 5) {
      const p = pointAlong(voyage, d)
      if (islandAt(p.x, p.z)) { crossings++; break }
    }
  }
}
console.log(`   longest port-to-port voyage ${longest.toFixed(0)} units`)
chk('no port-to-port voyage sails over an island', crossings === 0, `${crossings}`)

// ---------------------------------------------------------------------------
console.log('\n5. The fleet sails')

const ships = makeShips(graph)
console.log(`   ${ships.filter(s => s.kind === 'cargo').length} cargo,` +
            ` ${ships.filter(s => s.kind === 'boat').length} boats`)
chk(`the right size fleet (${ships.length})`, ships.length === CARGO_SHIPS + SMALL_BOATS)
// Some of the fleet deliberately starts out at sea, so the harbours aren't
// all full and still at the moment the world loads.
const atBerth = ships.filter(s => graph.nodes[s.at].kind === 'berth')
const atSea = ships.filter(s => graph.nodes[s.at].kind === 'offworld')
console.log(`   ${atBerth.length} start alongside, ${atSea.length} already at sea`)
chk('every ship starts either at a berth or out at sea',
    atBerth.length + atSea.length === ships.length)
chk('some start at sea, so there is traffic from the first frame', atSea.length > 0)
chk('no two ships start in the same berth',
    new Set(atBerth.map(s => s.at)).size === atBerth.length,
    atBerth.map(s => s.at).join(','))
chk('cargo ships alongside are at cargo ports',
    ships.filter(s => s.kind === 'cargo' && graph.nodes[s.at].kind === 'berth')
      .every(s => graph.nodes[s.at].port.big))

const dt = 1 / 30
const minutes = 15
const calls = new Map(ports.map(p => [p.id, 0]))
let onLand = 0
let tooFast = 0
let departures = 0
let arrivals = 0
let overlaps = 0
let wrongBerth = 0
const wasDocked = ships.map(() => false)
const wasOff = ships.map(() => false)

for (let step = 0; step < (minutes * 60) / dt; step++) {
  stepShips(graph, ships, dt)

  const here = []

  ships.forEach((ship, i) => {
    const at = shipPosition(graph, ship)

    // The one that matters
    if (islandAt(at.x, at.z)) onLand++

    const top = ship.kind === 'cargo' ? SHIP_SPEED_CARGO : SHIP_SPEED_BOAT
    if (ship.speedNow > top + 1e-9) tooFast++

    const docked = ship.dwell > 0
    if (docked && !wasDocked[i]) {
      const node = graph.nodes[ship.at]
      if (node.kind === 'berth') {
        arrivals++
        calls.set(node.port.id, calls.get(node.port.id) + 1)
        if (ship.kind === 'cargo' && !node.port.big) wrongBerth++
      }
    }
    wasDocked[i] = docked

    const gone = Math.hypot(at.x, at.z) > OFF_WORLD_RADIUS * 0.9
    if (gone && !wasOff[i]) departures++
    wasOff[i] = gone

    here.push({ i, at, ship })
  })

  // Two hulls in the same place. Only checked while both are alongside -
  // ships passing at sea are allowed to be near each other.
  for (let a = 0; a < here.length; a++) {
    for (let b = a + 1; b < here.length; b++) {
      if (!here[a].at.docked || !here[b].at.docked) continue
      const d = Math.hypot(here[a].at.x - here[b].at.x, here[a].at.z - here[b].at.z)
      if (d < 14) overlaps++
    }
  }
}

console.log('   port calls: ' + [...calls].map(([k, v]) => `${k}:${v}`).join(' '))
console.log(`   ${arrivals} arrivals, ${departures} departures off the map,` +
            ` voyages per ship ${ships.map(s => s.voyages).join('/')}`)

chk('no ship ever sails over land', onLand === 0, `${onLand} frames`)
chk('no ship exceeds its speed', tooFast === 0, `${tooFast} frames`)
chk('every port gets used', [...calls.values()].every(v => v > 0),
    [...calls].map(([k, v]) => `${k}:${v}`).join(' '))
chk(`ships do leave the world (${departures})`, departures > 0)
chk(`and come back (${arrivals} arrivals)`, arrivals > departures)
chk('cargo never ties up at a fishing jetty', wrongBerth === 0, `${wrongBerth}`)
chk('two ships never share a berth', overlaps === 0, `${overlaps} frames`)
chk('every ship made several voyages',
    ships.every(s => s.voyages >= 3), ships.map(s => s.voyages).join(','))

// A long frame must not fling a ship past the end of its voyage
const jolted = makeShips(graph)
for (let i = 0; i < 60; i++) stepShips(graph, jolted, 0.8)
chk('a stuttering frame rate keeps them on their lanes',
    jolted.every(s => {
      const p = shipPosition(graph, s)
      return Number.isFinite(p.x) && !islandAt(p.x, p.z)
    }))

// ---------------------------------------------------------------------------
console.log('\n6. The shared path machinery')

// measurePath and pointAlong are used by the monorail too, so a change here
// moves the trains as well.
const path = measurePath([{ x: 0, z: 0 }, { x: 10, z: 0 }, { x: 10, z: 10 }])
chk('a path measures its own length', Math.abs(path.length - 20) < 1e-9, `${path.length}`)
chk('halfway along is halfway along',
    Math.abs(pointAlong(path, 10).x - 10) < 1e-9 &&
    Math.abs(pointAlong(path, 10).z - 0) < 1e-9)
chk('past the end clamps rather than running on',
    pointAlong(path, 500).z === 10, JSON.stringify(pointAlong(path, 500)))
chk('and wraps when asked to',
    Math.abs(pointAlong(path, 20 + 5, true).x - 5) < 1e-9,
    JSON.stringify(pointAlong(path, 25, true)))

// ---------------------------------------------------------------------------
console.log('\nThe cargo yard: on the ground, and off the road\n')

// Both of these were reported from a screenshot, and both are the same class
// of mistake: something in the port was positioned without asking where it
// ended up.
//
//   - containers were given a random LEVEL of 0, 1 or 2, so two thirds of them
//     stood in mid-air with nothing underneath;
//   - and they were tested by their CENTRE against a flat five units, so a
//     six-unit box could have a corner two units from the kerb.
const yards = getPorts()
  .map(port => ({ port, yard: getPortYard(port) }))
  .filter(y => y.yard.shed || y.yard.containers.length)

console.log(`   ${yards.length} yards, ` +
  yards.map(y => `${y.port.id}: ${y.yard.containers.length} containers`).join(', '))

chk('a big port has a yard', yards.length === getPorts().filter(p => p.big).length,
    `${yards.length}`)

// Every level above the ground has one below it holding it up
const floating = []
for (const { port, yard } of yards) {
  const stacks = new Map()
  for (const box of yard.containers) {
    const key = `${box.x.toFixed(2)},${box.z.toFixed(2)}`
    if (!stacks.has(key)) stacks.set(key, new Set())
    stacks.get(key).add(box.level)
  }
  for (const [key, levels] of stacks) {
    for (const level of levels) {
      if (level > 0 && !levels.has(level - 1)) floating.push(`${port.id} ${key} @${level}`)
    }
  }
}
chk('no container floats in mid-air', floating.length === 0, floating.join(', '))

// Corners, not centres - for the containers and for the shed
const intruding = []
for (const { port, yard } of yards) {
  const island = port.island
  const roads = getIslandRoads(island)

  const boxes = yard.containers.map(c =>
    ({ ...c, width: CONTAINER_LONG, depth: CONTAINER_WIDE,
       margin: CONTAINER_ROAD_CLEARANCE, what: 'container' }))
  if (yard.shed) {
    boxes.push({ x: yard.shed.x, z: yard.shed.z, heading: yard.shed.heading,
                 width: yard.shed.width, depth: yard.shed.depth,
                 margin: SHED_ROAD_CLEARANCE, what: 'shed' })
  }

  for (const box of boxes) {
    const fx = Math.sin(box.heading), fz = Math.cos(box.heading)
    const sx = -fz, sz = fx

    for (const a of [-1, 1]) {
      for (const b of [-1, 1]) {
        const x = box.x + sx * a * box.width / 2 + fx * b * box.depth / 2
        const z = box.z + sz * a * box.width / 2 + fz * b * box.depth / 2
        const clear = distanceToNearestRoad(roads, x - island.x, z - island.z)
        if (clear < box.margin - 1e-6) {
          intruding.push(`${port.id} ${box.what} ${clear.toFixed(1)}`)
        }
        if (inlandDistance(island, x - island.x, z - island.z) < 0) {
          intruding.push(`${port.id} ${box.what} in the water`)
        }
      }
    }
  }
}
chk('every corner of every container and shed is clear of the roads',
    intruding.length === 0, [...new Set(intruding)].slice(0, 6).join(', '))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
