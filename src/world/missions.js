/**
 * The bits of a callout that are the same whichever callout it is.
 *
 * There are three of these games - a fire, a pursuit, and an ambulance run -
 * and they want the same three things on screen: a line of text saying what
 * is happening, an arrow saying which way, and sometimes a bar saying how far
 * through it you are. The HUD should not know which game it is showing, and
 * this is the shape that lets it not know.
 *
 * No THREE, like the game modules it serves.
 */

/**
 * Where to point the arrow, and how far away the thing is.
 *
 * `target` is anything with an x and a z, or null for "nothing to point at".
 * `viewer` is { x, z, yaw } - the CAMERA's position and facing, not the car's.
 * The arrow is drawn on the screen, and what "left" means on a screen is
 * decided by where the camera is looking. Pointing it relative to the car
 * would swing it about every time you looked over your shoulder, while the
 * world stayed still.
 *
 * `angle` comes back in SCREEN terms: 0 is straight up the screen, and it
 * grows CLOCKWISE, because that is what a CSS rotation does and a CSS
 * rotation is the only thing that reads it. Headings in this world grow
 * anticlockwise (the car's nose is +Z, so its right is -X - see
 * turnDirection in vehicleLights.js), so the sign is flipped exactly once,
 * here, rather than in the renderer where nobody would find it.
 *
 * The handedness was checked in the running game against the camera's own
 * matrix - ahead, right, left and behind gave 0, 90, -90 and 180 - rather
 * than derived from the heading convention. That is the check that was
 * missing when turnDirection came out backwards and its own test agreed with
 * it.
 */
export function missionArrow(target, viewer) {
  if (!target || !viewer) return { show: false, angle: 0, distance: 0 }

  const dx = target.x - viewer.x
  const dz = target.z - viewer.z

  let relative = Math.atan2(dx, dz) - (viewer.yaw || 0)
  while (relative > Math.PI) relative -= Math.PI * 2
  while (relative < -Math.PI) relative += Math.PI * 2

  return {
    show: true,
    angle: -relative,
    distance: Math.hypot(dx, dz)
  }
}

/**
 * A distance you can read at a glance while driving.
 *
 * Whole metres up close, tens further out, kilometres beyond that - because
 * the last digit of a four-figure number changes faster than you can read it
 * and reads as flicker rather than as information.
 */
export function formatDistance(d) {
  if (d < 100) return `${Math.round(d)}m`
  if (d < 1000) return `${Math.round(d / 10) * 10}m`
  return `${(d / 1000).toFixed(1)}km`
}

/**
 * What the HUD should show, given every game's own view of itself.
 *
 * `candidates` is a list of missions in priority order. Each is:
 *
 *   { active, mine, title, target, showBar, barLabel, progress, good }
 *
 * `mine` means this callout is the player's to deal with - they are driving
 * the vehicle it belongs to.
 *
 * A CALLOUT THAT IS NOT YOURS IS NOT SHOWN AT ALL.
 * ------------------------------------------------
 * Not shown lower down the list, not shown in grey: not shown. This started
 * as "a callout you can act on beats one you can only watch", which sounds
 * reasonable and is half a rule - it still put a fire on screen when you were
 * driving a bus, with an arrow to a building you had no way of helping.
 *
 * Mike asked for the other half twice, and the second time settled it as a
 * principle: first "no arrows for cops and robbers if I am not a police car",
 * then "if a user is not a firetruck, it should not see fire missions". The
 * general form is the one worth keeping - **the HUD is a list of things you
 * can do, not a list of things that are happening.** A world event you cannot
 * act on belongs in the world, and it is already there: the smoke still goes
 * up, the wreck is still in the road, the patrol cars still go past with
 * their lights on. You find them by looking out of the window, and if you
 * want to deal with one, go and get the right vehicle.
 *
 * That also means this is the ONE place the rule lives. Each game had been
 * given its own version of "and nothing for one that isn't yours" - the
 * pursuit already had a paragraph about it - which is three chances for them
 * to disagree. Here it is arithmetic on one field.
 */
export function chooseMission(candidates) {
  const live = (candidates || []).filter(m => m && m.active)
  if (!live.length) return null
  return live.find(m => m.mine) || null
}
