/**
 * The shapes vehicles are made of.
 *
 * Pure arithmetic, no THREE, for the usual reason: a car body is a loft
 * through four cross-sections and that is something you can be wrong about on
 * a command line. World.js turns what comes out of here into BufferGeometry
 * and colliders; nothing in this file knows what a mesh is.
 *
 * WHY THIS EXISTS AT ALL. Every vehicle in the fleet was a stack of
 * axis-aligned boxes, and Mike's note was that they look "too boxy". They
 * were: a saloon was one 4.4-long box with a smaller box on top, so it had
 * vertical sides, square corners, a flat bonnet and a roof the same width as
 * the sills. Nothing about that is a car except the proportions.
 *
 * The fix is not more boxes. It is ONE primitive that boxes cannot do -
 * `loftSolid()`, which sweeps a rectangle of changing width and changing top
 * and bottom height along the vehicle's length. That single change gives, for
 * free: a bonnet that slopes down to the nose, a roof narrower than the
 * shoulders, tapered overhangs, a wedge-shaped racing car and a bus with a
 * rounded-off front. Everything else here is trim on top of it.
 */

/**
 * Sweep a rectangle along Z, letting its width and its top and bottom edges
 * move as it goes.
 *
 * `sections` is a list of `{ z, halfWidth, yBottom, yTop }` in increasing z.
 * Each pair of neighbours becomes a four-sided tube segment - floor, roof and
 * two flanks - and the two ends are capped, so what comes back is a closed
 * solid. Closed matters even for something only ever drawn: an open shell
 * flat-shades wrongly at the seam, and if a body is ever used as a collider
 * a Rapier trimesh is an infinitely thin surface a fast car goes inside.
 *
 * A section may also carry `xShift`, which slides it sideways - used for
 * nothing yet, and there because a cab set off-centre is the one thing this
 * primitive cannot otherwise express.
 *
 * Returns `{ positions, indices, sections }` with positions in a flat array
 * of world-ish local coordinates: x across, y up, z along, origin at the
 * vehicle's centre with the wheels standing on y = 0.
 */
export function loftSolid(sections) {
  const positions = []
  const indices = []

  const push = (x, y, z) => {
    indices.push(positions.length / 3)
    positions.push(x, y, z)
  }
  // a, b, c wound so the face points along its own outward normal. Every
  // caller below lists its corners anticlockwise seen from OUTSIDE.
  const tri = (a, b, c) => { push(...a); push(...b); push(...c) }
  const quad = (a, b, c, d) => { tri(a, b, c); tri(a, c, d) }

  // The four corners of one section, in a fixed order: 0 left-bottom,
  // 1 right-bottom, 2 right-top, 3 left-top. Left is -x.
  const corners = (s) => {
    const dx = s.xShift || 0
    return [
      [dx - s.halfWidth, s.yBottom, s.z],
      [dx + s.halfWidth, s.yBottom, s.z],
      [dx + s.halfWidth, s.yTop, s.z],
      [dx - s.halfWidth, s.yTop, s.z]
    ]
  }

  for (let i = 0; i < sections.length - 1; i++) {
    const a = corners(sections[i])
    const b = corners(sections[i + 1])

    // Each face lists its corners so that walking them turns the same way as
    // its own outward normal. Written the obvious way round - a, b, then the
    // next section - every one of these comes out facing INWARDS, which draws
    // nothing at all and is the exact mistake the stunt arena's mounds shipped
    // with. outwardCount() is the check; it is worth running after touching
    // any of the four.
    quad(a[0], a[1], b[1], b[0])   // floor, normal -y
    quad(a[1], a[2], b[2], b[1])   // right flank, +x
    quad(a[2], a[3], b[3], b[2])   // roof, +y
    quad(a[3], a[0], b[0], b[3])   // left flank, -x
  }

  // The two ends. Front (largest z) faces +z, back faces -z.
  const back = corners(sections[0])
  quad(back[1], back[0], back[3], back[2])
  const front = corners(sections[sections.length - 1])
  quad(front[0], front[1], front[2], front[3])

  return { positions, indices, sections }
}

/**
 * The bounding box of a lofted solid, which is what the tests measure and
 * what a caller needs to sit trim on the outside of it.
 */
export function loftBounds(solid) {
  const p = solid.positions
  const box = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity }
  }
  for (let i = 0; i < p.length; i += 3) {
    box.min.x = Math.min(box.min.x, p[i]); box.max.x = Math.max(box.max.x, p[i])
    box.min.y = Math.min(box.min.y, p[i + 1]); box.max.y = Math.max(box.max.y, p[i + 1])
    box.min.z = Math.min(box.min.z, p[i + 2]); box.max.z = Math.max(box.max.z, p[i + 2])
  }
  return box
}

/**
 * How far out a face points, per triangle. A closed solid built correctly has
 * every one of them positive; this is what the test asserts, because a body
 * wound inside out is invisible from outside and the mistake is silent.
 *
 * The stunt arena's mounds shipped inside out and survived two rounds of
 * "why can't I see them" before anyone checked - see moundSolid().
 */
export function outwardCount(solid) {
  const p = solid.positions
  let cx = 0, cy = 0, cz = 0
  const n = p.length / 3
  for (let i = 0; i < p.length; i += 3) { cx += p[i]; cy += p[i + 1]; cz += p[i + 2] }
  cx /= n; cy /= n; cz /= n

  let out = 0
  let total = 0
  for (let t = 0; t < p.length; t += 9) {
    const ux = p[t + 3] - p[t], uy = p[t + 4] - p[t + 1], uz = p[t + 5] - p[t + 2]
    const vx = p[t + 6] - p[t], vy = p[t + 7] - p[t + 1], vz = p[t + 8] - p[t + 2]
    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx
    const dx = (p[t] + p[t + 3] + p[t + 6]) / 3 - cx
    const dy = (p[t + 1] + p[t + 4] + p[t + 7]) / 3 - cy
    const dz = (p[t + 2] + p[t + 5] + p[t + 8]) / 3 - cz
    total++
    if (nx * dx + ny * dy + nz * dz > 0) out++
  }
  return { out, total }
}

// ---------------------------------------------------------------------------
// WHEELS
// ---------------------------------------------------------------------------

/**
 * A wheel is a tyre, a rim and a hub, and the rim is the whole point.
 *
 * The old wheel was one eight-sided black cylinder. At the size a car is
 * drawn here that is a dark octagon, and four dark octagons is what made the
 * fleet read as toys: there was no bright ring to catch the light and nothing
 * to say which way it was facing. A pale rim inset into the outer face is one
 * extra mesh per wheel and does more for the look of a car than anything else
 * in this file.
 *
 * Sixteen sides on the tyre, not eight. Flat-shaded, sixteen still reads as
 * faceted next to the buildings, and eight reads as a mistake.
 */
export const WHEEL = {
  tyreSegments: 16,
  rimSegments: 12,
  /** Rim diameter as a fraction of the tyre's. Real wheels sit near 0.62. */
  rimFraction: 0.68,
  hubFraction: 0.2,
  /**
   * How much thicker the rim is than the tyre, as a fraction.
   *
   * NOT decoration. The rim is a cylinder concentric with the tyre, so its
   * curved surface is buried inside it and the only part that can ever be
   * seen is its two end caps - which at 0.02 were level with the tyre's own
   * faces to within a hundredth of a unit, so they either z-fought with them
   * or lost. The rim has to stand PROUD of the tyre to exist at all.
   */
  rimProud: 0.2,
  spokes: 5,
  spokeWidthFraction: 0.13
}

/**
 * Where the four wheels go.
 *
 * Split out of World.addWheels so a test can ask the question without a
 * browser: the wheels have to be inside the vehicle's own width, or the fleet
 * clips its oncoming neighbour on a 5.5-unit street - which TRAFFIC_WIDTHS
 * exists to prevent and which nothing was checking.
 *
 * Front pair first, so indices 0 and 1 are the ones that steer.
 */
export function wheelPositions(length, width, radius, thickness = 0.34,
                               atFront = 0.31, atRear = 0.31) {
  const track = width / 2 - thickness / 2
  const out = []
  for (const [along, front] of [[length * atFront, true], [-length * atRear, false]]) {
    for (const side of [1, -1]) {
      out.push({ x: side * track, y: radius, z: along, side, front })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// BODY PROFILES
// ---------------------------------------------------------------------------

/**
 * The lower body and the greenhouse of a road car, as two lofts.
 *
 * TWO, not one, and that is the whole trick. A single swept rectangle has one
 * top edge, so it can have a sloping bonnet or a roof narrower than the sills
 * but not both. Real low-poly cars are built as a lower body from the sills to
 * the shoulder line, and a separate cabin sitting on it - which is also how
 * you get A-pillars that lean, because the cabin's front section is shorter
 * and further back than its bottom.
 *
 * Everything is a fraction of the length and width the layout states, so a
 * change to TRAFFIC_LENGTHS moves the whole car with it. Every fitting that
 * has come adrift in this project came adrift because it was positioned from
 * a number that then changed.
 */
export function carBody(length, width, opts = {}) {
  const {
    sill = 0.34,          // how high off the ground the body starts
    shoulder = 1.02,      // the top of the lower body
    roof = 1.62,          // the top of the cabin
    noseDrop = 0.14,      // how much lower the bonnet is at the nose
    tailDrop = 0.06,
    waist = 1.0,          // width multiplier at the widest point
    tuck = 0.86,          // width multiplier at nose and tail
    cabinFront = 0.14,    // where the windscreen meets the bonnet, as z/length
    cabinBack = -0.34,
    cabinWidth = 0.84,    // the cabin as a fraction of the body's width
    roofFront = 0.0,      // the roof's leading edge - the A-pillar's lean
    roofBack = -0.28,
    roofTuck = 0.9        // the roof narrower than the cabin's base
  } = opts

  const hw = width / 2
  const lower = [
    { z: -length / 2, halfWidth: hw * tuck, yBottom: sill, yTop: shoulder - tailDrop },
    { z: -length * 0.3, halfWidth: hw * waist, yBottom: sill - 0.04, yTop: shoulder },
    { z: length * 0.18, halfWidth: hw * waist, yBottom: sill - 0.04, yTop: shoulder },
    { z: length * 0.42, halfWidth: hw * (waist * 0.97), yBottom: sill, yTop: shoulder - noseDrop * 0.6 },
    { z: length / 2, halfWidth: hw * tuck, yBottom: sill + 0.05, yTop: shoulder - noseDrop }
  ]

  const cw = hw * cabinWidth
  const cabin = [
    { z: length * cabinBack, halfWidth: cw * 0.96, yBottom: shoulder - 0.06, yTop: roof - 0.24 },
    { z: length * roofBack, halfWidth: cw * roofTuck, yBottom: shoulder - 0.06, yTop: roof },
    { z: length * roofFront, halfWidth: cw * roofTuck, yBottom: shoulder - 0.06, yTop: roof },
    { z: length * cabinFront, halfWidth: cw, yBottom: shoulder - 0.06, yTop: roof - 0.3 }
  ]

  return { lower, cabin }
}

/**
 * A van-shaped body: one box-ish loft with the front corners pulled in.
 *
 * Ambulances, fire engines and buses are not cars with a cabin on top - they
 * are a single tall volume, and lofting them as one keeps the flanks flat the
 * way a panel van's are while still letting the nose round off.
 */
export function vanBody(length, width, opts = {}) {
  const {
    sill = 0.42, roof = 2.5, tuck = 0.9, noseDrop = 0.2, frontAt = 0.42
  } = opts
  const hw = width / 2
  return [
    { z: -length / 2, halfWidth: hw * tuck, yBottom: sill, yTop: roof - 0.05 },
    { z: -length * 0.42, halfWidth: hw, yBottom: sill - 0.05, yTop: roof },
    { z: length * frontAt, halfWidth: hw, yBottom: sill - 0.05, yTop: roof },
    { z: length / 2, halfWidth: hw * tuck, yBottom: sill + 0.04, yTop: roof - noseDrop }
  ]
}

/**
 * The racing car's tub: a wedge, wide at the sidepods and pinched at both
 * ends, with the floor almost on the road.
 */
export function raceBody(length, width) {
  const hw = width / 2
  return [
    { z: -length * 0.46, halfWidth: hw * 0.3, yBottom: 0.22, yTop: 0.62 },
    { z: -length * 0.2, halfWidth: hw * 0.44, yBottom: 0.14, yTop: 0.7 },
    { z: length * 0.04, halfWidth: hw * 0.42, yBottom: 0.12, yTop: 0.66 },
    { z: length * 0.24, halfWidth: hw * 0.3, yBottom: 0.14, yTop: 0.5 },
    { z: length * 0.42, halfWidth: hw * 0.17, yBottom: 0.18, yTop: 0.36 },
    { z: length * 0.52, halfWidth: hw * 0.09, yBottom: 0.2, yTop: 0.29 }
  ]
}

/**
 * The monster truck's shell: a PICKUP, in three lofts.
 *
 * Mike, having driven the first version: "the shape does not look like a real
 * monster truck. The big wheels are a good improvement but the chassis and
 * body of the truck look a bit weird."
 *
 * He was right, and the reason is worth writing down. The old profile was one
 * loft, four sections, near-constant width and a flat top - so what it drew
 * was a rounded slab, and a rounded slab on big wheels is a beach buggy. Every
 * real monster truck is a fibreglass PICKUP body: a long bonnet, a very SHORT
 * cab, and an open bed behind it. Those three volumes and the two steps
 * between them are the entire silhouette. Miss them and no amount of tube
 * chassis underneath will read.
 *
 * So: three lofts and one beltline.
 *
 *   - `lower` runs nose to tailgate at a single beltline height, because on a
 *     pickup the top of the bonnet and the top of the bed rails ARE the same
 *     line. It drops toward the nose and tucks in at both ends.
 *   - `cabin` is the greenhouse, and it is short - 28% of the length against
 *     the bonnet's 34%. Its front section sits FORWARD of the roof's leading
 *     edge, which is what rakes the windscreen.
 *   - `bed` is the open box, sunk below the rails, drawn in a dark colour. A
 *     pickup with a filled-in bed is a panel van.
 *
 * The proportions along the length, front to back, are 34 / 28 / 32. The two
 * places they matter are the cowl (where bonnet meets windscreen) and the cab
 * rear (where the greenhouse stops and the bed starts) - those are the two
 * steps, and they are returned by name so World.js can hang the roll cage,
 * the exhaust stacks and the windscreen off them rather than off its own
 * guesses. Every fitting in this project that came adrift came adrift because
 * it was positioned from a number that then changed.
 */
export function monsterBody(length, width, ride) {
  const hw = width / 2
  // The one line the whole body is built from, and the roof above it.
  //
  // These two are the tightest budget in the file, so the arithmetic is worth
  // stating. The tyres are 2.1 tall and the collider is 3.2, which leaves 1.1
  // for a body, a cab and a roll cage stacked on top of a shell that has to
  // start ABOVE the tyre crowns or the wheels look like they are in wheel
  // wells. The first two attempts spent that budget evenly and got a sliver of
  // a body under a sliver of a cab - a slot car.
  //
  // The way out is that a model is allowed to overhang its collider a little:
  // the pickup's shell measures 2.32 against a stated 2.1, and the police
  // car's 1.83 against 1.8. So the truck spends up to `top` = 3.42, about 7%
  // over, which is inside what the rest of the fleet already does, and buys a
  // body deep enough to have a door in it.
  const belt = ride + 0.76
  const roof = belt + 0.62

  // The flanks are 80% of the stated width. Narrow shell, wide stance: the
  // wheels are tracked OUTSIDE the bodywork and you can see daylight between
  // the two, which is the other half of the silhouette.
  const flank = hw * 0.68

  const nose = length * 0.48
  const tail = -length * 0.46
  const cowl = length * 0.14        // bonnet meets windscreen
  const cabBack = -length * 0.14    // greenhouse stops, bed starts

  //
  // A TRUCK IS SQUARE AT BOTH ENDS, and this is where the second attempt at
  // the shape still looked wrong. The road cars tuck their nose and tail in,
  // because cars do; copying that here gave the truck a drooping beak at the
  // front and a pointed tailgate, which is a shape no pickup has ever had.
  // Both ends stay within a few percent of the flank width and drop only
  // enough to break the flat - the chamfer is a highlight, not a taper.
  const lower = [
    { z: tail, halfWidth: flank * 0.97, yBottom: ride + 0.04, yTop: belt - 0.02 },
    { z: -length * 0.43, halfWidth: flank, yBottom: ride, yTop: belt },
    { z: cabBack, halfWidth: flank, yBottom: ride, yTop: belt },
    { z: cowl, halfWidth: flank, yBottom: ride, yTop: belt },
    { z: length * 0.43, halfWidth: flank, yBottom: ride, yTop: belt - 0.03 },
    { z: nose, halfWidth: flank * 0.95, yBottom: ride + 0.04, yTop: belt - 0.1 }
  ]

  // The greenhouse. Note the last section: it is 0.4 lower and further FORWARD
  // than the roof, so the face between them leans back over the bonnet at
  // about 34 degrees from vertical. A cabin whose front section is the same
  // height as its roof has a vertical windscreen, which is a bus.
  const cabin = [
    { z: cabBack - length * 0.01, halfWidth: hw * 0.62, yBottom: belt - 0.05, yTop: roof - 0.05 },
    { z: -length * 0.11, halfWidth: hw * 0.6, yBottom: belt - 0.05, yTop: roof },
    { z: length * 0.04, halfWidth: hw * 0.6, yBottom: belt - 0.05, yTop: roof },
    { z: cowl + length * 0.01, halfWidth: hw * 0.64, yBottom: belt - 0.05, yTop: roof - 0.34 }
  ]

  // The bed floor, a lid dropped below the rails and drawn dark, so what you
  // read is a hole rather than a panel.
  //
  // 0.36 and not less: the bed sits over the rear tyres, and a floor below
  // their crowns has black rubber poking up through it.
  const bedFloor = ride + 0.36
  const bed = [
    { z: -length * 0.43, halfWidth: hw * 0.6, yBottom: bedFloor, yTop: belt - 0.05 },
    { z: -length * 0.17, halfWidth: hw * 0.6, yBottom: bedFloor, yTop: belt - 0.05 }
  ]

  return {
    lower, cabin, bed,
    belt, roof, flank, nose, tail, cowl, cabBack, bedFloor,
    roofBack: -length * 0.11,
    roofFront: length * 0.04,
    // The highest point of anything World.js is allowed to bolt on: the roof
    // rails, the light bar and the exhaust tips all cap out here. Stated once,
    // so `vehicles.mjs` can check it against the collider height without
    // importing World.js, which imports THREE and will not load headlessly.
    top: roof + 0.24
  }
}

// ---------------------------------------------------------------------------
// THE ENVIRONMENT
// ---------------------------------------------------------------------------
//
// Mike, after the fleet: "can we make the same visual and model improvements
// to the environment? (Trains, trees, helicopters, airplanes,
// buildings/structures you created)"
//
// Same answer as before, and it is the same primitive: `loftSolid()`. A train
// car was one 3.4 x 2.6 box with a window strip stuck on each side. An
// aircraft was a cylinder with box wings. Both are things whose whole
// character is in a cross-section that CHANGES along their length - a train
// car tucks in at the roof and at the ends, an airliner tapers to a nose and
// to a tail cone - and a box cannot express either.

/**
 * A monorail car: square-shouldered, tucked in at the roof and rounded off at
 * both ends.
 *
 * `nose` says how much of the end tapers away - 0 for a middle car, 1 for a
 * driving car. That one number is the whole difference between the two, so
 * they cannot drift apart.
 */
export function trainCarBody(length, width, height, nose = 0) {
  const hw = width / 2
  const end = length / 2
  const taper = 1.4 + nose * 2.2
  return [
    { z: -end, halfWidth: hw * (1 - nose * 0.34), yBottom: 0.9 + nose * 0.12,
      yTop: height - 0.45 - nose * 0.35 },
    { z: -end + taper, halfWidth: hw, yBottom: 0.78, yTop: height - 0.16 },
    { z: end - taper, halfWidth: hw, yBottom: 0.78, yTop: height - 0.16 },
    { z: end, halfWidth: hw * (1 - nose * 0.34), yBottom: 0.9 + nose * 0.12,
      yTop: height - 0.45 - nose * 0.35 }
  ]
}

/**
 * An airliner's fuselage: a nose that tapers to a point, a constant-section
 * cabin, and a tail cone that lifts as it narrows.
 *
 * The lifted tail is not decoration. It is the single most recognisable thing
 * about an airliner's side view after the wings, and it is why the fin has
 * somewhere to stand.
 */
export function fuselageBody(length, radius) {
  const half = length / 2
  return [
    { z: -half, halfWidth: radius * 0.16, yBottom: radius * 1.5, yTop: radius * 2.1 },
    { z: -half * 0.72, halfWidth: radius * 0.6, yBottom: radius * 0.85, yTop: radius * 1.95 },
    { z: -half * 0.4, halfWidth: radius * 0.95, yBottom: radius * 0.2, yTop: radius * 1.9 },
    { z: half * 0.3, halfWidth: radius, yBottom: radius * 0.1, yTop: radius * 1.95 },
    { z: half * 0.72, halfWidth: radius * 0.82, yBottom: radius * 0.36, yTop: radius * 1.7 },
    { z: half * 0.93, halfWidth: radius * 0.42, yBottom: radius * 0.62, yTop: radius * 1.36 },
    { z: half, halfWidth: radius * 0.14, yBottom: radius * 0.82, yTop: radius * 1.12 }
  ]
}

/**
 * A helicopter's cabin: a bulbous glazed nose, a cabin, and a tail boom that
 * narrows to nothing.
 */
export function helicopterBody(length, width) {
  const hw = width / 2
  return [
    { z: -length * 0.5, halfWidth: hw * 0.16, yBottom: 1.5, yTop: 2.0 },
    { z: -length * 0.28, halfWidth: hw * 0.24, yBottom: 1.35, yTop: 2.1 },
    { z: -length * 0.08, halfWidth: hw * 0.72, yBottom: 0.85, yTop: 2.35 },
    { z: length * 0.14, halfWidth: hw, yBottom: 0.7, yTop: 2.4 },
    { z: length * 0.32, halfWidth: hw * 0.9, yBottom: 0.75, yTop: 2.1 },
    { z: length * 0.46, halfWidth: hw * 0.5, yBottom: 0.95, yTop: 1.6 }
  ]
}

/**
 * A swept wing, as a loft along its SPAN rather than its length.
 *
 * The sections run outboard, so `z` here is distance from the root and the
 * caller turns the result on its side. Sweep comes from `xShift`, which slides
 * each section back as it goes out - the one thing a box wing cannot do and
 * the thing that says "jet" rather than "model aeroplane".
 */
export function wingBody(span, rootChord, tipChord, sweep, thickness) {
  const half = span / 2
  return [
    { z: 0, halfWidth: rootChord / 2, yBottom: -thickness / 2, yTop: thickness / 2 },
    { z: half * 0.55, halfWidth: rootChord * 0.36, yBottom: -thickness * 0.36,
      yTop: thickness * 0.36, xShift: -sweep * 0.55 },
    { z: half * 0.9, halfWidth: tipChord * 0.6, yBottom: -thickness * 0.22,
      yTop: thickness * 0.22, xShift: -sweep * 0.9 },
    { z: half, halfWidth: tipChord / 2, yBottom: -thickness * 0.14,
      yTop: thickness * 0.14, xShift: -sweep }
  ]
}

/**
 * A tree's canopy, as a list of lobes.
 *
 * A street tree was a cylinder with ONE icosahedron on top - a lollipop, and
 * the giveaway that nothing about it was a tree. A real canopy reads as
 * several overlapping masses at different heights, because that is what
 * catches the light differently across it. Three to five lobes is enough; more
 * is a smooth ball again.
 *
 * Returned as data rather than built, so the test can check the shape and the
 * seeded random stays in World.js where the rest of the world's seed lives.
 */
export function canopyLobes(rand, height, spread) {
  const count = 3 + Math.floor(rand() * 3)
  const lobes = []
  for (let i = 0; i < count; i++) {
    // The first lobe is the crown, centred and largest; the rest ring it.
    const middle = i === 0
    const angle = (i / Math.max(1, count - 1)) * Math.PI * 2 + rand() * 0.6
    const out = middle ? 0 : spread * (0.42 + rand() * 0.36)
    lobes.push({
      x: Math.cos(angle) * out,
      z: Math.sin(angle) * out,
      y: height * (middle ? 1 : 0.72 + rand() * 0.3),
      radius: spread * (middle ? 0.62 : 0.4 + rand() * 0.2)
    })
  }
  return lobes
}
