/**
 * The shapes vehicles are made of.
 *
 * `vehicleParts.js` is the answer to Mike's note that the fleet looks "too
 * boxy". It was: every vehicle was a stack of axis-aligned boxes, so a saloon
 * had vertical sides, square corners, a flat bonnet and a roof exactly as wide
 * as its sills.
 *
 * What is checked here is the arithmetic, which is all that can be checked
 * without a browser - and, as it turns out, all that has ever gone wrong with
 * it. The one bug in this file's history was a winding bug: every triangle
 * came out facing INWARDS, which draws nothing at all. That is exactly the
 * mistake the stunt arena's mounds shipped with, twice, and both times it
 * survived rounds of "why can't I see this" because the failure is silent.
 * So the winding check comes first.
 */
import {
  loftSolid, loftBounds, outwardCount,
  carBody, vanBody, raceBody, monsterBody,
  wheelPositions, WHEEL
} from '../src/world/vehicleParts.js'
import { TRAFFIC_LENGTHS, TRAFFIC_WIDTHS } from '../src/world/islandLayout.js'
import { VEHICLE_MASS } from '../src/systems/Physics.js'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

// ---------------------------------------------------------------------------
console.log('1. A lofted body is a closed solid, the right way out\n')

const box = loftSolid([
  { z: -2, halfWidth: 1, yBottom: 0.3, yTop: 1.2 },
  { z: 0, halfWidth: 1.2, yBottom: 0.2, yTop: 1.4 },
  { z: 2, halfWidth: 0.8, yBottom: 0.3, yTop: 1.0 }
])

chk('it has triangles', box.positions.length > 0 && box.positions.length % 9 === 0,
    `${box.positions.length} floats`)
chk('every vertex has an index', box.indices.length === box.positions.length / 3)
chk('the indices are the plain sequence a non-indexed geometry wants',
    box.indices.every((v, i) => v === i))

// Two segments: four faces each as two triangles, plus two triangles at each
// end. 8 + 8 + 2 + 2 = 20.
chk('it is closed - every face and both caps',
    box.indices.length / 3 === 20, `${box.indices.length / 3} triangles`)

const wound = outwardCount(box)
chk('EVERY triangle faces out of the solid', wound.out === wound.total,
    `${wound.out} of ${wound.total} - a body wound inside out is invisible`)

// The check has to be able to fail, or it is decoration. Reversing one
// triangle must be caught.
const broken = loftSolid([
  { z: -1, halfWidth: 1, yBottom: 0, yTop: 1 },
  { z: 1, halfWidth: 1, yBottom: 0, yTop: 1 }
])
const p = broken.positions
;[p[0], p[3]] = [p[3], p[0]]
;[p[1], p[4]] = [p[4], p[1]]
;[p[2], p[5]] = [p[5], p[2]]
const after = outwardCount(broken)
chk('and it notices when one is turned round', after.out < after.total,
    `${after.out} of ${after.total}`)

const bounds = loftBounds(box)
chk('its bounds are the widest section, not the first',
    near(bounds.max.x, 1.2) && near(bounds.min.x, -1.2), JSON.stringify(bounds))
chk('and it runs from the first section to the last',
    near(bounds.min.z, -2) && near(bounds.max.z, 2))
chk('nothing is built below the sills', bounds.min.y >= 0.2 - 1e-9)

// A section can be slid sideways, which is the only thing this primitive
// cannot otherwise express.
const shifted = loftSolid([
  { z: -1, halfWidth: 1, yBottom: 0, yTop: 1, xShift: 2 },
  { z: 1, halfWidth: 1, yBottom: 0, yTop: 1, xShift: 2 }
])
chk('xShift moves a section without changing its width',
    near(loftBounds(shifted).min.x, 1) && near(loftBounds(shifted).max.x, 3))

// ---------------------------------------------------------------------------
console.log('\n2. Every body profile is a solid the right way out\n')

const PROFILES = [
  ['saloon, lower', carBody(4.4, 1.9).lower],
  ['saloon, cabin', carBody(4.4, 1.9).cabin],
  ['SUV, lower', carBody(4.8, 2.05, { sill: 0.5, shoulder: 1.22, roof: 2 }).lower],
  ['van', vanBody(6, 2.2)],
  ['racing car', raceBody(5, 1.9)],
  ['monster, lower', monsterBody(5.4, 2.5, 1.55).lower],
  ['monster, cabin', monsterBody(5.4, 2.5, 1.55).cabin],
  ['monster, bed', monsterBody(5.4, 2.5, 1.55).bed]
]

for (const [name, sections] of PROFILES) {
  const solid = loftSolid(sections)
  const w = outwardCount(solid)
  chk(`${name.padEnd(16)} is closed and faces out`, w.out === w.total,
      `${w.out} of ${w.total}`)
}

for (const [name, sections] of PROFILES) {
  chk(`${name.padEnd(16)} runs nose to tail without doubling back`,
      sections.every((s, i) => i === 0 || s.z > sections[i - 1].z),
      'sections must be in increasing z')
  chk(`${name.padEnd(16)} has a top above its bottom everywhere`,
      sections.every((s) => s.yTop > s.yBottom))
  chk(`${name.padEnd(16)} is never built below the road`,
      sections.every((s) => s.yBottom >= 0))
}

// ---------------------------------------------------------------------------
console.log('\n3. A car is car-shaped, which is what "not boxy" means\n')

{
  const shape = carBody(4.4, 1.9)
  const lower = loftBounds(loftSolid(shape.lower))
  const cabin = loftBounds(loftSolid(shape.cabin))

  // The three things a single box cannot do, and the whole reason this module
  // exists. If any of them stops being true, the fleet is boxy again.
  chk('the nose and tail tuck in - the flanks are not parallel',
      shape.lower[0].halfWidth < shape.lower[2].halfWidth &&
      shape.lower[4].halfWidth < shape.lower[2].halfWidth)
  chk('the bonnet drops towards the nose',
      shape.lower[4].yTop < shape.lower[2].yTop,
      `${shape.lower[4].yTop} against ${shape.lower[2].yTop}`)
  chk('the roof is narrower than the shoulders',
      cabin.max.x < lower.max.x, `${cabin.max.x} against ${lower.max.x}`)

  // And the cabin sits ON the lower body rather than floating over it or
  // sinking into it - the join is what the eye reads as a waistline.
  chk('the cabin meets the shoulder line rather than hovering',
      cabin.min.y < lower.max.y + 1e-9 && cabin.min.y > lower.max.y - 0.2,
      `cabin bottom ${cabin.min.y}, shoulder ${lower.max.y}`)
  chk('and it is set back from the nose, so there is a bonnet',
      cabin.max.z < lower.max.z - 1, `${cabin.max.z} against ${lower.max.z}`)

  // The A-pillar leans: the roof's leading edge is behind the windscreen's
  // base. A vertical windscreen is the single most box-like thing a car can
  // have.
  const roofFront = shape.cabin[2].z
  const screenBase = shape.cabin[3].z
  chk('the windscreen leans - the roof starts behind its base',
      roofFront < screenBase, `${roofFront} against ${screenBase}`)
}

// A monster truck is a PICKUP on big wheels, and the four things that make it
// one are the four things the first version got wrong. Mike drove that one:
// "the shape does not look like a real monster truck ... the chassis and body
// of the truck look a bit weird." It was one slab with a flat top.
{
  const RIDE = 1.55
  const RADIUS = 1.05           // World.js: buildMonsterTruck
  const length = TRAFFIC_LENGTHS.monster
  const width = TRAFFIC_WIDTHS.monster
  const m = monsterBody(length, width, RIDE)
  const lower = loftBounds(loftSolid(m.lower))
  const cabin = loftBounds(loftSolid(m.cabin))
  const bed = loftBounds(loftSolid(m.bed))

  // 1. THE LIFT. The old shell's bottom edge sat 0.6 BELOW the top of the
  // tyres, which buried the wheels and made a squat truck out of the one
  // vehicle whose whole identity is ride height. The beltline must clear
  // them.
  chk('the beltline clears the top of the tyres',
      m.belt > RADIUS * 2, `belt ${m.belt}, tyre top ${RADIUS * 2}`)

  // 2. THE GAP. You can see straight through under it between the wheels,
  // which is where the chassis, the diffs and the coil-overs live.
  chk('there is daylight between the axles and the underside of the body',
      RIDE - RADIUS > 0.4, `${(RIDE - RADIUS).toFixed(2)} of clearance`)

  // 3. THE CAB IS SHORT. A long cab is an SUV; a cab as long as the bonnet is
  // a van. On a pickup the bonnet wins.
  const cabLength = cabin.max.z - cabin.min.z
  const bonnet = lower.max.z - m.cowl
  chk('the cab is shorter than the bonnet ahead of it',
      cabLength < bonnet * 1.1, `cab ${cabLength.toFixed(2)}, bonnet ${bonnet.toFixed(2)}`)
  chk('and the cab is set back, so there is a bonnet at all',
      cabin.max.z < lower.max.z - 1, `${cabin.max.z} against ${lower.max.z}`)

  // 4. THE BED IS OPEN. Sunk below the rails, behind the cab. Fill it in and
  // the silhouette is a panel van.
  chk('the bed floor sits below the bed rails',
      m.bedFloor < m.belt - 0.2, `floor ${m.bedFloor}, rail ${m.belt}`)
  chk('the bed is behind the cab, not under it',
      bed.max.z <= cabin.min.z + 1e-9, `bed ${bed.max.z}, cab ${cabin.min.z}`)

  // The windscreen leans, same rule as the road cars.
  chk('the monster truck windscreen leans back over the bonnet',
      m.roofFront < m.cowl, `${m.roofFront} against ${m.cowl}`)

  // Narrow shell, wide stance: the tyres stand PROUD of the bodywork, which is
  // the other half of the silhouette and the reason the truck reads as wider
  // than the bus it is exactly as wide as. The inner half of each tyre is
  // under the fender, as it is on a real one - what must not happen is the
  // whole wheel disappearing into the flank.
  const THICKNESS = 0.62                      // World.js: addWheels
  const outer = width / 2 - THICKNESS / 2 + THICKNESS / 2
  chk('the tyres stand proud of the shell rather than inside it',
      lower.max.x < outer - 0.15, `shell ${lower.max.x}, tyre face ${outer}`)

  // And the whole thing stays within the overhang the rest of the fleet
  // already takes. 3.2 is TRAFFIC_HEIGHTS.monster, which lives in World.js and
  // cannot be imported here because World.js imports THREE. Models are allowed
  // over it - measured in the browser, the pickup's shell is 2.32 against a
  // stated 2.1 and the police car's 1.83 against 1.8, both about a tenth - and
  // the truck needs some of that slack or its body and cab are both slivers.
  // A tenth is the limit; past that the cage clips things the collider clears.
  const MONSTER_HEIGHT = 3.2
  chk('the roll cage and light bar stay within a tenth of the collider',
      m.top < MONSTER_HEIGHT * 1.1, `${m.top} against ${MONSTER_HEIGHT}`)
  chk('and the cabin itself is under it',
      cabin.max.y < m.top, `${cabin.max.y} against ${m.top}`)
  // The lower body is deep enough to have a door in it, and the cab is not a
  // letterbox. Both were under 0.6 before the overhang was spent.
  chk('the body side is deep enough to be a body side',
      m.belt - RIDE > 0.7, `${(m.belt - RIDE).toFixed(2)}`)
  chk('the greenhouse is deep enough to be a cab',
      m.roof - m.belt > 0.55, `${(m.roof - m.belt).toFixed(2)}`)
}

// A convertible is the same car with a lower shoulder and no roof to speak of.
{
  const open = carBody(4.2, 1.9, { shoulder: 0.98, roof: 1.3 })
  const shut = carBody(4.2, 1.9)
  chk('a convertible sits lower than the car it is based on',
      loftBounds(loftSolid(open.cabin)).max.y <
      loftBounds(loftSolid(shut.cabin)).max.y)
}

// ---------------------------------------------------------------------------
console.log('\n4. The wheels fit inside the vehicle\n')

// THE ONE THAT MATTERS ON A STREET. Lanes sit a quarter of the road's width
// either side of the centre line, so two vehicles passing are `width / 2`
// apart - 2.75 units on a 5.5-wide street. A wheel outside the bodywork would
// clip its oncoming neighbour, and it would look like a collision because it
// would be one.
for (const kind of Object.keys(TRAFFIC_LENGTHS)) {
  const length = TRAFFIC_LENGTHS[kind]
  const width = TRAFFIC_WIDTHS[kind]
  const radius = 0.5
  const thickness = 0.36
  const wheels = wheelPositions(length, width, radius, thickness)

  chk(`${kind.padEnd(12)} has four wheels`, wheels.length === 4)
  const widest = Math.max(...wheels.map((w) => Math.abs(w.x) + thickness / 2))
  chk(`${kind.padEnd(12)} keeps them inside its own width`,
      widest <= width / 2 + 1e-9, `${widest.toFixed(2)} against ${(width / 2).toFixed(2)}`)
  const longest = Math.max(...wheels.map((w) => Math.abs(w.z) + radius))
  chk(`${kind.padEnd(12)} keeps them inside its own length`,
      longest <= length / 2 + 1e-9, `${longest.toFixed(2)} against ${(length / 2).toFixed(2)}`)
}

{
  const wheels = wheelPositions(4.4, 1.9, 0.45)
  chk('the front pair comes first, because those are the ones that steer',
      wheels[0].front && wheels[1].front && !wheels[2].front && !wheels[3].front)
  chk('one on each side of each axle',
      wheels[0].side === -wheels[1].side && wheels[2].side === -wheels[3].side)
  chk('and every one of them stands on the road',
      wheels.every((w) => near(w.y, 0.45)))

  // The racing car is the exception and it is deliberate: its wheels are
  // OUTSIDE its bodywork, which is the whole silhouette. It gets a wider
  // track than its body by being handed a wider width.
  const race = wheelPositions(5, 1.9 * 1.24, 0.46, 0.42)
  chk('a racing car can be given a track wider than its tub',
      Math.abs(race[0].x) > 1.9 / 2, `${Math.abs(race[0].x).toFixed(2)}`)
}

// ---------------------------------------------------------------------------
console.log('\n5. A wheel has a rim in it\n')

// The old wheel was one eight-sided black cylinder, and four dark octagons is
// most of what made the fleet read as toys. These numbers are the fix, and
// they are here because each of them was wrong once.
chk('the tyre has enough sides to read as round rather than as a mistake',
    WHEEL.tyreSegments >= 12, `${WHEEL.tyreSegments}`)
chk('the rim is a real fraction of the wheel, not a dot',
    WHEEL.rimFraction > 0.5 && WHEEL.rimFraction < 0.85, `${WHEEL.rimFraction}`)
chk('and the hub is smaller than the rim', WHEEL.hubFraction < WHEEL.rimFraction)

// THE ONE THAT WAS WRONG. The rim is a cylinder concentric with the tyre, so
// its curved surface is buried inside it and the only part that can ever be
// seen is its end caps. At 0.02 those sat level with the tyre's own faces to
// within a hundredth of a unit - so they z-fought with them or lost, and the
// rim was invisible on every wheel in the world.
chk('the rim stands proud of the tyre far enough to be seen at all',
    WHEEL.rimProud >= 0.1, `${WHEEL.rimProud} - below about 0.1 it z-fights`)

// ---------------------------------------------------------------------------
console.log('\n6. A bus weighs more than a saloon\n')

// Mike: "maybe make the vehicles feel heavier." They all weighed 2.5 - the
// saloon, the racing car and the eleven-unit bus alike - so every one of them
// reacted to a kerb in exactly the same way and none of them had any weight at
// all. Measured on the slide test, giving the saloon a real mass took its
// worst disturbance over twenty runs from 9.76 to 6.12.
{
  for (const kind of Object.keys(TRAFFIC_LENGTHS)) {
    chk(`${kind.padEnd(12)} has a mass of its own`,
        typeof VEHICLE_MASS[kind] === 'number' && VEHICLE_MASS[kind] > 0,
        `${VEHICLE_MASS[kind]}`)
  }

  // The ORDER is the point, not the numbers. Anything that is plainly bigger
  // has to be plainly heavier, or the table is decoration.
  // ON THE ROAD. The monorail is heavier than a bus and should be - it is a
  // train - but it is on a beam eleven units above the road, so it is not part
  // of this ordering. Spelt out rather than taken over every value in the
  // table, which is what this used to do and what the monorail broke.
  const onRoad = Object.entries(VEHICLE_MASS)
    .filter(([k]) => k !== 'monorail')
    .map(([, m]) => m)
  chk('a bus is the heaviest thing on the road',
      VEHICLE_MASS.bus === Math.max(...onRoad))
  chk('and the train is heavier still, because it is a train',
      VEHICLE_MASS.monorail > VEHICLE_MASS.bus)
  chk('a fire engine outweighs an ambulance, which outweighs an SUV',
      VEHICLE_MASS.fire > VEHICLE_MASS.ambulance &&
      VEHICLE_MASS.ambulance > VEHICLE_MASS.suv)
  chk('and a racing car is the lightest',
      VEHICLE_MASS.race === Math.min(...Object.values(VEHICLE_MASS)))

  // Roughly with size, or something will behave oddly against its neighbours.
  const bySize = Object.keys(TRAFFIC_LENGTHS)
    // The three that are not road vehicles, and are therefore not in this
    // ordering at all: two the city never drives, and one that is not on the
    // road. A monorail weighing more than a bus is correct and would fail
    // "the bus is the heaviest thing on the road" - which is a statement about
    // roads.
    .filter((k) => k !== 'monster' && k !== 'race' && k !== 'monorail')
    .sort((a, b) => TRAFFIC_LENGTHS[a] * TRAFFIC_WIDTHS[a] -
                    TRAFFIC_LENGTHS[b] * TRAFFIC_WIDTHS[b])
  let ordered = true
  for (let i = 1; i < bySize.length; i++) {
    if (VEHICLE_MASS[bySize[i]] < VEHICLE_MASS[bySize[i - 1]]) ordered = false
  }
  chk('every road vehicle is heavier than the one below it in size', ordered,
      bySize.map((k) => `${k} ${VEHICLE_MASS[k]}`).join(', '))

  // The monster truck is the exception and it is deliberate: it is short, and
  // most of what it weighs is wheels.
  chk('the monster truck is heavy for its length, because it is mostly wheel',
      VEHICLE_MASS.monster > VEHICLE_MASS.suv)
}

console.log('\nEverything the cab hands out is carried up to the mesh')
// THE SILENT ONE.
//
// A vehicle builder returns an inner group; wrapTrafficMesh() puts it inside
// an outer one that carries the physics offset, and hands a named list of
// userData keys up. Anything the builder sets that is NOT on that list is
// still there - two levels down, on an object nothing downstream ever looks
// at - so the code that reads it gets `undefined`, does nothing, and says
// nothing about it.
//
// That is precisely what happened to the driver's cab. Six keys were set on
// the inner group and none was carried, so the signal repeater stayed black,
// the speed display sat at full scale whatever the train was doing, and the
// master controller never moved. Everything built, nothing threw, and there
// was no way to tell from the code that reads it.
//
// So: whatever buildMonorailCab() hands out, wrapTrafficMesh() has to carry,
// and updateMonorailCab() has to read from the same place.
{
  const world = readFileSync(new URL('../src/world/World.js', import.meta.url), 'utf8')
  const vehicle = readFileSync(new URL('../src/world/Vehicle.js', import.meta.url), 'utf8')

  const cab = world.slice(world.indexOf('buildMonorailCab(v) {'))
    .slice(0, world.slice(world.indexOf('buildMonorailCab(v) {')).indexOf('\n  buildTowTruck'))
  chk('the cab builder was found', cab.length > 2000, `${cab.length} chars`)

  const handedOut = [...cab.matchAll(/group\.userData\.(\w+)\s*=/g)].map(m => m[1])
  console.log(`   the cab hands out: ${handedOut.join(', ')}`)

  const carried = new Set(
    [...vehicle.matchAll(/outer\.userData\.(\w+)\s*=/g)].map(m => m[1]))
  // `body` is the paint, which setKind() reaches through its own path.
  const missing = handedOut.filter(k => k !== 'body' && !carried.has(k))
  chk('every key it hands out is carried up by wrapTrafficMesh',
      missing.length === 0, 'not carried: ' + missing.join(', '))

  // And it is ONE key, not a growing list - which is the only version of this
  // that stays true as instruments are added.
  chk('and it is one bundle rather than a key per instrument',
      handedOut.filter(k => k !== 'body').length === 1,
      handedOut.join(', '))

  const update = world.slice(world.indexOf('updateMonorailCab(train) {'))
    .slice(0, 3000)
  chk('the update reads the mesh through that same bundle',
      /mesh\.userData\.cab\b/.test(update))
  chk('and not through the bare userData it used to',
      !/const cab = mesh && mesh\.userData$/m.test(update))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
