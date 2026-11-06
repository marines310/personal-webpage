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

// ---------------------------------------------------------------------------
// THE OPEN GROUND
// ---------------------------------------------------------------------------
// Island `stunt`: 'long', radius 72, stretched to 104 x 198. The ring road runs
// round the outside and the bridge joins it; `noTraffic` keeps the public off.
//
// It was the monster truck stadium - mounds, a double jump, crush cars, a
// barrier, two banks of seating with a roof, floodlights, and four hundred
// lines in this file describing where every one of them went and why. Mike,
// 6 November 2026: "Too small and too cluttered. Maybe the stadium can just
// go." It has, all of it, and the island is the flat open space he had asked
// for separately: somewhere to do donuts and wheelies without hitting
// anything. The island cannot grow - it is wedged between ABOUT and PROJECTS
// with six units of water to one side - so clearing it is the only way to
// make it bigger.
//
// Two things from the stadium are worth remembering, and they are in the
// history rather than here:
//
//   - Every chassis is an axis-aligned box whose pitch is held by a spring, so
//     a slope does not tip a vehicle, it has to lift it bodily. Measured, 26
//     degrees was the steepest face the slowest vehicle could climb. Anything
//     built on this ground that is not flat should know that.
//   - The monorail beam crosses this island, and `tests/monorail.mjs` used to
//     check that the grandstand left a hole for it. There is no grandstand,
//     so nothing on this island may be taller than the beam's underside.

/**
 * How far the floor stops short of the ring road, in units.
 *
 * Smaller than the arena's STUNT_PAD_INSET of 5: there is no barrier or
 * seating to leave room for any more, so the dirt runs almost to the kerb.
 * Not zero, because the ring road has a kerb and a verge of its own and the
 * floor is drawn a hair above the ground - overlap them and they z-fight.
 */
export const OPEN_GROUND_INSET = 2

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
