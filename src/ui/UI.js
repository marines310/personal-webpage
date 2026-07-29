import { Game } from '../core/Game.js'
import { getMapExtent, islandOutline } from '../world/islandLayout.js'

/**
 * UI - Manages HTML UI overlays
 */
export class UI {
  constructor() {
    this.game = Game.getInstance()

    // Get DOM elements
    this.zonePanel = document.getElementById('zone-panel')
    this.zoneTitle = document.getElementById('zone-title')
    this.zoneBody = document.getElementById('zone-body')
    this.minimapCanvas = document.getElementById('minimap-canvas')
    this.speedValue = document.querySelector('#speedometer .speed-value')
    this.clockEl = document.getElementById('cond-clock')
    this.weatherEl = document.getElementById('cond-weather')
    this.skyIconEl = document.getElementById('cond-sky-icon')

    // Cached once - the map doesn't change at runtime
    this.mapExtent = getMapExtent()

    // Initialize minimap
    this.setupMinimap()
  }

  setupMinimap() {
    if (!this.minimapCanvas) return

    this.minimapCanvas.width = 150
    this.minimapCanvas.height = 150
    this.minimapCtx = this.minimapCanvas.getContext('2d')
  }

  update(delta) {
    this.updateMinimap()
    this.updateSpeedometer()
    this.updateConditions()
  }

  /** Clock + weather readout. */
  updateConditions() {
    const env = this.game.environment
    if (!env || !this.clockEl) return

    this.clockEl.textContent = env.getClock()

    const weather = env.getWeatherLabel()
    if (this.weatherEl.textContent !== weather) {
      this.weatherEl.textContent = weather
    }

    // Icon reflects weather first, falling back to sun/moon
    const icons = {
      Clear: env.isNight() ? '☽' : '☀',
      Breezy: '☴',
      Cloudy: '☁',
      Showers: '☔',
      Storm: '⚡'
    }
    const icon = icons[weather] || (env.isNight() ? '☽' : '☀')
    if (this.skyIconEl.textContent !== icon) {
      this.skyIconEl.textContent = icon
    }
  }

  updateSpeedometer() {
    if (!this.speedValue) return

    const vehicle = this.game.vehicle
    if (!vehicle) return

    // Convert world units/sec into a plausible-looking MPH readout.
    // Top speed (15) reads ~60, boosted (24) reads ~96.
    const speed = Math.abs(vehicle.currentSpeed) * 4
    this.speedValue.textContent = Math.round(speed)
  }

  updateMinimap() {
    if (!this.minimapCtx) return

    const ctx = this.minimapCtx
    const width = this.minimapCanvas.width
    const height = this.minimapCanvas.height

    // Auto-fit whatever layout the map file describes
    const scale = (width / 2) / this.mapExtent

    // Sea
    ctx.fillStyle = 'rgba(14, 78, 104, 0.9)'
    ctx.fillRect(0, 0, width, height)

    // Center of minimap
    const centerX = width / 2
    const centerY = height / 2

    // Islands and bridges, drawn from the same map data the world uses
    const world = this.game.world
    if (world && world.layout) {
      const { islands, bridges } = world.layout

      // Bridges first, so island discs sit on top of the joins
      ctx.strokeStyle = 'rgba(230, 226, 214, 0.6)'
      ctx.lineWidth = 2
      for (const bridge of bridges) {
        ctx.beginPath()
        ctx.moveTo(centerX + bridge.from.x * scale, centerY + bridge.from.z * scale)
        ctx.lineTo(centerX + bridge.to.x * scale, centerY + bridge.to.z * scale)
        ctx.stroke()
      }

      // Draw each island's real outline, not an approximating circle
      ctx.fillStyle = 'rgba(198, 178, 126, 0.95)'
      for (const island of islands) {
        const outline = islandOutline(island)
        ctx.beginPath()
        for (let i = 0; i < outline.length; i++) {
          const px = centerX + (island.x + outline[i].x) * scale
          const py = centerY + (island.z + outline[i].z) * scale
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.closePath()
        ctx.fill()
      }
    }

    // Draw zones
    const zoneManager = this.game.zoneManager
    if (zoneManager) {
      for (const zone of zoneManager.zones) {
        const x = centerX + zone.position.x * scale
        const y = centerY + zone.position.z * scale
        const hex = `#${zone.color.toString(16).padStart(6, '0')}`

        ctx.beginPath()
        ctx.arc(x, y, Math.max(3, zone.radius * scale * 0.55), 0, Math.PI * 2)
        ctx.fillStyle = zone.isActive ? hex : 'rgba(255, 255, 255, 0.35)'
        ctx.fill()

        if (zone.isActive) {
          ctx.strokeStyle = hex
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(x, y, Math.max(6, zone.radius * scale * 0.9), 0, Math.PI * 2)
          ctx.stroke()
        }
      }
    }

    // Draw vehicle
    const vehicle = this.game.vehicle
    if (vehicle && vehicle.mesh) {
      const vx = centerX + vehicle.mesh.position.x * scale
      const vy = centerY + vehicle.mesh.position.z * scale

      // Vehicle direction
      ctx.save()
      ctx.translate(vx, vy)
      ctx.rotate(vehicle.mesh.rotation.y)

      // Draw as triangle pointing forward
      ctx.beginPath()
      ctx.moveTo(0, -6)
      ctx.lineTo(-4, 4)
      ctx.lineTo(4, 4)
      ctx.closePath()
      ctx.fillStyle = '#00f0ff'
      ctx.fill()

      ctx.restore()
    }

    // Border
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)'
    ctx.lineWidth = 2
    ctx.strokeRect(0, 0, width, height)
  }

  showZonePanel(content) {
    if (!this.zonePanel || !content) return

    this.zoneTitle.textContent = content.title || ''
    this.zoneBody.innerHTML = content.body || ''

    this.zonePanel.classList.remove('hidden')
  }

  hideZonePanel() {
    if (!this.zonePanel) return

    this.zonePanel.classList.add('hidden')
  }
}
