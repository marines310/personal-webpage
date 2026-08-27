/**
 * The words the player reads.
 *
 * Mike, having opened the garage: "the Monorail and Tow Truck seem to have
 * lower case names. Can we iron out the spelling/caps issues?"
 *
 * Both were the same shape of fault, and it is a shape worth a test of its
 * own, because nothing else in this suite is looking at it. Everywhere in this
 * world, an internal identifier and a display name are the same string until
 * somebody says otherwise:
 *
 *   THE VEHICLES   `VEHICLE_KINDS` is `Object.keys(TRAFFIC_LENGTHS)`, so a new
 *                  kind appears in the picker by itself - deliberately. Its
 *                  NAME does not, and `label()` fell back to the raw key, so
 *                  the tow truck and the monorail sat in the garage as "tow"
 *                  and "monorail" beside "Monster Truck" and "Fire Engine".
 *   THE ISLANDS    five places wrote `island.name || island.id`, and the hub's
 *                  name is deliberately blank - so the driver's panel read
 *                  "hub" while the next station along read SKILLS, and the
 *                  fire service was dispatched to HUB.
 *
 * Neither threw. Both looked deliberate. That is what this file is for: a
 * fallback to an identifier is not a bug the code can notice, so it has to be
 * a bug a test notices.
 *
 * The rule this checks, stated once: **anything a player reads is written for
 * them.** Vehicle names are Title Case, because that is how a thing on a
 * forecourt is labelled. Place names are UPPER CASE, because that is how this
 * world signs its islands and its stations.
 */
import { readFileSync } from 'node:fs'
import {
  TRAFFIC_LENGTHS, ISLANDS, islandName, getIsland, getMonorailRoute
} from '../src/world/islandLayout.js'
import { HOLIDAYS } from '../src/systems/holidays.js'
import { SEASONS } from '../src/systems/seasons.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}
const read = (rel) =>
  readFileSync(new URL('../' + rel, import.meta.url), 'utf8')

// ---------------------------------------------------------------------------

console.log('1. Every vehicle in the fleet has a name of its own')
// VehicleSelector.js cannot be imported here - it reaches for Game.js, which
// reaches for three.js - so the table is read out of the source. That is the
// same trick tests/vehicles.mjs uses on World.js, and it is fine: what is
// being checked is that a key EXISTS, which is a fact about the text.
const selector = read('src/ui/VehicleSelector.js')
const table = selector.slice(selector.indexOf('const LABELS = {'))
const labels = Object.fromEntries(
  [...table.slice(0, table.indexOf('\n}')).matchAll(/^\s*(\w+):\s*'([^']+)'/gm)]
    .map(m => [m[1], m[2]]))

const kinds = Object.keys(TRAFFIC_LENGTHS)
console.log(`   ${kinds.length} kinds in the fleet, ${Object.keys(labels).length} named`)
chk('the label table was found', Object.keys(labels).length > 5,
    `${Object.keys(labels).length}`)

const unnamed = kinds.filter(k => !labels[k])
chk('every kind the picker offers has a written name', unnamed.length === 0,
    'no label for: ' + unnamed.join(', '))

// The two Mike actually saw, named outright so the failure says which.
chk('the tow truck is "Tow Truck"', labels.tow === 'Tow Truck', `${labels.tow}`)
chk('the monorail is "Monorail"', labels.monorail === 'Monorail',
    `${labels.monorail}`)

// And nothing left over pointing at a kind that no longer exists.
const orphans = Object.keys(labels).filter(k => !kinds.includes(k))
chk('and no label names a vehicle that is gone', orphans.length === 0,
    orphans.join(', '))

console.log('\n2. And it is written the way a name is written')
// Title Case. SUV is the one word in the table that is an acronym rather than
// a word, so it is allowed to shout; everything else has to look like a label
// on a forecourt rather than like a variable.
const ACRONYMS = new Set(['SUV'])
for (const [kind, name] of Object.entries(labels)) {
  const words = name.split(' ')
  const ok = words.every(w =>
    ACRONYMS.has(w) || /^[A-Z][a-z]*$/.test(w))
  chk(`  ${kind} -> "${name}"`, ok, 'not Title Case')
}
chk('no name is just the key it came from',
    Object.entries(labels).every(([k, n]) => n !== k))

console.log('\n3. Every island has a name a player can read')
// islandName() is the one place the rule lives now. Before it, five callers
// each had their own `|| island.id`, and one of them - ZoneManager - was the
// only one that thought to shout it.
for (const island of ISLANDS) {
  const name = islandName(island)
  chk(`  ${island.id.padEnd(9)} -> "${name}"`,
      !!name && name === name.toUpperCase() && !/[a-z]/.test(name),
      'empty or not upper case')
}
chk('the hub is not called "hub" any more', islandName(getIsland('hub')) !== 'HUB',
    islandName(getIsland('hub')))
chk('it is CENTRAL', islandName(getIsland('hub')) === 'CENTRAL',
    islandName(getIsland('hub')))
chk('a missing island reads as nothing rather than throwing',
    islandName(null) === '' && islandName(undefined) === '')

console.log('\n4. Every monorail station is signed the same way')
// This is the one Mike would have been looking straight at: the station name
// sits at the top of the driver's panel, and every other stop on the line was
// shouting while the hub whispered.
const route = getMonorailRoute()
for (const station of route.stations) {
  chk(`  ${station.id.padEnd(9)} -> "${station.name}"`,
      !!station.name && !/[a-z]/.test(station.name),
      'empty or not upper case')
}
chk('no two stations share a name',
    new Set(route.stations.map(s => s.name)).size === route.stations.length,
    route.stations.map(s => s.name).join(', '))

console.log('\n5. No callout can be dispatched to an identifier')
// `FIRE AT ${island}` and `CAR CRASH AT ${island}` take whatever World
// recorded on the building or the crash site. Both of those now go through
// islandName(), so the check is that no island's display name is still its
// bare lower-case id - which is what "FIRE AT HUB" was.
const leaking = ISLANDS.filter(i => islandName(i) === i.id)
chk('no island reports its own id as its name', leaking.length === 0,
    leaking.map(i => i.id).join(', '))
// And that the sites in World.js really do route through the helper, rather
// than having been fixed in four places and missed in a fifth.
const world = read('src/world/World.js')
const zones = read('src/world/ZoneManager.js')
const layout = read('src/world/islandLayout.js')
const stale = [
  ['World.js', world], ['ZoneManager.js', zones]
].filter(([, src]) => /\.name\s*\|\|\s*\w*\.?id/.test(src))
chk('nothing still falls back to the id on its own',
    stale.length === 0, stale.map(([f]) => f).join(', '))
chk('and the helper is exported for them to use',
    /export function islandName/.test(layout))

console.log('\n6. The HUD shouts, consistently')
// Every callout banner in this world is upper case - FIRE CONTAINED, SUSPECT
// ESCAPED, PERFECT STOP. It is a house style rather than a rule anything
// enforces, so here is the rule. Only strings that are already ALL-CAPS words
// are considered: this is checking that the shouting ones are not
// accidentally mixed, not that every string in the file shouts.
const HUD_FILES = [
  'src/world/fireGame.js', 'src/world/policeGame.js',
  'src/world/ambulanceGame.js', 'src/world/towGame.js',
  'src/world/monorailGame.js', 'src/world/raceGame.js'
]
let banners = 0
let mixed = []
for (const file of HUD_FILES) {
  const src = read(file)
  for (const m of src.matchAll(/(?:message|title)\s*=\s*'([^']{4,40})'/g)) {
    const text = m[1]
    banners++
    // A banner is a phrase of words. If ANY of it is shouted, all of it must
    // be - "FIRE contained" is the failure this is looking for.
    if (/[A-Z]{2,}/.test(text) && /[a-z]/.test(text)) {
      mixed.push(`${file}: "${text}"`)
    }
  }
}
console.log(`   ${banners} banners across ${HUD_FILES.length} game modules`)
chk('a banner is all shouted or not shouted at all', mixed.length === 0,
    mixed.join(' | '))

console.log('\n7. The buttons agree with the code about what things are called')
// The condition panel's buttons are hand-written markup, and the names they
// show live in `holidays.js` and `seasons.js`. Two places, no link between
// them - and they had already drifted: the button read "4th July" while the
// chip above it, drawn from HOLIDAYS, read "Fourth of July". The same holiday,
// named two ways, six centimetres apart on the screen.
//
// Matched by the `data-` key rather than by position, so reordering the panel
// is not a failure and renaming a holiday in one place is.
{
  const html = read('index.html')
  const buttonsFor = (attr) => Object.fromEntries(
    [...html.matchAll(
      new RegExp(`data-${attr}="([^"]+)"[^>]*>([^<]+)<`, 'g'))]
      .map(m => [m[1], m[2].trim()]))

  const holidayButtons = buttonsFor('holiday')
  console.log(`   ${Object.keys(holidayButtons).length} holiday buttons`)
  chk('the holiday buttons were found',
      Object.keys(holidayButtons).length >= 6,
      `${Object.keys(holidayButtons).length}`)
  for (const [key, shown] of Object.entries(holidayButtons)) {
    const holiday = HOLIDAYS[key]
    chk(`  ${key.padEnd(13)} button says "${shown}"`,
        !!holiday && holiday.label === shown,
        holiday ? `code says "${holiday.label}"` : 'no such holiday')
  }
  chk('and every holiday in the code has a button',
      Object.keys(HOLIDAYS).every(k => holidayButtons[k] !== undefined),
      Object.keys(HOLIDAYS).filter(k => !holidayButtons[k]).join(', '))

  const seasonButtons = buttonsFor('season')
  for (const [key, shown] of Object.entries(seasonButtons)) {
    chk(`  ${key.padEnd(13)} button says "${shown}"`,
        !!SEASONS[key] && SEASONS[key].label === shown,
        SEASONS[key] ? `code says "${SEASONS[key].label}"` : 'no such season')
  }
  chk('and every season has a button',
      Object.keys(SEASONS).every(k => seasonButtons[k] !== undefined),
      Object.keys(SEASONS).filter(k => !seasonButtons[k]).join(', '))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
