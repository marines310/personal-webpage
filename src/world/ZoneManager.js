import * as THREE from 'three'
import { Game } from '../core/Game.js'
import { getIsland } from './islandLayout.js'
import { ZONE_CONTENT } from '../content.js'

/**
 * Zone - A trigger area that shows content when the player enters
 */
class Zone {
  constructor(config) {
    this.id = config.id
    this.position = new THREE.Vector3(config.x, 0, config.z)
    this.radius = config.radius || 8
    this.title = config.title
    this.content = config.content
    this.color = config.color || 0x4facfe

    // State
    this.isActive = false
    this.mesh = null

    // Create visual marker
    this.createMarker()
  }

  createMarker() {
    const game = Game.getInstance()
    const colour = new THREE.Color(this.color)

    // Glowing ground ring marking the trigger area
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(this.radius - 0.35, this.radius, 48),
      new THREE.MeshBasicMaterial({
        color: this.color,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.55,
        depthWrite: false
      })
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.copy(this.position)
    ring.position.y = 0.12
    game.add(ring)

    // Hologram column - a tall translucent beam of light
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.9, 14, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: 0.13,
        side: THREE.DoubleSide,
        depthWrite: false
      })
    )
    beam.position.copy(this.position)
    beam.position.y = 7
    game.add(beam)
    this.beam = beam

    // Solid core pylon
    const pillar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.6, 3.4, 8),
      new THREE.MeshStandardMaterial({
        color: 0x14142a,
        emissive: colour,
        emissiveIntensity: 0.55,
        metalness: 0.8,
        roughness: 0.25,
        flatShading: true
      })
    )
    pillar.position.copy(this.position)
    pillar.position.y = 1.7
    pillar.castShadow = true
    game.add(pillar)

    // Floating diamond that bobs and spins above the pylon
    const crystal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.85, 0),
      new THREE.MeshBasicMaterial({ color: this.color })
    )
    crystal.position.copy(this.position)
    crystal.position.y = 5.2
    game.add(crystal)
    this.crystal = crystal

    // Point light so the marker lights its surroundings after dark.
    // Intensity is driven in animate() from the time of day - a bright
    // point light in full sun just looks like a blown-out patch.
    const light = new THREE.PointLight(this.color, 0, 26, 2)
    light.position.copy(this.position)
    light.position.y = 4
    game.add(light)
    this.light = light

    this.createLabel()
    this.mesh = pillar
  }

  createLabel() {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 128
    const ctx = canvas.getContext('2d')

    const hex = '#' + new THREE.Color(this.color).getHexString()

    ctx.font = 'bold 60px Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Neon glow: draw the text repeatedly with a coloured shadow
    ctx.shadowColor = hex
    ctx.shadowBlur = 26
    ctx.fillStyle = hex
    ctx.fillText(this.title, 256, 64)
    ctx.fillText(this.title, 256, 64)

    // Bright core on top
    ctx.shadowBlur = 0
    ctx.fillStyle = '#ffffff'
    ctx.fillText(this.title, 256, 64)

    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 8

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false
      })
    )
    sprite.position.copy(this.position)
    sprite.position.y = 7.4
    sprite.scale.set(8, 2, 1)

    Game.getInstance().add(sprite)
    this.label = sprite
  }

  /** Called every frame so the marker feels alive. */
  animate(elapsed, nightFactor = 0) {
    if (this.crystal) {
      this.crystal.rotation.y = elapsed * 0.9
      this.crystal.rotation.x = Math.sin(elapsed * 0.7) * 0.25
      this.crystal.position.y = 5.2 + Math.sin(elapsed * 1.6) * 0.35
    }

    // Markers glow at night, and stay subtle in daylight
    if (this.light) {
      const base = this.isActive ? 26 : 15
      this.light.intensity = (base + Math.sin(elapsed * 2.4) * 4) * nightFactor
    }

    if (this.beam) {
      const strength = this.isActive ? 0.2 : 0.11
      this.beam.material.opacity =
        (strength + Math.sin(elapsed * 1.8) * 0.03) * (0.45 + nightFactor * 0.55)
    }

    if (this.mesh) {
      const lit = this.isActive ? 1.4 : 0.5
      this.mesh.material.emissiveIntensity = lit * (0.35 + nightFactor * 0.9)
    }
  }

  checkPlayerInside(playerPosition) {
    const distance = this.position.distanceTo(
      new THREE.Vector3(playerPosition.x, 0, playerPosition.z)
    )
    return distance < this.radius
  }

  setActive(active) {
    if (this.isActive === active) return

    this.isActive = active

    // Emissive strength is handled per-frame in animate(), since it also
    // depends on the time of day. Here we only do the one-off pop.
    if (this.crystal) {
      this.crystal.scale.setScalar(active ? 1.45 : 1)
    }
  }
}

/**
 * ZoneManager - Manages all content zones
 */
export class ZoneManager {
  constructor() {
    this.game = Game.getInstance()
    this.zones = []
    this.activeZone = null

    // Create default portfolio zones
    this.createZones()
  }

  /**
   * One marker per island, built from `src/content.js`.
   *
   * THERE IS NO TEXT IN THIS FILE. Every word a visitor reads is in
   * content.js, which has nothing else in it - so changing the bio never
   * means opening a 380-line file full of Three.js, and a stray character in
   * the prose cannot break the zone machinery.
   *
   * Position, colour and the fallback label come from islandLayout.js, so
   * moving or recolouring an island updates its marker automatically.
   */
  createZones() {
    const fromIsland = (id) => {
      const island = getIsland(id)
      if (!island) {
        console.warn(
          `[Zones] No island called "${id}" in islandLayout.js - ` +
          `this marker will land at the world origin.`
        )
        return { x: 0, z: 0 }
      }
      return {
        x: island.x,
        z: island.z,
        color: island.accent,
        title: island.name || id.toUpperCase()
      }
    }

    const zoneConfigs = ZONE_CONTENT.map(entry => ({
      id: entry.island,
      ...fromIsland(entry.island),
      radius: 10,
      content: { title: entry.title, body: entry.body }
    }))

    for (const config of zoneConfigs) {
      this.zones.push(new Zone(config))
    }
  }

  update(delta) {
    const vehicle = this.game.vehicle
    if (!vehicle) return

    this.elapsed = (this.elapsed || 0) + delta

    const env = this.game.environment
    const nightFactor = env ? env.nightFactor : 0

    const playerPos = vehicle.getPosition()
    let newActiveZone = null

    // Check which zone the player is in
    for (const zone of this.zones) {
      const isInside = zone.checkPlayerInside(playerPos)
      zone.setActive(isInside)
      zone.animate(this.elapsed, nightFactor)

      if (isInside) {
        newActiveZone = zone
      }
    }

    // Update UI if zone changed
    if (newActiveZone !== this.activeZone) {
      this.activeZone = newActiveZone

      if (this.game.ui) {
        if (newActiveZone) {
          this.game.ui.showZonePanel(newActiveZone.content)
        } else {
          this.game.ui.hideZonePanel()
        }
      }
    }
  }

  getActiveZone() {
    return this.activeZone
  }
}
