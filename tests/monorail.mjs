/**
 * The monorail: the loop, its supports, its stations, and the trains.
 *
 * Almost none of this can be checked by looking at it in the world, because
 * the interesting parts are 16 units above your head and the trains take a
 * minute to come round. So it's measured here.
 *
 * The train timetable lives in islandLayout.js rather than World.js
 * precisely so that this file can run it for real, rather than a copy of it
 * that agrees with itself and not with the game.
 */
import {
  ISLANDS,
  getMonorailStops,
  getMonorailRoute,
  getMonorailPiers,
  getMonorailStationTowers,
  makeMonorailTrains,
  stepMonorailTrains,
  monorailPointAt,
  getIslandRoads,
  getTownPlots,
  distanceToNearestRoad,
  inlandDistance,
  islandReach,
  islandAt,
  monorailCeiling,
  monorailFloors,
  MONORAIL_HEIGHT,
  MONORAIL_BEAM_DEPTH,
  MONORAIL_CORRIDOR,
  MONORAIL_CURVE_RADIUS,
  MONORAIL_PIER_SPACING,
  MONORAIL_PIER_MIN_CLEARANCE,
  MONORAIL_ROAD_CLEARANCE,
  MONORAIL_SPEED,
  MONORAIL_DWELL,
  MONORAIL_CARS,
  MONORAIL_CAR_LENGTH,
  MONORAIL_HEADWAY,
  MONORAIL_PLATFORM_LENGTH,
  PLAZA_FOUNTAIN_OFFSET,
  PLAZA_FOUNTAIN_RADIUS,
  getBridges,
  getBridgeRoadPaths
} from '../src/world/islandLayout.js'
import { turningRadii, distanceToPath } from '../src/world/curves.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const route = getMonorailRoute()

// ---------------------------------------------------------------------------
console.log('1. The line goes everywhere, once\n')

chk('there is a route at all', !!route)
const stops = getMonorailStops()
console.log(`   ${stops.map(i => i.id).join(' -> ')} -> (back to start)`)

chk(`every island gets a stop (${route.stations.length} of ${ISLANDS.length})`,
    route.stations.length === ISLANDS.length)
chk('no island twice',
    new Set(route.stations.map(s => s.id)).size === route.stations.length)
chk('the stations are in the order the line meets them',
    route.stations.every((s, i) => i === 0 || s.at >= route.stations[i - 1].at))

// The hub sits in the middle of the archipelago, so it cannot be placed by
// bearing. It should have been threaded into the cheapest leg - between the
// two islands either side of it - not left wherever the sort put it.
const order = stops.map(i => i.id)
const hubAt = order.indexOf('hub')
const before = order[(hubAt - 1 + order.length) % order.length]
const after = order[(hubAt + 1) % order.length]
chk(`the central island is threaded between two others (${before} - hub - ${after})`,
    before !== 'hub' && after !== 'hub' && hubAt >= 0)

// ---------------------------------------------------------------------------
console.log('\n2. The loop is one closed, sane curve')

const first = route.points[0]
const last = route.points[route.points.length - 1]
chk('it closes on itself',
    Math.hypot(last.x - first.x, last.z - first.z) < 1e-6,
    `${Math.hypot(last.x - first.x, last.z - first.z)}`)

let minStep = Infinity, maxStep = 0
for (let i = 1; i < route.points.length; i++) {
  const d = Math.hypot(route.points[i].x - route.points[i - 1].x,
                       route.points[i].z - route.points[i - 1].z)
  minStep = Math.min(minStep, d)
  maxStep = Math.max(maxStep, d)
}
// Even spacing is what lets everything else measure in metres along the line
chk(`the points are evenly spaced (${minStep.toFixed(2)} to ${maxStep.toFixed(2)})`,
    maxStep - minStep < 0.2, `${minStep} .. ${maxStep}`)

const radii = turningRadii(route.points)
const tightest = Math.min(...radii)
console.log(`   loop ${route.length.toFixed(0)} units, ${route.points.length} points,` +
            ` tightest radius ${tightest.toFixed(1)}`)
// The whole reason the line is built from arcs rather than a spline. A
// spline through these six points measured 5.7.
chk(`no curve tighter than the stated radius (${tightest.toFixed(1)} vs ${MONORAIL_CURVE_RADIUS})`,
    tightest > MONORAIL_CURVE_RADIUS * 0.85, `${tightest}`)

// Self-crossing. Note the tolerance and the along-the-line gate: without
// them, two segments on the same straight leg register as crossing each
// other purely from floating-point noise, and the test reports faults that
// aren't there. That happened.
const P = route.points
const crosses = (a, b, c, d) => {
  const s = (p, q, t) => (q.x - p.x) * (t.z - p.z) - (q.z - p.z) * (t.x - p.x)
  const e = 1e-6
  const d1 = s(a, b, c), d2 = s(a, b, d), d3 = s(c, d, a), d4 = s(c, d, b)
  return ((d1 < -e && d2 > e) || (d1 > e && d2 < -e)) &&
         ((d3 < -e && d4 > e) || (d3 > e && d4 < -e))
}
let selfCross = 0
for (let i = 0; i < P.length - 1; i++) {
  for (let j = i + 2; j < P.length - 1; j++) {
    const apart = route.cumulative[j] - route.cumulative[i]
    if (Math.min(apart, route.length - apart) < MONORAIL_CURVE_RADIUS * 3) continue
    if (crosses(P[i], P[i + 1], P[j], P[j + 1])) selfCross++
  }
}
chk('the loop never crosses itself', selfCross === 0, `${selfCross}`)

// ---------------------------------------------------------------------------
console.log('\n3. Every platform is over its own island, on land')

for (const s of route.stations) {
  const inland = inlandDistance(s.island, s.x - s.island.x, s.z - s.island.z)
  const reach = islandReach(s.island)
  console.log(`   ${s.id.padEnd(9)} ${s.offCentre.toFixed(1).padStart(5)} off centre,` +
              ` ${inland.toFixed(0).padStart(3)} inland, reach ${reach.toFixed(0)}`)

  // The stair tower and the platform both need real ground under them. This
  // is the check that caught the arcs pushing `about` to 3 units from the
  // water, back when the corners weren't aimed at the island centres.
  chk(`${s.id}: the platform stands well inland (${inland.toFixed(0)})`,
      inland > MONORAIL_PLATFORM_LENGTH / 2, `${inland}`)
  chk(`${s.id}: and close to the middle of the island (${s.offCentre.toFixed(1)})`,
      s.offCentre < 6, `${s.offCentre}`)
}

// ---------------------------------------------------------------------------
console.log('\n4. The piers stand somewhere sensible')

const piers = getMonorailPiers(route)
const onLand = piers.filter(p => p.island)
const inWater = piers.filter(p => !p.island)
console.log(`   ${piers.length} piers: ${onLand.length} on land, ${inWater.length} in the sea`)

chk('there are piers', piers.length > 20, `${piers.length}`)

// islandAt() is what decided this. Check it against the geometry directly,
// rather than trusting the label the pier came with.
const misfiled = piers.filter(p => {
  const truly = ISLANDS.find(i => inlandDistance(i, p.x - i.x, p.z - i.z) > 0)
  return (truly || null) !== (p.island || null)
})
chk('each pier knows whether it is on land or in the water', misfiled.length === 0,
    `${misfiled.length} wrong`)

const inRoad = onLand.filter(p =>
  distanceToNearestRoad(getIslandRoads(p.island), p.x - p.island.x, p.z - p.island.z)
    < MONORAIL_PIER_MIN_CLEARANCE)
chk('no pier stands in a carriageway', inRoad.length === 0,
    inRoad.map(p => p.island.id).join(','))

const tight = onLand.filter(p => p.clearance < MONORAIL_ROAD_CLEARANCE)
console.log(`   ${tight.length} pier(s) closer to a road than we'd like,` +
            ` worst ${Math.min(...onLand.map(p => p.clearance)).toFixed(1)}`)

// A pier's reported clearance has to be the real one, or the sliding that
// avoids roads is being judged on a number it made up.
//
// `road` and `deck` are reported separately because they are not the same
// kind of rule: a column near a kerb is untidy, a column through a bridge
// deck is a hole in a road. `clearance` is the lesser of the two, so it's
// `road` that has to match the island measurement.
const lying = onLand.filter(p => Math.abs(
  distanceToNearestRoad(getIslandRoads(p.island), p.x - p.island.x, p.z - p.island.z)
  - p.road) > 0.01)
chk('the clearance each pier reports is the clearance it has', lying.length === 0,
    `${lying.length}`)
chk('and clearance is the lesser of the road and the bridges',
    piers.every(p => Math.abs(p.clearance - Math.min(p.road, p.deck)) < 1e-9))

// Every pier must reach the beam. Most stand directly under it; the ones
// that had to step aside for a bridge hold it on a cross-arm, and what
// matters is that the arm's far end is on the beam.
let offBeam = 0
let onArms = 0
for (const p of piers) {
  const at = monorailPointAt(route, p.at)
  if (p.offset) onArms++
  const reach = Math.hypot(at.x - (p.beamX ?? p.x), at.z - (p.beamZ ?? p.z))
  if (reach > 0.01) offBeam++
}
console.log(`   ${onArms} pier(s) hold the beam on a cross-arm`)
chk('every pier reaches the beam', offBeam === 0, `${offBeam}`)
chk('and any arm is short enough to be a cross-head, not a bridge of its own',
    piers.every(p => Math.abs(p.offset || 0) <= 14),
    `${Math.max(...piers.map(p => Math.abs(p.offset || 0)))}`)

// The bug this was written for: piers coming down through a bridge deck.
// Piers over water used to get no clearance test at all, on the reasoning
// that there are no roads at sea - except that a bridge is a road at sea.
let onDeck = 0
let onBridgeRoad = 0
for (const p of piers) {
  for (const bridge of getBridges()) {
    const dx = p.x - bridge.x, dz = p.z - bridge.z
    const cos = Math.cos(bridge.rotationY), sin = Math.sin(bridge.rotationY)
    if (Math.abs(dz * cos + dx * sin) < bridge.length / 2 &&
        Math.abs(dx * cos - dz * sin) < bridge.width / 2) onDeck++
  }
  for (const path of getBridgeRoadPaths()) {
    if (distanceToPath(path.points, p.x, p.z) < path.width / 2) { onBridgeRoad++; break }
  }
}
chk('no pier stands on a bridge deck', onDeck === 0, `${onDeck}`)
chk('and none in a bridge carriageway', onBridgeRoad === 0, `${onBridgeRoad}`)

// Gaps. Long ones are expected where a station carries its own supports, or
// where a pier was dropped rather than planted in a road.
const ats = piers.map(p => p.at).sort((a, b) => a - b)
let longest = route.length - ats[ats.length - 1] + ats[0]
for (let i = 1; i < ats.length; i++) longest = Math.max(longest, ats[i] - ats[i - 1])
console.log(`   longest unsupported span ${longest.toFixed(0)} units` +
            ` (nominal ${MONORAIL_PIER_SPACING})`)
chk(`no absurd span (${longest.toFixed(0)})`, longest < MONORAIL_PIER_SPACING * 4,
    `${longest}`)

// ---------------------------------------------------------------------------
console.log('\n5. Stair towers reach the ground, clear of things')

const towers = getMonorailStationTowers(route)
chk(`one tower per station (${towers.length})`, towers.length === route.stations.length)

for (const t of towers) {
  const local = { x: t.x - t.island.x, z: t.z - t.island.z }
  const inland = inlandDistance(t.island, local.x, local.z)
  const clear = distanceToNearestRoad(getIslandRoads(t.island), local.x, local.z)

  let fountainGap = Infinity
  for (const d of t.island.districts || []) {
    if (d.type !== 'plaza') continue
    const fx = t.island.x + (d.x || 0)
    const fz = t.island.z + (d.z || 0) + PLAZA_FOUNTAIN_OFFSET
    fountainGap = Math.min(fountainGap, Math.hypot(t.x - fx, t.z - fz) - PLAZA_FOUNTAIN_RADIUS)
  }

  console.log(`   ${t.station.id.padEnd(9)} inland ${inland.toFixed(0).padStart(3)},` +
              ` road ${clear.toFixed(1).padStart(5)}` +
              (fountainGap < Infinity ? `, fountain ${fountainGap.toFixed(1)}` : ''))

  chk(`${t.station.id}: tower is on dry land`, inland > 4, `${inland}`)
  chk(`${t.station.id}: tower is off the road`, clear > 2.5, `${clear}`)
  if (fountainGap < Infinity) {
    chk(`${t.station.id}: tower is out of the fountain`, fountainGap > 1.5, `${fountainGap}`)
  }

  // It has to be within reach of its platform, or the walkway across is a
  // plank hanging over the town.
  const reach = Math.hypot(t.x - t.station.x, t.z - t.station.z)
  chk(`${t.station.id}: tower is beside the platform (${reach.toFixed(0)} units)`,
      reach < MONORAIL_PLATFORM_LENGTH, `${reach}`)
}

// ---------------------------------------------------------------------------
console.log('\n6. monorailPointAt walks the line properly')

let worstOff = 0
for (let d = 0; d < route.length; d += 5.7) {
  const a = monorailPointAt(route, d)
  let best = Infinity
  for (let i = 1; i < P.length; i++) {
    const u = P[i - 1], v = P[i]
    const dx = v.x - u.x, dz = v.z - u.z, l2 = dx * dx + dz * dz
    let t = l2 ? ((a.x - u.x) * dx + (a.z - u.z) * dz) / l2 : 0
    t = Math.max(0, Math.min(1, t))
    best = Math.min(best, Math.hypot(a.x - (u.x + dx * t), a.z - (u.z + dz * t)))
  }
  worstOff = Math.max(worstOff, best)
}
chk(`it never leaves the beam (worst ${worstOff.toExponential(1)})`, worstOff < 1e-9,
    `${worstOff}`)

let stepErr = 0
for (let d = 0; d < route.length; d += 11) {
  const a = monorailPointAt(route, d)
  const b = monorailPointAt(route, d + 10)
  stepErr = Math.max(stepErr, Math.abs(Math.hypot(b.x - a.x, b.z - a.z) - 10))
}
// Chord versus arc: 10 units along a 40-radius curve measures slightly less
// as the crow flies. A tenth of a unit is the curve, not an error.
chk(`ten units along the line is ten units (out by ${stepErr.toFixed(3)})`, stepErr < 0.2,
    `${stepErr}`)

const wrapped = monorailPointAt(route, route.length * 3 + 12)
const plain = monorailPointAt(route, 12)
chk('distances wrap, so a train can just keep counting',
    Math.hypot(wrapped.x - plain.x, wrapped.z - plain.z) < 1e-6)

const backwards = monorailPointAt(route, -20)
chk('and going backwards works too', Number.isFinite(backwards.x))

// ---------------------------------------------------------------------------
console.log('\n7. The trains run the line')

const trains = makeMonorailTrains(route)
chk(`there are trains (${trains.length})`, trains.length >= 2)
chk('each one starts at a station',
    trains.every(t => route.stations.some(s => Math.abs(s.at - t.distance) < 0.01)))
chk('and not all at the same one',
    new Set(trains.map(t => t.distance)).size === trains.length)

// Run a few laps at a normal frame time
const dt = 1 / 60
const seconds = 400
const visits = new Map(route.stations.map(s => [s.id, 0]))
let stoppedAway = 0
let maxSpeed = 0
let minHeadway = Infinity
const rake = MONORAIL_CARS * MONORAIL_CAR_LENGTH
const wasDwelling = trains.map(() => false)
// Per train, which platforms it has called at. Counting stops alone isn't
// enough: the first version of this stopped 89 times without moving, and a
// total was happy with that.
const served = trains.map(() => new Set())

for (let step = 0; step < seconds / dt; step++) {
  stepMonorailTrains(route, trains, dt)

  trains.forEach((t, i) => {
    maxSpeed = Math.max(maxSpeed, t.speed)

    // A train stopped anywhere but a platform is the failure that matters
    if (t.dwell > 0) {
      const nearest = Math.min(...route.stations.map(s => {
        const g = Math.abs(s.at - t.distance)
        return Math.min(g, route.length - g)
      }))
      if (nearest > 0.6) stoppedAway++
      if (!wasDwelling[i]) {
        const at = route.stations.reduce((best, s) => {
          const g = Math.abs(s.at - t.distance)
          const gap = Math.min(g, route.length - g)
          return gap < best.gap ? { id: s.id, gap } : best
        }, { id: null, gap: Infinity })
        if (at.id) { visits.set(at.id, visits.get(at.id) + 1); served[i].add(at.id) }
      }
    }
    wasDwelling[i] = t.dwell > 0

    for (const other of trains) {
      if (other === t) continue
      let gap = other.distance - rake - t.distance
      while (gap < 0) gap += route.length
      minHeadway = Math.min(minHeadway, gap)
    }
  })
}

console.log('   stops made in ' + seconds + 's: ' +
  [...visits].map(([k, v]) => `${k}:${v}`).join(' '))
console.log(`   top speed ${maxSpeed.toFixed(1)} of ${MONORAIL_SPEED},` +
            ` closest two trains got ${minHeadway.toFixed(0)} units`)

chk('every station gets served', [...visits.values()].every(v => v > 0),
    [...visits].map(([k, v]) => `${k}:${v}`).join(' '))
chk('a train only ever stops at a platform', stoppedAway === 0, `${stoppedAway} frames`)
chk(`no train exceeds the line speed (${maxSpeed.toFixed(1)})`,
    maxSpeed <= MONORAIL_SPEED + 1e-9, `${maxSpeed}`)
chk('trains keep their distance', minHeadway > 0, `${minHeadway}`)
chk('every train is still on the loop',
    trains.every(t => t.distance >= 0 && t.distance < route.length))
chk('and every train has been all the way round, calling everywhere',
    served.every(s => s.size === route.stations.length),
    served.map(s => s.size + '/' + route.stations.length).join(' '))
chk('the trains actually reached line speed',
    maxSpeed > MONORAIL_SPEED * 0.9, `${maxSpeed}`)

// A long frame - a tab coming back from the background - must not throw a
// train off the end of the line or past a platform it should have stopped at.
const jolted = makeMonorailTrains(route)
for (let i = 0; i < 40; i++) stepMonorailTrains(route, jolted, 0.75)
chk('a stuttering frame rate keeps them on the line',
    jolted.every(t => t.distance >= 0 && t.distance < route.length),
    jolted.map(t => t.distance.toFixed(1)).join(','))

// Dwell has to actually be the dwell, or the trains never stand still
const one = makeMonorailTrains(route, 1)
one[0].dwell = 0
let dwellFrames = 0
for (let i = 0; i < 4000; i++) {
  stepMonorailTrains(route, one, dt)
  if (one[0].dwell > 0) dwellFrames++
}
const dwellSeconds = dwellFrames * dt / Math.max(1, one[0].stops)
console.log(`   about ${dwellSeconds.toFixed(1)}s standing per stop (set to ${MONORAIL_DWELL})`)
chk('it waits roughly the dwell time at each stop',
    Math.abs(dwellSeconds - MONORAIL_DWELL) < 1.2, `${dwellSeconds}`)

// ---------------------------------------------------------------------------
console.log('\n8. Nothing pokes through the beam')

const underside = MONORAIL_HEIGHT - MONORAIL_BEAM_DEPTH
console.log(`   beam top ${MONORAIL_HEIGHT}, underside ${underside},` +
            ` ceiling in the corridor ${monorailCeiling(route, route.stations[0].x, route.stations[0].z).toFixed(2)}`)

// The camera rides up to 7.8 units at speed. Any lower and the beam would cut
// across the view of the car every time you drove under it - so this figure
// and Camera.js's fastHeight are a pair, and moving either needs the other
// checked.
chk(`the beam clears the chase camera (underside ${underside} vs 7.8)`,
    underside > 8.8, `${underside}`)

const ceilingUnder = monorailCeiling(route, route.stations[0].x, route.stations[0].z)
chk('there is a ceiling under the line', ceilingUnder < underside, `${ceilingUnder}`)
chk('and none away from it',
    monorailCeiling(route, route.points[0].x + 400, route.points[0].z + 400) === Infinity)

// The corridor has to be wider than the trains, or a train would clip a
// building that the ceiling said was fine.
chk(`the corridor is wider than a train (${MONORAIL_CORRIDOR} vs 1.8 half-width)`,
    MONORAIL_CORRIDOR > 1.8 + 1)

// Every generated building, at the height it will actually be built,
// measured against the beam it is under. This is the check that the whole
// lowering rests on.
let underLine = 0, plots = 0, tallest = 0, dropped = 0
for (const island of ISLANDS) {
  for (const plot of getTownPlots(island)) {
    plots++
    const x = island.x + plot.x
    const z = island.z + plot.z
    if (monorailCeiling(route, x, z) === Infinity) continue

    underLine++
    // 5 floors is the most the generator ever asks for
    const floors = monorailFloors(route, x, z, 5)
    if (floors < 1) { dropped++; continue }
    tallest = Math.max(tallest, floors * 2.5 + 0.35)   // storeys plus roof
  }
}
console.log(`   ${underLine} of ${plots} generated plots are under the line;` +
            ` tallest of them ${tallest.toFixed(2)}`)
chk('some of the town is under the line, or this proves nothing', underLine > 0,
    `${underLine}`)
chk('but not most of it', underLine < plots * 0.4, `${underLine}/${plots}`)
chk(`every building under the line clears the beam (${tallest.toFixed(2)} vs ${underside})`,
    tallest < underside, `${tallest} vs ${underside}`)
chk('and none had to be dropped entirely', dropped === 0, `${dropped}`)

// A plot in the clear must keep its full height, or the corridor is
// flattening the whole world rather than a strip of it.
let keptFull = 0
for (const island of ISLANDS) {
  for (const plot of getTownPlots(island)) {
    const x = island.x + plot.x
    const z = island.z + plot.z
    if (monorailCeiling(route, x, z) < Infinity) continue
    if (monorailFloors(route, x, z, 5) === 5) keptFull++
  }
}
chk(`buildings away from the line keep every floor (${keptFull})`,
    keptFull === plots - underLine, `${keptFull} of ${plots - underLine}`)

// Palms are the other thing that reaches: 7.5 of trunk plus about a unit of
// crown. The renderer caps the trunk at the ceiling less 1.2.
const palmTrunk = Math.min(7.5, ceilingUnder - 1.2)
chk(`a palm under the line clears it too (${(palmTrunk + 1).toFixed(1)})`,
    palmTrunk + 1 < underside, `${palmTrunk + 1}`)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
