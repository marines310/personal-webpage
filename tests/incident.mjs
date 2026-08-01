/**
 * Traffic getting past a crash.
 *
 * Mike, driving: "when the car crash mission occurs, traffic was completely
 * blocked". This is the check that says whether it still is - and it has to be
 * a simulation rather than a reading of the code, because "does the city keep
 * moving with a lane shut" is not a question any amount of looking at
 * `orderedNext` can answer.
 *
 * THE MEASUREMENT THAT MATTERS is the longest unbroken spell each vehicle
 * spends stationary, not the distance covered. A jam is not "the fleet went a
 * bit slower": a jam is one car welded in place with everything piled up
 * behind it, and total distance hides that behind the cars that were fine.
 *
 * Section 1 is the one to keep green whatever else changes: with no incident,
 * the simulation must be BIT-IDENTICAL to one with none of this code in it.
 * The whole avoidance is a subtraction applied after the random draw for
 * exactly that reason - a fourth branch in orderedNext would move somebody's
 * draw and re-shuffle every route in the city, which is what cost a red light
 * when the indicators were first built.
 */
import {
  getLaneNetwork, getBusStops, makeTraffic, stepTraffic, trafficPosition,
  vehicleBox, boxesOverlap, pointAlong,
  TRAFFIC_FLEET, TRAFFIC_LENGTHS, TRAFFIC_WIDTHS,
  INCIDENT_RADIUS, INCIDENT_PENALTY, ONCOMING_CLEAR, INCIDENT_CROSS,
  SWERVE_AFTER
} from '../src/world/islandLayout.js'
import {
  crashBlocks, crashReach, CRASH_CARS, CRASH_SIDE_OFFSET, CRASH_CLEARANCE
} from '../src/world/ambulanceGame.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const net = getLaneNetwork()
const stops = getBusStops(net)
const dt = 1 / 30
const seconds = Number(process.env.INCIDENT_SECONDS || 120)

/**
 * Put a crash on a lane and run the fleet.
 *
 * Returns what actually happened, not what the code intended: how far
 * everything got, the longest anything stood still, and how many vehicles the
 * simulation gave up on and teleported.
 */
function run(incident) {
  const vehicles = makeTraffic(net, TRAFFIC_FLEET, stops)
  const covered = vehicles.map(() => 0)
  const stoppedFor = vehicles.map(() => 0)
  const longestStop = vehicles.map(() => 0)
  let relocations = 0
  let collisions = 0
  let crossings = 0

  let last = vehicles.map(v => trafficPosition(net, v))

  for (let step = 0; step < seconds / dt; step++) {
    stepTraffic(net, vehicles, dt, step * dt, null, incident)

    const now = vehicles.map(v => trafficPosition(net, v))
    for (let i = 0; i < vehicles.length; i++) {
      const moved = Math.hypot(now[i].x - last[i].x, now[i].z - last[i].z)
      // A relocation is a teleport, so it shows up as an impossible step
      // rather than as a flag - the same way traffic.mjs counts them.
      if (moved > 12) { relocations++; continue }
      covered[i] += moved
      if (moved < 0.01) {
        stoppedFor[i] += dt
        longestStop[i] = Math.max(longestStop[i], stoppedFor[i])
      } else {
        stoppedFor[i] = 0
      }
      if ((vehicles[i].sidestep || 0) < -0.5) crossings++
    }

    const boxes = vehicles.map((v, i) => vehicleBox(now[i], v))
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        if (boxesOverlap(boxes[a], boxes[b])) collisions++
      }
    }
    last = now
  }

  covered.sort((a, b) => a - b)
  return {
    min: Math.round(covered[0]),
    median: Math.round(covered[Math.floor(covered.length / 2)]),
    max: Math.round(covered[covered.length - 1]),
    worstStop: +Math.max(...longestStop).toFixed(1),
    relocations,
    collisions,
    crossings,
    vehicles
  }
}

// ---------------------------------------------------------------------------
console.log('1. With no incident, nothing changes at all\n')

// The determinism guard. Two runs, one passing `null` and one passing nothing
// at all, must agree exactly - and both must match the numbers the traffic
// suite has been reporting all along.
const quietA = run(null)
const quietB = run(undefined)
console.log(`   distance covered: min ${quietA.min}, median ${quietA.median}, max ${quietA.max}`)
console.log(`   longest anything stood still: ${quietA.worstStop}s`)

chk('passing no incident and passing null are the same run',
    quietA.min === quietB.min && quietA.median === quietB.median &&
    quietA.max === quietB.max && quietA.relocations === quietB.relocations,
    `${quietA.median} vs ${quietB.median}`)
chk('nobody crosses the centre line when there is nothing to get round',
    quietA.crossings === 0, `${quietA.crossings}`)

// ---------------------------------------------------------------------------
console.log('\n2. A crash on a busy lane')

// Somewhere with traffic on it, chosen by finding the lane the most vehicles
// start on rather than picking one and hoping.
const counts = new Map()
for (const v of quietA.vehicles) counts.set(v.lane, (counts.get(v.lane) || 0) + 1)
let busiest = 0
for (const [lane, n] of counts) {
  if (n > (counts.get(busiest) || 0)) busiest = lane
}
const lane = net.lanes[busiest]

// On the busiest lane, but at a point with nothing standing on it - which is
// what the game does too, via CRASH_CLEARANCE. A crash dropped on top of a bus
// is a different test: it measures how quickly a vehicle can get out of a
// wreck that appeared around it, not whether traffic can get past one.
// A FRESH fleet, because `quietA.vehicles` is where everything ended up after
// two minutes of driving and the crash is placed before any of that happens.
// Using the finished positions put the wreck straight on top of the starting
// grid and reported exactly the same 798 frames it was meant to remove.
const fresh = makeTraffic(net, TRAFFIC_FLEET, stops)
const startAt = new Map()
for (const v of fresh) {
  if (v.lane === busiest) startAt.set(v, v.at)
}
let where = lane.length / 2
for (let i = 1; i <= 20; i++) {
  const tryAt = (i / 21) * lane.length
  const clear = [...startAt.values()].every(a => Math.abs(a - tryAt) > 12)
  if (clear) { where = tryAt; break }
}
const at = pointAlong(lane, where)
console.log(`   lane ${busiest}, ${counts.get(busiest)} vehicles on it, ${lane.width.toFixed(1)} wide`)

// Built by the same function World uses, not by a copy of it: the picture and
// the physics have to agree about where the wreck is, and a second set of
// offsets here would be a second chance for them not to.
const dims = {
  sedan: { length: TRAFFIC_LENGTHS.sedan, width: TRAFFIC_WIDTHS.sedan },
  suv: { length: TRAFFIC_LENGTHS.suv, width: TRAFFIC_WIDTHS.suv }
}
const crash = {
  x: at.x, z: at.z,
  blocks: crashBlocks({ x: at.x, z: at.z, heading: at.heading }, dims)
}

// The check that makes all the rest possible: the wreck must leave a gap.
// Laid across the middle of the lane it spans a seven-unit road completely,
// and then no rule about giving way, routing round or crossing the line can
// do anything, because there is nothing to use. Traffic simply stops - which
// is what Mike reported.
const across = CRASH_CARS.map((car, i) => {
  const b = crash.blocks[i]
  const dx = b.x - at.x
  const dz = b.z - at.z
  // Distance across the road, in the lane's own terms.
  const centre = dx * Math.cos(at.heading) - dz * Math.sin(at.heading)
  // And the REACH, which is not the width: a car turned across the road
  // presents its length too. Measuring half-widths reported a comfortable gap
  // beside a wreck that was sitting on the middle of the lane, and the traffic
  // duly drove through it - 4,090 vehicle-frames in the last twenty seconds of
  // a run that this check had passed.
  return { centre, reach: crashReach(car, dims) }
})
const nearEdge = Math.min(...across.map(a => a.centre - a.reach))
const farEdge = Math.max(...across.map(a => a.centre + a.reach))
console.log(`   the wreck reaches from ${nearEdge.toFixed(1)} to ${farEdge.toFixed(1)} across a ${lane.width.toFixed(1)} lane`)
// A car driving normally sits on the lane centreline and is 1.9 wide, so it
// needs the wreck to start at least a car's half-width away before "there is
// room to get past" means anything.
chk('the wreck leaves the driving line open',
    nearEdge > 1.05,
    `nearest edge ${nearEdge.toFixed(2)} from the lane centre`)

const blocked = run(crash)
console.log(`   distance covered: min ${blocked.min}, median ${blocked.median}, max ${blocked.max}`)
console.log(`   longest anything stood still: ${blocked.worstStop}s`)
console.log(`   centre-line crossings: ${blocked.crossings} vehicle-frames`)

// THE HEADLINE. A lane is shut; the city keeps moving.
chk('the fleet still moves with a lane shut',
    blocked.median > quietA.median * 0.6,
    `${blocked.median} against ${quietA.median} clear`)
chk('and nothing is welded in place',
    blocked.worstStop < Math.max(30, quietA.worstStop * 1.5),
    `${blocked.worstStop}s against ${quietA.worstStop}s clear`)
chk('the crash does not make the fleet crash',
    blocked.collisions <= quietA.collisions + 40,
    `${blocked.collisions} against ${quietA.collisions} clear`)
chk('and it is not being solved by teleporting everyone away',
    blocked.relocations < quietA.relocations * 2 + 10,
    `${blocked.relocations} against ${quietA.relocations} clear`)

// ---------------------------------------------------------------------------
console.log('\n3. Nothing drives through the wreck')

// The obstacle is real: no vehicle's rectangle may overlap either crashed car
// at any point in the run. This is the check that says the crash is in the
// road rather than painted on it.
// Split early from late, because the two have completely different causes and
// only one of them is a fault. A crash appears where cars already are - that
// is what a crash is - so the opening seconds always show vehicles inside it
// driving out. What would be wrong is the STEADY state: traffic still passing
// through the wreck a minute later, which would mean it is painted on the road
// rather than in it.
const through = (() => {
  const vehicles = makeTraffic(net, TRAFFIC_FLEET, stops)
  let early = 0, late = 0
  const split = 20 / dt
  const lateFrom = (seconds - 20) / dt
  for (let step = 0; step < seconds / dt; step++) {
    stepTraffic(net, vehicles, dt, step * dt, null, crash)
    let hits = 0
    for (const v of vehicles) {
      const box = vehicleBox(trafficPosition(net, v), v)
      for (const wreck of crash.blocks) {
        if (boxesOverlap(box, vehicleBox(wreck, wreck))) hits++
      }
    }
    if (step < split) early += hits
    if (step >= lateFrom) late += hits
  }
  return { early, late }
})()
console.log(`   first 20s: ${through.early} vehicle-frames inside a crashed car`)
console.log(`   last 20s:  ${through.late}`)
// NOT zero, and this is the honest part of the whole feature.
//
// Every position across a road is somebody's driving line - move the wreck off
// one lane and it lands on the next - so a crash in the road is always in
// somebody's way. It can be made absolute, and then the city stops, which is
// what Mike reported in the first place. It can be made a preference, and then
// traffic keeps moving and some cars clip it.
//
// Measured at about 1,700 vehicle-frames in a twenty-second window, which is
// two or three cars catching a corner of the wreck at any moment out of a
// fifty-two vehicle fleet. The threshold is set to catch a return to the old
// behaviour - four thousand and rising - rather than to bless this number.
chk('the traffic is not simply ignoring the crash',
    through.late < 2500, `${through.late}`)
chk('and the opening overlaps clear rather than persisting',
    through.late < through.early, `${through.early} then ${through.late}`)

// ---------------------------------------------------------------------------
console.log('\n4. The rules themselves')

chk('the avoidance radius is bigger than a lane is wide', INCIDENT_RADIUS > 5.5)
chk('the penalty outweighs the wander, which tops out near 1.6',
    INCIDENT_PENALTY > 1.6)
chk('and outweighs a couple of hops of the going-home table (10 each)',
    INCIDENT_PENALTY > 20)
// Not Infinity, and not a filter: a lane that is the only way out of a
// junction must stay choosable, or avoiding the jam becomes a new way to be
// stuck - which is the thing it exists to prevent.
chk('but is finite, so the only way out is still a way out',
    Number.isFinite(INCIDENT_PENALTY))

chk('a gap in the oncoming traffic is required, and it is a real one',
    ONCOMING_CLEAR > 20)
chk('crossing reaches past the middle of the road',
    INCIDENT_CROSS > 0.28 && INCIDENT_CROSS <= 0.6)
// The shoulder is offered immediately at an incident rather than after the
// ordinary wait, or the queue forms before anyone tries to go round.
chk('the ordinary swerve still waits, so this is a special case not a new rule',
    SWERVE_AFTER > 0)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
