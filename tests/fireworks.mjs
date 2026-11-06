/**
 * Fireworks.
 *
 * A show over the finish line when you win the race. What these guard:
 *
 *   1. **It is for WINNING**, not for finishing, and not for watching.
 *   2. **The show is a show** - shells go up, burst, fall, fade, and then it
 *      is over. Nothing lingers, nothing starts early, nothing is left in the
 *      sky when the lights go out.
 *   3. **The physics is physics** - sparks go out in a sphere, fall under
 *      gravity, slow under drag. A burst that goes up for ever or falls
 *      through the floor is wrong in a way you can see.
 *   4. **The buffer is honest** - every slot written or parked every frame.
 *      The first version left dead sparks where they last were.
 *   5. **World.js only draws.**
 */
import {
  SHOW_SECONDS, SHELLS, SPARKS, FUSE, SPARK_LIFE, LAUNCH_SPEED, GRAVITY,
  SPREAD, POINTS, HUES,
  celebrates, newFireworks, startShow, stepFireworks, shellAt, burstPoint,
  sparkAt, fillPoints, sparksAlive
} from '../src/world/fireworks.js'
import { newRaceState } from '../src/world/raceGame.js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const HERE = dirname(fileURLToPath(import.meta.url))
const read = f => readFileSync(join(HERE, '..', f), 'utf8')

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

function seeded(seed = 1) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 }
}

const CENTRE = { x: 100, y: 2, z: -40 }

// ---------------------------------------------------------------------------
console.log('1. When\n')

const won = { ...newRaceState(), phase: 'finished', winner: 'YOU' }
const lost = { ...newRaceState(), phase: 'finished', winner: 'RED' }
const racing = { ...newRaceState(), phase: 'racing', winner: null }

chk('winning is celebrated', celebrates(won))
chk('coming second is not', !celebrates(lost))
chk('nor is still racing', !celebrates(racing))
chk('nor is no race at all', !celebrates(null) && !celebrates(newRaceState()))

// ---------------------------------------------------------------------------
console.log('\n2. The show\n')

const show = startShow(newFireworks(), CENTRE, seeded(3))
chk('lighting it makes it active', show.active && show.t === 0)
chk('with the right number of shells', show.shells.length === SHELLS)
chk('and it remembers where it is', show.centre.x === 100 && show.centre.z === -40)

const launches = show.shells.map(s => s.launch).sort((a, b) => a - b)
chk('the first shell goes up straight away', launches[0] < 0.5, `${launches[0].toFixed(2)}s`)
chk('and the last one early enough to finish inside the show',
    launches[launches.length - 1] + FUSE * 1.15 + SPARK_LIFE <= SHOW_SECONDS + 0.01,
    `last launch ${launches[launches.length - 1].toFixed(2)}s`)
chk('they are staggered, not all at once',
    launches[launches.length - 1] - launches[0] > SHOW_SECONDS * 0.4)

const spread = show.shells.map(s => Math.hypot(s.x - CENTRE.x, s.z - CENTRE.z))
chk('they land around the centre, not on it', Math.max(...spread) > SPREAD * 0.5)
chk('and none of them beyond the spread', Math.max(...spread) <= SPREAD + 1e-9)
chk('the hues are from the list', show.shells.every(s => HUES.includes(s.hue)))

const again = startShow(newFireworks(), CENTRE, seeded(3))
chk('the same seed is the same show',
    again.shells.every((s, i) => s.launch === show.shells[i].launch && s.hue === show.shells[i].hue))

// ---------------------------------------------------------------------------
console.log('\n3. It ends\n')

const clock = startShow(newFireworks(), CENTRE, seeded(5))
let peak = 0, peakAt = 0
for (let t = 0; t <= SHOW_SECONDS + 1; t += 1 / 30) {
  stepFireworks(clock, 1 / 30)
  const alive = sparksAlive(clock)
  if (alive > peak) { peak = alive; peakAt = clock.t }
}
console.log(`   most sparks in the air at once: ${peak}, at ${peakAt.toFixed(1)}s`)
chk('it switches itself off', clock.active === false)
chk('and clears the shells', clock.shells.length === 0)
chk('and had a lot going on in the middle', peak > SPARKS * 2, `${peak}`)
chk('stepping a finished show is harmless', stepFireworks(clock, 1).active === false)
chk('and so is stepping one that was never lit', stepFireworks(newFireworks(), 1).active === false)

// ---------------------------------------------------------------------------
console.log('\n4. The physics\n')

const shell = show.shells[0]
chk('a shell is not there before it launches',
    shellAt(shell, CENTRE, shell.launch - 0.1) === null)
const climbing = shellAt(shell, CENTRE, shell.launch + shell.fuse * 0.5)
chk('on its way up it is above the ground', climbing && climbing.y > CENTRE.y + 5)
chk('and over its own launch spot', climbing && climbing.x === shell.x && climbing.z === shell.z)
chk('and gone once it bursts', shellAt(shell, CENTRE, shell.launch + shell.fuse) === null)

const burst = burstPoint(shell, CENTRE)
// IN THE FRAME. The chase camera's top edge is about fifteen units above
// the road at the distances the shells land, so a burst has to be above the
// gantry and below that, or it is a show nobody sees. 33 was tried; the
// screenshot was a car and a blue sky.
chk('it bursts above the finish line', burst.y - CENTRE.y > 12, `${(burst.y - CENTRE.y).toFixed(1)} up`)
chk('but low enough to be in the chase camera\'s frame', burst.y - CENTRE.y < 24,
    `${(burst.y - CENTRE.y).toFixed(1)} up`)

const t0 = shell.launch + shell.fuse
chk('no spark before the burst', sparkAt(shell, 0, CENTRE, t0 - 0.01) === null)
chk('and none after it has faded', sparkAt(shell, 0, CENTRE, t0 + SPARK_LIFE) === null)

// A SPHERE. Right after the burst every spark is about the same distance from
// the burst point, in every direction.
const early = []
for (let i = 0; i < SPARKS; i++) early.push(sparkAt(shell, i, CENTRE, t0 + 0.15))
const radii = early.map(s => Math.hypot(s.x - burst.x, s.y - burst.y, s.z - burst.z))
const rMin = Math.min(...radii), rMax = Math.max(...radii)
console.log(`   0.15s after the burst the sparks are ${rMin.toFixed(2)} to ${rMax.toFixed(2)} out`)
chk('the burst is a sphere, not a lump', rMax - rMin < rMax * 0.15, `${rMin.toFixed(2)}..${rMax.toFixed(2)}`)
chk('with sparks going UP as well as down', early.some(s => s.y > burst.y + 1) && early.some(s => s.y < burst.y - 1))

// GRAVITY. Every spark ends lower than where it was at its highest.
let fell = 0
for (let i = 0; i < SPARKS; i++) {
  const a = sparkAt(shell, i, CENTRE, t0 + 0.2)
  const b = sparkAt(shell, i, CENTRE, t0 + SPARK_LIFE - 0.01)
  if (b.y < a.y) fell++
}
chk('every spark falls', fell === SPARKS, `${fell} of ${SPARKS}`)

// DRAG. The outward spread slows down - the second second covers less
// ground sideways than the first.
const s1 = sparkAt(shell, 10, CENTRE, t0 + 0.5)
const s2 = sparkAt(shell, 10, CENTRE, t0 + 1.0)
const s3 = sparkAt(shell, 10, CENTRE, t0 + 1.5)
const lateral = (a, b) => Math.hypot(b.x - a.x, b.z - a.z)
chk('and slows as it spreads', lateral(s2, s3) < lateral(s1, s2))

chk('it fades late rather than from the start',
    sparkAt(shell, 0, CENTRE, t0 + SPARK_LIFE * 0.5).alpha === 1 &&
    sparkAt(shell, 0, CENTRE, t0 + SPARK_LIFE * 0.95).alpha < 0.2)

chk('nothing goes under the ground within its life',
    (() => { for (let i = 0; i < SPARKS; i++)
      for (let t = t0; t < t0 + SPARK_LIFE; t += 0.1)
        if (sparkAt(shell, i, CENTRE, t).y < CENTRE.y - 1) return false
      return true })())

// ---------------------------------------------------------------------------
console.log('\n5. The buffer\n')

const positions = new Float32Array(POINTS * 3)
const colours = new Float32Array(POINTS * 3)
const sizes = new Float32Array(POINTS)
const toRgb = (hue, alpha, out, at) => { out[at] = hue; out[at + 1] = alpha; out[at + 2] = 1 }

const buf = startShow(newFireworks(), CENTRE, seeded(9))
fillPoints(buf, positions, colours, sizes, toRgb)
chk('at t=0 almost everything is parked',
    Array.from(sizes).filter(s => s === 0).length > POINTS - SHELLS - 1)
chk('and parked means far below the world, not at the origin',
    positions[1] === -1000 || sizes[0] > 0)

// Advance to the middle, fill, then advance to the end and fill again. THE
// STALE-SLOT BUG: a spark that has faded must not keep last frame's position.
for (let i = 0; i < 30 * 4; i++) stepFireworks(buf, 1 / 30)
fillPoints(buf, positions, colours, sizes, toRgb)
const liveMid = Array.from(sizes).filter(s => s > 0).length
chk('mid-show there are sparks in the buffer', liveMid > SPARKS, `${liveMid}`)

for (let i = 0; i < 30 * 6; i++) stepFireworks(buf, 1 / 30)
fillPoints(buf, positions, colours, sizes, toRgb)
const liveEnd = Array.from(sizes).filter(s => s > 0).length
const stranded = Array.from(positions).filter((v, i) => i % 3 === 1 && v > -999 && v !== 0).length
chk('after the show every slot is parked', liveEnd === 0, `${liveEnd} still drawn`)
chk('and nothing is left where it was last seen', stranded === 0, `${stranded} stale`)
chk('the buffer is exactly POINTS long', POINTS === SHELLS * (SPARKS + 1))

// ---------------------------------------------------------------------------
console.log('\n6. Wired up\n')

const world = read('src/world/World.js')
chk('World.js lights the show when the race is won',
    /celebrates\(this\.race\)/.test(world) && /startShow\(this\.fireworks/.test(world))
chk('once per win, on the change, not every frame of the finished phase',
    /this\._celebrated/.test(world))
chk('and it steps and draws it, deciding nothing',
    /stepFireworks\(this\.fireworks, delta\)/.test(world) &&
    /fillPoints\(this\.fireworks,/.test(world))
chk('over the finish line', /circuitPoint\(0\)/.test(world))
chk('as one Points mesh allocated once',
    /new THREE\.Points\(/.test(world) && /Float32Array\(POINTS \* 3\)/.test(world))
chk('and the import is there, so it is not a white screen',
    /from '\.\/fireworks\.js'/.test(world))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
