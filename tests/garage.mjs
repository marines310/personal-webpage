/**
 * The player's garage, and the vehicles that come out of it.
 *
 * Two things can go wrong here and both have gone wrong before, elsewhere in
 * this project:
 *
 *  - siting a building by the circle round it rather than its rectangle, which
 *    is what once placed no fire stations at all;
 *  - a door sized to look right rather than to the thing that has to go
 *    through it, which is what item 22 fixed by tying the opening to the bay
 *    spacing.
 */
import {
  ISLANDS,
  getIsland,
  getPlayerGarage,
  getIslandRoads,
  distanceToNearestRoad,
  inlandDistance,
  PLAZA_FOUNTAIN_OFFSET,
  TRAFFIC_LENGTHS,
  TRAFFIC_WIDTHS,
  GARAGE_DOOR_WIDTH,
  GARAGE_DEPTH,
  GARAGE_APRON,
  MONORAIL_CORRIDOR,
  getMonorailRoute
} from '../src/world/islandLayout.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const garage = getPlayerGarage()

console.log('1. There is a garage, and it is on the hub')
chk('a site was found', !!garage)
if (!garage) { console.log('\n0 passed, 1 failed'); process.exit(1) }
console.log(`   ${garage.width.toFixed(1)} x ${garage.depth.toFixed(1)} on ${garage.island} ` +
            `at (${garage.x.toFixed(1)}, ${garage.z.toFixed(1)})`)
chk('it is on the hub', garage.island === 'hub', garage.island)

const island = getIsland(garage.island)
const roads = getIslandRoads(island)

console.log('\n2. Everything that has to fit, fits')
// Sized off the widest and longest vehicles, not off a number that looked
// right. If the fleet gains something bigger, these grow with it.
const widest = Math.max(...Object.values(TRAFFIC_WIDTHS))
const longest = Math.max(...Object.values(TRAFFIC_LENGTHS))
console.log(`   widest vehicle ${widest}, door ${GARAGE_DOOR_WIDTH.toFixed(1)}; ` +
            `longest ${longest}, depth ${GARAGE_DEPTH.toFixed(1)}`)
chk('the widest vehicle goes through the door with room either side',
    GARAGE_DOOR_WIDTH >= widest + 2, `${GARAGE_DOOR_WIDTH.toFixed(1)} vs ${widest}`)
chk('the longest vehicle fits inside', GARAGE_DEPTH >= longest + 4,
    `${GARAGE_DEPTH.toFixed(1)} vs ${longest}`)
chk('the door is narrower than the building, so there are walls either side',
    GARAGE_DOOR_WIDTH < garage.width, `${GARAGE_DOOR_WIDTH.toFixed(1)} vs ${garage.width}`)

console.log('\n3. It is on land and off the road')
// The RECTANGLE, at all four corners - not the centre, and not the circle.
const cs = Math.sin(garage.heading), cc = Math.cos(garage.heading)
let worstRoad = Infinity
let worstInland = Infinity
for (const [sw, sd] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
  const lx = garage.localX + cc * (garage.width / 2) * sw + cs * (garage.depth / 2) * sd
  const lz = garage.localZ - cs * (garage.width / 2) * sw + cc * (garage.depth / 2) * sd
  worstRoad = Math.min(worstRoad, distanceToNearestRoad(roads, lx, lz))
  worstInland = Math.min(worstInland, inlandDistance(island, lx, lz))
}
console.log(`   closest corner to a road ${worstRoad.toFixed(1)}u, to the coast ${worstInland.toFixed(1)}u`)
chk('no corner sits in a road', worstRoad > 0, `${worstRoad.toFixed(1)}`)
chk('and no corner is in the sea', worstInland > 0, `${worstInland.toFixed(1)}`)

console.log('\n4. Clear of the fountain')
// The hub's plaza has one, and the plaza centre is the obvious place to drop a
// garage - straight on top of it.
const plaza = (island.districts || []).find(d => d.type === 'plaza')
if (plaza) {
  const fx = (plaza.x || 0)
  const fz = (plaza.z || 0) + PLAZA_FOUNTAIN_OFFSET
  const gap = Math.hypot(garage.localX - fx, garage.localZ - fz)
  const half = Math.hypot(garage.width, garage.depth) / 2
  console.log(`   fountain is ${gap.toFixed(1)}u away, garage half-diagonal ${half.toFixed(1)}u`)
  chk('the garage does not stand on the fountain', gap > half, `${gap.toFixed(1)} vs ${half.toFixed(1)}`)
} else {
  console.log('   (no plaza on this island)')
}

console.log('\n5. You can get out of it')
// The apron in front has to be clear, and rolling out has to point somewhere.
const apronGap = Math.hypot(garage.apron.x - garage.x, garage.apron.z - garage.z)
console.log(`   rolls out ${apronGap.toFixed(1)}u to (${garage.apron.x.toFixed(1)}, ${garage.apron.z.toFixed(1)})`)
chk('the roll-out clears the building', apronGap > GARAGE_DEPTH / 2,
    `${apronGap.toFixed(1)} vs ${(GARAGE_DEPTH / 2).toFixed(1)}`)
chk('and it goes out the front, not the back',
    Math.abs(apronGap - (GARAGE_DEPTH / 2 + GARAGE_APRON)) < 0.01)

// It should point at a road, or "out" means nothing.
const apronLocalX = garage.apron.x - island.x
const apronLocalZ = garage.apron.z - island.z
const toRoad = distanceToNearestRoad(roads, apronLocalX, apronLocalZ)
console.log(`   nearest road to the apron ${toRoad.toFixed(1)}u`)
chk('the way out faces a road within a short drive', toRoad < 45, `${toRoad.toFixed(1)}`)

console.log('\n6. Clear of the monorail, including the way out')
// Missed entirely first time. The siting asked about roads and the fountain
// and never about the thing standing over the plaza: the first site put the
// roll-out 3.2 units from the beam's centre line, inside its 6-unit corridor,
// where a pier stands every 27 units. Piers slide to miss ROADS, and an apron
// is not a road - so one could have stood in the doorway.
const route = getMonorailRoute()
const beam = route.points || route
let nearestToPath = Infinity
for (let t = -0.2; t <= 1.05; t += 0.05) {
  const x = garage.x + (garage.apron.x - garage.x) * t
  const z = garage.z + (garage.apron.z - garage.z) * t
  for (const p of beam) {
    nearestToPath = Math.min(nearestToPath, Math.hypot(p.x - x, p.z - z))
  }
}
console.log(`   nearest beam point to the way out ${nearestToPath.toFixed(1)}u, ` +
            `corridor ${MONORAIL_CORRIDOR}u`)
chk('the beam does not run over the garage or its drive',
    nearestToPath > MONORAIL_CORRIDOR + garage.doorWidth / 2,
    `${nearestToPath.toFixed(1)}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
