import * as THREE from 'three'
import { Game } from '../core/Game.js'

/**
 * Environment - sky, sun, day/night cycle and weather.
 *
 * TIME
 * ----
 * The sun travels a full circle once per `dayLength`. Its elevation is
 * sin(2*PI*t), so it is above the horizon for exactly half the cycle.
 * With the default 600s that's 5 minutes of daylight followed by 5
 * minutes of night, as requested.
 *
 *   t = 0.00  sunrise      t = 0.25  noon
 *   t = 0.50  sunset       t = 0.75  midnight
 *
 * WEATHER
 * -------
 * A small state machine picks a new condition every 45-90 seconds and
 * eases into it over several seconds, so nothing ever snaps.
 */

// ---------------------------------------------------------------
// TUNING
// ---------------------------------------------------------------
export const SKY = {
  dayTop: 0x2e7fd0,
  dayBottom: 0xa8dcf0,

  duskTop: 0x1f2f66,
  duskBottom: 0xff9b57,

  nightTop: 0x040718,
  nightBottom: 0x101a3d,

  sunDay: 0xfff4d6,
  sunDusk: 0xff8a3c,
  moon: 0x9fb6ff
}

export const WEATHER_TYPES = {
  clear:  { label: 'Clear',   cloud: 0.06, rain: 0.0, wind: 0.15, fogMul: 1.0, lightMul: 1.0,  lightning: false },
  breezy: { label: 'Breezy',  cloud: 0.22, rain: 0.0, wind: 0.65, fogMul: 1.1, lightMul: 0.97, lightning: false },
  cloudy: { label: 'Cloudy',  cloud: 0.62, rain: 0.0, wind: 0.35, fogMul: 1.4, lightMul: 0.72, lightning: false },
  showers:{ label: 'Showers', cloud: 0.78, rain: 0.5, wind: 0.5,  fogMul: 1.9, lightMul: 0.58, lightning: false },
  storm:  { label: 'Storm',   cloud: 1.0,  rain: 1.0, wind: 1.0,  fogMul: 2.7, lightMul: 0.4,  lightning: true }
}

// Which conditions can follow which - keeps sequences plausible
// (you never jump straight from clear skies to a thunderstorm)
const WEATHER_CHAIN = {
  clear:   ['breezy', 'breezy', 'cloudy', 'clear'],
  breezy:  ['clear', 'cloudy', 'clear', 'showers'],
  cloudy:  ['breezy', 'showers', 'clear', 'showers'],
  showers: ['cloudy', 'storm', 'breezy', 'cloudy'],
  storm:   ['showers', 'showers', 'cloudy']
}

const RAIN_COUNT = 4200
const RAIN_AREA = 90      // box around the camera that rain occupies
const RAIN_HEIGHT = 55

export class Environment {
  constructor() {
    this.game = Game.getInstance()

    // --- Time ---
    this.dayLength = 600      // seconds for a full 24h cycle
    this.time = 0.14          // start mid-morning, in daylight
    this.paused = false

    // --- Derived each frame ---
    this.sunDirection = new THREE.Vector3(0, 1, 0)
    this.dayFactor = 1        // 1 = full day, 0 = full night
    this.nightFactor = 0
    this.horizonFactor = 0    // 1 when the sun sits near the horizon

    // --- Weather ---
    this.weather = 'clear'
    this.weatherTimer = 0
    this.weatherDuration = 50
    this.current = { ...WEATHER_TYPES.clear }   // eased values
    this.target = { ...WEATHER_TYPES.clear }
    this.windAngle = Math.random() * Math.PI * 2
    this.windVector = new THREE.Vector3(1, 0, 0)

    // --- Lightning ---
    this.flash = 0
    this.nextStrike = 6

    // Scratch colours
    this._top = new THREE.Color()
    this._bottom = new THREE.Color()
    this._sunCol = new THREE.Color()
    this._fogCol = new THREE.Color()

    this.buildSky()
    this.buildLights()
    this.buildStars()
    this.buildClouds()
    this.buildRain()

    // Apply once so frame zero already looks right
    this.update(0)
  }

  // -------------------------------------------------------------
  // Sky dome
  // -------------------------------------------------------------
  buildSky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color(SKY.dayTop) },
      uBottom: { value: new THREE.Color(SKY.dayBottom) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(SKY.sunDay) },
      uSunPower: { value: 1 },
      uCloud: { value: 0 },
      uFlash: { value: 0 }
    }

    const material = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform float uSunPower;
        uniform float uCloud;
        uniform float uFlash;
        varying vec3 vDir;

        // Cheap value noise for soft cloud banding
        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                     mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
        }
        float fbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise(p);
            p *= 2.0;
            a *= 0.5;
          }
          return v;
        }

        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);

          vec3 col = mix(uBottom, uTop, pow(h, 0.75));

          // Sun disc plus surrounding haze
          float d = max(dot(dir, uSunDir), 0.0);
          col += uSunColor * pow(d, 340.0) * 1.6 * uSunPower;
          col += uSunColor * pow(d, 7.0) * 0.30 * uSunPower;

          // Overcast: grey the sky out and add drifting bands
          if (uCloud > 0.01 && dir.y > -0.05) {
            float band = fbm(dir.xz / max(dir.y + 0.25, 0.12) * 1.6);
            float cover = smoothstep(0.42, 0.75, band) * uCloud;
            vec3 cloudCol = mix(vec3(0.86, 0.88, 0.92), vec3(0.24, 0.25, 0.30), uCloud);
            cloudCol *= 0.35 + 0.65 * uSunPower;
            col = mix(col, cloudCol, cover * 0.85);
          }

          col += vec3(uFlash);

          gl_FragColor = vec4(col, 1.0);
        }
      `
    })

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(480, 32, 20), material)
    this.sky.frustumCulled = false
    this.game.add(this.sky)
  }

  // -------------------------------------------------------------
  // Lights
  // -------------------------------------------------------------
  buildLights() {
    // Sun - the main shadow caster
    this.sun = new THREE.DirectionalLight(SKY.sunDay, 2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.width = 2048
    this.sun.shadow.mapSize.height = 2048
    this.sun.shadow.camera.near = 10
    this.sun.shadow.camera.far = 420
    this.sun.shadow.camera.left = -120
    this.sun.shadow.camera.right = 120
    this.sun.shadow.camera.top = 120
    this.sun.shadow.camera.bottom = -120
    this.sun.shadow.bias = -0.0006
    this.game.add(this.sun)
    this.game.add(this.sun.target)

    // Moon - dim, cool, opposite the sun. No shadows (too costly for
    // the payoff, and double shadows look wrong).
    this.moon = new THREE.DirectionalLight(SKY.moon, 0)
    this.game.add(this.moon)

    // Sky/ground bounce
    this.hemi = new THREE.HemisphereLight(0x9fd8f0, 0x5a6b3f, 0.7)
    this.game.add(this.hemi)

    this.ambient = new THREE.AmbientLight(0xffffff, 0.35)
    this.game.add(this.ambient)

    // Visible sun disc that sits on the sky dome
    this.sunDisc = new THREE.Mesh(
      new THREE.SphereGeometry(9, 16, 12),
      new THREE.MeshBasicMaterial({ color: SKY.sunDay, fog: false })
    )
    this.sunDisc.frustumCulled = false
    this.game.add(this.sunDisc)

    this.moonDisc = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xdfe7ff, fog: false })
    )
    this.moonDisc.frustumCulled = false
    this.game.add(this.moonDisc)

    // Fog matches the horizon colour so distant islands dissolve into it
    this.game.scene.fog = new THREE.FogExp2(SKY.dayBottom, 0.0035)
  }

  // -------------------------------------------------------------
  // Stars (only visible at night)
  // -------------------------------------------------------------
  buildStars() {
    const count = 1100
    const positions = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.random() * Math.PI * 0.46
      const r = 430
      positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r
      positions[i * 3 + 1] = Math.cos(phi) * r * 0.85 + 15
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

    this.starMaterial = new THREE.PointsMaterial({
      color: 0xdce9ff,
      size: 1.7,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false
    })

    this.stars = new THREE.Points(geometry, this.starMaterial)
    this.stars.frustumCulled = false
    this.game.add(this.stars)
  }

  // -------------------------------------------------------------
  // Drifting cloud puffs (parallax on top of the sky shader)
  // -------------------------------------------------------------
  buildClouds() {
    this.clouds = new THREE.Group()
    this.cloudMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      metalness: 0,
      transparent: true,
      opacity: 0,
      flatShading: true,
      depthWrite: false,
      fog: false
    })

    for (let i = 0; i < 16; i++) {
      const puff = new THREE.Group()
      const lumps = 3 + Math.floor(Math.random() * 3)

      for (let j = 0; j < lumps; j++) {
        const r = 6 + Math.random() * 7
        const lump = new THREE.Mesh(
          new THREE.IcosahedronGeometry(r, 0),
          this.cloudMaterial
        )
        lump.position.set(
          (Math.random() - 0.5) * 22,
          (Math.random() - 0.5) * 4,
          (Math.random() - 0.5) * 14
        )
        lump.scale.y = 0.5
        puff.add(lump)
      }

      const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.3
      const dist = 120 + Math.random() * 130
      puff.position.set(
        Math.cos(angle) * dist,
        62 + Math.random() * 30,
        Math.sin(angle) * dist
      )
      this.clouds.add(puff)
    }

    this.game.add(this.clouds)
  }

  // -------------------------------------------------------------
  // Rain - drawn as short line segments so drops read as streaks
  // -------------------------------------------------------------
  buildRain() {
    this.rainPositions = new Float32Array(RAIN_COUNT * 3)
    this.rainSpeeds = new Float32Array(RAIN_COUNT)

    for (let i = 0; i < RAIN_COUNT; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * RAIN_AREA
      this.rainPositions[i * 3 + 1] = Math.random() * RAIN_HEIGHT
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA
      this.rainSpeeds[i] = 28 + Math.random() * 22
    }

    // Two vertices per drop (top and bottom of the streak)
    this.rainVertices = new Float32Array(RAIN_COUNT * 6)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.rainVertices, 3))
    geometry.setDrawRange(0, 0)

    this.rainMaterial = new THREE.LineBasicMaterial({
      color: 0xbfd8e8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true
    })

    this.rain = new THREE.LineSegments(geometry, this.rainMaterial)
    this.rain.frustumCulled = false
    this.game.add(this.rain)
  }

  // -------------------------------------------------------------
  // Main update
  // -------------------------------------------------------------
  update(delta) {
    if (!this.paused) {
      this.time = (this.time + delta / this.dayLength) % 1
    }

    this.updateSun()
    this.updateWeather(delta)
    this.updateSky()
    this.updateLights()
    this.updateClouds(delta)
    this.updateRain(delta)

    // Let the rest of the game react to the time of day
    if (this.game.world && this.game.world.setTimeOfDay) {
      this.game.world.setTimeOfDay(this.dayFactor, this.nightFactor)
    }
  }

  updateSun() {
    const angle = this.time * Math.PI * 2

    // Elevation is sin(angle): positive for exactly half the cycle.
    // The Z term tilts the arc so the sun doesn't pass straight overhead.
    this.sunDirection.set(Math.cos(angle), Math.sin(angle), 0.32).normalize()

    const y = this.sunDirection.y

    // Smooth dawn/dusk rather than a hard switch at the horizon
    this.dayFactor = THREE.MathUtils.clamp((y + 0.10) / 0.34, 0, 1)
    this.nightFactor = 1 - this.dayFactor

    // Peaks when the sun is close to the horizon - drives the warm tint
    this.horizonFactor =
      THREE.MathUtils.clamp(1 - Math.abs(y) / 0.30, 0, 1) * this.dayFactor
  }

  updateWeather(delta) {
    this.weatherTimer += delta

    if (this.weatherTimer >= this.weatherDuration) {
      this.weatherTimer = 0
      this.weatherDuration = 45 + Math.random() * 45

      const options = WEATHER_CHAIN[this.weather] || ['clear']
      this.weather = options[Math.floor(Math.random() * options.length)]
      this.target = WEATHER_TYPES[this.weather]
    }

    // Ease toward the target over roughly 8 seconds
    const k = 1 - Math.exp(-delta * 0.13)
    for (const key of ['cloud', 'rain', 'wind', 'fogMul', 'lightMul']) {
      this.current[key] += (this.target[key] - this.current[key]) * k
    }
    this.current.label = this.target.label
    this.current.lightning = this.target.lightning

    // Wind slowly changes direction
    this.windAngle += delta * 0.05
    const strength = this.current.wind
    this.windVector.set(
      Math.cos(this.windAngle) * strength,
      0,
      Math.sin(this.windAngle) * strength
    )

    this.updateLightning(delta)
  }

  updateLightning(delta) {
    // Decay any active flash
    this.flash = Math.max(0, this.flash - delta * 4.5)

    if (!this.current.lightning || this.current.rain < 0.7) return

    this.nextStrike -= delta
    if (this.nextStrike <= 0) {
      this.flash = 0.55 + Math.random() * 0.35
      this.nextStrike = 4 + Math.random() * 11
    }
  }

  updateSky() {
    // Blend night -> day, then push toward sunset colours near the horizon
    this._top
      .setHex(SKY.nightTop)
      .lerp(new THREE.Color(SKY.dayTop), this.dayFactor)
      .lerp(new THREE.Color(SKY.duskTop), this.horizonFactor * 0.75)

    this._bottom
      .setHex(SKY.nightBottom)
      .lerp(new THREE.Color(SKY.dayBottom), this.dayFactor)
      .lerp(new THREE.Color(SKY.duskBottom), this.horizonFactor * 0.85)

    // Overcast desaturates and darkens everything
    const grey = new THREE.Color(0x7d8592).multiplyScalar(0.35 + 0.65 * this.dayFactor)
    this._top.lerp(grey, this.current.cloud * 0.5)
    this._bottom.lerp(grey, this.current.cloud * 0.4)

    this.skyUniforms.uTop.value.copy(this._top)
    this.skyUniforms.uBottom.value.copy(this._bottom)
    this.skyUniforms.uSunDir.value.copy(this.sunDirection)
    this.skyUniforms.uSunPower.value = this.dayFactor * (1 - this.current.cloud * 0.8)
    this.skyUniforms.uCloud.value = this.current.cloud
    this.skyUniforms.uFlash.value = this.flash * 0.8

    this._sunCol
      .setHex(SKY.sunDay)
      .lerp(new THREE.Color(SKY.sunDusk), this.horizonFactor)
    this.skyUniforms.uSunColor.value.copy(this._sunCol)

    // Fog takes the horizon colour so distant geometry melts into the sky
    this._fogCol.copy(this._bottom)
    const fog = this.game.scene.fog
    if (fog) {
      fog.color.copy(this._fogCol)
      const base = 0.0032 + this.nightFactor * 0.0016
      fog.density = base * this.current.fogMul + this.flash * 0.0008
    }

    // Renderer exposure dips at night so neon and windows read properly
    const renderer = this.game.renderer
    if (renderer && renderer.instance) {
      renderer.instance.toneMappingExposure =
        0.72 + this.dayFactor * 0.38 + this.flash * 0.25
    }
  }

  updateLights() {
    const dim = this.current.lightMul

    // --- Sun ---
    const sunStrength = Math.max(0, this.sunDirection.y)
    this.sun.intensity = sunStrength * 2.5 * dim
    this.sun.color.copy(this._sunCol)
    this.sun.visible = this.sun.intensity > 0.01

    // Keep the shadow camera near the car so its resolution isn't wasted
    const focus = this.game.vehicle ? this.game.vehicle.mesh.position : new THREE.Vector3()
    this.sun.target.position.copy(focus)
    this.sun.position.copy(focus).addScaledVector(this.sunDirection, 150)
    this.sunDisc.position.copy(focus).addScaledVector(this.sunDirection, 430)
    this.sunDisc.material.color.copy(this._sunCol)
    this.sunDisc.visible = this.sunDirection.y > -0.12

    // --- Moon (opposite the sun) ---
    const moonUp = Math.max(0, -this.sunDirection.y)
    this.moon.intensity = moonUp * 0.55 * dim
    this.moon.position.copy(focus).addScaledVector(this.sunDirection, -150)
    this.moonDisc.position.copy(focus).addScaledVector(this.sunDirection, -430)
    this.moonDisc.visible = moonUp > 0.05
    this.moonDisc.material.opacity = moonUp

    // --- Ambient / hemisphere ---
    const flashBoost = this.flash * 1.6

    this.hemi.intensity = (0.15 + this.dayFactor * 0.75) * dim + flashBoost
    this.hemi.color.copy(this._bottom)
    this.hemi.groundColor.setHex(this.nightFactor > 0.5 ? 0x1a2033 : 0x6b7a4a)

    this.ambient.intensity = (0.16 + this.dayFactor * 0.34) * dim + flashBoost * 0.6
    this.ambient.color.copy(this._top).lerp(new THREE.Color(0xffffff), 0.5)

    // Stars fade in after dusk, and hide behind cloud cover
    this.starMaterial.opacity =
      Math.pow(this.nightFactor, 1.6) * (1 - this.current.cloud * 0.9)
  }

  updateClouds(delta) {
    this.cloudMaterial.opacity = Math.min(0.92, this.current.cloud * 1.15)
    this.cloudMaterial.color
      .setHex(0xffffff)
      .lerp(new THREE.Color(0x5b6270), this.current.cloud * 0.65)
      .multiplyScalar(0.4 + 0.6 * this.dayFactor + this.flash)

    this.clouds.visible = this.cloudMaterial.opacity > 0.02
    if (!this.clouds.visible) return

    // Drift with the wind, wrapping around the play area
    const drift = 2.5 + this.current.wind * 9
    for (const puff of this.clouds.children) {
      puff.position.x += this.windVector.x * drift * delta
      puff.position.z += this.windVector.z * drift * delta

      const limit = 270
      if (puff.position.x > limit) puff.position.x = -limit
      if (puff.position.x < -limit) puff.position.x = limit
      if (puff.position.z > limit) puff.position.z = -limit
      if (puff.position.z < -limit) puff.position.z = limit
    }
  }

  updateRain(delta) {
    const amount = this.current.rain

    this.rainMaterial.opacity = amount * 0.55
    this.rain.visible = amount > 0.02

    if (!this.rain.visible) {
      this.rain.geometry.setDrawRange(0, 0)
      return
    }

    // Only simulate the share of drops the current weather calls for
    const active = Math.floor(RAIN_COUNT * amount)

    // Rain follows the camera so it's always around the player
    const centre = this.game.vehicle
      ? this.game.vehicle.mesh.position
      : new THREE.Vector3()

    const windX = this.windVector.x * 16
    const windZ = this.windVector.z * 16
    const half = RAIN_AREA / 2

    for (let i = 0; i < active; i++) {
      const i3 = i * 3
      const fall = this.rainSpeeds[i]

      this.rainPositions[i3] += windX * delta
      this.rainPositions[i3 + 1] -= fall * delta
      this.rainPositions[i3 + 2] += windZ * delta

      // Recycle drops relative to the car's position
      let x = this.rainPositions[i3]
      let y = this.rainPositions[i3 + 1]
      let z = this.rainPositions[i3 + 2]

      if (y < -12) {
        y = RAIN_HEIGHT
        x = (Math.random() - 0.5) * RAIN_AREA
        z = (Math.random() - 0.5) * RAIN_AREA
      }
      if (x > half) x -= RAIN_AREA
      if (x < -half) x += RAIN_AREA
      if (z > half) z -= RAIN_AREA
      if (z < -half) z += RAIN_AREA

      this.rainPositions[i3] = x
      this.rainPositions[i3 + 1] = y
      this.rainPositions[i3 + 2] = z

      // Streak points along the drop's actual travel direction
      const len = 0.9 + fall * 0.032
      const dx = (windX / fall) * len
      const dz = (windZ / fall) * len

      const v = i * 6
      this.rainVertices[v] = centre.x + x
      this.rainVertices[v + 1] = centre.y + y
      this.rainVertices[v + 2] = centre.z + z
      this.rainVertices[v + 3] = centre.x + x - dx
      this.rainVertices[v + 4] = centre.y + y + len
      this.rainVertices[v + 5] = centre.z + z - dz
    }

    this.rain.geometry.setDrawRange(0, active * 2)
    this.rain.geometry.attributes.position.needsUpdate = true
  }

  // -------------------------------------------------------------
  // Helpers for the UI
  // -------------------------------------------------------------

  /** Clock time as HH:MM. t=0 is sunrise, which we call 06:00. */
  getClock() {
    const hours24 = (this.time * 24 + 6) % 24
    const h = Math.floor(hours24)
    const m = Math.floor((hours24 - h) * 60)
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  getWeatherLabel() {
    return this.current.label || 'Clear'
  }

  isNight() {
    return this.nightFactor > 0.5
  }

  /** Sideways sway offset for foliage, driven by wind strength. */
  getSway(elapsed, phase = 0) {
    const w = this.current.wind
    return Math.sin(elapsed * (1.2 + w * 2.2) + phase) * w * 0.16
  }
}
