/**
 * What the traffic actually does wrong, counted.
 *
 * Mike, having driven it: "Some of the cars still stutter or like have
 * irregular movement at times. Sometimes I see vehicles that just disappear
 * into thin air. I also think some of the vehicle mechanics have gotten worse
 * as in they drive weird routes (sudden U Turns). Traffic jams have also
 * increased."
 *
 * Four complaints, four different numbers, and they have to be separated
 * before any of them can be fixed - "the traffic feels worse" is not something
 * you can measure a change against. So:
 *
 *   TELEPORTS  a vehicle vanishing is `relocate()`, the last-resort valve that
 *              picks a random lane anywhere in the world and puts the vehicle
 *              on it. Counted, and the distance it jumped recorded, because a
 *              200-unit jump is the one you see.
 *   U-TURNS    a lane change where the new lane sets off back the way the old
 *              one came. Detected by comparing the heading at the end of the
 *              lane being left with the heading at the start of the one being
 *              joined.
 *   STUTTER    a vehicle whose speed swings hard and then recovers - braking
 *              for something that was not there. Counted as reversals of
 *              acceleration bigger than a threshold, per vehicle-minute.
 *   JAMS       the fraction of vehicle-time spent stationary, and the longest
 *              single stand.
 *
 * Run across several spawn seeds, because every one of these is chaotic: the
 * relocation count for an unchanged world ranges from 1 to 27 across ten
 * spawns, and a single run of it once proved three mutually contradictory
 * things about tow trucks in the same afternoon.
 *
 *   node tools/trafficHealth.mjs [seconds] [seeds...]
 */
import {
  getLaneNetwork, getBusStops, getStations, makeTraffic, stepTraffic,
  pointAlong, angleDelta, TRAFFIC_FLEET
} from '../src/world/islandLayout.js'

const SECONDS = Number(process.argv[2] || 300)
const SEEDS = process.argv.length > 3
  ? process.argv.slice(3).map(Number)
  : [424242, 7, 101, 55555, 991, 31337]

const net = getLaneNetwork()
const stops = getBusStops()
const stations = getStations()
const dt = 1 / 30

/** A vehicle is standing still if it is going slower than this. */
const STOPPED = 0.4
/**
 * A SURGE is a visible speed swing: the vehicle loses this much speed and
 * gets it back inside SURGE_WINDOW seconds.
 *
 * Defined on the speed itself rather than on the acceleration, and that
 * matters. The first version of this counted acceleration reversals, which
 * fires on a target speed wobbling by a fifth of a unit - invisible, and it
 * scored a genuinely smoother city as worse because the smoother controller
 * sits nearer its target and therefore crosses it more often. What can be seen
 * from the pavement is a car dropping several units of speed and picking them
 * straight back up, so that is what this counts.
 */
const SURGE = 2.5
const SURGE_WINDOW = 2.0

export function measure(seed, seconds = SECONDS, fleet = TRAFFIC_FLEET) {
  const vs = makeTraffic(net, fleet, stops, stations, seed)

  const prevLane = vs.map(v => v.lane)
  const prevSpeed = vs.map(() => 0)
  const stoppedFor = vs.map(() => 0)
  // Per vehicle: the highest speed seen recently, and how long ago it was.
  const peak = vs.map(() => 0)
  const troughSince = vs.map(() => -1)
  const trough = vs.map(() => 0)

  let teleports = 0
  let teleportDistance = 0
  let worstTeleport = 0
  let uturns = 0
  let surges = 0
  let stoppedFrames = 0
  let frames = 0
  let longestStop = 0
  const byKind = {}
  const bump = (kind, what) => {
    byKind[kind] = byKind[kind] || { teleports: 0, uturns: 0, surges: 0 }
    byKind[kind][what]++
  }

  const relocationsBefore = vs.map(v => v.relocations || 0)

  for (let step = 0; step < seconds / dt; step++) {
    const before = vs.map(v => ({ lane: v.lane, at: v.at, reloc: v.relocations || 0 }))
    const wasAt = vs.map(v => {
      const p = pointAlong(net.lanes[v.lane], v.at)
      return { x: p.x, z: p.z }
    })

    stepTraffic(net, vs, dt, step * dt, null, null)

    for (let i = 0; i < vs.length; i++) {
      const v = vs[i]
      frames++

      // --- teleports ---
      if ((v.relocations || 0) > before[i].reloc) {
        teleports++
        const now = pointAlong(net.lanes[v.lane], v.at)
        const jump = Math.hypot(now.x - wasAt[i].x, now.z - wasAt[i].z)
        teleportDistance += jump
        worstTeleport = Math.max(worstTeleport, jump)
        bump(v.kind, 'teleports')
      } else if (v.lane !== before[i].lane) {
        // --- U-turns ---
        //
        // Only for an ordinary lane change; a relocation is a different event
        // and counting it here would double-count the same frame.
        const out = pointAlong(net.lanes[before[i].lane], net.lanes[before[i].lane].length)
        const into = pointAlong(net.lanes[v.lane], 0)
        if (Math.abs(angleDelta(into.heading, out.heading)) > 2.4) {
          uturns++
          bump(v.kind, 'uturns')
        }
      }

      // --- stutter, as a down-then-up swing you could see ---
      const t = step * dt
      if (v.speed > peak[i]) { peak[i] = v.speed; troughSince[i] = -1 }
      if (peak[i] - v.speed >= SURGE && troughSince[i] < 0) {
        troughSince[i] = t
        trough[i] = v.speed
      }
      if (troughSince[i] >= 0) {
        trough[i] = Math.min(trough[i], v.speed)
        if (v.speed - trough[i] >= SURGE) {
          // Down and back up: one surge.
          surges++
          bump(v.kind, 'surges')
          peak[i] = v.speed
          troughSince[i] = -1
        } else if (t - troughSince[i] > SURGE_WINDOW) {
          // It slowed and stayed slow. That is traffic, not stutter.
          peak[i] = v.speed
          troughSince[i] = -1
        }
      }
      prevSpeed[i] = v.speed

      // --- jams ---
      if (v.speed < STOPPED && !v.parking) {
        stoppedFrames++
        stoppedFor[i] += dt
        longestStop = Math.max(longestStop, stoppedFor[i])
      } else {
        stoppedFor[i] = 0
      }
    }
  }

  const minutes = (frames * dt) / 60
  return {
    seed,
    fleet: vs.length,
    teleports,
    teleportMean: teleports ? +(teleportDistance / teleports).toFixed(0) : 0,
    teleportWorst: +worstTeleport.toFixed(0),
    uturns,
    uturnsPerMin: +(uturns / minutes).toFixed(2),
    surges,
    surgesPerMin: +(surges / minutes).toFixed(2),
    stoppedPct: +(100 * stoppedFrames / frames).toFixed(1),
    longestStop: +longestStop.toFixed(0),
    byKind
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = SEEDS.map(s => measure(s))
  const col = (k) => all.map(r => r[k])
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1]

  console.log(`\n${SECONDS}s, ${all[0].fleet} vehicles, ${SEEDS.length} spawns\n`)
  console.log('  seed      teleport  worst  U-turn/min  surge/min  stopped%  longest')
  for (const r of all) {
    console.log(`  ${String(r.seed).padStart(7)}  ${String(r.teleports).padStart(8)}` +
      `  ${String(r.teleportWorst).padStart(5)}  ${String(r.uturnsPerMin).padStart(10)}` +
      `  ${String(r.surgesPerMin).padStart(9)}  ${String(r.stoppedPct).padStart(8)}` +
      `  ${String(r.longestStop).padStart(7)}s`)
  }
  console.log(`\n  MEDIAN   ${String(med(col('teleports'))).padStart(8)}` +
    `  ${String(med(col('teleportWorst'))).padStart(5)}` +
    `  ${String(med(col('uturnsPerMin'))).padStart(10)}` +
    `  ${String(med(col('surgesPerMin'))).padStart(9)}` +
    `  ${String(med(col('stoppedPct'))).padStart(8)}` +
    `  ${String(med(col('longestStop'))).padStart(7)}s`)

  // Which kinds are responsible, summed over every spawn.
  const totals = {}
  for (const r of all) {
    for (const [kind, counts] of Object.entries(r.byKind)) {
      totals[kind] = totals[kind] || { teleports: 0, uturns: 0, surges: 0 }
      for (const k of Object.keys(counts)) totals[kind][k] += counts[k]
    }
  }
  console.log('\n  by kind, all spawns:')
  for (const [kind, c] of Object.entries(totals).sort((a, b) => b[1].uturns - a[1].uturns)) {
    console.log(`    ${kind.padEnd(12)} teleports ${String(c.teleports).padStart(3)}` +
      `   U-turns ${String(c.uturns).padStart(4)}   surges ${String(c.surges).padStart(5)}`)
  }
  console.log()
}
