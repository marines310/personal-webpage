/**
 * ============================================================================
 * THE TWO COURSES
 * ============================================================================
 * The stunt park's jumps and the speedway's circuit furniture, as numbers.
 *
 * No THREE here, like `driving.js`, `fireGame.js` and the rest, and for the
 * same reason: a ramp is a shape, a shape is arithmetic, and arithmetic can be
 * checked in a millisecond without a browser. World.js turns what is below
 * into meshes and colliders; this file decides where everything is and how big.
 *
 * Everything is in ISLAND-LOCAL coordinates - the island's centre is (0, 0) -
 * because that is what the rest of the map machinery uses and because it means
 * moving an island in mapData.js moves its course with it.
 *
 * ---------------------------------------------------------------------------
 * WHY A RAMP IS A TRIMESH
 * ---------------------------------------------------------------------------
 * `Physics.js` can make three kinds of static collider: a cuboid, a cylinder,
 * and a triangle mesh. The cuboid takes a yaw and nothing else - there is no
 * pitch anywhere in the API, and every collider in the world before this was
 * axis-aligned or spun about Y. A ramp is a wedge, and a wedge is neither.
 *
 * So `wedgeSolid()` below returns triangles, and World.js hands the SAME
 * triangles to Three.js and to Rapier. That is the point of it returning them
 * rather than a description: the recurring bug in this codebase is two pieces
 * of geometry that were supposed to agree and were written down twice - the
 * kerb drawn above the collider that followed the ground, the car drawn 2.57
 * wide against a 1.9 collider. A ramp you can see and a ramp you can drive up
 * cannot disagree if they are literally the same vertices.
 *
 * The wedge is CLOSED - top, both sides, the vertical face under the lip, and
 * a floor. A Rapier trimesh is an infinitely thin shell, so an open one is
 * something a fast vehicle can pass straight through.
 *
 * ---------------------------------------------------------------------------
 * WHY THE BIG JUMP IS GATED ON STEERING AND NOT ON SIZE
 * ---------------------------------------------------------------------------
 * The brief was a jump only the monster truck can make. The obvious way to do
 * that is to make it enormous, and the obvious way is wrong, because of what
 * the physics actually models.
 *
 * How far a vehicle flies is set by how fast it leaves the ramp. Top speeds
 * here are 14 for the monster truck, 18 for the saloon and 27.9 for the racing
 * car - the truck is the SLOWEST thing in the game. Make the gap wider and the
 * truck is the first to fall in it. Nor is clearance available as a gate:
 * every vehicle has the same 0.88-tall chassis collider (see
 * `Physics.createVehicleChassis`), the big wheels are a mesh, and there is no
 * suspension to model, so a boulder that stops a saloon stops the truck too.
 *
 * What the truck genuinely has, and nothing else does, is `airControl: 1` -
 * full steering authority once it leaves the ground. See `driving.js`. The
 * saloon has 0: in the air it keeps the exact velocity it took off with and
 * cannot deviate by a millimetre. The racing car has 0.25, deliberately, so it
 * can nudge and no more.
 *
 * So the big jump is a DOG-LEG. It launches you straight down the park, and
 * the landing is off to one side. You have to steer while you are in the air
 * to reach it. The truck can. The saloon flies dead straight past it and out
 * across the ring road, however fast it was going - the faster the further,
 * which is the joke. This is a gate the physics enforces rather than one a
 * rule announces, which is what was asked for.
 *
 * Measured, holding the same key on the same ramp: the truck moves 8 to 12
 * units sideways in the air and the saloon moves 0.2. The full table is on
 * STUNT_BIG_JUMP.landing.
 * ============================================================================
 */

/**
 * How high the drivable surface of these two islands is.
 *
 * Both are flat - no hills in mapData.js - so the terrain height is zero
 * everywhere and the only thing above it is the grass lift the collider
 * carries (see `surfaceLift` in terrain.js: 0.3 on grass). Everything in this
 * file measures its height from here, so a ramp lip at 3 is three units above
 * what you are driving on rather than three units above an abstraction.
 */
export const COURSE_GROUND = 0.3

/**
 * And how high the ROAD is on the same islands.
 *
 * A different number, and the difference matters. `surfaceLift()` in
 * terrain.js raises grass by 0.3 and anything paved by 0.06, so the two are a
 * quarter of a unit apart - which is nothing to look at from above and is
 * exactly enough, at eye level, for a painted grid box to hover over the road
 * it is supposed to be painted on. The first version of the speedway's
 * markings used COURSE_GROUND and every one of them floated.
 */
export const COURSE_ROAD = 0.06

/**
 * How far a ramp's floor is pushed under the ground.
 *
 * Not decoration. The terrain is a triangle mesh with a fixed set of vertices,
 * so it is only flat to the accuracy of that mesh, and a ramp sitting exactly
 * on nominal ground level leaves a hairline gap along its back edge that a
 * wheel finds every time. This is the same lesson as the kerbs, which were
 * drawn 0.12 above a collider that followed the ground and were driven
 * through for weeks.
 */
export const RAMP_BURY = 0.25

/**
 * One ramp, as a closed solid, in island-local coordinates.
 *
 * The ramp rises along its own heading, from ground level at the back to
 * `height` at the lip, and then stops dead - the lip is a cliff, not a taper,
 * because a ramp you can drive back down the far side of is a hump and not a
 * jump.
 *
 * @param {object} spec
 * @param {number} spec.x        centre of the BACK edge, island-local
 * @param {number} spec.z        centre of the BACK edge, island-local
 * @param {number} spec.heading  radians, atan2(x, z) like the rest of the map
 * @param {number} spec.length   how far it runs, back edge to lip
 * @param {number} spec.width
 * @param {number} spec.height   at the lip
 * @param {number} [spec.rise]   height at the BACK edge; 0 for a kicker, and
 *                               `height` for a landing ramp run backwards
 * @returns {{positions: number[], indices: number[], lip: {x,z,y}, angle: number}}
 */
export function wedgeSolid(spec) {
  const { x, z, heading, length, width, height } = spec
  const rise = spec.rise || 0

  // Along the heading, and across it. atan2(x, z) means heading 0 points at
  // +Z, which is the convention every other bearing in this project uses.
  const fx = Math.sin(heading)
  const fz = Math.cos(heading)
  const sx = fz
  const sz = -fx

  const half = width / 2
  const floor = COURSE_GROUND - RAMP_BURY

  // Four corners of the footprint: back-left, back-right, lip-left, lip-right.
  const at = (along, across) => ({
    x: x + fx * along + sx * across,
    z: z + fz * along + sz * across
  })
  const bl = at(0, -half)
  const br = at(0, half)
  const fl = at(length, -half)
  const fr = at(length, half)

  const backY = COURSE_GROUND + rise
  const lipY = COURSE_GROUND + height

  const positions = []
  const indices = []
  const push = (p, y) => {
    indices.push(positions.length / 3)
    positions.push(p.x, y, p.z)
  }
  // Wound counter-clockwise seen from outside. Rapier does not care - a
  // trimesh is two-sided to a ray - but Three.js does, and a ramp lit from
  // the inside is a black wedge.
  const tri = (a, ay, b, by, c, cy) => { push(a, ay); push(b, by); push(c, cy) }

  // The surface you drive on
  tri(bl, backY, br, backY, fr, lipY)
  tri(bl, backY, fr, lipY, fl, lipY)

  // The two sides, as quads split in half
  tri(bl, floor, fl, floor, fl, lipY)
  tri(bl, floor, fl, lipY, bl, backY)
  tri(br, floor, br, backY, fr, lipY)
  tri(br, floor, fr, lipY, fr, floor)

  // The cliff under the lip
  tri(fl, floor, fr, floor, fr, lipY)
  tri(fl, floor, fr, lipY, fl, lipY)

  // The back face, which is only visible when `rise` lifts it off the ground
  tri(bl, floor, bl, backY, br, backY)
  tri(bl, floor, br, backY, br, floor)

  // The floor, so the solid is closed. Without it a trimesh is a shell and a
  // vehicle hitting the lip hard enough goes inside the ramp.
  tri(bl, floor, fr, floor, fl, floor)
  tri(bl, floor, br, floor, fr, floor)

  return {
    positions,
    indices,
    lip: { x: x + fx * length, z: z + fz * length, y: lipY },
    angle: Math.atan2(height - rise, length)
  }
}

/**
 * A hump: up one side, over a crest, down the other.
 *
 * Two wedges nose to nose, which is why it is here rather than being a shape
 * of its own - a roller and the landing hill are the same object at different
 * sizes, and both are a ramp you can come off the back of.
 *
 * The landing on the big jump is a hump rather than a bare down-ramp on
 * purpose. A down-ramp's high edge is a wall facing the take-off, so coming up
 * short means hitting it; the up-face of a hump means coming up short is a
 * heavy landing you drive out of. On a course built for a child, the
 * difference between those two matters more than the realism does.
 *
 * @returns {Array<object>} wedge specs, ready for wedgeSolid()
 */
export function humpWedges({ x, z, heading, up, down, width, height }) {
  const fx = Math.sin(heading)
  const fz = Math.cos(heading)
  return [
    { x, z, heading, length: up, width, height },
    {
      // The far side, built backwards from the far end so the two meet at the
      // crest with no seam to catch a wheel on.
      x: x + fx * (up + down),
      z: z + fz * (up + down),
      heading: heading + Math.PI,
      length: down,
      width,
      height
    }
  ]
}

/**
 * A MOUND: a flat-topped hill with every side sloped, in island-local
 * coordinates.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT REPLACED ALMOST EVERY WEDGE
 * ---------------------------------------------------------------------------
 * Mike's son drove the first version of this park and the report was that most
 * of the obstacles were walls: "if I drive into them, I'm not jumping, I'm more
 * like crashing into a wall."
 *
 * He was right, and the bug is in `wedgeSolid()`. A wedge has one sloped face
 * and three vertical ones - two sides and a cliff under the lip - so it only
 * works if you hit it along its own heading. Come at it from the side, which is
 * what actually happens in an arena, and it is a kerb 3.4 units tall. A hump
 * made of two wedges has the same problem: the ends taper and the SIDES do not.
 *
 * A real Monster Jam floor is not made of wedges. It is made of mounds - dirt
 * piled into flat-topped hills, sloped on every side, which is why a truck can
 * come at one from any angle and get air off it. That is what this builds: a
 * truncated pyramid, four sloped faces meeting at four hip edges, closed top
 * and bottom.
 *
 * The three runs are separate on purpose, because a jump is not symmetrical
 * even when a mound is:
 *
 *   runIn    the face you climb, gentle
 *   runOut   the face you leave by. Short is steep is a launch.
 *   runSide  the two flanks, which nothing is meant to launch off but
 *            everything is meant to be able to drive over
 *
 * A run of zero would be a vertical face and is exactly the thing this is here
 * to prevent, so every one of them is clamped to a minimum.
 *
 * @param {object} spec
 * @param {number} spec.x        centre of the flat TOP, island-local
 * @param {number} spec.z
 * @param {number} spec.heading  radians, atan2(x, z) - the way you drive over it
 * @param {number} spec.topWidth   flat top, across the heading
 * @param {number} spec.topDepth   flat top, along the heading
 * @param {number} spec.height
 * @param {number} spec.runIn    horizontal run of the approach face
 * @param {number} spec.runOut   horizontal run of the far face
 * @param {number} spec.runSide  horizontal run of each flank
 */
export const MIN_RUN = 1.2

export function moundSolid(spec) {
  const {
    x, z, heading, topWidth, topDepth, height
  } = spec
  const runIn = Math.max(MIN_RUN, spec.runIn ?? 8)
  const runOut = Math.max(MIN_RUN, spec.runOut ?? runIn)
  const runSide = Math.max(MIN_RUN, spec.runSide ?? runIn)

  const fx = Math.sin(heading)
  const fz = Math.cos(heading)
  const sx = fz
  const sz = -fx

  const halfW = Math.max(0.5, topWidth / 2)
  const halfD = Math.max(0.5, topDepth / 2)
  // `baseY` lets a mound be built ON another mound rather than on the arena
  // floor - which is what the crush pile is. Left out, it is the floor, which
  // is what every other mound wants.
  const base = spec.baseY ?? COURSE_GROUND
  const floor = base - RAMP_BURY
  const topY = base + height

  const at = (along, across) => ({
    x: x + fx * along + sx * across,
    z: z + fz * along + sz * across
  })

  // Four base corners and four top corners. The base is the top pushed out by
  // each face's own run, so the faces are the runs and nothing else.
  const b = [
    at(-halfD - runIn, -halfW - runSide),
    at(-halfD - runIn, halfW + runSide),
    at(halfD + runOut, halfW + runSide),
    at(halfD + runOut, -halfW - runSide)
  ]
  const t = [
    at(-halfD, -halfW), at(-halfD, halfW), at(halfD, halfW), at(halfD, -halfW)
  ]

  const positions = []
  const indices = []
  const push = (p, y) => { indices.push(positions.length / 3); positions.push(p.x, y, p.z) }

  // Note the SWAP: the three corners go out in the order a, d, c, not a, c, d.
  //
  // Written the obvious way round, every triangle below comes out wound
  // clockwise seen from outside, which means it faces inwards. Rapier does not
  // care - a trimesh collides from either side, which is why the physics was
  // right while this was wrong - but three.js culls back faces by default, so
  // every mound in the arena rendered as the unlit INSIDE of its own far
  // slope. That is a black hole in a tan floor, and it survived two rounds of
  // "the mounds are invisible, make them darker" before anyone thought to
  // check the winding rather than the colour.
  const tri = (a, ay, c, cy, d, dy) => { push(a, ay); push(d, dy); push(c, cy) }

  // The four sloped faces, each as a quad in two triangles. The corners where
  // two faces meet are hips, like a hipped roof, and that is what a heap of
  // dirt actually looks like.
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4
    tri(b[i], floor, b[j], floor, t[j], topY)
    tri(b[i], floor, t[j], topY, t[i], topY)
  }

  // The flat top you land on and drive across
  tri(t[0], topY, t[1], topY, t[2], topY)
  tri(t[0], topY, t[2], topY, t[3], topY)

  // And a floor, so the solid is closed. A Rapier trimesh is an infinitely
  // thin shell; an open one is something a fast vehicle goes inside.
  tri(b[0], floor, b[3], floor, b[2], floor)
  tri(b[0], floor, b[2], floor, b[1], floor)

  return {
    positions,
    indices,
    /** The four corners of the flat top, so a caller can paint it. */
    top: t.map((p) => ({ x: p.x, z: p.z })),
    topY,
    /** The middle of the flat top - what you are aiming at. */
    crest: { x, z, y: topY },
    /** Where the far face meets the ground: the point you leave from. */
    lip: { x: x + fx * (halfD + runOut), z: z + fz * (halfD + runOut), y: COURSE_GROUND },
    /** Every face's angle, so a test can insist none of them is a wall. */
    angles: {
      in: Math.atan2(height, runIn),
      out: Math.atan2(height, runOut),
      side: Math.atan2(height, runSide)
    },
    /** Half-extents of the footprint, for keeping things off each other. */
    reach: {
      along: halfD + Math.max(runIn, runOut),
      across: halfW + runSide
    }
  }
}

/**
 * Walk a closed loop, handing back a point every `spacing` units.
 *
 * The arena's barrier, its seating tiers and its painted lines are all "a thing
 * repeated round a ring", and the ring in question is the island's own ring
 * road pushed in or out. Doing that by index into the point list does not work:
 * the ring is resampled unevenly, so a fixed number of points comes out packed
 * together on the straights and yards apart round the ends.
 *
 * A whole number of steps, so the last one meets the first cleanly rather than
 * leaving a short gap wherever the loop happens to begin. And `fraction` comes
 * back with each point, so a caller can leave a hole somewhere without counting
 * - see the arena's vehicle entrance.
 *
 * @param {Array<{x,z}>} points  a closed loop; the last point may repeat the first
 * @param {number} spacing
 * @returns {Array<{x,z,heading,fraction}>}
 */
export function walkLoop(points, spacing) {
  if (!points || points.length < 2 || !(spacing > 0)) return []

  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z)
  }
  if (!(total > spacing)) return []

  const steps = Math.max(3, Math.round(total / spacing))
  const step = total / steps

  const out = []
  let seg = 1
  let walked = 0

  for (let n = 0; n < steps; n++) {
    const want = n * step
    while (seg < points.length) {
      const a = points[seg - 1]
      const b = points[seg]
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      if (walked + len >= want || seg === points.length - 1) {
        const t = len > 0 ? (want - walked) / len : 0
        out.push({
          x: a.x + (b.x - a.x) * t,
          z: a.z + (b.z - a.z) * t,
          heading: Math.atan2(b.x - a.x, b.z - a.z),
          fraction: want / total
        })
        break
      }
      walked += len
      seg++
    }
  }

  return out
}

/**
 * A closed loop moved OUTWARD by `distance`.
 *
 * `insetPolygon()` in shapes.js does the inward half and documents itself as
 * returning a copy for anything not positive, which is a sensible contract and
 * exactly wrong for the arena: the seating tiers are the ring road pushed out,
 * not in. Passing it a negative number silently gave back the ring unchanged,
 * so five tiers of grandstand were built at five heights in the middle of the
 * road, which is a thing you notice.
 *
 * Same maths, sign flipped: offset each edge, meet the neighbours on the
 * bisector, and clamp so a needle-sharp corner does not fly off to infinity.
 * A separate function rather than a flag, so nothing that already calls
 * insetPolygon has to change.
 */
export function outsetLoop(points, distance) {
  const n = points.length
  if (n < 3 || !(distance > 0)) return points.map(p => ({ ...p }))

  // Winding, the same way shapes.js decides it.
  let area = 0
  for (let i = 0; i < n; i++) {
    const p = points[i]
    const q = points[(i + 1) % n]
    area += p.x * q.z - q.x * p.z
  }
  const sign = area > 0 ? 1 : -1

  const out = []
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]
    const cur = points[i]
    const next = points[(i + 1) % n]

    let e1x = cur.x - prev.x, e1z = cur.z - prev.z
    let e2x = next.x - cur.x, e2z = next.z - cur.z
    const l1 = Math.hypot(e1x, e1z) || 1
    const l2 = Math.hypot(e2x, e2z) || 1
    e1x /= l1; e1z /= l1
    e2x /= l2; e2z /= l2

    // OUTWARD normals - the inward ones with the sign reversed.
    const n1x = e1z * sign, n1z = -e1x * sign
    const n2x = e2z * sign, n2z = -e2x * sign

    let bx = n1x + n2x, bz = n1z + n2z
    const bl = Math.hypot(bx, bz)
    if (bl < 1e-6) {
      out.push({ x: cur.x + n1x * distance, z: cur.z + n1z * distance })
      continue
    }
    bx /= bl; bz /= bl

    // Clamped much harder than the inward version clamps, and for the opposite
    // reason. Going inward, a sharp corner's bisector runs into the middle of
    // the shape and the worst case is a fold nobody sees. Going OUTWARD it
    // shoots away from the shape: the stunt island's ring road has a sharp
    // southern tip, and at four times the offset the seating tier flew
    // thirty-seven units out to sea. Stopping at 1.8 pinches the corner
    // instead, which is a couple of overlapping boxes at the pointy end.
    const cosHalf = bx * n1x + bz * n1z
    const scale = Math.min(distance / Math.max(cosHalf, 0.56), distance * 1.8)
    out.push({ x: cur.x + bx * scale, z: cur.z + bz * scale })
  }

  return out
}

/**
 * The steepest face any mound is allowed, and the most important number in the
 * arena.
 *
 * Every obstacle here is a compromise between two things that pull opposite
 * ways: shallow enough that the SLOWEST vehicle in the game can drive up it
 * from any direction, and steep enough that going over it throws you in the
 * air. The first version of this arena guessed, guessed shallow, and produced
 * a brown field with some gentle rises in it.
 *
 * So it was measured. A row of three-unit mounds at increasing face angle,
 * built with the game's own builder at runtime, driven at from a standing
 * start thirty-four units back on the speedway's flat infield:
 *
 *     face    monster truck (14)          saloon (18)
 *     ----    ------------------------    ------------------------
 *     20      over, peak 4.3              over, peak 4.9
 *     26      over, peak 6.4, flew 21     over, peak 7.8, flew 28
 *     32      STOPPED                     over, peak 10.2
 *     38      STOPPED                     STOPPED
 *
 * Twenty-six degrees is a real jump - six and a half units of height off a
 * three-unit mound - and the truck clears it comfortably. Thirty-two stops the
 * truck dead. So the limit is 26, with nothing built anywhere near it by
 * accident: `tests/race.mjs` checks every face of every mound against this.
 *
 * The reason a slope can stop a vehicle at all is that every chassis here is an
 * axis-aligned box with its pitch locked (see Physics.createVehicleChassis), so
 * it does not tip onto a slope, it has to be lifted bodily up it - and how much
 * lift the solver finds per frame goes with the approach speed. Which means the
 * slowest vehicle in the world hits the ceiling first. On a monster truck
 * course. There is no way round that except to measure it and stay under it.
 */
export const MAX_FACE = 26 * Math.PI / 180

/** The face angle everything is actually built at, with a little in hand. */
export const FACE = 25 * Math.PI / 180

/** The horizontal run a face of `height` needs to come out at FACE. */
export function faceRun(height) {
  return height / Math.tan(FACE)
}

/**
 * Where a vehicle leaving a ramp lands, on flat ground, ignoring air control.
 *
 * A sanity check rather than a simulation: the game's own physics is what
 * decides, and the numbers in STUNT_COURSE were measured in the running game
 * rather than solved from here. This exists so a test can say "the landing is
 * roughly where the monster truck comes down" without launching a browser, and
 * so that changing a ramp's height in this file and forgetting to move the
 * landing shows up as a failure rather than as a bad afternoon.
 *
 * Vertical launch speed is taken as the speed along the ramp face resolved
 * upward - v * sin(angle) - which is what a body sliding up a wedge and off
 * the end actually has.
 *
 * @param {number} speed    horizontal speed at the lip
 * @param {number} angle    ramp angle in radians, from wedgeSolid()
 * @param {number} lipY     height of the lip above the ground it lands on
 * @param {number} [g]      gravity, 9.81 to match Physics.js
 */
export function flightRange(speed, angle, lipY, g = 9.81) {
  const vy = speed * Math.sin(angle)
  const vx = speed * Math.cos(angle)
  // Solve lipY + vy*t - g*t^2/2 = 0 for the positive root.
  const disc = vy * vy + 2 * g * lipY
  const t = (vy + Math.sqrt(Math.max(0, disc))) / g
  return { time: t, distance: vx * t, apex: lipY + (vy * vy) / (2 * g) }
}

// ---------------------------------------------------------------------------
// THE STUNT PARK
// ---------------------------------------------------------------------------
// Island `stunt`: 'long', radius 72. The ring road runs round the outside, and
// inside it is a teardrop of open ground about 135 units north to south and 52
// across at its widest - which is a Monster Jam arena floor, near enough.
//
// ---------------------------------------------------------------------------
// WHAT THE FIRST VERSION GOT WRONG
// ---------------------------------------------------------------------------
// It was built out of wedges and humps, and Mike's son found the flaw in about
// a minute: "if I drive into them, I'm not jumping, I'm more like crashing into
// a wall." A wedge has ONE sloped face. Its two flanks and the cliff under its
// lip are vertical, so unless you arrive along its heading it is a three-metre
// kerb - and in an arena you arrive from wherever you happen to be.
//
// So almost everything here is now a MOUND: a flat-topped hill of dirt with
// every face sloped, which is what a real arena floor is actually made of. See
// moundSolid(). You can hit any of them from any direction and get air off it.
//
// The one thing that is still asymmetric is the big double's take-off, whose
// far face is deliberately short and steep, because that is what a launch is.
// Even that is 35 degrees rather than vertical - a wall you can ride up the
// back of is a mistake you recover from.
//
// ---------------------------------------------------------------------------
// AND WHAT IS STILL TRUE ABOUT THE MONSTER TRUCK
// ---------------------------------------------------------------------------
// The original brief said jumps only the monster truck can do. The first
// attempt gated that on steering in mid-air, which worked and which nobody
// asked for; it also forced the whole floor into a shape that suited the gate
// rather than the driving.
//
// The gate now is simpler and it is the one a real arena uses: THE DOUBLE IS
// SIZED FOR THE TRUCK. Take-off, gap, landing - and the landing is where a
// vehicle doing 14 comes down. Everything else in the fleet is faster, so
// everything else sails over the landing and comes down on the floor beyond
// it. Too far is as much a miss as too short, which is why this works where
// "a gap too wide to clear" did not: that one favoured whoever was quickest,
// and the truck is the slowest thing in the world.
//
// The rest of the floor is for everybody. A child in a saloon should be able
// to drive in here and get air off every mound in the place, and does.

/**
 * How far inside the ring road the arena floor starts.
 *
 * The floor is cut from the RING ROAD's own polygon rather than being a
 * rectangle, and that is worth the trouble: a rectangle big enough to hold the
 * course pokes out past the ring at the island's narrow ends and lies across
 * the beach, which from above reads as a brown slab dropped on an island.
 */
export const STUNT_PAD_INSET = 5

/**
 * The white racing oval painted on the dirt.
 *
 * Every Monster Jam floor has one and it is doing a job: it is the line the
 * racing runs on, and it makes an otherwise featureless brown oval read as a
 * place with a direction. Two of them, an outer and an inner, because that is
 * what the reference shows and because one line reads as an edge while two
 * read as a track.
 */
export const STUNT_LINE_OUTER = 9
export const STUNT_LINE_INNER = 20
export const STUNT_LINE_WIDTH = 0.8

/**
 * The padded barrier round the floor, and the gap you drive in through.
 *
 * Waist high and soft-looking, in the red of the reference. It is a real
 * collider: without one, the interesting half of the arena is "how do I get
 * back on the floor after overshooting".
 */
export const ARENA_BARRIER = {
  inset: 2.5,
  height: 2.2,
  thickness: 1.4,
  blockLength: 6,
  gap: 2.6
}

/**
 * The stands, outside the ring road, between the track and the beach.
 *
 * Four tiers stepping up and outward. They go all the way round because Mike
 * asked for the full arena, and because the island is long and thin - stands
 * down one side only would read as a bus shelter.
 */
/**
 * The grandstand, and why it is the size it is.
 *
 * Mike: "I also want the monster truck stadium bigger so I can feel like it's
 * a real stadium." Four tiers of 1.5 is six units of seating - a school sports
 * pavilion. Eight tiers of 1.7 is 13.6, which is a wall of people you have to
 * look UP at from the floor, and that change of eye line is most of what makes
 * somewhere feel like a stadium rather than a field with benches round it.
 *
 * The stands are built by pushing the ring road outward, so they got wider for
 * free when the island did - see the `stretch` on the stunt island in
 * mapData.js. What could not come for free is height, because height is the
 * bit you feel.
 *
 * The outermost tiers stand over water on piles, which is deliberate and was
 * already true at four: the arena floor is the scarce thing on this island and
 * a stand cantilevered out on piles keeps all of the floor as floor.
 */
export const ARENA_STANDS = {
  tiers: 8,
  rise: 1.7,
  tread: 2.6,
  /** Clear of the ring road's kerb, and stopping short of the beach. */
  fromRing: 5.5,
  /** How wide a gap to leave where the bridge road comes ashore. */
  entranceGap: 26,
  /** A roof over the back rows, which is what encloses it. */
  roof: { from: 5, depth: 9, above: 5.5, thickness: 0.6 }
}

/** Floodlight towers, as fractions round the arena. */
export const ARENA_LIGHTS = {
  at: [0.08, 0.3, 0.55, 0.8],
  // Tall enough to clear the roof of an eight-tier stand and still read as
  // floodlights rather than street lamps.
  height: 34,
  lamps: 8
}

/**
 * THE DOUBLE. The signature jump, and the biggest thing on the floor.
 *
 * Runs NORTH, up the widest part of the island: you come off the bridge on the
 * south-west, cross the floor past the tabletop, and meet this at the far end,
 * which is the right order to meet it in.
 *
 * Both halves have 25-degree faces on all four sides like everything else here
 * - the take-off is not a ramp with a cliff behind it. It is four units high
 * against the roller's two, and that is what makes it the big one. See
 * MAX_FACE for why 25 and not 35.
 */
/**
 * What the three vehicles actually do off the double. MEASURED, in the running
 * game, with `probe/double.mjs`.
 *
 * RE-MEASURED after pitch and roll were unlocked. That mattered more than it
 * sounds: a car that pitches nose-up as it climbs the ramp leaves the crest
 * with its velocity tilted further from the horizontal, so the truck's flight
 * went from a flat 16.2 to a median 18.2 and it now reaches the landing's flat
 * top on a good run instead of always arriving on its face. Nothing was
 * re-tuned to achieve that; it fell out of the physics, which is the argument
 * for having done it in the physics.
 *
 * The single most useful thing this table says is that the ENTRY SPEED DOES
 * NOT MATTER. Every vehicle was launched at the near foot at 10, 14, 18, 22,
 * 26 and 30, and every one of them left the crest at its own top speed to
 * within a tenth: the mound is eleven units of climb, which is long enough for
 * the throttle to win. So the jump is gated by which vehicle you picked, which
 * is the whole point of having picked one.
 *
 *   vehicle   leaves the crest at   peak y   flight        comes down on
 *   monster           14.0           7.5      16.1 - 20.8   the landing, face or top
 *   saloon            17.9           9.0      32.1 - 35.9   past it, on the floor
 *   racing car        27.8          13.0      -             clears the arena entirely
 *
 * The SPREAD is new and is not noise: the truck's flight varies by four units
 * run to run because how much it pitches depends on exactly where on the face
 * it picks up the slope. A locked chassis gave the same answer every time,
 * which is repeatable and lifeless.
 *
 * The racing car really does fly out of the park and into the sea; the barrier
 * is 2.2 high and the car is thirteen units up as it goes over. That is a
 * drowning, and Vehicle.js respawns from one, so it is a joke rather than a
 * bug - but it is a deliberate joke and this is where it is written down.
 */
export const MEASURED_DOUBLE = {
  monster: { lipSpeed: 14.0, peak: 7.5, flight: 18.2, landsAt: 40.3,
             flightRange: [16.1, 20.8] },
  sedan: { lipSpeed: 17.9, peak: 9.0, flight: 34.4, landsAt: 56.3,
           flightRange: [32.1, 35.9] },
  race: { lipSpeed: 27.8, peak: 13.0, flight: null, landsAt: null }
}

export const STUNT_DOUBLE = {
  takeOff: {
    x: 1, z: 21.7, heading: 0,
    topWidth: 13, topDepth: 5, height: 4,
    runIn: 8.58, runOut: 8.58, runSide: 8.58
  },
  /**
   * The landing, placed where the truck comes down and nowhere else.
   *
   * Measured in the running game off the take-off above - see the table on
   * `MEASURED_DOUBLE` and section 4 of tests/race.mjs. The crest sits at the
   * monster truck's distance, so the truck lands on top of it and everything
   * faster clears the whole mound and comes down on the floor past it.
   */
  landing: {
    x: -1.6, z: 44.7, heading: 0,
    topWidth: 16, topDepth: 6, height: 3,
    runIn: 6.43, runOut: 6.43, runSide: 6.43
  }
}

export const MOUND_PAINT = ['red', 'blue']

export const STUNT_MOUNDS = [
  // North to south, in the order you meet them driving down the island, and
  // getting bigger as you go. Every run is faceRun(height), so every face is
  // 25 degrees and every one of them is a jump you can take from any side -
  // see MAX_FACE for the measurements that number came from.
  //
  // SIX obstacles, not the dozen the reference arenas have, and that is the
  // island rather than a lack of ambition. A mound with 25-degree faces is
  // about twice as wide as it is tall plus its flat top, so the double's
  // take-off is 30 across by 22 deep - and the floor here is 128 long by 54
  // across at its widest, narrowing to twelve at the northern tip. Two of
  // these side by side does not fit anywhere, which tests/race.mjs says out
  // loud rather than leaving it to be discovered by driving into a mound
  // half-buried in the barrier.
  //
  // The positions are not hand-picked either. They come from a solver run
  // against three constraints - inside the barrier, clear of the monorail
  // piers, and 2.5 units clear of each other on a separating-axis test - and
  // tests/race.mjs re-checks all three, so moving one by hand is a failing
  // test rather than a quiet overlap.
  { name: 'roller', x: -3.4, z: -60.9, heading: 0,
    topWidth: 9, topDepth: 4, height: 2.2,
    runIn: 4.72, runOut: 4.72, runSide: 4.72 },

  // The crush pile: a mound with wrecks on top, which is the one thing a
  // monster truck is unambiguously for.
  { name: 'crush pile', x: -2, z: -41.8, heading: 0.209, crush: 3,
    topWidth: 8, topDepth: 6, height: 2.4,
    runIn: 5.15, runOut: 5.15, runSide: 5.15 },

  // Moved 7.5 west and a shade north when the island was widened for the
  // bigger stadium: the monorail beam crosses in world coordinates, so a wider
  // island meets it in a different place and the middle pier ended up inside
  // this mound. See tools/solveCourse.mjs.
  { name: 'step', x: -12, z: -22, heading: 0,
    topWidth: 10, topDepth: 4, height: 2.6,
    runIn: 5.58, runOut: 5.58, runSide: 5.58 },

  // Off to the east, because a monorail pier stands at (-4.5, -6.5) and the
  // spine cannot go through it. `monorail: false` on this island keeps a
  // STATION off, not the railway - the beam still crosses the arena on the
  // diagonal x + z = -11, on three piers, and everything here is placed round
  // them.
  { name: 'tabletop', x: 11.9, z: -3, heading: 0.14,
    topWidth: 12, topDepth: 6, height: 3,
    runIn: 6.43, runOut: 6.43, runSide: 6.43 }
]

/**
 * The crush pile: a RAMP made of wrecks, not three cars parked on a mound.
 *
 * Mike, having driven it: "the monster truck stadium has these vehicles that I
 * think we're supposed to drive over, but because it uses the in-game vehicle
 * model, I am unable to do anything with the cars. These are just essentially
 * worthless car assets placed in the game."
 *
 * He was right twice over. The wrecks were built by `buildTrafficVehicle()`,
 * so they were showroom cars sitting upright on a jump, and each one had a
 * BOX collider round it - a 1.1-high vertical wall at the top of a slope. Drive
 * at it and you stop. That is the same class of mistake as the original wedge
 * obstacles: a thing that looks like it should be jumped and behaves like a
 * kerb.
 *
 * So the pile is now a mound in its own right. One trimesh with 25-degree
 * faces - the measured limit, see MAX_FACE - laid over the top of the mound it
 * sits on, and the wrecks are decoration half-buried in it with NO collider at
 * all. You drive up the mound, up the wrecks, and off the far side.
 */
export const CRUSH_PILE = {
  /** How far above the parent mound's crest the wrecks stand. */
  height: 0.9,
  /** The flat bit on top, across and along. Wide enough to land on. */
  topWidth: 4.0,
  topDepth: 2.0
}

/**
 * Does a crush ramp fit on the mound it is built on?
 *
 * It has to, and the first version did not: at 1.15 high with a 5.2 by 3.4
 * top its footprint reached 5.1 across against the parent mound's flat top of
 * 4, so its buried lower edge hung in the air over the parent's SLOPE and the
 * two trimeshes crossed. Driving into that seam threw the monster truck
 * twenty-one units into the sky, which is a spectacular way to find out.
 *
 * Exported so tests/race.mjs can insist on it rather than trusting the numbers
 * above to stay compatible with the mound they sit on.
 */
export function crushFitsOn(spec) {
  const run = faceRun(CRUSH_PILE.height)
  const acrossNeeded = CRUSH_PILE.topWidth / 2 + run
  const alongNeeded = CRUSH_PILE.topDepth / 2 + run
  return {
    acrossNeeded,
    alongNeeded,
    acrossHave: spec.topWidth / 2,
    alongHave: spec.topDepth / 2,
    fits: acrossNeeded <= spec.topWidth / 2 && alongNeeded <= spec.topDepth / 2
  }
}

/**
 * The ramp over a crush pile, as a solid. Same builder as every other mound,
 * which is the point: it inherits the 25-degree faces and the closed shell,
 * and it cannot drift away from them.
 */
export function crushSolid(spec, crestY) {
  const run = faceRun(CRUSH_PILE.height)
  return moundSolid({
    x: spec.x,
    z: spec.z,
    heading: spec.heading,
    topWidth: CRUSH_PILE.topWidth,
    topDepth: CRUSH_PILE.topDepth,
    height: CRUSH_PILE.height,
    runIn: run,
    runOut: run,
    runSide: run,
    // Built ON TOP of the mound it decorates rather than on the arena floor.
    baseY: crestY
  })
}

/** Everything on the stunt island, in the order World.js should build it. */
export const STUNT_COURSE = {
  padInset: STUNT_PAD_INSET,
  mounds: STUNT_MOUNDS,
  double: STUNT_DOUBLE,
  barrier: ARENA_BARRIER,
  stands: ARENA_STANDS,
  lights: ARENA_LIGHTS,
  line: {
    outer: STUNT_LINE_OUTER,
    inner: STUNT_LINE_INNER,
    width: STUNT_LINE_WIDTH
  }
}

// ---------------------------------------------------------------------------
// THE SPEEDWAY
// ---------------------------------------------------------------------------
// Island `speedway`: 'wide', radius 76, about 200 across and 76 deep. Its ring
// road is a 160 x 61 oval, 380 units round, and THAT IS THE CIRCUIT - it is
// already the right shape, it is already a proper road with kerbs and a
// flattened corridor under it, and being a real road is what keeps the bridge
// joined to the network. `noTraffic` on the island is what keeps the public
// off it.
//
// At 380 units a lap, and a racing car that averages something over twenty
// once the corners are taken into account, ten laps is about three minutes.

/**
 * A point, and which way you are facing, a fraction of the way round a loop.
 *
 * Walked rather than interpolated between vertices, because the ring road is
 * resampled at uneven spacing and "a quarter of the way through the point
 * list" is not "a quarter of the way round" on a shape with corners.
 *
 * @param {Array<{x,z}>} ring   a closed path, first point repeated at the end
 * @param {number} fraction     0 to 1
 */
export function pointAlongRing(ring, fraction) {
  if (!ring || ring.length < 2) return null

  let total = 0
  for (let i = 1; i < ring.length; i++) {
    total += Math.hypot(ring[i].x - ring[i - 1].x, ring[i].z - ring[i - 1].z)
  }
  if (!(total > 0)) return null

  let want = total * Math.max(0, Math.min(1, fraction))
  for (let i = 1; i < ring.length; i++) {
    const dx = ring[i].x - ring[i - 1].x
    const dz = ring[i].z - ring[i - 1].z
    const step = Math.hypot(dx, dz)
    if (step <= 0) continue
    if (want <= step) {
      const t = want / step
      return {
        x: ring[i - 1].x + dx * t,
        z: ring[i - 1].z + dz * t,
        heading: Math.atan2(dx, dz),
        along: total * fraction,
        total
      }
    }
    want -= step
  }

  const last = ring[ring.length - 1]
  return { x: last.x, z: last.z, heading: 0, along: total, total }
}

/** How many laps wins it. From the brief. */
/**
 * How wide a hole to leave in the circuit's furniture where a bridge lands.
 *
 * The approach road is DEFAULT_ROAD_WIDTH (7) and it arrives at a junction
 * with traffic lights and a zebra crossing already painted across the
 * circuit - all of which the first version of the armco was built straight
 * over, walling the track off from the only way onto it.
 *
 * 16 rather than 7: the barrier is a chunky thing on both sides of the road,
 * and a gap exactly as wide as the tarmac is a gap you clip on the way in.
 */
export const CIRCUIT_GATE = 16

export const RACE_LAPS = 10

/** How many cars come out of the garage, not counting the player. */
export const RACE_FIELD = 5

/**
 * Where the start/finish line sits, as a fraction along the circuit.
 *
 * On the long southern straight rather than at the bridge junction: a grid of
 * six cars is about 40 units of road and it wants to be somewhere with nothing
 * else going on.
 */
export const RACE_LINE_AT = 0.25

/**
 * Grid geometry: two columns, staggered, the way a real one is set out.
 *
 * The column offset went from 1.7 to 3.1 when the circuit was widened from
 * seven units to thirteen. It has to: the two columns sit either side of the
 * centre line, and on a seven-unit road 1.7 was as far apart as they could be
 * without a car hanging off the tarmac. Left where it was, a wider track would
 * have had six cars huddled down the middle of it.
 */
export const GRID_ROW_GAP = 7.5
export const GRID_COLUMN_OFFSET = 3.1
export const GRID_STAGGER = 3.5

/**
 * Where everything alongside the main straight stands, measured out from the
 * middle of the track.
 *
 * ALL OF IT DERIVED FROM THE TRACK'S OWN WIDTH, and that is the entire point
 * of this function existing. The pit wall used to be a literal 5.5 in
 * World.js, which was correct while the circuit was seven units wide - the
 * tarmac ended at 3.5 and the wall began at 4.4, so there was a metre of
 * run-off. Widening the circuit to thirteen moved the tarmac's edge out to
 * 6.5 and left the wall exactly where it was: a solid static collider standing
 * two units INSIDE the racing line, which is a wall you hit on lap one.
 *
 * Nothing here is a literal offset from the centre. Everything is stacked
 * outward from the edge of the tarmac, each item clearing the one in front of
 * it, so the next person to change the track's width gets a circuit that moves
 * with it instead of a circuit with furniture in the middle of it.
 *
 *   edge ─┬─ RUN_OFF ─┬─ gantry leg ─┬─ pit wall ─┬─ seating tiers ─┬─ roof
 *
 * Depths are the half-widths of the boxes World.js builds, so `near` and `far`
 * are the faces, not the centres, and two neighbours overlapping is something
 * a test can see rather than something you find by driving into it.
 */
export const RUN_OFF = 1.1

export function pitStraightPlan(trackWidth) {
  const edge = trackWidth / 2

  // The gantry straddles the track, so its legs stand just past the run-off.
  const legDepth = 0.6
  const legAt = edge + RUN_OFF + legDepth

  // The pit wall clears the legs, not the tarmac - it is the taller thing and
  // it is what a car actually hits.
  const wallDepth = 1.1
  const wallAt = legAt + legDepth + 0.5 + wallDepth

  // Seating rises away behind the wall, each tier further out and higher.
  const tierDepth = 1.2
  const tierStep = 2.4
  const tierAt = wallAt + wallDepth + 0.6 + tierDepth

  // And a roof over the middle of the seating rather than over the front row.
  const tiers = 4
  const roofAt = tierAt + tierStep * (tiers - 1) / 2 + 0.6
  const roofDepth = 5.5

  return {
    edge,
    // Two legs, span apart, centred on the track.
    gantrySpan: legAt * 2,
    legDepth,
    wallAt,
    wallDepth,
    tiers,
    tierAt,
    tierStep,
    tierDepth,
    roofAt,
    roofDepth,
    propAt: roofAt + roofDepth - 1,
    // Everything in one list, near face to far face, for the test that says
    // none of it is on the track and none of it is inside anything else.
    spans: [
      ['gantry leg', legAt - legDepth, legAt + legDepth],
      ['pit wall', wallAt - wallDepth, wallAt + wallDepth],
      ['front tier', tierAt - tierDepth, tierAt + tierDepth],
      ['back tier', tierAt + tierStep * (tiers - 1) - tierDepth,
        tierAt + tierStep * (tiers - 1) + tierDepth]
    ]
  }
}

/**
 * The starting lights, in the order they show and how long each holds.
 *
 * Red, then amber, then green and go. Held long enough to be read by somebody
 * who is six: a real Formula One start is four to seven seconds of red and
 * then an unpredictable pause, which is thrilling for an adult and simply
 * confusing if you have not been told the rules.
 */
export const RACE_LIGHTS = [
  { colour: 'red', hold: 2.5 },
  { colour: 'amber', hold: 2 },
  { colour: 'green', hold: 1.5 }
]

/** How long the whole light sequence takes. */
export const RACE_COUNTDOWN = RACE_LIGHTS.reduce((s, l) => s + l.hold, 0)

/**
 * Which light is showing at a given moment of the countdown.
 * Returns null before it starts and 'green' once it is over.
 */
export function lightAt(elapsed) {
  if (elapsed < 0) return null
  let t = 0
  for (const light of RACE_LIGHTS) {
    t += light.hold
    if (elapsed < t) return light.colour
  }
  return 'green'
}
