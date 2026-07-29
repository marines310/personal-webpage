import { loadEditor, SRC } from './editor.mjs'
import { readFileSync } from 'fs'
const ED = loadEditor()
const { C, run, els, handlers, counter } = ED

// No need to inject the map any more: the editor imports mapData.js
// directly, so it is already working from exactly the game's data. That
// shared starting point is the thing this test now guards.

const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)

let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}

console.log('Editor auto-road curves vs the game, same map data\n')
let worst=0, worstIsland=''
for (const island of L.ISLANDS) {
  const gameRoads = L.getIslandRoads(island)          // includes the bow
  const edCurves = run(`(function(){
    const isl = map.islands.find(i=>i.id===${JSON.stringify(island.id)});
    return autoRoadCurves(isl);
  })()`)

  const gameAuto = gameRoads.filter(r => r.auto)
  if (gameAuto.length !== edCurves.length) {
    chk(`${island.id}: same number of auto roads`, false, `game ${gameAuto.length} vs editor ${edCurves.length}`)
    continue
  }

  let islandWorst = 0
  for (let r=0; r<edCurves.length; r++) {
    const g = gameAuto[r].points, e = edCurves[r]
    if (g.length !== e.length) { islandWorst = Infinity; break }
    for (let i=0;i<g.length;i++) {
      islandWorst = Math.max(islandWorst, Math.abs(g[i].x-e[i].x), Math.abs(g[i].z-e[i].z))
    }
  }
  if (islandWorst > worst) { worst = islandWorst; worstIsland = island.id }
  chk(`${island.id.padEnd(9)} ${edCurves.length} road(s) match to ${islandWorst.toExponential(1)}`, islandWorst < 1e-9)
}

console.log(`\nworst disagreement anywhere: ${worst.toExponential(2)} (${worstIsland})`)

// How far off was the OLD straight-line preview?
console.log('\nHow wrong was the straight-line preview?')
for (const island of L.ISLANDS.slice(0,3)) {
  const roads = L.getIslandRoads(island)
  if (!roads.length) continue
  const pts = roads[0].points
  const a = pts[0], b = pts[pts.length-1]
  let maxDev = 0
  for (const p of pts) {
    const ex=b.x-a.x, ez=b.z-a.z, lenSq=ex*ex+ez*ez
    let t = lenSq ? ((p.x-a.x)*ex + (p.z-a.z)*ez)/lenSq : 0
    t = Math.max(0,Math.min(1,t))
    maxDev = Math.max(maxDev, Math.hypot(p.x-(a.x+ex*t), p.z-(a.z+ez*t)))
  }
  console.log(`  ${island.id.padEnd(9)} real road bows ${maxDev.toFixed(2)} units off the straight line`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
