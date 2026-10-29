/**
 * Helipads and the machines that use them.
 *
 * A helicopter needs almost nothing an aircraft needs - no runway, no
 * taxiway - so nearly the whole problem is CLEARANCE, and there is exactly
 * one thing in this world that takes it away: the monorail beam, which runs
 * 9.5 to 11 units up straight over the towns. A pad under it looks perfectly
 * fine and can never be left.
 *
 * The check that found the first real bug here is section 2. The pad was
 * sized off the helicopter instead of off the ROOF it has to sit on, so
 * every rooftop in the world failed by one unit and the world had no rooftop
 * pads at all - while `getHelipads()` returned a healthy-looking six.
 * "Are there pads" is not the question. "Are there pads of each kind" is.
 */
import {
  ISLANDS,
  getHelipads,
  makeHelicopters,
  stepHelicopters,
  helicopterPosition,
  getMonorailRoute,
  monorailCeiling,
  groundHeight,
  islandAt,
  HELIPAD_SIZE,
  HELIPAD_HEADROOM,
  HELI_CRUISE_HEIGHT,
  HELI_ROTOR,
  DEFAULT_PLOT_DEPTH,
  fitRoofPads,
  isCourseIsland,
  getIsland
} from '../src/world/islandLayout.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const pads = getHelipads()
const route = getMonorailRoute()

console.log('1. There are pads')
console.log(`   ${pads.length} pads`)
chk('pads exist', pads.length > 0)
chk('and enough of them to fly between', pads.length >= 2, `${pads.length}`)

console.log('\n2. Of both kinds')
// The one that caught the sizing bug. Rooftop pads are the half Mike asked
// for first, and a world with only ground pads passes every other check here.
const roofs = pads.filter(p => p.kind === 'roof')
const grounds = pads.filter(p => p.kind === 'ground')
console.log(`   ${roofs.length} on rooftops, ${grounds.length} on the ground`)
chk('there are rooftop pads', roofs.length > 0, `${roofs.length}`)
chk('and ground pads', grounds.length > 0, `${grounds.length}`)
chk('the pad fits an ordinary roof', HELIPAD_SIZE + 1 <= DEFAULT_PLOT_DEPTH,
    `${HELIPAD_SIZE} vs ${DEFAULT_PLOT_DEPTH}`)

console.log('\n3. Every pad has open air above it')
// The whole point. Measured against monorailCeiling, which states how tall
// anything may be at a point - and a pad has to clear it by a rotor's width,
// not merely fit under it. A machine that can sit on a pad and never leave is
// worse than no pad, because it looks like it works.
let worstHeadroom = Infinity
let worstPad = null
for (const pad of pads) {
  const ceiling = monorailCeiling(route, pad.x, pad.z)
  if (ceiling === Infinity) continue
  const headroom = ceiling - (pad.y - groundHeight(pad.x, pad.z))
  if (headroom < worstHeadroom) { worstHeadroom = headroom; worstPad = pad }
}
if (worstPad) {
  console.log(`   tightest is a ${worstPad.kind} pad on ${worstPad.island}, ` +
              `${worstHeadroom.toFixed(1)}u of air above it`)
} else {
  console.log('   no pad is anywhere near the monorail')
}
chk(`every pad clears the beam by a rotor (${HELIPAD_HEADROOM}u)`,
    worstHeadroom >= HELIPAD_HEADROOM,
    `${worstHeadroom === Infinity ? 'n/a' : worstHeadroom.toFixed(1)}`)

// And the rule has to BITE, or the check above passes for the wrong reason.
//
// On this map no pad lands anywhere near the beam, so "every pad clears it"
// is true and proves nothing - it would read exactly the same if the rule had
// been deleted. So: find the ground directly under the line and confirm a pad
// there would be refused, and that no pad is there.
let underBeam = null
for (const p of (route.points || route)) {
  const ceiling = monorailCeiling(route, p.x, p.z)
  if (ceiling !== Infinity && ceiling < HELIPAD_HEADROOM) { underBeam = p; break }
}
console.log(underBeam
  ? `   under the beam the ceiling is ${monorailCeiling(route, underBeam.x, underBeam.z).toFixed(1)}u` +
    `, less than the ${HELIPAD_HEADROOM}u a pad needs`
  : '   nowhere under the beam is tight enough to test the rule')
chk('a pad under the monorail would be refused', !!underBeam)

let padsUnderBeam = 0
for (const pad of pads) {
  const ceiling = monorailCeiling(route, pad.x, pad.z)
  if (ceiling !== Infinity && ceiling < HELIPAD_HEADROOM) padsUnderBeam++
}
chk('and none was placed there anyway', padsUnderBeam === 0, `${padsUnderBeam}`)

console.log('\n4. And every pad is somewhere real')
// On land, or on a roof that is on land. A pad in the sea would fly perfectly
// well and be nonsense.
let onLand = 0
for (const pad of pads) {
  if (islandAt(pad.x, pad.z)) onLand++
}
chk('no pad is out at sea', onLand === pads.length, `${onLand} of ${pads.length}`)

// A rooftop pad sits at its building's roof, so it must be ABOVE the ground.
let raised = 0
for (const pad of roofs) {
  if (pad.y > groundHeight(pad.x, pad.z) + 5) raised++
}
chk('rooftop pads are actually on rooftops', raised === roofs.length,
    `${raised} of ${roofs.length}`)

console.log('\n5. Ten minutes of flying')
// Counting comings and goings, not merely movement - the lesson from the
// trains that stopped 89 times without ever leaving their first station.
const machines = makeHelicopters(pads)
console.log(`   fleet of ${machines.length}`)
chk('the fleet gets built', machines.length > 0)

const phases = new Set()
const visited = new Set()
let sharedPad = 0
let highest = 0
let lowest = Infinity
const step = 1 / 30

for (let t = 0; t < 600; t += step) {
  stepHelicopters(pads, machines, step, t)

  const parked = machines.filter(m => m.phase === 'parked').map(m => m.pad)
  if (new Set(parked).size !== parked.length) sharedPad++

  for (const machine of machines) {
    phases.add(machine.phase)
    if (machine.phase === 'parked') visited.add(machine.pad)
    const where = helicopterPosition(pads, machine, step)
    highest = Math.max(highest, where.y)
    lowest = Math.min(lowest, where.y)
  }
}

console.log(`   phases: ${[...phases].sort().join(', ')}`)
chk('they take off, fly and land',
    ['parked', 'climb', 'cruise', 'descend'].every(p => phases.has(p)),
    [...phases].join(','))

const landings = machines.reduce((n, m) => n + (m.landings || 0), 0)
console.log(`   ${landings} landings, ${visited.size} of ${pads.length} pads used`)
chk('they actually go somewhere and come back', landings >= machines.length * 2,
    `${landings}`)
chk('and they use the pads across the world, not one corner',
    visited.size >= Math.min(pads.length, 4), `${visited.size}`)

console.log('\n6. Two are never on the same pad')
// Reserved at DEPARTURE, not on arrival - the ships' lesson. Getting it wrong
// at start-up rather than mid-voyage was the actual bug there.
chk(`no pad was ever double-booked (${sharedPad} frames)`, sharedPad === 0,
    `${sharedPad}`)

console.log('\n7. They fly at a sensible height')
console.log(`   between ${lowest.toFixed(1)}u and ${highest.toFixed(1)}u`)
chk('they climb clear of the rooftops', highest > HELI_CRUISE_HEIGHT,
    `${highest.toFixed(1)}`)
chk('and they come all the way back down', lowest < HELI_ROTOR,
    `${lowest.toFixed(1)}`)
// Above every rooftop pad, or one would fly through a building it just left.
const tallestPad = Math.max(...pads.map(p => p.y))
chk('the cruise is above every pad in the world',
    HELI_CRUISE_HEIGHT > tallestPad, `${HELI_CRUISE_HEIGHT} vs ${tallestPad.toFixed(1)}`)

console.log('\n8. A rooftop pad stands on the building that was actually built')
// Mike, having flown over the towns: "the ceilings of buildings and helipads
// seem to be acting weird. Some are floating in the air."
//
// They were, and every one of them was. getHelipads() puts a rooftop pad at
// `ground + HELIPAD_FLOORS * FLOOR_HEIGHT` = 12.5, and NOTHING makes the
// building underneath it 12.5 tall: the towns are .glb models scaled to the
// plot's width, so the height that comes out is whatever that model's
// proportions give. Measured in the browser afterwards, the real roofs are
// 8.55 and 15.75 - so half the pads floated four units clear of the building
// and the other half were buried three inside it.
//
// The rule now is that the layout PROPOSES a site and fitRoofPads() settles
// the height against World's own record of what it built. These check the
// settling against building lists made up here, which is the whole reason
// that function takes them as an argument rather than reaching for them.
chk('a proposed rooftop pad says so', roofs.every(p => p.provisional === true))
chk('and a ground pad does not', grounds.every(p => !p.provisional))

const tall = roofs.map(p => ({
  x: p.x, z: p.z, width: 9, depth: 8, height: 15.75, rotation: 0.4
}))
const fitted = fitRoofPads(pads, tall)
const fittedRoofs = fitted.filter(p => p.kind === 'roof')
console.log(`   ${fittedRoofs.length} of ${roofs.length} rooftop pads survive a 15.75-unit town`)
chk('every pad settles onto a roof that is there', fittedRoofs.length === roofs.length,
    `${fittedRoofs.length}`)
chk('and none is still provisional', fittedRoofs.every(p => !p.provisional))
chk('the pad is AT the roof, not at a floor count',
    fittedRoofs.every(p => Math.abs(p.y - (groundHeight(p.x, p.z) + 15.75)) < 1e-6),
    fittedRoofs.map(p => p.y.toFixed(2)).join(' '))
chk('which is nowhere near where it used to be put',
    fittedRoofs.every(p => Math.abs(p.y - (groundHeight(p.x, p.z) + 12.5)) > 3))
chk('it squares up to the building rather than to the plot',
    fittedRoofs.every(p => Math.abs(p.heading - 0.4) < 1e-9))
chk('and the ground pads come through untouched',
    fitted.filter(p => p.kind === 'ground').length === grounds.length)

// The four ways a proposed pad does not survive.
chk('nothing built there: the pad is dropped, not left hanging',
    fitRoofPads(pads, []).every(p => p.kind === 'ground'))
chk('a bungalow gets no pad',
    fitRoofPads(pads, tall.map(b => ({ ...b, height: 4 })))
      .every(p => p.kind === 'ground'))
chk('nor does a roof too small to stand on',
    fitRoofPads(pads, tall.map(b => ({ ...b, width: 4, depth: 4 })))
      .every(p => p.kind === 'ground'))
// The headroom re-check, which needs a site UNDER the beam to have anything
// to say - and getHelipads() never proposes one, because it rejects those
// itself. So the pad is made up here. It is worth keeping even though nothing
// today can trip it: the check exists because the height it is re-asking about
// is now measured rather than assumed, and a measured height can come out
// TALLER than the one that was planned for.
{
  const beamX = -145.2
  const beamZ = -238.1
  const ceiling = monorailCeiling(route, beamX, beamZ)
  console.log(`   under the beam at (${beamX}, ${beamZ}) the ceiling is ${ceiling.toFixed(2)}`)
  const site = [{
    kind: 'roof', island: 'blog', x: beamX, z: beamZ, y: 0,
    heading: 0, floors: 5, provisional: true
  }]
  const under = (height) => [{
    x: beamX, z: beamZ, width: 9, depth: 8, height, rotation: 0
  }]
  chk('a pad under the beam needs a rotor of clearance above the roof',
      ceiling < HELIPAD_HEADROOM &&
      fitRoofPads(site, under(3)).length === 0,
      `ceiling ${ceiling.toFixed(2)} vs headroom ${HELIPAD_HEADROOM}`)
  chk('and a taller building there is turned down too',
      fitRoofPads(site, under(400)).length === 0)
}
// A building a metre and a half off is still this pad's building; one on the
// next plot along is somebody else's.
chk('a pad finds its building through a small offset',
    fitRoofPads(pads, tall.map(b => ({ ...b, x: b.x + 1.5 })))
      .some(p => p.kind === 'roof'))
chk('but not one on the next plot along',
    fitRoofPads(pads, tall.map(b => ({ ...b, x: b.x + 14 })))
      .every(p => p.kind === 'ground'))

console.log('\n9. No pad is parked in the middle of a course')
// The other half of the same complaint: "some are in the middle of a stadium."
//
// One was. Every test in findGroundPad() is about ROADS, and the stunt park
// has none - so distanceToNearestRoad returned Infinity, the very first
// candidate offered was accepted with nothing actually checked, and the pad
// came out at island-local (0, 37.8): between the double's take-off at z 21.7
// and its landing at z 44.7, square across the run-in of the biggest jump on
// the island.
const courseIslands = ISLANDS.filter(isCourseIsland)
console.log(`   ${courseIslands.length} course islands: ` +
  courseIslands.map(i => i.id).join(', '))
chk('the two motorsport islands are the course islands',
    courseIslands.length === 2 &&
    courseIslands.every(i => i.id === 'stunt' || i.id === 'speedway'),
    courseIslands.map(i => i.id).join(','))
chk('and a town island is not one', !isCourseIsland(getIsland('about')))
for (const island of courseIslands) {
  chk(`no pad anywhere on ${island.id}`,
      !pads.some(p => p.island === island.id),
      pads.filter(p => p.island === island.id).map(p => p.kind).join(','))
}
// And the world still has pads everywhere else, so this took nothing away
// that was being used.
chk('there are still pads on every island that is not a course',
    ISLANDS.filter(i => !isCourseIsland(i))
      .every(i => pads.some(p => p.island === i.id)),
    ISLANDS.filter(i => !isCourseIsland(i) && !pads.some(p => p.island === i.id))
      .map(i => i.id).join(','))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
