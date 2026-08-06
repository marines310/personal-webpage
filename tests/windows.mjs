/**
 * Finding the windows in the building models.
 *
 * This is a test about an ASSET, and it exists because the first attempt at
 * lighting the windows never touched the asset at all. It hung a grid of panes
 * on the model's bounding box, in world units, inside a group the loader had
 * already scaled up - so the glass floated in the sky above the rooftops, at
 * roughly ten times the size of a window.
 *
 * Two lessons, both already written down elsewhere in this project and both
 * ignored here:
 *
 *   - **Ask the geometry where the thing ends up.** The bounding box is a
 *     proxy for the wall; the wall is a proxy for the window. The windows are
 *     in the model.
 *   - **Measure the asset before writing code around it.** Five minutes with
 *     the .glb would have shown that every building has 4 to 8 window quads
 *     and that they point at one dark swatch of the shared atlas.
 *
 * So the checks below read the real .glb files and the real texture. If
 * someone swaps the models for better ones, this fails loudly rather than
 * lighting nothing and looking fine.
 */
import {
  findWindowFaces, windowGeometry, windowVents, luminance, WINDOW_MAX_LUMINANCE
} from '../src/world/windows.js'
import { readPNG, samplerFor } from './pngread.mjs'
import { primitives } from './glbread.mjs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

// ---------------------------------------------------------------------------
console.log('1. The detector, on a shape whose answer is known\n')

// A single wall: two triangles of wall, two of glass, sharing no edges
// between the pairs.
const wall = {
  position: [
    0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 2, 0,       // 0-3 wall quad
    3, 0, 0, 5, 0, 0, 5, 2, 0, 3, 2, 0,       // 4-7 window quad
    0, 3, 0, 2, 3, 0, 2, 3, 2, 0, 3, 2        // 8-11 a flat panel on top
  ],
  uv: [
    0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9, 0.9,
    0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
    0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1
  ],
  index: [
    0, 1, 2, 0, 2, 3,
    4, 5, 6, 4, 6, 7,
    8, 9, 10, 8, 10, 11
  ],
  // Bright at (0.9, 0.9), dark at (0.1, 0.1)
  sample: (u) => (u > 0.5 ? [200, 200, 200] : [60, 60, 66])
}

const found = findWindowFaces(wall)

chk('the bright quad is not a window and the dark one is',
    found.length === 1, `${found.length} windows`)
chk('and it is the whole quad, both triangles',
    found[0]?.triangles.length === 2, `${found[0]?.triangles.length}`)
chk('the flat panel is left alone, however dark it is',
    found.every(w => Math.abs(w.normal[1]) < 0.5))

// Two triangles of one pane must be lit together, which is the entire reason
// they are grouped rather than returned loose.
chk('a pane is one window, not two half-panes',
    found.reduce((n, w) => n + w.triangles.length, 0) === 2)

chk('luminance is the usual weighting', Math.abs(luminance(255, 255, 255) - 1) < 1e-9)

// ---------------------------------------------------------------------------
console.log('\n2. The real models and the real atlas\n')

const atlas = readPNG(join(ROOT, 'public/models/Textures/colormap.png'))
const sample = samplerFor(atlas)

console.log(`   atlas ${atlas.width}x${atlas.height}, ${atlas.channels} channels`)

// The mistake that made every triangle read as black: glTF puts UV (0,0) at
// the TOP left, and this atlas has its top half empty. A flipped sampler
// reports a model with no windows, which is indistinguishable from a model
// that genuinely has none.
const flipped = (u, v) => sample(u, 1 - v)

const results = []

for (const name of ['building_a', 'building_b', 'building_c']) {
  const parts = primitives(join(ROOT, `public/models/${name}.glb`))
  chk(`${name} has UVs and indices to work from`,
      parts.every(p => p.uv && p.index && p.position))

  let windows = []
  let triangles = 0
  let box = { y: [Infinity, -Infinity] }

  for (const part of parts) {
    triangles += part.index.length / 3
    for (let i = 1; i < part.position.length; i += 3) {
      box.y[0] = Math.min(box.y[0], part.position[i])
      box.y[1] = Math.max(box.y[1], part.position[i])
    }
    windows = windows.concat(findWindowFaces({ ...part, sample }))
  }

  const flippedCount = parts.reduce((n, part) =>
    n + findWindowFaces({ ...part, sample: flipped }).length, 0)

  results.push({ name, windows, triangles, box, flippedCount })
  console.log(`   ${name}: ${windows.length} windows in ${triangles} triangles` +
              ` (${flippedCount} with the V flipped)`)
}

chk('every building has windows to light',
    results.every(r => r.windows.length >= 4),
    results.map(r => `${r.name}:${r.windows.length}`).join(' '))

chk('and not so many that the walls are being lit too',
    results.every(r => r.windows.length <= r.triangles / 10),
    results.map(r => `${r.name}:${r.windows.length}/${r.triangles}`).join(' '))

chk('a window is a pane, not a stray triangle',
    results.every(r => r.windows.every(w => w.triangles.length >= 2)),
    results.flatMap(r => r.windows.filter(w => w.triangles.length < 2)
                                  .map(() => r.name)).join(' '))

chk('every window is on a wall, not a roof',
    results.every(r => r.windows.every(w => Math.abs(w.normal[1]) < 0.5)))

// The check that would have caught the wasted afternoon. With V flipped the
// sampler reads the empty top half of the atlas, every triangle comes back
// black, and every wall in the model is reported as glass - so the wrong
// convention is not a near miss, it is an answer nobody could take seriously.
// Which is the point: it can be told apart from the right one by looking.
chk('the V convention matters, and the wrong one is obviously wrong',
    results.every(r => r.flippedCount > r.windows.length * 5),
    results.map(r => `${r.name}: ${r.windows.length} vs ${r.flippedCount}`).join(', '))

// The wall swatches have to stay clear of the threshold, or a repaint of the
// atlas starts lighting brickwork.
let darkestWall = 1
for (const name of ['building_a', 'building_b', 'building_c']) {
  for (const part of primitives(join(ROOT, `public/models/${name}.glb`))) {
    for (let t = 0; t < part.index.length; t += 3) {
      const a = part.index[t], b = part.index[t + 1], c = part.index[t + 2]
      const u = (part.uv[a * 2] + part.uv[b * 2] + part.uv[c * 2]) / 3
      const v = (part.uv[a * 2 + 1] + part.uv[b * 2 + 1] + part.uv[c * 2 + 1]) / 3
      const l = luminance(...sample(u, v))
      if (l >= WINDOW_MAX_LUMINANCE) darkestWall = Math.min(darkestWall, l)
    }
  }
}
console.log(`   threshold ${WINDOW_MAX_LUMINANCE}, darkest wall ${darkestWall.toFixed(2)}`)
chk('the darkest wall is comfortably brighter than the threshold',
    darkestWall > WINDOW_MAX_LUMINANCE + 0.05, `${darkestWall.toFixed(2)}`)

// ---------------------------------------------------------------------------
console.log('\n3. The glass sits on the model, at the model\'s own scale\n')

const model = primitives(join(ROOT, 'public/models/building_b.glb'))[0]
const modelWindows = findWindowFaces({ ...model, sample })
const push = 0.004
const glass = windowGeometry(modelWindows, model.position, push)

chk('one vertex per corner of every triangle',
    glass.positions.length ===
      modelWindows.reduce((n, w) => n + w.triangles.length, 0) * 9)

// Every pane must be within the model, not floating beside it - which is
// exactly what the bounding-box version got wrong.
let outside = 0
const bounds = [[Infinity, -Infinity], [Infinity, -Infinity], [Infinity, -Infinity]]
for (let i = 0; i < model.position.length; i += 3) {
  for (let axis = 0; axis < 3; axis++) {
    bounds[axis][0] = Math.min(bounds[axis][0], model.position[i + axis])
    bounds[axis][1] = Math.max(bounds[axis][1], model.position[i + axis])
  }
}
for (let i = 0; i < glass.positions.length; i += 3) {
  for (let axis = 0; axis < 3; axis++) {
    const v = glass.positions[i + axis]
    if (v < bounds[axis][0] - push * 1.5 || v > bounds[axis][1] + push * 1.5) outside++
  }
}
chk('no pane lands outside the building it belongs to', outside === 0, `${outside}`)

// And it must be proud of the wall, or it fights the model for the same depth
let vertex = 0
let moved = 0
let total = 0
for (const window of modelWindows) {
  for (const triangle of window.triangles) {
    for (const corner of triangle) {
      const before = [
        model.position[corner * 3],
        model.position[corner * 3 + 1],
        model.position[corner * 3 + 2]
      ]
      const after = glass.positions.slice(vertex, vertex + 3)
      vertex += 3
      total++

      const step = Math.hypot(
        after[0] - before[0], after[1] - before[1], after[2] - before[2])
      if (Math.abs(step - push) < 1e-6) moved++
    }
  }
}
chk('and every pane is pushed clear of the wall by exactly the offset',
    moved === total, `${moved} of ${total}`)

// The offset is in MODEL units. These models are a unit across; a world-unit
// offset would be a hundred times too big, which is the same class of mistake
// as the panes themselves.
chk('the models are around one unit, so a world-unit offset would be absurd',
    bounds[0][1] - bounds[0][0] < 2, `${(bounds[0][1] - bounds[0][0]).toFixed(2)}`)

// ---------------------------------------------------------------------------
console.log('\n4. The same windows, as holes something can come out of\n')

// The fire uses these. A flame is one object per opening, so it needs a
// centre, a facing and a size - not the triangles the glass is made from.
//
// The trap this section exists for is the same one the whole file exists for:
// these numbers are in MODEL units, where a whole building is about one unit
// across. Anything that reads them as world units puts a flame the size of an
// island in a window the size of a postage stamp.

const oneWindow = findWindowFaces(wall)
const oneVent = windowVents(oneWindow, wall.position)

chk('one vent per window, not per triangle', oneVent.length === 1,
    `${oneVent.length}`)

// The known quad runs x 3..5, y 0..2, at z 0 - so its centre is (4, 1, 0)
// and it is 2 by 2. Averaging the six triangle corners instead of the four
// distinct ones would drag the centre towards the shared edge.
chk('the centre is the middle of the opening',
    Math.abs(oneVent[0].center[0] - 4) < 1e-9 &&
    Math.abs(oneVent[0].center[1] - 1) < 1e-9 &&
    Math.abs(oneVent[0].center[2]) < 1e-9,
    oneVent[0].center.join(','))

chk('and the size is the size of the opening',
    Math.abs(oneVent[0].width - 2) < 1e-9 &&
    Math.abs(oneVent[0].height - 2) < 1e-9,
    `${oneVent[0].width} x ${oneVent[0].height}`)

chk('it faces the way its window faces',
    Math.abs(Math.abs(oneVent[0].normal[2]) - 1) < 1e-9,
    oneVent[0].normal.join(','))

// Up the opening, in its plane. Needed because a flame is tilted from
// vertical towards the normal, and a bad up-vector leans it sideways.
chk('and up the opening is up',
    Math.abs(oneVent[0].up[1] - 1) < 1e-6, oneVent[0].up.join(','))

chk('the up vector is square to the normal',
    Math.abs(oneVent[0].up[0] * oneVent[0].normal[0] +
             oneVent[0].up[1] * oneVent[0].normal[1] +
             oneVent[0].up[2] * oneVent[0].normal[2]) < 1e-9)

// And on the real models
const vents = windowVents(modelWindows, model.position)

chk('every window of a real building gives a vent',
    vents.length === modelWindows.length,
    `${vents.length} of ${modelWindows.length}`)

let ventsOutside = 0
for (const vent of vents) {
  for (let axis = 0; axis < 3; axis++) {
    if (vent.center[axis] < bounds[axis][0] - 1e-6 ||
        vent.center[axis] > bounds[axis][1] + 1e-6) ventsOutside++
  }
}
chk('and every one of them is inside the building', ventsOutside === 0,
    `${ventsOutside}`)

chk('none is a zero-sized opening',
    vents.every(v => v.width > 1e-6 && v.height > 1e-6))

// The units check, stated as loudly as it is for windowGeometry: a real
// window on these models is a small fraction of a unit. If one ever measures
// in whole units the model has been rebuilt at world scale and everything
// downstream of here is wrong by a factor of a hundred.
const biggest = Math.max(...vents.map(v => Math.max(v.width, v.height)))
console.log(`   largest opening ${biggest.toFixed(3)} model units`)
chk('the openings are in model units, not world units', biggest < 1,
    `${biggest.toFixed(3)}`)

chk('every vent faces roughly horizontally, like the wall it is in',
    vents.every(v => Math.abs(v.normal[1]) < 0.5))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
