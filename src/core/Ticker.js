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

    // Calculate delta time (in seconds).
    //
    // Clamped at BOTH ends. The cap at 100ms was always here - it stops a slow
    // frame teleporting everything - but nothing stopped delta going NEGATIVE,
    // and it can: requestAnimationFrame hands you the timestamp of the start
    // of the frame, which is earlier than the performance.now() captured in
    // start(), so the very first tick runs backwards.
    //
    // A negative delta does not merely pause things, it runs them in reverse,
    // and anything decaying toward zero grows instead. The one that shows is
    // the lightning flash: `flash = max(0, flash - delta * 4.5)` climbs rather
    // than falls, and flash feeds the fog density. Measured in a headless
    // browser it reached 114 on a CLEAR morning with no lightning anywhere,
    // putting fog density at 0.093 against the 0.0018 it is meant to sit at -
    // dense enough to white out anything past about thirty units.
    const raw = (currentTime - this.lastTime) / 1000
    this.delta = Math.min(Math.max(raw, 0), 0.1)
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
