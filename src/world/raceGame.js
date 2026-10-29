/**
 * ============================================================================
 * THE RACE
 * ============================================================================
 * Drive the racing car onto the speedway and five more come out of the garage,
 * line up on the grid, wait for the lights, and race you for ten laps.
 *
 * Pure, like `fireGame.js`, `policeGame.js` and `ambulanceGame.js`, and for
 * the same reason: no THREE, no Rapier, nothing that needs a browser. The
 * whole race is a state machine over numbers, so `tests/race.mjs` can run a
 * thousand of them in a second. World.js reads the state and draws it.
 *
 * ---------------------------------------------------------------------------
 * HOW POSITION WORKS
 * ---------------------------------------------------------------------------
 * Everything on the circuit is a single number: `along`, how far round the lap
 * you are, from 0 at the start/finish line to `lapLength` just before it. The
 * circuit is the speedway island's ring road, and the ring road is a closed
 * loop, so this is exactly the number the lane network already computes.
 *
 * That makes a lap a wrap of `along` and nothing more - but a wrap in the
 * RIGHT DIRECTION. A car that noses over the line, thinks better of it and
 * reverses would otherwise score a lap every time it wobbled. So progress is
 * accumulated as a signed delta, shortest way round, and a lap is credited
 * when the running total passes a whole lap. Reverse far enough and you lose
 * it again, which is correct and is what `tests/race.mjs` checks.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OTHER CARS ARE ON RAILS
 * ---------------------------------------------------------------------------
 * They do not steer, brake or avoid: each one is an `along` and a speed, and
 * it is advanced. That is the same model the monorail trains use, and it is
 * the right one here.
 *
 * The alternative - putting five cars into the traffic simulation and letting
 * them find their way round - was considered and is a worse game. The traffic
 * model is built to be POLITE: it yields, it queues, it leaves a headway, it
 * refuses to overtake into a gap it is not sure of. Every one of those
 * instincts is wrong on a racing circuit, and the first thing that happens is
 * five cars forming an orderly line behind whichever one is slowest.
 *
 * On rails, each car has its own pace and its own small rhythm, so the order
 * changes on its own, the lead swaps, and a child can watch a race rather than
 * a queue. What it costs is contact, and contact is not what makes this fun.
 * ============================================================================
 */

import { RACE_LAPS, RACE_FIELD, RACE_COUNTDOWN, lightAt } from './course.js'

export { RACE_LAPS, RACE_FIELD, RACE_COUNTDOWN }

/** How long the field takes to trundle out of the garage and form up. */
export const FORM_UP_TIME = 6

/** How long a message stays on screen. */
export const MESSAGE_TIME = 3.5

/** How long after a race before another one can start. */
export const COOLDOWN = 8

/**
 * How close to your grid box you have to be before the lights will start.
 *
 * Generous, and there is a timeout behind it - see `gridding` in stepRace().
 * A child who parks somewhere odd should get a race anyway; the grid box is
 * an invitation, not a turnstile.
 */
export const GRID_TOLERANCE = 22

/** And how long the lights wait for you before starting regardless. */
export const GRID_PATIENCE = 14

/**
 * What a lap of the speedway is actually worth, in units a second.
 *
 * NOT the racing car's top speed, which is 27.9 and 36.8 with boost. A car on
 * rails holds whatever number it is given all the way round, including through
 * the two hairpins; a car being driven does not. Measured with an autopilot
 * holding the racing line for ten laps, the average came out at a shade under
 * 20 - so a field set against the car's TOP speed laps everything it is
 * supposed to be racing.
 *
 * That is exactly what happened first time round: the field was given 28, the
 * quickest of them ran at 27.2 all the way round, and the driven car finished
 * three laps down in last place having done nothing wrong.
 *
 * 20.5 puts the field between 16.4 and 19.9, which is a race: an autopilot
 * that only holds the line comes second or third, and a child who learns to
 * hold the boost down the two straights wins.
 */
export const RACE_PACE = 20.5

/**
 * The pace of the field, as a fraction of RACE_PACE.
 *
 * Spread deliberately wide. Five cars all at 0.9 is a procession that finishes
 * in the order it started; this way the slowest is beatable by a child who is
 * still learning where the corners are, and the quickest is quick enough that
 * holding the throttle down and hoping is not enough.
 */
export const FIELD_PACE = [0.97, 0.93, 0.89, 0.85, 0.8]

/**
 * How much each car's pace wanders, and how fast.
 *
 * This is what stops the race being decided in the first corner. Each car
 * breathes in and out by a few per cent on its own period, so they close up
 * and pull away from each other continuously and the order genuinely changes.
 * Phased off the car's index so they are never in step.
 */
export const PACE_WANDER = 0.07
export const PACE_PERIOD = 11

/** Names, in the order they are handed out. */
export const FIELD_NAMES = ['RED', 'BLUE', 'GREEN', 'WHITE', 'YELLOW']

/** A fresh, idle race. */
export function newRaceState() {
  return {
    phase: 'idle',
    timer: 0,
    cooldown: 0,
    cars: [],
    // The player's own progress. `progress` is total distance covered, signed,
    // so it can go backwards; `lap` is derived from it.
    player: { along: 0, progress: 0, lap: 0, started: false, finished: false, place: 0 },
    countdown: 0,
    light: null,
    winner: null,
    message: '',
    messageFor: 0,
    lapLength: 0
  }
}

/**
 * The shortest signed way from `from` to `to` round a loop of `length`.
 *
 * Signed and shortest, which together are the whole lap-counting rule: a car
 * that crosses the line forwards moves +something small, and one that backs
 * over it moves -something small, and neither ever looks like most of a lap.
 */
export function loopDelta(from, to, length) {
  if (!(length > 0)) return 0
  let d = (to - from) % length
  if (d > length / 2) d -= length
  if (d < -length / 2) d += length
  return d
}

/** How many complete laps a signed progress total is worth. */
export function lapsFrom(progress, lapLength) {
  if (!(lapLength > 0)) return 0
  return Math.max(0, Math.floor(progress / lapLength))
}

/** Where car `i` starts on the grid, as a distance BEHIND the line. */
export function gridOffset(slot, rowGap = 7.5, stagger = 3.5) {
  const row = Math.floor(slot / 2)
  const side = slot % 2 ? 1 : -1
  return 8 + row * rowGap + (side > 0 ? stagger : 0)
}

/** Which side of the road grid slot `slot` sits on: -1 left, +1 right. */
export function gridSide(slot) {
  return slot % 2 ? 1 : -1
}

/**
 * The field, lined up and not yet moving.
 *
 * The player takes slot 0 - pole - which is not a reward for anything, it is
 * so that a child who has just driven onto a circuit is at the front where
 * they can see what is happening rather than behind five cars.
 */
export function makeField(lapLength, count = RACE_FIELD) {
  const cars = []
  for (let i = 0; i < count; i++) {
    const slot = i + 1
    cars.push({
      id: i,
      name: FIELD_NAMES[i % FIELD_NAMES.length],
      slot,
      side: gridSide(slot),
      // Behind the line, so the whole grid is on the run up to it and the
      // first thing anybody crosses is the start line.
      along: (lapLength - gridOffset(slot)) % lapLength,
      progress: -gridOffset(slot),
      pace: FIELD_PACE[i % FIELD_PACE.length],
      lap: 0,
      finished: false,
      place: 0
    })
  }
  return cars
}

/** A car's speed this instant, in world units a second. */
export function carSpeed(car, elapsed, pace = RACE_PACE) {
  const wander = Math.sin((elapsed / PACE_PERIOD + car.id * 0.37) * Math.PI * 2)
  return pace * car.pace * (1 + wander * PACE_WANDER)
}

/**
 * Everybody's running order: most progress first.
 *
 * Distance covered rather than laps-then-position, because they are the same
 * ordering and one of them is a single number. A car that has finished keeps
 * the place it finished in - it stops accumulating, but so does everyone who
 * finished before it, and the ones still going cannot pass a total they have
 * not reached.
 */
export function standings(state) {
  const all = [
    { id: 'player', name: 'YOU', progress: state.player.progress, player: true },
    ...state.cars.map((c) => ({ id: c.id, name: c.name, progress: c.progress }))
  ]
  all.sort((a, b) => b.progress - a.progress)
  return all
}

function say(state, text, hold = MESSAGE_TIME) {
  state.message = text
  state.messageFor = hold
}

function finish(state, winner) {
  state.phase = 'finished'
  state.winner = winner
  state.timer = 0
  state.cooldown = COOLDOWN
  state.light = null
  say(state, winner === 'YOU' ? 'YOU WIN' : `${winner} WINS`, MESSAGE_TIME * 1.6)
  return state
}

/**
 * One step of the race.
 *
 * @param {object} state    from newRaceState()
 * @param {number} delta    seconds
 * @param {object} ctx
 * @param {boolean} ctx.onCourse    is the player on the speedway's circuit?
 * @param {string}  ctx.kind        what the player is driving
 * @param {number}  ctx.along       player's distance round the lap
 * @param {number}  ctx.lapLength   how long a lap is
 * @param {number}  ctx.pace        the field's reference lap pace - RACE_PACE
 * @param {number}  ctx.toGrid      how far the player is from their grid box
 * @param {number}  ctx.elapsed     world clock, for the field's pace wander
 */
export function stepRace(state, delta, ctx) {
  if (!state || !(delta > 0)) return state

  state.messageFor = Math.max(0, state.messageFor - delta)
  if (state.messageFor === 0) state.message = ''
  state.cooldown = Math.max(0, state.cooldown - delta)
  state.lapLength = ctx.lapLength || state.lapLength

  const eligible = ctx.kind === 'race' && ctx.onCourse && ctx.lapLength > 0

  // Leaving the circuit, or changing vehicle, abandons whatever was happening.
  // Not a penalty - a child who drives off to look at something has not lost,
  // they have stopped playing this game, and the race should be there again
  // when they come back.
  if (!eligible && state.phase !== 'idle' && state.phase !== 'finished') {
    state.phase = 'idle'
    state.cars = []
    state.light = null
    state.winner = null
    say(state, 'RACE ABANDONED', MESSAGE_TIME * 0.6)
    return state
  }

  state.timer += delta

  switch (state.phase) {
    case 'idle': {
      if (!eligible || state.cooldown > 0) return state
      state.phase = 'gridding'
      state.timer = 0
      state.cars = makeField(ctx.lapLength)
      state.player = {
        along: ctx.along, progress: 0, lap: 0,
        started: false, finished: false, place: 0
      }
      state.winner = null
      say(state, 'RACE! TAKE POLE POSITION', FORM_UP_TIME)
      return state
    }

    case 'gridding': {
      // The field is trundling out of the garage; the player is finding pole.
      // Two ways forward: they get there, or they run out of patience, and the
      // second one exists because a race that will not start is not a race.
      const parked = (ctx.toGrid ?? 0) < GRID_TOLERANCE
      const ready = state.timer > FORM_UP_TIME && parked
      const bored = state.timer > GRID_PATIENCE

      if (ready || bored) {
        state.phase = 'lights'
        state.timer = 0
        state.countdown = 0
        state.player.along = ctx.along
        state.player.progress = 0
        say(state, 'LIGHTS', RACE_COUNTDOWN)
      }
      return state
    }

    case 'lights': {
      state.countdown = state.timer
      state.light = lightAt(state.timer)
      // The player's position is tracked through the countdown so that a jump
      // start is measured from where they actually were, not from the box.
      state.player.along = ctx.along

      if (state.timer >= RACE_COUNTDOWN) {
        state.phase = 'racing'
        state.timer = 0
        state.light = 'green'
        state.player.started = true
        say(state, 'GO', MESSAGE_TIME * 0.5)
      }
      return state
    }

    case 'racing': {
      // The player, from wherever the world says they are.
      const moved = loopDelta(state.player.along, ctx.along, ctx.lapLength)
      state.player.along = ctx.along
      state.player.progress += moved

      const wasLap = state.player.lap
      state.player.lap = lapsFrom(state.player.progress, ctx.lapLength)
      if (state.player.lap > wasLap && state.player.lap < RACE_LAPS) {
        say(state, `LAP ${state.player.lap + 1} OF ${RACE_LAPS}`, MESSAGE_TIME * 0.6)
      }

      // The field.
      for (const car of state.cars) {
        if (car.finished) continue
        const step = carSpeed(car, ctx.elapsed || 0, ctx.pace || RACE_PACE) * delta
        car.progress += step
        car.along = ((car.along + step) % ctx.lapLength + ctx.lapLength) % ctx.lapLength
        car.lap = lapsFrom(car.progress, ctx.lapLength)
        if (car.lap >= RACE_LAPS) car.finished = true
      }

      // Places, live, so the HUD can show them.
      const order = standings(state)
      order.forEach((entry, i) => {
        if (entry.player) state.player.place = i + 1
        else {
          const car = state.cars.find((c) => c.id === entry.id)
          if (car) car.place = i + 1
        }
      })

      if (state.player.lap >= RACE_LAPS) return finish(state, 'YOU')
      const winner = state.cars.find((c) => c.finished)
      if (winner) return finish(state, winner.name)
      return state
    }

    case 'finished': {
      if (state.timer > MESSAGE_TIME * 1.6) {
        state.phase = 'idle'
        state.cars = []
        state.timer = 0
      }
      return state
    }

    default:
      state.phase = 'idle'
      return state
  }
}

/**
 * What the HUD should show.
 *
 * The same shape the other three games hand over - `active`, `mine`, a title,
 * something to point at and something to fill a bar with - so `chooseMission()`
 * can arbitrate between four games without knowing what any of them is. See
 * missions.js. The first version of this returned its own shape with no
 * `active` field, so chooseMission filtered the whole race out and the HUD
 * stayed empty through ten laps; the probe caught it.
 *
 * `mine` is always true when there is anything to show, and that is not a
 * shortcut. A race only exists while YOU are on the circuit in the racing car
 * - stepRace() abandons it the instant either stops being true - so there is
 * no such thing as somebody else's race to be shown one of.
 */
export function raceHud(state) {
  if (!state) return { active: false, mine: false }

  const running = state.phase !== 'idle'
  const active = running || !!state.message
  if (!active) return { active: false, mine: false }

  const lap = Math.min(state.player.lap + 1, RACE_LAPS)

  let title = state.message
  if (!title) {
    switch (state.phase) {
      case 'gridding': title = 'TAKE POLE POSITION'; break
      case 'lights': title = (state.light || 'red').toUpperCase(); break
      case 'racing': title = `LAP ${lap} OF ${RACE_LAPS}`; break
      case 'finished':
        title = state.winner === 'YOU' ? 'YOU WIN' : `${state.winner} WINS`
        break
      default: title = ''
    }
  }

  return {
    active: true,
    mine: true,
    title,
    // Nothing to point at: you are on a circuit, and the only way round it is
    // round it. An arrow would be pointing at the road you are already on.
    target: null,
    showBar: state.phase === 'racing',
    barLabel: `LAP ${lap} / ${RACE_LAPS}`,
    progress: state.player.lap / RACE_LAPS,
    // The bar goes green when you are leading, which is the one fact worth
    // knowing at a glance in the middle of a race.
    good: state.phase === 'racing' && state.player.place === 1,

    // Under its own name as well, for the race's own test.
    phase: state.phase,
    light: state.light,
    lap: state.player.lap,
    place: state.player.place
  }
}
