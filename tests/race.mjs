/**
 * The race, and the geometry the stunt park is built from.
 *
 * Both are pure modules with no THREE in them, which is the point of them
 * being pure modules: a ramp is arithmetic and a race is a state machine, and
 * neither needs a browser to be wrong in front of you.
 *
 * What is NOT here, and could not be: whether the monster truck can actually
 * clear the big jump. That is the physics engine's answer, not arithmetic's,
 * and it was measured in the running game - the numbers are written down on
 * STUNT_BIG_JUMP.landing. What this file guards is that the LAYOUT still
 * matches those measurements, so that moving a ramp without re-measuring is a
 * failing test rather than a quiet regression.
 */
import {
  wedgeSolid, humpWedges, flightRange, pointAlongRing,
  COURSE_GROUND, RAMP_BURY, STUNT_COURSE, STUNT_BIG_JUMP,
  RACE_LAPS, RACE_FIELD, RACE_LIGHTS, RACE_COUNTDOWN, RACE_LINE_AT, lightAt
} from '../src/world/course.js'
import {
  newRaceState, stepRace, raceHud, loopDelta, lapsFrom, makeField,
  standings, carSpeed, gridOffset, gridSide,
  FORM_UP_TIME, GRID_PATIENCE, GRID_TOLERANCE, COOLDOWN, FIELD_PACE, RACE_PACE
} from '../src/world/raceGame.js'
import { getIsland, getIslandRing, islandOutline } from '../src/world/islandLayout.js'
import { chooseMission } from '../src/world/missions.js'
import {
  tuningFor, airborneVelocity, isGrounded, groundedWithCoyote, airYaw,
  COYOTE_TIME, GROUND_REACH, AIR_YAW
} from '../src/world/driving.js'
import { distanceToEdge } from '../src/world/shapes.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

// ---------------------------------------------------------------------------
console.log('1. A ramp is a closed solid\n')

const ramp = wedgeSolid({ x: 0, z: 0, heading: 0, length: 10, width: 6, height: 3 })

chk('it has triangles', ramp.positions.length > 0 && ramp.positions.length % 9 === 0,
    `${ramp.positions.length} floats`)
chk('every vertex has an index', ramp.indices.length === ramp.positions.length / 3)
chk('the indices are the plain sequence a trimesh wants',
    ramp.indices.every((v, i) => v === i))

// Twelve triangles: two for the drivable face, four for the sides, two for the
// cliff under the lip, two for the back, two for the floor. A shell with any
// of those missing is something a fast vehicle can pass through - see the
// note on wedgeSolid().
chk('it is closed - twelve triangles, no open faces',
    ramp.indices.length === 36, `${ramp.indices.length / 3} triangles`)

const ys = []
for (let i = 1; i < ramp.positions.length; i += 3) ys.push(ramp.positions[i])
chk('its floor is buried under the ground',
    near(Math.min(...ys), COURSE_GROUND - RAMP_BURY),
    `${Math.min(...ys)}`)
chk('its lip is exactly the height asked for',
    near(Math.max(...ys), COURSE_GROUND + 3), `${Math.max(...ys)}`)
chk('and the lip is reported where the geometry puts it',
    near(ramp.lip.z, 10) && near(ramp.lip.x, 0) && near(ramp.lip.y, COURSE_GROUND + 3),
    JSON.stringify(ramp.lip))
chk('the angle is the one the height and length imply',
    near(ramp.angle, Math.atan2(3, 10)), `${ramp.angle}`)

// Heading is atan2(x, z) like every other bearing in the project: 0 is +Z.
const east = wedgeSolid({ x: 0, z: 0, heading: Math.PI / 2, length: 10, width: 6, height: 3 })
chk('heading pi/2 points the ramp at +x',
    near(east.lip.x, 10, 1e-9) && near(east.lip.z, 0, 1e-9),
    JSON.stringify(east.lip))

const south = wedgeSolid({ x: 0, z: 0, heading: Math.PI, length: 10, width: 6, height: 3 })
chk('and heading pi points it at -z',
    near(south.lip.z, -10, 1e-9), JSON.stringify(south.lip))

// ---------------------------------------------------------------------------
console.log('\n2. A hump is two ramps that meet at a crest\n')

const hump = humpWedges({ x: 0, z: 0, heading: 0, up: 8, down: 12, width: 10, height: 2 })
chk('a hump is two wedges', hump.length === 2)

const upSolid = wedgeSolid(hump[0])
const downSolid = wedgeSolid(hump[1])
chk('their lips meet at the same point - no step to catch a wheel on',
    near(upSolid.lip.x, downSolid.lip.x, 1e-9) &&
    near(upSolid.lip.z, downSolid.lip.z, 1e-9) &&
    near(upSolid.lip.y, downSolid.lip.y, 1e-9),
    `${JSON.stringify(upSolid.lip)} vs ${JSON.stringify(downSolid.lip)}`)
chk('the crest is `up` units along from the start', near(upSolid.lip.z, 8, 1e-9))
chk('and the far side runs back the other way, from the far end',
    near(hump[1].heading, Math.PI) && near(hump[1].z, 20, 1e-9),
    JSON.stringify(hump[1]))

// ---------------------------------------------------------------------------
console.log('\n3. The ballistics agree with what was measured in the game\n')

// Measured on the real kicker, in the running browser: the saloon left the lip
// at 17.96 and covered 23.9 units before it touched anything. See
// STUNT_BIG_JUMP.landing for the full table.
const kicker = STUNT_BIG_JUMP.takeOff
const angle = Math.atan2(kicker.height, kicker.length)
const sedan = flightRange(17.96, angle, kicker.height)

chk('a ramp that shallow is one a slow vehicle can climb',
    angle < 0.28, `${(angle * 180 / Math.PI).toFixed(1)} degrees`)
chk('the predicted saloon flight is within a few units of the measured 23.9',
    Math.abs(sedan.distance - 23.9) < 6, `predicted ${sedan.distance.toFixed(1)}`)
chk('a faster vehicle always flies further - which is why size cannot be the gate',
    flightRange(27.9, angle, kicker.height).distance >
    flightRange(14, angle, kicker.height).distance)

chk('flightRange copes with a lip at ground level',
    flightRange(14, angle, 0).distance > 0)
chk('and with no speed at all',
    flightRange(0, angle, 3).distance === 0)

// ---------------------------------------------------------------------------
console.log('\n4. The big jump lands where the measurements say it should\n')

const landing = STUNT_BIG_JUMP.landing
const westEdge = landing.x - landing.width / 2
const eastEdge = landing.x + landing.width / 2
const nearEdge = landing.z
const farEdge = landing.z - landing.up - landing.down

// Every one of these is a measured landing point from the running game. If a
// ramp moves in course.js and these stop holding, the jump has quietly stopped
// being a monster-truck jump and this is the failure that says so.
const measured = [
  { who: 'monster', x: -2.2, z: -46.9, shouldLand: true },
  { who: 'monster + boost', x: -4.8, z: -47.5, shouldLand: true },
  { who: 'monster, no steer', x: 5.4, z: -57.4, shouldLand: false },
  { who: 'saloon', x: 5.0, z: -61.0, shouldLand: false },
  { who: 'saloon + boost', x: 4.8, z: -89.0, shouldLand: false },
  { who: 'racing car', x: -13.3, z: -78.8, shouldLand: false }
]

for (const m of measured) {
  const on = m.x >= westEdge && m.x <= eastEdge && m.z <= nearEdge && m.z >= farEdge
  chk(`${m.who.padEnd(18)} ${m.shouldLand ? 'lands on' : 'misses'} the landing`,
      on === m.shouldLand,
      `at (${m.x}, ${m.z}); landing x ${westEdge}..${eastEdge}, z ${farEdge}..${nearEdge}`)
}

// And with margin, because a measurement that only just holds is a measurement
// that will not hold once a child is driving instead of an autopilot.
const margin = Math.min(
  ...measured.filter(m => !m.shouldLand).map(m => Math.max(
    westEdge - m.x, m.x - eastEdge, m.z - nearEdge, farEdge - m.z)))
chk('and the nearest miss misses by a clear margin', margin > 3,
    `${margin.toFixed(1)} units`)

// The other half: the truck has to land comfortably ON it, not clip the edge.
// It is 2.5 wide, so a centre a unit inside the edge is half a truck hanging
// off - which is a landing but does not look like one.
const landedInside = Math.min(
  ...measured.filter(m => m.shouldLand).map(m => Math.min(
    m.x - westEdge, eastEdge - m.x, nearEdge - m.z, m.z - farEdge)))
chk('and the truck lands well inside it, not on the lip',
    landedInside > 2.5, `${landedInside.toFixed(1)} units from the nearest edge`)

// ---------------------------------------------------------------------------
console.log('\n5. The course fits on the island it is built on\n')

const stunt = getIsland('stunt')
chk('the stunt island exists', !!stunt)

if (stunt) {
  const outline = islandOutline(stunt)
  const ring = getIslandRing(stunt)
  const inside = (x, z) => distanceToEdge(outline, x, z)

  const pieces = [
    ['kicker base', kicker.x, kicker.z],
    ['kicker lip', kicker.x, kicker.z - kicker.length],
    ['landing near', landing.x, landing.z],
    ['landing far', landing.x, landing.z - landing.up - landing.down],
    ['landing west', westEdge, landing.z - landing.up],
    ['landing east', eastEdge, landing.z - landing.up],
    ['first roller', 0, STUNT_COURSE.rollers.from],
    ['last roller', 0, STUNT_COURSE.rollers.from +
      (STUNT_COURSE.rollers.count - 1) * STUNT_COURSE.rollers.spacing],
    ['tabletop start', 0, STUNT_COURSE.tabletop.z],
    ['tabletop end', 0, STUNT_COURSE.tabletop.z + STUNT_COURSE.tabletop.up +
      STUNT_COURSE.tabletop.top + STUNT_COURSE.tabletop.down],
    ['scrap', STUNT_COURSE.scrap.x, STUNT_COURSE.scrap.z]
  ]

  for (const [name, x, z] of pieces) {
    chk(`${name.padEnd(16)} is on dry land`, inside(x, z) > 6,
        `${inside(x, z).toFixed(1)} from the water`)
  }

  // Nothing on the course may sit on the ring road, which is the way in and
  // the way out and the only road on the island.
  if (ring) {
    const toRing = (x, z) => {
      let best = Infinity
      for (let i = 1; i < ring.length; i++) {
        const ax = ring[i - 1].x, az = ring[i - 1].z
        const dx = ring[i].x - ax, dz = ring[i].z - az
        const l2 = dx * dx + dz * dz
        const t = l2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)) : 0
        best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)))
      }
      return best
    }
    for (const [name, x, z] of pieces) {
      chk(`${name.padEnd(16)} is clear of the ring road`, toRing(x, z) > 4.5,
          `${toRing(x, z).toFixed(1)}`)
    }
  }
}

// ---------------------------------------------------------------------------
console.log('\n6. Going round a loop\n')

chk('a small step forward is a small positive delta', near(loopDelta(10, 20, 100), 10))
chk('a small step back is a small negative one', near(loopDelta(20, 10, 100), -10))
chk('crossing the line forwards wraps to a small positive',
    near(loopDelta(95, 5, 100), 10))
chk('and backing over it wraps to a small negative',
    near(loopDelta(5, 95, 100), -10))
chk('a zero-length loop cannot move', loopDelta(0, 50, 0) === 0)

chk('no progress is no laps', lapsFrom(0, 100) === 0)
chk('almost a lap is no laps', lapsFrom(99.9, 100) === 0)
chk('a lap is a lap', lapsFrom(100, 100) === 1)
chk('going backwards past the start is still no laps', lapsFrom(-250, 100) === 0)

// The whole reason the delta is signed and shortest: a car that noses over the
// line and reverses must not bank a lap for the wobble. Driven the way the
// game drives it, in small per-frame steps.
let progress = 0
let at = 0
const drive = (distance, step = 2) => {
  const sign = Math.sign(distance)
  for (let d = 0; d < Math.abs(distance); d += step) {
    const move = sign * Math.min(step, Math.abs(distance) - d)
    const to = ((at + move) % 100 + 100) % 100
    progress += loopDelta(at, to, 100)
    at = to
  }
}
drive(98)
for (let i = 0; i < 3; i++) { drive(4); drive(-4) }
drive(4)
chk('wobbling over the line banks exactly one lap, not seven',
    lapsFrom(progress, 100) === 1, `progress ${progress.toFixed(1)}`)

// The one thing `loopDelta` cannot do, written down so nobody discovers it the
// hard way: it takes the SHORTEST way round, so a single step of more than
// half a lap is indistinguishable from a small step backwards. That is fine
// here and it is worth checking that it stays fine - at sixty frames a second
// the racing car covers well under a hundredth of this circuit per frame.
chk('a step of more than half a loop reads as a step back - a known limit',
    loopDelta(0, 98, 100) === -2)
const FASTEST = 36.8            // the racing car, flat out with boost
const LAP_FOR_LIMIT = 380       // the speedway, measured in section 11
chk('and one frame at full speed is nowhere near half a lap',
    FASTEST / 60 < LAP_FOR_LIMIT / 2 / 20,
    `${(FASTEST / 60).toFixed(2)} units a frame against a ${LAP_FOR_LIMIT}-unit lap`)

// ---------------------------------------------------------------------------
console.log('\n7. The grid\n')

chk(`there are ${RACE_FIELD} cars in the field`, makeField(400).length === RACE_FIELD)
chk('the player has pole - slot 0 - and the field starts at slot 1',
    makeField(400).every((c) => c.slot >= 1))
chk('the grid alternates sides', gridSide(0) === -1 && gridSide(1) === 1 &&
    gridSide(2) === -1)
chk('and every slot is further back than the one in front',
    [0, 1, 2, 3, 4, 5].every((s, i, a) => i === 0 || gridOffset(s) > gridOffset(a[i - 1])))

const grid = makeField(400)
chk('every car starts behind the line', grid.every((c) => c.progress < 0))
chk('every car has a name', grid.every((c) => !!c.name))
chk('no two cars share a grid slot',
    new Set(grid.map((c) => c.slot)).size === grid.length)
chk('the field is spread over a range of pace',
    Math.max(...FIELD_PACE) - Math.min(...FIELD_PACE) > 0.1)
chk('and none of them is faster than the car you are driving',
    FIELD_PACE.every((p) => p < 1))

// The pace wander is what stops it being a procession.
const car = grid[0]
const speeds = []
for (let t = 0; t < 40; t += 0.5) speeds.push(carSpeed(car, t, RACE_PACE))
chk('a car breathes in and out rather than holding one speed',
    Math.max(...speeds) - Math.min(...speeds) > 1,
    `${(Math.max(...speeds) - Math.min(...speeds)).toFixed(2)}`)
chk('but never stops and never runs away',
    speeds.every((s) => s > 12 && s < RACE_PACE * 1.1),
    `${Math.min(...speeds).toFixed(1)} .. ${Math.max(...speeds).toFixed(1)}`)

// The whole point of RACE_PACE: it is a LAP pace, not a top speed. An
// autopilot holding the racing line for ten laps averaged just under 20.
chk('the field is set against a lap pace, not the car top speed of 27.9',
    RACE_PACE < 24, `${RACE_PACE}`)
chk('and the quickest of them is beatable by a driven car',
    RACE_PACE * Math.max(...FIELD_PACE) < 20.5,
    `${(RACE_PACE * Math.max(...FIELD_PACE)).toFixed(1)} against a driven ~20`)

// ---------------------------------------------------------------------------
console.log('\n8. The lights\n')

chk('the sequence is red, amber, green',
    RACE_LIGHTS.map((l) => l.colour).join(',') === 'red,amber,green')
chk('nothing shows before it starts', lightAt(-1) === null)
chk('red first', lightAt(0) === 'red')
chk('amber in the middle', lightAt(RACE_LIGHTS[0].hold + 0.1) === 'amber')
chk('green at the end', lightAt(RACE_COUNTDOWN + 1) === 'green')
chk('the whole thing is long enough for a six-year-old to read',
    RACE_COUNTDOWN >= 4, `${RACE_COUNTDOWN}s`)

// ---------------------------------------------------------------------------
console.log('\n9. A whole race, start to finish\n')

const LAP = 380
const ctx = (over) => ({
  onCourse: true, kind: 'race', along: 0, lapLength: LAP,
  pace: RACE_PACE, toGrid: 0, elapsed: 0, ...over
})

let state = newRaceState()
chk('a fresh race is idle', state.phase === 'idle')
chk('and shows nothing', raceHud(state).active === false)

// Driving something else onto the circuit does nothing at all. This is the
// brief: the race starts when the RACING CAR arrives.
stepRace(state, 0.1, ctx({ kind: 'monster' }))
chk('a monster truck on the circuit starts nothing', state.phase === 'idle')
stepRace(state, 0.1, ctx({ kind: 'sedan' }))
chk('nor does a saloon', state.phase === 'idle')

// Nor does the racing car anywhere else.
stepRace(state, 0.1, ctx({ onCourse: false }))
chk('and the racing car off the circuit starts nothing', state.phase === 'idle')

stepRace(state, 0.1, ctx())
chk('but the racing car ON the circuit calls the field out', state.phase === 'gridding')
chk('five of them', state.cars.length === RACE_FIELD)
chk('and says so', raceHud(state).active === true && raceHud(state).mine === true)

// The lights wait while the field forms up.
let t = 0
while (state.phase === 'gridding' && t < FORM_UP_TIME - 0.5) {
  stepRace(state, 0.1, ctx()); t += 0.1
}
chk('the lights do not start until the field is out',
    state.phase === 'gridding', `${state.phase} after ${t.toFixed(1)}s`)

while (state.phase === 'gridding' && t < GRID_PATIENCE + 2) {
  stepRace(state, 0.1, ctx()); t += 0.1
}
chk('and then they do', state.phase === 'lights')

// A player who parks nowhere near the grid still gets a race.
let lazy = newRaceState()
stepRace(lazy, 0.1, ctx())
let lt = 0
while (lazy.phase === 'gridding' && lt < GRID_PATIENCE + 3) {
  stepRace(lazy, 0.1, ctx({ toGrid: GRID_TOLERANCE * 10 })); lt += 0.1
}
chk('parking miles from the grid still gets you a race, eventually',
    lazy.phase === 'lights', `${lazy.phase}`)
chk('and it waited a sensible while first', lt > FORM_UP_TIME, `${lt.toFixed(1)}s`)

// Through the lights.
const seen = new Set()
while (state.phase === 'lights') {
  stepRace(state, 0.1, ctx())
  if (state.light) seen.add(state.light)
}
chk('red, amber and green all showed', seen.has('red') && seen.has('amber') && seen.has('green'),
    [...seen].join(','))
chk('and then the race is on', state.phase === 'racing')
chk('nobody moved before green', state.cars.every((c) => c.progress < 0))

// Drive it. The player laps at a steady pace a bit quicker than the leader.
let along = 0
let laps = 0
let guard = 0
const PLAYER_STEP = 22 * 0.1   // quicker than RED's RACE_PACE * 0.97
while (state.phase === 'racing' && guard++ < 60000) {
  along = (along + PLAYER_STEP) % LAP
  stepRace(state, 0.1, ctx({ along, elapsed: guard * 0.1 }))
}
chk('somebody won', state.phase === 'finished', `${state.phase} after ${guard} steps`)
chk('and it was the player, who was quicker than all of them',
    state.winner === 'YOU', `${state.winner}`)
chk('after exactly ten laps', state.player.lap === RACE_LAPS, `${state.player.lap}`)
chk('the result is on the HUD', raceHud(state).title === 'YOU WIN')

// The shape chooseMission() needs. Getting this wrong is silent: a callout
// with no `active` field is filtered out and the HUD simply stays empty,
// which is exactly what the first version of raceHud did for ten whole laps.
const shape = raceHud(state)
for (const field of ['active', 'mine', 'title', 'target', 'showBar', 'barLabel',
                     'progress', 'good']) {
  chk(`the HUD hands over \`${field}\``, field in shape, JSON.stringify(shape))
}
chk('and chooseMission accepts it',
    chooseMission([shape]) === shape, JSON.stringify(chooseMission([shape])))
let barRace = newRaceState()
stepRace(barRace, 0.1, ctx())
while (barRace.phase !== 'racing') stepRace(barRace, 0.2, ctx())
const bar = raceHud(barRace)
chk('a race in progress fills the lap bar',
    bar.showBar === true && bar.barLabel.startsWith('LAP'), JSON.stringify(bar))
chk('and an idle one does not', raceHud(newRaceState()).showBar !== true)

// Now the same race with a player who does nothing at all.
let idle = newRaceState()
stepRace(idle, 0.1, ctx())
let ig = 0
while (idle.phase !== 'finished' && ig++ < 60000) {
  stepRace(idle, 0.1, ctx({ along: 0, elapsed: ig * 0.1 }))
}
chk('a player who never moves loses', idle.phase === 'finished' && idle.winner !== 'YOU',
    `${idle.winner}`)
chk('to the quickest car in the field', idle.winner === 'RED', `${idle.winner}`)
chk('and finishes last', idle.player.place === RACE_FIELD + 1 || idle.player.place === 0,
    `P${idle.player.place}`)

// ---------------------------------------------------------------------------
console.log('\n10. Leaving, and coming back\n')

let leaver = newRaceState()
stepRace(leaver, 0.1, ctx())
while (leaver.phase !== 'racing') stepRace(leaver, 0.2, ctx())
stepRace(leaver, 0.1, ctx({ onCourse: false }))
chk('driving off the circuit abandons the race', leaver.phase === 'idle')
chk('and takes the field away with it', leaver.cars.length === 0)
chk('it says so, briefly', leaver.message.includes('ABANDON'))

stepRace(leaver, 0.1, ctx())
chk('and coming back starts a new one', leaver.phase === 'gridding')

let swapper = newRaceState()
stepRace(swapper, 0.1, ctx())
while (swapper.phase !== 'racing') stepRace(swapper, 0.2, ctx())
stepRace(swapper, 0.1, ctx({ kind: 'monster' }))
chk('changing vehicle mid-race abandons it too', swapper.phase === 'idle')

// After a finish there is a pause, so a lap of honour is not a new race.
chk('a finished race sets a cooldown', state.cooldown > 0, `${state.cooldown}`)
let cool = 0
while (state.phase !== 'idle' && cool < 30) { stepRace(state, 0.2, ctx()); cool += 0.2 }
chk('it goes back to idle on its own', state.phase === 'idle')
stepRace(state, 0.1, ctx())
chk('and will not immediately start another', state.phase === 'idle',
    `cooldown ${state.cooldown.toFixed(1)}`)
let wait = 0
while (state.cooldown > 0 && wait < COOLDOWN + 5) { stepRace(state, 0.2, ctx()); wait += 0.2 }
stepRace(state, 0.1, ctx())
chk('but it will once the cooldown is done', state.phase === 'gridding')

// ---------------------------------------------------------------------------
console.log('\n11. The circuit itself\n')

const speedway = getIsland('speedway')
chk('the speedway island exists', !!speedway)

const circuit = speedway && getIslandRing(speedway)
chk('and its ring road is the circuit', !!circuit && circuit.length > 3)

if (circuit) {
  let length = 0
  for (let i = 1; i < circuit.length; i++) {
    length += Math.hypot(circuit[i].x - circuit[i - 1].x, circuit[i].z - circuit[i - 1].z)
  }
  console.log(`   the lap is ${length.toFixed(0)} units`)
  chk('a lap is long enough to be a lap', length > 250, `${length.toFixed(0)}`)
  chk('and short enough that ten of them is a race and not an afternoon',
      length * RACE_LAPS / 22 < 300,
      `${(length * RACE_LAPS / 22).toFixed(0)}s at 22 units/sec`)

  const line = pointAlongRing(circuit, RACE_LINE_AT)
  chk('the start line is somewhere on it', !!line)
  chk('it is a quarter of the way round', near(line.along / line.total, RACE_LINE_AT, 1e-6))
  chk('the whole grid fits behind it without wrapping',
      gridOffset(RACE_FIELD) < length / 3,
      `${gridOffset(RACE_FIELD)} of ${length.toFixed(0)}`)

  chk('the start of the loop and the end are the same point',
      near(circuit[0].x, circuit[circuit.length - 1].x, 0.01) &&
      near(circuit[0].z, circuit[circuit.length - 1].z, 0.01))

  chk('pointAlongRing at 0 is the start', near(pointAlongRing(circuit, 0).x, circuit[0].x))
  chk('and it refuses a path that is not one', pointAlongRing([], 0.5) === null)
}

// ---------------------------------------------------------------------------
console.log('\n12. How each vehicle drives, and what happens in the air\n')

const base = {
  maxForwardSpeed: 18, forwardAccel: 15, boostMultiplier: 1.6,
  maxSteerAngle: 0.82, highSpeedSteerReduction: 0.9, handbrakeStrength: 34,
  engineBrakeStrength: 21, rollingResistance: 5, maxReverseSpeed: 6.5
}

const sedanTune = tuningFor('sedan', base)
chk('an untuned kind drives exactly as the baseline does',
    JSON.stringify(sedanTune) === JSON.stringify(base))
chk('and the baseline itself is never mutated',
    base.maxForwardSpeed === 18 && !('airControl' in base))

const truck = tuningFor('monster', base)
const f1 = tuningFor('race', base)
chk('the monster truck is the slowest thing in the world',
    truck.maxForwardSpeed < base.maxForwardSpeed &&
    truck.maxForwardSpeed < f1.maxForwardSpeed,
    `${truck.maxForwardSpeed.toFixed(1)} / ${base.maxForwardSpeed} / ${f1.maxForwardSpeed.toFixed(1)}`)
chk('and the racing car the fastest', f1.maxForwardSpeed > base.maxForwardSpeed)

// The boost multipliers are multipliers OF THE BASE, and that is what caught
// them out first time: `1.15` on the truck meant "15% more boost than a
// saloon", not "a mild boost", and put a 14-unit truck on the ramp at 26.
chk('boosting the truck does not make it quicker than a saloon',
    truck.maxForwardSpeed * truck.boostMultiplier < base.maxForwardSpeed * base.boostMultiplier,
    `${(truck.maxForwardSpeed * truck.boostMultiplier).toFixed(1)} vs ${(base.maxForwardSpeed * base.boostMultiplier).toFixed(1)}`)
chk('and nothing in the fleet has a bigger boost than the saloon',
    truck.boostMultiplier <= base.boostMultiplier &&
    f1.boostMultiplier <= base.boostMultiplier)

chk('only the truck has full authority in the air', truck.airControl === 1)
chk('the racing car has a little', f1.airControl > 0 && f1.airControl < 0.5)
chk('and a saloon has none at all', (sedanTune.airControl || 0) === 0)

// airborneVelocity: on the ground the velocity IS the heading times the speed.
const want = { x: 3, z: 4 }
const have = { x: -10, z: 0 }
const onGround = airborneVelocity(want, have, true, 0)
chk('on the ground the steering sets the velocity outright',
    onGround.x === 3 && onGround.z === 4)

const noControl = airborneVelocity(want, have, false, 0)
chk('in the air with no control it keeps exactly what it took off with',
    noControl.x === -10 && noControl.z === 0)

const fullControl = airborneVelocity(want, have, false, 1)
chk('in the air with full control it steers as if on the ground',
    fullControl.x === 3 && fullControl.z === 4)

const some = airborneVelocity(want, have, false, 0.25)
chk('and a quarter of the control moves it a quarter of the way',
    near(some.x, -10 + 13 * 0.25) && near(some.z, 1))
chk('control outside 0..1 is clamped rather than believed',
    airborneVelocity(want, have, false, 5).x === 3 &&
    airborneVelocity(want, have, false, -5).x === -10)

// airYaw: the bicycle model does not apply without tyres.
chk('a saloon cannot turn at all in the air', airYaw(5, sedanTune) === 0)
chk('the truck can, but never faster than it does on the ground',
    airYaw(5, truck) > 0 && airYaw(5, truck) <= 5, `${airYaw(5, truck)}`)
chk('and no vehicle is allowed to spin faster in the air than on tarmac',
    AIR_YAW <= 1, `${AIR_YAW}`)
chk('and the racing car turns a quarter as much as the truck',
    near(airYaw(5, f1), airYaw(5, truck) * 0.25, 1e-9))
chk('no parameters at all is no yaw', airYaw(5, null) === 0)

// isGrounded reads contact normals, not distances.
chk('no contacts means airborne', isGrounded([]) === false)
chk('and neither does nothing at all', isGrounded(null) === false)
chk('a floor underneath is grounded', isGrounded([-1]) === true)
chk('a floor above counts too - it is still a floor-shaped contact',
    isGrounded([1]) === true)
chk('but a wall does not', isGrounded([0]) === false)
chk('nor a whole garage doorway of walls',
    isGrounded(new Array(22).fill(0)) === false)
chk('one floor among the walls is enough',
    isGrounded([0, 0, 0, -0.98, 0]) === true)

// And the two safety nets on top of it.
chk('touching is grounded whatever else says',
    groundedWithCoyote(true, null, 99) === true)
chk('not touching but close underneath is grounded',
    groundedWithCoyote(false, 0.6, 99) === true)
chk('not touching and nothing below is airborne',
    groundedWithCoyote(false, null, 99) === false)
chk('and so is high above the ground',
    groundedWithCoyote(false, 4, 99) === false)
chk('coyote time carries a car over a kerb',
    groundedWithCoyote(false, null, COYOTE_TIME * 0.5) === true)
chk('but runs out long before a jump does',
    groundedWithCoyote(false, null, COYOTE_TIME * 1.5) === false)
chk('and is short next to the 1.25s the truck spends in the air',
    COYOTE_TIME < 0.25, `${COYOTE_TIME}s`)

// ---------------------------------------------------------------------------
console.log('\n13. Standings\n')

let ranked = newRaceState()
stepRace(ranked, 0.1, ctx())
while (ranked.phase !== 'racing') stepRace(ranked, 0.2, ctx())
ranked.player.progress = 5000
ranked.cars.forEach((c, i) => { c.progress = 4000 - i * 100 })
const order = standings(ranked)
chk('the leader is first', order[0].player === true)
chk('everybody is in it', order.length === RACE_FIELD + 1)
chk('and it is sorted by distance covered',
    order.every((e, i) => i === 0 || e.progress <= order[i - 1].progress))

console.log(`\n${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
