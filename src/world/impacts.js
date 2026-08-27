/**
 * What happens when two vehicles hit each other.
 *
 * Mike: "whenever a car hits me, I sometimes go flying or at least my vehicle
 * is budged out of the way. Can we make this go both ways so that any car
 * hitting another car will make both cars react?"
 *
 * Both halves of that sentence are bugs, and they have the same cause. The AI
 * traffic runs on `kinematicPositionBased` bodies - see `createKinematicBox()`
 * in Physics.js - which Rapier treats as having INFINITE mass. That is what
 * makes the traffic drivable at all (a dynamic body dragged along a lane spends
 * its life on its roof), and it has two consequences that read as broken:
 *
 *   1. Nothing the player does moves a traffic vehicle. You can ram a parked
 *      sedan at full speed and it will not so much as twitch.
 *   2. Everything the traffic does to the player is applied at infinite mass,
 *      so a hatchback brushing the player's door hits exactly as hard as a
 *      loaded fire engine, and Rapier's penetration recovery converts the
 *      overlap into whatever velocity it takes to separate them in one step.
 *      That is the "going flying".
 *
 * So the exchange is worked out HERE instead, from real masses, and handed to
 * both sides: the traffic vehicle gets a knock in `stepTraffic()`, the player
 * gets a velocity in `World.updateTraffic()`. Rapier is left to do the one
 * thing it is good at here - keeping the two boxes from occupying the same
 * space - and is no longer asked to decide how hard the hit was.
 *
 * Pure: no THREE, no Rapier, no browser. `tests/impacts.mjs` runs it directly.
 */

/**
 * How heavy each kind is, in tonnes.
 *
 * Roughly true to life, because the whole point is that the ANSWER is
 * intuitive: a bus shrugging off a hatchback and a hatchback being spun by a
 * bus should both be things you could have predicted before you tried it.
 *
 * The spread matters more than the absolute numbers - only the RATIO is ever
 * used - and it is deliberately compressed at the top. A real city bus is
 * about 12 tonnes against a sedan's 1.5, and at a true 8:1 the sedan is
 * unplayable: every touch from a bus ends the run. 4.2 keeps a bus decisively
 * heavier without making it a wall.
 */
export const VEHICLE_MASSES = {
  sedan: 1.5,
  convertible: 1.35,
  pickup: 2.1,
  suv: 2.0,
  police: 1.8,
  ambulance: 3.2,
  tow: 3.6,
  fire: 4.5,
  bus: 4.2,

  // The player-only two. The monster truck is the heaviest thing that can be
  // driven, which is most of why anyone picks it.
  monster: 5.0,
  race: 1.1,

  // Held on the beam by the timetable, not by physics. It is in the table so
  // that massOf() never has to guess, and it is enormous so that the answer,
  // if it is ever asked, is "the train wins".
  monorail: 40
}

/** A sensible mass for anything not in the table. */
export const DEFAULT_MASS = 1.6

export function massOf(kind) {
  return VEHICLE_MASSES[kind] || DEFAULT_MASS
}

/**
 * How bouncy a car crash is. 0 = they stick, 1 = perfectly elastic.
 *
 * Cars are not bouncy - a real one converts almost all of it into bent metal -
 * but at 0 the two vehicles end up moving together and stay in contact,
 * which reads as one shoving the other along the road rather than hitting it.
 * A little separation is what makes it look like an impact.
 */
export const RESTITUTION = 0.25

/**
 * The least closing speed that counts as a hit rather than a scrape.
 *
 * Below this the two are rubbing along each other - queueing bumper to bumper,
 * or the player leaning on a bus - and applying an impulse every frame turns
 * that into a vibration. Sustained contact gets the separation push instead;
 * see `separation()`.
 */
export const IMPACT_SPEED = 1.2

/**
 * Do two oriented rectangles overlap, and if so, which way is out?
 *
 * The separating-axis test in `boxesOverlap()` answers yes/no, which is all
 * the traffic veto ever needed. An impact also needs a NORMAL - you cannot
 * exchange momentum without knowing along what - so this is the same test
 * keeping the axis of least overlap as it goes.
 *
 * Returns `{ nx, nz, depth }` with the normal pointing from `a` towards `b`,
 * or null if they are apart. All four axes are tested, both boxes' own, which
 * is what makes the answer the true minimum translation rather than the
 * smallest of one box's two.
 */
export function contactBetween(a, b) {
  let best = null

  const test = (p, q, sign) => {
    const axes = [
      { x: p.fx, z: p.fz, half: p.halfLength },
      { x: p.fz, z: -p.fx, half: p.halfWidth }
    ]
    for (const axis of axes) {
      const gap = (q.x - p.x) * axis.x + (q.z - p.z) * axis.z
      const spread =
        Math.abs(q.fx * axis.x + q.fz * axis.z) * q.halfLength +
        Math.abs(q.fz * axis.x - q.fx * axis.z) * q.halfWidth

      const overlap = axis.half + spread - Math.abs(gap)
      if (overlap <= 0) return false

      if (!best || overlap < best.depth) {
        // Point the normal from a to b, whichever box the axis came from.
        const way = (gap < 0 ? -1 : 1) * sign
        best = { nx: axis.x * way, nz: axis.z * way, depth: overlap }
      }
    }
    return true
  }

  if (!test(a, b, 1)) return null
  if (!test(b, a, -1)) return null
  return best
}

/**
 * The momentum exchange, along the contact normal.
 *
 * Textbook one-dimensional collision of two masses, applied to the component
 * of the relative velocity that lies along the normal. The tangential part is
 * left alone: two cars sliding past each other should keep sliding, and
 * inventing friction here would make a graze feel like a wall.
 *
 * `a` and `b` are `{ mass, vx, vz }`. The result is the CHANGE in each one's
 * velocity, so a caller that only owns one side can ignore the other half -
 * which is exactly what `stepTraffic` does for the player, and what World.js
 * does for the traffic.
 *
 * Returns zeroes when they are separating already. Without that check a pair
 * still touching after the bounce gets hit again every frame and the two of
 * them buzz apart across the map.
 */
export function impactResponse(a, b, nx, nz, restitution = RESTITUTION) {
  const still = { a: { dvx: 0, dvz: 0 }, b: { dvx: 0, dvz: 0 }, closing: 0 }

  const closing = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz
  if (closing <= 0) return still

  const ma = Math.max(0.01, a.mass)
  const mb = Math.max(0.01, b.mass)

  // The impulse that reverses the closing speed by `restitution`, shared out
  // by mass. This is where the whole "a bus is not a wall, and a sedan is not
  // a bus" behaviour comes from, and it is one line.
  const j = (1 + restitution) * closing / (1 / ma + 1 / mb)

  return {
    closing,
    a: { dvx: -(j / ma) * nx, dvz: -(j / ma) * nz },
    b: { dvx: (j / mb) * nx, dvz: (j / mb) * nz }
  }
}

/**
 * How fast to push two overlapping boxes apart, in units a second.
 *
 * For CONTACT rather than impact: leaning on a bus, or being carried along by
 * one. An impulse would be wrong here - it is not a new collision every frame -
 * but leaving them interpenetrating is worse, so they ease apart at a rate
 * that depends on how deep they are and, again, on the mass ratio.
 *
 * Capped, because a deep overlap usually means something has gone wrong
 * elsewhere (a relocate landing on the player, say) and the cure should not be
 * to fire a bus across the island.
 */
export const SEPARATE_RATE = 4
export const SEPARATE_MAX = 6

export function separation(depth, mine, theirs) {
  const share = Math.max(0.01, theirs) / (Math.max(0.01, mine) + Math.max(0.01, theirs))
  return Math.min(SEPARATE_MAX, depth * SEPARATE_RATE) * share
}

/**
 * A knock: where a vehicle has been shoved to, and how fast it is going there.
 *
 * The AI traffic has no velocity of its own off its lane - it is a distance
 * along a spline - so being hit cannot be expressed as a change to it. It is
 * carried as a separate world-space offset instead, which decays back to zero,
 * and `trafficPosition()` adds it on at the end. The vehicle keeps driving its
 * lane the whole time; it is just not exactly on it for a second or two.
 *
 * Why not reuse `sidestep`? Because sidestep is a deliberate, lane-relative
 * swerve that the collision veto tests BEFORE committing to it, and a knock is
 * neither deliberate nor lane-relative nor optional. Feeding an impact through
 * sidestep was tried first and the veto simply refused it: being shoved into
 * an occupied space is exactly the move that machinery exists to prevent, so
 * the car absorbed the hit by not moving at all.
 */
export function makeKnock() {
  return { x: 0, z: 0, vx: 0, vz: 0, yaw: 0, vyaw: 0 }
}

/**
 * How hard a knock is pulled back to zero, per second.
 *
 * A critically-damped spring, so the vehicle returns to its lane without
 * oscillating about it. An exponential decay on the OFFSET alone was tried and
 * looked wrong in a way that took a while to name: the car snaps sideways and
 * then creeps back, because all of the velocity is spent in the first frame.
 * A spring spends it over the whole recovery, which is what a car being
 * shunted actually does.
 *
 * THESE NUMBERS WERE FIRST SET FOUR TIMES TOO STIFF, and the result was a
 * feature nobody could see. Mike, after the first version shipped: "i still
 * feel like the collision physics only affect me." He was right, and my own
 * test said so in a line I did not read properly - "shoved 6 m/s sideways:
 * peak 0.60 units". Sixty centimetres, on a car 4.4 long. Measured against
 * a 6 m/s shove:
 *
 *     stiffness  damping   peak    settles
 *          9.0      6.0    0.67       2.4s   <- was
 *          4.0      4.0    1.04       3.9s
 *          2.5      3.2    1.32       5.2s   <- is
 *          1.6      2.5    1.69       6.4s
 *          1.0      2.0    2.14       8.6s
 *
 * 2.5 puts a shunted car most of its own width off the lane, which is a thing
 * you can see from a car length away. Below that the recovery starts to look
 * less like a car regaining its line and more like one that has been drinking.
 */
export const KNOCK_STIFFNESS = 2.5
export const KNOCK_DAMPING = 3.2

/** Biggest shove a traffic vehicle will take, in units. */
export const KNOCK_LIMIT = 4

/** And in radians - a hit slews the nose round, it does not spin the car. */
export const KNOCK_YAW_LIMIT = 0.7

export function stepKnock(knock, delta) {
  if (!knock) return null

  knock.vx += (-KNOCK_STIFFNESS * knock.x - KNOCK_DAMPING * knock.vx) * delta
  knock.vz += (-KNOCK_STIFFNESS * knock.z - KNOCK_DAMPING * knock.vz) * delta
  knock.vyaw += (-KNOCK_STIFFNESS * knock.yaw - KNOCK_DAMPING * knock.vyaw) * delta

  knock.x += knock.vx * delta
  knock.z += knock.vz * delta
  knock.yaw += knock.vyaw * delta

  const reach = Math.hypot(knock.x, knock.z)
  if (reach > KNOCK_LIMIT) {
    const scale = KNOCK_LIMIT / reach
    knock.x *= scale
    knock.z *= scale
  }
  knock.yaw = Math.max(-KNOCK_YAW_LIMIT, Math.min(KNOCK_YAW_LIMIT, knock.yaw))

  // Settled. Returning null lets the caller drop the object rather than step
  // a hundred of them every frame for the rest of the session.
  if (reach < 0.01 && Math.abs(knock.yaw) < 0.005 &&
      Math.hypot(knock.vx, knock.vz) < 0.05 && Math.abs(knock.vyaw) < 0.02) {
    return null
  }
  return knock
}

/**
 * Feed an impact into a knock.
 *
 * The velocity change goes straight in as the knock's own velocity, and the
 * yaw comes from the LEVER: a hit on the nose or the tail turns the vehicle,
 * a hit square on the side does not. `arm` is how far the contact is from the
 * vehicle's centre along its own length, signed.
 */
export const KNOCK_YAW_PER_UNIT = 0.09

export function addKnock(knock, dvx, dvz, arm = 0) {
  const target = knock || makeKnock()
  target.vx += dvx
  target.vz += dvz
  target.vyaw += -arm * Math.hypot(dvx, dvz) * KNOCK_YAW_PER_UNIT
  return target
}

/**
 * How much of its road speed a vehicle loses being hit.
 *
 * Separate from the knock, and it has to be: the knock is displacement off the
 * lane, and a car rammed from behind should also be pushed ALONG it. Rather
 * than model that as distance (which would shove it through the car in front,
 * past the veto's back), it is taken out of the speed, so the vehicle slows or
 * stops and then drives on. A shunt you can see, that cannot cause a crash.
 */
export function speedAfterImpact(speed, dvx, dvz, fx, fz) {
  const along = dvx * fx + dvz * fz
  return Math.max(0, speed + along)
}

/**
 * How much a hit takes off a vehicle's road speed, whichever way it came from.
 *
 * `speedAfterImpact()` above is the honest component along the vehicle, and on
 * its own it is not enough: T-bone a car square in the flank and the along
 * component is zero, so it slides sideways at an unchanged 12 units a second
 * while looking straight ahead. Which is exactly the "the collision physics
 * only affect me" that this pass is fixing - the car WAS being moved, and it
 * carried on driving as though nothing had happened.
 *
 * So any real hit also brakes. Not to a stop - a vehicle stopped dead in the
 * road is a jam, and this simulation has three permitted reasons to stop and
 * this is not one of them - but hard enough that you can see the driver has
 * noticed. Proportional to the hit, so a graze barely registers.
 */
export const STUN_PER_UNIT = 0.55

export function stunnedSpeed(speed, dvx, dvz) {
  const hit = Math.hypot(dvx, dvz)
  return Math.max(0, speed * Math.max(0, 1 - hit * STUN_PER_UNIT / 10))
}

/**
 * How fast momentum keeps transferring while the player leans on a car.
 *
 * The first version applied an impulse on the rising edge of contact and then
 * only a gentle positional separation, on the reasoning that a sustained
 * contact is not a new collision every frame. That reasoning is right and the
 * result was still wrong: you cannot BULLDOZE anything. Drive into a stopped
 * car and it hops once and then holds its ground while you push at it, which
 * is the single most obvious way to discover the physics are one-directional.
 *
 * So while the two are still closing, momentum keeps moving across at this
 * fraction of a full impulse per second. High enough to shove a sedan out of
 * a junction at walking pace; low enough that it is plainly a push rather
 * than a second bang.
 */
export const PUSH_RATE = 3.5
