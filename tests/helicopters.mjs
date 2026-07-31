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
  DEFAULT_PLOT_DEPTH
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

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
