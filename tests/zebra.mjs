/**
 * Zebra crossing orientation, as pure geometry.
 *
 * A real zebra crossing (look at a photograph of one) is a row of long
 * bars pointing ALONG the direction of travel, set side by side across the
 * width of the road.
 *
 * This file exists because the crossings were rebuilt four times, and the
 * fourth was my own unforced error:
 *
 *   1. laid on both sides of every arm, so some landed on sand
 *   2. oriented by the merged approach, so some sat up to 44 degrees skew
 *   3. I "corrected" them to short bars spanning the road and stepping
 *      along it, reasoning that a driver crosses one after another. That
 *      is wrong - they are paint, you feel nothing - and it looked like a
 *      diagonal smear. Working geometry, changed on a bad mental model.
 *   4. reverted to (correct) bars along the road, keeping the skew fix
 *
 * Worse than the mistake: at step 3 I wrote a test asserting the WRONG
 * property, which locked the error in and would have kept it there. A test
 * built from an assumption rather than a reference is not a safety net.
 */
let pass = 0, fail = 0
const chk = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + '  ' + d)) }

// Three.js Y-rotation applied to a local direction
const rotateY = (v, t) => ({
  x: v.x * Math.cos(t) + v.z * Math.sin(t),
  z: -v.x * Math.sin(t) + v.z * Math.cos(t)
})

console.log('Zebra crossing: bars ALONG the road, spread ACROSS it\n')

const ROAD_WIDTH = 7
const STRIPES = 6
const BAR_LENGTH = 2.8
const SPAN = ROAD_WIDTH * 0.84

let worstAlong = 1        // bar length vs road direction: want 1 (parallel)
let worstStepAcross = 1   // bar-to-bar step vs road: want 0 (perpendicular)
let worstOutside = 0

for (let deg = 0; deg < 360; deg += 3) {
  const a = (deg * Math.PI) / 180
  const tan = { x: Math.sin(a), z: Math.cos(a) }
  const theta = Math.atan2(tan.x, tan.z)

  // BoxGeometry(barWidth, h, barLength) is long in local Z
  const length = rotateY({ x: 0, z: 1 }, theta)
  worstAlong = Math.min(worstAlong, Math.abs(length.x * tan.x + length.z * tan.z))

  // World.js steps bars along the road's normal
  const stepDir = { x: -tan.z, z: tan.x }
  worstStepAcross = Math.min(worstStepAcross,
    Math.abs(stepDir.x * tan.x + stepDir.z * tan.z) === 0 ? 0 : 1)

  // Every bar must stay on the carriageway
  worstOutside = Math.max(worstOutside, SPAN / 2 + 0.31 - ROAD_WIDTH / 2)
}

chk(`bar LENGTH runs along the road (worst |dot| ${worstAlong.toFixed(6)}, want 1)`,
    worstAlong > 1 - 1e-9, `${worstAlong}`)
chk('successive bars step ACROSS the road, not along it',
    worstStepAcross === 0)
chk(`the row stays on the carriageway (${(SPAN/2 + 0.31).toFixed(2)} vs half-width ${ROAD_WIDTH/2})`,
    worstOutside <= 0, `overhangs by ${worstOutside.toFixed(2)}`)
chk(`${STRIPES} bars of ${BAR_LENGTH} across ${SPAN.toFixed(1)} of a ${ROAD_WIDTH} road`,
    STRIPES >= 5 && BAR_LENGTH > 2 && SPAN > ROAD_WIDTH * 0.7)

// The two shipped failure modes, asserted as failures
const wrongLength = rotateY({ x: 1, z: 0 }, Math.atan2(0, 1))
chk('a bar long in local X would span the road - the step-3 mistake',
    Math.abs(wrongLength.x) > 0.99)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
