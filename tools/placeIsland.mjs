/**
 * Where can a new island actually go?
 *
 * Six islands, five bridges, an airport, a shipping ring and a monorail are
 * already out there, and every one of them is a constraint. Guessing a
 * coordinate and looking at the map is how you get an island that overlaps a
 * coastline you can't see from above, or one that quietly pushes the shipping
 * ring out and moves every ship in the world.
 *
 * So: search instead. Sweep bearing and distance, score every candidate
 * against the hard limits, print what survives.
 *
 *     node tools/placeIsland.mjs
 *
 * The limits, and why each one is there:
 *
 *   WATER GAP      Islands must not touch, and the channel between them has
 *                  to read as sea rather than as a seam.
 *   BRIDGE SPAN    Every existing crossing is ~130 units (see mapData.js).
 *                  A new one wildly shorter or longer looks like a mistake.
 *   MAP EXTENT     `getMapExtent()` is a max over all islands, and the
 *                  shipping ring, the sea lanes, the airport search and the
 *                  minimap are all derived from it. Stay under the current
 *                  maximum and none of them move.
 *   BRIDGE CLEAR   A new island sitting on top of an existing bridge would
 *                  be crossed by a road at head height.
 */
import { ISLANDS, islandReach, shoreDistance, getBridges, getAirport,
  getRoadNetwork } from '../src/world/islandLayout.js'
import { makeShape } from '../src/world/shapes.js'

const WATER_GAP = 34
const BRIDGE_SPAN = [105, 155]
const BRIDGE_CLEAR = 30
const AIRPORT_CLEAR = 90        // the platform, its causeway and its approach
const MAX_HYPOT_REACH = 400.6   // projects sets today's maximum

/** An island-shaped object good enough for shoreDistance()/islandReach(). */
const candidate = (x, z, radius, shape, shapeSeed) =>
  ({ id: '__probe', x, z, radius, shape, shapeSeed })

/** Shortest distance between two island coastlines along the line of centres. */
function waterGap(a, b) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const d = Math.hypot(dx, dz)
  return d - shoreDistance(a, dx, dz) - shoreDistance(b, -dx, -dz)
}

/** Distance from a point to a bridge deck, treated as a line segment. */
function distanceToBridge(bridge, x, z) {
  const half = bridge.length / 2
  const ux = Math.sin(bridge.rotationY)
  const uz = Math.cos(bridge.rotationY)
  const ax = bridge.x - ux * half
  const az = bridge.z - uz * half
  const t = Math.max(0, Math.min(1,
    ((x - ax) * ux + (z - az) * uz) / bridge.length))
  return Math.hypot(x - (ax + ux * bridge.length * t),
                    z - (az + uz * bridge.length * t))
}

const hub = ISLANDS.find((i) => i.id === 'hub')
const bridges = getBridges()

/** The airport, its causeway and its apron, as a bag of points to stay away from. */
const airportPoints = []
{
  const air = getAirport()
  if (air) airportPoints.push({ x: air.x, z: air.z })
  for (const seg of getRoadNetwork().segments) {
    if (seg.kind !== 'causeway' && seg.kind !== 'apron') continue
    for (let i = 0; i < seg.points.length; i += 8) airportPoints.push(seg.points[i])
  }
}

/**
 * Score one placement. Returns null if it breaks a hard limit, otherwise the
 * tightest constraint it has left - which is what "how good is this" means
 * here: the candidate with the most room to spare in its worst direction.
 */
function evaluate(bearingDeg, dist, radius, shape, shapeSeed) {
  const a = (bearingDeg * Math.PI) / 180
  const x = Math.sin(a) * dist
  const z = Math.cos(a) * dist
  const isle = candidate(x, z, radius, shape, shapeSeed)
  const reach = islandReach(isle)

  if (dist + reach > MAX_HYPOT_REACH) return null

  let tightest = Infinity
  for (const other of ISLANDS) {
    const gap = waterGap(other, isle)
    if (gap < WATER_GAP) return null
    tightest = Math.min(tightest, gap)
  }

  // Span of the new bridge from the hub, measured the way resolveBridge does
  const dx = x - hub.x
  const dz = z - hub.z
  const span = dist - shoreDistance(hub, dx, dz) - shoreDistance(isle, -dx, -dz) + 3
  if (span < BRIDGE_SPAN[0] || span > BRIDGE_SPAN[1]) return null

  // Every existing bridge has to stay in open water
  for (const b of bridges) {
    const clear = distanceToBridge(b, x, z) - shoreDistance(isle, b.x - x, b.z - z)
    if (clear < BRIDGE_CLEAR) return null
    tightest = Math.min(tightest, clear)
  }

  // The airport is the constraint that is easiest to miss, because it does
  // not appear in mapData.js at all - it SITES ITSELF in whatever open water
  // is left, and `openWater()` is a minimum over every island. Drop an island
  // near it and the runway moves, or stops existing. Its causeway and apron
  // roads are real roads and count too.
  for (const p of airportPoints) {
    const clear = Math.hypot(p.x - x, p.z - z) -
      shoreDistance(isle, p.x - x, p.z - z)
    if (clear < AIRPORT_CLEAR) return null
    tightest = Math.min(tightest, clear)
  }

  return { bearingDeg, dist, radius, shape, shapeSeed, x, z, reach, span, tightest }
}

const SHAPES = Object.keys(makeShape ? {
  blob: 1, long: 1, wide: 1, crescent: 1, lshape: 1, triangle: 1, atoll: 1, circle: 1
} : {})

// The two gaps in the hub's fan of bridges, from the fingerprint:
//   contact 284.1 -> about 367.9   (the widest)
//   skills  135.4 -> blog  216.3
const WINDOWS = [
  { name: 'NE  (between ABOUT and PROJECTS)', from: 20, to: 70 },
  { name: 'ESE (between PROJECTS and SKILLS)', from: 94, to: 124 },
  { name: 'S   (between SKILLS and BLOG)', from: 148, to: 206 },
  { name: 'WSW (between BLOG and CONTACT)', from: 228, to: 272 },
  { name: 'NW  (between CONTACT and ABOUT)', from: 296, to: 356 }
]

for (const window of WINDOWS) {
  console.log(`\n### ${window.name}`)
  const found = []
  for (let bearing = window.from; bearing <= window.to; bearing += 2) {
    for (let dist = 200; dist <= 340; dist += 5) {
      for (const radius of [84, 90, 96, 102, 108, 114, 120]) {
        for (const shape of SHAPES) {
          for (const shapeSeed of [3, 7, 11, 17]) {
            const hit = evaluate(bearing, dist, radius, shape, shapeSeed)
            if (hit) found.push(hit)
          }
        }
      }
    }
  }

  if (!found.length) { console.log('  nothing fits'); continue }

  // Biggest island first - the courses need room - then most clearance
  found.sort((a, b) => (b.radius - a.radius) || (Math.abs(a.span - 130) - Math.abs(b.span - 130)))
  console.log(`  ${found.length} placements fit; best five:`)
  for (const f of found.slice(0, 5)) {
    console.log(
      `   r${f.radius} ${f.shape}/${f.shapeSeed} bearing ${f.bearingDeg}` +
      ` dist ${f.dist} -> (${f.x.toFixed(1)}, ${f.z.toFixed(1)})` +
      ` reach ${f.reach.toFixed(1)} span ${f.span.toFixed(0)}` +
      ` clear ${f.tightest.toFixed(1)}`)
  }
}
