import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

/**
 * Assets - loads .glb/.gltf models before the game starts.
 *
 * Every entry in the manifest is OPTIONAL by design. If a file isn't
 * present (or fails to load) the game logs a note and carries on using
 * the procedural fallback shapes. That means the site always runs, and
 * you can drop models in one at a time and see each one appear.
 */
export class Assets {
  constructor() {
    // A loading manager lets us catch textures that fail to load. Many
    // model packs (Kenney's especially) keep their colours in a separate
    // image file rather than inside the .glb - miss that file and every
    // model silently renders plain white, which is horrible to debug.
    this.manager = new THREE.LoadingManager()
    this.textureErrors = []
    this.manager.onError = (url) => {
      if (/\.(png|jpe?g|webp|ktx2|basis)$/i.test(url)) {
        this.textureErrors.push(url)
      }
    }

    this.loader = new GLTFLoader(this.manager)
    this.models = new Map()  // key -> { scene, config }
    this.missing = []
    this.externalTextures = []
  }

  /**
   * Warn about anything that loaded but will look wrong.
   * Called once after everything has been attempted.
   */
  reportTextureProblems() {
    if (!this.textureErrors.length) return

    // Show each missing file once, with the folder it should live in
    const unique = [...new Set(this.textureErrors)]

    console.warn(
      `[Assets] ${unique.length} texture file(s) could not be loaded, so those ` +
      `models will appear plain white:\n  ` + unique.join('\n  ') +
      `\n\nThese models keep their colours in a separate image rather than ` +
      `inside the .glb. Copy the texture folder from the pack you downloaded ` +
      `into public/models/, keeping the same folder name, so the paths above ` +
      `resolve. See MODELS.md.`
    )
  }

  /**
   * Load everything in the manifest.
   * @param {Array} manifest entries: { key, url, scale, rotationY, yOffset }
   * @param {Function} onProgress called with 0..1
   */
  async loadAll(manifest, onProgress = () => {}) {
    if (!manifest || manifest.length === 0) {
      onProgress(1)
      return
    }

    let done = 0

    const tasks = manifest.map(async (entry) => {
      try {
        const gltf = await this.loadOne(entry.url)
        const scene = gltf.scene || gltf.scenes[0]

        this.prepare(scene, entry)
        this.models.set(entry.key, { scene, config: entry })
      } catch (err) {
        // Expected whenever a model simply hasn't been added yet
        this.missing.push(entry.key)
      } finally {
        done++
        onProgress(done / manifest.length)
      }
    })

    await Promise.all(tasks)

    if (this.missing.length) {
      console.info(
        `[Assets] Using built-in shapes for: ${this.missing.join(', ')}. ` +
        `Drop matching .glb files into public/models/ to replace them - see MODELS.md.`
      )
    }

    const loaded = manifest.length - this.missing.length
    if (loaded > 0) {
      console.info(`[Assets] Loaded ${loaded} model file(s).`)
    }

    // Textures resolve after the .glb itself, so give them a moment
    // to fail before reporting.
    setTimeout(() => this.reportTextureProblems(), 800)
  }

  loadOne(url) {
    return new Promise((resolve, reject) => {
      this.loader.load(url, resolve, undefined, reject)
    })
  }

  /**
   * Normalise a freshly loaded model: apply the manifest's scale/rotation,
   * optionally auto-fit it to a target length, and turn on shadows.
   */
  prepare(scene, entry) {
    // Shadows + material tweaks
    scene.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
        if (child.material) {
          child.material.side = THREE.FrontSide
        }
      }
    })

    // Auto-fit to a target size along Z if requested. Downloaded models
    // arrive at wildly different scales, so this saves a lot of guessing.
    if (entry.fitLength) {
      const box = new THREE.Box3().setFromObject(scene)
      const size = new THREE.Vector3()
      box.getSize(size)
      const longest = Math.max(size.x, size.z)
      if (longest > 0) {
        const factor = entry.fitLength / longest
        scene.scale.setScalar(factor)
      }
    } else if (entry.scale) {
      scene.scale.setScalar(entry.scale)
    }

    if (entry.rotationY) {
      scene.rotation.y = entry.rotationY
    }

    // Drop the model so its base sits on y=0
    if (entry.groundIt !== false) {
      const box = new THREE.Box3().setFromObject(scene)
      scene.position.y -= box.min.y
    }

    if (entry.yOffset) {
      scene.position.y += entry.yOffset
    }
  }

  has(key) {
    return this.models.has(key)
  }

  /**
   * Get a fresh copy of a model, safe to position independently.
   * Returns null if that model wasn't loaded.
   */
  clone(key) {
    const record = this.models.get(key)
    if (!record) return null

    const copy = record.scene.clone(true)
    copy.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })
    return copy
  }

  /** The original, for cases where you want to read its structure. */
  get(key) {
    const record = this.models.get(key)
    return record ? record.scene : null
  }
}
