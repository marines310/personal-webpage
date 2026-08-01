/**
 * Holidays - the days the world dresses up for.
 *
 * No THREE in here, like seasons.js and cameraPose.js and the three callouts.
 * Everything below is arithmetic on plain numbers.
 *
 * A HOLIDAY IS A LAYER, NOT A SEASON
 * ----------------------------------
 * This is the whole design, and it is the one thing that must not be
 * rearranged later for tidiness.
 *
 * The obvious way to build this is to add rows to the SEASONS table -
 * christmas, halloween - because a season is already "a named thing that
 * changes how the world looks". It is wrong, and it fails immediately:
 * Christmas happens IN winter and wants winter's dormant trees and winter's
 * snow. As another season it would replace them, and the bug would present as
 * "the snow disappears when you put the decorations up" - which reads as a
 * rendering fault rather than as a modelling mistake, and would be hunted for
 * in the wrong file.
 *
 * So a holiday describes only things a season has no opinion about: how many
 * eggs are on the grass, whether the fireworks are up. It never names a
 * colour role and never mentions snow. `HOLIDAY_KEYS` and `SEASON_ROLES` are
 * disjoint sets and a test says so, which is the structural version of the
 * rule rather than a comment asking nicely.
 *
 * WHY THE DECORATIONS ARE AMOUNTS AND NOT FLAGS
 * --------------------------------------------
 * The same reason the spring flowers are: they grow. A field that is either
 * there or not there pops into existence in one frame, and the eye reads a
 * pop as a glitch even when it is intentional. Everything here is 0..1 and
 * eases, so the eggs come up out of the grass over a few seconds and go back
 * down the same way - which also means an out-of-season field costs nothing,
 * because an instanced mesh scaled to zero is not drawn.
 */

/**
 * The scattered props, one entry per instanced field World builds.
 *
 * Deliberately NOT one field per holiday: two holidays can be up at once
 * during a crossfade, and a field per holiday would mean the Christmas gifts
 * and the Thanksgiving turkeys could not both be half-grown.
 */
export const DECOR_KINDS = [
  'eggs', 'bunnies', 'pumpkins', 'turkeys', 'gifts', 'trees'
]

/**
 * Everything a holiday can turn on. The scattered props, plus the two things
 * that are not props:
 *
 *   fireworks  how busy the sky is, 0..1
 *   lights     festive lights on the buildings, which ride on the existing
 *              night-emissive list rather than on a second lighting system
 */
export const HOLIDAY_KEYS = [...DECOR_KINDS, 'fireworks', 'lights']

/**
 * The holidays, and where they fall in the year.
 *
 * `phase` is a point in the same 0..1 year seasons.js uses, where 0 is the
 * top of spring and each season is a quarter. The numbers are the REAL dates
 * converted - (date - 20 March) / 365 - rather than eyeballed into roughly
 * the right season, and it is worth doing that way round for one reason:
 * Christmas and New Year are a week apart, which is 0.019 of a year and
 * therefore INSIDE one window. Guessed at, they came out 0.07 apart with a
 * 0.02 gap between their windows, so the gifts were packed away before the
 * fireworks started and the week between them was a fortnight of nothing.
 *
 * `none` has no phase, which is what makes it the answer when nothing else
 * is in season rather than a holiday that has to be scheduled somewhere.
 */
export const HOLIDAYS = {
  none: {
    label: 'None', phase: null,
    eggs: 0, bunnies: 0, pumpkins: 0, turkeys: 0, gifts: 0, trees: 0,
    fireworks: 0, lights: 0
  },

  easter: {
    label: 'Easter', phase: 0.06,
    eggs: 1, bunnies: 0.8, pumpkins: 0, turkeys: 0, gifts: 0, trees: 0,
    fireworks: 0, lights: 0
  },

  independence: {
    label: 'Fourth of July', phase: 0.29,
    eggs: 0, bunnies: 0, pumpkins: 0, turkeys: 0, gifts: 0, trees: 0,
    // Fireworks and nothing else. The Fourth is an evening, not a set of
    // ornaments, and hanging bunting on every building to give the holiday
    // "something in daylight" would be inventing a tradition to fill a gap
    // in the table.
    fireworks: 1, lights: 0.35
  },

  halloween: {
    label: 'Halloween', phase: 0.62,
    eggs: 0, bunnies: 0, pumpkins: 1, turkeys: 0, gifts: 0, trees: 0,
    fireworks: 0, lights: 0.8
  },

  thanksgiving: {
    label: 'Thanksgiving', phase: 0.69,
    eggs: 0, bunnies: 0, pumpkins: 0.45, turkeys: 1, gifts: 0, trees: 0,
    // The pumpkins stay on at not quite half. They are a harvest decoration
    // before they are a Halloween one, and a world that strips them out
    // overnight looks like something failed to load.
    fireworks: 0, lights: 0.3
  },

  christmas: {
    label: 'Christmas', phase: 0.77,
    eggs: 0, bunnies: 0, pumpkins: 0, turkeys: 0, gifts: 1, trees: 1,
    fireworks: 0, lights: 1
  },

  newyear: {
    label: 'New Year', phase: 0.79,
    eggs: 0, bunnies: 0, pumpkins: 0, turkeys: 0, gifts: 0.3, trees: 0.8,
    fireworks: 1, lights: 0.9
  }
}

/** The picker's order: none first, then the year as it actually runs. */
export const HOLIDAY_ORDER = [
  'none', 'easter', 'independence', 'halloween',
  'thanksgiving', 'christmas', 'newyear'
]

/**
 * How much of the year a holiday is up for, as a fraction, centred on its
 * phase.
 *
 * 0.05 of a year. At the default year of four ten-minute seasons that is
 * about two minutes, which is long enough to drive somewhere and find the
 * decorations rather than watching them go by.
 *
 * It also has to be wider than the week between Christmas and New Year -
 * 0.019 - or their windows do not overlap and the gifts are packed away
 * before the fireworks start. Halloween to Thanksgiving is 0.07 and stays
 * separate, which is right: they are a month apart and the pumpkins carry
 * over through the table rather than through the calendar.
 */
export const HOLIDAY_WINDOW = 0.05

/**
 * How much of the window is spent arriving and leaving.
 *
 * Same idea as SEASON_BLEND: the middle of a holiday should look like the
 * holiday, not like a permanent crossfade.
 */
export const HOLIDAY_EDGE = 0.3

const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t)
const smooth = (t) => t * t * (3 - 2 * t)

/** Signed distance between two points on a 0..1 wheel, shortest way round. */
export function phaseGap(a, b) {
  let d = ((a - b) % 1 + 1.5) % 1 - 0.5
  return d
}

/**
 * How strongly a holiday applies at a point in the year: 0 outside its
 * window, 1 in the middle, ramped at the edges.
 */
export function holidayStrength(key, phase) {
  const spec = HOLIDAYS[key]
  if (!spec || spec.phase === null) return 0

  const half = HOLIDAY_WINDOW / 2
  const away = Math.abs(phaseGap(phase, spec.phase))
  if (away >= half) return 0

  // How far INTO the window, 0 at the edge and 1 at the centre.
  const inward = 1 - away / half
  if (HOLIDAY_EDGE <= 0) return 1
  return smooth(clamp01(inward / HOLIDAY_EDGE))
}

/**
 * Which holiday the calendar is at, and how strongly.
 *
 * Windows can touch - Christmas into New Year - so this answers with the
 * strongest rather than the first, and a crossfade between the two comes out
 * of holidayLayer() adding them rather than out of a branch here.
 */
export function holidayAt(phase) {
  let best = 'none'
  let strength = 0
  for (const key of HOLIDAY_ORDER) {
    const s = holidayStrength(key, phase)
    if (s > strength) { strength = s; best = key }
  }
  return { key: best, strength }
}

/** A layer with everything off. The identity, and the starting point. */
export function emptyLayer() {
  const out = {}
  for (const key of HOLIDAY_KEYS) out[key] = 0
  return out
}

/**
 * The decorations that should be up right now.
 *
 * `manual` is a holiday key to force, or null to follow the calendar. A
 * forced holiday applies at full strength and does not fade with the year,
 * which is what picking one off a menu has to mean - otherwise choosing
 * Christmas in June would show you a tenth of Christmas.
 *
 * Every holiday in range contributes, and the strongest of each key wins
 * rather than the sum. Adding them would put the pumpkins at 1.45 through
 * the Halloween-to-Thanksgiving crossover, and an amount over 1 grows props
 * bigger than they were authored - the bug would look like the pumpkins
 * swelling once a year.
 */
export function holidayLayer(phase, manual = null) {
  const out = emptyLayer()

  if (manual && HOLIDAYS[manual]) {
    const spec = HOLIDAYS[manual]
    for (const key of HOLIDAY_KEYS) out[key] = spec[key]
    out.label = spec.label
    return out
  }

  let label = HOLIDAYS.none.label
  let strongest = 0
  for (const name of HOLIDAY_ORDER) {
    const s = holidayStrength(name, phase)
    if (s <= 0) continue
    const spec = HOLIDAYS[name]
    for (const key of HOLIDAY_KEYS) {
      out[key] = Math.max(out[key], spec[key] * s)
    }
    if (s > strongest) { strongest = s; label = spec.label }
  }

  out.label = label
  return out
}

/**
 * Ease one layer toward another, a frame at a time.
 *
 * The same exponential as the weather and the season, and for the same
 * reason: picking a holiday by hand is a jump, and the world must not jump
 * with it. One path whether the calendar arrived at it or you chose it.
 */
export function easeLayer(current, target, delta, rate = 0.6) {
  const k = 1 - Math.exp(-delta * rate)
  for (const key of HOLIDAY_KEYS) {
    current[key] += (target[key] - current[key]) * k
  }
  current.label = target.label
  return current
}

// ---------------------------------------------------------------------------
// Fireworks
// ---------------------------------------------------------------------------

/**
 * Fireworks are the only genuinely new thing in the whole holiday set - the
 * rest is props on the ground or emissive materials, both of which the world
 * already knows how to do.
 *
 * A shell is modelled in two halves because that is what one is: it CLIMBS,
 * trailing, and then it BURSTS. Skipping the climb and just blooming a
 * sphere in the sky is the version that looks wrong, and it looks wrong for
 * a reason you cannot fix by adding particles - there is nothing drawing the
 * eye upward to where the burst is about to happen, so every one of them is
 * a surprise in the corner of the screen.
 */

/** How long a shell takes to reach its burst height. */
export const CLIMB_SECONDS = 1.5

/** And how long the burst then hangs in the air before it is gone. */
export const BURST_SECONDS = 2.2

/**
 * How many sparks in a burst.
 *
 * Forty-two at first, which had to be drawn large to cover the sky and came
 * out as a burst made of visible squares - points have no shape of their own,
 * so a big one is a big square. Twice the sparks at half the size is the same
 * area of light and reads as a spray rather than as blocks.
 */
export const SPARKS = 84

/** How fast the sparks fly out, and how hard they are pulled back down. */
export const SPARK_SPEED = 11
export const SPARK_GRAVITY = 7.5

/** Shells a second at full intensity. */
export const LAUNCH_RATE = 1.4

/**
 * How high they burst - as an ANGLE from the viewer, not as a height.
 *
 * This is the fix for the thing that made the first version invisible. Burst
 * height was a straight 42-78 units whatever the distance, so a shell 70 out
 * burst at 40 degrees above the horizon and one 170 out burst at 20. The
 * chase camera looks along the road, roughly level, with about 30 degrees of
 * sky above the crosshair - so the near half of every display went off the
 * top of the frame, and what was left was the far half, too small to see.
 * Measured, not guessed: ten photographs of a sky with five shells in it
 * caught none of them.
 *
 * Tying the height to the distance instead keeps every shell at about the
 * same place up the sky, which is also what a real display does - they are
 * fired to burst where the crowd is looking.
 */
export const BURST_ELEVATION = 0.34      // tangent, so about 19 degrees
export const BURST_ELEVATION_SPREAD = 0.1

/** And the clamps, so an unusually close or far one is still sensible. */
export const BURST_HEIGHT_MIN = 22
export const BURST_HEIGHT_MAX = 78
/**
 * Far enough out to be over water from anywhere, close enough to be worth
 * looking at.
 *
 * The first pass launched them 90 to 240 units out. Photographed from the
 * coast road they were invisible: a burst 200 units away subtends almost
 * nothing, so the sky at New Year looked exactly like the sky on any other
 * night. Half the distance is four times the area on screen.
 */
export const LAUNCH_RADIUS_MIN = 70
export const LAUNCH_RADIUS_MAX = 170

export const FIREWORK_COLOURS = [
  0xff4d4d, 0xffd24d, 0x6dd3ff, 0x8cff6d, 0xff6dd3, 0xfff2c4, 0x9d7dff
]

export function newFireworksState() {
  return { shells: [], due: 0, nextId: 1 }
}

/**
 * One frame of the fireworks.
 *
 * `intensity` is the holiday layer's `fireworks`, 0..1. `night` is 0..1 from
 * the environment: they only go up after dark. That is not decoration - a
 * firework in daylight is a grey puff, and the first version of this looked
 * broken at noon for exactly that reason.
 *
 * Returns the state, whose `shells` the caller draws. Nothing here knows what
 * a particle is.
 */
export function stepFireworks(state, delta, ctx) {
  const intensity = clamp01(ctx.intensity || 0)
  const night = clamp01(ctx.night || 0)
  const rand = ctx.rand || Math.random

  for (const shell of state.shells) shell.age += delta

  state.shells = state.shells.filter(
    s => s.age < CLIMB_SECONDS + BURST_SECONDS)

  // Only after dark, and only when a holiday has asked for them.
  const rate = LAUNCH_RATE * intensity * night
  if (rate <= 0) { state.due = 0; return state }

  state.due += delta * rate
  while (state.due >= 1) {
    state.due -= 1
    const angle = rand() * Math.PI * 2
    const radius = LAUNCH_RADIUS_MIN +
                   rand() * (LAUNCH_RADIUS_MAX - LAUNCH_RADIUS_MIN)
    const elevation = BURST_ELEVATION +
                      (rand() - 0.5) * 2 * BURST_ELEVATION_SPREAD
    const height = Math.max(BURST_HEIGHT_MIN,
                   Math.min(BURST_HEIGHT_MAX, radius * elevation))
    state.shells.push({
      id: state.nextId++,
      x: (ctx.x || 0) + Math.sin(angle) * radius,
      z: (ctx.z || 0) + Math.cos(angle) * radius,
      height,
      colour: FIREWORK_COLOURS[Math.floor(rand() * FIREWORK_COLOURS.length)],
      age: 0
    })
  }

  return state
}

/**
 * Where a shell is and what it is doing, as one object the caller can draw
 * without doing any arithmetic of its own.
 *
 * `climb` eases out rather than running linearly, so the shell decelerates
 * into its burst the way a real one does at the top of its arc.
 */
export function shellView(shell) {
  if (shell.age < CLIMB_SECONDS) {
    const t = shell.age / CLIMB_SECONDS
    return {
      phase: 'climb',
      y: shell.height * (1 - (1 - t) * (1 - t)),
      // Fades as it goes, so the trail thins out instead of a bright dot
      // arriving at the top with nothing having happened to it.
      brightness: 1 - t * 0.45,
      spread: 0,
      fade: 1
    }
  }

  const t = clamp01((shell.age - CLIMB_SECONDS) / BURST_SECONDS)
  return {
    phase: 'burst',
    y: shell.height,
    brightness: 1,
    spread: t,
    // Squared, so it holds bright and then goes out quickly rather than
    // dimming evenly across two seconds like a fading light bulb.
    fade: (1 - t) * (1 - t)
  }
}

/**
 * Where one spark of a burst is, relative to the burst's centre.
 *
 * Directions come from the spark's INDEX rather than from a random draw, so
 * a burst is the same shape every frame it is drawn. Randomising per frame
 * was the first version and it produced a shimmering ball rather than a set
 * of sparks flying outward - the classic mistake of re-rolling something
 * that should have been decided once.
 */
export function sparkOffset(index, count, spread) {
  // Fibonacci sphere: an even spray in every direction, with no clustering
  // at the poles the way stacked rings of latitude and longitude give.
  const k = (index + 0.5) / count
  const y = 1 - 2 * k
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = index * 2.399963229728653     // the golden angle

  const t = spread * (BURST_SECONDS)
  const distance = SPARK_SPEED * spread
  return {
    x: Math.cos(theta) * r * distance,
    y: y * distance - 0.5 * SPARK_GRAVITY * t * t,
    z: Math.sin(theta) * r * distance
  }
}
