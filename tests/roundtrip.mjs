// The failure that lost Mike's buildings: open the editor, export, and the
// export is missing things that were in mapData.js all along. This test
// opens the editor on the REAL map and checks the export gives it all back.
import { loadEditor } from './editor.mjs'
const REAL = await import(new URL('../src/world/mapData.js', import.meta.url).href)
const { run } = loadEditor()
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}

console.log('Editor opens on the real map, not a stale copy\n')
const loaded = run('JSON.parse(JSON.stringify(map))')
chk(`same number of islands (${loaded.islands.length})`,
    loaded.islands.length === REAL.ISLANDS.length)

for (const real of REAL.ISLANDS) {
  const got = loaded.islands.find(i=>i.id===real.id)
  if(!got){ chk(`island ${real.id} present`, false); continue }
  const wantR=(real.roads||[]).length, wantB=(real.buildings||[]).length
  const wantD=(real.districts||[]).length
  chk(`${real.id.padEnd(9)} roads ${got.roads.length}/${wantR}, buildings ${got.buildings.length}/${wantB}, districts ${got.districts.length}/${wantD}`,
      got.roads.length===wantR && got.buildings.length===wantB && got.districts.length===wantD)
}

console.log('\nExporting without touching anything loses nothing')
run('renderExport()')
const out = run('document.getElementById("out").value')
const mod = await import('data:text/javascript,'+encodeURIComponent(out))

chk(`exports ${mod.ISLANDS.length} islands`, mod.ISLANDS.length===REAL.ISLANDS.length)
chk(`exports ${mod.BRIDGES.length} bridges`, mod.BRIDGES.length===REAL.BRIDGES.length)
for (const real of REAL.ISLANDS) {
  const got = mod.ISLANDS.find(i=>i.id===real.id)
  if(!got){ chk(`${real.id} survived export`, false); continue }
  const rOK=(got.roads||[]).length===(real.roads||[]).length
  const bOK=(got.buildings||[]).length===(real.buildings||[]).length
  chk(`${real.id.padEnd(9)} keeps its roads and buildings`, rOK&&bOK,
      `roads ${(got.roads||[]).length}/${(real.roads||[]).length}, buildings ${(got.buildings||[]).length}/${(real.buildings||[]).length}`)
  if (real.roads?.length) {
    const a=real.roads[0].points, b=got.roads[0].points
    let worst=0
    for(let i=0;i<Math.min(a.length,b.length);i++)
      worst=Math.max(worst, Math.hypot(a[i].x-b[i].x, a[i].z-b[i].z))
    chk(`${real.id.padEnd(9)} road points unchanged (worst drift ${worst.toFixed(4)})`, worst<0.06)
  }
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
