/**
 * Seasons - the year, and what it does to the colour of the world.
 *
 * No THREE in here on purpose. Everything below is arithmetic on plain
 * numbers, so the whole of the year can be run in a test without a browser -
 * the same reason the road layout lives in islandLayout.js rather than in
 * World.js. Environment.js turns the numbers into light and particles;
 * World.js turns them into materials. Neither decides anything.
 *
 * HOW A SEASON IS APPLIED
 * -----------------------
 * Nothing here paints an absolute colour onto anything. Each role gets a
 * TARGET colour and an AMOUNT, and the material is mixed from ITS OWN colour
 * toward the target by that amount. That matters because the world is not one
 * green: there are two frond colours, a bush green and a dark grass, and
 * setting them all to `autumn orange` would flatten variety the map already
 * has. Mixing keeps a light frond lighter than a dark one in every season.
 *
 * It also gives summer a property worth having: every amount is zero, so
 * summer is the identity. The world in summer is EXACTLY the world as it was
 * before seasons existed, and a test can say so.
 */

/** The roles a material can play. A material registers as exactly one. */
export const SEASON_ROLES = ['grass', 'foliage', 'ground', 'roof']

/**
 * The year, in order. Index matters: the blend runs from each entry to the
 * next and wraps from the last back to the first.
 */
export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter']

/**
 * How much of a season is spent turning into the next one.
 *
 * 0.25 means three quarters of every season looks like itself and the last
 * quarter is the change. Blending the whole way through would mean the world
 * was never actually any season - it would be permanently halfway between two,
 * which is the same mistake as a colour ramp with no flat ends.
 */
export const SEASON_BLEND = 0.25

/**
 * Each season, as: [target colour, how far toward it] per role, plus the
 * things that are not colours.
 *
 *   flowers  how much of the spring flower field is up (0 = underground)
 *   leaves   how heavily leaves are falling
 *   snow     how much settled snow the ground is carrying
 *   chill    turns showers into snow in the weather chain
 */
export const SEASONS = {
  spring: {
    label: 'Spring',
    grass:   [0x93dc6b, 0.42],   // fresh, yellow-green new growth
    foliage: [0x9fe070, 0.38],
    ground:  [0xe9dfb4, 0.10],
    roof:    [0x000000, 0.00],
    flowers: 1, leaves: 0, snow: 0, chill: 0
  },

  summer: {
    // Every amount zero: summer IS the palette. See the note above.
    label: 'Summer',
    grass:   [0x000000, 0],
    foliage: [0x000000, 0],
    ground:  [0x000000, 0],
    roof:    [0x000000, 0],
    flowers: 0.18, leaves: 0, snow: 0, chill: 0
  },

  autumn: {
    label: 'Autumn',
    grass:   [0xab9a55, 0.55],   // going over to straw
    foliage: [0xd4762b, 0.80],   // the whole point of autumn
    ground:  [0xd9c79c, 0.20],
    roof:    [0x000000, 0.00],
    flowers: 0, leaves: 1, snow: 0, chill: 0.15
  },

  winter: {
    // Note what is NOT here: white. Winter's tints are what the world looks
    // like when it is cold and DRY - dormant grass, bare branches. The white
    // is `snow`, applied on top, because snow is a covering rather than a
    // colour and it comes and goes on its own clock.
    //
    // Written the other way round first, with the white folded into the
    // grass tint. That made `snow` a number nothing read: it was computed,
    // eased and handed to World every frame, and a flurry out of season
    // settled nothing at all because summer's grass tint is zero. Two things
    // describing the same whiteness, only one of them connected.
    label: 'Winter',
    grass:   [0x9fa38b, 0.58],   // dormant, straw-grey
    foliage: [0x8c8177, 0.72],   // bare and grey
    ground:  [0xd9cfba, 0.28],
    roof:    [0x000000, 0.00],
    flowers: 0, leaves: 0, snow: 1, chill: 1
  }
}

/** The colour of lying snow. */
export const SNOW_COLOUR = 0xf2f7fb

/**
 * How much lying snow each role takes.
 *
 * A lawn goes white; a roof nearly so; sand less, because it is already pale
 * and a beach under snow reads as a mistake; foliage least of all - a dusting
 * on the branches, not a bush made of snow. Cliff faces and roads take none,
 * which is why neither is in this table: snow does not stay on a vertical
 * face and the roads in a working town get cleared.
 */
export const SNOW_TAKE = {
  grass: 0.88,
  roof: 0.72,
  ground: 0.45,
  foliage: 0.35
}

/** Mix two 24-bit colours. t=0 gives a, t=1 gives b. */
export function mixHex(a, b, t) {
  const k = t < 0 ? 0 : t > 1 ? 1 : t
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255
  const r = Math.round(ar + (br - ar) * k)
  const g = Math.round(ag + (bg - ag) * k)
  const bl = Math.round(ab + (bb - ab) * k)
  return (r << 16) | (g << 8) | bl
}

const lerp = (a, b, t) => a + (b - a) * t

/**
 * Blend two seasons' entries for one role.
 *
 * The colours are mixed WEIGHTED BY THE AMOUNTS, not straight down the middle,
 * and this is the only subtle line in the file. Summer's amount is zero, so
 * summer's colour is meaningless - it is written as black because it is never
 * read. Mixing it straight would drag the grass toward black halfway through
 * August and the bug would look like the sun going out. Weighting by amount
 * asks the right question: of the tint that is actually being applied, how
 * much of it comes from each end?
 */
function blendRole(a, b, t) {
  const amount = lerp(a[1], b[1], t)
  const wa = a[1] * (1 - t)
  const wb = b[1] * t
  const total = wa + wb
  // Neither end tints at all, so the colour cannot matter; keep a's so the
  // value is at least stable rather than arbitrary.
  const colour = total < 1e-9 ? a[0] : mixHex(a[0], b[0], wb / total)
  return [colour, amount]
}

/** Blend two whole seasons. */
export function blendSeasons(a, b, t) {
  const out = { label: t < 0.5 ? a.label : b.label }
  for (const role of SEASON_ROLES) out[role] = blendRole(a[role], b[role], t)
  for (const key of ['flowers', 'leaves', 'snow', 'chill']) {
    out[key] = lerp(a[key], b[key], t)
  }
  return out
}

/** Smoothstep, so a season arrives and leaves gently rather than linearly. */
const smooth = (t) => t * t * (3 - 2 * t)

/**
 * Which season a phase falls in, and how far through it.
 * Phase is 0..1 for one whole year and wraps, like Environment's `time`.
 */
export function seasonAt(phase) {
  const p = ((phase % 1) + 1) % 1
  const f = p * SEASON_ORDER.length
  const index = Math.min(SEASON_ORDER.length - 1, Math.floor(f))
  return { index, name: SEASON_ORDER[index], through: f - index }
}

/** The phase at which a named season starts - and is purely itself. */
export function phaseForSeason(name) {
  const index = SEASON_ORDER.indexOf(name)
  if (index < 0) return null
  return index / SEASON_ORDER.length
}

/**
 * The world's appearance at a point in the year: colours per role plus the
 * flower, leaf and snow amounts. This is the only function the rest of the
 * game needs.
 */
export function seasonView(phase) {
  const { index, name, through } = seasonAt(phase)
  const next = SEASON_ORDER[(index + 1) % SEASON_ORDER.length]

  // Flat for the first (1 - SEASON_BLEND) of the season, then turning.
  const raw = through <= 1 - SEASON_BLEND
    ? 0
    : (through - (1 - SEASON_BLEND)) / SEASON_BLEND

  return blendSeasons(SEASONS[name], SEASONS[next], smooth(raw))
}

/**
 * A blank view, for something that has to hold eased values before it has
 * seen a real one. Same shape, all zeros, so the easing has somewhere to
 * start and no branch is needed on the first frame.
 */
export function emptyView() {
  const out = { label: SEASONS.summer.label }
  for (const role of SEASON_ROLES) out[role] = [0x000000, 0]
  for (const key of ['flowers', 'leaves', 'snow', 'chill']) out[key] = 0
  return out
}

/**
 * Ease `current` toward `target` by one frame.
 *
 * The same exponential the weather uses, and for the same reason: picking a
 * season by hand jumps the phase, and the world must not jump with it. Left
 * to the calendar the phase creeps and the easing is invisible, so there is
 * one path whether the season turned on its own or you chose it.
 *
 * Colours ease amount-weighted too, by easing the tint as a premultiplied
 * pair - otherwise going from winter (white, 0.86) to spring (green, 0.42)
 * would swing through whatever lies on the straight line between white and
 * green while the amount was still high.
 */
/**
 * How fast snow settles, melts, and how fast it does either when you have just
 * picked a season by hand.
 *
 * The slow rates are right for weather: a flurry blows through and its dusting
 * takes a while to go, which is what snow does and what stops five seconds of
 * sleet whitewashing an island. They are wrong for a menu. Measured: a minute
 * after switching from winter to summer the grass was still #63aa52 against
 * its true #5fa84e, because 0.027 of snow was still lying on it - Mike's
 * "the grass doesn't turn as green as the beginning".
 */
export const SNOW_SETTLE = 0.14
export const SNOW_MELT = 0.06
export const SNOW_HURRY = 0.7

export function easeView(current, target, delta, rate = 0.5, hurry = false) {
  const k = 1 - Math.exp(-delta * rate)

  for (const role of SEASON_ROLES) {
    const c = current[role], t = target[role]
    const amount = c[1] + (t[1] - c[1]) * k
    const wc = c[1] * (1 - k)
    const wt = t[1] * k
    const total = wc + wt
    const colour = total < 1e-9 ? c[0] : mixHex(c[0], t[0], wt / total)
    current[role] = [colour, amount]
  }

  for (const key of ['flowers', 'leaves', 'chill']) {
    current[key] += (target[key] - current[key]) * k
  }

  // Snow is deliberately not on the same clock. It settles over a minute or
  // so and takes longer than that to melt, which is both what snow does and
  // what stops a five-second flurry from whitewashing the island.
  const settling = target.snow > current.snow
  const snowRate = hurry
    ? SNOW_HURRY
    : (settling ? SNOW_SETTLE : SNOW_MELT)
  const ks = 1 - Math.exp(-delta * snowRate)
  current.snow += (target.snow - current.snow) * ks

  current.label = target.label
  return current
}
