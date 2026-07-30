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
 * Smaller than half the gap between neighbouring plots (PLOT_GAP is 2.5), on
 * purpose. Any wider and every plot on a street shares ground with the next
 * one, and asking which is in charge in the overlap gives a different answer
 * on each side of the boundary. Smaller than the pavement too, so a pad never
 * reaches into the carriageway it fronts.
 */
export const PAD_MARGIN = 1.2

/** And the blend out from a pad. Shorter than a road's: a pad is a terrace. */
export const PAD_BLEND = 5

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
export function terracePads(pads, margin = PAD_MARGIN * 2) {
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
    const shore = coastFactor(inlandAt(x, z), beach)
    let height = hillHeight(hills, x, z) * shore

    // The roads, blended and weighted heavily towards the nearest.
    //
    // Winner-takes-all left a seam wherever two corridors met: the ground
    // jumped from one road's height to the other's at the midpoint between
    // them, and a car crossing that seam met a step. Cubing the strengths
    // keeps the road you are standing on firmly in charge while making the
    // handover continuous.
    let sum = 0
    let weight = 0
    let roadClaim = 0
    let onCarriageway = false
    let nearest = Infinity
    let nearestHeight = 0

    for (let i = 0; i < roads.length; i++) {
      const box = bounds[i]
      if (x < box.minX || x > box.maxX || z < box.minZ || z > box.maxZ) continue

      const road = roads[i]
      const near = nearestOnPath(road.points, x, z)
      if (!near) continue

      const strength = holdStrength(
        near.distance, road.width / 2 + ROAD_SHOULDER, ROAD_BLEND)
      if (strength <= 0) continue
      // A hair of tolerance: the kerb sample sits EXACTLY on width/2, and
      // whether it counted came down to the last bit of the float. One side
      // of the road took its own profile and the other took a neighbouring
      // building's terrace, which is a 10% camber from a rounding error.
      if (near.distance <= road.width / 2 + 0.05) onCarriageway = true

      const a = road.heights[near.index]
      const b = road.heights[near.index + 1] ?? a
      const here = a + (b - a) * near.t
      const w = strength * strength * strength

      sum += w * here
      weight += w
      roadClaim = Math.max(roadClaim, strength)

      if (near.distance < nearest) { nearest = near.distance; nearestHeight = here }
    }

    // Inside the carriageway the answer is that road's own profile and
    // nothing else - not a terrace, not a neighbouring corridor, and not even
    // a blend with one. A profile varies only ALONG its road, so taking it
    // whole is what makes the carriageway level across its width; blending at
    // the kerb left a 10% camber where two roads ran close together, which is
    // a car sliding towards the gutter.
    if (onCarriageway) return nearestHeight

    // Off the carriageway, a corridor lets go of the ground as it reaches the
    // water - it is holding the land level for the benefit of a road, and
    // there is no road out on the sand. Applied only HERE, after the
    // carriageway has already been answered, so it can never tilt the road
    // itself: doing it earlier cambered every coast road by ten per cent.
    // A building's terrace, which outranks the open ground, the road corridor
    // beside it and the coast taper below: Mike's requirement is that a
    // building stands vertical on ground that fully supports its base, so
    // inside its own footprint the answer is the pad, flat, full stop.
    let padClaim = 0
    let padHeight = 0

    // The pad you are most deeply inside wins, not the first one asked. With
    // terracing they agree anyway, but an answer that depends on array order
    // is an answer waiting to change.
    let inside = Infinity

    for (const pad of pads) {
      const distance = rectangleDistance(x, z, pad)
      const strength = holdStrength(distance, PAD_MARGIN, PAD_BLEND)
      if (strength <= 0) continue

      if (strength > padClaim || (strength === padClaim && distance < inside)) {
        padClaim = strength
        padHeight = pad.height
        inside = distance
      }
    }

    if (padClaim >= 1) return padHeight

    if (weight > 0) height += (sum / weight - height) * roadClaim

    // Outside the carriageway a terrace still gives way to the road corridor
    // as far as the corridor holds. Inside its own footprint a pad is at full
    // strength and has already returned above, so this only settles the blend
    // between the two.
    if (padClaim > 0) height += (padHeight - height) * padClaim * (1 - roadClaim)

    // And the coast has the last word over everything that is left, which is
    // open ground and the outer blends. Stated as a hard gate rather than
    // hoped for: the promise is that the land meets the sea, and the two
    // things that legitimately stand above the waterline - a road crossing
    // the beach, and a building's own terrace - have both answered above.
    return height * shore
  }

  /** Rise per unit, sampled. Used to pitch vehicles and to test gradients. */
  function slopeAt(x, z, step = 1) {
    const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step)
    const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step)
    return { dx, dz, grade: Math.hypot(dx, dz) }
  }

  return { heightAt, slopeAt, roads, pads, hills }
}
