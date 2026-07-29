const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
const C = await import(new URL('../src/world/curves.js', import.meta.url).href)

function ribbonHealth(points, width){
  const clean=C.dedupePath(points)
  const quads=C.ribbonQuads(points,width)
  const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
  let minW=Infinity, seam=0, folds=0
  for(let i=0;i<quads.length;i++){
    const q=quads[i]
    minW=Math.min(minW,d(q.l0,q.r0),d(q.l1,q.r1))
    if(i+1<quads.length) seam=Math.max(seam,d(q.l1,quads[i+1].l0),d(q.r1,quads[i+1].r0))
    const up=(a,b,c)=>(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)
    if(up(q.l0,q.r0,q.l1)<-1e-9||up(q.l1,q.r0,q.r1)<-1e-9) folds++
  }
  return {missing:(clean.length-1)-quads.length, minW, seam, folds,
          tightest:Math.min(...C.turningRadii(clean))}
}

let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}

console.log('Island roads: no pinching\n')
for (const island of L.ISLANDS){
  for (const road of L.getIslandRoads(island)){
    const clean=C.dedupePath(road.points)
    if(clean.length<2) continue
    const h=ribbonHealth(road.points, road.width)
    const label=`${island.id}/${road.auto?'auto':'drawn'}`.padEnd(20)
    chk(`${label} no missing quads`, h.missing===0, `${h.missing} missing`)
    chk(`${label} full width (${h.minW.toFixed(2)} of ${road.width})`, h.minW>road.width-1e-6)
    chk(`${label} watertight (seam ${h.seam.toExponential(1)})`, h.seam<1e-9)
    chk(`${label} no folds (tightest bend r=${h.tightest.toFixed(1)})`, h.folds===0)
  }
}
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
