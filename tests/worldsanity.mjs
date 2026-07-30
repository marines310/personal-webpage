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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
