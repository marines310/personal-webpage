import { Game } from '../core/Game.js'
import { getMapExtent, islandOutline } from '../world/islandLayout.js'
import { missionArrow, formatDistance } from '../world/missions.js'

/**
 * Give the keyboard back to the car after you touch a panel.
 *
 * Clicking a button leaves it FOCUSED. That was doing two bad things at once:
 * the browser drew a focus ring round the whole conditions box, and tapping
 * space to brake re-pressed whichever button you had clicked last.
 *
 * The first attempt at the second problem was to stop key events propagating
 * out of the panel - which fixed the double-press and created something far
 * worse. Inputs listens on the WINDOW, so swallowing the event inside the
 * panel meant W, A, S and D never reached the car at all: click the weather
 * box once and you were stuck in it, exactly as Mike found. That is what
 * suppressing a symptom buys you.
 *
 * Blurring removes the cause instead. Nothing is focused, so nothing can be
 * re-pressed, and every key goes where it always went. `Inputs.onKeyDown` has
 * a second, wider version of the same rule for anything that gets focus some
 * other way.
 */
function releaseFocusAfterClicks(element) {
  if (!element) return
  // On mouseup rather than click: a click fires after the button has already
  // taken focus and, for a range slider, only when the drag ends. Mouseup is
  // the moment the pointer is finished with it either way.
  element.addEventListener('mouseup', () => {
    if (document.activeElement && element.contains(document.activeElement)) {
      document.activeElement.blur()
    }
  })
}

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
    this.seasonEl = document.getElementById('cond-season')
    this.skyIconEl = document.getElementById('cond-sky-icon')

    this.conditionsEl = document.getElementById('conditions')
    this.condPanel = document.getElementById('cond-panel')
    this.condToggle = document.getElementById('cond-toggle')
    this.hourSlider = document.getElementById('cond-hour')
    this.hourValue = document.getElementById('cond-hour-value')

    this.missionEl = document.getElementById('mission')
    this.missionTitle = document.getElementById('mission-title')
    this.missionBar = document.getElementById('mission-bar')
    this.missionBarLabel = document.getElementById('mission-bar-label')
    this.missionFill = document.getElementById('mission-bar-fill')
    this.missionArrow = document.getElementById('mission-arrow')
    this.missionArrowPoint = document.getElementById('mission-arrow-point')
    this.missionArrowDistance = document.getElementById('mission-arrow-distance')

    this.cameraEl = document.getElementById('camera-box')
    this.camPanel = document.getElementById('cam-panel')
    this.camToggle = document.getElementById('cam-toggle')
    this.camState = document.getElementById('cam-state')

    // Cached once - the map doesn't change at runtime
    this.mapExtent = getMapExtent()

    // Initialize minimap
    this.setupMinimap()
    this.setupConditions()
    this.setupCamera()
  }

  /**
   * The camera box.
   *
   * Every button here calls the same method the keyboard shortcut calls, so
   * there is nothing the panel can do that a key cannot and no second idea of
   * what "save" means. The panel exists because the shortcuts are not
   * discoverable, not because it does anything extra.
   */
  setupCamera() {
    if (!this.camToggle || !this.camPanel) return

    const cam = () => this.game.camera

    this.camToggle.addEventListener('click', () => {
      const open = this.camPanel.classList.toggle('hidden') === false
      this.camToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
    })

    document.getElementById('cam-save').addEventListener('click', () => {
      if (cam()) cam().savePose()
    })

    document.getElementById('cam-recentre').addEventListener('click', () => {
      if (cam()) cam().snapBehind()
    })

    document.getElementById('cam-default').addEventListener('click', () => {
      if (cam()) { cam().resetPose(); cam().snapBehind() }
    })

    releaseFocusAfterClicks(this.cameraEl)
  }

  /**
   * The time and weather box, which opens onto controls for both.
   *
   * Everything here goes through Environment's own setters, which move the
   * same `time` and `target` the automatic cycle moves. There is deliberately
   * no second path: a hand-set sunset runs through the same sun, sky, fog and
   * light code as one the cycle arrived at.
   */
  setupConditions() {
    if (!this.condToggle || !this.condPanel) return

    const env = () => this.game.environment

    this.condToggle.addEventListener('click', () => {
      const open = this.condPanel.classList.toggle('hidden') === false
      this.condToggle.setAttribute('aria-expanded', open ? 'true' : 'false')
      if (open) this.syncConditionPanel()
    })

    // The slider is in MINUTES, not hours. At hour granularity you can't find
    // the few minutes either side of sunrise where the light is worth looking
    // at, which is most of the reason to have this at all.
    this.hourSlider.addEventListener('input', () => {
      const minutes = Number(this.hourSlider.value)
      env().setClock(minutes / 60)
      this.hourValue.textContent = formatMinutes(minutes)
      this.markWeatherButtons()
    })

    for (const button of this.condPanel.querySelectorAll('#cond-presets button')) {
      button.addEventListener('click', () => {
        const hour = Number(button.dataset.hour)
        env().setClock(hour)
        this.hourSlider.value = String(Math.round(hour * 60))
        this.hourValue.textContent = formatMinutes(hour * 60)
      })
    }

    for (const button of this.condPanel.querySelectorAll('#cond-weathers button')) {
      button.addEventListener('click', () => {
        env().setWeather(button.dataset.weather)
        this.markWeatherButtons()
      })
    }

    // Same shape as the weather buttons, and for the same reason: setSeason
    // moves the calendar to where that season starts, which is a place the
    // calendar would have reached on its own.
    for (const button of this.condPanel.querySelectorAll('#cond-seasons button')) {
      button.addEventListener('click', () => {
        env().setSeason(button.dataset.season)
        this.markWeatherButtons()
      })
    }

    // The holidays. Note what these do NOT do: touch the season. Picking
    // Christmas leaves the season exactly where it was, which is the whole
    // design - a holiday is a layer over the year rather than another season,
    // so choosing Christmas in winter gives you decorations AND the snow.
    for (const button of this.condPanel.querySelectorAll('#cond-holidays button')) {
      button.addEventListener('click', () => {
        env().setHoliday(button.dataset.holiday)
        this.markWeatherButtons()
      })
    }

    document.getElementById('cond-auto').addEventListener('click', () => {
      env().resumeAuto()
      this.markWeatherButtons()
    })

    releaseFocusAfterClicks(this.conditionsEl)
  }

  /** Put the panel's controls where the world actually is. */
  syncConditionPanel() {
    const env = this.game.environment
    if (!env) return

    const minutes = Math.round(env.getHours() * 60)
    this.hourSlider.value = String(minutes)
    this.hourValue.textContent = formatMinutes(minutes)
    this.markWeatherButtons()
  }

  /** Light up whichever weather is current, if it was chosen by hand. */
  markWeatherButtons() {
    const env = this.game.environment
    if (!env) return

    for (const button of this.condPanel.querySelectorAll('#cond-weathers button')) {
      const mine = env.weatherLocked && button.dataset.weather === env.weather
      button.classList.toggle('on', mine)
    }

    const season = env.getSeason ? env.getSeason() : null
    for (const button of this.condPanel.querySelectorAll('#cond-seasons button')) {
      button.classList.toggle('on', !!env.seasonLocked && button.dataset.season === season)
    }

    // Lit only when it was CHOSEN. A holiday the calendar arrived at on its
    // own is not a setting you made, and lighting the button would make the
    // panel claim you had.
    for (const button of this.condPanel.querySelectorAll('#cond-holidays button')) {
      button.classList.toggle('on', button.dataset.holiday === env.holidayPick)
    }
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
    this.updateCamera()
    this.updateMission()
  }

  /** Clock, weather and season readout. */
  updateConditions() {
    const env = this.game.environment
    if (!env || !this.clockEl) return

    this.clockEl.textContent = env.getClock()

    const weather = env.getWeatherLabel()
    if (this.weatherEl.textContent !== weather) {
      this.weatherEl.textContent = weather
    }

    if (this.seasonEl) {
      const season = env.getSeasonLabel ? env.getSeasonLabel() : ''
      // The holiday joins the season rather than replacing it, on screen for
      // the same reason it does in the code: it is winter AND Christmas.
      const holiday = env.getHoliday && env.getHoliday() !== 'none'
        ? ` · ${env.getHolidayLabel()}`
        : ''
      const text = season + holiday
      if (this.seasonEl.textContent !== text) this.seasonEl.textContent = text
    }

    // Icon reflects weather first, falling back to sun/moon
    const icons = {
      Clear: env.isNight() ? '\u263d' : '\u2600',
      Breezy: '\u2634',
      Cloudy: '\u2601',
      Showers: '\u2614',
      Storm: '\u26a1',
      Snowing: '\u2744'
    }
    const icon = icons[weather] || (env.isNight() ? '\u263d' : '\u2600')
    if (this.skyIconEl.textContent !== icon) {
      this.skyIconEl.textContent = icon
    }

    // A quiet "held" under the readout while anything is set by hand, so a
    // stopped clock reads as deliberate rather than as a bug.
    if (this.conditionsEl) {
      this.conditionsEl.classList.toggle('manual', env.isManual())
    }

    // While the panel is open and the clock is still running, the slider
    // follows it. Not while you're dragging - that would fight you.
    if (this.condPanel && !this.condPanel.classList.contains('hidden') &&
        !env.timeLocked && document.activeElement !== this.hourSlider) {
      const minutes = Math.round(env.getHours() * 60)
      this.hourSlider.value = String(minutes)
      this.hourValue.textContent = formatMinutes(minutes)
    }
  }

  /**
   * What the camera box says about itself.
   *
   * Three states, and they are the three the camera actually has: the shipped
   * view, a view you saved, and a view you are looking through that is not
   * either. Only the last one gives you something worth pressing, so only the
   * last one is highlighted.
   */
  updateCamera() {
    const cam = this.game.camera
    if (!cam || !this.camState || !cam.isPoseSaved) return

    const settled = cam.isPoseSaved()
    const label = !settled ? 'unsaved' : (cam.isDefault() ? 'default' : 'saved')
    if (this.camState.textContent !== label) this.camState.textContent = label

    this.cameraEl.classList.toggle('unsaved', !settled)
    this.cameraEl.classList.toggle('is-default', cam.isDefault() && settled)
  }

  /**
   * The callout banner, its arrow and its bar.
   *
   * This method knows nothing about fires or pursuits. World hands it one
   * mission - already chosen between the games by chooseMission() - and it
   * draws whatever is in it. That is what lets the ambulance run arrive
   * without touching a line of this.
   */
  updateMission() {
    const world = this.game.world
    if (!this.missionEl || !world || !world.activeMission) return

    const mission = world.activeMission()
    const showing = !!mission && (!!mission.title || !!mission.target || mission.showBar)

    this.missionEl.classList.toggle('hidden', !showing)
    if (!showing) {
      // Cleared explicitly, not just hidden by its parent. It looked right
      // either way - all of this is inside #mission, so hiding the panel hides
      // it - but leaving the arrow's own state saying "visible, 270 metres"
      // and the banner still reading FIRE AT ABOUT is a bug waiting for the
      // day either one moves out of the panel. Measured, not imagined: with
      // the fire hidden because you are driving a bus, the panel's text still
      // said FIRE AT ABOUT · 300m behind it.
      this.updateMissionArrow(null)
      this.missionTitle.textContent = ''
      this.missionBar.classList.add('hidden')
      this.missionEl.classList.remove('on-station')
      return
    }

    const title = mission.title || ''
    if (this.missionTitle.textContent !== title) this.missionTitle.textContent = title
    this.missionTitle.style.display = title ? '' : 'none'

    this.updateMissionArrow(mission.target)

    this.missionBar.classList.toggle('hidden', !mission.showBar)
    if (mission.showBar) {
      if (this.missionBarLabel.textContent !== mission.barLabel) {
        this.missionBarLabel.textContent = mission.barLabel
      }
      this.missionFill.style.width = `${Math.round(mission.progress * 100)}%`
    }
    this.missionEl.classList.toggle('on-station', !!mission.good)
  }

  /**
   * The arrow, pointing at whatever is going on.
   *
   * Aimed from the CAMERA, not from the car. What "left" means on a screen is
   * decided by where the camera is looking, so an arrow aimed from the car
   * would swing about every time you looked over your shoulder while the
   * world stayed still.
   *
   * The angle arrives already in screen terms - see missionArrow(). The only
   * thing done to it here is the -90 degrees that turns a glyph which points
   * right at rest into one that points up.
   */
  updateMissionArrow(target) {
    if (!this.missionArrow) return

    const camera = this.game.camera
    const arrow = camera
      ? missionArrow(target, {
          x: camera.instance.position.x,
          z: camera.instance.position.z,
          yaw: camera.yaw
        })
      : { show: false }

    this.missionArrow.classList.toggle('hidden', !arrow.show)
    if (!arrow.show) {
      // The distance goes too, for the same reason the banner does: hidden is
      // not the same as cleared, and "300m" is a claim about something you are
      // no longer being shown.
      this.missionArrowDistance.textContent = ''
      return
    }

    const degrees = (arrow.angle * 180) / Math.PI - 90
    this.missionArrowPoint.style.transform = `rotate(${degrees.toFixed(1)}deg)`

    const shown = formatDistance(arrow.distance)
    if (this.missionArrowDistance.textContent !== shown) {
      this.missionArrowDistance.textContent = shown
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

      // The monorail, over the top of the land - which is where it is. A
      // dashed line, because at this size a solid one is indistinguishable
      // from a bridge, and the trains are the one thing moving out there
      // that the map couldn't otherwise explain.
      if (world.monorail) {
        const points = world.monorail.points
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        for (let i = 0; i < points.length; i++) {
          const px = centerX + points[i].x * scale
          const py = centerY + points[i].z * scale
          if (i === 0) ctx.moveTo(px, py)
          else ctx.lineTo(px, py)
        }
        ctx.stroke()
        ctx.setLineDash([])

        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
        for (const station of world.monorail.stations) {
          ctx.beginPath()
          ctx.arc(centerX + station.x * scale, centerY + station.z * scale,
                  1.6, 0, Math.PI * 2)
          ctx.fill()
        }
      }

      // Quays, drawn as a stub out from the coast. Small, but it's the only
      // way to know a port is over that side of the island before you drive
      // round looking for it.
      if (world.ports) {
        ctx.strokeStyle = 'rgba(240, 235, 220, 0.75)'
        ctx.lineWidth = 2
        for (const port of world.ports) {
          ctx.beginPath()
          ctx.moveTo(centerX + port.root.x * scale, centerY + port.root.z * scale)
          ctx.lineTo(centerX + port.head.x * scale, centerY + port.head.z * scale)
          ctx.stroke()
        }
      }

      // And the ships, so the sea reads as busy from the map too
      if (world.ships) {
        for (const ship of world.ships) {
          if (!ship.mesh) continue
          const x = centerX + ship.mesh.position.x * scale
          const y = centerY + ship.mesh.position.z * scale
          // Anything off the far side of the world is out of the fog and
          // shouldn't be on the map either
          if (x < -4 || y < -4 || x > width + 4 || y > height + 4) continue
          ctx.fillStyle = ship.kind === 'cargo'
            ? 'rgba(255, 210, 140, 0.95)' : 'rgba(210, 240, 255, 0.9)'
          ctx.beginPath()
          ctx.arc(x, y, ship.kind === 'cargo' ? 2 : 1.4, 0, Math.PI * 2)
          ctx.fill()
        }
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

/** Minutes since midnight as HH:MM. */
function formatMinutes(total) {
  const minutes = ((Math.round(total) % 1440) + 1440) % 1440
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
