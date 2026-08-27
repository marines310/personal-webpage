import * as THREE from 'three'
import { Game } from '../core/Game.js'
import {
  FALL_LIMIT, SEA_LEVEL, spawnPoint, groundSlope, routeToPoint, pointAlong,
  SIREN_RATE,
  getPlayerGarage,
  TRAFFIC_LENGTHS, TRAFFIC_WIDTHS
} from './islandLayout.js'
import {
  lampBrightness, blinkOn, gloomLevel, sirenBeat,
  steerIndicator, resolveIndicator, stalkCancels, turnAmount
} from './vehicleLights.js'
import {
  tuningFor, airborneVelocity, isGrounded, groundedWithCoyote, airYaw,
  tiltRates, isFlipped, TILT
} from './driving.js'
// World imports Vehicle nowhere, so this is not a cycle - and taking the
// height from the same table the traffic uses is the point: the sedan you
// drive is the sedan on the road.
import { TRAFFIC_HEIGHTS } from './World.js'
import { VEHICLE_MASS } from '../systems/Physics.js'

/**
 * The most sideways speed a collision may leave the player with, units/second.
 *
 * Chosen against the car's own top speed of 18: a third of that is a shove you
 * have to correct and can correct, where twice it was a spin you could only
 * watch. Nothing else in the world produces lateral velocity anywhere near
 * this, so the clamp only ever binds on an impact.
 */
export const IMPACT_SLIDE_LIMIT = 6

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

/**
 * How high the body's centre sits above the surface when the car is at rest.
 *
 * The chassis collider is a cuboid CAR_HEIGHT tall for every kind - see
 * `createVehicleChassis` - so it settles with its centre half that above
 * whatever it is standing on. Measured in the running game on flat tarmac: the
 * body rests at y = 0.4997 where the collider surface is 0.06, which is 0.4397
 * against a CAR_HEIGHT / 2 of 0.44.
 *
 * The 0.02 is clearance, not slop: placed exactly on the surface the two
 * cuboids start the frame touching, and Rapier's first correction gives the
 * car a small upward nudge. Two centimetres is below anything you can feel and
 * above anything the solver argues with.
 *
 * THIS EXISTS BECAUSE OF A DROP MIKE COULD FEEL AND I COULD NOT MEASURE.
 * The garage roll-out placed the car at `groundAt(x, z) + 2.2` - a DROP height
 * borrowed from the respawn, where being flung down a couple of units is
 * invisible because you were teleporting anyway. On a roll-out it is not
 * invisible: the car glides out of the bay on an invisible ramp 1.7 units up
 * and then falls off the end of it. Traced in the browser, leaving the garage:
 *
 *     dist 21.5   y 1.82 -> 1.42 -> 1.00 -> 0.55 -> 0.50   vy -9.09
 *
 * A 1.3-unit fall with the wheels off the ground the whole way, which is why
 * the throttle did nothing for the first second. I had spent two rounds
 * measuring the TERRAIN under the driveway, which was smooth to within 4cm the
 * whole way, and never once measured the car.
 */
export const REST_ABOVE_SURFACE = CAR_HEIGHT / 2 + 0.02

/**
 * Under the water, and not coming back.
 *
 * FALL_LIMIT is -4.5 and the sea is at -1.4, so there are three units of depth
 * in which a vehicle is completely submerged and nothing notices. Mike found
 * one down there - a fire engine sitting under the surface with the city
 * visible above it, speed zero, no recovery.
 *
 * WHAT IT IS NOT: the obvious explanation is a car coming to rest on the
 * island's underwater slope, and that was measured and ruled out - 28,800
 * samples of ground around every island and NOT ONE point sits between sea
 * level and the fall limit. So something else is holding it: a collider on a
 * quay, a pier, another vehicle. I could not reproduce it to find out which.
 *
 * Which is the argument for fixing the CLASS rather than the cause. "Under the
 * water" is a thing the player can see and a thing no legitimate driving
 * produces - every road on the map is above the waterline - so it is a sound
 * trigger whatever put the car there. The depth check runs alongside the fall
 * check rather than replacing it: a car falling past -4.5 should not have to
 * wait a second and a half first.
 */
const SUBMERGED = SEA_LEVEL - 0.6
const SUBMERGED_SECONDS = 1.5

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
    // Pitch and roll are no longer locked, so the body's own axes have to be
    // read every frame rather than assumed - see tiltRates() in driving.js.
    this._up = new THREE.Vector3()
    this._nose = new THREE.Vector3()
    this._groundNormal = { x: 0, y: 1, z: 0 }
    this._flippedFor = 0

    // The body, and the collider that matches it.
    //
    // These two have to agree - see item 17, where the drawn car came out 2.57
    // wide against a 1.9 collider and measured shorter than every AI vehicle
    // while looking bigger than all of them. So both come from the SAME pair of
    // numbers, and for anything but the default sedan those numbers are the
    // ones the traffic already uses for that kind.
    this.size = vehicleSize(kind)

    // The baseline is kept untouched so switching back to a saloon restores a
    // saloon exactly, rather than compounding whatever the last kind did to
    // it. See driving.js - the per-kind numbers are multipliers of this.
    this._baseParams = { ...this.params }
    this.params = tuningFor(kind, this._baseParams)
    this.params.wheelbase = WHEELBASE_RATIO * this.size.length

    this.mesh = this.createMesh()
    this.game.add(this.mesh)

    this.body = this.game.physics.createVehicleChassis(
      { x: SPAWN.x, y: SPAWN.y, z: SPAWN.z },
      // The MASS goes with the kind. Everything used to weigh the same,
      // which is why a bus reacted to a kerb exactly like a saloon.
      { width: this.size.width, height: CAR_HEIGHT, length: this.size.length,
        mass: VEHICLE_MASS[this.kind] || VEHICLE_MASS.sedan }
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
    this.params = tuningFor(kind, this._baseParams)

    // The arc grows with the body. Everything else about the handling is
    // deliberately identical between kinds - only the thing that is a
    // consequence of SIZE changes with size.
    this.params.wheelbase = WHEELBASE_RATIO * this.size.length

    this.mesh = this.createMesh()
    this.game.add(this.mesh)

    this.body = this.game.physics.createVehicleChassis(
      { x: at.x, y: at.y, z: at.z },
      // The MASS goes with the kind. Everything used to weigh the same,
      // which is why a bus reacted to a kerb exactly like a saloon.
      { width: this.size.width, height: CAR_HEIGHT, length: this.size.length,
        mass: VEHICLE_MASS[this.kind] || VEHICLE_MASS.sedan }
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
    // Only the tow truck has one. World.updateTowRig() drives the wheel-lift
    // through it, and it has to be reachable from the mesh the player is
    // actually driving rather than from the group two levels down inside it.
    outer.userData.tow = inner.userData.tow
    // Only the monorail has one, and it is ONE key rather than the six it
    // started as. The cab's lamps, lever, reverser, displays, gauges and door
    // buttons were each set on the inner group and NONE of them was carried
    // up, so updateMonorailCab() read `undefined` every frame and quietly did
    // nothing: the signal repeater stayed black, the speed display sat at full
    // scale whatever the train was doing, and the master controller never
    // moved however hard it was being driven. Bundling them means adding an
    // instrument to that desk cannot silently fail to reach the update, which
    // is exactly how the first six went missing.
    outer.userData.cab = inner.userData.cab
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
    const beat = sirenBeat(
      this.game.world ? this.game.world.elapsed : 0, SIREN_RATE)
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
  /**
   * Is this spot clear of everything else on the road?
   *
   * Asked of the traffic's DRAWN positions, which is where the cars visibly
   * are, rather than of their lane offsets - the two differ by up to a lane
   * width at a junction, and it is the visible one you would land on.
   */
  spotIsClear(x, z, room = 5) {
    const traffic = this.game.world && this.game.world.traffic
    if (!traffic) return true
    for (const other of traffic) {
      const at = other.drawn
      if (!at) continue
      if (Math.hypot(at.x - x, at.z - z) < room + (other.length || 4.4) * 0.4) {
        return false
      }
    }
    return true
  }

  recoverToRoad(near) {
    if (!this.body) return false

    const world = this.game.world
    const at = near || this.body.translation()
    let x = SPAWN.x, y = SPAWN.y, z = SPAWN.z, heading = 0

    if (world && world.lanes) {
      const route = routeToPoint(world.lanes, at.x, at.z)
      if (route) {
        const lane = world.lanes.lanes[route.lane]

        // LOOK FOR A GAP, rather than always taking the same spot.
        //
        // Mike: "it tends to respawn on top of other cars". It did, and there
        // was nothing stopping it - this dropped the car twelve units along
        // the nearest lane every single time, with no idea whether anything
        // was standing there. On a busy road the one fixed spot is occupied
        // as often as not, and the traffic's own relocate() has checked for
        // this since it was written; the player's recovery never did.
        //
        // Walked outward from the usual spot in both directions, so a clear
        // gap near it wins over a clear gap at the far end of the road.
        let spot = pointAlong(lane, Math.min(lane.length * 0.5, 12))
        const usual = Math.min(lane.length * 0.5, 12)
        for (const step of [0, 8, -8, 16, -16, 26, -26, 38, -38, 52, -52]) {
          const along = usual + step
          if (along < 3 || along > lane.length - 3) continue
          const candidate = pointAlong(lane, along)
          if (this.spotIsClear(candidate.x, candidate.z)) { spot = candidate; break }
        }

        x = spot.x
        z = spot.z
        heading = spot.heading
        // Dropped in from above and allowed to fall. Placed exactly on the
        // surface it can end up inside it, and a car inside the road is
        // stuck in a way that no amount of throttle fixes.
        y = (world.groundAt ? world.groundAt(x, z) : 0) + RECOVER_DROP
      }
    }

    this.placeAt(x, y, z, heading)
    return true
  }

  /**
   * Drive off into the void and you are put back in the garage, with the
   * picker open.
   *
   * Mike's idea, and it is better than anything I had. Every version of "put
   * the car back on the road" has the same problem: the road belongs to the
   * traffic, so any spot on it might be occupied, and picking a clear one is a
   * search that can fail. The garage bay cannot be occupied, cannot be on a
   * slope, and needs no search - and the flow out of it already exists and is
   * already right, because it is how every session starts.
   *
   * So falling in the sea is not a teleport at all now: it is starting again.
   * You choose a vehicle and drive out, which is a thing that happens TO you
   * rather than a thing the game does around you.
   *
   * The road recovery stays as the fallback for a world with no garage in it.
   */
  respawn() {
    const selector = this.game.vehicleSelector
    if (selector && selector.show) {
      selector.show()
      // show() gives up quietly if there is no garage, so ask whether it
      // actually took rather than assuming it did.
      if (selector.isBusy()) return
    }

    // From the spawn point, not from where it is: where it is, is the bottom
    // of the sea, and the nearest lane to that is on the wrong island.
    this.recoverToRoad({ x: SPAWN.x, z: SPAWN.z })
  }

  /**
   * Take a hit.
   *
   * Mike: "whenever a car hits me, I sometimes go flying... Can we make this
   * go both ways?" The other half of that - the traffic being moved - lives in
   * `bumpPlayer()` in islandLayout.js. This is the half that stops the player
   * being launched by a hatchback.
   *
   * `dvx/dvz` is a change in velocity, already shared out by mass in
   * `impactResponse()`. It is fed into the DRIVING MODEL rather than applied to
   * the body as an impulse, and that is the whole reason this method exists.
   * `applyVelocity()` overwrites the body's linear velocity every single frame
   * from `currentSpeed` and the heading - so an impulse's forward component is
   * simply thrown away on the next tick, and the sideways component is the only
   * part that survives. Which is precisely the bug: every hit came out as a
   * sideways launch and nothing ever slowed the car down.
   *
   * So the impact is split the same way the velocity is:
   *
   *   - along the car, it changes `currentSpeed`, so a rear-end shunt shoves
   *     you forward and a head-on stops you dead
   *   - across the car, it goes in as real lateral velocity, which then decays
   *     through `lateralGrip` like any other slide
   *
   * And it is CAPPED, which is the "flying" fix. A capped lateral is not
   * physically honest, but the honest answer to "an infinitely heavy bus has
   * overlapped your door by 40cm" is also not honest, and this one is playable.
   */
  applyImpact(dvx, dvz) {
    if (!this.body) return

    const fx = this._forwardDir && this._forwardDir.lengthSq() > 1e-6
      ? this._forwardDir.x : Math.sin(this.heading)
    const fz = this._forwardDir && this._forwardDir.lengthSq() > 1e-6
      ? this._forwardDir.z : Math.cos(this.heading)

    const along = dvx * fx + dvz * fz
    const acrossX = dvx - fx * along
    const acrossZ = dvz - fz * along

    // Along: straight into the bicycle model's own speed.
    this.currentSpeed = Math.max(
      -this.params.maxReverseSpeed,
      Math.min(this.params.maxForwardSpeed, this.currentSpeed + along))

    // Across: added to what the body is already doing sideways, then clamped.
    const vel = this.body.linvel()
    let sx = vel.x + acrossX
    let sz = vel.z + acrossZ
    const sideways = Math.hypot(
      sx - fx * (sx * fx + sz * fz),
      sz - fz * (sx * fx + sz * fz))

    if (sideways > IMPACT_SLIDE_LIMIT) {
      const keep = IMPACT_SLIDE_LIMIT / sideways
      const alongNow = sx * fx + sz * fz
      sx = fx * alongNow + (sx - fx * alongNow) * keep
      sz = fz * alongNow + (sz - fz * alongNow) * keep
    }

    // Never upwards. Nothing about being hit by a car on a flat road should
    // add height, and letting it was half of what "going flying" meant.
    this.body.setLinvel({ x: sx, y: Math.min(vel.y, 0.5), z: sz }, true)
  }

  /** Put the car down somewhere, stationary and pointing a given way. */
  placeAt(x, y, z, heading) {
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

    // A TRAIN IS ON RAILS, so none of this applies to it.
    //
    // The monorail is driven by World.updateMonorail(), which puts the body
    // exactly where the timetable says the train is. Letting the car physics
    // also push it would be two things writing the same position, and the one
    // that ran second would win - which is a train that leans into corners and
    // gets pushed off its beam by a bridge.
    if (this.kind === 'monorail') return

    const p = this.params
    const { forward, steering, boost, brake } = this.game.inputs.getInput()

    // Only the throttle needs solid ground; steering geometry still applies
    // while airborne so the car doesn't freeze mid-jump.
    //
    // ONE notion of grounded, asked once a frame and used everywhere below.
    // It used to be a downward ray with a 1.2-unit reach, which is a different
    // question from the one `groundedNow()` answers and gave a different
    // answer at the top of a ramp - so the throttle cut out at a point that
    // had nothing to do with where the car actually left the ground.
    this.isGrounded = this.updateGrounded(delta)

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
    } else if (this.isGrounded) {
      // Coasting - roll to a stop gradually, never instantly
      this.currentSpeed = this.approach(speed, 0, p.rollingResistance * delta)
    }
    // Airborne and off the throttle, the speed is simply KEPT. Rolling
    // resistance is friction between a tyre and a road, and there is no road.
    //
    // This matters more than it sounds. `throttle` is forced to zero the
    // moment the wheels leave the ground, so before this the coast branch ran
    // through every jump: the monster truck left the lip at 14 and landed
    // doing noticeably less, and because it has full air control its velocity
    // IS its speed times its heading, so the whole flight shortened with it.
    // Measured, the big jump came out at 9.8 units against the 16.8 the
    // ballistics say - and the ballistics were right.

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

    // In the air there are no tyres to turn against, so the bicycle model
    // does not apply and using it raw is absurd: the monster truck's lock and
    // short wheelbase come out at five radians a second, which would let it
    // spin four times over a two-second jump. `airYaw()` scales it back to
    // what the kind is allowed - see driving.js.
    // YAW from the steering, PITCH AND ROLL from the tilt controller.
    //
    // This line used to be `{ x: 0, y: yawRate, z: 0 }`, and that zero on x
    // and z was half of why jumps felt flat: even with the rotation lock
    // removed, writing zero to the pitch and roll rates every frame threw away
    // whatever the physics had built up. The car left a mound level, flew
    // level and landed level.
    //
    // Yaw is still written outright rather than sprung, because steering has
    // to be exact - a car that has to be persuaded round a corner is not fun.
    const rot = this.body.rotation()
    this._quat.set(rot.x, rot.y, rot.z, rot.w)
    this._up.set(0, 1, 0).applyQuaternion(this._quat)
    this._nose.set(0, 0, 1).applyQuaternion(this._quat)

    const spin = this.body.angvel()
    const tilt = tiltRates({
      up: this._up,
      forward: this._nose,
      angVel: spin,
      velocity: this.body.linvel(),
      grounded: this.isGrounded,
      groundNormal: this._groundNormal,
      delta
    })

    this.body.setAngvel(
      {
        x: tilt.x,
        y: this.isGrounded ? yawRate : airYaw(yawRate, this.params),
        z: tilt.z
      },
      true)

    // Hard cornering scrubs off a little speed, like real tyres - which is
    // exactly why it does not apply in mid-air either.
    if (p.corneringDrag > 0 && this.isGrounded) {
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
    // Which way the car is FACING, flattened onto the ground plane.
    //
    // This used to read `euler.y` off the body's quaternion, which was exact
    // while pitch and roll were locked and is wrong the moment they are not:
    // a YXZ euler's y is only the heading for a body with no other rotation,
    // and a car nose-down over a jump reports a heading that swings as it
    // pitches. Projecting the nose onto the horizontal is the same number
    // when level and the right one when not - it is what getHeading() has
    // always done.
    this._quat.set(rot.x, rot.y, rot.z, rot.w)
    this._forwardDir.set(this._nose.x, 0, this._nose.z)
    if (this._forwardDir.lengthSq() < 1e-6) {
      // Standing exactly on its nose or tail. Rare, and the last known
      // heading is a better answer than a division by zero.
      this._forwardDir.set(Math.sin(this.heading || 0), 0, Math.cos(this.heading || 0))
    }
    this._forwardDir.normalize()

    const vel = this.body.linvel()

    if (!this.isGrounded) {
      // Airborne. Gravity owns the vertical; what happens horizontally is the
      // whole difference between the three vehicles - see `airControl` in
      // driving.js and `airborneVelocity()`.
      //
      // This used to be an unconditional early return, and that was the bug
      // that made the stunt park's big jump behave identically for all three
      // kinds: `airborneVelocity()` was written, tested and imported, and the
      // code that called it was three lines further down than the `return`.
      // Measured before the fix, holding full lock from the moment the wheels
      // left the ramp moved the monster truck 0.4 units sideways over a
      // 20-unit flight. Which is to say: none.
      this._planarVel.set(vel.x, 0, vel.z)

      const air = this.params.airControl || 0
      if (air > 0) {
        const wanted = {
          x: this._forwardDir.x * this.currentSpeed,
          z: this._forwardDir.z * this.currentSpeed
        }
        const flown = airborneVelocity(wanted, vel, false, air)
        this.body.setLinvel({ x: flown.x, y: vel.y, z: flown.z }, true)
        this._planarVel.set(flown.x, 0, flown.z)
      }

      // Either way, keep the bookkeeping honest: `currentSpeed` is what the
      // HUD, the camera and the engine note all read, and landing with a
      // stale one produces a jolt.
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

    // Grounded or airborne, and it changes what the horizontal velocity is
    // allowed to be. See driving.js: on the ground the velocity IS the
    // heading times the speed, set outright, which is what makes the car feel
    // planted. In the air that same rule turns a jump into a flat steerable
    // glide, because the speed never decays and a flick of the wheel
    // redirects all of it sideways.
    //
    // Nothing in the world could launch a car until the jump course, so this
    // was never wrong before and is unavoidably wrong now.
    // `this.isGrounded` rather than asking again: it is one fact about this
    // frame, it costs a walk over the body's contacts to work out, and two
    // answers to the same question in one frame is how they come to disagree.
    const grounded = this.isGrounded
    const desired = {
      x: this._forwardDir.x * this.currentSpeed + this._lateral.x * lateralKept,
      z: this._forwardDir.z * this.currentSpeed + this._lateral.z * lateralKept
    }
    const flat = airborneVelocity(
      desired, vel, grounded, this.params.airControl ?? 0)

    this.body.setLinvel(
      {
        x: flat.x,
        // Only pinned DOWN to the slope while grounded. Doing it in mid-air
        // would drag the car back onto the hill it just left.
        y: (grounded && falling < 0) ? Math.min(vel.y, falling) : vel.y,
        z: flat.z
      },
      true
    )
  }

  /**
   * Is the vehicle standing on something?
   *
   * Asked of the physics engine, which knows exactly, rather than measured
   * with a downward ray, which needs a threshold nobody could justify. This
   * returned a hardcoded `true` for a whole stage while that threshold was
   * being argued about; `Physics.contactNormals()` records what the argument
   * was and how it ended.
   *
   * The array is kept on the vehicle and refilled in place. This runs every
   * frame, and a fresh array sixty times a second for a whole session is
   * garbage nobody needs to collect.
   */
  groundedNow() {
    if (!this.body || !this.game.physics) return true
    if (!this._contactNormals) this._contactNormals = []
    return isGrounded(
      this.game.physics.contactNormals(this.body, this._contactNormals))
  }

  /**
   * Grounded for THIS frame, contacts plus coyote time.
   *
   * Called exactly once a frame, at the top of the driving update, and every
   * other question about the ground reads `this.isGrounded`. Two things follow
   * from that: the contact walk happens once rather than three times, and
   * nothing in a frame can disagree with anything else about whether the car
   * is on the ground - which matters more, because the answer decides the
   * throttle, the yaw and the velocity, and those three disagreeing is a car
   * that accelerates while sliding sideways through the air.
   *
   * See COYOTE_TIME in driving.js for why the raw contact answer is not used
   * directly. The short version is a measurement: without it a saloon driven
   * hard spent 28.7% of its frames genuinely airborne, over kerbs and road
   * seams, and it felt like it.
   */
  updateGrounded(delta) {
    const touching = this.groundedNow()
    this._offGroundFor = touching ? 0 : (this._offGroundFor || 0) + delta

    // The surface under the car, taken from the same contacts, because
    // tiltRates() lies the car ALONG the slope it is standing on rather than
    // holding it level on a hill. Only worth asking when there is something
    // to be standing on; in the air the last one is stale and unused.
    if (touching && this.game.physics.groundNormal) {
      this.game.physics.groundNormal(this.body, this._groundNormal)
    } else {
      this._groundNormal.x = 0
      this._groundNormal.y = 1
      this._groundNormal.z = 0
    }

    // The ray is only asked when the contacts have already said no, which is
    // most frames skipped: a walk over the body's contacts is 70 microseconds
    // and a raycast is not free either.
    const below = touching ? 0 : this.game.physics.groundDistance(this.body)
    return groundedWithCoyote(touching, below, this._offGroundFor)
  }

  /**
   * Put it back on its wheels if it has been on its roof long enough.
   *
   * The price of taking the rotation lock off. Nothing in this world can right
   * an upside-down car - there is no driver to climb out and no crane - so
   * without this a bad landing in the arena ends the session. Two seconds is
   * long enough that a roll reads as a roll and short enough that a child does
   * not think the game has broken.
   *
   * It rights rather than respawns, so you keep your place on the course.
   */
  updateFlip(delta) {
    if (!this.body) return
    if (!isFlipped(this._up)) { this._flippedFor = 0; return }

    this._flippedFor = (this._flippedFor || 0) + delta
    if (this._flippedFor < TILT.flipSeconds) return
    this._flippedFor = 0

    // Through placeAt(), like every other way of putting this car down.
    //
    // Written out by hand first, and vehiclelights.mjs caught it within the
    // hour: "there is one way of putting a vehicle down, not two". It counts
    // the line that brings the car to rest, and there were suddenly two of
    // them. The test is right - a second stop-and-place is a second place to
    // get the bookkeeping wrong, and this one had already forgotten to reset
    // the steering and the stuck timer.
    const at = this.body.translation()
    this.placeAt(at.x, at.y + 1.2, at.z, this.heading || 0)
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

    // Read HERE, not left over from the driving update. That one returns
    // early while the vehicle picker is open, so a car that was flipped as
    // the picker opened would be judged on a stale axis for as long as it
    // stayed open.
    this._quat.set(rotation.x, rotation.y, rotation.z, rotation.w)
    this._up.set(0, 1, 0).applyQuaternion(this._quat)
    this.updateFlip(delta)

    this.updateIndicators(delta)
    this.updateLights(delta)
    this.updateStuck(delta)

    // Drove off the edge of an island - straight back to the garage.
    if (position.y < FALL_LIMIT) {
      this.underwaterFor = 0
      this.respawn()
      return
    }

    // Or is under the water and staying there. Given a moment rather than
    // acted on instantly, so bouncing through the surface off a ramp does not
    // count as drowning.
    if (position.y < SUBMERGED) {
      this.underwaterFor = (this.underwaterFor || 0) + delta
      if (this.underwaterFor > SUBMERGED_SECONDS) {
        this.underwaterFor = 0
        this.respawn()
      }
    } else {
      this.underwaterFor = 0
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
