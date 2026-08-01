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
