/**
 * Ticker - Game loop with ordered event system
 * Inspired by Bruno Simon's architecture
 */
export class Ticker {
  constructor() {
    this.callbacks = new Map() // Map<order, Set<callback>>
    this.isRunning = false
    this.lastTime = 0
    this.elapsed = 0
    this.delta = 0

    // For consistent physics
    this.fixedDelta = 1 / 60 // 60fps target

    // Bind the tick function
    this.tick = this.tick.bind(this)
  }

  /**
   * Register a callback with a specific order
   * Lower order = runs first
   */
  on(event, callback, order = 50) {
    if (event !== 'tick') return

    if (!this.callbacks.has(order)) {
      this.callbacks.set(order, new Set())
    }
    this.callbacks.get(order).add(callback)
  }

  /**
   * Remove a callback
   */
  off(event, callback) {
    if (event !== 'tick') return

    for (const [order, callbacks] of this.callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.callbacks.delete(order)
      }
    }
  }

  /**
   * Start the game loop
   */
  start() {
    if (this.isRunning) return

    this.isRunning = true
    this.lastTime = performance.now()
    requestAnimationFrame(this.tick)
  }

  /**
   * Stop the game loop
   */
  stop() {
    this.isRunning = false
  }

  /**
   * Main tick function
   */
  tick(currentTime) {
    if (!this.isRunning) return

    // Calculate delta time (in seconds)
    this.delta = Math.min((currentTime - this.lastTime) / 1000, 0.1) // Cap at 100ms
    this.lastTime = currentTime
    this.elapsed += this.delta

    // Get sorted orders
    const orders = Array.from(this.callbacks.keys()).sort((a, b) => a - b)

    // Execute callbacks in order
    for (const order of orders) {
      const callbacks = this.callbacks.get(order)
      for (const callback of callbacks) {
        callback(this.delta, this.elapsed)
      }
    }

    // Continue loop
    requestAnimationFrame(this.tick)
  }

  /**
   * Utility: wait for N frames then call callback
   */
  wait(frames, callback) {
    let count = 0
    const waitCallback = () => {
      count++
      if (count >= frames) {
        this.off('tick', waitCallback)
        callback()
      }
    }
    this.on('tick', waitCallback, 999)
  }
}
