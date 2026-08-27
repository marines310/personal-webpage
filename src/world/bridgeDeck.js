/**
 * Arched bridge decks, and the air under them.
 *
 * Mike: "fix the ships clipping/going through the bridges. Lets make that
 * elevated bridge now so we can avoid seeing ships go through bridges like
 * they're not there."
 *
 * The decks were flat slabs with their top face at y = 0 - see PIER_DECK_Y in
 * islandLayout.js for why zero, which is the world's one sea-level datum. A
 * vessel floats at the same zero, so every hull passed clean through every
 * deck. Measured over ten minutes of shipping, three of the seven crossings
 * were sailed through: 2601 ship-frames, about 87 seconds of it.
 *
 * WHY THIS IS A GEOMETRY PROBLEM AND NOT A DRAWING ONE. The obvious fix - put
 * the deck up in the air - runs straight into the ramps. The steepest road
 * anywhere in this world is 8% (`MAX_ROAD_GRADIENT`), measured across all
 * 6,184 road segments, and at 8% a deck high enough to clear a loaded cargo
 * ship needs 187 units of ramp on each side. The bridges are 114 to 132 units
 * long end to end and the islands are 70 to 100 in radius, so those ramps
 * would run most of the way to each island's centre - and seven of them
 * radiate from the hub, which is 80. It would not be a bridge, it would be a
 * mountain range.
 *
 * So the height is chosen from the other end. A fixed crown of BRIDGE_RISE,
 * which every bridge shares so they look like a set, with the gradient falling
 * out of each one's own span - and a navigable window at midspan that the
 * shipping is routed through, exactly as a real marked channel works. What
 * cannot fit under it does not go under it: see `bridgeAirDraft()` and the
 * routing in islandLayout.js.
 *
 * Pure: no THREE, no Rapier. `tests/elevated.mjs` runs it directly.
 */

/**
 * How high the crown of every deck stands above the sea, in units.
 *
 * FIXED ACROSS ALL SEVEN, and derived backwards from what has to pass beneath
 * rather than forwards from a gradient. That ordering is the whole design:
 * pick the gradient first and the shortest bridge ends up with the lowest
 * crown, which is precisely the one a boat would hit.
 *
 * 6.0 leaves 5.5 of clear air under the deck's underside. A small boat's air
 * draft is 4.6 with the shortened mast, so it passes with most of a car's
 * height to spare, which is what you want when the thing is being steered by a
 * spline rather than a sailor.
 */
export const BRIDGE_RISE = 6

/** How thick the deck slab is. The underside is the crown less this. */
export const BRIDGE_DECK_THICKNESS = 0.5

/**
 * The fraction of the span spent easing in and out of the climb.
 *
 * A pure trapezoid - grade zero, then grade G, then zero again - has a corner
 * at each end of each ramp, and a corner in a ROAD is a bump you feel through
 * the wheels. Mike has already reported that class of thing twice ("the player
 * vehicle makes some weird bounces"), so the grade itself ramps.
 *
 * 0.08 of the span at each of the four corners. Small enough that most of the
 * climb is at the honest constant gradient, big enough that nothing steps.
 */
export const BRIDGE_EASE = 0.08

/**
 * Where a vessel may cross, as a fraction of the span either side of the
 * middle.
 *
 * The deck is only at its full height in the middle, so the clearance a boat
 * gets depends on WHERE it crosses - and a channel that ignored that would put
 * a mast through the deck a third of the way along while measuring beautifully
 * at midspan. Measured, on the shortest bridge:
 *
 *     channel      width        worst clearance
 *     +/- 0.14     31.9 units   4.07
 *     +/- 0.10     22.8         4.64
 *     +/- 0.06     13.7         5.18
 *     +/- 0.02      4.6         5.46
 *
 * 0.06 is where it stops buying much: 13.7 units is three and a half boat
 * beams, which is a channel a spline can hold a boat inside without looking
 * threaded, and the remaining 0.28 of clearance is not worth halving it again
 * for.
 */
export const BRIDGE_CHANNEL = 0.06

/**
 * How tall the vessels are, and why the numbers live HERE.
 *
 * These are a CONTRACT between two files that would otherwise never meet: the
 * hulls are built in World.js, which needs a browser and cannot be tested, and
 * the clearance is decided here. The project has been bitten by exactly this
 * shape of thing before - see PIER_DECK_Y in islandLayout.js, where a quay
 * deck and the road onto it were given their heights independently and left a
 * 30cm wall across the pier that no test ever asked about.
 *
 * So: World.js builds to these, and `tests/elevated.mjs` reads World.js as
 * text and checks that it did. Change a mast in the mesh without changing the
 * number here and the suite goes red rather than the mast going through a
 * bridge.
 *
 * A cargo ship is over TWICE the crown of the deck, and no plausible bridge on
 * this map could clear one - see the note at the top of this file. Cargo is
 * routed round instead, which is also what happens in real ports.
 */
export const BOAT_AIR_DRAFT = 4.35
export const CARGO_AIR_DRAFT = 13.45

/**
 * The gradient a given span needs to reach the crown.
 *
 * The whole profile is an integral of a trapezoidal grade window, so this is
 * closed-form rather than solved: over half the span, the window spends
 * BRIDGE_EASE ramping up (average half of G), the middle at G, and
 * BRIDGE_EASE ramping down. Total rise = G * L * (0.5 - BRIDGE_EASE).
 */
export function bridgeGradient(length, rise = BRIDGE_RISE) {
  if (!(length > 0)) return 0
  return rise / (length * (0.5 - BRIDGE_EASE))
}

/**
 * The deck's height at a fraction `t` along the span, 0 at either shore.
 *
 * Symmetric about midspan by construction - `t` is folded into the first half
 * and the same three pieces answer both. Writing the second half out longhand
 * was the first version and the two halves disagreed by 4mm at the crown,
 * which is the sort of thing that shows up as a seam in the road ribbon.
 */
export function bridgeDeckProfile(t, length, rise = BRIDGE_RISE) {
  if (!(length > 0)) return 0

  const half = t <= 0.5 ? t : 1 - t
  if (half <= 0) return 0

  const a = BRIDGE_EASE
  const g = bridgeGradient(length, rise)

  // Easing into the climb: grade rises linearly, so height goes as t squared.
  if (half < a) return g * length * (half * half) / (2 * a)

  // The honest constant gradient, which is most of the run.
  if (half < 0.5 - a) return g * length * (a / 2 + (half - a))

  // Easing out at the crown, the first piece mirrored.
  const toCrown = 0.5 - half
  return rise - g * length * (toCrown * toCrown) / (2 * a)
}

/**
 * How much clear air there is under the deck at a fraction along the span.
 *
 * Below the underside, not the top face. Getting that wrong is a half-metre
 * of optimism spread across every clearance check in the project.
 */
export function bridgeClearance(t, length, rise = BRIDGE_RISE) {
  return Math.max(0, bridgeDeckProfile(t, length, rise) - BRIDGE_DECK_THICKNESS)
}

/**
 * The least clearance anywhere in the navigable channel.
 *
 * What a vessel routed through the middle is actually guaranteed, which is the
 * number every air-draft decision should be made against - never the crown,
 * which is the best case and is true at exactly one point.
 */
export function bridgeAirDraft(length, rise = BRIDGE_RISE) {
  return bridgeClearance(0.5 - BRIDGE_CHANNEL, length, rise)
}

/**
 * Where a point sits on a bridge, in the bridge's own frame.
 *
 * Returns `{ t, across }` - the fraction along the span and the distance from
 * the centre line - or null if the point is off the deck entirely. `margin`
 * widens the footprint, which is what the shipping test wants: a hull has a
 * beam, and asking whether its CENTRE is over the deck would let half a boat
 * through the parapet.
 */
export function bridgeFrame(bridge, x, z, margin = 0) {
  const dx = x - bridge.x
  const dz = z - bridge.z
  const sin = Math.sin(bridge.rotationY)
  const cos = Math.cos(bridge.rotationY)

  const along = dx * sin + dz * cos
  const across = dx * cos - dz * sin

  const halfLength = bridge.length / 2
  if (Math.abs(along) > halfLength + margin) return null
  if (Math.abs(across) > bridge.width / 2 + margin) return null

  return {
    t: Math.max(0, Math.min(1, (along + halfLength) / bridge.length)),
    across,
    along
  }
}

/**
 * The deck height at a world point, across a whole set of bridges.
 *
 * Zero where there is no deck, which makes it safe to fold into the ground
 * height with a max(): every profile is zero at both shores by construction,
 * so the two surfaces meet exactly at the coast rather than needing a blend.
 * That is the property that lets this be bolted on without touching the
 * terrain, and it is worth stating out loud because it is easy to break -
 * change BRIDGE_EASE to 0 and the deck starts with a kink at the shoreline.
 */
export function bridgeDeckAt(bridges, x, z, margin = 0) {
  let highest = 0
  for (const bridge of bridges) {
    const frame = bridgeFrame(bridge, x, z, margin)
    if (!frame) continue
    const h = bridgeDeckProfile(frame.t, bridge.length)
    if (h > highest) highest = h
  }
  return highest
}

/**
 * The steepest the deck gets, measured rather than asserted.
 *
 * Walked at a fine step instead of returning `bridgeGradient()`, because the
 * point of having this is to catch the profile and the gradient disagreeing.
 */
export function measureDeckGradient(length, rise = BRIDGE_RISE, steps = 2000) {
  let worst = 0
  let last = bridgeDeckProfile(0, length, rise)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const h = bridgeDeckProfile(t, length, rise)
    worst = Math.max(worst, Math.abs(h - last) / (length / steps))
    last = h
  }
  return worst
}
