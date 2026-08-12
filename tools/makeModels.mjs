/**
 * The two models this world has code for and no files for.
 *
 *   node tools/makeModels.mjs
 *
 * `rock.glb` and `streetlight.glb` are written into public/models/. Both are
 * referenced by `World.js` already - `addRock()` and `addStreetlight()` each
 * open with "if the model is there, use it" and have been falling through to
 * a built-in shape since the day they were written, because nobody had the
 * files. This makes the files rather than downloading them.
 *
 * WHY THESE TWO AND NOT A CAR
 * ---------------------------
 * A rock is a lump and a lamp post is a tube with a box on it. Geometry that
 * simple is honestly better authored than sourced, because it can be made to
 * fit the exact numbers the code already expects. A car is a car - it has
 * proportions people know by heart, and it is on screen the whole session.
 * Download that one.
 *
 * THEY TAKE THEIR COLOURS FROM THE ATLAS, NOT FROM MY TASTE
 * ---------------------------------------------------------
 * Every model in public/models/ is a Kenney asset that samples one shared
 * 512x512 palette image, Textures/colormap.png - the mesh carries UVs and the
 * colour lives in the picture. So these do too, pointing at the same file
 * with the same relative URI. That is what makes them match: they are not
 * "painted to look similar", they are literally the same paint.
 *
 * The atlas is a 16x16 grid of 32px cells. Even columns are flat swatches;
 * odd columns are vertical gradients of the same hue, which is how one small
 * image covers a whole kit's worth of shading. `swatch()` below picks the
 * centre of a cell, and every colour used is asserted against the real file
 * at the bottom of this script - if a swatch moves, the run fails rather than
 * quietly producing grey rocks.
 *
 * FLAT SHADING IS IN THE GEOMETRY
 * -------------------------------
 * Each triangle gets its own three vertices and one face normal, so the
 * faceting is a property of the mesh rather than a material flag. That
 * matches the rest of the world (`flatShading: true` is on nearly every
 * built-in material) and it survives being cloned, scaled and re-materialled.
 */
import { writeFileSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { readPNG, samplerFor } from '../tests/pngread.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const MODELS = join(HERE, '..', 'public', 'models')

// ---------------------------------------------------------------------------
// The atlas
// ---------------------------------------------------------------------------

/** The centre of cell (col, row) in the 16x16 grid, as a UV pair. */
const swatch = (col, row) => [(col + 0.5) / 16, (row + 0.5) / 16]

// Named for what they are FOR, so the geometry below reads as intent.
const UV = {
  stoneLight: swatch(3, 12),   // #80859b - the blue-grey the buildings roof with
  stoneMid:   swatch(3, 14),   // #676d84
  stoneDark:  swatch(3, 15),   // #5b6179
  poleDark:   swatch(0, 13),   // #38383d - flat charcoal, close to the
                               //           fallback's own 0x3f4650
  metalMid:   swatch(4, 13),   // #4f5260
  lampWarm:   swatch(0, 9)     // #fde4c7 - warm cream, for the lens
}

// ---------------------------------------------------------------------------
// A very small mesh builder
// ---------------------------------------------------------------------------

class Mesh {
  /**
   * `material` is an index, and the only reason there is more than one is the
   * lamp lens. Everything else in both files shares material 0, because the
   * atlas is the material and splitting it would add draw calls to buy
   * nothing. The lens needs its own so World.js can make IT emissive after
   * dark without the pole and the arm lighting up with it - glTF shares one
   * material object across every mesh that references it, so "clone it at use
   * time" would be the alternative and this is the honest place to say it.
   */
  constructor(name, material = 0) {
    this.name = name
    this.material = material
    this.position = []
    this.normal = []
    this.uv = []
    this.index = []
  }

  /** One triangle, with its own vertices and its own normal. */
  tri(a, b, c, uv) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2]
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]
    let nx = uy * vz - uz * vy
    let ny = uz * vx - ux * vz
    let nz = ux * vy - uy * vx
    const len = Math.hypot(nx, ny, nz) || 1
    nx /= len; ny /= len; nz /= len

    const base = this.position.length / 3
    for (const p of [a, b, c]) {
      this.position.push(p[0], p[1], p[2])
      this.normal.push(nx, ny, nz)
      this.uv.push(uv[0], uv[1])
    }
    this.index.push(base, base + 1, base + 2)
  }

  quad(a, b, c, d, uv) {
    this.tri(a, b, c, uv)
    this.tri(a, c, d, uv)
  }

  /** An axis-aligned box, given its centre and size. */
  box(cx, cy, cz, sx, sy, sz, uv) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2
    const y0 = cy - sy / 2, y1 = cy + sy / 2
    const z0 = cz - sz / 2, z1 = cz + sz / 2
    const p = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
    ]
    this.quad(p[4], p[5], p[6], p[7], uv)   // +Z
    this.quad(p[1], p[0], p[3], p[2], uv)   // -Z
    this.quad(p[5], p[1], p[2], p[6], uv)   // +X
    this.quad(p[0], p[4], p[7], p[3], uv)   // -X
    this.quad(p[3], p[2], p[6], p[7], uv)   // +Y
    this.quad(p[0], p[1], p[5], p[4], uv)   // -Y
  }

  /** A tapered prism standing on y0, `sides` around. */
  prism(cx, cz, y0, y1, rBottom, rTop, sides, uv, capUv = uv) {
    const ring = (r, y) => Array.from({ length: sides }, (_, i) => {
      const a = (i / sides) * Math.PI * 2
      return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]
    })
    const low = ring(rBottom, y0)
    const high = ring(rTop, y1)
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides
      this.quad(low[i], low[j], high[j], high[i], uv)
    }
    // Caps, fanned from the centre.
    const topMid = [cx, y1, cz]
    const botMid = [cx, y0, cz]
    for (let i = 0; i < sides; i++) {
      const j = (i + 1) % sides
      this.tri(high[i], high[j], topMid, capUv)
      this.tri(low[j], low[i], botMid, capUv)
    }
  }

  bounds() {
    const min = [Infinity, Infinity, Infinity]
    const max = [-Infinity, -Infinity, -Infinity]
    for (let i = 0; i < this.position.length; i += 3) {
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], this.position[i + k])
        max[k] = Math.max(max[k], this.position[i + k])
      }
    }
    return { min, max }
  }

  /** Drop the mesh so its lowest point sits exactly on y=0. */
  standOnGround() {
    const { min } = this.bounds()
    for (let i = 1; i < this.position.length; i += 3) this.position[i] -= min[1]
    return this
  }
}

// ---------------------------------------------------------------------------
// glTF binary
// ---------------------------------------------------------------------------

const pad4 = (n) => (n + 3) & ~3

/**
 * Write one .glb from a list of meshes.
 *
 * One material for all of them - the atlas IS the material, and splitting it
 * per colour would add draw calls to buy nothing. `doubleSided` matches what
 * the Kenney files do, and matters here because a lamp arm seen from beneath
 * is a thin box people will drive under.
 */
function writeGLB(path, meshes, sceneName) {
  const bin = []
  const bufferViews = []
  const accessors = []
  let offset = 0

  const push = (typedArray, componentType, type, count, target, extra = {}) => {
    const bytes = Buffer.from(typedArray.buffer, typedArray.byteOffset, typedArray.byteLength)
    const padded = pad4(bytes.length)
    const block = Buffer.alloc(padded)
    bytes.copy(block)
    bin.push(block)
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target })
    offset += padded
    accessors.push({ bufferView: bufferViews.length - 1, componentType, count, type, ...extra })
    return accessors.length - 1
  }

  const gltfMeshes = []
  const nodes = []

  for (const m of meshes) {
    const { min, max } = m.bounds()
    const pos = push(new Float32Array(m.position), 5126, 'VEC3',
                     m.position.length / 3, 34962, { min, max })
    const nor = push(new Float32Array(m.normal), 5126, 'VEC3', m.normal.length / 3, 34962)
    const tex = push(new Float32Array(m.uv), 5126, 'VEC2', m.uv.length / 2, 34962)
    const idx = push(new Uint16Array(m.index), 5123, 'SCALAR', m.index.length, 34963)

    gltfMeshes.push({
      name: m.name,
      primitives: [{
        attributes: { POSITION: pos, NORMAL: nor, TEXCOORD_0: tex },
        indices: idx,
        material: m.material
      }]
    })
    nodes.push({ mesh: gltfMeshes.length - 1, name: m.name })
  }

  const root = nodes.length
  nodes.push({ name: sceneName, children: nodes.map((_, i) => i) })

  const json = {
    asset: { version: '2.0', generator: 'tools/makeModels.mjs' },
    scene: 0,
    scenes: [{ name: sceneName, nodes: [root] }],
    nodes,
    meshes: gltfMeshes,
    materials: [
      {
        name: 'colormap',
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.0,
          roughnessFactor: 0.9
        }
      },
      // Same texture, own material. See Mesh's constructor comment: this
      // exists so a lamp lens can be lit at night on its own.
      {
        name: 'colormap-lens',
        doubleSided: true,
        pbrMetallicRoughness: {
          baseColorTexture: { index: 0 },
          metallicFactor: 0.0,
          roughnessFactor: 0.55
        }
      }
    ],
    textures: [{ sampler: 0, source: 0 }],
    // The SAME relative URI every other model in this folder uses, so they
    // share one image and one download.
    images: [{ uri: 'Textures/colormap.png', name: 'colormap' }],
    samplers: [{ minFilter: 9987 }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }]
  }

  const binBuf = Buffer.concat(bin)
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8')
  const jsonPad = Buffer.alloc(pad4(jsonBuf.length) - jsonBuf.length, 0x20)  // spaces
  const jsonChunk = Buffer.concat([jsonBuf, jsonPad])

  const header = Buffer.alloc(12)
  header.write('glTF', 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binBuf.length, 8)

  const jsonHead = Buffer.alloc(8)
  jsonHead.writeUInt32LE(jsonChunk.length, 0)
  jsonHead.writeUInt32LE(0x4E4F534A, 4)

  const binHead = Buffer.alloc(8)
  binHead.writeUInt32LE(binBuf.length, 0)
  binHead.writeUInt32LE(0x004E4942, 4)

  writeFileSync(path, Buffer.concat([header, jsonHead, jsonChunk, binHead, binBuf]))
  return 12 + 8 + jsonChunk.length + 8 + binBuf.length
}

// ---------------------------------------------------------------------------
// The rock
// ---------------------------------------------------------------------------

/**
 * A boulder, built as a jittered icosahedron and then squashed.
 *
 * Squashed on purpose: a sphere reads as a ball, and a rock sitting in grass
 * is wider than it is tall. `addRock()` fits it with `fitLength: 2` and then
 * scales 0.7-1.4, and gives it a cube collider of that size - so the shape
 * wants to fill roughly a 2 x 1.2 x 1.8 box rather than a 2-cube.
 *
 * The jitter is a fixed table rather than Math.random(): a model is a file,
 * and a file that comes out different every time it is generated cannot be
 * diffed, cannot be tested, and turns "regenerate the models" into a change.
 */
function rock() {
  const t = (1 + Math.sqrt(5)) / 2
  const raw = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ]
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ]

  // Hand-picked so no two neighbouring faces share a plane - a boulder with
  // flat spots reads as a dice.
  const jitter = [
    1.00, 0.86, 1.12, 0.93, 1.05, 0.81, 1.16, 0.90,
    1.02, 0.95, 1.09, 0.84
  ]

  // Named `body`, not `rock`. GLTFLoader de-duplicates colliding names, so a
  // mesh with the same name as its scene arrives as `rock_2` - which is what
  // the Kenney files do too, and it cost half an hour of looking for rocks
  // that were standing there the whole time.
  const m = new Mesh('body')
  const v = raw.map((p, i) => {
    const len = Math.hypot(p[0], p[1], p[2])
    const r = jitter[i]
    return [
      (p[0] / len) * r,
      (p[1] / len) * r * 0.62,      // squashed: a rock, not a ball
      (p[2] / len) * r * 0.9
    ]
  })

  // Shade by height, using the gradient column: the top of a boulder catches
  // the light and the underside does not. Three bands rather than a smooth
  // ramp, because the whole kit is flat-shaded and a gradient would be the
  // only smooth thing in the world.
  const shadeFor = (a, b, c) => {
    const y = (a[1] + b[1] + c[1]) / 3
    return y > 0.18 ? UV.stoneLight : y > -0.12 ? UV.stoneMid : UV.stoneDark
  }

  for (const [i, j, k] of faces) {
    m.tri(v[i], v[j], v[k], shadeFor(v[i], v[j], v[k]))
  }
  return m.standOnGround()
}

// ---------------------------------------------------------------------------
// The street lamp
// ---------------------------------------------------------------------------

/**
 * Pole, arm, lamp head - matching the built-in shape it replaces, because
 * that shape is already placed correctly by everything that calls it.
 *
 * TWO THINGS ARE LOAD-BEARING AND NEITHER IS COSMETIC:
 *
 * 1. THE ARM POINTS ALONG +X. `addStreetlight()` computes a heading and turns
 *    the whole group so that +X faces the road it is lighting. A model built
 *    facing any other way would put every lamp in the world over the verge -
 *    and the comment in World.js says this happened once already, when the
 *    heading was `rand() * PI * 2`.
 *
 * 2. THE LAMP HEAD IS ITS OWN NODE, NAMED `lamp`. World.js has to find it to
 *    make it glow after dark, the same way Vehicle.js finds wheels by name.
 *    Without a separate node the whole post would light up.
 *
 * The dimensions are the fallback's, to the centimetre: pole 4.6 tall,
 * arm from x=0 to x=0.85 at y=4.55, head 0.6 x 0.18 x 0.32 centred at
 * x=0.75, y=4.44.
 */
function streetlight() {
  const pole = new Mesh('pole')
  pole.prism(0, 0, 0, 4.6, 0.13, 0.09, 7, UV.poleDark)
  // A wider foot, so it meets the pavement like something bolted down.
  pole.prism(0, 0, 0, 0.16, 0.2, 0.16, 7, UV.metalMid)

  const arm = new Mesh('arm')
  arm.box(0.425, 4.55, 0, 0.85, 0.1, 0.1, UV.poleDark)

  const head = new Mesh('head')
  head.box(0.75, 4.47, 0, 0.6, 0.12, 0.32, UV.metalMid)

  // The lens, on material 1, facing DOWN - which is where the light goes.
  // Named `lamp` because that is the name World.js looks for.
  const lamp = new Mesh('lamp', 1)
  lamp.box(0.75, 4.38, 0, 0.52, 0.06, 0.26, UV.lampWarm)

  return [pole, arm, head, lamp]
}

// ---------------------------------------------------------------------------
// Make them, then check them against the real atlas
// ---------------------------------------------------------------------------

mkdirSync(MODELS, { recursive: true })

const rockMesh = rock()
const rockBytes = writeGLB(join(MODELS, 'rock.glb'), [rockMesh], 'rock')
const lampMeshes = streetlight()
const lampBytes = writeGLB(join(MODELS, 'streetlight.glb'), lampMeshes, 'streetlight')

const png = readPNG(join(MODELS, 'Textures', 'colormap.png'))
const sample = samplerFor(png)
const hex = ([u, v]) => '#' + sample(u, v).map(n => n.toString(16).padStart(2, '0')).join('')

console.log(`rock.glb         ${String(rockBytes).padStart(6)} bytes  ` +
            `${rockMesh.index.length / 3} triangles`)
const rb = rockMesh.bounds()
console.log(`                 ${rb.max.map((v, i) => (v - rb.min[i]).toFixed(2)).join(' x ')}`)

const tris = lampMeshes.reduce((a, m) => a + m.index.length / 3, 0)
console.log(`streetlight.glb  ${String(lampBytes).padStart(6)} bytes  ${tris} triangles  ` +
            `nodes: ${lampMeshes.map(m => m.name).join(', ')}`)

console.log('\nswatches, read back out of the atlas:')
let bad = 0
const EXPECT = {
  stoneLight: '#80859b', stoneMid: '#676d84', stoneDark: '#5b6179',
  poleDark: '#38383d', metalMid: '#4f5260', lampWarm: '#fde4c7'
}
for (const [name, uv] of Object.entries(UV)) {
  const got = hex(uv)
  const ok = got === EXPECT[name]
  if (!ok) bad++
  console.log(`  ${name.padEnd(11)} uv ${uv.map(n => n.toFixed(5)).join(', ')}  ` +
              `${got} ${ok ? '' : `EXPECTED ${EXPECT[name]}`}`)
}
if (bad) {
  console.error(`\n${bad} swatch(es) are not where this script thinks they are.`)
  process.exit(1)
}
console.log('\nAll swatches match the atlas.')
