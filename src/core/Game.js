import * as THREE from 'three'
import { Ticker } from './Ticker.js'
import { Renderer } from '../systems/Renderer.js'
import { Physics } from '../systems/Physics.js'
import { Inputs } from '../systems/Inputs.js'
import { Camera } from '../systems/Camera.js'
import { Assets } from '../systems/Assets.js'
import { Environment } from '../systems/Environment.js'
import { World } from '../world/World.js'
import { VehicleSelector } from '../ui/VehicleSelector.js'
import { Vehicle } from '../world/Vehicle.js'
import { ZoneManager } from '../world/ZoneManager.js'
import { MODEL_MANIFEST } from '../world/modelManifest.js'
import { UI } from '../ui/UI.js'

/**
 * Game - Main orchestrator class (Singleton pattern)
 * Inspired by Bruno Simon's architecture
 */
export class Game {
  static instance = null

  static getInstance() {
    return Game.instance
  }

  constructor() {
    if (Game.instance) {
      return Game.instance
    }
    Game.instance = this

    // Core properties
    this.canvas = document.getElementById('canvas')
    this.scene = new THREE.Scene()
    // Fallback colour only - the Environment's sky dome covers this.
    // Kept daylight-blue so there's no dark flash on first frame.
    this.scene.background = new THREE.Color(0x8fcbe8)

    // Systems will be initialized async
    this.ticker = null
    this.renderer = null
    this.physics = null
    this.inputs = null
    this.camera = null
    this.assets = null
    this.environment = null
    this.world = null
    this.vehicle = null
    this.zoneManager = null
    this.ui = null

    // State
    this.isReady = false
  }

  async init() {
    console.log('Game: Initializing...')

    // Show loading
    this.updateLoadingProgress(10)

    // 1. Create ticker (game loop)
    this.ticker = new Ticker()
    this.updateLoadingProgress(20)

    // 2. Initialize physics (async - loads WASM)
    this.physics = new Physics()
    await this.physics.init()
    this.updateLoadingProgress(40)

    // 3. Create renderer
    this.renderer = new Renderer(this.canvas)
    this.updateLoadingProgress(50)

    // 4. Create camera
    this.camera = new Camera()
    this.updateLoadingProgress(55)

    // 5. Create input system
    this.inputs = new Inputs()
    this.updateLoadingProgress(58)

    // 5b. Load 3D models. Missing files fall back to built-in shapes,
    //     so this never blocks the game from starting.
    this.assets = new Assets()
    await this.assets.loadAll(MODEL_MANIFEST, (fraction) => {
      this.updateLoadingProgress(58 + fraction * 22) // 58% -> 80%
    })

    // 6. Create sky, sun and weather, then the world itself.
    //    Environment must exist first - World reads wind from it.
    this.environment = new Environment()
    this.updateLoadingProgress(72)

    this.world = new World()
    this.updateLoadingProgress(85)

    // 7. Create vehicle
    this.vehicle = new Vehicle()

    // The picker. Shown once the world exists, with the vehicle parked in the
    // garage - see VehicleSelector, where the preview IS the vehicle.
    this.vehicleSelector = new VehicleSelector()
    this.updateLoadingProgress(92)

    // 8. Create zone manager
    this.zoneManager = new ZoneManager()
    this.updateLoadingProgress(96)

    // 9. Create UI
    this.ui = new UI()
    this.updateLoadingProgress(100)

    // Set up tick events in order (like Bruno's architecture)
    this.setupTickEvents()

    // Hide loading screen, then ask what they want to drive.
    setTimeout(() => {
      document.getElementById('loading').classList.add('hidden')
      this.vehicleSelector.show()
    }, 500)

    this.isReady = true
    console.log('Game: Ready!')

    // Start the game loop
    this.ticker.start()
  }

  setupTickEvents() {
    // Order matters! Lower numbers run first
    // 0-10: Input & pre-physics
    this.ticker.on('tick', (delta) => this.inputs.update(delta), 0)
    this.ticker.on('tick', (delta) => this.vehicleSelector.update(delta), 0)
    this.ticker.on('tick', (delta) => this.vehicle.prePhysicsUpdate(delta), 1)

    // 10-20: Physics
    this.ticker.on('tick', (delta) => this.physics.update(delta), 10)

    // 20-30: Post-physics updates
    this.ticker.on('tick', (delta) => this.vehicle.postPhysicsUpdate(delta), 20)
    this.ticker.on('tick', (delta) => this.zoneManager.update(delta), 25)

    // 27-29: Environment then world animation. Environment runs first so
    // the world sways with the wind value from this same frame.
    this.ticker.on('tick', (delta) => this.environment.update(delta), 27)
    this.ticker.on('tick', (delta) => this.world.update(delta), 28)

    // 30-40: Camera
    this.ticker.on('tick', (delta) => this.camera.update(delta), 30)

    // 50: UI
    this.ticker.on('tick', (delta) => this.ui.update(delta), 50)

    // 100: Render (always last)
    this.ticker.on('tick', () => this.render(), 100)
  }

  render() {
    this.renderer.render(this.scene, this.camera.instance)
  }

  updateLoadingProgress(percent) {
    const progressBar = document.querySelector('.loading-progress')
    if (progressBar) {
      progressBar.style.width = `${percent}%`
    }
  }

  // Utility to add objects to scene
  add(object) {
    this.scene.add(object)
  }

  remove(object) {
    this.scene.remove(object)
  }
}
