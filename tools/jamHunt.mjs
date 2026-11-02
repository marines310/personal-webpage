/**
 * Where the jams actually are.
 *
 * `tools/signalHealth.mjs` answers "are the lights any good". This answers the
 * question that comes after it: when traffic is stopped, WHERE is it stopped,
 * and WHAT is at the head of the queue.
 *
 *   node tools/jamHunt.mjs            10 simulated minutes, the default
 *   node tools/jamHunt.mjs 20         longer
 *
 * It exists because the obvious answers were all wrong. Asked to explain
 * persistent jams, three plausible culprits were measured and eliminated in
 * turn - deadlock rings in the waiting graph (zero in ten minutes), the
 * demand-driven signals (a fair 51/49 split at the worst junction, and in
 * 6,000 samples it held the other side green against a waiting queue exactly
 * once), and congestion spread across the network (thirteen of fourteen
 * bridges carry 0.1 vehicles).
 *
 * What it is instead: ONE lane, and a stationary long vehicle sitting on it.
 * Run this before changing anything, because the shape of the answer has
 * moved every time the map has.
 */
import {
  getLaneNetwork, getBusStops, makeTraffic, stepTraffic,
  TRAFFIC_FLEET, STUCK_LIMIT
} from '../src/world/islandLayout.js'

const minutes = Number(process.argv[2]) || 10
const dt = 1 / 30
const SAMPLE = 15                     // every half second

const net = getLaneNetwork()
const vehicles = makeTraffic(net, TRAFFIC_FLEET, getBusStops(net))

/**
 * The head of a queue: follow `waitingOn` until somebody is not waiting on
 * anyone, guarding against a ring. A ring IS a deadlock and is reported
 * separately - `lawfulWait()` in islandLayout.js has the same guard for the
 * same reason.
 */
function headOfQueue(v) {
  const seen = new Set()
  let at = v
  while (at && at.waitingOn) {
    if (seen.has(at)) return { head: at, ring: true }
    seen.add(at)
    at = at.waitingOn
  }
  return { head: at, ring: false }
}

const byLane = new Map()
const headWhy = {}
const headKind = {}
const headSpeed = {}
let rings = 0
let relocations = 0
let samples = 0
let longWaits = 0

for (let step = 0; step < (minutes * 60) / dt; step++) {
  const before = vehicles.map(v => v.why)
  stepTraffic(net, vehicles, dt, step * dt)
  for (let i = 0; i < vehicles.length; i++) {
    if (vehicles[i].why === 'relocated' && before[i] !== 'relocated') relocations++
  }

  if (step % SAMPLE) continue
  samples++

  for (const v of vehicles) {
    if ((v.stopped || 0) <= 15) continue
    longWaits++

    const lane = net.lanes[v.lane]
    const key = `${v.lane} (${lane ? lane.kind : '?'})`
    byLane.set(key, (byLane.get(key) || 0) + 1)

    const { head, ring } = headOfQueue(v)
    if (ring) { rings++; continue }
    if (!head || head === v) continue

    headWhy[head.why || '?'] = (headWhy[head.why || '?'] || 0) + 1
    headKind[head.kind] = (headKind[head.kind] || 0) + 1

    const s = head.speed || 0
    const band = s < 0.3 ? 'stationary' : s < 2 ? 'crawling' : 'moving'
    headSpeed[band] = (headSpeed[band] || 0) + 1
  }
}

const top = (o, n = 8) =>
  (o instanceof Map ? [...o] : Object.entries(o))
    .sort((a, b) => b[1] - a[1]).slice(0, n)

console.log(`${vehicles.length} vehicles, ${minutes} simulated minutes, ` +
            `${samples} samples, STUCK_LIMIT ${STUCK_LIMIT}s\n`)

console.log(`vehicle-samples stopped over 15s: ${longWaits}`)
console.log(`deadlock rings in the waiting graph: ${rings}`)
console.log(`relocations (the teleport valve firing): ${relocations}\n`)

console.log('WHERE they are stopped:')
for (const [k, n] of top(byLane)) console.log(`   ${String(n).padStart(6)}  lane ${k}`)

console.log('\nWHAT is at the head of their queue:')
for (const [k, n] of top(headKind)) console.log(`   ${String(n).padStart(6)}  ${k}`)

console.log('\n   ...and what it says it is doing:')
for (const [k, n] of top(headWhy)) console.log(`   ${String(n).padStart(6)}  ${k}`)

console.log('\n   ...and whether it is actually moving:')
for (const [k, n] of top(headSpeed)) console.log(`   ${String(n).padStart(6)}  ${k}`)

// THE TELL. A vehicle reporting `cruise` is saying no rule is limiting it, so
// a stationary one is stopped by something that never wrote down a reason -
// and neither `lawfulWait()` nor any diagnostic can see past it.
const silent = (headSpeed.stationary || 0) && (headWhy.cruise || 0)
if (silent) {
  console.log(`\n   NOTE: ${headWhy.cruise} of the blockers are stationary while` +
              ` reporting 'cruise'.\n   A stopped vehicle that says nothing is` +
              ` limiting it is stopped by something\n   that does not set` +
              ` \`why\`, which makes the jam invisible to lawfulWait().`)
}
