const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
const C = await import(new URL('../src/world/curves.js', import.meta.url).href)

// Deliberately nasty hand-drawn roads: hairpins, zigzags, near-duplicate
// clicks, doubling right back - the kinds of thing a person actually draws.
let rng=987654321
const rnd=()=>((rng=(rng*1103515245+12345)&0x7fffffff)/0x7fffffff)
const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)

let missing=0, inverted=0, seams=0, narrow=0, tested=0, worstW=Infinity, worstSeam=0
for(let t=0;t<3000;t++){
  const n=2+Math.floor(rnd()*7)
  const pts=[]
  for(let i=0;i<n;i++) pts.push({x:(rnd()-0.5)*40, z:(rnd()-0.5)*40})
  if(t%5===0) pts.push({...pts[0]})
  if(t%7===0) pts.push({x:pts[0].x+0.001,z:pts[0].z})
  const width=4+rnd()*6

  const sm=L.smoothRoad(C.sampleSpline(pts,{samplesPerSpan:9}), width)
  const clean=C.dedupePath(sm)
  if(clean.length<2) continue
  tested++
  const quads=C.ribbonQuads(sm,width)
  const tans=C.pathTangents(clean)

  // 1. one quad per step, none dropped
  if(quads.length !== clean.length-1) missing++

  for(let i=0;i<quads.length;i++){
    const q=quads[i]
    // 2. full width kept
    const w0=d(q.l0,q.r0), w1=d(q.l1,q.r1)
    worstW=Math.min(worstW, w0/width, w1/width)
    if(w0 < width-1e-6 || w1 < width-1e-6) narrow++
    // 3. a fold is allowed, but only where the road genuinely turns
    //    tighter than it is wide - never on a gentle curve
    const up=(a,b,c)=>(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)
    if(up(q.l0,q.r0,q.l1) < -1e-9 || up(q.l1,q.r0,q.r1) < -1e-9){
      // The quad's own geometry: how far it advances vs how much it turns.
      // An edge offset by h reverses once h exceeds that ratio, so a fold
      // is only explainable where advance/turn is under the half-width.
      const a=tans[i], b=tans[i+1]
      const turn=Math.acos(Math.max(-1,Math.min(1,a.x*b.x+a.z*b.z)))
      const adv=d(clean[i],clean[i+1])
      // 1% slack: the advance/turn ratio is a small-angle approximation
      if(turn<1e-9 || adv/turn > width*0.505) inverted++
    }
    // 4. this quad's far edge is the next quad's near edge - no seam
    if(i+1<quads.length){
      const gap=Math.max(d(q.l1,quads[i+1].l0), d(q.r1,quads[i+1].r0))
      worstSeam=Math.max(worstSeam,gap)
      if(gap>1e-9) seams++
    }
  }
}
console.log(`${tested} nasty hand-drawn roads\n`)
const row=(n,v,ok)=>console.log(`  ${ok?'PASS':'FAIL'}  ${n.padEnd(34)} ${v}`)
row('every step gets a quad', `${missing} roads short`, missing===0)
row('full width everywhere', `narrowest ${(worstW*100).toFixed(1)}%`, narrow===0)
row('folds only in genuine hairpins', `${inverted} unexplained`, inverted===0)
row('no seam between quads', `worst ${worstSeam.toExponential(1)}`, seams===0)
const ok = missing===0 && narrow===0 && inverted===0 && seams===0
console.log(ok?'\nPASS':'\nFAIL'); process.exit(ok?0:1)
