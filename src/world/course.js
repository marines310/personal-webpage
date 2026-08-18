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
// Island `stunt`: 'long', radius 72, so about 75 across and 190 down the Z
// axis. The ring road runs round the outside at roughly x +-30, z -84..71, and
// the bridge approach comes in from the south-west and ends at (0, 0). So the
// entrance is the middle of the island and there are two arms to work with:
// 84 units of it to the south and 71 to the north.
//
// The south arm is longer, so it gets the big jump, which needs a run-up.
// The north arm gets everything a saloon can also enjoy - there is no point
// building a park a child can only use with one of the three vehicles.

/**
 * How far inside the ring road the hardstanding starts.
 *
 * The pad is cut from the RING ROAD's own polygon rather than being a
 * rectangle, and that is worth the trouble. A rectangle big enough to hold the
 * course pokes out past the ring at the island's narrow ends and lies across
 * the beach - which is what the first version did, and from above it read as a
 * brown slab dropped on an island rather than as a surface belonging to it.
 * Taking the ring and pulling it inwards gives a shape that fits by
 * construction, whatever shape the island turns out to be.
 *
 * Half a road width plus a bit: enough that the pad stops at the kerb rather
 * than running under the tarmac.
 */
export const STUNT_PAD_INSET = 5

/**
 * The scrapyard: two short rows of wrecks down the western side of the park.
 *
 * Scenery, and it earns its place twice. It is what makes the park read as a
 * stunt park from the bridge rather than as a brown field with some ramps on
 * it, and it is made from the fleet's own vehicle builders - so the wrecks
 * are the cars you have spent all session driving past, which is worth far
 * more than any amount of bespoke geometry.
 *
 * NOT in the big jump's run-out, where the first draft put it. That version
 * had the wrecks straight ahead of the lip so anything that could not steer
 * in the air crashed into them, which is a lovely idea and does not fit: the
 * gate turns on how far sideways the truck can go, which is about eight units,
 * and there is no way to put a fifteen-wide landing and a twelve-wide crash
 * zone either side of an eight-unit line. Something had to go, and the
 * scrapyard is the piece that works just as well somewhere else.
 */
export const STUNT_SCRAP = {
  x: -16, z: 4, spacing: 6.2, rows: 2, rowGap: 6.5, perRow: 3
}

/**
 * The rollers: a washboard on the way north out of the entrance.
 *
 * Low and close together on purpose. They are the first thing you meet, they
 * are impossible to fail, and they teach the one thing the park is about -
 * that going over something at speed lifts you off the ground.
 */
export const STUNT_ROLLERS = {
  from: 6, spacing: 6, count: 5, width: 16, height: 0.75, length: 3.2
}

/**
 * The tabletop: up, flat, down. The jump everybody can do.
 *
 * Flat-topped rather than a gap, so failing it costs nothing - come up short
 * and you land on the table instead of in the hole. That is what a tabletop is
 * for on a real track and it is why it comes before the big one here.
 */
export const STUNT_TABLETOP = {
  z: 36, up: 7, top: 8, down: 7, width: 18, height: 1.9
}

/**
 * THE SIDEWINDER. The one the brief asked for.
 *
 * Launch straight down the park to the south; land twenty units to the left of
 * where you were pointing. See the note at the top of this file for why the
 * gate is sideways rather than long: the monster truck is the slowest vehicle
 * in the game and would lose any contest about distance. What it has is
 * `airControl: 1`.
 *
 * `landingOffset` is negative - the landing ramp is to the WEST - and it is a
 * touch under half the flight, which is a lot to ask of a vehicle that cannot
 * steer at all in the air and nothing at all to ask of one that can.
 */
export const STUNT_BIG_JUMP = {
  /**
   * The kicker. Heading south, which is atan2(0, -1) = pi.
   *
   * At x +6 rather than on the centre line, and that is not cosmetic: a
   * monorail pier stands at (-4.5, -6.5) on this island. The beam is a loop
   * through the six islands that DO have stations, and it passes over both
   * courses on its way between them - `monorail: false` keeps a station off
   * the island, not the railway. Piers already slide along the beam to avoid
   * ROADS (see getMonorailPiers), which is why the speedway's circuit is
   * clear, but a stunt park's run-up is not a road and nothing was looking
   * out for it. Six units east puts the whole approach clear of the column.
   *
   * 3.4 up over 14 along is 13.6 degrees, and the SHALLOWNESS is measured
   * rather than chosen. The first version was 4.5 over 12 - a shade over 20
   * degrees - and the monster truck could not climb it at its own top speed of
   * 14. It could with boost, at 16.1, and the saloon walked up it at 18, which
   * is a jump that works for everybody except the vehicle it was built for.
   *
   * The cause is the chassis. Every vehicle here is an axis-aligned box with
   * its pitch locked (see Physics.createVehicleChassis), so it does not tip
   * onto a slope, it has to be lifted bodily up it - and how much lift the
   * solver can find per frame goes with the approach speed. The slowest
   * vehicle in the game therefore hits the steepest wall it can climb first.
   * Nothing else in the world had ever asked the question, because until the
   * courses nothing in the world was steeper than a 25% hill.
   *
   * At 13.6 degrees the truck clears it at 14 with nothing held down.
   * Everything else overshoots, and the faster it is the further it goes:
   * roughly 16 units for the truck, 47 for a boosting saloon and 72 for a
   * boosting racing car, which is out past the ring road and into the sea.
   * That is not a bug. It is the joke, and it is the clearest possible
   * statement about which vehicle this was built for.
   */
  takeOff: { x: 6, z: -24, heading: Math.PI, length: 14, width: 11, height: 3.4 },

  /**
   * The landing, and every number in it is a MEASUREMENT.
   *
   * Six runs down this ramp in the running game, holding full left from the
   * frame the wheels left the lip, every one of them identical except for the
   * vehicle:
   *
   *     monster                 10.5 forward,  -7.8 sideways -> ( -2.2, -46.9)
   *     monster + boost         11.2 forward, -10.4 sideways -> ( -4.8, -47.5)
   *     monster + boost, no steer  21.0,        -0.2         -> (  5.4, -57.4)
   *     saloon                  23.6,           -0.3         -> (  5.0, -61.0)
   *     saloon + boost          50.8,           -0.7         -> (  4.8, -89.0)
   *     racing car              40.6,          -19.0         -> (-13.3, -78.8)
   *
   * Everything launches from x +6, so "sideways" is how far each one moved off
   * that line. The landing spans x -15.5 to +1.5 and z -43 to -62. The truck
   * lands inside it on both axes with several units to spare; the saloon
   * misses by five across; the racing car gets ACROSS far enough - twenty
   * units, more than the truck manages, because a quarter of the authority
   * applied for three times as long is still a lot - and misses by fifteen
   * DOWN the park instead. Hence a landing placed on both axes rather than
   * one: no single measurement separates all three.
   *
   * Read the sideways column. The truck moves eight to twelve units across;
   * the saloon moves two tenths of one, holding exactly the same key, because
   * `airControl: 0` means its velocity in the air is the velocity it took off
   * with and nothing can change it. That is the gate, and it is enforced by
   * the physics rather than announced by a rule.
   *
   * The racing car is the interesting one: it reaches FURTHER across than the
   * truck - a quarter of the authority, but three times as long in the air to
   * use it. So the landing is placed on BOTH axes. The truck comes down at
   * about z -51; the racing car is still thirty units short of the ground
   * there and lands at -82, out past the ring road.
   *
   * A hump rather than a down-ramp, so coming up short is a bang and not a
   * wall - see humpWedges(). The crest is at z -52, a unit beyond where the
   * truck actually arrives, so the common error is landing on the up-face,
   * which costs speed and nothing else.
   */
  landing: {
    x: -7, z: -43, heading: Math.PI, up: 9, down: 10, width: 17, height: 2.6
  },

}

/** Everything on the stunt island, in the order World.js should build it. */
export const STUNT_COURSE = {
  padInset: STUNT_PAD_INSET,
  rollers: STUNT_ROLLERS,
  tabletop: STUNT_TABLETOP,
  bigJump: STUNT_BIG_JUMP,
  scrap: STUNT_SCRAP,
  /**
   * Nothing at the north end but room to turn round. The pad follows the ring
   * road's own outline, so the ends of the island are already open ground -
   * there is no need to draw a turning circle on top of a turning circle.
   */
  turnaround: null
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

/** Grid geometry: two columns, staggered, the way a real one is set out. */
export const GRID_ROW_GAP = 7.5
export const GRID_COLUMN_OFFSET = 1.7
export const GRID_STAGGER = 3.5

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
