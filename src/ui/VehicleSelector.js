import { Game } from '../core/Game.js'
import {
  getPlayerGarage,
  TRAFFIC_LENGTHS
} from '../world/islandLayout.js'

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

const LABELS = {
  sedan: 'Sedan',
  convertible: 'Convertible',
  pickup: 'Pickup',
  suv: 'SUV',
  police: 'Police Car',
  ambulance: 'Ambulance',
  fire: 'Fire Engine',
  bus: 'City Bus'
}

/** How long the roll-out takes, and how far it goes. */
const ROLL_OUT_SECONDS = 1.6

export class VehicleSelector {
  constructor() {
    this.game = Game.getInstance()
    this.index = 0
    this.open = false
    this.rolling = 0
    this.el = null
    this.onKey = this.onKey.bind(this)
  }

  label(kind) {
    return LABELS[kind] || kind
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

  /** Sit the vehicle in the garage bay, facing the door. */
  park() {
    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.body) return

    const bay = this.garage.bay
    vehicle.body.setTranslation({ x: bay.x, y: 2.2, z: bay.z }, true)
    vehicle.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    vehicle.heading = bay.heading
    vehicle.speed = 0
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

    vehicle.body.setTranslation({
      x: from.x + (to.x - from.x) * ease,
      y: 2.2,
      z: from.z + (to.z - from.z) * ease
    }, true)
    vehicle.heading = from.heading
    vehicle.speed = 0
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

    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.body) return
    if (Math.abs(vehicle.speed || 0) > 2.5) { this.leftBay = true; return }

    const at = vehicle.body.translation()
    const dx = at.x - this.garage.x
    const dz = at.z - this.garage.z

    // Into the garage's own frame: along the way in, and across the doorway.
    const fx = Math.sin(this.garage.heading)
    const fz = Math.cos(this.garage.heading)
    const along = dx * fx + dz * fz
    const across = dx * fz - dz * fx

    const inside = Math.abs(along) < this.garage.depth / 2 &&
                   Math.abs(across) < this.garage.width / 2

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
