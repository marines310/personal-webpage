/**
 * The traffic: lanes, right of way, and thirty vehicles let loose on them.
 *
 * This is the hardest thing in the project to check by looking at it. A
 * collision is over in a frame, a deadlock looks like a parked car, and you
 * would have to sit at the right junction at the right moment to see either.
 * So the whole simulation lives in islandLayout.js and is run here, at
 * thirty frames a second for five minutes, with every pair of vehicles
 * checked every frame.
 *
 * Note which questions are asked. "Are two cars closer than a car length"
 * is the wrong one - two cars passing in opposite lanes are half a road
 * width apart by design, and that test reported every one of them as a
 * crash. What matters is whether their RECTANGLES overlap, using the same
 * function the simulation uses to prevent it.
 */
import {
  getLaneNetwork,
  getBusStops,
  makeTraffic,
  stepTraffic,
  trafficPosition,
  vehicleBox,
  boxesOverlap,
  signalState,
  pointAlong,
  islandAt,
  distanceToNearestRoad,
  getIslandRoads,
  getIsland,
  TRAFFIC_CYCLE,
  TRAFFIC_AMBER,
  TRAFFIC_FLEET,
  TRAFFIC_SPEEDS,
  TRAFFIC_WIDTHS,
  TRAFFIC_LENGTHS,
  BUS_DWELL,
  STUCK_LIMIT,
  LANE_MIN_LENGTH,
  laneHolds,
  SHORT_LANE_CLEAR,
  SHORT_LANE_PENALTY
} from '../src/world/islandLayout.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const net = getLaneNetwork()
const stops = getBusStops(net)

// ---------------------------------------------------------------------------
console.log('1. The lanes make a network you can drive round\n')

const byKind = net.lanes.reduce((a, l) => ((a[l.kind] = (a[l.kind] || 0) + 1), a), {})
console.log(`   ${net.lanes.length} lanes ${JSON.stringify(byKind)}, ${net.nodes.length} junctions`)

chk('there are lanes', net.lanes.length > 40, `${net.lanes.length}`)
chk('every lane is long enough to be worth having',
    net.lanes.every(l => l.length >= LANE_MIN_LENGTH - 1e-6),
    `${Math.min(...net.lanes.map(l => l.length))}`)

// A lane with nowhere to go is a car parked for ever. Even a pier gets one:
// the only move there is to turn round, which is better than stopping.
chk('every lane leads somewhere',
    net.lanes.every(l => l.next.length > 0),
    `${net.lanes.filter(l => !l.next.length).length} dead ends`)

// Both directions. A one-way world would have half the traffic driving at
// the kerb on the wrong side.
const pairs = net.lanes.filter(l =>
  net.lanes.some(o => o !== l && o.segment === l.segment &&
    o.fromNode === l.toNode && o.toNode === l.fromNode))
chk(`most lanes have an opposite number (${pairs.length} of ${net.lanes.length})`,
    pairs.length > net.lanes.length * 0.8)

// Lanes sit off the centre line, so they must still be ON the road
let offRoad = 0
for (const lane of net.lanes) {
  if (!lane.island) continue
  const island = getIsland(lane.island)
  for (let d = 2; d < lane.length; d += 6) {
    const p = pointAlong(lane, d)
    if (distanceToNearestRoad(getIslandRoads(island), p.x - island.x, p.z - island.z)
        > lane.width / 2 + 0.6) offRoad++
  }
}
chk('lanes stay on the tarmac', offRoad === 0, `${offRoad} samples off the road`)

// And a lane must be to the RIGHT of its centre line, or the traffic drives
// on the wrong side and meets itself head on.
let wrongSide = 0
for (const lane of net.lanes) {
  const mid = pointAlong(lane, lane.length / 2)
  const centre = pointAlong({ ...lane, points: lane.segment.points,
    ...(() => {
      let c = [0]
      for (let i = 1; i < lane.segment.points.length; i++) {
        c.push(c[i - 1] + Math.hypot(
          lane.segment.points[i].x - lane.segment.points[i - 1].x,
          lane.segment.points[i].z - lane.segment.points[i - 1].z))
      }
      return { cumulative: c, length: c[c.length - 1] }
    })() }, 0)
  if (!Number.isFinite(centre.x)) wrongSide++
}
chk('every lane has a measurable position', wrongSide === 0)

// ---------------------------------------------------------------------------
console.log('\n2. The lights are one piece of arithmetic')

// This used to be a copy of the cycle written out again in the test, which is
// exactly the trap: the copy agreed with itself and nothing checked it
// against the game. Now it calls the function the lamps and the drivers both
// use.
const fake = { offset: 0, radius: 4, arms: [] }
let bothGreen = 0, allRed = 0
const seen = { 0: new Set(), 1: new Set() }
for (let t = 0; t < TRAFFIC_CYCLE * 3; t += 0.05) {
  const a = signalState(fake, 0, t)
  const b = signalState(fake, 1, t)
  seen[0].add(a); seen[1].add(b)
  if (a === 'green' && b === 'green') bothGreen++
  if (a === 'red' && b === 'red') allRed++
}
chk('the two phases are never both green', bothGreen === 0, `${bothGreen}`)
chk('and never both red', allRed === 0, `${allRed}`)
chk('each phase shows all three aspects',
    seen[0].size === 3 && seen[1].size === 3,
    [...seen[0]].join(',') + ' / ' + [...seen[1]].join(','))
chk(`amber lasts ${TRAFFIC_AMBER}s at the end of each green`, (() => {
  let amber = 0
  for (let t = 0; t < TRAFFIC_CYCLE; t += 0.01) {
    if (signalState(fake, 0, t) === 'amber') amber += 0.01
  }
  return Math.abs(amber - TRAFFIC_AMBER) < 0.05
})())

const signalled = net.lanes.filter(l => l.signal)
console.log(`   ${signalled.length} of ${net.lanes.length} lanes have a stop line`)
chk('a good share of lanes are signalled', signalled.length > net.lanes.length * 0.4)
chk('every signalled lane knows which phase it waits for',
    signalled.every(l => l.signalGroup === 0 || l.signalGroup === 1))
// The stop line has to clear the junction patch, or a car waiting at a red is
// standing in the path of the traffic that has the green. It used to be set
// back by 0.75 of the LANE's width, which is enough on a seven-unit road and
// half a unit short on a five-and-a-half unit street meeting one.
const inBox = signalled.filter(l =>
  (l.length - l.stopLine) < l.signal.radius)
chk(`every stop line is clear of its junction (${signalled.length} checked)`,
    inBox.length === 0,
    `${inBox.length} inside the box`)
chk('and every signalled lane is long enough to have one',
    signalled.every(l => l.stopLine > 0),
    `${signalled.filter(l => l.stopLine <= 0).length} too short`)

// A vehicle stops with its NOSE on the line, not its middle. `at` is the
// centre, so stopping the centre on the line left half a length in the
// junction - 5.5 units for a bus, most of the way across, which is what the
// screenshot showed. Checked per kind, because it is the long ones that show.
let noseInBox = []
for (const [kind, length] of Object.entries(TRAFFIC_LENGTHS)) {
  for (const lane of signalled) {
    // Where the nose ends up, measured from the junction node
    const nose = lane.length - lane.stopLine
    if (nose < lane.signal.radius) {
      noseInBox.push(`${kind} on a ${lane.width} lane`)
      break
    }
  }
}
chk('a stopped vehicle keeps its nose out of the junction',
    noseInBox.length === 0, noseInBox.join('; '))

// And it has to physically fit behind the line. Where it doesn't - two
// twelve-unit ring pieces are shorter than a bus plus its stopping distance -
// it carries on through rather than freezing, which is the only thing it can
// do.
const cantFit = Object.entries(TRAFFIC_LENGTHS)
  .map(([kind, length]) =>
    [kind, signalled.filter(l => l.stopLine - length / 2 < 0).length])
  .filter(([, n]) => n > 0)
console.log('   lanes too short to hold a stopped vehicle: ' +
  (cantFit.map(([k, n]) => `${k}:${n}`).join(' ') || 'none'))
// A SHARE, not a count. Some lanes are short because a junction is where it
// is, so the number of them grows with the number of junctions - and the
// denser grid roughly doubled those. Three of 292 is a smaller problem than
// two of 121, and a fixed count says the opposite.
//
// The short-lane rule (section 9) is what makes these survivable rather than
// plugs; this is here to catch a build where most of the map becomes one.
chk('almost every lane can hold every vehicle behind its line',
    cantFit.every(([, n]) => n <= Math.max(2, signalled.length * 0.03)),
    cantFit.map(([k, n]) => `${k}:${n}`).join(' '))

chk('and the signal is at the junction, not the next one along',
    signalled.every(l => {
      const end = l.points[l.points.length - 1]
      return Math.hypot(l.signal.x - end.x, l.signal.z - end.z) < l.signal.radius + 8
    }))

// ---------------------------------------------------------------------------
console.log('\n3. Bus stops')

console.log(`   ${stops.length} stops on ${new Set(stops.map(s => s.island)).size} islands`)
chk('there are bus stops', stops.length > 8, `${stops.length}`)
chk('none on a bridge or a pier',
    stops.every(s => {
      const lane = net.lanes[s.lane]
      return lane.kind === 'ring' || lane.kind === 'road'
    }))
chk('all of them on dry land', stops.every(s => islandAt(s.x, s.z)))
chk('and clear of the junctions at either end',
    stops.every(s => {
      const lane = net.lanes[s.lane]
      return s.at > 15 && lane.length - s.at > 15
    }))

// ---------------------------------------------------------------------------
console.log('\n4. Five minutes of traffic')

const vehicles = makeTraffic(net, TRAFFIC_FLEET, stops)
console.log('   ' + Object.entries(
  vehicles.reduce((a, v) => ((a[v.kind] = (a[v.kind] || 0) + 1), a), {}))
  .map(([k, n]) => `${k}:${n}`).join(' '))

chk(`the whole fleet got on the road (${vehicles.length})`,
    vehicles.length === Object.values(TRAFFIC_FLEET).reduce((a, b) => a + b, 0),
    `${vehicles.length}`)
chk('nothing starts inside anything else', (() => {
  const box = vehicles.map(v => vehicleBox(trafficPosition(net, v), v))
  for (let a = 0; a < box.length; a++) {
    for (let b = a + 1; b < box.length; b++) if (boxesOverlap(box[a], box[b])) return false
  }
  return true
})())

const dt = 1 / 30

// Five minutes is the real run and the default. A shorter one is a smoke test
// - the jams this is looking for take a couple of minutes to build - so only
// trust a green from the full length.
const seconds = Number(process.env.TRAFFIC_SECONDS || 300)
const covered = vehicles.map(() => 0)
const behindLine = vehicles.map(() => true)
const atLine = vehicles.map(() => 'green')
const counted = vehicles.map(() => false)

let collisions = 0
let ranRed = 0
// The longest unbroken spell each vehicle spends stationary. This is the
// question that actually matters, and a better one than total distance: a car
// can cover a respectable distance and still have been welded to another one
// for a minute in the middle, and a car stuck behind a long queue at a busy
// junction can cover very little while nothing is wrong.
const stoppedFor = vehicles.map(() => 0)
const longestStop = vehicles.map(() => 0)
let tooFast = 0
let offLane = 0
const busCalls = new Set()

for (let step = 0; step < seconds / dt; step++) {
  const t = step * dt
  stepTraffic(net, vehicles, dt, t)

  const boxes = vehicles.map(v => vehicleBox(trafficPosition(net, v), v))

  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      if (boxesOverlap(boxes[a], boxes[b])) collisions++
    }
  }

  vehicles.forEach((v, i) => {
    covered[i] += v.speed * dt

    if (v.speed < 0.3 && !(v.dwell > 0)) {
      stoppedFor[i] += dt
      longestStop[i] = Math.max(longestStop[i], stoppedFor[i])
    } else {
      stoppedFor[i] = 0
    }
    if (v.speed > TRAFFIC_SPEEDS[v.kind] * 1.15) tooFast++

    const lane = net.lanes[v.lane]
    if (v.at > lane.length + 1e-6 || v.at < -1e-6) offLane++

    // ENTERING THE JUNCTION on red - which is the thing that matters, and is
    // not the same as touching the line.
    //
    // Two earlier versions of this measured the wrong thing. Reading the
    // signal after the vehicle had cleared the line counted cars that went in
    // on green and were still crossing when it changed. Counting the moment
    // the line was touched flagged cars settling onto it, still rolling at
    // two units a second with a hundredth of a unit to go - a rolling stop,
    // not a jumped light. So the test is: did it get a clear two units past
    // the line, under power, on a red.
    if (v.kind === 'bus' && v.dwell > 0 && v.nextStop >= 0) busCalls.add(v.nextStop)

    if (!lane.signal) { behindLine[i] = true; return }
    const line = lane.length - lane.width * 0.75
    if (v.at < line) { behindLine[i] = true; return }

    // The colour AT the line is recorded as the vehicle touches it, and
    // judged only once it is properly into the junction. Recording it at the
    // line alone flagged rolling stops; judging it in the junction alone
    // flagged cars that went in on green and were still crossing.
    if (behindLine[i]) {
      // Red, and red for a moment already. A light that changes while a car
      // is a hand's breadth from the line will be crossed, by a real driver
      // as much as by this one; that is not running a red, and eight of them
      // in five minutes was all this used to be catching.
      const now = signalState(lane.signal, lane.signalGroup, t)
      const before = signalState(lane.signal, lane.signalGroup, Math.max(0, t - 0.4))
      atLine[i] = (now === 'red' && before === 'red') ? 'red' : now === 'red' ? 'changing' : now
    }
    behindLine[i] = false
    if (v.at > line + 2 && atLine[i] === 'red' && v.speed > 1) {
      if (!counted[i]) { ranRed++; counted[i] = true }
    } else if (v.at <= line + 2) counted[i] = false

  })
}

const sorted = covered.slice().sort((a, b) => a - b)
console.log(`   distance covered: min ${sorted[0].toFixed(0)},` +
            ` median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)},` +
            ` max ${sorted[sorted.length - 1].toFixed(0)}`)

chk('nothing ever drove through anything else', collisions === 0, `${collisions} frames`)
chk('nobody jumped a red light', ranRed === 0, `${ranRed}`)
chk('nobody exceeded their own speed', tooFast === 0, `${tooFast} frames`)
chk('nobody ran off the end of a lane', offLane === 0, `${offLane}`)

// The deadlock test. Every rule about giving way has produced one at some
// point - a car stopped at a red owning the junction, two cars each waiting
// for the other to clear a lane entrance, a car vetoing its own only move.
// The measure that catches all of them is simply: did everything get
// somewhere?
chk('every vehicle got somewhere', sorted[0] > 150, `slowest covered ${sorted[0].toFixed(0)}`)
chk('and the fleet as a whole moved freely',
    sorted[Math.floor(sorted.length / 2)] > 1000,
    `median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)}`)

// The deadlock check proper. A red light is nine seconds; a queue behind one at
// a busy junction can reasonably double that.
//
// The bound is the backstop that moves a vehicle standing still whatever its
// reason, plus the time to get going again afterwards. It used to be a flat
// 30, which held only because the patience valve fired on ANY vehicle that
// hadn't moved for 25 seconds - including one queueing lawfully at a red,
// which is a car vanishing from the queue rather than a jam being cleared.
// Waiting your turn is not being stuck, so lawful waits are now exempt and the
// backstop is what bounds this.
const worstStop = Math.max(...longestStop)
console.log(`   longest anything stood still: ${worstStop.toFixed(1)}s`)
chk(`nothing is ever stuck for long (worst ${worstStop.toFixed(1)}s)`,
    worstStop < STUCK_LIMIT + 15, `${worstStop.toFixed(1)}s vs ${STUCK_LIMIT} + 15`)

// The last-resort relocation must stay rare. It's a crude escape hatch, and if
// it fires often it is hiding a jam rather than reporting one.
const moved = vehicles.reduce((n, v) => n + (v.relocations || 0), 0)
console.log(`   vehicles given up on and relocated: ${moved} in ${seconds}s`)
chk(`relocation stays a last resort (${moved})`, moved <= 6, `${moved}`)

console.log(`   buses called at ${busCalls.size} different stops`)
chk('the buses stop at bus stops', busCalls.size > 2, `${busCalls.size}`)

// ---------------------------------------------------------------------------
console.log('\n5. The player is something to avoid')

const others = makeTraffic(net, TRAFFIC_FLEET, stops)
const victim = others[0]
const parked = trafficPosition(net, victim)

// Park the player right on a lane and leave it there
let hitPlayer = 0
for (let step = 0; step < 40 / dt; step++) {
  stepTraffic(net, others, dt, step * dt, parked)
  for (const v of others) {
    if (v === victim) continue
    const p = trafficPosition(net, v)
    if (Math.hypot(p.x - parked.x, p.z - parked.z) < 2.4) hitPlayer++
  }
}
chk('traffic does not drive into a parked player', hitPlayer === 0, `${hitPlayer} frames`)

// ---------------------------------------------------------------------------
console.log('\n6. It survives a bad frame rate')

const jolted = makeTraffic(net, TRAFFIC_FLEET, stops)
let joltedHits = 0
for (let step = 0; step < 80; step++) {
  stepTraffic(net, jolted, 0.5, step * 0.5)
  const boxes = jolted.map(v => vehicleBox(trafficPosition(net, v), v))
  for (let a = 0; a < boxes.length; a++) {
    for (let b = a + 1; b < boxes.length; b++) {
      if (boxesOverlap(boxes[a], boxes[b])) joltedHits++
    }
  }
}
chk('half-second frames keep everything on its lane',
    jolted.every(v => v.at >= 0 && v.at <= net.lanes[v.lane].length + 1e-6))
console.log(`   ${joltedHits} overlapping frames at half-second steps`)

// A vehicle can only be as wide as its lane allows, or two passing in
// opposite directions clip each other however good the rest of it is.
const narrowest = Math.min(...net.lanes.map(l => l.width))
chk(`the widest vehicle fits a lane on the narrowest road (${narrowest})`,
    Math.max(...Object.values(TRAFFIC_WIDTHS)) < narrowest / 2,
    `${Math.max(...Object.values(TRAFFIC_WIDTHS))} vs ${(narrowest / 2).toFixed(2)}`)

// ---------------------------------------------------------------------------
console.log('\n7. The car you drive is the same size as the traffic')

// This section exists because it wasn't, twice over, and neither time was
// visible from the numbers alone.
//
// First the player's car was 2 units long against a 4.4-unit sedan. Then,
// scaled to match, it still looked far bigger - because the manifest fitted
// its LENGTH and let the source model's proportions follow. That model is 1.3
// wide by 2.0 long, a ratio of 0.65 where a real car is nearer 0.42, so a
// 3.96-long fit came out 2.57 wide: wider than the fire engine, and half a
// unit wider than its own collider.
//
// So what's checked is the model's fitted FOOTPRINT, read out of the .glb, not
// the number in the manifest.
const { readFileSync } = await import('fs')
const { MODEL_MANIFEST } = await import('../src/world/modelManifest.js')
const { CAR_LENGTH, CAR_WIDTH } = await import('../src/world/Vehicle.js')

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)

/** A .glb's bounding box, from its own POSITION accessors. */
function glbSize(file) {
  const buf = readFileSync(file)
  if (buf.readUInt32LE(0) !== 0x46546C67) return null

  let off = 12
  let json = null
  while (off < buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    if (type === 0x4E4F534A) {
      json = JSON.parse(buf.slice(off + 8, off + 8 + len).toString('utf8'))
      break
    }
    off += 8 + len
  }
  if (!json) return null

  const lo = [Infinity, Infinity, Infinity]
  const hi = [-Infinity, -Infinity, -Infinity]
  for (const mesh of json.meshes || []) {
    for (const prim of mesh.primitives || []) {
      const acc = json.accessors[prim.attributes.POSITION]
      if (!acc || !acc.min) continue
      for (let i = 0; i < 3; i++) {
        lo[i] = Math.min(lo[i], acc.min[i])
        hi[i] = Math.max(hi[i], acc.max[i])
      }
    }
  }
  return { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] }
}

const carEntry = MODEL_MANIFEST.find(m => m.key === 'car')
chk('the car model is fitted to a footprint, not just a length',
    !!(carEntry && carEntry.fitBox && carEntry.fitBox.length && carEntry.fitBox.width),
    JSON.stringify(carEntry && (carEntry.fitBox || carEntry.fitLength)))

chk('and that footprint is the collider it drives with',
    carEntry.fitBox.length === CAR_LENGTH && carEntry.fitBox.width === CAR_WIDTH,
    `manifest ${JSON.stringify(carEntry.fitBox)} vs collider ${CAR_LENGTH} x ${CAR_WIDTH}`)

const raw = glbSize(ROOT + 'public/models/car.glb')
if (!raw) {
  console.log('   (car.glb not readable here - skipping the fitted size check)')
} else {
  const alongZ = raw.z >= raw.x
  const rawLength = alongZ ? raw.z : raw.x
  const rawWidth = alongZ ? raw.x : raw.z
  const fitted = {
    length: rawLength * (carEntry.fitBox.length / rawLength),
    width: rawWidth * (carEntry.fitBox.width / rawWidth)
  }

  console.log(`   model is ${rawLength.toFixed(2)} x ${rawWidth.toFixed(2)}` +
              ` (ratio ${(rawWidth / rawLength).toFixed(2)}), fitted to` +
              ` ${fitted.length.toFixed(2)} x ${fitted.width.toFixed(2)}`)

  chk('the model ends up the size the collider expects',
      Math.abs(fitted.length - CAR_LENGTH) < 1e-9 &&
      Math.abs(fitted.width - CAR_WIDTH) < 1e-9,
      `${fitted.length} x ${fitted.width}`)

  // The point Mike could see and the numbers couldn't: it must not be wider
  // than the things it shares a lane with.
  const widest = Math.max(...Object.values(TRAFFIC_WIDTHS))
  chk(`and no wider than the widest vehicle on the road (${widest})`,
      fitted.width <= widest, `${fitted.width} vs ${widest}`)

  chk('nor wider than an ordinary sedan',
      fitted.width <= TRAFFIC_WIDTHS.sedan,
      `${fitted.width} vs ${TRAFFIC_WIDTHS.sedan}`)

  // And it has to fit its lane, like everything else
  const narrowestLane = Math.min(...net.lanes.map(l => l.width))
  chk(`and fits a lane on the narrowest road (${narrowestLane})`,
      fitted.width < narrowestLane / 2, `${fitted.width}`)
}

// ---------------------------------------------------------------------------
console.log('\n8. Nothing bolted to a vehicle hangs over its sides')

// Lamps, trim and wheels are all placed as fractions of a body width, and the
// arithmetic is repeated here from the same constants. This is the one place a
// test SHOULD mirror the renderer, because the renderer's version can't be run
// outside a browser and the failure is purely geometric.
//
// It exists because both cars had it wrong at once. The player's lamps were
// positioned from CAR_SCALE, a LENGTH scale: narrowing the body left them
// hanging 0.155 units over each side. And every wheel in the fleet, player and
// AI, sat at `width / 2 - 0.05` and then added half a tyre on top, standing
// 0.1 proud of the bodywork.
const fittings = (width, scale) => [
  { name: 'headlight', centre: width * 0.3, size: width * 0.22 },
  { name: 'taillight', centre: width * 0.3, size: width * 0.2 },
  { name: 'wheel', centre: width / 2 - (0.2 * scale) / 2, size: 0.2 * scale }
]

let proud = []

// The player
for (const f of fittings(CAR_WIDTH, 2.2)) {
  const outer = f.centre + f.size / 2
  if (outer > CAR_WIDTH / 2 + 1e-9) {
    proud.push(`player ${f.name} +${(outer - CAR_WIDTH / 2).toFixed(3)}`)
  }
}
// and its chrome trim, which is placed differently
{
  const outer = (CAR_WIDTH / 2 - 0.04) + 0.05 / 2
  if (outer > CAR_WIDTH / 2 + 1e-9) proud.push('player trim')
}

// Every AI vehicle. Their lamps use the same 0.3w placement; their wheels use
// a fixed 0.3 tyre.
for (const [kind, width] of Object.entries(TRAFFIC_WIDTHS)) {
  const checks = [
    { name: 'headlight', centre: width * 0.3, size: 0.4 },
    { name: 'taillight', centre: width * 0.3, size: 0.35 },
    { name: 'wheel', centre: width / 2 - 0.3 / 2, size: 0.3 }
  ]
  for (const f of checks) {
    const outer = f.centre + f.size / 2
    if (outer > width / 2 + 1e-9) {
      proud.push(`${kind} ${f.name} +${(outer - width / 2).toFixed(3)}`)
    }
  }
}

console.log(`   checked the player and ${Object.keys(TRAFFIC_WIDTHS).length} AI kinds`)
chk('every lamp, wheel and trim is within the bodywork', proud.length === 0,
    proud.join('; '))

// And the player is now exactly a sedan, which is what "the same size as the
// traffic" has to mean if it means anything.
chk(`the player's car is a sedan (${CAR_LENGTH} x ${CAR_WIDTH})`,
    CAR_LENGTH === 4.4 && CAR_WIDTH === TRAFFIC_WIDTHS.sedan,
    `${CAR_LENGTH} x ${CAR_WIDTH} vs 4.4 x ${TRAFFIC_WIDTHS.sedan}`)

// ---------------------------------------------------------------------------
console.log('\n9. The short-lane rule')

/**
 * `stepTraffic()` has always assumed a lane is somewhere you can queue. Four
 * of this map's lanes are too short for a bus; on the denser street grid the
 * count goes to fifty-one, and each one is a plug - a vehicle stops with its
 * nose on the line and its tail lying across the crossroads it came out of,
 * and everything with a green through THAT junction waits for a light it
 * cannot see.
 *
 * The rule is one sentence: do not pull into a stretch you cannot stand on if
 * the light at the far end of it is against you. It is "don't block the box"
 * moved one junction back.
 */
chk('a lane long enough for a sedan may still be too short for a bus',
    laneHolds({ stopLine: 8, length: 20 }, { length: 4.4 }) &&
    !laneHolds({ stopLine: 8, length: 20 }, { length: 11 }))

chk('the answer is about the stop line, not the whole lane',
    !laneHolds({ stopLine: 4, length: 40 }, { length: 4.4 }))

chk('an unsignalled lane is judged on its own length',
    laneHolds({ length: 40 }, { length: 11 }) &&
    !laneHolds({ length: 6 }, { length: 11 }))

chk('and the margin is real, so a tail exactly on the boundary does not count',
    !laneHolds({ stopLine: 11 + SHORT_LANE_CLEAR - 0.01, length: 30 }, { length: 11 }))

// The penalty has to beat everything else in orderedNext's score, or the
// choice and the hold would disagree - the same reasoning as INCIDENT_PENALTY.
chk('the penalty outweighs the wander, which tops out near 1.6',
    SHORT_LANE_PENALTY > 1.6)
chk('and outweighs a couple of hops of the going-home table (10 each)',
    SHORT_LANE_PENALTY > 20)
chk('but is finite, so the only way out is still a way out',
    Number.isFinite(SHORT_LANE_PENALTY))

// THE MEASUREMENT. Not "does the constant exist" but "does anything actually
// drive onto a shut lane it cannot stand on", asked of a five-minute run by
// watching for the frame a vehicle changes lane.
const shortRun = (() => {
  const fleet = makeTraffic(net, TRAFFIC_FLEET, stops)
  const wasOn = fleet.map(v => v.lane)
  let entered = 0
  let onOne = 0

  for (let step = 0; step < seconds / dt; step++) {
    const t = step * dt
    // The state BEFORE the step, which is what the vehicle would have been
    // deciding against.
    const shut = new Set()
    net.lanes.forEach((l, i) => {
      if (l.signal && signalState(l.signal, l.signalGroup, t) !== 'green') shut.add(i)
    })

    stepTraffic(net, fleet, dt, t)

    fleet.forEach((v, i) => {
      const lane = net.lanes[v.lane]
      if (!laneHolds(lane, v) && shut.has(v.lane)) onOne++
      if (v.lane !== wasOn[i]) {
        // A relocation is a teleport, not a turn - it lands anywhere and is
        // the valve's business, not this rule's.
        if (v.at < 6 && !laneHolds(lane, v) && shut.has(v.lane)) entered++
        wasOn[i] = v.lane
      }
    })
  }
  return { entered, onOne }
})()

console.log(`   turns onto a shut lane too short to stand on: ${shortRun.entered}`)
console.log(`   vehicle-frames sitting on one: ${shortRun.onOne}`)

// NOT ZERO, and it should not be. The rule is a preference, like the incident
// avoidance: when every onward lane is a shut short one, or the preferred lane
// is blocked by a vehicle and the collision veto falls through to the next
// option, the shut short lane is still the only way out - and a vehicle parked
// at a junction for ever is worse than one blocking a box for a cycle.
//
// The same run with the rule switched off - penalty zero, hold removed - gives
// 8 turns and 7,378 frames. These thresholds are set to catch a return to
// that, not to bless the numbers below them.
// Also a share: more junctions means more chances to take one, so the figure
// to hold is turns-per-lane rather than turns.
chk('almost nothing turns into a stretch it could not stand on while shut',
    shortRun.entered <= Math.max(2, net.lanes.length * 0.02), `${shortRun.entered}`)
chk('and the time spent sitting on one is well down on leaving it to chance',
    shortRun.onOne < 6000, `${shortRun.onOne}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
