/**
 * THE SWEEP. Is any piece of street furniture standing on asphalt?
 *
 * Runs the BUILT game in a headless browser, reads every prop World.js
 * registered through noteProp() and every surface it tagged `userData.road`,
 * and tests each prop against every road triangle in 2D. A prop inside a
 * triangle is on the road; one within MARGIN of an edge is on the kerb.
 *
 * Why a browser: the two earlier fixes for "lamp posts in the street" each
 * passed a pure test, because each pure test checked the placer's own idea of
 * where the roads were. This checks what was drawn. tests/furniture.mjs pins
 * the causes it found so they stay fixed without a browser.
 *
 * Needs `window.__game = game` in src/main.js (temporarily), `npm run build`,
 * and a Playwright chromium. Run from a folder where `playwright` resolves:
 *
 *     node tools/sweep.mjs [margin=0.6]
 *
 * Paths below are the ones this was written against; edit ROOT and the
 * chromium executable for another machine.
 */
import { chromium } from 'playwright'
import http from 'http'; import fs from 'fs'; import path from 'path'
const ROOT='/tmp/claude-0/-home-claude/6fa0c2a9-f72b-5776-b2e2-dc64972c1dcd/scratchpad/wheelie/dist'
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
 '.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wasm':'application/wasm'}
const server=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]))
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(ROOT,'index.html')
 r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)})
await new Promise(r=>server.listen(8099,r))
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
const page=await browser.newPage({viewport:{width:800,height:500}})
const errors=[];page.on('pageerror',e=>errors.push(String(e)))
await page.goto('http://localhost:8099/',{waitUntil:'domcontentloaded',timeout:120000})
await page.waitForFunction('window.__game && window.__game.vehicle',null,{timeout:180000})
await page.waitForTimeout(2000)
const MARGIN = +(process.argv[2] || 0.6)
const result = await page.evaluate((MARGIN) => {
  const g = window.__game, w = g.world, scene = g.scene
  scene.updateMatrixWorld(true)
  const tris = []   // flat: ax,az,bx,bz,cx,cz
  const kinds = []
  let roadMeshes = 0
  scene.traverse(o => {
    if (!o.isMesh || !o.userData.road) return
    roadMeshes++
    const kind = typeof o.userData.road === 'string' ? o.userData.road : 'road'
    const geo = o.geometry, pos = geo.attributes.position, m = o.matrixWorld.elements
    const wx = (x,y,z) => m[0]*x + m[4]*y + m[8]*z + m[12]
    const wz = (x,y,z) => m[2]*x + m[6]*y + m[10]*z + m[14]
    const idx = geo.index ? geo.index.array : null
    const n = idx ? idx.length : pos.count
    for (let i = 0; i < n; i += 3) {
      const a = idx ? idx[i] : i, b = idx ? idx[i+1] : i+1, c = idx ? idx[i+2] : i+2
      kinds.push(kind)
      tris.push(wx(pos.getX(a),pos.getY(a),pos.getZ(a)), wz(pos.getX(a),pos.getY(a),pos.getZ(a)),
                wx(pos.getX(b),pos.getY(b),pos.getZ(b)), wz(pos.getX(b),pos.getY(b),pos.getZ(b)),
                wx(pos.getX(c),pos.getY(c),pos.getZ(c)), wz(pos.getX(c),pos.getY(c),pos.getZ(c)))
    }
  })
  // Distance from a point to a triangle in 2D (0 if inside).
  const segDist = (px,pz,ax,az,bx,bz) => { const dx=bx-ax, dz=bz-az; const l2=dx*dx+dz*dz
    let t = l2 ? ((px-ax)*dx+(pz-az)*dz)/l2 : 0; t=Math.max(0,Math.min(1,t)); return Math.hypot(px-(ax+t*dx), pz-(az+t*dz)) }
  const inside = (px,pz,ax,az,bx,bz,cx,cz) => {
    const d1=(px-bx)*(az-bz)-(ax-bx)*(pz-bz), d2=(px-cx)*(bz-cz)-(bx-cx)*(pz-cz), d3=(px-ax)*(cz-az)-(cx-ax)*(pz-az)
    const neg=(d1<0)||(d2<0)||(d3<0), pos=(d1>0)||(d2>0)||(d3>0); return !(neg&&pos) }
  const islandOf = (x,z) => { let b='?',bd=1e9; for (const i of (w.islands||[])) { const d=Math.hypot(i.x-x,i.z-z); if(d<bd){bd=d;b=i.id} } return b }
  const out = []
  for (const p of w.props) {
    let best = Infinity, bestKind = ''
    for (let i = 0; i < tris.length; i += 6) {
      const ax=tris[i],az=tris[i+1],bx=tris[i+2],bz=tris[i+3],cx=tris[i+4],cz=tris[i+5]
      // cheap reject
      if (Math.min(ax,bx,cx) > p.x + MARGIN || Math.max(ax,bx,cx) < p.x - MARGIN ||
          Math.min(az,bz,cz) > p.z + MARGIN || Math.max(az,bz,cz) < p.z - MARGIN) continue
      if (inside(p.x,p.z,ax,az,bx,bz,cx,cz)) { best = 0; bestKind = kinds[i/6]; break }
      const d = Math.min(segDist(p.x,p.z,ax,az,bx,bz), segDist(p.x,p.z,bx,bz,cx,cz), segDist(p.x,p.z,cx,cz,ax,az))
      if (d < best) { best = d; bestKind = kinds[i/6] }
    }
    if (best < MARGIN) out.push({ ...p, d: +best.toFixed(2), island: islandOf(p.x,p.z), on: bestKind })
  }
  const counts = {}
  for (const p of w.props) counts[p.kind] = (counts[p.kind]||0)+1
  return { roadMeshes, triangles: tris.length/6, props: w.props.length, counts, offenders: out }
}, MARGIN)
console.log(`road meshes ${result.roadMeshes}, triangles ${result.triangles}, props ${result.props}`, JSON.stringify(result.counts))
console.log(`\n${result.offenders.length} props within ${MARGIN} of asphalt (0 = ON it):`)
const byKind = {}
for (const o of result.offenders) { byKind[o.kind] = byKind[o.kind] || []; byKind[o.kind].push(o) }
for (const [k, list] of Object.entries(byKind)) {
  console.log(`  ${k}: ${list.length}`)
  for (const o of list) console.log(`     ${o.island.padEnd(10)} (${o.x}, ${o.z})  d=${o.d}  ${o.on}`)
}
console.log('errors: ' + (errors.length?errors.slice(0,4).join(' | '):'none'))
await browser.close(); server.close()
