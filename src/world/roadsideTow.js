/**
 * Running dry: the tow truck that comes for YOU.
 *
 * Stage three of the gas feature. Run the tank empty and the engine dies -
 * you can still steer and brake while the car coasts, but nothing pulls. Once
 * it has rolled to a stop a recovery truck is sent. It drives in along the
 * roads from out of sight, pulls round your car, stops in front of it and
 * backs up to it, hooks your front wheels onto its wheel-lift, and tows you to
 * the nearest gas station. It sets you down on a pump bay and drives off, and
 * the attendant from stage two walks out and fills you up.
 *
 * No THREE, like towGame.js and gasGame.js. Everything here is a decision on
 * plain objects - which road the truck takes, where it stops, where your car
 * is on every frame - so a test can watch a whole rescue in a millisecond.
 * World.js draws the truck where this says and puts your car's physics body
 * where this says, and decides nothing.
 *
 * THE SAME TOW BAR AS THE WRECK RECOVERY, ON PURPOSE
 * --------------------------------------------------
 * Mike's rule for the wreck recovery was "SMOOTH. No jagged moves and no
 * warping to a new location." The same rule obviously holds when the car on
 * the hook is the one the camera is following, so this reuses towGame.js's
 * rig, its trailer step and its hitch and drop timings rather than a second
 * copy of any of them: the yoke is where `yokeAt()` says, your rear axle is
 * dragged exactly `trail` behind it by `dragStep()`, and the hook-up is the
 * same REACH / WINCH / LIFT you can watch on a wreck. Nothing teleports. The
 * truck appears from a road out of view and leaves down another.
 *
 * WHY IT DRIVES A PATH AND NOT THE TRAFFIC MODEL
 * ----------------------------------------------
 * The traffic follows lanes and can only ever be ON a lane. This truck has to
 * leave the road twice - to pull up in front of a car that may have stopped
 * on the verge, and to drive onto a forecourt - so it follows a path built
 * once when the job starts: the lanes in between, smoothed, with a Hermite
 * curve on each end to get on and off them. Its speed along that path is
 * capped by how tightly the path bends, so it slows for corners on its own.
 */

import { pointAlong } from './islandLayout.js'
import {
  TOW_RIG, yokeAt, towGeometry, dragStep, hitchStage, dropStage,
  HITCH_SECONDS, DROP_SECONDS, ease, turnToward
} from './towGame.js'

// ---------------------------------------------------------------------------
// NUMBERS
// ---------------------------------------------------------------------------

/**
 * How far along the roads the truck starts.
 *
 * Far enough that it does not pop into being on screen - the chase camera
 * sees a few dozen units - and near enough that you are not sat waiting for a
 * minute. At cruise this is about ten seconds of watching it come.
 */
export const RESCUE_SPAWN_DISTANCE = 110
/** And at least this far away in a straight line. */
export const RESCUE_OUT_OF_SIGHT = 60

/** Cruise, and how hard it speeds up and slows down, in world units. */
export const RESCUE_CRUISE = 15
export const RESCUE_HAUL_CRUISE = 13
export const RESCUE_ACCEL = 3.5
/** Sideways acceleration it will take round a bend; sets corner speeds. */
export const RESCUE_CORNERING = 3

/** How far past your car it pulls up before backing on to it. */
export const RESCUE_BACK_UP = 7
export const RESCUE_BACK_SPEED = 2.5

/** The truck's own size, the same numbers as TRAFFIC_LENGTHS / WIDTHS.tow. */
export const RESCUE_TRUCK_LENGTH = 6.4
export const RESCUE_TRUCK_WIDTH = 2.3

/** Room left between the truck and your car as it goes round you. */
export const RESCUE_PASS_CLEARANCE = 0.9

/**
 * Stopped for this long before anyone is sent. A car still settling on its
 * springs reads a little speed for a moment, and dispatching on the first
 * still frame would freeze it mid-roll.
 */
export const RESCUE_SETTLE = 0.6

/** Below this the car counts as stopped. The same figure as gasGame.js. */
export const RESCUE_STOPPED = 0.8

/** How long a straight run the truck makes onto the bay. */
export const RESCUE_LEAD_IN = 16

/** How far it drives away afterwards before it is put away. */
export const RESCUE_EXIT_DISTANCE = 110

/** How far each end of a lane run is cut back to make room for the curve on. */
const LANE_LEAD = 16

/** How far out from the car a path still counts as passing it. */
const BAND = 6

/**
 * A lane that only leads to a dead end is a three-point turn, and so is
 * swapping onto the lane coming back the other way. A truck can do either if
 * there is no other way round, but never to save fifty units.
 */
const DEAD_END_COST = 200
const U_TURN_COST = 300

/** The cost of going from the end of one lane onto the start of the next. */
function turnCost(lanes, from, to) {
  const a = lanes[from].points
  const b = lanes[to].points
  const h0 = bearing(a[a.length - 2], a[a.length - 1])
  const h1 = bearing(b[0], b[1])
  let d = Math.abs(h1 - h0)
  if (d > Math.PI) d = Math.PI * 2 - d
  return (d > Math.PI * 0.7 ? U_TURN_COST : 0) +
    (lanes[to].deadEnd ? DEAD_END_COST : 0)
}

// ---------------------------------------------------------------------------
// PATHS
// ---------------------------------------------------------------------------

/**
 * The closest point on any traffic lane, preferring lanes that run the way
 * you are pointing.
 *
 * Roads are two lanes, one each way, and the nearer of the two is a coin toss
 * - so without the preference a car stopped on the right-hand side of a road
 * is half the time joined to the lane coming the other way, and the truck
 * would have to turn round to reach it.
 */
export function nearestLanePoint(network, x, z, heading = null) {
  const fx = heading === null ? 0 : Math.sin(heading)
  const fz = heading === null ? 0 : Math.cos(heading)
  let any = null
  let aligned = null

  network.lanes.forEach((lane, index) => {
    // The racing circuit and the arena floor are lanes, to keep their bridges
    // joined, but no tow truck is driving onto the speedway.
    if (lane.noTraffic) return
    const pts = lane.points
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len2 = dx * dx + dz * dz
      if (len2 < 1e-9) continue
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
      const px = a.x + dx * t
      const pz = a.z + dz * t
      const gap = Math.hypot(x - px, z - pz)
      const len = Math.sqrt(len2)
      const hit = {
        lane: index, s: lane.cumulative[i] + len * t, x: px, z: pz, gap,
        align: (dx * fx + dz * fz) / len
      }
      if (!any || gap < any.gap) any = hit
      if (hit.align >= 0.3 && (!aligned || gap < aligned.gap)) aligned = hit
    }
  })

  if (heading === null || !aligned) return any
  // Pointing along a road is worth a detour across it, not half an island.
  return aligned.gap <= any.gap + 25 ? aligned : any
}

/** The part of one lane's polyline between two distances along it. */
function laneSlice(lane, s0, s1) {
  const out = [pointAlong(lane, s0)]
  for (let i = 0; i < lane.points.length; i++) {
    const c = lane.cumulative[i]
    if (c > s0 + 1e-6 && c < s1 - 1e-6) out.push(lane.points[i])
  }
  out.push(pointAlong(lane, s1))
  return out.map(p => ({ x: p.x, z: p.z }))
}

/**
 * The lanes from one point on the network to another, shortest by length.
 *
 * By length and not by hops: `routeToPoint()` counts junctions, which is right
 * for a fire engine choosing which way to turn and wrong for drawing the
 * road a truck actually takes. A hundred and seventy lanes is nothing to run
 * Dijkstra over once.
 */
export function laneRoute(network, from, to) {
  const lanes = network.lanes
  if (from.lane === to.lane && to.s >= from.s) {
    return laneSlice(lanes[from.lane], from.s, to.s)
  }

  const dist = new Array(lanes.length).fill(Infinity)
  const prev = new Array(lanes.length).fill(-1)
  const done = new Array(lanes.length).fill(false)
  const start = lanes[from.lane]
  for (const n of start.next) {
    if (lanes[n].noTraffic) continue
    const d = start.length - from.s + turnCost(lanes, from.lane, n)
    if (d < dist[n]) { dist[n] = d; prev[n] = -2 }
  }

  for (;;) {
    let at = -1
    for (let i = 0; i < lanes.length; i++) {
      if (!done[i] && dist[i] < Infinity && (at < 0 || dist[i] < dist[at])) at = i
    }
    if (at < 0) return null
    if (at === to.lane) break
    done[at] = true
    for (const n of lanes[at].next) {
      if (lanes[n].noTraffic || done[n]) continue
      const d = dist[at] + lanes[at].length + turnCost(lanes, at, n)
      if (d < dist[n]) { dist[n] = d; prev[n] = at }
    }
  }

  const chain = []
  for (let at = to.lane; at !== -2; at = prev[at]) chain.unshift(at)
  const out = laneSlice(start, from.s, start.length)
  chain.forEach((index, i) => {
    const lane = lanes[index]
    const end = i === chain.length - 1 ? to.s : lane.length
    // LANES OVERLAP AT A JUNCTION. One runs on into the junction box and the
    // next starts a few units back from where it ended - up to five on the
    // hub's corners - so joining them end to start draws the truck driving on
    // into the junction, reversing and turning round. Cut both where they
    // come closest instead, and what is left is a corner, which smooth()
    // rounds off.
    const from = Math.min(end, joinLanes(out, lane))
    out.push(...laneSlice(lane, from, end).slice(1))
  })
  return out
}

/**
 * Where the polyline so far and the start of the next lane come closest.
 * Trims `out` back to that point and returns how far along the lane it is.
 */
function joinLanes(out, lane, within = 15) {
  let best = null
  for (let s = 0; s <= Math.min(within, lane.length); s += 0.5) {
    const h = pointAlong(lane, s)
    let run = 0
    for (let i = out.length - 1; i > 0 && run <= within; i--) {
      const a = out[i - 1]
      const b = out[i]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const len2 = dx * dx + dz * dz
      run += Math.sqrt(len2)
      if (len2 < 1e-9) continue
      const t = Math.max(0, Math.min(1, ((h.x - a.x) * dx + (h.z - a.z) * dz) / len2))
      const q = { x: a.x + dx * t, z: a.z + dz * t }
      const gap = Math.hypot(h.x - q.x, h.z - q.z)
      if (!best || gap < best.gap - 1e-6) best = { gap, s, i, q }
    }
  }
  if (!best) return 0
  out.length = best.i
  out.push(best.q)
  return best.s
}

/**
 * Where a truck should start so that it is `distance` along the roads from a
 * point on the network - out of sight, but on its way.
 *
 * Walks the lanes BACKWARDS from the target, so wherever it starts, the way
 * from there to here is known to exist. Of the places exactly that far back
 * it takes the one furthest from the target in a straight line, which is the
 * one least likely to be on screen.
 */
export function spawnBehind(network, to, distance = RESCUE_SPAWN_DISTANCE) {
  const lanes = network.lanes
  const into = lanes.map(() => [])
  lanes.forEach((lane, i) => { for (const n of lane.next) into[n].push(i) })

  if (to.s >= distance) {
    const at = pointAlong(lanes[to.lane], to.s - distance, false, true)
    return { lane: to.lane, s: to.s - distance, x: at.x, z: at.z, heading: at.heading }
  }

  // Distance from the START of each lane to the target.
  const reach = new Array(lanes.length).fill(Infinity)
  reach[to.lane] = to.s
  const queue = [to.lane]
  let best = null

  while (queue.length) {
    queue.sort((a, b) => reach[a] - reach[b])
    const k = queue.shift()
    for (const j of into[k]) {
      const lane = lanes[j]
      if (lane.noTraffic) continue
      const r = reach[k] + lane.length
      if (r >= reach[j]) continue
      reach[j] = r
      if (r >= distance) {
        const s = r - distance
        const at = pointAlong(lane, s, false, true)
        const far = Math.hypot(at.x - to.x, at.z - to.z)
        if (!best || far > best.far) {
          best = { lane: j, s, x: at.x, z: at.z, heading: at.heading, far }
        }
      } else {
        queue.push(j)
      }
    }
  }
  return best
}

/** Even spacing, so smoothing and curvature mean the same thing everywhere. */
function resample(points, step = 1) {
  if (points.length < 2) return points.slice()
  const out = [{ x: points[0].x, z: points[0].z }]
  let carry = 0
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    let d = step - carry
    while (d <= len) {
      const t = d / len
      out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
      d += step
    }
    carry = len - (d - step)
  }
  const last = points[points.length - 1]
  const tail = out[out.length - 1]
  if (Math.hypot(last.x - tail.x, last.z - tail.z) > 1e-3) out.push({ x: last.x, z: last.z })
  return out
}

/**
 * Round off the corners.
 *
 * Lanes meet at a junction a few units apart - that is where the traffic's
 * position jumps sideways and has to be eased in the renderer. A path made of
 * them has the same step in it. A few passes of a moving average turn each
 * step into the curve a driver would actually take, and leave the straights
 * exactly where they were.
 */
function smooth(points, radius = 5, passes = 4, keep = 1) {
  let pts = points
  for (let p = 0; p < passes; p++) {
    const next = pts.map((q, i) => {
      if (i < keep || i > pts.length - 1 - keep) return q
      const r = Math.min(radius, i, pts.length - 1 - i)
      let x = 0, z = 0
      for (let k = -r; k <= r; k++) { x += pts[i + k].x; z += pts[i + k].z }
      return { x: x / (2 * r + 1), z: z / (2 * r + 1) }
    })
    pts = next
  }
  return pts
}

/** A cubic Hermite from one pose to another: leaves and arrives pointing true. */
function hermite(a, ha, b, hb, step = 1) {
  const chord = Math.hypot(b.x - a.x, b.z - a.z)
  if (chord < 1e-6) return [{ x: a.x, z: a.z }]
  const m = chord
  const t0x = Math.sin(ha) * m, t0z = Math.cos(ha) * m
  const t1x = Math.sin(hb) * m, t1z = Math.cos(hb) * m
  const n = Math.max(2, Math.ceil(chord / step) * 2)
  const out = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const t2 = t * t, t3 = t2 * t
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t
    const h01 = -2 * t3 + 3 * t2, h11 = t3 - t2
    out.push({
      x: h00 * a.x + h10 * t0x + h01 * b.x + h11 * t1x,
      z: h00 * a.z + h10 * t0z + h01 * b.z + h11 * t1z
    })
  }
  return out
}

function bearing(a, b) { return Math.atan2(b.x - a.x, b.z - a.z) }

/**
 * A drivable path from one pose to another: a curve onto the roads, the
 * roads, and a curve off them. Either end may be left as the road itself by
 * passing `onRoad`.
 */
export function routeBetween(network, from, to) {
  const a = nearestLanePoint(network, from.x, from.z, from.heading)
  const b = nearestLanePoint(network, to.x, to.z, to.heading)
  if (!a || !b) return null
  const road = laneRoute(network, a, b)
  if (!road) return null

  let mid = smooth(resample(road))
  // Cut room for the curves on and off. On a short run there is not enough
  // road to cut, and the whole thing becomes one curve.
  if (mid.length > LANE_LEAD * 2 + 4) {
    mid = mid.slice(LANE_LEAD, mid.length - LANE_LEAD)
  } else {
    return resample(hermite(from, from.heading, to, to.heading))
  }

  const first = mid[0]
  const last = mid[mid.length - 1]
  const onto = hermite(from, from.heading, first, bearing(first, mid[1]))
  const off = hermite(last, bearing(mid[mid.length - 2], last), to, to.heading)
  // A light pass over the joins as well, so leaving the curve for the road
  // is not a corner of its own. The first and last few points are kept as
  // they are: those are the poses the truck starts and stops in, and moving
  // them swings its heading on the first frame of a leg - which, with a car
  // on the hook five units behind, throws the car sideways.
  return smooth(resample([...onto, ...mid.slice(1, -1), ...off]), 2, 2, 4)
}

/**
 * Bend a path out round a parked car, so the truck goes past it rather than
 * through it.
 *
 * Measured in the car's own frame: anything alongside the car is pushed out to
 * one side until there is clearance, and the push fades in behind the car and
 * out again in front of it. The side is whichever one the path was already
 * on, so it pulls out round you the way a driver would.
 */
export function passAround(points, car, opts = {}) {
  const fx = Math.sin(car.heading)
  const fz = Math.cos(car.heading)
  const sx = fz, sz = -fx
  const half = car.length / 2
  const need = car.width / 2 + RESCUE_TRUCK_WIDTH / 2 + RESCUE_PASS_CLEARANCE
  const fadeBehind = opts.fadeBehind ?? 10
  const fadeAhead = opts.fadeAhead ?? 8
  const after = half + RESCUE_TRUCK_LENGTH / 2

  let side = 0
  for (const p of points) {
    const a = (p.x - car.x) * fx + (p.z - car.z) * fz
    const l = (p.x - car.x) * sx + (p.z - car.z) * sz
    if (Math.abs(a) <= half && Math.abs(l) < need + BAND) side += l
  }
  side = side < 0 ? -1 : 1

  return points.map((p) => {
    const a = (p.x - car.x) * fx + (p.z - car.z) * fz
    const l = (p.x - car.x) * sx + (p.z - car.z) * sz
    let w = 0
    if (a >= -half - RESCUE_TRUCK_LENGTH / 2 && a <= after) w = 1
    else if (a < -half - RESCUE_TRUCK_LENGTH / 2) {
      w = ease(1 - (-half - RESCUE_TRUCK_LENGTH / 2 - a) / fadeBehind)
    } else w = ease(1 - (a - after) / fadeAhead)
    // Only the road you are on. Another street running past a few units
    // further out is not in the way and must not be dragged across the map.
    if (Math.abs(l) > need + BAND) return p
    w *= Math.abs(l) <= need ? 1 : ease(1 - (Math.abs(l) - need) / BAND)
    if (w <= 0) return p
    const want = side * need
    const shift = (side > 0 ? Math.max(0, want - l) : Math.min(0, want - l)) * w
    return { x: p.x + sx * shift, z: p.z + sz * shift }
  })
}

/**
 * A path with a speed limit at every point: the cruise, or slower where it
 * bends, and coming down in time to stop at the end.
 */
export function makePath(points, cruise = RESCUE_CRUISE, startHeading = null) {
  const pts = points.map(p => ({ x: p.x, z: p.z }))
  const cumulative = [0]
  for (let i = 1; i < pts.length; i++) {
    cumulative.push(cumulative[i - 1] +
      Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z))
  }
  const length = cumulative[cumulative.length - 1]

  const limit = pts.map((p, i) => {
    const lo = Math.max(0, i - 3)
    const hi = Math.min(pts.length - 1, i + 3)
    if (hi - lo < 2) return cruise
    const h0 = bearing(pts[lo], pts[Math.min(lo + 1, hi)])
    const h1 = bearing(pts[Math.max(hi - 1, lo)], pts[hi])
    let turn = h1 - h0
    while (turn > Math.PI) turn -= Math.PI * 2
    while (turn < -Math.PI) turn += Math.PI * 2
    const run = Math.max(1e-6, cumulative[hi] - cumulative[lo])
    const bend = Math.abs(turn) / run
    return bend < 1e-6 ? cruise : Math.min(cruise, Math.sqrt(RESCUE_CORNERING / bend))
  })
  limit[limit.length - 1] = 0
  for (let i = limit.length - 2; i >= 0; i--) {
    const ds = cumulative[i + 1] - cumulative[i]
    limit[i] = Math.min(limit[i], Math.sqrt(limit[i + 1] ** 2 + 2 * RESCUE_ACCEL * ds))
  }
  return { points: pts, cumulative, length, limit, startHeading }
}

function limitAt(path, s) {
  const { cumulative, limit } = path
  let i = 0
  while (i < cumulative.length - 2 && cumulative[i + 1] < s) i++
  const span = cumulative[i + 1] - cumulative[i]
  const t = span > 1e-9 ? (s - cumulative[i]) / span : 0
  return limit[i] + (limit[i + 1] - limit[i]) * Math.max(0, Math.min(1, t))
}

/**
 * Move along a path for one frame. Returns true on arriving.
 *
 * Never quite stops short: the limit is zero AT the end, and a speed that
 * only ever approaches zero would crawl the last centimetre forever.
 */
function drive(mover, path, delta, maxSpeed = Infinity) {
  const cap = Math.min(maxSpeed, limitAt(path, mover.s))
  mover.speed = Math.max(0.6, Math.min(cap, mover.speed + RESCUE_ACCEL * delta))
  mover.s = Math.min(path.length, mover.s + mover.speed * delta)
  if (mover.s >= path.length - 1e-6) { mover.speed = 0; return true }
  return false
}

// ---------------------------------------------------------------------------
// THE JOB
// ---------------------------------------------------------------------------

/** Where your car's rear axle is, given where its middle is. */
function rearOf(car, wheelbase) {
  return {
    x: car.x - Math.sin(car.heading) * wheelbase / 2,
    z: car.z - Math.cos(car.heading) * wheelbase / 2
  }
}

/** The truck's middle, given where its yoke has to be. */
function truckFor(yoke, heading, reach01, lift01) {
  const z = yokeAt(reach01, lift01).z
  return { x: yoke.x - Math.sin(heading) * z, z: yoke.z - Math.cos(heading) * z, heading }
}

/** The yoke in the world, for a truck pose and a rig stage. */
export function yokeOf(truck, reach01, lift01) {
  const at = yokeAt(reach01, lift01)
  return {
    x: truck.x + Math.sin(truck.heading) * at.z,
    z: truck.z + Math.cos(truck.heading) * at.z,
    lift: at.y - TOW_RIG.restY
  }
}

/** The fleet's wheels sit at 0.31 of the length either side of the middle. */
export function wheelbaseOf(length) { return length * 0.62 }

/**
 * Plan a rescue: where the truck starts, every path it will drive, and which
 * bay it is taking you to. Null if there is no way to do it - no road, or no
 * gas station reachable from here - and World.js falls back on a can of fuel.
 *
 * `car` is { x, z, heading, length, width }.
 */
export function planRescue(network, car, bays) {
  if (!bays || !bays.length) return null
  const wheelbase = wheelbaseOf(car.length)
  const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) }

  // Where the truck has to stand to hook up: full reach, boom down, yoke at
  // your front axle. And a little further on, where it stops before backing.
  const front = { x: car.x + f.x * wheelbase / 2, z: car.z + f.z * wheelbase / 2 }
  const hook = truckFor(front, car.heading, 1, 0)
  const pullUp = {
    x: hook.x + f.x * RESCUE_BACK_UP, z: hook.z + f.z * RESCUE_BACK_UP,
    heading: car.heading
  }

  const join = nearestLanePoint(network, pullUp.x, pullUp.z, pullUp.heading)
  if (!join) return null
  // A road that doubles back can put a point 110 units away by road 40 away
  // across the grass, in plain view. Go further back until it is out of it.
  let spawn = null
  for (const back of [RESCUE_SPAWN_DISTANCE, RESCUE_SPAWN_DISTANCE * 1.5,
    RESCUE_SPAWN_DISTANCE * 2]) {
    const tryAt = spawnBehind(network, join, back)
    if (!tryAt) continue
    const far = Math.hypot(tryAt.x - car.x, tryAt.z - car.z)
    if (!spawn || far > spawn.far) spawn = { ...tryAt, far }
    if (far >= RESCUE_OUT_OF_SIGHT) break
  }
  if (!spawn) return null
  let toCar = routeBetween(network, spawn, pullUp)
  if (!toCar) return null
  toCar = passAround(toCar, car)

  // The nearest bay, by the road. A pump just across the water is not near
  // if the bridge is a mile away.
  let best = null
  for (const bay of bays) {
    const p = parkedTruck(bay, wheelbase)
    const lead = {
      x: p.x - Math.sin(bay.heading) * RESCUE_LEAD_IN,
      z: p.z - Math.cos(bay.heading) * RESCUE_LEAD_IN,
      heading: bay.heading
    }
    const road = routeBetween(network, hook, lead)
    if (!road) continue
    const haul = makePath([...road, { x: p.x, z: p.z }], RESCUE_HAUL_CRUISE, hook.heading)
    if (!best || haul.length < best.haul.length) best = { bay, haul, parked: p }
  }
  if (!best) return null

  // Away down the road, the way the bay faces.
  const bay = best.bay
  const out = {
    x: best.parked.x + Math.sin(bay.heading) * 10,
    z: best.parked.z + Math.cos(bay.heading) * 10,
    heading: bay.heading
  }
  const leave = nearestLanePoint(network, out.x, out.z, out.heading)
  const away = leave && aheadOf(network, leave, RESCUE_EXIT_DISTANCE)
  const exit = away ? routeBetween(network, out, away) : null

  return {
    bay,
    wheelbase,
    hook,
    pullUp,
    spawn: { x: spawn.x, z: spawn.z, heading: spawn.heading },
    approach: makePath(toCar, RESCUE_CRUISE, spawn.heading),
    backUp: makePath([pullUp, hook], RESCUE_BACK_SPEED),
    haul: best.haul,
    parked: best.parked,
    exit: makePath([{ x: best.parked.x, z: best.parked.z }, ...(exit || [out])],
      RESCUE_CRUISE, bay.heading)
  }
}

/** Where the truck stands when the car it is towing is centred on a bay. */
function parkedTruck(bay, wheelbase) {
  const geo = towGeometry(wheelbase, TOW_RIG.lift)
  const rear = {
    x: bay.x - Math.sin(bay.heading) * wheelbase / 2,
    z: bay.z - Math.cos(bay.heading) * wheelbase / 2
  }
  const yoke = {
    x: rear.x + Math.sin(bay.heading) * geo.trail,
    z: rear.z + Math.cos(bay.heading) * geo.trail
  }
  return truckFor(yoke, bay.heading, 1, 1)
}

/** A point some way on down the lanes from here, never into a dead end. */
function aheadOf(network, from, distance) {
  const lanes = network.lanes
  let lane = from.lane
  let s = from.s + distance
  for (let guard = 0; guard < 40 && s > lanes[lane].length; guard++) {
    s -= lanes[lane].length
    const next = lanes[lane].next.filter(n => !lanes[n].noTraffic)
    if (!next.length) { s = lanes[lane].length; break }
    lane = next.find(n => !lanes[n].deadEnd) ?? next[0]
  }
  s = Math.min(s, lanes[lane].length)
  const at = pointAlong(lanes[lane], s, false, true)
  return { x: at.x, z: at.z, heading: at.heading }
}

/** A rescue that has been asked for and not yet sent. */
export function newRescue() {
  return { phase: 'stalled', settle: 0, t: 0 }
}

/**
 * Has the rescue got hold of the car? World.js stops the car's own physics
 * for exactly this long, and gives it back the frame it is set down.
 */
export function rescueHolds(rescue) {
  return !!rescue && ['arriving', 'backing', 'hitching', 'hauling', 'dropping']
    .includes(rescue.phase)
}

/**
 * One frame of the rescue.
 *
 * `ctx` is { player: { x, z, heading, speed, length, width }, network, bays }.
 * Mutates `rescue`. After it, `rescue.truck` is where to draw the truck (and
 * `rescue.rig` how far its boom is out and up), and while the rescue holds the
 * car, `rescue.car` is where your car is: its middle, heading, pitch and how
 * far its middle has risen.
 */
export function stepRescue(rescue, delta, ctx) {
  if (!rescue || rescue.phase === 'done' || rescue.phase === 'failed') return rescue

  if (rescue.phase === 'stalled') {
    const player = ctx.player
    if (!player) return rescue
    rescue.settle = Math.abs(player.speed || 0) <= RESCUE_STOPPED
      ? rescue.settle + delta : 0
    if (rescue.settle < RESCUE_SETTLE) return rescue

    const car = {
      x: player.x, z: player.z, heading: player.heading,
      length: player.length || 4.4, width: player.width || 2
    }
    const plan = planRescue(ctx.network, car, ctx.bays)
    if (!plan) { rescue.phase = 'failed'; return rescue }
    Object.assign(rescue, plan)
    rescue.stopped = car
    rescue.car = { x: car.x, z: car.z, heading: car.heading, pitch: 0, rise: 0 }
    rescue.mover = { s: 0, speed: 0 }
    rescue.phase = 'arriving'
    rescue.rig = { reach: 0, lift: 0 }
    placeTruck(rescue, rescue.approach)
    return rescue
  }

  const wheelbase = rescue.wheelbase

  if (rescue.phase === 'arriving') {
    const arrived = drive(rescue.mover, rescue.approach, delta)
    placeTruck(rescue, rescue.approach)
    if (arrived) { rescue.phase = 'backing'; rescue.mover = { s: 0, speed: 0 } }
    return rescue
  }

  if (rescue.phase === 'backing') {
    const arrived = drive(rescue.mover, rescue.backUp, delta, RESCUE_BACK_SPEED)
    // Backing up: along the path, still facing the way it came.
    // It straightens up as it goes, from however it came to rest to square
    // with your car, rather than snapping square on the first frame.
    const at = pointAlong(rescue.backUp, rescue.mover.s)
    if (rescue.pulledUp === undefined) rescue.pulledUp = rescue.truck.heading
    const k = ease(rescue.mover.s / Math.max(1e-6, rescue.backUp.length))
    rescue.truck = {
      x: at.x, z: at.z,
      heading: turnToward(rescue.pulledUp, rescue.stopped.heading, k),
      speed: -rescue.mover.speed
    }
    if (arrived) { rescue.phase = 'hitching'; rescue.t = 0 }
    return rescue
  }

  if (rescue.phase === 'hitching') {
    rescue.t += delta
    const stage = hitchStage(rescue.t)
    rescue.rig = { reach: stage.reach, lift: stage.lift }
    rescue.truck.speed = 0
    const yoke = yokeOf(rescue.truck, stage.reach, stage.lift)
    const geo = towGeometry(wheelbase, yoke.lift)
    const from = rearOf(rescue.stopped, wheelbase)
    const straight = {
      x: yoke.x - Math.sin(rescue.truck.heading) * geo.trail,
      z: yoke.z - Math.cos(rescue.truck.heading) * geo.trail
    }
    const k = ease(stage.winch)
    const rear = {
      x: from.x + (straight.x - from.x) * k,
      z: from.z + (straight.z - from.z) * k
    }
    const heading = turnToward(rescue.stopped.heading, rescue.truck.heading, k)
    setCar(rescue, rear, heading, geo.pitch * stage.lift, wheelbase)
    if (rescue.t >= HITCH_SECONDS) {
      rescue.phase = 'hauling'
      rescue.rear = rear
      rescue.mover = { s: 0, speed: 0 }
    }
    return rescue
  }

  if (rescue.phase === 'hauling') {
    const arrived = drive(rescue.mover, rescue.haul, delta)
    placeTruck(rescue, rescue.haul)
    rescue.rig = { reach: 1, lift: 1 }
    const yoke = yokeOf(rescue.truck, 1, 1)
    const geo = towGeometry(wheelbase, yoke.lift)
    const at = dragStep(rescue.rear, yoke, geo.trail)
    setCar(rescue, rescue.rear, at.heading, geo.pitch, wheelbase)
    rescue.car.speed = rescue.mover.speed
    if (arrived) {
      rescue.phase = 'dropping'
      rescue.t = 0
      rescue.releaseFrom = {
        rear: { x: rescue.rear.x, z: rescue.rear.z }, heading: rescue.car.heading
      }
    }
    return rescue
  }

  if (rescue.phase === 'dropping') {
    rescue.t += delta
    const stage = dropStage(rescue.t)
    rescue.rig = { reach: stage.reach, lift: stage.lift }
    const geo = towGeometry(wheelbase, TOW_RIG.lift)
    const bay = rescue.bay
    const parked = rearOf({ x: bay.x, z: bay.z, heading: bay.heading }, wheelbase)
    const k = ease(1 - stage.winch)
    const from = rescue.releaseFrom
    const rear = {
      x: from.rear.x + (parked.x - from.rear.x) * k,
      z: from.rear.z + (parked.z - from.rear.z) * k
    }
    const heading = turnToward(from.heading, bay.heading, k)
    setCar(rescue, rear, heading, geo.pitch * stage.lift * (1 - k), wheelbase)
    rescue.car.speed = 0
    if (rescue.t >= DROP_SECONDS) {
      rescue.phase = 'leaving'
      rescue.mover = { s: 0, speed: 0 }
      rescue.rig = { reach: 0, lift: 0 }
    }
    return rescue
  }

  if (rescue.phase === 'leaving') {
    const arrived = drive(rescue.mover, rescue.exit, delta)
    placeTruck(rescue, rescue.exit)
    if (arrived) rescue.phase = 'done'
    return rescue
  }

  return rescue
}

/**
 * The truck on its path. For the first few units of a leg its heading is
 * eased from the way it was already pointing: a path sampled every unit has
 * already turned a little by its first sample, and taking that as the heading
 * on the first frame would swing the truck - and whatever is on its hook -
 * by that much at once.
 */
function placeTruck(rescue, path) {
  const at = pointAlong(path, rescue.mover.s, false, true)
  let heading = at.heading
  if (path.startHeading !== null && rescue.mover.s < HEADING_EASE) {
    heading = turnToward(path.startHeading, at.heading, ease(rescue.mover.s / HEADING_EASE))
  }
  rescue.truck = { x: at.x, z: at.z, heading, speed: rescue.mover.speed }
}

const HEADING_EASE = 4

/**
 * Your car from its rear axle. The axle is the point a towed car pivots
 * about, so it is what the drag moves; the middle, which is where the physics
 * body is, follows from it and from how far the nose is up.
 */
function setCar(rescue, rear, heading, pitch, wheelbase) {
  const half = (wheelbase / 2) * Math.cos(pitch)
  rescue.car = {
    x: rear.x + Math.sin(heading) * half,
    z: rear.z + Math.cos(heading) * half,
    rear: { x: rear.x, z: rear.z },
    heading,
    pitch,
    rise: (wheelbase / 2) * Math.sin(pitch),
    speed: 0
  }
}

/** What the banner says, and what the bar shows, at each step. */
export function rescueHud(rescue) {
  if (!rescue) return null
  switch (rescue.phase) {
    case 'stalled':
      return { title: 'OUT OF FUEL', target: null, showBar: false }
    case 'arriving':
    case 'backing':
      return {
        title: 'TOW TRUCK ON ITS WAY',
        target: rescue.truck ? { x: rescue.truck.x, z: rescue.truck.z } : null,
        showBar: false
      }
    case 'hitching':
      return {
        title: 'HOOKING UP', target: null, showBar: true, barLabel: 'HOOK-UP',
        progress: Math.min(1, rescue.t / HITCH_SECONDS)
      }
    case 'hauling':
      return {
        title: 'TOWING TO THE GAS STATION', target: null, showBar: true,
        barLabel: 'TOW', progress: rescue.haul ? rescue.mover.s / rescue.haul.length : 0
      }
    case 'dropping':
      return { title: 'DROPPING YOU OFF', target: null, showBar: false }
    default:
      return null
  }
}
