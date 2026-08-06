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
  getMonorailRoute,
  getGarageDriveway,
  getTownPlots,
  getRoadsidePlots,
  getLaneNetwork,
  getStations,
  groundSlope,
  DEFAULT_ROAD_WIDTH,
  PAVEMENT_WIDTH
} from '../src/world/islandLayout.js'
import { MAX_GROUND_GRADIENT } from '../src/world/terrain.js'

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

// ---------------------------------------------------------------------------
console.log('\nThe drive out to the street')

// THE FAILURE THIS IS WRITTEN AGAINST. The garage is sited on a spot whose
// footprint is clear of the roads - and ground clear of the roads is exactly
// the ground the town generator is free to build on. So the doors opened onto
// a strip of grass between two buildings and there was no way to the street.
// The apron was checked; the thirty units after it were nobody's job.
const drive = getGarageDriveway()
const home = getIsland(garage.island)

chk('there is a drive from the garage to the street', !!drive)

if (drive) {
  console.log(`   ${drive.length.toFixed(1)} units long, ${drive.width} wide`)

  // The whole way out, from the doors to the kerb.
  const wayOut = []
  const roll = GARAGE_DEPTH / 2 + GARAGE_APRON
  for (let t = 0; t <= 1.0001; t += 0.02) {
    wayOut.push({ x: garage.localX + Math.sin(garage.heading) * roll * t,
                  z: garage.localZ + Math.cos(garage.heading) * roll * t })
  }
  for (let t = 0; t <= 1.0001; t += 0.02) {
    wayOut.push({ x: drive.points[0].x + (drive.points[1].x - drive.points[0].x) * t,
                  z: drive.points[0].z + (drive.points[1].z - drive.points[0].z) * t })
  }

  // NOTHING MAY STAND IN IT. Measured against the buildings' own rectangles,
  // by the half width the car needs, not by a circle round them.
  //
  // STATIONS COUNT, and they were the ones that got in. A fire station or a
  // hospital is sited on ground clear of the roads, which is the same ground
  // the garage went looking for - so the hub's hospital, 24 by 16, came to
  // rest overlapping the garage by 3.2 units and grew out through its roof.
  // Checking the plots and not the stations was checking the buildings that
  // were never the problem.
  const buildings = [...getTownPlots(home), ...getRoadsidePlots(home),
                     ...(home.buildings || []),
                     ...getStations(getLaneNetwork())
                       .filter(s => s.island.id === home.id)
                       .map(s => ({ x: s.x - home.x, z: s.z - home.z,
                                    width: s.width, depth: s.depth }))]
  let closest = Infinity
  for (const p of wayOut) {
    for (const b of buildings) {
      const half = Math.hypot((b.width || 6) / 2, (b.depth || 6) / 2)
      closest = Math.min(closest, Math.hypot(p.x - b.x, p.z - b.z) - half)
    }
  }
  chk(`no building stands in the way out (nearest ${closest.toFixed(1)})`,
      closest > drive.width / 2, `${closest.toFixed(1)}`)

  // AND IT IS DRIVABLE. The drive is a road, so the height field gives it a
  // road profile - this is what proves that actually happened.
  let steepest = 0
  for (const p of wayOut) {
    const s = groundSlope(home.x + p.x, home.z + p.z)
    steepest = Math.max(steepest, Math.hypot(s.dx, s.dz))
  }
  chk(`the way out is drivable (steepest ${(steepest * 100).toFixed(1)}%)`,
      steepest <= MAX_GROUND_GRADIENT, `${(steepest * 100).toFixed(1)}%`)

  // AND THE TRAFFIC STAYS OFF IT. Mike's requirement: the drive is the
  // player's, and an AI car parked across it is the same bug in a new hat.
  const lanes = getLaneNetwork().lanes
  const along = (x, z) => {
    const a = drive.points[0], b = drive.points[1]
    const dx = b.x - a.x, dz = b.z - a.z
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)))
    return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
  }
  const trespassing = lanes.filter(lane => lane.points.some(q => {
    // Not the last stretch: the drive ENDS on the street, so the street's own
    // lanes legitimately cross it there.
    const toKerb = Math.hypot(q.x - home.x - drive.points[1].x,
                              q.z - home.z - drive.points[1].z)
    return along(q.x - home.x, q.z - home.z) < drive.width / 2 &&
           toKerb > drive.width
  }))
  chk('no AI lane runs on the drive', trespassing.length === 0,
      `${trespassing.length} lanes`)

  // It has to actually REACH the street, or it is a private road to nowhere.
  const reaches = getIslandRoads(home)
    .filter(r => r.street || r.ring || r.spur)
    .some(r => distanceToNearestRoad([r], drive.points[1].x, drive.points[1].z)
               <= DEFAULT_ROAD_WIDTH / 2 + PAVEMENT_WIDTH + 1)
  chk('and it ends on a street', reaches)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
