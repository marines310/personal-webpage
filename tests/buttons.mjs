import { loadEditor } from './editor.mjs'
const { run } = loadEditor()
const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
let pass=0, fail=0
const chk=(n,c,d='')=>{c?(pass++,console.log('  PASS  '+n)):(fail++,console.log('  FAIL  '+n+'  '+d))}

console.log("Does every island offer Edit buttons, on Mike's actual map?\n")
for (const island of L.ISLANDS) {
  const n = L.getBridgeLandings(island).length
  const labels = run(`(function(){
    sel = { kind:'island', island: getIsland(${JSON.stringify(island.id)}) };
    refresh();
    return [...document.getElementById('props').children]
      .map(e=>e.textContent||'')
      .filter(t=>t.indexOf('Edit the road to')===0);
  })()`)
  chk(`${island.id.padEnd(9)} ${n} bridge(s) -> ${labels.length} button(s)`,
      labels.length===n, labels.join(' | '))
}
console.log(`\n${pass} passed, ${fail} failed`)
