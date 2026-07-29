import { loadEditor } from './editor.mjs'
const { run } = loadEditor()
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z)
const clickBtn = (label) => run(`(function(){
  const b=[...document.getElementById('props').children].find(e=>(e.textContent||'')===${JSON.stringify(label)});
  if(!b) return 'missing'; b.onclick(); return 'ok';
})()`)
const selectIsland = id => run(`sel={kind:'island',island:getIsland(${JSON.stringify(id)})}; refresh(); 'ok'`)
const ringOf = id => run(`(getIslandRing(getIsland(${JSON.stringify(id)}))||[]).map(p=>({x:p.x,z:p.z}))`)

console.log('Taking the ring over\n')
const before = ringOf('contact')
chk('contact has an automatic ring', before.length > 100)

selectIsland('contact')
chk('the Edit button is offered', clickBtn('Edit the ring road')==='ok')

const stored = run(`(function(){const r=getStoredRing(getIsland('contact')); return r? r.points.length : 0})()`)
chk(`baked down to ${stored} draggable handles (not hundreds)`, stored>=16 && stored<=32, `${stored}`)

const after = ringOf('contact')
// compare shapes by sampling: for each point of the old ring, distance to the new loop
let worst=0
for (const p of before) {
  let best=Infinity
  for (const q of after) best=Math.min(best, dist(p,q))
  worst=Math.max(worst,best)
}
chk(`shape held when taken over (worst ${worst.toFixed(2)} units)`, worst < 0.9, `${worst.toFixed(2)}`)
chk('exactly one stored ring, not stacked copies',
    run(`(getIsland('contact').roads||[]).filter(r=>r.isRing).length`)===1)

console.log('\nDragging a handle')
run(`(function(){
  const r=getStoredRing(getIsland('contact'));
  r.points[3]={x:r.points[3].x*0.45, z:r.points[3].z*0.45};
  refresh();
})()`)
const moved = ringOf('contact')
let shift=0
for (let i=0;i<Math.min(moved.length,after.length);i++) shift=Math.max(shift, dist(moved[i],after[i]))
chk(`the ring actually moved (max ${shift.toFixed(1)} units)`, shift>2)
chk('still a closed loop', dist(moved[0], moved[moved.length-1]) < 0.01)

console.log('\nRemoving the ring')
selectIsland('contact')
chk('Remove button offered', clickBtn('Remove the ring road')==='ok')
chk('ring gone', ringOf('contact').length===0)
chk('the baked road went with it', run(`(getIsland('contact').roads||[]).filter(r=>r.isRing).length`)===0)
chk('bridge road still exists', run(`approachRoads(getIsland('contact')).length`)>=0)

selectIsland('contact')
chk('and it can be brought back', clickBtn('Bring the ring road back')==='ok')
chk('ring is back', ringOf('contact').length>100)

console.log('\nSurvives export and reload')
run('renderExport()')
const out = run(`document.getElementById('out').value`)
selectIsland('contact'); clickBtn('Edit the ring road')
run('renderExport()')
const out2 = run(`document.getElementById('out').value`)
chk('export marks the ring', out2.includes('isRing: true'))
const mod = await import('data:text/javascript,'+encodeURIComponent(out2))
const isl = mod.ISLANDS.find(i=>i.id==='contact')
chk('exported ring has its points', (isl.roads||[]).some(r=>r.isRing && r.points.length>=10))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
