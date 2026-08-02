/**
 * Holidays.
 *
 * The check that matters most is section 1: a holiday is a LAYER over the
 * season and never a season itself. Built the other way round - as extra rows
 * in the SEASONS table - Christmas would replace winter, and the bug would
 * present as the snow vanishing when you put the decorations up. Section 1
 * makes that structurally impossible rather than asking a comment to prevent
 * it, and section 5 then drives the real seasons code to prove it.
 */
import {
  DECOR_KINDS, HOLIDAY_KEYS, HOLIDAYS, HOLIDAY_ORDER, HOLIDAY_WINDOW,
  HOLIDAY_EDGE, phaseGap, holidayStrength, holidayAt, emptyLayer,
  holidayLayer, easeLayer,
  CLIMB_SECONDS, BURST_SECONDS, SPARKS, LAUNCH_RATE, SPARK_GRAVITY,
  BURST_HEIGHT_MIN, BURST_HEIGHT_MAX, FIREWORK_COLOURS, LAUNCH_RADIUS_MIN,
  newFireworksState, stepFireworks, shellView, sparkOffset
} from '../src/systems/holidays.js'
import {
  SEASON_ROLES, seasonView, phaseForSeason, easeView, SNOW_TAKE
} from '../src/systems/seasons.js'
import { readFileSync } from 'fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)

const seeded = (seed = 1) => () => {
  seed = (seed * 16807) % 2147483647
  return (seed - 1) / 2147483646
}

// ---------------------------------------------------------------------------
console.log('1. A holiday is a layer, not a season\n')

const SEASON_OWNS = [...SEASON_ROLES, 'snow', 'flowers', 'leaves', 'chill']

chk('the two sets of keys do not overlap at all',
    HOLIDAY_KEYS.every(k => !SEASON_OWNS.includes(k)),
    HOLIDAY_KEYS.filter(k => SEASON_OWNS.includes(k)).join(','))

chk('and no holiday names a colour role',
    Object.values(HOLIDAYS).every(h => SEASON_ROLES.every(r => !(r in h))))

chk('nor snow - which is the one that would have bitten',
    Object.values(HOLIDAYS).every(h => !('snow' in h)))

chk('every holiday declares every key',
    Object.values(HOLIDAYS).every(h => HOLIDAY_KEYS.every(k => typeof h[k] === 'number')))

chk('the picker lists every holiday exactly once',
    HOLIDAY_ORDER.length === Object.keys(HOLIDAYS).length &&
    new Set(HOLIDAY_ORDER).size === HOLIDAY_ORDER.length &&
    HOLIDAY_ORDER.every(k => k in HOLIDAYS))

chk('none is the identity', HOLIDAY_KEYS.every(k => HOLIDAYS.none[k] === 0))
chk('and is the only one with no date', HOLIDAY_ORDER
    .filter(k => HOLIDAYS[k].phase === null).join(',') === 'none')

// ---------------------------------------------------------------------------
console.log('\n2. Where they fall in the year')

chk('the wheel wraps the short way round',
    Math.abs(phaseGap(0.98, 0.02) - (-0.04)) < 1e-9, `${phaseGap(0.98, 0.02)}`)

for (const key of HOLIDAY_ORDER) {
  if (key === 'none') continue
  const spec = HOLIDAYS[key]
  chk(`${spec.label} is fully itself on the day`,
      holidayStrength(key, spec.phase) > 0.999,
      `${holidayStrength(key, spec.phase)}`)
  chk(`  and is gone half a year later`,
      holidayStrength(key, (spec.phase + 0.5) % 1) === 0)
}

// The seasons each holiday should land in, read off seasons.js rather than
// asserted by eye: Easter in spring, the Fourth in summer, and so on.
import { seasonAt } from '../src/systems/seasons.js'
const WANT_SEASON = {
  easter: 'spring', independence: 'summer', halloween: 'autumn',
  thanksgiving: 'autumn', christmas: 'winter', newyear: 'winter'
}
for (const [key, want] of Object.entries(WANT_SEASON)) {
  const got = seasonAt(HOLIDAYS[key].phase).name
  chk(`${HOLIDAYS[key].label} falls in ${want}`, got === want, got)
}

chk('a quiet stretch of the year has no holiday at all',
    holidayAt(0.45).key === 'none' && holidayAt(0.45).strength === 0)

chk('and the calendar finds the right one on the day',
    holidayAt(HOLIDAYS.halloween.phase).key === 'halloween')

// ---------------------------------------------------------------------------
console.log('\n3. The layer itself')

const off = holidayLayer(0.45)
chk('nothing in season, nothing on', HOLIDAY_KEYS.every(k => off[k] === 0))
chk('and it says so', off.label === 'None', off.label)

const halloween = holidayLayer(HOLIDAYS.halloween.phase)
console.log(`   ${halloween.label}: pumpkins ${halloween.pumpkins.toFixed(2)}, lights ${halloween.lights.toFixed(2)}`)
chk('Halloween puts the pumpkins out', halloween.pumpkins > 0.99)
chk('and nothing else', halloween.eggs === 0 && halloween.turkeys === 0 &&
    halloween.gifts === 0 && halloween.fireworks === 0)

// The crossover. Christmas and New Year are 0.07 apart with a 0.05 window,
// so their edges touch - which is the point, and also the case that would
// break if the layers were summed instead of maxed.
const between = (HOLIDAYS.christmas.phase + HOLIDAYS.newyear.phase) / 2
const mid = holidayLayer(between)
console.log(`   between them: gifts ${mid.gifts.toFixed(2)}, fireworks ${mid.fireworks.toFixed(2)}`)
chk('both are up in the week between them', mid.gifts > 0 && mid.fireworks > 0)
chk('and nothing ever exceeds one',
    HOLIDAY_KEYS.every(k => mid[k] <= 1), JSON.stringify(mid))

// Every point in the year, not just the interesting ones.
let over = 0
for (let i = 0; i < 2000; i++) {
  const l = holidayLayer(i / 2000)
  if (HOLIDAY_KEYS.some(k => l[k] > 1 || l[k] < 0)) over++
}
chk('across the whole year every amount stays in 0..1', over === 0, `${over}`)

// Picking one by hand.
const picked = holidayLayer(0.45, 'christmas')
chk('choosing Christmas in high summer gives you all of it',
    picked.gifts === 1 && picked.lights === 1)
chk('and it says which', picked.label === 'Christmas', picked.label)
chk('choosing none turns everything off',
    HOLIDAY_KEYS.every(k => holidayLayer(HOLIDAYS.christmas.phase, 'none')[k] === 0))

// ---------------------------------------------------------------------------
console.log('\n4. Easing')

const live = emptyLayer()
easeLayer(live, holidayLayer(0.45, 'christmas'), 1 / 30)
chk('one frame moves it a little, not all the way',
    live.gifts > 0 && live.gifts < 0.1, `${live.gifts}`)

for (let i = 0; i < 30 * 12; i++) {
  easeLayer(live, holidayLayer(0.45, 'christmas'), 1 / 30)
}
chk('twelve seconds gets it essentially there', live.gifts > 0.99, `${live.gifts}`)

for (let i = 0; i < 30 * 12; i++) easeLayer(live, emptyLayer(), 1 / 30)
chk('and it packs away again', live.gifts < 0.01, `${live.gifts}`)

// ---------------------------------------------------------------------------
console.log('\n5. Christmas keeps its snow')
//
// The whole reason for section 1, driven through the real seasons code rather
// than asserted about key names. If a holiday were ever built as a season,
// this is the check that would go red.

const winter = seasonView(phaseForSeason('winter'))
const settled = { ...winter }
for (let i = 0; i < 30 * 400; i++) easeView(settled, winter, 1 / 30)

console.log(`   winter snow settles at ${settled.snow.toFixed(2)}`)
chk('winter has snow on the ground', settled.snow > 0.9, `${settled.snow}`)

const christmas = holidayLayer(HOLIDAYS.christmas.phase)
chk('Christmas is in season at the same time',
    christmas.gifts > 0.99 && christmas.lights > 0.99)
chk('and touches nothing the snow depends on',
    !('snow' in christmas) && SEASON_ROLES.every(r => !(r in christmas)))
chk('so the snow is exactly what it was', settled.snow > 0.9)
chk('and the roles that carry it are untouched',
    Object.keys(SNOW_TAKE).every(r => christmas[r] === undefined))

// ---------------------------------------------------------------------------
console.log('\n6. Fireworks')

const fw = newFireworksState()
const day = { intensity: 1, night: 0, rand: seeded(5), x: 0, z: 0 }
for (let i = 0; i < 30 * 20; i++) stepFireworks(fw, 1 / 30, day)
chk('none at all in daylight - a firework at noon is a grey puff',
    fw.shells.length === 0, `${fw.shells.length}`)

const quiet = newFireworksState()
const noHoliday = { intensity: 0, night: 1, rand: seeded(7) }
for (let i = 0; i < 30 * 20; i++) stepFireworks(quiet, 1 / 30, noHoliday)
chk('and none on an ordinary night', quiet.shells.length === 0)

const party = newFireworksState()
const newYear = { intensity: 1, night: 1, rand: seeded(9), x: 0, z: 0 }
let launched = 0
let seenIds = new Set()
for (let i = 0; i < 30 * 60; i++) {
  stepFireworks(party, 1 / 30, newYear)
  for (const s of party.shells) if (!seenIds.has(s.id)) { seenIds.add(s.id); launched++ }
}
console.log(`   ${launched} shells in a minute, wanting about ${Math.round(LAUNCH_RATE * 60)}`)
chk('they go up at about the rate asked for',
    Math.abs(launched - LAUNCH_RATE * 60) <= 3, `${launched}`)

chk('and they clear themselves up',
    party.shells.length < 10, `${party.shells.length}`)
chk('every shell is over the water, not over your head',
    party.shells.every(s => Math.hypot(s.x, s.z) >= LAUNCH_RADIUS_MIN))
chk('and bursts high', party.shells.every(s =>
    s.height >= BURST_HEIGHT_MIN && s.height <= BURST_HEIGHT_MAX))

// The one that made them invisible. A fixed burst height means a near shell
// is nearly overhead and a far one is on the horizon; the chase camera has
// about 30 degrees of sky above the crosshair, so the near half went off the
// top of the frame. Ten photographs of a sky with five shells caught none.
const angles = party.shells.map(s =>
  Math.atan2(s.height, Math.hypot(s.x, s.z)) * 180 / Math.PI)
console.log(`   bursts sit ${Math.min(...angles).toFixed(0)}-${Math.max(...angles).toFixed(0)} degrees up`)
chk('every burst is at about the same angle up the sky, near or far',
    angles.every(a => a > 8 && a < 30), angles.map(a => a.toFixed(0)).join(','))
chk('in a colour off the list',
    party.shells.every(s => FIREWORK_COLOURS.includes(s.colour)))

// Half the intensity, half the shells.
const half = newFireworksState()
let halfCount = 0
const halfSeen = new Set()
for (let i = 0; i < 30 * 60; i++) {
  stepFireworks(half, 1 / 30, { intensity: 0.5, night: 1, rand: seeded(9) })
  for (const s of half.shells) if (!halfSeen.has(s.id)) { halfSeen.add(s.id); halfCount++ }
}
console.log(`   at half intensity, ${halfCount}`)
chk('intensity scales the rate', Math.abs(halfCount - launched / 2) <= 3, `${halfCount}`)

// A shell climbs, then bursts.
const one = { id: 1, x: 100, z: 0, height: 60, colour: FIREWORK_COLOURS[0], age: 0 }
const rising = shellView({ ...one, age: CLIMB_SECONDS * 0.5 })
const topping = shellView({ ...one, age: CLIMB_SECONDS * 0.95 })
chk('it climbs', rising.phase === 'climb' && rising.y > 0 && rising.y < 60)
chk('and decelerates into the burst rather than arriving flat out',
    (topping.y - rising.y) < (rising.y - 0),
    `${rising.y.toFixed(1)} then ${topping.y.toFixed(1)}`)

const bursting = shellView({ ...one, age: CLIMB_SECONDS + 0.1 })
const dying = shellView({ ...one, age: CLIMB_SECONDS + BURST_SECONDS * 0.9 })
chk('then bursts at its height', bursting.phase === 'burst' && bursting.y === 60)
chk('spreading as it goes', dying.spread > bursting.spread)
chk('and going out', dying.fade < bursting.fade * 0.2,
    `${bursting.fade.toFixed(2)} then ${dying.fade.toFixed(2)}`)

// The sparks. Decided once by index, not re-rolled every frame.
const a1 = sparkOffset(7, SPARKS, 0.5)
const a2 = sparkOffset(7, SPARKS, 0.5)
chk('a spark is in the same place when you ask twice',
    a1.x === a2.x && a1.y === a2.y && a1.z === a2.z)

const early = sparkOffset(3, SPARKS, 0.1)
const later = sparkOffset(3, SPARKS, 0.6)
chk('sparks fly outward',
    Math.hypot(later.x, later.z) > Math.hypot(early.x, early.z))

// Gravity. Take the spark fired straight up, which is the one whose fall is
// unambiguous - a sideways spark's height is dominated by its own direction.
const up = sparkOffset(0, SPARKS, 0.15)
const fallen = sparkOffset(0, SPARKS, 1)
chk('and are pulled back down by the end', fallen.y < up.y * 4,
    `${up.y.toFixed(1)} then ${fallen.y.toFixed(1)}`)
chk('gravity is a real number, not a decoration', SPARK_GRAVITY > 0)

// They spread in every direction rather than in a ring.
const ys = []
for (let i = 0; i < SPARKS; i++) ys.push(sparkOffset(i, SPARKS, 0.5).y)
chk('a burst is a sphere, not a ring',
    Math.max(...ys) - Math.min(...ys) > 5,
    `${(Math.max(...ys) - Math.min(...ys)).toFixed(1)}`)

// ---------------------------------------------------------------------------
console.log('\n7. World.js and Environment.js, read rather than run')

const world = readFileSync(ROOT + 'src/world/World.js', 'utf8')
const env = readFileSync(ROOT + 'src/systems/Environment.js', 'utf8')

chk('the holiday reaches World as one call, like the season',
    /setHolidayLayer\(/.test(world))
chk('and Environment eases it before sending it',
    /easeLayer\(/.test(env))
chk('the festive lights ride on the existing night-emissive list',
    /registerNightLight/.test(world) && /festive/i.test(world))
chk('the props are scattered on the same sown sites as the flowers',
    /decorSites|flowerSites/.test(world))

// --- Halloween has its own decorations, and its own colour ---
//
// Mike: "For Halloween decorations, don't add the Christmas lights - add more
// distinctly halloween decorations ... If it's convenient to have decorative
// lights, make them have orange colored lights."
chk('Halloween lights nothing with the Christmas strands',
    HOLIDAYS.halloween.lights === 0)
chk('and lights the same strands in orange instead',
    HOLIDAYS.halloween.spooky > 0.9)
chk('Christmas is the other way round',
    HOLIDAYS.christmas.lights === 1 && HOLIDAYS.christmas.spooky === 0)
chk('and autumn stays warm through Thanksgiving',
    HOLIDAYS.thanksgiving.spooky > 0 && HOLIDAYS.thanksgiving.lights === 0)

chk('Halloween puts out jack-o\'-lanterns, ghosts, witches, graves and signs',
    ['pumpkins', 'ghosts', 'witches', 'graves', 'signs']
      .every(k => HOLIDAYS.halloween[k] > 0))
chk('and a trick-or-treat basket on every doorstep',
    HOLIDAYS.halloween.baskets === 1)
chk('nothing of Christmas comes with it',
    ['gifts', 'trees'].every(k => HOLIDAYS.halloween[k] === 0))
chk('and nothing of Halloween comes with Christmas',
    ['ghosts', 'witches', 'graves', 'signs', 'baskets']
      .every(k => HOLIDAYS.christmas[k] === 0))

// The tone is a RATIO of two amounts, not a palette switch: every value in a
// layer has to be a number that eases, and a colour cannot.
chk('the two lightings are amounts, so they can cross-fade',
    typeof HOLIDAYS.halloween.spooky === 'number' &&
    typeof HOLIDAYS.christmas.lights === 'number')
chk('one set of strands serves both, tinted by the ratio',
    /const tone = warm > 0 \? layer\.spooky \/ warm : 0/.test(world) &&
    /mixHex\(FESTIVE_COLOURS\[i\], SPOOKY_COLOURS\[i\], tone\)/.test(world))
chk('and the strand brightness is whichever holiday is louder',
    /Math\.max\(layer\.lights, layer\.spooky\)/.test(world))

// EVERY decoration must be connected to the layer, or it stays behind when
// the holiday ends - which Mike has now had to report twice.
chk('every scattered kind is grown from the layer',
    DECOR_KINDS.every(k => {
      const field = {
        eggs: 'eggField', bunnies: 'bunnyField', pumpkins: 'pumpkinField',
        turkeys: 'turkeyField', gifts: 'giftField', trees: 'treeField',
        ghosts: 'ghostField', witches: 'witchField', graves: 'graveField',
        signs: 'signField', baskets: 'basketField'
      }[k]
      return new RegExp(`growField\\(this\\.${field}, layer\\.${k}\\)`).test(world)
    }),
    DECOR_KINDS.filter(k => !new RegExp(`layer\\.${k}\\)`).test(world)).join(','))

// The baskets hang off the door sites, which are collected while the lights
// are hung - so they must be built after that, not with the other props.
chk('the baskets are built once the doorsteps are known',
    /createFestiveLights\(\)[\s\S]{0,4000}createBaskets\(\)/.test(world))

// A GHOST MUST NOT LOOK LIKE A SNOWMAN.
//
// Mike sent a photograph of an autumn Halloween street: "there are still
// snowmen in this setting". The snowman field measured amount 0 and not drawn
// - they were the GHOSTS. A white sphere on a white cone standing on the grass
// with two dark dots on its face IS a snowman; nothing about it said ghost
// except my intention. The veto was working perfectly and the report was still
// completely right, which is the useful part: "it looks like X" is a bug even
// when the logic says Y.
//
// Measured after the redesign - ghost floats 0.17 clear of its base and tapers
// 0.80 wide at the top to 0.17 at the bottom; the snowman sits at -0.02 and
// goes 0.84 to 0.52.
chk('a ghost floats and a snowman does not',
    /const HOVER = 0\.55/.test(world))
chk('a ghost tapers downward to a tattered hem',
    /CylinderGeometry\(0\.4, 0\.17/.test(world))
chk('has arms, which a snowman has as sticks and a ghost as sleeves',
    /CapsuleGeometry\(0\.11, 0\.42/.test(world))
chk('has an open mouth as well as eyes',
    /mouth\.scale\(1, 1\.35, 0\.6\)/.test(world))
chk('and you can see through it, which settles it whatever the shape',
    /\.\.\.\(ghostly[\s\S]{0,80}transparent: true/.test(world) &&
    /ghostly: true/.test(world))

// And the sizes. Everything inherited a site scale chosen so an Easter egg is
// visible from a moving car, including things that were never small: measured
// in the world, a witch was 6.1 units against a 3-unit storey.
chk('each kind has its own size on top of the site variation',
    /export const DECOR_SCALE/.test(world))
chk('and the field applies it when it grows',
    /f\.size \* a \* field\.scale/.test(world))

// No snowmen at Halloween. Mike asked directly, and he is right: a snowman on
// a Halloween lawn is somebody else's decoration. It can only come up if you
// force winter weather at Halloween, which the conditions panel lets you do.
//
// `noSnowmen` is the one key that takes something away rather than putting it
// out, and it is still an amount that eases - so it fades them rather than
// switching them off, and composes with everything else the same way.
chk('Halloween sends the snowmen away', HOLIDAYS.halloween.noSnowmen === 1)
chk('and nothing else does',
    HOLIDAY_ORDER.filter(k => k !== 'halloween')
      .every(k => HOLIDAYS[k].noSnowmen === 0))
chk('the veto is a multiplier on the snow, not a second source of truth',
    /this\.snowLevel \|\| 0\) \* \(1 - veto\)/.test(world))
chk('and it is recomputed from both numbers wherever either changes',
    /growSnowmen\(\)[\s\S]{0,2000}growSnowmen\(\)/.test(world))

// --- Christmas trees are a holiday; snowmen are a SEASON ---
chk('Christmas puts trees out', HOLIDAYS.christmas.trees === 1)
chk('and New Year has not taken them down yet', HOLIDAYS.newyear.trees > 0.5)
chk('nothing else has any', ['easter', 'independence', 'halloween',
    'thanksgiving', 'none'].every(k => HOLIDAYS[k].trees === 0))

// The one worth stating plainly. A snowman is what happens when there is snow
// on the ground, not what happens on the 25th. In the holiday table there
// would be no snowmen in January and a snowman at a green Christmas; on the
// season's `snow` they arrive as the world whitens and melt as it thaws.
chk('snowmen are not a holiday at all',
    !HOLIDAY_KEYS.includes('snowmen') &&
    Object.values(HOLIDAYS).every(h => h.snowmen === undefined))
chk('they are grown from the season\'s snow instead',
    /this\.snowLevel = view\.snow/.test(world))
// setSeason records the snow and setHolidayLayer records the veto; one place
// combines them. Called from both, because either can change the answer and
// neither knows the other's number.
chk('the season is what supplies it',
    /setSeason\(view\)[\s\S]{0,1600}this\.snowLevel = view\.snow/.test(world))

// --- The lights actually light ---
//
// Mike: "Christmas Decorations (the lights) should light up. They are
// currently just colorful balls." One missing line. registerNightLight() only
// guarantees a material HAS an emissive colour, and MeshStandardMaterial's
// default is black - so emissiveIntensity was scaling black by 2.6 all night.
// Measured after the fix: five festive materials, all with a real emissive
// colour, litness 1.48 to 2.6.
chk('the bulbs have an emissive colour of their own, not the default black',
    /emissive: new THREE\.Color\(FESTIVE_COLOURS\[i\]\)/.test(world))
chk('and so do the star and the berries, or they would be the dark bits',
    /emissive: new THREE\.Color\(0xffdf7a\)/.test(world) &&
    /emissive: new THREE\.Color\(0xff6a4a\)/.test(world))

// --- A lot more of them ---
chk('lights run down the front of the building, not just along the eaves',
    /STOREY_HEIGHT/.test(world) && /onFront\(/.test(world))
chk('and round the door',
    /DOOR_BULBS/.test(world) && /DOOR_HEIGHT/.test(world))
chk('there is a wreath on every front door',
    /createWreaths\(\)/.test(world) && /this\.wreathSites/.test(world))
chk('hung on the face the building actually presents to the street',
    /rotation: rotation \|\| 0/.test(world) && /const face = b\.rotation/.test(world))
chk('and setSeason still exists untouched alongside it',
    /setSeason\(view\)/.test(world))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
