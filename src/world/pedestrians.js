/**
 * People, walking about.
 *
 * Mike: "can we also create people that walk around town? I want them to have
 * a walking legs, swinging arms. obviously a head, torso (with arms described)
 * and legs (described above). I want them to walk around and later be people
 * we can pick up and drop off for a future city bus and monorail game."
 *
 * No THREE, like the other game modules. This file decides WHERE a person is
 * and what they are doing; `buildPedestrians()` and `updatePedestrians()` in
 * World.js draw them.
 *
 * THE PAVEMENT IS A GRAPH, AND IT IS DERIVED
 * ------------------------------------------
 * Nothing here is authored. The streets already know where they are and how
 * wide they are, so the pavements are the road centre-lines pushed sideways by
 * half a carriageway plus half a pavement - which is the same arithmetic
 * `roadsidePlots()` uses to set a building back from a kerb, and for the same
 * reason: it is where the pavement IS.
 *
 * The graph is undirected nodes and edges rather than a set of one-way lanes,
 * and that is deliberate. Traffic needs direction because a car may not drive
 * at oncoming traffic; a person may turn round whenever they like, and a
 * pavement that could only be walked one way would need twice the nodes to
 * say something nobody believes.
 *
 * THE TWO INTERESTING EDGES
 * -------------------------
 *   CORNERS    two pavement runs are joined where their nodes come close AND
 *              the midpoint between them is not in a road. That one test does
 *              all the work: round the outside of a junction the midpoint is
 *              on the pavement, so the corner joins; straight across a street
 *              it is on the carriageway, so it does not. No reasoning about
 *              turn directions, no special case for a dead end - walking round
 *              the end of a stub works because the midpoint there is past the
 *              end of the road.
 *   CROSSINGS  the only way from one side of a street to the other, and they
 *              are the zebra crossings the junctions already paint. A person
 *              waits at the kerb until the road is clear, then goes.
 *
 * WHAT THIS IS FOR NEXT
 * ---------------------
 * Some of these people are WAITING - standing at a bus stop or on a station
 * platform rather than walking anywhere. They already have a `wants` (the stop
 * they would like to reach) and `boardable()` already answers "who could get
 * on a vehicle stopped here". That is the whole hook the passenger game needs;
 * none of it is wired to a bus yet.
 */
import { resamplePath, distanceToPath, pathLength } from './curves.js'

// ---------------------------------------------------------------------------
// HOW FAST, HOW MANY, HOW BRAVE
// ---------------------------------------------------------------------------

/**
 * Walking pace, and how much it varies from person to person.
 *
 * 1.35 is a real walking speed in the units this world uses for metres, and it
 * matters that it is honest: the walk cycle is driven by distance covered
 * rather than by a clock (see `STRIDE`), so a figure moving at the wrong speed
 * does not look fast, it looks like it is skating.
 */
export const WALK_SPEED = 1.35
export const WALK_VARY = 0.32
/** What "get out of the way" looks like. Nobody sprints anywhere else. */
export const RUN_SPEED = 3.6

/** Metres of ground per full stride - one left step and one right step. */
export const STRIDE = 1.55

/** How far apart the nodes along a pavement run are. */
export const NODE_SPACING = 4

/**
 * How near two nodes on different runs must be before they can be joined at a
 * corner, and how much clear ground the link needs beside the road.
 *
 * JOIN_REACH is generous because a junction's two pavements meet at whatever
 * angle the roads do; JOIN_CLEAR is what stops a "corner" being a jaywalk.
 */
export const JOIN_REACH = 7.5
export const JOIN_CLEAR = 0.4
/** At most this many corner links per node, nearest first. */
export const JOIN_LIMIT = 3

/**
 * How wide a mouth a pavement will step straight across.
 *
 * Where a side street meets a main road, the main road's pavement runs over
 * the mouth of it - that is what a dropped kerb IS, and a pedestrian walking
 * along a high street does not stop and cross at every side turning. So the
 * nodes that fall inside the side road are dropped and the two survivors
 * either side are joined by one straight edge over the tarmac.
 *
 * Bounded, because the same arithmetic with no limit is how a pavement leaps
 * forty units across a car park. Nine is a wide side street plus its kerbs.
 */
export const MOUTH_SPAN = 9

/**
 * How much clear road a person wants before stepping off the kerb.
 *
 * Measured as the time it would take the nearest oncoming vehicle to reach the
 * crossing, not as a distance - a bus doing 12 and a car doing 3 are not the
 * same hazard at forty metres. Four seconds is enough to cross seven units at
 * walking pace with a margin, and it is long enough that a child watching can
 * see the decision being made.
 */
export const CROSS_CLEAR_SECONDS = 4
/** Below this, a vehicle is not moving and cannot be waited for forever. */
export const CROSS_IGNORE_SPEED = 0.6
/** And nobody waits at a kerb longer than this, whatever the traffic does. */
export const CROSS_PATIENCE = 14

/**
 * Getting out of the way.
 *
 * Mike chose "they dodge out of the way", so nobody is ever hit. DODGE_SIGHT
 * is how far ahead a person notices a vehicle coming AT them - the test is on
 * the vehicle's heading as well as its distance, so a car going the other way
 * down the same street is not a fright.
 */
export const DODGE_SIGHT = 11
export const DODGE_CONE = 0.55       // how nearly head-on it has to be, in radians
export const DODGE_CLEAR = 3.2       // how far off the vehicle's line counts as safe
export const DODGE_SECONDS = 1.8     // how long they stay startled afterwards

/**
 * How long somebody stands at a stop before deciding to walk on instead, the
 * chance that a passer-by decides to wait at all, and how long after giving up
 * before they will consider it again.
 *
 * All three exist to keep the queues STEADY. The first version seeded a
 * handful of waiters and had no way to make any more, so after twenty-six
 * seconds every stop in the world was empty for good and the only people ever
 * standing at one were the ones placed there at start-up. A population needs a
 * way in as well as a way out; the cooldown is the way in that stops somebody
 * who has just given up from immediately re-joining the queue they left.
 */
export const WAIT_SECONDS = 45
export const STOP_CHANCE = 0.5
export const STOP_COOLDOWN = 34

/** How many people the world gets, and how they are shared out. */
export const PEDESTRIANS = 120
/** The share of them who are standing at a stop rather than walking. */
export const WAITER_SHARE = 0.22

/**
 * How near the camera a person has to be to be drawn, and to be animated.
 *
 * Two ranges, not one, because they buy different things. DRAW_RANGE keeps the
 * instance count - and therefore the per-frame matrix work - proportional to
 * what can actually be seen. ANIMATE_RANGE is cheaper still: past it the limbs
 * are left where they are, which nobody can see at ninety units and which
 * saves the trigonometry.
 */
export const DRAW_RANGE = 230
export const ANIMATE_RANGE = 95

/** How near a stopped vehicle's door a waiting person will board from. */
export const BOARD_REACH = 6

// ---------------------------------------------------------------------------
// THE PAVEMENT NETWORK
// ---------------------------------------------------------------------------

/** A repeatable random number, so a world builds the same twice. */
function seeded(seed) {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/**
 * One side of one road, as a chain of points on the pavement.
 *
 * `side` is +1 or -1 across the road's own direction. The offset is measured
 * from the CENTRE-LINE, so it is half the carriageway plus half the pavement -
 * a person walks down the middle of the footway rather than along the kerb.
 *
 * Points that fold back on themselves are dropped. Offsetting a polyline
 * inward round a bend tighter than the offset turns the curve inside out, and
 * on a ring road that is not hypothetical - the result is a knot of pavement
 * inside the carriageway. The test is the honest one: if an offset point ended
 * up nearer the road's own centre-line than it should be, it is a fold.
 */
export function pavementRun(road, side, opts = {}) {
  const spacing = opts.spacing ?? NODE_SPACING
  const pavementWidth = opts.pavementWidth ?? 2.4
  const offset = road.width / 2 + pavementWidth / 2

  const spine = resamplePath(road.points, spacing)
  if (spine.length < 2) return []

  const out = []
  for (let i = 0; i < spine.length; i++) {
    const a = spine[Math.max(0, i - 1)]
    const b = spine[Math.min(spine.length - 1, i + 1)]
    const tx = b.x - a.x
    const tz = b.z - a.z
    const len = Math.hypot(tx, tz)
    if (len < 1e-6) continue

    // The normal, turned `side` from the direction of travel.
    const nx = (-tz / len) * side
    const nz = (tx / len) * side
    const p = { x: spine[i].x + nx * offset, z: spine[i].z + nz * offset }

    // FOLD CHECK. A point that has crossed to the wrong side of the road, or
    // squeezed inside it, is nearer the centre-line than the offset says.
    if (distanceToPath(road.points, p.x, p.z) < offset - 0.6) continue
    out.push(p)
  }

  // A closed road's pavement is closed too, so the walk round a ring joins up
  // rather than stopping dead at the seam.
  return out
}

/**
 * Every pavement in the world, as nodes and edges.
 *
 * Takes its inputs rather than reaching for them, so a test can hand it three
 * roads and a crossing and check the rules without building a world.
 *
 *   islands   [{ id, x, z, roads, signals }] - roads and signals ISLAND-LOCAL,
 *             which is how getIslandRoads() and getTrafficSignals() give them
 *   stops     bus stops in WORLD coordinates, from getBusStops()
 *   platforms standing room at the monorail stations, in WORLD coordinates
 *
 * Everything comes back in world coordinates: a pedestrian may not cross the
 * water, but the code that draws them should not have to know which island
 * they are on to place them.
 */
export function buildPavements(islands, opts = {}) {
  const spacing = opts.spacing ?? NODE_SPACING
  const pavementWidth = opts.pavementWidth ?? 2.4
  const joinReach = opts.joinReach ?? JOIN_REACH

  const nodes = []
  const edges = []
  const runs = []

  // Built first, because the runs themselves are filtered through it - see
  // the fold-and-overlap note below.
  const roads = buildRoadIndex(islands)

  const addEdge = (a, b, extra = {}) => {
    const length = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z)
    if (length < 1e-6) return -1
    const index = edges.length
    edges.push({ a, b, length, ...extra })
    nodes[a].links.push(index)
    nodes[b].links.push(index)
    return index
  }

  // --- The runs themselves ---
  for (const island of islands) {
    for (const road of island.roads || []) {
      // Rings, streets and the road out to the quay get pavements. Bridge
      // approaches (`auto`) and driveways do not: an approach is drawn as part
      // of the bridge run, and nobody walks a hundred and thirty units of open
      // water to the next island.
      if (!(road.ring || road.street || road.spur)) continue

      for (const side of [1, -1]) {
        const points = pavementRun(road, side, { spacing, pavementWidth })
        if (points.length < 2) continue

        const run = {
          index: runs.length,
          island: island.id,
          road,
          side,
          from: nodes.length,
          count: points.length,
          closed: !!road.closed,
          key: roadKey(road),
          // The island's origin, kept ON the run so `clearOfRoad()` can bring
          // a world point back into the road's own local frame with one
          // subtraction rather than translating a 385-point polyline.
          originX: island.x,
          originZ: island.z,
          length: pathLength(points)
        }

        // NOT EVERY OFFSET POINT IS ON PAVEMENT.
        //
        // `pavementRun()` keeps its points clear of the road they came from,
        // and that is not the same as keeping them clear of every OTHER road.
        // Measured on the finished world, 261 of 2134 nodes - one in eight -
        // sat inside somebody else's carriageway, some of them 3.5 units in,
        // which on a seven-wide ring road is the centre line. Walkers spent
        // 7.5% of their time strolling down the middle of a road, and that is
        // exactly what it looked like.
        //
        // So each point is measured against every road in the world, and the
        // ones standing in tarmac are dropped. What is left is joined up
        // below, and where the gap is small the join is deliberate rather
        // than accidental - see MOUTH_SPAN.
        const kept = []
        for (const p of points) {
          const wx = island.x + p.x
          const wz = island.z + p.z
          if (clearOfRoads(roads, wx, wz) < -0.05) { kept.push(null); continue }
          kept.push(nodes.length)
          nodes.push({
            x: wx,
            z: wz,
            y: 0,
            island: island.id,
            run: run.index,
            links: [],
            stop: -1,
            platform: -1
          })
        }
        run.count = nodes.length - run.from
        if (run.count < 2) { nodes.length = run.from; continue }
        runs.push(run)

        // Chain it, stepping over the gaps where nodes were dropped.
        //
        // A gap under MOUTH_SPAN is a side street's mouth and gets one edge
        // straight across it, marked so a test can tell a deliberate step over
        // tarmac from an accidental one. A longer gap is two roads lying along
        // each other, and joining those would be a pavement through a
        // building - the run simply breaks there.
        let previous = null
        for (let i = 0; i < kept.length; i++) {
          const at = kept[i]
          if (at === null) continue
          if (previous !== null) {
            const gap = Math.hypot(
              nodes[at].x - nodes[previous].x, nodes[at].z - nodes[previous].z)
            if (gap <= MOUTH_SPAN) {
              addEdge(previous, at, gap > spacing * 1.4 ? { mouth: true } : {})
            }
          }
          previous = at
        }
        if (run.closed) {
          const first = kept.find(k => k !== null)
          const last = [...kept].reverse().find(k => k !== null)
          if (first !== undefined && last !== undefined && first !== last) {
            const gap = Math.hypot(
              nodes[first].x - nodes[last].x, nodes[first].z - nodes[last].z)
            if (gap <= MOUTH_SPAN) addEdge(last, first, { mouth: gap > spacing * 1.4 })
          }
        }
      }
    }
  }

  // --- Corners ---
  //
  // A spatial hash rather than every node against every other: at four-unit
  // spacing over six kilometres of kerb this is a couple of thousand nodes,
  // and the square of that is a number worth avoiding at start-up.
  const cell = joinReach
  const grid = new Map()
  const key = (x, z) => `${Math.floor(x / cell)},${Math.floor(z / cell)}`
  nodes.forEach((n, i) => {
    const k = key(n.x, n.z)
    let bucket = grid.get(k)
    if (!bucket) { bucket = []; grid.set(k, bucket) }
    bucket.push(i)
  })

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i]
    const found = []

    const cx = Math.floor(a.x / cell)
    const cz = Math.floor(a.z / cell)
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gz = cz - 1; gz <= cz + 1; gz++) {
        const bucket = grid.get(`${gx},${gz}`)
        if (!bucket) continue
        for (const j of bucket) {
          if (j <= i) continue
          const b = nodes[j]
          if (b.run === a.run) continue
          const d = Math.hypot(b.x - a.x, b.z - a.z)
          if (d > joinReach) continue
          found.push({ j, d })
        }
      }
    }

    found.sort((p, q) => p.d - q.d)
    let made = 0
    for (const { j } of found) {
      if (made >= JOIN_LIMIT) break
      const b = nodes[j]

      // THE ONE TEST. Is the ground between these two nodes pavement, or is it
      // the road? Checked against both roads, in each one's own local frame -
      // a link round the outside of a junction passes, a link straight across
      // a carriageway does not, and walking round the blunt end of a stub
      // passes because the midpoint there is beyond where the road stops.
      const mx = (a.x + b.x) / 2
      const mz = (a.z + b.z) / 2
      if (clearOfRoads(roads, mx, mz) < JOIN_CLEAR) continue

      addEdge(i, j, { corner: true })
      made++
    }
  }

  // --- Crossings ---
  //
  // The zebra crossings the junctions already paint. Each one joins the two
  // pavements of the road it is painted across, and is the ONLY way between
  // them - which is what makes the pavement graph a town rather than a field.
  let crossings = 0
  for (const island of islands) {
    for (const cluster of island.signals || []) {
      for (const arm of cluster.arms || []) {
        if (!arm.at || !arm.road) continue
        const x = island.x + arm.at.x
        const z = island.z + arm.at.z

        const key = roadKey(arm.road)
        const left = nearestOnRoad(nodes, runs, key, 1, x, z)
        const right = nearestOnRoad(nodes, runs, key, -1, x, z)
        if (left < 0 || right < 0) continue

        const width = arm.road.width
        const span = Math.hypot(
          nodes[left].x - nodes[right].x, nodes[left].z - nodes[right].z)
        // A pair that is much further apart than the road is wide belongs to
        // some other part of the same road - a ring passing the junction twice
        // is the case that produced this check.
        if (span > width + pavementWidth * 2 + 4) continue

        addEdge(left, right, {
          crossing: true,
          width,
          x: (nodes[left].x + nodes[right].x) / 2,
          z: (nodes[left].z + nodes[right].z) / 2
        })
        crossings++
      }
    }
  }

  // --- Bus stops, tied to the nearest bit of pavement ---
  const stops = opts.stops || []
  stops.forEach((stop, index) => {
    let best = -1
    let bestD = 9
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].island !== stop.island) continue
      const d = Math.hypot(nodes[i].x - stop.x, nodes[i].z - stop.z)
      if (d < bestD) { bestD = d; best = i }
    }
    if (best >= 0) nodes[best].stop = index
  })

  return {
    nodes,
    edges,
    runs,
    crossings,
    stopNodes: nodes.map((n, i) => (n.stop >= 0 ? i : -1)).filter(i => i >= 0),
    platforms: opts.platforms || []
  }
}

/**
 * A road's identity, worked out from its shape.
 *
 * `getIslandRoads()` regenerates its roads on every call - same geometry, new
 * objects - and `getTrafficSignals()` calls it internally, so the `road` that
 * arrives on a crossing arm is never the same OBJECT as the one this file
 * built a pavement from. Matching by reference silently found nothing, and the
 * first world built this way had two thousand nodes and not one crossing on
 * it: every pavement was an island, and a person could walk a block forever
 * and never reach the other side of their own street.
 *
 * The generation is deterministic, so the geometry IS the identity.
 */
function roadKey(road) {
  const p = road.points[0]
  return `${road.width}|${road.points.length}|${p.x.toFixed(3)},${p.z.toFixed(3)}`
}

/**
 * Every road span in the world, in a grid, so "is this point in a road?" is a
 * question about nine cells rather than about six kilometres of polyline.
 *
 * The first version asked `distanceToPath` against whole roads, and the ring
 * road alone is 385 points: two thousand nodes times ten candidate corners
 * times two roads came to sixteen million point tests and three seconds of
 * start-up. This is the same answer in twenty milliseconds.
 *
 * It also answers a BETTER question. The old test asked whether a corner link
 * crossed either of the two roads it joined; this asks whether it crosses ANY
 * road, which is what "stay off the carriageway" actually means at a junction
 * where a third street passes through.
 */
export function buildRoadIndex(islands, cell = 8) {
  const grid = new Map()
  const add = (key, span) => {
    let bucket = grid.get(key)
    if (!bucket) { bucket = []; grid.set(key, bucket) }
    bucket.push(span)
  }

  for (const island of islands) {
    for (const road of island.roads || []) {
      const half = road.width / 2
      const pts = road.points
      for (let i = 1; i < pts.length; i++) {
        const ax = island.x + pts[i - 1].x
        const az = island.z + pts[i - 1].z
        const bx = island.x + pts[i].x
        const bz = island.z + pts[i].z
        const span = { ax, az, bx, bz, half }
        // Every cell the span touches, by walking its bounding box - a span is
        // at most a few units long, so this is one or two cells.
        const x0 = Math.floor(Math.min(ax, bx) / cell)
        const x1 = Math.floor(Math.max(ax, bx) / cell)
        const z0 = Math.floor(Math.min(az, bz) / cell)
        const z1 = Math.floor(Math.max(az, bz) / cell)
        for (let gx = x0; gx <= x1; gx++) {
          for (let gz = z0; gz <= z1; gz++) add(`${gx},${gz}`, span)
        }
      }
    }
  }

  return { grid, cell }
}

/** How far this point is from the nearest carriageway EDGE. Negative = in it. */
export function clearOfRoads(index, x, z) {
  const cx = Math.floor(x / index.cell)
  const cz = Math.floor(z / index.cell)
  let best = Infinity

  for (let gx = cx - 1; gx <= cx + 1; gx++) {
    for (let gz = cz - 1; gz <= cz + 1; gz++) {
      const bucket = index.grid.get(`${gx},${gz}`)
      if (!bucket) continue
      for (const s of bucket) {
        const dx = s.bx - s.ax
        const dz = s.bz - s.az
        const len2 = dx * dx + dz * dz
        let t = len2 > 0 ? ((x - s.ax) * dx + (z - s.az) * dz) / len2 : 0
        t = t < 0 ? 0 : t > 1 ? 1 : t
        const px = s.ax + dx * t
        const pz = s.az + dz * t
        const d = Math.hypot(x - px, z - pz) - s.half
        if (d < best) best = d
      }
    }
  }

  return best
}

/** The nearest node on one side of one road to a world point. */
function nearestOnRoad(nodes, runs, key, side, x, z) {
  let best = -1
  let bestD = Infinity
  for (const run of runs) {
    if (run.key !== key || run.side !== side) continue
    for (let i = run.from; i < run.from + run.count; i++) {
      const d = Math.hypot(nodes[i].x - x, nodes[i].z - z)
      if (d < bestD) { bestD = d; best = i }
    }
  }
  return bestD < 14 ? best : -1
}

// ---------------------------------------------------------------------------
// THE PEOPLE
// ---------------------------------------------------------------------------

/**
 * Standing room along a station platform.
 *
 * Not part of the walking graph, and that is a decision rather than an
 * omission: the platforms are eleven units up a stair tower, and a graph that
 * ran up the stairs would let a pedestrian walk into the path of a train for
 * the sake of a journey nobody watches. People on a platform are placed there
 * and stay there, which is what people on a platform do.
 */
export function platformSpots(stations, opts = {}) {
  const offset = opts.offset ?? 3.5
  const length = opts.length ?? 26
  const y = opts.y ?? 11.775
  const per = opts.per ?? 3

  const spots = []
  for (const station of stations) {
    const fx = Math.sin(station.heading)
    const fz = Math.cos(station.heading)
    const sx = -fz
    const sz = fx
    for (const side of [1, -1]) {
      for (let i = 0; i < per; i++) {
        const along = (i / (per - 1 || 1) - 0.5) * (length - 7)
        spots.push({
          x: station.x + sx * offset * side + fx * along,
          z: station.z + sz * offset * side + fz * along,
          y,
          heading: station.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2),
          station: station.id
        })
      }
    }
  }
  return spots
}

/**
 * Fill the pavements.
 *
 * Weighted by how much pavement each island has, so a town gets a crowd and a
 * jungle island with one ring road round it gets the two or three people who
 * live there. Spreading them evenly by island would put as many people on BLOG
 * as on EXPERIENCE, and EXPERIENCE has four times the streets.
 */
export function makePedestrians(net, count = PEDESTRIANS, seed = 9117) {
  const rand = seeded(seed)
  const people = []
  if (!net || !net.nodes.length) return people

  // Somewhere to start: any node with somewhere to go.
  const walkable = []
  for (let i = 0; i < net.nodes.length; i++) {
    if (net.nodes[i].links.length) walkable.push(i)
  }
  if (!walkable.length) return people

  const platforms = net.platforms || []
  const stopNodes = net.stopNodes || []

  for (let i = 0; i < count; i++) {
    const roll = rand()

    // A few of them are already on a platform waiting for a train.
    if (platforms.length && roll < 0.1) {
      const spot = platforms[Math.floor(rand() * platforms.length) % platforms.length]
      people.push(newPerson(i, rand, {
        mode: 'platform',
        x: spot.x + (rand() - 0.5) * 1.2,
        z: spot.z + (rand() - 0.5) * 1.2,
        y: spot.y,
        heading: spot.heading,
        wants: spot.station
      }))
      continue
    }

    // Some are standing at a bus stop.
    if (stopNodes.length && roll < 0.1 + WAITER_SHARE) {
      const at = stopNodes[Math.floor(rand() * stopNodes.length) % stopNodes.length]
      const node = net.nodes[at]
      people.push(newPerson(i, rand, {
        mode: 'waiting',
        node: at,
        x: node.x + (rand() - 0.5) * 1.4,
        z: node.z + (rand() - 0.5) * 1.4,
        wants: node.stop,
        waited: rand() * WAIT_SECONDS
      }))
      continue
    }

    // The rest are walking.
    const at = walkable[Math.floor(rand() * walkable.length) % walkable.length]
    const person = newPerson(i, rand, {
      mode: 'walk',
      node: at,
      x: net.nodes[at].x,
      z: net.nodes[at].z
    })
    setOff(net, person, rand)
    people.push(person)
  }

  return people
}

function newPerson(id, rand, fields) {
  return {
    id,
    mode: 'walk',
    node: -1,
    edge: -1,
    to: -1,
    along: 0,
    x: 0,
    z: 0,
    y: 0,
    heading: rand() * Math.PI * 2,
    speed: WALK_SPEED * (1 - WALK_VARY / 2 + rand() * WALK_VARY),
    // How far this person has walked, ever. The walk cycle is read off this
    // rather than off the clock, which is the whole reason the feet do not
    // skate: a slow walker takes slow steps because the phase advances with
    // the ground, not with time.
    travelled: rand() * 10,
    startled: 0,
    waited: 0,
    wants: -1,
    // Counts down after giving up on a stop. See STOP_COOLDOWN.
    cooldown: 0,
    // Which way they are shoved while dodging, kept so a startled person keeps
    // going the same way instead of dithering on the spot.
    dodgeX: 0,
    dodgeZ: 0,
    // Body: picked once, so a person keeps the same shirt all session.
    build: 0.88 + rand() * 0.26,
    shirt: Math.floor(rand() * 8),
    trousers: Math.floor(rand() * 5),
    skin: Math.floor(rand() * 4),
    hat: rand() < 0.22,
    ...fields
  }
}

/** Choose an edge out of the node this person is standing on. */
function setOff(net, person, rand) {
  const node = net.nodes[person.node]
  if (!node || !node.links.length) { person.edge = -1; return }

  // Not back the way we came, unless there is nowhere else - which on a stub
  // is the whole point, and is how somebody walks to the end of a cul-de-sac
  // and comes back rather than standing there.
  const options = node.links.filter(e => e !== person.edge)
  const pool = options.length ? options : node.links

  const pick = pool[Math.floor(rand() * pool.length) % pool.length]
  const edge = net.edges[pick]
  person.edge = pick
  person.to = edge.a === person.node ? edge.b : edge.a
  person.along = 0

  // A crossing is not entered until it is clear. Everything else is walked
  // straight onto.
  person.mode = edge.crossing ? 'kerb' : 'walk'
  person.waited = 0
}

/**
 * How long until this vehicle reaches the point (x, z), or Infinity.
 *
 * Time rather than distance, because that is what a person crossing a road
 * actually judges. A vehicle that is not coming this way, or is barely moving,
 * is not a reason to stand at a kerb.
 */
export function timeToReach(vehicle, x, z) {
  const speed = vehicle.speed ?? Math.hypot(vehicle.vx || 0, vehicle.vz || 0)
  if (speed < CROSS_IGNORE_SPEED) return Infinity

  const dx = x - vehicle.x
  const dz = z - vehicle.z
  const dist = Math.hypot(dx, dz)
  if (dist < 1e-3) return 0

  // Only what is in front of it counts.
  const fx = (vehicle.vx ?? Math.sin(vehicle.heading || 0)) / (speed || 1)
  const fz = (vehicle.vz ?? Math.cos(vehicle.heading || 0)) / (speed || 1)
  const ahead = (dx / dist) * fx + (dz / dist) * fz
  if (ahead < 0.25) return Infinity

  return dist / speed
}

/** Is the road clear enough to step off the kerb? */
export function crossingClear(edge, vehicles) {
  const x = edge.x ?? 0
  const z = edge.z ?? 0
  for (const v of vehicles) {
    if (timeToReach(v, x, z) < CROSS_CLEAR_SECONDS) return false
  }
  return true
}

/**
 * One frame.
 *
 * `ctx` is { vehicles, delta }. `vehicles` is every moving thing worth being
 * frightened of, as { x, z, vx, vz, speed } - the traffic, and the player.
 * They are passed in rather than reached for so this can be stepped in a test
 * with two cars and no world.
 */
export function stepPedestrians(net, people, delta, ctx = {}) {
  if (!net || !people) return people
  const vehicles = ctx.vehicles || []
  const rand = ctx.rand || Math.random

  for (const person of people) {
    if (person.mode === 'platform') {
      // Standing on a platform. They turn to look down the line now and then,
      // and that is all - see platformSpots() for why they never walk.
      person.travelled = 0
      continue
    }

    stepOne(net, person, delta, vehicles, rand)
  }

  return people
}

function stepOne(net, person, delta, vehicles, rand) {
  // --- Frightened? ---
  //
  // Checked before anything else, because it overrides every other state: a
  // person halfway across a crossing with a bus bearing down on them is not
  // going to finish the crossing at walking pace.
  const scare = nearestThreat(person, vehicles)
  if (scare) {
    person.startled = DODGE_SECONDS
    person.dodgeX = scare.awayX
    person.dodgeZ = scare.awayZ
  }

  if (person.cooldown > 0) person.cooldown -= delta

  if (person.startled > 0) {
    person.startled -= delta
    const step = RUN_SPEED * delta
    person.x += person.dodgeX * step
    person.z += person.dodgeZ * step
    person.travelled += step
    person.heading = Math.atan2(person.dodgeX, person.dodgeZ)
    person.mode = person.mode === 'cross' ? 'cross' : 'dodge'
    if (person.startled <= 0) {
      // Back to the pavement: rejoin at whichever node is nearest, which may
      // not be the one they left. That is the right answer - they ran.
      person.startled = 0
      rejoin(net, person, rand)
    }
    return
  }

  switch (person.mode) {
    case 'dodge':
      rejoin(net, person, rand)
      return

    case 'waiting': {
      // At a bus stop. Nothing to do but stand there and, eventually, give up
      // and walk on - so a stop that never gets a bus does not accumulate a
      // permanent queue of statues.
      person.waited += delta
      person.travelled = 0
      if (person.waited > WAIT_SECONDS) {
        person.mode = 'walk'
        person.wants = -1
        person.cooldown = STOP_COOLDOWN
        person.edge = -1
        setOff(net, person, rand)
      }
      return
    }

    case 'kerb': {
      // Waiting to cross. The patience is what stops a jam on the road from
      // pinning somebody to a kerb for the rest of the session.
      person.waited += delta
      person.travelled = 0
      const edge = net.edges[person.edge]
      if (!edge) { setOff(net, person, rand); return }
      if (crossingClear(edge, vehicles) || person.waited > CROSS_PATIENCE) {
        person.mode = 'cross'
        person.waited = 0
      }
      // Face the way they are about to go, so the wait reads as a decision.
      const to = net.nodes[person.to]
      if (to) person.heading = Math.atan2(to.x - person.x, to.z - person.z)
      return
    }

    default:
      break
  }

  // --- Walking, or crossing ---
  const edge = net.edges[person.edge]
  if (!edge) { rejoin(net, person, rand); return }

  const from = net.nodes[edge.a === person.to ? edge.b : edge.a]
  const to = net.nodes[person.to]
  if (!from || !to) { rejoin(net, person, rand); return }

  // Crossing a road is done briskly. Everybody does this.
  const pace = person.mode === 'cross' ? person.speed * 1.45 : person.speed
  const step = pace * delta
  person.along += step
  person.travelled += step

  if (person.along >= edge.length) {
    person.node = person.to
    person.x = to.x
    person.z = to.z

    const node = net.nodes[person.node]
    // Arrived at a stop, and in the mood for a bus. This is the ONLY way
    // somebody becomes a passenger, which is why it is a roll rather than a
    // plan: a pedestrian with a route and a timetable is a much bigger thing
    // than this world needs, and from the pavement the two look the same.
    if (node.stop >= 0 && person.cooldown <= 0 && rand() < STOP_CHANCE) {
      person.mode = 'waiting'
      person.waited = 0
      person.wants = node.stop
      return
    }
    setOff(net, person, rand)
    return
  }

  const t = edge.length > 0 ? person.along / edge.length : 1
  person.x = from.x + (to.x - from.x) * t
  person.z = from.z + (to.z - from.z) * t
  person.heading = Math.atan2(to.x - from.x, to.z - from.z)
}

/**
 * A vehicle close enough, fast enough and pointed nearly enough at this person
 * to be worth running from - and which way to run.
 *
 * The way out is ACROSS the vehicle's path, not away down it. Running directly
 * away from a car is how you get run over slowly; the two units sideways is
 * what actually clears it, and it is what a person does.
 */
export function nearestThreat(person, vehicles) {
  let worst = null
  let worstTime = DODGE_SIGHT / RUN_SPEED

  for (const v of vehicles) {
    const speed = v.speed ?? Math.hypot(v.vx || 0, v.vz || 0)
    if (speed < 2) continue

    const dx = person.x - v.x
    const dz = person.z - v.z
    const dist = Math.hypot(dx, dz)
    if (dist > DODGE_SIGHT) continue

    const fx = (v.vx ?? Math.sin(v.heading || 0)) / (speed || 1)
    const fz = (v.vz ?? Math.cos(v.heading || 0)) / (speed || 1)

    // How far ahead of the vehicle, and how far off its line.
    const ahead = dx * fx + dz * fz
    if (ahead <= 0) continue
    const across = dx * -fz + dz * fx
    if (Math.abs(across) > DODGE_CLEAR) continue

    // And is it actually pointed at them? A car passing on the far side of a
    // wide street is close, but it is not coming for you.
    const bearing = Math.abs(Math.atan2(across, ahead))
    if (bearing > DODGE_CONE) continue

    const time = ahead / speed
    if (time < worstTime) {
      worstTime = time
      // Sideways, on the side they are already nearer to.
      const sign = across >= 0 ? 1 : -1
      worst = { awayX: -fz * sign, awayZ: fx * sign, time }
    }
  }

  return worst
}

/** Put somebody back on the nearest pavement after they have run off it. */
function rejoin(net, person, rand) {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < net.nodes.length; i++) {
    const n = net.nodes[i]
    if (!n.links.length) continue
    const d = Math.hypot(n.x - person.x, n.z - person.z)
    if (d < bestD) { bestD = d; best = i }
  }
  if (best < 0) return

  person.node = best
  person.x = net.nodes[best].x
  person.z = net.nodes[best].z
  person.edge = -1
  person.mode = 'walk'
  setOff(net, person, rand)
}

// ---------------------------------------------------------------------------
// WHAT THE RENDERER AND THE NEXT GAME ASK FOR
// ---------------------------------------------------------------------------

/**
 * The walk cycle, as four angles and a bob.
 *
 * READ OFF DISTANCE TRAVELLED, not off a clock. That is the single thing that
 * decides whether a walking figure looks like it is walking or like it is
 * being dragged: the foot on the ground has to stay where it is put, so the
 * phase has to advance with the ground. A clock-driven cycle looks fine on one
 * person at one speed and wrong on everybody else.
 *
 * `swing` is the shoulder and hip angle; arms and legs are in opposition,
 * which is the other half of what reads as walking.
 */
export function walkCycle(person, moving = true) {
  if (!moving) {
    return { legLeft: 0, legRight: 0, armLeft: 0, armRight: 0, bob: 0, lean: 0 }
  }

  const phase = (person.travelled / STRIDE) * Math.PI * 2
  const running = person.startled > 0
  const swing = running ? 0.95 : 0.62
  const s = Math.sin(phase)

  return {
    legLeft: s * swing,
    legRight: -s * swing,
    // Opposite the legs, and a little smaller - an arm swings less than a leg.
    armLeft: -s * swing * 0.8,
    armRight: s * swing * 0.8,
    // Twice a stride, because the body rises on each step rather than each
    // pair of them.
    bob: Math.abs(Math.cos(phase)) * (running ? 0.09 : 0.045),
    lean: running ? 0.18 : 0.04
  }
}

/** Is this person moving under their own steam this frame? */
export function isWalking(person) {
  return person.mode === 'walk' || person.mode === 'cross' ||
         person.mode === 'dodge' || person.startled > 0
}

/**
 * Who could get on a vehicle standing here.
 *
 * THE HOOK FOR THE NEXT GAME, and the reason the waiting people exist at all.
 * Mike: "later be people we can pick up and drop off for a future city bus and
 * monorail game." Nothing calls this yet.
 *
 * It answers the question a bus asks - "I have stopped, with my door here; who
 * is getting on?" - rather than "who is nearby", because those differ by the
 * whole width of a road and the passenger game will care.
 */
export function boardable(people, at, reach = BOARD_REACH) {
  const out = []
  for (const person of people) {
    if (person.mode !== 'waiting' && person.mode !== 'platform') continue
    const d = Math.hypot(person.x - at.x, person.z - at.z)
    if (d > reach) continue
    // A passenger on a platform boards a train, not a bus, and the other way
    // about. The caller says which by what it passes as `at.kind`.
    if (at.kind && at.kind === 'bus' && person.mode !== 'waiting') continue
    if (at.kind && at.kind === 'train' && person.mode !== 'platform') continue
    out.push(person)
  }
  return out.sort((a, b) =>
    Math.hypot(a.x - at.x, a.z - at.z) - Math.hypot(b.x - at.x, b.z - at.z))
}

/** A count of who is doing what, for a test or a probe to assert on. */
export function census(people) {
  const out = { walk: 0, cross: 0, kerb: 0, waiting: 0, platform: 0, dodge: 0 }
  for (const person of people) out[person.mode] = (out[person.mode] || 0) + 1
  return out
}
