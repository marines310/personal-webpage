/**
 * What would adding these islands do to the six that are already there?
 *
 * `tools/placeIsland.mjs` answers "does it fit" - geometry only. This
 * answers the harder question, which is what the rest of the world does in
 * response. Nothing in this map is local:
 *
 *   - a port picks its bearing by sailing out from every point of the compass
 *     and seeing how far it gets, so an island 300 units away can move a quay
 *     to the other side of its island;
 *   - the same score counts how far each bearing is from the nearest BRIDGE,
 *     so a new crossing can move a quay too;
 *   - a quay comes with a quay road, the street grid lays itself out around
 *     the fixed roads, and a street that moves takes its buildings with it;
 *   - stations are sited one after another with a minimum spacing, so one
 *     that moves can push the next one along.
 *
 * So: build the world with the candidates in it, and compare every one of
 * those against the world without them. Anything that is not zero is a change
 * to an island the player already knows.
 *
 *     node tools/islandImpact.mjs '<json>' ...
 *
 * where each argument is an island literal, optionally with a `bridgeFrom`
 * naming the island it should be bridged to:
 *
 *     node tools/islandImpact.mjs \
 *       '{"id":"stunt","x":-191.6,"z":220.4,"radius":88,"shape":"triangle",
 *         "shapeSeed":5,"theme":"plain","noRing":true,"port":false,
 *         "monorail":false,"bare":true,"palms":0,"bridgeFrom":"hub"}'
 *
 * Deliberately cheap - no terrain, no lane network, no airport. Those are
 * cached per island inside islandLayout.js and cannot be recomputed in the
 * same process, and they are also the slow ones: a full fingerprint takes
 * forty seconds and this takes a fraction of a second, which is the
 * difference between checking one placement and searching a thousand.
 * Run tools/mapFingerprint.mjs on the winner to check the rest.
 */
import { ISLANDS, BRIDGES, getPort, getStations, getIslandRoads, getTownPlots,
  getIslandRing, getMapExtent, getBridgeLandings, getMonorailStops }
  from '../src/world/islandLayout.js'

const r3 = (n) => Math.round(n * 1000) / 1000

/** Everything about the existing six that a new island could move. */
export function snapshot(ids) {
  const out = {}

  for (const id of ids) {
    const island = ISLANDS.find((i) => i.id === id)
    if (!island) { out[id] = 'GONE'; continue }

    const port = getPort(island)
    const roads = getIslandRoads(island)
    const ring = getIslandRing(island)

    out[`${id}.port`] = port
      ? `${r3(port.dirX)},${r3(port.dirZ)} shore ${r3(port.shore)} fetch ${r3(port.openWater)}`
      : 'none'
    out[`${id}.roads`] = roads.length + ':' + r3(roads.reduce((s, road) => {
      let len = 0
      for (let i = 1; i < road.points.length; i++) {
        len += Math.hypot(road.points[i].x - road.points[i - 1].x,
                          road.points[i].z - road.points[i - 1].z)
      }
      return s + len
    }, 0))
    out[`${id}.ring`] = ring ? ring.length + ':' + r3(ring[0].x) + ',' + r3(ring[0].z) : 'none'
    out[`${id}.plots`] = String(getTownPlots(island).length)
    out[`${id}.landings`] = getBridgeLandings(island)
      .map((l) => `${l.other.id}@${r3(l.rotationY)}`).join(' ')
  }

  out['_stations'] = getStations()
    .map((s) => `${s.kind}:${s.island}:${r3(s.x)},${r3(s.z)}`).join(' | ')
  out['_monorail'] = getMonorailStops().map((s) => s.id).join(' ')
  out['_mapExtent'] = String(r3(getMapExtent()))

  return out
}

const EXISTING = ISLANDS.map((i) => i.id)

const before = snapshot(EXISTING)

const candidates = process.argv.slice(2).map((s) => JSON.parse(s))
for (const c of candidates) {
  const { bridgeFrom, ...island } = c
  ISLANDS.push(island)
  if (bridgeFrom) BRIDGES.push({ from: bridgeFrom, to: island.id })
}

const after = snapshot(EXISTING)

let changed = 0
for (const key of Object.keys(before)) {
  if (before[key] === after[key]) continue
  changed++
  console.log(`CHANGED ${key}`)
  console.log(`   was: ${before[key]}`)
  console.log(`   now: ${after[key]}`)
}

console.log(changed === 0
  ? 'IMPACT 0 - the six existing islands are untouched'
  : `IMPACT ${changed} - ${changed} measurement(s) moved`)
process.exitCode = changed === 0 ? 0 : 1
