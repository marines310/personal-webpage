// decoded, because a folder name with a space arrives percent-encoded
const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)
// One loader for every editor test. Boots map-editor.html under a DOM shim
// with the REAL curve/layout modules injected, so the harness exercises the
// code that actually ships rather than a stand-in for it.
import { readFileSync } from 'fs'
import vm from 'vm'

export const SRC = ROOT.replace(/\/$/, '')

const CURVES = await import(new URL('../src/world/curves.js', import.meta.url).href)
const LAYOUT = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
const MAPDATA = await import(new URL('../src/world/mapData.js', import.meta.url).href)

export function loadEditor() {
  const html = readFileSync(SRC + '/map-editor.html', 'utf8')
  const raw = html.slice(html.indexOf('<script type="module">') + 22,
                         html.lastIndexOf('</script>'))
  const js =
    'const THREE={Vector3:function(){this.x=0;this.y=0;this.z=0;this.multiplyScalar=function(){return this};this.sub=function(){return this}},' +
    'Box3:function(){this.setFromObject=function(){return this};this.getSize=function(v){return v};this.getCenter=function(v){return v}},' +
    'WebGLRenderer:function(){throw new Error("no webgl")},Scene:function(){},AmbientLight:function(){},' +
    'DirectionalLight:function(){this.position={set(){}}},OrthographicCamera:function(){this.position={set(){}};this.lookAt=function(){}}};\n' +
    'const GLTFLoader=function(){this.load=(u,ok,p,err)=>err(new Error("no fs"))};\n' +
    'const MODEL_MANIFEST=[{key:"building_a"},{key:"building_b"},{key:"building_c"},{key:"tree_a"},{key:"car"}];\n' +
    raw.split('\n').filter(l => !l.trim().startsWith('import ')).join('\n')

  const noop = () => {}
  const counter = { canvasOps: 0 }
  const makeCtx = () => new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k]
      if (k === 'measureText') return () => ({ width: 40 })
      return () => { counter.canvasOps++ }
    },
    set(t, k, v) { t[k] = v; return true }
  })

  function makeEl(id) {
    const el = {
      id, children: [], style: { cssText: '' }, dataset: {},
      classList: { toggle: noop, add: noop, remove: noop, contains: () => false },
      textContent: '', value: '', _html: '',
      // Setting innerHTML in a real browser destroys existing children.
      // The shim used to keep them, so anything that rebuilt a panel
      // appeared to append forever - hiding real bugs behind fake ones.
      set innerHTML(v) { this._html = v; if (!v) this.children.length = 0 },
      get innerHTML() { return this._html },
      append: (...k) => el.children.push(...k),
      appendChild: k => el.children.push(k),
      insertAdjacentHTML: noop, addEventListener: noop, remove: noop,
      getContext: () => makeCtx(),
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 700 }),
      focus: noop, select: noop, click: noop
    }
    return el
  }

  const els = {}, handlers = {}
  const document = {
    getElementById: id => (els[id] ||= makeEl(id)),
    createElement: t => makeEl('n-' + t),
    querySelector: () => makeEl('q'),
    addEventListener: noop
  }
  els.c = makeEl('c')
  els.c.addEventListener = (t, fn) => { handlers[t] = fn }

  const window = {
    addEventListener: (t, fn) => { handlers['win:' + t] = fn },
    devicePixelRatio: 1, innerWidth: 1000, innerHeight: 700
  }

  const C = {
    document, window, console, requestAnimationFrame: noop,
    navigator: { clipboard: { writeText: async () => {} } },
    Blob: function () {},
    URL: { createObjectURL: () => 'b:', revokeObjectURL: noop },
    structuredClone: o => JSON.parse(JSON.stringify(o)),
    // The genuine article, not a copy
    sampleSpline: CURVES.sampleSpline,
    bowedPath: CURVES.bowedPath,
    smoothRoad: LAYOUT.smoothRoad,
    hashString: LAYOUT.hashString,
    approachControls: LAYOUT.approachControls,
    getIslandRing: LAYOUT.getIslandRing,
    getIslandJunctions: LAYOUT.getIslandJunctions,
    getStoredRing: LAYOUT.getStoredRing,
    buildNetwork: LAYOUT.buildNetwork,
    getTownGrid: LAYOUT.getTownGrid,
    getTownPlots: LAYOUT.getTownPlots,
    DEFAULT_ROAD_CURVE: LAYOUT.DEFAULT_ROAD_CURVE,
    ROAD_SMOOTHNESS: LAYOUT.ROAD_SMOOTHNESS,
    MAP_ISLANDS: MAPDATA.ISLANDS,
    MAP_BRIDGES: MAPDATA.BRIDGES,
    Math, JSON, Object, Array, Number, String, Boolean,
    isFinite, parseFloat, parseInt,
    confirm: () => true, alert: noop, setTimeout: noop
  }
  C.globalThis = C
  vm.createContext(C)
  vm.runInContext(js, C)

  const run = s => vm.runInContext(s, C)
  return { C, run, els, handlers, counter, setMode: m => els['mode-' + m].onclick() }
}
