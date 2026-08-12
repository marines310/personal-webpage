/**
 * The two models this project MAKES rather than downloads.
 *
 * `tools/makeModels.mjs` writes public/models/rock.glb and streetlight.glb.
 * Everything below reads those files back off disk - not the generator's
 * variables, the actual bytes - because this project has already paid twice
 * for trusting a number over the asset: the car that was scaled three times
 * before anyone read its bounding box, and the window glass hung on bounding
 * boxes instead of the model's own faces.
 *
 * The street lamp's numbers are load-bearing. `addStreetlight()` positions a
 * pool of light and turns the whole model by a computed heading, and both of
 * those assume the shape the built-in fallback has: a 4.6 pole with the arm
 * reaching out along +X. A model that disagrees puts every lamp in the world
 * over the verge, which is a thing that has happened here before - see the
 * comment about `rand() * PI * 2` in World.js.
 */
import { readFileSync, existsSync, statSync } from 'fs'
import { readGLB, primitives } from './glbread.mjs'
import { readPNG, samplerFor } from './pngread.mjs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)
const MODELS = ROOT + 'public/models/'

const size = (f) => {
  const b = [0, 1, 2].map(k => ({ min: Infinity, max: -Infinity, k }))
  for (const p of primitives(MODELS + f)) {
    for (let i = 0; i < p.position.length; i += 3) {
      for (const a of b) {
        b[a.k].min = Math.min(b[a.k].min, p.position[i + a.k])
        b[a.k].max = Math.max(b[a.k].max, p.position[i + a.k])
      }
    }
  }
  return { min: b.map(a => a.min), max: b.map(a => a.max) }
}

// ---------------------------------------------------------------------------
console.log('1. They exist, and they are small\n')

for (const f of ['rock.glb', 'streetlight.glb']) {
  chk(`${f} is there`, existsSync(MODELS + f))
  const kb = existsSync(MODELS + f) ? statSync(MODELS + f).size / 1024 : Infinity
  // The downloaded Kenney models are 37-70KB. A generated one has no excuse
  // to be bigger, and MODELS.md asks for under 1MB from anything.
  chk(`${f} is ${kb.toFixed(1)}KB, well under the 1MB budget`, kb < 100, `${kb}KB`)
}

// ---------------------------------------------------------------------------
console.log('\n2. Both point at the shared atlas, not at their own copy')

for (const f of ['rock.glb', 'streetlight.glb']) {
  const { json } = readGLB(MODELS + f)
  const uris = (json.images || []).map(i => i.uri)
  chk(`${f} uses Textures/colormap.png`,
      uris.length === 1 && uris[0] === 'Textures/colormap.png', uris.join(', '))
  chk(`${f} embeds no image of its own`,
      !(json.images || []).some(i => i.bufferView !== undefined))
}
chk('and that atlas is actually on disk beside them',
    existsSync(MODELS + 'Textures/colormap.png'))

// Every UV must land on a real swatch. A UV that misses the painted part of
// the atlas gives a black or transparent model, and it is the single easiest
// thing to get wrong when the colours are picked by coordinate.
const png = readPNG(MODELS + 'Textures/colormap.png')
const sample = samplerFor(png)
for (const f of ['rock.glb', 'streetlight.glb']) {
  let dark = 0, total = 0
  for (const p of primitives(MODELS + f)) {
    if (!p.uv) continue
    for (let i = 0; i < p.uv.length; i += 2) {
      total++
      const [r, g, b] = sample(p.uv[i], p.uv[i + 1])
      if (r + g + b < 24) dark++
    }
  }
  chk(`${f}: all ${total} UVs land on a painted swatch`, total > 0 && dark === 0,
      `${dark} land on the unpainted part of the atlas`)
}

// ---------------------------------------------------------------------------
console.log('\n3. The rock is a rock')

const rock = size('rock.glb')
chk('it stands on the ground, so addRock() can put it at groundAt()',
    Math.abs(rock.min[1]) < 1e-5, `lowest point ${rock.min[1]}`)
const rw = rock.max[0] - rock.min[0]
const rh = rock.max[1] - rock.min[1]
const rd = rock.max[2] - rock.min[2]
chk(`it is wider than it is tall (${rw.toFixed(2)} x ${rh.toFixed(2)} x ${rd.toFixed(2)})`,
    rh < rw * 0.8 && rh < rd * 0.8, 'a rock that is as tall as it is wide is a ball')
// fitLength scales the longest horizontal dimension to 2, and addRock() then
// gives it a cube collider of the scaled size. A very flat or very tall rock
// would leave the collider disagreeing with what you can see.
chk('and not so flat that its box collider is a lie',
    rh > rw * 0.4, `${rh.toFixed(2)} tall against ${rw.toFixed(2)} wide`)

// ---------------------------------------------------------------------------
console.log('\n4. The street lamp is built to the numbers World.js uses')

const lamp = readGLB(MODELS + 'streetlight.glb')
const names = (lamp.json.nodes || []).map(n => n.name)
for (const n of ['pole', 'arm', 'head', 'lamp']) {
  chk(`it has a node called ${n}`, names.includes(n), names.join(', '))
}

// THE NAME `lamp` IS AN INTERFACE. World.js does getObjectByName('lamp') to
// find the lens and make it glow after dark; rename it and every street lamp
// in the world stays dark, silently, because getObjectByName returns
// undefined and the guard skips.
const world = readFileSync(ROOT + 'src/world/World.js', 'utf8')
chk("World.js looks the lens up by that exact name",
    /getObjectByName\('lamp'\)/.test(world))

// The lens must be its own MATERIAL or the pole glows with it - glTF shares
// one material object across every mesh that references it.
const lampNode = (lamp.json.nodes || []).find(n => n.name === 'lamp')
const poleNode = (lamp.json.nodes || []).find(n => n.name === 'pole')
const matOf = (node) => lamp.json.meshes[node.mesh].primitives[0].material
chk('the lens has a material of its own, so the pole does not light up too',
    lampNode && poleNode && matOf(lampNode) !== matOf(poleNode),
    `lens material ${lampNode && matOf(lampNode)}, pole ${poleNode && matOf(poleNode)}`)

// Geometry, per node, in the model's own coordinates.
const meshBounds = (name) => {
  const node = lamp.json.nodes.find(n => n.name === name)
  const acc = lamp.json.meshes[node.mesh].primitives[0].attributes.POSITION
  const a = lamp.json.accessors[acc]
  return { min: a.min, max: a.max }
}

const pole = meshBounds('pole')
chk(`the pole stands on the ground and is ${pole.max[1].toFixed(2)} tall`,
    Math.abs(pole.min[1]) < 1e-5 && Math.abs(pole.max[1] - 4.6) < 0.05,
    `${pole.min[1]} to ${pole.max[1]}`)

// THE ORIENTATION. addStreetlight() turns the model so its +X faces the road.
const arm = meshBounds('arm')
chk(`the arm reaches out along +X, to ${arm.max[0].toFixed(2)}`,
    arm.max[0] > 0.7 && Math.abs(arm.min[0]) < 0.05,
    `x from ${arm.min[0]} to ${arm.max[0]} - if this is centred or negative, ` +
    'every lamp on the map lights the verge instead of the road')

const lens = meshBounds('lamp')
chk('the lens hangs under the arm, out over the road',
    lens.max[1] < arm.min[1] + 0.02 && lens.min[0] > 0.3,
    `lens top ${lens.max[1]}, arm bottom ${arm.min[1]}, lens x from ${lens.min[0]}`)

// ---------------------------------------------------------------------------
console.log('\n5. The manifest and the code agree about it')

const manifest = readFileSync(ROOT + 'src/world/modelManifest.js', 'utf8')
const entry = (key) => {
  const m = manifest.match(new RegExp(`\\{[^}]*key:\\s*'${key}'[^}]*\\}`))
  return m ? m[0] : ''
}
chk('rock is in the manifest, fitted to 2 units',
    /fitLength:\s*2\b/.test(entry('rock')), entry('rock'))

// NOT fitted, and this is the one a tidy-up would break. The lamp is built to
// the dimensions checked in section 4; fitting it to anything would scale
// those away and leave the light pool sitting round its feet.
chk('the street lamp is NOT fitted - it is already the right size',
    entry('streetlight') !== '' && !/fitLength/.test(entry('streetlight')),
    entry('streetlight'))

// The model path must do BOTH the things the built-in path does. It did
// neither, and had never run, so the day these files appeared every lamp in
// the world would have stopped coming on at dusk.
const modelPath = world.slice(world.indexOf("has('streetlight')"))
  .slice(0, 1400)
chk('the model path registers the lens as a night light',
    /registerNightLight\(/.test(modelPath))
chk('and casts the same pool of light on the road that the fallback does',
    /addLampPool\(/.test(modelPath))
chk('and there is ONE implementation of that pool, not two',
    (world.match(/addLampPool\(/g) || []).length >= 3 &&
    (world.match(/this\.addLightPool\(px, pz, reach, 1\)/g) || []).length === 1)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
