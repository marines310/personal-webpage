/**
 * ============================================================================
 * MAP MACHINERY
 * ============================================================================
 * Bridge geometry, road generation, shape lookups and validation.
 *
 * >>> To change the world, edit mapData.js - not this file. <<<
 *
 * World.js builds the geography from here, ZoneManager.js places content
 * markers, and the minimap draws it, so they can never disagree.
 *
 * See MAP.md for the full guide.
 * ============================================================================
 */

import {
  getOutline,
  boundingRadius,
  rayDistanceToBoundary,
  distanceToEdge,
  polygonBounds,
  insetPolygon
} from './shapes.js'
import { ISLANDS, BRIDGES } from './mapData.js'
import {
  sampleSpline,
  bowedPath,
  distanceToPath,
  chaikinSmooth,
  chaikinClosed,
  resamplePath,
  turningRadii
} from './curves.js'

// ---------------------------------------------------------------------------
// GLOBAL SETTINGS
// ---------------------------------------------------------------------------

/** Where the car spawns and respawns. Should sit on an island. */
export const SPAWN_POINT = { x: 0, y: 2, z: 0 }

/** How thick the island slabs are. Their top face always sits at y = 0. */
export const ISLAND_DEPTH = 8

/** Height of the sea surface. */
export const SEA_LEVEL = -1.4

/** Drive below this and the car respawns at SPAWN_POINT. */
export const FALL_LIMIT = -4.5

/**
 * Default width of a bridge deck.
 * Wider than DEFAULT_ROAD_WIDTH so the road running across it leaves a
 * concrete shoulder either side, with the railings outside that.
 */
export const DEFAULT_BRIDGE_WIDTH = 8.5

/** Default width of a road, and the clearance props keep from one. */
export const DEFAULT_ROAD_WIDTH = 7

/**
 * How much automatic bridge-to-centre roads bow sideways.
 * 0 = dead straight spokes, 0.3 = quite winding. Islands can override
 * this with their own `roadCurve`.
 */
export const DEFAULT_ROAD_CURVE = 0.16

/** Samples per span when smoothing a road. Higher = smoother, more geometry. */
export const ROAD_SMOOTHNESS = 9

/**
 * Target gap between points along a road, in world units.
 *
 * Corner rounding works over roughly the length of the segments either
 * side of the corner, so this is really "how wide a corner may be". A
 * 7-unit road needs about 2 units of run to bend 30 degrees without the
 * inside edge folding over itself, which is what leaves gaps.
 */
export const ROAD_POINT_SPACING = 2.2

/**
 * How far in from the coast the ring road sits, as a fraction of the
 * island's reach. Bigger pulls the loop tighter to the middle.
 * Islands can override with `ringInset` (world units), or opt out with
 * `noRing: true`.
 */
export const RING_INSET_FRACTION = 0.34

// ---------------------------------------------------------------------------
// THE MAP DATA lives in mapData.js - that's the file you edit (or that the
// map editor overwrites). It's re-exported here so nothing else has to care
// where it came from.
// ---------------------------------------------------------------------------
export { ISLANDS, BRIDGES } from './mapData.js'

// ===========================================================================
// Everything below is machinery. You shouldn't need to edit it.
// ===========================================================================

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

/** The island's outline, island-local. A circle if no shape was given. */
export function islandOutline(island) {
  return getOutline(island)
}

/** Furthest the island reaches from its centre - its "worst case" radius. */
export function islandReach(island) {
  return boundingRadius(getOutline(island))
}

/** How far the coast is from the centre, along a given direction. */
export function shoreDistance(island, dx, dz) {
  return rayDistanceToBoundary(getOutline(island), dx, dz)
}

/**
 * How far inland a point is, island-local.
 * Positive means on land, negative means out at sea.
 */
export function inlandDistance(island, localX, localZ) {
  return distanceToEdge(getOutline(island), localX, localZ)
}

/** Bounding box of an island's outline, island-local. */
export function islandBounds(island) {
  return polygonBounds(getOutline(island))
}

/** Look an island up by id. */
export function getIsland(id) {
  return ISLANDS.find((i) => i.id === id)
}

/** The island the car spawns on (used as the respawn target). */
export function getSpawnIsland() {
  return getIsland('hub') || ISLANDS[0]
}

/** Islands excluding the spawn hub - i.e. the ones that carry content. */
export function getContentIslands() {
  const spawn = getSpawnIsland()
  return ISLANDS.filter((i) => i !== spawn)
}

/** Straight-line distance between two islands' centres. */
export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/**
 * Resolve a bridge definition into everything needed to build it:
 * midpoint, length, and yaw. Returns null if either island is unknown.
 */
export function resolveBridge(def) {
  const a = getIsland(def.from)
  const b = getIsland(def.to)
  if (!a || !b) return null

  const dx = b.x - a.x
  const dz = b.z - a.z
  const centreDist = Math.hypot(dx, dz)
  if (centreDist === 0) return null

  // Angle measured the same way the rest of the world uses it:
  // atan2(x, z), so that 0 points along +Z.
  const rotationY = Math.atan2(dx, dz)

  // Where the shoreline actually is along this direction. For circular
  // islands this equals the radius; for shaped ones it follows the coast,
  // so bridges always meet real land.
  const aShore = shoreDistance(a, dx, dz)
  const bShore = shoreDistance(b, -dx, -dz)

  // Start and end just inside each island's edge so the deck overlaps
  // the land slightly rather than leaving a seam.
  const startDist = aShore - 1.5
  const endDist = centreDist - bShore + 1.5
  const length = endDist - startDist
  const midDist = startDist + length / 2

  return {
    from: a,
    to: b,
    x: a.x + (dx / centreDist) * midDist,
    z: a.z + (dz / centreDist) * midDist,
    length,
    width: def.width || DEFAULT_BRIDGE_WIDTH,
    railings: def.railings !== false,
    rotationY,
    accent: a.accent
  }
}

/** Every valid bridge, resolved and ready to build. */
export function getBridges() {
  return BRIDGES.map(resolveBridge).filter(Boolean)
}

/**
 * Which bridges touch a given island, and from what direction.
 * Used to run a road from each bridge landing toward the island centre.
 */
export function getBridgeLandings(island) {
  const landings = []

  for (const def of BRIDGES) {
    if (def.from !== island.id && def.to !== island.id) continue

    const other = getIsland(def.from === island.id ? def.to : def.from)
    if (!other) continue

    const dx = other.x - island.x
    const dz = other.z - island.z
    const dist = Math.hypot(dx, dz)
    if (dist === 0) continue

    landings.push({
      // Unit vector from this island's centre toward the bridge
      dirX: dx / dist,
      dirZ: dz / dist,
      // How far the coast is in that direction, so the road reaches it
      shore: shoreDistance(island, dx, dz),
      rotationY: Math.atan2(dx, dz),
      other,
      // The bridge this landing belongs to, so callers can look up an
      // edited approach road for it
      def
    })
  }

  return landings
}

/**
 * All road segments on an island, in island-local coordinates.
 * Combines the automatic bridge-to-centre roads with any hand-authored
 * ones from the island's `roads` array.
 *
 * Each entry: { ax, az, bx, bz, width } - a line from A to B.
 */
/**
 * Condition a road path so it can be turned into a solid ribbon.
 *
 * Two things go wrong otherwise:
 *
 *  1. Uneven spacing. Corner rounding works over about the length of the
 *     segments either side of a corner, so tightly packed points leave
 *     the corner effectively sharp. Re-spacing first fixes that.
 *
 *  2. Genuinely tight bends. A road can only turn as tightly as its own
 *     half-width before the inner edge folds through itself and the
 *     surface collapses to nothing - which is exactly what a gap in the
 *     road is. Extra rounding passes ease those bends out.
 *
 * @param {Array<{x,z}>} points
 * @param {number} width  the road's width, which sets how tight is too tight
 */
export function smoothRoad(points, width = DEFAULT_ROAD_WIDTH) {
  let path = chaikinSmooth(resamplePath(points, ROAD_POINT_SPACING), 2)

  // Keep easing until no bend is tighter than the road can physically
  // take. Capped, because a path can be asked to do the impossible and
  // we would rather return something slightly kinked than loop forever.
  const minRadius = width * 0.55
  for (let pass = 0; pass < 4 && tightestRadius(path) < minRadius; pass++) {
    path = chaikinSmooth(resamplePath(path, ROAD_POINT_SPACING), 2)
  }

  return path
}

/** Smallest turning radius anywhere along a path, in world units. */
function tightestRadius(path) {
  return Math.min(...turningRadii(path))
}

export function getIslandRoads(island) {
  const roads = []

  const ring = getIslandRing(island)
  if (ring && !island.noAutoRoad) {
    roads.push({
      points: ring,
      width: DEFAULT_ROAD_WIDTH,
      ring: true
    })
  }

  for (const landing of getBridgeLandings(island)) {
    const edited = !!getApproach(island, landing.def)

    // An island with auto roads switched off still gets any approach it
    // has been given by hand - turning them off shouldn't throw away work.
    if (island.noAutoRoad && !edited) continue

    // Same source as the road the game actually draws, so the editor
    // preview and the prop-avoidance both match what you'll drive on.
    const controls = approachControls(
      island, landing.dirX, landing.dirZ, landing.def
    )

    roads.push({
      points: smoothRoad(
        sampleSpline(controls, { samplesPerSpan: ROAD_SMOOTHNESS })
      ),
      width: DEFAULT_ROAD_WIDTH,
      // Drawn as part of the continuous bridge road instead, but still
      // needed here so props keep clear of it
      auto: true,
      // Which bridge this approach serves, and whether it's been taken
      // over by hand. The editor needs both to offer Make editable.
      bridgeTo: landing.def.from === island.id ? landing.def.to : landing.def.from,
      edited
    })
  }

  for (const road of island.roads || []) {
    // Approach roads were handled above - they're drawn as part of the
    // continuous bridge road, so drawing them again here would lay a
    // second surface on top of the first.
    if (road.approachTo) continue

    const controls = resolveRoadControls(road)
    if (!controls || controls.length < 2) continue

    roads.push({
      points: smoothRoad(sampleSpline(controls, {
        samplesPerSpan: ROAD_SMOOTHNESS,
        closed: !!road.closed
      }), road.width || DEFAULT_ROAD_WIDTH),
      width: road.width || DEFAULT_ROAD_WIDTH
    })
  }

  return roads
}

/**
 * A hand-authored road can be written either way:
 *   { points: [ {x,z}, {x,z}, {x,z} ] }   a curve through several points
 *   { from: 'centre', to: { x, z } }      a simple two-point run
 */
function resolveRoadControls(road) {
  if (Array.isArray(road.points) && road.points.length >= 2) {
    return road.points.map(resolvePoint).filter(Boolean)
  }

  const a = resolvePoint(road.from)
  const b = resolvePoint(road.to)
  return a && b ? [a, b] : null
}

/** Small stable hash, so an island always bows its roads the same way. */
export function hashString(str) {
  let h = 0
  for (let i = 0; i < String(str).length; i++) {
    h = (h * 31 + String(str).charCodeAt(i)) | 0
  }
  return Math.abs(h % 1000)
}

/**
 * Which of this island's bridge landings a given bridge is, so the road
 * bow can be seeded identically to getIslandRoads().
 */
function landingIndex(island, def, bridges = BRIDGES) {
  let index = 0
  for (const other of bridges) {
    if (other.from !== island.id && other.to !== island.id) continue
    if (other === def) return index
    index++
  }
  return 0
}

/**
 * Where a bridge road runs once it comes ashore, in ISLAND-LOCAL
 * coordinates, always ordered shore -> centre.
 *
 * Two sources, one shape:
 *
 *   - by default it's computed - a gentle bow from the landing point in to
 *     the middle, seeded off the island's name so it looks the same every
 *     time the page loads
 *   - if the island carries an `approaches` entry for this bridge, those
 *     stored points win, and the road goes exactly where you put it
 *
 * Both the game and the map editor call this, which is the point: there is
 * one definition of where these roads go, so the preview can't disagree
 * with the world.
 */
/**
 * The ring road on an island: a loop set in from the coast that the
 * bridge roads feed into, island-local and closed.
 *
 * Why a ring at all. Every bridge road used to run to the island centre,
 * so an island with five bridges got five roads converging on one point -
 * unreadable, and impossible to drive through. A ring gives each road
 * somewhere to arrive, turns the middle back into a place rather than a
 * junction, and gives you a circuit to drive.
 *
 * Returns null for islands too small to hold one, and for any island
 * with `noRing: true`.
 */
export function getIslandRing(island) {
  if (!island || island.noRing) return null

  const outline = getOutline(island)
  const reach = boundingRadius(outline)

  // Set in far enough to leave the beach clear, but not so far that the
  // loop closes on itself. Below this an island can't hold a ring.
  const inset = island.ringInset !== undefined
    ? island.ringInset
    : Math.max(DEFAULT_ROAD_WIDTH, reach * RING_INSET_FRACTION)

  if (reach - inset < DEFAULT_ROAD_WIDTH * 1.6) return null

  // Built in polar form: for each direction out from the centre, take the
  // coast distance and come in by `inset`.
  //
  // The obvious approach - inset the outline polygon - does not survive
  // contact with a real coastline. Pulling a wobbly shape inward by 15
  // units makes it cross itself, and a self-crossing loop has a cusp in
  // it that no amount of smoothing removes; you get a 1.6-unit hairpin
  // where the road doubles back. Sweeping a radius around the centre
  // cannot self-intersect, because there is exactly one ring point per
  // direction.
  const STEPS = 96
  const radii = []

  for (let i = 0; i < STEPS; i++) {
    const angle = (i / STEPS) * Math.PI * 2
    const shore = rayDistanceToBoundary(outline, Math.cos(angle), Math.sin(angle))
    radii.push(Math.max(DEFAULT_ROAD_WIDTH, shore - inset))
  }

  // Smooth the radius around the loop so bays and headlands become gentle
  // swells rather than corners. Circular, so there's no seam.
  //
  // How much smoothing is needed depends on how ragged the coast is, so
  // rather than guess a number of passes, keep going until the loop is
  // actually drivable. A deeply indented island simply ends up with a
  // rounder ring, which is the right answer.
  const toPoints = () => {
    const ring = radii.map((r, i) => {
      const angle = (i / STEPS) * Math.PI * 2
      return { x: Math.cos(angle) * r, z: Math.sin(angle) * r }
    })
    ring.push({ ...ring[0] })
    return chaikinClosed(ring, 2)
  }

  let ring = toPoints()

  for (let pass = 0; pass < 40; pass++) {
    if (Math.min(...turningRadii(ring)) >= DEFAULT_ROAD_WIDTH) break

    const next = radii.map((r, i) => {
      const prev = radii[(i - 1 + STEPS) % STEPS]
      const after = radii[(i + 1) % STEPS]
      return prev * 0.25 + r * 0.5 + after * 0.25
    })
    radii.splice(0, STEPS, ...next)
    ring = toPoints()
  }

  return ring
}

/**
 * Every place two roads on an island meet or cross, island-local.
 *
 * A road is a ribbon with square ends. Where one runs into another they
 * overlap in a rough T with visible corners, and where two cross at an
 * angle the outer corners of the crossing are left bare. Laying a disc of
 * the same asphalt at each of these points covers both cases - and because
 * the whole surface is one flat colour at one height, the disc is
 * invisible except for the corner it fills.
 *
 * Returns { x, z, radius }. Nearby hits are merged so a spur meeting a
 * ring produces one junction rather than a cluster.
 */
export function getIslandJunctions(island) {
  const roads = getIslandRoads(island)
  const hits = []

  for (let a = 0; a < roads.length; a++) {
    for (let b = a + 1; b < roads.length; b++) {
      const radius = Math.max(roads[a].width, roads[b].width) / 2

      for (const point of pathCrossings(roads[a].points, roads[b].points, radius)) {
        hits.push({ ...point, radius })
      }
    }
  }

  // Merge anything closer together than a road is wide
  const merged = []
  for (const hit of hits) {
    const near = merged.find(m =>
      Math.hypot(m.x - hit.x, m.z - hit.z) < Math.max(m.radius, hit.radius))

    if (near) {
      near.radius = Math.max(near.radius, hit.radius)
    } else {
      merged.push({ ...hit })
    }
  }

  return merged
}

/**
 * Where two polylines cross, plus where one simply ends on the other -
 * which is the common case here, a spur running into the ring.
 */
function pathCrossings(pathA, pathB, tolerance) {
  const out = []

  for (let i = 1; i < pathA.length; i++) {
    for (let k = 1; k < pathB.length; k++) {
      const hit = segmentIntersection(
        pathA[i - 1], pathA[i], pathB[k - 1], pathB[k]
      )
      if (hit) out.push(hit)
    }
  }

  // A spur that stops just short of the ring never technically crosses it,
  // so check both endpoints against the other path too.
  for (const [path, other] of [[pathA, pathB], [pathB, pathA]]) {
    for (const end of [path[0], path[path.length - 1]]) {
      const near = nearestOnPath(other, end.x, end.z)
      if (near && Math.hypot(near.x - end.x, near.z - end.z) <= tolerance) {
        out.push({ x: end.x, z: end.z })
      }
    }
  }

  return out
}

/** Where two line segments cross, or null. */
function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1z = p2.z - p1.z
  const d2x = p4.x - p3.x, d2z = p4.z - p3.z

  const denom = d1x * d2z - d1z * d2x
  if (Math.abs(denom) < 1e-12) return null // parallel

  const t = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / denom
  const u = ((p3.x - p1.x) * d1z - (p3.z - p1.z) * d1x) / denom

  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: p1.x + d1x * t, z: p1.z + d1z * t }
}

/** The point on a path closest to a given island-local point. */
function nearestOnPath(path, x, z) {
  let best = null
  let bestDist = Infinity

  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]
    const b = path[i]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lenSq = dx * dx + dz * dz
    if (lenSq < 1e-12) continue

    let t = ((x - a.x) * dx + (z - a.z) * dz) / lenSq
    t = Math.max(0, Math.min(1, t))
    const px = a.x + dx * t
    const pz = a.z + dz * t
    const d = Math.hypot(x - px, z - pz)

    if (d < bestDist) {
      bestDist = d
      best = { x: px, z: pz }
    }
  }

  return best
}

export function approachControls(island, dx, dz, def, bridges = BRIDGES) {
  const dist = Math.hypot(dx, dz)
  const ux = dx / dist
  const uz = dz / dist
  const shore = shoreDistance(island, dx, dz)
  const reach = Math.max(2, shore - 1)
  const landing = { x: ux * reach, z: uz * reach }

  const stored = getApproach(island, def)
  if (stored) {
    // The first point is where the road meets the bridge deck. It is
    // pinned to the landing whatever the saved file says, because a road
    // that starts anywhere else tears open a hole at the join - and a
    // stale saved point is exactly what you'd get after moving an island.
    const points = stored.points.map(p => ({ x: p.x, z: p.z }))
    points[0] = landing
    return points
  }

  // Where the road is heading: the near side of the ring if there is one,
  // otherwise the middle as before.
  const ring = getIslandRing(island)
  const target = ring
    ? nearestOnPath(ring, landing.x, landing.z) || { x: 0, z: 0 }
    : { x: 0, z: 0 }

  const curve = island.roadCurve !== undefined ? island.roadCurve : DEFAULT_ROAD_CURVE
  const seed = hashString(island.id) + landingIndex(island, def, bridges) * 37

  // A spur onto a ring is short. Bowing it as hard as a full run to the
  // centre would make it wander noticeably on its way to a target only a
  // few units away, so the bow is eased off for short roads.
  const runLength = Math.hypot(target.x - landing.x, target.z - landing.z)
  const eased = curve * Math.min(1, runLength / 18)

  return bowedPath(landing, target, eased, seed)
}

/**
 * The island's hand-edited approach for one bridge, if it has one.
 *
 * These live in the island's ordinary `roads` array, marked with
 * `approachTo: '<island id>'`:
 *
 *   roads: [
 *     { approachTo: 'hub', points: [ {x,z}, {x,z}, ... ] }
 *   ]
 *
 * Keeping them there rather than in a separate list means the map editor
 * can select, drag and delete them with the machinery it already has -
 * and deleting one simply hands the road back to the generator.
 */
export function getApproach(island, def) {
  if (!island || !def || !Array.isArray(island.roads)) return null

  const otherId = def.from === island.id ? def.to : def.from
  const found = island.roads.find(r => r.approachTo === otherId)

  return found && Array.isArray(found.points) && found.points.length >= 2
    ? found
    : null
}

/** The approach road on one island, as world-space points. */
function approachPath(island, dx, dz, def, towardCentre) {
  const dist = Math.hypot(dx, dz)
  const ux = dx / dist
  const uz = dz / dist
  const shore = shoreDistance(island, dx, dz)

  if (island.noAutoRoad && !getApproach(island, def)) {
    return [{ x: island.x + ux * shore, z: island.z + uz * shore }]
  }

  const controls = approachControls(island, dx, dz, def)
  const sampled = sampleSpline(controls, { samplesPerSpan: ROAD_SMOOTHNESS })

  // Sampled shore -> centre. Reverse when we want centre -> shore.
  const ordered = towardCentre ? sampled : [...sampled].reverse()
  return ordered.map(p => ({ x: island.x + p.x, z: island.z + p.z }))
}

/**
 * One continuous road per bridge, in world coordinates:
 *
 *   island A centre -> A shore -> across the bridge -> B shore -> B centre
 *
 * Built as a single path so there is no join between the island road and
 * the bridge deck. The corners where they meet are rounded off, and the
 * bridge span is sampled densely enough that the smoothing leaves it
 * straight - a road that wandered off a rigid deck would look worse than
 * the seam it replaced.
 */
export function getBridgeRoadPaths() {
  const paths = []

  for (const def of BRIDGES) {
    const a = getIsland(def.from)
    const b = getIsland(def.to)
    if (!a || !b) continue

    const dx = b.x - a.x
    const dz = b.z - a.z
    const dist = Math.hypot(dx, dz)
    if (dist === 0) continue

    const ux = dx / dist
    const uz = dz / dist
    const aShore = shoreDistance(a, dx, dz)
    const bShore = shoreDistance(b, -dx, -dz)

    const points = []

    // Down island A, centre first
    points.push(...approachPath(a, dx, dz, def, false))

    // Straight across the bridge. Several points keep it straight through
    // the smoothing pass.
    //
    // These MUST pick up exactly where the approach roads left off. The
    // deck itself starts slightly further back (shore - 1.5) so it tucks
    // under the land, but starting the road there would send it half a
    // unit backwards - a cusp, which collapses the ribbon to zero width
    // and leaves a hole across the road.
    const startDist = Math.max(2, aShore - 1)
    const endDist = dist - Math.max(2, bShore - 1)
    const span = endDist - startDist

    if (span > 0) {
      const steps = Math.max(2, Math.round(span / 2.5))
      for (let i = 0; i <= steps; i++) {
        const t = startDist + span * (i / steps)
        points.push({ x: a.x + ux * t, z: a.z + uz * t })
      }
    }

    // Up island B, ending at its centre
    points.push(...approachPath(b, -dx, -dz, def, true))

    // Even out the spacing before smoothing. The approach roads arrive
    // finely sampled and the bridge span coarsely, and a corner only gets
    // rounded over about the length of its neighbouring segments - so
    // where points are packed tightly the junction stays sharp, and a
    // sharp corner pinches the road ribbon shut.
    paths.push({
      points: smoothRoad(points, DEFAULT_ROAD_WIDTH),
      width: DEFAULT_ROAD_WIDTH
    })
  }

  return paths
}

/** Turn 'centre' or { x, z } into a plain point. */
function resolvePoint(point) {
  if (point === 'centre' || point === 'center') return { x: 0, z: 0 }
  if (point && typeof point.x === 'number' && typeof point.z === 'number') {
    return { x: point.x, z: point.z }
  }
  return null
}

/**
 * Shortest distance from an island-local point to any road on that island.
 * World.js uses this to keep props from spawning in the road.
 */
export function distanceToNearestRoad(roads, localX, localZ) {
  let best = Infinity

  for (const road of roads) {
    // Distance to the curve itself, then back off by half the road width
    const dist = distanceToPath(road.points, localX, localZ) - road.width / 2
    if (dist < best) best = dist
  }

  return best
}

/** Half-extent of the whole map, so the minimap can auto-fit any layout. */
export function getMapExtent() {
  let max = 1
  for (const island of ISLANDS) {
    max = Math.max(max, Math.hypot(island.x, island.z) + islandReach(island))
  }
  return max * 1.08 // a little breathing room
}

/**
 * Sanity-check the map and report problems in the console.
 * Called once at startup so hand-editing fails loudly instead of
 * silently producing a broken world.
 */
export function validateLayout() {
  const problems = []
  const warnings = []
  const ids = new Set()

  for (const island of ISLANDS) {
    if (ids.has(island.id)) problems.push(`Duplicate island id: "${island.id}"`)
    ids.add(island.id)

    if (typeof island.x !== 'number' || typeof island.z !== 'number') {
      problems.push(`Island "${island.id}" is missing x/z`)
    }
    if (!island.radius || island.radius <= 0) {
      problems.push(`Island "${island.id}" needs a positive radius`)
    }
  }

  // Overlapping landmasses. Checked along the line between the two
  // centres, using each island's real coastline rather than its radius,
  // so a long thin island doesn't false-alarm on its narrow axis.
  for (let i = 0; i < ISLANDS.length; i++) {
    for (let j = i + 1; j < ISLANDS.length; j++) {
      const a = ISLANDS[i]
      const b = ISLANDS[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const centreDist = Math.hypot(dx, dz)
      if (centreDist === 0) {
        problems.push(`Islands "${a.id}" and "${b.id}" sit on the same spot`)
        continue
      }

      const gap = centreDist - shoreDistance(a, dx, dz) - shoreDistance(b, -dx, -dz)

      if (gap < 0) {
        problems.push(
          `Islands "${a.id}" and "${b.id}" overlap by ${(-gap).toFixed(1)} units`
        )
      } else if (gap < 4) {
        warnings.push(
          `Islands "${a.id}" and "${b.id}" are only ${gap.toFixed(1)} units apart - ` +
          `their bridge will be very short`
        )
      }
    }
  }

  // Bridges
  for (const def of BRIDGES) {
    if (!getIsland(def.from)) problems.push(`Bridge references unknown island "${def.from}"`)
    if (!getIsland(def.to)) problems.push(`Bridge references unknown island "${def.to}"`)
    if (def.from === def.to) problems.push(`Bridge from "${def.from}" to itself`)

    const resolved = resolveBridge(def)
    if (resolved && resolved.length <= 0) {
      problems.push(
        `Bridge "${def.from}" - "${def.to}" has no length; the islands are touching`
      )
    }
  }

  // Reachability from the spawn island
  const spawn = getSpawnIsland()
  if (spawn) {
    const reached = new Set([spawn.id])
    const queue = [spawn.id]

    while (queue.length) {
      const current = queue.shift()
      for (const def of BRIDGES) {
        let next = null
        if (def.from === current) next = def.to
        else if (def.to === current) next = def.from
        if (next && !reached.has(next) && getIsland(next)) {
          reached.add(next)
          queue.push(next)
        }
      }
    }

    for (const island of ISLANDS) {
      if (!reached.has(island.id)) {
        warnings.push(
          `Island "${island.id}" can't be driven to - it has no bridge path ` +
          `from "${spawn.id}"`
        )
      }
    }
  }

  if (problems.length) {
    console.error(
      '[Map] Problems found in islandLayout.js:\n  - ' + problems.join('\n  - ')
    )
  }
  if (warnings.length) {
    console.warn(
      '[Map] Warnings for islandLayout.js:\n  - ' + warnings.join('\n  - ')
    )
  }
  if (!problems.length && !warnings.length) {
    console.info(
      `[Map] Layout OK - ${ISLANDS.length} islands, ${BRIDGES.length} bridges.`
    )
  }

  return { problems, warnings }
}
