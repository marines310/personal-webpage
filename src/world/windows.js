/**
 * Finding the windows in a building model.
 *
 * The buildings are .glb files with one material, "colormap", and a single
 * 512x512 texture atlas. There is no glass material to pick out by name, and
 * the first attempt at lighting them up guessed instead: a grid of panes
 * hung on the model's bounding box. That put glass in the air beside the
 * buildings and nowhere near a window.
 *
 * The windows are in the model, though. Each one is a quad whose UVs point at
 * the dark grey swatch in the atlas - around (60, 60, 66), a fifth of the
 * brightness of any wall. So: sample the texture where each triangle sits,
 * keep the dark ones, and light exactly those.
 *
 * Nothing here knows about Three.js. It takes plain arrays and a function
 * that reads the texture, and gives back triangles - so it can be run, and
 * checked against the real models, outside a browser.
 */

/**
 * Anything darker than this is glass.
 *
 * The window swatch measures 0.23 to 0.25; the darkest wall on any of the
 * three buildings is 0.38. Halfway between would be 0.31; 0.30 leaves the
 * margin on the side where a mistake is invisible - a wall wrongly lit glows
 * in the dark, a window wrongly skipped just stays off.
 */
export const WINDOW_MAX_LUMINANCE = 0.3

/**
 * How far from vertical a face may be and still be a window.
 *
 * Rooflights would be lit from below and read as a hole in the roof, and the
 * dark swatch is used for other flat details too.
 */
export const WINDOW_MAX_TILT = 0.5

/** Rec. 601 luminance, 0 to 1, from three 0-255 channels. */
export function luminance(r, g, b) {
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255
}

/**
 * Every window in one mesh, as groups of triangles.
 *
 * `sample(u, v)` returns `[r, g, b]` at that point of the texture, 0-255.
 * glTF puts UV (0,0) at the TOP left of the image, so a sampler that flips V
 * reads the empty half of this atlas and reports every triangle as black -
 * which is exactly what happened first time round, and looks identical to
 * "the model has no windows".
 */
export function findWindowFaces({
  position, uv, index, sample,
  maxLuminance = WINDOW_MAX_LUMINANCE,
  maxTilt = WINDOW_MAX_TILT
}) {
  const dark = []

  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2]

    const u = (uv[a * 2] + uv[b * 2] + uv[c * 2]) / 3
    const v = (uv[a * 2 + 1] + uv[b * 2 + 1] + uv[c * 2 + 1]) / 3

    const rgb = sample(u, v)
    if (!rgb) continue
    if (luminance(rgb[0], rgb[1], rgb[2]) >= maxLuminance) continue

    const normal = faceNormal(position, a, b, c)
    if (!normal) continue
    if (Math.abs(normal[1]) > maxTilt) continue      // a roof, not a window

    dark.push({ tri: [a, b, c], normal })
  }

  return groupIntoWindows(dark)
}

/**
 * Triangles that share an edge and face the same way are one window.
 *
 * Needed because a window is two triangles and they have to be lit or dark
 * together - light them independently and half of every pane comes on.
 */
function groupIntoWindows(faces) {
  const parent = faces.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] }
    return i
  }
  const union = (i, j) => { parent[find(i)] = find(j) }

  // Which faces touch each edge
  const edges = new Map()
  faces.forEach((face, i) => {
    const [a, b, c] = face.tri
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const key = p < q ? `${p}:${q}` : `${q}:${p}`
      const found = edges.get(key)
      if (found === undefined) edges.set(key, i)
      else if (sameFacing(faces[found].normal, face.normal)) union(found, i)
    }
  })

  const groups = new Map()
  faces.forEach((face, i) => {
    const root = find(i)
    if (!groups.has(root)) groups.set(root, { normal: face.normal, triangles: [] })
    groups.get(root).triangles.push(face.tri)
  })

  return [...groups.values()]
}

function sameFacing(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] > 0.99
}

/** Unit normal of a triangle, or null if it has no area. */
export function faceNormal(position, a, b, c) {
  const ax = position[a * 3], ay = position[a * 3 + 1], az = position[a * 3 + 2]
  const e1 = [position[b * 3] - ax, position[b * 3 + 1] - ay, position[b * 3 + 2] - az]
  const e2 = [position[c * 3] - ax, position[c * 3 + 1] - ay, position[c * 3 + 2] - az]

  const n = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0]
  ]

  const length = Math.hypot(n[0], n[1], n[2])
  if (length < 1e-9) return null

  return [n[0] / length, n[1] / length, n[2] / length]
}

/**
 * A flat sheet of glass laid over the windows, in the model's own
 * coordinates.
 *
 * Pushed out along each face's normal by `push`, so it sits just proud of the
 * model instead of fighting it for the same depth. `push` is in MODEL units -
 * the building models are one unit square before the world scales them up, so
 * a value in world units here would be hundreds of times too big. That is the
 * whole reason the first version's glass was floating over the rooftops.
 */
export function windowGeometry(windows, position, push = 0.004) {
  const positions = []
  const normals = []

  for (const window of windows) {
    const n = window.normal

    for (const [a, b, c] of window.triangles) {
      for (const vertex of [a, b, c]) {
        positions.push(
          position[vertex * 3] + n[0] * push,
          position[vertex * 3 + 1] + n[1] * push,
          position[vertex * 3 + 2] + n[2] * push
        )
        normals.push(n[0], n[1], n[2])
      }
    }
  }

  return { positions, normals }
}

/**
 * Each window as a place something can come OUT of.
 *
 * `findWindowFaces` gives triangles, which is what a sheet of glass needs.
 * A fire needs the opposite: one point per opening, the way it faces, and how
 * big the hole is - so a flame can be put in the middle of a window, sized to
 * it, leaning out into the street.
 *
 * Everything is in the model's own coordinates, like `windowGeometry`, and for
 * the same reason: the building models are about one unit across before the
 * world scales them up, so anything worked out here in world units is out by
 * the scale factor. Convert at the point of use, with the mesh's own matrix.
 *
 * `width` is measured across the opening (horizontally, square to the normal)
 * and `height` up it. Both come from the corners rather than from the face
 * count, because a window is two triangles whichever way round it is split.
 */
export function windowVents(windows, position) {
  const vents = []

  for (const window of windows) {
    const n = window.normal

    // The corners, each counted once. A shared edge means four of the six
    // triangle corners are duplicates, and averaging with them drags the
    // centre towards the split rather than leaving it in the middle.
    const corners = new Set()
    for (const triangle of window.triangles) {
      for (const vertex of triangle) corners.add(vertex)
    }
    if (corners.size < 3) continue

    let cx = 0, cy = 0, cz = 0
    for (const vertex of corners) {
      cx += position[vertex * 3]
      cy += position[vertex * 3 + 1]
      cz += position[vertex * 3 + 2]
    }
    cx /= corners.size
    cy /= corners.size
    cz /= corners.size

    // Across the opening: horizontal, square to the way it faces. The windows
    // are near-vertical by construction (findWindowFaces rejects anything
    // tilted more than WINDOW_MAX_TILT), so up-cross-normal is well defined.
    const tangent = [n[2], 0, -n[0]]
    const tangentLength = Math.hypot(tangent[0], tangent[2])
    if (tangentLength < 1e-9) continue
    tangent[0] /= tangentLength
    tangent[2] /= tangentLength

    // Up the opening, staying in its plane rather than assuming world up:
    // a wall leaning a few degrees still has a square window in it.
    const up = [
      n[1] * tangent[2] - n[2] * tangent[1],
      n[2] * tangent[0] - n[0] * tangent[2],
      n[0] * tangent[1] - n[1] * tangent[0]
    ]

    let minU = Infinity, maxU = -Infinity
    let minV = Infinity, maxV = -Infinity

    for (const vertex of corners) {
      const dx = position[vertex * 3] - cx
      const dy = position[vertex * 3 + 1] - cy
      const dz = position[vertex * 3 + 2] - cz

      const u = dx * tangent[0] + dy * tangent[1] + dz * tangent[2]
      const v = dx * up[0] + dy * up[1] + dz * up[2]

      if (u < minU) minU = u
      if (u > maxU) maxU = u
      if (v < minV) minV = v
      if (v > maxV) maxV = v
    }

    vents.push({
      center: [cx, cy, cz],
      normal: [n[0], n[1], n[2]],
      up,
      width: maxU - minU,
      height: maxV - minV
    })
  }

  return vents
}
