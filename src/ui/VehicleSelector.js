import { Game } from '../core/Game.js'
import {
  getPlayerGarage,
  inGarageBay,
  TRAFFIC_LENGTHS
} from '../world/islandLayout.js'
import { REST_ABOVE_SURFACE } from '../world/Vehicle.js'

/**
 * Choosing what to drive.
 *
 * The preview IS the vehicle. Rather than building a second scene with its own
 * camera and its own copy of every body - which would be a second
 * implementation of "what a fire engine looks like", and would drift - the
 * player's own vehicle sits in the garage and changes as you scroll. What you
 * are looking at is the thing you are about to drive, so it cannot be wrong.
 *
 * The order is the traffic's own table, so a kind added to the fleet appears
 * here without anyone remembering to add it twice.
 */
export const VEHICLE_KINDS = Object.keys(TRAFFIC_LENGTHS)

/**
 * What each vehicle is CALLED, as opposed to what the code calls it.
 *
 * Mike: "the Monorail and Tow Truck seem to have lower case names."
 *
 * They did, and it is the exact price of the convenience described one comment
 * up. `VEHICLE_KINDS` is `Object.keys(TRAFFIC_LENGTHS)`, so a kind added to the
 * fleet appears in this picker on its own - which is the right design, and is
 * why the two new vehicles turned up here without anybody doing anything. But
 * their NAMES do not come along with them, and `label()` fell back to
 * `|| kind`, so the raw key went on the screen: "monorail" and "tow", lower
 * case, next to "Monster Truck" and "Fire Engine".
 *
 * A silent fallback to an internal identifier is the same mistake as the cab's
 * uncarried userData: it runs, it looks deliberate, and it is wrong. So the
 * fallback in `label()` now at least capitalises, and `tests/names.mjs`
 * insists on an entry here for every kind in the fleet - which makes the next
 * vehicle a failing test rather than a lower-case word in the garage.
 */
const LABELS = {
  sedan: 'Sedan',
  convertible: 'Convertible',
  pickup: 'Pickup',
  suv: 'SUV',
  police: 'Police Car',
  ambulance: 'Ambulance',
  fire: 'Fire Engine',
  bus: 'City Bus',
  monster: 'Monster Truck',
  race: 'Race Car',
  tow: 'Tow Truck',
  monorail: 'Monorail'
}

/** How long the roll-out takes, and how far it goes. */
const ROLL_OUT_SECONDS = 1.6

/**
 * How close together the two Backspaces have to be to count as a double.
 *
 * Long enough to be comfortable on a keyboard you are already using to
 * steer, short enough that two separate presses a beat apart are not read as
 * one gesture. A single press does nothing at all, which is the point: this
 * throws away wherever you had driven to, so it should not be possible to do
 * by brushing a key.
 */
const RECALL_WINDOW = 450

export class VehicleSelector {
  constructor() {
    this.game = Game.getInstance()
    this.index = 0
    this.open = false
    this.rolling = 0
    this.el = null
    this.lastRecallKey = 0
    this.onKey = this.onKey.bind(this)
    this.onGlobalKey = this.onGlobalKey.bind(this)

    // Always listening, unlike `onKey`, which is only bound while the picker
    // is up. The whole point of this one is to work when it is not.
    window.addEventListener('keydown', this.onGlobalKey)
  }

  /**
   * Backspace twice, quickly: back to the garage, whatever has happened.
   *
   * The way out of trouble that does not depend on the world being in a fit
   * state. Wedged against a building, upside down on a beach, or simply a
   * long way from home and not wanting the drive back - two taps and you are
   * in the bay with the picker open, which is exactly where the game starts.
   *
   * It reuses show() rather than reimplementing a respawn, and that is worth
   * keeping: show() parks the vehicle in the bay, and Vehicle.placeAt() zeroes
   * the velocity, the spin, the steering and the stuck timer. A second way to
   * put the car somewhere would be a second set of those to forget.
   */
  onGlobalKey(event) {
    if (event.key !== 'Backspace') return

    // Never steal the key from something being typed into.
    const el = document.activeElement
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' ||
               el.isContentEditable)) {
      return
    }

    // Backspace is "go back a page" on some browsers, and losing the session
    // to a mistyped key would be a poor reward for asking for a respawn.
    event.preventDefault()

    if (this.isBusy()) return

    const now = performance.now()
    const quick = now - this.lastRecallKey < RECALL_WINDOW
    this.lastRecallKey = quick ? 0 : now

    if (quick) this.show()
  }

  label(kind) {
    // The fallback capitalises rather than handing the raw key straight to the
    // screen. It is still a bug to land here - the test above `LABELS` is what
    // catches that - but "Monorail" is a name and "monorail" is a variable,
    // and only one of those belongs in a garage.
    if (LABELS[kind]) return LABELS[kind]
    if (!kind) return ''
    return kind.charAt(0).toUpperCase() + kind.slice(1)
  }

  /**
   * Show the picker, with the vehicle parked in the garage.
   *
   * Driving is suspended while it is open - not by ignoring input, but by the
   * game asking `isBusy()` before it steers anything. One flag, read in one
   * place, rather than a second input path to keep in step.
   */
  show() {
    if (this.open) return
    const garage = getPlayerGarage()
    if (!garage) return

    this.open = true
    this.garage = garage
    this.leftBay = false

    // Start from what is being driven now, not from the top of the list.
    const current = this.game.vehicle ? this.game.vehicle.kind : 'sedan'
    const at = VEHICLE_KINDS.indexOf(current)
    if (at >= 0) this.index = at

    this.build()
    this.park()
    this.render()

    window.addEventListener('keydown', this.onKey)
  }

  build() {
    if (this.el) { this.el.style.display = 'flex'; return }

    const el = document.createElement('div')
    el.id = 'vehicle-selector'
    el.innerHTML =
      '<div class="vs-inner">' +
      '  <div class="vs-title">Choose your vehicle</div>' +
      '  <div class="vs-row">' +
      '    <button class="vs-arrow" data-step="-1">&#8249;</button>' +
      '    <div class="vs-name"></div>' +
      '    <button class="vs-arrow" data-step="1">&#8250;</button>' +
      '  </div>' +
      '  <div class="vs-dots"></div>' +
      '  <div class="vs-hint">A / D or &#8592; &#8594; to browse &middot; ENTER to drive</div>' +
      '</div>'
    document.body.appendChild(el)

    for (const button of el.querySelectorAll('.vs-arrow')) {
      button.addEventListener('click', () => this.step(Number(button.dataset.step)))
    }
    el.querySelector('.vs-inner').addEventListener('click', (e) => {
      if (e.target.classList.contains('vs-arrow')) return
      this.confirm()
    })

    this.el = el
  }

  /**
   * Sit the vehicle in the garage bay, facing the door.
   *
   * Through the vehicle's own placeAt(), which brings it properly to rest.
   * This used to set the translation and the linear velocity by hand and then
   * assign `vehicle.speed = 0` - and there is no `speed` on a Vehicle, it is
   * `currentSpeed`. Harmless at the start of a session, when the car is
   * already stationary; not harmless now that falling in the sea brings you
   * here at whatever speed you left the road, because the physics velocity was
   * cleared and the driving model's own speed was not.
   */
  park() {
    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.body || !vehicle.placeAt) return

    const bay = this.garage.bay
    vehicle.placeAt(bay.x, this.bayHeight(), bay.z, bay.heading)
  }

  /**
   * How high to put the car so that it RESTS there, rather than falls there.
   *
   * Mike: "i still have kind of a 'drop' right out of the driveway like
   * there's a cliff im driving off of."
   *
   * This used to be `groundAt(x, z) + 2.2`, and the 2.2 is the whole bug. It
   * is a DROP height, borrowed from the respawn, where being flung down a
   * couple of units costs nothing because you were teleporting anyway. A
   * roll-out is not a teleport - it is a continuous move you are watching -
   * so the car glided out of the bay on an invisible ramp and fell off the end
   * of it. Traced in a headless browser, driving out of the garage:
   *
   *     dist 21.5   y 1.82 -> 1.42 -> 1.00 -> 0.55 -> 0.50   vy -9.09
   *
   * A 1.3-unit fall, with the wheels off the ground the whole way down - which
   * is also why the throttle did nothing for the first second.
   *
   * Two separate mistakes were in that one line:
   *
   *   1. The offset was a DROP height, not the car's resting height.
   *   2. It was measured from the height FIELD, not from the surface you can
   *      actually drive on. The collider stands `surfaceLift(claim)` above the
   *      field on grass and is a garage floor indoors, so `groundAt()` was
   *      answering a different question from the one being asked.
   *
   * Two rounds were spent measuring the TERRAIN under this driveway - which is
   * smooth to within 4cm the whole way, and always was - before anyone
   * measured the car.
   *
   * The raycast can miss: over the sea, or before the colliders exist. The
   * fallback is the old behaviour, because a car dropped from too high still
   * lands and a car placed at `null` does not exist.
   */
  restingHeight(x, z) {
    const world = this.game.world
    const vehicle = this.game.vehicle
    const surface = world && world.drivableAt
      ? world.drivableAt(x, z, vehicle && vehicle.body)
      : null

    if (typeof surface === 'number' && Number.isFinite(surface)) {
      return surface + REST_ABOVE_SURFACE
    }
    return (world && world.groundAt ? world.groundAt(x, z) : 0) + 2.2
  }

  /** How high the bay floor is. */
  bayHeight() {
    const bay = this.garage.bay
    return this.restingHeight(bay.x, bay.z)
  }

  step(by) {
    this.index = (this.index + by + VEHICLE_KINDS.length) % VEHICLE_KINDS.length
    const vehicle = this.game.vehicle
    if (vehicle) vehicle.setKind(VEHICLE_KINDS[this.index])
    this.park()
    this.render()
  }

  render() {
    if (!this.el) return
    this.el.querySelector('.vs-name').textContent =
      this.label(VEHICLE_KINDS[this.index])
    this.el.querySelector('.vs-dots').innerHTML = VEHICLE_KINDS
      .map((_, i) => '<span class="vs-dot' + (i === this.index ? ' on' : '') + '"></span>')
      .join('')
  }

  onKey(event) {
    if (!this.open) return
    const key = event.key

    if (key === 'a' || key === 'A' || key === 'ArrowLeft') { this.step(-1); event.preventDefault() }
    else if (key === 'd' || key === 'D' || key === 'ArrowRight') { this.step(1); event.preventDefault() }
    else if (key === 'Enter' || key === ' ') { this.confirm(); event.preventDefault() }
  }

  /** Chosen. Close up and roll out of the garage. */
  confirm() {
    if (!this.open) return
    this.open = false
    window.removeEventListener('keydown', this.onKey)
    if (this.el) this.el.style.display = 'none'
    this.rolling = ROLL_OUT_SECONDS
  }

  /**
   * The roll-out.
   *
   * Driven from the garage's own bay and apron rather than a distance picked
   * here, so it cannot come adrift from where the building actually is.
   */
  update(delta) {
    if (this.rolling <= 0) {
      this.checkEntered()
      return
    }

    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.body || !this.garage) { this.rolling = 0; return }

    this.rolling = Math.max(0, this.rolling - delta)
    const t = 1 - this.rolling / ROLL_OUT_SECONDS

    // Eased, so it pulls away rather than jerking off the mark.
    const ease = t * t * (3 - 2 * t)
    const from = this.garage.bay
    const to = this.garage.apron

    const x = from.x + (to.x - from.x) * ease
    const z = from.z + (to.z - from.z) * ease
    const y = this.restingHeight(x, z)

    vehicle.body.setTranslation({ x, y, z }, true)
    vehicle.heading = from.heading

    // HANDED OVER AT THE SPEED IT WAS ACTUALLY DOING, not from a standstill.
    //
    // The roll-out covers the bay-to-apron run in ROLL_OUT_SECONDS and then
    // set `currentSpeed = 0`, so at the instant control returned the car was
    // stationary in the middle of its own driveway and had to pull away again.
    // That is a lurch in its own right, and until the fall above was fixed it
    // was hiding inside a bigger one.
    //
    // The rate is the derivative of the smoothstep the position is eased with,
    // 6t(1-t), so the number handed over is the speed the car was visibly
    // doing rather than a guess - and it is zero at t = 1, where the ease
    // flattens out, so there is no step there either.
    const run = Math.hypot(to.x - from.x, to.z - from.z)
    vehicle.currentSpeed = run * (6 * t * (1 - t)) / ROLL_OUT_SECONDS
  }

  /**
   * Drive into the garage and the picker opens again.
   *
   * Tested against the bay's own rectangle, in the garage's own axes - not a
   * radius around its centre. A circle round a 12 x 17 building either reaches
   * ten units out into the plaza or misses the back of the bay, and this
   * project has made that exact swap five times now.
   *
   * The vehicle also has to be nearly stopped, so driving PAST the door at
   * speed does not snatch control away.
   */
  checkEntered() {
    if (this.isBusy() || !this.garage) return

    // NOT WHILE THERE IS A CAR ON THE HOOK.
    //
    // The tow truck's whole job ends by driving INTO this bay, which is the
    // one place in the world that takes the player's vehicle away from them.
    // Opening the picker there would swap the truck out from under a wrecked
    // car dangling off its boom, and the player would then have to re-pick the
    // tow truck between every single recovery.
    //
    // Only while something is actually attached: with an empty hook the player
    // is free to change their mind and go and get something else, and an AI
    // tow truck picks the job up. See World.towBusy().
    const world = this.game.world
    if (world && world.towBusy && world.towBusy()) { this.leftBay = true; return }

    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.body) return
    // getSpeed(), not `vehicle.speed` - which does not exist, so this guard
    // has never once fired and driving PAST the door at speed would snatch
    // control away, which is precisely what it was written to prevent.
    if (vehicle.getSpeed() > 2.5) { this.leftBay = true; return }

    // The bay is a rectangle in the garage's own frame. The arithmetic used to
    // be written out here; it is `inGarageBay()` now, because the tow truck's
    // drop-off has to agree with this exactly and two copies of a rectangle
    // test is two chances to disagree about where the garage is.
    const at = vehicle.body.translation()
    const inside = inGarageBay(this.garage, at.x, at.z)

    // Having rolled out, the vehicle starts on the apron and has to leave the
    // bay once before driving back in counts - or the picker would reopen the
    // instant it closed.
    if (!inside) { this.leftBay = true; return }
    if (!this.leftBay) return

    this.leftBay = false
    this.show()
  }

  /** Is the player's input being held for something? */
  isBusy() {
    return this.open || this.rolling > 0
  }
}
