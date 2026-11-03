/** During lane 159's own green, what is stopping the vehicle at its stop line? */
import { getLaneNetwork, getBusStops, makeTraffic, stepTraffic, TRAFFIC_FLEET }
  from '../src/world/islandLayout.js'
const dt=1/30
const net=getLaneNetwork()
const vehicles=makeTraffic(net,TRAFFIC_FLEET,getBusStops(net))
const sig=net.lanes[159].signal, gl=net.lanes[159].signalGroup
const bump=(o,k)=>{o[k]=(o[k]||0)+1}
const onGreen={}, onRed={}, waitOn={}
let greenFrames=0, greenMoving=0
for (let step=0; step<(10*60)/dt; step++){
  stepTraffic(net, vehicles, dt, step*dt)
  if (step%5) continue
  const on = vehicles.filter(v=>v.lane===159)
  if (!on.length) continue
  const lead = on.reduce((a,b)=>b.at>a.at?b:a)
  // only interested when the lead is near the stop line
  if (net.lanes[159].length - lead.at > 12) continue
  const green = sig.control.changeAt === undefined && sig.control.phase === gl
  const tag = `${lead.why||'?'} ${((lead.speed||0)<0.3?'STOPPED':'moving')}`
  if (green) {
    greenFrames++
    if ((lead.speed||0) >= 0.3) greenMoving++
    bump(onGreen, tag)
    if (lead.waitingOn) bump(waitOn, `${lead.waitingOn.kind} on lane ${lead.waitingOn.lane} (${lead.waitingOn.why||'?'}, ${((lead.waitingOn.speed||0)<0.3?'STOPPED':'moving')})`)
  } else bump(onRed, tag)
}
const top=(o,n=10)=>Object.entries(o).sort((a,b)=>b[1]-a[1]).slice(0,n)
const show=(t,o)=>{console.log('\n'+t);for(const[k,c]of top(o))console.log(`   ${String(c).padStart(6)}  ${k}`)}
console.log(`lead-at-stop-line samples on green: ${greenFrames}, of which moving: ${greenMoving} (${(greenMoving/greenFrames*100).toFixed(0)}%)`)
show('ON GREEN, the lead vehicle says:', onGreen)
show('   ...and it is giving way to / queued behind:', waitOn)
show('ON RED, for comparison:', onRed)
