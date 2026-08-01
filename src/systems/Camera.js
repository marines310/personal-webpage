import * as THREE from 'three'
import { Game } from '../core/Game.js'
import {
  RIG, DEFAULT_POSE, RECOVER_DELAY,
  clonePose, sanitisePose, isDefaultPose, wrapAngle,
  basePitchAt, placeCamera, applyInput, easePose,
  newReverseState, stepReverseView,
  occludedLength, easeOcclusion
} from './cameraPose.js'

const FORWARD = new THREE.Vector3(0, 0, 1)
const STORAGE_KEY = 'portfolio.camera.pose'

/**
 * Camera - third-person chase camera with free look.
 *
 * THE CHASE, WHICH HAS NOT CHANGED
 * --------------------------------
 * The camera orbits the car at a tracked ANGLE rather than chasing a point in
 * space. That distinction matters: if you smooth the camera's position toward
 * a spot behind the car, a sharp turn or a U-turn makes it cut straight across
 * the scene - it swings through or past the car and you lose the road.
 * Smoothing the orbit angle instead means the camera always arcs around the
 * car and settles behind it, however hard you turn. The angle is interpolated
 * along the shortest path, so a 180-degree turnaround never spins the long
 * way round.
 *
 * WHAT IS NEW
 * -----------
 * Drag the mouse or hold Q/E/R/F/Z/X and you move a POSE - three offsets on
 * top of that chase rig, described in cameraPose.js. Let go and the pose eases
 * back to your SAVED pose after a couple of seconds; press V and wherever you
 * are looking now BECOMES the saved pose, so it stops drifting away. Press C
 * and it snaps there immediately.
 *
 * All the arithmetic is in cameraPose.js, which has no THREE in it and can
 * therefore be run by a test. What is left here is easing, a raycast and
 * setting a position - and the one guarantee worth stating out loud: with an
 * untouched pose this class puts the camera exactly where the old one did.
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

    // The rig, and the smoothing that keeps it behind the car. Kept as
    // `params` because the tuning has always lived under that name.
    this.params = {
      ...RIG,
      // How quickly the camera swings around to sit behind the car.
      // Higher = snappier. This is the main "does it keep up" dial.
      // At 5.5/4.0 a full U-turn settles in ~0.8s and the camera trails
      // about 15 degrees behind during a hard sustained turn.
      yawSmoothing: 5.5,
      // Extra catch-up when it's a long way out of position, so big
      // turnarounds resolve quickly without making gentle turns twitchy.
      yawCatchUp: 4.0,
      positionSmoothing: 9,
      lookAtSmoothing: 11
    }

    // --- Pose: default, saved, live ---
    this.savedPose = this.loadPose()
    this.pose = clonePose(this.savedPose)
    this.sinceInput = RECOVER_DELAY   // start already settled

    // --- State ---
    this.yaw = 0                  // current orbit angle, car-relative part
    this.currentPosition = new THREE.Vector3(0, 5, -10)
    this.currentLookAt = new THREE.Vector3()
    this.initialised = false
    this.reverse = newReverseState()
    this.occlusion = Infinity     // eased boom length once scenery is in the way

    // Scratch
    this._forward = new THREE.Vector3()
    this._targetPosition = new THREE.Vector3()
    this._targetLookAt = new THREE.Vector3()
    this._rayFrom = new THREE.Vector3()
    this._rayDir = new THREE.Vector3()

    this.instance.position.copy(this.currentPosition)
    this.instance.lookAt(0, 0, 0)

    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    this.instance.aspect = window.innerWidth / window.innerHeight
    this.instance.updateProjectionMatrix()
  }

  // -------------------------------------------------------------
  // The saved pose
  //
  // Kept in localStorage so a view Mike likes survives a reload. Wrapped in
  // try/catch throughout: private browsing throws on read AND on write rather
  // than returning null, and a camera that cannot be saved should still be a
  // camera you can drive with.
  // -------------------------------------------------------------
  loadPose() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY)
      if (!raw) return clonePose(DEFAULT_POSE)
      // Sanitised on the way in, not clamped: stored numbers are something a
      // person can edit, and a zoom of 900 should not survive - but the pitch
      // here is an OFFSET and may legitimately be negative, which is exactly
      // what clampPose would destroy. See the note on sanitisePose.
      return sanitisePose(JSON.parse(raw))
    } catch (err) {
      return clonePose(DEFAULT_POSE)
    }
  }

  /** Make wherever you are looking now the pose the camera returns to. */
  savePose() {
    this.savedPose = clonePose(this.pose)
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.savedPose))
    } catch (err) {
      // Nothing to do and nothing worth saying. The view still holds for
      // this session; it just won't survive a reload.
    }
    return this.savedPose
  }

  /** Throw the saved view away and go back to the camera the game ships with. */
  resetPose() {
    this.savedPose = clonePose(DEFAULT_POSE)
    this.pose = clonePose(DEFAULT_POSE)
    this.sinceInput = RECOVER_DELAY
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch (err) { /* see savePose */ }
    return this.savedPose
  }

  /** Is the live view the one that would be saved? The HUD says so when not. */
  isPoseSaved(tolerance = 0.01) {
    return Math.abs(wrapAngle(this.pose.yaw - this.savedPose.yaw)) < tolerance &&
           Math.abs(this.pose.pitch - this.savedPose.pitch) < tolerance &&
           Math.abs(this.pose.zoom - this.savedPose.zoom) < tolerance
  }

  /** Is the saved view still the shipped one? */
  isDefault() {
    return isDefaultPose(this.savedPose)
  }

  // -------------------------------------------------------------
  // Geometry
  // -------------------------------------------------------------

  /** The car's heading, read from its quaternion so it's always unambiguous. */
  getVehicleYaw(vehicle) {
    this._forward.copy(FORWARD).applyQuaternion(vehicle.mesh.quaternion)
    return Math.atan2(this._forward.x, this._forward.z)
  }

  /** Wrap an angle into -PI..PI so we always turn the short way. */
  static wrapAngle(a) {
    return wrapAngle(a)
  }

  /**
   * How far back and how high the camera should sit at this speed.
   * Kept for anything that was reading it; the rig itself is in cameraPose.
   */
  getOffsets(vehicle) {
    const speed = vehicle.getSpeed ? vehicle.getSpeed() : 0
    const boom = placeCamera({ x: 0, y: 0, z: 0 }, 0, speed, this.pose, this.params).boom
    return { distance: boom.horizontal, height: boom.vertical }
  }

  /**
   * Where the camera wants to be, given an orbit angle.
   * Behind the car means the OPPOSITE of its forward direction.
   */
  computePosition(vehicle, yaw, out) {
    const speed = vehicle.getSpeed ? vehicle.getSpeed() : 0
    const { position } = placeCamera(vehicle.mesh.position, yaw, speed, this.pose, this.params)
    return out.set(position.x, position.y, position.z)
  }

  computeLookAt(vehicle, yaw, out) {
    const speed = vehicle.getSpeed ? vehicle.getSpeed() : 0
    const { lookAt } = placeCamera(vehicle.mesh.position, yaw, speed, this.pose, this.params)
    return out.set(lookAt.x, lookAt.y, lookAt.z)
  }

  /**
   * Jump the camera straight to the saved view with no easing.
   * Bound to the C key, and used on the very first frame.
   */
  snapBehind() {
    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.mesh) return

    this.pose = clonePose(this.savedPose)
    this.sinceInput = RECOVER_DELAY
    this.occlusion = Infinity
    this.reverse = newReverseState()

    this.yaw = wrapAngle(this.getVehicleYaw(vehicle) + this.pose.yaw)
    this.computePosition(vehicle, this.yaw, this.currentPosition)
    this.computeLookAt(vehicle, this.yaw, this.currentLookAt)

    this.instance.position.copy(this.currentPosition)
    this.instance.lookAt(this.currentLookAt)
    this.initialised = true
  }

  /**
   * How far along the boom something solid is, or null for a clear view.
   *
   * Asked of the PHYSICS world rather than of the scene graph, and that is the
   * point: the colliders are exactly the things the car cannot drive through,
   * so the camera and the car agree on what is solid. Raycasting the meshes
   * instead would have the camera stopped by a cloud, a light pool or the
   * glass in a window, and let it slide through a collider that has no mesh.
   *
   * It is also one ray a frame against a broad phase that is already built,
   * where intersecting the scene graph would walk thousands of meshes.
   */
  castToCamera(from, to) {
    const physics = this.game.physics
    if (!physics || !physics.world || !physics.rapier) return null

    this._rayDir.copy(to).sub(from)
    const length = this._rayDir.length()
    if (length < 1e-4) return null
    this._rayDir.multiplyScalar(1 / length)

    try {
      const ray = new physics.rapier.Ray(
        { x: from.x, y: from.y, z: from.z },
        { x: this._rayDir.x, y: this._rayDir.y, z: this._rayDir.z }
      )
      // The car's own body has to be excluded or the answer is always
      // "something solid, no distance away" - itself. Excluded by BODY rather
      // than by collider because the body is what Vehicle keeps a handle on,
      // and it rebuilds the collider whenever you change vehicle - a stored
      // collider would be the previous car's within a frame of using the
      // garage.
      const own = this.game.vehicle && this.game.vehicle.body
      const hit = physics.world.castRay(
        ray, length, true, undefined, undefined, undefined, own)
      return hit ? hit.timeOfImpact : null
    } catch (err) {
      // A physics world that refuses a ray is not a reason to stop drawing.
      return null
    }
  }

  update(delta) {
    const vehicle = this.game.vehicle
    if (!vehicle || !vehicle.mesh) return

    const inputs = this.game.inputs

    // Save before reset, so pressing both in one frame does the sensible
    // thing rather than saving whatever the reset just produced.
    if (inputs && inputs.consumeCameraSave && inputs.consumeCameraSave()) {
      this.savePose()
    }

    // First frame, and any time the player asks for it
    if (!this.initialised || (inputs && inputs.consumeCameraReset())) {
      this.snapBehind()
      return
    }

    const p = this.params
    const speed = vehicle.getSpeed ? vehicle.getSpeed() : 0

    // --- What the player asked for ---
    //
    // Clamped against the rig's OWN pitch at this speed, so "as low as the
    // camera goes" means the same angle whatever the car is doing.
    const base = basePitchAt(speed, p)
    const wanted = inputs && inputs.getCameraInput
      ? inputs.getCameraInput(delta)
      : null

    if (wanted && wanted.active) {
      this.pose = applyInput(this.pose, wanted, base)
      this.sinceInput = 0
    } else {
      this.sinceInput += delta
      // Back to the saved view once you've left it alone. If nothing was ever
      // saved, the saved view IS the default, so this is also how the camera
      // recovers for someone who never touches any of it.
      if (this.sinceInput > RECOVER_DELAY) {
        this.pose = easePose(this.pose, this.savedPose, delta)
      }
    }

    // --- Which way the chase is facing ---
    //
    // Reversing points the car away from where it's going, so a sustained
    // reverse turns the camera round to look over the boot. The hysteresis
    // lives in cameraPose.js; what arrives here is a yes or a no.
    const signed = vehicle.getSignedSpeed ? vehicle.getSignedSpeed() : 0
    const lookingBack = stepReverseView(this.reverse, signed < 0, speed, delta)

    const facing = this.getVehicleYaw(vehicle) + (lookingBack ? Math.PI : 0)
    const targetYaw = wrapAngle(facing + this.pose.yaw)

    // --- Orbit angle, along the shortest path ---
    const diff = wrapAngle(targetYaw - this.yaw)

    // Rate rises with how far out of position we are, so a U-turn snaps
    // back promptly while small corrections stay smooth.
    const urgency = p.yawSmoothing + p.yawCatchUp * (Math.abs(diff) / Math.PI)
    const k = 1 - Math.exp(-urgency * delta)

    this.yaw = wrapAngle(this.yaw + diff * k)

    // --- Position and aim ---
    const placed = placeCamera(vehicle.mesh.position, this.yaw, speed, this.pose, p)
    this._targetPosition.set(placed.position.x, placed.position.y, placed.position.z)
    this._targetLookAt.set(placed.lookAt.x, placed.lookAt.y, placed.lookAt.z)

    // --- Anything in the way? ---
    //
    // Cast from just above the car, not from its centre: a ray starting inside
    // the car's own bounding volume is the sort of thing that reports a hit at
    // zero and pins the camera to the bonnet.
    this._rayFrom.copy(vehicle.mesh.position)
    this._rayFrom.y += p.lookHeight

    const wantedLength = this._rayFrom.distanceTo(this._targetPosition)
    const hit = this.castToCamera(this._rayFrom, this._targetPosition)
    const allowed = occludedLength(wantedLength, hit)

    // Kept so the occlusion can be measured rather than inferred. `occlusion`
    // on its own says nothing - it has to be read against the length that was
    // asked for, and that length is measured from the RAY's origin (a little
    // above the car) rather than from the car itself. Comparing it to the
    // rig's own boom instead reported the camera as permanently blocked by
    // 0.7 units, which was the height difference and nothing else.
    this.boomWanted = wantedLength
    this.boomHit = hit

    this.occlusion = easeOcclusion(
      Math.min(this.occlusion, wantedLength), allowed, delta)

    if (this.occlusion < wantedLength - 1e-4) {
      // Slide back along the same ray rather than picking a new direction.
      // Moving sideways out from behind a building looks like the camera has
      // a mind of its own; coming closer looks like ducking.
      this._targetPosition.sub(this._rayFrom)
        .multiplyScalar(this.occlusion / wantedLength)
        .add(this._rayFrom)
    }

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
