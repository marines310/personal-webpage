import * as THREE from 'three'
import { Game } from '../core/Game.js'

const FORWARD = new THREE.Vector3(0, 0, 1)

/**
 * Camera - third-person chase camera.
 *
 * The camera orbits the car at a tracked ANGLE rather than chasing a point
 * in space. That distinction matters: if you smooth the camera's position
 * toward a spot behind the car, a sharp turn or a U-turn makes it cut
 * straight across the scene - it swings through or past the car and you
 * lose the road. Smoothing the orbit angle instead means the camera always
 * arcs around the car and settles behind it, however hard you turn.
 *
 * The angle is interpolated along the SHORTEST path, so a 180-degree
 * turnaround never spins the long way round.
 *
 * Press C at any time to snap straight back behind the car.
 */
export class Camera {
  constructor() {
    this.game = Game.getInstance()

    this.instance = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    )

    // -----------------------------------------------------------------
    // TUNING
    // -----------------------------------------------------------------
    this.params = {
      // Where the camera sits relative to the car, in car-local space.
      // The car's nose is +Z, so a NEGATIVE z puts the camera behind it.
      // Pulled back when the car grew from 2 units long to 4.4: at the old
      // 9.5 the bonnet filled the bottom third of the screen.
      restHeight: 6.2,      // height when stopped
      restDistance: 12.5,   // distance behind when stopped
      // 7.8, not higher: the monorail beam's underside is at 9.5, and the
      // camera has to pass beneath it without clipping through.
      fastHeight: 7.8,      // height at top speed
      fastDistance: 17,     // distance behind at top speed
      speedForFullPullback: 18, // car speed at which the far values apply

      // How quickly the camera swings around to sit behind the car.
      // Higher = snappier. This is the main "does it keep up" dial.
      // At 5.5/4.0 a full U-turn settles in ~0.8s and the camera trails
      // about 15 degrees behind during a hard sustained turn.
      yawSmoothing: 5.5,
      // Extra catch-up when it's a long way out of position, so big
      // turnarounds resolve quickly without making gentle turns twitchy.
      yawCatchUp: 4.0,

      positionSmoothing: 9,
      lookAtSmoothing: 11,

      lookAhead: 6,         // how far in front of the car to aim
      lookHeight: 1.9
    }

    // --- State ---
    this.yaw = 0                  // current orbit angle
    this.currentPosition = new THREE.Vector3(0, 5, -10)
    this.currentLookAt = new THREE.Vector3()
    this.initialised = false

    // Scratch
    this._forward = new THREE.Vector3()
    this._targetPosition = new THREE.Vector3()
    this._targetLookAt = new THREE.Vector3()

    this.instance.position.copy(this.currentPosition)
    this.instance.lookAt(0, 0, 0)

    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight
    this.instance.updateProjectionMatrix()
  }

  /** The car's heading, read from its quaternion so it's always unambiguous. */
  getVehicleYaw(vehicle) {
    this._forward.copy(FORWARD).applyQuaternion(vehicle.mesh.quaternion)
    return Math.atan2(this._forward.x, this._forward.z)
  }

  /** Wrap an angle into -PI..PI so we always turn the short way. */
  static wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a))
  }

  /** How far back and how high the camera should sit at this speed. */
  getOffsets(vehicle) {
    const p = this.params
    const speed = vehicle.getSpeed ? vehicle.getSpeed() : 0
    const t = Math.min(speed / p.speedForFullPullback, 1)
    return {
      distance: p.restDistance + (p.fastDistance - p.restDistance) * t,
      height: p.restHeight + (p.fastHeight - p.restHeight) * t
    }
  }

  /**
   * Where the camera wants to be, given an orbit angle.
   * Behind the car means the OPPOSITE of its forward direction.
   */
  computePosition(vehicle, yaw, out) {
    const { distance, height } = this.getOffsets(vehicle)
    const pos = vehicle.mesh.position
    return out.set(
      pos.x - Math.sin(yaw) * distance,
      pos.y + height,
      pos.z - Math.cos(yaw) * distance
    )
  }

  computeLookAt(vehicle, yaw, out) {
    const p = this.params
    const pos = vehicle.mesh.position
    return out.set(
      pos.x + Math.sin(yaw) * p.lookAhead,
      pos.y + p.lookHeight,
      pos.z + Math.cos(yaw) * p.lookAhead
    )
  }

  /**
   * Jump the camera straight behind the car with no easing.
   * Bound to the C key, and used on the very first frame.
   */
  snapBehind() {
    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.mesh) return

    this.yaw = this.getVehicleYaw(vehicle)
    this.computePosition(vehicle, this.yaw, this.currentPosition)
    this.computeLookAt(vehicle, this.yaw, this.currentLookAt)

    this.instance.position.copy(this.currentPosition)
    this.instance.lookAt(this.currentLookAt)
    this.initialised = true
  }

  update(delta) {
    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.mesh) return

    // First frame, and any time the player asks for it
    const inputs = this.game.inputs
    if (!this.initialised || (inputs && inputs.consumeCameraReset())) {
      this.snapBehind()
      return
    }

    const p = this.params
    const targetYaw = this.getVehicleYaw(vehicle)

    // --- Orbit angle, along the shortest path ---
    const diff = Camera.wrapAngle(targetYaw - this.yaw)

    // Rate rises with how far out of position we are, so a U-turn snaps
    // back promptly while small corrections stay smooth.
    const urgency = p.yawSmoothing + p.yawCatchUp * (Math.abs(diff) / Math.PI)
    const k = 1 - Math.exp(-urgency * delta)

    this.yaw = Camera.wrapAngle(this.yaw + diff * k)

    // --- Position and aim ---
    this.computePosition(vehicle, this.yaw, this._targetPosition)
    this.computeLookAt(vehicle, this.yaw, this._targetLookAt)

    // Light positional easing on top, purely to soften bumps. The heavy
    // lifting is done by the angle above, so this can't cut corners.
    const posLerp = 1 - Math.exp(-p.positionSmoothing * delta)
    const lookLerp = 1 - Math.exp(-p.lookAtSmoothing * delta)

    this.currentPosition.lerp(this._targetPosition, posLerp)
    this.currentLookAt.lerp(this._targetLookAt, lookLerp)

    this.instance.position.copy(this.currentPosition)
    this.instance.lookAt(this.currentLookAt)
  }
}
