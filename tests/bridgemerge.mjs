import { loadEditor } from './editor.mjs'
const { run, els, handlers } = loadEditor()
const noop=()=>{}
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}
const at=(x,z)=>run(`(function(){const p=w2s(${x},${z});return{x:p.x,y:p.y}})()`)
const click=(x,z)=>{const p=at(x,z);handlers.mousedown({button:0,clientX:p.x,clientY:p.y,preventDefault:noop});
                    if(handlers['win:mouseup'])handlers['win:mouseup']()}
const centre=id=>run(`(function(){const i=getIsland(${JSON.stringify(id)});return{x:i.x,z:i.z}})()`)

console.log('The Bridge tool is gone; roads make bridges\n')
chk('no separate Bridge button', els['mode-bridge'] === undefined || !els['mode-bridge'].onclick)
chk('Road tool still there', typeof els['mode-road'].onclick === 'function')
chk('Demolish still there', typeof els['mode-demolish'].onclick === 'function')

els['mode-road'].onclick()
const before = run('map.bridges.length')
const linked = (a,b)=>run(`map.bridges.some(x=>(x.from===${JSON.stringify(a)}&&x.to===${JSON.stringify(b)})||(x.to===${JSON.stringify(a)}&&x.from===${JSON.stringify(b)}))`)
chk('about and projects are not linked yet', linked('about','projects')===false)

const a = centre('about'), b = centre('projects')
click(a.x, a.z)          // start a road on about
click(b.x, b.z)          // carry it across to projects
chk(`drawing across builds the bridge (${before} -> ${run('map.bridges.length')})`,
    run('map.bridges.length')===before+1)
chk('and it links the two islands drawn between', linked('about','projects')===true)
chk('drawing continues on the far island', run(`roadDraft ? roadDraft.island.id : null`)==='projects')

console.log('\nIt does not make the same bridge twice')
const n = run('map.bridges.length')
click(a.x, a.z)
click(b.x, b.z)
chk(`a second crossing adds nothing (${n} -> ${run('map.bridges.length')})`, run('map.bridges.length')===n)

console.log('\nThe network sees the new bridge')
const net = run(`(function(){
  const g = buildNetwork(worldSegments())
  return { segments:g.segments.length, loose:g.nodes.filter(x=>x.segments.length<2).length }
})()`)
console.log(`   ${net.segments} segments, ${net.loose} loose ends`)
chk('the new bridge is in the network', net.segments >= 12)

console.log('\nExport still round-trips')
run('finishRoadDraft(); renderExport()')
const out = run(`document.getElementById('out').value`)
const mod = await import('data:text/javascript,'+encodeURIComponent(out))
chk(`${mod.BRIDGES.length} bridges exported`, mod.BRIDGES.length===run('map.bridges.length'))
chk('about-projects is in the file',
    mod.BRIDGES.some(x=>[x.from,x.to].sort().join()==='about,projects'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
