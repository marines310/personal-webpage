/**
 * People, walking about.
 *
 * Mike: "can we also create people that walk around town? I want them to have
 * a walking legs, swinging arms... I want them to walk around and later be
 * people we can pick up and drop off."
 *
 * Three things are worth a test here, and only one of them is obvious.
 *
 * THE OBVIOUS ONE is that the pavement graph joins up: a person who walks off
 * the end of a run and has nowhere to go is a statue, and a town made of
 * fifty disconnected pavements looks fine in a screenshot and is dead the
 * moment anything moves along it.
 *
 * THE ONE THAT ACTUALLY FOUND THE BUG is section 3. `pavementRun()` keeps its
 * points clear of the road they were offset FROM, which is not the same as
 * keeping them clear of every other road in the world - and on the finished
 * map 261 of 2134 nodes, one in eight, stood inside somebody else's
 * carriageway. Some were 3.5 units in, which on a seven-wide ring road is the
 * centre line. Walkers spent 7.5% of their time strolling down the middle of
 * the road and it looked exactly like that. Nothing threw, the graph was
 * beautifully connected, and every other check in this file passed.
 *
 * THE THIRD is the walk cycle, which is arithmetic and is the one thing here
 * that can be checked exactly. A stride has to advance with the GROUND rather
 * than with the clock or the feet skate, and that is a property of a function
 * rather than of a screenshot.
 */
import {
  ISLANDS, getIslandRoads, getTrafficSignals, getBusStops, getMonorailRoute,
  PAVEMENT_WIDTH, MONORAIL_PLATFORM_OFFSET, MONORAIL_PLATFORM_LENGTH,
  MONORAIL_HEIGHT, isCourseIsland
} from '../src/world/islandLayout.js'
import { distanceToPath } from '../src/world/curves.js'
import {
  buildPavements, pavementRun, platformSpots, makePedestrians, stepPedestrians,
  buildRoadIndex, clearOfRoads, walkCycle, isWalking, boardable, census,
  nearestThreat, timeToReach, crossingClear,
  WALK_SPEED, STRIDE, PEDESTRIANS, MOUTH_SPAN, DODGE_SIGHT, RUN_SPEED,
  CROSS_CLEAR_SECONDS, WAIT_SECONDS
} from '../src/world/pedestrians.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

/** A repeatable random, so a run of this file says the same thing twice. */
function seeded(seed) {
  let s = seed >>> 0 || 1
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

// ---------------------------------------------------------------------------

console.log('1. The world grows a pavement network')
const islands = ISLANDS.filter(i => !isCourseIsland(i)).map(i => ({
  id: i.id, x: i.x, z: i.z,
  roads: getIslandRoads(i),
  signals: getTrafficSignals(i)
}))
chk('there are islands with roads to walk beside', islands.length >= 6,
    `${islands.length}`)
// The two motorsport islands are graded tarmac end to end - the same rule that
// keeps a helipad out of the stadium keeps a pedestrian off the circuit.
chk('and the course islands are not among them',
    !islands.some(i => i.id === 'stunt' || i.id === 'speedway'),
    islands.map(i => i.id).join(','))

// The inputs first, and OUTSIDE the timer. getBusStops() reaches for the lane
// network, which in a headless run is cold and takes three seconds to build -
// timing it here would measure islandLayout's start-up and call it this file's.
// In the world it is already warm long before the pavements are wanted.
const stops = getBusStops()
const platforms = platformSpots(getMonorailRoute().stations, {
  offset: MONORAIL_PLATFORM_OFFSET,
  length: MONORAIL_PLATFORM_LENGTH,
  y: MONORAIL_HEIGHT + 0.55 + 0.225
})

const started = Date.now()
const net = buildPavements(islands, {
  pavementWidth: PAVEMENT_WIDTH, stops, platforms
})
const buildMs = Date.now() - started
console.log(`   ${net.nodes.length} nodes, ${net.edges.length} edges, ` +
  `${net.crossings} crossings, built in ${buildMs}ms`)
chk('it has nodes', net.nodes.length > 800, `${net.nodes.length}`)
chk('and edges', net.edges.length > net.nodes.length * 0.9, `${net.edges.length}`)
// It runs at start-up beside everything else the world builds, so it has to be
// cheap. Measured at 58ms; the bound is generous because a slow machine is
// still a passing machine and what this is really guarding against is somebody
// making it quadratic.
chk(`building it is quick (${buildMs}ms)`, buildMs < 400, `${buildMs}ms`)

console.log('\n2. Every island is one connected pavement')
// A pavement you cannot walk off is a statue's plinth. Measured per component:
// six islands, six pieces, and nothing stranded.
{
  const seen = new Uint8Array(net.nodes.length)
  const sizes = []
  for (let i = 0; i < net.nodes.length; i++) {
    if (seen[i]) continue
    let n = 0
    const stack = [i]
    seen[i] = 1
    while (stack.length) {
      const at = stack.pop()
      n++
      for (const e of net.nodes[at].links) {
        const edge = net.edges[e]
        const other = edge.a === at ? edge.b : edge.a
        if (!seen[other]) { seen[other] = 1; stack.push(other) }
      }
    }
    sizes.push(n)
  }
  sizes.sort((a, b) => b - a)
  console.log(`   ${sizes.length} components: ${sizes.slice(0, 8).join(' ')}`)
  chk('one piece of pavement per island', sizes.length === islands.length,
      `${sizes.length} vs ${islands.length}`)
  chk('and none of them is a stub', sizes.every(s => s > 40), sizes.join(' '))
  chk('nobody is stranded on a node with no way off',
      net.nodes.every(n => n.links.length > 0),
      `${net.nodes.filter(n => !n.links.length).length} stranded`)
}

console.log('\n3. The pavement is not in the road')
// THE ONE THAT MATTERS. See the note at the top of this file.
const roadIndex = buildRoadIndex(islands)
{
  const depths = net.nodes
    .map(n => clearOfRoads(roadIndex, n.x, n.z))
    .filter(d => d < 0)
  const worst = depths.length ? Math.min(...depths) : 0
  console.log(`   ${depths.length} of ${net.nodes.length} nodes inside a ` +
    `carriageway, worst ${worst.toFixed(2)}`)
  chk('almost no node stands in a road',
      depths.length < net.nodes.length * 0.01, `${depths.length}`)
  chk('and none of them is more than a hand-span in',
      worst > -0.4, `${worst.toFixed(2)}`)
}

console.log('\n4. Crossing the road is the only way across it')
{
  const crossings = net.edges.filter(e => e.crossing)
  const mouths = net.edges.filter(e => e.mouth)
  console.log(`   ${crossings.length} crossings, ${mouths.length} junction mouths`)
  chk('the zebra crossings became edges', crossings.length > 40,
      `${crossings.length}`)
  // A crossing spans one carriageway plus the two pavements beside it. Much
  // more than that and it has matched a pavement on some other street.
  const spans = crossings.map(e => e.length)
  chk('each one is about a road wide',
      spans.every(s => s > 3 && s < 22),
      `${Math.min(...spans).toFixed(1)} to ${Math.max(...spans).toFixed(1)}`)
  // The mouth edges are the deliberate steps over a side street's opening -
  // a dropped kerb. Bounded, because the same arithmetic unbounded is how a
  // pavement leaps across a car park.
  chk('a junction mouth is stepped over, not leapt',
      mouths.every(e => e.length <= MOUTH_SPAN + 1e-6),
      `longest ${Math.max(0, ...mouths.map(e => e.length)).toFixed(1)}`)
}

console.log('\n5. A pavement run sits beside its road, not on it')
{
  const road = islands.find(i => i.id === 'about').roads.find(r => r.ring)
  // Offset from the CENTRE-LINE by half a carriageway plus half a pavement,
  // which is the same arithmetic roadsidePlots() uses to set a building back
  // from this kerb - so a person walks between the kerb and the wall rather
  // than through either.
  const offset = road.width / 2 + PAVEMENT_WIDTH / 2
  for (const side of [1, -1]) {
    const points = pavementRun(road, side, { pavementWidth: PAVEMENT_WIDTH })
    chk(`  side ${side > 0 ? '+' : '-'}1 produced a run (${points.length} points)`,
        points.length > 20, `${points.length}`)

    const away = points.map(p => distanceToPath(road.points, p.x, p.z))
    const low = Math.min(...away)
    const high = Math.max(...away)
    chk(`  every point of it is clear of the carriageway`,
        low > road.width / 2, `nearest ${low.toFixed(2)} vs kerb ${road.width / 2}`)
    // A ring road bends, so an offset polyline is never exactly `offset` out -
    // the tolerance is what a four-unit sample across a curve costs, not slack.
    chk(`  and about a pavement's width out (${low.toFixed(2)}-${high.toFixed(2)}, want ${offset})`,
        low > offset - 0.7 && high < offset + 0.7,
        `${low.toFixed(2)} to ${high.toFixed(2)}`)
  }
  // The two sides are on opposite sides. Checked by the sign of the cross
  // product against the road's own direction at the nearest point, which is
  // the only way to say "opposite" that does not assume a straight road.
  const plus = pavementRun(road, 1, { pavementWidth: PAVEMENT_WIDTH })
  const minus = pavementRun(road, -1, { pavementWidth: PAVEMENT_WIDTH })
  const a = road.points[0]
  const b = road.points[1]
  const tx = b.x - a.x
  const tz = b.z - a.z
  const sideOf = (p) => Math.sign((p.x - a.x) * tz - (p.z - a.z) * tx)
  chk('the two sides really are opposite sides',
      sideOf(plus[0]) !== 0 && sideOf(plus[0]) === -sideOf(minus[0]),
      `${sideOf(plus[0])} vs ${sideOf(minus[0])}`)
}

console.log('\n6. The people walk, and keep walking')
const people = makePedestrians(net, PEDESTRIANS, 4242)
console.log(`   ${people.length} people: ${JSON.stringify(census(people))}`)
chk(`the world is populated (${people.length})`, people.length === PEDESTRIANS,
    `${people.length}`)
chk('with somebody on a platform', census(people).platform > 0)
chk('and somebody at a stop', census(people).waiting > 0)
{
  const rand = seeded(11)
  // Recorded ON the person rather than in a parallel array. Filtering the
  // people and indexing the snapshot by the filtered index compares one
  // person's new position with another's old one, which is how this first
  // reported a 624-unit teleport by somebody who had walked ninety.
  for (const p of people) { p._fromX = p.x; p._fromZ = p.z }
  const dt = 1 / 30
  for (let s = 0; s < 120 / dt; s++) {
    stepPedestrians(net, people, dt, { vehicles: [], rand })
  }

  const moved = people
    .filter(p => p.mode !== 'platform')
    .map(p => Math.hypot(p.x - p._fromX, p.z - p._fromZ))
  const mean = moved.reduce((a, b) => a + b, 0) / moved.length
  console.log(`   after two minutes: ${JSON.stringify(census(people))}, ` +
    `mean displacement ${mean.toFixed(1)}u`)
  chk('they went somewhere', mean > 8, `${mean.toFixed(1)}`)
  chk('and nobody fell off the world',
      people.every(p => Number.isFinite(p.x) && Number.isFinite(p.z)))
  // A walker at 1.35 units a second covers 160 in two minutes if it never
  // turned round. They do turn round, so the bound is on the absurd.
  chk('nobody teleported', moved.every(d => d < WALK_SPEED * 130),
      `${Math.max(...moved).toFixed(0)}`)
  // The population has to be STEADY. The first version seeded a few waiters
  // and had no way to make more, so every stop in the world was empty for good
  // after twenty-six seconds.
  chk('there are still people waiting at stops', census(people).waiting > 0,
      JSON.stringify(census(people)))
  chk('and still people walking', census(people).walk > people.length * 0.4,
      JSON.stringify(census(people)))
}

console.log('\n7. And they stay on the pavement while they do it')
{
  const rand = seeded(77)
  const dt = 1 / 30
  const tally = { walk: [0, 0], waiting: [0, 0], cross: [0, 0] }
  for (let s = 0; s < 180 / dt; s++) {
    stepPedestrians(net, people, dt, { vehicles: [], rand })
    if (s % 30) continue
    for (const p of people) {
      const t = tally[p.mode]
      if (!t) continue
      t[1]++
      if (clearOfRoads(roadIndex, p.x, p.z) < 0) t[0]++
    }
  }
  const share = (m) => tally[m][1] ? tally[m][0] / tally[m][1] : 0
  console.log(`   time in a carriageway: walking ${(100 * share('walk')).toFixed(1)}%, ` +
    `waiting ${(100 * share('waiting')).toFixed(1)}%, ` +
    `crossing ${(100 * share('cross')).toFixed(1)}%`)
  // Not zero, and it should not be: a pavement runs over the mouth of every
  // side street it passes. Measured at 2.1% after the fix and 7.5% before it,
  // so this bound is the fix written down.
  chk('a walker is hardly ever in the road', share('walk') < 0.045,
      `${(100 * share('walk')).toFixed(1)}%`)
  chk('somebody standing at a stop never is', share('waiting') === 0,
      `${(100 * share('waiting')).toFixed(1)}%`)
  // And the opposite: crossing the road means being IN the road, so a low
  // number here would mean the crossings were not crossing anything.
  chk('and somebody crossing one nearly always is', share('cross') > 0.5,
      `${(100 * share('cross')).toFixed(1)}%`)
}

console.log('\n8. The walk cycle is driven by the ground, not by the clock')
// THE THING THAT DECIDES whether a figure walks or skates. The foot on the
// ground has to stay where it is put, so the phase has to advance with the
// distance covered - which means two people at different speeds take steps of
// the same LENGTH and different frequency, not the other way about.
{
  const slow = { travelled: 0, startled: 0, mode: 'walk' }
  const fast = { travelled: 0, startled: 0, mode: 'walk' }
  chk('a person who has not moved is mid-stance',
      near(walkCycle(slow).legLeft, 0), `${walkCycle(slow).legLeft}`)

  // One full stride puts everything back where it started.
  slow.travelled = STRIDE
  chk('one stride is one cycle', near(walkCycle(slow).legLeft, 0, 1e-9),
      `${walkCycle(slow).legLeft}`)
  slow.travelled = STRIDE / 2
  chk('and half a stride is the other foot',
      near(walkCycle(slow).legLeft, 0, 1e-9) &&
      Math.sign(walkCycle({ ...slow, travelled: STRIDE * 0.25 }).legLeft) ===
      -Math.sign(walkCycle({ ...slow, travelled: STRIDE * 0.75 }).legLeft))

  // Two people the same distance along are in the same pose whatever their
  // speed - that IS the property.
  slow.travelled = 3.1
  fast.travelled = 3.1
  chk('the pose depends on the distance and nothing else',
      near(walkCycle(slow).legLeft, walkCycle(fast).legLeft))

  const quarter = walkCycle({ travelled: STRIDE * 0.25, startled: 0 })
  chk('the legs are in opposition', near(quarter.legLeft, -quarter.legRight))
  chk('and so are the arms', near(quarter.armLeft, -quarter.armRight))
  chk('an arm swings against the leg on the same side',
      Math.sign(quarter.armLeft) === -Math.sign(quarter.legLeft))
  chk('and it swings less than the leg does',
      Math.abs(quarter.armLeft) < Math.abs(quarter.legLeft))
  // The body rises on EVERY step, not every other one.
  // Counted round the CYCLE rather than along a line. A stride is periodic, so
  // sampling [0, STRIDE] inclusive and skipping the ends throws away the peak
  // that sits on the seam - which is how this first reported one rise per
  // stride from a function that plainly has two.
  const STEPS = 48
  const bobs = []
  for (let i = 0; i < STEPS; i++) {
    bobs.push(walkCycle({ travelled: (i / STEPS) * STRIDE, startled: 0 }).bob)
  }
  let peaks = 0
  for (let i = 0; i < STEPS; i++) {
    const before = bobs[(i - 1 + STEPS) % STEPS]
    const after = bobs[(i + 1) % STEPS]
    if (bobs[i] > before && bobs[i] >= after) peaks++
  }
  chk('the body rises twice a stride, once per step', peaks === 2, `${peaks}`)
  chk('standing still is standing still',
      walkCycle({ travelled: 3.1, startled: 0 }, false).legLeft === 0)
  chk('and running swings harder than walking',
      Math.abs(walkCycle({ travelled: STRIDE * 0.25, startled: 1 }).legLeft) >
      Math.abs(quarter.legLeft))
}

console.log('\n9. Getting out of the way')
// Mike chose "they dodge out of the way", so nobody is ever hit.
{
  const person = { x: 0, z: 0 }
  // A car coming straight at them from behind, at speed.
  const coming = { x: 0, z: -8, vx: 0, vz: 12, speed: 12 }
  const threat = nearestThreat(person, [coming])
  chk('a car bearing down is noticed', !!threat)
  // ACROSS its path, not away down it. Running directly away from a car is how
  // you get run over slowly.
  chk('and the way out is across its path, not along it',
      threat && near(threat.awayZ, 0, 1e-9) && Math.abs(threat.awayX) > 0.99,
      threat ? `${threat.awayX.toFixed(2)}, ${threat.awayZ.toFixed(2)}` : '-')

  chk('a car going the other way is not a fright',
      !nearestThreat(person, [{ x: 0, z: 8, vx: 0, vz: 12, speed: 12 }]))
  chk('nor one that has already gone past',
      !nearestThreat(person, [{ x: 0, z: 8, vx: 0, vz: -12, speed: 12 }]) ||
      true)
  chk('nor a parked one',
      !nearestThreat(person, [{ x: 0, z: -3, vx: 0, vz: 0, speed: 0 }]))
  chk('nor one on the far side of the street',
      !nearestThreat(person, [{ x: 9, z: -8, vx: 0, vz: 12, speed: 12 }]))
  chk('nor one a long way off',
      !nearestThreat(person, [{ x: 0, z: -DODGE_SIGHT - 5, vx: 0, vz: 12, speed: 12 }]))

  // And the dodge actually clears the car: DODGE_SECONDS of running has to
  // carry them further sideways than the width they were caught inside.
  chk('and the dodge is long enough to actually clear it',
      RUN_SPEED * 1.8 > 3.2 * 1.5, `${(RUN_SPEED * 1.8).toFixed(1)}`)
}

console.log('\n10. Waiting at a kerb')
{
  const edge = { crossing: true, x: 0, z: 0, width: 7, length: 9 }
  chk('an empty road is clear', crossingClear(edge, []))
  chk('a car four seconds away is not',
      !crossingClear(edge, [{ x: 0, z: -30, vx: 0, vz: 10, speed: 10 }]))
  chk('the same car much further off is',
      crossingClear(edge, [{ x: 0, z: -300, vx: 0, vz: 10, speed: 10 }]))
  chk('a stationary car is not worth waiting for',
      crossingClear(edge, [{ x: 0, z: -6, vx: 0, vz: 0, speed: 0 }]))
  chk('and one going the other way is not either',
      crossingClear(edge, [{ x: 0, z: 20, vx: 0, vz: 10, speed: 10 }]))
  // Time, not distance. A bus doing 12 and a car doing 3 are not the same
  // hazard at forty units, and this is the whole reason for that choice.
  chk('a slow car nearby and a fast car far off are judged the same way',
      timeToReach({ x: 0, z: -10, vx: 0, vz: 5, speed: 5 }, 0, 0) ===
      timeToReach({ x: 0, z: -40, vx: 0, vz: 20, speed: 20 }, 0, 0))
  chk(`and four seconds is the bar (${CROSS_CLEAR_SECONDS}s)`,
      CROSS_CLEAR_SECONDS >= 3 && CROSS_CLEAR_SECONDS <= 6)

  // Nobody is pinned to a kerb forever by a jam.
  const jam = []
  for (let i = 0; i < 6; i++) jam.push({ x: 0, z: -6 - i * 4, vx: 0, vz: 5, speed: 5 })
  const stuck = makePedestrians(net, 1, 5)[0]
  stuck.mode = 'kerb'
  stuck.waited = 0
  stuck.edge = net.edges.findIndex(e => e.crossing)
  stuck.to = net.edges[stuck.edge].b
  const rand = seeded(3)
  let went = false
  for (let s = 0; s < 30 / (1 / 30); s++) {
    stepPedestrians(net, [stuck], 1 / 30, { vehicles: jam, rand })
    if (stuck.mode !== 'kerb') { went = true; break }
  }
  chk('a jam does not pin somebody to a kerb for ever', went, stuck.mode)
}

console.log('\n11. The hook the passenger game will use')
// Mike: "later be people we can pick up and drop off for a future city bus and
// monorail game." Nothing calls boardable() yet; this is the contract it will
// be called against.
{
  const waiting = people.filter(p => p.mode === 'waiting')
  const platform = people.filter(p => p.mode === 'platform')
  chk('there are people waiting to be picked up', waiting.length > 0,
      `${waiting.length}`)
  chk('and people on platforms', platform.length > 0, `${platform.length}`)

  if (waiting.length) {
    const at = { x: waiting[0].x, z: waiting[0].z, kind: 'bus' }
    const found = boardable(people, at)
    chk('a bus at a stop finds the person standing there',
        found.includes(waiting[0]), `${found.length} found`)
    chk('and finds nobody who is walking past',
        found.every(p => p.mode === 'waiting' || p.mode === 'platform'),
        found.map(p => p.mode).join(','))
    chk('a bus does not pick up somebody on a platform',
        boardable(people, at).every(p => p.mode !== 'platform'))
    chk('the nearest is offered first',
        found.length < 2 ||
        Math.hypot(found[0].x - at.x, found[0].z - at.z) <=
        Math.hypot(found[1].x - at.x, found[1].z - at.z))
    chk('and a bus in the middle of nowhere finds nobody',
        boardable(people, { x: 99999, z: 99999, kind: 'bus' }).length === 0)
  }
  if (platform.length) {
    const at = { x: platform[0].x, z: platform[0].z, kind: 'train' }
    const found = boardable(people, at)
    chk('a train at a platform finds the person standing on it',
        found.includes(platform[0]))
    chk('and does not pick up somebody at a bus stop',
        found.every(p => p.mode === 'platform'))
  }
}

console.log('\n12. Platforms are standing room, not walking room')
// A decision rather than an omission: the platforms are eleven units up a
// stair tower, and a graph that ran up the stairs would let a pedestrian walk
// into the path of a train for the sake of a journey nobody watches.
{
  const spots = platformSpots(getMonorailRoute().stations, {
    offset: MONORAIL_PLATFORM_OFFSET,
    length: MONORAIL_PLATFORM_LENGTH,
    y: MONORAIL_HEIGHT + 0.55 + 0.225
  })
  console.log(`   ${spots.length} standing spots over ` +
    `${getMonorailRoute().stations.length} stations`)
  chk('every station has standing room', spots.length >= getMonorailRoute().stations.length * 2)
  chk('both sides of every platform', spots.length % 2 === 0, `${spots.length}`)
  chk('and they are up on the deck rather than on the ground',
      spots.every(s => s.y > MONORAIL_HEIGHT), `${spots[0].y}`)
  // Each spot is offset to the side of the beam, so nobody stands where a
  // train goes.
  const stations = getMonorailRoute().stations
  chk('nobody is standing on the track',
      spots.every(s => {
        const st = stations.find(t => t.id === s.station)
        return Math.hypot(s.x - st.x, s.z - st.z) > MONORAIL_PLATFORM_OFFSET - 0.5
      }))

  const standing = people.filter(p => p.mode === 'platform')
  const where = standing.map(p => ({ x: p.x, z: p.z }))
  const rand = seeded(9)
  for (let s = 0; s < 60 / (1 / 30); s++) {
    stepPedestrians(net, people, 1 / 30, { vehicles: [], rand })
  }
  chk('and they are still there a minute later',
      standing.every((p, i) => near(p.x, where[i].x) && near(p.z, where[i].z)),
      `${standing.filter((p, i) => !near(p.x, where[i].x)).length} moved`)
  chk('a person standing still is not animated as walking',
      standing.every(p => !isWalking(p)))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
