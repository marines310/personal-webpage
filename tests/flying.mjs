/**
 * Why the fast vehicles flew, pinned.
 *
 * Mike: "lots of floating/flying instances ... race cars and motor cycles
 * especially 'jumpy' or prone to flying."
 *
 * Measured with tools/fly.mjs (the racing car at full speed on a flat
 * trimesh floor: 14% of frames with no ground contact at 60 fps, 89% at 30
 * fps, launched nearly four units into the air), the cause was Rapier's
 * trimesh internal edges: every edge between two floor triangles is a tiny
 * kerb unless the collider is built with FIX_INTERNAL_EDGES. With it, 7% and
 * 9%, nothing over 0.17 up.
 *
 * That flag assumes an oriented mesh, and the bridge decks were inside out:
 * with the flag, a car on a bridge was held inside the slab. So:
 *
 *   1. Physics.js builds every trimesh with the flag.
 *   2. Every bridge deck is a closed solid wound outward - signed volume
 *      positive and equal to width x thickness x length.
 *   3. The mounds are too (tests/race.mjs checks those with outwardCount).
 */
import { deckSolid, deckSignedVolume, BRIDGE_DECK_THICKNESS } from '../src/world/bridgeDeck.js'
import { getBridges } from '../src/world/islandLayout.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(HERE, '..', f), 'utf8')

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

console.log('1. Every trimesh gets FIX_INTERNAL_EDGES\n')
const physics = read('src/systems/Physics.js')
chk('createStaticTrimesh passes the flag',
    /TriMeshFlags\.FIX_INTERNAL_EDGES/.test(physics) &&
    /\.trimesh\(vertices, indices, flags\)/.test(physics))
chk('and it is the only trimesh builder',
    (physics.match(/ColliderDesc\s*\.trimesh\(/g) || []).length === 1 &&
    (physics.match(/\.trimesh\(/g) || []).length === 1)
const world = read('src/world/World.js')
chk('World.js never builds one on its own', !/ColliderDesc[\s\S]{0,40}trimesh/.test(world))

console.log('\n2. The bridge decks are wound outward\n')
const bridges = getBridges()
chk('there are bridges to check', bridges.length >= 5, `${bridges.length}`)
for (const b of bridges) {
  const solid = deckSolid(b)
  const v = deckSignedVolume(solid)
  const expect = b.width * BRIDGE_DECK_THICKNESS * b.length
  chk(`${(b.from.id + '-' + b.to.id).padEnd(14)} is a solid of the right size, wound outward`,
      v > 0 && Math.abs(v - expect) < expect * 0.02,
      `${v.toFixed(0)} against ${expect.toFixed(0)}`)
  chk(`${(b.from.id + '-' + b.to.id).padEnd(14)} is closed - every index is used, no index is out of range`,
      solid.indices.every(i => i >= 0 && i * 3 + 2 < solid.positions.length) &&
      solid.indices.length === (solid.steps * 4 + 2) * 6)
}
chk('World.js builds the deck from deckSolid()', /const \{ positions, indices \} = deckSolid\(bridge\)/.test(world))

// Prove the metric: the same deck with every triangle flipped reads as the
// inside-out solid it is, with the same volume and the other sign.
{
  const solid = deckSolid(bridges[0])
  const flipped = { positions: solid.positions, indices: solid.indices.slice() }
  for (let i = 0; i < flipped.indices.length; i += 3) {
    const t = flipped.indices[i + 1]
    flipped.indices[i + 1] = flipped.indices[i + 2]
    flipped.indices[i + 2] = t
  }
  const v = deckSignedVolume(solid), w = deckSignedVolume(flipped)
  chk('the signed volume calls the same deck inside out when it is', w < 0 && Math.abs(v + w) < 1e-6,
      `${v.toFixed(1)} vs ${w.toFixed(1)}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
