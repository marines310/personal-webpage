import * as THREE from 'three'
import { Game } from '../core/Game.js'
import {
  FALL_LIMIT, spawnPoint, groundSlope, routeToPoint, pointAlong, SIREN_RATE,
  TRAFFIC_LENGTHS, TRAFFIC_WIDTHS
} from './islandLayout.js'
import {
  lampBrightness, blinkOn, gloomLevel,
  steerIndicator, resolveIndicator, stalkCancels, turnAmount
} from './vehicleLights.js'
// World imports Vehicle nowhere, so this is not a cycle - and taking the
// height from the same table the traffic uses is the point: the sedan you
// drive is the sedan on the road.
import { TRAFFIC_HEIGHTS } from './World.js'

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
/**
 * The footprint of each kind, taken from the traffic's own table.
 *
 * Not a second list. TRAFFIC_LENGTHS and TRAFFIC_WIDTHS are what the AI
 * vehicles are drawn and collided with, and the player's sedan was deliberately
 * settled at exactly those numbers (item 17) on the grounds that the car you
 * drive should be one of the cars on the road. Picking any other kind should
 * not change that.
 */
export function vehicleSize(kind) {
  return {
    length: TRAFFIC_LENGTHS[kind] ?? CAR_LENGTH,
    width: TRAFFIC_WIDTHS[kind] ?? CAR_WIDTH
  }
}

/**
 * How much of a vehicle's length sits between its axles.
 *
 * Taken from the car as it was tuned - a 3.08 wheelbase in a 4.4 body - so the
 * sedan is unchanged to the last decimal and everything else is that same
 * proportion of its own length. A bus comes out at 7.7 against 3.08, so it
 * turns in roughly two and a half times the space, which is what an eleven
 * unit vehicle should do.
 */
export const WHEELBASE_RATIO = (1.4 * 2.2) / (2 * 2.2)

export const CAR_SCALE = 2.2
export const CAR_LENGTH = 2 * CAR_SCALE       // 4.4, a sedan
export const CAR_WIDTH = 1.9
export const CAR_HEIGHT = 0.4 * CAR_SCALE

const WHEEL_RADIUS = 0.25 * CAR_SCALE

/**
 * Getting unstuck.
 *
 * A large vehicle caught on a kerb or a hill will sit with the throttle open
 * and go nowhere, and nothing the player can press recovers it. Three
 * seconds of asking to move and not moving is long enough that it is not a
 * red light, a queue or a bus pulling out, and short enough that you do not
 * have time to conclude the game is broken.
 */
const STUCK_SPEED = 0.4
const STUCK_SECONDS = 3

/** How far above the road a recovered car is dropped, so it lands rather
 *  than being placed inside the surface. */
const RECOVER_DROP = 1.6

// Spawn position comes from the map file, so moving the starting island
// in islandLayout.js moves the car with it.
// Worked out rather than fixed, because the ground under the starting point
// is no longer guaranteed to be at zero.
const SPAWN = spawnPoint()

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
  /**
   * @param {string} kind - which of the vehicles on the road this is. Every
   *   one of them handles identically for now, deliberately: only the body and
   *   the collider change. A fire engine turning like a sedan is a little odd
   *   and it is what was asked for, and it keeps this change to the geometry
   *   rather than the driving model.
   */
  constructor(kind = 'sedan') {
    this.game = Game.getInstance()
    this.kind = kind

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
      // Front axle to rear axle - what sets the size of the arc. Derived from
      // the body's LENGTH rather than written down, so it follows whatever is
      // being driven: turn radius is wheelbase / tan(lock), so a bus on a
      // sedan's wheelbase pivots about a point inside itself and swings its
      // back end through whatever it is passing. That is the same mistake item
      // 16 fixed when the car grew - scaling the body without the wheelbase.
      wheelbase: WHEELBASE_RATIO * CAR_LENGTH,

      // --- Grip ---
      lateralGrip: 0.92,   // 1 = on rails, 0 = ice. Controls sideways slide.
      corneringDrag: 0.5   // how much speed is scrubbed off in hard turns
    }

    // --- State ---
    this.currentSpeed = 0     // signed: + forward, - reverse
    this.currentSteering = 0  // signed radians: + left, - right
    this.isGrounded = true

    // Indicators: -1 left, 0 off, +1 right. `stalk` is the manual latch,
    // `indicator` is the answer after the steering has had its say.
    this.indicator = 0
    this.stalk = 0
    this.stalkTurned = 0
    this.indicateState = { side: 0, held: 0 }

    // Scratch vectors, reused each frame to avoid garbage
    this._forwardDir = new THREE.Vector3()
    this._planarVel = new THREE.Vector3()
    this._lateral = new THREE.Vector3()
    this._quat = new THREE.Quaternion()
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ')

    // The body, and the collider that matches it.
    //
    // These two have to agree - see item 17, where the drawn car came out 2.57
    // wide against a 1.9 collider and measured shorter than every AI vehicle
    // while looking bigger than all of them. So both come from the SAME pair of
    // numbers, and for anything but the default sedan those numbers are the
    // ones the traffic already uses for that kind.
    this.size = vehicleSize(kind)
    this.params.wheelbase = WHEELBASE_RATIO * this.size.length

    this.mesh = this.createMesh()
    this.game.add(this.mesh)

    this.body = this.game.physics.createVehicleChassis(
      { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
      { width: this.size.width, height: CAR_HEIGHT, length: this.size.length }
    )

    // Wheel visuals (simple cylinders)
    this.wheels = this.createWheels()
  }

  /**
   * Change what the player is driving, keeping where they are.
   *
   * The mesh AND the collider are rebuilt together, because they have to agree
   * - that is item 17, and swapping one without the other would recreate
   * exactly the bug it fixed. The old body is removed rather than abandoned:
   * Rapier fixes a collider's size when it is made, so a discarded one would
   * sit there as an invisible obstacle in the shape of whatever you were
   * driving before.
   *
   * Handling is untouched. Every kind drives identically for now, which is
   * what was asked for and keeps this to geometry.
   */
  setKind(kind) {
    if (kind === this.kind) return

    const at = this.body ? this.body.translation() : { x: 0, y: 2, z: 0 }
    const heading = this.heading || 0

    if (this.mesh) this.game.remove(this.mesh)
    if (this.body) this.game.physics.removeBody(this.body)

    this.kind = kind
    this.size = vehicleSize(kind)

    // The arc grows with the body. Everything else about the handling is
    // deliberately identical between kinds - only the thing that is a
    // consequence of SIZE changes with size.
    this.params.wheelbase = WHEELBASE_RATIO * this.size.length

    this.mesh = this.createMesh()
    this.game.add(this.mesh)

    this.body = this.game.physics.createVehicleChassis(
      { x: at.x, y: at.y, z: at.z },
      { width: this.size.width, height: CAR_HEIGHT, length: this.size.length }
    )

    // Put it back facing the way it was. `this.heading` was stored and
    // restored here before and did nothing, because nothing ever wrote it and
    // nothing ever read it back into the body - so changing vehicle in the
    // garage quietly swung the car round to face north, whichever way it had
    // been parked. The rotation is a quaternion about Y; the heading is the
    // same fact in one number.
    this.heading = heading
    this.body.setRotation(
      { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true)

    this.wheels = this.createWheels()
  }

  /**
   * Which way the vehicle is pointing, from the body itself.
   *
   * Read from the rotation rather than tracked alongside it, so it cannot
   * drift out of step with where the car actually is - the same reason the
   * camera reads it rather than being told.
   */
  getHeading() {
    if (!this.body) return 0
    const r = this.body.rotation()
    this._quat.set(r.x, r.y, r.z, r.w)
    this._forwardDir.set(0, 0, 1).applyQuaternion(this._quat)
    return Math.atan2(this._forwardDir.x, this._forwardDir.z)
  }

  createMesh() {
    // Anything but the default sedan is built by the SAME code that builds the
    // traffic, rather than a second copy of it here. The car you drive is one
    // of the cars on the road - that was already true of its size (item 17)
    // and now it is true of its shape, its lamps and its wheels.
    const world = this.game.world
    let group = null

    if (this.kind !== 'sedan' && world && world.buildTrafficVehicle) {
      const inner = world.buildTrafficVehicle({
        kind: this.kind,
        colour: null,
        rand: () => 0.5
      })
      if (inner) group = this.wrapTrafficMesh(inner)
    }

    if (!group) group = this.createDefaultMesh()

    // Every vehicle the player drives gets a beam, whichever builder made it.
    // Before, only the built-in sedan had one, so choosing anything else out
    // of the garage meant driving at night with nothing lighting the road.
    this.addBeam(group)
    return group
  }

  /**
   * The one spotlight the player's vehicle carries.
   *
   * Only the player's. A hundred shadow-casting spotlights would cost a
   * hundred times what this does and nobody would see the difference from a
   * street away - so the traffic has lamps that GLOW and the car you sit in
   * also LIGHTS things. That asymmetry is deliberate, and it is the only one
   * left between the player's vehicle and the fleet.
   */
  addBeam(group) {
    const beam = new THREE.SpotLight(0xfff0d0, 0, 38, Math.PI / 6.5, 0.45, 1.3)
    beam.position.set(0, 0.35 * CAR_SCALE, this.size.length / 2)
    beam.target.position.set(0, -0.5, 10)
    group.add(beam)
    group.add(beam.target)
    group.userData.beam = beam
    return beam
  }

  /**
   * Put a traffic-built mesh where the physics body actually is.
   *
   * The two builders use different origins, and nothing said so. A traffic
   * mesh is built standing on the ground - its wheels are at y=0 and its body
   * is above that - because the traffic is drawn by setting the mesh to the
   * ground height. The player's mesh is set to the CHASSIS CENTRE, which is
   * half the car's height up.
   *
   * So every vehicle out of the garage but the sedan was drawn half a car too
   * high: measured at 0.47 units for a saloon and 0.65 for the bus, hovering
   * over the road. Wrapping the mesh in a group that carries the offset fixes
   * it once, here, rather than making every caller remember - and it is the
   * same class of mistake as the boats floating above the sea.
   */
  wrapTrafficMesh(inner) {
    const outer = new THREE.Group()
    inner.position.y = -CAR_HEIGHT / 2
    outer.add(inner)

    // Carried up to the outer group so nothing downstream has to know the
    // mesh is nested. Ask the mesh what its lamps and wheels are; never hold
    // a reference to the last vehicle's.
    outer.userData.lights = inner.userData.lights
    outer.userData.wheels = inner.userData.wheels
    outer.userData.beacons = inner.userData.beacons
    // Only the fire engine has one. Carried up for the same reason as the
    // rest: World hides it while the aerial is run out, and it should not
    // have to know how deeply the mesh happens to be nested.
    outer.userData.stowedLadder = inner.userData.stowedLadder
    return outer
  }

  createDefaultMesh() {
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

  /**
   * The lamps for the built-in car, plus a real spotlight down the road.
   *
   * The lamps themselves come from World's one builder rather than being
   * made here - two sets of headlights built in two places at two sizes is
   * how the player's car ended up unlit in the first place. What IS special
   * to the player is the beam: a hundred spotlights would cost a hundred
   * shadow-casting lights for no gain, so only the car you sit in gets one.
   *
   * `-CAR_HEIGHT / 2` is where the ground is, in this mesh's coordinates.
   * This group is built around the chassis centre; the traffic's are built
   * standing on the ground.
   */
  addHeadlights(group) {
    const world = this.game.world
    if (world && world.addVehicleLamps) {
      world.addVehicleLamps(group, this.size.length, this.size.width,
                            TRAFFIC_HEIGHTS.sedan, -CAR_HEIGHT / 2)
    }
  }

  /**
   * Headlights come on as it gets dark, and brighten in heavy weather.
   * Brake lights respond to the spacebar.
   */
  /**
   * Every lamp, from the same function the hundred cars on the road use.
   *
   * The lamps are read off THE MESH each frame rather than held in fields.
   * That is the actual fix for the bug Mike found: `setKind()` throws the old
   * mesh away and builds a new one, and the old code went on driving
   * `this.headlightMaterial` - the sedan's, from before the swap - so every
   * vehicle out of the garage but the sedan drove around unlit while the
   * code carefully lit a mesh that was no longer in the scene. A reference
   * you re-read cannot go stale.
   */
  updateLights(delta = 0) {
    const lights = this.mesh && this.mesh.userData.lights
    const beam = this.mesh && this.mesh.userData.beam
    const env = this.game.environment
    if (!env || !lights) return

    const input = this.game.inputs ? this.game.inputs.getInput() : null
    const level = lampBrightness({
      gloom: gloomLevel(env),
      braking: input ? input.brake : false,
      stopped: false,
      indicate: this.indicator,
      blink: blinkOn(this.game.world ? this.game.world.elapsed : 0)
    })

    lights.head.emissiveIntensity = level.head
    lights.tail.emissiveIntensity = level.tail
    lights.left.emissiveIntensity = level.left
    lights.right.emissiveIntensity = level.right
    if (beam) beam.intensity = level.beam * 34

    // The blue lights, on the same beat as every other emergency vehicle in
    // the city. `updateTraffic` did this for the AI and nothing did it for
    // the player, so driving a police car, an ambulance or a fire engine
    // yourself was the one way to have a silent roof - which is exactly the
    // vehicle you would pick to see them.
    const beacons = this.mesh.userData.beacons
    if (!beacons) return
    const beat = Math.floor(
      (this.game.world ? this.game.world.elapsed : 0) * SIREN_RATE) % 2 === 0
    for (const beacon of beacons) {
      beacon.material.emissiveIntensity = ((beacon.side === 1) === beat) ? 2.4 : 0.05
    }
  }

  /**
   * Which way the player is indicating.
   *
   * Two sources, one answer. The stalk wins while it is latched, because
   * signalling before a junction means signalling while the wheel is still
   * straight and a steering-driven indicator would sit there dark. Otherwise
   * the steering drives it, with enough hysteresis that holding a lane
   * between the lines doesn't set it flickering.
   *
   * The stalk self-cancels the way a real one does: not when the steering
   * next passes through centre - that happens between the two halves of a
   * lane change - but once the car has actually swung round far enough in the
   * direction it was signalling.
   */
  updateIndicators(delta) {
    const inputs = this.game.inputs
    if (!inputs) return

    // How far the car has swung since the last frame, accumulated.
    //
    // NOT the difference between the current heading and the heading when the
    // stalk was set. That difference is wrapped into -PI..PI, so it cannot
    // describe more than half a turn and its SIGN flips once you pass 180
    // degrees: measured, a car that had swung 213 degrees to the right
    // reported -2.56 radians, which reads as a left turn and never cancelled
    // a right indicator. Adding up the small per-frame deltas has neither
    // problem.
    const heading = this.heading || 0
    let step = heading - (this._lastHeading === undefined ? heading : this._lastHeading)
    while (step > Math.PI) step -= Math.PI * 2
    while (step < -Math.PI) step += Math.PI * 2
    this._lastHeading = heading
    // Accumulated in the INDICATOR's sign, not the heading's. Turning right
    // decreases the heading here (see turnDirection), and the two conventions
    // meet in exactly one place: turnAmount.
    if (this.stalk) this.stalkTurned += turnAmount(step)

    if (inputs.consumeIndicator) {
      const pressed = inputs.consumeIndicator()
      // Pressing the side you are already signalling cancels it, like
      // knocking the stalk back to centre.
      if (pressed) {
        this.stalk = this.stalk === pressed ? 0 : pressed
        this.stalkTurned = 0
      }
    }

    // Headings grow clockwise and the indicator's +1 is right, so the two
    // already agree in sign; there is deliberately no flip here.
    if (this.stalk && stalkCancels(this.stalk, this.stalkTurned)) this.stalk = 0

    const steering = inputs.getInput().steering
    const automatic = steerIndicator(this.indicateState, steering, delta)
    this.indicator = resolveIndicator(this.stalk, automatic)
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
    // A traffic-built body arrived with wheels the right size for it. Use
    // those rather than adding four sedan-sized ones on top: a bus used to
    // get eleven-metre bodywork and a saloon's wheels, sunk into the road
    // underneath it because they were positioned for a different origin too.
    if (this.mesh && this.mesh.userData.wheels) return this.mesh.userData.wheels

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

  /**
   * Put the car back on a road, pointing along it.
   *
   * ONE recovery, used by everything that needs one - driving into the sea,
   * and getting wedged on a kerb. They are the same problem: the car is
   * somewhere it cannot drive out of, and the fix is to put it somewhere it
   * can. Two separate recoveries would be two places to get it wrong, and the
   * fixed spawn point was already getting it wrong: respawning always dropped
   * the car on the hub, on top of the plaza furniture, which is how a car
   * that fell in the sea came back stuck on the pedestal.
   *
   * `near` is where to look from - wherever the car is, normally. Falling off
   * the map is the exception: there is no sensible road near the bottom of
   * the sea, so that case asks from the spawn point instead.
   */
  recoverToRoad(near) {
    if (!this.body) return false

    const world = this.game.world
    const at = near || this.body.translation()
    let x = SPAWN.x, y = SPAWN.y, z = SPAWN.z, heading = 0

    if (world && world.lanes) {
      const route = routeToPoint(world.lanes, at.x, at.z)
      if (route) {
        const lane = world.lanes.lanes[route.lane]
        // A little way along the lane rather than at its very start, which is
        // inside a junction and therefore the one place other traffic is
        // certain to be.
        const spot = pointAlong(lane, Math.min(lane.length * 0.5, 12))
        x = spot.x
        z = spot.z
        heading = spot.heading
        // Dropped in from above and allowed to fall. Placed exactly on the
        // surface it can end up inside it, and a car inside the road is
        // stuck in a way that no amount of throttle fixes.
        y = (world.groundAt ? world.groundAt(x, z) : 0) + RECOVER_DROP
      }
    }

    this.body.setTranslation({ x, y, z }, true)
    this.body.setRotation(
      { x: 0, y: Math.sin(heading / 2), z: 0, w: Math.cos(heading / 2) }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.currentSpeed = 0
    this.currentSteering = 0
    this.stuckFor = 0
    this.heading = heading
    this._lastHeading = heading
    return true
  }

  /** Put the car back on the road after driving off into the void. */
  respawn() {
    // From the spawn point, not from where it is: where it is, is the bottom
    // of the sea, and the nearest lane to that is on the wrong island.
    this.recoverToRoad({ x: SPAWN.x, z: SPAWN.z })
  }

  /**
   * Notice when the car is wedged, and get it out.
   *
   * A bus or a fire engine caught on a kerb sits there with the throttle
   * open and nothing happening, and there is no input that recovers it -
   * which is what Mike found. The three conditions together are what make
   * this safe to act on: you are ASKING to move, you are NOT moving, and it
   * has been true for long enough that it is not a red light or a queue.
   *
   * Deliberately not "speed is low". A car stopped at a junction with no
   * throttle is not stuck, it is stopped, and teleporting it would be
   * alarming.
   */
  updateStuck(delta) {
    const inputs = this.game.inputs
    const selector = this.game.vehicleSelector
    if (!inputs || !this.body || (selector && selector.isBusy())) {
      this.stuckFor = 0
      this._stuckFrom = null
      return
    }

    const asking = Math.abs(inputs.getInput().forward) > 0.1

    // HOW FAR IT ACTUALLY WENT, not how fast it thinks it is going.
    //
    // This was `Math.abs(this.currentSpeed) > STUCK_SPEED`, and that is the
    // whole bug Mike hit twice. `currentSpeed` is the bicycle model's INTENDED
    // speed: press the throttle and it ramps up to cruise whether or not the
    // vehicle is going anywhere. An ambulance wedged nose-up on a kerb reports
    // a confident five units a second while its body sits perfectly still - so
    // `moving` was true, the timer reset every frame, and the recovery valve
    // built to rescue exactly this case could never fire.
    //
    // It is the project's oldest lesson in a new place: ask the geometry where
    // the thing ended up, never a proxy for it. The body's own translation is
    // the geometry; currentSpeed is a proxy, and a proxy that disagrees with
    // reality precisely when something has gone wrong is worse than none.
    const now = this.body.translation()
    const from = this._stuckFrom
    this._stuckFrom = { x: now.x, y: now.y, z: now.z }

    // No reading yet, or the frame is degenerate - wait for the next one
    // rather than guessing.
    if (!from || delta <= 0) { this.stuckFor = 0; return }

    const covered = Math.hypot(now.x - from.x, now.z - from.z) / delta
    const moving = covered > STUCK_SPEED

    if (!asking || moving) { this.stuckFor = 0; return }

    this.stuckFor = (this.stuckFor || 0) + delta
    if (this.stuckFor >= STUCK_SECONDS) {
      this.recoverToRoad()
      // The recovery is a teleport, so the next frame's displacement would be
      // enormous and the reference has to go with it - otherwise the car reads
      // as "moving fast" for one frame, which is harmless, and then the stale
      // reference reads as stuck again, which is not.
      const put = this.body.translation()
      this._stuckFrom = { x: put.x, y: put.y, z: put.z }
    }
  }

  /** Move `value` toward `target` by at most `maxDelta`. */
  approach(value, target, maxDelta) {
    if (value < target) return Math.min(target, value + maxDelta)
    if (value > target) return Math.max(target, value - maxDelta)
    return target
  }

  prePhysicsUpdate(delta) {
    if (!this.body || delta <= 0) return

    // Held while the picker is open or the vehicle is rolling out of the
    // garage. One flag, asked in one place - rather than a second input path
    // that has to be kept in step with the real one.
    const selector = this.game.vehicleSelector
    if (selector && selector.isBusy()) return

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

    // Follow the ground down, rather than flying off the top of every crest.
    //
    // The car is driven along a HORIZONTAL heading and left to gravity for the
    // rest, which was right while the world was flat. On terrain it means that
    // at any convex change of slope - the top of a rise, the lip of a bank -
    // the car carries straight on while the ground falls away, and at 18 units
    // a second that is a jump.
    //
    // So when it is on the ground, it descends at least as fast as the ground
    // does. Only DOWNWARDS: pushing a car up to meet a slope would shove it
    // through whatever it was climbing, and gravity plus the collider handle
    // that direction perfectly well already.
    const at = this.body.translation()
    const slope = groundSlope(at.x, at.z)
    const falling = this.currentSpeed *
      (slope.dx * this._forwardDir.x + slope.dz * this._forwardDir.z)

    this.body.setLinvel(
      {
        x: this._forwardDir.x * this.currentSpeed + this._lateral.x * lateralKept,
        y: falling < 0 ? Math.min(vel.y, falling) : vel.y,
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

    // Kept live from the body, so `setKind` has something true to restore and
    // the indicator stalk has something true to cancel against.
    this.heading = this.getHeading()

    this.updateIndicators(delta)
    this.updateLights(delta)
    this.updateStuck(delta)

    // Drove off the edge of an island - put the car back on the hub
    if (position.y < FALL_LIMIT) {
      this.respawn()
    }
  }

  getPosition() {
    return this.mesh.position.clone()
  }

  /**
   * Speed with its sign: positive forward, negative in reverse.
   *
   * The camera needs the direction as well as the rate - it turns round to
   * look over the boot when you reverse - and `currentSpeed` already carries
   * both. Exposed rather than copied, and getSpeed() now derives from it, so
   * there is one answer to how fast the car is going and one to which way.
   */
  getSignedSpeed() {
    return this.currentSpeed
  }

  getSpeed() {
    return Math.abs(this.getSignedSpeed())
  }
}
