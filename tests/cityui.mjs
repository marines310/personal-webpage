import { loadEditor } from './editor.mjs'
const { run, els, handlers } = loadEditor()
const noop=()=>{}
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}
const at=(x,z)=>run(`(function(){const p=w2s(${x},${z});return{x:p.x,y:p.y}})()`)
const down=(x,z,mod={})=>{const p=at(x,z);handlers.mousedown({button:0,clientX:p.x,clientY:p.y,preventDefault:noop,...mod})}
const move=(x,z)=>{const p=at(x,z);handlers.mousemove({clientX:p.x,clientY:p.y,preventDefault:noop})}
const up=()=>handlers['win:mouseup'] ? handlers['win:mouseup']() : null
const setMode=m=>els['mode-'+m].onclick()

console.log('1. Demolish removes whatever you click\n')
chk('a Demolish tool exists', typeof els['mode-demolish'].onclick === 'function')
setMode('demolish'); chk('it activates', run('mode')==='demolish')

const nBuildings = run(`(getIsland('blog').buildings||[]).length`)
if (nBuildings) {
  const b = run(`(function(){const i=getIsland('blog');const bd=i.buildings[0];return{x:i.x+bd.x,z:i.z+bd.z}})()`)
  down(b.x,b.z)
  chk(`clicking a building removes it (${nBuildings} -> ${run(`(getIsland('blog').buildings||[]).length`)})`,
      run(`(getIsland('blog').buildings||[]).length`) === nBuildings-1)
} else console.log('  (no buildings on blog to try)')

const bridgesBefore = run('map.bridges.length')
const over = run(`(function(){
  const h=getIsland('hub'), o=getIsland('about')
  const dx=o.x-h.x, dz=o.z-h.z, L=Math.hypot(dx,dz)
  const hs=rayDistanceToBoundary(outlineOf(h),dx,dz), os=rayDistanceToBoundary(outlineOf(o),-dx,-dz)
  const t=hs+(L-hs-os)/2
  return { x:h.x+dx/L*t, z:h.z+dz/L*t }
})()`)
down(over.x, over.z)
chk(`clicking a bridge removes it (${bridgesBefore} -> ${run('map.bridges.length')})`,
    run('map.bridges.length')===bridgesBefore-1)

console.log('\n2. Drag draws a straight road')
setMode('road')
const roadsBefore = run(`(getIsland('projects').roads||[]).length`)

// Both ends are taken FROM the street grid, three units off the centre line
// of a real street, rather than measured out from the island's middle.
//
// The hardcoded version drifted: it aimed at coordinates that happened to
// have a street near them on the map of the day, and when the grid was next
// laid out differently the same two points landed mid-block. What was being
// checked - that a road drawn across a town joins the streets - then failed
// for a reason that had nothing to do with it. Ask the grid where it is.
const drag = run(`(function(){
  const isl = getIsland('projects')
  const grid = getTownGrid(isl)
  const beside = (street) => {
    const c = smoothRoad(street.points, street.width)
    const p = c[Math.floor(c.length / 2)]
    return { x: isl.x + p.x + 3, z: isl.z + p.z }
  }
  // The grid AS IT STANDS NOW, kept for the check further down. Drawing a
  // road changes it: streets are laid out around the roads already there,
  // so a new one can move a street that was fitting around its absence.
  globalThis.gridBefore = grid.map(s =>
    smoothRoad(s.points, s.width).map(q => ({ x: isl.x + q.x, z: isl.z + q.z })))
  return { from: beside(grid[0]), to: beside(grid[grid.length - 1]) }
})()`)

down(drag.from.x, drag.from.z)
move((drag.from.x + drag.to.x) / 2, (drag.from.z + drag.to.z) / 2)
move(drag.to.x, drag.to.z)
up()
const roadsAfter = run(`(getIsland('projects').roads||[]).length`)
chk(`press-drag-release makes one road (${roadsBefore} -> ${roadsAfter})`, roadsAfter===roadsBefore+1)
const made = run(`(function(){const r=(getIsland('projects').roads||[]); return r.length? r[r.length-1].points.length : 0})()`)
chk(`and it is a straight run, not a pile of points (${made} points)`, made===2, `${made}`)

console.log('\n3. Ends snap onto existing roads')
setMode('road')
// aim a point NEAR the ring but not on it, and see if it gets pulled on
const probe = run(`(function(){
  const i = getIsland('skills')
  const ring = getIslandRing(i)
  const p = ring[10]
  return { islandX:i.x, islandZ:i.z, ringX:p.x, ringZ:p.z }
})()`)
const snapped = run(`(function(){
  const i = getIsland('skills')
  const off = { x: ${JSON.stringify(0)}, z: 0 }
  const near = { x: ${probe.ringX} + 2.5, z: ${probe.ringZ} + 2.5 }
  const got = snapToRoads(i, near)
  return { got, want: { x: ${probe.ringX}, z: ${probe.ringZ} },
           moved: Math.hypot(got.x-near.x, got.z-near.z) }
})()`)
chk(`a point 3.5 units off the ring is pulled onto it (moved ${snapped.moved.toFixed(2)})`,
    snapped.got.snapped === true && snapped.moved > 1, JSON.stringify(snapped))

const far = run(`(function(){
  const i = getIsland('skills')
  const got = snapToRoads(i, { x: 2, z: 2 })   // middle of the island, nothing near
  return got.snapped
})()`)
chk('a point in open ground is left alone', far === false)

// The road drawn in section 2 was started and finished beside a generated
// street, so both its ends should have been pulled onto one. This used not
// to happen: generated streets weren't in the segment list, so you could
// draw a road straight across a town and it joined nothing.
//
// Measured against the grid as it was WHEN THE ROAD WAS DRAWN, because that
// is what the ends were snapped to. Asking for the grid again here gets a
// different answer - the new road is one of the roads the streets have to
// fit around, so laying it down can move one.
const onGrid = run(`(function(){
  const isl = getIsland('projects')
  const rd = isl.roads[isl.roads.length - 1]
  let joined = 0
  for (const p of rd.points) {
    for (const c of globalThis.gridBefore) {
      const n = nearestOnSeg(c, isl.x + p.x, isl.z + p.z)
      if (n && n.d < 0.5) { joined++; break }
    }
  }
  return { joined, of: rd.points.length }
})()`)
chk(`the road drawn across a town joins the street grid (${onGrid.joined}/${onGrid.of} ends)`,
    onGrid.joined === onGrid.of, JSON.stringify(onGrid))

console.log('\n4. Connections are shown')
const net = run(`(function(){
  const n = buildNetwork(worldSegments())
  return { segments:n.segments.length, nodes:n.nodes.length,
           streets:worldSegments().filter(s=>s.kind==='street').length,
           joined:n.nodes.filter(x=>x.segments.length>=2).length,
           loose:n.nodes.filter(x=>x.segments.length<2).length }
})()`)
console.log(`   ${net.segments} segments, ${net.nodes} nodes: ${net.joined} joined, ${net.loose} loose`)
chk('the editor can build the network', net.segments > 0 && net.nodes > 0)
chk(`generated streets are in the network (${net.streets})`, net.streets > 0, `${net.streets}`)
chk('a Links toggle exists', typeof els['links-toggle'].onclick === 'function')
run('draw()')
chk('drawing with links on does not throw', true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
