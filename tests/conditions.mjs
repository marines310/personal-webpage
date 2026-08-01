/**
 * The time and weather controls.
 *
 * Environment.js needs a browser - it builds sky shaders and lights - so it
 * can't be constructed here. But the parts that matter are methods, and a
 * method can be called against a plain object. So the real `setClock`,
 * `getHours` and `setWeather` are exercised, not copies of them.
 *
 * The thing this is really guarding: `setClock` has to be the exact inverse
 * of the clock the HUD displays. `getClock()` reads
 * `(time * 24 + 6) % 24` - a six-hour offset, because the world starts at
 * dawn rather than midnight - and if `setClock` forgets to undo that, asking
 * for 13:00 gives you seven in the morning and the bug looks like the sun
 * being in the wrong place.
 */
import { Environment, WEATHER_TYPES } from '../src/systems/Environment.js'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

/** Just enough of an Environment for the methods under test. */
const stub = () => ({
  time: 0.14,
  weather: 'clear',
  weatherTimer: 0,
  weatherDuration: 60,
  timeLocked: false,
  weatherLocked: false,
  current: { ...WEATHER_TYPES.clear },
  target: { ...WEATHER_TYPES.clear },
  updateSun() {}
})

const setClock = (env, h) => Environment.prototype.setClock.call(env, h)
const getHours = (env) => Environment.prototype.getHours.call(env)
const getClock = (env) => Environment.prototype.getClock.call(env)
const setWeather = (env, w) => Environment.prototype.setWeather.call(env, w)
const resumeAuto = (env) => Environment.prototype.resumeAuto.call(env)
const isManual = (env) => Environment.prototype.isManual.call(env)
const easeWeather = (env, d) => Environment.prototype.easeWeather.call(env, d)

// ---------------------------------------------------------------------------
console.log('1. Setting the clock is the exact inverse of reading it\n')

let worst = 0
for (let h = 0; h < 24; h += 0.25) {
  const env = stub()
  setClock(env, h)
  const back = getHours(env)
  const gap = Math.min(Math.abs(back - h), 24 - Math.abs(back - h))
  worst = Math.max(worst, gap)
}
chk(`every quarter hour round-trips (worst ${worst.toExponential(1)}h)`,
    worst < 1e-9, `${worst}`)

// And the string the HUD shows agrees, which is the number Mike actually sees
for (const [hours, want] of [[0, '00:00'], [6, '06:00'], [13.5, '13:30'],
                             [19.75, '19:45'], [23.99, '23:59']]) {
  const env = stub()
  setClock(env, hours)
  const shown = getClock(env)
  chk(`${hours}h shows as ${want}`, shown === want, shown)
}

chk('the time stays in range whatever you ask for', (() => {
  for (const h of [-5, 0, 24, 25, 100, -100]) {
    const env = stub()
    setClock(env, h)
    if (!(env.time >= 0 && env.time < 1)) return false
  }
  return true
})())

// ---------------------------------------------------------------------------
console.log('\n2. Setting anything by hand holds it')

const held = stub()
chk('nothing is held to begin with', !isManual(held))

setClock(held, 13)
chk('setting the clock holds the clock', held.timeLocked === true)
chk('and the box reads as manual', isManual(held))
chk('but the weather is still automatic', held.weatherLocked === false)

setWeather(held, 'storm')
chk('picking weather holds the weather', held.weatherLocked === true)
chk('and takes effect as the target', held.target === WEATHER_TYPES.storm)
chk('with the name recorded', held.weather === 'storm')

resumeAuto(held)
chk('going back to automatic releases the clock', held.timeLocked === false)
chk('and the weather', held.weatherLocked === false)
chk('and the box stops saying manual', !isManual(held))

chk('an unknown weather is ignored rather than crashing', (() => {
  const env = stub()
  setWeather(env, 'hurricane')
  return env.weather === 'clear' && env.weatherLocked === false
})())

// ---------------------------------------------------------------------------
console.log('\n3. A hand-picked change eases in, it does not snap')

// This is why setWeather sets `target` rather than `current`. Snapping the
// eased values would flip from clear to a downpour between two frames.
const easing = stub()
setWeather(easing, 'storm')
chk('the eased values have not jumped', easing.current.rain < 0.05,
    `${easing.current.rain}`)

for (let i = 0; i < 30; i++) easeWeather(easing, 1 / 30)
const afterASecond = easing.current.rain
chk(`after a second it has begun (rain ${afterASecond.toFixed(3)})`,
    afterASecond > 0.001 && afterASecond < 0.3, `${afterASecond}`)

for (let i = 0; i < 30 * 60; i++) easeWeather(easing, 1 / 30)
chk(`and it gets there (rain ${easing.current.rain.toFixed(2)} of 1.0)`,
    easing.current.rain > 0.95, `${easing.current.rain}`)
chk('with the label following', easing.current.label === 'Storm',
    easing.current.label)

// ---------------------------------------------------------------------------
console.log('\n4. Every weather the panel offers is a real one')

// The buttons in index.html and the table in Environment.js are two lists
// that have to match. A typo in the markup would produce a button that
// silently does nothing.
const { readFileSync } = await import('fs')
const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)
const html = readFileSync(ROOT + 'index.html', 'utf8')

const offered = [...html.matchAll(/data-weather="([^"]+)"/g)].map(m => m[1])
console.log(`   panel offers: ${offered.join(', ')}`)
chk(`the panel offers some weather (${offered.length})`, offered.length >= 3)
chk('and every one of them exists',
    offered.every(w => WEATHER_TYPES[w]),
    offered.filter(w => !WEATHER_TYPES[w]).join(', '))
chk('and every weather there is can be picked',
    Object.keys(WEATHER_TYPES).every(w => offered.includes(w)),
    Object.keys(WEATHER_TYPES).filter(w => !offered.includes(w)).join(', '))

// The time presets have to be real hours too
const presets = [...html.matchAll(/data-hour="([^"]+)"/g)].map(m => Number(m[1]))
console.log(`   presets: ${presets.join(', ')}`)
chk('the presets are hours in range',
    presets.length >= 2 && presets.every(h => h >= 0 && h < 24),
    presets.join(','))

// And the slider has to cover a whole day, in minutes
const slider = html.match(/id="cond-hour"[^>]*/)[0]
const max = Number((slider.match(/max="(\d+)"/) || [])[1])
chk(`the slider covers a full day (max ${max} = ${(max / 60).toFixed(1)}h)`,
    max >= 1435 && max <= 1440, `${max}`)

// ---------------------------------------------------------------------------
console.log('\n5. The automatic cycle still runs when nothing is held')

const rolling = stub()
const advance = (env, delta) => {
  if (!env.paused && !env.timeLocked) env.time = (env.time + delta / 600) % 1
}

const before = rolling.time
for (let i = 0; i < 300; i++) advance(rolling, 1)
chk('the clock advances on its own', rolling.time !== before)

setClock(rolling, 9)
const stopped = rolling.time
for (let i = 0; i < 300; i++) advance(rolling, 1)
chk('and stops once you set it by hand', rolling.time === stopped)

resumeAuto(rolling)
for (let i = 0; i < 300; i++) advance(rolling, 1)
chk('and starts again when handed back', rolling.time !== stopped)

// ---------------------------------------------------------------------------
console.log('\n6. Opening the panel does not cost you the car')

// Mike found this: click the weather box and the driving keys stop working.
// Two causes, both mine. Clicking a button leaves it FOCUSED, so the browser
// drew a ring round the whole box; and to stop space re-pressing that button
// the panel stopped key events propagating - but Inputs listens on the
// WINDOW, so a swallowed event never reaches the car at all.
//
// Suppressing the symptom cost the whole keyboard. Blurring removes the
// cause: nothing focused, nothing to re-press, every key goes where it went
// before.
const uiSource = readFileSync(ROOT + 'src/ui/UI.js', 'utf8')
const inputsSource = readFileSync(ROOT + 'src/systems/Inputs.js', 'utf8')

chk('no panel swallows key events any more',
    !/stopPropagation/.test(uiSource))
chk('the conditions box lets go of the focus when you finish clicking',
    /releaseFocusAfterClicks\(this\.conditionsEl\)/.test(uiSource))
chk('and so does the camera box',
    /releaseFocusAfterClicks\(this\.cameraEl\)/.test(uiSource))
// On mouseup, not click: a click fires after focus has been taken and, for a
// range slider, only once the drag ends.
chk('it releases on mouseup, not on click',
    /addEventListener\('mouseup'/.test(uiSource))

// And the wider rule, so nothing can trap the keyboard however it got focus -
// the zone panel's links were never considered by the per-panel version.
chk('a driving key blurs whatever is focused, wherever it is',
    /focused !== document\.body && focused\.blur\) focused\.blur\(\)/.test(inputsSource))
chk('and it does so before acting on the key, not after',
    inputsSource.indexOf('focused.blur()') <
    inputsSource.indexOf('this.keys[control] = true'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
