import RAPIER from '@dimforge/rapier3d-compat'

/**
 * Physics - Rapier physics world wrapper
 */
/**
 * What each kind weighs.
 *
 * They all weighed 2.5 - a saloon and an eleven-unit bus alike - which is why
 * everything reacted to a bump identically and none of it felt like it had any
 * weight. These are ratios rather than kilograms; what matters is that a fire
 * engine is nearly three times a saloon and behaves like it.
 */
export const VEHICLE_MASS = {
  sedan: 4,
  convertible: 3.6,
  pickup: 5.4,
  suv: 5,
  police: 4.2,
  ambulance: 7,
  // Heavier than it looks: a wrecker is a truck chassis carrying a steel body
  // and a hydraulic boom, and it has to be able to drag a car without being
  // dragged around by it.
  tow: 8.5,
  fire: 11,
  bus: 13,
  monster: 8,
  race: 3,
  // Never actually thrown around by the solver - a driven monorail is held on
  // its beam by the timetable - but it has to have a mass like everything
  // else, and a train weighing less than a bus would be a strange lie to tell.
  monorail: 20
}

export class Physics {
  constructor() {
    this.world = null
    this.rapier = null
    this.bodies = new Map() // Map mesh to rigid body
    this.colliders = new Map() // Map mesh to collider
  }

  async init() {
    // Initialize the WASM module (rapier3d-compat has proper init())
    await RAPIER.init()
    this.rapier = RAPIER

    // Create physics world with gravity
    const gravity = { x: 0, y: -9.81, z: 0 }
    this.world = new this.rapier.World(gravity)

    console.log('Physics: Rapier initialized')
  }

  update(delta) {
    if (!this.world) return

    // Drive the simulation from the real frame time so behaviour is the
    // same on a 60Hz display and a 120Hz ProMotion one. Clamped so a
    // background tab or a stall can't produce one huge unstable step.
    this.world.timestep = Math.min(Math.max(delta, 1 / 240), 1 / 20)
    this.world.step()

    // Update Three.js meshes from physics bodies
    for (const [mesh, body] of this.bodies) {
      if (body.isDynamic()) {
        const position = body.translation()
        const rotation = body.rotation()

        mesh.position.set(position.x, position.y, position.z)
        mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w)
      }
    }
  }

  /**
   * Create a static ground plane
   */
  createGround(size = 200) {
    const groundDesc = this.rapier.RigidBodyDesc.fixed()
    const groundBody = this.world.createRigidBody(groundDesc)

    const groundColliderDesc = this.rapier.ColliderDesc.cuboid(size / 2, 0.1, size / 2)
    groundColliderDesc.setFriction(0.8)
    this.world.createCollider(groundColliderDesc, groundBody)

    return groundBody
  }

  /**
   * Create a dynamic box body
   */
  createDynamicBox(mesh, width, height, depth, mass = 1) {
    const position = mesh.position

    const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)

    const body = this.world.createRigidBody(bodyDesc)

    const colliderDesc = this.rapier.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
      .setMass(mass)
      .setFriction(0.5)
      .setRestitution(0.2)

    const collider = this.world.createCollider(colliderDesc, body)

    this.bodies.set(mesh, body)
    this.colliders.set(mesh, collider)

    return { body, collider }
  }

  /**
   * Create a static box collider
   */
  createStaticBox(mesh, width, height, depth) {
    const position = mesh.position

    const bodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(position.x, position.y, position.z)

    const body = this.world.createRigidBody(bodyDesc)

    const colliderDesc = this.rapier.ColliderDesc.cuboid(width / 2, height / 2, depth / 2)
      .setFriction(0.8)

    const collider = this.world.createCollider(colliderDesc, body)

    return { body, collider }
  }

  /**
   * Create a static cylinder collider - used for the island landmasses.
   * `y` is the centre of the cylinder, `halfHeight` its half-depth.
   */
  createStaticCylinder(x, y, z, radius, halfHeight) {
    const bodyDesc = this.rapier.RigidBodyDesc.fixed().setTranslation(x, y, z)
    const body = this.world.createRigidBody(bodyDesc)

    const colliderDesc = this.rapier.ColliderDesc.cylinder(halfHeight, radius)
      .setFriction(0.9)

    const collider = this.world.createCollider(colliderDesc, body)
    return { body, collider }
  }

  /**
   * Create a static triangle-mesh collider. Used for the island landmasses,
   * which can be any shape including concave ones a convex hull would fill in.
   *
   * @param {Float32Array} vertices flat xyz triples, already in world space
   * @param {Uint32Array}  indices  triangle corner indices
   * @returns {object|null} null if the mesh was rejected, so the caller can
   *                        fall back to a simpler collider.
   */
  createStaticTrimesh(vertices, indices) {
    if (!this.world || !vertices.length || !indices.length) return null

    try {
      const bodyDesc = this.rapier.RigidBodyDesc.fixed()
      const body = this.world.createRigidBody(bodyDesc)

      const colliderDesc = this.rapier.ColliderDesc
        .trimesh(vertices, indices)
        .setFriction(0.9)

      const collider = this.world.createCollider(colliderDesc, body)
      return { body, collider }
    } catch (err) {
      console.warn('[Physics] Trimesh collider failed, falling back:', err.message)
      return null
    }
  }

  /**
   * Create a static box at an explicit position and yaw. Used for bridges
   * and any prop that needs to sit at an angle.
   */
  createStaticBoxAt(x, y, z, width, height, depth, rotationY = 0) {
    const half = rotationY / 2
    const bodyDesc = this.rapier.RigidBodyDesc.fixed()
      .setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })

    const body = this.world.createRigidBody(bodyDesc)

    const colliderDesc = this.rapier.ColliderDesc
      .cuboid(width / 2, height / 2, depth / 2)
      .setFriction(0.9)

    const collider = this.world.createCollider(colliderDesc, body)
    return { body, collider }
  }

  /**
   * A box that goes where it's told and is not pushed around by anything.
   *
   * Used for the AI traffic. A kinematic body collides with the player's car
   * properly - you bump into it, it stops you - but it never gets knocked off
   * its lane, because forces don't apply to it. The alternative, a dynamic
   * body driven along a path, spends its life on its roof.
   */
  createKinematicBox(x, y, z, width, height, depth, rotationY = 0) {
    const half = rotationY / 2
    const bodyDesc = this.rapier.RigidBodyDesc.kinematicPositionBased()
      .setTranslation(x, y, z)
      .setRotation({ x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) })

    const body = this.world.createRigidBody(bodyDesc)

    const colliderDesc = this.rapier.ColliderDesc
      .cuboid(width / 2, height / 2, depth / 2)
      .setFriction(0.6)

    const collider = this.world.createCollider(colliderDesc, body)
    return { body, collider }
  }

  /** Move a kinematic body. Called every frame for every AI vehicle. */
  moveKinematic(handle, x, y, z, rotationY = 0) {
    if (!handle || !handle.body) return
    const half = rotationY / 2
    handle.body.setNextKinematicTranslation({ x, y, z })
    handle.body.setNextKinematicRotation({
      x: 0, y: Math.sin(half), z: 0, w: Math.cos(half)
    })
  }

  /**
   * Create vehicle chassis body.
   *
   * Rotation is locked to the Y (yaw) axis only. The Vehicle class steers
   * by setting yaw directly, and locking pitch/roll means ramps, kerbs and
   * wall scrapes can never tip or barrel-roll the car.
   */
  createVehicleChassis(position, dimensions) {
    const { width, height, length } = dimensions

    const bodyDesc = this.rapier.RigidBodyDesc.dynamic()
      .setTranslation(position.x, position.y, position.z)
      // Velocity is set explicitly each frame, so damping stays low -
      // otherwise it fights the vehicle model.
      .setLinearDamping(0.05)
      .setAngularDamping(0.05)
      .setCanSleep(false)

    const body = this.world.createRigidBody(bodyDesc)

    // ROTATION IS FREE ON ALL THREE AXES.
    //
    // It used to be `setEnabledRotations(false, true, false, true)` - yaw
    // only - and the comment said that locking pitch and roll "keeps the car
    // upright and stable". It did. It also meant a car left a four-unit jump
    // perfectly level, flew perfectly level and landed perfectly level, which
    // is what Mike reported after driving the arena: "the jump mechanics seem
    // kinda flat."
    //
    // What keeps it upright now is a controller rather than a constraint -
    // `tiltRates()` in driving.js, an upright spring that is stiff on the
    // ground and weak in the air. That is worth the swap because a spring can
    // be overcome for a moment and a lock cannot, and the moment is the whole
    // point.
    //
    // Note this only ever applied to the PLAYER's car. The traffic runs on
    // kinematic bodies and is positioned outright, so none of it is affected.
    if (typeof body.setEnabledRotations === 'function') {
      body.setEnabledRotations(true, true, true, true)
    }

    // A PLAIN BOX, and the rounded one that was tried instead is worth
    // writing down because the reasoning was good and the answer was no.
    //
    // Mike: "sometimes the player vehicle makes some weird bounces while
    // driving. It seems like there are some collisions with invisible objects
    // when visibly there aren't."
    //
    // There aren't any. Asked directly - park the car anywhere on any road and
    // list every collider it is touching - the answer is one trimesh, every
    // time: the island's own ground. So the "invisible object" is the FLOOR,
    // and the textbook explanation is that a sharp-cornered box catches on the
    // edges between a trimesh's triangles. The textbook fix is `roundCuboid`.
    //
    // It was built, and measured against the plain box over twenty
    // independent four-second runs on the same twenty stretches of road:
    //
    //     collider   mass   median  p75   p90   worst
    //     box        2.5    1.76    2.99  4.96  9.76
    //     rounded    2.5    1.76    1.92  7.58  11.64
    //     box        4      1.76    1.92  3.61  6.12
    //     rounded    4      1.75    1.77  4.49  6.16
    //
    // Rounding does nothing the mass does not do better, and at the old mass
    // it made the tail WORSE. So it is not here. What is here is the mass,
    // which is the row that does move: every vehicle in the game weighed 2.5,
    // from the saloon to the eleven-unit bus, and giving them real relative
    // weights takes the worst disturbance from 9.76 to 6.12. That is also
    // the other half of what Mike asked for - "maybe make the vehicles feel
    // heavier" - and it is a thing that should have been true anyway.
    //
    // Friction stays low because the Vehicle class models grip itself;
    // leaving it high would drag against our own steering.
    const chassisCollider = this.rapier.ColliderDesc.cuboid(
      width / 2, height / 2, length / 2)
      .setMass(this.massOverride ?? (dimensions.mass || VEHICLE_MASS.sedan))
      .setFriction(0.2)
      .setRestitution(0.02)

    this.world.createCollider(chassisCollider, body)

    return body
  }

  /**
   * Take a body out of the world.
   *
   * Needed because the player can change vehicle, and a bus is not a sedan:
   * the collider has to change with the body it represents, and Rapier sizes a
   * collider at creation. Leaving the old one behind would put an invisible
   * sedan-shaped obstacle wherever you last swapped.
   */
  removeBody(body) {
    if (!this.world || !body) return
    this.world.removeRigidBody(body)
  }

  /**
   * Is there ground within `maxDistance` below this body?
   *
   * Used so the car only accelerates while it has something to push
   * against. Falls back to `true` if the raycast API isn't available,
   * so driving never silently breaks.
   */
  isGrounded(body, maxDistance = 1.2) {
    if (!this.world || !body) return true

    try {
      const t = body.translation()
      const ray = new this.rapier.Ray(
        { x: t.x, y: t.y, z: t.z },
        { x: 0, y: -1, z: 0 }
      )

      const hit = this.world.castRay(
        ray,
        maxDistance,
        true,        // treat colliders as solid
        undefined,   // filterFlags
        undefined,   // filterGroups
        undefined,   // filterExcludeCollider
        body         // filterExcludeRigidBody - ignore ourselves
      )

      return hit !== null && hit !== undefined
    } catch (err) {
      return true
    }
  }

  /**
   * The height of the first collider under a point in the air.
   *
   * THE ONLY HONEST ANSWER TO "how high is the ground here", and the reason it
   * has to be asked of Rapier rather than of the terrain is worth stating.
   * `groundHeight()` returns the raw height FIELD; what a car rests on is the
   * collider, which stands `surfaceLift(claim)` above that field on grass, is a
   * bridge deck out over the water, and is a garage floor inside a building.
   * Three surfaces, one of them not made of terrain at all. Anything that
   * places a vehicle and reasons from the height field is guessing, and it was
   * guessing by 1.7 units on the way out of the player's garage.
   *
   * Cast from well above so it cannot start inside whatever it is looking for.
   * Returns null if there is nothing under the point at all - over the sea,
   * say - so the caller can decide what that means rather than being handed a
   * plausible zero.
   */
  surfaceUnder(x, z, from = 60, maxDistance = 200, excludeBody = null) {
    if (!this.world) return null

    try {
      const ray = new this.rapier.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 })
      const hit = this.world.castRay(
        ray, maxDistance, true, undefined, undefined, undefined,
        excludeBody || undefined)
      if (!hit) return null
      const toi = hit.timeOfImpact ?? hit.toi
      if (toi === undefined || toi === null) return null
      return from - toi
    } catch (err) {
      return null
    }
  }

  /**
   * How far below a body the nearest collider is, or null for nothing within
   * reach.
   *
   * The same ray isGrounded() casts, but returning the DISTANCE rather than a
   * yes or no, so the rule about what counts can live in driving.js with the
   * rest of the driving rules instead of being half a number baked in here.
   *
   * Own body excluded, of course, or every car would find itself.
   */
  groundDistance(body, maxDistance = 6) {
    if (!this.world || !body) return 0

    try {
      const t = body.translation()
      const ray = new this.rapier.Ray(
        { x: t.x, y: t.y, z: t.z }, { x: 0, y: -1, z: 0 })
      const hit = this.world.castRay(
        ray, maxDistance, true, undefined, undefined, undefined, body)
      if (!hit) return null
      return hit.timeOfImpact ?? hit.toi ?? null
    } catch (err) {
      // Same fallback as everywhere else here: if we cannot tell, say the
      // ground is right there. A car that cannot be driven is worse than one
      // that cannot jump.
      return 0
    }
  }

  /**
   * The upward component of every contact this body currently has.
   *
   * Rapier already knows what a body is touching, so asking it is exact where
   * a downward ray is a guess. The ray version needs a distance to compare
   * against and there is no good one: measured in the running game, a settled
   * car reads 0.57 under its centre, but forty-five seconds of driving over
   * kerbs and junctions produced a frame at 1.85 with the car barely moving
   * vertically. Pick 1.0 and that frame is a phantom flight; pick 2.0 and a
   * car that has genuinely just left a ramp is still "on the ground" for the
   * first two units of its jump.
   *
   * Contacts need no threshold at all: on something, one pair; in the air,
   * none. Checked over 2700 frames of driving against the ray, the two
   * disagreed on four frames and the contacts were right on all four - each
   * was the car falling at five units a second on its way out of the garage,
   * which the ray happily called grounded.
   *
   * The Y COMPONENT, not just the count, because a car scraping a wall is in
   * contact with the wall. A floor pushes up, a wall pushes sideways. Which is
   * which is `driving.js`'s business; this only reports. (Measured: a car
   * wedged in the garage doorway reported 22 pairs, every one of them with a
   * Y component of exactly zero.)
   *
   * Written into a caller-supplied array so a per-frame call does not litter,
   * and `body.collider(0)` rather than a walk over every collider in the world
   * - there are hundreds of those and this runs every frame. The direct lookup
   * was checked against the walk and returns the same collider.
   *
   * Costs about 70 microseconds a frame, measured: a two-hundredth of the
   * budget at 60fps.
   *
   * Falls back to a single flat floor if anything throws, for the same reason
   * isGrounded() falls back to true - reporting "airborne" by mistake stops
   * the steering setting the car's velocity, and a car that cannot be steered
   * is a worse failure than one that cannot jump.
   */
  contactNormals(body, out = []) {
    out.length = 0
    if (!this.world || !body) { out.push(1); return out }

    try {
      const collider = typeof body.collider === 'function' ? body.collider(0) : null
      if (!collider) { out.push(1); return out }

      this.world.contactPairsWith(collider, (other) => {
        this.world.contactPair(collider, other, (manifold, flipped) => {
          const normal = manifold.normal()
          out.push(flipped ? -normal.y : normal.y)
        })
      })
    } catch (err) {
      out.length = 0
      out.push(1)
    }

    return out
  }

  /**
   * The surface under the body, as a full normal - not just its Y.
   *
   * `contactNormals()` reports only the upward component of each contact,
   * which is all `isGrounded()` ever needed: it is answering "is any of these
   * a floor". Making a car PITCH with the slope it is standing on needs the
   * whole vector, and it needs the FLOOR's rather than an average over every
   * contact, because a car scraping a kerb is also touching a wall and a wall
   * would drag the average sideways.
   *
   * So: the steepest-upward contact wins. Falls back to straight up, which is
   * the answer that makes a car drivable when nothing can be determined.
   */
  groundNormal(body, out = { x: 0, y: 1, z: 0 }) {
    out.x = 0; out.y = 1; out.z = 0
    if (!this.world || !body) return out

    try {
      const collider = typeof body.collider === 'function' ? body.collider(0) : null
      if (!collider) return out

      let best = 0
      this.world.contactPairsWith(collider, (other) => {
        this.world.contactPair(collider, other, (manifold, flipped) => {
          const n = manifold.normal()
          const sign = flipped ? -1 : 1
          const y = sign * n.y
          if (y > best) {
            best = y
            out.x = sign * n.x
            out.y = y
            out.z = sign * n.z
          }
        })
      })
    } catch (err) {
      out.x = 0; out.y = 1; out.z = 0
    }
    return out
  }

  /**
   * Apply force to a body
   */
  applyForce(body, force) {
    body.addForce(force, true)
  }

  /**
   * Apply torque to a body
   */
  applyTorque(body, torque) {
    body.addTorque(torque, true)
  }

  /**
   * Get body velocity
   */
  getVelocity(body) {
    return body.linvel()
  }

  /**
   * Set body velocity
   */
  setVelocity(body, velocity) {
    body.setLinvel(velocity, true)
  }
}
