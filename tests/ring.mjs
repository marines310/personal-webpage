const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
const C = await import(new URL('../src/world/curves.js', import.meta.url).href)
const S = await import(new URL('../src/world/shapes.js', import.meta.url).href)
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}
const d=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)

console.log('1. The ring is a loop, on land, and drivable\n')
for (const isl of L.ISLANDS) {
  const ring = L.getIslandRing(isl)
  if (!ring) { chk(`${isl.id} has no ring`, true); continue }
  const outline = L.islandOutline(isl)

  chk(`${isl.id.padEnd(9)} closes on itself`, d(ring[0], ring.at(-1)) < 0.01)

  // every point must be inland by at least half a road width
  let worstEdge = Infinity
  for (const p of ring) worstEdge = Math.min(worstEdge, S.distanceToEdge(outline, p.x, p.z))
  chk(`${isl.id.padEnd(9)} stays on land (closest approach to water ${worstEdge.toFixed(1)})`,
      worstEdge > 3.5, `${worstEdge.toFixed(2)}`)

  // and must not be so tight the car can't take it
  const tightest = Math.min(...C.turningRadii(ring).filter(r=>isFinite(r)))
  chk(`${isl.id.padEnd(9)} no hairpins (tightest radius ${tightest.toFixed(1)})`, tightest > 4)

  // solid surface
  const q = C.ribbonQuads(ring, 7), clean = C.dedupePath(ring)
  let minW=Infinity, seam=0
  for(let i=0;i<q.length;i++){
    minW=Math.min(minW,d(q[i].l0,q[i].r0))
    if(i+1<q.length) seam=Math.max(seam,d(q[i].l1,q[i+1].l0))
  }
  chk(`${isl.id.padEnd(9)} solid, full width, watertight`,
      q.length===clean.length-1 && minW>6.99 && seam<1e-9,
      `${q.length}/${clean.length-1} quads, width ${minW.toFixed(2)}`)
}

console.log('\n2. Bridge roads now END on the ring, not the centre')
for (const isl of L.ISLANDS) {
  const ring = L.getIslandRing(isl)
  if (!ring) continue
  for (const landing of L.getBridgeLandings(isl)) {
    const ctrl = L.approachControls(isl, landing.dirX, landing.dirZ, landing.def)
    const end = ctrl.at(-1)
    let nearest = Infinity
    for (const p of ring) nearest = Math.min(nearest, d(end, p))
    chk(`${isl.id.padEnd(9)} -> ${landing.other.id.padEnd(9)} meets the ring (${nearest.toFixed(2)} away)`,
        nearest < 1.2, `${nearest.toFixed(2)}`)
  }
}

console.log('\n3. Junctions are found where roads meet')
for (const isl of L.ISLANDS) {
  const j = L.getIslandJunctions(isl)
  const spurs = L.getBridgeLandings(isl).length
  chk(`${isl.id.padEnd(9)} ${j.length} junction(s) for ${spurs} spur(s)`, j.length >= spurs,
      `${j.length} < ${spurs}`)
  const onLand = j.every(p => S.distanceToEdge(L.islandOutline(isl), p.x, p.z) > 0)
  chk(`${isl.id.padEnd(9)} all junctions on land`, onLand)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
