/**
 * How high the ground is.
 *
 * One implementation, consulted by everything that touches the ground: the
 * grass mesh, the physics collider, the road surfaces, the pavements, the
 * props, the AI traffic, the monorail pillars. That is not tidiness. If the
 * mesh works out its own heights and the roads work out theirs, the two
 * disagree by a few centimetres and every road in the world either floats or
 * sinks into the hill it crosses.
 *
 * Nothing here knows about Three.js, islands or the map. It takes plain
 * numbers and gives back a height, so a test can check any of it. The
 * assembly - which hills, which roads, which buildings - is
 * `getIslandTerrain()` in islandLayout.js.
 *
 * THE THREE RULES, in the order they are applied:
 *
 *   1. **Hills**, declared in the map. Smooth bumps, summed.
 *   2. **The coast wins.** Height fades to zero at the shoreline, so the
 *      beach still meets the sea and no island ends in a cliff of grass
 *      hanging over the water.
 *   3. **Flat things win over hills.** A road corridor is level across its
 *      width and gradient-limited along its length; a building pad is level
 *      full stop. Both are Mike's requirements and neither can be left to
 *      whoever happens to be drawing the object - a road that follows the
 *      raw hill is banked like a rally stage, and a building on raw ground
 *      stands on two corners.
 */

/**
 * How steep a road is ever allowed to be, as a rise over run.
 *
 * 0.08 is a 1-in-12.5. The car drives by pushing itself along a HORIZONTAL
 * heading and letting Rapier's gravity do the rest, so on a slope it loses
 * bite as the cosine of the angle - gentle gradients keep that honest, and
 * they are what Mike asked for anyway.
 */
export const MAX_ROAD_GRADIENT = 0.08

/**
 * How far past its own edge a road holds the ground level, before blending.
 *
 * It has to stop short of the plots that front it, or the two fight over the
 * same ground: a plot is set back by half the road plus the pavement plus half
 * its own depth, which puts its near edge about five units from the centre
 * line. At 3.5 the road's flat zone reached past that and cambered itself
 * trying to hold ground the buildings had already claimed.
 */
export const ROAD_SHOULDER = 1.5

/** And how far the blend from road level back to open ground takes. */
export const ROAD_BLEND = 9

/**
 * How far past its footprint a building holds its pad level.
 *
 * Small, and for a reason worth understanding before changing it. Plots on a
 * street sit PLOT_GAP (2.5) apart, and on an 8% street the next plot along is
 * up to a metre lower. That drop has to happen in the gap BETWEEN the two
 * level zones, so the wider each zone, the narrower the gap and the steeper
 * the bank: at 1.2 the zones left a tenth of a unit to fall 1.4 metres in,
 * which is a vertical cliff. No mesh can follow a vertical cliff, so the grass
 * cut straight up through the road beside it.
 *
 * At 0.4 there is 1.7 units of gap - a bank you can see, but a bank rather
 * than a wall. Still comfortably past the footprint, which is what Mike asked
 * for: the ground fully supports the base.
 */
export const PAD_MARGIN = 0.4

/** And the blend out from a pad. Shorter than a road's: a pad is a terrace. */
export const PAD_BLEND = 5

/**
 * How far past the edge of a PAVED surface the drawn ground stays ducked.
 *
 * Short. This is not the height blend - it is the footprint of the tarmac,
 * the kerbs and the paving that are actually drawn over the hole. Using the
 * height blend instead put every building's plot inside a road's claim, nine
 * units from the kerb, and sank the grass under buildings that had nothing
 * covering them.
 */
export const PAVED_FADE = 1.5

/**
 * A smooth bump, 1 at the middle and 0 at the rim, with zero slope at both.
 *
 * Smoothstep rather than a cone, because the ground's SLOPE matters as much
 * as its height: a cone has a crease down every side that catches the light
 * and makes a hill look like a tent.
 */
export function bump(distance, radius) {
  if (radius <= 0 || distance >= radius) return 0
  if (distance <= 0) return 1

  const t = 1 - distance / radius
  return t * t * (3 - 2 * t)
}

/** The hills alone, before the coast or anything flat has its say. */
export function hillHeight(hills, x, z) {
  let height = 0

  for (const hill of hills || []) {
    const d = Math.hypot(x - hill.x, z - hill.z)
    height += (hill.height || 0) * bump(d, hill.radius || 1)
  }

  return height
}

/**
 * How much of the hills survives at a point this far inland.
 *
 * Zero at the waterline and for anything outside it, one once you are
 * `beach` units in. Without this the grass would stand proud of the sand all
 * the way round and every island would have a rim you could see under.
 */
export function coastFactor(inland, beach) {
  if (inland <= 0) return 0
  if (inland >= beach) return 1

  const t = inland / beach
  return t * t * (3 - 2 * t)
}

/**
 * A road's own height profile: one height per point of its path.
 *
 * Starts from the ground the road crosses, then limits how fast it may
 * change so no stretch is steeper than `maxGradient`. The limiting is run
 * forwards and then backwards, which is what makes it symmetrical - a single
 * forward pass drags every hill's height along behind it and leaves the road
 * climbing gently and dropping off a cliff.
 *
 * The ends are pinned: a road that meets another one, or the shore, has to
 * arrive at the height the ground is actually at.
 */
export function roadProfile(points, groundAt, maxGradient = MAX_ROAD_GRADIENT) {
  const heights = points.map(p => groundAt(p.x, p.z))
  if (heights.length < 2) return heights

  const gaps = []
  for (let i = 1; i < points.length; i++) {
    gaps.push(Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
  }

  // Forwards, then backwards. Each pass only ever lowers a height, so the
  // result is the highest profile that is nowhere too steep - which keeps the
  // road on the hill rather than tunnelling under it.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 1; i < heights.length; i++) {
      const limit = heights[i - 1] + gaps[i - 1] * maxGradient
      if (heights[i] > limit) heights[i] = limit
    }
    heights.reverse()
    gaps.reverse()
  }

  return heights
}

/**
 * How close two road points have to be to be the same place.
 *
 * Roads meet at junctions, and a junction has ONE height. Solving each road's
 * profile on its own gives two answers there, and the ground steps between
 * them - the first version had a stretch of road at a 276% gradient, which is
 * a wall, at the point where a street crossed the ring.
 */
export const JUNCTION_MERGE = 4

/** How hard the relaxation pulls a road towards level ground. */
export const PROFILE_RELAX = 0.35

/**
 * How many points apart two places on the SAME road have to be before they
 * count as a junction rather than as the road passing by itself.
 */
export const NEIGHBOUR_SPAN = 8

/**
 * Grid cell used to find nearby road points. Wide enough that one ring of
 * cells covers the furthest two corridors that could have to agree.
 */
export const BUCKET = 16

/**
 * Every road's height profile, solved together.
 *
 * The roads on an island form one network, so their heights are one problem:
 * where two roads pass within JUNCTION_MERGE of each other they are pinned to
 * the same height, and every stretch between is relaxed until nothing is
 * steeper than `maxGradient`.
 *
 * Returns an array of height arrays, one per road, in the order given.
 *
 * Why relaxation rather than a closed-form answer: the constraints are a
 * network with loops in it - ring roads, grids, spurs - and there is no
 * ordering that satisfies them in one pass. Forty rounds settles this map to
 * under a millimetre, and it is deterministic, which matters because the
 * ground mesh and the road ribbons both have to get the same answer.
 */
export function roadNetworkProfile(roads, groundAt, maxGradient = MAX_ROAD_GRADIENT) {
  // One node per point, then merged where roads touch
  const nodes = []
  const owner = []

  for (let r = 0; r < roads.length; r++) {
    owner.push([])
    const points = roads[r].points
    const reach = roads[r].width / 2 + ROAD_SHOULDER

    for (let i = 0; i < points.length; i++) {
      const point = points[i]

      // The ceiling is the lowest ground anywhere the corridor covers, not
      // just under the centre line. A road holds the land level out to its
      // shoulders, so a road whose shoulder reaches the water has to be AT
      // the water - otherwise it holds the whole coastline proud of the beach
      // behind it, which showed as a twenty-centimetre lip round the hub.
      const before = points[Math.max(0, i - 1)]
      const after = points[Math.min(points.length - 1, i + 1)]
      const run = Math.hypot(after.x - before.x, after.z - before.z) || 1
      const sx = -(after.z - before.z) / run
      const sz = (after.x - before.x) / run

      const height = Math.min(
        groundAt(point.x, point.z),
        groundAt(point.x + sx * reach, point.z + sz * reach),
        groundAt(point.x - sx * reach, point.z - sz * reach))

      owner[r].push(nodes.length)
      nodes.push({ x: point.x, z: point.z, height, road: r, at: i, reach })
    }
  }

  // Merge by a grid bucket, so this stays linear rather than comparing every
  // point against every other one.
  const parent = nodes.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  const buckets = new Map()

  nodes.forEach((node, i) => {
    const bx = Math.floor(node.x / BUCKET)
    const bz = Math.floor(node.z / BUCKET)

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        for (const j of buckets.get(`${bx + dx}:${bz + dz}`) || []) {
          const other = nodes[j]

          // NOT its own neighbours. Road points are resampled every couple of
          // units, so a plain distance test merges each road into one node,
          // every road into one component, and every island comes out
          // perfectly flat - which is exactly what happened. Only a different
          // road, or a distant part of the same one where it loops back on
          // itself, is a junction.
          if (other.road === node.road &&
              Math.abs(other.at - node.at) < NEIGHBOUR_SPAN) continue

          // Two roads whose flat zones overlap have to be at the same height
          // there, not merely where their centre lines cross. A street that
          // runs alongside the ring for twenty units shares ground with it the
          // whole way, and if each solved its own height the ground between
          // them stepped - 63% along a carriageway.
          const reach = node.road === other.road
            ? JUNCTION_MERGE
            : node.reach + other.reach

          if (Math.hypot(node.x - other.x, node.z - other.z) <= reach) {
            parent[find(i)] = find(j)
          }
        }
      }
    }

    const key = `${bx}:${bz}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(i)
  })

  // Group heights: a merged node starts at the average of what met there
  const groups = new Map()
  nodes.forEach((node, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(node.height)
  })

  const height = new Map()
  const ceiling = new Map()
  for (const [root, list] of groups) {
    height.set(root, list.reduce((a, b) => a + b, 0) / list.length)
    // A road may cut INTO a hill; it may never stand proud of the ground.
    // This is also what pins the ends: at the shore the open ground is at sea
    // level, so a road arriving there is held there, and the beach still
    // meets the sea. Without it the relaxation dragged the coast road up by
    // twenty centimetres to meet the hill behind it.
    ceiling.set(root, Math.min(...list))
  }

  // The edges: consecutive points along each road, in merged terms
  const edges = []
  for (let r = 0; r < roads.length; r++) {
    const points = roads[r].points
    for (let i = 1; i < points.length; i++) {
      const a = find(owner[r][i - 1])
      const b = find(owner[r][i])
      if (a === b) continue
      edges.push({
        a, b,
        run: Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
      })
    }
  }

  // Now lower whatever is too steep, until nothing is.
  //
  // This is a shortest-path problem, not something to nudge towards: the
  // answer is, for every node, the lowest of (some other node's ceiling, plus
  // the gradient times the road distance to it). Meeting in the middle by
  // halves does converge eventually, but it was still 290% out after forty
  // rounds - a wall of ground where a street met the ring.
  //
  // Relaxing edges until nothing changes gives the exact answer: the highest
  // profile that is nowhere above the ground and nowhere too steep.
  for (const root of height.keys()) height.set(root, ceiling.get(root))

  for (let round = 0; round < 400; round++) {
    let changed = false

    for (const edge of edges) {
      const allowed = edge.run * maxGradient
      const ha = height.get(edge.a)
      const hb = height.get(edge.b)

      if (hb > ha + allowed) { height.set(edge.b, ha + allowed); changed = true }
      else if (ha > hb + allowed) { height.set(edge.a, hb + allowed); changed = true }
    }

    if (!changed) break
  }

  return roads.map((road, r) => road.points.map((_, i) => height.get(find(owner[r][i]))))
}

/**
 * The nearest point on a path: where it is, how far, and which segment.
 *
 * This lives here rather than in the layout because height needs the SEGMENT,
 * not just the distance - a road corridor takes the height of the piece of
 * road it is beside, which means interpolating between two of its points.
 * The layout had its own copy answering only "which point"; there is one now,
 * and it answers both. `distanceToPath` in curves.js stays as the cheap
 * distance-only version for the places that only want a number.
 *
 * Null for a path with no usable segments, which is what the layout's
 * callers already expect.
 */
export function nearestOnPath(points, x, z) {
  let best = null

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lengthSq = dx * dx + dz * dz
    if (lengthSq < 1e-12) continue

    let t = ((x - a.x) * dx + (z - a.z) * dz) / lengthSq
    t = Math.max(0, Math.min(1, t))

    const px = a.x + dx * t
    const pz = a.z + dz * t
    const distance = Math.hypot(x - px, z - pz)

    if (!best || distance < best.distance) {
      best = { x: px, z: pz, distance, index: i - 1, t }
    }
  }

  return best
}

/**
 * How far outside an oriented rectangle a point is. Zero anywhere inside it.
 *
 * A building's pad is a RECTANGLE. Treating it as the circle around it - half
 * the diagonal - reaches a third of the way into the road it fronts, and the
 * pad then overrides the carriageway's own height and cambers it. Same lesson
 * as the fire stations, one floor down.
 */
export function rectangleDistance(x, z, pad) {
  const fx = Math.sin(pad.heading || 0)
  const fz = Math.cos(pad.heading || 0)
  const dx = x - pad.x
  const dz = z - pad.z

  const along = Math.abs(dx * fx + dz * fz) - pad.halfDepth
  const across = Math.abs(-dx * fz + dz * fx) - pad.halfWidth

  return Math.hypot(Math.max(along, 0), Math.max(across, 0))
}

/**
 * Do two oriented rectangles overlap, allowing for a margin?
 *
 * Separating axes, because the cheap tests are both wrong here: circles round
 * the rectangles group half a street into one terrace, and asking whether any
 * corner of one lies inside the other misses two rectangles crossing in a
 * plus shape - which is exactly how three plots ended up sharing ground
 * without being terraced together.
 */
export function rectanglesOverlap(a, b, margin = 0) {
  const corners = (pad, grow) => {
    const fx = Math.sin(pad.heading || 0)
    const fz = Math.cos(pad.heading || 0)
    const w = pad.halfWidth + grow
    const d = pad.halfDepth + grow
    const out = []
    for (const u of [-1, 1]) {
      for (const v of [-1, 1]) {
        out.push({ x: pad.x - fz * u * w + fx * v * d, z: pad.z + fx * u * w + fz * v * d })
      }
    }
    return out
  }

  const A = corners(a, margin / 2)
  const B = corners(b, margin / 2)

  for (const pad of [a, b]) {
    const fx = Math.sin(pad.heading || 0)
    const fz = Math.cos(pad.heading || 0)

    for (const axis of [{ x: fx, z: fz }, { x: -fz, z: fx }]) {
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity
      for (const p of A) {
        const t = p.x * axis.x + p.z * axis.z
        aMin = Math.min(aMin, t); aMax = Math.max(aMax, t)
      }
      for (const p of B) {
        const t = p.x * axis.x + p.z * axis.z
        bMin = Math.min(bMin, t); bMax = Math.max(bMax, t)
      }
      if (aMax < bMin || bMax < aMin) return false
    }
  }

  return true
}

/**
 * Pads that overlap become one terrace at one height.
 *
 * Two plots side by side on a street have flat zones that touch, and if each
 * kept its own height the ground in the overlap took whichever was asked
 * first - so a building on the boundary stood with one corner up to a metre
 * and a half off the other. A row of houses on a slope is a terrace; this
 * makes it one.
 */
export function terracePads(pads, margin = PAD_MARGIN * 2 + 0.5) {
  const parent = pads.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }

  // Rectangle to rectangle, at the distance their FLAT ZONES touch - twice
  // the pad margin - because that is when they actually share ground. Testing
  // the rectangles alone left two plots on perpendicular streets overlapping
  // only in their margins, and the corner where they met took whichever was
  // asked first: half a metre of tilt under one building.
  //
  // It is also why PAD_MARGIN is smaller than half PLOT_GAP: at any more,
  // every plot along a street would chain into one terrace and the whole row
  // would sit at one height while the street climbed past it.
  for (let i = 0; i < pads.length; i++) {
    for (let j = i + 1; j < pads.length; j++) {
      const far = Math.hypot(pads[i].x - pads[j].x, pads[i].z - pads[j].z)
      if (far > 40) continue
      if (rectanglesOverlap(pads[i], pads[j], margin)) parent[find(i)] = find(j)
    }
  }

  const groups = new Map()
  pads.forEach((pad, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root).push(pad)
  })

  for (const group of groups.values()) {
    const level = group.reduce((sum, p) => sum + p.height, 0) / group.length
    for (const pad of group) pad.height = level
  }

  return pads
}

/**
 * Cache a function of (x, z) on a one-centimetre grid.
 *
 * Keyed on a single number rather than a string: building two million strings
 * costs more than the lookups save.
 */
function remember(fn) {
  const cache = new Map()

  return (x, z) => {
    const key = Math.round(x * 100) * 4194304 + Math.round(z * 100)
    const hit = cache.get(key)
    if (hit !== undefined) return hit

    const value = fn(x, z)
    cache.set(key, value)
    return value
  }
}

/** How strongly a flat thing holds, from its edge out through its blend. */
function holdStrength(distance, flatTo, blend) {
  if (distance <= flatTo) return 1
  if (distance >= flatTo + blend) return 0

  const t = 1 - (distance - flatTo) / blend
  return t * t * (3 - 2 * t)
}

/**
 * Build the height field for one island.
 *
 * `spec` carries:
 *   hills      [{ x, z, radius, height }]  island-local
 *   inlandAt   (x, z) => how far inside the coast this point is
 *   beach      how far in before the hills reach full height
 *   roads      [{ points, width, heights }]  heights from roadProfile
 *   pads       [{ x, z, radius, height }]    building terraces
 *
 * Returns `heightAt(x, z)` and `slopeAt(x, z)`, both island-local.
 */
export function makeHeightField(spec) {
  const hills = spec.hills || []
  const roads = spec.roads || []
  const pads = spec.pads || []
  const beach = spec.beach || 12
  const inlandAt = spec.inlandAt || (() => 999)

  // A road only matters near itself. Without this every query walks every
  // point of every road on the island, and the ground mesh alone asks tens of
  // thousands of times.
  const bounds = roads.map(road => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of road.points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
    const reach = road.width / 2 + ROAD_SHOULDER + ROAD_BLEND
    return { minX: minX - reach, maxX: maxX + reach,
             minZ: minZ - reach, maxZ: maxZ + reach }
  })

  const open = (x, z) =>
    hillHeight(hills, x, z) * coastFactor(inlandAt(x, z), beach)

  function heightAt(x, z) {
    // The coast is applied HERE, to the open ground, and nowhere else.
    //
    // It used to gate the finished height as well, which put a two-and-a-half
    // metre cliff around every terrace near the shore: inside the footprint
    // the pad's height was returned whole, and one step outside it the same
    // height came back multiplied by a third. Everything that can claim the
    // ground - road profiles, building pads - already takes its height from
    // this tapered ground, so gating twice was gating what had already been
    // gated.
    const shore = coastFactor(inlandAt(x, z), beach)
    const open = hillHeight(hills, x, z) * shore

    // Every flat thing that has a say here, and how strongly.
    //
    // ONE rule for roads and terraces together, and it is a blend rather than
    // a winner. Picking the strongest claim - or the nearest, or the one you
    // are most inside - steps the moment the winner changes, and two claims
    // whose blends overlap swap over somewhere in the middle. That showed as a
    // 59-centimetre cliff in the ground between two building plots, which the
    // grass mesh then cut straight up through the road with.
    //
    // The weight is s / (1 - s): it runs away to infinity as a claim reaches
    // full strength, so inside a carriageway or a footprint the answer is
    // exactly that claim and nothing else gets a look in, and it falls to zero
    // at the outside of the blend. Continuous everywhere in between, which is
    // the property that actually matters - a mesh can only follow ground that
    // is smooth enough to be sampled.
    let sum = open
    let weight = 1
    let full = 0
    let fullSum = 0
    let roadFull = 0
    let roadFullSum = 0

    for (let i = 0; i < roads.length; i++) {
      const box = bounds[i]
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue

      const road = roads[i]
      const near = nearestOnPath(road.points, x, z)
      if (!near) continue

      const strength = holdStrength(
        near.distance, road.width / 2 + ROAD_SHOULDER, ROAD_BLEND)
      if (strength <= 0) continue

      const a = road.heights[near.index]
      const b = road.heights[near.index + 1] ?? a
      const here = a + (b - a) * near.t

      if (strength >= 1) { roadFull++; roadFullSum += here; continue }
      // Fading a claim's WEIGHT at the shore, rather than gating the finished
      // height, is what lets the land meet the sea without putting a step
      // around everything that stands near it.
      const w = (strength / (1 - strength)) * shore
      sum += w * here
      weight += w
    }

    for (const pad of pads) {
      const strength = holdStrength(
        rectangleDistance(x, z, pad), PAD_MARGIN, PAD_BLEND)
      if (strength <= 0) continue

      if (strength >= 1) { full++; fullSum += pad.height; continue }
      const w = (strength / (1 - strength)) * shore
      sum += w * pad.height
      weight += w
    }

    // Anything at full strength owns the ground outright. Two of the same
    // kind only overlap where they have been made to agree - roads pinned at
    // their junctions, plots terraced with their neighbours - so averaging is
    // a formality rather than a compromise.
    //
    // A road beats a terrace, though. Where a plot has been laid out with a
    // corner over a carriageway, the carriageway has to stay level: a car
    // drives on it, and nobody walks on the last half metre of a forecourt.
    if (roadFull) return roadFullSum / roadFull
    if (full) return fullSum / full

    return sum / weight
  }

  /**
   * How strongly the flat things - roads, terraces - hold this point.
   *
   * 1 on a carriageway or inside a building's footprint, falling to 0 at the
   * outside of their blends. The renderer uses it to duck the grass out of
   * the way underneath them: a decorative surface three centimetres below a
   * road will always find a way to poke through it, and no amount of mesh
   * resolution fixes that - the two surfaces are sampled at different points
   * and a flat triangle between two samples cuts above a surface that curves
   * away.
   */
  function claimAt(x, z) {
    let strongest = 0

    for (let i = 0; i < roads.length; i++) {
      const box = bounds[i]
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue

      const near = nearestOnPath(roads[i].points, x, z)
      if (!near) continue

      // The carriageway and its pavements - what is actually drawn - not the
      // corridor the HEIGHT blends over, which reaches three times as far.
      const paved = roads[i].pavedHalf ?? (roads[i].width / 2)
      strongest = Math.max(strongest, holdStrength(near.distance, paved, PAVED_FADE))
      if (strongest >= 1) return 1
    }

    // PAVED pads only - a plaza, not a building's plot.
    //
    // A road, a pavement and a plaza all draw a surface over the hole they
    // make. A building's terrace does not: the ground around a building is
    // just grass, so ducking it left every building standing a metre up in
    // the air over a moat of its own.
    for (const pad of pads) {
      if (!pad.paved) continue
      strongest = Math.max(strongest, holdStrength(
        rectangleDistance(x, z, pad), PAD_MARGIN, PAVED_FADE))
      if (strongest >= 1) return 1
    }

    return strongest
  }

  /** Rise per unit, sampled. Used to pitch vehicles and to test gradients. */
  function slopeAt(x, z, step = 1) {
    const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step)
    const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step)
    return { dx, dz, grade: Math.hypot(dx, dz) }
  }

  // Both of these are asked the same question over and over: the ground mesh
  // subdivides by testing the midpoint of every edge, and neighbouring
  // triangles share edges, so the same point comes up again and again. Without
  // this the six islands took 34 seconds to mesh - which reads as a portfolio
  // that does not load.
  //
  // Quantised to a centimetre. The field is smooth at that scale, and it is
  // ten times finer than the smallest gap between any two surfaces.
  return {
    heightAt: remember(heightAt),
    slopeAt,
    claimAt: remember(claimAt),
    roads, pads, hills
  }
}

// ---------------------------------------------------------------------------
// THE GROUND MESH
// ---------------------------------------------------------------------------

/**
 * How long a ground-mesh edge may be before it is split.
 *
 * The islands are triangulated from their outlines, which gives triangles up
 * to a hundred units across - fine when the ground was flat at zero, useless
 * for following a hill, because the surface between the corners is a plane
 * and the road laid on it is not.
 */
export const GROUND_MESH_EDGE = 6

/**
 * How far the flat mesh may stray from the true ground before it is split
 * again.
 *
 * This is the one that matters. Splitting by LENGTH alone assumes the ground
 * bends evenly, and it does not: it is nearly flat across open grass and then
 * drops a metre over three units at the edge of a building's terrace. A
 * six-unit triangle across that bank sat half a metre proud of the ground,
 * and since the road is only six centimetres above the grass, the grass came
 * up through the road - which is exactly what Mike saw.
 *
 * Two centimetres is comfortably inside the smallest clearance in the world
 * (the grass sits three below the road).
 */
export const GROUND_MESH_TOLERANCE = 0.06

/** But never smaller than this, or a bad field could subdivide for ever. */
export const GROUND_MESH_MIN_EDGE = 0.8

/**
 * Split triangles until every edge is shorter than `maxEdge`.
 *
 * Splits the LONGEST edge each time, which keeps the pieces from growing
 * slivers, and always at its midpoint - so two triangles sharing an edge
 * split it in the same place and the mesh stays watertight. A crack in the
 * ground is a hole you can see the sea through.
 */
export function subdivideTriangles(triangles, maxEdge, heightAt = null,
                                   tolerance = GROUND_MESH_TOLERANCE) {
  const out = []
  const queue = [...triangles]
  const limit = maxEdge * maxEdge
  const floor = GROUND_MESH_MIN_EDGE * GROUND_MESH_MIN_EDGE

  // A cap, so a pathological field cannot hang the loader
  let guard = 600000

  while (queue.length && guard-- > 0) {
    const t = queue.pop()

    // The longest edge, and how far the mesh strays from the ground along it.
    // Splitting the longest edge each time keeps the pieces from turning into
    // slivers, and always at its midpoint - so two triangles sharing an edge
    // split it in the same place and the mesh stays watertight. A crack in
    // the ground is a hole you can see the sea through.
    let worst = 0
    let at = -1
    for (let i = 0; i < 3; i++) {
      const a = t[i]
      const b = t[(i + 1) % 3]
      const d = (a.x - b.x) * (a.x - b.x) + (a.z - b.z) * (a.z - b.z)
      if (d > worst) { worst = d; at = i }
    }

    const a = t[at]
    const b = t[(at + 1) % 3]
    const c = t[(at + 2) % 3]
    const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }

    let split = worst > limit

    // Every edge, not just the longest one. A triangle lying across a bank
    // that runs parallel to its longest edge has no error along THAT edge at
    // all, and a test that only looks there passes it - which is how banks
    // three quarters of a metre out survived a tolerance of two centimetres.
    if (!split && heightAt && worst > floor) {
      for (let i = 0; i < 3 && !split; i++) {
        const p = t[i]
        const q = t[(i + 1) % 3]
        const m = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 }
        const chord = (heightAt(p.x, p.z) + heightAt(q.x, q.z)) / 2
        if (Math.abs(heightAt(m.x, m.z) - chord) > tolerance) split = true
      }
    }

    if (!split) { out.push(t); continue }

    queue.push([a, mid, c], [mid, b, c])
  }

  return out.concat(queue)
}
