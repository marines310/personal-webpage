/**
 * Static checks on World.js.
 *
 * World.js needs a browser and a GPU, so it can't be run here. But most
 * of the ways it has actually broken were not subtle rendering problems -
 * they were a method that didn't exist, a palette colour that was never
 * defined, or an object pushed onto a list in a shape the reader didn't
 * expect. All of those are visible in the source.
 *
 * This exists because a sway entry was pushed as { mesh } while the
 * animation loop read entry.object - which threw on the first frame and
 * left a blank screen. The build passed, and so did every other test.
 */
import { readFileSync } from 'fs'

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)
const src = readFileSync(ROOT + 'src/world/World.js', 'utf8')

let pass = 0, fail = 0
const chk = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + '  ' + d)) }

console.log('World.js, read rather than run\n')

console.log('1. Every method called on this is one that exists')
const defined = new Set(
  [...src.matchAll(/^\s{2}(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{/gm)]
    .map(m => m[1])
)
const called = new Set(
  [...src.matchAll(/this\.([a-zA-Z_$][\w$]*)\s*\(/g)].map(m => m[1])
)
const inherited = new Set(['constructor'])
const missing = [...called].filter(c => !defined.has(c) && !inherited.has(c))
chk(`${called.size} distinct methods called, all defined`, missing.length === 0,
    'missing: ' + missing.join(', '))

console.log('\n2. Lists are pushed in the shape their reader expects')
// swayables: the animation loop reads entry.object and entry.phase
const sways = [...src.matchAll(/swayables\.push\(\{([^}]*)\}/g)].map(m => m[1])
chk(`${sways.length} sway entries, all with an 'object'`,
    sways.every(s => /\bobject\s*:/.test(s)),
    sways.filter(s => !/\bobject\s*:/.test(s)).join(' | '))
chk('all with a phase', sways.every(s => /\bphase\s*:/.test(s)))
chk('none using a key the reader ignores',
    sways.every(s => !/\bmesh\s*:|\bamount\s*:/.test(s)),
    sways.filter(s => /\bmesh\s*:|\bamount\s*:/.test(s)).join(' | '))

// nightEmissives: read as { material, strength }
const nights = [...src.matchAll(/nightEmissives\.push\(\{([^}]*)\}/g)].map(m => m[1])
chk(`${nights.length} night-light entries, all with a material`,
    nights.every(s => /\bmaterial\b/.test(s)))

console.log('\n3. Every colour used is one the palette defines')
const paletteBlock = src.slice(src.indexOf('export const PALETTE'), src.indexOf('export class World'))
const paletteKeys = new Set(
  [...paletteBlock.matchAll(/^\s{2}([a-zA-Z][\w]*)\s*:/gm)].map(m => m[1])
)
const used = new Set([...src.matchAll(/PALETTE\.([a-zA-Z][\w]*)/g)].map(m => m[1]))
const unknown = [...used].filter(k => !paletteKeys.has(k))
chk(`${used.size} palette colours used, all defined`, unknown.length === 0,
    'unknown: ' + unknown.join(', '))

console.log('\n4. Every model asked for is one the manifest lists')
const manifest = readFileSync(ROOT + 'src/world/modelManifest.js', 'utf8')
const keys = new Set([...manifest.matchAll(/key:\s*'([^']+)'/g)].map(m => m[1]))
const asked = [...new Set([...src.matchAll(/assets\.get\(\s*'([^']+)'/g)].map(m => m[1]))]
const absent = asked.filter(k => !keys.has(k))
chk(`asks for ${asked.join(', ')} - all in the manifest`, absent.length === 0,
    'not in manifest (will silently fall back): ' + absent.join(', '))

console.log('\n5. Everything imported from the layout is exported by it')
const layout = readFileSync(ROOT + 'src/world/islandLayout.js', 'utf8')
const layoutExports = new Set([
  ...[...layout.matchAll(/export\s+(?:function|const)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]),
  ...[...layout.matchAll(/export\s*\{([^}]*)\}/g)]
      .flatMap(m => m[1].split(',').map(t => t.trim().split(/\s+as\s+/)[0]).filter(Boolean))
])
const imported = (src.match(/import \{([^}]*)\} from '\.\/islandLayout\.js'/) || [, ''])[1]
  .split(',').map(t => t.trim()).filter(Boolean)
const notExported = imported.filter(i => !layoutExports.has(i))
chk(`${imported.length} imports from islandLayout, all exported`,
    notExported.length === 0, 'missing: ' + notExported.join(', '))

console.log('\n6. Every SHOUTY constant it uses comes from somewhere')
// The trap: move a constant out of World.js into the layout, forget to add
// it to the import list, and nothing complains until the world is built -
// at which point it throws on the first frame and the screen stays black.
// Section 5 only checks that what IS imported exists, not that what's used
// is imported.
// Comments and strings have to go first. Prose is full of capitals, and
// scanning the raw file reported "IMPORTANT" and "DRIVE TO EXPLORE" as
// undefined constants - noise that would have got this check deleted.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
  .replace(/'(?:[^'\\]|\\.)*'/g, "''")
  .replace(/"(?:[^"\\]|\\.)*"/g, '""')
  .replace(/`(?:[^`\\]|\\.)*`/g, '``')

const usedConsts = new Set(
  [...code.matchAll(/(?<![.\w$])([A-Z][A-Z0-9_]{2,})\b/g)].map(m => m[1])
)
const fromEverywhere = new Set([
  // Everything brought in from anywhere, not just the layout
  ...[...src.matchAll(/import\s*(?:\*\s*as\s*([\w$]+)|\{([^}]*)\}|([\w$]+))\s*from/g)]
    .flatMap(m => m[1] ? [m[1]]
      : m[2] ? m[2].split(',').map(t => t.trim().split(/\s+as\s+/).pop())
      : [m[3]]),
  // and everything declared here
  ...[...code.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=/g)].map(m => m[1]),
  // Not ours to declare
  'PI', 'MAX_SAFE_INTEGER', 'MIN_SAFE_INTEGER', 'EPSILON', 'DEG2RAD', 'RAD2DEG',
  'NEGATIVE_INFINITY', 'POSITIVE_INFINITY', 'LN2', 'LN10'
])
const orphans = [...usedConsts].filter(c => !fromEverywhere.has(c))
chk(`${usedConsts.size} constants used, all imported or declared`, orphans.length === 0,
    'nowhere defined: ' + orphans.join(', '))

console.log('\n7. Every plain function it calls comes from somewhere')
// This is section 6's twin, and it exists because section 6 didn't catch the
// obvious case: `getPortYard(port)` was called without being imported, and the
// world failed to load with "getPortYard is not defined". Section 6 only looked
// at SHOUTY names, so a missing function sailed straight past it.
//
// Bare calls only - `foo(...)`, not `this.foo(...)` (section 1) or
// `x.foo(...)` (a method on something else, which can't be checked from here).
const bareCalls = new Set(
  [...code.matchAll(/(?<![.\w$])([a-z][\w$]*)\s*\(/g)].map(m => m[1])
)

const localFunctions = new Set([
  // The class's own methods. A declaration `buildPort(port) {` looks exactly
  // like a bare call to the regex above, so without these every method in the
  // file is reported as undefined - 80 lines of noise that would have got this
  // check deleted rather than read.
  ...defined,
  ...[...code.matchAll(/\bfunction\s+([\w$]+)/g)].map(m => m[1]),
  ...[...code.matchAll(/\b(?:const|let|var)\s+([\w$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[\w$]+)\s*=>/g)]
    .map(m => m[1]),
  // Parameters. A function that TAKES a function and calls it - polygonMesh
  // takes `heightAt` - is a bare call to a name that is neither imported nor
  // declared at the top level, and the check has no way to tell that from a
  // missing import. Everything inside a parameter list counts, which is
  // broader than strictly needed and errs towards silence rather than towards
  // crying wolf: a guard that reports things that are fine gets ignored.
  ...[...code.matchAll(/(?:function\s*[\w$]*|^\s*[\w$]+)\s*\(([^)]*)\)\s*{/gm)]
    .flatMap(m => m[1].split(',').map(p => p.trim().split(/[\s=]/)[0]))
    .filter(Boolean),
  ...[...code.matchAll(/\(([^)]*)\)\s*=>/g)]
    .flatMap(m => m[1].split(',').map(p => p.trim().split(/[\s=]/)[0]))
    .filter(Boolean),
  // Anything JavaScript or the language itself provides
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'new',
  'function', 'else', 'do', 'try', 'super', 'this', 'await', 'yield',
  'push', 'map', 'filter', 'clone', 'require', 'set', 'get', 'add',
  'isFinite', 'parseFloat', 'parseInt', 'isNaN', 'atan2', 'clamp'
])

const missingFns = [...bareCalls].filter(fn =>
  !fromEverywhere.has(fn) && !localFunctions.has(fn))

chk(`${bareCalls.size} bare calls, all imported or declared`, missingFns.length === 0,
    'nowhere defined: ' + missingFns.join(', '))

// ---------------------------------------------------------------------------
console.log('\n8. Nothing is left standing at sea level on a hill')
// World.js can't be run here, so this reads it. Every place that puts an
// object on the ground by its own x and z has to ask how high the ground is;
// one that still writes a literal 0, or a bare small number, is an object
// hovering over a hill or buried in it.
//
// Written as a scan rather than a list of allowed exceptions, because the
// list would go stale the moment someone adds a prop - and a prop floating
// two units above a hillside is exactly the thing nobody notices in a diff.
// The x and z have to be NAMES, not numbers. A part positioned inside its
// own model group - a wing mirror at (0, 2.9, 0.34) - is a local offset, not
// a point on the ground, and matching those buried the real ones.
const flatPlacements = [...code.matchAll(
  /([\w$.]+)\.position\.set\(\s*([A-Za-z_$][\w$.]*)\s*,\s*(-?[\d.]+)\s*,\s*([A-Za-z_$][\w$.]*)\s*\)/g)]
  .filter(m => {
    // The honest exceptions, each for a reason:
    //
    //   cx/cz    - island shells and the sea. They carry their height in the
    //              geometry and sit at the island's centre, not at a point on
    //              the ground.
    //   bridge   - a bridge deck spans WATER at a stated height. Raising it
    //              clear of the shipping is its own job (task 88).
    //   px/pz    - the railings that stand on that deck.
    //   ship     - afloat. Exempt from the GROUND, not from having a right
    //              answer: see the check immediately below, which is the half
    //              this exception used to hide.
    //   lx       - the two cars inside the crash group. This is the case the
    //              comment above describes and the pattern cannot see: a local
    //              offset within a group that IS placed with groundAt(). Both
    //              its x and its z happen to be names, so it reads as a world
    //              placement. The group's own position.set is three lines
    //              away and does ask the ground.
    const where = `${m[1]} ${m[2]} ${m[4]}`
    return !/\bcx\b|\bcz\b|\bbridge\.|\bpx\b|\bpz\b|\bship\b|\blx\b/.test(where)
  })

console.log(`   ${flatPlacements.length} placements still at a fixed height`)
chk('everything placed by x and z asks the ground how high it is',
    flatPlacements.length === 0,
    flatPlacements.slice(0, 5).map(m => m[0]).join('  '))

// A ship is exempt from the ground because it floats. It is NOT exempt from
// floating at the right height, and nothing checked that: every hull sat at
// world y = 0 while the sea is drawn at SEA_LEVEL (-1.4), so the whole fleet
// hovered 1.4 units clear of the water. Mike saw it in a screenshot; 22 checks
// in ports.mjs sail the fleet for fifteen minutes and not one of them looks up.
//
// The same shape as the constant that was imported but never used, and the
// pavement that shipped blank with 396 checks green: an exemption written for
// a real reason, covering a case nobody then asked about. When you exempt
// something from a rule, say what the rule IS for it.
const shipPlacements = [...code.matchAll(
  /ship\.mesh\.position\.set\(([^)]*)\)/g)]
console.log(`   ${shipPlacements.length} places put a hull in the water`)
chk('and every hull is put in the water at SEA_LEVEL, not at zero',
    shipPlacements.length > 0 &&
      shipPlacements.every(m => /SEA_LEVEL/.test(m[1])),
    shipPlacements.filter(m => !/SEA_LEVEL/.test(m[1])).map(m => m[0]).join('  '))

// And the two that would be worst: the ground mesh and its collider have to
// come from the same field, or the car drives on an invisible surface.
chk('the ground mesh is built from the terrain',
    /polygonMesh\([^)]*\}\s*,\s*height\)/.test(code) ||
    code.includes('}, height)'),
    'the grass and sand are still flat')
chk('and so is the collider it collides with',
    code.includes('terrain.heightAt(p.x, p.z) + lift, p.z'),
    'buildLandCollider is still flat')
// And the half that was missing until 7 August: the height field is not what
// anything is DRAWN on. The grass cap stands proud of the beach and the
// tarmac proud of the grass, so a collider on the bare field sits under every
// surface in the world - measured at 0.30 into open grass and 0.35 into a
// station forecourt before this was added. See section 5 of terrain.mjs.
chk('and the collider is lifted onto the surface you can actually see',
    /surfaceLift\(terrain\.claimAt\(/.test(code),
    'the car will drive below the grass again')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
