/**
 * Fireworks, for winning the race.
 *
 * Cross the line first and a show goes up over the finish: a dozen shells,
 * staggered, each climbing on a fuse and bursting into a sphere of sparks
 * that fall under gravity and fade. Nine seconds, then nothing.
 *
 * No THREE in here, like the mission games and donut.js, and for the same
 * reason. Every number that decides what the show looks like - when each
 * shell goes up, where it bursts, where every spark is at every instant - is
 * arithmetic, and arithmetic is tested in a millisecond without a browser.
 * `World.js` owns a single Points mesh and asks this file where to put each
 * point. It decides nothing, not even whether there is a show on.
 *
 * WHY THE SPARKS ARE A FORMULA AND NOT A SIMULATION
 * -------------------------------------------------
 * A spark's position is a closed-form function of the time since its burst:
 * launch velocity integrated under gravity with exponential drag. Nothing is
 * stepped, nothing is stored per spark, and a thousand of them cost a
 * thousand evaluations of the same few lines. It also means the show is
 * exactly reproducible from its seed and its clock - a test can ask where
 * spark 37 of shell 4 is at t = 3.1 and get the same answer every time.
 *
 * A stepped simulation would let sparks bounce or collide, and nobody wants
 * that from a firework.
 */
/** How long the whole thing lasts, launch of the first to fade of the last. */
export const SHOW_SECONDS = 9

/** How many shells go up. */
export const SHELLS = 14

/** Sparks in each burst. */
export const SPARKS = 96

/**
 * The shell on the way up. It climbs for FUSE seconds at LAUNCH_SPEED, which
 * puts the bursts about eighteen units over the finish line.
 *
 * LOWER THAN A REAL FIREWORK, ON PURPOSE. The first version burst at
 * thirty-three units and looked right in the numbers: 677 sparks in the air,
 * a proper show. The screenshot showed a car, a gantry and a clear blue sky.
 * The chase camera sits about nine units up and looks slightly DOWN, so the
 * top of the frame is only fifteen or so units above the road at the
 * distances the shells land - and everything above that is a show for the
 * seagulls. Eighteen units puts the bursts in the top third of the screen,
 * which is where a firework over a finish line belongs.
 */
export const LAUNCH_SPEED = 16
export const FUSE = 1.6

/** The burst. */
export const SPARK_SPEED = 11
export const SPARK_LIFE = 2.3
export const GRAVITY = 9.8
export const DRAG = 1.4

/**
 * How far from the centre the shells are launched. A spread, not a point -
 * and wide, so that from a car stopped on the line the bursts are out ahead
 * and to the sides rather than straight overhead, where the camera is not
 * looking.
 */
export const SPREAD = 40

/** The hues the shells cycle through. Plain numbers; World.js makes colours. */
export const HUES = [0.0, 0.08, 0.14, 0.33, 0.55, 0.62, 0.8, 0.92]

/**
 * Should this race be celebrated?
 *
 * Winning, not finishing - fireworks for coming last would be a bit much,
 * and `winner` is already the name of whoever crossed the line first.
 */
export function celebrates(race) {
  return !!race && race.phase === 'finished' && race.winner === 'YOU'
}

export function newFireworks() {
  return {
    active: false,
    t: 0,              // seconds since the show started
    centre: null,      // where it is, { x, y, z }
    shells: [],        // see startShow()
    shown: 0           // how many shows there have been, for the tests
  }
}

/**
 * Light the fuse.
 *
 * Shells are laid out at once, up front - launch time, landing spot, hue -
 * so the show is fixed from this moment and everything after is a lookup.
 * Staggered over the first two thirds of the show so the last burst has
 * time to fall before the lights go out, and the stagger is slightly uneven
 * so it does not read as a metronome.
 *
 * `rand` is passed in, like chooseBuilding() in fireGame.js, so a test can
 * light the same show twice.
 */
export function startShow(state, centre, rand = Math.random) {
  state.active = true
  state.t = 0
  state.centre = { x: centre.x, y: centre.y || 0, z: centre.z }
  state.shown++
  state.shells = []

  const window = SHOW_SECONDS - FUSE - SPARK_LIFE
  for (let i = 0; i < SHELLS; i++) {
    const even = (i / SHELLS) * window
    const jitter = (rand() - 0.5) * (window / SHELLS) * 0.8
    const angle = rand() * Math.PI * 2
    const reach = Math.sqrt(rand()) * SPREAD

    state.shells.push({
      launch: Math.max(0, even + jitter),
      x: state.centre.x + Math.cos(angle) * reach,
      z: state.centre.z + Math.sin(angle) * reach,
      // A little variety in height and size, so no two bursts are twins.
      fuse: FUSE * (0.85 + rand() * 0.3),
      size: 0.8 + rand() * 0.45,
      hue: HUES[Math.floor(rand() * HUES.length)],
      seed: rand() * 1000
    })
  }

  return state
}

/** Advance the clock; the show switches itself off when it is over. */
export function stepFireworks(state, delta) {
  if (!state.active) return state
  state.t += delta
  if (state.t > SHOW_SECONDS) {
    state.active = false
    state.shells = []
  }
  return state
}

/**
 * Where the shell is on its way up, or null once it has burst or before it
 * has launched. A straight climb with a touch of ease-out, so it slows as it
 * reaches the top the way a real one does before it pops.
 */
export function shellAt(shell, centre, t) {
  const age = t - shell.launch
  if (age < 0 || age >= shell.fuse) return null

  const k = age / shell.fuse
  const height = LAUNCH_SPEED * shell.fuse * (k - 0.3 * k * k)
  return { x: shell.x, y: centre.y + height, z: shell.z }
}

/** Where a shell bursts. */
export function burstPoint(shell, centre) {
  const height = LAUNCH_SPEED * shell.fuse * 0.7
  return { x: shell.x, y: centre.y + height, z: shell.z }
}

/**
 * A spark's launch direction: evenly over a sphere, from its index.
 *
 * Fibonacci spiral rather than random, so a burst is a sphere rather than a
 * lumpy cloud, and so the direction of spark `i` is a function of `i` and
 * nothing else - no table to store.
 */
function sparkDirection(i, seed) {
  const golden = Math.PI * (3 - Math.sqrt(5))
  const y = 1 - (i / (SPARKS - 1)) * 2
  const r = Math.sqrt(Math.max(0, 1 - y * y))
  const theta = golden * i + seed
  return { x: Math.cos(theta) * r, y, z: Math.sin(theta) * r }
}

/**
 * Where spark `i` of a shell is at show-time `t`, and how bright.
 *
 * Returns null before the burst and after the spark has faded. Velocity decays
 * exponentially with DRAG; the closed form of that under gravity is
 *
 *     p(a) = p0 + (v0 / k)(1 - e^-ka) + g (a - (1 - e^-ka) / k) / k
 *
 * with k the drag and a the age, which is a mouthful and also just two lines.
 * `alpha` runs 1 to 0 over SPARK_LIFE with a late fade, so a burst stays
 * bright and then goes quickly, which is what a firework does.
 */
export function sparkAt(shell, i, centre, t) {
  const age = t - shell.launch - shell.fuse
  if (age < 0 || age >= SPARK_LIFE) return null

  const d = sparkDirection(i, shell.seed)
  const from = burstPoint(shell, centre)
  const k = DRAG
  const e = 1 - Math.exp(-k * age)
  const speed = SPARK_SPEED * shell.size

  const drift = e / k
  const fall = (age - e / k) / k

  const x = from.x + d.x * speed * drift
  const y = from.y + d.y * speed * drift - GRAVITY * fall
  const z = from.z + d.z * speed * drift

  const life = age / SPARK_LIFE
  const alpha = life < 0.6 ? 1 : 1 - (life - 0.6) / 0.4

  return { x, y, z, alpha, hue: shell.hue }
}

/**
 * How many points World.js needs to reserve. Every shell's sparks plus one
 * point for the shell itself on the way up. Fixed, so the buffer is allocated
 * once and never grows.
 */
export const POINTS = SHELLS * (SPARKS + 1)

/**
 * Fill a flat array of positions and one of colours for this instant.
 *
 * The one function World.js calls per frame. `positions` is POINTS * 3 long,
 * `colours` the same, `sizes` POINTS long; anything not alive this frame is
 * parked far below the world with size 0, which is cheaper than resizing the
 * buffer and invisible either way.
 *
 * `toRgb(hue, alpha, out)` is handed in so this file does not need to know
 * how a colour is made - World.js has THREE.Color for that.
 */
export function fillPoints(state, positions, colours, sizes, toRgb) {
  const HIDE = -1000
  let n = 0

  const put = (p, hue, alpha, size) => {
    positions[n * 3] = p.x
    positions[n * 3 + 1] = p.y
    positions[n * 3 + 2] = p.z
    toRgb(hue, alpha, colours, n * 3)
    sizes[n] = size
    n++
  }

  // EVERY slot is either written or parked, every frame. The first version
  // skipped a slot with `n++` when its spark was not alive, which left last
  // frame's position in the buffer - and a spark that has faded is still
  // drawn wherever it last was, at whatever size it last had. A ghost of
  // the previous burst hanging in the sky.
  const park = () => {
    positions[n * 3] = 0
    positions[n * 3 + 1] = HIDE
    positions[n * 3 + 2] = 0
    sizes[n] = 0
    n++
  }

  if (state.active && state.centre) {
    for (const shell of state.shells) {
      const up = shellAt(shell, state.centre, state.t)
      if (up) put(up, shell.hue, 0.9, 1.6)
      else park()
      for (let i = 0; i < SPARKS; i++) {
        const s = sparkAt(shell, i, state.centre, state.t)
        if (s) put(s, s.hue, s.alpha, 1.1 * shell.size)
        else park()
      }
    }
  }

  while (n < POINTS) park()
}

/** How many sparks are in the air right now - for a test or a probe. */
export function sparksAlive(state) {
  if (!state.active) return 0
  let alive = 0
  for (const shell of state.shells) {
    for (let i = 0; i < SPARKS; i++) {
      if (sparkAt(shell, i, state.centre, state.t)) alive++
    }
  }
  return alive
}
