/**
 * Street furniture stays off the road.
 *
 * Mike, with five screenshots, 6 November 2026: "items in the middle of the
 * road" - traffic lights, lamp posts, bus stops; in the towns and on the
 * speedway. The third report of the same thing. The two earlier fixes each
 * passed a check, and each check tested the point the placer CHOSE against
 * the roads the placer KNEW ABOUT - never the thing that was drawn.
 *
 * So the real check is now tools/sweep.mjs, which runs the built game in a
 * browser and tests every prop World.js registers (`noteProp`) against every
 * triangle of asphalt it drew (`userData.road`). It found 90 of 561 props on
 * or within 0.6 of the tarmac, in five distinct ways, and finds none now.
 *
 * This file pins the five causes in arithmetic, so each would fail here
 * before anybody has to open a browser:
 *
 *   1. Bus shelters were placed to the LEFT (across the road) and from the
 *      back of the pavement, not the kerb. 31 of 34 on asphalt.
 *   2. The island's copy of a bridge approach was 7 wide; the bridge road is
 *      drawn 14 wide. Signal poles cleared the 7 and stood in the 14.
 *   3. Nothing knew about the junction patches, which reach past the roads.
 *   4. Closed courses had stops, signals and crossings on their circuits.
 *   5. One pole was placed past the coast, on the bridge deck.
 */
import {
  getBusStops, getIslandRoads, getIslandJunctions, getTrafficSignals,
  getBridgeRoadPaths, getLaneNetwork, islandAt, inlandDistance,
  distanceToNearestRoad, distanceToAsphalt, ISLANDS,
  ARTERIAL_WIDTH, PAVEMENT_WIDTH, POLE_CLEARANCE
} from '../src/world/islandLayout.js'
import { distanceToPath } from '../src/world/curves.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(HERE, '..', f), 'utf8')
const world = read('src/world/World.js')

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

// The same numbers World.createBusStops() uses, read from the source so this
// cannot drift from them.
const num = (name) => {
  const m = world.match(new RegExp(`export const ${name} = ([0-9.]+)`))
  return m ? parseFloat(m[1]) : NaN
}
const SHELTER_SETBACK = num('SHELTER_SETBACK')
const SHELTER_DEPTH = num('SHELTER_DEPTH')

// Distance from a world point to the nearest bridge road's asphalt.
const bridges = getBridgeRoadPaths()
const bridgeClearance = (x, z) => {
  let best = Infinity
  for (const b of bridges) best = Math.min(best, distanceToPath(b.points, x, z) - b.width / 2)
  return best
}

// ---------------------------------------------------------------------------
console.log('1. Bus stops stand on the pavement, on the kerb side\n')

const stops = getBusStops()
console.log(`   ${stops.length} stops`)
chk('SHELTER_SETBACK and SHELTER_DEPTH were read from World.js',
    SHELTER_SETBACK > 0 && SHELTER_DEPTH > 0, `${SHELTER_SETBACK} ${SHELTER_DEPTH}`)
chk('a stop\'s `kerb` is the road\'s edge, a quarter width from the lane',
    stops.every(s => {
      const lane = getLaneNetwork().lanes[s.lane]
      return Math.abs(s.kerb - lane.width / 4) < 1e-9
    }))
chk('post and shelter both fit on a pavement PAVEMENT_WIDTH wide',
    SHELTER_SETBACK > 0.3 && SHELTER_SETBACK + SHELTER_DEPTH + 0.95 <= PAVEMENT_WIDTH + 0.05,
    `${SHELTER_SETBACK} + ${SHELTER_DEPTH} + half a shelter`)

{
  let onRoad = 0, wrongSide = 0, worst = Infinity
  for (const s of stops) {
    const island = ISLANDS.find(i => i.id === s.island)
    const roads = getIslandRoads(island)
    const sx = -Math.cos(s.heading), sz = Math.sin(s.heading)   // right
    const out = s.kerb + SHELTER_SETBACK
    // Where World.js puts the post, the way World.js puts it: + sx.
    const px = s.x + sx * out, pz = s.z + sz * out
    const d = distanceToAsphalt(island, px - island.x, pz - island.z)
    worst = Math.min(worst, d)
    if (d < 0.5) onRoad++
    // And the lane point itself must be nearer the kerb side than the far
    // side, or "right" is the wrong way for this lane.
    const toRight = distanceToNearestRoad(roads, s.x + sx * 2 - island.x, s.z + sz * 2 - island.z)
    const toLeft = distanceToNearestRoad(roads, s.x - sx * 2 - island.x, s.z - sz * 2 - island.z)
    if (toRight < toLeft) wrongSide++
  }
  console.log(`   nearest a post gets to the asphalt: ${worst.toFixed(2)}`)
  chk('every post is clear of the asphalt', onRoad === 0, `${onRoad} on it`)
  chk('and every lane\'s kerb really is on its right', wrongSide === 0, `${wrongSide}`)
  chk('World.js steps to the RIGHT of the lane (+ sx), not across the road',
      /const x = stop\.x \+ sx \* out/.test(world) && /const bx = x \+ sx \* SHELTER_DEPTH/.test(world))
}

// ---------------------------------------------------------------------------
console.log('\n2. Bridge approaches are as wide as the bridge road\n')

{
  let approaches = 0, narrow = 0
  for (const island of ISLANDS) {
    for (const r of getIslandRoads(island)) {
      if (!r.auto) continue
      approaches++
      if (r.width !== ARTERIAL_WIDTH) narrow++
    }
  }
  console.log(`   ${approaches} approach roads`)
  chk('every approach road is ARTERIAL_WIDTH wide, like the run it is part of',
      approaches > 0 && narrow === 0, `${narrow} narrower`)
  chk('and the bridge roads really are that wide',
      bridges.length > 0 && bridges.every(b => b.width === ARTERIAL_WIDTH))
}

// ---------------------------------------------------------------------------
console.log('\n3. Signal poles are off the asphalt, inland, and off the bridges\n')

{
  let poles = 0, onRoad = 0, onBridge = 0, atSea = 0, onPatch = 0
  for (const island of ISLANDS) {
    for (const signal of getTrafficSignals(island)) {
      for (const arm of signal.arms) {
        poles++
        const p = arm.pole
        if (distanceToNearestRoad(getIslandRoads(island), p.x, p.z) < POLE_CLEARANCE) onRoad++
        if (distanceToAsphalt(island, p.x, p.z) < POLE_CLEARANCE) onPatch++
        if (inlandDistance(island, p.x, p.z) < 1) atSea++
        if (bridgeClearance(island.x + p.x, island.z + p.z) < 0.3) onBridge++
      }
    }
  }
  console.log(`   ${poles} poles`)
  chk('there are poles', poles > 50)
  chk('none within POLE_CLEARANCE of a road', onRoad === 0, `${onRoad}`)
  chk('none within POLE_CLEARANCE of a junction patch', onPatch === 0, `${onPatch}`)
  chk('none past the coast', atSea === 0, `${atSea}`)
  chk('none on a bridge deck', onBridge === 0, `${onBridge}`)
}

// ---------------------------------------------------------------------------
console.log('\n4. Junction patches count as road\n')

{
  const island = ISLANDS.find(i => i.id === 'hub')
  const js = getIslandJunctions(island)
  chk('the hub has junctions to test with', js.length > 2)
  // A point just inside a patch's rim but well outside both roads' edges,
  // if there is one: the patch radius reaches the crossing's corners.
  const j = js.reduce((a, b) => (b.radius > a.radius ? b : a))
  const roads = getIslandRoads(island)
  let found = null
  for (let a = 0; a < Math.PI * 2 && !found; a += 0.05) {
    const x = j.x + Math.cos(a) * (j.radius - 0.3)
    const z = j.z + Math.sin(a) * (j.radius - 0.3)
    if (distanceToNearestRoad(roads, x, z) > 0.6) found = { x, z }
  }
  chk('a patch reaches ground the roads alone call clear', !!found)
  if (found) {
    chk('and distanceToAsphalt() calls that ground road',
        distanceToAsphalt(island, found.x, found.z) < 0)
  }
  chk('World.onCarriageway() asks distanceToAsphalt, not the roads alone',
      /onCarriageway\(x, z, margin = 0\.5\) \{[\s\S]{0,400}?distanceToAsphalt\(island/.test(world))
  chk('and so does the scatter\'s isBuildable()',
      /isBuildable\([\s\S]{0,1600}?distanceToAsphalt\(island, localX, localZ\) > clearance/.test(world))
  chk('and lightRoads()', /lightRoads\(island, roads\) \{[\s\S]{0,2400}?distanceToAsphalt\(island, lx, lz\) < 0\.8/.test(world))
}

// ---------------------------------------------------------------------------
console.log('\n5. Closed courses have no furniture on their circuits\n')

for (const id of ['speedway', 'stunt']) {
  const island = ISLANDS.find(i => i.id === id)
  chk(`${id.padEnd(9)} is a closed course`, !!island && island.noTraffic === true)
  chk(`${id.padEnd(9)} has no traffic signals`, getTrafficSignals(island).length === 0,
      `${getTrafficSignals(island).length}`)
  chk(`${id.padEnd(9)} has no bus stops`, stops.every(s => s.island !== id))
}

// ---------------------------------------------------------------------------
console.log('\n6. The sweep can see everything\n')

// Every placer registers what it puts down, and every asphalt surface says
// what it is, or tools/sweep.mjs is checking a sample and calling it the
// world.
for (const fn of ['addStreetlight', 'addTrafficLight', 'addBench', 'addBin', 'addPlanter',
                  'addStreetTree', 'addPalm', 'addBush', 'addRock']) {
  chk(`${fn.padEnd(16)} registers itself`,
      new RegExp(`  ${fn}\\([^)]*\\) \\{[\\s\\S]{0,260}?this\\.noteProp\\('`).test(world))
}
chk('and so does the bus stop post', /this\.noteProp\('bus stop', x, z\)/.test(world))
chk('road surfaces are tagged', /surface\.userData\.road = true/.test(world))
chk('junction patches are tagged', /patch\.userData\.road = 'junction'/.test(world))
chk('bridge decks are tagged', /deck\.userData\.road = 'bridge'/.test(world))
chk('the circuit is tagged', /track\.userData\.road = 'circuit'/.test(world))
chk('the airport is tagged', (world.match(/userData\.road = 'airport'/g) || []).length === 2)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
