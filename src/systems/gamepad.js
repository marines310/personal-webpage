/**
 * Game controllers.
 *
 * Mike: "Can you detect the Stadia controller?"
 *
 * Yes - and anything else the browser calls a gamepad, because the Stadia
 * controller is not special to a browser: once it has been switched to
 * Bluetooth mode (or is plugged in by USB) it shows up through the Gamepad
 * API as an ordinary pad with the STANDARD layout, buttons 0 to 16. What IS
 * special is recognising it, so the game can say "Stadia controller
 * connected" and label the buttons the way they are printed on it.
 *
 * No DOM in here and no `navigator`, like driving.js and the mission games,
 * and for the same reason: which button does what, how big the dead zone is
 * and what counts as a press are arithmetic, and arithmetic is tested in a
 * millisecond without a browser - or a controller, which the machine that
 * runs the tests does not have. `Inputs.js` owns `navigator.getGamepads()`
 * and hands what it finds to `snapshotPad()`; everything after that is here.
 *
 * WHAT THE GAMEPAD API DOES NOT TELL YOU
 * --------------------------------------
 * - A pad does not exist until a button on it is pressed. Browsers hide
 *   controllers from a page until the player touches one, so that a site
 *   cannot fingerprint you by what is plugged in. "Press any button" is not
 *   politeness, it is the only way in.
 * - There are no button events. The state is polled, every frame, and a
 *   PRESS is the difference between two polls - see `pressedSince()`.
 * - The Stadia controller's Assistant and Capture buttons are not there at
 *   all. The pad has nineteen buttons and the standard layout has seventeen;
 *   the other two are only reachable through WebHID, and nothing here needs
 *   them.
 */

/** Google's USB vendor id and the Stadia controller's product id, in hex. */
export const STADIA_VENDOR = '18d1'
export const STADIA_PRODUCT = '9400'

/**
 * The standard layout, by name. These are the W3C "standard gamepad"
 * indices, which is what `mapping === 'standard'` promises.
 *
 * Named for where the button IS, with Xbox letters, because that is what the
 * spec's own diagram uses - `labelsFor()` turns them into what is printed on
 * the pad in the player's hands.
 */
export const BUTTON = {
  A: 0, B: 1, X: 2, Y: 3,
  LB: 4, RB: 5, LT: 6, RT: 7,
  SELECT: 8, START: 9,
  L3: 10, R3: 11,
  UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15,
  HOME: 16
}

export const AXIS = { LX: 0, LY: 1, RX: 2, RY: 3 }

/**
 * How far a stick has to move before it counts.
 *
 * A worn stick rests anywhere within a tenth of centre, and without a dead
 * zone the car creeps and the camera drifts for ever. 0.14 is above every
 * resting value seen quoted for these pads and well below a deliberate
 * nudge. The output is RESCALED from the edge of the dead zone, so the first
 * movement past it is a small steer rather than a jump to fourteen percent.
 */
export const STICK_DEADZONE = 0.14

/** Triggers rest at exactly zero on most pads; this is for the ones that don't. */
export const TRIGGER_DEADZONE = 0.05

/**
 * How much the steering favours small movements. 1 is linear.
 *
 * A thumbstick has about a centimetre of travel and a steering wheel has
 * two turns, so linear stick steering is twitchy round the middle - exactly
 * where you are holding a lane on a bridge. Raising the deflection to a
 * power gives the first half of the travel a quarter of the lock.
 */
export const STEER_CURVE = 1.6

/** How long Y has to be held to go back to the garage, in seconds. */
export const GARAGE_HOLD = 0.7

/** In the picker, how often a held direction steps again. */
export const MENU_REPEAT = 0.28

/**
 * What kind of pad this is, from the id string the browser gives.
 *
 * The id is free text and every browser writes it differently. Chrome puts
 * the name first and the ids after it in brackets, Firefox puts the ids
 * first and the name after them:
 *
 *   Chrome   "Stadia Controller rev. A (STANDARD GAMEPAD Vendor: 18d1 Product: 9400)"
 *   Firefox  "18d1-9400-Stadia Controller rev. A"
 *
 * and other browsers may give the name alone. So it is matched on the name
 * OR on the vendor and product ids, in either order and either case. `kind`
 * is what the button labels are chosen by.
 */
export function identifyPad(id) {
  const text = String(id || '')
  const lower = text.toLowerCase()

  const hasIds = (vendor, product) =>
    lower.includes(vendor) && (product ? lower.includes(product) : true)

  if (lower.includes('stadia') || hasIds(STADIA_VENDOR, STADIA_PRODUCT)) {
    return { kind: 'stadia', name: 'Stadia controller' }
  }
  if (lower.includes('dualsense') || lower.includes('dualshock') ||
      lower.includes('playstation') || lower.includes('054c')) {
    return { kind: 'playstation', name: 'PlayStation controller' }
  }
  if (lower.includes('xbox') || lower.includes('xinput') || lower.includes('045e')) {
    return { kind: 'xbox', name: 'Xbox controller' }
  }
  if (lower.includes('pro controller') || lower.includes('joy-con') || lower.includes('057e')) {
    return { kind: 'switch', name: 'Switch controller' }
  }
  return { kind: 'generic', name: 'Controller' }
}

/**
 * What is printed on each button, by kind of pad.
 *
 * The Stadia controller uses Xbox's letters in Xbox's places - A at the
 * bottom, B on the right - and calls its shoulder buttons L1/R1 and its
 * triggers L2/R2, PlayStation-style. So it gets a row of its own.
 */
export function labelsFor(kind) {
  switch (kind) {
    case 'stadia':
      return { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2',
               START: 'Menu', L3: 'L3', R3: 'R3' }
    case 'playstation':
      return { A: '✕', B: '○', X: '□', Y: '△', LB: 'L1', RB: 'R1', LT: 'L2', RT: 'R2',
               START: 'Options', L3: 'L3', R3: 'R3' }
    case 'switch':
      // Nintendo's letters are mirrored: the BOTTOM button is B.
      return { A: 'B', B: 'A', X: 'Y', Y: 'X', LB: 'L', RB: 'R', LT: 'ZL', RT: 'ZR',
               START: '+', L3: 'LS', R3: 'RS' }
    default:
      return { A: 'A', B: 'B', X: 'X', Y: 'Y', LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT',
               START: 'Menu', L3: 'LS', R3: 'RS' }
  }
}

/**
 * The lines for the controls box, for the pad in the player's hands.
 * Four, to fit where the keyboard's four are.
 */
export function padHints(kind) {
  const b = labelsFor(kind)
  return [
    `Left stick to steer · ${b.LT} to go · ${b.RT} to brake`,
    `${b.B} to boost · ${b.A} to reverse · ${b.LB} / ${b.RB} to indicate`,
    `Right stick to look · ${b.R3} to re-centre · D-pad ◀ ▶ to zoom`,
    `${b.X} donut · D-pad ▲ front up / ▼ rear up · hold ${b.Y} for the garage`
  ]
}

/**
 * Stick deflection with the dead zone taken out and the rest rescaled, so
 * the answer runs smoothly from 0 at the edge of the dead zone to 1 at full
 * travel. Anything that is not a finite number is centre.
 */
export function deadzone(value, zone = STICK_DEADZONE) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0
  const size = Math.abs(value)
  if (size <= zone) return 0
  const scaled = Math.min(1, (size - zone) / (1 - zone))
  return value < 0 ? -scaled : scaled
}

/** A stick deflection through the steering curve, sign kept. */
export function steerCurve(value, power = STEER_CURVE) {
  const size = Math.min(1, Math.abs(value))
  const curved = Math.pow(size, power)
  return value < 0 ? -curved : curved
}

/**
 * A plain copy of a Gamepad, so nothing downstream holds the live object.
 *
 * Chrome hands back a NEW Gamepad object on every `getGamepads()` call and
 * Firefox updates one in place; code that keeps "last frame's pad" to compare
 * against gets two different bugs out of that. A snapshot is the same thing
 * in both. Tolerant of everything being missing, because a pad that is half
 * way through disconnecting is exactly that.
 */
export function snapshotPad(pad) {
  if (!pad || pad.connected === false) return null
  return {
    index: typeof pad.index === 'number' ? pad.index : 0,
    id: String(pad.id || ''),
    standard: pad.mapping === 'standard',
    axes: Array.from(pad.axes || [], a => (typeof a === 'number' && Number.isFinite(a) ? a : 0)),
    buttons: Array.from(pad.buttons || [], b => {
      if (typeof b === 'number') return { pressed: b > 0.5, value: b }
      const value = b && typeof b.value === 'number' ? b.value : (b && b.pressed ? 1 : 0)
      return { pressed: !!(b && (b.pressed || value > 0.5)), value }
    })
  }
}

/**
 * Which of several pads to listen to.
 *
 * The one already in use if it is still there - a second controller being
 * switched on must not take the car away from the first - and otherwise the
 * first that is connected. A Stadia pad is preferred over an unknown device
 * when choosing afresh, because some keyboards and headsets announce
 * themselves as gamepads with no buttons, and they tend to be index 0.
 */
export function choosePad(pads, currentIndex = null) {
  const live = []
  for (const pad of pads || []) {
    const snap = snapshotPad(pad)
    if (snap && snap.buttons.length >= 4) live.push(snap)
  }
  if (!live.length) return null

  const current = live.find(p => p.index === currentIndex)
  if (current) return current

  return live.find(p => identifyPad(p.id).kind !== 'generic' && p.standard) ||
         live.find(p => p.standard) ||
         live[0]
}

const pressed = (snap, index) => !!(snap.buttons[index] && snap.buttons[index].pressed)
const value = (snap, index) => (snap.buttons[index] ? snap.buttons[index].value : 0)

/**
 * Everything the game wants to know about a pad this frame.
 *
 *   steering  +1 left, -1 right    - the same convention getInput() uses
 *   forward   +1 throttle, -1 reverse
 *   boost, brake                    - held
 *   camYaw, camPitch, camZoom       - -1 to 1, to be multiplied by a rate
 *   held                            - every named button, for pressedSince()
 *   menuX                           - -1, 0 or 1: left or right, for the picker
 *
 * The left trigger applies throttle and the right trigger brakes to a stop.
 * Reverse has its own button so holding the brake keeps the vehicle stopped.
 *
 * IF THE BROWSER DID NOT MAP IT (`standard` false), only what is safe is
 * read: the first stick's X axis and the buttons. The right stick is left
 * alone, because on an unmapped pad axes 2 and 3 are often the TRIGGERS,
 * which rest at -1 - and that is a camera spinning for ever.
 */
export function readPad(snap, suppressReverse = false) {
  const empty = {
    connected: false, kind: 'generic', name: '', standard: false,
    steering: 0, forward: 0, boost: false, brake: false,
    camYaw: 0, camPitch: 0, camZoom: 0, menuX: 0, held: {}, active: false
  }
  if (!snap) return empty

  const who = identifyPad(snap.id)
  const stickX = deadzone(snap.axes[AXIS.LX])

  // D-pad left/right is NOT steering. It is the zoom outside the picker and
  // the picker's own left/right inside it; `menuX` also takes the stick, so
  // either thumb can flick through the garage.
  const padX = (pressed(snap, BUTTON.RIGHT) ? 1 : 0) - (pressed(snap, BUTTON.LEFT) ? 1 : 0)

  const go = deadzone(value(snap, BUTTON.LT), TRIGGER_DEADZONE)
  const stop = deadzone(value(snap, BUTTON.RT), TRIGGER_DEADZONE)

  const held = {
    boost: pressed(snap, BUTTON.B),
    reverse: pressed(snap, BUTTON.A),
    brake: stop > 0,
    donut: pressed(snap, BUTTON.X),
    garage: pressed(snap, BUTTON.Y),
    indicateLeft: pressed(snap, BUTTON.LB),
    indicateRight: pressed(snap, BUTTON.RB),
    wheelieTail: pressed(snap, BUTTON.UP),
    wheelieNose: pressed(snap, BUTTON.DOWN),
    cameraReset: pressed(snap, BUTTON.R3),
    cameraSave: pressed(snap, BUTTON.L3),
    sound: pressed(snap, BUTTON.START),
    confirm: pressed(snap, BUTTON.A) || pressed(snap, BUTTON.START)
  }

  const reverse = suppressReverse ? 0 : value(snap, BUTTON.A)
  const out = {
    connected: true,
    kind: who.kind,
    name: who.name,
    standard: snap.standard,
    // Stick right is +X; steering is + for LEFT. One minus sign, here.
    steering: -steerCurve(stickX),
    forward: held.brake ? 0 : go - reverse,
    boost: held.boost,
    brake: held.brake,
    camYaw: snap.standard ? deadzone(snap.axes[AXIS.RX]) : 0,
    // Stick UP is -Y, and + pitch raises the camera. Push up to look from higher.
    camPitch: snap.standard ? -deadzone(snap.axes[AXIS.RY]) : 0,
    // + zoom pulls BACK, so D-pad right (closer) is negative.
    camZoom: -padX,
    menuX: padX !== 0 ? padX : (stickX > 0.5 ? 1 : stickX < -0.5 ? -1 : 0),
    held
  }

  out.active = out.steering !== 0 || out.forward !== 0 ||
    out.camYaw !== 0 || out.camPitch !== 0 || out.camZoom !== 0 ||
    Object.values(held).some(Boolean)
  return out
}

/**
 * The buttons that went DOWN between two polls, by name.
 *
 * A press is an edge, not a level: a toggle read from the level flips sixty
 * times a second for as long as the thumb is on it. `before` may be null -
 * the first poll after a pad appears - and then everything held counts as
 * just pressed, which is right: the press that made the browser reveal the
 * pad is a press the player meant.
 */
export function pressedSince(before, now) {
  const out = []
  for (const [name, down] of Object.entries(now || {})) {
    if (down && !(before && before[name])) out.push(name)
  }
  return out
}

/**
 * Hold-to-confirm: has a button held for `heldFor` seconds just crossed the
 * line? True on exactly one frame, so holding Y sends you to the garage once
 * rather than every frame from 0.7 seconds onward.
 */
export function holdFired(heldBefore, heldNow, threshold = GARAGE_HOLD) {
  return heldBefore < threshold && heldNow >= threshold
}

/**
 * Left/right in a menu, with auto-repeat: one step at once on the flick,
 * then another every MENU_REPEAT seconds while it is held.
 *
 * `state` is `{ dir, wait }` and is updated in place; the return is -1, 0 or
 * 1 for this frame. A stick has no "key repeat" of its own, and without
 * this a held direction either does nothing after the first step or - read
 * as a level - spins through all fourteen vehicles in a quarter of a second.
 */
export function menuStep(state, dir, delta, repeat = MENU_REPEAT) {
  if (dir === 0) { state.dir = 0; state.wait = 0; return 0 }
  if (dir !== state.dir) { state.dir = dir; state.wait = repeat; return dir }
  state.wait -= delta
  if (state.wait <= 0) { state.wait += repeat; return dir }
  return 0
}
