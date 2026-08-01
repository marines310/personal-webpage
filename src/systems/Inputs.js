import {
  KEY_YAW_RATE, KEY_PITCH_RATE, KEY_ZOOM_RATE,
  DRAG_YAW, DRAG_PITCH, WHEEL_ZOOM
} from './cameraPose.js'

/**
 * Inputs - keyboard, mouse and touch input handling.
 *
 * Keys are tracked independently and only resolved against each other
 * inside getInput(). That way holding S, tapping W, then releasing W
 * correctly leaves the car still reversing.
 *
 * THE CAMERA HAS TWO WAYS IN AND ONE WAY OUT
 * ------------------------------------------
 * Mouse drag and the camera keys both come out of `getCameraInput()` as the
 * same three numbers - radians of yaw, radians of pitch, a proportion of zoom.
 * Neither device has a path of its own past that point, so they cannot come to
 * mean different things, and the rates that decide how far a nudge goes live
 * in cameraPose.js beside the limits they push against.
 */
export class Inputs {
  constructor() {
    // Raw key state - each direction tracked on its own
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      boost: false,
      brake: false,
      camLeft: false,
      camRight: false,
      camUp: false,
      camDown: false,
      camOut: false,
      camIn: false
    }

    // One-shot actions. Set on keydown, cleared once something reads them,
    // so a single press fires exactly one event no matter the frame rate.
    this.pulses = {
      cameraReset: false,
      cameraSave: false,
      indicateLeft: false,
      indicateRight: false
    }

    // Mouse, for looking around. `dx`/`dy` accumulate pixels between reads
    // and `wheel` accumulates notches, so a frame that happens to catch three
    // move events is worth exactly as much as three frames catching one - the
    // view moves with the mouse, not with the frame rate.
    this.mouse = {
      dragging: false,
      lastX: 0,
      lastY: 0,
      dx: 0,
      dy: 0,
      wheel: 0
    }

    // Touch controls
    this.touch = {
      active: false,
      joystick: { x: 0, y: 0 },
      boost: false
    }

    // Bind event handlers
    this.onKeyDown = this.onKeyDown.bind(this)
    this.onKeyUp = this.onKeyUp.bind(this)
    this.onBlur = this.onBlur.bind(this)
    this.onTouchStart = this.onTouchStart.bind(this)
    this.onTouchMove = this.onTouchMove.bind(this)
    this.onTouchEnd = this.onTouchEnd.bind(this)
    this.onMouseDown = this.onMouseDown.bind(this)
    this.onMouseMove = this.onMouseMove.bind(this)
    this.onMouseUp = this.onMouseUp.bind(this)
    this.onWheel = this.onWheel.bind(this)
    this.onContextMenu = this.onContextMenu.bind(this)

    this.setupKeyboard()
    this.setupMouse()
    this.setupTouch()
  }

  setupKeyboard() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    // If the window loses focus mid-press we'd never get the keyup,
    // which would leave the car driving on its own. Clear everything.
    window.addEventListener('blur', this.onBlur)
  }

  /**
   * Mouse look.
   *
   * A drag only counts if it STARTED on the canvas. Anything that begins on
   * a HUD element - the conditions panel, the minimap, the vehicle picker -
   * is that element's business, and swinging the camera because someone
   * dragged a time slider would be maddening. The move and up listeners go on
   * the window rather than the canvas so a drag that leaves the canvas, or
   * ends outside the browser window, still finishes cleanly instead of
   * leaving the camera stuck to the mouse.
   */
  setupMouse() {
    const canvas = document.getElementById('canvas')
    if (canvas) canvas.addEventListener('mousedown', this.onMouseDown)
    window.addEventListener('mousemove', this.onMouseMove)
    window.addEventListener('mouseup', this.onMouseUp)
    // Non-passive, because zooming has to stop the page scrolling with it.
    window.addEventListener('wheel', this.onWheel, { passive: false })
    // Right-drag is the second way to look around, so the menu has to go -
    // but only over the canvas, so right-clicking the HUD still behaves.
    if (canvas) canvas.addEventListener('contextmenu', this.onContextMenu)
  }

  onMouseDown(event) {
    // Left or right; middle click is left alone for the browser.
    if (event.button !== 0 && event.button !== 2) return
    this.mouse.dragging = true
    this.mouse.lastX = event.clientX
    this.mouse.lastY = event.clientY
    event.preventDefault()
  }

  /**
   * How far the pointer moved, worked out from where it now is.
   *
   * `event.movementX` looks like the obvious thing to use and is not: it is
   * absent or zero on synthetic events, and browsers disagree about whether it
   * is in CSS pixels or device pixels once the page is zoomed. Two clientX
   * readings subtracted are the same number everywhere.
   */
  onMouseMove(event) {
    if (!this.mouse.dragging) return
    this.mouse.dx += event.clientX - this.mouse.lastX
    this.mouse.dy += event.clientY - this.mouse.lastY
    this.mouse.lastX = event.clientX
    this.mouse.lastY = event.clientY
  }

  onMouseUp() {
    this.mouse.dragging = false
  }

  onWheel(event) {
    // Only when the pointer is over the world. Over a panel the wheel should
    // scroll the panel, and over the zone content it must.
    if (event.target && event.target.id !== 'canvas') return
    event.preventDefault()
    // deltaMode 1 is lines rather than pixels, which Firefox sends; without
    // the scale a single notch there would zoom about sixteen times as far.
    const scale = event.deltaMode === 1 ? 16 : 1
    this.mouse.wheel += event.deltaY * scale
  }

  onContextMenu(event) {
    event.preventDefault()
  }

  setupTouch() {
    if ('ontouchstart' in window) {
      window.addEventListener('touchstart', this.onTouchStart)
      window.addEventListener('touchmove', this.onTouchMove)
      window.addEventListener('touchend', this.onTouchEnd)
    }
  }

  /**
   * Map a physical key to a logical control.
   * WASD and the arrow keys are treated as the same input.
   */
  resolveKey(code) {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        return 'forward'
      case 'KeyS':
      case 'ArrowDown':
        return 'backward'
      case 'KeyA':
      case 'ArrowLeft':
        return 'left'
      case 'KeyD':
      case 'ArrowRight':
        return 'right'
      case 'ShiftLeft':
      case 'ShiftRight':
        return 'boost'
      case 'Space':
        return 'brake'
      case 'KeyC':
        return 'cameraReset'
      case 'KeyV':
        return 'cameraSave'

      // Camera. Q/E sit above A/D and swing the same way they steer; R/F
      // raise and lower; Z/X are the zoom pair. None of them is a driving
      // control, and `tests/camera.mjs` checks that rather than trusting it.
      case 'KeyQ':
        return 'camLeft'
      case 'KeyE':
        return 'camRight'
      case 'KeyR':
        return 'camUp'
      case 'KeyF':
        return 'camDown'
      case 'KeyZ':
        return 'camOut'
      case 'KeyX':
        return 'camIn'

      // Indicator stalk. Comma and full stop because they carry the
      // direction on the key itself, and because everything nearer the
      // driving keys was already taken.
      case 'Comma':
        return 'indicateLeft'
      case 'Period':
        return 'indicateRight'

      default:
        return null
    }
  }

  onKeyDown(event) {
    const control = this.resolveKey(event.code)
    if (!control) return

    // Stop arrow keys / space from scrolling the page
    if (event.code.startsWith('Arrow') || event.code === 'Space') {
      event.preventDefault()
    }

    // One-shot actions fire on the press itself. `event.repeat` guards
    // against the OS key-repeat firing it over and over when held.
    if (control in this.pulses) {
      if (!event.repeat) this.pulses[control] = true
      return
    }

    this.keys[control] = true
  }

  onKeyUp(event) {
    const control = this.resolveKey(event.code)
    if (!control || control in this.pulses) return
    this.keys[control] = false
  }

  onBlur() {
    for (const key of Object.keys(this.keys)) {
      this.keys[key] = false
    }
    for (const key of Object.keys(this.pulses)) {
      this.pulses[key] = false
    }
    // Same reason as the keys: a drag that was in progress when the window
    // lost focus never gets its mouseup, and the camera would keep swinging.
    this.mouse.dragging = false
    this.mouse.dx = 0
    this.mouse.dy = 0
    this.mouse.wheel = 0
  }

  /**
   * Did the player press C since this was last checked?
   * Reading it clears it, so the camera snaps once per press.
   */
  consumeCameraReset() {
    if (!this.pulses.cameraReset) return false
    this.pulses.cameraReset = false
    return true
  }

  /** Did the player press V since this was last checked? */
  consumeCameraSave() {
    if (!this.pulses.cameraSave) return false
    this.pulses.cameraSave = false
    return true
  }

  /**
   * Which indicator was pressed since this was last checked: -1, 0 or +1.
   *
   * Both at once resolves to nothing rather than to whichever was read first.
   * It is not a plausible thing to do on purpose, and "the left one, because
   * of the order of two lines in this function" is not an answer.
   */
  consumeIndicator() {
    const left = this.pulses.indicateLeft
    const right = this.pulses.indicateRight
    this.pulses.indicateLeft = false
    this.pulses.indicateRight = false
    if (left === right) return 0
    return left ? -1 : 1
  }

  /**
   * What the player has asked the camera to do this frame.
   *
   * Keys are a RATE and so are multiplied by delta; the mouse is a
   * DISPLACEMENT and is not, because the pixels have already happened. Mixing
   * those up is the classic way to get a camera that swings twice as fast on
   * a fast machine. Reading clears the mouse accumulators, so nothing is
   * counted twice.
   *
   *   yaw    + turns the view right
   *   pitch  + raises the camera and looks down over the car
   *   zoom   + pulls back
   */
  getCameraInput(delta) {
    const k = this.keys
    let yaw = ((k.camRight ? 1 : 0) - (k.camLeft ? 1 : 0)) * KEY_YAW_RATE * delta
    let pitch = ((k.camUp ? 1 : 0) - (k.camDown ? 1 : 0)) * KEY_PITCH_RATE * delta
    let zoom = ((k.camOut ? 1 : 0) - (k.camIn ? 1 : 0)) * KEY_ZOOM_RATE * delta

    // Read unconditionally, NOT only while the button is down. Gating this on
    // `dragging` threw away the tail of every drag: the pixels between the
    // last frame and the mouseup had already been counted into dx and were
    // then never spent. Invisible at sixty frames a second and obvious at ten,
    // which is a bug that would only ever show up on a slow machine. Nothing
    // writes dx unless a drag is in progress, so reading it always is safe.
    yaw += this.mouse.dx * DRAG_YAW
    pitch += this.mouse.dy * DRAG_PITCH
    zoom += this.mouse.wheel * WHEEL_ZOOM

    this.mouse.dx = 0
    this.mouse.dy = 0
    this.mouse.wheel = 0

    return { yaw, pitch, zoom, active: yaw !== 0 || pitch !== 0 || zoom !== 0 }
  }

  onTouchStart(event) {
    this.touch.active = true
    this.updateTouchPosition(event)
  }

  onTouchMove(event) {
    if (this.touch.active) {
      this.updateTouchPosition(event)
    }
  }

  onTouchEnd(event) {
    this.touch.active = false
    this.touch.joystick = { x: 0, y: 0 }
  }

  updateTouchPosition(event) {
    if (event.touches.length === 0) return

    const touch = event.touches[0]
    const centerX = window.innerWidth / 2
    const centerY = window.innerHeight / 2

    this.touch.joystick.x = (touch.clientX - centerX) / (window.innerWidth / 4)
    this.touch.joystick.y = (touch.clientY - centerY) / (window.innerHeight / 4)

    this.touch.joystick.x = Math.max(-1, Math.min(1, this.touch.joystick.x))
    this.touch.joystick.y = Math.max(-1, Math.min(1, this.touch.joystick.y))

    this.touch.boost = event.touches.length >= 2
  }

  update(delta) {
    // Input state is event driven; nothing to poll.
  }

  /**
   * Combined, resolved input.
   *
   *   forward:  +1 throttle, -1 reverse, 0 coast  (opposites cancel)
   *   steering: +1 left,     -1 right,   0 centre (opposites cancel)
   */
  getInput() {
    // Opposing keys cancel rather than one winning
    let forward = (this.keys.forward ? 1 : 0) - (this.keys.backward ? 1 : 0)
    let steering = (this.keys.left ? 1 : 0) - (this.keys.right ? 1 : 0)

    let boost = this.keys.boost
    const brake = this.keys.brake

    // Touch overrides keyboard while a finger is down
    if (this.touch.active) {
      forward = -this.touch.joystick.y
      steering = -this.touch.joystick.x
      boost = this.touch.boost

      // Small dead zone so resting fingers don't creep the car
      if (Math.abs(forward) < 0.15) forward = 0
      if (Math.abs(steering) < 0.15) steering = 0
    }

    return { forward, steering, boost, brake }
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('touchstart', this.onTouchStart)
    window.removeEventListener('touchmove', this.onTouchMove)
    window.removeEventListener('touchend', this.onTouchEnd)

    const canvas = document.getElementById('canvas')
    if (canvas) {
      canvas.removeEventListener('mousedown', this.onMouseDown)
      canvas.removeEventListener('contextmenu', this.onContextMenu)
    }
    window.removeEventListener('mousemove', this.onMouseMove)
    window.removeEventListener('mouseup', this.onMouseUp)
    window.removeEventListener('wheel', this.onWheel)
  }
}
