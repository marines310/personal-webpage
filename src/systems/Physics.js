import RAPIER from '@dimforge/rapier3d-compat'

/**
 * Physics - Rapier physics world wrapper
 */
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

    // Allow yaw, lock pitch and roll (keeps the car upright and stable)
    if (typeof body.setEnabledRotations === 'function') {
      body.setEnabledRotations(false, true, false, true)
    }

    // Main chassis. Friction is low because the Vehicle class models grip
    // itself; leaving it high would drag against our own steering.
    const chassisCollider = this.rapier.ColliderDesc.cuboid(width / 2, height / 2, length / 2)
      .setMass(2.5)
      .setFriction(0.2)
      .setRestitution(0.05)

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
