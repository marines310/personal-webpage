// Serve the built site exactly as GitHub Pages would and ask for every
// file it references. A 404 here is a 404 for real visitors.
const BASE='http://127.0.0.1:8899'
const pages=['/personal-webpage/index.html','/personal-webpage/map-editor.html']
let checked=0, bad=[]

async function head(u){
  const r=await fetch(BASE+u,{method:'GET'})
  checked++
  if(!r.ok) bad.push(`${u} -> ${r.status}`)
  return r
}

for(const p of pages){
  const r=await head(p)
  const html=await r.text()
  const refs=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1])
    .filter(u=>u.startsWith('/'))
  for(const u of refs){
    const jr=await head(u)
    if(u.endsWith('.js')){
      // follow asset URLs the JavaScript itself will request
      const js=await jr.text()
      const assets=[...js.matchAll(/["'`](\/models\/[^"'`]+)["'`]/g)].map(m=>m[1])
      for(const a of new Set(assets)) await head(a)
    }
  }
}
// the model files the manifest builds at runtime
for(const f of ['car.glb','building_a.glb','building_b.glb','building_c.glb',
                'tree_a.glb','tree_b.glb','Textures/colormap.png'])
  await head('/personal-webpage/models/'+f)

console.log(`${checked} requests, ${bad.length} failed`)
bad.forEach(b=>console.log('  FAIL  '+b))
console.log(bad.length?'\nFAIL':'\nPASS - nothing 404s')
process.exit(bad.length?1:0)
