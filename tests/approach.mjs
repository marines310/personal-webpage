const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
const C = await import(new URL('../src/world/curves.js', import.meta.url).href)
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}
const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)

console.log('1. Nothing changed for maps with no overrides\n')
// Baseline: capture the roads the game draws right now
const before = L.getBridgeRoadPaths().map(p=>p.points.map(q=>({...q})))
for (const isl of L.ISLANDS) {
  const autos = L.getIslandRoads(isl).filter(r=>r.auto)
  const landings = L.getBridgeLandings(isl)
  chk(`${isl.id.padEnd(9)} still has ${landings.length} auto approach(es)`,
      autos.length===landings.length, `${autos.length}`)
  chk(`${isl.id.padEnd(9)} none marked edited yet`, autos.every(r=>!r.edited))
  chk(`${isl.id.padEnd(9)} each knows its bridge`, autos.every(r=>!!r.bridgeTo))
}

console.log('\n2. Baking an approach reproduces it EXACTLY')
// Bake every approach on blog into stored points, then compare
const blog = L.getIsland('blog')
for (const landing of L.getBridgeLandings(blog)) {
  const generated = L.approachControls(blog, landing.dirX, landing.dirZ, landing.def)
  const otherId = landing.def.from===blog.id ? landing.def.to : landing.def.from
  blog.approaches = [{ to: otherId, points: generated.map(p=>({...p})) }]
  const stored = L.approachControls(blog, landing.dirX, landing.dirZ, landing.def)
  let worst=0
  for(let i=0;i<generated.length;i++) worst=Math.max(worst, d(generated[i], stored[i]))
  chk(`blog -> ${otherId}: baked shape identical (worst ${worst.toExponential(1)})`, worst<1e-12)
}

console.log('\n3. The drawn bridge road is unchanged by baking')
const after = L.getBridgeRoadPaths().map(p=>p.points)
let worstRoad=0
for(let i=0;i<before.length;i++){
  chk(`bridge ${i} same number of points`, before[i].length===after[i].length,
      `${before[i].length} vs ${after[i].length}`)
  for(let k=0;k<Math.min(before[i].length,after[i].length);k++)
    worstRoad=Math.max(worstRoad, d(before[i][k], after[i][k]))
}
chk(`every bridge road pixel-identical (worst ${worstRoad.toExponential(1)})`, worstRoad<1e-9)

console.log('\n4. A MOVED approach still meets the bridge deck')
// Drag the middle of blog's approach a long way sideways
const app = blog.approaches[0]
const mid = Math.floor(app.points.length/2)
app.points[mid] = { x: app.points[mid].x + 9, z: app.points[mid].z - 7 }
// and try to break the join by moving the shore end too
app.points[0] = { x: 0, z: 0 }

for (const p of L.getBridgeRoadPaths()) {
  const q = C.ribbonQuads(p.points, p.width)
  const clean = C.dedupePath(p.points)
  let minW=Infinity, seam=0
  for(let i=0;i<q.length;i++){
    minW=Math.min(minW, d(q[i].l0,q[i].r0))
    if(i+1<q.length) seam=Math.max(seam, d(q[i].l1,q[i+1].l0))
  }
  chk(`road still solid (${q.length} quads, width ${minW.toFixed(2)}, seam ${seam.toExponential(1)})`,
      q.length===clean.length-1 && minW>p.width-1e-6 && seam<1e-9)
}
// the pinned shore point must have been ignored
const blogLanding = L.getBridgeLandings(blog)[0]
const ctrl = L.approachControls(blog, blogLanding.dirX, blogLanding.dirZ, blogLanding.def)
const reach = Math.max(2, blogLanding.shore-1)
const expect = { x: blogLanding.dirX*reach, z: blogLanding.dirZ*reach }
chk(`shore end pinned to the landing despite a bad saved value (off by ${d(ctrl[0],expect).toExponential(1)})`,
    d(ctrl[0], expect) < 1e-9)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
