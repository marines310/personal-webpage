/**
 * The airport: where it sits, and whether it fits.
 *
 * A platform out at sea is the one structure in this world that has nothing
 * to stand on, so every claim about it has to be measured against something
 * real: the islands' actual coastlines, the bridge crossings, and the water
 * the ships actually sail through.
 *
 * Three of these checks exist because the first version got them wrong, and
 * all three are the same mistake this project keeps making - scoring a
 * position from a formula for the thing rather than from the thing:
 *
 *  - the site was scored against a FORMULA for the platform's size while the
 *    layout built a slightly different one, so a corner came out 26 units off
 *    CONTACT where 30 were asked for;
 *  - the site is not the platform's centre - the runway is on one side and the
 *    terminal on the other - so scoring the site scored the wrong point;
 *  - the shipping lane was checked against the ring's RADIUS, but a ship sails
 *    the chord between two waypoints and a chord dips inside the arc.
 */
import { PLANE_TURN_EASE, PLANE_TURN_RATE } from '../src/world/World.js'
import {
  ISLANDS,
  BRIDGES,
  getIsland,
  getAirport,
  platformCorners,
  shippingRingRadius,
  innermostShippingLane,
  shoreDistance,
  getMonorailRoute,
  AIRPORT_CLEARANCE,
  AIRPORT_MAX_SPAN,
  AIRPORT_RUNWAY_LENGTH,
  AIRPORT_RUNWAY_WIDTH,
  PLANE_LENGTH,
  PLANE_SPAN,
  PLANE_TURNAROUND,
  PLANE_ACCEL,
  PLANE_SPEED_TAXI,
  planeSpeedAt,
  AIRPORT_TOUCHDOWN,
  AIRPORT_ROTATE_AT,
  TAXI_CORNER,
  roundCorners,
  measurePath,
  pointAlong,
  AIRPORT_APPROACH_HEIGHT,
  getAirGraph,
  makePlanes,
  stepPlanes,
  planePosition,
  getApronRoad,
  getAirportCauseway,
  getCausewayRoadPath,
  getPort,
  getLaneNetwork,
  islandAt,
  AIRPORT_ROAD_MARGIN,
  AIRPORT_ROAD_WIDTH,
  AIRPORT_TERMINAL_DEPTH,
  AIRPORT_EDGE,
  CAUSEWAY_CORNER_CLEAR,
  CAUSEWAY_PORT_CLEAR,
  CAUSEWAY_DECK_MARGIN
} from '../src/world/islandLayout.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const air = getAirport()

console.log('1. There is an airport, and it is somewhere')
chk('a site was found', !!air)
if (!air) {
  console.log('\n0 passed, 1 failed')
  process.exit(1)
}
console.log(`   platform ${air.platform.length.toFixed(0)} x ${air.platform.width.toFixed(0)}` +
            ` at (${air.x.toFixed(0)}, ${air.z.toFixed(0)})`)

// How far a point is beyond the nearest island's real shore, in the direction
// that island sees it. The bounding circle is not good enough and never has
// been: it is what gave the hub a quay facing a 36-unit gap.
const openWater = (x, z) => {
  let worst = Infinity
  let who = ''
  for (const island of ISLANDS) {
    const dx = x - island.x
    const dz = z - island.z
    const d = Math.hypot(dx, dz) - shoreDistance(island, dx, dz)
    if (d < worst) { worst = d; who = island.id }
  }
  return { d: worst, who }
}

console.log('\n2. Every corner of it is in open water')
// The CORNERS, not the centre. A platform is a rectangle and the circle round
// it reaches 27 units further on this one.
let worstCorner = { d: Infinity, who: '' }
for (const corner of platformCorners(air)) {
  const w = openWater(corner.x, corner.z)
  if (w.d < worstCorner.d) worstCorner = w
}
console.log(`   worst corner is ${worstCorner.d.toFixed(0)}u clear of ${worstCorner.who}`)
chk(`no corner is aground (worst ${worstCorner.d.toFixed(0)}u)`, worstCorner.d > 0,
    `${worstCorner.d.toFixed(1)}`)
chk(`and every corner keeps its clearance (${AIRPORT_CLEARANCE}u)`,
    worstCorner.d >= AIRPORT_CLEARANCE, `${worstCorner.d.toFixed(1)}`)

console.log('\n3. Something could actually reach it')
// Sited out of reach it would be scenery. The centre is what a link would be
// measured to, so the centre is what is checked.
const toLand = openWater(air.x, air.z)
console.log(`   nearest land is ${toLand.d.toFixed(0)}u away (${toLand.who})`)
chk(`within a crossing's reach (${AIRPORT_MAX_SPAN}u)`, toLand.d <= AIRPORT_MAX_SPAN,
    `${toLand.d.toFixed(0)}`)

console.log('\n4. It is not sitting in a bridge crossing')
// The arrival at an island is the view every visitor gets, and a runway
// across it is not it. Same reasoning as the ports.
const offBridges = (x, z) => {
  let worst = Infinity
  for (const def of BRIDGES) {
    const from = getIsland(def.from)
    const to = getIsland(def.to)
    if (!from || !to) continue
    const vx = to.x - from.x
    const vz = to.z - from.z
    const len2 = vx * vx + vz * vz || 1
    let u = ((x - from.x) * vx + (z - from.z) * vz) / len2
    u = Math.max(0, Math.min(1, u))
    worst = Math.min(worst, Math.hypot(x - (from.x + vx * u), z - (from.z + vz * u)))
  }
  return worst
}
let worstBridge = Infinity
for (const corner of platformCorners(air)) {
  worstBridge = Math.min(worstBridge, offBridges(corner.x, corner.z))
}
console.log(`   closest bridge passes ${worstBridge.toFixed(0)}u from a corner`)
chk('no corner sits in a crossing', worstBridge >= 25, `${worstBridge.toFixed(0)}`)

console.log('\n5. The ships still have their lane')
// Against where a ship actually GOES, not where the waypoints are. The
// waypoints sit on the ring; a ship sails the chord between two of them, and
// the chord dips inside the arc - 10 units on this map, which is a third of
// the clearance the radius would have claimed.
let reaches = 0
for (const corner of platformCorners(air)) {
  reaches = Math.max(reaches, Math.hypot(corner.x, corner.z))
}
console.log(`   ring ${shippingRingRadius().toFixed(0)}u, ships come no closer than ` +
            `${innermostShippingLane().toFixed(0)}u, the platform reaches ${reaches.toFixed(0)}u`)
chk('the platform stays out of the shipping lane',
    reaches <= innermostShippingLane() - AIRPORT_CLEARANCE,
    `${reaches.toFixed(0)} vs ${(innermostShippingLane() - AIRPORT_CLEARANCE).toFixed(0)}`)
chk('and the chord, not the radius, is what it was measured against',
    innermostShippingLane() < shippingRingRadius())

console.log('\n6. The monorail is nowhere near it')
let nearestBeam = Infinity
const route = getMonorailRoute()
for (const p of (route.points || route)) {
  nearestBeam = Math.min(nearestBeam, Math.hypot(p.x - air.x, p.z - air.z))
}
console.log(`   nearest beam point ${nearestBeam.toFixed(0)}u away`)
chk('the line does not pass over the airport', nearestBeam > air.platform.width)

console.log('\n7. The pieces fit on the platform they are drawn on')
// Measured along and across the runway, because that is how the platform is
// built. A stand that fits "on the platform" by its centre and hangs its
// wingtip over the edge is the containers-at-the-kerb bug again.
const alongOf = p => (p.x - air.x) * air.along.x + (p.z - air.z) * air.along.z
const acrossOf = p => (p.x - air.x) * air.across.x + (p.z - air.z) * air.across.z
const platAcross = acrossOf(air.platform)

// Distance across from the RUNWAY's centre line, which is what "overlaps the
// runway" means. This used to measure from the airport's own origin, which
// was the runway's middle at the time and quietly stopped being it when the
// platform was re-centred so the terminal could go on the seaward side. The
// check then read every stand as sitting on the runway. Measure from the
// thing the question is about.
const runwayMid = {
  x: (air.runway.from.x + air.runway.to.x) / 2,
  z: (air.runway.from.z + air.runway.to.z) / 2
}
const acrossOfRunway = p =>
  (p.x - runwayMid.x) * air.across.x + (p.z - runwayMid.z) * air.across.z

let standsOn = 0
let standsClear = 0
for (const stand of air.stands) {
  const along = Math.abs(alongOf(stand)) + PLANE_LENGTH / 2
  const across = Math.abs(acrossOf(stand) - platAcross) + PLANE_SPAN / 2
  if (along <= air.platform.length / 2 && across <= air.platform.width / 2) standsOn++
  // And clear of the runway itself - a parked aircraft on the runway is not
  // a parked aircraft, it is a crash.
  if (Math.abs(acrossOfRunway(stand)) - PLANE_SPAN / 2 > AIRPORT_RUNWAY_WIDTH / 2) standsClear++
}
console.log(`   ${air.stands.length} stands`)
chk('every aircraft on stand is over the platform, wingtips included',
    standsOn === air.stands.length, `${standsOn} of ${air.stands.length}`)
chk('and no stand overlaps the runway',
    standsClear === air.stands.length, `${standsClear} of ${air.stands.length}`)

const runLen = Math.hypot(air.runway.to.x - air.runway.from.x,
                          air.runway.to.z - air.runway.from.z)
console.log(`   runway ${runLen.toFixed(0)}u long`)
chk('the runway is as long as it says it is',
    Math.abs(runLen - AIRPORT_RUNWAY_LENGTH) < 0.5,
    `${runLen.toFixed(1)} vs ${AIRPORT_RUNWAY_LENGTH}`)
chk('and long enough for the aircraft using it',
    runLen >= PLANE_LENGTH * 6, `${runLen.toFixed(0)} vs ${PLANE_LENGTH * 6}`)

console.log('\n8. Moving an island moves the airport')
// Nothing about this is written down, which is the whole point: the site is
// derived, so the editor cannot leave the airport stranded on land.
//
// Demonstrated rather than asserted. "There is a getAirport function and
// mapData doesn't mention an airport" would pass just as happily against a
// hardcoded pair of coordinates inside that function, which is exactly the
// kind of check that passes for the wrong reason.
//
// A fresh copy of the module, so this can't poison the checks above - and the
// island is moved in THAT copy's ISLANDS, which is the array its getAirport
// reads.
const fresh = await import('../src/world/islandLayout.js?moved=1')
const moved = fresh.ISLANDS.find(i => i.id === 'about')
const wasX = moved.x
const wasZ = moved.z
moved.x -= 150
moved.z += 120
const after = fresh.getAirport()
moved.x = wasX
moved.z = wasZ

const shifted = after
  ? Math.hypot(after.x - air.x, after.z - air.z)
  : 0
console.log(`   moving ABOUT 192u moved the airport ${shifted.toFixed(0)}u`)
chk('the airport re-sites itself when the map changes', !!after && shifted > 10,
    `${shifted.toFixed(0)}u`)

console.log('\n9. Fifteen minutes of flying')
// The trains taught this: "did it stop at least six times" passed while three
// trains sat at their first platform for four hundred seconds, having stopped
// there 89 times. What caught it was asking WHICH stations they called at. So
// this counts phases entered, stands visited and round trips completed, not
// merely that something moved.
const graph = getAirGraph(air)
const planes = makePlanes(graph)
console.log(`   fleet of ${planes.length}`)
chk('the fleet gets built', planes.length > 0)

const phasesSeen = new Set()
const standsVisited = new Set()
let bothOnRunway = 0
let longestHold = 0
let lowestFlying = Infinity
let highest = 0
const heldFor = {}
const step = 1 / 30

for (let t = 0; t < 900; t += step) {
  stepPlanes(graph, planes, step)

  const onRunway = planes.filter(p => ['finals', 'rollout', 'takeoff'].includes(p.phase))
  if (onRunway.length > 1) bothOnRunway++

  for (const plane of planes) {
    phasesSeen.add(plane.phase)
    if (plane.phase === 'stand') standsVisited.add(plane.stand)

    heldFor[plane.id] = plane.holding ? (heldFor[plane.id] || 0) + step : 0
    longestHold = Math.max(longestHold, heldFor[plane.id])

    const where = planePosition(graph, plane)
    highest = Math.max(highest, where.y)
    if (plane.phase === 'inbound' || plane.phase === 'outbound') {
      lowestFlying = Math.min(lowestFlying, where.y)
    }
  }
}

console.log(`   phases flown: ${[...phasesSeen].sort().join(', ')}`)
chk('every part of the cycle actually happens',
    ['inbound', 'finals', 'rollout', 'taxiIn', 'stand', 'taxiOut', 'takeoff', 'outbound']
      .every(p => phasesSeen.has(p)),
    [...phasesSeen].join(','))

console.log('\n10. Only one aircraft on the runway at a time')
// The whole of the separation rule, and the only thing here that can block.
chk(`nothing shared the runway (${bothOnRunway} frames)`, bothOnRunway === 0,
    `${bothOnRunway}`)

console.log('\n11. And nothing waits for ever to get on it')
// The counterpart. Holding is allowed in the two places where it is free -
// the holding point and the approach fix - so a bound on it is what says the
// rule is separation rather than deadlock.
console.log(`   longest hold ${longestHold.toFixed(1)}s`)
chk('holds are separation, not gridlock', longestHold < PLANE_TURNAROUND * 3,
    `${longestHold.toFixed(1)}s`)

console.log('\n12. They come and go, and they park')
const arrivals = planes.reduce((n, p) => n + (p.arrivals || 0), 0)
const departures = planes.reduce((n, p) => n + (p.departures || 0), 0)
console.log(`   ${arrivals} arrivals, ${departures} departures, ` +
            `${standsVisited.size} of ${air.stands.length} stands used`)
chk('aircraft arrive', arrivals >= planes.length, `${arrivals}`)
chk('aircraft leave', departures >= planes.length, `${departures}`)
// Balanced without being counted, because off-world always routes back to a
// stand - the same trick the shipping uses.
chk('and the two balance', Math.abs(arrivals - departures) <= planes.length,
    `${arrivals} vs ${departures}`)
chk('every stand gets used', standsVisited.size === air.stands.length,
    `${standsVisited.size} of ${air.stands.length}`)

console.log('\n13. They fly at a sensible height')
// pointAlong used to drop `y` altogether, because everything that had ever
// asked it was flat. An aircraft would have flown its entire approach at sea
// level and the descent would have been invisible.
console.log(`   highest ${highest.toFixed(0)}u, lowest while airborne ${lowestFlying.toFixed(0)}u`)
chk('they climb', highest > AIRPORT_APPROACH_HEIGHT, `${highest.toFixed(0)}`)
chk('and they are never at sea level while flying the cruise',
    lowestFlying > AIRPORT_APPROACH_HEIGHT * 0.5, `${lowestFlying.toFixed(1)}`)

// ---------------------------------------------------------------------------
console.log('\n14. You can drive there')

/**
 * The airport has been standable-on since the day it was sited - the deck was
 * always a collider - but for as long as nothing reached it, it was scenery
 * you flew past. These checks are about the road link, and every one of them
 * measures the ROAD'S OWN KERBS rather than its centre line, because a road is
 * eight and a half units wide and "the centre line is on the platform" is the
 * kind of true statement that leaves half a carriageway over the sea.
 */
const loop = getApronRoad(air)
const way = getAirportCauseway()
const drive = getCausewayRoadPath()

chk('there is a perimeter road', !!loop)
chk('and a causeway to it', !!way)
chk('and one continuous road along it', !!drive)

if (loop && way && drive) {
  // Into the platform's own frame, which is where every distance on it means
  // something.
  const frame = (p) => ({
    along: (p.x - air.x) * air.along.x + (p.z - air.z) * air.along.z,
    across: (p.x - air.x) * air.across.x + (p.z - air.z) * air.across.z
  })

  const halfL = air.platform.length / 2
  const halfW = air.platform.width / 2
  const kerb = AIRPORT_ROAD_WIDTH / 2

  // The platform has to have room for a road at all. This is the check that
  // would have caught the footprint sum double-counting: it made the deck 93
  // wide against 90 units of content, so the runway finished ONE unit from the
  // edge and there was nowhere on the whole platform a road could go.
  console.log(`   platform ${air.platform.length} x ${air.platform.width},` +
              ` margin ${AIRPORT_ROAD_MARGIN}, road ${AIRPORT_ROAD_WIDTH} wide`)
  chk(`the deck keeps its ${AIRPORT_EDGE}u margin all round`,
      halfW >= AIRPORT_RUNWAY_WIDTH / 2 + AIRPORT_EDGE &&
      halfL >= AIRPORT_RUNWAY_LENGTH / 2 + AIRPORT_EDGE)

  // Every point of the loop, both kerbs, against everything it must miss.
  const runwayHalf = AIRPORT_RUNWAY_WIDTH / 2
  const terminal = frame(air.terminal)
  let offDeck = 0
  let onRunway = 0
  let inTerminal = 0
  let closestToEdge = Infinity

  for (let i = 0; i < loop.points.length; i++) {
    const p = loop.points[i]
    // The kerb is perpendicular to the road's OWN direction here, not to the
    // rectangle. On the four straights those are the same thing; on the corner
    // arcs they are not, and using the rectangle's axes put an imaginary kerb
    // four units sideways from a road that was turning - which reported a
    // point on the runway that no vehicle could ever occupy.
    const q = loop.points[(i + 1) % loop.points.length]
    const r = loop.points[(i - 1 + loop.points.length) % loop.points.length]
    const dx = q.x - r.x
    const dz = q.z - r.z
    const len = Math.hypot(dx, dz) || 1

    for (const side of [1, -1]) {
      const f = frame({
        x: p.x + (-dz / len) * side * kerb,
        z: p.z + (dx / len) * side * kerb
      })
      const a = f.along
      const c = f.across

      if (Math.abs(a) > halfL || Math.abs(c) > halfW) offDeck++
      closestToEdge = Math.min(closestToEdge, halfW - Math.abs(c), halfL - Math.abs(a))

      if (Math.abs(c - frame(air.runway.from).across) < runwayHalf &&
          Math.abs(a) < AIRPORT_RUNWAY_LENGTH / 2) onRunway++

      if (Math.abs(c - terminal.across) < AIRPORT_TERMINAL_DEPTH / 2 &&
          Math.abs(a - terminal.along) < air.terminal.length / 2) inTerminal++
    }
  }

  console.log(`   the loop's kerbs come within ${closestToEdge.toFixed(1)}u of the deck edge`)
  chk('the whole width of the loop is on the platform', offDeck === 0, `${offDeck} points`)
  chk('and none of it is on the runway', onRunway === 0, `${onRunway} points`)
  chk('and none of it is inside the terminal', inTerminal === 0, `${inTerminal} points`)

  // The loop passes the terminal's front door, which is the whole reason it
  // goes round the outside instead of straight in: a road that crossed the
  // runway would be shorter and unusable.
  let atTheDoor = Infinity
  for (const p of loop.points) {
    const f = frame(p)
    if (Math.abs(f.along - terminal.along) > air.terminal.length / 2) continue
    atTheDoor = Math.min(atTheDoor,
      Math.abs(f.across - terminal.across) - AIRPORT_TERMINAL_DEPTH / 2)
  }
  console.log(`   it passes the terminal front at ${atTheDoor.toFixed(1)}u`)
  chk('the loop is the terminal forecourt as well as the perimeter',
      atTheDoor > 0 && atTheDoor < 20, `${atTheDoor.toFixed(1)}u`)

  // The causeway: where it lands, and what it stays away from.
  const landing = frame(way.landing)
  // How far along its own straight the landing sits. One of the two terms is
  // zero - the landing is ON an edge, so it is flush with the rectangle in
  // that axis - and the other is the distance to the nearer bend.
  const fromCorner = Math.max(
    loop.halfLength - Math.abs(landing.along),
    loop.halfWidth - Math.abs(landing.across))
  console.log(`   the causeway crosses ${way.water.toFixed(0)}u of water from ${way.island.id}`)
  chk('the causeway lands on a straight, not on a bend',
      fromCorner >= CAUSEWAY_CORNER_CLEAR - 1e-6, `${fromCorner.toFixed(1)}u from the corner`)

  const port = getPort(way.island)
  if (port) {
    // Sampled along both, because a bearing tells you nothing: the first
    // version came ashore 9.8 units from BLOG's pier at 5.6 degrees to it.
    let nearest = Infinity
    for (let i = 0; i <= 40; i++) {
      const t = i / 40
      const x = way.root.x + (way.landing.x - way.root.x) * t
      const z = way.root.z + (way.landing.z - way.root.z) * t
      for (let j = 0; j <= 40; j++) {
        const u = j / 40
        const px = port.root.x + (port.head.x - port.root.x) * u
        const pz = port.root.z + (port.head.z - port.root.z) * u
        nearest = Math.min(nearest, Math.hypot(x - px, z - pz))
      }
    }
    console.log(`   and passes ${nearest.toFixed(0)}u from that island's quay`)
    chk('the causeway is not a second pier alongside the first',
        nearest >= (port.width + AIRPORT_ROAD_WIDTH) / 2 + CAUSEWAY_PORT_CLEAR - 1,
        `${nearest.toFixed(1)}u`)
  }

  // THE ONE THAT MATTERS: no stretch of the drive is over open water without
  // a deck under it. Walked along the road with both kerbs, and every point
  // has to be on land, on the causeway deck, or on the platform.
  const onSomething = (x, z) => {
    if (islandAt(x, z)) return true
    const f = frame({ x, z })
    if (Math.abs(f.along) <= halfL && Math.abs(f.across) <= halfW) return true
    // The causeway deck, in its own frame
    const dx = x - way.root.x
    const dz = z - way.root.z
    const alongDeck = dx * way.dirX + dz * way.dirZ
    const acrossDeck = Math.abs(dx * way.dirZ - dz * way.dirX)
    return alongDeck >= -1 && alongDeck <= way.deckLength + 1 &&
           acrossDeck <= (way.width + CAUSEWAY_DECK_MARGIN) / 2
  }

  let overWater = 0
  const pts = drive.points
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x
    const dz = pts[i].z - pts[i - 1].z
    const len = Math.hypot(dx, dz) || 1
    for (const side of [-1, 0, 1]) {
      const ox = (-dz / len) * side * (drive.width / 2)
      const oz = (dx / len) * side * (drive.width / 2)
      if (!onSomething(pts[i].x + ox, pts[i].z + oz)) overWater++
    }
  }
  chk('every part of the drive has something under it', overWater === 0,
      `${overWater} kerb points over open water`)

  // And it is joined to the rest of the world, not a road on its own.
  const net = getLaneNetwork()
  const kinds = {}
  for (const l of net.lanes) kinds[l.kind] = (kinds[l.kind] || 0) + 1
  console.log(`   lanes: causeway ${kinds.causeway || 0}, apron ${kinds.apron || 0}`)
  chk('the causeway carries lanes', (kinds.causeway || 0) >= 2)
  chk('and so does the loop', (kinds.apron || 0) >= 2)

  // A route out: from a lane on the loop, can a driver reach an island?
  const seen = new Set()
  const queue = net.lanes
    .map((l, i) => ({ l, i }))
    .filter(o => o.l.kind === 'apron')
    .map(o => o.i)
  let reachedLand = false
  while (queue.length) {
    const i = queue.shift()
    if (seen.has(i)) continue
    seen.add(i)
    if (net.lanes[i].island) { reachedLand = true; break }
    for (const n of net.lanes[i].next) queue.push(n)
  }
  chk('and you can drive from the airport back to an island', reachedLand)
}

// ---------------------------------------------------------------------------
console.log('\n12. Smooth takeoffs, landings and taxiing\n')

// Mike, twice. First: "for the airplanes, can you make the takeoff, landing and
// taxiing sequence look smoother? They're way too jagged." Then, after the
// first attempt: "I just noticed an aircraft land and then immediately turn
// left in an instant turn motion... the landing animation is too short."
//
// The first round fixed the speed steps and the heading and pitch WITHIN a
// phase, and the test said so - because it measured within a phase and
// explicitly skipped the boundaries. The boundaries were the whole complaint.
{
  const graph = getAirGraph(getAirport())
  const planes = makePlanes(graph)
  const deg = (r) => r * 180 / Math.PI

  let worstSpeedJump = 0
  let worstPitchJump = 0
  const worstTurn = {}
  const seen = new Set()
  const last = new Map()

  // THE DRAWN heading, eased exactly as World.js eases it, because that is what
  // is actually on the screen. The route's own heading is allowed to change
  // outright at a boundary; what may not is the aircraft.
  const drawn = new Map()
  let worstDrawnTurn = 0

  for (let i = 0; i < 30000; i++) {
    stepPlanes(graph, planes, 1 / 30)
    for (const p of planes) {
      const where = planePosition(graph, p)
      seen.add(p.phase)
      const was = last.get(p)

      if (was) {
        if (was.phase === p.phase) {
          worstSpeedJump = Math.max(worstSpeedJump, Math.abs((p.speed || 0) - was.speed))
          worstPitchJump = Math.max(worstPitchJump,
            Math.abs(where.pitch - was.pitch) * 180 / Math.PI)
        }
        let d = where.heading - was.heading
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        const key = was.phase === p.phase ? p.phase : `${was.phase}->${p.phase}`
        worstTurn[key] = Math.max(worstTurn[key] || 0, Math.abs(deg(d)))
      }

      let face = drawn.get(p)
      if (face === undefined) face = where.heading
      let turn = where.heading - face
      while (turn > Math.PI) turn -= 2 * Math.PI
      while (turn < -Math.PI) turn += 2 * Math.PI
      const eased = turn * Math.min(1, (1 / 30) / PLANE_TURN_EASE)
      const cap = PLANE_TURN_RATE / 30
      const step = Math.max(-cap, Math.min(cap, eased))
      worstDrawnTurn = Math.max(worstDrawnTurn, Math.abs(deg(step)))
      drawn.set(p, face + step)

      last.set(p, { phase: p.phase, speed: p.speed || 0,
                    heading: where.heading, pitch: where.pitch })
    }
  }

  chk('every phase of the cycle was flown', seen.size >= 8, [...seen].join(','))
  chk('no aircraft changes speed faster than it is allowed to',
      worstSpeedJump <= PLANE_ACCEL / 30 + 1e-6,
      `${worstSpeedJump.toFixed(3)} against ${(PLANE_ACCEL / 30).toFixed(3)}`)
  chk('and nothing changes attitude in a step', worstPitchJump < 3,
      `${worstPitchJump.toFixed(2)} degrees`)

  // WITHIN a phase - except taxiOut, which contains the pushback flip below.
  const inPhase = Object.entries(worstTurn)
    .filter(([k]) => !k.includes('->') && k !== 'taxiOut')
  const worstInPhase = Math.max(...inPhase.map(([, v]) => v))
  console.log(`   worst turn within a phase: ${worstInPhase.toFixed(1)} degrees a frame`)
  chk('nothing swings its nose more than a few degrees a frame while taxiing',
      worstInPhase < 6, inPhase.map(([k, v]) => `${k} ${v.toFixed(1)}`).join(', '))

  // ACROSS a boundary, ON THE GROUND. This is the one Mike saw: a landing that
  // "immediately turns left in an instant turn motion". The routes now hand
  // over to each other pointing the same way, so there is nothing to jump.
  const GROUND = ['finals->rollout', 'rollout->taxiIn', 'taxiIn->stand',
                  'taxiOut->takeoff']
  for (const key of GROUND) {
    const v = worstTurn[key] || 0
    chk(`${key.padEnd(20)} hands over without a jump`, v < 1,
        `${v.toFixed(1)} degrees`)
  }

  // THE DELIBERATE EXCEPTION. An aircraft parks nose-in, so leaving the stand
  // is a pushback: it goes backwards facing the terminal, and then the tug
  // turns it. That IS a 180-degree change of facing and pretending otherwise
  // would mean parking them tail-in.
  //
  // It happens PART WAY THROUGH taxiOut rather than at its start - the aircraft
  // is pushed back facing the terminal for the first twenty units and only then
  // turned - so it shows up as a within-phase event, which is why taxiOut is
  // excluded from the check above.
  chk('leaving a stand is a pushback, so the facing really does reverse',
      (worstTurn.taxiOut || 0) > 170, `${(worstTurn.taxiOut || 0).toFixed(1)} degrees`)
  chk('and the hand-over from standing to pushing back is seamless',
      (worstTurn['stand->taxiOut'] || 0) < 1,
      `${(worstTurn['stand->taxiOut'] || 0).toFixed(1)} degrees`)

  // ...and the aircraft on screen never does any of it in one frame.
  console.log(`   worst turn of the DRAWN aircraft: ` +
              `${worstDrawnTurn.toFixed(2)} degrees a frame`)
  chk('but the aircraft on screen never turns faster than its cap',
      worstDrawnTurn <= deg(PLANE_TURN_RATE / 30) + 1e-6,
      `${worstDrawnTurn.toFixed(2)} against ${deg(PLANE_TURN_RATE / 30).toFixed(2)}`)
  chk('and that cap is slow enough to read as an airliner being turned',
      PLANE_TURN_RATE < 1, `${PLANE_TURN_RATE} rad/s`)
}

// ---------------------------------------------------------------------------
console.log('\n13. The runway gets used\n')

// "Can we make the planes use the runway for takeoff and landing in a longer
// run?" It was not being used at all: the wheels touched down ONE AIRCRAFT
// LENGTH past the threshold and the roll-out then went to whichever taxiway
// end was NEAREST - the one beside that same threshold, 27 units away and 28
// of those sideways. A 208-unit runway was being used 27 units at a time.
{
  const airport = getAirport()
  const graph = getAirGraph(airport)
  const planes = makePlanes(graph)
  const runway = airport.runway.length

  const lengths = {}
  for (let i = 0; i < 30000; i++) {
    stepPlanes(graph, planes, 1 / 30)
    for (const p of planes) {
      if (lengths[p.phase] === undefined) lengths[p.phase] = p.path.length
    }
  }

  console.log(`   runway ${runway.toFixed(0)}, rollout ${lengths.rollout.toFixed(0)},` +
              ` takeoff run ${lengths.takeoff.toFixed(0)} including the climb`)

  chk('the landing roll is most of a runway, not a corner of one',
      lengths.rollout > runway * 0.8,
      `${lengths.rollout.toFixed(0)} against a ${runway.toFixed(0)} runway`)
  chk('the wheels touch well past the threshold but not halfway down it',
      AIRPORT_TOUCHDOWN > PLANE_LENGTH && AIRPORT_TOUCHDOWN < runway * 0.25,
      `${AIRPORT_TOUCHDOWN}`)
  chk('the nose lifts most of the way down the runway',
      AIRPORT_ROTATE_AT > 0.6 && AIRPORT_ROTATE_AT < 0.9, `${AIRPORT_ROTATE_AT}`)

  // The turn off has to happen at the FAR end, or the roll is short again.
  const end = graph.ends[0]
  const far = graph.exits.reduce((a, b) =>
    Math.hypot(b.x - end.touchdown.x, b.z - end.touchdown.z) >
    Math.hypot(a.x - end.touchdown.x, a.z - end.touchdown.z) ? b : a)
  const near = graph.exits.reduce((a, b) =>
    Math.hypot(b.x - end.touchdown.x, b.z - end.touchdown.z) <
    Math.hypot(a.x - end.touchdown.x, a.z - end.touchdown.z) ? b : a)
  chk('and the two taxiway ends really are at opposite ends of the runway',
      Math.hypot(far.x - near.x, far.z - near.z) > runway * 0.7,
      `${Math.hypot(far.x - near.x, far.z - near.z).toFixed(0)} apart`)
}

// ---------------------------------------------------------------------------
console.log('\n14. Taxi turns are curves, not corners\n')

// `pointAlong()` interpolates the heading between vertex tangents, which is
// enough for a road resampled every few units. It is NOT enough for a taxiway,
// where two legs meet at a right angle with nothing in between: the whole
// ninety degrees gets spread over the two segments touching the corner, so a
// vehicle is turning for the entire length of both legs and never goes
// straight. roundCorners() puts a real curve in the path instead.
{
  const corner = [{ x: 0, z: 0, y: 0 }, { x: 100, z: 0, y: 0 }, { x: 100, z: 60, y: 0 }]
  const rounded = roundCorners(corner, TAXI_CORNER)

  chk('a corner gains points and the ends are untouched',
      rounded.length > corner.length &&
      rounded[0].x === corner[0].x &&
      rounded[rounded.length - 1].z === corner[2].z,
      `${rounded.length} points`)
  chk('a straight line is left completely alone',
      roundCorners([{ x: 0, z: 0 }, { x: 5, z: 0 }, { x: 10, z: 0 }], TAXI_CORNER)
        .length === 3)
  chk('and it refuses to round a two-point path',
      roundCorners([{ x: 0, z: 0 }, { x: 10, z: 0 }], TAXI_CORNER).length === 2)

  // No zero-length segments, or measurePath divides by zero and every heading
  // downstream is NaN.
  let shortest = Infinity
  for (let i = 1; i < rounded.length; i++) {
    shortest = Math.min(shortest, Math.hypot(rounded[i].x - rounded[i - 1].x,
                                             rounded[i].z - rounded[i - 1].z))
  }
  chk('no two points land on top of each other', shortest > 1e-6,
      `${shortest}`)

  // THE POINT OF IT: straight, then turn, then straight.
  const path = measurePath(rounded)
  const at = (d) => pointAlong(path, d, false, true).heading * 180 / Math.PI
  chk('it goes straight before the corner', Math.abs(at(30) - at(60)) < 2,
      `${at(30).toFixed(1)} then ${at(60).toFixed(1)}`)
  chk('and straight again after it',
      Math.abs(at(path.length - 30) - at(path.length - 10)) < 2)
  chk('and the whole turn happens in between',
      Math.abs(at(30) - at(path.length - 10)) > 80,
      `${at(30).toFixed(1)} to ${at(path.length - 10).toFixed(1)}`)

  // A short leg must not be eaten from both ends into an S.
  const tight = roundCorners(
    [{ x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 12 }, { x: 24, z: 12 }], 40)
  let monotone = true
  for (let i = 1; i < tight.length; i++) {
    if (tight[i].x < tight[i - 1].x - 1e-9) monotone = false
  }
  chk('a radius bigger than the legs is clamped rather than doubling back',
      monotone)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
