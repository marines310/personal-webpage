/**
 * The stunt arena's geometry, and the race.
 *
 * Both are pure modules with no THREE in them, which is the point of them being
 * pure modules: a mound is arithmetic and a race is a state machine, and
 * neither needs a browser to be wrong in front of you.
 *
 * What is NOT here, and could not be: whether the monster truck can actually
 * get over any of this. That is the physics engine's answer, not arithmetic's,
 * and it was measured in the running game - the numbers are on MAX_FACE and on
 * STUNT_DOUBLE.landing. What this file guards is that the LAYOUT still matches
 * those measurements, so that moving a mound without re-measuring is a failing
 * test rather than a quiet regression.
 */
import {
  moundSolid, flightRange, pointAlongRing, walkLoop, outsetLoop, faceRun,
  COURSE_GROUND, RAMP_BURY, MAX_FACE, MIN_RUN,
  STUNT_COURSE, STUNT_MOUNDS, STUNT_DOUBLE, MEASURED_DOUBLE,
  CRUSH_PILE, crushSolid, crushFitsOn,
  RACE_LAPS, RACE_FIELD, RACE_LIGHTS, RACE_COUNTDOWN, RACE_LINE_AT, lightAt,
  CIRCUIT_GATE, GRID_COLUMN_OFFSET, pitStraightPlan, RUN_OFF
} from '../src/world/course.js'
import {
  newRaceState, stepRace, raceHud, loopDelta, lapsFrom, makeField,
  standings, carSpeed, gridOffset, gridSide,
  FORM_UP_TIME, GRID_PATIENCE, GRID_TOLERANCE, COOLDOWN, FIELD_PACE, RACE_PACE
} from '../src/world/raceGame.js'
import {
  getIsland, getIslandRing, islandOutline, getMonorailPiers, getBridgeLandings,
  DEFAULT_ROAD_WIDTH
} from '../src/world/islandLayout.js'
import { chooseMission } from '../src/world/missions.js'
import {
  tuningFor, airborneVelocity, isGrounded, groundedWithCoyote, airYaw,
  COYOTE_TIME, GROUND_REACH, AIR_YAW,
  tiltRates, uprightError, pathError, isFlipped, TILT
} from '../src/world/driving.js'
import { distanceToEdge, insetPolygon } from '../src/world/shapes.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol
const deg = (r) => r * 180 / Math.PI

// ---------------------------------------------------------------------------
console.log('1. A mound is a closed solid with no vertical face on it\n')

const mound = moundSolid({
  x: 0, z: 0, heading: 0,
  topWidth: 10, topDepth: 6, height: 3, runIn: 8, runOut: 4, runSide: 7
})

chk('it has triangles', mound.positions.length > 0 && mound.positions.length % 9 === 0,
    `${mound.positions.length} floats`)
chk('every vertex has an index', mound.indices.length === mound.positions.length / 3)
chk('the indices are the plain sequence a trimesh wants',
    mound.indices.every((v, i) => v === i))

// Twelve triangles: eight for the four sloped faces, two for the flat top, two
// for the floor. A shell with any of them missing is something a fast vehicle
// can pass through - a Rapier trimesh is infinitely thin.
chk('it is closed - twelve triangles, no open faces',
    mound.indices.length === 36, `${mound.indices.length / 3} triangles`)

const ys = []
for (let i = 1; i < mound.positions.length; i += 3) ys.push(mound.positions[i])
chk('its floor is buried under the ground',
    near(Math.min(...ys), COURSE_GROUND - RAMP_BURY), `${Math.min(...ys)}`)
chk('its top is exactly the height asked for',
    near(Math.max(...ys), COURSE_GROUND + 3), `${Math.max(...ys)}`)
chk('and the crest is reported where the geometry puts it',
    near(mound.crest.y, COURSE_GROUND + 3) && near(mound.crest.x, 0),
    JSON.stringify(mound.crest))

// THE WHOLE POINT. Mike's son's report on the first arena was that most of the
// obstacles were walls: "if I drive into them, I'm not jumping, I'm more like
// crashing into a wall." That was true, and it was true because a wedge has one
// sloped face and three vertical ones. A mound has four sloped faces and no
// vertical one, which is what lets you hit it from any direction.
// AND IT FACES OUTWARDS. Rapier collides with a trimesh from either side, so
// the physics was right for two whole rounds of screenshots while the picture
// was inside out: three.js culls back faces, so every mound rendered as the
// unlit inside of its own far slope - a black hole in a tan floor. Colour was
// changed twice before winding was checked once.
{
  const p = mound.positions
  let cx = 0, cy = 0, cz = 0
  for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2] }
  const n = p.length / 3
  cx /= n; cy /= n; cz /= n
  let outward = 0
  for (let t = 0; t < p.length; t += 9) {
    const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2]
    const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2]
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
    const dx = (p[t] + p[t + 3] + p[t + 6]) / 3 - cx
    const dy = (p[t + 1] + p[t + 4] + p[t + 7]) / 3 - cy
    const dz = (p[t + 2] + p[t + 5] + p[t + 8]) / 3 - cz
    if (nx * dx + ny * dy + nz * dz > 0) outward++
  }
  chk('every triangle is wound so its front face points out of the solid',
      outward === 12, `${outward} of 12`)
}

chk('every face is sloped - none of them is vertical',
    mound.angles.in < Math.PI / 2 && mound.angles.out < Math.PI / 2 &&
    mound.angles.side < Math.PI / 2)
chk('the three runs give the three angles they should',
    near(deg(mound.angles.in), deg(Math.atan2(3, 8)), 1e-9) &&
    near(deg(mound.angles.out), deg(Math.atan2(3, 4)), 1e-9) &&
    near(deg(mound.angles.side), deg(Math.atan2(3, 7)), 1e-9))

// A run of zero would BE a vertical face, so it cannot be allowed through even
// by accident.
const flat = moundSolid({
  x: 0, z: 0, heading: 0, topWidth: 6, topDepth: 6, height: 3,
  runIn: 0, runOut: -5, runSide: 0
})
chk('a run of zero is clamped rather than believed',
    flat.angles.in < Math.PI / 2 && flat.angles.out < Math.PI / 2,
    `${deg(flat.angles.in).toFixed(1)} / ${deg(flat.angles.out).toFixed(1)} degrees`)
chk('and the clamp is MIN_RUN', near(flat.angles.in, Math.atan2(3, MIN_RUN)))

// Heading is atan2(x, z), like every other bearing in the project: 0 is +Z.
const east = moundSolid({
  x: 0, z: 0, heading: Math.PI / 2,
  topWidth: 10, topDepth: 6, height: 3, runIn: 8, runOut: 4, runSide: 7
})
chk('heading pi/2 puts the far face at +x',
    near(east.lip.x, 7, 1e-9) && near(east.lip.z, 0, 1e-9), JSON.stringify(east.lip))

// ---------------------------------------------------------------------------
console.log('\n2. Nothing on the floor is steeper than the truck can climb\n')

console.log(`   the measured limit is ${deg(MAX_FACE).toFixed(0)} degrees` +
            ` - see MAX_FACE for the table it came from`)

const everything = [
  ...STUNT_MOUNDS,
  { name: 'the double: take-off', ...STUNT_DOUBLE.takeOff },
  { name: 'the double: landing', ...STUNT_DOUBLE.landing }
]

for (const spec of everything) {
  const solid = moundSolid(spec)
  const worst = Math.max(solid.angles.in, solid.angles.out, solid.angles.side)
  chk(`${spec.name.padEnd(22)} steepest face ${deg(worst).toFixed(1)} degrees`,
      worst <= MAX_FACE + 1e-9,
      `over the measured limit of ${deg(MAX_FACE).toFixed(0)}`)
}

chk('and none of them is a gentle rise either - they are meant to be jumps',
    everything.every((s) => moundSolid(s).angles.in > 18 * Math.PI / 180),
    everything.filter((s) => moundSolid(s).angles.in <= 18 * Math.PI / 180)
              .map((s) => s.name).join(' '))

chk('faceRun() and FACE agree with each other',
    near(Math.atan2(3, faceRun(3)), 25 * Math.PI / 180, 1e-9))

// ---------------------------------------------------------------------------
console.log('\n3. The ballistics still describe what the game does\n')

// Measured in the running browser on a three-unit test mound with 26-degree
// faces: the truck went over at 14 and came down 21 units past the crest.
const takeOff = STUNT_DOUBLE.takeOff
const overCrest = flightRange(14, 0, takeOff.height)
chk('leaving a crest horizontally still gives a real flight',
    overCrest.distance > 8, `${overCrest.distance.toFixed(1)} units`)
chk('a faster vehicle always flies further, which is why size cannot be the gate',
    flightRange(27.9, 0, takeOff.height).distance >
    flightRange(14, 0, takeOff.height).distance)
chk('flightRange copes with no height at all',
    flightRange(14, 0, 0).distance === 0)
chk('and with no speed at all', flightRange(0, 0.3, 3).distance === 0)

// ---------------------------------------------------------------------------
console.log('\n4. The double still does what it was measured doing\n')

// These are not predictions. They were taken off the running game with
// probe/double.mjs, and their job here is to fail the moment somebody resizes
// the mound or retunes a vehicle without re-taking them - which is exactly
// what happened the last time this jump changed shape and nobody re-measured.
{
  const solid = moundSolid(STUNT_DOUBLE.takeOff)
  const land = moundSolid(STUNT_DOUBLE.landing)
  const crest = STUNT_DOUBLE.takeOff.z
  const m = MEASURED_DOUBLE.monster

  chk('the truck comes down past the take-off, not on it',
      crest + m.flight > crest + solid.reach.along,
      `lands ${(crest + m.flight).toFixed(1)}, take-off reaches ` +
      `${(crest + solid.reach.along).toFixed(1)}`)

  const nearFoot = STUNT_DOUBLE.landing.z - land.reach.along
  const topFrom = STUNT_DOUBLE.landing.z - STUNT_DOUBLE.landing.topDepth / 2
  const farFoot = STUNT_DOUBLE.landing.z + land.reach.along

  chk('and it comes down ON the landing rather than in the gap',
      m.landsAt > nearFoot && m.landsAt < farFoot,
      `${m.landsAt} against ${nearFoot.toFixed(1)}..${farFoot.toFixed(1)}`)

  // The saloon and the racing car are FASTER, so they go further. That is the
  // whole argument for gating the arena by physics rather than by vehicle
  // kind: nothing here is locked, the jump simply suits one truck.
  chk('the saloon flies further than the truck, so the gate is speed not kind',
      MEASURED_DOUBLE.sedan.flight > m.flight,
      `${MEASURED_DOUBLE.sedan.flight} against ${m.flight}`)
  chk('and the saloon lands beyond the landing crest, not on the same spot',
      MEASURED_DOUBLE.sedan.landsAt > STUNT_DOUBLE.landing.z)
  chk('the racing car does not come down inside the arena at all',
      MEASURED_DOUBLE.race.landsAt === null &&
      MEASURED_DOUBLE.race.peak > 12)

  // The measured peak has to be consistent with the ballistics the pure module
  // predicts. Not equal - the game is a physics engine and this is a parabola
  // - but the same order, or one of the two is describing a different world.
  const predicted = flightRange(m.lipSpeed, 0, STUNT_DOUBLE.takeOff.height)
  chk('and the measured flight is within half of the parabola for it',
      Math.abs(predicted.distance - m.flight) < m.flight * 0.5,
      `parabola says ${predicted.distance.toFixed(1)}, game says ${m.flight}`)

  chk('the landing is far enough past the take-off to be a gap',
      nearFoot - (crest + solid.reach.along) >= 2,
      `${(nearFoot - (crest + solid.reach.along)).toFixed(1)} units`)
  chk('and the truck clears that gap',
      crest + m.flight > nearFoot,
      `${(crest + m.flight).toFixed(1)} against a foot at ${nearFoot.toFixed(1)}`)

  console.log(`   the truck leaves at ${m.lipSpeed}, peaks at ${m.peak},` +
              ` flies ${m.flight} and lands ${(m.landsAt - topFrom).toFixed(1)}` +
              ` short of the flat top`)
}

// ---------------------------------------------------------------------------
console.log('\n5. Everything fits on the floor it is built on\n')

const stunt = getIsland('stunt')
chk('the stunt island exists', !!stunt)

if (stunt) {
  const ring = getIslandRing(stunt)
  const floor = insetPolygon(ring, STUNT_COURSE.padInset)
  const barrier = insetPolygon(ring, STUNT_COURSE.barrier.inset)

  // Every mound's footprint has to be inside the barrier, which is the wall
  // round the arena. A mound half-buried in the wall is not a jump, it is a
  // ramp into a fence - and this is exactly the class of mistake that is
  // invisible in a plan view and obvious the moment somebody drives at it.
  const inFloor = (x, z) => distanceToEdge(barrier, x, z)

  for (const spec of everything) {
    const solid = moundSolid(spec)
    const fx = Math.sin(spec.heading)
    const fz = Math.cos(spec.heading)
    let worst = Infinity
    let where = null
    // The four corners of the footprint, which is where it sticks out.
    for (const along of [-solid.reach.along, solid.reach.along]) {
      for (const across of [-solid.reach.across, solid.reach.across]) {
        const x = spec.x + fx * along + fz * across
        const z = spec.z + fz * along - fx * across
        const d = inFloor(x, z)
        if (d < worst) { worst = d; where = [+x.toFixed(1), +z.toFixed(1)] }
      }
    }
    // 1.5, not 0. A footprint corner that just touches the barrier still has
    // the barrier's own thickness built through it.
    chk(`${spec.name.padEnd(22)} is inside the barrier`, worst > 1.5,
        `corner ${JSON.stringify(where)} is ${worst.toFixed(1)} from the wall`)
  }

  // The monorail crosses this island - `monorail: false` keeps a STATION off,
  // not the railway - and it stands on piers. A pier inside a mound is a
  // concrete column sticking out of a jump.
  const piers = getMonorailPiers()
    .map((p) => ({ x: p.x - stunt.x, z: p.z - stunt.z }))
    .filter((p) => distanceToEdge(floor, p.x, p.z) > -8)

  console.log(`   ${piers.length} monorail piers stand on this island`)
  chk('there are piers to avoid, so this check is doing something',
      piers.length > 0)

  for (const spec of everything) {
    const solid = moundSolid(spec)
    let worst = Infinity
    for (const pier of piers) {
      // Distance from the pier to the mound's footprint rectangle, in the
      // mound's own frame.
      const dx = pier.x - spec.x
      const dz = pier.z - spec.z
      const along = Math.abs(dx * Math.sin(spec.heading) + dz * Math.cos(spec.heading))
      const across = Math.abs(dx * Math.cos(spec.heading) - dz * Math.sin(spec.heading))
      const gap = Math.max(along - solid.reach.along, across - solid.reach.across)
      worst = Math.min(worst, gap)
    }
    chk(`${spec.name.padEnd(22)} clears the monorail piers`, worst > 3,
        `${worst.toFixed(1)} units`)
  }

  // And they must not be built into each other. Two overlapping trimeshes are
  // not a bigger mound, they are a pair of surfaces that disagree about where
  // the ground is, and a vehicle between them gets picked up by whichever one
  // Rapier resolves second.
  //
  // The gap between two mounds is a SEPARATING-AXIS test on their footprint
  // rectangles, not a distance between bounding circles. The first version of
  // this check used circles, and a circle round a 30-by-22 rectangle is nine
  // units bigger than the rectangle in every direction - so it called the two
  // halves of the double a collision when they are twelve units apart, and
  // would have gone on calling every workable layout a failure.
  const rectGap = (a, b) => {
    const sa = moundSolid(a)
    const sb = moundSolid(b)
    const dx = b.x - a.x
    const dz = b.z - a.z
    // How far a mound reaches along an arbitrary axis: its two half-extents,
    // each scaled by how much its own axis lines up with the one being tested.
    const spread = (heading, solid, ax, az) =>
      Math.abs(Math.sin(heading) * ax + Math.cos(heading) * az) * solid.reach.along +
      Math.abs(Math.cos(heading) * ax - Math.sin(heading) * az) * solid.reach.across
    // Two rectangles are apart if they are apart on ANY axis, and for two
    // rectangles the only axes that can separate them are their own four
    // edge normals - so the biggest of these four gaps is the real one.
    let widest = -Infinity
    for (const h of [a.heading, a.heading + Math.PI / 2,
                     b.heading, b.heading + Math.PI / 2]) {
      const ax = Math.sin(h)
      const az = Math.cos(h)
      widest = Math.max(widest, Math.abs(dx * ax + dz * az) -
        spread(a.heading, sa, ax, az) - spread(b.heading, sb, ax, az))
    }
    return widest
  }

  // Prove the metric before trusting it: two identical mounds on top of each
  // other must read as overlapping, and the same pair pushed well apart must
  // not. A gap function that says everything is fine is not a test.
  const twin = (x, z) => ({ x, z, heading: 0, topWidth: 10, topDepth: 6,
                            height: 3, runIn: 6, runOut: 6, runSide: 6 })
  chk('the gap metric calls a mound built on top of itself an overlap',
      rectGap(twin(0, 0), twin(0, 0)) < 0, `${rectGap(twin(0, 0), twin(0, 0))}`)
  chk('and two the same size, forty apart, clear by the arithmetic',
      near(rectGap(twin(0, 0), twin(0, 40)), 40 - 2 * (3 + 6), 1e-9),
      `${rectGap(twin(0, 0), twin(0, 40))}`)

  let closest = Infinity
  let pair = ''
  for (let i = 0; i < everything.length; i++) {
    for (let j = i + 1; j < everything.length; j++) {
      const d = rectGap(everything[i], everything[j])
      if (d < closest) { closest = d; pair = `${everything[i].name} / ${everything[j].name}` }
    }
  }
  console.log(`   closest pair: ${pair}, ${closest.toFixed(1)} apart`)
  // Two clear, not zero. Touching footprints put the foot of one mound's
  // slope in the foot of another's, which is a seam you can catch a wheel in.
  chk('no two mounds are built into each other', closest > 2, `${pair}`)

  // THE CRUSH PILE IS A RAMP, AND IT HAS TO FIT ON ITS OWN MOUND.
  //
  // Mike: "the monster truck stadium has these vehicles that I think we're
  // supposed to drive over, but because it uses the in-game vehicle model, I
  // am unable to do anything with the cars." He was right - each wreck had a
  // static BOX round it, which is a vertical wall at the top of a slope, so
  // driving at the pile stopped you dead.
  //
  // It is one trimesh now, built by the same moundSolid() as everything else
  // and therefore with the same 25-degree faces. Which means it has the same
  // problem every mound has: it must fit on the thing it is built on. The
  // first version did not - 1.15 high with a 5.2 by 3.4 top needs 5.1 units
  // across and the mound's flat top is 4 - so its buried edge hung in the air
  // over the parent's slope, the two trimeshes crossed, and driving into the
  // seam threw the monster truck TWENTY-ONE units into the sky.
  {
    const pile = STUNT_MOUNDS.find((m) => m.crush)
    chk('there is a crush pile to check', !!pile)
    if (pile) {
      const fit = crushFitsOn(pile)
      chk('the crush ramp fits within its mound\'s flat top', fit.fits,
          `needs ${fit.acrossNeeded.toFixed(2)} x ${fit.alongNeeded.toFixed(2)}, ` +
          `has ${fit.acrossHave} x ${fit.alongHave}`)

      const parent = moundSolid(pile)
      const ramp = crushSolid({ x: pile.x, z: pile.z, heading: pile.heading },
                              parent.crest.y)
      chk('and it stands on the mound rather than floating over it',
          ramp.topY > parent.crest.y && ramp.topY < parent.crest.y + 2,
          `ramp top ${ramp.topY.toFixed(2)}, mound crest ${parent.crest.y.toFixed(2)}`)
      chk('its faces are climbable, like every other obstacle here',
          Math.max(ramp.angles.in, ramp.angles.out, ramp.angles.side) <= MAX_FACE + 1e-9)
      chk('and it is low enough to be a lip on a jump, not a second jump',
          CRUSH_PILE.height < 1.2, `${CRUSH_PILE.height}`)
    }
  }

  // The arena furniture has to resolve too. An outset that comes back null is
  // a grandstand that never gets built, which is how the first version of the
  // stands ended up invisible.
  chk('the barrier loop resolves', !!barrier && barrier.length > 3)
  for (let tier = 0; tier < STUNT_COURSE.stands.tiers; tier++) {
    const out = STUNT_COURSE.stands.fromRing + tier * STUNT_COURSE.stands.tread
    const loop = outsetLoop(ring, out)
    chk(`seating tier ${tier} resolves and is bigger than the ring`,
        loop.length === ring.length &&
        Math.max(...loop.map((p) => p.x)) > Math.max(...ring.map((p) => p.x)),
        `${loop.length} points`)
  }

  const blocks = walkLoop([...barrier, barrier[0]], STUNT_COURSE.barrier.blockLength)
  console.log(`   the barrier is ${blocks.length} blocks round`)
  chk('the barrier is a whole number of blocks with no short one at the seam',
      blocks.length > 20)
  chk('and walkLoop hands back fractions from 0 to just under 1',
      blocks[0].fraction === 0 && blocks[blocks.length - 1].fraction < 1)
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

  // AND THERE IS A WAY IN. The first version of the armco ran unbroken round
  // the outside of the circuit, which put a steel barrier across the bridge
  // road: you drove over the bridge, past the traffic lights this island
  // already has, over the zebra crossing already painted across the track,
  // and stopped. Nothing failed, because a wall in the wrong place is a
  // perfectly good wall - so the check has to be for the HOLE.
  const landings = getBridgeLandings(speedway)
  chk('a bridge lands on the speedway at all', landings.length > 0)

  // The same corridor test World.circuitGate() builds its predicate from, so
  // the test and the builder cannot disagree about where the gate is.
  const inGate = (x, z, width) => landings.some((l) =>
    x * l.dirX + z * l.dirZ > 0 &&
    Math.abs(x * l.dirZ - z * l.dirX) < width / 2)

  const armco = outsetLoop(circuit, DEFAULT_ROAD_WIDTH / 2 + 3)
  const path = armco.map((p) => ({ x: p.x, z: p.z }))
  path.push({ ...path[0] })
  const posts = walkLoop(path, 5)

  const blocking = posts.filter((at) => inGate(at.x, at.z, CIRCUIT_GATE))
  console.log(`   ${blocking.length} of ${posts.length} armco posts fall in the gate`)
  chk('the gate is somewhere the barrier would otherwise have run',
      blocking.length > 0, 'nothing to skip means the test proves nothing')

  // The gap has to be wider than the road, not merely non-zero.
  chk('and it is wider than the road that comes through it',
      CIRCUIT_GATE > DEFAULT_ROAD_WIDTH + 4,
      `${CIRCUIT_GATE} against a ${DEFAULT_ROAD_WIDTH}-wide road`)

  // Every landing needs its own hole, not just the first one.
  for (let i = 0; i < landings.length; i++) {
    const l = landings[i]
    const on = posts.filter((at) =>
      at.x * l.dirX + at.z * l.dirZ > 0 &&
      Math.abs(at.x * l.dirZ - at.z * l.dirX) < CIRCUIT_GATE / 2)
    chk(`bridge ${i} to ${l.other.id} gets its own hole`, on.length > 0,
        `${on.length} posts skipped`)
  }

  // And the hole is a hole, not a thinning: no post survives inside it.
  chk('nothing is left standing in the gate',
      blocking.every((at) => inGate(at.x, at.z, CIRCUIT_GATE)))
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
console.log('\n13. Pitch and roll\n')

// Mike, after driving the arena: "the jump mechanics seem kinda flat." They
// were. Every chassis had pitch and roll LOCKED, and on top of that the
// driving model wrote `setAngvel({x: 0, y: yawRate, z: 0})` every frame, which
// threw away any rotation the physics did manage. A car left a four-unit mound
// level, flew level and landed level.
{
  const level = { x: 0, y: 1, z: 0 }
  const nose = { x: 0, y: 0, z: 1 }
  const still = { x: 0, y: 0, z: 0 }

  // Run the controller to its steady state, the way the game does - one call
  // is a rate change, not a rate.
  const settle = (opts, steps = 200) => {
    let a = { x: 0, y: 0, z: 0 }
    for (let i = 0; i < steps; i++) {
      const r = tiltRates({ ...opts, angVel: a })
      a = { x: r.x, y: 0, z: r.z }
    }
    return a
  }

  chk('a level car on level ground is asked to do nothing',
      settle({ up: level, forward: nose, velocity: { x: 0, y: 0, z: 14 },
               grounded: true, groundNormal: level }).x === 0)

  // The error is a cross product, so its LENGTH is the sine of the angle -
  // both the axis to turn about and how far. Zero exactly when upright.
  chk('uprightError is zero for a level car',
      uprightError(level).x === 0 && uprightError(level).z === 0)
  chk('and grows with the lean',
      Math.abs(uprightError({ x: Math.sin(0.5), y: Math.cos(0.5), z: 0 }).z) >
      Math.abs(uprightError({ x: Math.sin(0.2), y: Math.cos(0.2), z: 0 }).z))

  // THE ONE THAT MAKES A JUMP LOOK LIKE A JUMP. Climbing, the nose comes up;
  // falling, it drops. Rotation about +x pitches the nose DOWN, so the signs
  // are the other way round from the intuition and worth pinning here.
  const climbing = settle({ up: level, forward: nose, grounded: false,
                            velocity: { x: 0, y: 9, z: 14 } })
  const falling = settle({ up: level, forward: nose, grounded: false,
                           velocity: { x: 0, y: -9, z: 14 } })
  chk('climbing off a ramp pitches the nose UP', climbing.x < -0.5,
      `${climbing.x.toFixed(2)} rad/s`)
  chk('and falling pitches it DOWN', falling.x > 0.5, `${falling.x.toFixed(2)} rad/s`)
  chk('flat flight asks for no pitch at all',
      Math.abs(settle({ up: level, forward: nose, grounded: false,
                        velocity: { x: 0, y: 0, z: 14 } }).x) < 1e-9)
  chk('and neither does standing still in the air - a direction of travel ' +
      'below walking pace is noise',
      pathError(nose, { x: 0, y: 0.4, z: 0.2 }).x === 0)

  // ON THE GROUND, LEVEL MEANS THE SLOPE. Aiming at the horizon while standing
  // on a 25-degree mound means fighting the terrain and winning, which is how
  // the arena stayed flat even with the lock removed.
  const onRamp = settle({
    up: level, forward: nose, grounded: true,
    velocity: { x: 0, y: 0, z: 14 },
    groundNormal: { x: 0, y: Math.cos(0.436), z: -Math.sin(0.436) }
  })
  chk('a level car on a 25-degree slope is turned to lie along it',
      Math.abs(onRamp.x) > 1, `${onRamp.x.toFixed(2)} rad/s`)
  chk('and it is the ground it follows, not the horizon',
      Math.abs(onRamp.x) >
      Math.abs(settle({ up: level, forward: nose, grounded: true,
                        velocity: { x: 0, y: 0, z: 14 },
                        groundNormal: level }).x))

  // A steep enough contact is not a floor. Standing against a wall must not
  // roll the car into the wall to lie along it.
  chk('a near-vertical contact is ignored rather than lain along',
      settle({ up: level, forward: nose, grounded: true,
               velocity: { x: 0, y: 0, z: 14 },
               groundNormal: { x: 0.97, y: 0.2, z: 0 } }).z === 0)

  // The spring is stiff on the ground and weak in the air, which is the whole
  // shape of the thing: tyres hold a car level, nothing holds it in flight.
  chk('the upright spring is far stiffer on the ground than in the air',
      TILT.groundSpring > TILT.airSpring * 5,
      `${TILT.groundSpring} against ${TILT.airSpring}`)

  // A cap, so a bad landing is a lurch and not a barrel roll.
  const violent = settle({ up: { x: 0.99, y: 0.14, z: 0 }, forward: nose,
                           grounded: true, velocity: { x: 0, y: -20, z: 20 },
                           groundNormal: level })
  chk('and no input can spin it faster than the cap',
      Math.hypot(violent.x, violent.z) <= TILT.maxRate + 1e-9,
      `${Math.hypot(violent.x, violent.z).toFixed(2)} against ${TILT.maxRate}`)

  chk('on its roof is on its roof', isFlipped({ x: 0, y: -0.9, z: 0 }))
  chk('and leaning hard is not', !isFlipped({ x: 0.9, y: 0.4, z: 0 }))
  chk('self-righting waits long enough to read as a roll',
      TILT.flipSeconds > 1.5 && TILT.flipSeconds < 4, `${TILT.flipSeconds}s`)
}

// ---------------------------------------------------------------------------
console.log('\n14. Standings\n')

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

// ---------------------------------------------------------------------------
console.log('\n15. Nothing alongside the main straight is standing on it\n')

// THE ONE THAT WOULD HAVE CAUGHT IT. Mike asked for a wider racetrack; the
// ribbon went from seven units to thirteen and the pit wall stayed at its
// hard-coded 5.5 from the centre line, which put a solid static collider two
// units inside the tarmac. You find that by driving into it on lap one.
//
// So the offsets are computed rather than typed, and this checks them at every
// width the circuit could plausibly be - not just the one it happens to be.
for (const width of [7, 9, 11, 13, 16, 20]) {
  const plan = pitStraightPlan(width)
  const label = `at ${String(width).padStart(2)} units wide`

  chk(`${label}, nothing is on the tarmac`,
      plan.spans.every(([, near]) => near > plan.edge),
      plan.spans.filter(([, near]) => near <= plan.edge)
        .map(([n, near]) => `${n} at ${near.toFixed(1)} inside edge ${plan.edge}`)
        .join('; '))

  chk(`${label}, there is run-off before the first thing you can hit`,
      plan.spans[0][1] - plan.edge >= RUN_OFF - 1e-9,
      `${(plan.spans[0][1] - plan.edge).toFixed(2)}`)

  // And nothing is inside anything else - the gantry leg used to end up
  // standing in the middle of the pit building.
  for (let i = 1; i < plan.spans.length; i++) {
    const [name, near] = plan.spans[i]
    const [before, , far] = plan.spans[i - 1]
    chk(`${label}, the ${name} clears the ${before}`,
        near >= far, `${near.toFixed(1)} against ${far.toFixed(1)}`)
  }

  // The gantry straddles the track rather than standing on it.
  chk(`${label}, the gantry spans the full width of the track`,
      plan.gantrySpan / 2 - plan.legDepth > plan.edge,
      `${(plan.gantrySpan / 2).toFixed(1)} against ${plan.edge}`)
}

// The grid is set out across the track it is actually on. Six cars in two
// columns either side of the centre line, each of them on tarmac.
{
  const width = getIsland('speedway').ringWidth || DEFAULT_ROAD_WIDTH
  const CAR_HALF_WIDTH = 1.9 / 2
  chk('the grid columns are wide enough apart to look like a grid',
      GRID_COLUMN_OFFSET > CAR_HALF_WIDTH * 1.5,
      `${GRID_COLUMN_OFFSET} against a car half-width of ${CAR_HALF_WIDTH}`)
  chk('and both columns are entirely on the tarmac',
      GRID_COLUMN_OFFSET + CAR_HALF_WIDTH < width / 2,
      `${GRID_COLUMN_OFFSET + CAR_HALF_WIDTH} against a half-width of ${width / 2}`)
  chk('the circuit is wider than a street, because it is a circuit',
      width > DEFAULT_ROAD_WIDTH, `${width} against ${DEFAULT_ROAD_WIDTH}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
