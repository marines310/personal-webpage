/**
 * Where the stunt course's obstacles can actually stand.
 *
 * `STUNT_MOUNDS` says its positions "come from a solver run against three
 * constraints" - and then the solver was not kept, so when the stunt island
 * moved to make room for a bigger stadium the course had to be re-solved by
 * hand from a failing test. This is that solver, written down.
 *
 * The three constraints, unchanged:
 *
 *   INSIDE THE BARRIER   every corner of the footprint at least 1.5 from the
 *                        wall, because a corner that just touches it still has
 *                        the barrier's own thickness built through it.
 *   CLEAR OF THE PIERS   3 units. The monorail crosses this island on three
 *                        piers - `monorail: false` keeps a STATION off, not
 *                        the railway - and a pier inside a mound is a concrete
 *                        column sticking out of a jump.
 *   CLEAR OF EACH OTHER  2.5, on a separating-axis test between the footprint
 *                        rectangles. Bounding CIRCLES were tried first and
 *                        called every workable layout a collision: a circle
 *                        round a 30-by-22 rectangle is nine units bigger than
 *                        it in every direction.
 *
 * It searches OUTWARD FROM WHERE EACH MOUND ALREADY IS, nearest first, and
 * keeps the first position that satisfies everything. That is deliberate: the
 * layout has been driven and liked, so the job is to disturb it as little as
 * the geometry allows rather than to find some new optimum.
 *
 *     node tools/solveCourse.mjs
 */
import {
  getIsland, getIslandRing, getMonorailPiers
} from '../src/world/islandLayout.js'
import { insetPolygon, distanceToEdge } from '../src/world/shapes.js'
import {
  STUNT_MOUNDS, STUNT_DOUBLE, STUNT_PAD_INSET, moundSolid
} from '../src/world/course.js'

const PIER_CLEAR = 3
const WALL_CLEAR = 1.5
const MOUND_CLEAR = 2.5

const stunt = getIsland('stunt')
const ring = getIslandRing(stunt)
const floor = insetPolygon(ring, STUNT_PAD_INSET)

const piers = getMonorailPiers()
  .map((p) => ({ x: p.x - stunt.x, z: p.z - stunt.z }))
  .filter((p) => distanceToEdge(floor, p.x, p.z) > -8)

/** The four corners of a mound's footprint, in island coordinates. */
function corners(spec) {
  const solid = moundSolid(spec)
  const s = Math.sin(spec.heading)
  const c = Math.cos(spec.heading)
  const out = []
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      const dx = a * solid.reach.across
      const dz = b * solid.reach.along
      out.push({ x: spec.x + dx * c + dz * s, z: spec.z - dx * s + dz * c })
    }
  }
  return out
}

function insideBarrier(spec) {
  let worst = Infinity
  for (const p of corners(spec)) {
    worst = Math.min(worst, distanceToEdge(floor, p.x, p.z))
  }
  return worst
}

function pierGap(spec) {
  const solid = moundSolid(spec)
  let worst = Infinity
  for (const pier of piers) {
    const dx = pier.x - spec.x
    const dz = pier.z - spec.z
    const along = Math.abs(dx * Math.sin(spec.heading) + dz * Math.cos(spec.heading))
    const across = Math.abs(dx * Math.cos(spec.heading) - dz * Math.sin(spec.heading))
    worst = Math.min(worst,
      Math.max(along - solid.reach.along, across - solid.reach.across))
  }
  return worst
}

/** Separating-axis gap between two footprint rectangles. */
function rectGap(a, b) {
  const ga = moundSolid(a).reach
  const gb = moundSolid(b).reach
  let worst = -Infinity
  for (const [spec, mine, other, theirs] of
    [[a, ga, b, gb], [b, gb, a, ga]]) {
    for (const [ax, az, half] of [
      [Math.sin(spec.heading), Math.cos(spec.heading), mine.along],
      [Math.cos(spec.heading), -Math.sin(spec.heading), mine.across]
    ]) {
      const centre = (other.x - spec.x) * ax + (other.z - spec.z) * az
      // The other rectangle's half-extent projected onto this axis.
      const oa = Math.abs(Math.sin(other.heading) * ax + Math.cos(other.heading) * az)
      const ob = Math.abs(Math.cos(other.heading) * ax - Math.sin(other.heading) * az)
      const reach = theirs.along * oa + theirs.across * ob
      worst = Math.max(worst, Math.abs(centre) - half - reach)
    }
  }
  return worst
}

const all = [
  ...STUNT_MOUNDS.map((m) => ({ ...m })),
  { ...STUNT_DOUBLE.takeOff, name: 'take-off' },
  { ...STUNT_DOUBLE.landing, name: 'landing' }
]

function feasible(spec, others) {
  if (insideBarrier(spec) <= WALL_CLEAR) return false
  if (pierGap(spec) <= PIER_CLEAR) return false
  for (const o of others) {
    if (o === spec) continue
    if (rectGap(spec, o) <= MOUND_CLEAR) return false
  }
  return true
}

console.log(`\n${piers.length} monorail piers stand on this island: ` +
  piers.map(p => `(${p.x.toFixed(1)}, ${p.z.toFixed(1)})`).join(' '))
console.log('\nbefore:')
for (const spec of all) {
  console.log(`  ${spec.name.padEnd(12)} (${spec.x.toFixed(1)}, ${spec.z.toFixed(1)})` +
    `  wall ${insideBarrier(spec).toFixed(1)}  pier ${pierGap(spec).toFixed(1)}` +
    `  ${feasible(spec, all) ? 'ok' : 'CLASHES'}`)
}

// FIRST, TRY MOVING THE WHOLE COURSE AS ONE PIECE.
//
// The obstacles are not really six independent problems. The monorail crosses
// this island on a diagonal and the course is laid out down the spine BETWEEN
// the piers, so when the island moved - and the beam, which runs island to
// island in world coordinates, therefore crossed it in a different place - the
// whole pier line shifted about six units south in island terms and the course
// needed to shift with it. Moving mounds one at a time cannot find that: each
// one on its own has nowhere to go, because the thing that has to change is
// the relationship of the SET to the piers.
//
// So: search rigid translations first, nearest first, and only fall back to
// nudging individual mounds if no single shift works.
{
  const origin = all.map(m => ({ x: m.x, z: m.z }))
  let bestShift = null
  for (let r = 0; r <= 24 && !bestShift; r += 0.5) {
    for (let a = 0; a < 64 && !bestShift; a++) {
      const angle = (a / 64) * Math.PI * 2
      const dx = r === 0 ? 0 : Math.cos(angle) * r
      const dz = r === 0 ? 0 : Math.sin(angle) * r
      const trial = all.map((m, i) => ({ ...m, x: origin[i].x + dx, z: origin[i].z + dz }))
      if (trial.every(t => feasible(t, trial))) bestShift = { dx, dz }
      if (r === 0) break
    }
  }
  if (bestShift) {
    console.log(`\nwhole course shifted by (${bestShift.dx.toFixed(1)}, ` +
      `${bestShift.dz.toFixed(1)}) - every obstacle keeps its place in the line`)
    all.forEach((m, i) => {
      m.x = origin[i].x + bestShift.dx
      m.z = origin[i].z + bestShift.dz
    })
  } else {
    console.log('\nno single shift works; nudging obstacles individually')
  }
}

// Rings of candidates, nearest first. Half-unit steps: finer than the eye can
// see on a 128-unit floor, coarse enough to finish.
//
// RELAXED OVER SEVERAL PASSES, because this is a joint problem and not six
// independent ones. Moving the landing to clear the barrier can un-clash the
// take-off that was overlapping it, and a single pass judges every mound
// against the others' ORIGINAL positions - so the first version of this
// reported three obstacles with "no position found" and then solved two of
// them by accident while moving a fourth.
const PASSES = 6
for (let pass = 0; pass < PASSES; pass++) {
  let anyMoved = false
  for (const spec of all) {
    if (feasible(spec, all)) continue
    let placed = null
    for (let r = 0.5; r <= 40 && !placed; r += 0.5) {
      for (let a = 0; a < 48 && !placed; a++) {
        const angle = (a / 48) * Math.PI * 2
        const trial = {
          ...spec,
          x: spec.x + Math.cos(angle) * r,
          z: spec.z + Math.sin(angle) * r
        }
        if (feasible(trial, all.map(o => (o === spec ? trial : o)))) placed = trial
      }
    }
    if (placed) { Object.assign(spec, placed); anyMoved = true }
  }
  if (!anyMoved) break
}
for (const spec of all) {
  if (!feasible(spec, all)) {
    console.log(`\n  ${spec.name}: NO POSITION FOUND within 40 units`)
  }
}

console.log('\nafter:')
for (const spec of all) {
  console.log(`  ${spec.name.padEnd(12)} (${spec.x.toFixed(1)}, ${spec.z.toFixed(1)})` +
    `  wall ${insideBarrier(spec).toFixed(1)}  pier ${pierGap(spec).toFixed(1)}` +
    `  ${feasible(spec, all) ? 'ok' : 'STILL CLASHES'}`)
}

console.log('\nthe numbers to paste into course.js:')
for (const spec of all) {
  console.log(`  ${spec.name.padEnd(12)} x: ${spec.x.toFixed(1)}, z: ${spec.z.toFixed(1)}`)
}
console.log()
