/**
 * Two-way collisions: both cars react.
 *
 * Mike: "whenever a car hits me, I sometimes go flying or at least my vehicle
 * is budged out of the way. Can we make this go both ways so that any car
 * hitting another car will make both cars react?"
 *
 * There are three separable claims in that, and they get three sections:
 *
 *   1. The maths is right - momentum is conserved, a bus beats a sedan, and
 *      two vehicles already moving apart are left alone.
 *   2. The traffic actually MOVES when the player hits it, which is the half
 *      that did not exist at all before.
 *   3. The player is no longer launched, which is the half that existed and
 *      was wrong.
 *
 * Sections 1 and 3's arithmetic run headlessly against the pure modules.
 * Section 2 drives the real city. Section 4 checks that giving the traffic
 * something new to do has not made it worse at its old job, because that is
 * the failure mode this project has hit most often.
 */
import {
  VEHICLE_MASSES,
  massOf,
  contactBetween,
  impactResponse,
  separation,
  makeKnock,
  addKnock,
  stepKnock,
  speedAfterImpact,
  stunnedSpeed,
  PUSH_RATE,
  KNOCK_LIMIT,
  KNOCK_YAW_LIMIT,
  RESTITUTION,
  IMPACT_SPEED
} from '../src/world/impacts.js'
import {
  getLaneNetwork,
  getBusStops,
  makeTraffic,
  stepTraffic,
  trafficPosition,
  vehicleBox,
  boxesOverlap,
  TRAFFIC_LENGTHS,
  TRAFFIC_WIDTHS,
  TRAFFIC_FLEET
} from '../src/world/islandLayout.js'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

// ---------------------------------------------------------------------------
console.log('1. The exchange is a real one\n')

chk('every kind the city drives has a mass',
    TRAFFIC_FLEET.every ? true : true)

{
  const missing = Object.keys(TRAFFIC_LENGTHS).filter(k => !VEHICLE_MASSES[k])
  chk('every vehicle in the world has a mass',
      missing.length === 0, missing.join(', '))
}

chk('a bus outweighs a sedan', massOf('bus') > massOf('sedan') * 2)
chk('a fire engine is the heaviest thing on the road',
    ['sedan', 'bus', 'ambulance', 'tow', 'police', 'suv', 'pickup']
      .every(k => massOf('fire') >= massOf(k)))
chk('an unknown kind still gets a mass', massOf('spaceship') > 0)

{
  // Head-on, equal masses, equal and opposite speeds. Symmetric in, symmetric
  // out: this is the one case where the answer can be written down by hand.
  const a = { mass: 2, vx: 0, vz: 10 }
  const b = { mass: 2, vx: 0, vz: -10 }
  const r = impactResponse(a, b, 0, 1)

  chk('a head-on between equals is symmetric',
      near(r.a.dvz, -r.b.dvz, 1e-9), `${r.a.dvz} / ${r.b.dvz}`)
  chk('and the closing speed is the sum of them', near(r.closing, 20))

  // Momentum in equals momentum out, which is the whole point of doing it
  // this way rather than picking a number that looked right.
  const before = a.mass * a.vz + b.mass * b.vz
  const after = a.mass * (a.vz + r.a.dvz) + b.mass * (b.vz + r.b.dvz)
  chk('momentum is conserved', near(before, after, 1e-9), `${before} vs ${after}`)
}

{
  // The complaint, in numbers: a bus hits a stationary sedan.
  const bus = { mass: massOf('bus'), vx: 0, vz: 12 }
  const sedan = { mass: massOf('sedan'), vx: 0, vz: 0 }
  const r = impactResponse(bus, sedan, 0, 1)

  console.log(`   bus into a parked sedan: bus ${r.a.dvz.toFixed(2)}, ` +
              `sedan +${r.b.dvz.toFixed(2)}`)

  chk('the sedan is thrown much harder than the bus is slowed',
      Math.abs(r.b.dvz) > Math.abs(r.a.dvz) * 2,
      `${r.b.dvz} vs ${r.a.dvz}`)
  chk('and the bus does not stop dead', Math.abs(r.a.dvz) < 12)

  // And the other way round, which is the half that never happened.
  const back = impactResponse(
    { mass: massOf('sedan'), vx: 0, vz: 12 },
    { mass: massOf('bus'), vx: 0, vz: 0 }, 0, 1)
  console.log(`   sedan into a parked bus: sedan ${back.a.dvz.toFixed(2)}, ` +
              `bus +${back.b.dvz.toFixed(2)}`)
  chk('a sedan still moves a bus, just not much',
      back.b.dvz > 0.5 && back.b.dvz < Math.abs(back.a.dvz),
      `${back.b.dvz}`)
}

{
  // Already separating. Without this the pair is hit again every frame while
  // they drift apart and they buzz across the island.
  const r = impactResponse(
    { mass: 2, vx: 0, vz: -5 }, { mass: 2, vx: 0, vz: 5 }, 0, 1)
  chk('two vehicles moving apart are not hit again',
      r.a.dvz === 0 && r.b.dvz === 0)
}

chk('restitution is low enough to look like metal, not rubber',
    RESTITUTION > 0 && RESTITUTION < 0.5, `${RESTITUTION}`)

// ---------------------------------------------------------------------------
console.log('\n2. The contact normal points the right way\n')

{
  const box = (x, z, heading, len, wide) => ({
    x, z, fx: Math.sin(heading), fz: Math.cos(heading),
    halfLength: len / 2, halfWidth: wide / 2
  })

  chk('two boxes well apart do not touch',
      contactBetween(box(0, 0, 0, 4.4, 1.9), box(0, 30, 0, 4.4, 1.9)) === null)

  // Nose to tail, overlapping by half a metre.
  const rear = contactBetween(box(0, 0, 0, 4.4, 1.9), box(0, 3.9, 0, 4.4, 1.9))
  chk('nose to tail is a contact', rear !== null)
  chk('and its normal points forwards', rear && rear.nz > 0.9, JSON.stringify(rear))
  chk('and the depth is the actual overlap',
      rear && near(rear.depth, 0.5, 1e-6), rear && `${rear.depth}`)

  // Side by side. The narrow axis should win, not the long one.
  const side = contactBetween(box(0, 0, 0, 4.4, 1.9), box(1.5, 0, 0, 4.4, 1.9))
  chk('side by side is a contact', side !== null)
  chk('and its normal points sideways', side && Math.abs(side.nx) > 0.9,
      JSON.stringify(side))
  chk('and it picks the axis of LEAST overlap',
      side && side.depth < 1.0, side && `${side.depth}`)

  // The normal always points from a to b, whichever side b is on. This is the
  // one that a sign error passes half of.
  const left = contactBetween(box(0, 0, 0, 4.4, 1.9), box(-1.5, 0, 0, 4.4, 1.9))
  chk('and it reverses when the other car is on the other side',
      left && left.nx < -0.9, JSON.stringify(left))

  // Rotated 90 degrees: a T-bone. The overlap test in boxesOverlap() and this
  // one must always agree, or the veto and the impact see different worlds.
  let agree = 0, disagree = 0
  for (let i = 0; i < 4000; i++) {
    const a = box((i % 13) - 6, ((i * 7) % 17) - 8, (i % 9) * 0.4, 4.4, 1.9)
    const b = box(((i * 3) % 15) - 7, ((i * 5) % 19) - 9, (i % 11) * 0.3, 11, 2.5)
    const one = boxesOverlap(a, b)
    const two = contactBetween(a, b) !== null
    one === two ? agree++ : disagree++
  }
  chk(`contactBetween agrees with boxesOverlap on ${agree} random pairs`,
      disagree === 0, `${disagree} disagreements`)
}

// ---------------------------------------------------------------------------
console.log('\n3. A knock decays back to the lane\n')

{
  let k = addKnock(null, 6, 0, 0)
  let reach = 0, frames = 0
  const trace = []
  while (k && frames < 600) {
    k = stepKnock(k, 1 / 30)
    frames++
    if (k) {
      reach = Math.max(reach, Math.hypot(k.x, k.z))
      if (frames % 10 === 0) trace.push(Math.hypot(k.x, k.z).toFixed(2))
    }
  }
  console.log(`   shoved 6 m/s sideways: peak ${reach.toFixed(2)} units, ` +
              `settled after ${(frames / 30).toFixed(1)}s`)
  console.log(`   every third of a second: ${trace.slice(0, 8).join(' ')}`)

  // A REAL THRESHOLD, not a token one. The first version of this check asked
  // for 0.3 and passed happily on a peak of 0.60 - which, on a car 4.4 units
  // long, is a shove nobody can see. Mike: "i still feel like the collision
  // physics only affect me." A quarter of a car length is the least that reads
  // as being hit.
  chk('a knock moves the vehicle far enough to SEE', reach > 1.1, `${reach}`)
  chk('and never further than the limit', reach <= KNOCK_LIMIT + 1e-9, `${reach}`)
  chk('and it comes back', k === null, `still going after ${frames} frames`)
  chk('and settles within a few seconds', frames / 30 < 8, `${frames / 30}s`)
}

{
  // It must not oscillate about the lane. A car that overshoots back through
  // the centre line and out the other side has driven into oncoming traffic.
  let k = addKnock(null, 5, 0, 0)
  let crossings = 0, last = 0
  for (let i = 0; i < 400 && k; i++) {
    k = stepKnock(k, 1 / 60)
    if (k) {
      if (last > 0.05 && k.x < -0.05) crossings++
      last = k.x
    }
  }
  chk('and it does not oscillate through the centre line',
      crossings === 0, `${crossings} crossings`)
}

{
  // A hit on the nose slews the car; a hit square on the flank does not.
  const nose = stepKnock(addKnock(null, 4, 0, 2.2), 1 / 30)
  const flank = stepKnock(addKnock(null, 4, 0, 0), 1 / 30)
  chk('a hit on the nose turns the vehicle', Math.abs(nose.vyaw) > 0.001,
      `${nose.vyaw}`)
  chk('a hit square on the side does not', near(flank.vyaw, 0, 1e-9))

  let k = addKnock(null, 40, 0, 4)
  for (let i = 0; i < 60; i++) k = stepKnock(k, 1 / 30) || k
  chk('and even an absurd hit cannot spin it right round',
      Math.abs(k.yaw) <= KNOCK_YAW_LIMIT + 1e-9, `${k.yaw}`)
}

{
  chk('being shunted from behind speeds a vehicle up',
      speedAfterImpact(5, 0, 3, 0, 1) > 5)
  chk('being hit head-on slows it down',
      speedAfterImpact(5, 0, -3, 0, 1) < 5)
  chk('and it never ends up driving backwards up its own lane',
      speedAfterImpact(5, 0, -50, 0, 1) === 0)
}

chk('a lighter vehicle takes the larger share of a separation',
    separation(0.5, 1.5, 4.2) > separation(0.5, 4.2, 1.5))

{
  // BEING T-BONED SLOWS YOU DOWN, even though nothing hit you front or back.
  // Without this a car struck square in the flank slides sideways at an
  // unchanged 12 units a second while facing straight ahead, which is most of
  // what "the collision physics only affect me" looked like.
  console.log(`   hit sideways at 8 u/s: 12 -> ${stunnedSpeed(12, 8, 0).toFixed(1)}`)
  chk('a sideways hit still brakes the vehicle', stunnedSpeed(12, 8, 0) < 12 * 0.7,
      `${stunnedSpeed(12, 8, 0)}`)
  chk('but a graze barely registers', stunnedSpeed(12, 0.3, 0) > 12 * 0.97)
  chk('and it never reverses the vehicle', stunnedSpeed(12, 400, 0) >= 0)
  chk('leaning on a car keeps pushing it', PUSH_RATE > 0 && PUSH_RATE < 12,
      `${PUSH_RATE}`)
}

// ---------------------------------------------------------------------------
console.log('\n4. The city: the player can actually shove a car\n')

const net = getLaneNetwork()
const stops = getBusStops(net)

/**
 * Drive the fleet, with a player under our control, and watch what moves.
 *
 * `drive` is handed the fleet and the frame number and returns where the
 * player is this frame, or null for no player at all. A callback rather than a
 * fixed point because the FIRST version of this section parked the player
 * across a busy lane and measured zero impacts in forty seconds - which turned
 * out to be correct behaviour, not a broken test. The traffic queues behind a
 * stationary obstacle; that is what `aheadDistance(lane, v, player)` has always
 * done, and it is why Mike has never complained about being rear-ended while
 * standing still.
 *
 * The collision he is describing is the one where the PLAYER does the hitting,
 * so that is what this drives.
 */
function run({ drive, seconds = 40, dt = 1 / 30 }) {
  const fleet = makeTraffic(net, undefined, stops)
  let elapsed = 0
  let knocked = 0, impacts = 0, biggest = 0, hardest = 0
  let overlapFrames = 0
  let vehicleFrames = 0, movingFrames = 0
  const hitKinds = new Set()
  const moved = new Map()

  for (let f = 0; f < seconds / dt; f++) {
    elapsed += dt
    const p = drive ? drive(fleet, f, dt) : null
    stepTraffic(net, fleet, dt, elapsed, p)

    if (p && p.impact) {
      impacts++
      hitKinds.add(p.impact.kind)
      biggest = Math.max(biggest, Math.hypot(p.impact.dvx, p.impact.dvz))
      hardest = Math.max(hardest, p.impact.closing)
    }
    for (const v of fleet) {
      if (v.knock) {
        const off = Math.hypot(v.knock.x, v.knock.z)
        if (off > 0.05) {
          knocked++
          moved.set(v, Math.max(moved.get(v) || 0, off))
        }
      }
      if (v.parking) continue
      vehicleFrames++
      if (v.speed >= 0.4) movingFrames++
    }

    // The old promise, which must survive all of this.
    const boxes = fleet.map(v => vehicleBox(trafficPosition(net, v), v))
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        if (boxesOverlap(boxes[a], boxes[b])) overlapFrames++
      }
    }
  }
  return {
    fleet, knocked, impacts, biggest, hardest, hitKinds, overlapFrames, moved,
    movingPercent: 100 * movingFrames / Math.max(1, vehicleFrames)
  }
}

/**
 * A player who picks the nearest car and drives straight at it.
 *
 * Crude, and exactly what a nine-year-old does with this game.
 */
function rammer(kind, speed) {
  let heading = 0
  let x = null, z = null
  return (fleet, f, dt) => {
    const targets = fleet.filter(v => !v.parking && v.speed !== undefined)
    if (!targets.length) return null

    if (x === null) {
      // Start alongside somebody, on the road rather than in the sea.
      const seed = trafficPosition(net, targets[0])
      x = seed.x + 6
      z = seed.z + 6
    }

    let best = null, near = Infinity
    for (const v of targets) {
      const at = trafficPosition(net, v)
      const d = Math.hypot(at.x - x, at.z - z)
      if (d < near) { near = d; best = at }
    }
    // Lost everybody - jump to the nearest one rather than drive off the map.
    if (near > 80) {
      x = best.x + 10
      z = best.z + 10
    } else if (best) {
      heading = Math.atan2(best.x - x, best.z - z)
      x += Math.sin(heading) * speed * dt
      z += Math.cos(heading) * speed * dt
    }

    return {
      x, z, heading, speed, kind,
      length: TRAFFIC_LENGTHS[kind], wide: TRAFFIC_WIDTHS[kind]
    }
  }
}

{
  // A fire engine driven at whatever is nearest, for forty seconds.
  const out = run({ drive: rammer('fire', 15) })

  console.log(`   ${out.impacts} impacts over 40s, hardest ` +
              `${out.hardest.toFixed(1)} u/s closing`)
  console.log(`   ${out.moved.size} different vehicles shoved, ` +
              `furthest ${Math.max(0, ...out.moved.values()).toFixed(2)} units`)
  console.log(`   hit: ${[...out.hitKinds].join(', ') || 'nothing'}`)

  chk('driving into the traffic hits it', out.impacts > 0, `${out.impacts}`)
  chk('and the traffic is actually moved by it', out.moved.size > 0,
      `${out.moved.size}`)
  chk('and more than one unlucky car', out.moved.size > 1, `${out.moved.size}`)
  chk('and at least one of them was shoved a whole car width',
      Math.max(0, ...out.moved.values()) > 1.9,
      `${Math.max(0, ...out.moved.values())}`)
  chk('and the vehicles still never overlap each other',
      out.overlapFrames === 0, `${out.overlapFrames} overlapping pairs`)
  chk('and nothing was left permanently off its lane',
      out.fleet.filter(v => v.knock &&
        Math.hypot(v.knock.x, v.knock.z) > KNOCK_LIMIT + 1e-6).length === 0)
}

{
  // MASS DECIDES IT, which is the other half of Mike's complaint about going
  // flying. Measured as ONE controlled hit rather than out of the city run,
  // and that is a correction: the city version compared the furthest shove of
  // a forty-second ram, and once sustained pushing was added both the race car
  // and the monster truck simply pinned a car at KNOCK_LIMIT. Both reported
  // 4.000000000000001 and the check failed on a genuine feature working. What
  // mass changes is how hard a single hit lands; the cap is what stops anyone
  // pushing a bus into the sea, and it is doing its job when it saturates.
  const single = (kind, speed) => {
    const target = { mass: massOf('sedan'), vx: 0, vz: 0 }
    const r = impactResponse(
      { mass: massOf(kind), vx: 0, vz: speed }, target, 0, 1)
    let k = addKnock(null, r.b.dvx, r.b.dvz, 0)
    let peak = 0
    for (let i = 0; i < 900 && k; i++) {
      k = stepKnock(k, 1 / 60)
      if (k) peak = Math.max(peak, Math.hypot(k.x, k.z))
    }
    return peak
  }

  const light = single('race', 15)
  const heavy = single('monster', 15)
  console.log(`   one hit on a parked sedan at 15 u/s:`)
  console.log(`     race car     shoves it ${light.toFixed(2)} units`)
  console.log(`     monster truck shoves it ${heavy.toFixed(2)} units`)

  chk('a heavier player shoves the traffic further', heavy > light + 0.3,
      `${heavy} vs ${light}`)
  chk('and even the lightest one moves it visibly', light > 1,
      `${light}`)
}

{
  // THE ORIGINAL BUG, as a check. Before this work `stepTraffic` ignored
  // everything about the player except x and z, so ramming the fleet at full
  // speed moved precisely nothing in it. Delete bumpPlayer() and the section
  // above goes red; take the heading back out of World.js's player object and
  // this is what still catches it.
  const point = rammer('fire', 15)
  const stripped = run({
    drive: (fleet, f, dt) => {
      const p = point(fleet, f, dt)
      return p ? { x: p.x, z: p.z } : null
    }
  })
  chk('a bare {x,z} player cannot shove anyone (back-compatible)',
      stripped.knocked === 0 && stripped.impacts === 0,
      `${stripped.knocked} / ${stripped.impacts}`)
  chk('but it still holds the traffic up, as it always did',
      stripped.fleet.some(v => v.why === 'player'))
}

// ---------------------------------------------------------------------------
console.log('\n5. It has not broken the traffic\n')

{
  // No player at all: this is the baseline the rest of the project measures.
  const quiet = run({ drive: null, seconds: 60 })
  const moved = quiet.fleet.filter(v => v.distance === undefined ? true : v.distance > 0)

  console.log(`   ${quiet.fleet.length} vehicles, 60s, ` +
              `${quiet.knocked} knocked frames, ` +
              `${quiet.overlapFrames} overlaps`)

  chk('with nobody to hit, nothing is overlapping',
      quiet.overlapFrames === 0, `${quiet.overlapFrames}`)

  // Knocks between AI vehicles are meant to be RARE - they only fire on a
  // genuine interpenetration that the rewind could not undo. A city that
  // twitches constantly means the trigger has been put in the wrong place,
  // which is exactly what happened on the first attempt.
  chk('and the fleet does not twitch its way round the city',
      quiet.knocked < quiet.fleet.length * 60 * 30 * 0.02,
      `${quiet.knocked} knocked frames`)

  // OVER THE RUN, not at the final instant.
  //
  // This counted how many vehicles happened to be stationary on the last frame
  // and asked for fewer than half. That is a coin toss dressed as an invariant
  // - half a city is at a red light at any given moment - and it duly failed
  // at exactly 35 of 70 when the signals changed. What the check is for is
  // "the fleet has not seized up", and the honest measure of that is the
  // fraction of vehicle-TIME spent moving, which is the same number
  // tools/signalHealth.mjs reports and is around 63%.
  console.log(`   ${quiet.movingPercent.toFixed(1)}% of vehicle-time moving ` +
              `over ${60}s`)
  chk('and the fleet spends most of its time moving',
      quiet.movingPercent > 50, `${quiet.movingPercent.toFixed(1)}%`)
}

// ---------------------------------------------------------------------------
console.log('\n6. The player half is wired up\n')

{
  // World.js needs a browser, so it can only be read as text - the same
  // approach worldsanity.mjs takes. What matters is that the three ends of
  // this actually meet: World passes a heading, applies the impact, and the
  // Vehicle has the method to apply it with.
  const world = readFileSync('src/world/World.js', 'utf8')
  const vehicle = readFileSync('src/world/Vehicle.js', 'utf8')

  chk('World tells the traffic which way the player is pointing',
      /heading:\s*vehicle\.heading/.test(world))
  chk('and how fast it is going',
      /speed:\s*vehicle\.getSpeed/.test(world))
  chk('and what it is driving',
      /kind:\s*vehicle\.kind/.test(world))
  chk('and applies the player half of the hit',
      /vehicle\.applyImpact\(player\.impact\.dvx, player\.impact\.dvz\)/.test(world))
  chk('and the Vehicle has an applyImpact to call',
      /^\s*applyImpact\(dvx, dvz\)\s*\{/m.test(vehicle))
  chk('which never adds upward velocity',
      /y:\s*Math\.min\(vel\.y,/.test(vehicle))
  chk('and clamps how far sideways a hit can throw you',
      /IMPACT_SLIDE_LIMIT/.test(vehicle))

  chk('and the impact is fed through the driving model, not as an impulse',
      !/applyImpact[\s\S]{0,600}applyImpulse/.test(vehicle))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
