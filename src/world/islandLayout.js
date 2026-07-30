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
  insetPolygon,
  pointInPolygon
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

/**
 * Streets inside a town are narrower than the ring road and the bridge
 * roads, which reads as a hierarchy: main road round the edge, side
 * streets within.
 */
export const DEFAULT_STREET_WIDTH = 5.5

/**
 * How far apart the streets of a town grid run. This is the block size,
 * so it has to fit two rows of buildings back to back plus their gardens
 * - about 34 units for 8-deep buildings.
 */
export const DEFAULT_BLOCK_SIZE = 34

/** Shorter than this and a clipped street is a stub, not a road. */
export const MIN_STREET_LENGTH = 18

/** Pavement between the kerb and the building line. */
export const PAVEMENT_WIDTH = 2.4

/** Default footprint of a plot in a town row, and the gap between them. */
export const DEFAULT_PLOT_WIDTH = 9
export const DEFAULT_PLOT_DEPTH = 8
export const PLOT_GAP = 2.5

/** Footpaths to buildings no road passes. Narrower than a pavement. */
export const WALKWAY_WIDTH = 1.8

/**
 * Beyond this a building isn't on a back lot, it's standing in a field,
 * and a long path out to it looks stranger than no path at all.
 */
export const MAX_WALKWAY_LENGTH = 40

/**
 * Clear ground that must be left between two roads that aren't meeting.
 *
 * A street clipped from a grid can end up running almost alongside the
 * ring, leaving a sliver of pavement between two carriageways - which
 * looks like a mistake, because it is one. Streets that spend most of
 * their length this close to another road are dropped.
 */
export const MIN_ROAD_SEPARATION = 9

/**
 * How far two roads may run alongside each other before one of them is a
 * mistake, in world units.
 *
 * Measured as a LENGTH, not as a fraction of the street, because that's
 * what's actually objectionable: 30 units of double carriageway looks
 * wrong whether the street is 40 units long or 200.
 */
export const MAX_PARALLEL_RUN = 26

/**
 * The shallowest angle at which a street may join the ring, in degrees.
 *
 * A street meeting the ring at 8 degrees doesn't read as a junction - the
 * two carriageways converge over tens of units and leave a long thin
 * wedge of pavement between them, which looks like a mistake. Below this
 * the street is dropped rather than trimmed: a grid line grazing the edge
 * of the island wasn't worth having.
 */
export const MIN_JUNCTION_ANGLE = 32

/**
 * Junctions closer together than this are treated as one for signalling.
 *
 * Where a street meets the ring at an angle, the crossing maths finds two
 * or three separate contact points a dozen units apart. Signalling each
 * one gave a dozen poles in one place. Drivers see one junction there, so
 * it gets one set of lights.
 */
export const SIGNAL_MERGE_DISTANCE = 22

/**
 * Approaches within this many degrees of each other count as one.
 *
 * Two roads meeting at a shallow angle arrive from nearly the same
 * direction; signalling both puts two poles side by side facing the same
 * way, which reads as a mistake rather than as traffic control.
 */
export const ARM_MERGE_ANGLE = 40

/** Clear ground a signal pole needs between itself and any carriageway. */
export const POLE_CLEARANCE = 1.2

/**
 * Clear ground kept around a bridge landing.
 *
 * The arrival at an island is the one view every visitor gets, and a
 * building on the kerb right where the bridge lands stands directly in
 * it. Nothing is placed within this of a landing.
 */
export const LANDING_CLEARANCE = 26

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
      ring: true,
      closed: true
    })
  }

  for (const street of getTownGrid(island)) {
    roads.push({
      points: smoothRoad(street.points, street.width),
      width: street.width,
      street: true
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
    // second surface on top of the first. Same for a hand-edited ring,
    // which is emitted as the ring at the top of this function.
    if (road.approachTo || road.isRing) continue

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
/**
 * An island's hand-edited ring, if it has one.
 *
 * Stored like the bridge approaches: an ordinary entry in the island's
 * `roads`, marked `isRing: true`. Same reasoning - the editor can then
 * select it, drag its points and delete it with the machinery it already
 * has, and deleting simply hands the loop back to the generator.
 */
export function getStoredRing(island) {
  if (!island || !Array.isArray(island.roads)) return null

  const found = island.roads.find(r => r.isRing)
  return found && Array.isArray(found.points) && found.points.length >= 3
    ? found
    : null
}

export function getIslandRing(island) {
  if (!island || island.noRing) return null

  // A ring you've taken over by hand wins outright. It isn't re-derived
  // from the coastline, so moving a headland won't drag your road with it.
  const stored = getStoredRing(island)
  if (stored) {
    const loop = stored.points.map(p => ({ x: p.x, z: p.z }))

    // Drop a repeated closing point: the spline wraps on its own.
    const first = loop[0]
    const last = loop[loop.length - 1]
    if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-6) loop.pop()
    if (loop.length < 3) return null

    // Run the curve THROUGH the handles rather than rounding the corners
    // off them. Corner rounding pulls the loop inwards at every handle,
    // so taking a ring over visibly shrank it - by 3.3 units on a big
    // island, half a road width. A spline through the points doesn't
    // move them at all.
    let curve = sampleSpline(loop, {
      samplesPerSpan: ROAD_SMOOTHNESS,
      closed: true
    })

    // Ease it only if you've actually drawn something too tight to drive.
    // Easing unconditionally would drag the loop off the handles you
    // placed, for no benefit on a ring that was already fine.
    for (let pass = 0; pass < 8; pass++) {
      if (Math.min(...turningRadii(curve)) >= DEFAULT_ROAD_WIDTH * 0.75) break
      curve = chaikinClosed(resamplePath(curve, ROAD_POINT_SPACING), 1)
    }

    return curve
  }

  const outline = getOutline(island)
  const reach = boundingRadius(outline)

  // How far in from the coast, as a FRACTION of the coast distance in
  // each direction - not a fixed number of units.
  //
  // A fixed inset works out as a fraction of the island's longest axis,
  // which on a stretched island is more than the short axis has to give.
  // The sides then bottom out at the minimum width while the ends stay
  // wide, and the ring becomes two big lobes joined by a pinch - 2-unit
  // hairpins on a 7-unit road. Taking a proportion of the local shore
  // distance keeps the loop in step with the shape whatever it is.
  //
  // `ringInset` on an island still means an absolute number of units.
  const fraction = island.ringInsetFraction !== undefined
    ? island.ringInsetFraction
    : RING_INSET_FRACTION

  if (reach * (1 - fraction) < DEFAULT_ROAD_WIDTH * 1.6) return null

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
    const pulled = island.ringInset !== undefined
      ? shore - island.ringInset
      : shore * (1 - fraction)
    radii.push(Math.max(DEFAULT_ROAD_WIDTH, pulled))
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

/** Does this island get a town laid out on it? */
export function isTown(island) {
  if (!island) return false
  return island.grid !== undefined ? island.grid : island.theme === 'town'
}

/**
 * A grid of streets inside the ring, island-local.
 *
 * Only for town islands - a grid on a jungle island would look absurd -
 * and only inside the ring, so the ring stays the edge of the built-up
 * area and the coast stays open.
 *
 * Each street is clipped to the ring and stops exactly on it, which is
 * what makes the junctions work: getIslandJunctions() sees the ends
 * touching the loop and lays a patch there without being told to.
 *
 * Islands can set `grid: false` to opt out, `blockSize` to change how big
 * the blocks are, and `gridAngle` (degrees) to turn the whole grid.
 */
export function getTownGrid(island) {
  if (!isTown(island) || island.noAutoRoad) return []

  const ring = getIslandRing(island)
  if (!ring) return []

  const spacing = island.blockSize || DEFAULT_BLOCK_SIZE

  // Seeded off the island's name, so a town is laid out the same way on
  // every visit but no two towns line up with each other.
  const angle = island.gridAngle !== undefined
    ? (island.gridAngle * Math.PI) / 180
    : (hashString(island.id) % 90) * (Math.PI / 180)

  const bounds = polygonBounds(ring)
  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ)
  const streets = []

  // Two sets of parallel lines at right angles, swept across the island
  for (const axis of [0, 1]) {
    const dirX = axis ? Math.cos(angle) : -Math.sin(angle)
    const dirZ = axis ? Math.sin(angle) : Math.cos(angle)
    const perpX = -dirZ
    const perpZ = dirX

    const lines = Math.ceil(span / spacing)

    for (let i = -lines; i <= lines; i++) {
      const offset = i * spacing
      const ox = perpX * offset
      const oz = perpZ * offset

      // Walk the full length of this line and keep the stretches that
      // fall inside the ring. A concave island can give more than one.
      for (const run of runsInsideRing(ring, ox, oz, dirX, dirZ, span)) {
        const candidate = {
          points: [run.from, run.to],
          width: DEFAULT_STREET_WIDTH,
          street: true
        }

        // Reject anything running alongside a road already there. The
        // ring is the usual culprit: a grid line clipped near the edge of
        // the island can shadow it for most of its length, leaving two
        // carriageways with a sliver of pavement between them.
        if (crowdsAnother(candidate, [{ points: ring, width: DEFAULT_ROAD_WIDTH }, ...streets])) {
          continue
        }

        // And reject anything meeting the ring at a glancing angle
        if (meetsTooShallow(candidate, ring)) continue

        streets.push(candidate)
      }
    }
  }

  return streets
}

/**
 * Where buildings go in a town: in rows along the streets, square to the
 * kerb, at a constant setback.
 *
 * The scatter that used to fill town islands put buildings at random
 * angles in random places, which reads as debris rather than a street.
 * Walking the roads and placing plots along them is what makes a row of
 * frontages line up.
 *
 * Returns island-local { x, z, rotation, width, depth, facing } where
 * `facing` is the direction the front looks, and rotation is in degrees
 * to match the map format.
 */
export function getTownPlots(island) {
  if (!isTown(island)) return []

  const streets = getIslandRoads(island).filter(r => r.street || r.ring)
  if (!streets.length) return []

  const outline = getOutline(island)
  const plots = []

  // Where each bridge comes ashore, island-local
  const landings = getBridgeLandings(island).map(l => {
    const reach = Math.max(2, l.shore - 1)
    return { x: l.dirX * reach, z: l.dirZ * reach }
  })

  const depth = island.plotDepth || DEFAULT_PLOT_DEPTH
  const width = island.plotWidth || DEFAULT_PLOT_WIDTH

  streets.forEach((road, roadIndex) => {
    // Setback measured from the centre line: half the road, the pavement,
    // then half the building. Constant for every plot, which is what
    // makes the frontages line up.
    const setback = road.width / 2 + PAVEMENT_WIDTH + depth / 2

    const path = resamplePath(road.points, width + PLOT_GAP)

    // Skip the first and last - a building right on a junction blocks the
    // corner and looks wrong from every direction.
    for (let i = 1; i < path.length - 1; i++) {
      // The plot's position comes from the coarse walk, but the direction
      // it faces must come from the road itself.
      //
      // Taking the tangent across the coarse spacing means measuring a
      // 23-unit chord, which on a curved ring points up to 28 degrees away
      // from the kerb the building actually sits on - visibly skewed.
      const tan = tangentAt(road.points, path[i].x, path[i].z)
      if (!tan) continue
      const tx = tan.x
      const tz = tan.z

      // One plot each side, facing back toward the road
      for (const side of [1, -1]) {
        const nx = -tz * side
        const nz = tx * side

        const x = path[i].x + nx * setback
        const z = path[i].z + nz * setback

        // Reject the inside of a tight bend.
        //
        // Where the road curves tighter than the setback, stepping inward
        // lands you near the centre of the curve - the plot ends up closer
        // to a different part of the same road than to the stretch it was
        // meant to front, so it faces off at an angle and crowds its
        // neighbours. Physically there is no room for a building there.
        const nearest = nearestOnPath(road.points, x, z)
        if (!nearest ||
            Math.hypot(nearest.x - path[i].x, nearest.z - path[i].z) > setback * 0.5) {
          continue
        }

        // Clear of every bridge landing. Arriving at an island is the one
        // view every visitor gets; a building on the kerb right where the
        // bridge lands stands squarely in it.
        if (landings.some(l => Math.hypot(l.x - x, l.z - z) < LANDING_CLEARANCE)) {
          continue
        }

        // On land, clear of the coast
        if (distanceToEdge(outline, x, z) < depth) continue

        // Clear of every OTHER road, not just the one it fronts.
        //
        // Without this, plots near an intersection sit almost on the
        // cross street - they measured 6.9 units from its centre line
        // against a 9.9 setback, so they'd be built halfway into it and
        // face the wrong way relative to the road you'd see them from.
        const others = streets.filter((_, k) => k !== roadIndex)
        if (others.length &&
            distanceToNearestRoad(others, x, z) < depth / 2 + PAVEMENT_WIDTH) {
          continue
        }

        // Face the road as seen FROM WHERE THE BUILDING ENDS UP, not from
        // where it started. Stepping 10 units off a curve moves you along
        // it as well as away from it, so the kerb in front of the finished
        // plot runs at a slightly different angle to the one at the start.
        const settled = tangentAt(road.points, x, z) || { x: tx, z: tz }
        const fx = -(-settled.z * side)
        const fz = -(settled.x * side)

        plots.push({
          x: Math.round(x * 10) / 10,
          z: Math.round(z * 10) / 10,
          // The front faces back at the road
          rotation: Math.round((Math.atan2(fx, fz) * 180) / Math.PI),
          width,
          depth,
          // Which road this plot fronts, so the frontage can be checked
          // against the right one
          roadIndex
        })
      }
    }
  })

  // Two streets running close together can both claim the same ground
  return dropOverlapping(plots, width * 0.9)
}

/**
 * The direction a path runs at the point nearest (x, z), measured on the
 * path's own points rather than any coarser sampling of it.
 */
function tangentAt(points, x, z) {
  let best = 0
  let bestDist = Infinity

  for (let i = 0; i < points.length; i++) {
    const d = Math.hypot(points[i].x - x, points[i].z - z)
    if (d < bestDist) { bestDist = d; best = i }
  }

  const a = points[Math.max(0, best - 1)]
  const b = points[Math.min(points.length - 1, best + 1)]
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)

  return len < 1e-6 ? null : { x: dx / len, z: dz / len }
}

/**
 * Footpaths reaching buildings that no road goes past, island-local.
 *
 * Generated town plots always front a street - that's how they're placed.
 * Buildings you put down by hand don't: drop one in the middle of a block
 * and it sits on grass with no way to reach it on foot. This runs a narrow
 * path from each of those out to the nearest road.
 *
 * Returns { points: [from, to], width } - the same shape as a road, so it
 * can be drawn with the same ribbon code.
 */
export function getWalkways(island) {
  if (!island) return []

  const roads = getIslandRoads(island)
  if (!roads.length) return []

  const walkways = []

  for (const building of island.buildings || []) {
    const bx = building.x || 0
    const bz = building.z || 0
    const half = Math.max(building.width || 6, building.depth || 6) / 2

    // Which road is nearest, and where on it
    let target = null
    let gap = Infinity

    for (const road of roads) {
      const near = nearestOnPath(road.points, bx, bz)
      if (!near) continue
      const d = Math.hypot(near.x - bx, near.z - bz) - road.width / 2
      if (d < gap) { gap = d; target = near }
    }

    if (!target) continue

    // Already on a pavement: no path needed. Further than this and it
    // isn't a back lot, it's a building in a field - a long path to it
    // would look stranger than none.
    if (gap <= half + PAVEMENT_WIDTH * 1.5) continue
    if (gap > MAX_WALKWAY_LENGTH) continue

    // Start at the building's wall, not its centre, or the path would
    // appear to run out from underneath it.
    let dx = target.x - bx
    let dz = target.z - bz
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    dx /= len
    dz /= len

    walkways.push({
      points: [
        { x: bx + dx * half, z: bz + dz * half },
        { x: target.x, z: target.z }
      ],
      width: WALKWAY_WIDTH
    })
  }

  return walkways
}

/** Remove plots that landed on top of each other. */
function dropOverlapping(plots, minGap) {
  const kept = []
  for (const p of plots) {
    if (kept.some(k => Math.hypot(k.x - p.x, k.z - p.z) < minGap)) continue
    kept.push(p)
  }
  return kept
}

/**
 * Does this street spend most of its length hugging another road?
 *
 * Crossing one is fine - that's a junction. Running parallel a few units
 * away is not, so the test is how MUCH of the street is too close, not
 * whether any of it is.
 */
function crowdsAnother(candidate, others) {
  const [from, to] = candidate.points
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  if (length < 1e-6) return true

  const dirX = (to.x - from.x) / length
  const dirZ = (to.z - from.z) / length

  const STEP = 2
  let run = 0

  for (let travelled = 0; travelled <= length; travelled += STEP) {
    const x = from.x + dirX * travelled
    const z = from.z + dirZ * travelled

    // Ignore the approach to each end: every street meets the ring there,
    // so of course it's close - that's the junction, not crowding.
    //
    // Expressed as a fraction of the street so it matches how this is
    // measured in tests/town.mjs. A fixed number of units disagreed with
    // it on long streets, and the generator accepted one the test then
    // rejected.
    const along = travelled / length
    if (Math.min(along, 1 - along) < 0.15) continue

    for (const other of others) {
      const near = nearestOnPath(other.points, x, z)
      if (!near) continue

      const gap = Math.hypot(near.x - x, near.z - z)
        - candidate.width / 2 - other.width / 2
      if (gap >= MIN_ROAD_SEPARATION) continue

      // Close is only a problem if they're going the SAME WAY. Two roads
      // crossing at an angle are a junction; two roads a few units apart
      // running parallel are a mistake.
      const tan = tangentAt(other.points, x, z)
      if (!tan) continue
      if (Math.abs(dirX * tan.x + dirZ * tan.z) > 0.9) { run += STEP; break }
    }
  }

  return run > MAX_PARALLEL_RUN
}

/**
 * Does this street run into the ring at a glancing angle?
 *
 * Both ends are checked. A street that grazes the ring converges with it
 * over a long distance instead of crossing it, which reads as two roads
 * squeezed together rather than as a junction.
 */
function meetsTooShallow(candidate, ring) {
  const [from, to] = candidate.points
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  if (length < 1e-6) return true

  const dirX = (to.x - from.x) / length
  const dirZ = (to.z - from.z) / length
  const limit = Math.cos((MIN_JUNCTION_ANGLE * Math.PI) / 180)

  for (const end of [from, to]) {
    const tan = tangentAt(ring, end.x, end.z)
    if (!tan) continue
    // Parallel means dot product near 1; a right angle means near 0
    if (Math.abs(dirX * tan.x + dirZ * tan.z) > limit) return true
  }

  return false
}

/**
 * The stretches of a line that lie inside the ring.
 *
 * Sampled rather than solved: a ring is a many-sided polygon and an
 * island can be concave, so a line may enter and leave more than once.
 * Walking it and noting where it crosses is simpler than the algebra and
 * cannot miss a lobe.
 */
function runsInsideRing(ring, ox, oz, dirX, dirZ, span) {
  const STEP = 1.5
  const runs = []
  let start = null

  for (let t = -span; t <= span; t += STEP) {
    const x = ox + dirX * t
    const z = oz + dirZ * t
    const inside = pointInPolygon(ring, x, z)

    if (inside && start === null) start = t
    if ((!inside || t + STEP > span) && start !== null) {
      const from = { x: ox + dirX * start, z: oz + dirZ * start }
      const to = { x, z }

      // Ignore slivers clipped off a corner of the ring - a three-unit
      // stub of road leading nowhere is worse than no road.
      if (Math.hypot(to.x - from.x, to.z - from.z) >= MIN_STREET_LENGTH) {
        runs.push({ from, to })
      }
      start = null
    }
  }

  return runs
}

/**
 * The whole drivable network, in world coordinates.
 *
 * Returns:
 *   segments - every road in the world, as a world-space polyline, with
 *              where it came from so the editor can point at it
 *   nodes    - every place segments touch: { x, z, segments: [i, …] }
 *
 * This is DERIVED, never stored. Connections that live in the data go
 * stale the moment you drag an island; connections worked out from where
 * the roads actually are cannot. It costs a little to recompute and is
 * always right.
 *
 * A node with two or more segments is a junction. A node with one is a
 * dead end - which the editor draws differently, because a road you meant
 * to join to something and didn't is the mistake worth catching.
 *
 * Anything wanting to drive a car around later wants this: nodes are
 * where you can choose a direction, segments are what you follow.
 */
export function getRoadNetwork() {
  const segments = []

  for (const island of ISLANDS) {
    for (const road of getIslandRoads(island)) {
      // Approach roads are drawn as part of the bridge run, so taking
      // them here as well would double every one of them up.
      if (road.auto) continue

      segments.push({
        points: road.points.map(p => ({ x: island.x + p.x, z: island.z + p.z })),
        island: island.id,
        kind: road.ring ? 'ring' : 'road',
        closed: !!road.ring
      })
    }
  }

  for (let i = 0; i < BRIDGES.length; i++) {
    const path = getBridgeRoadPaths()[i]
    if (!path) continue
    segments.push({
      points: path.points,
      island: null,
      kind: 'bridge',
      bridge: BRIDGES[i],
      closed: false
    })
  }

  return buildNetwork(segments)
}

/**
 * Work out where a set of road polylines join each other.
 *
 * Split out from getRoadNetwork so the map editor can feed in the roads
 * it is currently drawing - including ones you haven't saved yet - and
 * get connections worked out by exactly the same code the game uses.
 *
 * @param {Array<{points, closed}>} segments  world-space polylines
 */
export function buildNetwork(segments) {
  // A node wherever segment ends land on, or near, another segment.
  const TOLERANCE = DEFAULT_ROAD_WIDTH * 0.75
  const nodes = []

  const addNode = (x, z, index) => {
    const existing = nodes.find(n => Math.hypot(n.x - x, n.z - z) < TOLERANCE)
    if (existing) {
      if (!existing.segments.includes(index)) existing.segments.push(index)
      return existing
    }
    const node = { x, z, segments: [index] }
    nodes.push(node)
    return node
  }

  segments.forEach((seg, i) => {
    const ends = seg.closed
      ? []                                  // a loop has no loose ends
      : [seg.points[0], seg.points[seg.points.length - 1]]

    for (const end of ends) {
      const node = addNode(end.x, end.z, i)

      // Anything else passing within a road's width of this end counts as
      // joined - that's what a T-junction is.
      segments.forEach((other, k) => {
        if (k === i) return
        const near = nearestOnPath(other.points, end.x, end.z)
        if (near && Math.hypot(near.x - end.x, near.z - end.z) <= TOLERANCE) {
          if (!node.segments.includes(k)) node.segments.push(k)
        }
      })
    }
  })

  // Crossings, for roads that pass through each other rather than end
  segments.forEach((a, i) => {
    segments.forEach((b, k) => {
      if (k <= i) return
      for (let p = 1; p < a.points.length; p++) {
        for (let q = 1; q < b.points.length; q++) {
          const hit = segmentIntersection(
            a.points[p - 1], a.points[p], b.points[q - 1], b.points[q]
          )
          if (hit) {
            const node = addNode(hit.x, hit.z, i)
            if (!node.segments.includes(k)) node.segments.push(k)
          }
        }
      }
    })
  })

  return { segments, nodes }
}

/**
 * Where traffic signals belong, island-local.
 *
 * Not simply "every junction": the crossing maths finds several contact
 * points where a street meets the ring at an angle, and signalling each
 * of them put a dozen poles in one place. Junctions within
 * SIGNAL_MERGE_DISTANCE are one junction as far as a driver is concerned.
 *
 * Each signal reports its `arms` - one per approach. A crossroads has
 * four, a T has three, and a bend has two and gets no lights at all.
 * That's what stops a plain corner sprouting signals.
 */
export function getTrafficSignals(island) {
  // Bridge approaches count. They're marked `auto` because they're drawn
  // as part of the continuous bridge run rather than separately, but where
  // one meets the ring a driver arrives at a T-junction and expects to be
  // told what to do. Leaving them out was why the hub had no lights at
  // all: its five junctions each saw only the ring, so only two arms.
  const roads = getIslandRoads(island)
    .filter(r => r.street || r.ring || r.auto)
  if (!roads.length) return []

  // Cluster the raw junctions
  const clusters = []
  for (const j of getIslandJunctions(island)) {
    const near = clusters.find(c =>
      Math.hypot(c.x - j.x, c.z - j.z) < SIGNAL_MERGE_DISTANCE)

    if (near) {
      near.members.push(j)
      near.x = near.members.reduce((a, m) => a + m.x, 0) / near.members.length
      near.z = near.members.reduce((a, m) => a + m.z, 0) / near.members.length
      near.radius = Math.max(near.radius, j.radius)
    } else {
      clusters.push({ x: j.x, z: j.z, radius: j.radius, members: [j] })
    }
  }

  const signals = []

  for (const cluster of clusters) {
    const arms = []

    for (const road of roads) {
      let nearest = Infinity
      let index = 0
      road.points.forEach((p, i) => {
        const d = Math.hypot(p.x - cluster.x, p.z - cluster.z)
        if (d < nearest) { nearest = d; index = i }
      })
      if (nearest > cluster.radius + SIGNAL_MERGE_DISTANCE * 0.7) continue

      const tan = tangentAt(road.points, cluster.x, cluster.z)
      if (!tan) continue

      // A road that STOPS here is one approach. A road that carries on
      // through is two. Counting every road as two was what turned every
      // T-junction into a four-way.
      const fromStart = index
      const fromEnd = road.points.length - 1 - index
      const terminates = !road.closed &&
        Math.min(fromStart, fromEnd) < road.points.length * 0.12

      if (terminates) {
        // Point back along the road, away from the junction
        const sign = fromStart < fromEnd ? -1 : 1
        arms.push({ x: tan.x * sign, z: tan.z * sign })
      } else {
        arms.push({ x: tan.x, z: tan.z })
        arms.push({ x: -tan.x, z: -tan.z })
      }
    }

    // Merge approaches pointing much the same way. Two roads crossing at
    // a shallow angle arrive from nearly the same direction, and a driver
    // reads that as one approach - two poles side by side just look like a
    // mistake.
    const distinct = []
    for (const arm of arms) {
      const same = distinct.find(d =>
        d.x * arm.x + d.z * arm.z > Math.cos((ARM_MERGE_ANGLE * Math.PI) / 180))
      if (!same) distinct.push(arm)
    }

    // Work out where each pole actually stands.
    //
    // Offsetting a fixed amount sideways from the junction centre put half
    // of them in the middle of the carriageway: the junction disc is 3.5
    // units across but the roads are 5.5 to 7 wide. So step outwards until
    // the spot is genuinely clear of every road, and drop the pole if no
    // such spot exists.
    const withPoles = []

    for (const arm of distinct) {
      const pole = clearSpotBeside(cluster, arm, roads)
      if (pole) withPoles.push({ ...arm, pole })
    }

    if (withPoles.length >= 3) {
      signals.push({
        x: cluster.x, z: cluster.z, radius: cluster.radius, arms: withPoles
      })
    }
  }

  return signals
}

/**
 * A spot for a signal pole beside an approach: back from the junction and
 * off to the right, stepped outwards until it clears every carriageway.
 *
 * Returns null if nothing within reach is clear, which is better than
 * planting a pole in the road.
 */
function clearSpotBeside(cluster, arm, roads) {
  // Candidates in order of preference: near the junction and to the right
  // of oncoming traffic first, then further back, then the left side.
  //
  // Only searching one side at one setback failed at exactly the junctions
  // that matter most - where a bridge approach meets the ring, there's
  // another carriageway on the right, so no spot was found and the whole
  // junction went unsignalled.
  for (const back of [3.4, 6, 9, 12]) {
    for (const hand of [-1, 1]) {
      for (let side = 3; side <= 15; side += 0.75) {
        const reach = cluster.radius + back
        const x = cluster.x + arm.x * reach + arm.z * side * hand
        const z = cluster.z + arm.z * reach - arm.x * side * hand

        // Round FIRST, then test. Rounding after the test can shift the
        // pole by up to 0.05 and push a borderline spot back into the road.
        const spot = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }
        if (distanceToNearestRoad(roads, spot.x, spot.z) >= POLE_CLEARANCE) {
          return spot
        }
      }
    }
  }

  return null
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
      // Big enough to reach the CORNERS of the crossing, not just the
      // edge of the wider road. Two roads crossing at right angles form a
      // diamond whose corners sit hypot(wA/2, wB/2) from the centre -
      // using max(w)/2 left those corners bare, which is what read as one
      // road's surface overlapping the other's.
      const radius = Math.hypot(roads[a].width / 2, roads[b].width / 2) + 0.6

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
