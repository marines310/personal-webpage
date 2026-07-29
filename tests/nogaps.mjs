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

console.log('No holes, no pinching, no doubling back\n')
const paths = L.getBridgeRoadPaths()

for (let i=0;i<paths.length;i++){
  const def=L.BRIDGES[i]
  const h=ribbonHealth(paths[i].points, paths[i].width)
  const label=`${def.from} -> ${def.to}`.padEnd(20)
  chk(`${label} no missing quads`, h.missing===0, `${h.missing} missing`)
  chk(`${label} full width (${h.minW.toFixed(2)} of ${paths[i].width})`, h.minW>paths[i].width-1e-6)
  chk(`${label} watertight (seam ${h.seam.toExponential(1)})`, h.seam<1e-9)
  chk(`${label} no folds (tightest bend r=${h.tightest.toFixed(1)})`, h.folds===0)
}

console.log('\nRuns ring to ring, not centre to centre')
const onRing=(isl,pt)=>{
  const ring=L.getIslandRing(isl)
  if(!ring) return Math.hypot(pt.x-isl.x, pt.z-isl.z)<0.01
  let best=Infinity
  for(const q of ring) best=Math.min(best, Math.hypot(pt.x-(isl.x+q.x), pt.z-(isl.z+q.z)))
  return best<1.5
}
for (let i=0;i<paths.length;i++){
  const def=L.BRIDGES[i]
  const a=L.getIsland(def.from), b=L.getIsland(def.to)
  const p=paths[i].points
  chk(`${def.from}->${def.to} starts on A's ring`, onRing(a,p[0]))
  chk(`${def.from}->${def.to} ends on B's ring`, onRing(b,p.at(-1)))
}

console.log('\nRoad still sits on the deck')
for (let i=0;i<paths.length;i++){
  const def=L.BRIDGES[i]
  const a=L.getIsland(def.from), b=L.getIsland(def.to)
  const dx=b.x-a.x, dz=b.z-a.z, d=Math.hypot(dx,dz), ux=dx/d, uz=dz/d
  const aShore=L.shoreDistance(a,dx,dz), bShore=L.shoreDistance(b,-dx,-dz)
  const s0=aShore-1, s1=d-bShore+1
  let worstOff=0
  for(const q of paths[i].points){
    const along=(q.x-a.x)*ux+(q.z-a.z)*uz
    if(along<s0+0.5||along>s1-0.5) continue
    worstOff=Math.max(worstOff, Math.abs(-(q.x-a.x)*uz+(q.z-a.z)*ux))
  }
  chk(`${def.from}->${def.to} straight over the span (${worstOff.toFixed(3)} off centre)`, worstOff<0.6)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
