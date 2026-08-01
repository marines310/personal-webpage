/**
 * Where the camera sits, as arithmetic.
 *
 * No THREE in here, for the same reason seasons.js has none and islandLayout
 * has none: Camera.js needs a browser, so anything with a decision in it has
 * to live somewhere a test can run it. What is left in Camera.js is easing,
 * raycasting and setting a position - no judgements.
 *
 * TWO LAYERS, AND ONLY TWO
 * ------------------------
 * The RIG is the chase camera the game shipped with: how high and how far
 * back it sits, which depends only on speed. The POSE is what the player has
 * done to it - swung round, raised, zoomed - and is three numbers, all of
 * them offsets:
 *
 *   yaw    radians around from directly behind. 0 is behind.
 *   pitch  radians ADDED to the rig's own elevation. 0 is the rig's.
 *   zoom   multiplier on how far back. 1 is the rig's.
 *
 * They are offsets rather than absolutes on purpose. An absolute height would
 * fight the speed pull-back - you would set a nice height at a standstill and
 * lose it the moment you accelerated. An offset rides on top of it.
 *
 * It also gives the thing worth guaranteeing: **at the default pose the
 * camera is exactly where it was before any of this existed.** The rig is
 * still interpolated in height and distance, precisely as it was; the pose is
 * converted to polar and back only to apply the offsets, and at (0, 0, 1) that
 * round trip is the identity. `tests/camera.mjs` checks it at every speed.
 *
 * THREE LEVELS OF POSE
 * --------------------
 *   DEFAULT_POSE  what the game ships with
 *   saved         the player's preference, kept between visits
 *   live          what you are looking through this instant
 *
 * Free look moves `live`. Left alone, `live` eases back to `saved` - so if you
 * have never saved anything it returns to the default, and if you HAVE saved
 * an angle it returns to yours. Saving is therefore also what makes an angle
 * stick instead of drifting away, which is why there is no "lock the camera"
 * mode: it would be a second way of expressing the same thing.
 */

/** The rig. These are the numbers the chase camera has always had. */
export const RIG = {
  restHeight: 6.2,          // height when stopped
  restDistance: 12.5,       // distance behind when stopped
  // 7.8, not higher: the monorail beam's underside is at 9.5 and the camera
  // has to pass beneath it. The player can now raise it past that - and will
  // clip the beam if they do, which is theirs to choose.
  fastHeight: 7.8,
  fastDistance: 17,
  speedForFullPullback: 18,

  lookAhead: 6,             // how far past the car to aim
  lookHeight: 1.9
}

export const DEFAULT_POSE = { yaw: 0, pitch: 0, zoom: 1 }

/**
 * Limits.
 *
 * The pitch ones are absolute, not offsets: what matters is the angle the
 * camera actually ends up at, and the rig contributes about 26 degrees of it.
 * Below MIN_PITCH the camera is in the road; at MAX_PITCH it is nearly
 * overhead, which is the "see what is around me" view and is as far as it
 * should go - at a true 90 degrees the yaw becomes meaningless and the view
 * spins on the spot.
 */
export const MIN_PITCH = 0.06        // ~3.5 degrees
export const MAX_PITCH = 1.36        // ~78 degrees
export const MIN_ZOOM = 0.45
export const MAX_ZOOM = 3.4

/** How fast the controls move the camera. Radians and multiples per second. */
export const KEY_YAW_RATE = 1.9
export const KEY_PITCH_RATE = 1.1
export const KEY_ZOOM_RATE = 0.9
/** Mouse: radians per pixel dragged, and zoom per notch of wheel. */
export const DRAG_YAW = 0.0075
export const DRAG_PITCH = 0.005
export const WHEEL_ZOOM = 0.0016

/**
 * How long after you stop touching the camera before it returns to the saved
 * pose, and how quickly it gets there once it starts.
 *
 * The delay exists so that letting go of the mouse for a fraction of a second
 * mid-look does not yank the view back. Two and a half seconds is long enough
 * to reposition and short enough that you never wonder whether it is stuck.
 */
export const RECOVER_DELAY = 2.5
export const RECOVER_RATE = 1.6

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** Wrap an angle into -PI..PI so we always turn the short way. */
export function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a))
}

export function clonePose(pose) {
  return { yaw: pose.yaw, pitch: pose.pitch, zoom: pose.zoom }
}

/**
 * Bring a pose inside its limits.
 *
 * Pitch is clamped against what the TOTAL angle will be, which is why this
 * needs the rig's own pitch. Clamping the offset alone would let the limit
 * mean something different at 5mph and at 50 - the rig's elevation changes
 * with speed - and the camera would sink into the road on a motorway.
 */
export function clampPose(pose, basePitch = 0) {
  const total = clamp(basePitch + pose.pitch, MIN_PITCH, MAX_PITCH)
  return {
    yaw: wrapAngle(pose.yaw),
    pitch: total - basePitch,
    zoom: clamp(pose.zoom, MIN_ZOOM, MAX_ZOOM)
  }
}

/**
 * Bring a pose back from storage into something sane.
 *
 * NOT the same job as clampPose, and conflating the two was a real bug for
 * about ten minutes: clampPose limits the TOTAL elevation and so needs the
 * rig's own pitch to subtract, and calling it with a base of zero turns every
 * saved offset into an absolute angle - a camera you had lowered comes back
 * from a reload raised. This one only rejects nonsense, and leaves the real
 * limiting to the frame that draws.
 */
export function sanitisePose(pose) {
  const ok = (v, fallback) => (Number.isFinite(v) ? v : fallback)
  return {
    yaw: wrapAngle(ok(pose && pose.yaw, 0)),
    pitch: clamp(ok(pose && pose.pitch, 0), -MAX_PITCH, MAX_PITCH),
    zoom: clamp(ok(pose && pose.zoom, 1), MIN_ZOOM, MAX_ZOOM)
  }
}

/** Is this pose the shipped one, near enough? Used to label the HUD. */
export function isDefaultPose(pose, tolerance = 1e-4) {
  return Math.abs(wrapAngle(pose.yaw)) < tolerance &&
         Math.abs(pose.pitch) < tolerance &&
         Math.abs(pose.zoom - 1) < tolerance
}

/** How far back and how high the rig sits at this speed. Unchanged behaviour. */
export function rigAt(speed, rig = RIG) {
  const t = clamp(speed / rig.speedForFullPullback, 0, 1)
  return {
    height: rig.restHeight + (rig.fastHeight - rig.restHeight) * t,
    distance: rig.restDistance + (rig.fastDistance - rig.restDistance) * t
  }
}

/** The rig's own elevation angle at this speed - the zero point for pitch. */
export function basePitchAt(speed, rig = RIG) {
  const { height, distance } = rigAt(speed, rig)
  return Math.atan2(height, distance)
}

/**
 * The camera's offset from the car, given a speed and a pose.
 *
 * Returns the boom in the pieces the caller needs: how far out horizontally,
 * how far up, and the total length (which occlusion works in).
 *
 * At the default pose this returns exactly `rigAt()` - horizontal is the
 * distance and vertical is the height - because converting to polar and back
 * with a zero offset and a unit zoom cancels. That is the whole guarantee.
 */
export function boomFor(speed, pose, rig = RIG) {
  const { height, distance } = rigAt(speed, rig)
  const length = Math.hypot(height, distance) * pose.zoom
  const pitch = clamp(Math.atan2(height, distance) + pose.pitch, MIN_PITCH, MAX_PITCH)

  return {
    horizontal: Math.cos(pitch) * length,
    vertical: Math.sin(pitch) * length,
    length,
    pitch
  }
}

/**
 * Where the camera goes and what it aims at, for a car at (x, y, z) whose
 * orbit angle is `yaw`. `yaw` already includes the pose's yaw, so position and
 * aim swing together and the car stays where it is on screen.
 *
 * `lookAhead` runs along the CAMERA's angle rather than the car's, which is
 * what makes reversing work without a special case: turn the camera round to
 * look back over the boot and the aim point goes with it, out into the space
 * the car is reversing into.
 */
export function placeCamera(car, yaw, speed, pose, rig = RIG) {
  const boom = boomFor(speed, pose, rig)
  const sin = Math.sin(yaw), cos = Math.cos(yaw)

  return {
    position: {
      x: car.x - sin * boom.horizontal,
      y: car.y + boom.vertical,
      z: car.z - cos * boom.horizontal
    },
    lookAt: {
      x: car.x + sin * rig.lookAhead,
      y: car.y + rig.lookHeight,
      z: car.z + cos * rig.lookAhead
    },
    boom
  }
}

/**
 * Move a pose by one frame of input.
 *
 * `input` is whatever the player did this frame: yaw and pitch in radians,
 * zoom as a multiplier delta. Keyboard and mouse both arrive here already
 * converted, so there is one place that decides what a nudge means and the
 * two devices cannot drift apart.
 */
export function applyInput(pose, input, basePitch = 0) {
  if (!input) return clonePose(pose)
  return clampPose({
    yaw: pose.yaw + (input.yaw || 0),
    pitch: pose.pitch + (input.pitch || 0),
    // Multiplied rather than added, so a notch of wheel moves the view by the
    // same PROPORTION whether you are close in or right out. Added, the same
    // notch would be imperceptible at full zoom and violent up close.
    zoom: pose.zoom * (1 + (input.zoom || 0))
  }, basePitch)
}

/**
 * Ease a pose toward another. Returns a new pose.
 *
 * Yaw goes the short way round, so recovering from a look over your shoulder
 * never spins the world the long way - the same rule the chase angle has
 * always followed.
 */
export function easePose(pose, target, delta, rate = RECOVER_RATE) {
  const k = 1 - Math.exp(-rate * delta)
  return {
    yaw: wrapAngle(pose.yaw + wrapAngle(target.yaw - pose.yaw) * k),
    pitch: pose.pitch + (target.pitch - pose.pitch) * k,
    zoom: pose.zoom + (target.zoom - pose.zoom) * k
  }
}

/**
 * Whether the camera should be looking back over the car's boot.
 *
 * Reversing points the car AWAY from where it is going, so the chase camera -
 * which sits behind - ends up looking at where you have been. Turning it round
 * fixes that, but turning it round the instant reverse is touched would spin
 * the world every time you shuffled out of a parking space.
 *
 * Hence a delay on each edge, and different ones. Going INTO the reverse view
 * waits three quarters of a second, because a blip of reverse is common and
 * meaningless. Coming OUT of it waits less, because once you are driving
 * forward you want the road immediately.
 *
 * `state` is carried by the caller: { held, looking }.
 */
export const REVERSE_SPEED = 1.6      // below this the direction is just noise
export const REVERSE_IN = 0.75        // seconds of reversing before it turns
export const REVERSE_OUT = 0.35       // seconds of not reversing before it returns

export function stepReverseView(state, reversing, speed, delta) {
  const clearly = reversing && speed > REVERSE_SPEED

  // The timer counts toward whichever answer disagrees with the current one,
  // and resets the moment the evidence changes. One timer, not two, so the
  // two edges cannot both be part-way at once.
  if (clearly === state.looking) {
    state.held = 0
  } else {
    state.held += delta
    if (state.held >= (clearly ? REVERSE_IN : REVERSE_OUT)) {
      state.looking = clearly
      state.held = 0
    }
  }

  return state.looking
}

export function newReverseState() {
  return { held: 0, looking: false }
}

/**
 * How far the camera may sit from the car once scenery is in the way.
 *
 * `hit` is the distance along the boom at which something solid was found, or
 * null for a clear line. The camera stops a margin short of it, and never
 * comes closer than MIN_OCCLUDED - inside that the car fills the screen and
 * you can see less than you could through the wall.
 */
export const OCCLUSION_MARGIN = 0.55
export const MIN_OCCLUDED = 2.6

export function occludedLength(wanted, hit) {
  if (hit === null || hit === undefined || hit >= wanted) return wanted

  // The floor is applied FIRST and `wanted` caps it, not the other way round.
  // Written the other way it read fine and was wrong: zoom right in to two
  // units, put a wall at 1.9, and max() pushed the camera out to 2.6 - past
  // where it was asked to be and into the wall it was avoiding. Occlusion may
  // only ever bring the camera closer.
  return Math.min(wanted, Math.max(MIN_OCCLUDED, hit - OCCLUSION_MARGIN))
}

/**
 * Ease the occluded length toward what we want.
 *
 * Deliberately asymmetric. Pulling IN happens instantly, because a frame spent
 * easing toward the wall is a frame spent inside it. Letting back OUT eases,
 * because scenery clears abruptly - a lamp post, a gap between buildings - and
 * a camera that snapped out every time would jitter down a lined street.
 */
export const OCCLUSION_RELEASE = 2.4

export function easeOcclusion(current, wanted, delta) {
  if (wanted <= current) return wanted
  return current + (wanted - current) * (1 - Math.exp(-OCCLUSION_RELEASE * delta))
}
