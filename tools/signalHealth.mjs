/**
 * What the traffic lights cost, and what a change to them buys.
 *
 * Mike: "I still see a bunch of traffic jams. Sometimes longer vehicles will
 * create bottlenecks... Can we add multi-lane roads for the main arteries of
 * traffic? I understand this will be a significant rework of the islands."
 *
 * Before doing that, this was written to find out whether road width is what
 * the jams are made of. It is not. Measured on the unchanged map:
 *
 *     45.1% of all vehicle-time stopped
 *     61.2% of that stopped time at a red light
 *     117 of 167 public lanes signalled - 70% of the network
 *     74.2% of all GREEN time shown to an empty road
 *     23.1% of all RED time with a queue behind it
 *
 * Seventy vehicles spread over a hundred and sixty-seven lanes means most arms
 * are empty most of the time, and a fixed twelve-second cycle spends most of
 * its green on nobody while a queue sits at the red beside it. More lanes do
 * nothing for that: a red light stops two lanes as easily as one.
 *
 *     node tools/signalHealth.mjs                 the before/after headline
 *     node tools/signalHealth.mjs sweep           try a grid of timings
 *     node tools/signalHealth.mjs sweep 3 180     3 seeds, 180 seconds each
 *
 * READ `red-with-queue`, NOT `green-on-empty`. The second one GOES UP after
 * the fix - 72% to 77% - and that is the fix working, not failing. Resting on
 * green means a junction nobody is using deliberately shows green to an empty
 * road for as long as that lasts, so "green shown to nobody" stops being a
 * cost and becomes the point. What it costs a driver is red-with-queue, and
 * that falls from 25% to 17%.
 *
 * FIVE SEEDS, NOT TWO. Two was tried and reported a nine-point spread between
 * neighbouring settings that vanished on five - the same lesson trafficHealth
 * records at the top of its own file, learned again.
 */
import {
  getLaneNetwork, getBusStops, getStations, makeTraffic, stepTraffic,
  signalState, TRAFFIC_FLEET, TRAFFIC_STOP_SIGHT, SIGNAL_TUNING,
  SIGNAL_MIN_GREEN, SIGNAL_MAX_GREEN, SIGNAL_GAP
} from '../src/world/islandLayout.js'

const MODE = process.argv[2] || 'headline'
const SEED_COUNT = Number(process.argv[3] || 5)
const SECONDS = Number(process.argv[4] || 240)
const ALL_SEEDS = [424242, 7, 101, 55555, 991, 31337, 2024, 88]
const SEEDS = ALL_SEEDS.slice(0, SEED_COUNT)

const net = getLaneNetwork()
const stops = getBusStops()
const stations = getStations()
const dt = 1 / 30

/** Put every junction back to an unstarted state. */
function resetSignals() {
  for (const lane of net.lanes) {
    const c = lane.signal && lane.signal.control
    if (!c) continue
    c.phase = undefined
    c.changeAt = undefined
    c.clearFor = 0
    c.since = 0
  }
}

/**
 * One run. Returns the fractions that matter, not a verdict.
 *
 * `moving` is the headline because it is the thing a player sees: a city where
 * two cars in three are rolling looks alive, and one where one in two is stood
 * at a light looks broken. Vehicles in a station bay are excluded - they are
 * parked on purpose and counting them as "stopped" flatters or punishes a
 * change depending only on how many ambulances happened to be home.
 */
function once(seed, seconds) {
  resetSignals()
  const vs = makeTraffic(net, TRAFFIC_FLEET, stops, stations, seed)

  let total = 0, moving = 0, atRed = 0
  let green = 0, wastedGreen = 0, red = 0, redWithQueue = 0

  const signalled = net.lanes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.signal && !l.noTraffic)

  for (let s = 0; s < seconds / dt; s++) {
    const elapsed = s * dt
    stepTraffic(net, vs, dt, elapsed, null, null)

    for (const v of vs) {
      if (v.parking) continue
      total++
      if (v.speed >= 0.4) moving++
    }

    // Sampled every third frame. The answer does not move between them and it
    // is a walk over every signalled lane.
    if (s % 3) continue

    const onLane = new Map()
    for (const v of vs) {
      const lane = net.lanes[v.lane]
      if (!lane.signal) continue
      if (lane.length - v.at > TRAFFIC_STOP_SIGHT) continue
      onLane.set(v.lane, (onLane.get(v.lane) || 0) + 1)
    }

    for (const { l, i } of signalled) {
      const waiting = onLane.get(i) || 0
      if (signalState(l.signal, l.signalGroup, elapsed) === 'green') {
        green++
        if (!waiting) wastedGreen++
      } else {
        red++
        if (waiting) { redWithQueue++; atRed += waiting }
      }
    }
  }

  return {
    moving: 100 * moving / total,
    wastedGreen: 100 * wastedGreen / Math.max(1, green),
    redWithQueue: 100 * redWithQueue / Math.max(1, red)
  }
}

function across(label, seconds = SECONDS) {
  const runs = SEEDS.map(seed => once(seed, seconds))
  const mean = (key) => runs.reduce((a, r) => a + r[key], 0) / runs.length
  const moving = runs.map(r => r.moving)

  console.log(`  ${label.padEnd(30)} moving ${mean('moving').toFixed(1)}%  ` +
              `(${Math.min(...moving).toFixed(1)} - ${Math.max(...moving).toFixed(1)})  ` +
              `green-on-empty ${mean('wastedGreen').toFixed(0)}%  ` +
              `red-with-queue ${mean('redWithQueue').toFixed(0)}%`)
  return mean('moving')
}

const signalledLanes = net.lanes.filter(l => l.signal && !l.noTraffic).length
const publicLanes = net.lanes.filter(l => !l.noTraffic).length
const junctions = new Set(net.lanes.filter(l => l.signal).map(l => l.signal)).size

console.log(`${signalledLanes} of ${publicLanes} public lanes signalled, ` +
            `across ${junctions} junctions`)
console.log(`${SEEDS.length} seeds x ${SECONDS}s\n`)

if (MODE === 'sweep') {
  console.log('sweep:')
  const grid = [
    [5, 9, 1.2], [6, 10, 1.4], [7, 11, 1.4], [7, 11, 1.0],
    [8, 12, 1.4], [7, 13, 1.4], [9, 13, 1.6]
  ]
  SIGNAL_TUNING.enabled = false
  across('BASELINE fixed cycle')
  SIGNAL_TUNING.enabled = true
  for (const [min, max, gap] of grid) {
    SIGNAL_TUNING.minGreen = min
    SIGNAL_TUNING.maxGreen = max
    SIGNAL_TUNING.gap = gap
    across(`min ${min} max ${max} gap ${gap}`)
  }
  SIGNAL_TUNING.minGreen = SIGNAL_MIN_GREEN
  SIGNAL_TUNING.maxGreen = SIGNAL_MAX_GREEN
  SIGNAL_TUNING.gap = SIGNAL_GAP
} else {
  SIGNAL_TUNING.enabled = false
  const before = across('BASELINE fixed cycle')
  SIGNAL_TUNING.enabled = true
  const after = across(
    `demand ${SIGNAL_MIN_GREEN}/${SIGNAL_MAX_GREEN}/${SIGNAL_GAP}`)

  console.log(`\n  moving: ${before.toFixed(1)}% -> ${after.toFixed(1)}%`)
  console.log(`  stopped: ${(100 - before).toFixed(1)}% -> ` +
              `${(100 - after).toFixed(1)}%  ` +
              `(${(100 * (before - after) / (100 - before)).toFixed(0)}% less)`)
}
