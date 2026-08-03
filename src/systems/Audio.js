import { VOICES, mix, audible } from './audioMix.js'

/**
 * Audio - oscillators, filters and gain nodes, and no decisions.
 *
 * The counterpart to `audioMix.js`. Everything here is plumbing: build the
 * graph once, then every frame read the mix and move the numbers towards it.
 * If you find yourself writing an `if` in this file about how the world is,
 * it belongs in the mix instead - the same rule that keeps `World.js` free of
 * the traffic model.
 *
 * WHY THERE ARE NO SOUND FILES. Nothing is added to the deploy, nothing has to
 * be licensed, and there is no loader to get wrong - but mostly it is the same
 * principle as the rest of the world. The airport is a search rather than a
 * pair of coordinates; a siren is two numbers and a clock rather than a .mp3.
 *
 * THREE THINGS ABOUT BROWSERS worth knowing before touching this:
 *
 *  - **A page cannot make a sound until the visitor has done something.** So
 *    the AudioContext is built lazily, on the first call to `setEnabled(true)`,
 *    which can only happen from a click. Building it at start-up produces a
 *    context stuck in `suspended` and a graph that silently never plays.
 *  - **A gain set instantly clicks.** Every level goes through
 *    `setTargetAtTime`, which is a one-pole glide, not a step.
 *  - **One NaN kills the whole graph, permanently.** An `AudioParam` given a
 *    non-finite value throws, the frame's update aborts part-built, and every
 *    voice after it in the loop stays where it was. `audioMix.js` clamps
 *    everything and `tests/audio.mjs` checks it, and `safe()` below is the
 *    belt to that pair of braces.
 */

/** How quickly a level slides to its target. A car should not click gears. */
const GLIDE = 0.06

/** The siren glides more slowly, so the two-tone warbles rather than steps. */
const SIREN_GLIDE = 0.02

/** Seconds of silence before the context is suspended. */
const SLEEP_AFTER = 2

/** The swell: how fast the sea breathes, and how deep. */
const SWELL_HZ = 0.09
const SWELL_DEPTH = 0.35

export class Audio {
  constructor() {
    this.ctx = null
    this.enabled = false
    this.volume = 1
    this.nodes = null
    this.elapsed = 0
    this.quietFor = 0
    this.lastTick = false
    this.failed = false
  }

  /**
   * Build the context and the graph. Called from a user gesture, never before.
   *
   * Returns false and gives up permanently if the browser has no Web Audio -
   * a portfolio that fails to load because a museum-piece browser lacks an
   * oscillator would be a poor trade for an engine note.
   */
  start() {
    if (this.ctx || this.failed) return !!this.ctx

    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) { this.failed = true; return false }

    try {
      this.ctx = new Ctx()
      this.build()
      return true
    } catch (err) {
      this.failed = true
      this.ctx = null
      return false
    }
  }

  /**
   * One buffer of white noise, shared by every voice that needs any.
   *
   * Two seconds is long enough that the loop point is inaudible and short
   * enough to be a rounding error in memory. Four separate buffers was the
   * first version and there is no difference you can hear, because each voice
   * filters it into something else anyway.
   */
  noiseBuffer() {
    const seconds = 2
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * seconds,
                                         this.ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  /** A looping noise source through one filter and one gain. */
  noiseVoice(type, frequency, q = 1) {
    const source = this.ctx.createBufferSource()
    source.buffer = this.noise
    source.loop = true

    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.frequency.value = frequency
    filter.Q.value = q

    const gain = this.ctx.createGain()
    gain.gain.value = 0

    source.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    source.start()

    return { source, filter, gain }
  }

  build() {
    const ctx = this.ctx

    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    this.noise = this.noiseBuffer()

    // The engine: a sawtooth for the body of the note and a square an octave
    // down for the weight of it, detuned a few cents so the two beat against
    // each other. That beating is most of what stops a synthesised engine
    // sounding like a test tone.
    const body = ctx.createOscillator()
    body.type = 'sawtooth'
    body.frequency.value = 46

    const sub = ctx.createOscillator()
    sub.type = 'square'
    sub.frequency.value = 23
    sub.detune.value = -8

    const engineFilter = ctx.createBiquadFilter()
    engineFilter.type = 'lowpass'
    engineFilter.frequency.value = 900
    engineFilter.Q.value = 0.7

    const engineGain = ctx.createGain()
    engineGain.gain.value = 0

    const buzzGain = ctx.createGain()
    buzzGain.gain.value = 0

    body.connect(engineFilter)
    sub.connect(buzzGain)
    buzzGain.connect(engineFilter)
    engineFilter.connect(engineGain)
    engineGain.connect(this.master)
    body.start()
    sub.start()

    // The siren: a triangle, which is the closest a single oscillator gets to
    // an electronic two-tone without a wavetable.
    const siren = ctx.createOscillator()
    siren.type = 'triangle'
    siren.frequency.value = 620

    const sirenGain = ctx.createGain()
    sirenGain.gain.value = 0
    siren.connect(sirenGain)
    sirenGain.connect(this.master)
    siren.start()

    this.nodes = {
      engine: { body, sub, filter: engineFilter, gain: engineGain, buzz: buzzGain },
      siren: { osc: siren, gain: sirenGain },
      road: this.noiseVoice('lowpass', 500, 0.8),
      wind: this.noiseVoice('bandpass', 700, 0.6),
      // The sea is noise with almost everything taken off the top: what you
      // hear from a beach is the low half of it, and leaving the hiss in makes
      // it rain instead.
      sea: this.noiseVoice('lowpass', 420, 0.5),
      rain: this.noiseVoice('highpass', 1100, 0.4)
    }
  }

  /** Turn it on or off. The first `true` is what builds the context. */
  setEnabled(on) {
    this.enabled = !!on
    if (this.enabled && !this.start()) return false
    if (this.ctx && this.enabled && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.enabled
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, Number(v) || 0))
  }

  /** Never hand an AudioParam something it can throw on. */
  ramp(param, value, glide = GLIDE) {
    const target = Number(value)
    if (!Number.isFinite(target)) return
    param.setTargetAtTime(target, this.ctx.currentTime, glide)
  }

  /**
   * One frame.
   *
   * `state` is whatever the game knows; `mix()` turns it into levels. Nothing
   * in here asks what the world is doing.
   */
  update(delta, state) {
    if (!this.ctx || !this.nodes || this.failed) return

    this.elapsed += delta
    const m = mix({ ...state, enabled: this.enabled, volume: this.volume })

    this.ramp(this.master.gain, m.master)

    const engine = this.nodes.engine
    this.ramp(engine.body.frequency, m.engine.hz)
    this.ramp(engine.sub.frequency, m.engine.hz / 2)
    this.ramp(engine.gain.gain, m.engine.gain)
    this.ramp(engine.buzz.gain, m.engine.buzz * 0.5)
    // The note opens up as it climbs, the way an engine does under load.
    this.ramp(engine.filter.frequency, 420 + m.engine.hz * 7)

    this.ramp(this.nodes.siren.osc.frequency, m.siren.hz, SIREN_GLIDE)
    this.ramp(this.nodes.siren.gain.gain, m.siren.gain)

    this.ramp(this.nodes.road.gain.gain, m.road.gain)
    this.ramp(this.nodes.road.filter.frequency, m.road.cutoff)

    this.ramp(this.nodes.wind.gain.gain, m.wind.gain)
    this.ramp(this.nodes.wind.filter.frequency, m.wind.cutoff)

    // The swell. Worked out here rather than with a second oscillator on the
    // gain: it is one sine a frame against a whole node, and the sea is the
    // one voice where a slow, obvious rhythm is the point.
    const swell = 1 - SWELL_DEPTH + SWELL_DEPTH *
      (0.5 + 0.5 * Math.sin(this.elapsed * Math.PI * 2 * SWELL_HZ))
    this.ramp(this.nodes.sea.gain.gain, m.sea.gain * swell, 0.3)

    this.ramp(this.nodes.rain.gain.gain, m.rain.gain, 0.25)

    // The indicator relay clicks on BOTH edges, like a real one - which is
    // why it sounds like a relay and not like a metronome.
    if (m.tick.on !== this.lastTick) {
      if (m.master > 0) this.click(m.tick.gain * (m.tick.on ? 1 : 0.7))
      this.lastTick = m.tick.on
    }

    // Let the audio thread go when there is nothing to play.
    if (audible(m)) {
      this.quietFor = 0
      if (this.ctx.state === 'suspended' && this.enabled) {
        this.ctx.resume().catch(() => {})
      }
    } else {
      this.quietFor += delta
      if (this.quietFor > SLEEP_AFTER && this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {})
      }
    }
  }

  /** A single short click, built and thrown away. */
  click(gain) {
    const ctx = this.ctx
    const now = ctx.currentTime

    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.value = 1400

    const env = ctx.createGain()
    env.gain.setValueAtTime(0, now)
    env.gain.linearRampToValueAtTime(gain, now + 0.002)
    env.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

    osc.connect(env)
    env.connect(this.master)
    osc.start(now)
    osc.stop(now + 0.06)
  }
}
