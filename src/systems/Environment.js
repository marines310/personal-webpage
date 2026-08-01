import * as THREE from 'three'
import { Game } from '../core/Game.js'
import {
  SEASON_ORDER, seasonView, seasonAt, phaseForSeason, easeView
} from './seasons.js'
import {
  HOLIDAYS, holidayAt, holidayLayer, emptyLayer, easeLayer,
  newFireworksState, stepFireworks, shellView, sparkOffset,
  SPARKS, CLIMB_SECONDS, BURST_SECONDS
} from './holidays.js'

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
 *
 * SEASONS
 * -------
 * One season per day, so the year is four days long and turns while you
 * watch. The maths is in seasons.js, which has no THREE in it and can
 * therefore be run by a test; this file only turns the numbers into light,
 * particles and a call to World.setSeason().
 *
 * Two things follow the season rather than the weather: what colour the world
 * is, and whether rain falls as snow. The second is a substitution in the
 * chain, not a second chain - `showers` in winter IS `snowing`.
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

/**
 * `flake` is how much of the falling precipitation is snow rather than rain.
 * It rides along with `rain` instead of replacing it so that there is one
 * precipitation amount and one particle budget: `rain * (1 - flake)` streaks
 * down as water and `rain * flake` drifts down as snow. Halfway between the
 * two - which is what you get for a few seconds while it eases - is sleet,
 * and sleet is a real thing rather than a glitch.
 */
export const WEATHER_TYPES = {
  clear:  { label: 'Clear',   cloud: 0.06, rain: 0.0, wind: 0.15, fogMul: 1.0, lightMul: 1.0,  flake: 0, lightning: false },
  breezy: { label: 'Breezy',  cloud: 0.22, rain: 0.0, wind: 0.65, fogMul: 1.1, lightMul: 0.97, flake: 0, lightning: false },
  cloudy: { label: 'Cloudy',  cloud: 0.62, rain: 0.0, wind: 0.35, fogMul: 1.4, lightMul: 0.72, flake: 0, lightning: false },
  showers:{ label: 'Showers', cloud: 0.78, rain: 0.5, wind: 0.5,  fogMul: 1.9, lightMul: 0.58, flake: 0, lightning: false },
  storm:  { label: 'Storm',   cloud: 1.0,  rain: 1.0, wind: 1.0,  fogMul: 2.7, lightMul: 0.4,  flake: 0, lightning: true },

  // Snow. Thicker than showers to look at because falling snow hides distance
  // far better than rain does, but gentler on the light - an overcast snowy
  // day is bright, not dark, which is why lightMul is above showers'.
  snowing:{ label: 'Snowing', cloud: 0.82, rain: 0.62, wind: 0.3, fogMul: 2.3, lightMul: 0.78, flake: 1, lightning: false }
}

// Which conditions can follow which - keeps sequences plausible
// (you never jump straight from clear skies to a thunderstorm)
//
// `snowing` is NOT reachable from here. It is what `showers` and `storm`
// become when it is cold enough - see chill() - so the chain stays one chain
// and the season decides what falls out of the cloud. Adding a second, winter
// chain would be two lists to keep in step, which is rule 1.
const WEATHER_CHAIN = {
  clear:   ['breezy', 'breezy', 'cloudy', 'clear'],
  breezy:  ['clear', 'cloudy', 'clear', 'showers'],
  cloudy:  ['breezy', 'showers', 'clear', 'showers'],
  showers: ['cloudy', 'storm', 'breezy', 'cloudy'],
  storm:   ['showers', 'showers', 'cloudy'],
  snowing: ['cloudy', 'breezy', 'cloudy', 'showers']
}

/** What a wet condition turns into when the season is cold. */
export const COLD_FORM = { showers: 'snowing', storm: 'snowing' }

const RAIN_COUNT = 4200
const RAIN_AREA = 90      // box around the camera that rain occupies
const RAIN_HEIGHT = 55

// Snowflakes and falling leaves are the same field of drifting specks with
// different weight, size and colour, so they are one system. They can be,
// because the season that drops leaves and the season that drops snow are
// different seasons - a fact the tests check rather than assume.
const DRIFT_COUNT = 3000
const DRIFT_AREA = 80
const DRIFT_HEIGHT = 40

/**
 * `share` is what fraction of the field this kind puts up at full strength.
 *
 * Snow fills the air; leaves do not. Leaves at the same density as snow read
 * as confetti - which is exactly what the first pass looked like - because
 * there is no wind-blown sheet of falling leaves in nature, only the odd one
 * coming down. Density is the count, not the opacity: half-transparent leaves
 * look like a rendering fault, so they stay solid and there are simply fewer.
 */
/**
 * How many shells can be in the sky at once.
 *
 * At the full launch rate a shell lives 3.7 seconds, so about five are up at
 * any moment; sixteen is headroom for the buffer, not a target.
 */
const FIREWORK_SHELLS = 16

const DRIFT_KINDS = {
  snow: { size: 0.24, fall: 3.2, flutter: 0.9, share: 1,
          colours: [0xffffff, 0xeef4ff, 0xdfeaf6] },
  leaf: { size: 0.40, fall: 2.2, flutter: 1.8, share: 0.16,
          colours: [0xd2762c, 0xc2452c, 0xd9a03a, 0x9c6b2f] }
}

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

    // --- Seasons ---
    //
    // One season per day. Starting at the top of summer is not arbitrary:
    // summer applies no tint at all, so frame zero of a new session looks
    // exactly like the world did before seasons existed, and anything that
    // has gone wrong with them is visibly a change rather than the default.
    this.yearLength = this.dayLength * SEASON_ORDER.length
    this.seasonPhase = phaseForSeason('summer')
    this.seasonLocked = false
    this.seasonTarget = seasonView(this.seasonPhase)
    this.season = seasonView(this.seasonPhase)   // a separate object, not an alias

    // --- Holidays ---
    //
    // A LAYER over the season, on the same year phase. `holidayPick` is null
    // when the calendar is in charge and a key when you have chosen one; it
    // is deliberately not a "holidayLocked" boolean like the season's,
    // because there is a real difference between "no holiday, follow the
    // calendar" and "None, and mean it" - one of them shows you Christmas in
    // December and the other never shows you anything.
    this.holidayPick = null
    this.holiday = emptyLayer()
    this.fireworks = newFireworksState()

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
    this.buildDrift()
    this.buildFireworks()

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

          // Haze around the sun, and ONLY the haze.
          //
          // There used to be a pow(d, 340.0) term here as well, drawing a
          // hard disc - and there is already a sphere mesh out at 430 units
          // doing exactly that. The two subtended different angles, so what
          // you saw was two concentric rings. The mesh keeps the disc,
          // because it also gets the right colour at sunset; this keeps the
          // glow, which a mesh can't do.
          float d = max(dot(dir, uSunDir), 0.0);
          col += uSunColor * pow(d, 8.0) * 0.34 * uSunPower;
          col += uSunColor * pow(d, 90.0) * 0.45 * uSunPower;

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

    // Fog matches the horizon colour so distant islands dissolve into it.
    //
    // Density is tied to how big the world is. At the old 0.0035 anything
    // past about 250 units was gone, which was fine when the whole map was
    // 340 across and is not now it is nearly 800: you would drive off a
    // bridge into grey and have no idea an island was ahead. At 0.0018 a
    // neighbouring island is a quarter hidden and the far side of the map
    // is still a shape on the horizon.
    this.game.scene.fog = new THREE.FogExp2(SKY.dayBottom, 0.0018)
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
  // Snow and falling leaves
  //
  // One field of drifting specks, following the camera the way the rain
  // does. Which of the two it is showing is decided by whichever of the two
  // amounts is larger, and they are never both up at once because leaves are
  // an autumn thing and snow is a winter thing.
  //
  // Colours are per-vertex and are rewritten only when the kind changes -
  // once or twice a year - rather than every frame.
  // -------------------------------------------------------------
  buildDrift() {
    this.driftPositions = new Float32Array(DRIFT_COUNT * 3)
    this.driftColours = new Float32Array(DRIFT_COUNT * 3)
    this.driftSpeeds = new Float32Array(DRIFT_COUNT)
    this.driftPhase = new Float32Array(DRIFT_COUNT)
    this.driftPick = new Uint8Array(DRIFT_COUNT)   // which colour of the kind

    for (let i = 0; i < DRIFT_COUNT; i++) {
      this.driftPositions[i * 3] = (Math.random() - 0.5) * DRIFT_AREA
      this.driftPositions[i * 3 + 1] = Math.random() * DRIFT_HEIGHT
      this.driftPositions[i * 3 + 2] = (Math.random() - 0.5) * DRIFT_AREA
      this.driftSpeeds[i] = 0.6 + Math.random() * 0.8    // a multiplier on the kind's fall
      this.driftPhase[i] = Math.random() * Math.PI * 2
      this.driftPick[i] = Math.floor(Math.random() * 3)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(this.driftPositions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(this.driftColours, 3))
    geometry.setDrawRange(0, 0)

    this.driftMaterial = new THREE.PointsMaterial({
      size: DRIFT_KINDS.snow.size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: true
    })

    this.drift = new THREE.Points(geometry, this.driftMaterial)
    this.drift.frustumCulled = false
    this.driftKind = null
    this.setDriftKind('snow')
    this.game.add(this.drift)
  }

  setDriftKind(kind) {
    if (this.driftKind === kind) return
    this.driftKind = kind

    const spec = DRIFT_KINDS[kind]
    const colours = spec.colours.map(hex => new THREE.Color(hex))
    for (let i = 0; i < DRIFT_COUNT; i++) {
      const c = colours[this.driftPick[i] % colours.length]
      this.driftColours[i * 3] = c.r
      this.driftColours[i * 3 + 1] = c.g
      this.driftColours[i * 3 + 2] = c.b
    }
    this.driftMaterial.size = spec.size
    this.drift.geometry.attributes.color.needsUpdate = true
  }

  updateDrift(delta) {
    // Snow falls when the weather says so; leaves fall because it is autumn,
    // whatever the weather is doing.
    const snowing = this.current.rain * this.current.flake
    const leafing = this.season.leaves

    const amount = Math.max(snowing, leafing)
    // Solid once there is anything at all - see the note on DRIFT_KINDS.
    this.driftMaterial.opacity = Math.min(0.92, amount * 6)
    this.drift.visible = amount > 0.02

    if (!this.drift.visible) {
      this.drift.geometry.setDrawRange(0, 0)
      return
    }

    this.setDriftKind(snowing >= leafing ? 'snow' : 'leaf')
    const spec = DRIFT_KINDS[this.driftKind]

    const active = Math.floor(DRIFT_COUNT * Math.min(1, amount) * spec.share)
    const centre = this.game.vehicle
      ? this.game.vehicle.mesh.position
      : new THREE.Vector3()

    // Everything light is blown about far more than rain is
    const windX = this.windVector.x * 9
    const windZ = this.windVector.z * 9
    const half = DRIFT_AREA / 2
    this._driftTime = (this._driftTime || 0) + delta

    for (let i = 0; i < active; i++) {
      const i3 = i * 3
      const t = this._driftTime + this.driftPhase[i]
      const flutter = spec.flutter

      let x = this.driftPositions[i3] +
              (windX + Math.sin(t * 1.7) * flutter) * delta
      let y = this.driftPositions[i3 + 1] - spec.fall * this.driftSpeeds[i] * delta
      let z = this.driftPositions[i3 + 2] +
              (windZ + Math.cos(t * 1.3) * flutter) * delta

      // Recycled at the ground rather than well below it: unlike a raindrop,
      // a flake is big enough to see landing, and settling at -12 would have
      // them vanish into the road a dozen units under your wheels.
      if (y < -3) {
        y = DRIFT_HEIGHT
        x = (Math.random() - 0.5) * DRIFT_AREA
        z = (Math.random() - 0.5) * DRIFT_AREA
      }
      if (x > half) x -= DRIFT_AREA
      if (x < -half) x += DRIFT_AREA
      if (z > half) z -= DRIFT_AREA
      if (z < -half) z += DRIFT_AREA

      this.driftPositions[i3] = x
      this.driftPositions[i3 + 1] = y
      this.driftPositions[i3 + 2] = z
    }

    // Drawn about the car, like the rain. The buffer holds offsets so the
    // field wraps in its own frame; the mesh carries the world position.
    this.drift.position.set(centre.x, centre.y, centre.z)
    this.drift.geometry.setDrawRange(0, active)
    this.drift.geometry.attributes.position.needsUpdate = true
  }

  // -------------------------------------------------------------
  // The year
  // -------------------------------------------------------------
  updateSeason(delta) {
    if (!this.paused && !this.seasonLocked) {
      this.seasonPhase = (this.seasonPhase + delta / this.yearLength) % 1
    }

    this.seasonTarget = seasonView(this.seasonPhase)

    // Settled snow answers to the weather as well as to the calendar, so a
    // flurry in a mild season dusts the ground and then melts off it again.
    // Folded into the TARGET rather than added to the eased value afterwards,
    // so there is still exactly one thing easing snow and it settles and
    // melts at the rates seasons.js gives it - whichever brought the snow.
    const fromWeather = this.current.rain * this.current.flake * 0.7
    this.seasonTarget.snow = Math.max(this.seasonTarget.snow, fromWeather)

    easeView(this.season, this.seasonTarget, delta)

    if (this.game.world && this.game.world.setSeason) {
      this.game.world.setSeason(this.season)
    }
  }

  // -------------------------------------------------------------
  // The holidays
  // -------------------------------------------------------------
  /**
   * The decorations, on the same clock as the season and applied after it.
   *
   * After, and never instead: a holiday adds props and lights and has no
   * opinion at all about the colour of the grass. That ordering is what lets
   * Christmas keep winter's snow, and holidays.js makes it structural by not
   * having a key for anything a season owns.
   */
  updateHoliday(delta) {
    const target = holidayLayer(this.seasonPhase, this.holidayPick)
    easeLayer(this.holiday, target, delta)

    if (this.game.world && this.game.world.setHolidayLayer) {
      this.game.world.setHolidayLayer(this.holiday)
    }

    this.updateFireworks(delta)
  }

  /**
   * Fireworks: one Points cloud for every shell in the sky at once.
   *
   * A single buffer rather than an object per shell, for the same reason the
   * rain and the drift are single buffers - a burst is forty-two sparks, a
   * busy sky is a dozen shells, and five hundred separate meshes appearing
   * and disappearing every few seconds would cost more in allocation than in
   * drawing. The draw range is moved instead, and nothing is ever created
   * after the first frame.
   */
  buildFireworks() {
    const max = FIREWORK_SHELLS * (SPARKS + 1)
    this.fireworkPositions = new Float32Array(max * 3)
    this.fireworkColours = new Float32Array(max * 3)

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(this.fireworkPositions, 3))
    geometry.setAttribute('color',
      new THREE.BufferAttribute(this.fireworkColours, 3))
    geometry.setDrawRange(0, 0)

    this.fireworkMaterial = new THREE.PointsMaterial({
      // A spark is a world-space size here, and these are a hundred-odd units
      // away. At 1.5 - which is a sensible size for a snowflake beside the
      // car - a burst came out about six pixels across and the sky at New
      // Year was indistinguishable from any other night sky. Sparks are also
      // the one thing in this world allowed to be bigger than they are: a
      // real one is a millimetre of burning metal and reads as a bright dot
      // only because it is a bright dot.
      size: 2.4,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: false,
      // Added rather than blended: sparks are light, and light on a night sky
      // adds. Blended normally they come out as grey confetti, which is what
      // the first version looked like.
      blending: THREE.AdditiveBlending,
      // And no fog, or a shell four hundred units out over the water - which
      // is where they all are - is fogged down to nothing before it bursts.
      fog: false
    })

    this.fireworksPoints = new THREE.Points(geometry, this.fireworkMaterial)
    this.fireworksPoints.frustumCulled = false
    this.game.add(this.fireworksPoints)
  }

  updateFireworks(delta) {
    if (!this.fireworksPoints) return

    const centre = this.game.vehicle && this.game.vehicle.mesh
      ? this.game.vehicle.mesh.position
      : { x: 0, z: 0 }

    stepFireworks(this.fireworks, delta, {
      intensity: this.holiday.fireworks,
      night: this.nightFactor,
      x: centre.x,
      z: centre.z,
      rand: Math.random
    })

    const pos = this.fireworkPositions
    const col = this.fireworkColours
    const c = this._fireworkColour || (this._fireworkColour = new THREE.Color())
    let n = 0

    for (const shell of this.fireworks.shells) {
      const view = shellView(shell)
      c.setHex(shell.colour)

      if (view.phase === 'climb') {
        // One point going up. The trail is the shell itself dimming as it
        // rises - see shellView - rather than a queue of stored positions,
        // which would be a second history to keep in step with nothing.
        pos[n * 3] = shell.x
        pos[n * 3 + 1] = view.y
        pos[n * 3 + 2] = shell.z
        col[n * 3] = c.r * view.brightness
        col[n * 3 + 1] = c.g * view.brightness
        col[n * 3 + 2] = c.b * view.brightness
        n++
        continue
      }

      for (let i = 0; i < SPARKS; i++) {
        const o = sparkOffset(i, SPARKS, view.spread)
        pos[n * 3] = shell.x + o.x
        pos[n * 3 + 1] = view.y + o.y
        pos[n * 3 + 2] = shell.z + o.z
        col[n * 3] = c.r * view.fade
        col[n * 3 + 1] = c.g * view.fade
        col[n * 3 + 2] = c.b * view.fade
        n++
      }
    }

    this.fireworksPoints.geometry.setDrawRange(0, n)
    this.fireworksPoints.geometry.attributes.position.needsUpdate = true
    this.fireworksPoints.geometry.attributes.color.needsUpdate = true
    this.fireworksPoints.visible = n > 0
  }

  // -------------------------------------------------------------
  // Picking a holiday by hand
  // -------------------------------------------------------------
  /**
   * Choose a holiday, or pass null to hand it back to the calendar.
   *
   * A chosen holiday applies in full whatever the date is, which is what
   * picking one off a menu has to mean - the alternative is choosing
   * Christmas in June and being shown a tenth of it.
   */
  setHoliday(key) {
    if (key === null || key === 'auto') { this.holidayPick = null; return this }
    if (!HOLIDAYS[key]) return this
    this.holidayPick = key
    return this
  }

  /** Which holiday is up, whether it was chosen or the calendar arrived at it. */
  getHoliday() {
    return this.holidayPick || holidayAt(this.seasonPhase).key
  }

  getHolidayLabel() {
    return HOLIDAYS[this.getHoliday()].label
  }

  // -------------------------------------------------------------
  // Main update
  // -------------------------------------------------------------
  update(delta) {
    // `timeLocked` is set when you scrub the clock by hand. The sun still
    // moves through all the same code - only the clock stops advancing - so a
    // hand-set time behaves exactly like a time the cycle arrived at.
    if (!this.paused && !this.timeLocked) {
      this.time = (this.time + delta / this.dayLength) % 1
    }

    this.updateSun()
    this.updateWeather(delta)
    // After the weather, because settled snow depends on what is falling.
    this.updateSeason(delta)
    // And after the season, because a holiday is a layer over one.
    this.updateHoliday(delta)
    this.updateSky()
    this.updateLights()
    this.updateClouds(delta)
    this.updateRain(delta)
    this.updateDrift(delta)

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

    // Held on whatever you picked. The easing below still runs, so a change
    // you make by hand arrives over the same eight seconds as one the chain
    // decided on - it doesn't snap.
    if (this.weatherLocked) {
      this.easeWeather(delta)
      return
    }

    if (this.weatherTimer >= this.weatherDuration) {
      this.weatherTimer = 0
      this.weatherDuration = 45 + Math.random() * 45

      const options = WEATHER_CHAIN[this.weather] || ['clear']
      this.weather = this.chill(options[Math.floor(Math.random() * options.length)])
      this.target = WEATHER_TYPES[this.weather]
    }

    this.easeWeather(delta)

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

  /**
   * What a condition becomes at this point in the year.
   *
   * Wet conditions turn to snow when it is cold enough, and nothing else is
   * touched. Deep winter (chill 1) always converts; late autumn (chill 0.15)
   * converts about one time in seven, which is what a first snowfall looks
   * like. Everything you can pick by hand stays exactly what you picked -
   * this only ever runs on the chain's choice.
   */
  chill(key) {
    const cold = this.season ? this.season.chill : 0
    const colder = COLD_FORM[key]
    if (!colder || cold <= 0) return key
    return Math.random() < cold ? colder : key
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
      const base = 0.0016 + this.nightFactor * 0.0009
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
    this.moon.intensity = moonUp * 0.85 * dim
    this.moon.position.copy(focus).addScaledVector(this.sunDirection, -150)
    this.moonDisc.position.copy(focus).addScaledVector(this.sunDirection, -430)
    this.moonDisc.visible = moonUp > 0.05
    this.moonDisc.material.opacity = moonUp

    // --- Ambient / hemisphere ---
    const flashBoost = this.flash * 1.6

    // Night floor lifted from 0.15: the towns were unreadable after dark,
    // and emissive materials glow without lighting anything around them.
    this.hemi.intensity = (0.30 + this.dayFactor * 0.60) * dim + flashBoost
    this.hemi.color.copy(this._bottom)
    this.hemi.groundColor.setHex(this.nightFactor > 0.5 ? 0x1a2033 : 0x6b7a4a)

    this.ambient.intensity = (0.30 + this.dayFactor * 0.26) * dim + flashBoost * 0.6
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
    // Only the liquid share. The rest is falling as snow, in updateDrift.
    const amount = this.current.rain * (1 - this.current.flake)

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
    // Rounded to the nearest minute, then carried, rather than truncated.
    //
    // Truncating meant asking the panel for 19:45 and being shown 19:44: the
    // clock goes through a fraction of a day and comes back as 19.7499999, and
    // floor() of that is a minute early. Only visible once you could type a
    // time in, but it was wrong before that too.
    const hours24 = (this.time * 24 + 6) % 24
    let h = Math.floor(hours24)
    let m = Math.round((hours24 - h) * 60)
    if (m >= 60) { m -= 60; h = (h + 1) % 24 }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }

  getWeatherLabel() {
    return this.current.label || 'Clear'
  }

  /** Which season it is now - the name the HUD shows. */
  getSeasonLabel() {
    return (this.season && this.season.label) || 'Summer'
  }

  /** Which season the calendar is in, as a key. */
  getSeason() {
    return seasonAt(this.seasonPhase).name
  }

  // -------------------------------------------------------------
  // Manual control
  //
  // The HUD box top-left opens onto these. The principle throughout: nothing
  // here bypasses the normal path. Setting the clock moves `time`, which the
  // same sun, sky, light and fog code reads; picking weather sets the same
  // `target` the automatic chain would have set, and it eases in over the
  // same eight seconds. So a hand-set world is indistinguishable from one the
  // cycle arrived at, and there is no second code path to keep in step.
  // -------------------------------------------------------------

  /**
   * Set the clock, in hours (0-24). Fractions are minutes.
   *
   * getClock() reads `hours24 = (time * 24 + 6) % 24`, so the six-hour offset
   * has to be undone here. Derived from that expression rather than written
   * out again - the two have to agree, and if the offset ever changes this
   * follows it.
   */
  setClock(hours) {
    this.time = (((hours - 6) / 24) % 1 + 1) % 1
    this.timeLocked = true
    this.updateSun()
    return this
  }

  /** Which hour the clock is showing, as a number. The inverse of setClock. */
  getHours() {
    return (this.time * 24 + 6) % 24
  }

  /** Pick the weather. One of the keys of WEATHER_TYPES. */
  setWeather(key) {
    if (!WEATHER_TYPES[key]) return this
    this.weather = key
    this.target = WEATHER_TYPES[key]
    this.weatherTimer = 0
    this.weatherLocked = true
    return this
  }

  /**
   * Pick a season. One of the keys of SEASONS.
   *
   * Moves the calendar to the START of that season, where it is purely
   * itself rather than partway into the next - and then holds it. As with
   * the clock and the weather, this is the same value the calendar would
   * have reached on its own, so everything downstream sees a season it
   * cannot tell you chose. The look eases in over a few seconds because the
   * easing is on the far side of the phase, not on the setting of it.
   */
  setSeason(key) {
    const phase = phaseForSeason(key)
    if (phase === null) return this
    this.seasonPhase = phase
    this.seasonLocked = true
    return this
  }

  /** Hand all three back to the automatic cycle. */
  resumeAuto() {
    this.timeLocked = false
    this.weatherLocked = false
    this.seasonLocked = false
    this.holidayPick = null
    this.weatherTimer = 0
    this.weatherDuration = 20
    return this
  }

  /** Is anything being held by hand? The HUD says so when it is. */
  isManual() {
    return !!(this.timeLocked || this.weatherLocked || this.seasonLocked ||
              this.holidayPick)
  }

  /** Ease the eased values toward the target. Shared by both paths. */
  easeWeather(delta) {
    const k = 1 - Math.exp(-delta * 0.13)
    for (const key of ['cloud', 'rain', 'wind', 'fogMul', 'lightMul', 'flake']) {
      this.current[key] += (this.target[key] - this.current[key]) * k
    }
    this.current.label = this.target.label
    this.current.lightning = this.target.lightning
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
