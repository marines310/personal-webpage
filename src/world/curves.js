/**
 * ============================================================================
 * CURVES
 * ============================================================================
 * Turns a handful of control points into a smooth path.
 *
 * Roads are authored as a few points; this samples a Catmull-Rom spline
 * through them so the finished road bends naturally instead of running in
 * dead-straight lines between corners.
 *
 * Catmull-Rom is used because the curve passes exactly THROUGH every control
 * point - so a road goes where you put it, rather than being merely pulled
 * toward your points the way a Bezier would.
 *
 * The "centripetal" parameterisation (alpha = 0.5) is what stops the curve
 * looping back on itself when two control points sit close together.
 *
 * The map editor carries a copy of sampleSpline(). Keep the two in step.
 * ============================================================================
 */

/**
 * Sample a smooth path through the given points.
 *
 * @param {Array<{x,z}>} points  control points, 2 or more
 * @param {object} options
 *   samplesPerSpan  how many segments to draw between each pair (default 10)
 *   closed          join the last point back to the first
 *   tension         0 = very loose, 1 = tight. Default 0.5.
 * @returns {Array<{x,z}>} a dense polyline
 */
export function sampleSpline(points, options = {}) {
  const {
    samplesPerSpan = 10,
    closed = false,
    tension = 0.5
  } = options

  if (!points || points.length < 2) return (points || []).map(p => ({ ...p }))

  // Two points can't bend - just return the straight line
  if (points.length === 2 && !closed) {
    const out = []
    for (let i = 0; i <= samplesPerSpan; i++) {
      const t = i / samplesPerSpan
      out.push({
        x: points[0].x + (points[1].x - points[0].x) * t,
        z: points[0].z + (points[1].z - points[0].z) * t
      })
    }
    return out
  }

  const n = points.length
  const out = []
  const spanCount = closed ? n : n - 1

  for (let i = 0; i < spanCount; i++) {
    // The four control points for this span. Ends are handled by
    // mirroring, which keeps the curve from flicking outward.
    const p0 = points[closed ? (i - 1 + n) % n : Math.max(i - 1, 0)]
    const p1 = points[closed ? i : i]
    const p2 = points[closed ? (i + 1) % n : Math.min(i + 1, n - 1)]
    const p3 = points[closed ? (i + 2) % n : Math.min(i + 2, n - 1)]

    for (let s = 0; s < samplesPerSpan; s++) {
      const t = s / samplesPerSpan
      out.push(catmullRom(p0, p1, p2, p3, t, tension))
    }
  }

  // Finish on the last control point exactly
  if (closed) out.push({ ...out[0] })
  else out.push({ ...points[n - 1] })

  return out
}

/** One point on a Catmull-Rom span. */
function catmullRom(p0, p1, p2, p3, t, tension) {
  const t2 = t * t
  const t3 = t2 * t

  // Tangents at the two inner points, scaled by tension
  const m1x = tension * (p2.x - p0.x)
  const m1z = tension * (p2.z - p0.z)
  const m2x = tension * (p3.x - p1.x)
  const m2z = tension * (p3.z - p1.z)

  // Standard cubic Hermite basis
  const a =  2 * t3 - 3 * t2 + 1
  const b =      t3 - 2 * t2 + t
  const c = -2 * t3 + 3 * t2
  const d =      t3 -     t2

  return {
    x: a * p1.x + b * m1x + c * p2.x + d * m2x,
    z: a * p1.z + b * m1z + c * p2.z + d * m2z
  }
}

/**
 * Add a gentle sideways bow to a straight run, so automatic roads don't
 * all look like spokes on a wheel.
 *
 * @param {{x,z}} a        start
 * @param {{x,z}} b        end
 * @param {number} amount  bow size as a fraction of length (0 = straight)
 * @param {number} seed    varies which way it bends
 */
export function bowedPath(a, b, amount = 0.18, seed = 1) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const length = Math.hypot(dx, dz)
  if (length < 0.001 || amount === 0) return [a, b]

  // Perpendicular to the run
  const nx = -dz / length
  const nz = dx / length

  // Deterministic direction and size from the seed
  const wobble = Math.sin(seed * 12.9898) * 43758.5453
  const dir = (wobble - Math.floor(wobble)) < 0.5 ? -1 : 1
  const offset = length * amount * dir

  // Two control points at the thirds gives a soft S rather than a single arc
  return [
    a,
    { x: a.x + dx * 0.33 + nx * offset,       z: a.z + dz * 0.33 + nz * offset },
    { x: a.x + dx * 0.67 + nx * offset * 0.55, z: a.z + dz * 0.67 + nz * offset * 0.55 },
    b
  ]
}

/**
 * Re-space a polyline so every step is roughly `spacing` long.
 *
 * Paths stitched together from different sources arrive with wildly
 * uneven spacing - a spline sampled every 0.3 units running into a bridge
 * span sampled every 2.5. That matters because corner smoothing rounds a
 * corner over roughly the length of its neighbouring segments: where the
 * points are packed tightly, the corner gets rounded over almost no
 * distance at all and stays effectively sharp.
 *
 * Evening out the spacing first gives every corner room to round properly.
 */
export function resamplePath(points, spacing = 2) {
  const clean = dedupePath(points)
  if (clean.length < 2 || spacing <= 0) return clean

  const out = [{ ...clean[0] }]
  let carry = 0

  for (let i = 1; i < clean.length; i++) {
    const a = clean[i - 1]
    const b = clean[i]
    const segLen = Math.hypot(b.x - a.x, b.z - a.z)
    if (segLen < 1e-9) continue

    let travelled = spacing - carry

    while (travelled < segLen) {
      const t = travelled / segLen
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
      travelled += spacing
    }

    carry = segLen - (travelled - spacing)
  }

  // Always finish exactly on the last point
  const last = clean[clean.length - 1]
  const tail = out[out.length - 1]
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > 1e-6) {
    out.push({ ...last })
  }

  return out
}

/**
 * Round off the corners of a polyline (Chaikin's algorithm).
 *
 * Each pass replaces every corner with two points cutting across it, at a
 * quarter and three quarters along each edge. Straight runs stay straight -
 * the new points land exactly on the old line - while sharp corners get
 * progressively rounded. Two passes is usually enough.
 *
 * This is what smooths the join where an island road meets a bridge:
 * without it the two run into each other at an angle and the corner reads
 * as a jagged notch.
 *
 * The first and last points are kept exactly, so a road still starts and
 * ends where it was told to.
 */
export function chaikinSmooth(points, iterations = 2) {
  let pts = points.map(p => ({ ...p }))

  for (let pass = 0; pass < iterations; pass++) {
    if (pts.length < 3) return pts

    const out = [{ ...pts[0] }]

    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      out.push(
        { x: a.x * 0.75 + b.x * 0.25, z: a.z * 0.75 + b.z * 0.25 },
        { x: a.x * 0.25 + b.x * 0.75, z: a.z * 0.25 + b.z * 0.75 }
      )
    }

    out.push({ ...pts[pts.length - 1] })
    pts = out
  }

  return pts
}

/** Total length of a polyline. */
export function pathLength(points) {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
  }
  return total
}

/**
 * Shortest distance from a point to a polyline.
 * Used to keep props out of the road, whatever shape it bends into.
 */
export function distanceToPath(points, x, z) {
  let best = Infinity

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lenSq = dx * dx + dz * dz

    let t = 0
    if (lenSq > 0) {
      t = ((x - a.x) * dx + (z - a.z) * dz) / lenSq
      t = Math.max(0, Math.min(1, t))
    }

    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
    if (d < best) best = d
  }

  return best
}

/**
 * Half-widths that a ribbon can safely use at each point along a path.
 *
 * A road of width W laid around a bend of radius R only works while
 * R > W/2. Any tighter and the inner edge folds through itself: the
 * surface self-intersects and its triangles flip to face downward.
 *
 * So we measure the local turning radius and pull the width in wherever
 * the bend is too tight. The road narrows slightly through a hairpin,
 * which looks like a road, rather than turning inside out.
 *
 * @returns {number[]} one half-width per point
 */
/**
 * Drop points that sit on top of each other.
 *
 * Duplicated or near-duplicated points give a zero-length segment, which
 * has no meaningful direction - everything downstream then divides by
 * roughly zero and the geometry falls apart.
 */
export function dedupePath(points, epsilon = 1e-4) {
  if (!points || points.length === 0) return []

  const out = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    const last = out[out.length - 1]
    if (Math.hypot(points[i].x - last.x, points[i].z - last.z) > epsilon) {
      out.push({ ...points[i] })
    }
  }
  return out
}

/**
 * Turn a path into the quads that make up a road surface of the given width.
 *
 * Every quad returned is guaranteed to face upward. Where the path is so
 * pathological that no width would work - a true cusp, where the road
 * doubles straight back on itself - that quad is left out rather than
 * emitted inside out. A hair-thin gap is far better than a black hole in
 * the road where the surface faces the wrong way.
 *
 * @returns {Array<{l0,r0,l1,r1}>} corner points, ready to triangulate
 */
export function ribbonQuads(points, width) {
  const path = dedupePath(points)
  if (path.length < 2) return []

  const tangents = pathTangents(path)
  const half = width / 2
  const quads = []

  // Full width, every quad, always.
  //
  // The earlier version narrowed the road through bends too tight for it,
  // so the inside edge could never fold through itself. That is the right
  // instinct for a ribbon seen edge-on, but a road is a flat slab of one
  // colour lying on the ground: an overlap is invisible, whereas the
  // narrowing it avoided pinched the surface down to nothing and left a
  // gap you could see straight through. Overlapping is the lesser evil.
  //
  // Every quad shares its far edge with the next quad's near edge
  // exactly, so the run is watertight. Left and right are never swapped
  // to "correct" a fold: that would break the shared edge and open a
  // seam, trading one visible fault for another. Folds are handled where
  // the mesh is built instead, by giving every vertex an upward normal
  // and drawing both faces.
  for (let i = 0; i < path.length - 1; i++) {
    const p0 = path[i], p1 = path[i + 1]
    const t0 = tangents[i], t1 = tangents[i + 1]

    quads.push({
      l0: { x: p0.x + t0.z * half, z: p0.z - t0.x * half },
      r0: { x: p0.x - t0.z * half, z: p0.z + t0.x * half },
      l1: { x: p1.x + t1.z * half, z: p1.z - t1.x * half },
      r1: { x: p1.x - t1.z * half, z: p1.z + t1.x * half }
    })
  }

  return quads
}

/**
 * How tightly a path bends at each point, as a turning radius in world
 * units. Infinity where it runs straight.
 *
 * Not used for building the road any more - roads keep their full width
 * and simply overlap through tight bends - but it's how the layout code
 * decides whether a curve needs easing out first.
 */
export function turningRadii(points) {
  const radii = new Array(points.length).fill(Infinity)

  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1], b = points[i], c = points[i + 1]
    const abx = b.x - a.x, abz = b.z - a.z
    const bcx = c.x - b.x, bcz = c.z - b.z
    const abLen = Math.hypot(abx, abz)
    const bcLen = Math.hypot(bcx, bcz)
    if (abLen < 1e-6 || bcLen < 1e-6) continue

    const dot = (abx * bcx + abz * bcz) / (abLen * bcLen)
    const turn = Math.acos(Math.max(-1, Math.min(1, dot)))
    if (turn < 1e-6) continue

    radii[i] = ((abLen + bcLen) / 2) / turn
  }

  return radii
}

/** Y component of the cross product - positive means the face points up. */
function upward(a, b, c) {
  return (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z)
}

/**
 * Direction of travel at each point along a path, as unit vectors.
 * Used to orient the road surface and its markings.
 */
export function pathTangents(points) {
  const out = []

  for (let i = 0; i < points.length; i++) {
    const prev = points[Math.max(i - 1, 0)]
    const next = points[Math.min(i + 1, points.length - 1)]
    let dx = next.x - prev.x
    let dz = next.z - prev.z
    const len = Math.hypot(dx, dz)

    if (len < 1e-6) {
      // Degenerate - reuse the previous tangent rather than emit a zero
      out.push(out.length ? { ...out[out.length - 1] } : { x: 0, z: 1 })
    } else {
      out.push({ x: dx / len, z: dz / len })
    }
  }

  return out
}
