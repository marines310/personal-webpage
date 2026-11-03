/**
 * Wheelies.
 *
 * A button that stands the monster truck up on its back wheels, and another
 * that tips it forward onto its front ones. Press once to rear up, press
 * again to come down.
 *
 * No THREE in here, like driving.js, donut.js and the mission games, and for
 * the same reason: this is arithmetic, and arithmetic can be tested in a
 * millisecond without a browser. `Vehicle.js` owns the mesh and the input;
 * this owns the angle, the point it turns about, and the rules.
 *
 * IT IS DRAWN, AND THAT WAS A MEASUREMENT RATHER THAN A SHORTCUT
 * -------------------------------------------------------------
 * The truck is DRAWN rearing up while its collider stays flat on the road.
 * The real-physics version was built first, and it is worth writing down why
 * it is not what shipped, because the reasoning looked sound the whole way.
 *
 * Pitch and roll are not locked - `Physics.createVehicleChassis` says
 * `setEnabledRotations(true, true, true, true)`, and what keeps the truck
 * level is a CONTROLLER rather than a constraint: `tiltRates()` in driving.js,
 * an upright spring that is stiff on the ground and weak in the air. So a
 * wheelie should just be a moved target: aim that spring 54 degrees back
 * instead of at the ground, and the same spring that holds the truck level
 * heaves it up and holds it there. No second rotation path, no lie on top of
 * the physics, and jumps and slopes keep working for free.
 *
 * That was built, and it rears the truck to the full angle, and then it throws
 * it three units into the air. Traced frame by frame, body angle against the
 * height of the body:
 *
 *     frame  target-travel   body    height   grounded
 *         0          0.182  -0.3deg    0.51      yes
 *         4          0.909 -15.1deg    1.21      yes
 *         8              1   -46deg    2.31      yes
 *        12              1 -54.7deg    3.13      yes
 *        13           0.75 -55.9deg    3.27      NO
 *
 * ...and then it falls back, lands, and does it again. A pogo stick.
 *
 * The cause is not the spring. The chassis is ONE BOX, CAR_HEIGHT tall,
 * resting with its underside on the road (see REST_ABOVE_SURFACE). Pitch that
 * box 54 degrees about its own centre and the rear bottom corner ends up
 * about `length / 2 * sin 54` - call it 1.8 units - UNDERNEATH the road, and
 * the only thing the physics can do about that much penetration is shove the
 * whole truck upwards.
 *
 * Fixing that properly means raising the body as it rotates, so it pivots
 * about its rear axle the way a real truck does and no corner ever goes
 * through anything. That is the right answer and it is still available. It
 * also means Vehicle.js writing the body's position every frame during a
 * wheelie, and "two things writing one position" is a mistake this file's
 * neighbours have made and documented twice already - once with the monorail
 * and once with the tow truck's hook.
 *
 * So, asked, Mike picked the version he had described in the first place:
 * "just kinda stand on its tail or nose". It cannot launch the truck, cannot
 * pogo, cannot interact badly with a jump or a landing, and gives the full
 * 54-degree stand.
 *
 * WHAT IT COSTS, HONESTLY
 * -----------------------
 * The collider does not tilt, so a reared-up truck is still a flat box as far
 * as anything it hits is concerned: nose into a wall at full lock and you
 * would see the bodywork lean into it. That is why the speed is capped while
 * it is up - see WHEELIE_TUNING.speedCap - and why this is a stunt-park toy
 * rather than a way to get about.
 *
 * It also means the pose is a SECOND opinion about which way the truck is
 * pointing, which is the thing the physics version would not have had. The
 * pose is therefore kept to one axis and one place: it is applied once, in
 * `postPhysicsUpdate`, immediately after the mesh is set from the body, and it
 * is built so that it cannot change the truck's compass bearing at all - see
 * maxTailPitch for why that matters to the camera, and the pivot note in
 * wheeliePose() for why it cannot move the truck across the ground either.
 */

/**
 * Who gets it.
 *
 * The monster truck, which is what Mike asked for. Adding the race car is
 * this list plus a word - but a saloon standing on its tail reads as a bug
 * rather than a stunt, so the rule is "what is in the list can do it" rather
 * than "everything can except these". The same shape as DONUT_KINDS and
 * TANK_SECONDS, and for the same reason: the next vehicle that turns up
 * should need a decision, not a discovery.
 */
export const WHEELIE_KINDS = ['monster']

/** Nose up (stand on the tail), nose down (stand on the nose), or neither. */
export const TAIL = 1
export const NOSE = -1
export const DOWN = 0

export const WHEELIE_TUNING = {
  /**
   * How far each stand goes, in radians - AND THESE ARE MEASUREMENTS, not
   * taste. They were 0.95 and 0.6 first, which looked right and put the back
   * bumper most of a unit through the road.
   *
   * A truck pivoting about its back axle can only lean until the bodywork
   * BEHIND that axle reaches the ground. Real vehicles have the same limit and
   * a name for it - the departure angle - and it is set by two numbers, both
   * read off the monster truck's own mesh rather than guessed:
   *
   *     ground clearance   the underside of the bodywork, ignoring the wheels,
   *                        sits 0.715 above the road
   *     rear overhang      the body reaches 1.11 behind the rear axle
   *     front overhang     and 1.22 in front of the front one
   *
   * So the tail stand runs out of road at atan(0.715 / 1.11) = 0.571 rad, and
   * the nose stand at atan(0.715 / 1.22) = 0.530. These sit just inside both,
   * which leaves room for the drawn wheels being a few hundredths forward of
   * where `wheelbase / 2` puts the pivot.
   *
   * 30 degrees is a smaller wheelie than the 54 that was tried, and it is the
   * one the truck actually has the clearance for - exactly as a real one does.
   * tests/wheelie.mjs rotates the measured body box about the pivot and checks
   * that nothing ends up under the road, so these cannot drift back up without
   * something saying so.
   *
   * They must also stay well short of a right angle, and that is somebody
   * else's code rather than taste. `Camera.js` works out which way the truck
   * is facing from its MESH quaternion - `FORWARD.applyQuaternion(mesh
   * .quaternion)` - and reads the horizontal part. Pitching about the truck's
   * own X axis leaves that bearing exact: a yaw of Y then a pitch of T sends
   * forward to `(cosT.sinY, -sinT, cosT.cosY)`, and atan2 of x and z is Y
   * whatever T is. But only while cosT is not zero. At 90 degrees the
   * horizontal part vanishes, atan2(0, 0) gives up, and the camera whips round
   * at the top of every wheelie. At 30 there is 86% of it left.
   */
  maxTailPitch: 0.52,
  maxNosePitch: 0.45,

  /**
   * How long it takes to get up there, and to come back down.
   *
   * Eased at both ends (see ease()), because nothing else is doing that job
   * any more. The physics version got its softness from the spring; a pose is
   * exactly as abrupt as the number driving it, so a linear ramp reads as the
   * truck being levered on a hinge. Down quicker than up, like gravity.
   */
  riseSeconds: 0.55,
  fallSeconds: 0.4,

  /**
   * Multipliers on the handling while it is up, applied the way donut mode
   * applies its own: of whatever that kind already drives like, so retuning
   * the monster truck in driving.js retunes its wheelies too.
   *
   * A nose stand at full speed is not a trick, it is a crash, and a truck
   * balanced on two wheels does not change direction like one on four.
   */
  speedCap: 0.35,
  steerCap: 0.55
}

/** Can this kind do wheelies at all? */
export function canWheelie(kind) {
  return WHEELIE_KINDS.includes(kind)
}

export function newWheelieState() {
  return {
    want: DOWN,   // which end the player is asking for
    dir: DOWN,    // which end is on its way up, or up, right now
    pitch: 0      // 0 to 1, how far the target has travelled
  }
}

/**
 * Which end the player is asking for, given what they were asking for and
 * which buttons they just pressed.
 *
 * A toggle per direction, and these are all the cases there are: pressing the
 * end that is already up puts it down, pressing the other end swaps straight
 * over, pressing nothing changes nothing.
 *
 * Both in the same frame does NOTHING rather than picking a favourite. It is
 * a fumbled press, and a fumble should not commit the truck to anything. The
 * rule lives here rather than in Inputs.js so that it can be tested, and so
 * that it cannot come out differently depending on which key was read first.
 */
export function nextWheelieWant(was, kind, tailPressed, nosePressed) {
  if (!canWheelie(kind)) return DOWN
  if (tailPressed && nosePressed) return was
  if (tailPressed) return was === TAIL ? DOWN : TAIL
  if (nosePressed) return was === NOSE ? DOWN : NOSE
  return was
}

/**
 * One frame of standing up or settling back down.
 *
 * NOTHING ABOUT BEING AIRBORNE, and there used to be. The physics version
 * dropped the ask the moment the wheels left the ground, for two reasons that
 * both went away with it: the air spring is deliberately weak, so the pose
 * could not have been held anyway, and a truck that stayed at 54 degrees
 * through a jump landed tail-first on a collider that was still flat.
 *
 * A pose has neither problem. It pivots about the axle, so no part of the
 * truck is ever drawn below the road whatever it is doing, and holding a
 * wheelie off the lip of a ramp is the good version of this rather than a
 * glitch. One fewer rule, and one fewer thing for the state to be wrong about.
 *
 * Mutates and returns `state`.
 */
export function stepWheelie(state, kind, delta) {
  if (!canWheelie(kind)) {
    state.want = DOWN
    state.dir = DOWN
    state.pitch = 0
    return state
  }

  // SWAPPING ENDS GOES THROUGH LEVEL. Whichever end is up settles all the way
  // down before the other starts, so rocking from the tail to the nose reads
  // as rocking rather than as the truck rotating through the road.
  const settling = state.want === DOWN ||
                   (state.want !== state.dir && state.pitch > 0)

  if (settling) {
    state.pitch = Math.max(0, state.pitch - delta / WHEELIE_TUNING.fallSeconds)
    if (state.pitch === 0) state.dir = DOWN
    return state
  }

  state.dir = state.want
  state.pitch = Math.min(1, state.pitch + delta / WHEELIE_TUNING.riseSeconds)
  return state
}

/**
 * Smooth at both ends of the travel.
 *
 * The spring already softens the start, because a spring does, but it chases
 * a linear target at a constant rate and so arrives at the top still moving.
 * Easing the target is one cosine and it is the difference between settling
 * and clipping.
 */
function ease(t) {
  return 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)))
}

/**
 * How to draw it: the angle, and the point to turn about.
 *
 * `pitch` is in radians and POSITIVE MEANS NOSE UP, which is the human
 * meaning and the opposite of a positive rotation about the X axis.
 * `Vehicle.js` negates it in the one place it builds the rotation, with a note
 * saying so - keeping the human sign at the boundary means every constant and
 * every test here reads the way it sounds.
 *
 * `pivot` is in the mesh's own coordinates, where +z is forward (the headlight
 * beam is placed at `+size.length / 2`, which is what fixes the convention)
 * and the ground is at `-height / 2` (see the note on addHeadlights). It is
 * AN AXLE, NOT THE MIDDLE OF THE TRUCK, and that is the whole of the geometry:
 *
 *   - Turn about the middle and the back of the truck sinks through the road
 *     by half a length times the sine of the angle - the exact same 1.8 units
 *     that made the physics version pogo, except now it is a drawing and the
 *     road simply has a truck in it.
 *   - Turn about the back axle and the back wheels stay exactly where they
 *     are, everything else swings up, and nothing is ever drawn below the
 *     road. Which is what a wheelie is.
 *
 * Nothing here moves the truck ALONG the ground, either: the pivot is the only
 * point that is held still, and it is the point already touching the road. So
 * the pose cannot disagree with the physics about where the truck is, only
 * about which way it is leaning.
 *
 * `active` false and a zero angle mean "nothing to do", and Vehicle.js leans
 * on that: it leaves the mesh exactly as the body set it, untouched.
 */
export function wheeliePose(state, kind, wheelbase, height) {
  if (!canWheelie(kind) || !state || state.dir === DOWN || state.pitch <= 0) {
    return { active: false, pitch: 0, pivot: { y: 0, z: 0 } }
  }

  const span = state.dir === TAIL
    ? WHEELIE_TUNING.maxTailPitch
    : -WHEELIE_TUNING.maxNosePitch

  // Half a wheelbase behind the middle for a tail stand, half in front of it
  // for a nose stand: the axle the truck is standing on.
  const axle = (wheelbase || 0) / 2

  return {
    active: true,
    pitch: span * ease(state.pitch),
    pivot: {
      y: -(height || 0) / 2,
      z: state.dir === TAIL ? -axle : axle
    }
  }
}

/**
 * The handling to drive with while it is up.
 *
 * Returns the params UNCHANGED - the same object, not a copy - when nothing is
 * up or this kind cannot do it. The same contract donutParams() keeps, for the
 * same two reasons: it is called every frame for every vehicle, and it makes
 * "this kind is untouched" a fact rather than a hope.
 *
 * The caps come on WITH THE POSE rather than at the press, so asking for a
 * wheelie at speed does not read as hitting a wall.
 */
export function wheelieParams(params, kind, state) {
  if (!params || !canWheelie(kind) || !state || state.pitch <= 0) return params

  const t = ease(state.pitch)
  const out = { ...params }
  const cap = (key, factor) => {
    if (typeof params[key] === 'number') {
      out[key] = params[key] * (1 - t * (1 - factor))
    }
  }

  cap('maxForwardSpeed', WHEELIE_TUNING.speedCap)
  cap('maxReverseSpeed', WHEELIE_TUNING.speedCap)
  cap('maxSteerAngle', WHEELIE_TUNING.steerCap)

  return out
}

/** What the screen should say about it. UI.js works nothing out for itself. */
export function wheelieHud(kind, state) {
  const show = canWheelie(kind)
  const dir = show && state ? state.dir : DOWN

  return {
    show,
    active: show && !!state && state.pitch > 0,
    tail: dir === TAIL,
    nose: dir === NOSE,
    label: dir === TAIL ? 'TAIL' : dir === NOSE ? 'NOSE' : 'OFF'
  }
}
