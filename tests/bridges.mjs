import { loadEditor } from './editor.mjs'
const { run, els, handlers } = loadEditor()
const noop=()=>{}
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}
const at = (wx,wz) => run(`(function(){const p=w2s(${wx},${wz});return{x:p.x,y:p.y}})()`)
const click = (wx,wz) => { const p=at(wx,wz)
  handlers.mousedown({ button:0, clientX:p.x, clientY:p.y, preventDefault:noop })
  handlers.mouseup && handlers.mouseup({ button:0, clientX:p.x, clientY:p.y, preventDefault:noop }) }
const setMode = m => els['mode-'+m].onclick()

console.log('Can bridges be made, selected, or deleted?\n')
const before = run('map.bridges.length')
console.log(`  starting bridges: ${before}`)

// Bridges are made with the Road tool now - there is no Bridge mode
chk('the Bridge tool is gone', !els['mode-bridge'] || !els['mode-bridge'].onclick)
setMode('road')
chk('the Road tool makes them instead', run('mode') === 'road')

// Try to connect two islands that aren't linked yet: about <-> projects
const a = run(`(function(){const i=getIsland('about'); return {x:i.x,z:i.z}})()`)
const b = run(`(function(){const i=getIsland('projects'); return {x:i.x,z:i.z}})()`)
click(a.x, a.z)
click(b.x, b.z)
const after = run('map.bridges.length')
chk(`clicking two islands makes a bridge (${before} -> ${after})`, after === before + 1, `${after}`)
if (after === before + 1) {
  const made = run('map.bridges[map.bridges.length-1]')
  chk(`  it links the two clicked (${made.from} - ${made.to})`,
      [made.from,made.to].sort().join()==='about,projects')
}

console.log('\nSelecting an existing bridge')
setMode('select')
// click the midpoint of the hub-about bridge
const mid = run(`(function(){
  const h=getIsland('hub'), o=getIsland('about');
  return { x:(h.x+o.x)/2, z:(h.z+o.z)/2 };
})()`)
click(mid.x, mid.z)
const sel = run('sel ? sel.kind : null')
chk(`clicking a bridge selects it (got ${sel})`, sel === 'bridge', `selection is ${sel}`)

console.log('\nWhat can you change about a bridge?')
// Walk the panel tree for real inputs - checking label text would only be
// testing the shim, since it doesn't roll textContent up from children.
const inputs = run(`(function(){
  const found=[]
  const walk=(el)=>{ for(const c of (el.children||[])) {
    if (c.type) found.push({ type:c.type, value:c.value, checked:c.checked, has:typeof c.onchange==='function' })
    walk(c)
  }}
  walk(document.getElementById('props'))
  return found
})()`)
chk(`a deck width box, wired up (value ${inputs.find(i=>i.type==='number')?.value})`,
    inputs.some(i=>i.type==='number' && i.has), JSON.stringify(inputs))
chk('a railings checkbox, wired up',
    inputs.some(i=>i.type==='checkbox' && i.has))
const labels = run(`[...document.getElementById('props').children].map(e=>e.textContent||'')`)
chk('Delete bridge offered', labels.some(f=>/Delete bridge/i.test(f)))

console.log('\nThe controls actually do something')
const clamped = run(`(function(){
  const found=[]
  const walk=(el)=>{ for(const c of (el.children||[])) { if(c.type) found.push(c); walk(c) } }
  walk(document.getElementById('props'))
  const num = found.find(i=>i.type==='number')
  num.value = '3'; num.onchange();          // absurdly narrow
  const rail = found.find(i=>i.type==='checkbox')
  rail.checked = false; rail.onchange();
  return { width: map.bridges[sel.index].width, railings: map.bridges[sel.index].railings }
})()`)
chk(`a 3-wide deck is clamped to 7.5 (got ${clamped.width}) - it must stay wider than the road`,
    clamped.width === 7.5, String(clamped.width))
chk('railings can be turned off', clamped.railings === false)
run('renderExport()')
chk('railings: false reaches the export', /railings: false/.test(run(`document.getElementById('out').value`)))

console.log('\nChanging and deleting')
const idx = run('sel.index')
run(`(function(){
  const b=[...document.getElementById('props').children].find(e=>(e.textContent||'')==='Reverse direction');
  b.onclick();
})()`)
const flipped = run(`map.bridges[${idx}]`)
chk(`Reverse swaps the ends (${flipped.from} -> ${flipped.to})`, flipped.from==='about' && flipped.to==='hub')

run(`map.bridges[${idx}].width = 14; renderExport();`)
const out = run(`document.getElementById('out').value`)
chk('a changed deck width reaches the export', /width: 14/.test(out))

const n = run('map.bridges.length')
run(`sel={kind:'bridge',index:${idx}}; deleteSelection();`)
chk(`Delete removes it (${n} -> ${run('map.bridges.length')})`, run('map.bridges.length')===n-1)
chk('nothing left selected', run('sel')===null)

console.log('\nAnd the export still parses')
run('renderExport()')
const out2 = run(`document.getElementById('out').value`)
const mod = await import('data:text/javascript,'+encodeURIComponent(out2))
chk(`valid JavaScript, ${mod.BRIDGES.length} bridges`, Array.isArray(mod.BRIDGES))

console.log(`\n${pass} passed, ${fail} failed`)
