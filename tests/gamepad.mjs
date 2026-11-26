/**
 * Game controllers, and the Stadia controller in particular.
 *
 * Mike: "Can you detect the Stadia controller?"
 *
 * There is no controller on the machine that runs these, and there does not
 * need to be: everything about what a pad MEANS is arithmetic in gamepad.js,
 * fed here with objects shaped like the ones a browser hands over. What
 * these guard:
 *
 *   1. **It is recognised** - as a Stadia controller, from every way a
 *      browser spells its name, and not mistaken for anything else.
 *   2. **The sticks are honest** - a dead zone, rescaled, with the steering
 *      the right way round and nothing drifting at rest.
 *   3. **The layout** - triggers go and stop, and each button is the thing
 *      the controls box says it is.
 *   4. **A press is an edge** - one event per press, however long it is held.
 *   5. **Nothing unsafe is read from an unmapped pad.**
 *   6. **Inputs.js adds the pad to the keyboard** rather than replacing it,
 *      and the picker gets left, right and confirm.
 */
import {
  STADIA_VENDOR, STADIA_PRODUCT, BUTTON, AXIS,
  STICK_DEADZONE, TRIGGER_DEADZONE, STEER_CURVE, GARAGE_HOLD, MENU_REPEAT,
  identifyPad, labelsFor, padHints, deadzone, steerCurve,
  snapshotPad, choosePad, readPad, pressedSince, holdFired, menuStep
} from '../src/systems/gamepad.js'
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
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol

const CHROME_ID = 'Stadia Controller rev. A (STANDARD GAMEPAD Vendor: 18d1 Product: 9400)'

/** A pad the way a browser hands one over: 17 buttons, 4 axes, at rest. */
function pad(over = {}) {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }))
  const p = {
    index: 0, id: CHROME_ID, connected: true, mapping: 'standard',
    axes: [0, 0, 0, 0], buttons, timestamp: 1, ...over
  }
  return p
}
const press = (p, ...which) => { for (const i of which) p.buttons[i] = { pressed: true, value: 1 }; return p }
const squeeze = (p, i, v) => { p.buttons[i] = { pressed: v > 0.5, value: v }; return p }
const read1 = (p) => readPad(snapshotPad(p))

// ---------------------------------------------------------------------------
console.log('1. It is recognised\n')

chk('the ids are Google\'s vendor and the Stadia product', STADIA_VENDOR === '18d1' && STADIA_PRODUCT === '9400')
for (const [browser, id] of [
  ['Chrome', CHROME_ID],
  ['Chrome over USB', 'Google LLC Stadia Controller rev. A (STANDARD GAMEPAD Vendor: 18d1 Product: 9400)'],
  ['Firefox', '18d1-9400-Stadia Controller rev. A'],
  ['a browser that gives only the name', 'Stadia Controller rev. A'],
  ['a browser that gives only the ids', 'Unknown Gamepad (Vendor: 18D1 Product: 9400)'],
  ['a Bluetooth name', 'StadiaXXXX-abcd']
]) {
  const who = identifyPad(id)
  chk(`${browser.padEnd(34)} is a Stadia controller`, who.kind === 'stadia' && who.name === 'Stadia controller', id)
}
chk('an Xbox pad is not one', identifyPad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)').kind === 'xbox')
chk('nor a DualSense', identifyPad('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)').kind === 'playstation')
chk('nor a Switch pad', identifyPad('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)').kind === 'switch')
chk('Google\'s vendor id alone is not enough - they make other things',
    identifyPad('Some Device (Vendor: 18d1 Product: 4ee7)').kind === 'generic')
chk('something unknown is still a controller', identifyPad('Generic USB Joystick').kind === 'generic')
chk('and nothing at all does not throw', identifyPad(undefined).kind === 'generic' && identifyPad(null).kind === 'generic')

const stadia = labelsFor('stadia')
chk('its buttons are named the way they are printed on it: A B X Y, L1 R1 L2 R2',
    stadia.A === 'A' && stadia.B === 'B' && stadia.X === 'X' && stadia.Y === 'Y' &&
    stadia.LB === 'L1' && stadia.RB === 'R1' && stadia.LT === 'L2' && stadia.RT === 'R2')
chk('a PlayStation pad gets its shapes and a Switch pad its mirrored letters',
    labelsFor('playstation').A === '✕' && labelsFor('switch').A === 'B')
const hints = padHints('stadia')
chk('the controls box gets four lines, like the keyboard\'s', hints.length === 4)
chk('and they name R2 to go, L2 to brake and Y for the garage',
    /R2 to go/.test(hints[0]) && /L2 to brake/.test(hints[0]) && /hold Y for the garage/.test(hints[3]))

// ---------------------------------------------------------------------------
console.log('\n2. The sticks\n')

chk('inside the dead zone is nothing', deadzone(STICK_DEADZONE) === 0 && deadzone(-0.1) === 0 && deadzone(0) === 0)
chk('just outside it is a small movement, not a jump', deadzone(STICK_DEADZONE + 0.01) > 0 && deadzone(STICK_DEADZONE + 0.01) < 0.02)
chk('full travel is exactly 1', near(deadzone(1), 1) && near(deadzone(-1), -1))
chk('and past full travel is still 1', deadzone(1.3) === 1 && deadzone(-1.3) === -1)
chk('it rises all the way with no step', (() => {
  let last = 0
  for (let v = 0; v <= 1.0001; v += 0.01) { const d = deadzone(v); if (d < last - 1e-12 || d - last > 0.02) return false; last = d }
  return true
})())
chk('rubbish from a dying pad is centre', deadzone(NaN) === 0 && deadzone(undefined) === 0 && deadzone(Infinity) === 0)
chk('the steering curve keeps the ends and softens the middle',
    steerCurve(0) === 0 && near(steerCurve(1), 1) && near(steerCurve(-1), -1) &&
    steerCurve(0.5) < 0.5 && steerCurve(0.5) > 0.2 && STEER_CURVE > 1)
chk('and keeps its sign', steerCurve(-0.5) === -steerCurve(0.5))

const rest = read1(pad())
chk('a pad at rest asks for nothing', rest.connected && !rest.active && rest.steering === 0 && rest.forward === 0)
chk('a worn stick resting off-centre asks for nothing either',
    !read1(pad({ axes: [0.09, -0.11, 0.1, 0.08] })).active)
chk('stick RIGHT steers right, which is negative', read1(pad({ axes: [1, 0, 0, 0] })).steering === -1)
chk('stick LEFT steers left, which is positive', read1(pad({ axes: [-1, 0, 0, 0] })).steering === 1)
chk('half stick is less than half lock', Math.abs(read1(pad({ axes: [0.5, 0, 0, 0] })).steering) < 0.5)
chk('the left stick\'s up and down do nothing - it only steers',
    read1(pad({ axes: [0, -1, 0, 0] })).forward === 0 && !read1(pad({ axes: [0, 1, 0, 0] })).active)

// ---------------------------------------------------------------------------
console.log('\n3. The layout\n')

chk('the standard indices are the standard ones',
    BUTTON.A === 0 && BUTTON.B === 1 && BUTTON.X === 2 && BUTTON.Y === 3 &&
    BUTTON.LB === 4 && BUTTON.RB === 5 && BUTTON.LT === 6 && BUTTON.RT === 7 &&
    BUTTON.START === 9 && BUTTON.L3 === 10 && BUTTON.R3 === 11 &&
    BUTTON.UP === 12 && BUTTON.DOWN === 13 && BUTTON.LEFT === 14 && BUTTON.RIGHT === 15 &&
    AXIS.LX === 0 && AXIS.RX === 2 && AXIS.RY === 3)

chk('R2 all the way is full throttle', near(read1(squeeze(pad(), BUTTON.RT, 1)).forward, 1))
chk('L2 all the way is full reverse', near(read1(squeeze(pad(), BUTTON.LT, 1)).forward, -1))
chk('half a trigger is about half the pull',
    Math.abs(read1(squeeze(pad(), BUTTON.RT, 0.5)).forward - 0.5) < 0.05)
chk('both triggers cancel', near(read1(squeeze(squeeze(pad(), BUTTON.RT, 1), BUTTON.LT, 1)).forward, 0))
chk('a trigger resting a hair off zero is nothing',
    read1(squeeze(pad(), BUTTON.RT, TRIGGER_DEADZONE * 0.8)).forward === 0)

const one = (i) => read1(press(pad(), i))
chk('A is boost', one(BUTTON.A).boost && !one(BUTTON.A).brake)
chk('B is the handbrake', one(BUTTON.B).brake && !one(BUTTON.B).boost)
chk('X is the donut switch', one(BUTTON.X).held.donut)
chk('Y is the garage', one(BUTTON.Y).held.garage)
chk('L1 and R1 are the indicator stalk, left and right',
    one(BUTTON.LB).held.indicateLeft && one(BUTTON.RB).held.indicateRight &&
    !one(BUTTON.LB).held.indicateRight)
chk('D-pad up is nose UP (the tail stand) and down is nose down',
    one(BUTTON.UP).held.wheelieTail && one(BUTTON.DOWN).held.wheelieNose)
chk('R3 re-centres the camera and L3 saves it', one(BUTTON.R3).held.cameraReset && one(BUTTON.L3).held.cameraSave)
chk('Menu is the sound switch', one(BUTTON.START).held.sound)
chk('A or Menu confirms in the picker', one(BUTTON.A).held.confirm && one(BUTTON.START).held.confirm)
chk('every button the pad names is a real pulse or interface action', (() => {
  const known = ['boost', 'brake', 'donut', 'garage', 'indicateLeft', 'indicateRight', 'wheelieTail',
                 'wheelieNose', 'cameraReset', 'cameraSave', 'sound', 'confirm']
  return Object.keys(rest.held).sort().join() === known.sort().join()
})())

chk('right stick right swings the view right', read1(pad({ axes: [0, 0, 1, 0] })).camYaw === 1)
chk('right stick UP raises the camera', read1(pad({ axes: [0, 0, 0, -1] })).camPitch === 1)
chk('D-pad right zooms in (zoom is + for pulling back)', one(BUTTON.RIGHT).camZoom === -1 && one(BUTTON.LEFT).camZoom === 1)
chk('D-pad left and right do NOT steer', one(BUTTON.LEFT).steering === 0 && one(BUTTON.RIGHT).steering === 0)
chk('but they do move through the picker, and so does a flick of the stick',
    one(BUTTON.RIGHT).menuX === 1 && one(BUTTON.LEFT).menuX === -1 &&
    read1(pad({ axes: [0.9, 0, 0, 0] })).menuX === 1 && read1(pad({ axes: [-0.9, 0, 0, 0] })).menuX === -1 &&
    read1(pad({ axes: [0.3, 0, 0, 0] })).menuX === 0)

// ---------------------------------------------------------------------------
console.log('\n4. A press is an edge\n')

const up = { donut: false, boost: false }
const down = { donut: true, boost: false }
chk('going down is a press', pressedSince(up, down).join() === 'donut')
chk('staying down is not', pressedSince(down, down).length === 0)
chk('coming up is not', pressedSince(down, up).length === 0)
chk('the very first poll counts what is held - the press that revealed the pad',
    pressedSince(null, down).join() === 'donut')
chk('and nothing held is nothing pressed', pressedSince(null, up).length === 0 && pressedSince(up, null).length === 0)

chk('Y has to be HELD for the garage', GARAGE_HOLD >= 0.5 && GARAGE_HOLD <= 1.2)
chk('the hold fires on the frame it crosses the line', holdFired(GARAGE_HOLD - 0.01, GARAGE_HOLD + 0.01))
chk('and not before, and not again after',
    !holdFired(0.1, 0.2) && !holdFired(GARAGE_HOLD + 0.1, GARAGE_HOLD + 0.2))

{
  const st = { dir: 0, wait: 0 }
  const steps = []
  for (let i = 0; i < 60; i++) steps.push(menuStep(st, 1, 1 / 60))
  const count = steps.filter(Boolean).length
  chk('a flick steps at once', steps[0] === 1)
  chk('held for a second it repeats a few times, not sixty',
      count >= 3 && count <= 5, `${count}`)
  chk('letting go stops it and re-arms it', menuStep(st, 0, 1 / 60) === 0 && menuStep(st, 1, 1 / 60) === 1)
  chk('and reversing steps the other way at once', menuStep(st, -1, 1 / 60) === -1)
  chk('the repeat is slow enough to stop on a vehicle', MENU_REPEAT >= 0.2)
}

// ---------------------------------------------------------------------------
console.log('\n5. Pads that are not what they seem\n')

chk('no pad is no pad', snapshotPad(null) === null && snapshotPad(undefined) === null &&
    readPad(null).connected === false && readPad(null).active === false)
chk('a disconnected pad is no pad', snapshotPad(pad({ connected: false })) === null)
chk('a snapshot is a copy, not the live object', (() => {
  const live = pad(); const snap = snapshotPad(live)
  live.axes[0] = 1; live.buttons[0] = { pressed: true, value: 1 }
  return snap.axes[0] === 0 && snap.buttons[0].pressed === false
})())
chk('a pad with holes in it reads as at rest rather than throwing',
    !readPad(snapshotPad({ id: CHROME_ID, mapping: 'standard', axes: [], buttons: [{ pressed: false, value: 0 }, null, undefined, {}] })).active)
chk('buttons given as bare numbers (old browsers) still read',
    readPad(snapshotPad({ id: 'x', mapping: 'standard', axes: [0, 0, 0, 0], buttons: [1, 0, 0, 0, 0, 0, 0, 0.8] })).boost === true)

// UNMAPPED. Axes 2 and 3 are often the triggers, resting at -1.
const raw = read1(pad({ mapping: '', axes: [0, 0, -1, -1] }))
chk('an unmapped pad is flagged', raw.connected && raw.standard === false)
chk('and its right stick is NOT read, so resting triggers cannot spin the camera',
    raw.camYaw === 0 && raw.camPitch === 0 && !raw.active)
chk('but it still steers', read1(pad({ mapping: '', axes: [1, 0, -1, -1] })).steering === -1)

// THE REAL ONE. Read off Mike's own controller on his MacBook, 26 November
// 2026, through the page itself: this id, `mapping: 'standard'`, 4 axes - and
// NINETEEN buttons, not the seventeen the standard layout has. Chrome now
// hands over the Assistant and Capture buttons as 17 and 18. Nothing here
// uses them, and nothing here may trip over them being there.
{
  const real = pad({ id: 'Stadia Controller rev. A (STANDARD GAMEPAD Vendor: 18d1 Product: 9400)' })
  real.buttons.push({ pressed: false, value: 0 }, { pressed: false, value: 0 })
  const at = read1(real)
  chk('Mike\'s controller, as his browser reports it, is a Stadia controller at rest',
      real.buttons.length === 19 && at.kind === 'stadia' && at.standard && !at.active)
  real.buttons[17] = { pressed: true, value: 1 }
  real.buttons[18] = { pressed: true, value: 1 }
  chk('and its two extra buttons, Assistant and Capture, do nothing',
      !read1(real).active && pressedSince(null, read1(real).held).length === 0)
  chk('while it still drives', near(read1(squeeze(real, BUTTON.RT, 1)).forward, 1))
}

// WHICH ONE. A headset that calls itself a gamepad must not win.
const headset = { index: 0, id: 'USB Audio Device', connected: true, mapping: '', axes: [], buttons: [{ pressed: false, value: 0 }] }
const pad2 = pad({ index: 2 })
chk('a thing with one button is not chosen over a controller', choosePad([headset, null, pad2]).index === 2)
chk('nothing connected is nothing chosen', choosePad([null, null, null, null]) === null && choosePad(null) === null)
chk('the pad in use is kept when a second one turns up',
    choosePad([pad({ index: 0, id: 'Xbox Wireless Controller' }), pad({ index: 1 })], 1).index === 1)
chk('and when it goes, the other takes over',
    choosePad([pad({ index: 0, id: 'Xbox Wireless Controller' }), null], 1).index === 0)
chk('a known, mapped controller is preferred to an unknown one when choosing afresh',
    choosePad([pad({ index: 0, id: 'Mystery Stick', mapping: '' }), pad({ index: 1 })]).index === 1)

// ---------------------------------------------------------------------------
console.log('\n6. Wired up\n')

const inputs = read('src/systems/Inputs.js')
chk('Inputs polls every frame, inside a try - getGamepads can throw',
    /update\(delta\) \{\s*this\.pollPad\(delta \|\| 0\)/.test(inputs) &&
    /try \{[\s\S]{0,200}navigator\.getGamepads\(\)[\s\S]{0,80}\} catch/.test(inputs))
chk('the pad ADDS to the keyboard, clamped, rather than replacing it',
    /forward = Math\.max\(-1, Math\.min\(1, forward \+ pad\.forward\)\)/.test(inputs) &&
    /steering = Math\.max\(-1, Math\.min\(1, steering \+ pad\.steering\)\)/.test(inputs) &&
    /boost = boost \|\| pad\.boost/.test(inputs) && /brake = brake \|\| pad\.brake/.test(inputs))
chk('presses become the SAME pulses the keys set', /if \(name in this\.pulses\) this\.pulses\[name\] = true/.test(inputs))
chk('the camera takes the stick at the camera keys\' own rates',
    /pad\.camYaw \* KEY_YAW_RATE \* delta/.test(inputs) && /pad\.camZoom \* KEY_ZOOM_RATE \* delta/.test(inputs))
chk('a pad that vanishes lets go of everything', /this\.pad\.state = state\s+this\.pad\.held = null/.test(inputs))
chk('nothing reaches the car while the picker is open',
    (inputs.match(/if \(!this\.menuOpen\) \{/g) || []).length === 2 && /if \(this\.menuOpen\) \{/.test(inputs))
chk('Inputs decides nothing about buttons - no index appears in it',
    !/buttons\[\d+\]/.test(inputs) && !/BUTTON\./.test(inputs))

const selector = read('src/ui/VehicleSelector.js')
chk('the picker steps, confirms and recalls from the pad',
    /inputs\.menuOpen = this\.open/.test(selector) && /if \(asked\.step\) this\.step\(asked\.step\)/.test(selector) &&
    /if \(asked\.confirm\) this\.confirm\(\)/.test(selector) && /asked\.garage && !this\.isBusy\(\)/.test(selector))

const ui = read('src/ui/UI.js')
chk('the HUD announces the controller by name', /\$\{change\.name\} connected/.test(ui))
chk('with textContent, not innerHTML', /this\.padNotice\.textContent = /.test(ui) && !/padNotice\.innerHTML/.test(ui))
chk('and swaps the controls box to that pad\'s buttons', /padHints\(pad\.kind\)/.test(ui))
const html = read('index.html')
chk('the page has somewhere to say it', /id="pad-notice"/.test(html))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
