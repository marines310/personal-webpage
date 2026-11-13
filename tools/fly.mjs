/**
 * HOW OFTEN DOES A VEHICLE LEAVE THE GROUND, AND HOW FAR?
 *
 * Steps the built game by hand - the ticker stopped, every tick callback
 * called with a fixed frame time, no rendering - and drives a vehicle in a
 * straight line over three surfaces: the stunt island's flat floor (a
 * terrain trimesh), the speedway's main straight, and the hub-about bridge.
 * Per frame it asks the physics whether the body has a contact, how far the
 * ground is below it if not, and whether the vertical velocity jumped while
 * the car was standing on flat ground.
 *
 *     node tools/fly.mjs <kind> [fps=60] [substep=0] [boost] [trace]
 *
 * Needs `window.__game = game` in src/main.js (temporarily) and a build.
 * Written to find why the racing car and the motorcycle flew; the answer was
 * TriMeshFlags.FIX_INTERNAL_EDGES, see Physics.createStaticTrimesh().
 */
import { chromium } from 'playwright'
import http from 'http'; import fs from 'fs'; import path from 'path'
const ROOT='/tmp/claude-0/-home-claude/6fa0c2a9-f72b-5776-b2e2-dc64972c1dcd/scratchpad/wheelie/dist'
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
 '.glb':'model/gltf-binary','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.wasm':'application/wasm'}
const server=http.createServer((q,r)=>{let f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]))
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory())f=path.join(ROOT,'index.html')
 r.writeHead(200,{'Content-Type':T[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)})
await new Promise(r=>server.listen(8099,r))
const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
 args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']})
const page=await browser.newPage({viewport:{width:480,height:300}})
const errors=[];page.on('pageerror',e=>errors.push(String(e)))
await page.goto('http://localhost:8099/',{waitUntil:'domcontentloaded',timeout:120000})
await page.waitForFunction('window.__game && window.__game.vehicle',null,{timeout:180000})
await page.waitForTimeout(2000)
const KIND = process.argv[2] || 'race'
const FPS = +(process.argv[3] || 60)
const SUB = +(process.argv[4] || 0)      // substep length, 0 = as shipped
const BOOST = process.argv[5] === 'boost'
await page.evaluate((k)=>{const s=window.__game.vehicleSelector
 if(!s.open)s.show()
 for(let i=0;i<24&&window.__game.vehicle.kind!==k;i++)s.step(1)
 s.confirm()}, KIND)
await page.waitForFunction('!window.__game.vehicleSelector.isBusy()',null,{timeout:120000})

async function run(name, x, z, heading, seconds) {
  await page.keyboard.down('KeyW'); if (BOOST) await page.keyboard.down('ShiftLeft')
  const r = await page.evaluate(async ({x,z,heading,seconds,FPS,SUB}) => {
    const g = window.__game, w = g.world, v = g.vehicle, ph = g.physics, t = g.ticker
    t.stop()
    // Substep physics, if asked.
    if (SUB > 0 && !ph.__orig) {
      ph.__orig = ph.update
      ph.update = function (delta) {
        const n = Math.max(1, Math.ceil(delta / SUB)), h = delta / n
        for (let i = 0; i < n; i++) { this.world.timestep = h; this.world.step() }
        for (const [mesh, body] of this.bodies) if (body.isDynamic()) {
          const p = body.translation(), q = body.rotation(); mesh.position.set(p.x,p.y,p.z); mesh.quaternion.set(q.x,q.y,q.z,q.w) }
      }
    }
    const orders = [...t.callbacks.keys()].sort((a,b)=>a-b)
    const step = (dt) => { for (const o of orders) { if (o >= 100) continue; for (const cb of t.callbacks.get(o)) cb(dt) } }
    const dt = 1 / FPS
    v.placeAt(x, w.groundAt(x, z) + 1.0, z, heading)
    for (let i = 0; i < FPS; i++) step(dt)   // a second to settle, no throttle counted yet
    const out = { frames: 0, noContact: 0, air: 0, hops: 0, maxAbove: 0, kicks: 0, bigKicks: 0, worstKick: 0, trace: [], heights: [] }
    let wasTouching = true, hopStart = 0, hopPeak = 0
    const n = Math.round(seconds * FPS)
    for (let i = 0; i < n; i++) {
      step(dt)
      const vel = v.body.linvel()
      const touching = v.groundedNow()
      const below = touching ? 0 : (ph.groundDistance(v.body) ?? 99)
      const above = Math.max(0, below - 0.46)   // body centre rests 0.46 up
      out.frames++
      if (!v.isGrounded) out.air++
      if (!touching) out.noContact++
      out.maxAbove = Math.max(out.maxAbove, above)
      const nrm = v._groundNormal
      if (touching && vel.y > 1.0 && nrm.y > 0.995) { out.kicks++; if (vel.y > 2.5) out.bigKicks++; out.worstKick = Math.max(out.worstKick, vel.y) }
      if (wasTouching && !touching) { hopStart = i; hopPeak = 0 }
      if (!touching) hopPeak = Math.max(hopPeak, above)
      if (!wasTouching && touching) { out.hops++; if (hopPeak > 0.05) out.trace.push({ at: +(hopStart/FPS).toFixed(1), dur: +((i-hopStart)/FPS).toFixed(2), peak: +hopPeak.toFixed(2), spd: +v.currentSpeed.toFixed(1) }) }
      wasTouching = touching
      if (i % Math.round(FPS/4) === 0) { const q = v.body.translation(); out.heights.push(`${(i/FPS).toFixed(2)}:(${q.x.toFixed(0)},${q.z.toFixed(0)})y${q.y.toFixed(2)}s${v.currentSpeed.toFixed(0)}${touching?'':'!'}`) }
    }
    out.endSpeed = +v.currentSpeed.toFixed(1)
    const p = v.body.translation(); out.end = [+p.x.toFixed(0), +p.z.toFixed(0)]
    t.start()
    return out
  }, {x,z,heading,seconds,FPS,SUB})
  await page.keyboard.up('KeyW'); if (BOOST) await page.keyboard.up('ShiftLeft')
  const real = r.trace.filter(h => h.peak > 0.05)
  console.log(`${KIND.padEnd(10)} ${String(FPS).padStart(3)}fps sub=${SUB ? (1/SUB).toFixed(0) : 'off'} ${name.padEnd(8)} | no-contact ${(100*r.noContact/r.frames).toFixed(1).padStart(5)}%  airborne ${(100*r.air/r.frames).toFixed(1).padStart(5)}%  hops>5cm ${String(real.length).padStart(3)}  highest ${r.maxAbove.toFixed(2)}  flat-ground kicks vy>1: ${r.kicks} (>2.5: ${r.bigKicks}, worst ${r.worstKick.toFixed(2)})  end ${r.endSpeed}@${r.end}`)
  if (process.argv[6] === 'trace') console.log('      ' + r.heights.join(' '))
  if (real.length) console.log('      ' + real.slice(0,10).map(h=>`t${h.at} ${h.dur}s ${h.peak}up@${h.spd}`).join(', ') + (real.length>10?` ... ${real.length}`:''))
}
await run('flat', 173.4 + 30, 159.8 + 56, Math.PI, 5)
await run('circuit', -248.5, -63.2, -1.467, 3.5)
await run('bridge', 12.1, 87.2, 0.138, 4.5)
if (errors.length) console.log('errors: ' + errors.slice(0,4).join(' | '))
await browser.close(); server.close()
