/**
 * The year.
 *
 * Two things are being guarded here, and both have bitten this project
 * before in another form.
 *
 * The first is the blend. Summer applies no tint at all, so summer's target
 * colour is never read and is written as black. Mixing two seasons' colours
 * straight down the middle would drag the grass toward that black halfway
 * through August, and the bug would look like the sun going out rather than
 * like a blend weighted wrongly. Section 3 drives a whole year through and
 * checks the grass never goes darker than the darkest season it visits.
 *
 * The second is that there is no second code path. Picking a season by hand
 * moves the same phase the calendar moves, so a chosen winter and a winter
 * the year arrived at are the same winter - the same thing setClock and
 * setWeather already do, tested the same way in conditions.mjs.
 *
 * As there, Environment itself cannot be constructed without a browser, so
 * its methods are called against a plain object.
 */
import {
  SEASONS, SEASON_ORDER, SEASON_ROLES, SEASON_BLEND, SNOW_COLOUR, SNOW_TAKE,
  seasonAt, seasonView, phaseForSeason, blendSeasons, easeView, emptyView, mixHex
} from '../src/systems/seasons.js'
import { Environment, WEATHER_TYPES, COLD_FORM } from '../src/systems/Environment.js'
import { readFileSync } from 'fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)

/** Perceived brightness, for "did this go dark" questions. */
const luma = (hex) =>
  0.2126 * ((hex >> 16) & 255) + 0.7152 * ((hex >> 8) & 255) + 0.0722 * (hex & 255)

/** What a material of this base colour actually ends up as. */
const applied = (base, role) => mixHex(base, role[0], role[1])

const GRASS_BASE = 0x5fa84e     // PALETTE.grass, the colour of the lawns

// ---------------------------------------------------------------------------
console.log('1. The table itself\n')

chk('there are four seasons, in order', SEASON_ORDER.length === 4)
chk('and every one of them is in the table',
    SEASON_ORDER.every(s => SEASONS[s]), SEASON_ORDER.filter(s => !SEASONS[s]).join(','))
chk('every season fills in every role',
    SEASON_ORDER.every(s => SEASON_ROLES.every(r => Array.isArray(SEASONS[s][r]))))

// Summer is the identity. This is the guarantee that adding seasons did not
// change what the world looks like by default - the map Mike already has IS
// the summer map, and if this ever fails something has been retuned.
chk('summer tints nothing at all',
    SEASON_ROLES.every(r => SEASONS.summer[r][1] === 0),
    SEASON_ROLES.filter(r => SEASONS.summer[r][1] !== 0).join(','))

for (const name of SEASON_ORDER) {
  const s = SEASONS[name]
  chk(`${name}'s amounts are all in range`,
      SEASON_ROLES.every(r => s[r][1] >= 0 && s[r][1] <= 1))
}

// The drift field shows snow OR leaves, never a mix, and it can only do that
// because no season asks for both. Asserted rather than assumed.
chk('no season drops leaves and snow at the same time',
    SEASON_ORDER.every(s => SEASONS[s].leaves * SEASONS[s].snow === 0),
    SEASON_ORDER.filter(s => SEASONS[s].leaves * SEASONS[s].snow > 0).join(','))
chk('exactly one season drops leaves',
    SEASON_ORDER.filter(s => SEASONS[s].leaves > 0).length === 1)
chk('exactly one season lies under snow',
    SEASON_ORDER.filter(s => SEASONS[s].snow > 0).length === 1)
chk('the snowy season is also the cold one',
    SEASONS.winter.snow === 1 && SEASONS.winter.chill === 1)

// ---------------------------------------------------------------------------
console.log('\n1b. Snow is a covering, not a colour in the table')

// Written the other way round first: winter's grass tint WAS white, and
// `snow` was a number nothing read - eased every frame, handed to World every
// frame, and connected to nothing. A flurry in July settled on nothing at all
// because summer's grass tint is zero. These checks are what noticed.
// Asked as a distance from the snow colour, not as brightness. Brightness
// was the first way I wrote it and it failed on spring's pale sand, which is
// bright and is not snow - the same "measure the thing, not a proxy for it"
// this project keeps relearning.
const rgbGap = (a, b) => Math.hypot(
  ((a >> 16) & 255) - ((b >> 16) & 255),
  ((a >> 8) & 255) - ((b >> 8) & 255),
  (a & 255) - (b & 255))

for (const name of SEASON_ORDER) {
  const s = SEASONS[name]
  const tinted = SEASON_ROLES.filter(r => s[r][1] > 0)
  const nearest = tinted.length ? Math.min(...tinted.map(r => rgbGap(s[r][0], SNOW_COLOUR))) : Infinity
  chk(`no tint of ${name}'s is snow itself (nearest ${nearest.toFixed(0)} away)`,
      nearest > 60, `${nearest.toFixed(0)}`)
}

chk('the roles that hold snow are roles that exist',
    Object.keys(SNOW_TAKE).every(r => SEASON_ROLES.includes(r)),
    Object.keys(SNOW_TAKE).filter(r => !SEASON_ROLES.includes(r)).join(','))
chk('grass holds more snow than sand does', SNOW_TAKE.grass > SNOW_TAKE.ground)
chk('and foliage holds least', SNOW_TAKE.foliage === Math.min(...Object.values(SNOW_TAKE)))
chk('nothing takes more snow than it has surface', Object.values(SNOW_TAKE).every(v => v > 0 && v <= 1))

// The behaviour that the split buys: snow out of season still settles.
const summerGrass = applied(GRASS_BASE, SEASONS.summer.grass)
const dusted = mixHex(summerGrass, SNOW_COLOUR, 0.5 * SNOW_TAKE.grass)
console.log(`   summer grass ${summerGrass.toString(16)}, ` +
            `under half a fall of snow ${dusted.toString(16)}`)
chk('a flurry in summer whitens the ground rather than doing nothing',
    luma(dusted) > luma(summerGrass) + 40,
    `${luma(dusted).toFixed(0)} vs ${luma(summerGrass).toFixed(0)}`)

// And a full winter is whiter still than a summer flurry.
const winterGrass = mixHex(applied(GRASS_BASE, SEASONS.winter.grass), SNOW_COLOUR, SNOW_TAKE.grass)
chk('deep winter is whiter than a summer flurry', luma(winterGrass) > luma(dusted),
    `${luma(winterGrass).toFixed(0)} vs ${luma(dusted).toFixed(0)}`)

// ---------------------------------------------------------------------------
console.log('\n2. Where you are in the year')

chk('mixHex at either end is that end',
    mixHex(0x102030, 0xa0b0c0, 0) === 0x102030 &&
    mixHex(0x102030, 0xa0b0c0, 1) === 0xa0b0c0)
chk('and halfway is halfway', mixHex(0x000000, 0xffffff, 0.5) === 0x808080,
    mixHex(0x000000, 0xffffff, 0.5).toString(16))

for (const name of SEASON_ORDER) {
  const phase = phaseForSeason(name)
  chk(`${name} starts at phase ${phase.toFixed(2)}`, seasonAt(phase).name === name,
      seasonAt(phase).name)
}
chk('an unknown season has no phase', phaseForSeason('monsoon') === null)

// Picking a season must land you IN it, not on the cusp of the next one -
// otherwise choosing Winter would give you a world already melting.
for (const name of SEASON_ORDER) {
  const view = seasonView(phaseForSeason(name))
  chk(`picking ${name} gives ${name} undiluted`,
      SEASON_ROLES.every(r =>
        view[r][1] === SEASONS[name][r][1] &&
        (view[r][1] === 0 || view[r][0] === SEASONS[name][r][0])),
      view.label)
}

chk('the year wraps rather than falling off the end',
    seasonAt(0.999).name === SEASON_ORDER[3] && seasonAt(1.001).name === SEASON_ORDER[0])
chk('and the wrap blends back into the first season',
    seasonView(0.999).label === SEASONS.spring.label, seasonView(0.999).label)

chk(`each season is flat for ${((1 - SEASON_BLEND) * 100).toFixed(0)}% of its run`,
    seasonView(phaseForSeason('autumn') + 0.24 / 4).foliage[1] === SEASONS.autumn.foliage[1])

// ---------------------------------------------------------------------------
console.log('\n3. A whole year, sampled - nothing goes dark or out of range')

// The real question this asks: does the summer-to-autumn blend, where one end
// tints and the other does not, ever produce a colour outside the range the
// four seasons themselves cover? A straight colour mix does. The weighted one
// should not.
const pureGrass = SEASON_ORDER.map(s => applied(GRASS_BASE, SEASONS[s].grass))
const darkest = Math.min(...pureGrass.map(luma))
const lightest = Math.max(...pureGrass.map(luma))
console.log(`   pure seasons run from luma ${darkest.toFixed(0)} to ${lightest.toFixed(0)}`)

let worstDark = Infinity, worstLight = -Infinity, worstAt = 0
let badAmount = null
for (let i = 0; i < 4000; i++) {
  const phase = i / 4000
  const view = seasonView(phase)
  const l = luma(applied(GRASS_BASE, view.grass))
  if (l < worstDark) { worstDark = l; worstAt = phase }
  worstLight = Math.max(worstLight, l)
  for (const r of SEASON_ROLES) {
    if (view[r][1] < -1e-9 || view[r][1] > 1 + 1e-9) badAmount = `${r} ${view[r][1]}`
  }
  for (const k of ['flowers', 'leaves', 'snow', 'chill']) {
    if (view[k] < -1e-9 || view[k] > 1 + 1e-9) badAmount = `${k} ${view[k]}`
  }
}
console.log(`   over the year it runs ${worstDark.toFixed(0)} to ${worstLight.toFixed(0)}` +
            ` (darkest at phase ${worstAt.toFixed(3)})`)
chk('the grass never goes darker than the darkest season',
    worstDark >= darkest - 1, `${worstDark.toFixed(1)} vs ${darkest.toFixed(1)}`)
chk('nor lighter than the lightest', worstLight <= lightest + 1,
    `${worstLight.toFixed(1)} vs ${lightest.toFixed(1)}`)
chk('and every amount stays between 0 and 1', badAmount === null, badAmount || '')

// The same thing said directly: the one blend where an untinted season meets
// a tinted one is where a straight mix goes wrong.
const midSummerAutumn = blendSeasons(SEASONS.summer, SEASONS.autumn, 0.5)
const naive = mixHex(SEASONS.summer.grass[0], SEASONS.autumn.grass[0], 0.5)
console.log(`   weighted ${midSummerAutumn.grass[0].toString(16)}, ` +
            `straight mix would be ${naive.toString(16)}`)
chk('halfway from summer to autumn takes autumn\'s colour, not half of black',
    midSummerAutumn.grass[0] === SEASONS.autumn.grass[0],
    midSummerAutumn.grass[0].toString(16))
chk('at half the strength', Math.abs(midSummerAutumn.grass[1] - SEASONS.autumn.grass[1] / 2) < 1e-9)

// ---------------------------------------------------------------------------
console.log('\n4. Nothing snaps, and snow melts slower than it falls')

const view = emptyView()
chk('a blank view has every role', SEASON_ROLES.every(r => Array.isArray(view[r])))

const easing = emptyView()
const winter = seasonView(phaseForSeason('winter'))
easeView(easing, winter, 1 / 30)
chk('one frame does not arrive at winter', easing.grass[1] < 0.1, `${easing.grass[1]}`)

for (let i = 0; i < 30 * 30; i++) easeView(easing, winter, 1 / 30)
chk(`after thirty seconds the tint is there (${easing.grass[1].toFixed(2)} of ${winter.grass[1]})`,
    easing.grass[1] > winter.grass[1] * 0.95, `${easing.grass[1]}`)

// Snow deliberately lags the tint - it settles over a minute or so.
const settling = emptyView()
for (let i = 0; i < 30 * 30; i++) easeView(settling, winter, 1 / 30)
console.log(`   after 30s: tint ${settling.grass[1].toFixed(2)}, snow ${settling.snow.toFixed(2)}`)
chk('snow lags behind the colour rather than appearing with it',
    settling.snow < settling.grass[1] / winter.grass[1], `${settling.snow.toFixed(2)}`)

// And melting is slower than settling: measure both from the same distance.
const summer = seasonView(phaseForSeason('summer'))
const falls = emptyView()
for (let i = 0; i < 30 * 60; i++) easeView(falls, winter, 1 / 30)
const settled = falls.snow
const melting = { ...falls }
for (let i = 0; i < 30 * 60; i++) easeView(melting, summer, 1 / 30)
const gainedInAMinute = settled
const lostInAMinute = settled - melting.snow
console.log(`   a minute of winter settles ${gainedInAMinute.toFixed(2)}; ` +
            `a minute of summer melts ${lostInAMinute.toFixed(2)}`)
chk('snow takes longer to melt than it took to settle',
    lostInAMinute < gainedInAMinute, `${lostInAMinute.toFixed(2)} vs ${gainedInAMinute.toFixed(2)}`)

// ---------------------------------------------------------------------------
console.log('\n5. Picking a season by hand')

const stub = () => ({
  seasonPhase: phaseForSeason('summer'),
  seasonLocked: false,
  timeLocked: false,
  weatherLocked: false,
  weatherTimer: 0,
  weatherDuration: 60,
  season: seasonView(phaseForSeason('summer')),
  current: { ...WEATHER_TYPES.clear },
  target: { ...WEATHER_TYPES.clear },
  updateSun() {}
})

const setSeason = (e, s) => Environment.prototype.setSeason.call(e, s)
const getSeason = (e) => Environment.prototype.getSeason.call(e)
const resumeAuto = (e) => Environment.prototype.resumeAuto.call(e)
const isManual = (e) => Environment.prototype.isManual.call(e)
const chill = (e, k) => Environment.prototype.chill.call(e, k)

const held = stub()
chk('nothing is held to begin with', !isManual(held))
setSeason(held, 'winter')
chk('picking a season holds it', held.seasonLocked === true)
chk('and it is the season you picked', getSeason(held) === 'winter', getSeason(held))
chk('and the box reads as manual', isManual(held))
chk('the clock is still automatic', held.timeLocked === false)

resumeAuto(held)
chk('going back to automatic releases the season', held.seasonLocked === false)
chk('and the box stops saying manual', !isManual(held))

chk('an unknown season is ignored rather than crashing', (() => {
  const e = stub()
  setSeason(e, 'monsoon')
  return getSeason(e) === 'summer' && e.seasonLocked === false
})())

// The point of setSeason moving the phase rather than setting an appearance:
// what you get by hand is byte-for-byte what the calendar would have given.
const byHand = stub()
setSeason(byHand, 'autumn')
const arrivedAt = seasonView(phaseForSeason('autumn'))
chk('a season chosen is the same object a season arrived at',
    JSON.stringify(seasonView(byHand.seasonPhase)) === JSON.stringify(arrivedAt))

// ---------------------------------------------------------------------------
console.log('\n6. Snow falls because it is cold, not because there are two chains')

chk('snowing is a real weather', !!WEATHER_TYPES.snowing)
chk('and it is the only one that falls as snow',
    Object.entries(WEATHER_TYPES).filter(([, w]) => w.flake > 0).map(([k]) => k).join() === 'snowing')
chk('every weather declares whether it is snow',
    Object.values(WEATHER_TYPES).every(w => typeof w.flake === 'number'))
chk('snowing still puts something in the sky', WEATHER_TYPES.snowing.rain > 0)
chk('and is brighter than rain, because snow is',
    WEATHER_TYPES.snowing.lightMul > WEATHER_TYPES.showers.lightMul)

const warm = stub()
warm.season = seasonView(phaseForSeason('summer'))
chk('in summer showers stay showers', chill(warm, 'showers') === 'showers')
chk('and clear stays clear', chill(warm, 'clear') === 'clear')

const cold = stub()
cold.season = seasonView(phaseForSeason('winter'))
chk('in winter showers become snow', chill(cold, 'showers') === 'snowing')
chk('and so do storms', chill(cold, 'storm') === 'snowing')
chk('but a clear winter day is still clear', chill(cold, 'clear') === 'clear')
chk('and a cloudy one is still cloudy', chill(cold, 'cloudy') === 'cloudy')

chk('only wet conditions have a cold form',
    Object.keys(COLD_FORM).every(k => WEATHER_TYPES[k].rain > 0))
chk('and every cold form is a real weather',
    Object.values(COLD_FORM).every(k => WEATHER_TYPES[k]))

// Late autumn converts sometimes, not always - a first snowfall, not a switch.
const autumnal = stub()
autumnal.season = seasonView(phaseForSeason('autumn'))
let converted = 0
for (let i = 0; i < 2000; i++) if (chill(autumnal, 'showers') === 'snowing') converted++
console.log(`   autumn chill ${autumnal.season.chill}: ${converted} of 2000 showers turned to snow`)
chk('autumn snows occasionally rather than never or always',
    converted > 100 && converted < 900, `${converted}`)

// ---------------------------------------------------------------------------
console.log('\n7. The panel offers every season and the new weather')

const html = readFileSync(ROOT + 'index.html', 'utf8')
const seasonsOffered = [...html.matchAll(/data-season="([^"]+)"/g)].map(m => m[1])
const weathersOffered = [...html.matchAll(/data-weather="([^"]+)"/g)].map(m => m[1])
console.log(`   seasons: ${seasonsOffered.join(', ')}`)

chk('every season can be picked',
    SEASON_ORDER.every(s => seasonsOffered.includes(s)),
    SEASON_ORDER.filter(s => !seasonsOffered.includes(s)).join(','))
chk('and every button is a real season',
    seasonsOffered.every(s => SEASONS[s]),
    seasonsOffered.filter(s => !SEASONS[s]).join(','))
chk('snowing is offered too', weathersOffered.includes('snowing'))

// ---------------------------------------------------------------------------
console.log('\n8. World.js, read rather than run')

// World.js needs a browser, so this reads it - the same approach worldsanity
// takes. What it is checking is that the season reaches the world through the
// registry and nothing else: no snow mesh, no second surface over the grass.
const world = readFileSync(ROOT + 'src/world/World.js', 'utf8')

for (const role of SEASON_ROLES) {
  const uses = (world.match(new RegExp(`registerSeasonal\\([^)]*'${role}'`, 'g')) || []).length
  chk(`something registers as ${role} (${uses} place${uses === 1 ? '' : 's'})`, uses > 0)
}

chk('setSeason paints registered materials and nothing else',
    /setSeason\s*\(view\)\s*\{[\s\S]*?for \(const entry of this\.seasonals\)/.test(world))
chk('the base colour is captured at registration, not read back each time',
    /base: material\.color\.getHex\(\)/.test(world))
chk('the tint is always computed from that base',
    /mixHex\(\s*entry\.base/.test(world))

// The trap this avoids: a white mesh laid over the grass for snow would be a
// second surface a few centimetres above a first one, which is item 29 and
// has already shown through the tarmac three times.
chk('no snow mesh is added over the ground',
    !/snowMesh|snowLayer|createSnow\b/.test(world))

// Snow has to reach the materials, or it is a number nothing reads.
chk('lying snow is applied on top of the season tint',
    /mixHex\(seasonal, SNOW_COLOUR/.test(world))
chk('and how much each surface holds comes from the table',
    /SNOW_TAKE\[entry\.role\]/.test(world))

// Flowers grow rather than pop, and only get rewritten when they move.
chk('the flower field is instanced, not a mesh per flower',
    /new THREE\.InstancedMesh\(stemGeo/.test(world))
chk('and it only rewrites when the amount has actually changed',
    /Math\.abs\(a - this\.flowering\) < /.test(world))
chk('the palms take only a fraction of the season',
    /registerSeasonal\(frondMat, 'foliage', 0\.\d+\)/.test(world))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
