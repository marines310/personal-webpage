import { loadEditor, SRC } from './editor.mjs'
import { readFileSync } from 'fs'
const ED = loadEditor()
const { C, run, els, handlers, counter } = ED

let fail=0
for(const m of ['select','district','road','shape','building','demolish']){
  els['mode-'+m].onclick()
  counter.canvasOps=0
  try{ run('draw()'); console.log(`  PASS  ${m.padEnd(9)} draw() ok (${counter.canvasOps} canvas ops)`) }
  catch(e){ fail++; console.log(`  FAIL  ${m.padEnd(9)} ${e.message}`) }
}
// with props off
els['props-toggle'].onclick()
try{ run('draw()'); console.log('  PASS  props toggled off, draw() ok') }catch(e){ fail++; console.log('  FAIL  props off: '+e.message) }
els['props-toggle'].onclick()
// zoomed way out and way in
for(const z of [0.6, 3, 12]){
  run(`view.zoom=${z}`)
  try{ run('draw()'); console.log(`  PASS  zoom ${z} ok`) }catch(e){ fail++; console.log(`  FAIL  zoom ${z}: ${e.message}`) }
}
process.exit(fail?1:0)
