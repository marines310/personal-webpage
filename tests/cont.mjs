const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
const C = await import(new URL('../src/world/curves.js', import.meta.url).href)
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}

const paths = L.getBridgeRoadPaths()
chk(`one road per bridge (${paths.length} of ${L.BRIDGES.length})`, paths.length===L.BRIDGES.length)

console.log()
for (let i=0;i<paths.length;i++){
  const def = L.BRIDGES[i]
  const p = paths[i].points
  const a = L.getIsland(def.from), b = L.getIsland(def.to)

  // Ends on each island's ring road (or its centre, if it has no ring)
  const distToRing = (isl, pt) => {
    const ring = L.getIslandRing(isl)
    if (!ring) return Math.hypot(pt.x-isl.x, pt.z-isl.z)
    let best = Infinity
    for (const q of ring) best = Math.min(best, Math.hypot(pt.x-(isl.x+q.x), pt.z-(isl.z+q.z)))
    return best
  }
  const startAtA = distToRing(a, p[0])
  const endAtB = distToRing(b, p[p.length-1])

  // No gaps: every step should be small
  let maxStep=0
  for(let k=1;k<p.length;k++) maxStep=Math.max(maxStep, Math.hypot(p[k].x-p[k-1].x, p[k].z-p[k-1].z))

  // Does the road stay on the bridge deck? Measure the worst sideways
  // deviation from the straight centre line, over the span of the deck.
  const dx=b.x-a.x, dz=b.z-a.z, d=Math.hypot(dx,dz), ux=dx/d, uz=dz/d
  const aShore=L.shoreDistance(a,dx,dz), bShore=L.shoreDistance(b,-dx,-dz)
  const s0=aShore-1.5, s1=d-bShore+1.5
  let worstOff=0
  for(const q of p){
    const along=(q.x-a.x)*ux + (q.z-a.z)*uz
    if(along < s0+0.5 || along > s1-0.5) continue    // only the deck span
    const off=Math.abs(-(q.x-a.x)*uz + (q.z-a.z)*ux)
    worstOff=Math.max(worstOff, off)
  }

  console.log(`  ${def.from} -> ${def.to}: ${p.length} pts, start ${startAtA.toFixed(2)} from A's ring, end ${endAtB.toFixed(2)} from B's ring`)

  chk(`   starts on ${def.from}'s ring`, startAtA < 1.5)
  chk(`   ends on ${def.to}'s ring`, endAtB < 1.5)
  chk(`   no gaps (largest step ${maxStep.toFixed(2)})`, maxStep < 3)
  chk(`   stays on the deck (max ${worstOff.toFixed(3)} off centre, deck half-width 2.8)`, worstOff < 1.0)
}

console.log('\nRibbon is still valid everywhere')
let inverted=0, quads=0
for(const path of paths){
  const qs=C.ribbonQuads(path.points, path.width)
  quads+=qs.length
  const up=(a,b,c)=>(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)
  for(const q of qs) if(up(q.l0,q.r0,q.l1)<=0||up(q.l1,q.r0,q.r1)<=0) inverted++
}
chk(`${quads} quads, ${inverted} inverted`, inverted===0)

console.log('\nCorner smoothing actually softened the joins')
// compare turn angle at the sharpest point, smoothed vs unsmoothed
const raw = [{x:0,z:0},{x:0,z:10},{x:6,z:16},{x:20,z:16}]
const sharpest = (pts)=>{
  let worst=0
  for(let i=1;i<pts.length-1;i++){
    const ax=pts[i].x-pts[i-1].x, az=pts[i].z-pts[i-1].z
    const bx=pts[i+1].x-pts[i].x, bz=pts[i+1].z-pts[i].z
    const la=Math.hypot(ax,az), lb=Math.hypot(bx,bz)
    if(!la||!lb) continue
    const dot=Math.max(-1,Math.min(1,(ax*bx+az*bz)/(la*lb)))
    worst=Math.max(worst, Math.acos(dot)*180/Math.PI)
  }
  return worst
}
const before=sharpest(raw), after=sharpest(C.chaikinSmooth(raw,2))
console.log(`  sharpest turn ${before.toFixed(1)}deg -> ${after.toFixed(1)}deg`)
chk('corners are rounded', after < before*0.6)
chk('endpoints preserved', (()=>{const s=C.chaikinSmooth(raw,2);return s[0].x===0&&s[0].z===0&&s.at(-1).x===20&&s.at(-1).z===16})())
chk('a straight line stays straight', (()=>{
  const line=[{x:0,z:0},{x:0,z:5},{x:0,z:10},{x:0,z:15}]
  return C.chaikinSmooth(line,2).every(p=>Math.abs(p.x)<1e-9)
})())

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
