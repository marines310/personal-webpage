/**
 * The tow truck recovery, without a browser.
 *
 * Same shape as race.mjs, traffic.mjs and the rest: towGame.js has no THREE in
 * it, so a whole two-car recovery runs here in under a millisecond and every
 * branch can be reached deliberately rather than by driving until it happens.
 *
 * What this file can and cannot see is worth stating, because it is the same
 * split as everywhere else in this project. It CAN check the state machine,
 * the rig arithmetic and the trailer maths - which is most of the thing, and
 * all of the part that is easy to be wrong about. It CANNOT check that the
 * towing LOOKS smooth, because smoothness is a property of a sequence of
 * frames in a browser; `probe/tow.mjs` measures that, and its numbers are
 * written into the comments here so they are not lost.
 */
import {
  newTowState, startTow, stepTow, towHud, carsDown, carOnHook, nextCar,
  yokeAt, towGeometry, dragStep, hitchStage, dropStage, ease, turnToward,
  crewTarget, TOW_RIG,
  HITCH_REACH, HITCH_WINCH, HITCH_LIFT, HITCH_SECONDS,
  DROP_LOWER, DROP_RELEASE, DROP_SECONDS,
  ON_SCENE, ABANDON_AFTER, CREW_CLEAR_SECONDS
} from '../src/world/towGame.js'
import {
  TRAFFIC_LENGTHS, TRAFFIC_WIDTHS, TRAFFIC_SPEEDS, TRAFFIC_FLEET,
  getPlayerGarage, inGarageBay, garageBaySlots
} from '../src/world/islandLayout.js'
import { VEHICLE_MASS } from '../src/systems/Physics.js'
import { chooseMission } from '../src/world/missions.js'

let pass = 0, fail = 0
const chk = (what, ok, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${what}`) } else {
    fail++
    console.log(`  FAIL  ${what}${detail ? '  ' + detail : ''}`)
  }
}
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps

const CRASH = { x: 100, z: 200, island: 'hub' }
const CARS = () => ([
  { kind: 'sedan', x: 101, z: 202, heading: 0.3 },
  { kind: 'suv', x: 99, z: 197, heading: -0.2 }
])

/** A context with nobody in a tow truck and nothing near anything. */
const ctx = (over = {}) => ({
  player: null,
  tows: [],
  garage: { x: 0, z: 0 },
  atGarage: false,
  rand: () => 0.5,
  ...over
})

// ---------------------------------------------------------------------------
console.log('\n1. The rig: where the yoke is, and what hangs off it\n')

{
  const down = yokeAt(0, 0)
  const out = yokeAt(1, 0)
  const up = yokeAt(1, 1)

  chk('the boom reaches further back when it is run out',
      out.z < down.z, `${out.z} against ${down.z}`)
  chk('and it reaches back BEHIND the truck, not forwards',
      out.z < 0 && down.z < 0, `${out.z}`)
  chk('lifting raises the yoke without changing its reach',
      up.y > down.y && near(up.z, out.z), `${up.y} against ${down.y}`)
  chk('the yoke starts near the road, so it can go under a car',
      down.y < 0.5, `${down.y}`)

  // The one that would break the picture without breaking anything else: the
  // boom hinges UNDER the body and the yoke hangs BELOW the hinge, so the
  // boom always slopes down. A yoke above its own pivot is a boom pointing at
  // the sky.
  chk('the yoke hangs below the hinge at full lift',
      up.y < TOW_RIG.pivotY, `${up.y} against ${TOW_RIG.pivotY}`)
}

{
  // A car held by its front axle and rolling on its back wheels is a
  // right-angled triangle, and the two things that come out of it are how far
  // the nose is tipped and how far back the rear axle sits.
  const wheelbase = TRAFFIC_LENGTHS.sedan * 0.62
  const flat = towGeometry(wheelbase, 0)
  const lifted = towGeometry(wheelbase, TOW_RIG.lift)

  chk('a car that is not lifted is not tilted', near(flat.pitch, 0))
  chk('and it trails by its full wheelbase', near(flat.trail, wheelbase))
  chk('a lifted car is nose-up', lifted.pitch > 0.1, `${lifted.pitch.toFixed(3)}`)

  // THE ONE THAT WOULD BE INVISIBLE. A tilted car is SHORTER along the ground
  // than a flat one. Trail it by its full wheelbase anyway and every frame
  // pulls it a little further forward than it should be, which over a long
  // drive walks it into the back of the truck.
  chk('and it trails by LESS than its wheelbase, because it is tilted',
      lifted.trail < wheelbase - 0.05,
      `${lifted.trail.toFixed(3)} against ${wheelbase.toFixed(3)}`)
  chk('the triangle closes: trail and rise make the wheelbase',
      near(Math.hypot(lifted.trail, lifted.rise), wheelbase, 1e-9))

  // And it cannot be asked to stand the car on its nose.
  const silly = towGeometry(wheelbase, wheelbase * 5)
  chk('an impossible lift is clamped rather than returning NaN',
      Number.isFinite(silly.pitch) && silly.pitch < Math.PI / 2,
      `${silly.pitch}`)
}

// ---------------------------------------------------------------------------
console.log('\n2. The trailer, which is why the towing is smooth\n')

{
  const trail = 2.7
  const rear = { x: 0, z: -10 }
  const yoke = { x: 0, z: 0 }
  const at = dragStep(rear, yoke, trail)
  chk('a car too far behind is pulled up to the bar',
      near(Math.hypot(at.x - yoke.x, at.z - yoke.z), trail, 1e-9))
  chk('and it points at the yoke', near(at.heading, 0, 1e-9))
}

{
  // THE PROPERTY THAT MATTERS. Drive the yoke round a full circle in small
  // steps and the trailing car must (a) always be exactly one bar length
  // behind and (b) never move much further in one step than the yoke did.
  // Those two together ARE "no jagged moves and no warping".
  const trail = 2.7
  const rear = { x: 0, z: -trail }
  let worstBar = 0
  let worstRatio = 0
  let prev = { x: 0, z: -trail }
  const R = 12
  const STEPS = 720
  for (let i = 1; i <= STEPS; i++) {
    const a = (i / STEPS) * Math.PI * 2
    const yoke = { x: Math.sin(a) * R, z: Math.cos(a) * R - R }
    const before = { x: yoke.x, z: yoke.z }
    const at = dragStep(rear, yoke, trail)
    worstBar = Math.max(worstBar,
      Math.abs(Math.hypot(before.x - at.x, before.z - at.z) - trail))
    const moved = Math.hypot(at.x - prev.x, at.z - prev.z)
    const yokeStep = (2 * Math.PI * R) / STEPS
    worstRatio = Math.max(worstRatio, moved / yokeStep)
    prev = { x: at.x, z: at.z }
  }
  chk('the tow bar never stretches, all the way round a circle',
      worstBar < 1e-9, `worst ${worstBar}`)
  // A trailer cuts the corner, so it moves LESS than the thing towing it.
  // More would mean it was being flung about.
  chk('the car never travels further in a step than the yoke does',
      worstRatio <= 1.0001, `worst ratio ${worstRatio.toFixed(4)}`)

  // Measured in the browser with a real truck under real physics
  // (probe/tow.mjs): the towed car's biggest single-frame move was 0.923
  // against the truck's own 0.917, and the bar error was 0.
}

{
  // The degenerate frame: a car sitting exactly under the yoke. This happens
  // on the first step of a hitch if the truck reversed right over the car, and
  // dividing by that zero would put NaN into a transform and take the whole
  // scene with it.
  const rear = { x: 5, z: 5 }
  const at = dragStep(rear, { x: 5, z: 5 }, 2.7)
  chk('a car exactly under the yoke does not produce NaN',
      Number.isFinite(at.x) && Number.isFinite(at.z) && Number.isFinite(at.heading))
}

// ---------------------------------------------------------------------------
console.log('\n3. Hooking up and letting go, in stages you can watch\n')

{
  chk('the three stages add up to the whole hitch',
      near(HITCH_REACH + HITCH_WINCH + HITCH_LIFT, HITCH_SECONDS))
  chk('and the two stages add up to the whole drop',
      near(DROP_LOWER + DROP_RELEASE, DROP_SECONDS))

  const start = hitchStage(0)
  chk('nothing has happened at the start',
      start.reach === 0 && start.winch === 0 && start.lift === 0)

  const mid = hitchStage(HITCH_REACH)
  chk('the boom is out before the car starts moving',
      mid.reach === 1 && mid.winch === 0, JSON.stringify(mid))

  const winched = hitchStage(HITCH_REACH + HITCH_WINCH)
  chk('the car is in before the lift starts',
      winched.winch === 1 && winched.lift === 0, JSON.stringify(winched))

  const done = hitchStage(HITCH_SECONDS)
  // `near`, not `===`. HITCH_SECONDS is 1.2 + 2.2 + 1.6, and subtracting the
  // first two back off it in binary floating point leaves 1.5999999999999996
  // rather than 1.6 - so the lift finishes at 1 - 2e-16. That is a boom two
  // ten-thousand-trillionths of a unit short of the top, which is finished.
  chk('and everything is finished at the end',
      done.reach === 1 && done.winch === 1 && near(done.lift, 1, 1e-12),
      `lift ${done.lift}`)

  // Order matters and it is the OPPOSITE order on the way out: the lift comes
  // off first and the car rolls off the yoke second. Lower it after letting
  // go and the car drops the last half-unit onto the floor of the garage.
  const dStart = dropStage(0)
  const dLowered = dropStage(DROP_LOWER)
  const dEnd = dropStage(DROP_SECONDS)
  chk('a drop starts fully hooked up',
      dStart.lift === 1 && dStart.winch === 1)
  chk('the lift comes off before the car is released',
      dLowered.lift === 0 && dLowered.winch === 1, JSON.stringify(dLowered))
  chk('and at the end nothing is attached',
      dEnd.lift === 0 && dEnd.winch === 0)

  // Every stage is monotonic, all the way through, at any sampling rate. A
  // stage that went backwards would be a car that jerked.
  let monotonic = true
  let prev = hitchStage(-1)
  for (let t = -1; t < HITCH_SECONDS + 1; t += 0.017) {
    const now = hitchStage(t)
    if (now.reach < prev.reach || now.winch < prev.winch || now.lift < prev.lift) {
      monotonic = false
    }
    prev = now
  }
  chk('no stage of a hitch ever runs backwards', monotonic)
}

{
  chk('the easing leaves and arrives at a standstill',
      near(ease(0), 0) && near(ease(1), 1) &&
      ease(0.02) < 0.02 && ease(0.98) > 0.98,
      `${ease(0.02).toFixed(4)} / ${ease(0.98).toFixed(4)}`)
  chk('and it is clamped outside 0..1', ease(-3) === 0 && ease(3) === 1)

  // A car being winched round from lying across the road has to turn the SHORT
  // way. Interpolating the raw numbers takes 350 degrees the wrong way round,
  // which is a car spinning on the spot next to a tow truck.
  const from = 3.0
  const to = -3.0
  const half = turnToward(from, to, 0.5)
  chk('a car winched round turns the short way',
      Math.abs(half) > 3.0, `${half.toFixed(3)}`)
  chk('and it arrives where it was told to',
      near(Math.cos(turnToward(from, to, 1)), Math.cos(to), 1e-9))
}

// ---------------------------------------------------------------------------
console.log('\n4. A whole recovery, both cars\n')

{
  const s = newTowState()
  chk('nothing is happening to start with',
      s.phase === 'idle' && s.job === null)

  // Stepping an idle recovery does nothing at all - it waits to be handed a
  // finished ambulance run rather than inventing its own crashes.
  stepTow(s, 10, ctx())
  chk('and it does not start one on its own', s.phase === 'idle')

  startTow(s, CRASH, CARS())
  chk('a handover starts it', s.phase === 'waiting')
  chk('with both cars still in the road', carsDown(s.job).length === 2)
  chk('and nothing on the hook yet', carOnHook(s.job) === null)

  // The cars are COPIES. World.js goes on moving its own meshes about, and a
  // shared reference would mean the recovery's record of where a car is
  // changing under it.
  const source = CARS()
  const s2 = newTowState()
  startTow(s2, CRASH, source)
  source[0].x = -999
  chk('the handover copies the cars rather than aliasing them',
      s2.job.cars[0].x !== -999)
}

{
  const s = newTowState()
  startTow(s, CRASH, CARS())

  // Driving something else past it does nothing.
  stepTow(s, 1, ctx({ player: { x: 101, z: 202, isTow: false } }))
  chk('a saloon parked on top of the wreck cannot hook it up',
      s.phase === 'waiting')

  // A tow truck a long way off does nothing either.
  stepTow(s, 1, ctx({ player: { x: 400, z: 400, isTow: true } }))
  chk('and neither can a tow truck on the other side of the map',
      s.phase === 'waiting')

  // Up close, it starts.
  const at = ctx({ player: { x: 101, z: 203, isTow: true } })
  stepTow(s, 0.1, at)
  chk('a tow truck alongside starts hooking up', s.phase === 'hitching')
  chk('and it is hooking up the car it is standing next to',
      carOnHook(s.job).index === 0, `index ${s.job.towing}`)

  // PROGRESS PAUSES rather than falling back - the same rule the ambulance's
  // loading arrived at. Backing up a foot to line the boom up should not cost
  // you the hook-up.
  for (let i = 0; i < 10; i++) stepTow(s, 0.1, at)
  const held = s.job.hitch
  stepTow(s, 1, ctx({ player: { x: 400, z: 400, isTow: true } }))
  chk('wandering off pauses the hitch rather than losing it',
      near(s.job.hitch, held) && s.phase === 'hitching',
      `${s.job.hitch} against ${held}`)

  while (s.phase === 'hitching') stepTow(s, 0.1, at)
  chk('a finished hitch puts the car on the hook', s.phase === 'hauling')
  chk('and marks it as towed', s.job.cars[0].state === 'towed')
  chk('leaving one still in the road', carsDown(s.job).length === 1)

  // Driving around does not deliver it.
  stepTow(s, 30, ctx({ player: { x: 1, z: 1, isTow: true } }))
  chk('a long drive with no garage at the end of it delivers nothing',
      s.phase === 'hauling' && s.job.delivered === 0)

  const bay = ctx({ player: { x: 0, z: 0, isTow: true }, atGarage: true })
  stepTow(s, 0.1, bay)
  chk('arriving in the bay starts unhooking', s.phase === 'dropping')

  // Leaving half way through puts it back on the hook, because the car is
  // still physically hanging off the boom - there is nowhere else for it to be.
  stepTow(s, 0.5, bay)
  stepTow(s, 0.1, ctx({ player: { x: 0, z: 0, isTow: true }, atGarage: false }))
  chk('driving out mid-drop puts it back on the hook',
      s.phase === 'hauling' && s.job.cars[0].state === 'towed')
  chk('and the drop starts again from nothing next time', s.job.drop === 0)

  stepTow(s, 0.1, bay)
  while (s.phase === 'dropping') stepTow(s, 0.1, bay)
  chk('a finished drop delivers the car', s.job.cars[0].state === 'delivered')
  chk('and sends you back for the other one', s.phase === 'waiting')
  chk('with one still down', carsDown(s.job).length === 1)
  chk('and nothing on the hook', s.job.towing === null)

  // The second one, all the way.
  const at2 = ctx({ player: { x: 99, z: 197, isTow: true } })
  stepTow(s, 0.1, at2)
  chk('the second car can be hooked up too', s.phase === 'hitching')
  chk('and it is the OTHER car', s.job.towing === 1)
  while (s.phase === 'hitching') stepTow(s, 0.1, at2)
  stepTow(s, 0.1, bay)
  while (s.phase === 'dropping') stepTow(s, 0.1, bay)

  chk('delivering both ends the job', s.phase === 'over' && s.job === null)
  chk('and says so', s.message === 'ALL WRECKS RECOVERED')

  // And it stays over. A finished recovery does not start itself again.
  stepTow(s, 60, ctx())
  chk('a finished recovery stays finished', s.phase === 'over')
}

// ---------------------------------------------------------------------------
console.log('\n5. Which car, and the asymmetry\n')

{
  const s = newTowState()
  startTow(s, CRASH, CARS())
  chk('the nearest car is the one you are sent to',
      nextCar(s.job, { x: 99, z: 196 }).index === 1)
  chk('and from the other side, the other one',
      nextCar(s.job, { x: 102, z: 205 }).index === 0)
  chk('with no truck to measure from, the first one will do',
      nextCar(s.job, null).index === 0)

  s.job.cars[0].state = 'delivered'
  chk('a delivered car is never chosen again',
      nextCar(s.job, { x: 102, z: 205 }).index === 1)
  s.job.cars[1].state = 'delivered'
  chk('and when there are none left there is nothing to choose',
      nextCar(s.job, null) === null)
}

{
  // THE ASYMMETRY, FOR THE FOURTH TIME. Driving anything else, an AI tow truck
  // turns up and clears the scene off-screen - what you see is the sequence,
  // not a job you are failing.
  const s = newTowState()
  startTow(s, CRASH, CARS())
  const withCrew = ctx({
    player: { x: 500, z: 500, isTow: false },
    tows: [{ x: CRASH.x + 2, z: CRASH.z + 2 }]
  })
  let t = 0
  while (s.phase === 'waiting' && t < CREW_CLEAR_SECONDS * 3) {
    stepTow(s, 0.5, withCrew)
    t += 0.5
  }
  chk('an AI tow truck that turns up clears the scene',
      s.phase === 'over' && s.message === 'WRECKS RECOVERED', `after ${t}s`)
  chk('and it takes about as long as CREW_CLEAR_SECONDS says',
      t >= CREW_CLEAR_SECONDS && t < CREW_CLEAR_SECONDS + 2, `${t}s`)

  // And with nobody at all, it is eventually written off rather than sitting
  // in the road for the rest of the session.
  const s2 = newTowState()
  startTow(s2, CRASH, CARS())
  let u = 0
  while (s2.phase === 'waiting' && u < ABANDON_AFTER * 2) {
    stepTow(s2, 1, ctx({ player: { x: 500, z: 500, isTow: false } }))
    u++
  }
  chk('a crash nobody comes to is eventually cleared',
      s2.phase === 'over', `after ${u}s`)
  chk('but not before ABANDON_AFTER', u > ABANDON_AFTER, `${u}s`)

  // A job UNDER WAY is never abandoned, however long the drive back is. The
  // garage can be most of the map away from the crash.
  const s3 = newTowState()
  startTow(s3, CRASH, CARS())
  const here = ctx({ player: { x: 101, z: 202, isTow: true } })
  while (s3.phase === 'hitching' || s3.phase === 'waiting') stepTow(s3, 0.1, here)
  for (let i = 0; i < ABANDON_AFTER * 2; i++) {
    stepTow(s3, 1, ctx({ player: { x: 300, z: 300, isTow: true } }))
  }
  chk('a recovery under way is never timed out from under you',
      s3.phase === 'hauling', s3.phase)
}

// ---------------------------------------------------------------------------
console.log('\n6. The HUD, and the rule about whose callout it is\n')

{
  const s = newTowState()
  const idle = towHud(s, true, null, { x: 0, z: 0 })
  chk('nothing is shown when there is nothing to do', !idle.active)

  startTow(s, CRASH, CARS())
  const mine = towHud(s, true, { x: 90, z: 190 }, { x: 0, z: 0 })
  chk('a live recovery is shown to a tow truck', mine.active && mine.mine)
  chk('and it points at a car, not at the middle of the crash',
      mine.target.x === s.job.cars[1].x, JSON.stringify(mine.target))

  const theirs = towHud(s, false, { x: 90, z: 190 }, { x: 0, z: 0 })
  chk('and it is NOT shown to somebody driving a bus', !theirs.mine)

  // THE ONE PLACE THE RULE LIVES. Mike settled this twice over the fire and
  // the pursuit: the HUD is a list of things you can DO, not a list of things
  // that are happening. A wreck you cannot lift belongs in the world, and it
  // is already there - you can see it in the road.
  chk('chooseMission drops a recovery that is not yours',
      chooseMission([theirs]) === null)
  chk('and keeps one that is', chooseMission([mine]) === mine)

  // The arrow turns round for the drive back. That split is the whole reason
  // hauling is its own phase.
  const here = ctx({ player: { x: 101, z: 202, isTow: true } })
  while (s.phase !== 'hauling') stepTow(s, 0.1, here)
  const back = towHud(s, true, { x: 101, z: 202 }, { x: 7, z: -20 })
  chk('once loaded, the arrow points at the garage',
      back.target.x === 7 && back.target.z === -20)
  chk('and the bar is put away for the drive', !back.showBar)

  const hitching = newTowState()
  startTow(hitching, CRASH, CARS())
  stepTow(hitching, 0.1, here)
  stepTow(hitching, 1, here)
  const bar = towHud(hitching, true, { x: 101, z: 202 }, null)
  chk('hooking up shows a bar that fills',
      bar.showBar && bar.progress > 0 && bar.progress < 1,
      `${bar.progress.toFixed(2)}`)
  chk('and it is labelled as what it is', bar.barLabel === 'HOOKING UP')
}

{
  // The AI is only ever sent to a scene it can still do something about.
  const s = newTowState()
  chk('no target when there is no job', crewTarget(s) === null)
  startTow(s, CRASH, CARS())
  chk('a waiting job sends the AI to the crash',
      crewTarget(s).x === CRASH.x && crewTarget(s).z === CRASH.z)
  const here = ctx({ player: { x: 101, z: 202, isTow: true } })
  while (s.phase !== 'hauling') stepTow(s, 0.1, here)
  chk('but not once the player is dealing with it', crewTarget(s) === null)
}

// ---------------------------------------------------------------------------
console.log('\n7. The truck itself, and the garage it delivers to\n')

{
  // THE TRAP THIS FLEET ALREADY FELL INTO ONCE. GARAGE_DOOR_WIDTH and
  // GARAGE_DEPTH are a max over the whole fleet's tables, so a vehicle wider
  // than the bus or longer than it grows the garage, which moves the plot it
  // stands on, which moves the town around it. The monster truck did exactly
  // that at 2.6 wide and `stations.mjs` caught it four hundred units away.
  chk('the tow truck is no wider than the widest thing already here',
      TRAFFIC_WIDTHS.tow <= TRAFFIC_WIDTHS.bus,
      `${TRAFFIC_WIDTHS.tow} against ${TRAFFIC_WIDTHS.bus}`)
  chk('and no longer',
      TRAFFIC_LENGTHS.tow <= TRAFFIC_LENGTHS.bus,
      `${TRAFFIC_LENGTHS.tow} against ${TRAFFIC_LENGTHS.bus}`)

  // A KIND IN THE FLEET NEEDS A ROW IN EVERY TABLE. Adding `tow` to
  // TRAFFIC_FLEET without adding it to TRAFFIC_SPEEDS gave every tow truck a
  // cruising speed of NaN, which propagated into its lane position and took
  // the whole traffic update down with "cannot read properties of undefined".
  // Nothing said the tables had to agree, so now something does.
  for (const kind of Object.keys(TRAFFIC_FLEET)) {
    chk(`${kind.padEnd(11)} has a length, a width and a speed`,
        typeof TRAFFIC_LENGTHS[kind] === 'number' &&
        typeof TRAFFIC_WIDTHS[kind] === 'number' &&
        typeof TRAFFIC_SPEEDS[kind] === 'number' &&
        typeof VEHICLE_MASS[kind] === 'number')
  }

  chk('a wrecker is heavier than the ambulance and lighter than the engine',
      VEHICLE_MASS.tow > VEHICLE_MASS.ambulance &&
      VEHICLE_MASS.tow < VEHICLE_MASS.fire)
  chk('and it is not a blue-light vehicle, so it is not quick',
      TRAFFIC_SPEEDS.tow < TRAFFIC_SPEEDS.ambulance)

  // There have to BE tow trucks on the road, or the unattended case has
  // nobody to turn up - see CREW_CLEAR_SECONDS.
  chk('there are tow trucks in the traffic to answer an unattended wreck',
      TRAFFIC_FLEET.tow > 0)
}

{
  const g = getPlayerGarage()
  chk('there is a garage to deliver to', !!g)

  chk('the middle of the bay is in the bay', inGarageBay(g, g.x, g.z))
  chk('and the apron outside it is not',
      !inGarageBay(g, g.apron.x, g.apron.z))
  chk('a margin shrinks the bay rather than growing it',
      inGarageBay(g, g.x, g.z, 2) &&
      !inGarageBay(g, g.x + Math.sin(g.heading) * (g.depth / 2 - 0.5),
                   g.z + Math.cos(g.heading) * (g.depth / 2 - 0.5), 2))

  const slots = garageBaySlots(g, 2)
  chk('there are two places to leave a wreck', slots.length === 2)
  for (const [i, slot] of slots.entries()) {
    chk(`slot ${i} is inside the bay`, inGarageBay(g, slot.x, slot.z))
  }

  // They must not be on top of each other, and they must not be on top of the
  // middle of the bay - which is where the player's own vehicle parks and
  // where the picker opens.
  const apart = Math.hypot(slots[0].x - slots[1].x, slots[0].z - slots[1].z)
  chk('the two wrecks do not park inside each other',
      apart > TRAFFIC_WIDTHS.suv + TRAFFIC_WIDTHS.sedan,
      `${apart.toFixed(2)} apart`)
  for (const [i, slot] of slots.entries()) {
    const off = Math.hypot(slot.x - g.x, slot.z - g.z)
    chk(`slot ${i} leaves the middle of the bay clear`,
        off > TRAFFIC_WIDTHS.tow, `${off.toFixed(2)} from the centre`)
  }

  // ON_SCENE has to be reachable: a truck whose boom reaches 5.1 units behind
  // it cannot hook a car it has to be within one unit of.
  const reach = Math.abs(yokeAt(1, 0).z)
  chk('you can get close enough to hook a car up', ON_SCENE > reach,
      `${ON_SCENE} against a ${reach.toFixed(2)} boom`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exitCode = fail ? 1 : 0
