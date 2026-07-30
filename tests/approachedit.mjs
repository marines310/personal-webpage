// decoded, because a folder name with a space arrives percent-encoded
const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)
const PROBE = '/tmp/portfolio-probe/'
// Drive the editor exactly as Mike would: select an island, click
// "Edit the road to hub", drag a handle, export, and check the game
// agrees with what the editor showed.
import { loadEditor } from './editor.mjs'
const { run, els } = loadEditor()
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}
const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)

console.log('Taking over a bridge road\n')

// what the road looks like before we touch it
const before = run(`approachRoads(getIsland('blog')).map(a=>({to:a.to,edited:a.edited,curve:a.curve.map(p=>({x:p.x,z:p.z}))}))`)
chk('blog has 1 bridge road, still automatic', before.length===1 && !before[0].edited)

// select the island, find the button, click it
run(`sel = { kind:'island', island: getIsland('blog') }; refresh()`)
const clicked = run(`(function(){
  const btns=[...document.getElementById('props').children].filter(e=>e.textContent&&e.textContent.indexOf('Edit the road to')===0)
  if(!btns.length) return 'no button'
  btns[0].onclick(); return 'clicked'
})()`)
chk('the Edit button exists and fires', clicked==='clicked', clicked)

const after = run(`approachRoads(getIsland('blog')).map(a=>({to:a.to,edited:a.edited,curve:a.curve.map(p=>({x:p.x,z:p.z}))}))`)
chk('road is now marked as edited', after.length===1 && after[0].edited===true)

let worst=0
for(let i=0;i<Math.min(before[0].curve.length,after[0].curve.length);i++)
  worst=Math.max(worst, d(before[0].curve[i], after[0].curve[i]))
chk(`same number of points (${before[0].curve.length} -> ${after[0].curve.length})`,
    before[0].curve.length===after[0].curve.length)
// The file rounds coordinates for readability, so allow the rounding but
// nothing more - this is what catches the road visibly jumping on click.
chk(`shape holds when taken over (worst ${worst.toFixed(4)} units)`, worst<0.02)

chk('it is not drawn twice', run(`getIsland('blog').roads.filter(r=>r.approachTo).length`)===1)

console.log('\nMoving a handle')
run(`(function(){
  const r=getIsland('blog').roads.find(x=>x.approachTo)
  r.points[2] = { x: r.points[2].x + 8, z: r.points[2].z - 6 }
  refresh()
})()`)
const moved = run(`approachRoads(getIsland('blog'))[0].curve.map(p=>({x:p.x,z:p.z}))`)
let shift=0
for(let i=0;i<Math.min(moved.length,after[0].curve.length);i++)
  shift=Math.max(shift, d(moved[i], after[0].curve[i]))
chk(`the road actually moved (max ${shift.toFixed(2)} units)`, shift>1)

const pinned = run(`(function(){
  const isl=getIsland('blog')
  const a=approachRoads(isl)[0]
  const other=getIsland(a.to)
  const dx=other.x-isl.x, dz=other.z-isl.z, L=Math.hypot(dx,dz)
  const shore=rayDistanceToBoundary(outlineOf(isl), dx, dz)
  const reach=Math.max(2, shore-1)
  return { got:a.controls[0], want:{x:dx/L*reach, z:dz/L*reach} }
})()`)
chk(`shore end still welded to the bridge (off by ${d(pinned.got,pinned.want).toExponential(1)})`,
    d(pinned.got, pinned.want) < 1e-9)

console.log('\nExport, then check the GAME draws the same road')
run('renderExport()')
const out = run(`document.getElementById('out').value`)
chk('export mentions approachTo', out.includes('approachTo'))

// Write the export somewhere disposable. This test used to overwrite the
// project's real mapData.js and leave it changed, which quietly poisoned
// every test that ran afterwards.
const { writeFileSync, mkdirSync, cpSync } = await import('fs')
// The whole folder, not a list of files.
//
// It used to copy three named modules, and adding a fourth to src/world broke
// this suite with a module-not-found from a scratch directory - which reads
// like the editor is broken when nothing about the editor changed. A list of
// files that has to be kept in step with a folder is a second copy of the
// folder, and this project has been bitten by second copies before.
//
// mapData.js is written afterwards, because the whole point is to run the
// game against the map the EDITOR just exported.
mkdirSync(PROBE + 'src/world', { recursive: true })
cpSync(ROOT + 'src/world', PROBE + 'src/world', { recursive: true })
writeFileSync(PROBE + 'src/world/mapData.js', out)

const { execFileSync } = await import('child_process')
const probe = `
const L = await import('${PROBE}src/world/islandLayout.js')
const C = await import('${PROBE}src/world/curves.js')
const blog = L.getIsland('blog')
const roads = L.getIslandRoads(blog)
const ap = roads.filter(r=>r.auto)
const solid = L.getBridgeRoadPaths().every(p => {
  const q=C.ribbonQuads(p.points,p.width), clean=C.dedupePath(p.points)
  const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
  let minW=Infinity, seam=0
  for(let i=0;i<q.length;i++){
    minW=Math.min(minW,d(q[i].l0,q[i].r0))
    if(i+1<q.length) seam=Math.max(seam,d(q[i].l1,q[i+1].l0))
  }
  return q.length===clean.length-1 && minW>p.width-1e-6 && seam<1e-9
})
console.log(JSON.stringify({
  approaches: ap.length,
  edited: ap[0] ? !!ap[0].edited : false,
  // The ring road and the port road are both legitimately non-auto roads,
  // so they're excluded. What this is looking for is a bridge approach
  // being emitted TWICE - once as part of the continuous bridge road and
  // again as an ordinary road, which lays two surfaces on top of each other.
  plainRoads: roads.filter(r=>!r.auto && !r.ring && !r.spur).length,
  points: ap[0] ? ap[0].points : [],
  solid
}))
`
writeFileSync(PROBE + '_probe.mjs', probe)
const game = JSON.parse(execFileSync('node', [PROBE + '_probe.mjs'], { encoding:'utf8' }))

chk('game sees exactly 1 approach on blog', game.approaches===1, `${game.approaches}`)
chk('game marks it edited', game.edited===true)
chk('game does not also draw it as a plain road', game.plainRoads===0)

let drift=0
for(let i=0;i<Math.min(moved.length, game.points.length);i++)
  drift=Math.max(drift, d(moved[i], game.points[i]))
chk(`editor preview matches the game (worst ${drift.toFixed(4)} units)`, drift<0.02)
chk('every bridge road still solid, full width, watertight', game.solid)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
