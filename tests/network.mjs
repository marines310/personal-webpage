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

// ---------------------------------------------------------------------------
console.log('\nThe road network and the traffic lights agree what a junction is')

// THE RULE, stated as a measurement.
//
// A lane runs from one junction to the next, so two junctions on the same
// road thirteen units apart make a thirteen-unit lane, and a thirteen-unit
// lane holds exactly one vehicle. Stop on it and nothing behind you can
// enter: it is a plug, not capacity. Shorter than LANE_MIN_LENGTH and it is
// worse - no lane is built there at all and the road has a hole in it.
//
// Meanwhile getTrafficSignals() has always clustered junctions within
// SIGNAL_MERGE_DISTANCE and given them ONE set of lights, because that is
// what a driver sees. The two halves of the system disagreed, and the gap
// between the two opinions is where the traffic jammed.
//
// So: on any one road, two junctions are either the SAME junction - close
// enough that buildNetwork() merges them into one node - or they are far
// enough apart to hold a queue. Nothing in between.
const onSegment = net.segments.map(() => [])
for (const node of net.nodes) {
  for (const seg of node.segments) onSegment[seg].push(node)
}

const tooClose = []
onSegment.forEach((nodes, seg) => {
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      const gap = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z)
      if (gap >= L.NODE_MERGE_TOLERANCE && gap < L.SIGNAL_MERGE_DISTANCE) {
        tooClose.push({ seg, gap, kind: net.segments[seg].kind,
                        island: net.segments[seg].island })
      }
    }
  }
})

console.log(`  ${tooClose.length} pairs of junctions on one road are ` +
            `between ${L.NODE_MERGE_TOLERANCE} and ${L.SIGNAL_MERGE_DISTANCE} apart`)
chk('no road has two junctions close enough to leave a stub between them',
    tooClose.length === 0,
    tooClose.map(t => `${t.island || t.kind} ${t.gap.toFixed(1)}`).join(', '))

// And the consequence, measured on the lanes rather than on the nodes -
// because the lanes are what the vehicles actually queue on.
const lanes = L.getLaneNetwork().lanes
const lengths = lanes.map(l => l.length).sort((a, b) => a - b)
const single = lengths.filter(len => len < L.TRAFFIC_HEADWAY * 2.5)

console.log(`  ${lanes.length} lanes, shortest ${lengths[0].toFixed(1)}, ` +
            `median ${lengths[lengths.length >> 1].toFixed(1)}`)
chk(`no lane holds only one vehicle (shortest ${lengths[0].toFixed(1)}, ` +
    `needs ${(L.TRAFFIC_HEADWAY * 2.5).toFixed(1)})`,
    single.length === 0, `${single.length} single-slot lanes`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail?1:0)
