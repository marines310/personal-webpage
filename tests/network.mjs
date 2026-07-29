const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
let pass=0,fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}

const net = L.getRoadNetwork()
console.log(`The world as a network: ${net.segments.length} segments, ${net.nodes.length} nodes\n`)
const kinds = {}
for (const s of net.segments) kinds[s.kind] = (kinds[s.kind]||0)+1
console.log('  segments by kind:', JSON.stringify(kinds), '\n')

chk('one segment per bridge', kinds.bridge === L.BRIDGES.length, `${kinds.bridge} vs ${L.BRIDGES.length}`)
chk('one ring per island that has one',
    kinds.ring === L.ISLANDS.filter(i=>L.getIslandRing(i)).length)
chk('no segment is empty', net.segments.every(s=>s.points.length>=2))

console.log('\nAre the bridges actually joined to the rings?')
let junctions=0, deadEnds=0
for (const n of net.nodes) (n.segments.length>=2 ? junctions++ : deadEnds++)
console.log(`  ${junctions} junctions, ${deadEnds} dead ends`)

// every bridge should join a ring at BOTH ends
for (let i=0;i<net.segments.length;i++){
  const seg = net.segments[i]
  if (seg.kind !== 'bridge') continue
  const touching = net.nodes.filter(n=>n.segments.includes(i))
  const joined = touching.filter(n=>n.segments.length>=2)
  chk(`bridge ${seg.bridge.from}-${seg.bridge.to} joins the network at both ends`,
      joined.length>=2, `${joined.length} joined of ${touching.length} ends`)
}

console.log('\nCan you drive from the hub to everywhere?')
// walk the graph
const adj = net.segments.map(()=>new Set())
for (const n of net.nodes)
  for (const a of n.segments) for (const b of n.segments) if(a!==b) adj[a].add(b)
const start = net.segments.findIndex(s=>s.island==='hub')
const seen = new Set([start]); const queue=[start]
while(queue.length){ const cur=queue.shift(); for(const nx of adj[cur]) if(!seen.has(nx)){seen.add(nx);queue.push(nx)} }
chk(`every road reachable from hub (${seen.size}/${net.segments.length})`,
    seen.size===net.segments.length,
    'unreachable: '+net.segments.map((s,i)=>seen.has(i)?null:`${s.kind}:${s.island||s.bridge?.from+'-'+s.bridge?.to}`).filter(Boolean).join(', '))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
