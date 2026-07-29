import * as THREE from 'three'

/**
 * Renderer - WebGL renderer with responsive sizing
 */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas

    // Create renderer
    this.instance = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    })

    // Configure
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.instance.setSize(window.innerWidth, window.innerHeight)
    this.instance.shadowMap.enabled = true
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap
    this.instance.toneMapping = THREE.ACESFilmicToneMapping
    this.instance.toneMappingExposure = 1

    // Handle resize
    window.addEventListener('resize', () => this.resize())
  }

  resize() {
    this.instance.setSize(window.innerWidth, window.innerHeight)
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  }

  render(scene, camera) {
    this.instance.render(scene, camera)
  }
}
