/**
 * The camera: free look, the saved view, reversing and occlusion.
 *
 * THE ONE THAT MATTERS IS SECTION 1.
 *
 * Adding free look meant rewriting where the camera sits, and the way that
 * goes wrong is not a crash - it is the driving feel quietly changing. So the
 * first section holds the OLD formula, copied out of the version of Camera.js
 * that shipped, and demands the new code agree with it to floating point at
 * every speed and every angle. If that ever fails, the camera has been
 * retuned, and it should be because somebody meant to.
 *
 * Camera.js itself needs a browser - THREE, a canvas, a physics world - so
 * everything with a decision in it lives in cameraPose.js, which does not.
 * That is the same split as islandLayout/World and seasons/Environment.
 */
import {
  RIG, DEFAULT_POSE, MIN_PITCH, MAX_PITCH, MIN_ZOOM, MAX_ZOOM,
  RECOVER_DELAY, REVERSE_SPEED, REVERSE_IN, REVERSE_OUT,
  OCCLUSION_MARGIN, MIN_OCCLUDED,
  wrapAngle, clonePose, clampPose, sanitisePose, isDefaultPose,
  rigAt, basePitchAt, boomFor, placeCamera, applyInput, easePose,
  newReverseState, stepReverseView, occludedLength, easeOcclusion
} from '../src/systems/cameraPose.js'
import { Inputs } from '../src/systems/Inputs.js'
import { readFileSync } from 'fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)

// ---------------------------------------------------------------------------
console.log('1. The camera that shipped, reproduced exactly\n')

/** The old Camera.js, verbatim in behaviour. Do not "tidy" this. */
function oldCamera(car, yaw, speed) {
  const p = RIG
  const t = Math.min(speed / p.speedForFullPullback, 1)
  const distance = p.restDistance + (p.fastDistance - p.restDistance) * t
  const height = p.restHeight + (p.fastHeight - p.restHeight) * t
  return {
    position: {
      x: car.x - Math.sin(yaw) * distance,
      y: car.y + height,
      z: car.z - Math.cos(yaw) * distance
    },
    lookAt: {
      x: car.x + Math.sin(yaw) * p.lookAhead,
      y: car.y + p.lookHeight,
      z: car.z + Math.cos(yaw) * p.lookAhead
    }
  }
}

const car = { x: 31.4, y: 2.05, z: -17.9 }
let worst = 0
for (let speed = 0; speed <= 30; speed += 0.5) {
  for (let yaw = -Math.PI; yaw <= Math.PI; yaw += Math.PI / 12) {
    const a = oldCamera(car, yaw, speed)
    const b = placeCamera(car, yaw, speed, DEFAULT_POSE)
    for (const key of ['position', 'lookAt']) {
      for (const axis of ['x', 'y', 'z']) {
        worst = Math.max(worst, Math.abs(a[key][axis] - b[key][axis]))
      }
    }
  }
}
console.log(`   1525 positions compared, worst disagreement ${worst.toExponential(2)}`)
chk('an untouched camera sits exactly where it always did', worst < 1e-12, `${worst}`)

// And said the other way, because it is the claim the design rests on:
// converting the rig to polar to apply an offset, with no offset, cancels.
let boomWorst = 0
for (let speed = 0; speed <= 30; speed += 0.25) {
  const rig = rigAt(speed)
  const boom = boomFor(speed, DEFAULT_POSE)
  boomWorst = Math.max(boomWorst,
    Math.abs(boom.horizontal - rig.distance), Math.abs(boom.vertical - rig.height))
}
chk('the polar round trip is the identity at a default pose',
    boomWorst < 1e-12, `${boomWorst}`)

chk('the rig still pulls back with speed',
    rigAt(30).distance > rigAt(0).distance && rigAt(30).height > rigAt(0).height)
chk('and stops pulling back at the stated speed',
    rigAt(RIG.speedForFullPullback).distance === rigAt(99).distance)

// ---------------------------------------------------------------------------
console.log('\n2. The pose, and the limits it pushes against')

chk('the default pose is neutral', isDefaultPose(DEFAULT_POSE))
chk('and a nudged one is not', !isDefaultPose({ yaw: 0.2, pitch: 0, zoom: 1 }))

// Pitch is limited on the TOTAL angle, not on the offset. Clamping the offset
// alone would mean "as low as it goes" was a different angle at 5mph and at
// 50, because the rig's own elevation moves with speed - and the camera would
// end up in the road on a fast straight.
for (const speed of [0, 6, 12, 18, 30]) {
  const base = basePitchAt(speed)
  const low = clampPose({ yaw: 0, pitch: -9, zoom: 1 }, base)
  const high = clampPose({ yaw: 0, pitch: 9, zoom: 1 }, base)
  const lowTotal = base + low.pitch
  const highTotal = base + high.pitch
  chk(`at speed ${speed} the floor is the same angle (${lowTotal.toFixed(4)})`,
      Math.abs(lowTotal - MIN_PITCH) < 1e-9, `${lowTotal}`)
  chk(`and so is the ceiling (${highTotal.toFixed(4)})`,
      Math.abs(highTotal - MAX_PITCH) < 1e-9, `${highTotal}`)
}

chk('zoom is limited both ways',
    clampPose({ yaw: 0, pitch: 0, zoom: 99 }).zoom === MAX_ZOOM &&
    clampPose({ yaw: 0, pitch: 0, zoom: 0 }).zoom === MIN_ZOOM)
chk('yaw wraps rather than growing without bound',
    Math.abs(clampPose({ yaw: 7 * Math.PI, pitch: 0, zoom: 1 }).yaw) <= Math.PI + 1e-9)

// However hard you push, the camera can never end up under the road.
let lowest = Infinity, highest = -Infinity
let pose = clonePose(DEFAULT_POSE)
for (let i = 0; i < 600; i++) {
  pose = applyInput(pose, { yaw: 0.3, pitch: -0.4, zoom: -0.2 }, basePitchAt(9))
  lowest = Math.min(lowest, boomFor(9, pose).vertical)
}
chk(`shoving it down 600 times keeps it above the road (${lowest.toFixed(2)}u)`,
    lowest > 0, `${lowest}`)

pose = clonePose(DEFAULT_POSE)
for (let i = 0; i < 600; i++) {
  pose = applyInput(pose, { yaw: 0, pitch: 0.4, zoom: 0.2 }, basePitchAt(9))
  highest = Math.max(highest, boomFor(9, pose).pitch)
}
chk(`and shoving it up never gets to straight down (${(highest * 57.3).toFixed(1)} deg)`,
    highest <= MAX_PITCH + 1e-9 && highest < Math.PI / 2, `${highest}`)

// Zoom multiplies rather than adds, so one notch of wheel is worth the same
// PROPORTION close in as it is right out. Added, the same notch would be
// imperceptible at full zoom and violent on the bonnet.
const near = applyInput({ yaw: 0, pitch: 0, zoom: 1 }, { zoom: 0.1 })
const far = applyInput({ yaw: 0, pitch: 0, zoom: 3 }, { zoom: 0.1 })
chk('a notch of zoom is proportional, not absolute',
    Math.abs((near.zoom / 1) - (far.zoom / 3)) < 1e-12,
    `${near.zoom} vs ${far.zoom}`)

// ---------------------------------------------------------------------------
console.log('\n3. Coming back to the saved view')

const saved = { yaw: 0.9, pitch: 0.25, zoom: 1.6 }
let live = { yaw: -2.4, pitch: -0.2, zoom: 0.7 }

const before = clonePose(live)
live = easePose(live, saved, 1 / 30)
chk('one frame does not snap', Math.abs(live.yaw - before.yaw) < 0.3, `${live.yaw}`)

for (let i = 0; i < 30 * 12; i++) live = easePose(live, saved, 1 / 30)
chk(`twelve seconds gets there (yaw ${live.yaw.toFixed(3)} of ${saved.yaw})`,
    Math.abs(live.yaw - saved.yaw) < 0.01 &&
    Math.abs(live.zoom - saved.zoom) < 0.01, JSON.stringify(live))

// Recovering from a look over your shoulder must not spin the world the long
// way round - the same rule the chase angle has always followed.
let spun = { yaw: 3.0, pitch: 0, zoom: 1 }
let crossedZero = false
for (let i = 0; i < 30 * 8; i++) {
  spun = easePose(spun, { yaw: -3.0, pitch: 0, zoom: 1 }, 1 / 30)
  if (Math.abs(spun.yaw) < 1.5) crossedZero = true
}
console.log(`   3.0 -> -3.0 rad ended at ${spun.yaw.toFixed(3)}`)
chk('easing takes the short way round, not through the front of the car',
    !crossedZero && Math.abs(wrapAngle(spun.yaw + 3.0)) < 0.05, `${spun.yaw}`)

chk('the recovery delay is long enough to reposition in', RECOVER_DELAY >= 1.5)

// A saved pose comes back from storage as it went in - in particular a
// LOWERED camera stays lowered. Clamping instead of sanitising here turned
// every negative pitch into the minimum, so a saved low view came back high.
const lowered = { yaw: -1.2, pitch: -0.31, zoom: 0.8 }
const round = sanitisePose(JSON.parse(JSON.stringify(lowered)))
chk('a saved low view survives a reload still low',
    Math.abs(round.pitch - lowered.pitch) < 1e-12, `${round.pitch}`)
chk('and nonsense in storage does not', (() => {
  const junk = sanitisePose({ yaw: 'x', pitch: 400, zoom: -50 })
  return junk.yaw === 0 && junk.pitch <= MAX_PITCH && junk.zoom >= MIN_ZOOM
})())

// ---------------------------------------------------------------------------
console.log('\n4. Looking back when you reverse')

const run = (state, reversing, speed, seconds) => {
  let looking = state.looking
  for (let i = 0; i < Math.round(seconds * 60); i++) {
    looking = stepReverseView(state, reversing, speed, 1 / 60)
  }
  return looking
}

let rv = newReverseState()
chk('it starts looking forward', rv.looking === false)

chk(`half a second of reverse is not enough (needs ${REVERSE_IN}s)`,
    run(rv, true, 4, 0.5) === false)
chk('a full second is', run(newReverseState(), true, 4, 1.0) === true)

// Shuffling out of a parking space at walking pace must not spin the world.
chk(`crawling backwards below ${REVERSE_SPEED} never turns it`,
    run(newReverseState(), true, 0.8, 5) === false)

// And coming back out is quicker than going in, because once you are driving
// forward you want the road immediately.
rv = newReverseState()
run(rv, true, 4, 1.0)
chk('a blip of forward does not flip it straight back', run(rv, false, 4, 0.2) === true)
chk('but half a second does', run(rv, false, 4, 0.5) === false)
chk('coming out is quicker than going in', REVERSE_OUT < REVERSE_IN)

// The timer must reset when the evidence changes, or a long stretch of
// alternating input would accumulate its way into a flip it never earned.
rv = newReverseState()
for (let i = 0; i < 40; i++) {
  run(rv, true, 4, 0.3)
  run(rv, false, 4, 0.3)
}
chk('flickering in and out of reverse settles rather than accumulating',
    rv.looking === false, `${rv.looking}`)

// ---------------------------------------------------------------------------
console.log('\n5. Scenery in the way')

chk('a clear line changes nothing', occludedLength(14, null) === 14)
chk('and a hit further off than the camera changes nothing',
    occludedLength(14, 20) === 14)

const pulled = occludedLength(14, 8)
console.log(`   wanted 14, wall at 8, camera goes to ${pulled.toFixed(2)}`)
chk('a wall pulls the camera in short of it',
    Math.abs(pulled - (8 - OCCLUSION_MARGIN)) < 1e-12, `${pulled}`)
chk('and it stops short rather than at the wall', pulled < 8)

chk(`a wall right on the car still leaves ${MIN_OCCLUDED}u`,
    occludedLength(14, 0.2) === MIN_OCCLUDED)
chk('the floor is never further out than we wanted anyway',
    occludedLength(2, 1.9) <= 2)

// Asymmetric on purpose: a frame spent easing toward a wall is a frame spent
// inside it, but scenery clears abruptly and snapping out jitters.
chk('pulling in is instant', easeOcclusion(14, 6, 1 / 60) === 6)
const out = easeOcclusion(6, 14, 1 / 60)
chk(`letting back out eases (${out.toFixed(2)} of 14)`, out > 6 && out < 7, `${out}`)

let releasing = 6
for (let i = 0; i < 60 * 4; i++) releasing = easeOcclusion(releasing, 14, 1 / 60)
chk('and gets there in a few seconds', Math.abs(releasing - 14) < 0.05, `${releasing}`)

// ---------------------------------------------------------------------------
console.log('\n6. The keys do not fight the driving')

const resolve = (code) => Inputs.prototype.resolveKey.call(null, code)

const DRIVING = ['forward', 'backward', 'left', 'right', 'boost', 'brake']
const CAMERA_KEYS = ['KeyQ', 'KeyE', 'KeyR', 'KeyF', 'KeyZ', 'KeyX', 'KeyC', 'KeyV']

for (const code of CAMERA_KEYS) {
  const control = resolve(code)
  chk(`${code} is a camera control (${control})`,
      control !== null && !DRIVING.includes(control), String(control))
}

// The driving controls are exactly what they were. A camera key stealing W
// would be caught by a human in a second; one stealing SHIFT might not be.
const DRIVING_MAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'backward', ArrowDown: 'backward',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'boost', ShiftRight: 'boost',
  Space: 'brake'
}
chk('every driving key still does what it did',
    Object.entries(DRIVING_MAP).every(([code, want]) => resolve(code) === want),
    Object.entries(DRIVING_MAP).filter(([c, w]) => resolve(c) !== w).map(([c]) => c).join(','))

chk('no two camera keys mean the same thing',
    new Set(CAMERA_KEYS.map(resolve)).size === CAMERA_KEYS.length)

// ---------------------------------------------------------------------------
console.log('\n7. Both devices arrive at the same three numbers')

// Read out of Inputs.js rather than reimplemented, because the point is that
// there is one conversion and not two.
const inputs = readFileSync(ROOT + 'src/systems/Inputs.js', 'utf8')

chk('the mouse and the keys share one exit',
    inputs.split('getCameraInput(delta)').length === 2,
    `${inputs.split('getCameraInput(delta)').length - 1} definitions`)
chk('keys are a rate and are scaled by delta', /KEY_YAW_RATE \* delta/.test(inputs))
chk('the mouse is a displacement and is not',
    /this\.mouse\.dx \* DRAG_YAW/.test(inputs) &&
    !/this\.mouse\.dx \* DRAG_YAW \* delta/.test(inputs))
// The tail of a drag - the pixels between the last frame and the mouseup -
// must still be spent. Gated on `dragging`, they were counted and dropped:
// invisible at sixty frames a second, and half the drag at ten.
chk('the drag is read whether or not the button is still down',
    !/if \(this\.mouse\.dragging\) \{[\s\S]{0,120}DRAG_YAW/.test(inputs))
// Checked as "is not USED", not as "is not MENTIONED" - the comment above it
// explains why movementX was the wrong choice, and a test that forbids the
// word forbids the explanation with it.
chk('and the movement is measured from clientX, not movementX',
    /clientX - this\.mouse\.lastX/.test(inputs) && !/\+=\s*event\.movementX/.test(inputs))
chk('reading the mouse clears it, so nothing is counted twice',
    /this\.mouse\.dx = 0[\s\S]{0,80}this\.mouse\.wheel = 0/.test(inputs))
chk('the rates live with the limits, not in the input code',
    /from '\.\/cameraPose\.js'/.test(inputs))
chk('losing focus mid-drag lets go', /onBlur[\s\S]{0,400}mouse\.dragging = false/.test(inputs))
chk('a drag only counts if it started on the canvas',
    /canvas\.addEventListener\('mousedown'/.test(inputs) &&
    !/window\.addEventListener\('mousedown'/.test(inputs))
chk('the wheel over a panel is left to the panel',
    /event\.target\.id !== 'canvas'/.test(inputs))

// ---------------------------------------------------------------------------
console.log('\n8. Camera.js, read rather than run')

const camera = readFileSync(ROOT + 'src/systems/Camera.js', 'utf8')

chk('the rig numbers are not written out a second time',
    !/restDistance:\s*12\.5/.test(camera), 'a copy of the rig is in Camera.js')
chk('occlusion asks the physics world, not the scene graph',
    /world\.castRay\(/.test(camera) && !/THREE\.Raycaster/.test(camera))
chk('and excludes the car, or the answer is always itself',
    /vehicle\.body/.test(camera))
chk('a physics world that refuses a ray does not stop the frame',
    /catch \(err\)[\s\S]{0,200}return null/.test(camera))
chk('the saved view is kept somewhere it survives a reload',
    /localStorage/.test(camera))
chk('and storage that throws is survivable', (camera.match(/catch \(err\)/g) || []).length >= 3)
chk('reversing reads the signed speed rather than guessing',
    /getSignedSpeed/.test(camera))

const vehicle = readFileSync(ROOT + 'src/world/Vehicle.js', 'utf8')
chk('and getSpeed derives from it rather than being a second answer',
    /getSpeed\(\)\s*\{\s*return Math\.abs\(this\.getSignedSpeed\(\)\)/.test(vehicle))

// ---------------------------------------------------------------------------
console.log('\n9. The panel offers what the keys do')

const html = readFileSync(ROOT + 'index.html', 'utf8')
for (const id of ['cam-save', 'cam-recentre', 'cam-default', 'cam-panel', 'cam-toggle']) {
  chk(`the panel has ${id}`, html.includes(`id="${id}"`))
}
chk('the hint mentions the mouse, which is the discoverable part',
    /Drag to look/.test(html))

const ui = readFileSync(ROOT + 'src/ui/UI.js', 'utf8')
chk('every button calls the same method the key does',
    /savePose\(\)/.test(ui) && /snapBehind\(\)/.test(ui) && /resetPose\(\)/.test(ui))
chk('driving keys do not reach the camera buttons',
    /cameraEl\.addEventListener\(event, \(e\) => e\.stopPropagation\(\)\)/.test(ui))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
