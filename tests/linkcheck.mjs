// Serve the built site exactly as GitHub Pages would and ask for every
// file it references. A 404 here is a 404 for real visitors.
//
// THE BASE PATH IS READ OUT OF vite.config.js, not written here.
// It used to say '/personal-webpage/' in two places in this file, which made
// it a second copy of the one setting rule 8 is about - so the day the custom
// domain went live and SITE_BASE became '/', the only check that would catch
// a base-path mistake was itself testing the old path, and would have failed
// for the wrong reason. One implementation, never two.
//
// Run it against a build served at that base:
//   npm run build
//   mkdir -p /tmp/serve && cp -r dist/* /tmp/serve/          # SITE_BASE '/'
//   (cd /tmp/serve && python3 -m http.server 8899 &)
//   node tests/linkcheck.mjs
//
// If SITE_BASE is ever a subfolder again, copy dist into that subfolder.
import { readFileSync } from 'fs'

const config = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
const found = config.match(/const SITE_BASE\s*=\s*'([^']+)'/)
if (!found) {
  console.log('FAIL - could not find SITE_BASE in vite.config.js')
  process.exit(1)
}
// Normalised to no trailing slash, so joining is the same either way.
const SITE = found[1] === '/' ? '' : found[1].replace(/\/$/, '')
console.log(`SITE_BASE is '${found[1]}' - checking under '${SITE || '/'}'\n`)

const BASE = 'http://127.0.0.1:8899'
const pages = [`${SITE}/index.html`, `${SITE}/map-editor.html`]
let checked = 0
const bad = []

async function head(u) {
  const r = await fetch(BASE + u, { method: 'GET' })
  checked++
  if (!r.ok) bad.push(`${u} -> ${r.status}`)
  return r
}

for (const p of pages) {
  const r = await head(p)
  const html = await r.text()
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
    .filter(u => u.startsWith('/'))
  for (const u of refs) {
    const jr = await head(u)
    if (u.endsWith('.js')) {
      // follow asset URLs the JavaScript itself will request
      const js = await jr.text()
      const assets = [...js.matchAll(/["'`](\/[^"'`]*models\/[^"'`]+)["'`]/g)].map(m => m[1])
      for (const a of new Set(assets)) await head(a)
    }
  }
}

// The model files the manifest builds at runtime. Kept as a list because it
// asks a question the built JavaScript cannot answer: these names are
// CONSTRUCTED by the manifest, so they never appear as literal strings.
for (const f of ['car.glb', 'building_a.glb', 'building_b.glb', 'building_c.glb',
                 'tree_a.glb', 'tree_b.glb', 'rock.glb', 'streetlight.glb',
                 'Textures/colormap.png']) {
  await head(`${SITE}/models/${f}`)
}

// The link-preview image and the favicon. Nothing on the page requests og.png
// - somebody else's server does, when the address is pasted into a message -
// so it is invisible to the crawl above and has to be asked for by name.
await head(`${SITE}/og.png`)
await head(`${SITE}/favicon.svg`)

console.log(`${checked} requests, ${bad.length} failed`)
bad.forEach(b => console.log('  FAIL  ' + b))
console.log(bad.length ? '\nFAIL' : '\nPASS - nothing 404s')
process.exit(bad.length ? 1 : 0)
