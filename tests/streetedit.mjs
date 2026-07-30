/**
 * Editing the streets the generator made.
 *
 * A town's street grid isn't stored anywhere - it's derived from the
 * island's shape every time it's asked for - so there was no object to
 * click, drag or delete. Clicking a street now hands it over: it's written
 * into the island's `roads` and becomes an ordinary road.
 *
 * The thing to be most suspicious of is the handover itself. If the street
 * moves at the moment you claim it, the tool is worse than useless, because
 * every street you touch shifts under the buildings already lining it. So
 * the shape is measured before and after, using the same function the
 * editor draws with.
 */
import { loadEditor } from './editor.mjs'

const { run, els, handlers } = loadEditor()
const noop = () => {}

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const at = (x, z) => run(`(function(){const p=w2s(${x},${z});return{x:p.x,y:p.y}})()`)
const down = (x, z, mod = {}) => {
  const p = at(x, z)
  handlers.mousedown({ button: 0, clientX: p.x, clientY: p.y, preventDefault: noop, ...mod })
}
const move = (x, z) => {
  const p = at(x, z)
  handlers.mousemove({ clientX: p.x, clientY: p.y, preventDefault: noop })
}
const up = () => handlers['win:mouseup'] && handlers['win:mouseup']()
const setMode = m => els['mode-' + m].onclick()

/** Paste a mapData.js back into the editor, the way you would by hand. */
const reload = text => run(`(function(){
  document.getElementById('in').value = ${JSON.stringify(text)}
  document.getElementById('load').onclick()
})()`)

const ID = 'projects'   // the EXPERIENCE island: a town, with a grid on it

// ---------------------------------------------------------------------------
console.log('1. Every generated street can be named\n')

const keys = run(`getTownGrid(getIsland('${ID}')).map(s=>s.key)`)
console.log(`   ${keys.length} streets: ${keys.join(' ')}`)
chk('the island has streets to edit', keys.length >= 3, `${keys.length}`)
chk('every one has a key', keys.every(k => typeof k === 'string' && k.length))
chk('the keys are unique', new Set(keys).size === keys.length)

// Same island, asked twice: the keys have to come back the same or a saved
// edit would attach itself to a different street next time.
const again = run(`getTownGrid(getIsland('${ID}')).map(s=>s.key)`)
chk('and they are stable between calls', JSON.stringify(again) === JSON.stringify(keys))

// ---------------------------------------------------------------------------
console.log('\n2. Clicking a street hands it over')

// Aim at the middle of the longest street, which is the furthest from the
// ring and from the other streets - so a miss means the pick is wrong,
// not that the click was ambiguous.
const target = run(`(function(){
  const isl = getIsland('${ID}')
  let best = null
  for (const st of getTownGrid(isl)) {
    const len = Math.hypot(st.points[1].x-st.points[0].x, st.points[1].z-st.points[0].z)
    if (!best || len > best.len) best = { st, len }
  }
  const st = best.st
  const curve = smoothRoad(st.points, st.width)
  const mid = curve[Math.floor(curve.length/2)]
  return {
    key: st.key, width: st.width, len: best.len,
    x: isl.x + mid.x, z: isl.z + mid.z,
    curve: curve.map(p => ({ x: p.x, z: p.z }))
  }
})()`)
console.log(`   aiming at ${target.key}, ${target.len.toFixed(1)} units long`)

const roadsBefore = run(`(getIsland('${ID}').roads||[]).length`)
const genBefore = run(`getTownGrid(getIsland('${ID}')).length`)
const plotsBefore = run(`getTownPlots(getIsland('${ID}')).length`)

setMode('select')
down(target.x, target.z)

const roadsAfter = run(`(getIsland('${ID}').roads||[]).length`)
chk(`it becomes a stored road (${roadsBefore} -> ${roadsAfter})`, roadsAfter === roadsBefore + 1)

const stored = run(`(function(){
  const r = (getIsland('${ID}').roads||[]).find(r=>r.streetKey==='${target.key}')
  return r ? { key: r.streetKey, width: r.width, points: r.points } : null
})()`)
chk('carrying the key of the street it came from', stored && stored.key === target.key,
    JSON.stringify(stored))
chk(`and its width (${stored && stored.width})`, stored && stored.width === target.width)
chk('with handles you can grab', stored && stored.points.length >= 2)

chk('it is selected, so the panel is about it',
    run(`sel && sel.kind==='road' && sel.island.id==='${ID}'
         && sel.island.roads[sel.index].streetKey==='${target.key}'`) === true)

const genAfter = run(`getTownGrid(getIsland('${ID}')).length`)
chk(`the generator stops drawing it (${genBefore} -> ${genAfter})`, genAfter === genBefore - 1)

// The important one. Same street, same place.
const drift = run(`(function(){
  const isl = getIsland('${ID}')
  const rd = isl.roads.find(r=>r.streetKey==='${target.key}')
  const now = roadCurveOf(isl, rd)
  const was = ${JSON.stringify(target.curve)}
  let worst = 0
  for (const p of now) {
    let best = Infinity
    for (let i = 1; i < was.length; i++) {
      const a = was[i-1], b = was[i]
      const dx = b.x-a.x, dz = b.z-a.z, l2 = dx*dx+dz*dz
      let t = l2 ? ((p.x-a.x)*dx + (p.z-a.z)*dz)/l2 : 0
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(p.x-(a.x+dx*t), p.z-(a.z+dz*t))
      if (d < best) best = d
    }
    if (best > worst) worst = best
  }
  return { worst, points: now.length, before: was.length }
})()`)
console.log(`   ${drift.before} points before, ${drift.points} after`)
// A tenth of a unit on a 5.5-wide street: two orders of magnitude below
// anything you could see. What's left is the two decimals the points are
// stored to.
chk(`the street does not move (worst ${drift.worst.toFixed(4)} units)`, drift.worst < 0.1,
    `${drift.worst}`)

const plotsAfter = run(`getTownPlots(getIsland('${ID}')).length`)
chk(`the buildings lining it stay put (${plotsBefore} -> ${plotsAfter})`,
    plotsAfter === plotsBefore, `${plotsBefore} vs ${plotsAfter}`)

// The other streets must be untouched. crowdsAnother() weighs each street
// against the ones already accepted, so filtering too early would let a
// street that had been rejected for shadowing this one suddenly appear.
const others = run(`getTownGrid(getIsland('${ID}')).map(s=>s.key)`)
chk('no other street appears or vanishes',
    JSON.stringify(others) === JSON.stringify(keys.filter(k => k !== target.key)),
    JSON.stringify(others))

// ---------------------------------------------------------------------------
console.log('\n3. And then you can reshape it')

// Handles are shown for the selected road whatever tool is out, so they
// have to be draggable with that tool too - the whole point is that you
// click a street and change it, without a detour through another mode.
const handle = run(`(function(){
  const isl = getIsland('${ID}')
  const rd = isl.roads.find(r=>r.streetKey==='${target.key}')
  const p = rd.points[0]
  return { x: isl.x + p.x, z: isl.z + p.z }
})()`)

down(handle.x, handle.z)
chk('grabbing a handle in Select starts a drag', run(`drag && drag.type==='roadPoint'`) === true)
move(handle.x + 14, handle.z + 14)
up()

const moved = run(`(function(){
  const isl = getIsland('${ID}')
  const rd = isl.roads.find(r=>r.streetKey==='${target.key}')
  return Math.hypot(isl.x + rd.points[0].x - ${handle.x},
                    isl.z + rd.points[0].z - ${handle.z})
})()`)
chk(`dragging it moves the street (${moved.toFixed(1)} units)`, moved > 4, `${moved}`)

// A street arrives with two ends and nothing between them, so without this
// you could move one but never bend one.
setMode('road')
const bend = run(`(function(){
  const isl = getIsland('${ID}')
  const rd = isl.roads.find(r=>r.streetKey==='${target.key}')
  const c = roadCurveOf(isl, rd)
  const mid = c[Math.floor(c.length/2)]
  return { was: rd.points.length, x: isl.x + mid.x, z: isl.z + mid.z }
})()`)
down(bend.x, bend.z, { altKey: true })
const nowPoints = run(`(function(){
  const rd = getIsland('${ID}').roads.find(r=>r.streetKey==='${target.key}')
  return rd.points.length
})()`)
chk(`Alt-click on the road adds a handle (${bend.was} -> ${nowPoints})`,
    nowPoints === bend.was + 1, `${nowPoints}`)

const addedInside = run(`(function(){
  const rd = getIsland('${ID}').roads.find(r=>r.streetKey==='${target.key}')
  // it must land BETWEEN two existing handles, not on the end
  return rd.points.length === 3
})()`)
chk('and it lands between the ends, not on one', addedInside === true)

// ---------------------------------------------------------------------------
console.log('\n4. Removing a street makes it stay removed')

// A taken-over street: dropping the stored copy alone would hand it back
// to the generator, so it has to be switched off as well.
setMode('demolish')
const hitTaken = run(`(function(){
  const isl = getIsland('${ID}')
  const rd = isl.roads.find(r=>r.streetKey==='${target.key}')
  const c = roadCurveOf(isl, rd)
  const mid = c[Math.floor(c.length/2)]
  return { x: isl.x + mid.x, z: isl.z + mid.z }
})()`)
down(hitTaken.x, hitTaken.z)

chk('the stored copy goes',
    run(`!(getIsland('${ID}').roads||[]).some(r=>r.streetKey==='${target.key}')`) === true)
chk('and the generator is told not to bring it back',
    run(`(getIsland('${ID}').noStreets||[]).includes('${target.key}')`) === true)
chk('so it really is gone',
    run(`!getTownGrid(getIsland('${ID}')).some(s=>s.key==='${target.key}')`) === true)

// A street straight off the grid: nothing to splice, only the key to record
const plain = run(`(function(){
  const isl = getIsland('${ID}')
  const st = getTownGrid(isl)[0]
  const c = smoothRoad(st.points, st.width)
  const mid = c[Math.floor(c.length/2)]
  return { key: st.key, x: isl.x + mid.x, z: isl.z + mid.z }
})()`)
const gridBefore = run(`getTownGrid(getIsland('${ID}')).length`)
down(plain.x, plain.z)
const gridNow = run(`getTownGrid(getIsland('${ID}')).length`)
chk(`clicking a generated street removes it (${gridBefore} -> ${gridNow})`,
    gridNow === gridBefore - 1, `${gridNow}`)
chk('recorded by key, since there is no object to delete',
    run(`(getIsland('${ID}').noStreets||[]).includes('${plain.key}')`) === true)

// ---------------------------------------------------------------------------
console.log('\n5. Removals survive a save and reload')

const text = run('generate()')
chk('the export mentions the removed streets', text.includes(plain.key), plain.key)

reload(text)

const reloaded = run(`(function(){
  const isl = getIsland('${ID}')
  return { gone: (isl.noStreets||[]).length,
           streets: getTownGrid(isl).length,
           mine: (isl.roads||[]).filter(r=>r.streetKey).length }
})()`)
chk(`removals come back (${reloaded.gone} recorded)`, reloaded.gone === 2, JSON.stringify(reloaded))
chk('and the grid is short by exactly those two',
    reloaded.streets === keys.length - 2, `${reloaded.streets} of ${keys.length}`)

// Reload, then take one over and check the key round-trips
const freshKey = run(`getTownGrid(getIsland('${ID}'))[0].key`)
run(`(function(){
  const isl = getIsland('${ID}')
  const st = getTownGrid(isl).find(s=>s.key==='${freshKey}')
  takeOverStreet(isl, st)
  refresh()
})()`)
const text2 = run('generate()')
chk(`a taken-over street exports its key (${freshKey})`,
    text2.includes(`streetKey: '${freshKey}'`), freshKey)

els['in'].value = text2
els['load'].onclick()
chk('and comes back as a street, not an anonymous road',
    run(`(getIsland('${ID}').roads||[]).some(r=>r.streetKey==='${freshKey}')`) === true)

// ---------------------------------------------------------------------------
console.log('\n6. Putting them back')

run(`(function(){ const isl = getIsland('${ID}'); delete isl.noStreets; refresh() })()`)
const restored = run(`getTownGrid(getIsland('${ID}')).length`)
chk(`clearing the removals restores the grid (${restored} streets)`,
    restored === keys.length - 1, `${restored}`)
console.log('   (one short, because one is still taken over and drawn as a road)')

// ---------------------------------------------------------------------------
console.log('\n7. A street you took over is still a street')

// This is the part that isn't visible in the editor at all. World.js decides
// what gets pavements, crossings, signals and building frontages by asking
// `road.street || road.ring || road.auto`. If a taken-over street came back
// as a plain road, everything along it would quietly disappear the moment
// you touched it - and the editor would look completely normal.
const LAYOUT = await import('../src/world/islandLayout.js')
const MAPDATA = await import('../src/world/mapData.js')

const clean = structuredClone(MAPDATA.ISLANDS.find(i => i.id === ID))
const st0 = LAYOUT.getTownGrid(clean)[0]

const before = {
  roads: LAYOUT.getIslandRoads(clean),
  junctions: LAYOUT.getIslandJunctions(clean).length,
  signals: LAYOUT.getTrafficSignals(clean).length,
  plots: LAYOUT.getTownPlots(clean).length
}

const claimed = structuredClone(clean)
claimed.roads = claimed.roads || []
claimed.roads.push({
  streetKey: st0.key,
  width: st0.width,
  points: st0.points.map(p => ({ x: +p.x.toFixed(2), z: +p.z.toFixed(2) }))
})

const after = {
  roads: LAYOUT.getIslandRoads(claimed),
  junctions: LAYOUT.getIslandJunctions(claimed).length,
  signals: LAYOUT.getTrafficSignals(claimed).length,
  plots: LAYOUT.getTownPlots(claimed).length
}

const mine = after.roads.find(r => r.streetKey === st0.key)
chk('it comes out of getIslandRoads marked as a street', !!mine && mine.street === true)
chk(`at street width, not road width (${mine && mine.width})`,
    !!mine && mine.width === LAYOUT.DEFAULT_STREET_WIDTH)
chk(`the same number of roads as before (${before.roads.length} -> ${after.roads.length})`,
    after.roads.length === before.roads.length)
chk(`the junction patches are unchanged (${before.junctions} -> ${after.junctions})`,
    after.junctions === before.junctions, `${before.junctions} vs ${after.junctions}`)
chk(`the traffic signals are unchanged (${before.signals} -> ${after.signals})`,
    after.signals === before.signals, `${before.signals} vs ${after.signals}`)
chk(`the building frontages are unchanged (${before.plots} -> ${after.plots})`,
    after.plots === before.plots, `${before.plots} vs ${after.plots}`)

// And a road without a key must NOT be promoted: hand-drawn roads have
// never had pavements, and starting now would be a surprise.
const handDrawn = structuredClone(clean)
handDrawn.roads = [{ points: st0.points.map(p => ({ x: p.x, z: p.z })), width: st0.width }]
chk('a hand-drawn road in the same place is not made into a street',
    LAYOUT.getIslandRoads(handDrawn).filter(r => r.street).length ===
    before.roads.filter(r => r.street).length)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
