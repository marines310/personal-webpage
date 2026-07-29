import { loadEditor, SRC } from './editor.mjs'
import { readFileSync } from 'fs'
const noop = () => {}
const ED = loadEditor()
const { C, run, els, handlers, counter } = ED


const setMode = m => els['mode-'+m].onclick()
const at = (wx,wz) => run(`(function(){const p=w2s(${wx},${wz});return{x:p.x,y:p.y}})()`)
const click = (wx,wz,opts={}) => {
  const p = at(wx,wz)
  handlers['mousedown']({ button:0, shiftKey:false, altKey:false, ...opts,
                          clientX:p.x, clientY:p.y, preventDefault:noop })
}
const release = () => handlers['win:mouseup'] && handlers['win:mouseup']({})
const key = k => handlers['win:keydown']({ key:k, target:{tagName:'BODY'}, preventDefault:noop })

let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}
const hub = () => run('map.islands.find(i=>i.id==="hub")')
const count = p => run(`(map.islands.find(i=>i.id==="hub").${p}||[]).length`)

console.log('Every tool, driven through real events\n')

console.log('1. Building tool')
setMode('building')
chk('mode switches', run('mode')==='building')
const b0=count('buildings'); click(8,8); release()
chk('click on island places a building', count('buildings')===b0+1)
click(200,200); release()
chk('click on open sea places nothing', count('buildings')===b0+1)
click(8,8); release()   // click the one we just made
chk('clicking an existing building selects it', run('sel && sel.kind')==='building')
key('Delete')
chk('Delete removes it', count('buildings')===b0)

console.log('\n2. District tool')
setMode('district')
const d0=count('districts'); click(6,6); release()
chk('click places a district', count('districts')===d0+1)
setMode('select'); click(6,6); release()
chk('district is selectable in Select mode', run('sel && sel.kind')==='district')
key('Delete')
chk('Delete removes it', count('districts')===d0)

console.log('\n3. Road tool')
setMode('road')
const r0=count('roads')
click(4,4); release(); click(10,6); release(); click(14,-2); release()
key('Enter')
chk('three clicks + Enter make one road', count('roads')===r0+1)
chk('it kept all three points', run('map.islands.find(i=>i.id==="hub").roads.at(-1).points.length')===3)
setMode('select'); click(10,6); release()
chk('road is clickable in Select mode', run('sel && sel.kind')==='road')
key('Delete')
chk('Delete removes it', count('roads')===r0)

console.log('\n4. Shape tool')
setMode('shape')
chk('hub has no outline yet', run('!map.islands.find(i=>i.id==="hub").outline'))
click(0,0); release()
chk('clicking makes it editable', run('!!map.islands.find(i=>i.id==="hub").outline'))
const pts=run('map.islands.find(i=>i.id==="hub").outline.length')
chk(`outline generated (${pts} points)`, pts>=3)

console.log('\n5. Bridges, made with the Road tool')
setMode('road')
const br0=run('map.bridges.length')
const cen = id => run(`(function(){const i=getIsland(${JSON.stringify(id)});return{x:i.x,z:i.z}})()`)
const ca = cen('skills'), cb = cen('blog')
const linked = () => run(`map.bridges.some(x=>[x.from,x.to].sort().join()==='blog,skills')`)
chk('skills and blog start unlinked', linked()===false)
click(ca.x,ca.z); release()
click(cb.x,cb.z); release()
chk(`drawing from one island to another bridges them (${br0} -> ${run('map.bridges.length')})`,
    run('map.bridges.length')===br0+1)
chk('  and it links the right pair', linked()===true)
run('finishRoadDraft()')

console.log('\n6. Snap')
els['snap-toggle'].onclick()
chk('snap turns on', run('snapOn')===true)
setMode('building')
click(7.3,-6.9); release()
const nb=run('map.islands.find(i=>i.id==="hub").buildings.at(-1)')
chk(`placed at (${nb.x}, ${nb.z}) - both on the 2-unit grid`, nb.x%2===0 && nb.z%2===0)
els['snap-toggle'].onclick()

console.log('\n7. Export still works after all that')
const out=run('generate()')
chk('produces output', typeof out==='string' && out.includes('export const ISLANDS'))
let ok=true
try{ new Function(out.replace(/export\s+const\s+/g,'const ')+';return{ISLANDS,BRIDGES}')() }catch(e){ ok=false }
chk('output is valid JavaScript', ok)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
