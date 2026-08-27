/**
 * Traffic lights that watch the road instead of the clock.
 *
 * Mike: "I still see a bunch of traffic jams."
 *
 * Measured before anything was changed - and this is the number that decided
 * NOT to do the multi-lane island rework first:
 *
 *     45.1% of all vehicle-time stopped
 *     61.2% of that stopped time at a red light
 *     117 of 167 public lanes signalled - 70% of the network
 *     74.2% of all GREEN time shown to an empty road
 *
 * A fixed twelve-second cycle, on seventy vehicles spread over a hundred and
 * sixty-seven lanes. Most arms are empty most of the time, so most green is
 * spent on nobody while a queue waits at the red beside it. More lanes cannot
 * help with that: a red light stops two lanes as easily as one.
 *
 * Four sections. The first is the one that would have shipped a silent
 * do-nothing: the cars and the lamps read two DIFFERENT copies of every
 * signal, so state on one is invisible to the other.
 */
import {
  getLaneNetwork, getTrafficSignals, getBusStops, getStations,
  makeTraffic, stepTraffic, driveSignals, signalState,
  ISLANDS, TRAFFIC_FLEET, TRAFFIC_CYCLE, TRAFFIC_AMBER, TRAFFIC_STOP_SIGHT,
  SIGNAL_MIN_GREEN, SIGNAL_MAX_GREEN, SIGNAL_GAP, SIGNAL_TUNING
} from '../src/world/islandLayout.js'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const net = getLaneNetwork()
const stops = getBusStops()
const stations = getStations()
const dt = 1 / 30

const laneSignals = new Set(net.lanes.filter(l => l.signal).map(l => l.signal))

function resetSignals() {
  for (const s of laneSignals) {
    s.control.phase = undefined
    s.control.changeAt = undefined
    s.control.clearFor = 0
    s.control.since = 0
  }
}

// ---------------------------------------------------------------------------
console.log('1. The cars and the lamps read the same junction\n')

{
  // getTrafficSignals() used to rebuild its objects on every call, and TWO
  // callers depend on them - getLaneNetwork() for what the cars obey, and
  // World.createIslands() for what the lamps show. Two object graphs for the
  // same junctions.
  const a = getTrafficSignals(ISLANDS[0])
  const b = getTrafficSignals(ISLANDS[0])
  chk('the signals are cached, so two callers get one answer', a === b)
}

{
  // And the copy that attachSignals() makes for world coordinates shares the
  // MUTABLE part by reference, which a shallow spread does for free. Get this
  // wrong and everything else in this file still passes while the game shows
  // one cycle to the cars and another to the lamps.
  const controls = new Set()
  for (const island of ISLANDS) {
    for (const s of getTrafficSignals(island)) controls.add(s.control)
  }
  const shared = [...laneSignals].filter(s => controls.has(s.control)).length

  console.log(`   ${laneSignals.size} signals reachable from the lanes, ` +
              `${controls.size} from the islands, ${shared} sharing a control`)
  chk('every signal has a control object',
      [...laneSignals].every(s => s.control))
  chk('and the lane copy shares it with the island original',
      shared === laneSignals.size, `${shared}/${laneSignals.size}`)
  chk('and no two junctions share one control',
      controls.size === laneSignals.size)
}

// ---------------------------------------------------------------------------
console.log('\n2. Undriven, it is still the old fixed cycle\n')

{
  resetSignals()
  const signal = [...laneSignals][0]

  // Not politeness: the editor, the map tools and half the suite ask what a
  // signal is showing without ever stepping the traffic, and for them
  // getTrafficSignals() has to stay a pure function of the map.
  const states = new Set()
  for (let t = 0; t < TRAFFIC_CYCLE * 3; t += 0.25) {
    states.add(signalState(signal, 0, t))
  }
  chk('an unstarted signal still cycles on the clock',
      states.has('green') && states.has('red') && states.has('amber'),
      [...states].join(','))

  // And the two groups are never both green, which is the whole point of a
  // junction.
  let both = 0
  for (let t = 0; t < TRAFFIC_CYCLE * 4; t += 0.1) {
    if (signalState(signal, 0, t) !== 'red' &&
        signalState(signal, 1, t) !== 'red') both++
  }
  chk('and the two groups are never both showing something other than red',
      both === 0, `${both}`)
}

// ---------------------------------------------------------------------------
console.log('\n3. Driven, it watches the road\n')

{
  // REST ON GREEN. An empty junction should not keep changing its mind. This
  // is the rule that de-signals the dead junctions without removing a pole
  // from the map, and it is most of what the improvement is made of.
  resetSignals()
  driveSignals(net.lanes, [], 0, dt)
  const signal = [...laneSignals][0]
  const first = signal.control.phase

  chk('a junction picks a phase on its first step', first !== undefined)

  for (let s = 1; s < 60 / dt; s++) driveSignals(net.lanes, [], s * dt, dt)
  chk('and with nobody waiting it holds that green for a full minute',
      signal.control.phase === first && signal.control.changeAt === undefined,
      `${signal.control.phase} vs ${first}`)
}

{
  // The two groups are never both green under demand either, and the change
  // always goes through an amber.
  resetSignals()
  const vs = makeTraffic(net, TRAFFIC_FLEET, stops, stations, 424242)

  let bothLive = 0, shortGreen = 0
  let worstWait = 0
  const waitingSince = new Map()   // signal -> when this red first had a queue

  for (let s = 0; s < 240 / dt; s++) {
    const elapsed = s * dt
    stepTraffic(net, vs, dt, elapsed, null, null)

    // How many are at the line on each group, the same way driveSignals counts.
    const demand = new Map()
    for (const v of vs) {
      if (v.parking) continue
      const lane = net.lanes[v.lane]
      if (!lane.signal) continue
      if (lane.length - v.at > TRAFFIC_STOP_SIGHT) continue
      let counts = demand.get(lane.signal)
      if (!counts) { counts = [0, 0]; demand.set(lane.signal, counts) }
      counts[lane.signalGroup]++
    }

    for (const signal of laneSignals) {
      const c = signal.control
      const a = signalState(signal, 0, elapsed)
      const b = signalState(signal, 1, elapsed)
      if (a !== 'red' && b !== 'red') bothLive++

      if (c.changeAt !== undefined && c.changeAt === elapsed) {
        if (elapsed - c.since < SIGNAL_MIN_GREEN - 1e-9) shortGreen++
      }

      // HOW LONG ANYONE IS ACTUALLY MADE TO WAIT, which is the invariant that
      // matters and is NOT "no green runs past the maximum".
      //
      // That was the first version of this check and it failed 68 times on
      // correct code. Rule 1 - never change to an empty arm - deliberately
      // overrides the maximum, so a green with nobody opposing it runs as long
      // as it likes. When demand finally appears the green is ALREADY past the
      // cap, so it changes on the next frame and the length at the moment of
      // change is legitimately over. The cap was never about the green; it is
      // about the wait, so measure the wait.
      // PER GROUP, not per junction, and the difference is 89 seconds.
      //
      // The first version kept one timer per SIGNAL. So when the phase flipped
      // and the newly-red group immediately had its own queue, the timer was
      // never reset - it went on measuring "how long has this junction had
      // somebody waiting on SOME red arm", which at a busy crossroads is
      // simply "how long has this junction been busy". It reported 89s against
      // a bound of 13 and I nearly went looking for a starvation bug that was
      // not there.
      const waiting = demand.get(signal) || [0, 0]
      for (const group of [0, 1]) {
        const key = signal.control
        const held = waiting[group] > 0 &&
                     signalState(signal, group, elapsed) === 'red'
        const id = `${[...laneSignals].indexOf(signal)}:${group}`
        if (!held) { waitingSince.delete(id); continue }
        if (!waitingSince.has(id)) waitingSince.set(id, elapsed)
        worstWait = Math.max(worstWait, elapsed - waitingSince.get(id))
      }
    }
  }

  console.log(`   longest anyone was held at a red with the green arm ` +
              `opposing them: ${worstWait.toFixed(1)}s`)

  chk('under real traffic the groups are never both live',
      bothLive === 0, `${bothLive} frames`)
  chk('no green is shorter than the minimum',
      shortGreen === 0, `${shortGreen}`)
  chk('and nobody waits longer than one full green plus the amber',
      worstWait <= SIGNAL_MAX_GREEN + TRAFFIC_AMBER + 0.2,
      `${worstWait.toFixed(2)}s against a bound of ` +
      `${SIGNAL_MAX_GREEN + TRAFFIC_AMBER}`)
}

{
  // A GAP, not an instant. This is the correction that turned the whole thing
  // from a regression into a fix, so it gets a check of its own.
  //
  // The first version changed as soon as the green arm was clear ON ONE FRAME.
  // On a main road carrying a steady stream something is always within sight
  // of the line, so it never fired, every junction ran to the maximum, and the
  // side roads waited LONGER than the fixed cycle gave them: 60.3% of
  // vehicle-time stopped against the fixed cycle's 45.1%.
  chk('the gap is a duration, not an instant', SIGNAL_GAP > 0.5, `${SIGNAL_GAP}`)
  chk('and shorter than the minimum green, or it could never fire',
      SIGNAL_GAP < SIGNAL_MIN_GREEN)
  chk('the maximum green is longer than the minimum',
      SIGNAL_MAX_GREEN > SIGNAL_MIN_GREEN)

  const layout = readFileSync('src/world/islandLayout.js', 'utf8')
  chk('and the gap is accumulated over time rather than tested per frame',
      /control\.clearFor = mine \? 0 : \(control\.clearFor \|\| 0\) \+ delta/
        .test(layout))
}

{
  // A second simulation must not inherit the first one's phases. The signals
  // are cached per island and outlive any one run.
  const vs = makeTraffic(net, TRAFFIC_FLEET, stops, stations, 7)
  const signal = [...laneSignals][0]
  signal.control.since = 900          // as if a long run had just ended
  signal.control.phase = 1
  stepTraffic(net, vs, dt, 0, null, null)
  chk('a run starting at zero resets a signal left over from another',
      signal.control.since <= 0 + 1e-9, `${signal.control.since}`)
}

// ---------------------------------------------------------------------------
console.log('\n4. It actually moves more traffic\n')

/** Fraction of vehicle-time spent moving, over one run. */
function moving(seed, seconds) {
  resetSignals()
  const vs = makeTraffic(net, TRAFFIC_FLEET, stops, stations, seed)
  let total = 0, rolling = 0
  for (let s = 0; s < seconds / dt; s++) {
    stepTraffic(net, vs, dt, s * dt, null, null)
    for (const v of vs) {
      if (v.parking) continue
      total++
      if (v.speed >= 0.4) rolling++
    }
  }
  return 100 * rolling / total
}

{
  const SEEDS = [424242, 7, 101]
  const SECONDS = 180

  SIGNAL_TUNING.enabled = false
  const before = SEEDS.map(s => moving(s, SECONDS))
  SIGNAL_TUNING.enabled = true
  const after = SEEDS.map(s => moving(s, SECONDS))

  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length
  console.log(`   fixed cycle:  ${mean(before).toFixed(1)}%  ` +
              `[${before.map(n => n.toFixed(0)).join(' ')}]`)
  console.log(`   demand-driven: ${mean(after).toFixed(1)}%  ` +
              `[${after.map(n => n.toFixed(0)).join(' ')}]`)

  chk('demand-driven signals move more traffic than the fixed cycle',
      mean(after) > mean(before) + 4,
      `${mean(after).toFixed(1)} vs ${mean(before).toFixed(1)}`)

  // The floor, not just the mean. A setting that is sometimes excellent and
  // sometimes worse than doing nothing is not an improvement, and one of the
  // candidates in the sweep was exactly that - a 20-point range across seeds.
  chk('and the worst seed still beats the fixed cycle average',
      Math.min(...after) > mean(before),
      `${Math.min(...after).toFixed(1)} vs ${mean(before).toFixed(1)}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
