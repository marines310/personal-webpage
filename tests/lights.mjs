// The light cycle is pure arithmetic, so it can be checked directly.
const CYCLE = 18, AMBER = 2.5
const stateAt = (t, group, offset = 0) => {
  const tt = (t + offset) % CYCLE
  const half = CYCLE / 2
  const first = tt < half
  const into = first ? tt : tt - half
  const amber = into > half - AMBER
  const mine = (group === 0) === first
  return !mine ? 'red' : amber ? 'amber' : 'green'
}

let pass = 0, fail = 0
const chk = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + '  ' + d)) }

console.log('Traffic light cycle\n')

let bothGreen = 0, neitherGreen = 0
const seen = { 0: new Set(), 1: new Set() }
for (let t = 0; t < CYCLE * 3; t += 0.05) {
  const a = stateAt(t, 0), b = stateAt(t, 1)
  seen[0].add(a); seen[1].add(b)
  if (a === 'green' && b === 'green') bothGreen++
  if (a !== 'green' && b !== 'green' && a !== 'amber' && b !== 'amber') neitherGreen++
}

chk('the two directions are never both green', bothGreen === 0, `${bothGreen} samples`)
chk('never both stuck on red', neitherGreen === 0, `${neitherGreen} samples`)
chk('group 0 shows all three aspects', seen[0].size === 3, [...seen[0]].join(','))
chk('group 1 shows all three aspects', seen[1].size === 3, [...seen[1]].join(','))

// Amber always comes between green and red, never after red
let badOrder = 0
for (let t = 0.05; t < CYCLE * 3; t += 0.05) {
  const prev = stateAt(t - 0.05, 0), now = stateAt(t, 0)
  if (prev === 'red' && now === 'amber') badOrder++
  if (prev === 'amber' && now === 'green') badOrder++
}
chk('amber only ever follows green and leads to red', badOrder === 0, `${badOrder}`)

// green should be the majority of each direction's turn
let green = 0, amber = 0
for (let t = 0; t < CYCLE; t += 0.01) {
  const s = stateAt(t, 0)
  if (s === 'green') green += 0.01
  if (s === 'amber') amber += 0.01
}
chk(`green ${green.toFixed(1)}s vs amber ${amber.toFixed(1)}s per cycle`,
    green > amber * 2)

// two junctions with different offsets shouldn't change in lockstep
let same = 0
for (let t = 0; t < CYCLE; t += 0.05) {
  if (stateAt(t, 0, 0) === stateAt(t, 0, 5.5)) same++
}
chk('junctions with different offsets are out of step', same < CYCLE / 0.05 * 0.8)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
