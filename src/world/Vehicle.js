import * as THREE from 'three'
import { Game } from '../core/Game.js'
import { FALL_LIMIT, SPAWN_POINT } from './islandLayout.js'

/**
 * How big the car is, and everything that follows from it.
 *
 * The car used to be two units long, which was fine when nothing else in the
 * world was a car. Next to the AI traffic - a sedan is 4.4 long, a bus 11 -
 * it read as a toy: the same length as a bus's front door.
 *
 * So the whole thing is scaled by CAR_SCALE. That includes the wheelbase, and
 * therefore the turning circle: a longer car really does turn wider, and
 * scaling the body without the wheelbase would have left it pivoting round a
 * point inside itself. maxSteerAngle was opened up to keep the arc usable.
 */
// Exactly a sedan - TRAFFIC_LENGTHS.sedan and TRAFFIC_WIDTHS.sedan in
// islandLayout.js. The car you drive is one of the cars on the road, so the
// only defensible size for it is the size of one of them.
export const CAR_SCALE = 2.2
export const CAR_LENGTH = 2 * CAR_SCALE       // 4.4, a sedan
export const CAR_WIDTH = 1.9
export const CAR_HEIGHT = 0.4 * CAR_SCALE

const WHEEL_RADIUS = 0.25 * CAR_SCALE

// Spawn position comes from the map file, so moving the starting island
// in islandLayout.js moves the car with it.
const SPAWN = SPAWN_POINT

/**
 * Vehicle - Arcade car using the kinematic "bicycle model".
 *
 * The car is driven by a single signed speed value (+ forward, - reverse)
 * along its own heading, and turned using the standard steering geometry
 * relationship:
 *
 *     turn radius R    = wheelbase / tan(steerAngle)
 *     yaw rate    psi' = speed / R  =  speed * tan(steerAngle) / wheelbase
 *
 * Because `speed` is signed, reversing automatically flips the direction
 * the car pivots - which is exactly how a real car behaves. Turning the
 * wheel left while reversing swings the nose right and walks the tail
 * left, with no special-case code.
 *
 * Yaw scales with speed, so the car barely turns when stationary and
 * naturally traces wider arcs the faster it goes.
 */
export class Vehicle {
  constructor() {
    this.game = Game.getInstance()

    // -----------------------------------------------------------------
    // HANDLING TUNING
    // Everything that affects how the car feels lives here. Adjust these
    // freely - none of the logic below hard-codes any of these numbers.
    // -----------------------------------------------------------------
    this.params = {
      // --- Speed & acceleration (world units, and units/sec) ---
      // Raised when the map was spread out. A 130-unit bridge at the old
      // 13 units/sec was ten seconds of holding W in a straight line; at
      // 18 it's seven, which reads as a journey instead of a wait.
      maxForwardSpeed: 18,     // top speed going forward
      maxReverseSpeed: 6.5,    // top speed in reverse (deliberately lower)
      forwardAccel: 15,        // how hard it pulls away forward
      reverseAccel: 7.5,       // gentler than forward
      boostMultiplier: 1.6,    // Shift: multiplies top speed & acceleration

      // --- Slowing down ---
      // Braking scaled with the speed, or stopping distance would have
      // grown by the square of it - 3.3 units before, 6.2 if left alone.
      handbrakeStrength: 34,   // Spacebar - strong, works both directions
      engineBrakeStrength: 21, // pressing the opposite direction to travel
      rollingResistance: 5,    // coasting with no key held
      stopThreshold: 0.3,      // below this speed the car counts as stopped
      restThreshold: 0.05,     // below this we snap to 0 to stop jitter

      // --- Steering ---
      // At full lock and low speed the car turns in ~2.5 units; at top
      // speed the arc opens out to ~14 units. Raising the reduction makes
      // fast cornering lazier, lowering it makes the car twitchy.
      // Opened from 0.55 when the car grew: turn radius is wheelbase over
      // tan(lock), so scaling the wheelbase by 2.2 without touching the lock
      // would have made every corner 2.2 times wider.
      maxSteerAngle: 0.7,            // radians at full lock (~40 degrees)
      steerRate: 3.2,                // how fast the wheels turn to full lock
      steerReturnRate: 5.0,          // how fast they recentre when released
      highSpeedSteerReduction: 0.82, // fraction of lock removed at top speed
      wheelbase: 1.4 * CAR_SCALE,     // front axle to rear axle - sets arc size

      // --- Grip ---
      lateralGrip: 0.92,   // 1 = on rails, 0 = ice. Controls sideways slide.
      corneringDrag: 0.5   // how much speed is scrubbed off in hard turns
    }

    // --- State ---
    this.currentSpeed = 0     // signed: + forward, - reverse
    this.currentSteering = 0  // signed radians: + left, - right
    this.isGrounded = true

    // Scratch vectors, reused each frame to avoid garbage
    this._forwardDir = new THREE.Vector3()
    this._planarVel = new THREE.Vector3()
    this._lateral = new THREE.Vector3()
    this._quat = new THREE.Quaternion()
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ')

    // Create visual mesh
    this.mesh = this.createMesh()
    this.game.add(this.mesh)

    // Create physics body at the same spawn point as the mesh
    this.body = this.game.physics.createVehicleChassis(
      { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
      { width: CAR_WIDTH, height: CAR_HEIGHT, length: CAR_LENGTH }
    )

    // Wheel visuals (simple cylinders)
    this.wheels = this.createWheels()
  }

  createMesh() {
    const group = new THREE.Group()

    // If a car.glb has been added to public/models/, use it instead of
    // the built-in shape. The loader has already scaled and oriented it.
    const assets = this.game.assets
    if (assets && assets.has('car')) {
      const model = assets.clone('car')
      group.add(model)
      this.model = model
      this.modelWheels = this.findModelWheels(model)

      // Headlights still get added so the car lights the road ahead
      this.addHeadlights(group)

      group.position.set(SPAWN.x, SPAWN.y, SPAWN.z)
      return group
    }

    // --- Procedural fallback: neon-trimmed hovercar ---

    // Main body - bright convertible, suits the setting
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_WIDTH, 0.4 * CAR_SCALE, CAR_LENGTH),
      new THREE.MeshStandardMaterial({
        color: 0xf25f4c,
        metalness: 0.35,
        roughness: 0.35,
        flatShading: true
      })
    )
    body.castShadow = true
    body.receiveShadow = true
    group.add(body)

    // Cabin / windscreen
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(CAR_WIDTH * 0.78, 0.35 * CAR_SCALE, 0.9 * CAR_SCALE),
      new THREE.MeshStandardMaterial({
        color: 0x203642,
        metalness: 0.6,
        roughness: 0.15,
        flatShading: true
      })
    )
    cabin.position.set(0, 0.35 * CAR_SCALE, -0.2 * CAR_SCALE)
    cabin.castShadow = true
    group.add(cabin)

    // Chrome side trim
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xe8e4dc, metalness: 0.85, roughness: 0.25, flatShading: true
    })
    for (const side of [-1, 1]) {
      // Just inside the body, not just outside it
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.07 * CAR_SCALE, 1.7 * CAR_SCALE), trimMat)
      strip.position.set((CAR_WIDTH / 2 - 0.04) * side, -0.05 * CAR_SCALE, 0)
      group.add(strip)
    }

    this.addHeadlights(group)

    group.position.set(SPAWN.x, SPAWN.y, SPAWN.z)
    return group
  }

  /** Headlight blocks plus a real spotlight pointing down the road. */
  addHeadlights(group) {
    // Emissive rather than basic, so the lamps visibly switch on at dusk
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xb9c6cc,
      emissive: new THREE.Color(0xfff2cc),
      emissiveIntensity: 0
    })
    this.headlightMaterial = lampMat

    for (const side of [-1, 1]) {
      // Positioned as a fraction of the BODY WIDTH, not of CAR_SCALE.
      //
      // CAR_SCALE is a length scale. When the car was narrowed to fix its
      // proportions the body came in and the lamps didn't, so they hung over
      // the sides by 0.155 units - clearly visible from behind. Fractions of
      // the width can't come apart from it: 0.3w out plus half of 0.22w is
      // 0.41w, comfortably inside the 0.5w edge.
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(CAR_WIDTH * 0.22, 0.1 * CAR_SCALE, 0.06), lampMat)
      lamp.position.set(CAR_WIDTH * 0.3 * side, 0.02, CAR_LENGTH / 2 + 0.02)
      group.add(lamp)
    }

    // Rear lamps
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x6b2230,
      emissive: new THREE.Color(0xff2a2a),
      emissiveIntensity: 0
    })
    this.taillightMaterial = tailMat

    for (const side of [-1, 1]) {
      const tail = new THREE.Mesh(
        new THREE.BoxGeometry(CAR_WIDTH * 0.2, 0.09 * CAR_SCALE, 0.06), tailMat)
      tail.position.set(CAR_WIDTH * 0.3 * side, 0.05, -CAR_LENGTH / 2 - 0.02)
      group.add(tail)
    }

    // One spotlight is plenty - two doubles the cost for no visible gain
    const beam = new THREE.SpotLight(0xfff0d0, 0, 38, Math.PI / 6.5, 0.45, 1.3)
    beam.position.set(0, 0.35 * CAR_SCALE, CAR_LENGTH / 2)
    beam.target.position.set(0, -0.5, 10)
    group.add(beam)
    group.add(beam.target)
    this.headlightBeam = beam
  }

  /**
   * Headlights come on as it gets dark, and brighten in heavy weather.
   * Brake lights respond to the spacebar.
   */
  updateLights() {
    const env = this.game.environment
    if (!env) return

    // Dark enough to want lights: night, or heavy cloud/rain
    const gloom = Math.max(
      env.nightFactor,
      env.current ? env.current.cloud * 0.55 + env.current.rain * 0.35 : 0
    )
    const on = THREE.MathUtils.clamp((gloom - 0.25) / 0.35, 0, 1)

    if (this.headlightMaterial) this.headlightMaterial.emissiveIntensity = on * 1.8
    if (this.headlightBeam) this.headlightBeam.intensity = on * 34

    if (this.taillightMaterial) {
      const braking = this.game.inputs
        ? this.game.inputs.getInput().brake
        : false
      this.taillightMaterial.emissiveIntensity = braking ? 3.2 : on * 1.1
    }
  }

  /**
   * Downloaded car models usually name their wheels something containing
   * "wheel". If we find four, we drive them; otherwise we fall back to
   * building our own so steering and spin always work.
   */
  findModelWheels(model) {
    const found = []
    model.traverse((child) => {
      if (child.name && /wheel|tyre|tire/i.test(child.name)) {
        found.push(child)
      }
    })

    if (found.length < 4) return null

    // Sort into front-left, front-right, rear-left, rear-right by
    // local position so the steering code addresses the right pair.
    found.sort((a, b) => b.position.z - a.position.z)
    const front = found.slice(0, 2).sort((a, b) => a.position.x - b.position.x)
    const rear = found.slice(2, 4).sort((a, b) => a.position.x - b.position.x)

    return [...front, ...rear].map((wheel) => ({
      pivot: wheel,
      wheel,
      baseRotationY: wheel.rotation.y
    }))
  }

  createWheels() {
    // A loaded model may already have its own wheels - use those
    if (this.modelWheels) return this.modelWheels

    const wheels = []
    const wheelGeometry = new THREE.CylinderGeometry(
      WHEEL_RADIUS, WHEEL_RADIUS, tyre, 12
    )
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x0d0d16,
      metalness: 0.5,
      roughness: 0.7,
      flatShading: true
    })

    // Front wheels first (indices 0,1) so they can be steered below.
    // z = +/- half the wheelbase, which is the figure the steering maths uses -
    // taken from the same constant rather than written out again, so the
    // visible wheels can't disagree with the arc the car actually turns.
    const axle = (1.4 * CAR_SCALE) / 2
    // Outer face flush with the body. It used to sit 0.05 OUTSIDE the body
    // and then add half a tyre on top of that, so each wheel stood a quarter
    // of a unit proud - which reads as a monster truck rather than a car.
    const tyre = 0.2 * CAR_SCALE
    const track = CAR_WIDTH / 2 - tyre / 2
    const drop = -0.2 * CAR_SCALE
    const positions = [
      { x: -track, y: drop, z: axle },   // Front left
      { x: track, y: drop, z: axle },    // Front right
      { x: -track, y: drop, z: -axle },  // Back left
      { x: track, y: drop, z: -axle }    // Back right
    ]

    for (const pos of positions) {
      // Each wheel gets a pivot so steering (pivot yaw) and roll
      // (wheel spin) don't fight each other inside one Euler.
      const pivot = new THREE.Group()
      pivot.position.set(pos.x, pos.y, pos.z)

      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial)
      wheel.rotation.z = Math.PI / 2 // lay the cylinder on its side
      wheel.castShadow = true

      pivot.add(wheel)
      this.mesh.add(pivot)

      wheels.push({ pivot, wheel, baseRotationY: 0 })
    }

    return wheels
  }

  /** Put the car back on the hub after driving off into the void. */
  respawn() {
    if (!this.body) return
    this.body.setTranslation({ x: SPAWN.x, y: SPAWN.y, z: SPAWN.z }, true)
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.currentSpeed = 0
    this.currentSteering = 0
  }

  /** Move `value` toward `target` by at most `maxDelta`. */
  approach(value, target, maxDelta) {
    if (value < target) return Math.min(target, value + maxDelta)
    if (value > target) return Math.max(target, value - maxDelta)
    return target
  }

  prePhysicsUpdate(delta) {
    if (!this.body || delta <= 0) return

    const p = this.params
    const { forward, steering, boost, brake } = this.game.inputs.getInput()

    // Only the throttle needs solid ground; steering geometry still applies
    // while airborne so the car doesn't freeze mid-jump.
    this.isGrounded = this.game.physics.isGrounded(this.body)

    const maxForward = boost ? p.maxForwardSpeed * p.boostMultiplier : p.maxForwardSpeed
    const accelForward = boost ? p.forwardAccel * p.boostMultiplier : p.forwardAccel
    const throttle = this.isGrounded ? forward : 0

    // ---------------------------------------------------------------
    // 1. Longitudinal speed
    //
    // Pressing the opposite direction brakes first and only begins
    // accelerating the other way once the car is under stopThreshold.
    // That prevents instant forward/reverse flipping.
    // ---------------------------------------------------------------
    const speed = this.currentSpeed

    if (brake) {
      // Spacebar always wins over the throttle
      this.currentSpeed = this.approach(speed, 0, p.handbrakeStrength * delta)
    } else if (throttle > 0) {
      if (speed < -p.stopThreshold) {
        // Still rolling backwards - treat W as a brake
        this.currentSpeed = this.approach(speed, 0, p.engineBrakeStrength * delta)
      } else {
        this.currentSpeed = Math.min(maxForward, speed + accelForward * throttle * delta)
      }
    } else if (throttle < 0) {
      if (speed > p.stopThreshold) {
        // Still rolling forwards - treat S as a brake
        this.currentSpeed = this.approach(speed, 0, p.engineBrakeStrength * delta)
      } else {
        this.currentSpeed = Math.max(
          -p.maxReverseSpeed,
          speed + p.reverseAccel * throttle * delta
        )
      }
    } else {
      // Coasting - roll to a stop gradually, never instantly
      this.currentSpeed = this.approach(speed, 0, p.rollingResistance * delta)
    }

    // ---------------------------------------------------------------
    // 2. Steering angle - eased toward target, reduced at speed
    // ---------------------------------------------------------------
    const speedRatio = Math.min(Math.abs(this.currentSpeed) / p.maxForwardSpeed, 1)
    const steerLimit = p.maxSteerAngle * (1 - p.highSpeedSteerReduction * speedRatio)
    const targetSteer = steering * steerLimit
    const steerRate = (steering === 0 ? p.steerReturnRate : p.steerRate) * delta
    this.currentSteering = this.approach(this.currentSteering, targetSteer, steerRate)

    // ---------------------------------------------------------------
    // 3. Yaw from steering geometry (the bicycle model)
    //
    //   yawRate = speed * tan(steerAngle) / wheelbase
    //
    // Signed speed means reverse arcs fall out for free, and yaw goes to
    // zero as the car stops - no spinning on the spot.
    // ---------------------------------------------------------------
    const yawRate =
      (this.currentSpeed * Math.tan(this.currentSteering)) / p.wheelbase

    this.body.setAngvel({ x: 0, y: yawRate, z: 0 }, true)

    // Hard cornering scrubs off a little speed, like real tyres
    if (p.corneringDrag > 0) {
      this.currentSpeed = this.approach(
        this.currentSpeed,
        0,
        p.corneringDrag * Math.abs(yawRate) * delta
      )
    }

    // Kill sub-threshold creep so the car sits perfectly still
    if (Math.abs(this.currentSpeed) < p.restThreshold && throttle === 0) {
      this.currentSpeed = 0
    }

    // ---------------------------------------------------------------
    // 4. Drive along the car's own heading
    // ---------------------------------------------------------------
    const r = this.body.rotation()
    this._quat.set(r.x, r.y, r.z, r.w)
    this._euler.setFromQuaternion(this._quat)
    const heading = this._euler.y

    // Local +Z is the front of the car
    this._forwardDir.set(Math.sin(heading), 0, Math.cos(heading))

    const vel = this.body.linvel()

    if (!this.isGrounded) {
      // Airborne: let gravity and momentum do their thing, but keep our
      // bookkeeping in sync so landing doesn't produce a jolt.
      this._planarVel.set(vel.x, 0, vel.z)
      this.currentSpeed = this._planarVel.dot(this._forwardDir)
      return
    }

    // Split current velocity into "along the car" and "sideways", then
    // keep only a little of the sideways part. High grip = tracks the arc
    // tightly; lower grip = a touch of slide on hard corners.
    this._planarVel.set(vel.x, 0, vel.z)
    const alongAmount = this._planarVel.dot(this._forwardDir)
    this._lateral
      .copy(this._planarVel)
      .addScaledVector(this._forwardDir, -alongAmount)

    // Frame-rate independent decay of the sideways component
    const lateralKept = Math.pow(1 - p.lateralGrip, delta)

    this.body.setLinvel(
      {
        x: this._forwardDir.x * this.currentSpeed + this._lateral.x * lateralKept,
        y: vel.y, // never touch gravity
        z: this._forwardDir.z * this.currentSpeed + this._lateral.z * lateralKept
      },
      true
    )
  }

  postPhysicsUpdate(delta) {
    if (!this.body) return

    // Sync mesh with physics body
    const position = this.body.translation()
    const rotation = this.body.rotation()

    this.mesh.position.set(position.x, position.y, position.z)
    this.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)

    // --- Wheel visuals ---
    // Spin rate follows real rolling: omega = v / r. Sign follows travel
    // direction, so wheels visibly reverse when the car reverses.
    const spin = (this.currentSpeed / WHEEL_RADIUS) * delta

    for (let i = 0; i < this.wheels.length; i++) {
      const { pivot, wheel, baseRotationY } = this.wheels[i]
      wheel.rotation.x += spin

      // Front wheels (0,1) steer with the current wheel angle
      if (i < 2) {
        pivot.rotation.y = (baseRotationY || 0) + this.currentSteering
      }
    }

    this.updateLights()

    // Drove off the edge of an island - put the car back on the hub
    if (position.y < FALL_LIMIT) {
      this.respawn()
    }
  }

  getPosition() {
    return this.mesh.position.clone()
  }

  getSpeed() {
    return Math.abs(this.currentSpeed)
  }
}
