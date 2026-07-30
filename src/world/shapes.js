/**
 * ============================================================================
 * ISLAND SHAPES
 * ============================================================================
 * Pure 2D polygon maths, no Three.js. Islands are described by an outline -
 * a closed loop of { x, z } points in island-local coordinates, with the
 * island's centre at (0, 0).
 *
 * A plain `radius` still works everywhere: it just generates a circle.
 *
 * The map editor carries a copy of the preset generators and the two hit-test
 * helpers so it can run standalone. If you change the maths here, mirror it
 * in public/map-editor.html.
 * ============================================================================
 */

/** Deterministic little RNG so a given seed always makes the same island. */
function makeRandom(seed) {
  let s = (seed | 0) || 1
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ---------------------------------------------------------------------------
// Preset generators
// ---------------------------------------------------------------------------
// Each returns a closed loop of points sized so the shape roughly fills
// `radius`. Vary `seed` for a different-but-similar island.

export const SHAPE_PRESETS = [
  'circle', 'blob', 'long', 'wide', 'crescent', 'lshape', 'triangle', 'star', 'atoll'
]

export function circlePoints(radius, segments = 26) {
  const pts = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    pts.push({ x: Math.sin(a) * radius, z: Math.cos(a) * radius })
  }
  return pts
}

/** Wobbly organic circle - the most natural-looking island. */
function blobPoints(radius, seed = 1, segments = 20) {
  const rnd = makeRandom(seed)
  // A few overlapping sine waves make a smoother wobble than pure noise
  const a1 = 0.12 + rnd() * 0.14, f1 = 2 + Math.floor(rnd() * 2)
  const a2 = 0.06 + rnd() * 0.09, f2 = 3 + Math.floor(rnd() * 3)
  const p1 = rnd() * Math.PI * 2, p2 = rnd() * Math.PI * 2

  const pts = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const r = radius * (1 + Math.sin(a * f1 + p1) * a1 + Math.sin(a * f2 + p2) * a2)
    pts.push({ x: Math.sin(a) * r, z: Math.cos(a) * r })
  }
  return pts
}

/** Stretched along Z (the "forward" axis). */
function longPoints(radius, seed = 1, segments = 22) {
  return blobPoints(radius, seed, segments).map(p => ({ x: p.x * 0.52, z: p.z * 1.32 }))
}

/** Stretched along X. */
function widePoints(radius, seed = 1, segments = 22) {
  return blobPoints(radius, seed, segments).map(p => ({ x: p.x * 1.32, z: p.z * 0.52 }))
}

/** Bay carved out of one side - gives you a natural harbour. */
function crescentPoints(radius, seed = 1, segments = 30) {
  const rnd = makeRandom(seed)
  const bite = 0.62 + rnd() * 0.12   // how deep the bay cuts
  const offset = radius * 0.68

  const pts = []
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const x = Math.sin(a) * radius
    const z = Math.cos(a) * radius

    // Push points near the bay inward toward the bite centre
    const d = Math.hypot(x - 0, z - offset)
    const cut = radius * bite
    if (d < cut) {
      const s = d / cut
      const k = 0.35 + 0.65 * s
      pts.push({ x: x * k, z: offset + (z - offset) * k })
    } else {
      pts.push({ x, z })
    }
  }
  return pts
}

/** Right-angled L - good for a town with a corner. */
function lShapePoints(radius) {
  const r = radius
  const raw = [
    { x: -r,       z: -r },
    { x:  r * 0.2, z: -r },
    { x:  r * 0.2, z:  r * 0.2 },
    { x:  r,       z:  r * 0.2 },
    { x:  r,       z:  r },
    { x: -r,       z:  r }
  ]
  return normaliseToRadius(raw, radius)
}

function trianglePoints(radius, seed = 1) {
  const rnd = makeRandom(seed)
  const rot = rnd() * Math.PI * 2
  const pts = []
  // Rounded corners read better than sharp ones at this scale
  for (let c = 0; c < 3; c++) {
    const base = rot + (c / 3) * Math.PI * 2
    for (let k = -2; k <= 2; k++) {
      const a = base + k * 0.14
      const r = radius * (1 - Math.abs(k) * 0.045)
      pts.push({ x: Math.sin(a) * r, z: Math.cos(a) * r })
    }
  }
  return normaliseToRadius(pts, radius)
}

/** Spiky - reads as rocky rather than sandy. */
function starPoints(radius, seed = 1, points = 5) {
  const rnd = makeRandom(seed)
  const inner = 0.52 + rnd() * 0.14
  const pts = []
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2
    const r = radius * (i % 2 === 0 ? 1 : inner)
    pts.push({ x: Math.sin(a) * r, z: Math.cos(a) * r })
  }
  return pts
}

/** Horseshoe - almost a ring, open on one side. */
function atollPoints(radius, seed = 1, segments = 34) {
  const rnd = makeRandom(seed)
  const gap = 0.55 + rnd() * 0.25          // radians of opening
  const thickness = 0.42 + rnd() * 0.1

  const outer = [], inner = []
  const span = Math.PI * 2 - gap

  for (let i = 0; i <= segments; i++) {
    const a = gap / 2 + (i / segments) * span
    outer.push({ x: Math.sin(a) * radius, z: Math.cos(a) * radius })
    inner.push({
      x: Math.sin(a) * radius * (1 - thickness),
      z: Math.cos(a) * radius * (1 - thickness)
    })
  }
  return outer.concat(inner.reverse())
}

/**
 * Build an outline from a preset name.
 * @param {string} preset  one of SHAPE_PRESETS
 * @param {number} radius  target size
 * @param {number} seed    vary for a different island of the same kind
 */
export function makeShape(preset, radius, seed = 1) {
  switch (preset) {
    case 'blob':     return blobPoints(radius, seed)
    case 'long':     return longPoints(radius, seed)
    case 'wide':     return widePoints(radius, seed)
    case 'crescent': return crescentPoints(radius, seed)
    case 'lshape':   return lShapePoints(radius)
    case 'triangle': return trianglePoints(radius, seed)
    case 'star':     return starPoints(radius, seed)
    case 'atoll':    return atollPoints(radius, seed)
    case 'circle':
    default:         return circlePoints(radius)
  }
}

/** Scale a point set so its furthest vertex sits at `radius`. */
function normaliseToRadius(pts, radius) {
  const max = boundingRadius(pts)
  if (max === 0) return pts
  const k = radius / max
  return pts.map(p => ({ x: p.x * k, z: p.z * k }))
}

// ---------------------------------------------------------------------------
// Measurements
// ---------------------------------------------------------------------------

/** Signed area. Positive means counter-clockwise winding. */
export function polygonArea(pts) {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    a += p.x * q.z - q.x * p.z
  }
  return a / 2
}

/** Distance from the island's centre to its furthest vertex. */
export function boundingRadius(pts) {
  let max = 0
  for (const p of pts) max = Math.max(max, Math.hypot(p.x, p.z))
  return max
}

export function polygonBounds(pts) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
  }
  return { minX, maxX, minZ, maxZ }
}

export function polygonCentroid(pts) {
  const area = polygonArea(pts)
  if (Math.abs(area) < 1e-9) {
    // Degenerate - fall back to the average of the vertices
    let x = 0, z = 0
    for (const p of pts) { x += p.x; z += p.z }
    return { x: x / pts.length, z: z / pts.length }
  }
  let cx = 0, cz = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length]
    const cross = p.x * q.z - q.x * p.z
    cx += (p.x + q.x) * cross
    cz += (p.z + q.z) * cross
  }
  return { x: cx / (6 * area), z: cz / (6 * area) }
}

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

/** Standard ray-crossing test. Point is in island-local coordinates. */
export function pointInPolygon(pts, x, z) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j]
    if ((a.z > z) !== (b.z > z) &&
        x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/** Shortest distance from a point to a line segment. */
function pointToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az
  const lenSq = dx * dx + dz * dz
  let t = 0
  if (lenSq > 0) {
    t = ((px - ax) * dx + (pz - az) * dz) / lenSq
    t = Math.max(0, Math.min(1, t))
  }
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t))
}

/**
 * Distance from a point to the island's coastline.
 * Positive inside the island, negative outside - so `> clearance` means
 * "safely inland by that much".
 */
export function distanceToEdge(pts, x, z) {
  let best = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    best = Math.min(best, pointToSegment(x, z, a.x, a.z, b.x, b.z))
  }
  return pointInPolygon(pts, x, z) ? best : -best
}

/**
 * Cast a ray from the island's centre in direction (dx, dz) and return how
 * far it travels before crossing the coastline. Used to find where a bridge
 * should meet the shore.
 */
export function rayDistanceToBoundary(pts, dx, dz) {
  const len = Math.hypot(dx, dz)
  if (len === 0) return 0
  const ux = dx / len, uz = dz / len

  let best = Infinity
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length]
    const ex = b.x - a.x, ez = b.z - a.z

    // Solve  t * u = a + s * e  for t >= 0 and 0 <= s <= 1.
    // Taking 2D cross products (cross(p,q) = p.x*q.z - p.z*q.x):
    //   t = cross(a, e) / cross(u, e)
    //   s = cross(a, u) / cross(u, e)
    const denom = ux * ez - uz * ex
    if (Math.abs(denom) < 1e-9) continue // ray parallel to this edge

    const t = (a.x * ez - a.z * ex) / denom
    if (t <= 1e-6 || t >= best) continue

    const s = (a.x * uz - a.z * ux) / denom
    if (s < 0 || s > 1) continue

    best = t
  }

  return best === Infinity ? boundingRadius(pts) : best
}

// ---------------------------------------------------------------------------
// Inset - used for the grass cap inside the sand beach
// ---------------------------------------------------------------------------

/**
 * Shrink a polygon inward by `d` units, moving each vertex along the
 * bisector of its two edges. Good for gentle shapes; very sharp spikes may
 * pinch, so the result is clamped to stay sane.
 */
/**
 * Pull a polygon inward, in polar form.
 *
 * The bisector method in insetPolygon() self-intersects when the inset is
 * large relative to the shape's wobble: the edges cross and the polygon
 * ties itself in a knot. Triangulated, that shows as a star-shaped hole
 * where whatever is underneath shows through - which is what put a pale
 * patch of sand in the middle of About island's grass.
 *
 * Sweeping a radius around the centroid cannot self-intersect, because
 * there is exactly one point per direction. Only valid for shapes that
 * are star-shaped about their centre, which every island outline is.
 */
export function insetPolygonRadial(pts, d, steps = 96) {
  if (pts.length < 3 || d <= 0) return pts.map(p => ({ ...p }))

  const out = []

  for (let i = 0; i < steps; i++) {
    const angle = (i / steps) * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    const reach = rayDistanceToBoundary(pts, dx, dz)
    const r = Math.max(0.5, reach - d)
    out.push({ x: dx * r, z: dz * r })
  }

  return out
}

export function insetPolygon(pts, d) {
  const n = pts.length
  if (n < 3 || d <= 0) return pts.map(p => ({ ...p }))

  // Interior lies to the left of each edge when the winding is CCW
  const sign = polygonArea(pts) > 0 ? 1 : -1
  const out = []

  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n]
    const cur = pts[i]
    const next = pts[(i + 1) % n]

    let e1x = cur.x - prev.x, e1z = cur.z - prev.z
    let e2x = next.x - cur.x, e2z = next.z - cur.z
    const l1 = Math.hypot(e1x, e1z) || 1
    const l2 = Math.hypot(e2x, e2z) || 1
    e1x /= l1; e1z /= l1
    e2x /= l2; e2z /= l2

    // Inward normal of each edge
    const n1x = -e1z * sign, n1z = e1x * sign
    const n2x = -e2z * sign, n2z = e2x * sign

    let bx = n1x + n2x, bz = n1z + n2z
    const bl = Math.hypot(bx, bz)

    if (bl < 1e-6) {
      // Doubled-back edge - just use one normal
      out.push({ x: cur.x + n1x * d, z: cur.z + n1z * d })
      continue
    }

    bx /= bl; bz /= bl

    // Move far enough along the bisector that the perpendicular offset is d.
    // Clamped so needle-sharp corners don't fly off to infinity.
    const cosHalf = bx * n1x + bz * n1z
    const scale = Math.min(d / Math.max(cosHalf, 0.25), d * 4)

    out.push({ x: cur.x + bx * scale, z: cur.z + bz * scale })
  }

  return out
}

// ---------------------------------------------------------------------------
// Convenience
// ---------------------------------------------------------------------------

/**
 * The outline for an island, whatever way it was described.
 * Falls back to a circle so islands defined only by `radius` keep working.
 */
export function getOutline(island) {
  if (island._outlineCache) return island._outlineCache

  let pts
  if (Array.isArray(island.outline) && island.outline.length >= 3) {
    pts = island.outline.map(p => ({ x: p.x, z: p.z }))
  } else if (island.shape && island.shape !== 'circle') {
    pts = makeShape(island.shape, island.radius, island.shapeSeed || 1)
  } else {
    pts = circlePoints(island.radius)
  }

  // Cached because this is read every frame by prop placement and the minimap
  Object.defineProperty(island, '_outlineCache', {
    value: pts, enumerable: false, writable: true, configurable: true
  })
  return pts
}

/** Clear a cached outline after editing an island at runtime. */
export function invalidateOutline(island) {
  if (island._outlineCache) island._outlineCache = undefined
}
