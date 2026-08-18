/**
 * A fingerprint of everything `islandLayout.js` decides.
 *
 * Adding an island to `mapData.js` is not a local edit. Roads, ports, the
 * monorail, the stations, the lane network and the shipping ring are all
 * functions of the WHOLE island list, so a new island 300 units away can
 * move a bus stop on the hub. The only way to know what moved is to write
 * the whole layout down before the change and diff it after.
 *
 *     node tools/mapFingerprint.mjs > /tmp/before.txt
 *     ...edit mapData.js...
 *     node tools/mapFingerprint.mjs > /tmp/after.txt
 *     diff /tmp/before.txt /tmp/after.txt
 *
 * Rounded to 3 decimals throughout: floating point noise is not a change,
 * and a diff that cries wolf is a diff nobody reads.
 */
import {
  ISLANDS, BRIDGES, getBridges, getIslandRoads, getIslandRing, getTownGrid,
  getTownPlots, getRoadsidePlots, getWalkways, getLaneNetwork, getStations,
  getBusStops, getPorts, getAirport, getRoadNetwork, getMapExtent,
  shippingRingRadius, innermostShippingLane, islandReach, getHelipads,
  getPlayerGarage, getIslandTerrain, getBridgeLandings
} from '../src/world/islandLayout.js'
import { getMonorailRoute, getMonorailStops } from '../src/world/islandLayout.js'

const r = (n) => (typeof n === 'number' ? Math.round(n * 1000) / 1000 : n)
const pt = (p) => (p ? `${r(p.x)},${r(p.z)}` : 'null')
const out = (...a) => console.log(...a)

out('=== ISLANDS ===')
for (const i of ISLANDS) {
  out(`${i.id} at ${r(i.x)},${r(i.z)} radius ${i.radius} reach ${r(islandReach(i))}`,
      `hypot+reach ${r(Math.hypot(i.x, i.z) + islandReach(i))}`)
}
out(`mapExtent ${r(getMapExtent())}`)
out(`shippingRing ${r(shippingRingRadius())} innermostLane ${r(innermostShippingLane())}`)

out('\n=== BRIDGES ===')
for (const b of getBridges()) {
  out(`${b.from.id}->${b.to.id} mid ${pt(b)} len ${r(b.length)} w ${r(b.width)} rot ${r(b.rotationY)}`)
}

out('\n=== LANDINGS ===')
for (const i of ISLANDS) {
  const l = getBridgeLandings(i).map(
    (x) => `${x.other.id}@${r(x.rotationY)}/${r(x.shore)}`).join(' ')
  out(`${i.id}: ${l}`)
}

out('\n=== ROADS ===')
for (const i of ISLANDS) {
  const roads = getIslandRoads(i)
  out(`${i.id}: ${roads.length} segments`)
  for (const s of roads) {
    out(`  ${r(s.ax)},${r(s.az)} -> ${r(s.bx)},${r(s.bz)} w${r(s.width)}` +
        `${s.street ? ' street' : ''}${s.ring ? ' ring' : ''}${s.spur ? ' spur' : ''}`)
  }
  const ring = getIslandRing(i)
  out(`  ring: ${ring ? ring.length + ' pts, first ' + pt(ring[0]) : 'none'}`)
  out(`  grid: ${getTownGrid(i).length} streets`)
  out(`  plots: ${getTownPlots(i).length} town, ${getRoadsidePlots(i).length} roadside`)
  out(`  walkways: ${getWalkways(i).length}`)
}

out('\n=== TERRAIN SAMPLES ===')
for (const i of ISLANDS) {
  const t = getIslandTerrain(i)
  const rows = []
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2
    for (const d of [0, 15, 30, 45]) {
      const x = Math.sin(ang) * d
      const z = Math.cos(ang) * d
      rows.push(r(t.heightAt(x, z)))
    }
  }
  out(`${i.id}: ${rows.join(' ')}`)
}

out('\n=== LANE NETWORK ===')
const net = getLaneNetwork()
out(`nodes ${net.nodes.length} lanes ${net.lanes.length}`)
net.lanes.forEach((l, idx) => {
  out(`  ${idx} ${l.kind || 'street'} ${pt(net.nodes[l.from])} -> ${pt(net.nodes[l.to])}` +
      ` len ${r(l.length)}${l.island ? ' on ' + l.island : ''}`)
})

out('\n=== STATIONS ===')
for (const s of getStations()) {
  out(`${s.kind} on ${s.island} at ${pt(s)} rot ${r(s.rotationY)}`)
}

out('\n=== BUS STOPS ===')
for (const s of getBusStops()) out(`lane ${s.lane} at ${pt(s)}`)

out('\n=== PORTS ===')
for (const p of getPorts()) {
  out(`${p.island.id} mid ${pt(p.mid)} dir ${r(p.dirX)},${r(p.dirZ)}` +
      ` len ${r(p.length)} w ${r(p.width)} berths ${p.berths ? p.berths.length : 0}`)
}

out('\n=== AIRPORT ===')
const air = getAirport()
out(air ? `at ${pt(air)} rot ${r(air.rotationY)} span ${r(air.length)}x${r(air.width)}`
        : 'none')

out('\n=== MONORAIL ===')
out(`stops ${getMonorailStops().map((s) => s.id).join(' ')}`)
const route = getMonorailRoute()
out(`route ${route ? route.length + ' pts, first ' + pt(route[0]) : 'none'}`)

out('\n=== HELIPADS ===')
for (const h of getHelipads()) out(`${h.island || '?'} ${pt(h)}`)

out('\n=== GARAGE ===')
const g = getPlayerGarage()
out(g ? `at ${pt(g)} rot ${r(g.rotationY)}` : 'none')

out('\n=== ROAD NETWORK ===')
const rn = getRoadNetwork()
const segs = Array.isArray(rn) ? rn : (rn.segments || [])
out(`${segs.length} segments`)
segs.forEach((s, idx) => {
  const p = s.points || []
  out(`  ${idx} ${s.island || s.kind || '?'} ${p.length}pts` +
      ` ${pt(p[0])} .. ${pt(p[p.length - 1])} w${r(s.width)}`)
})
