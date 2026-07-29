/**
 * Inputs - Keyboard and touch input handling
 *
 * Keys are tracked independently and only resolved against each other
 * inside getInput(). That way holding S, tapping W, then releasing W
 * correctly leaves the car still reversing.
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
      brake: false
    }

    // One-shot actions. Set on keydown, cleared once something reads them,
    // so a single press fires exactly one event no matter the frame rate.
    this.pulses = {
      cameraReset: false
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

    this.setupKeyboard()
    this.setupTouch()
  }

  setupKeyboard() {
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    // If the window loses focus mid-press we'd never get the keyup,
    // which would leave the car driving on its own. Clear everything.
    window.addEventListener('blur', this.onBlur)
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
  }
}
