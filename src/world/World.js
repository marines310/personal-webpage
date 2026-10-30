import * as THREE from 'three'
import { Game } from '../core/Game.js'
import {
  ISLANDS,
  ISLAND_DEPTH,
  SEA_LEVEL,
  getBridges,
  getIslandRoads,
  getIsland,
  getIslandRing,
  getBridgeLandings,
  DEFAULT_ROAD_WIDTH,
  pointAlong,
  distanceToNearestRoad,
  getSpawnIsland,
  getBridgeRoadPaths,
  validateLayout,
  islandOutline,
  islandReach,
  inlandDistance,
  islandAt,
  islandName,
  isCourseIsland,
  getIslandJunctions,
  getTownPlots,
  getRoadsidePlots,
  PAVEMENT_WIDTH,
  PLOT_GAP,
  getWalkways,
  getTrafficSignals,
  getMonorailRoute,
  MONORAIL_CORRIDOR,
  getMonorailPiers,
  getMonorailStationTowers,
  getPorts,
  getPortYard,
  CONTAINER_LONG,
  CONTAINER_WIDE,
  CONTAINER_LIFT,
  getSeaGraph,
  getLaneNetwork,
  getBusStops,
  getIslandTerrain,
  groundHeight,
  getStations,
  getFuelStations,
  getFuelBays,
  fuelApron,
  blocksStationEntrance,
  STATION_SETBACK,
  stationApron,
  stationSignBoard,
  makeTraffic,
  stepTraffic,
  trafficPosition,
  signalState,
  TRAFFIC_LENGTHS,
  TRAFFIC_WIDTHS,
  TRAFFIC_CYCLE,
  SIREN_RATE,
  makeShips,
  stepShips,
  shipPosition,
  PIER_DECK_Y,
  PIER_DECK_DEPTH,
  getAirport,
  getAirGraph,
  getApronRoad,
  getAirportCauseway,
  getCausewayRoadPath,
  AIRPORT_ROAD_WIDTH,
  CAUSEWAY_DECK_MARGIN,
  getHelipads,
  fitRoofPads,
  getPlayerGarage,
  inGarageBay,
  garageBaySlots,
  GARAGE_HEIGHT,
  GARAGE_DOOR_NEAR,
  GARAGE_DOOR_SECONDS,
  makeHelicopters,
  stepHelicopters,
  helicopterPosition,
  HELIPAD_SIZE,
  HELI_ROTOR,
  HELI_LENGTH,
  makePlanes,
  stepPlanes,
  planePosition,
  AIRPORT_RUNWAY_WIDTH,
  PLANE_LENGTH,
  PLANE_SPAN,
  makeMonorailTrains,
  stepMonorailTrains,
  monorailPointAt,
  monorailCeiling,
  monorailFloors,
  MONORAIL_HEIGHT,
  MONORAIL_BEAM_WIDTH,
  MONORAIL_BEAM_DEPTH,
  MONORAIL_CARS,
  MONORAIL_CAR_LENGTH,
  MONORAIL_PLATFORM_OFFSET,
  MONORAIL_PLATFORM_LENGTH,
  MONORAIL_SPEED,
  PLAZA_FOUNTAIN_OFFSET,
  routeToPoint
} from './islandLayout.js'
import {
  BRIDGE_DECK_THICKNESS,
  bridgeDeckProfile,
  bridgeDeckAt
} from './bridgeDeck.js'
import { findWindowFaces, windowGeometry, windowVents } from './windows.js'
import {
  subdivideTriangles,
  GROUND_MESH_EDGE,
  SURFACE_GRASS,
  SURFACE_PAVED,
  surfaceLift
} from './terrain.js'

/**
 * How far the decorative ground ducks beneath a road, a pavement or a
 * building's forecourt.
 *
 * The grass and the sand are drawn three centimetres under the road. That was
 * fine while the world was flat, and cannot work on a hill: the two surfaces
 * are meshed at DIFFERENT points, and a flat triangle spanning two samples of
 * a surface that curves away sits above it. Near a kerb the ground falls off
 * within a metre, so the grass came up through the tarmac in green shards -
 * which is what Mike photographed.
 *
 * Chasing it with mesh resolution does not work: the error only halves as the
 * triangles quarter, and it was still thirty centimetres out at a cost of five
 * seconds an island. So the grass gets out of the way instead. It is hidden
 * under the road there, and the road is what you are meant to see.
 */
export const GROUND_SINK = 0.7

/**
 * How far paving laid with drapeOnSurface() stands over the collider.
 *
 * Two parts. Where the ground is claimed the grass has ducked GROUND_SINK out
 * of the way, so the paving only needs to clear the collider, and a tyre
 * should not visibly sink into it. Where the paving runs out over open grass
 * - the plaza's outer rim - it has to clear the grass cap as well, and the
 * two are triangulated differently: the grass stood up to 0.08 over the
 * collider there, measured on a half-unit grid over the hub plaza, and came
 * through in green shards at a flat 0.04.
 */
export const PAVING_CLEARANCE = 0.02
export const PAVING_OVER_GRASS = 0.09

/**
 * How far the grass cap sits above the sand it covers.
 *
 * Three centimetres, while the ground was flat. On a hill it cannot be: the
 * sand is triangulated from the island's outline and the grass from a ring
 * inset inside it, so the two meshes have DIFFERENT corners. Both follow the
 * same height field at their own corners and cross each other everywhere in
 * between, which shows as thin slivers of sand through the grass and grass
 * through the sand - hairlines rather than the shards a road produced,
 * because the two surfaces are nearly parallel.
 *
 * Thirty centimetres clears the worst of that, and reads as a low bank where
 * the grass meets the beach.
 *
 * The general rule, now written down twice: **two meshes with different
 * vertices cannot be stacked closer than the error between them.** Either
 * give them the same vertices, or leave a real gap.
 */
/**
 * Now derived rather than declared. It is the same number the collider is
 * lifted by on open ground, and the whole point of this bug was that the two
 * were written down separately and disagreed by exactly this much.
 */
export const GRASS_ABOVE_SAND = SURFACE_GRASS
import { mixHex, SNOW_COLOUR, SNOW_TAKE } from '../systems/seasons.js'
import { DECOR_KINDS, emptyLayer } from '../systems/holidays.js'
import { lampBrightness, blinkOn, gloomLevel, sideOfVehicle, sirenBeat } from './vehicleLights.js'
import { newFireState, stepFire, smokeStrength, fireHud, RESPONDERS } from './fireGame.js'
import {
  newPoliceState, stepPolice, policeHud, chooseRobber, ROBBER_SPEED
} from './policeGame.js'
import {
  newAmbulanceState, stepAmbulance, ambulanceHud, crewTarget,
  CRASH_CARS, CRASH_SIDE_OFFSET, crashBlocks
} from './ambulanceGame.js'
import {
  newTowState, startTow, stepTow, towHud, carOnHook, carsDown,
  hitchStage, dropStage, towGeometry, dragStep, ease, turnToward, TOW_RIG, yokeAt,
  crewTarget as towCrewTarget, HITCH_REACH, HITCH_SECONDS
} from './towGame.js'
import { CAR_HEIGHT } from './Vehicle.js'
import {
  buildPavements as buildPavementGraph, platformSpots, makePedestrians,
  stepPedestrians, walkCycle, isWalking, boardable,
  PEDESTRIANS, DRAW_RANGE, ANIMATE_RANGE
} from './pedestrians.js'
import {
  newMonorailState, stepMonorail, monorailHud,
  // The cab's door pictogram opens on the same clock the HUD's bar runs on,
  // so the two cannot drift apart. See updateMonorailCab().
  DOOR_SECONDS as RAIL_DOOR_SECONDS
} from './monorailGame.js'
import { chooseMission } from './missions.js'
import {
  newGasState, stepGas, gasHud, fuelGauge, hasTank
} from './gasGame.js'
import {
  newRaceState, stepRace, raceHud, gridOffset, gridSide,
  RACE_LAPS, RACE_FIELD, RACE_PACE
} from './raceGame.js'
import { BUILDING_MODELS, TREE_MODELS } from './modelManifest.js'
import {
  insetPolygon, insetPolygonRadial, polygonCentroid, pointInPolygon,
  rayDistanceToBoundary
} from './shapes.js'
import { pathTangents, ribbonQuads, distanceToPath } from './curves.js'
import {
  COURSE_GROUND, COURSE_ROAD, moundSolid, walkLoop, outsetLoop, pointAlongRing,
  STUNT_COURSE, MOUND_PAINT, RACE_LINE_AT, GRID_COLUMN_OFFSET, CIRCUIT_GATE,
  crushSolid, CRUSH_PILE, pitStraightPlan
} from './course.js'
import {
  loftSolid, carBody, raceBody, monsterBody, wheelPositions, WHEEL,
  trainCarBody, fuselageBody, helicopterBody, wingBody, canopyLobes
} from './vehicleParts.js'

/**
 * World - builds the geography described by islandLayout.js.
 *
 * Nothing about the shape of the world is decided here: island positions,
 * bridge connections, roads and districts all come from the map file. This
 * class only knows HOW to build things, not WHERE they go.
 *
 * Materials that should glow after dark are registered in `nightEmissives`;
 * the Environment system drives them via setTimeOfDay().
 *
 * Every prop checks the Assets loader first, so a matching .glb in
 * public/models/ replaces the built-in shape.
 */

// ---------------------------------------------------------------
// PALETTE - change these to restyle the whole world at once
// ---------------------------------------------------------------
/** How far apart street lamps run along a road. */
export const LAMP_SPACING = 26


/**
 * How tall each kind of traffic is. Only the collider needs this - the meshes
 * are built to their own proportions - but it has to match them, or you bump
 * into a bus at the height of its windows.
 */
/**
 * Bus shelters: how far the flag stands back from the road edge, and how far
 * the shelter stands back from the flag.
 */
/**
 * How quickly a vehicle's drawn position catches up with its simulated one, in
 * seconds. Long enough to round off the sideways step at a junction, short
 * enough that it never looks like lag.
 */
export const TRAFFIC_SMOOTHING = 0.11

/**
 * How likely a building is to have anybody in. The rest keep their windows
 * dark all night, so dusk looks like a city rather than a light switch.
 *
 * Was 0.65, which left a third of the town - about thirty buildings - black
 * at midnight, and on a street of four or five that reads as broken rather
 * than as variety. The variety now comes mostly from WINDOW_DARK_CHANCE
 * below, where it shows as unlit rooms in an occupied building.
 */
export const WINDOWS_LIT_CHANCE = 0.88

/** And within a lit building, how many rooms are empty. */
export const WINDOW_DARK_CHANCE = 0.3

export const SHELTER_SETBACK = 1.3
export const SHELTER_DEPTH = 1.9

/**
 * How each kind of station is dressed. Sizes and positions are NOT here -
 * those come from STATION_KINDS and getStations() in the layout, so the doors
 * line up with the bays by construction.
 */
export const STATION_LOOKS = {
  fire: {
    height: 8.5, wall: 0xb9433a, trim: 0x8f3229,
    door: 0xe8e2d4, sign: 0xffcf6b,
    label: 'FIRE STATION', badge: 'maltese'
  },
  police: {
    height: 9.5, wall: 0x2f4f7a, trim: 0x223b5d,
    door: 0xdfe6ee, sign: 0x7fc8ff,
    label: 'POLICE', badge: 'shield'
  },
  hospital: {
    height: 14, wall: 0xf1ece1, trim: 0xd8d0c0,
    door: 0xbfd8e4, sign: 0xff7d7d,
    label: 'HOSPITAL', badge: 'cross'
  },
  // Not a station you are dispatched from, but it uses the same signboard -
  // one canvas, badge and lettering together, lit at night. The height is the
  // KIOSK's; the canopy over the pumps is built separately and stands lower,
  // which is why the sign goes on the canopy fascia rather than over a door.
  fuel: {
    height: 4.6, wall: 0xf2f0ea, trim: 0x2f6f5e,
    door: 0xbfd8e4, sign: 0x5fe3a1,
    label: 'FUEL', badge: 'drop'
  }
}

/**
 * The gas station's canopy, pumps and bay markings.
 *
 * The canopy has to clear the tallest thing that can drive under it. A fire
 * engine is 2.7 and the monster truck is taller again, so 5.4 to the
 * underside leaves room for every one of them and still reads as a canopy
 * rather than a bridge.
 */
export const CANOPY_CLEAR = 5.4
export const CANOPY_DEPTH = 0.55
export const PUMP_HEIGHT = 1.9

/**
 * The signboard over each station's doors.
 *
 * Painted onto one canvas - badge and lettering together - rather than built
 * as geometry. Extruded lettering is a lot of triangles for something read
 * from thirty units away, and the badges are the sort of shape (a Maltese
 * cross, a shield) that is two lines of canvas path and a small pile of
 * boxes. The hub sign and the monorail station names already work this way;
 * this is the same trick a third time.
 *
 * 4:1, because the words are the long part and a badge sits square at one
 * end of them.
 */
export const STATION_SIGN_W = 1024
export const STATION_SIGN_H = 256

/** How long a garage door takes to go all the way up, in seconds. */
export const GARAGE_DOOR_TIME = 2.4

export const TRAFFIC_HEIGHTS = {
  sedan: 1.8,
  convertible: 1.5,
  pickup: 2.1,
  suv: 2.2,
  police: 1.8,
  ambulance: 2.4,
  fire: 2.7,
  // The mast over the service body is the tall part, not the cab.
  tow: 3,
  bus: 3,
  // Tall on purpose, and low on purpose. Ride height is the monster truck's
  // whole reason for existing and the racing car's whole reason for being
  // quick, so it is the first number either of them gets.
  monster: 3.2,
  race: 1.1
}

/**
 * Which way is up, once. `setFromAxisAngle` wants a Vector3 and a pedestrian
 * needs one per person per frame; there is only one up.
 */
const UP = new THREE.Vector3(0, 1, 0)

/** A figure standing still - no swing, no bob. Shared, never mutated. */
const STILL_CYCLE = {
  legLeft: 0, legRight: 0, armLeft: 0, armRight: 0, bob: 0, lean: 0
}

/**
 * A limb whose TOP is at its origin.
 *
 * BoxGeometry is centred on itself, so a box rotated about its own origin
 * pivots round its middle - an arm that does that windmills from the elbow
 * rather than swinging from the shoulder. Translating the geometry up by half
 * its length once, here, means the instance matrix can be a plain rotation
 * about the joint and the limb hangs from it.
 *
 * Doing it in the geometry rather than in the matrix also saves a translation
 * per limb per person per frame, which at eight hundred and forty limbs is
 * worth having.
 */
function hangingBox(width, length, depth) {
  const geometry = new THREE.BoxGeometry(width, length, depth)
  geometry.translate(0, -length / 2, 0)
  return geometry
}

/** An arm: slightly tapered would be nicer, and is not worth the vertices. */
function armGeometry(width, length, depth) {
  return hangingBox(width, length, depth)
}

/** A leg, which is thicker than an arm and a foot longer. */
function legGeometry(width, length, depth) {
  return hangingBox(width, length, depth)
}

/**
 * Place one limb: the body's transform, then a step out to the joint, then the
 * swing about it.
 *
 * Written as one function because it is called seven times per person per
 * frame and the arithmetic is identical every time; written to take the
 * scratch matrix rather than making one because at sixty frames a second the
 * allocations are the cost, not the multiplies.
 */
function setLimb(mesh, index, root, scratch, jx, jy, jz, swing) {
  scratch.makeRotationX(swing)
  scratch.setPosition(jx, jy, jz)
  scratch.premultiply(root)
  mesh.setMatrixAt(index, scratch)
}

export const PALETTE = {
  // Sea and shore
  seaDeep: 0x0e5a7a,
  seaShallow: 0x3fc4cc,
  sand: 0xeadaa8,
  sandWet: 0xd3bf8c,
  cliff: 0x9c8a6d,

  // Vegetation
  grass: 0x5fa84e,
  grassDark: 0x437f3f,
  palmTrunk: 0xa08256,
  frond: 0x4f9e46,
  frondLight: 0x74c25a,
  bush: 0x3f8f4a,
  flower: 0xff6f9c,

  // Town
  wallWhite: 0xf4eee2,
  wallCream: 0xecdcc0,
  wallTerracotta: 0xcf8261,
  wallTeal: 0x84c7c0,
  wallCoral: 0xe89a86,
  concrete: 0xd9d3c7,
  glass: 0x9fd0dd,
  roof: 0xb85c47,
  roofDark: 0x8f4636,

  // Infrastructure
  asphalt: 0x4c4a52,
  roadLine: 0xf3ead2,
  timber: 0x9a7350,

  // Monorail
  beam: 0xc8c3b8,
  beamDark: 0x8e8a82,
  trainBody: 0xf2f4f7,
  trainSkirt: 0x3b4350,

  // Traffic
  carRed: 0xc94f4f,
  carBlue: 0x4a7fb5,
  carWhite: 0xeef0f3,
  carSand: 0xd8c08a,
  carGreen: 0x5d9b74,
  carGrey: 0x8c9299,
  policeBody: 0x1f2a3a,
  policePanel: 0xf2f4f7,
  ambulanceBody: 0xf5f7fa,
  ambulanceStripe: 0xd8412f,
  fireBody: 0xc0342a,
  busBody: 0x3f7fbf,
  busRoof: 0xe8ecf1,
  tyre: 0x22262b,
  sirenRed: 0xff3a2f,
  sirenBlue: 0x3a6bff,
  brakeLight: 0xff4433,

  // Harbour
  quay: 0xbdb6a6,
  quayEdge: 0x8d8677,
  bollard: 0x54595f,
  crane: 0xe4763f,
  hull: 0x8d3b3b,
  hullDark: 0x5c2828,
  superstructure: 0xeef1f4,
  boatHull: 0xf0f2f4,
  boatTrim: 0x2f6f8f,
  container: 0x3d7fb8,
  containerAlt: 0xd4a53a,
  containerRust: 0xa8543c,

  // Lights (night)
  windowLit: 0xffd28a,
  lampLit: 0xffe9b8,
  signCyan: 0x4fe8ff,
  signPink: 0xff5fa2
}

/**
 * Spring flowers.
 *
 * Sown as clumps rather than singly: one accepted ground sample carries
 * several flowers, so the field looks dense for a fraction of the sampling
 * cost. Every one of those samples runs isBuildable(), which walks every road
 * on the island, and that is the expensive part - not the geometry.
 */
/**
 * The smoke column.
 *
 * Big and long-lived on purpose: it is the only thing telling you where the
 * fire is, so it has to be visible from the next island rather than merely
 * present. SMOKE_RISE is how high the column goes before a puff is recycled.
 */
export const SMOKE_COUNT = 130
export const SMOKE_LIFE = 5.5
export const SMOKE_RISE = 46

/**
 * Fire out of the windows.
 *
 * The roof plume says WHERE from the next island; the windows say the
 * building is alight rather than its chimney is. Both, then - the plume is
 * what you navigate by and it stays.
 *
 * The openings are the model's own, found by windows.js: the same triangles
 * that get glass over them at night. Nothing here guesses a grid, for exactly
 * the reason written at the top of that file - a guessed grid put glass in
 * the sky beside the buildings, and a guessed grid here would put flames
 * there too.
 */
export const WINDOW_FIRE_MAX = 8

/**
 * Only the upper part of the building burns visibly.
 *
 * Fires vent upward, and lighting a ground-floor window puts flame at the
 * height a fire engine parks - so the truck you drove there is inside it.
 * 0.35 keeps the lowest flame clear of the apron and still lets a two-storey
 * house have windows on fire at all.
 */
export const WINDOW_FIRE_FLOOR = 0.35

/** How far out of the opening a flame leans, as a fraction of its width. */
export const WINDOW_FIRE_LEAN = 0.45

/**
 * The fire engine's aerial - a tower ladder, built from Mike's photographs.
 *
 * Three things in those pictures the first version had wrong, and each of
 * them is the sort of thing you only see when you look at the real object:
 *
 * 1. IT IS REAR-MOUNTED. The turntable sits at the BACK of the truck, behind
 *    the body, and the ladder lies forward over the cab when it is stowed.
 *    The first version had it rising out of the middle of the roof, which is
 *    where you would put it if you had never seen one.
 * 2. IT IS A BOX TRUSS, not a ladder. Four chords - two top, two bottom -
 *    with rungs across the bottom pair and diagonal bracing down each side.
 *    That lattice is the whole silhouette against the sky.
 * 3. THE WATER COMES OUT OF THE BASKET. There is a platform at the tip with a
 *    monitor on its rail, and the jet starts THERE. It does not run up the
 *    ladder from the truck.
 *
 * And a fourth, which Mike pointed out directly: the basket stands OFF the
 * building. It is parked in the air a few metres clear and hoses in - it does
 * not go up to the wall and touch it.
 */
export const LADDER_WIDTH = 0.62

/**
 * Top chords to bottom chords. This is what makes it a truss rather than a
 * ladder, and it is the measurement that reads at distance: side-on, the
 * depth is the whole depth of the object.
 */
export const LADDER_DEPTH = 0.46

/**
 * The bracing, in bays of roughly constant length however far it is run out.
 *
 * The bays are repositioned each frame rather than living inside the scaled
 * section, and that is not fussiness. Diagonals inside a node scaled 12x in z
 * shear: a brace authored at 45 degrees comes out at 5, which is
 * indistinguishable from the chords it is meant to be bracing. So the chords
 * - which genuinely do stretch - are scaled, and the rungs and braces are
 * placed.
 */
export const LADDER_BAY = 0.85
export const LADDER_MAX_BAYS = 30

/**
 * Where the turntable sits: how far back from the middle of the truck, as a
 * fraction of its length, and how high.
 *
 * 2.05 is the top of the rear body (its centre is 1.15, its height 1.7), so
 * the turntable stands ON the bodywork rather than inside it.
 */
export const LADDER_MOUNT_BACK = 0.3
export const LADDER_MOUNT = 2.05

/**
 * How far clear of the building the basket parks, and how far above its roof.
 *
 * Mike: "the basket is a bit separated from the building it's working on".
 * Both matter - a basket touching the wall reads as a crash, and one level
 * with the roof disappears behind the parapet.
 */
export const LADDER_STANDOFF = 3.2
export const BASKET_ABOVE_ROOF = 1.9

/** The platform at the tip. */
export const BASKET_WIDTH = 1.3
export const BASKET_DEPTH = 1
export const BASKET_RAIL = 0.9

/** How fast it swings, lifts and runs out. Low enough to watch. */
export const LADDER_RATE = 1.5

/**
 * The smoke off a crashed engine.
 *
 * Small on purpose, and its own thing rather than a reuse of the fire's: that
 * column rises 46 units and is meant to be seen from the next island. A
 * bonnet smoking after a shunt should say "something happened here" from
 * across the street without implying the road is ablaze.
 */
export const CRASH_SMOKE_COUNT = 90
export const CRASH_SMOKE_LIFE = 2.6
export const CRASH_SMOKE_RISE = 4.5

/**
 * The festive lighting, on a building's front.
 *
 * A storey here is only used to space the strands down the façade - it does
 * not have to match whatever the model actually did with its floors, because
 * a string of lights hung across a wall is not surveyed to the brickwork.
 */
export const STOREY_HEIGHT = 3
export const DOOR_HEIGHT = 2.4
export const DOOR_WIDTH = 1.6
export const DOOR_BULBS = 9

/** Droplets in the water jet. */
export const JET_COUNT = 90

/**
 * The player's top speed, so the robber can be set just under it.
 *
 * Taken from Vehicle's own tuning rather than written out again - if the car
 * ever gets faster, the robber does too, and a chase stays a chase.
 */
export const PLAYER_TOP_SPEED = 18

/** How fast a robber's paintwork flashes, so you can pick it out. */
export const ROBBER_FLASH = 3.2

/** And what colour it flashes. Warm, so it reads against blue lights. */
export const ROBBER_FLASH_COLOUR = 0xffc04a

/** How often the patrol cars are re-pointed at a moving robber. */
export const CHASE_REROUTE = 4

export const FLOWERS_PER_CLUMP = 3
export const FLOWER_COLOURS = [
  0xff6f9c,   // pink - the one already in the palette
  0xffd75e,   // buttercup
  0xf4f0e6,   // white
  0xb98cf0,   // lilac
  0xff9a4d    // marigold
]

/**
 * How thickly holiday decorations are sown, per kind, as a share of the
 * sites collected while building.
 *
 * Not one number for all of them, because they are not the same sort of
 * thing. Easter eggs are hidden by the dozen and gifts pile up; a bunny or a
 * turkey is an animal, and a lawn carrying as many turkeys as it carries eggs
 * is a poultry farm rather than Thanksgiving. The shares are what make the
 * sparse ones read as sightings.
 */
export const DECOR_SHARE = {
  eggs: 0.85,
  // Halloween's. Jack-o'-lanterns are what a street puts out by the dozen;
  // ghosts nearly as many; a witch or a HAPPY HALLOWEEN sign is a thing one
  // household on a street does. Gravestones want a churchyard's worth without
  // turning every verge into one.
  // Dropped from 0.42. Sixty-six of them on one island read as an
  // installation rather than as a decoration somebody put out, which was half
  // of why they scanned as a field of snowmen.
  ghosts: 0.22,
  witches: 0.14,
  graves: 0.3,
  signs: 0.12,
  bunnies: 0.16,
  pumpkins: 0.5,
  turkeys: 0.18,
  gifts: 0.55,
  // A Christmas tree is a thing somebody put there, so they are commoner than
  // the animals and rarer than the eggs; a snowman is somebody's afternoon,
  // so rarer still.
  trees: 0.45,
  snowmen: 0.28
}

/**
 * How big each kind is, on top of the site's own size.
 *
 * The site size (1.9 to 2.5) exists because an Easter egg at true scale is one
 * pixel from a moving car. Everything then inherited it, including things that
 * were never small: measured in the world, a witch came out 6.1 units tall
 * against a three-unit storey and a 4.4-unit car - two storeys of witch. A
 * ghost was 4.5, a headstone 2.9.
 *
 * So the site size stays as the VARIATION between one instance and the next,
 * and this is what each kind actually is. The numbers are world units of
 * height at an average site: a lawn ghost taller than a person, a headstone
 * you could lean on, a Christmas tree you could not.
 */
export const DECOR_SCALE = {
  ghosts: 0.58,      // ~2.6 units
  witches: 0.46,     // ~2.8
  snowmen: 0.52,     // ~2.6
  trees: 0.8,        // ~3.6
  graves: 0.48,      // ~1.4
  signs: 0.7
}

/** How far apart decoration sites are sown, as area per site. */
export const DECOR_SITE_AREA = 260

export const EGG_COLOURS = [
  0xff8fb8, 0x8fd8ff, 0xfff08f, 0xa8f0a0, 0xd8a8ff, 0xffd0a0
]
export const GIFT_COLOURS = [0xd6342e, 0x2f7d43, 0x2b58a8, 0xe0b03a]

/**
 * The festive bulbs, one strand per colour.
 *
 * Three strands rather than one with per-instance colours, and the reason is
 * worth recording: an InstancedMesh has ONE material, and it is the material
 * that carries `emissive`. Per-instance colour tints the diffuse only, so a
 * single strand at night - when emissive is doing all the work - washes out
 * to one colour and the whole point of a string of lights is lost. Three
 * materials is three draw calls and keeps them red, green and gold after dark.
 */
export const FESTIVE_COLOURS = [0xff3b30, 0x35c759, 0xffcf4a]

/**
 * And the same three strands at Halloween: orange, amber, and a deep pumpkin.
 *
 * Mike, on the first pass: "don't add the Christmas lights ... If it's
 * convenient to have decorative lights, make them have orange colored lights."
 * Red, green and gold on a Halloween street read as somebody having left the
 * Christmas ones up.
 */
export const SPOOKY_COLOURS = [0xff7518, 0xff9e3d, 0xd4571a]

/** How many bulbs go round a building's eaves. */
/**
 * How a vehicle turns to face where the road is going: a time constant and a
 * hard cap on the rate.
 *
 * Both, not either. The constant is what makes a corner look driven rather
 * than machined - the turn starts gently and finishes gently. The cap is what
 * guarantees no junction, however sharp, is taken in a single frame.
 */
/**
 * How fast an aircraft swings to face where it is going.
 *
 * Slower than a car by a long way, and capped harder: an airliner is 26 units
 * long and a tug turning one off a stand takes the best part of a minute. The
 * cap is what makes the pushback read as a pushback rather than a pirouette.
 */
export const PLANE_TURN_EASE = 0.9
export const PLANE_TURN_RATE = 0.55

export const TRAFFIC_TURN_EASE = 0.14
export const TRAFFIC_TURN_RATE = 2.6

export const BULBS_PER_BUILDING = 16

/** And how many are wound down a Christmas tree. */
export const TREE_BULBS = 11

export class World {
  constructor() {
    this.game = Game.getInstance()
    this.assets = this.game.assets

    // Warn about map mistakes before we try to build anything
    validateLayout()

    // Exposed so the minimap can draw the same geography
    this.layout = { islands: ISLANDS, bridges: getBridges() }

    this.nightEmissives = []  // materials that light up after dark
    this.buildings = []       // everything with a roof, so one can catch fire
    this.seasonals = []       // materials that change colour with the year
    this.flowerSites = []     // where spring flowers come up, filled while building
    this.decorSites = []      // and where holiday decorations go, likewise
    this.wreathSites = []     // one per building door, for Christmas
    this.doorSites = []       // and on the ground in front of it, for Halloween
    this.fields = []          // every instanced field that grows: flowers, decorations
    this.holiday = emptyLayer()
    this.festiveLevel = 0     // how much of the festive lighting is on
    this.swayables = []       // foliage that moves in the wind
    this.trafficLights = []   // signal heads, grouped by junction
    this.lightPools = []      // the patch of lit ground under a lamp
    this.trains = []          // monorail trains, and where they've got to
    this.elapsed = 0

    // Deterministic pseudo-random so the world looks the same each visit
    this._seed = 20260727

    // The monorail is worked out BEFORE anything is built, because the
    // islands need to know where its piers and stair towers come down so
    // they don't put a building there. Nothing is drawn yet - this is all
    // geometry.
    this.monorail = getMonorailRoute()
    this.monorailPiers = this.monorail ? getMonorailPiers(this.monorail) : []
    this.monorailTowers = this.monorail ? getMonorailStationTowers(this.monorail) : []

    // Same reasoning for the harbours: the quay and its cranes claim ground
    // that the towns must not build on.
    this.ports = getPorts()
    this.seaGraph = getSeaGraph()

    // The lane network and the bus stops. Also derived before anything is
    // built, because the stops put shelters on the pavement and those have to
    // claim their ground like everything else.
    this.lanes = getLaneNetwork()
    this.busStops = getBusStops(this.lanes)

    // Fire stations, police stations and hospitals. Derived here rather than
    // in createStations() because their yards have to claim their ground
    // before any house is placed - see monorailFootprints().
    this.stations = getStations(this.lanes)

    // Gas stations, for the same reason and in the same breath. Sited AFTER
    // the emergency stations (they are fussier) but before a single house, or
    // the town generator builds straight through the forecourt - which is
    // exactly what the first run did: a canopy with an apartment block
    // standing in the middle of it.
    this.fuelStations = getFuelStations(this.lanes)

    // EVERY building whose way in has to stay clear, in one list.
    //
    // blocksStationEntrance() already existed and the streetlights already
    // asked it - Mike's note about lamp posts across a fire station's doors.
    // But the street dressing never did, so benches, bins, planters and trees
    // went on regardless, and the gas stations were not in the list at all.
    // One list, asked by every placer, rather than each placer growing its
    // own idea of where a door is.
    this.accessStations = [...this.stations, ...this.fuelStations]

    this.createSea()
    this.createIslands()
    this.createBridges()
    this.createConnectingRoads()
    this.createCourses()
    this.createMonorail()
    this.createPorts()
    this.createShips()
    this.createAirport()
    this.createPlanes()
    this.createHelicopters()
    this.createPedestrians()
    this.createPlayerGarage()
    this.createBusStops()
    this.createStations()
    this.createFuelStations()
    this.createTraffic()
    this.createHubSign()

    // Last: a fire needs the buildings to exist before it can pick one, and
    // the traffic to exist before it can send anybody.
    this.fire = newFireState()
    this.createFireEffects()
    // Fuel. After the stations exist, because the bays are where you fill up
    // and newGasState() is handed them the moment the first frame runs.
    this.gas = newGasState()
    this.fuelBays = getFuelBays(this.lanes)
    this.police = newPoliceState()
    this.ambulance = newAmbulanceState()
    this.race = newRaceState()
    this.createRaceField()
    this.crashSites = this.findCrashSites()
    this.createWreckCars()
    this.tow = newTowState()
    this.rail = newMonorailState()
  }

  /**
   * Everything the monorail puts on the ground of one island, in
   * ISLAND-LOCAL coordinates, ready to go straight into placedFootprints.
   *
   * Buildings and props consult that list, so a pier gets a clear space
   * around it rather than a house built through it.
   */
  monorailFootprints(island) {
    const out = []

    for (const pier of this.monorailPiers) {
      if (pier.island !== island) continue
      out.push({ x: pier.x - island.x, z: pier.z - island.z, radius: 4.5 })
    }

    for (const tower of this.monorailTowers) {
      if (tower.island !== island) continue
      out.push({ x: tower.x - island.x, z: tower.z - island.z, radius: 7 })
      // And the platform overhead, so nothing tall grows into it
      out.push({
        x: tower.station.x - island.x,
        z: tower.station.z - island.z,
        radius: MONORAIL_PLATFORM_LENGTH / 2
      })
    }

    // The station and the yard in front of it. A house across the apron would
    // stand between a fire engine and its own garage door.
    for (const station of this.stations) {
      if (station.island !== island) continue
      out.push({
        x: station.x - island.x, z: station.z - island.z,
        radius: Math.max(station.width, station.depth) * 0.62
      })
    }

    // A gas station claims more than its kiosk: the canopy stands out over
    // the pumps and the concrete runs out to the road, and all of it has to
    // be clear of houses or you drive into one on the way to the pump.
    for (const station of this.fuelStations || []) {
      if (station.island !== island) continue
      // Measured off the concrete rather than the kiosk: the forecourt is
      // nearly twice the building, and a tree on it is a tree between you and
      // the pump.
      const yard = fuelApron(station)
      const reach = yard
        ? Math.hypot(yard.width / 2, yard.offset + yard.depth / 2)
        : Math.max(station.width, station.depth)
      out.push({
        x: station.x - island.x, z: station.z - island.z,
        radius: reach
      })
    }

    // The harbour apron: the pier root and the hard standing behind it.
    // A house built across the entrance to the quay would leave a road you
    // couldn't drive down.
    for (const port of this.ports) {
      if (port.island !== island) continue
      out.push({
        x: port.localRoot.x, z: port.localRoot.z,
        radius: port.width + 9
      })
    }

    return out
  }

  // -------------------------------------------------------------
  // Seeded RNG
  // -------------------------------------------------------------
  rand() {
    this._seed = (this._seed * 16807) % 2147483647
    return (this._seed - 1) / 2147483646
  }

  randRange(min, max) {
    return min + this.rand() * (max - min)
  }

  pick(arr) {
    return arr[Math.floor(this.rand() * arr.length)]
  }

  /**
   * A soft round patch of light on the ground.
   *
   * An emissive material in Three.js glows but doesn't illuminate
   * anything - so a street lamp looked lit while the road under it stayed
   * black. Real lights would fix that, but a lamp on every third plot is
   * dozens of them and the renderer won't take it. This fakes the pool of
   * light instead: one shared radial-gradient texture, added rather than
   * blended, fading in as night falls.
   */
  addLightPool(x, z, radius, strength = 1) {
    if (!this._glowTexture) {
      const size = 128
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = size
      const ctx = canvas.getContext('2d')
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      grad.addColorStop(0, 'rgba(255,240,205,1)')
      grad.addColorStop(0.45, 'rgba(255,235,190,0.42)')
      grad.addColorStop(1, 'rgba(255,230,180,0)')
      ctx.fillStyle = grad
      ctx.fillRect(0, 0, size, size)

      this._glowTexture = new THREE.CanvasTexture(canvas)
    }

    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(radius * 2, radius * 2),
      new THREE.MeshBasicMaterial({
        map: this._glowTexture,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      })
    )
    pool.rotation.x = -Math.PI / 2
    // Above the road surface, the pavements and the crossings, so it
    // lights all of them rather than being hidden under one.
    pool.position.set(x, this.groundAt(x, z) + 0.15, z)
    this.game.add(pool)
    this.lightPools.push({ mesh: pool, strength })
    return pool
  }

  /**
   * A material that lights up after dark.
   *
   * `festive` marks it as a holiday light, which is scaled by the holiday
   * layer on top of the night factor. It is a flag on this list rather than a
   * second list because there must be exactly one answer to "how lit is this
   * material" - two lists would be two answers, and the Christmas bulbs would
   * end up on their own dusk curve that drifted away from every street lamp
   * in the world.
   */
  registerNightLight(material, strength = 1, festive = false) {
    material.emissive = new THREE.Color(material.emissive || 0x000000)
    this.nightEmissives.push({ material, strength, festive })
    return material
  }

  /**
   * Materials that change colour with the year.
   *
   * The same shape as registerNightLight, and for the same reason: the season
   * is one number arriving once a frame, and it should touch a list rather
   * than go looking for meshes.
   *
   * The material's own colour is captured HERE, at registration, and every
   * later tint is computed from that captured value. Tinting in place would
   * compound - a material nudged 40% toward white every frame is white within
   * a second, and the bug would look like the season being far too strong
   * rather than like the season being applied twice.
   *
   * `strength` scales how much of the season this particular material takes.
   * The palms are registered at a fraction, because SKILLS and BLOG are meant
   * to stay jungle and a coconut palm in full autumn orange is not a jungle.
   */
  registerSeasonal(material, role, strength = 1) {
    this.seasonals.push({ material, role, strength, base: material.color.getHex() })
    return material
  }

  /**
   * Apply a season. `view` comes from seasons.js via Environment, already
   * eased - nothing here decides anything, it only paints.
   */
  setSeason(view) {
    for (const entry of this.seasonals) {
      const [colour, amount] = view[entry.role] || [0, 0]

      // Two steps, in this order: what the season has done to the thing
      // itself, and then what is lying on top of it. Winter's own tint is
      // dormant grass and bare branches; the white is snow, and it arrives
      // and melts on its own clock. That is why picking SNOWING in July
      // still whitens the ground - `snow` is one number and it reaches the
      // world through this one line whatever put it there.
      const seasonal = mixHex(entry.base, colour, amount * entry.strength)
      const lying = view.snow * (SNOW_TAKE[entry.role] || 0) * entry.strength

      entry.material.color.setHex(mixHex(seasonal, SNOW_COLOUR, lying))
    }
    this.setFlowering(view.flowers)

    // Snowmen belong to the SNOW, not to the calendar and not to Christmas.
    // They come up as the ground goes white and go as it thaws - which means
    // a flurry in a mild season builds a few and then takes them away again,
    // and a green Christmas has none, both of which are right.
    //
    // Remembered rather than applied here, because a holiday is allowed to
    // veto them and only setHolidayLayer knows about that. One place ends up
    // knowing both numbers, which is better than this one guessing.
    this.snowLevel = view.snow
    this.growSnowmen()
  }

  // -------------------------------------------------------------
  // Sea
  // -------------------------------------------------------------
  createSea() {
    const geometry = new THREE.PlaneGeometry(1400, 1400, 100, 100)

    const material = new THREE.MeshStandardMaterial({
      color: PALETTE.seaShallow,
      roughness: 0.22,
      metalness: 0.35,
      transparent: true,
      opacity: 0.94,
      flatShading: true
    })

    // Inject waves into the vertex shader, keeping standard PBR lighting
    // so the sea still responds to the sun and the weather.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      this.seaUniforms = shader.uniforms

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           float waveHeight(vec2 p) {
             return sin(p.x * 0.055 + uTime * 0.85) * 0.42
                  + sin(p.y * 0.041 - uTime * 0.62) * 0.36
                  + sin((p.x + p.y) * 0.028 + uTime * 1.15) * 0.22;
           }`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           transformed.z += waveHeight(position.xy);`
        )
    }

    const sea = new THREE.Mesh(geometry, material)
    sea.rotation.x = -Math.PI / 2
    sea.position.y = SEA_LEVEL
    sea.receiveShadow = true
    this.game.add(sea)

    // Darker water underneath so gaps read as depth
    const deep = new THREE.Mesh(
      new THREE.PlaneGeometry(1600, 1600),
      new THREE.MeshBasicMaterial({ color: PALETTE.seaDeep })
    )
    deep.rotation.x = -Math.PI / 2
    deep.position.y = SEA_LEVEL - 4.6
    this.game.add(deep)
  }

  // -------------------------------------------------------------
  // Islands
  // -------------------------------------------------------------
  createIslands() {
    // What the pavements will be derived from, collected as we go.
    //
    // getIslandRoads() and getTrafficSignals() are not cheap - about seven
    // hundred milliseconds between them across six islands - and this loop is
    // already calling both. Handing the results to createPedestrians() rather
    // than letting it ask again is the difference between the crowd costing
    // sixty milliseconds at start-up and costing three quarters of a second.
    this.pavementSource = []

    for (const island of ISLANDS) {
      this.createLandmass(island)

      // Roads still come back complete, because prop placement needs to
      // know about all of them. Only the hand-authored ones get drawn
      // here though - the automatic bridge approaches are drawn as part
      // of one continuous road per bridge, so there's no seam.
      const roads = getIslandRoads(island)

      // Junctions are needed before the roads are drawn, so a road can
      // stop painting its centre line where it crosses another one.
      const junctions = getIslandJunctions(island).map(j => ({
        x: island.x + j.x, z: island.z + j.z, radius: j.radius
      }))
      this.noMarkings = junctions

      for (const road of roads) {
        if (!road.auto) this.buildRoad(island, road)
      }

      // Pavements go down before the junction patches, so the asphalt
      // covers their ends where they run into a crossroads.
      for (const road of roads) {
        if (road.street || road.ring) this.buildPavements(island, road, roads)
      }

      // Footpaths out to anything a road doesn't pass
      for (const walk of getWalkways(island)) {
        this.buildWalkway(island, walk)
      }

      // Light every road on every island. This used to hang off the town
      // plot layout, so the hub - which has no town - had no lamps at all.
      this.lightRoads(island, roads)

      // Patch every place two roads meet. A road is a ribbon with square
      // ends, so a spur running into the ring leaves two bare corners
      // where they cross. A disc of the same asphalt at the same height
      // fills them and is invisible everywhere else.
      for (const junction of getIslandJunctions(island)) {
        this.buildJunction(
          island.x + junction.x,
          island.z + junction.z,
          junction.radius
        )

      }

      // Signals are decided in the layout, where junctions that a driver
      // sees as one are merged and each approach counted once. Crossings
      // follow the same approaches, so they can't land on an arm that
      // isn't there.
      const signals = getTrafficSignals(island)
      for (const signal of signals) {
        this.buildTrafficSignal(island, signal)
        this.buildCrossings(island, signal, roads)
      }

      // A course island is graded tarmac end to end and has no pavements to
      // walk on - the same rule that keeps helipads out of the stadium.
      if (!isCourseIsland(island)) {
        this.pavementSource.push({
          id: island.id, x: island.x, z: island.z, roads, signals
        })
      }

      this.decorateIsland(island, roads)
    }

    // Built once, after every island, from the sites each island collected.
    // Two instanced meshes for the whole world rather than a mesh per
    // flower - there are thousands of them and they all move together.
    this.createFlowers()
    // After the flowers, and after every island: the festive strands are hung
    // off `this.buildings`, which is not complete until the last one is up.
    this.createDecorations()
  }

  /**
   * Build the landmass from the island's outline, whatever shape it is.
   *
   * Three layers:
   *   - a sandy top face covering the whole outline
   *   - a grass cap inset from it, so a beach ring shows around the rim
   *   - tapered side walls dropping below the waterline
   *
   * The same triangles that make the top and the walls are handed to the
   * physics engine as a trimesh, so the collision matches what you see -
   * including concave bays and lagoons.
   */
  createLandmass(island) {
    const { x: cx, z: cz } = island
    const outline = islandOutline(island)

    // Everything on this island asks the same height field, so the sand, the
    // grass, the collider and the roads cannot disagree about where the
    // ground is.
    //
    // The DRAWN ground ducks under anything flat - see GROUND_SINK. The
    // collider does not: what you drive on stays the true surface.
    const terrain = getIslandTerrain(island)
    const height = (x, z) =>
      terrain.heightAt(x, z) - GROUND_SINK * terrain.claimAt(x, z)

    // --- Top face (sand) ---
    // Subdivided once for this island and shared with the collider below.
    const shared = this.islandGroundTriangles(island, outline)

    const sandTop = this.polygonMesh(outline, cx, 0, cz, {
      color: PALETTE.sand, roughness: 1, metalness: 0, flatShading: true
    }, height, shared)
    sandTop.receiveShadow = true
    this.registerSeasonal(sandTop.material, 'ground')
    this.game.add(sandTop)

    // --- Grass cap, inset so the sand reads as a beach ---
    const beachWidth = Math.max(2, islandReach(island) * 0.13)

    // Radial, not the bisector inset. Pulling a wobbly coastline in by 16
    // units with the bisector method makes the polygon cross itself, and
    // the triangulation then leaves a star-shaped hole with the sand
    // showing through - which is what the pale patch on About was.
    const grassRing = insetPolygonRadial(outline, beachWidth)

    if (grassRing.length >= 3) {
      const grass = this.polygonMesh(grassRing, cx, GRASS_ABOVE_SAND, cz, {
        color: PALETTE.grass, roughness: 0.95, metalness: 0, flatShading: true
      }, height)
      grass.receiveShadow = true
      // The one that matters. In winter this IS the snow on the ground -
      // there is no white mesh laid over the grass, deliberately: a second
      // surface a few centimetres above a first one is item 29's trap, and
      // the grass has already shown through the tarmac three times for
      // exactly that reason. Colouring the ground cannot z-fight with it.
      this.registerSeasonal(grass.material, 'grass')
      this.game.add(grass)
    }

    // --- Side walls ---
    const wallGeo = this.wallGeometry(outline, 0, -ISLAND_DEPTH, 0.72)
    const walls = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({
      color: PALETTE.sand, roughness: 1, metalness: 0, flatShading: true
    }))
    walls.position.set(cx, 0, cz)
    walls.castShadow = true
    walls.receiveShadow = true
    // A fraction of the ground tint. Snow does not lie on a cliff face the
    // way it lies on a lawn, and a white wall dropping into the sea reads as
    // a bug rather than as winter.
    this.registerSeasonal(walls.material, 'ground', 0.3)
    this.game.add(walls)

    // --- Wet sand band at the waterline ---
    const wetGeo = this.wallGeometry(outline, SEA_LEVEL + 0.55, SEA_LEVEL - 0.55, 0.985)
    const wet = new THREE.Mesh(wetGeo, new THREE.MeshStandardMaterial({
      color: PALETTE.sandWet,
      roughness: 0.75,
      metalness: 0.05,
      side: THREE.DoubleSide,
      flatShading: true
    }))
    wet.position.set(cx, 0, cz)
    this.game.add(wet)

    // The grass ring, so the collider is lifted onto the grass cap where
    // there is one and left on the sand where there is not.
    this.buildLandCollider(island, outline, cx, cz,
      grassRing.length >= 3 ? grassRing : null)

    // Kept, so surfaceAt() can answer the same question the collider did.
    if (!this.grassRings) this.grassRings = new Map()
    this.grassRings.set(island.id, grassRing.length >= 3 ? grassRing : null)
  }

  /**
   * How high the surface the vehicles actually rest on is: the land
   * collider's height, not the bare height field's.
   *
   * groundAt() is the height field, and nothing is drawn on it - see
   * buildLandCollider(). Anything laid flat on the ground for a vehicle to
   * drive over (the plaza, the garage apron) has to follow THIS, or the
   * vehicle sinks into it wherever the ground underneath stops being level.
   */
  surfaceAt(x, z) {
    return this.surfaceSample(x, z).height
  }

  /** surfaceAt(), and how much of the grass cap is still standing there. */
  surfaceSample(x, z) {
    const island = islandAt(x, z)
    const terrain = island && getIslandTerrain(island)
    if (!terrain) return { height: this.groundAt(x, z), grass: 0 }

    const lx = x - island.x
    const lz = z - island.z
    const ring = this.grassRings && this.grassRings.get(island.id)
    const onGrass = !ring || pointInPolygon(ring, lx, lz)
    const claim = terrain.claimAt(lx, lz)
    return {
      height: terrain.heightAt(lx, lz) + (onGrass ? surfaceLift(claim) : 0),
      // 1 on open grass, 0 where the grass has ducked under paving.
      grass: onGrass ? 1 - Math.min(1, Math.max(0, claim)) : 0
    }
  }

  /**
   * Lay a flat, horizontal geometry in world coordinates onto the drivable
   * surface - PAVING_CLEARANCE above it, and more where it runs out over
   * grass. Every vertex is lifted on its own, so the mesh needs to be
   * subdivided finely enough to follow the slope.
   */
  drapeOnSurface(geometry) {
    const position = geometry.attributes.position
    for (let i = 0; i < position.count; i++) {
      const at = this.surfaceSample(position.getX(i), position.getZ(i))
      position.setY(i,
        at.height + PAVING_CLEARANCE + PAVING_OVER_GRASS * at.grass)
    }
    position.needsUpdate = true
    geometry.computeVertexNormals()
    return geometry
  }

  /**
   * The island's outline, triangulated and subdivided - computed ONCE.
   *
   * The sand mesh and the physics collider are the same polygon, subdivided to
   * the same edge length, against the same height field. They were doing that
   * work twice: triangulate, then split every triangle until it follows the
   * ground, asking the height field at every midpoint on the way. On this map
   * that is the single most expensive thing the loader does, and scaling the
   * islands 1.7x multiplied the whole load by 2.8 - it is what grows with the
   * area.
   *
   * Subdivided against BOTH surfaces (see subdivideTriangles): the drawn
   * ground ducks under anything paved and the collider does not, so the shared
   * tessellation has to be fine enough for whichever is worse. They then each
   * apply their own height to the same x/z points - which also means the two
   * now share vertices exactly, rather than being two meshes that happen to
   * nearly agree.
   */
  islandGroundTriangles(island, outline) {
    if (!this.groundTessellation) this.groundTessellation = new Map()

    const cached = this.groundTessellation.get(island.id)
    if (cached) return cached

    // Both fields worked out HERE rather than passed in, so the answer cannot
    // depend on which caller happens to arrive first. Passing them in meant
    // the sand asking for both and the collider asking for one, and whichever
    // ran first decided how fine the mesh was for both - a trap that would sit
    // quietly until someone reordered two lines in createIsland().
    const terrain = getIslandTerrain(island)
    const fields = [
      (x, z) => terrain.heightAt(x, z),
      (x, z) => terrain.heightAt(x, z) - GROUND_SINK * terrain.claimAt(x, z)
    ]

    const contour = outline.map(p => new THREE.Vector2(p.x, p.z))
    const faces = THREE.ShapeUtils.triangulateShape(contour, [])
    const flat = faces.map(face => [face[2], face[1], face[0]].map(
      idx => ({ x: contour[idx].x, z: contour[idx].y })))

    const triangles = subdivideTriangles(flat, GROUND_MESH_EDGE, fields)
    this.groundTessellation.set(island.id, triangles)
    return triangles
  }

  /**
   * Triangulate a polygon into a flat horizontal mesh at height `y`.
   * Points are island-local; cx/cz place it in the world.
   */
  polygonMesh(points, cx, y, cz, materialOptions, heightAt = null,
              readyTriangles = null) {
    let triangles = readyTriangles

    if (!triangles) {
      // THREE triangulates in the XY plane, so feed it (x, z) and lay it flat
      const contour = points.map(p => new THREE.Vector2(p.x, p.z))
      const faces = THREE.ShapeUtils.triangulateShape(contour, [])

      // Island-local triangles, before any height is applied
      triangles = faces.map(face => [face[2], face[1], face[0]].map(
        idx => ({ x: contour[idx].x, z: contour[idx].y })))

      // Ground that goes up and down needs vertices to go up and down WITH,
      // and a triangulated coastline has triangles a hundred units across.
      // Split them until every edge is short enough to follow a hill.
      if (heightAt) {
        triangles = subdivideTriangles(triangles, GROUND_MESH_EDGE, heightAt)
      }
    }

    const positions = new Float32Array(triangles.length * 9)
    let o = 0
    for (const triangle of triangles) {
      for (const p of triangle) {
        positions[o++] = p.x
        positions[o++] = (heightAt ? heightAt(p.x, p.z) : 0) + y
        positions[o++] = p.z
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.computeVertexNormals()

    const mesh = new THREE.Mesh(
      geometry, new THREE.MeshStandardMaterial(materialOptions)
    )
    mesh.position.set(cx, 0, cz)
    return mesh
  }

  /**
   * How high the ground is, in world coordinates. Sea level over water -
   * unless there is a bridge over it.
   *
   * THE MAX() IS SAFE FOR ONE REASON and it is worth naming, because it is
   * easy to break: `bridgeDeckProfile()` is exactly zero at both shores, so
   * the deck and the sea meet at the coastline rather than needing a blend.
   * Nothing on land changes - near the shore the arch is at zero and the
   * island's own terrain wins - so the buildings, the trees, the pads and the
   * fingerprint are all untouched by this.
   *
   * Everything that follows the ground now follows the arch for free: the road
   * surface across the bridge (`buildRoadSurface` lifts every vertex by
   * groundAt), the AI traffic (its collider is placed at groundAt + height/2
   * each frame), and the lamps on the parapet.
   *
   * The decks are fetched once and kept. `getBridges()` maps and resolves
   * seven definitions on every call, and this is asked for every vertex of
   * every road ribbon.
   */
  groundAt(x, z) {
    if (!this._bridgeDecks) this._bridgeDecks = getBridges()
    const land = groundHeight(x, z)
    const deck = bridgeDeckAt(this._bridgeDecks, x, z)
    return deck > land ? deck : land
  }

  /**
   * How high the surface you can actually DRIVE on is.
   *
   * Not the same question as groundAt(), and the difference is a fall you can
   * feel. groundAt() answers from the height field, which is right for placing
   * a tree; the collider a car rests on stands `surfaceLift(claim)` above that
   * field on grass, becomes a bridge deck out over the water, and becomes a
   * garage floor inside a building. So this asks Rapier, which is the only
   * thing that knows about all three.
   *
   * Returns null where there is nothing to stand on - out at sea - rather than
   * a plausible zero, so a caller has to decide what that means.
   *
   * `groundAt` is deliberately left alone. It is called for every vertex of
   * every road ribbon and every prop in the world, and a raycast per vertex
   * would be a different kind of mistake.
   */
  drivableAt(x, z, excludeBody = null) {
    const physics = this.game.physics
    if (!physics || !physics.surfaceUnder) return null
    return physics.surfaceUnder(x, z, 60, 200, excludeBody)
  }

  /**
   * A skirt of quads around the outline, from `topY` down to `bottomY`,
   * with the bottom edge pulled toward the centre by `taper`.
   */
  wallGeometry(points, topY, bottomY, taper) {
    const centre = polygonCentroid(points)
    const n = points.length
    const positions = new Float32Array(n * 18) // 2 triangles * 3 verts * 3 floats
    let o = 0

    const shrink = (p) => ({
      x: centre.x + (p.x - centre.x) * taper,
      z: centre.z + (p.z - centre.z) * taper
    })

    for (let i = 0; i < n; i++) {
      const a = points[i]
      const b = points[(i + 1) % n]
      const aB = shrink(a)
      const bB = shrink(b)

      // Two triangles per edge, wound so the outside faces outward
      const quad = [
        a.x, topY, a.z,   aB.x, bottomY, aB.z,   b.x, topY, b.z,
        b.x, topY, b.z,   aB.x, bottomY, aB.z,   bB.x, bottomY, bB.z
      ]
      for (const v of quad) positions[o++] = v
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.computeVertexNormals()
    return geometry
  }

  /**
   * Physics for the landmass: a trimesh of the drivable top plus its walls.
   * Falls back to a cylinder if the engine rejects the mesh, so an island is
   * never left without collision.
   */
  buildLandCollider(island, outline, cx, cz, grassRing = null) {
    const verts = []

    const push = (x, y, z) => { verts.push(x + cx, y, z + cz) }

    // Top surface. Subdivided and lifted by the SAME height field the grass
    // mesh uses - if the collider were left flat the car would drive along an
    // invisible plane at sea level with the hillside passing through it.
    // The same triangles the sand mesh was built from - see
    // islandGroundTriangles(). The collider applies the TRUE height, with no
    // GROUND_SINK duck: what you drive on stays the real surface.
    //
    // AND THEN THE LIFT, which is the half this was missing. Nothing is drawn
    // on the bare height field: the grass cap stands SURFACE_GRASS proud of
    // it and the tarmac SURFACE_PAVED, so a collider built on the field alone
    // is under every surface in the world. Measured in the running game
    // before this was added: 0.30 into open grass, 0.10 into the carriageway,
    // 0.35 into a station forecourt. You saw it at the end of a driveway,
    // where the apron meets the road and the step is a third of a wheel.
    //
    // Off the grass cap there is no lift, because the beach has no grass to
    // stand proud of - and lifting it there would float the car over the sand
    // instead, which is the same bug wearing a hat.
    const terrain = getIslandTerrain(island)
    const shared = this.islandGroundTriangles(island, outline)

    const onGrass = (x, z) =>
      !grassRing || grassRing.length < 3 || pointInPolygon(grassRing, x, z)

    for (const triangle of shared) {
      for (const p of triangle) {
        const lift = onGrass(p.x, p.z)
          ? surfaceLift(terrain.claimAt(p.x, p.z))
          : 0
        push(p.x, terrain.heightAt(p.x, p.z) + lift, p.z)
      }
    }

    // Walls, so you bump the cliff rather than sliding through it
    const centre = polygonCentroid(outline)
    const taper = 0.72
    const shrink = (p) => ({
      x: centre.x + (p.x - centre.x) * taper,
      z: centre.z + (p.z - centre.z) * taper
    })

    for (let i = 0; i < outline.length; i++) {
      const a = outline[i]
      const b = outline[(i + 1) % outline.length]
      const aB = shrink(a), bB = shrink(b)

      push(a.x, 0, a.z);  push(aB.x, -ISLAND_DEPTH, aB.z);  push(b.x, 0, b.z)
      push(b.x, 0, b.z);  push(aB.x, -ISLAND_DEPTH, aB.z);  push(bB.x, -ISLAND_DEPTH, bB.z)
    }

    const vertices = new Float32Array(verts)
    const indices = new Uint32Array(vertices.length / 3)
    for (let i = 0; i < indices.length; i++) indices[i] = i

    const result = this.game.physics.createStaticTrimesh(vertices, indices)

    if (!result) {
      // Safety net - a plain cylinder is better than nothing to drive on
      const halfDepth = ISLAND_DEPTH / 2
      this.game.physics.createStaticCylinder(
        cx, -halfDepth, cz, islandReach(island), halfDepth
      )
    }
  }

  /**
   * Build one road. The road arrives as a smooth sampled path in
   * island-local coordinates; here we lay a ribbon of triangles along it.
   *
   * Each sample point gets a left and right edge vertex offset along the
   * path's normal, and consecutive pairs are joined into quads. That lets
   * the road bend as sharply as it likes without any stretching.
   */
  buildRoad(island, road) {
    const pts = road.points
    if (!pts || pts.length < 2) return

    // Island-local to world, then hand off to the shared builder
    this.buildRoadSurface(
      pts.map(p => ({ x: island.x + p.x, z: island.z + p.z })),
      road.width,
      road.dashOffset || 0
    )
  }

  /**
   * Lay a road surface along a path given in WORLD coordinates.
   * Shared by island roads and bridge decks, so both get identical
   * asphalt and markings and the two meet without a visible seam.
   *
   * @param {Array<{x,z}>} path
   * @param {number} width
   * @param {number} dashOffset  where the dash pattern starts, so markings
   *                             carry on across a join rather than restarting
   * @param {number} y           surface height
   */
  /**
   * A round patch of road surface, used to fill the corners where two
   * roads meet. Sits a hair above the roads so there's no z-fighting
   * where they overlap, but far enough below anything else to be
   * invisible from a car.
   */
  buildJunction(x, z, radius) {
    const geometry = new THREE.CircleGeometry(radius, 24)
    geometry.rotateX(-Math.PI / 2)

    const patch = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: PALETTE.asphalt, roughness: 0.92, metalness: 0.05
    }))
    patch.position.set(x, this.groundAt(x, z) + 0.065, z)
    patch.receiveShadow = true
    this.game.add(patch)
  }

  /**
   * A raised kerb and pavement down both sides of a street.
   *
   * Built as two more ribbons offset from the road's own centre line, so
   * they follow every bend it takes without any extra maths. Slightly
   * proud of the road so the kerb catches the light.
   */
  buildPavements(island, road, allRoads = []) {
    const tangents = pathTangents(road.points)
    const offset = road.width / 2 + PAVEMENT_WIDTH / 2

    for (const side of [1, -1]) {
      const path = road.points.map((p, i) => ({
        x: island.x + p.x - tangents[i].z * offset * side,
        z: island.z + p.z + tangents[i].x * offset * side
      }))

      const quads = ribbonQuads(path, PAVEMENT_WIDTH)
      if (!quads.length) continue

      const positions = []
      for (const { l0, r0, l1, r1 } of quads) {
        // Pavements stop at a junction. They sit higher than the road
        // surface so the kerb catches the light, which meant they were
        // drawing OVER the junction patch - a pale strip straight across
        // the middle of every intersection. A real crossing is bare road.
        const mx = (l0.x + r1.x) / 2
        const mz = (l0.z + r1.z) / 2
        // A pavement stops where it meets another road's asphalt.
        //
        // Not "inside a circle around the junction": the pavement's outer
        // edge sits further from the road centre than that circle's radius,
        // so its outer half escaped and carried straight on across the
        // intersection - two of them crossing made a pale X over the
        // junction. Testing against the other road's actual surface is
        // exact, and stops the kerb precisely where it should.
        //
        // A DRIVEWAY COUNTS. It is asphalt you drive across, and the list
        // here was written before there were any - so the street's kerb ran
        // straight over the mouth of the player's drive, a raised pale slab
        // across the one place the car has to cross. Driving out, the car
        // met it at the wheels and the body sank into it: the collider
        // follows the ground, the kerb is drawn above the ground, and
        // nothing had told the kerb to stop.
        //
        // The tell that it was the kerb and not the terrain: the height
        // field is dead flat at 0.000 for the whole length of the drive.
        // Nothing was wrong with the ground at all.
        let onAnotherRoad = false
        for (const other of allRoads) {
          if (other === road) continue
          if (!other.street && !other.ring && !other.auto && !other.spur &&
              !other.driveway) continue
          const d = distanceToPath(other.points, mx - island.x, mz - island.z)
          if (d < other.width / 2 + 0.2) { onAnotherRoad = true; break }
        }
        if (onAnotherRoad) continue

        // Drop anything that has genuinely folded onto the carriageway.
        //
        // Measured at the quad's CENTRE, which should sit a full
        // half-pavement clear of the kerb. Testing the corners instead was
        // a mistake: the inner corner sits exactly ON the kerb line by
        // construction, so "closer than width/2" was true everywhere and
        // deleted every pavement in the world.
        //
        // On the current map this never fires - the rings aren't tight
        // enough to fold a 2.4-wide offset. It's kept as insurance for
        // tighter ones, so don't assume it's doing any work today.
        const clearOfKerb = distanceToPath(
          road.points, mx - island.x, mz - island.z
        ) - road.width / 2
        if (clearOfKerb < PAVEMENT_WIDTH * 0.2) continue

        // Kerb height above the GROUND, which the road corridor has already
        // levelled - so a pavement climbs a hill alongside its road rather
        // than staying at sea level while the road leaves it behind.
        const yl0 = this.groundAt(l0.x, l0.z) + 0.12
        const yr0 = this.groundAt(r0.x, r0.z) + 0.12
        const yl1 = this.groundAt(l1.x, l1.z) + 0.12
        const yr1 = this.groundAt(r1.x, r1.z) + 0.12

        positions.push(
          l0.x, yl0, l0.z, r0.x, yr0, r0.z, l1.x, yl1, l1.z,
          l1.x, yl1, l1.z, r0.x, yr0, r0.z, r1.x, yr1, r1.z
        )
      }
      if (!positions.length) continue

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(positions), 3))
      const normals = new Float32Array(positions.length)
      for (let i = 1; i < normals.length; i += 3) normals[i] = 1
      geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.95, side: THREE.DoubleSide
      }))
      mesh.receiveShadow = true
      this.game.add(mesh)
    }
  }

  /**
   * Traffic lights on the corners of a proper crossroads, and they work.
   *
   * Arms are sorted into two groups by which way they run, so opposite
   * sides of the junction show the same aspect and the crossing flows are
   * complementary - the thing that makes lights read as controlling
   * traffic rather than as decoration.
   *
   * Only where three or more arms meet. A bend in the ring doesn't need
   * signalling.
   */
  buildTrafficSignal(island, signal) {
    const signals = []

    for (const arm of signal.arms) {
      // The phase comes with the arm now. It used to be worked out here, and
      // the cycle offset came from this class's random number generator -
      // which meant nothing outside the renderer could know when a light was
      // green, so the traffic couldn't obey it.
      signals.push({
        group: arm.group,
        // FACING THE TRAFFIC IT GOVERNS, which is +arm and not -arm.
        //
        // An arm points AWAY from the junction, back down the road it
        // governs - `flip` in getTrafficSignals() guarantees it, and the pole
        // is placed at `cluster + arm * reach`, out along the approach. So a
        // driver on that arm is further out still and travelling towards the
        // junction, in the direction -arm. The lenses sit on the group's
        // local +Z, so the head has to be turned to +arm for them to be
        // pointing at that driver.
        //
        // It was -arm, which turned every head to face into the middle of
        // the junction. The effect is subtle enough to survive a long time:
        // every junction still had the right number of poles in the right
        // places, and each one showed its lamps to the road OPPOSITE the one
        // it was controlling. Mike found it by standing at a stop line and
        // seeing an unlit black box, with the only visible lamps belonging to
        // a signal across the junction facing him.
        lamps: this.addTrafficLight(
          island.x + arm.pole.x,
          island.z + arm.pole.z,
          Math.atan2(arm.x, arm.z)
        )
      })
    }

    // The signal itself is kept, not a copy of its offset: it carries where
    // this junction is in its cycle, worked out from where it is in the
    // world, and both the lamps and the cars read it from there.
    //
    // Careful: `signal` here is island-local, while the lanes hold a
    // world-space copy. Only the offset, the arms and the groups are read
    // from it, and those are the same in either frame.
    this.trafficLights.push({ signals, signal })
  }

  /**
   * One signal head on a pole. Returns the three lamp materials so the
   * cycle can switch them.
   */
  addTrafficLight(x, z, heading) {
    const group = new THREE.Group()

    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x2f353d, roughness: 0.7, metalness: 0.4, flatShading: true
    })

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 3.4, 7), poleMat)
    pole.position.y = 1.7
    pole.castShadow = true
    group.add(pole)

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.4, 0.34), poleMat)
    box.position.y = 3.8
    box.castShadow = true
    group.add(box)

    const lamps = {}
    const colours = [['red', 0xff3b30, 0.42], ['amber', 0xffb020, 0], ['green', 0x34d058, -0.42]]

    for (const [name, colour, offsetY] of colours) {
      const mat = new THREE.MeshStandardMaterial({
        color: colour,
        emissive: new THREE.Color(colour),
        emissiveIntensity: 0
      })
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mat)
      lens.position.set(0, 3.8 + offsetY, 0.2)
      group.add(lens)
      lamps[name] = mat
    }

    group.position.set(x, this.groundAt(x, z), z)
    group.rotation.y = heading
    this.game.add(group)

    return lamps
  }

  /**
   * Run the lights. Called every frame from update().
   *
   * One group goes green while the other is red, with an amber between -
   * so the two directions never both show green, which is the only thing
   * that would make them obviously fake.
   */
  updateTrafficLights() {
    for (const junction of this.trafficLights) {
      for (const signal of junction.signals) {
        // signalState() from islandLayout, NOT a copy of the arithmetic.
        // There used to be a second implementation right here, and the moment
        // the cars started obeying the lights that became a bug waiting to
        // happen: two versions of the same cycle, drifting apart, cars
        // crossing on a red the lamp wasn't showing.
        const state = signalState(junction.signal, signal.group, this.elapsed)

        for (const name of ['red', 'amber', 'green']) {
          signal.lamps[name].emissiveIntensity = name === state ? 1.6 : 0
        }
      }
    }
  }

  /**
   * Zebra stripes on every arm of a junction.
   *
   * Laid across the road just outside the junction patch, which is where
   * a crossing goes in reality - you cross before the cars turn, not in
   * the middle of them.
   */
  /** Which way a path runs at the point nearest (x, z). Island-local. */
  tangentOfPath(points, x, z) {
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(points[i].x - x, points[i].z - z)
      if (d < bestDist) { bestDist = d; best = i }
    }
    const a = points[Math.max(0, best - 1)]
    const b = points[Math.min(points.length - 1, best + 1)]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    return len < 1e-6 ? null : { x: dx / len, z: dz / len }
  }

  buildCrossings(island, signal, roads) {
    const stripeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roadLine, roughness: 0.8
    })

    for (const arm of signal.arms) {
      // WHERE THE LAYOUT PUT IT, and on the road the layout says it is on.
      //
      // Both used to be worked out again here: step `radius + 2.6` along the
      // arm's bearing, then ask which road is nearest the result. That was two
      // guesses, and on a dense grid both of them miss. Several roads pass
      // within a few units of a junction, so "nearest" resolved to whichever
      // is widest - the ring, every time - and a street's crossing was painted
      // across the ring at 85 degrees to the approach it belonged to.
      //
      // getTrafficSignals() knows which road each arm IS, because an arm is
      // made from one. See crossingSpot().
      const road = arm.road
      if (!road || !arm.at) continue

      const lx = arm.at.x
      const lz = arm.at.z

      // Still checked, because a road that ENDS at the junction has nothing
      // to paint on beyond it - which is what once put zebra stripes on the
      // sand.
      if (distanceToPath(road.points, lx, lz) - road.width / 2 > 0.5) continue

      // Square to that road, taken where the crossing is rather than where the
      // junction is: a merged cluster's centre is a centroid and sits on none
      // of its roads, so the tangent there is the road's direction somewhere
      // else entirely.
      const tan = this.tangentOfPath(road.points, lx, lz)
      if (!tan) continue

      // A zebra crossing is bars running ALONG the direction of travel,
      // set side by side across the width of the road. Look at any real
      // one: long rectangles pointing down the road, a row of them.
      //
      // I briefly built them the other way - short bars spanning the
      // carriageway, stepping along it - reasoning that you'd cross one
      // after another driving over. That's wrong; they're paint, you feel
      // nothing, and it looked like a diagonal smear.
      const stripes = 6
      const barLength = 2.8
      const barWidth = 0.62

      // Spread across roughly 84% of the carriageway, leaving a margin at
      // each kerb the way a real crossing does.
      const span = road.width * 0.84
      const step = span / (stripes - 1)

      for (let k = 0; k < stripes; k++) {
        const across = -span / 2 + k * step
        const ox = -tan.z * across
        const oz = tan.x * across

        // Long in local Z, which rotation.y aligns with the road
        const stripe = new THREE.Mesh(
          new THREE.BoxGeometry(barWidth, 0.02, barLength), stripeMat
        )
        const sx2 = island.x + lx + ox
        const sz2 = island.z + lz + oz
        stripe.position.set(sx2, this.groundAt(sx2, sz2) + 0.08, sz2)
        stripe.rotation.y = Math.atan2(tan.x, tan.z)
        this.game.add(stripe)
      }
    }
  }

  /**
   * A narrow paved path, for reaching a building no road goes past.
   *
   * Same ribbon treatment as a pavement but thinner and a shade darker,
   * so it reads as a footpath rather than a road you could drive down.
   */
  buildWalkway(island, walk) {
    const path = walk.points.map(p => ({ x: island.x + p.x, z: island.z + p.z }))
    const quads = ribbonQuads(path, walk.width)
    if (!quads.length) return

    const positions = []
    for (const { l0, r0, l1, r1 } of quads) {
      const yl0 = this.groundAt(l0.x, l0.z) + 0.1
      const yr0 = this.groundAt(r0.x, r0.z) + 0.1
      const yl1 = this.groundAt(l1.x, l1.z) + 0.1
      const yr1 = this.groundAt(r1.x, r1.z) + 0.1

      positions.push(
        l0.x, yl0, l0.z, r0.x, yr0, r0.z, l1.x, yl1, l1.z,
        l1.x, yl1, l1.z, r0.x, yr0, r0.z, r1.x, yr1, r1.z
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(positions), 3))
    const normals = new Float32Array(positions.length)
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: PALETTE.sandWet, roughness: 0.98, side: THREE.DoubleSide
    }))
    mesh.receiveShadow = true
    this.game.add(mesh)
  }

  /**
   * A rectangle of paving that FOLLOWS THE GROUND.
   *
   * Mike: "A lot of buildings like this hospital has this weird white block in
   * front of them - including our own garage. Can you figure out what these
   * are and remove them if needed?"
   *
   * They were the forecourts, and they were not blocks by intent - each was a
   * single flat plane laid at the height of its own centre. The ground under
   * them is not flat: measured across all ten station aprons the fall under
   * one is up to 1.74 units, and the plane ends up standing as much as 1.40
   * units clear of the grass at its far corner. A pale slab hanging a metre in
   * the air in front of a hospital is exactly a weird white block.
   *
   * Roads never had this problem, because `buildRoadSurface()` lifts every
   * vertex off `groundAt` rather than placing the whole ribbon at one height.
   * This is that, for a rectangle - so a forecourt is paving, and paving lies
   * on what it is laid on.
   *
   * `y` is a clearance above the ground, matching the road convention, so a
   * caller says which surface it is rather than working out an absolute
   * height that stops being true the moment the terrain moves.
   */
  pavedPatch(cx, cz, width, depth, heading, y, material, steps = 8) {
    const fx = Math.sin(heading)
    const fz = Math.cos(heading)
    const sx = -fz
    const sz = fx

    const positions = []
    const at = (a, b) => {
      const x = cx + sx * width * a + fx * depth * b
      const z = cz + sz * width * a + fz * depth * b
      return [x, this.groundAt(x, z) + y, z]
    }

    for (let i = 0; i < steps; i++) {
      for (let j = 0; j < steps; j++) {
        const a0 = i / steps - 0.5
        const a1 = (i + 1) / steps - 0.5
        const b0 = j / steps - 0.5
        const b1 = (j + 1) / steps - 0.5
        const p00 = at(a0, b0)
        const p10 = at(a1, b0)
        const p01 = at(a0, b1)
        const p11 = at(a1, b1)
        positions.push(...p00, ...p10, ...p01, ...p01, ...p10, ...p11)
      }
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(positions), 3))
    // Straight up, like the roads: a forecourt is never steep enough here for
    // the cheat to show, and derived normals crease on the fold at a bend.
    const normals = new Float32Array(positions.length)
    for (let k = 1; k < normals.length; k += 3) normals[k] = 1
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    this.game.add(mesh)
    return mesh
  }

  buildRoadSurface(path, width, dashOffset = 0, y = SURFACE_PAVED) {
    if (!path || path.length < 2) return

    // ribbonQuads gives one full-width quad per step, already wound to
    // face up. Through a bend tighter than the road is wide the inside
    // edge overlaps itself; that's deliberate, and invisible once the
    // whole slab is one colour at one height.
    const quads = ribbonQuads(path, width)
    if (!quads.length) return

    const positions = []

    // `y` is now a clearance above the GROUND rather than an absolute height.
    // The terrain holds a road's corridor level across its width, so the two
    // sides of a quad come out at the same height and the carriageway stays
    // unbanked - that is the terrain's job, not this function's.
    const lift = (p) => this.groundAt(p.x, p.z) + y

    for (const { l0, r0, l1, r1 } of quads) {
      const yl0 = lift(l0), yr0 = lift(r0), yl1 = lift(l1), yr1 = lift(r1)
      positions.push(
        l0.x, yl0, l0.z,  r0.x, yr0, r0.z,  l1.x, yl1, l1.z,
        l1.x, yl1, l1.z,  r0.x, yr0, r0.z,  r1.x, yr1, r1.z
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(positions), 3))

    // Normals straight up rather than derived from the triangles: an
    // overlapping fold through a tight bend would otherwise shade itself
    // darker than the rest. A road is never steep enough here - eight per
    // cent - for the cheat to show.
    const normals = new Float32Array(positions.length)
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

    const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: PALETTE.asphalt, roughness: 0.92, metalness: 0.05,
      // Belt and braces for folds through tight bends
      side: THREE.DoubleSide
    }))
    surface.receiveShadow = true
    this.game.add(surface)

    this.addRoadMarkings(path, pathTangents(path), dashOffset, y)
  }

  /**
   * Is this world point inside a junction?
   *
   * `margin` differs by what's asking. A centre-line dash needs to stop
   * well clear, or it sits half on the bare asphalt. A pavement should run
   * right up to the junction, or the kerb disappears for metres either
   * side of every crossing.
   */
  insideJunction(x, z, margin = 2.2) {
    for (const j of this.noMarkings || []) {
      if (Math.hypot(x - j.x, z - j.z) < j.radius + margin) return true
    }
    return false
  }

  /** Dashed centre line that follows the bend of the road. */
  addRoadMarkings(path, tangents, dashOffset = 0, roadY = SURFACE_PAVED) {
    const dashMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roadLine, roughness: 0.8
    })

    const dashLength = 1.5
    const gapLength = 2.5
    const stride = dashLength + gapLength
    const markY = roadY + 0.02

    // Walk the path by arc length so dashes stay evenly spaced around
    // corners, rather than bunching up where the curve is tight.
    // dashOffset lets a following stretch of road pick the pattern up
    // where the previous one left off.
    let travelled = 0
    let nextDash = ((stride - (dashOffset % stride)) % stride) + 0.5

    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]
      const b = path[i]
      const segLen = Math.hypot(b.x - a.x, b.z - a.z)
      if (segLen < 1e-6) continue

      while (nextDash < travelled + segLen) {
        const t = (nextDash - travelled) / segLen
        const x = a.x + (b.x - a.x) * t
        const z = a.z + (b.z - a.z) * t

        const tan = tangents[i]
        // No centre line through a junction. Real intersections are bare
        // asphalt, and painting one road's dashes across another's surface
        // is exactly what made them look like two overlapping textures
        // rather than one merged crossing.
        if (this.insideJunction(x, z)) { nextDash += stride; continue }

        const dash = new THREE.Mesh(
          new THREE.PlaneGeometry(0.22, dashLength), dashMat
        )
        dash.rotation.x = -Math.PI / 2
        dash.rotation.z = Math.atan2(tan.x, tan.z)
        dash.position.set(x, this.groundAt(x, z) + markY, z)
        this.game.add(dash)

        nextDash += stride
      }

      travelled += segLen
    }
  }

  // -------------------------------------------------------------
  // Bridges - built from the connection list, any island to any island
  // -------------------------------------------------------------
  createBridges() {
    for (const bridge of getBridges()) {
      if (bridge.length <= 0) continue
      this.buildArchedDeck(bridge)
      if (bridge.railings) this.addBridgeRailings(bridge)
    }
  }

  /**
   * One bridge, as an arch you can drive over and sail under.
   *
   * Mike: "Lets make that elevated bridge now so we can avoid seeing ships go
   * through bridges like they're not there."
   *
   * This used to be a single BoxGeometry with its top face at y = 0 - a slab
   * lying on the sea - and one static cuboid to match. Both are now built from
   * the SAME walk along `bridgeDeckProfile()`, which is the only way the thing
   * you can see and the thing you can drive on stay the same shape. Building
   * them separately is how this project got a 30cm wall across a pier that
   * nothing could drive onto.
   *
   * The collider is a trimesh rather than a row of boxes. A row of level boxes
   * approximating a slope steps between them - at BRIDGE_SEGMENTS over a
   * 130-unit span at 11% that is a 5.5cm lip every 4.3 units, thirty times per
   * crossing - and Mike has already reported bumps of exactly that kind twice.
   * A trimesh has no steps at all because it IS the surface.
   */
  buildArchedDeck(bridge) {
    const steps = Math.max(24, Math.round(bridge.length / 3))
    const half = bridge.width / 2
    const sin = Math.sin(bridge.rotationY)
    const cos = Math.cos(bridge.rotationY)

    // A point on the deck, from a fraction along the span and a side.
    const at = (t, side, drop = 0) => {
      const along = (t - 0.5) * bridge.length
      const across = half * side
      return {
        x: bridge.x + sin * along + cos * across,
        y: bridgeDeckProfile(t, bridge.length) - drop,
        z: bridge.z + cos * along - sin * across
      }
    }

    const positions = []
    const indices = []
    const push = (p) => { positions.push(p.x, p.y, p.z); return positions.length / 3 - 1 }

    // Top face, then the underside a slab's thickness below it, then the four
    // sides - so the deck is a closed solid. An open ribbon works for the mesh
    // and is wrong for the collider: a trimesh is a surface, and a car that
    // gets beneath an open one finds nothing to stand on.
    const top = []
    const under = []
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      top.push([push(at(t, -1)), push(at(t, 1))])
      under.push([
        push(at(t, -1, BRIDGE_DECK_THICKNESS)),
        push(at(t, 1, BRIDGE_DECK_THICKNESS))
      ])
    }

    const quad = (a, b, c, d) => { indices.push(a, b, c, a, c, d) }

    for (let i = 0; i < steps; i++) {
      quad(top[i][0], top[i][1], top[i + 1][1], top[i + 1][0])
      quad(under[i][1], under[i][0], under[i + 1][0], under[i + 1][1])
      quad(top[i][0], top[i + 1][0], under[i + 1][0], under[i][0])
      quad(top[i + 1][1], top[i][1], under[i][1], under[i + 1][1])
    }
    // The two ends, so the arch is capped where it tucks into the land.
    quad(top[0][1], top[0][0], under[0][0], under[0][1])
    quad(top[steps][0], top[steps][1], under[steps][1], under[steps][0])

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.Float32BufferAttribute(positions, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()

    const deck = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: PALETTE.concrete, roughness: 0.9, metalness: 0.05, flatShading: true
    }))
    deck.castShadow = true
    deck.receiveShadow = true
    this.game.add(deck)

    // The same numbers, handed to the physics. Not a second walk over the
    // profile: one array, two consumers.
    const collider = this.game.physics.createStaticTrimesh(
      new Float32Array(positions), new Uint32Array(indices))

    // A trimesh can be rejected - see createStaticTrimesh - and a bridge with
    // no collider is a bridge you fall through. The fallback is the old flat
    // slab, which is wrong but is wrong in a way you can drive on.
    if (!collider) {
      console.warn('[World] Arched deck collider failed; falling back to a slab')
      this.game.physics.createStaticBoxAt(
        bridge.x, -0.25, bridge.z,
        bridge.width, 0.5, bridge.length, bridge.rotationY)
    }

    // The piers that hold it up. Purely to be looked at - the deck's own
    // collider is the whole structure - but an arch standing on nothing reads
    // as a mistake, and they are four boxes.
    this.addBridgePiers(bridge)
  }

  /**
   * The legs under an arch.
   *
   * Placed at the quarter points and clear of the navigable channel, which is
   * the middle BRIDGE_CHANNEL of the span in each direction - put one in the
   * middle and the thing the arch was raised FOR would sail into it.
   */
  addBridgePiers(bridge) {
    const mat = new THREE.MeshStandardMaterial({
      color: PALETTE.concrete, roughness: 0.95, flatShading: true
    })
    const sin = Math.sin(bridge.rotationY)
    const cos = Math.cos(bridge.rotationY)

    for (const t of [0.28, 0.72]) {
      const along = (t - 0.5) * bridge.length
      const x = bridge.x + sin * along
      const z = bridge.z + cos * along
      const deck = bridgeDeckProfile(t, bridge.length) - BRIDGE_DECK_THICKNESS

      // Down to the sea bed, so it does not float at the waterline.
      const foot = SEA_LEVEL - 5
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(bridge.width * 0.55, deck - foot, 3), mat)
      leg.position.set(x, (deck + foot) / 2, z)
      leg.rotation.y = bridge.rotationY
      leg.castShadow = true
      this.game.add(leg)
    }
  }

  /**
   * The roads that run island-to-island across the bridges, each one a
   * single unbroken surface.
   */
  createConnectingRoads() {
    // Every junction in the world, so a bridge road stops painting its
    // centre line where it runs into an island's ring.
    this.noMarkings = []
    for (const island of ISLANDS) {
      for (const j of getIslandJunctions(island)) {
        this.noMarkings.push({
          x: island.x + j.x, z: island.z + j.z, radius: j.radius
        })
      }
    }

    for (const road of getBridgeRoadPaths()) {
      this.buildRoadSurface(road.points, road.width)
    }
  }

  /**
   * The parapet, which now has to climb with the deck.
   *
   * Every height in here used to be a constant - the barrier at 0.5, the rail
   * at 0.95, the posts at 0.5 - because the deck was flat. On an arch each one
   * is `bridgeDeckProfile()` plus the same offset it always had, so the
   * relationship between the rail and the road it guards is unchanged and only
   * the datum moves.
   *
   * The barrier is a chain of short boxes rather than one long one. A single
   * cuboid along an arch either floats at the ends or buries itself in the
   * middle, and the barrier is the one part of a bridge that has to be exactly
   * where it looks: it is what stops the car going into the sea.
   */
  addBridgeRailings(bridge) {
    const railMat = new THREE.MeshStandardMaterial({
      color: PALETTE.wallWhite, roughness: 0.8, flatShading: true
    })

    const cos = Math.cos(bridge.rotationY)
    const sin = Math.sin(bridge.rotationY)
    const halfW = bridge.width / 2
    const segments = Math.max(12, Math.round(bridge.length / 6))
    const deckAt = (t) => bridgeDeckProfile(t, bridge.length)

    for (const side of [-1, 1]) {
      const ox = cos * halfW * side
      const oz = -sin * halfW * side

      for (let i = 0; i < segments; i++) {
        const t0 = i / segments
        const t1 = (i + 1) / segments
        const mid = (t0 + t1) / 2
        const run = bridge.length / segments

        const along = (mid - 0.5) * bridge.length
        const bx = bridge.x + ox + sin * along
        const bz = bridge.z + oz + cos * along

        // Long enough to overlap its neighbours, so the chain has no gaps for
        // a nose to find at the joins.
        this.game.physics.createStaticBoxAt(
          bx, deckAt(mid) + 0.5, bz,
          0.3, 1.4, run * 1.15,
          bridge.rotationY)

        const rail = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 0.18, run * 1.05), railMat)
        rail.position.set(bx, deckAt(mid) + 0.95, bz)
        rail.rotation.set(
          -Math.atan2(deckAt(t1) - deckAt(t0), run), bridge.rotationY, 0, 'YXZ')
        rail.castShadow = true
        this.game.add(rail)
      }

      const posts = Math.max(2, Math.floor(bridge.length / 4))
      for (let i = 0; i <= posts; i++) {
        const t = i / posts
        const along = (t - 0.5) * bridge.length
        const px = bridge.x + ox + sin * along
        const pz = bridge.z + oz + cos * along

        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1, 0.22), railMat)
        post.position.set(px, deckAt(t) + 0.5, pz)
        post.rotation.y = bridge.rotationY
        post.castShadow = true
        this.game.add(post)

        // Aimed at the deck's centre line rather than out to sea
        if (side === 1 && i % 4 === 2) {
          this.addStreetlight(px, pz, {
            x: bridge.x + sin * along,
            z: bridge.z + cos * along
          })
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Monorail
  // -------------------------------------------------------------

  /**
   * The elevated loop: beam, piers, stations and the trains on it.
   *
   * Only the piers and the stair towers are solid. The beam is sixteen
   * units up with no ramp to it, so a collider on it could never be
   * touched - and every collider costs something on every frame.
   */
  createMonorail() {
    const route = this.monorail
    if (!route) return

    this.buildMonorailBeam(route)

    for (const pier of this.monorailPiers) this.buildMonorailPier(pier)
    for (const tower of this.monorailTowers) this.buildMonorailStation(tower)

    this.buildTrains(route)
  }

  /**
   * The beam, as one swept box.
   *
   * One mesh for the whole 1,800-unit loop rather than a box per span: at
   * this length that would be five hundred draw calls for a piece of
   * scenery you mostly see from underneath.
   */
  buildMonorailBeam(route) {
    const points = route.points
    const tangents = pathTangents(points)
    const half = MONORAIL_BEAM_WIDTH / 2
    const y1 = MONORAIL_HEIGHT
    const y0 = MONORAIL_HEIGHT - MONORAIL_BEAM_DEPTH

    // The two edges of the beam at each point along it
    const rings = points.map((p, i) => {
      const t = tangents[i]
      return {
        lx: p.x + t.z * half, lz: p.z - t.x * half,
        rx: p.x - t.z * half, rz: p.z + t.x * half
      }
    })

    const pos = []
    // Winding matters here in a way it doesn't for a road: a road is one
    // flat surface and can be double-sided, but a box lit from above needs
    // its top face to know which way is up. Each quad below was worked out
    // from the cross product, not guessed.
    const quad = (a, b, c, d) => {
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2],
               a[0], a[1], a[2], c[0], c[1], c[2], d[0], d[1], d[2])
    }

    for (let i = 0; i < rings.length - 1; i++) {
      const A = rings[i]
      const B = rings[i + 1]

      // Top - normal up
      quad([A.rx, y1, A.rz], [B.rx, y1, B.rz], [B.lx, y1, B.lz], [A.lx, y1, A.lz])
      // Bottom - normal down
      quad([A.lx, y0, A.lz], [B.lx, y0, B.lz], [B.rx, y0, B.rz], [A.rx, y0, A.rz])
      // Left flank
      quad([A.lx, y0, A.lz], [A.lx, y1, A.lz], [B.lx, y1, B.lz], [B.lx, y0, B.lz])
      // Right flank
      quad([A.rx, y1, A.rz], [A.rx, y0, A.rz], [B.rx, y0, B.rz], [B.rx, y1, B.rz])
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(pos), 3))
    geometry.computeVertexNormals()

    const beam = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
      color: PALETTE.beam, roughness: 0.85, metalness: 0.08, flatShading: true
    }))
    beam.castShadow = true
    beam.receiveShadow = true
    this.game.add(beam)
  }

  /** One column, with a cross-head where it meets the beam. */
  buildMonorailPier(pier) {
    // The BEAM stays level - a train that undulated with the ground would
    // look like a rollercoaster - so the pillars take up the difference and
    // come out different lengths. This is the whole of that: the top is
    // fixed, the foot is wherever the ground happens to be.
    const top = MONORAIL_HEIGHT - MONORAIL_BEAM_DEPTH
    const base = pier.island ? this.groundAt(pier.x, pier.z) : SEA_LEVEL - 2.5
    const height = top - base

    const column = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 1.25, height, 8),
      new THREE.MeshStandardMaterial({
        color: PALETTE.beamDark, roughness: 0.92, flatShading: true
      })
    )
    column.position.set(pier.x, base + height / 2, pier.z)
    column.castShadow = true
    this.game.add(column)

    // The cross-head. Normally a short cap on top of the column; where the
    // column had to stand aside for a bridge it becomes an arm reaching back
    // out to the beam, which is why its length is measured rather than fixed.
    const offset = pier.offset || 0
    const span = Math.abs(offset) + 4.2

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(span, 0.7, 1.6),
      new THREE.MeshStandardMaterial({
        color: PALETTE.beam, roughness: 0.88, flatShading: true
      })
    )
    // Centred between the column and the beam, so both ends are held
    head.position.set(
      (pier.x + (pier.beamX ?? pier.x)) / 2, top - 0.35,
      (pier.z + (pier.beamZ ?? pier.z)) / 2)
    head.rotation.y = pier.heading
    head.castShadow = true
    this.game.add(head)

    // A brace back to the column, so a long arm doesn't look like it's
    // floating
    if (Math.abs(offset) > 4) {
      const brace = new THREE.Mesh(
        new THREE.BoxGeometry(Math.abs(offset), 0.45, 0.45),
        new THREE.MeshStandardMaterial({
          color: PALETTE.beamDark, roughness: 0.9, flatShading: true
        }))
      brace.position.set(
        (pier.x + (pier.beamX ?? pier.x)) / 2, top - 3.2,
        (pier.z + (pier.beamZ ?? pier.z)) / 2)
      brace.rotation.y = pier.heading
      brace.rotation.z = 0.28 * Math.sign(offset)
      this.game.add(brace)
    }

    // Only the ones you could actually drive into
    if (pier.island) {
      this.game.physics.createStaticCylinder(pier.x, 2.5, pier.z, 1.25, 2.5)
    }
  }

  /**
   * A station: two platforms either side of the beam, a canopy over them,
   * the name on the fascia, and a stair tower down to the ground.
   */
  buildMonorailStation(tower) {
    const station = tower.station
    const heading = station.heading
    const fx = Math.sin(heading)
    const fz = Math.cos(heading)
    const sx = -fz
    const sz = fx

    const deckY = MONORAIL_HEIGHT + 0.55
    const length = MONORAIL_PLATFORM_LENGTH

    const concrete = new THREE.MeshStandardMaterial({
      color: PALETTE.concrete, roughness: 0.9, flatShading: true
    })
    const trim = new THREE.MeshStandardMaterial({
      color: PALETTE.beam, roughness: 0.85, flatShading: true
    })

    // Platforms
    for (const side of [1, -1]) {
      const px = station.x + sx * MONORAIL_PLATFORM_OFFSET * side
      const pz = station.z + sz * MONORAIL_PLATFORM_OFFSET * side

      const platform = new THREE.Mesh(new THREE.BoxGeometry(3, 0.45, length), concrete)
      platform.position.set(px, deckY, pz)
      platform.rotation.y = heading
      platform.castShadow = true
      platform.receiveShadow = true
      this.game.add(platform)

      // A low edge, so the platform reads as a platform from the ground
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.05, length), trim)
      edge.position.set(px + sx * 1.5 * side, deckY + 0.75, pz + sz * 1.5 * side)
      edge.rotation.y = heading
      this.game.add(edge)
    }

    // Canopy on four posts
    const canopyY = deckY + 4.6
    for (const side of [1, -1]) {
      for (const end of [1, -1]) {
        const px = station.x + sx * 4.6 * side + fx * (length / 2 - 2) * end
        const pz = station.z + sz * 4.6 * side + fz * (length / 2 - 2) * end
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 4.6, 0.35), trim)
        post.position.set(px, deckY + 2.3, pz)
        post.rotation.y = heading
        this.game.add(post)
      }
    }

    const roof = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.4, length + 2), trim)
    roof.position.set(station.x, canopyY, station.z)
    roof.rotation.y = heading
    roof.castShadow = true
    this.game.add(roof)

    // The name, on the fascia facing outward on both sides. Lit at night,
    // like the shop signs, so a station is findable in the dark.
    for (const side of [1, -1]) {
      const sign = this.stationSign(station.name, station.accent)
      sign.position.set(
        station.x + sx * 5.85 * side,
        canopyY - 0.95,
        station.z + sz * 5.85 * side
      )
      sign.rotation.y = heading + (side === 1 ? Math.PI / 2 : -Math.PI / 2)
      this.game.add(sign)
    }

    // Stair tower, and a walkway from it to the platform. Like the pillars,
    // it starts at the ground and reaches a fixed deck, so it is taller on
    // low ground and shorter on a hill.
    const towerFoot = this.groundAt(tower.x, tower.z)
    const towerHeight = deckY - towerFoot
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, towerHeight, 3.2), concrete)
    shaft.position.set(tower.x, towerFoot + towerHeight / 2, tower.z)
    shaft.rotation.y = heading
    shaft.castShadow = true
    this.game.add(shaft)

    this.game.physics.createStaticBoxAt(
      tower.x, towerFoot + towerHeight / 2, tower.z, 3.2, towerHeight, 3.2, heading)

    // The bridge across from the tower to the nearest platform edge
    const bridgeFromX = tower.x
    const bridgeFromZ = tower.z
    const bridgeToX = station.x + sx * MONORAIL_PLATFORM_OFFSET * tower.side
      + fx * tower.along
    const bridgeToZ = station.z + sz * MONORAIL_PLATFORM_OFFSET * tower.side
      + fz * tower.along
    const span = Math.hypot(bridgeToX - bridgeFromX, bridgeToZ - bridgeFromZ)

    if (span > 0.5) {
      const walk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.3, span), concrete)
      walk.position.set((bridgeFromX + bridgeToX) / 2, deckY,
                        (bridgeFromZ + bridgeToZ) / 2)
      walk.rotation.y = Math.atan2(bridgeToX - bridgeFromX, bridgeToZ - bridgeFromZ)
      walk.castShadow = true
      this.game.add(walk)
    }

    // A lit doorway at street level, so it's obvious what the tower is
    const doorMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.3, metalness: 0.3,
      emissive: new THREE.Color(PALETTE.lampLit), emissiveIntensity: 0
    })
    this.registerNightLight(doorMat, 1.1)

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.12), doorMat)
    door.position.set(tower.x - sx * 1.66, 1.2, tower.z - sz * 1.66)
    door.rotation.y = heading
    this.game.add(door)

    this.addLightPool(tower.x, tower.z, 11, 0.8)
  }

  /** The station name, drawn to a canvas and hung on the canopy. */
  stationSign(name, accent) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 96
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#12181f'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#' + (accent || 0xffffff).toString(16).padStart(6, '0')
    ctx.fillRect(0, canvas.height - 8, canvas.width, 8)

    ctx.font = 'bold 52px Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(255,255,255,0.95)'
    ctx.fillText((name || '').toUpperCase(), canvas.width / 2, canvas.height / 2 - 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 8

    const material = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.6,
      emissive: new THREE.Color(0xffffff), emissiveMap: texture,
      emissiveIntensity: 0
    })
    this.registerNightLight(material, 0.9)

    return new THREE.Mesh(new THREE.PlaneGeometry(9, 1.7), material)
  }

  /**
   * The trains, spaced evenly round the loop.
   *
   * Each one is three cars and its own position along the line; the loop
   * itself has no idea they're there. Positions are set in updateMonorail()
   * rather than here, so building and moving can't disagree about where a
   * car goes.
   */
  buildTrains(route) {
    this.trains = makeMonorailTrains(route)
    if (!this.trains.length) return

    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.trainBody, roughness: 0.45, metalness: 0.2, flatShading: true
    })
    const skirtMat = new THREE.MeshStandardMaterial({
      color: PALETTE.trainSkirt, roughness: 0.7, flatShading: true
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.5,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glassMat, 1.3)

    for (const train of this.trains) {
      const cars = []

      for (let c = 0; c < MONORAIL_CARS; c++) {
        const car = new THREE.Group()
        const driving = c === 0 || c === MONORAIL_CARS - 1
        const facing = c === 0 ? 1 : -1

        // THE SHELL, LOFTED. It was one 3.4 x 2.6 box per car with a window
        // strip glued to each side - so a monorail train was three identical
        // bricks with square ends, and the "front" of it was a pane of glass
        // on a flat face. A train car's shape is a section that CHANGES along
        // its length: shoulders that tuck in at the roof, ends that round off,
        // and a driving car that noses down further than the others. That is a
        // loft, and the amount of nose is one number.
        const shell = this.loftMesh(
          trainCarBody(MONORAIL_CAR_LENGTH - 0.6, 3.4, 2.95, driving ? 1 : 0),
          bodyMat)
        if (facing < 0) shell.rotation.y = Math.PI
        car.add(shell)

        // The skirt wraps the beam, which is what makes it read as a monorail
        // rather than a bus in the air.
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(3.62, 1.1, MONORAIL_CAR_LENGTH - 1.6), skirtMat)
        skirt.position.y = 0.34
        car.add(skirt)

        // A glazed band that follows the shoulders, as its own loft rather
        // than a flat strip on the outside - so the windows wrap the corners
        // at the ends of the car the way the bodywork does.
        const band = this.loftMesh(
          trainCarBody(MONORAIL_CAR_LENGTH - 0.6, 3.44, 2.95, driving ? 1 : 0)
            .map((sec) => ({ ...sec, yBottom: 1.62, yTop: 2.42 })),
          glassMat)
        if (facing < 0) band.rotation.y = Math.PI
        car.add(band)

        // Roof equipment: the air-conditioning pods every real train has, and
        // the thing that stops the roof being a blank surface from the air -
        // which is exactly how a monorail is usually seen here.
        for (const along of [-2.4, 0.6, 3.2]) {
          const pod = new THREE.Mesh(
            new THREE.BoxGeometry(2.0, 0.34, 1.5), skirtMat)
          pod.position.set(0, 2.72, along)
          car.add(pod)
        }

        // Doors, in the middle of each side, with a dark surround.
        for (const side of [1, -1]) {
          for (const along of [-2.6, 2.6]) {
            const door = new THREE.Mesh(
              new THREE.BoxGeometry(0.09, 1.9, 1.5), skirtMat)
            door.position.set(side * 1.71, 1.72, along)
            car.add(door)
          }
        }

        // The cab: a raked windscreen on the driving cars, set into the nose
        // rather than stuck on a flat end.
        if (driving) {
          const screen = new THREE.Mesh(
            new THREE.BoxGeometry(2.5, 1.25, 0.16), glassMat)
          screen.position.set(0, 2.05, facing * (MONORAIL_CAR_LENGTH / 2 - 1.1))
          screen.rotation.x = facing * 0.34
          car.add(screen)

          // And a headlight, which is what says which way it is going.
          const lampMat = new THREE.MeshStandardMaterial({
            color: 0xfff4d8, roughness: 0.3,
            emissive: new THREE.Color(0xfff2cf), emissiveIntensity: 0
          })
          this.registerNightLight(lampMat, 1.6)
          for (const side of [1, -1]) {
            const lamp = new THREE.Mesh(
              new THREE.BoxGeometry(0.5, 0.24, 0.12), lampMat)
            lamp.position.set(side * 0.95, 1.3,
                              facing * (MONORAIL_CAR_LENGTH / 2 - 0.55))
            car.add(lamp)
          }
        }

        this.game.add(car)
        cars.push(car)
      }

      train.cars = cars
    }
  }

  /**
   * Move the trains, then put the cars where the trains now are.
   *
   * The moving is stepMonorailTrains() in islandLayout.js, not here. That
   * matters: World.js needs a browser, so anything living in it can only be
   * read, never run, by the tests. The timetable is the part with logic in
   * it, so it lives where a test can drive it.
   */
  updateMonorail(delta) {
    const route = this.monorail
    if (!route || !this.trains.length) return

    // THE PLAYER TAKES OVER ONE OF THE THREE, rather than a fourth appearing.
    //
    // Mike was explicit: "We will not create another train for this game,
    // we'll be spawning into an existing train." So the handover is a flag on
    // a train that is already running, and the other two go on to their own
    // timetable around it - which is what makes the signal ahead mean
    // something instead of being a lamp on a timer.
    const v = this.game.vehicle
    const driving = !!(v && v.kind === 'monorail')
    this.claimTrain(driving)

    stepMonorailTrains(route, this.trains, delta)

    if (driving && this.drivenTrain) {
      const keys = this.game.inputs ? this.game.inputs.keys : null
      const throttle = keys
        ? (keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)
        : 0
      stepMonorail(this.rail, delta, {
        route,
        train: this.drivenTrain,
        throttle,
        gapAhead: this.drivenTrain.gapAhead ?? Infinity,
        rake: MONORAIL_CARS * MONORAIL_CAR_LENGTH,
        platform: MONORAIL_PLATFORM_LENGTH,
        maxSpeed: MONORAIL_SPEED
      })
      this.rideTrain(this.drivenTrain)
    }

    for (const train of this.trains) {
      if (!train.cars) continue
      for (let c = 0; c < train.cars.length; c++) {
        const at = monorailPointAt(route, train.distance - c * MONORAIL_CAR_LENGTH)
        train.cars[c].position.set(at.x, MONORAIL_HEIGHT + 0.15, at.z)
        train.cars[c].rotation.y = at.heading
      }
      // The lead car of the train being driven is hidden: the player IS that
      // car, and drawing both leaves a second cab sitting inside the first.
      if (train.cars[0]) train.cars[0].visible = !train.driven
    }
  }

  /**
   * Hand a train over to the player, or hand it back.
   *
   * The one CHOSEN is whichever is nearest the player's garage along the line,
   * which in practice is the one at the hub - so picking the monorail out of
   * the garage puts you in the train you can see from the garage door rather
   * than one on the far side of the map.
   */
  claimTrain(driving) {
    if (!driving) {
      if (this.drivenTrain) {
        this.drivenTrain.driven = false
        // Handed back mid-section, so let the timetable stop it at the next
        // platform rather than resuming a dwell it never started.
        this.drivenTrain.dwell = 0
        this.drivenTrain = null
        this.rail = newMonorailState()
      }
      return
    }
    if (this.drivenTrain) return

    const route = this.monorail
    const garage = this.playerGarage
    let best = this.trains[0]
    if (garage) {
      let gap = Infinity
      for (const train of this.trains) {
        const at = monorailPointAt(route, train.distance)
        const d = Math.hypot(at.x - garage.x, at.z - garage.z)
        if (d < gap) { gap = d; best = train }
      }
    }
    best.driven = true
    best.speed = 0
    best.dwell = 0
    this.drivenTrain = best
    this.rail = newMonorailState()
  }

  /**
   * Put the player's body where the train is.
   *
   * The body is DYNAMIC and is simply overwritten every frame, which is what
   * `placeAt()` does for a respawn and is the honest way to do this: a train
   * on a beam is on rails, and asking a rigid-body solver to keep something on
   * rails is asking it for a constraint it would fight. Overwriting it means
   * the train cannot be knocked off its beam by anything, which is correct.
   *
   * The player's vehicle mesh is the lead car, so the camera - which follows
   * the mesh and knows nothing about any of this - comes along for free.
   */
  rideTrain(train) {
    const v = this.game.vehicle
    if (!v || !v.body) return
    const at = monorailPointAt(this.monorail, train.distance)
    const y = MONORAIL_HEIGHT + 0.15 + CAR_HEIGHT / 2
    v.placeAt(at.x, y, at.z, at.heading)
    v.currentSpeed = train.speed

    // AND THE MESH, not just the body.
    //
    // World.update() runs at priority 28 and Vehicle.postPhysicsUpdate() - the
    // thing that copies the body onto the mesh - ran at 20, so moving only the
    // body leaves the mesh a frame behind. The camera runs at 30 and follows
    // the MESH, so the whole cab would judder by one frame's travel at every
    // speed. Written down in claude/session-notes.md after it caught the
    // police probe the same way.
    if (v.mesh) {
      v.mesh.position.set(at.x, y, at.z)
      v.mesh.quaternion.set(0, Math.sin(at.heading / 2), 0, Math.cos(at.heading / 2))
    }
    this.updateMonorailCab(train)
  }

  /**
   * The driver's panel, or null when the player is not driving a train.
   *
   * Kept out of activeMission() deliberately. chooseMission() answers "which
   * of the things happening in the world is yours to deal with", and a train
   * you are sitting in is not one of those - it is the vehicle. Squeezing it
   * into that shape would have meant one bar for two unrelated things, which
   * is exactly the mistake the ambulance's bar label exists to prevent.
   */
  railHud() {
    const v = this.game.vehicle
    if (!v || v.kind !== 'monorail' || !this.drivenTrain) return null
    return monorailHud(this.rail, {
      rake: MONORAIL_CARS * MONORAIL_CAR_LENGTH,
      platform: MONORAIL_PLATFORM_LENGTH
    })
  }

  /**
   * The instruments, driven by the game's own state.
   *
   * The one place in the file that writes to the cab's moving parts, and it
   * reads them by name out of `userData` rather than walking the group - so
   * buildMonorailCab() can rearrange the desk without this having to know.
   *
   * Everything here shows something the player is ALREADY being asked about
   * somewhere else: the signal, the speed, the doors, the station coming up.
   * That is deliberate. A cab full of instruments that mean nothing is a
   * cockpit-shaped ornament, and the point of sitting in this one is that the
   * information is in front of you instead of on a panel at the bottom of the
   * screen.
   */
  updateMonorailCab(train) {
    const mesh = this.game.vehicle && this.game.vehicle.mesh
    // `userData.cab`, not `userData` itself. See buildMonorailCab(): the parts
    // are bundled under one key precisely so that wrapTrafficMesh() has one
    // thing to carry up, and reading the bare userData here is what used to
    // find nothing at all.
    const cab = mesh && mesh.userData && mesh.userData.cab
    if (!cab) return

    const rail = this.rail
    const speed = train ? Math.abs(train.speed) : 0

    // The signal repeater, read top down like the signal on the line.
    if (cab.lamps) {
      for (const [name, mat] of Object.entries(cab.lamps)) {
        mat.emissiveIntensity = rail.signal === name ? 2.6 : 0
      }
    }

    // The master controller moves with the throttle, which is the one bit of
    // feedback a driver actually has that the controls did something.
    const keys = this.game.inputs ? this.game.inputs.keys : null
    const want = keys ? ((keys.forward ? 1 : 0) - (keys.backward ? 1 : 0)) : 0
    if (cab.lever) cab.lever.rotation.x = 0.32 - want * 0.45
    // The reverser sits back when the train is being shunted backwards. It is
    // driven off the SPEED rather than the key, because that is what it means:
    // which way the train is set up to go, not which key is down this frame.
    if (cab.reverser) {
      cab.reverser.rotation.x = (train && train.speed < -0.4) ? 0.55 : -0.5
    }

    const s = cab.screens
    if (s) {
      // SPEED, as a bar that fills. The last three segments go amber, so the
      // top of the scale is somewhere you can see you are rather than a
      // number you have to read.
      const span = s.speedBars.length
      const on = (speed / MONORAIL_SPEED) * span
      s.speedBars.forEach((mat, i) => {
        const alight = i < on
        mat.emissiveIntensity = alight ? 2.0 : 0.14
        mat.color.setHex(i >= span - 3 ? 0xffb020 : 0x6fd8ff)
        mat.emissive.setHex(i >= span - 3 ? 0xffb020 : 0x6fd8ff)
      })

      // THE LINE AHEAD. Five stations on a strip with the one being served in
      // the middle, so the diagram scrolls past as the train does. The centre
      // dot carries the stop: dim while running, bright on arrival, amber
      // while the doors are open.
      const at = rail.phase === 'running' ? 0.4 : 1
      s.lineDots.forEach((mat, i) => {
        const centre = i === 2
        mat.emissiveIntensity = centre ? 0.6 + at * 1.8 : 0.45
        const doors = rail.doors > 0.01
        mat.emissive.setHex(centre && doors ? 0xffb020 : 0x6fd8ff)
        mat.color.setHex(centre && doors ? 0xffb020 : 0x6fd8ff)
      })

      // THE DOORS, as two leaves that actually part. Driven by the same
      // `doors` value the HUD's bar is, so the two cannot disagree.
      const open = Math.max(0, Math.min(1, rail.doors / RAIL_DOOR_SECONDS))
      for (const leaf of s.doorLeaves) {
        leaf.position.x = leaf.userData.home + leaf.userData.side * open * 0.08
        leaf.material.emissiveIntensity = 0.4 + open * 1.4
      }
    }

    // The gauges. Brake pipe falls as the brake goes on; line voltage is
    // steady with a little sag under power, which is what a needle on a train
    // does and is the cheapest way to make one look alive.
    if (cab.needles) {
      const braking = want < 0 || rail.signal === 'red'
      const sweep = (v) => (v - 0.5) * 2.1
      if (cab.needles[0]) {
        cab.needles[0].rotation.z = sweep(braking ? 0.28 : 0.82)
      }
      if (cab.needles[1]) {
        cab.needles[1].rotation.z =
          sweep(0.74 - (want > 0 ? 0.12 : 0) * Math.min(1, speed / 6))
      }
    }

    // The door buttons light when they would do something - which is only
    // while the train is standing at a platform with the doors in play.
    if (cab.doorButtons) {
      const live = rail.phase === 'doors' || rail.phase === 'alighting' ||
                   rail.phase === 'held'
      cab.doorButtons[0].emissiveIntensity = live ? 2.2 : 0.3
      cab.doorButtons[1].emissiveIntensity = rail.phase === 'held' ? 2.2 : 0.3
    }
  }



  // -------------------------------------------------------------
  // Traffic
  // -------------------------------------------------------------

  /**
   * The vehicles, and the colliders that let you hit them.
   *
   * Each one gets a kinematic body: it goes exactly where the simulation says
   * and is not pushed around by forces, but the player's car collides with it
   * properly instead of driving through. That's the right trade here - a fully
   * dynamic AI car spends its life on its roof.
   *
   * The traffic gives way to the player as well, so pulling out in front of a
   * bus gets you a stopped bus rather than a shove down the road.
   */
  createTraffic() {
    this.traffic = makeTraffic(this.lanes, undefined, this.busStops, this.stations)

    for (const v of this.traffic) {
      v.mesh = this.buildTrafficVehicle(v)
      // A fixed offset into the blink cycle, per vehicle. Without it every
      // indicator in the city flashes on the same beat, which reads as one
      // mechanism rather than a hundred cars. Purely cosmetic, so it lives
      // here rather than in the simulation.
      v.blinkPhase = this.rand()
      const at = trafficPosition(this.lanes, v)
      const ground = this.groundAt(at.x, at.z)
      v.mesh.position.set(at.x, ground, at.z)
      v.mesh.rotation.y = at.heading
      v.heading = at.heading
      this.game.add(v.mesh)

      v.body = this.game.physics.createKinematicBox(
        at.x, ground + TRAFFIC_HEIGHTS[v.kind] / 2, at.z,
        TRAFFIC_WIDTHS[v.kind], TRAFFIC_HEIGHTS[v.kind], TRAFFIC_LENGTHS[v.kind],
        at.heading)
    }
  }

  /** One vehicle, by kind. */
  buildTrafficVehicle(v) {
    switch (v.kind) {
      case 'bus': return this.buildBus()
      case 'police': return this.buildPoliceCar(v)
      case 'ambulance': return this.buildAmbulance(v)
      case 'tow': return this.buildTowTruck(v)
      case 'monorail': return this.buildMonorailCab(v)
      case 'fire': return this.buildFireEngine(v)
      case 'convertible': return this.buildCar(v, true)
      case 'pickup': return this.buildPickup(v)
      case 'suv': return this.buildSUV(v)
      case 'monster': return this.buildMonsterTruck(v)
      case 'race': return this.buildRaceCar(v)
      default: return this.buildCar(v, false)
    }
  }

  // -------------------------------------------------------------
  // Vehicles
  // -------------------------------------------------------------
  //
  // Mike's note on the fleet was that it looks "too boxy". It was: every
  // vehicle here was a stack of axis-aligned boxes, so a saloon had vertical
  // sides, square corners, a flat bonnet, a roof exactly as wide as its sills
  // and four black octagons for wheels.
  //
  // The answer is not more boxes. It is two things boxes cannot do:
  //
  //  1. `loftSolid()` in vehicleParts.js, which sweeps a rectangle of changing
  //     width and changing top and bottom height along the vehicle. That one
  //     primitive gives a sloping bonnet, a roof narrower than the shoulders,
  //     tapered overhangs and a wedge-shaped racing car.
  //  2. A wheel with a RIM in it. Four dark octagons is most of what made the
  //     fleet read as toys - there was no bright ring to catch the light and
  //     nothing to say which way a wheel faced.
  //
  // Everything else - arches, bumpers, mirrors, a grille, an exhaust - is
  // trim, and trim is what the eye actually counts when it decides whether
  // something is a model or a shape.

  /**
   * Materials every vehicle shares, made once.
   *
   * Cached because there are 68 vehicles in the traffic fleet and four wheels
   * on each of them: a tyre material per wheel was 272 identical materials,
   * which is 272 shader programs three.js has to keep straight.
   *
   * Only materials that NOTHING mutates are shared. `group.userData.body` is
   * still one material per vehicle, because a robber is made to flash by
   * changing its paint and a shared one would flash the whole city.
   */
  vehicleTrim() {
    if (!this._vehicleTrim) {
      const mat = (color, o = {}) => new THREE.MeshStandardMaterial({
        color, roughness: 0.6, flatShading: true, ...o
      })
      this._vehicleTrim = {
        tyre: mat(PALETTE.tyre, { roughness: 0.95 }),
        // Light enough to read against a black tyre from across a street.
        // This one colour is the single biggest change in this file.
        rim: mat(0xd6dce4, { roughness: 0.28, metalness: 0.7 }),
        hub: mat(0x70777f, { roughness: 0.5, metalness: 0.6 }),
        chrome: mat(0xb6bcc4, { roughness: 0.35, metalness: 0.8 }),
        // Bumpers, sills, mirror backs, arch liners: the dark grey plastic
        // every real car has and no box model ever does.
        trim: mat(0x2b3038, { roughness: 0.85 }),
        grille: mat(0x1b1f26, { roughness: 0.7, metalness: 0.3 })
      }
    }
    return this._vehicleTrim
  }

  /**
   * Glass, shared, and registered as a night light exactly once.
   *
   * Every builder used to make its own and register it, so dusk walked a list
   * with 68 identical materials on it.
   */
  vehicleGlass() {
    if (!this._vehicleGlass) {
      this._vehicleGlass = new THREE.MeshStandardMaterial({
        color: PALETTE.glass, roughness: 0.18, metalness: 0.5,
        flatShading: true,
        emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
      })
      this.registerNightLight(this._vehicleGlass, 0.5)
    }
    return this._vehicleGlass
  }

  /** Materials made once and shared, the same way sharedGeometry() works. */
  sharedMaterial(key, make) {
    if (!this._matCache) this._matCache = new Map()
    let m = this._matCache.get(key)
    if (!m) { m = make(); this._matCache.set(key, m) }
    return m
  }

  /** Geometry made once and shared by every vehicle that asks for the same. */
  sharedGeometry(key, make) {
    if (!this._geoCache) this._geoCache = new Map()
    let g = this._geoCache.get(key)
    if (!g) { g = make(); this._geoCache.set(key, g) }
    return g
  }

  /**
   * A lofted body panel, from sections to a mesh.
   *
   * `computeVertexNormals` on a non-indexed geometry gives one normal per
   * face, which with `flatShading` is what the whole world looks like - so a
   * lofted body sits next to the buildings rather than looking imported.
   */
  loftMesh(sections, material) {
    const solid = loftSolid(sections)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(solid.positions), 3))
    geometry.computeVertexNormals()
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    return mesh
  }

  /**
   * The monster truck.
   *
   * Everything about it is proportion: a short pickup body held absurdly high
   * on four wheels nearly as tall as the body itself. At the distance this is
   * usually seen, silhouette is the whole of recognition - so the wheels are
   * the model, and the shape sitting on top of them has to be a shape you can
   * name in one word from fifty metres away.
   *
   * The first version was not. Mike: "the shape does not look like a real
   * monster truck. The big wheels are a good improvement but the chassis and
   * body of the truck look a bit weird." What it drew was one rounded slab
   * with a roof rack, which is a beach buggy. `monsterBody()` now returns a
   * pickup in three lofts - bonnet, short cab, open bed - and this function's
   * job is to hang everything else off the two steps between them, which the
   * profile hands back by name rather than being guessed at again here.
   *
   * The other half of the fix is VERTICAL. Before, the shell's bottom edge sat
   * 0.6 units BELOW the top of the tyres, so the wheels looked swallowed and
   * the truck looked squat - the opposite of the one thing a monster truck is.
   * Now the beltline clears the tyres, the frame rails sit in open air between
   * the body and the axles, and you can see straight through under it between
   * the wheels. That gap is the point of the vehicle, so the chassis, the
   * diffs, the propshafts and the coil-overs that fill it are all worth their
   * triangles.
   */
  buildMonsterTruck(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS[v.kind]
    const width = TRAFFIC_WIDTHS[v.kind]
    const trim = this.vehicleTrim()

    // Big, loud, and never the same twice.
    const paint = v.colour || this.pick([
      PALETTE.carRed, PALETTE.carBlue, PALETTE.carGreen, PALETTE.signPink
    ])
    const body = new THREE.MeshStandardMaterial({
      color: paint, roughness: 0.45, metalness: 0.25, flatShading: true
    })
    group.userData.body = body

    // RIDE is the underside of the body shell, RADIUS the tyre. The tyres top
    // out at 2 * RADIUS = 2.1 and the shell's floor is at 1.82, so only the
    // top third of each wheel is behind bodywork - and the shell is narrower
    // than the track, so even that third stands proud sideways. The first
    // attempt at this had the floor at 1.55 and a wider shell, and the wheels
    // photographed as if they were in wheel wells: a truck in wheel wells is
    // a car. Everything above hangs off `shape`, not off these two.
    const RIDE = 1.82
    const RADIUS = 1.05
    const shape = monsterBody(length, width, RIDE)
    const AXLE = length * 0.34          // where addWheels puts them
    const RAIL_Y = 1.32                 // frame rails, in the daylight gap

    // --- The tube chassis, which is what you see under it ---
    for (const side of [1, -1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.22, length * 0.9), trim.chrome)
      rail.position.set(side * width * 0.14, RAIL_Y, 0)
      group.add(rail)

      // Uprights tying each rail to the body above it, so the shell is
      // standing on the frame rather than floating over it.
      for (const along of [length * 0.3, -length * 0.3]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, RIDE - RAIL_Y + 0.2, 0.14), trim.trim)
        post.position.set(side * width * 0.14, (RAIL_Y + RIDE) / 2 + 0.05, along)
        group.add(post)
      }
    }
    for (const along of [length * 0.34, 0, -length * 0.34]) {
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.32, 0.13, 0.15), trim.chrome)
      cross.position.set(0, RAIL_Y, along)
      group.add(cross)
    }

    // --- Live axles, propshafts and coil-overs ---
    const axleGeo = this.sharedGeometry('mt-axle',
      () => new THREE.CylinderGeometry(0.11, 0.11, width * 0.96, 8))
    const pumpkin = this.sharedGeometry('mt-diff',
      () => new THREE.SphereGeometry(0.3, 8, 6))
    for (const along of [AXLE, -AXLE]) {
      const axle = new THREE.Mesh(axleGeo, trim.chrome)
      axle.rotation.z = Math.PI / 2
      axle.position.set(0, RADIUS, along)
      group.add(axle)

      // The differential housing. A bare tube between two wheels reads as a
      // bar; the lump in the middle is what makes it an axle.
      const diff = new THREE.Mesh(pumpkin, trim.trim)
      diff.position.set(0, RADIUS, along)
      group.add(diff)

      // And the propshaft that drives it, running back from the middle of the
      // truck. Four-wheel drive is why the thing exists, and two shafts under
      // the floor say so at a glance.
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, Math.abs(along) * 0.8, 6),
        trim.chrome)
      shaft.rotation.x = Math.PI / 2
      shaft.position.set(0, RADIUS + 0.12, along * 0.55)
      group.add(shaft)

      for (const side of [1, -1]) {
        // Angled OUTWARD, frame rail at the top to axle end at the bottom.
        // Four vertical posts read as legs; four leaning ones read as
        // suspension, and this vehicle is mostly suspension.
        const rise = RIDE - RADIUS + 0.3
        const lean = Math.atan2(width * 0.24, rise)
        const cx = side * width * 0.24
        const cy = (RADIUS + RIDE) / 2 + 0.14

        const shock = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, rise, 6), trim.trim)
        shock.position.set(cx, cy, along)
        shock.rotation.z = side * lean
        group.add(shock)

        const spring = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, rise * 0.66, 6),
          new THREE.MeshStandardMaterial({
            color: 0xd8543a, roughness: 0.6, flatShading: true
          }))
        spring.position.set(cx, cy, along)
        spring.rotation.z = side * lean
        group.add(spring)

        // A trailing link from the axle forward (or back) to the frame, which
        // is what stops a live axle steering itself and what fills the last
        // empty corner of the gap.
        const link = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.08, length * 0.2), trim.chrome)
        link.position.set(side * width * 0.2, RADIUS + 0.16,
          along - Math.sign(along) * length * 0.11)
        link.rotation.x = Math.sign(along) * 0.18
        group.add(link)
      }
    }

    // --- The shell: bonnet, short cab, open bed ---
    group.add(this.loftMesh(shape.lower, body))
    group.add(this.loftMesh(shape.cabin, body))
    // The bed drawn dark and sunk below the rails. Same trick the police car
    // uses for its glass: re-loft a profile slightly inflated so it wins the
    // depth fight with the panel it sits inside.
    group.add(this.loftMesh(shape.bed, trim.trim))
    // Bed rails standing proud of the beltline. Without them the bonnet and
    // the bed are one unbroken line from nose to tailgate and the only thing
    // saying "pickup" is the cab sitting in the middle of it. The step up
    // behind the cab is half the silhouette.
    for (const side of [1, -1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.14, shape.cabBack - shape.tail), body)
      rail.position.set(side * (shape.flank - 0.07), shape.belt + 0.05,
        (shape.cabBack + shape.tail) / 2)
      group.add(rail)
    }
    const tailgate = new THREE.Mesh(
      new THREE.BoxGeometry(shape.flank * 2, 0.14, 0.16), body)
    tailgate.position.set(0, shape.belt + 0.05, shape.tail + 0.08)
    group.add(tailgate)

    // Glass, as the cabin re-lofted a hair proud and inset top and bottom -
    // which gives a windscreen that follows the A-pillar's rake for free
    // instead of a flat pane guessed at an angle.
    const glass = this.vehicleGlass()
    group.add(this.loftMesh(shape.cabin.map((s) => ({
      ...s, halfWidth: s.halfWidth * 1.01,
      yBottom: s.yBottom + 0.16, yTop: s.yTop - 0.14
    })), glass))

    // --- A cage around the cab, not a rack on the roof ---
    //
    // The first version put four posts and two hoops well outboard of the
    // shell, so it photographed as a safari roof rack sitting on a buggy. A
    // real one is tight to the greenhouse: tubes up the windscreen edges,
    // rails along the roof, a hoop across the back of the cab, and stays down
    // into the bed.
    const cageW = width * 0.36
    const tube = (len, radius = 0.055) => new THREE.CylinderGeometry(
      radius, radius, len, 6)
    for (const side of [1, -1]) {
      // A-pillar tube, following the windscreen exactly rather than at an
      // angle guessed to look about right. Its bottom is at the base of the
      // screen, its top at the roof's leading edge, and both of those are
      // stated by the profile - so if the cab's proportions ever change the
      // pillar moves with them.
      const dz = shape.cowl - shape.roofFront
      const dy = shape.roof - (shape.belt - 0.05)
      const pillar = new THREE.Mesh(tube(Math.hypot(dy, dz)), trim.chrome)
      pillar.position.set(side * cageW, (shape.roof + shape.belt - 0.05) / 2,
        (shape.cowl + shape.roofFront) / 2)
      // Negative: rotating about +X tips a standing cylinder's top towards
      // +z, and the screen leans the other way.
      pillar.rotation.x = -Math.atan2(dz, dy)
      group.add(pillar)

      // Roof rail from the screen back to the rear hoop.
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.09, shape.roofFront - shape.cabBack),
        trim.chrome)
      rail.position.set(side * cageW, shape.roof + 0.04,
        (shape.roofFront + shape.cabBack) / 2)
      group.add(rail)

      // The stay running down from the top of the rear hoop into the bed,
      // which is the tube you actually notice on these.
      const stay = new THREE.Mesh(tube(0.88), trim.chrome)
      stay.position.set(side * cageW, shape.belt + 0.34, shape.cabBack - 0.38)
      stay.rotation.x = 0.46
      group.add(stay)
    }
    for (const [along, y] of [
      [shape.roofFront, shape.roof + 0.04], [shape.cabBack, shape.roof + 0.04]
    ]) {
      const hoop = new THREE.Mesh(tube(cageW * 2), trim.chrome)
      hoop.rotation.z = Math.PI / 2
      hoop.position.set(0, y, along)
      group.add(hoop)
    }

    // Exhaust stacks up behind the cab. Two chrome pipes standing above the
    // roofline is about the loudest single cue this vehicle has.
    //
    // They stop at `shape.top`, which is the profile's statement of how high
    // anything on this vehicle is allowed to reach - TRAFFIC_HEIGHTS.monster
    // is the collider and a pipe standing through it is a pipe that clips
    // through bridges.
    const stackFoot = shape.belt - 0.14
    const stackHead = shape.top - 0.16
    for (const side of [1, -1]) {
      const stack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.1, stackHead - stackFoot, 8),
        trim.chrome)
      stack.position.set(side * width * 0.32, (stackFoot + stackHead) / 2,
        shape.cabBack - 0.12)
      group.add(stack)
      const tip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.1, 0.16, 8), trim.trim)
      tip.position.set(side * width * 0.32, stackHead + 0.06,
        shape.cabBack - 0.12)
      group.add(tip)
    }

    // A light bar on the front edge of the roof.
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(cageW * 1.9, 0.15, 0.15), trim.trim)
    bar.position.set(0, shape.roof + 0.16, shape.roofFront)
    group.add(bar)
    for (let i = -2; i <= 2; i++) {
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.14, 0.06),
        new THREE.MeshStandardMaterial({
          color: 0xfff4d8, roughness: 0.3,
          emissive: new THREE.Color(0xfff2cf), emissiveIntensity: 0
        }))
      pod.position.set(i * cageW * 0.42, shape.roof + 0.16, shape.roofFront + 0.1)
      group.add(pod)
    }

    // --- The face, which is the other thing you recognise it by ---
    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(shape.flank * 1.5, 0.3, 0.1), trim.grille)
    grille.position.set(0, shape.belt - 0.32, shape.nose + 0.02)
    group.add(grille)
    // A scoop on the bonnet: the engine is the size of the cab and does not
    // fit under a flat panel.
    const scoop = new THREE.Mesh(
      new THREE.BoxGeometry(shape.flank * 0.9, 0.17, length * 0.13), trim.trim)
    scoop.position.set(0, shape.belt - 0.02, shape.cowl + length * 0.09)
    group.add(scoop)

    // Nerf bars front and rear, which also give the lamps something to sit on.
    for (const [z, w] of [[shape.nose + 0.12, 0.8], [shape.tail - 0.12, 0.76]]) {
      const bumper = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, width * w, 8), trim.chrome)
      bumper.rotation.z = Math.PI / 2
      bumper.position.set(0, RAIL_Y + 0.16, z)
      group.add(bumper)
      for (const side of [1, -1]) {
        const stalk = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.08, Math.abs(z) - length * 0.4),
          trim.chrome)
        stalk.position.set(side * width * 0.24, RAIL_Y + 0.16,
          (z + Math.sign(z) * length * 0.4) / 2)
        group.add(stalk)
      }
    }

    // Lamps sit in the grille, not down by the axles. The default height-based
    // placement puts them at 0.42 * 3.2 = 1.34, which on a body this high off
    // the ground is under the front bumper - so the ground is declared to be
    // where the frame is instead of where the tyres are.
    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind],
      shape.belt - 0.32 - Math.max(0.5, TRAFFIC_HEIGHTS[v.kind] * 0.42))
    // 1.05 against a saloon's 0.45. This is the number the jump course is
    // designed around, so it is the one to change if the course ever feels
    // wrong - not the mounds.
    // Pushed out to 0.34 of the length from centre, against the 0.31 every
    // other vehicle uses. A tyre this size at 0.31 leaves a 1.25 gap between
    // front and rear, and two circles almost touching read as a go-kart; 0.34
    // opens it to 1.57 and the wheelbase looks like it could carry something.
    const wheels = this.addWheels(group, length, width, RADIUS,
      { thickness: 0.62, tread: true, atFront: 0.34, atRear: 0.34 })
    this.addWheelArches(group, wheels, RADIUS, body,
      { tube: 0.12, lift: 1.08, sweep: 0.7 })
    return group
  }

  /**
   * The racing car.
   *
   * Long, flat and pointed, with the wheels outside the bodywork - which is
   * the one detail that separates a racing car from a fast road car at a
   * glance, and the reason `addWheels` is given a track wider than the shell.
   *
   * Over the box version it gained: a lofted tub that actually tapers to the
   * nose, a two-element rear wing, a front wing with endplates, barge boards,
   * suspension wishbones out to each wheel, a halo, and an exhaust. The
   * wishbones matter more than they sound - an open-wheel car with nothing
   * between the tub and the wheels reads as four wheels near a car.
   */
  buildRaceCar(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS[v.kind]
    const width = TRAFFIC_WIDTHS[v.kind]
    const trim = this.vehicleTrim()

    const paint = v.colour || this.pick([
      PALETTE.carRed, PALETTE.signCyan, PALETTE.carBlue, PALETTE.crane
    ])
    const body = new THREE.MeshStandardMaterial({
      color: paint, roughness: 0.3, metalness: 0.45, flatShading: true
    })
    group.userData.body = body
    const dark = trim.trim

    // The tub, lofted: wide at the sidepods, pinched at both ends.
    group.add(this.loftMesh(raceBody(length, width), body))

    // A dark floor under all of it. One flat colour from nose to wing was the
    // single thing that made this car photograph as a plank - a racing car is
    // read by the line between its bodywork and its floor, and there was no
    // line.
    group.add(this.loftMesh([
      { z: -length * 0.48, halfWidth: width * 0.42, yBottom: 0.08, yTop: 0.2 },
      { z: -length * 0.1, halfWidth: width * 0.48, yBottom: 0.06, yTop: 0.18 },
      { z: length * 0.2, halfWidth: width * 0.44, yBottom: 0.06, yTop: 0.18 },
      { z: length * 0.4, halfWidth: width * 0.2, yBottom: 0.08, yTop: 0.2 }
    ], dark))

    // And a white stripe down the spine, which is what a livery does for a
    // shape this uniform.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.16, 0.03, length * 0.66),
      new THREE.MeshStandardMaterial({
        color: PALETTE.carWhite, roughness: 0.4, flatShading: true
      }))
    stripe.position.set(0, 0.71, length * 0.06)
    group.add(stripe)

    // Sidepods, with the inlet cut as a darker face.
    for (const side of [1, -1]) {
      group.add(this.loftMesh([
        { z: -length * 0.3, halfWidth: width * 0.1, yBottom: 0.14, yTop: 0.44,
          xShift: side * width * 0.34 },
        { z: -length * 0.06, halfWidth: width * 0.15, yBottom: 0.12, yTop: 0.56,
          xShift: side * width * 0.34 },
        { z: length * 0.14, halfWidth: width * 0.14, yBottom: 0.12, yTop: 0.58,
          xShift: side * width * 0.34 }
      ], body))

      const inlet = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.24, 0.3, 0.08), dark)
      inlet.position.set(side * width * 0.34, 0.38, length * 0.145)
      group.add(inlet)

      // Barge board, ahead of the pod.
      const board = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.24, length * 0.16), body)
      board.position.set(side * width * 0.4, 0.26, length * 0.26)
      group.add(board)
    }

    // Front wing: two elements and two endplates.
    for (const [i, y] of [0.17, 0.25].entries()) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(width * 1.06, 0.05, length * (0.09 - i * 0.02)), body)
      wing.position.set(0, y, length * (0.53 + i * 0.015))
      wing.rotation.x = -0.12 * (i + 1)
      group.add(wing)
    }
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.28, length * 0.12), body)
      plate.position.set(side * width * 0.53, 0.26, length * 0.53)
      group.add(plate)
    }

    // Cockpit: a halo, a headrest and a helmet.
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(width * 0.21, 0.035, 4, 10, Math.PI), dark)
    halo.rotation.y = Math.PI / 2
    halo.position.set(0, 0.6, length * 0.02)
    group.add(halo)
    const haloStay = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.16, 0.06), dark)
    haloStay.position.set(0, 0.66, length * 0.15)
    group.add(haloStay)

    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshStandardMaterial({
        color: PALETTE.carWhite, roughness: 0.35, flatShading: true
      }))
    helmet.position.set(0, 0.68, -length * 0.02)
    helmet.scale.set(1, 0.95, 1.05)
    group.add(helmet)
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.07, 0.05), dark)
    visor.position.set(0, 0.7, -length * 0.02 + 0.15)
    group.add(visor)

    const headrest = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.3, 0.18, 0.14), dark)
    headrest.position.set(0, 0.68, -length * 0.11)
    group.add(headrest)

    // Airbox and engine cover, tapering to the rear.
    group.add(this.loftMesh([
      { z: -length * 0.42, halfWidth: width * 0.08, yBottom: 0.5, yTop: 0.62 },
      { z: -length * 0.24, halfWidth: width * 0.15, yBottom: 0.5, yTop: 0.78 },
      { z: -length * 0.14, halfWidth: width * 0.13, yBottom: 0.52, yTop: 0.84 }
    ], body))

    // Rear wing: two elements on tall endplates, standing well clear of the
    // engine cover. The first version sat at 0.8 with 0.4-tall plates, which
    // put it level with the airbox - so from the side the whole back of the
    // car was one continuous slab and the wing did not read as a wing.
    for (const side of [1, -1]) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.62, length * 0.16), body)
      plate.position.set(side * width * 0.44, 0.94, -length * 0.44)
      group.add(plate)
    }
    for (const [i, y] of [1.0, 1.16].entries()) {
      const wing = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.88, 0.06, length * (0.14 - i * 0.05)),
        i ? dark : body)
      wing.position.set(0, y, -length * (0.43 + i * 0.012))
      wing.rotation.x = 0.18 + i * 0.14
      group.add(wing)
    }
    // A swan-neck stay from the engine cover to the lower element, so the
    // wing is attached to something.
    const stay = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.3, 0.07), dark)
    stay.position.set(0, 0.9, -length * 0.4)
    group.add(stay)
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.08, 0.3, 8), trim.chrome)
    pipe.rotation.x = Math.PI / 2
    pipe.position.set(0, 0.52, -length * 0.5)
    group.add(pipe)

    // Wishbones, out to each wheel. Two per corner, top and bottom.
    const track = width * 1.24 / 2
    for (const side of [1, -1]) {
      for (const along of [length * 0.31, -length * 0.31]) {
        for (const [y, len] of [[0.24, 0.9], [0.46, 0.8]]) {
          const arm = new THREE.Mesh(
            new THREE.BoxGeometry(track * len, 0.05, 0.07), dark)
          arm.position.set(side * track * (1 - len / 2), y, along)
          group.add(arm)
        }
      }
    }

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind], 0,
      { style: 'race' })
    // Wheels OUTSIDE the shell, which is the whole silhouette. addWheels
    // tracks them off the width, so it is given the full width while the
    // bodywork is built at half of it.
    this.addWheels(group, length, width * 1.24, 0.46,
      { thickness: 0.42, rear: 0.52, slick: true })
    return group
  }

  /**
   * Wheels, shared by everything on the road.
   *
   * A tyre, a RIM and a hub - three meshes where there was one. The rim is the
   * whole reason this function was rewritten: the old wheel was a single
   * eight-sided black cylinder, which at the size a car is drawn here is a
   * dark octagon, and four dark octagons is most of what made the fleet look
   * like toys. A pale ring inside a black tyre catches the light, says which
   * way the wheel faces, and costs two extra meshes.
   *
   * Sixteen sides, not eight. Flat-shaded at sixteen it still reads as
   * faceted next to the buildings; at eight it reads as a mistake.
   *
   * Each wheel hangs off a pivot, and the four are recorded on the group. The
   * traffic never turns or spins its wheels, so on its own that looks like
   * ceremony - but the car the PLAYER drives is built by this same code, and
   * the player's wheels steer and roll. `wheel` is the thing Vehicle.js spins
   * about its own x, so it has to be the group holding all three parts, not
   * the tyre alone.
   */
  addWheels(group, length, width, radius = 0.45, opts = {}) {
    const trim = this.vehicleTrim()
    const thickness = opts.thickness ?? Math.max(0.28, radius * 0.42)
    const rearThickness = opts.rear ?? thickness
    const wheels = []

    const parts = (t) => {
      const key = `${radius.toFixed(3)}x${t.toFixed(3)}`
      return {
        tyre: this.sharedGeometry('tyre' + key, () => new THREE.CylinderGeometry(
          radius, radius, t, WHEEL.tyreSegments)),
        rim: this.sharedGeometry('rim' + key, () => new THREE.CylinderGeometry(
          radius * WHEEL.rimFraction, radius * WHEEL.rimFraction,
          t * (1 + WHEEL.rimProud), WHEEL.rimSegments)),
        hub: this.sharedGeometry('hub' + key, () => new THREE.CylinderGeometry(
          radius * WHEEL.hubFraction, radius * WHEEL.hubFraction, t * 1.1, 6))
      }
    }
    const front = parts(thickness)
    const rear = parts(rearThickness)

    for (const at of wheelPositions(length, width, radius, thickness,
                                    opts.atFront ?? 0.31, opts.atRear ?? 0.31)) {
      const geo = at.front ? front : rear
      const pivot = new THREE.Group()
      pivot.position.set(at.x, at.y, at.z)

      // The wheel itself is a GROUP, laid on its side once. Vehicle.js adds to
      // its rotation.x to roll it, which with three.js' XYZ euler order is the
      // axle axis after this z-turn.
      const wheel = new THREE.Group()
      wheel.rotation.z = Math.PI / 2

      const tyre = new THREE.Mesh(geo.tyre, trim.tyre)
      tyre.castShadow = true
      wheel.add(tyre)
      wheel.add(new THREE.Mesh(geo.rim, trim.rim))
      wheel.add(new THREE.Mesh(geo.hub, trim.hub))

      pivot.add(wheel)
      group.add(pivot)
      wheels.push({ pivot, wheel, baseRotationY: 0, side: at.side, front: at.front, at })
    }

    group.userData.wheels = wheels
    return wheels
  }

  /**
   * An arch over each wheel.
   *
   * A half-torus, which is one mesh and the cheapest possible way to stop a
   * wheel looking like a disc parked next to a slab. Without them the body's
   * flank runs straight past the tyre and the two do not belong to each other.
   */
  addWheelArches(group, wheels, radius, material, opts = {}) {
    const tube = opts.tube ?? 0.06
    const lift = opts.lift ?? 1.12
    // How much of a half-circle the arch sweeps. A full half-circle reaches
    // down to the axle line on both sides, which on a road car is under the
    // sill and invisible - but on the monster truck the body stops well above
    // the axle, so the two ends came out in open air and each wheel wore a
    // red C-shaped ring. Anything less than a full sweep stops at the fender
    // line instead, which is where a fender stops.
    const sweep = opts.sweep ?? 1
    const geometry = this.sharedGeometry(
      `arch${radius.toFixed(2)}:${tube}:${lift}:${sweep}`,
      () => new THREE.TorusGeometry(radius * lift, tube, 4, 10, Math.PI * sweep))
    for (const w of wheels) {
      const arch = new THREE.Mesh(geometry, material)
      arch.rotation.y = Math.PI / 2
      // A partial sweep starts at the back of the wheel and runs forward over
      // the top, so it needs turning by half the shortfall to sit centred over
      // the wheel. The sign is the one that moves +y towards +z: get it wrong
      // and every wheel trails a fender off its back edge, which is what the
      // first attempt did.
      arch.rotation.x = Math.PI * (1 - sweep) / 2
      arch.position.copy(w.pivot.position)
      arch.scale.z = 1.18
      group.add(arch)
    }
  }

  /**
   * Bumpers, a grille, mirrors and an exhaust: the trim that says "model".
   *
   * Grouped into one call because every road car wants all of them and a
   * builder that lists them separately drifts - the sedan gained mirrors once
   * and the SUV did not, and nothing said so.
   */
  addRoadTrim(group, length, width, opts = {}) {
    const trim = this.vehicleTrim()
    const {
      bumperY = 0.5, grilleY = 0.72, mirrorY = 1.2, mirrorAt = 0.16,
      exhaust = true, sills = true, body = null
    } = opts

    for (const [z, w] of [[length / 2 - 0.04, 0.98], [-length / 2 + 0.04, 0.98]]) {
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(width * w, 0.2, 0.18), trim.trim)
      bar.position.set(0, bumperY, z)
      group.add(bar)
    }

    const grille = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.56, 0.2, 0.08), trim.grille)
    grille.position.set(0, grilleY, length / 2 + 0.01)
    group.add(grille)

    // Mirrors: an arm and a face, because a floating pad reads as a sticker.
    for (const side of [1, -1]) {
      const arm = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.05, 0.05), trim.trim)
      arm.position.set(side * (width * 0.5 + 0.06), mirrorY, length * mirrorAt)
      group.add(arm)

      const face = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.14, 0.16), body || trim.trim)
      face.position.set(side * (width * 0.5 + 0.15), mirrorY, length * mirrorAt)
      group.add(face)
    }

    if (sills) {
      for (const side of [1, -1]) {
        const sill = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, 0.12, length * 0.52), trim.trim)
        sill.position.set(side * width * 0.49, bumperY - 0.12, -length * 0.02)
        group.add(sill)
      }
    }

    if (exhaust) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.07, 0.18, 6), trim.chrome)
      pipe.rotation.x = Math.PI / 2
      pipe.position.set(width * 0.26, bumperY - 0.1, -length / 2 - 0.06)
      group.add(pipe)
    }
  }

  /**
   * A saloon, or a convertible - which is the same car with the roof taken
   * off and a pair of seats put in, because that reads at a distance and a
   * separate model wouldn't.
   *
   * Two lofts: the lower body from the sills to the shoulder line, and the
   * cabin on top of it. Two rather than one because a single swept rectangle
   * has one top edge, so it can have a sloping bonnet OR a roof narrower than
   * the sills, and a car needs both.
   */
  buildCar(v, open) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS[v.kind]
    const width = TRAFFIC_WIDTHS[v.kind]

    const paint = v.colour || this.pick([
      PALETTE.carRed, PALETTE.carBlue, PALETTE.carWhite,
      PALETTE.carSand, PALETTE.carGreen, PALETTE.carGrey
    ])
    const body = new THREE.MeshStandardMaterial({
      color: paint, roughness: 0.42, metalness: 0.28, flatShading: true
    })

    // The paintwork, kept so a robber can be made to flash. Every kind of
    // car records it, because a robber is whichever car happened to be
    // chosen and not a special one.
    group.userData.body = body

    const shape = carBody(length, width, open
      ? { shoulder: 0.98, roof: 1.3, cabinFront: 0.1, cabinBack: -0.2 }
      : {})
    group.add(this.loftMesh(shape.lower, body))

    const glass = this.vehicleGlass()

    if (open) {
      // Windscreen, two seats and a roll hoop, no roof.
      const screen = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.8, 0.5, 0.07), glass)
      screen.position.set(0, 1.24, length * 0.12)
      screen.rotation.x = -0.34
      group.add(screen)

      const seatMat = new THREE.MeshStandardMaterial({
        color: 0x2a2f36, roughness: 0.9, flatShading: true
      })
      for (const side of [1, -1]) {
        const seat = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.3, 0.42, 0.3), seatMat)
        seat.position.set(side * width * 0.21, 1.16, -length * 0.08)
        group.add(seat)

        const hoop = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 0.34, 6),
          this.vehicleTrim().chrome)
        hoop.position.set(side * width * 0.21, 1.32, -length * 0.16)
        group.add(hoop)
      }
      const tonneau = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.8, 0.06, length * 0.2), body)
      tonneau.position.set(0, 1.0, -length * 0.26)
      group.add(tonneau)
    } else {
      group.add(this.loftMesh(shape.cabin, body))

      // ONE glass band round the whole cabin rather than four panes.
      //
      // The greenhouse is lofted a second time, a hair wider, with its top and
      // bottom pulled in - so the glass wraps the windscreen, both sides and
      // the rear screen in a single mesh, and the body colour shows as a roof
      // above it and a waistline below. Four separate panes never met at the
      // corners, which is what made the old cars look like boxes with stickers
      // on.
      group.add(this.loftMesh(shape.cabin.map((s) => ({
        ...s,
        halfWidth: s.halfWidth * 1.008,
        yBottom: s.yBottom + 0.1,
        yTop: s.yTop - 0.12
      })), glass))
    }

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    const wheels = this.addWheels(group, length, width, 0.45)
    this.addWheelArches(group, wheels, 0.45, body)
    this.addRoadTrim(group, length, width, { body, mirrorY: open ? 1.1 : 1.14 })
    return group
  }

  /**
   * A pickup: a tall cab up front and an open bed behind it.
   *
   * The bed is drawn as a floor and three low sides rather than a solid box,
   * because an open back is the whole of what makes it read as a pickup from
   * the pavement. Everything is a fraction of the length and width the layout
   * states, so a change to TRAFFIC_LENGTHS moves the cab and the bed with it -
   * every fitting that has come adrift in this project came adrift because it
   * was positioned from a number that then changed.
   */
  buildPickup(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS[v.kind]
    const width = TRAFFIC_WIDTHS[v.kind]
    const trim = this.vehicleTrim()

    const paint = v.colour || this.pick([
      PALETTE.carRed, PALETTE.carBlue, PALETTE.carWhite,
      PALETTE.carSand, PALETTE.carGreen, PALETTE.carGrey
    ])
    const body = new THREE.MeshStandardMaterial({
      color: paint, roughness: 0.52, metalness: 0.2, flatShading: true
    })
    group.userData.body = body

    const SILL = 0.62
    const DECK = 1.34

    // The lower body: full length, sitting higher than a car, with the nose
    // tucked and the bonnet dropping away.
    group.add(this.loftMesh([
      { z: -length / 2, halfWidth: width * 0.44, yBottom: SILL, yTop: DECK },
      { z: -length * 0.3, halfWidth: width / 2, yBottom: SILL - 0.05, yTop: DECK },
      { z: length * 0.28, halfWidth: width / 2, yBottom: SILL - 0.05, yTop: DECK + 0.1 },
      { z: length * 0.44, halfWidth: width * 0.47, yBottom: SILL, yTop: DECK + 0.02 },
      { z: length / 2, halfWidth: width * 0.42, yBottom: SILL + 0.06, yTop: DECK - 0.06 }
    ], body))

    // The cab, over the front axle, tapering back the way a pickup's does.
    //
    // The glass band is placed off the cab's own LOWEST roof, not off each
    // section: with `yTop - 0.12` per section the band followed the sloping
    // windscreen down to 0.16 units tall at the back and the cab photographed
    // as a plain white box with a slot in it.
    const cab = [
      { z: -length * 0.08, halfWidth: width * 0.45, yBottom: DECK - 0.04, yTop: DECK + 0.94 },
      { z: length * 0.08, halfWidth: width * 0.46, yBottom: DECK - 0.04, yTop: DECK + 0.98 },
      { z: length * 0.2, halfWidth: width * 0.45, yBottom: DECK - 0.04, yTop: DECK + 0.9 },
      { z: length * 0.27, halfWidth: width * 0.43, yBottom: DECK - 0.04, yTop: DECK + 0.6 }
    ]
    group.add(this.loftMesh(cab, body))
    group.add(this.loftMesh(cab.map((s) => ({
      ...s, halfWidth: s.halfWidth * 1.01,
      yBottom: DECK + 0.3, yTop: Math.min(s.yTop, DECK + 0.9) - 0.1
    })), this.vehicleGlass()))

    // The bed: three sides, open at the back, with ribs down the flanks.
    for (const side of [1, -1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 0.44, length * 0.44), body)
      wall.position.set(side * (width * 0.47), DECK + 0.2, -length * 0.25)
      group.add(wall)
    }
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.92, 0.46, 0.09), body)
    head.position.set(0, DECK + 0.21, -length * 0.06)
    group.add(head)
    const tailgate = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.92, 0.4, 0.08), body)
    tailgate.position.set(0, DECK + 0.18, -length * 0.47)
    group.add(tailgate)
    const bedFloor = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.9, 0.05, length * 0.42), trim.trim)
    bedFloor.position.set(0, DECK + 0.01, -length * 0.26)
    group.add(bedFloor)

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    const wheels = this.addWheels(group, length, width, 0.54, { thickness: 0.38 })
    this.addWheelArches(group, wheels, 0.54, body, { tube: 0.07 })
    this.addRoadTrim(group, length, width,
      { body, bumperY: 0.62, grilleY: 1.02, mirrorY: DECK + 0.62, mirrorAt: 0.2 })
    return group
  }

  /** An SUV: a saloon's shape, taller, with the cabin carried right back. */
  buildSUV(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS[v.kind]
    const width = TRAFFIC_WIDTHS[v.kind]
    const trim = this.vehicleTrim()

    const paint = v.colour || this.pick([
      PALETTE.carRed, PALETTE.carBlue, PALETTE.carWhite,
      PALETTE.carSand, PALETTE.carGreen, PALETTE.carGrey
    ])
    const body = new THREE.MeshStandardMaterial({
      color: paint, roughness: 0.48, metalness: 0.22, flatShading: true
    })
    group.userData.body = body

    // The cabin runs almost the whole length - that squarer profile is what
    // tells an SUV from a saloon at a distance, more than the extra height.
    const shape = carBody(length, width, {
      sill: 0.5, shoulder: 1.22, roof: 2.0,
      noseDrop: 0.08, tuck: 0.9,
      cabinFront: 0.2, cabinBack: -0.44, cabinWidth: 0.9,
      roofFront: 0.06, roofBack: -0.4, roofTuck: 0.96
    })
    group.add(this.loftMesh(shape.lower, body))
    group.add(this.loftMesh(shape.cabin, body))
    group.add(this.loftMesh(shape.cabin.map((s) => ({
      ...s, halfWidth: s.halfWidth * 1.008,
      yBottom: s.yBottom + 0.12, yTop: s.yTop - 0.16
    })), this.vehicleGlass()))

    // A roof rack, because an SUV without one is just a tall hatchback.
    for (const side of [1, -1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.07, length * 0.46), trim.trim)
      rail.position.set(side * width * 0.34, 2.04, -length * 0.1)
      group.add(rail)
      for (const along of [-length * 0.3, length * 0.06]) {
        const foot = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.07, 0.09), trim.trim)
        foot.position.set(side * width * 0.34, 1.98, along)
        group.add(foot)
      }
    }

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    const wheels = this.addWheels(group, length, width, 0.52, { thickness: 0.36 })
    this.addWheelArches(group, wheels, 0.52, body, { tube: 0.07 })
    this.addRoadTrim(group, length, width,
      { body, bumperY: 0.62, grilleY: 0.96, mirrorY: 1.42, mirrorAt: 0.2 })
    return group
  }
  /**
   * Every lamp a vehicle has: two headlights, two tail lights, and an amber
   * indicator at each of the four corners.
   *
   * ONE builder, for the traffic and for the car you drive. The player's car
   * used to have a second set of lamps of its own, built somewhere else at a
   * different size, and the moment `setKind()` started rebuilding the mesh
   * from this builder the two came apart - see the note at the top of
   * vehicleLights.js. Anything with a body and wheels comes through here now.
   *
   * The materials are handed back on `group.userData.lights` rather than kept
   * by the caller, because the caller does not survive a change of vehicle
   * and the mesh does. Ask the mesh what its lamps are, and a stale reference
   * is not something you can hold.
   *
   * Note what is NOT here any more: `registerNightLight(head)`. The lamps are
   * driven by lampBrightness() every frame now, and leaving them on the
   * night-emissive list as well would have two systems writing one
   * `emissiveIntensity` - with whichever ran last winning, which is a bug
   * that only shows up at dusk.
   */
  addVehicleLamps(group, length, width, height = 1.8, baseY = 0, opts = {}) {
    // Lamp height follows the BODY, not a constant. At a fixed 0.78 the bus's
    // headlights sat in its wheel arches and the fire engine's were halfway
    // down its bumper: every fitting in this project that came adrift came
    // adrift because it was positioned from a number that then changed.
    //
    // `baseY` is where the ground is in the caller's coordinates. The traffic
    // builds its meshes standing on zero and passes nothing; the player's
    // default car is built around its own centre and passes the offset. That
    // one number is the difference between two origin conventions, stated
    // once instead of being quietly assumed at each end.
    const lampY = baseY + Math.max(0.5, height * 0.42)
    const scale = Math.min(1.5, Math.max(0.85, width / 1.9))

    const head = new THREE.MeshStandardMaterial({
      color: 0xfff6e0, roughness: 0.3,
      emissive: new THREE.Color(0xfff2cf), emissiveIntensity: 0
    })
    const tail = new THREE.MeshStandardMaterial({
      color: 0x6b2620, roughness: 0.5,
      emissive: new THREE.Color(PALETTE.brakeLight), emissiveIntensity: 0.15
    })
    // One amber material per SIDE, not one for the whole vehicle: the front
    // and rear indicator on the same side always agree, and the two sides
    // never do.
    const amber = () => new THREE.MeshStandardMaterial({
      color: 0x7a4a10, roughness: 0.5,
      emissive: new THREE.Color(0xffa62b), emissiveIntensity: 0
    })
    const left = amber()
    const right = amber()

    const nose = length / 2 + 0.02
    const tailZ = -length / 2 - 0.02

    // A racing car has no headlights, and putting the road set on one left two
    // cream bricks sitting on the front wing. It still needs the MATERIALS -
    // the indicator and brake-light code reads `userData.lights` and does not
    // care what shape the lamp is - so the four are made either way and only
    // the meshes change. Returning early without them would be a crash three
    // files away the first time somebody indicated.
    if (opts.style === 'race') {
      const rain = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.07), tail)
      rain.position.set(0, baseY + 0.5, tailZ - 0.1)
      group.add(rain)
      for (const side of [1, -1]) {
        const marker = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.06, 0.06),
          sideOfVehicle(side) < 0 ? left : right)
        marker.position.set(side * width * 0.3, baseY + 0.62, tailZ + 0.06)
        group.add(marker)
      }
      group.userData.lights = { head, tail, left, right }
      return group.userData.lights
    }

    for (const side of [1, -1]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.4 * scale, 0.2, 0.1), head)
      lamp.position.set(side * width * 0.3, lampY, nose)
      group.add(lamp)

      const rear = new THREE.Mesh(
        new THREE.BoxGeometry(0.35 * scale, 0.18, 0.1), tail)
      rear.position.set(side * width * 0.3, lampY, tailZ)
      group.add(rear)

      // Indicators outboard of the main lamps, at all four corners, because
      // an indicator you cannot see from behind is not an indicator.
      //
      // Which side an X is on is ASKED rather than assumed - see
      // sideOfVehicle(). Assuming it put every indicator in the world on the
      // wrong side of every vehicle, and no test could see it, because the
      // tests checked which way to signal and never which lamp that lit.
      const material = sideOfVehicle(side) < 0 ? left : right
      for (const z of [nose, tailZ]) {
        const blinker = new THREE.Mesh(
          new THREE.BoxGeometry(0.16 * scale, 0.15, 0.09), material)
        blinker.position.set(side * width * 0.44, lampY, z)
        group.add(blinker)
      }
    }

    group.userData.lights = { head, tail, left, right }
    return group.userData.lights
  }

  /**
   * A police car: black body, white doors.
   *
   * The panels are separate geometry on the flanks rather than a repaint of
   * the shell, because a door is a rectangle in the middle of a side. Building
   * it as its own car rather than recolouring a saloon also means the black
   * stays black - the saloon picks a random colour from the palette, and
   * cloning its material after the fact left the odd red police car.
   */
  buildPoliceCar(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.police
    const width = TRAFFIC_WIDTHS.police
    const trim = this.vehicleTrim()

    const black = new THREE.MeshStandardMaterial({
      color: PALETTE.policeBody, roughness: 0.35, metalness: 0.35, flatShading: true
    })
    const white = new THREE.MeshStandardMaterial({
      color: PALETTE.policePanel, roughness: 0.5, flatShading: true
    })
    group.userData.body = black

    const shape = carBody(length, width, {
      shoulder: 1.06, roof: 1.66, cabinBack: -0.36, cabinFront: 0.16
    })
    group.add(this.loftMesh(shape.lower, black))
    group.add(this.loftMesh(shape.cabin, black))
    group.add(this.loftMesh(shape.cabin.map((s) => ({
      ...s, halfWidth: s.halfWidth * 1.008,
      yBottom: s.yBottom + 0.1, yTop: s.yTop - 0.12
    })), this.vehicleGlass()))

    // The white doors, proud of the flank by a hair so they don't fight the
    // black body for the same pixels.
    for (const side of [1, -1]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.5, length * 0.4), white)
      door.position.set(side * (width * 0.48), 0.78, -length * 0.02)
      group.add(door)

      // A chequered stripe along the waist, which is what a livery actually
      // looks like and what a single white panel never quite did.
      for (let i = 0; i < 6; i++) {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.09, length * 0.06),
          i % 2 ? white : black)
        block.position.set(side * (width * 0.485), 1.06,
          -length * 0.2 + i * length * 0.07)
        group.add(block)
      }
    }

    // A push bar on the nose.
    const push = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, 0.34, 0.09), trim.trim)
    push.position.set(0, 0.72, length / 2 + 0.09)
    group.add(push)
    for (const side of [1, -1]) {
      const stay = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.5, 0.07), trim.trim)
      stay.position.set(side * width * 0.26, 0.66, length / 2 + 0.05)
      group.add(stay)
    }

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    const wheels = this.addWheels(group, length, width, 0.46)
    this.addWheelArches(group, wheels, 0.46, black)
    this.addRoadTrim(group, length, width,
      { body: black, mirrorY: 1.18, exhaust: true })

    group.userData.beacons = this.addBeacons(group, 1.72, 0.55)
    return group
  }

  /**
   * A box spanning two points, which is the honest way to place a strut.
   *
   * Every diagonal member in this file that was authored as a position plus a
   * guessed `rotation.x` has come out pointing the wrong way at least once -
   * the plane's fin lay flat, its wings swept opposite ways, the monster
   * truck's fenders trailed off the back of every wheel, and the tow truck's
   * mast leaned forwards over its own cab. The mistake is always the same: a
   * rotation is a direction you have to reason about, and two points are a
   * direction you can simply state.
   *
   * `a` and `b` are { x, y, z } in the group's own frame.
   */
  strut(a, b, thickness, material) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z
    const len = Math.hypot(dx, dy, dz)
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(thickness, thickness, len), material)
    mesh.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
    // Point the box's own +z down the span. lookAt turns an object's -z
    // towards its argument, so aim it at the far end and then flip.
    mesh.lookAt(b.x, b.y, b.z)
    mesh.rotateY(Math.PI)
    mesh.castShadow = true
    return mesh
  }

  /**
   * The monorail driver's cab.
   *
   * Mike: "I also want to see if we can spawn in the driver's cab of the
   * train. This will require a complete new build of the cockpit of the
   * driver's cab."
   *
   * Built INSIDE OUT, which is the whole difference between this and every
   * other vehicle in the file. The rest are made to be looked at from a few
   * metres away and their interiors are a pane of tinted glass; this one is
   * made to be sat in, so the camera lives about where the driver's head
   * would be and everything is placed relative to that: the console below the
   * sight line, the windscreen pillars outside peripheral vision, the side
   * windows where you would look out of them.
   *
   * The outside of the car still gets built, because the player can press C
   * and look at the train they are driving.
   *
   * WHY THE FIRST VERSION HAD NO WALLS
   * ----------------------------------
   * Mike, having sat in it: "the monorail driver's cab should get a lot lot
   * lot lot more detailed. It's currently just a glass window with a
   * transparent ceiling."
   *
   * The ceiling really was transparent, and so were both walls and the floor,
   * and it was not a material setting. The shell is `trainCarBody()` run
   * through `loftMesh()`, and a loft is wound OUTWARD - `outwardCount()` is
   * the guard that insists on it, because Rapier collides a trimesh from
   * either side while three.js culls back faces. Seen from outside that is
   * exactly right. Seen from INSIDE, every surface of it is a back face, so
   * the renderer throws all of them away and the cab becomes a windscreen
   * hanging in the sky with a console under it. That is precisely what he
   * described, and no amount of adding knobs to the desk would have fixed it.
   *
   * So the cab is now LINED. The lining is thin slabs standing just inside the
   * shell - ceiling, floor, both side panels, a rear bulkhead - and a slab is
   * viewed from outside itself, whichever side you are on, so it draws. That
   * is the general rule this file needed and did not have: an interior is not
   * the inside of the exterior, it is its own set of surfaces.
   *
   * WHAT IS IN HERE
   * ---------------
   * A driving desk that wraps round the seat, three lit displays (speed, the
   * line ahead, the doors), two gauges, a master controller on a pedestal to
   * the left with a notched quadrant, a reverser to the right, eight rotary
   * knobs, a block of push buttons, a stacked signal repeater, door controls
   * on the side console, a dead man's pedal, a proper seat, and a roof console
   * with the cab lights in it. `userData` hands out everything that moves so
   * `updateMonorailCab()` can drive it; nothing here animates itself.
   */
  buildMonorailCab(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.monorail
    const width = TRAFFIC_WIDTHS.monorail
    const trim = this.vehicleTrim()
    const height = 3.2

    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.trainBody, roughness: 0.5, metalness: 0.2, flatShading: true
    })
    group.userData.body = body
    const skirt = new THREE.MeshStandardMaterial({
      color: PALETTE.trainSkirt, roughness: 0.7, flatShading: true
    })
    const dark = new THREE.MeshStandardMaterial({
      color: 0x23272e, roughness: 0.8, flatShading: true
    })

    // THE LINING IS ITS OWN LIGHT SOURCE, and that is not a stylistic choice.
    //
    // Every light in this world is outside the train. A ceiling panel's normal
    // points DOWN, away from the sun, so lit by the scene alone it renders
    // black however pale its colour is - and the first build of this came out
    // as a cave with a bright windscreen at the end of it, which is not much
    // better than having no ceiling at all. A real cab has its own lights on,
    // day and night; giving the lining a standing emissive says that in one
    // number and costs nothing per frame, where a point light in here would be
    // another shadow-casting light in a scene that already has plenty.
    const lining = new THREE.MeshStandardMaterial({
      color: 0xd9dee3, roughness: 0.92, flatShading: true,
      emissive: new THREE.Color(0x8b949c), emissiveIntensity: 0.55
    })
    const panelDark = new THREE.MeshStandardMaterial({
      color: 0x232a33, roughness: 0.55, metalness: 0.2, flatShading: true,
      emissive: new THREE.Color(0x1a2029), emissiveIntensity: 0.5
    })
    // The fleet's `trim.trim` is a dark plastic chosen to read against a black
    // tyre in full sun. In here it is a black knob in a room with no sun in
    // it, so the cab has its own - the same idea, lifted far enough to be a
    // shape rather than a hole.
    const cabTrim = new THREE.MeshStandardMaterial({
      color: 0x59626d, roughness: 0.7, flatShading: true,
      emissive: new THREE.Color(0x2f353d), emissiveIntensity: 0.6
    })
    // And the overhead panel, which is the single biggest surface in the view
    // after the windscreen: it sits across the top of the frame and in dark
    // grey it read as a hole in the roof.
    const roofPanel = new THREE.MeshStandardMaterial({
      color: 0x707a85, roughness: 0.8, flatShading: true,
      emissive: new THREE.Color(0x424a54), emissiveIntensity: 0.7
    })

    // --- The shell, the same loft the line's own cars use ---
    group.add(this.loftMesh(trainCarBody(length, width, height, 1), body))
    group.add(this.loftMesh(trainCarBody(length, width, 1.05, 1)
      .map(sec => ({ ...sec, yBottom: 0.35, yTop: 1.05 })), skirt))

    // The accent band along the flanks, which is what says "train".
    for (const side of [1, -1]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.34, length * 0.84),
        new THREE.MeshStandardMaterial({
          color: PALETTE.signCyan, roughness: 0.5, flatShading: true
        }))
      band.position.set(side * width * 0.5, 1.95, 0)
      group.add(band)
    }

    // The cab's own glass, and NOT the fleet's shared tinted pane.
    //
    // Every other vehicle's glass is looked at from outside, where a dark tint
    // reads as glass. This one is looked THROUGH, by a driver who has to judge
    // a twenty-six metre platform through it - and the shared material turned
    // the whole forward view a flat teal. Clear, barely there, and still
    // registered as a night light so the cab lights up after dark with
    // everything else.
    const glass = this.sharedMaterial('cab-glass', () => {
      const mat = new THREE.MeshStandardMaterial({
        color: 0xd8ecf6, roughness: 0.08, metalness: 0.1,
        transparent: true, opacity: 0.18, flatShading: true,
        emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
      })
      this.registerNightLight(mat, 0.35)
      return mat
    })

    // --- The windscreen, wrapped round the front ---
    //
    // Three panes rather than one flat sheet: from inside, a single pane has
    // no edges in peripheral vision and the cab reads as a hole in the world
    // rather than as somewhere you are sitting.
    const SCREEN_Z = length * 0.42
    const front = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, 1.15, 0.1), glass)
    front.position.set(0, 2.05, SCREEN_Z)
    front.rotation.x = -0.12
    group.add(front)
    for (const side of [1, -1]) {
      const quarter = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.34, 1.05, 0.1), glass)
      quarter.position.set(side * width * 0.35, 2.02, SCREEN_Z - 0.42)
      quarter.rotation.y = side * 0.62
      group.add(quarter)
      // The pillar between them.
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 1.3, 0.14), cabTrim)
      pillar.position.set(side * width * 0.29, 2.0, SCREEN_Z - 0.06)
      group.add(pillar)
      // And a side window, level with where you would look out of it.
      const sideGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.8, length * 0.3), glass)
      sideGlass.position.set(side * width * 0.5, 2.05, -length * 0.06)
      group.add(sideGlass)
    }

    // -----------------------------------------------------------------
    // THE LINING
    // -----------------------------------------------------------------
    //
    // Thin slabs standing just inside the shell. See the note at the top of
    // this function: the shell itself is invisible from in here, so these are
    // the only surfaces the driver can actually see, and without them the cab
    // has no ceiling, no walls and no floor.
    //
    // FLOOR at 0.95 and CEILING at 2.84 put 1.89 of headroom round a camera
    // that sits at 2.12 in this frame - see sitInCab(), and mind the 0.2 that
    // wrapTrafficMesh() takes off between the outer and inner frames.
    const FLOOR = 0.95
    const ROOF = 2.84
    const BULK_Z = 1.9          // the wall behind the driver
    const NOSE_Z = SCREEN_Z + 0.2
    const bay = NOSE_Z - BULK_Z
    const midZ = (NOSE_Z + BULK_Z) / 2

    const box = (w, h, d, mat) =>
      new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)
    const put = (mesh, x, y, z) => {
      mesh.position.set(x, y, z)
      group.add(mesh)
      return mesh
    }
    /** A surface that is its own light source - screens, lamps, indicators. */
    const lit = (colour, strength) => new THREE.MeshStandardMaterial({
      color: colour, roughness: 0.35,
      emissive: new THREE.Color(colour), emissiveIntensity: strength
    })

    put(box(width - 0.12, 0.1, bay, cabTrim), 0, FLOOR - 0.05, midZ)
    put(box(width - 0.12, 0.12, bay, lining), 0, ROOF + 0.06, midZ)
    put(box(width - 0.1, 1.5, 0.12, lining), 0, 1.72, BULK_Z)

    // The bulkhead's door, with a window in it, so the cab reads as a room
    // that the rest of the train is on the other side of rather than as a
    // box with a flat end.
    put(box(0.72, 1.42, 0.06, panelDark), -0.36, 1.68, BULK_Z + 0.08)
    put(box(0.52, 0.42, 0.04, glass), -0.36, 2.18, BULK_Z + 0.12)
    put(box(0.05, 0.16, 0.05, trim.chrome), -0.03, 1.62, BULK_Z + 0.12)

    // Side panels, in two bands with a window between them.
    //
    // The window is the cab's OWN, and it has to be built here: the side glass
    // further down this function is the saloon's, at z -0.66, which is behind
    // the bulkhead and eleven units from anywhere the driver can see. Without
    // this the cab had a metre-high gap running down both sides at eye level -
    // no glass, no panel, nothing - and you looked straight out of the train
    // through the hole where the wall should have been.
    //
    // It also earns its place: leaning out to look back down the platform is
    // what a driver does, and the alignment game is the one thing in this
    // world where that matters.
    for (const side of [1, -1]) {
      put(box(0.07, 0.66, bay - 0.4, lining), side * 1.13, 1.3, midZ)
      put(box(0.07, 0.3, bay - 0.4, lining), side * 1.13, 2.67, midZ)
      put(box(0.05, 0.86, bay - 0.5, glass), side * 1.14, 2.06, midZ)
      // The frame round it: a waist rail, a header, and a division post.
      put(box(0.09, 0.07, bay - 0.4, cabTrim), side * 1.12, 1.65, midZ)
      put(box(0.09, 0.07, bay - 0.4, cabTrim), side * 1.12, 2.5, midZ)
      put(box(0.09, 0.86, 0.09, cabTrim), side * 1.12, 2.06, midZ - 0.2)
    }

    // -----------------------------------------------------------------
    // THE ROOF CONSOLE
    // -----------------------------------------------------------------
    //
    // Two light panels and a switch bank above the windscreen. The cab lights
    // are the reason the lining is visible at all at night, and the reason it
    // does not read as a grey box in the daytime either - a flat-lit interior
    // has no depth to it.
    const cabLight = lit(0xfff3dc, 1.4)
    for (const along of [0.5, 1.7]) {
      put(box(1.0, 0.05, 0.44, cabLight), 0, ROOF - 0.02, BULK_Z + along)
    }
    // The overhead panel, hard up against the ceiling and no deeper than it
    // needs to be. Both of those are about the VIEW rather than about the
    // panel: it lands across the top of the frame, and a slab hanging down
    // into the windscreen is the difference between a cab and a letterbox.
    put(box(width - 0.5, 0.16, 0.3, roofPanel), 0, ROOF - 0.09, SCREEN_Z - 0.3)
    for (let i = 0; i < 6; i++) {
      put(box(0.07, 0.04, 0.08, lit([
        0x2bd94a, 0x6fd8ff, 0xffb020, 0x6fd8ff, 0x2bd94a, 0xffb020
      ][i], 0.9)), -0.42 + i * 0.17, ROOF - 0.19, SCREEN_Z - 0.3)
    }
    // The sun visor, which every cab with a forward view has.
    const visor = put(box(1.0, 0.04, 0.32, cabTrim), 0, 2.5, SCREEN_Z - 0.56)
    visor.rotation.x = 0.38
    // A grab rail across the back of the cab.
    const rail = put(
      new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 8),
        trim.chrome), 0, 2.58, BULK_Z + 0.34)
    rail.rotation.z = Math.PI / 2

    // -----------------------------------------------------------------
    // THE DESK
    // -----------------------------------------------------------------
    //
    // A wrap-around, not a plank: a centre section square to the driver and a
    // wing angled in on each side, which is what puts the outer controls
    // within reach without pushing the middle of the desk further away.
    //
    // Everything on it lives BELOW 1.95, because the camera sits at 2.12 and
    // the player is judging a twenty-six metre platform through the glass
    // above it. That constraint is why the displays are set into the desk
    // rather than standing on it, bar the one small centre screen.
    // 0.65 above the cab floor, which is desk height, and the number the
    // camera's cab pitch in sitInCab() is set against - move one and the other
    // has to move with it.
    const DESK_Y = 1.6
    const DESK_Z = SCREEN_Z - 0.64
    const TILT = -0.16

    const desk = put(box(1.34, 0.13, 0.8, panelDark), 0, DESK_Y, DESK_Z)
    desk.rotation.x = TILT
    for (const side of [1, -1]) {
      const wing = put(box(0.78, 0.13, 0.68, panelDark),
        side * 1.0, DESK_Y + 0.02, DESK_Z - 0.16)
      wing.rotation.y = -side * 0.42
      wing.rotation.x = TILT
    }
    // The fascia under it, and a chrome lip along the near edge.
    put(box(width - 0.22, 0.5, 0.12, cabTrim), 0, 1.24, DESK_Z + 0.3)
    put(box(width - 0.34, 0.05, 0.07, trim.chrome), 0, 1.6, DESK_Z - 0.38)

    // --- The three displays ---
    //
    // Named and handed out through userData because they carry live values:
    // the speed bars fill as the train accelerates, the line diagram lights
    // the station being approached, and the door pictograms open with the
    // doors. `updateMonorailCab()` is the only thing that writes to them.
    const screenGlow = 1.7
    const screens = { speedBars: [], lineDots: [], doorLeaves: [] }

    /** A display: a dark bezel with a lit face set into it. */
    const display = (w, h, x, y, z, rx, ry = 0) => {
      const bezel = put(box(w + 0.07, 0.05, h + 0.07, panelDark), x, y, z)
      bezel.rotation.set(rx, ry, 0)
      const face = put(box(w, 0.02, h, lit(0x0a2233, 0.55)), x, y + 0.026, z)
      face.rotation.set(rx, ry, 0)
      return face
    }

    // LEFT, flush in the desk: the line ahead, as five stations on a strip.
    // The one being approached is the bright one.
    display(0.5, 0.36, -0.4, DESK_Y + 0.07, DESK_Z, TILT)
    put(box(0.4, 0.02, 0.025, lit(0x3b6a86, 1.0)), -0.4, DESK_Y + 0.1, DESK_Z)
      .rotation.set(TILT, 0, 0)
    for (let i = 0; i < 5; i++) {
      const mat = lit(0x6fd8ff, 0.5)
      const dot = put(box(0.05, 0.02, 0.05, mat),
        -0.56 + i * 0.08, DESK_Y + 0.105, DESK_Z)
      dot.rotation.set(TILT, 0, 0)
      screens.lineDots.push(mat)
    }

    // RIGHT, flush in the desk: the doors, as two leaves that part.
    display(0.5, 0.36, 0.4, DESK_Y + 0.07, DESK_Z, TILT)
    for (const side of [1, -1]) {
      const mat = lit(0x2bd94a, 0.4)
      const leaf = put(box(0.11, 0.02, 0.2, mat),
        0.4 + side * 0.07, DESK_Y + 0.1, DESK_Z)
      leaf.rotation.set(TILT, 0, 0)
      leaf.userData.home = leaf.position.x
      leaf.userData.side = side
      screens.doorLeaves.push(leaf)
    }

    // CENTRE, raised on a stalk and tilted back: the speedometer, as a bar
    // that fills. The only thing on the desk that stands above it, kept small
    // and low so it sits in the bottom of the view rather than across it.
    put(box(0.1, 0.26, 0.08, cabTrim), 0, 1.68, DESK_Z + 0.06)
    display(0.56, 0.28, 0, 1.82, DESK_Z + 0.02, Math.PI / 2 - 0.28)
    for (let i = 0; i < 9; i++) {
      const mat = lit(0x6fd8ff, 0.2)
      const bar = put(box(0.045, 0.16, 0.02, mat),
        -0.22 + i * 0.055, 1.82, DESK_Z - 0.008)
      bar.rotation.x = -0.28
      screens.speedBars.push(mat)
    }
    const cabParts = { screens }

    // --- The gauges: brake pipe and line voltage, flush in the desk ---
    const needles = []
    for (const [i, colour] of [[0, 0xffe08a], [1, 0x8fd8ff]]) {
      const face = put(
        new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.035, 14),
          lit(colour, 0.4)), -0.86 + i * 1.72, DESK_Y + 0.08, DESK_Z - 0.12)
      face.rotation.set(TILT, 0, 0)
      const ring = put(
        new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.02, 5, 14), trim.chrome),
        -0.86 + i * 1.72, DESK_Y + 0.09, DESK_Z - 0.12)
      ring.rotation.x = Math.PI / 2 + TILT
      // The needle, as a pivot the update turns. Offset inside the pivot so it
      // sweeps round the face instead of spinning about its own middle.
      const pivot = new THREE.Group()
      pivot.position.copy(face.position)
      pivot.position.y += 0.03
      pivot.rotation.x = Math.PI / 2 + TILT
      const needle = box(0.016, 0.1, 0.012, trim.trim)
      needle.position.y = 0.05
      pivot.add(needle)
      group.add(pivot)
      needles.push(pivot)
    }
    cabParts.needles = needles

    // --- Knobs. Mike asked for knobs. ---
    //
    // Eight rotaries: five small ones in a row on the right wing and three
    // bigger ones on the left, each with a pointer on top so the setting can
    // be read - a knob without a mark on it is a cylinder.
    for (const [n, r, x0, step, y, z] of [
      [5, 0.05, 0.72, 0.14, DESK_Y + 0.09, DESK_Z - 0.3],
      [3, 0.075, -0.66, -0.2, DESK_Y + 0.09, DESK_Z - 0.3]
    ]) {
      for (let i = 0; i < n; i++) {
        const x = x0 + i * step
        const k = put(
          new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.86, 0.07, 10),
            cabTrim), x, y, z)
        k.rotation.x = TILT
        const mark = put(box(0.012, 0.02, r * 0.9, trim.chrome),
          x, y + 0.05, z - r * 0.4)
        mark.rotation.x = TILT
        mark.rotation.y = (i - 1) * 0.5
      }
    }

    // --- Push buttons, in a block, because a desk of knobs alone is a hob ---
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) {
        const colour = [0x2bd94a, 0xffb020, 0x6fd8ff, 0xff3b2f][i]
        const b = put(box(0.07, 0.03, 0.07, lit(colour, 0.7)),
          -0.14 + i * 0.09, DESK_Y + 0.08, DESK_Z - 0.32 + row * 0.11)
        b.rotation.x = TILT
      }
    }
    // And the horn, which is red and is a mushroom.
    const horn = put(
      new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.05, 10),
        lit(0xff3b2f, 0.5)), 0.28, DESK_Y + 0.1, DESK_Z - 0.3)
    horn.rotation.x = TILT

    // -----------------------------------------------------------------
    // THE MASTER CONTROLLER
    // -----------------------------------------------------------------
    //
    // On a pedestal off the left of the desk, which is where it is on a real
    // one, with a notched quadrant behind it so the lever's travel means
    // something. `userData.lever` is what updateMonorailCab() turns, and it is
    // the one piece of feedback that says the controls did anything.
    put(box(0.3, 0.56, 0.4, cabTrim), -0.86, 1.2, DESK_Z - 0.44)
    put(box(0.34, 0.06, 0.44, panelDark), -0.86, 1.5, DESK_Z - 0.44)
    put(box(0.05, 0.34, 0.46, panelDark), -0.66, 1.66, DESK_Z - 0.44)
    for (let i = 0; i < 5; i++) {
      put(box(0.07, 0.02, 0.05, trim.chrome),
        -0.66, 1.62 + i * 0.06, DESK_Z - 0.62 + i * 0.09)
    }
    const lever = new THREE.Mesh(
      new THREE.CylinderGeometry(0.038, 0.05, 0.46, 8), trim.chrome)
    lever.position.set(-0.86, 1.74, DESK_Z - 0.44)
    lever.rotation.x = 0.32
    group.add(lever)
    // A T-grip on top of it, and parented to it so it swings with the lever
    // instead of being left behind in mid-air - which is the mistake the tow
    // truck's mast and the plane's fin both made in their turn.
    const grip = box(0.09, 0.09, 0.2, cabTrim)
    grip.position.y = 0.26
    lever.add(grip)
    const cross = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.24, 8), cabTrim)
    cross.rotation.z = Math.PI / 2
    cross.position.y = 0.3
    lever.add(cross)
    cabParts.lever = lever

    // The reverser on the right: a short key that sits FORWARD, and is the
    // reason a train cannot be driven both ways at once.
    put(box(0.26, 0.4, 0.3, cabTrim), 0.88, 1.28, DESK_Z - 0.5)
    const reverser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.035, 0.22, 8), trim.chrome)
    reverser.position.set(0.88, 1.56, DESK_Z - 0.5)
    reverser.rotation.x = -0.5
    group.add(reverser)
    cabParts.reverser = reverser

    // -----------------------------------------------------------------
    // THE SIGNAL REPEATER
    // -----------------------------------------------------------------
    //
    // Three lamps stacked in a housing, read top down like the signal on the
    // line it repeats. On the desk rather than on the roof so it is in the
    // same glance as the alignment, which is the thing the driver is actually
    // playing. Named, so updateMonorailCab() can light the one the game says.
    put(box(0.16, 0.34, 0.1, panelDark), 0.62, 1.84, DESK_Z + 0.04)
    const lamps = []
    for (let i = 0; i < 3; i++) {
      const mat = lit([0xff3b2f, 0xffb020, 0x2bd94a][i], 0)
      mat.color = new THREE.Color(0x2a2f36)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), mat)
      lamp.position.set(0.62, 1.95 - i * 0.11, DESK_Z - 0.02)
      group.add(lamp)
      lamps.push(mat)
    }
    cabParts.lamps = { red: lamps[0], amber: lamps[1], green: lamps[2] }

    // --- Door controls, on the side console where the driver's hand falls ---
    put(box(0.1, 0.4, 0.62, panelDark), -1.06, 1.42, DESK_Z - 0.9)
    const doorButtons = []
    for (const [i, colour] of [[0, 0x2bd94a], [1, 0xffb020]]) {
      const mat = lit(colour, 0.35)
      const b = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.04, 10), mat)
      b.rotation.z = Math.PI / 2
      b.position.set(-1.0, 1.48, DESK_Z - 1.06 + i * 0.3)
      group.add(b)
      doorButtons.push(mat)
    }
    cabParts.doorButtons = doorButtons

    // -----------------------------------------------------------------
    // THE DRIVER'S PLACE
    // -----------------------------------------------------------------
    //
    // Behind the console and behind the camera, so none of it is seen from
    // the cab view - and all of it is very obviously missing from the outside
    // one, which is the view where a cab with nobody's chair in it looks
    // wrong.
    const SEAT_Z = SCREEN_Z - 1.5
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.5, 10),
      cabTrim), -0.16, 1.2, SEAT_Z)
    put(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12),
      trim.chrome), -0.16, FLOOR + 0.03, SEAT_Z)
    put(box(0.56, 0.14, 0.52, dark), -0.16, 1.48, SEAT_Z)
    const back = put(box(0.56, 0.62, 0.14, dark), -0.16, 1.84, SEAT_Z - 0.26)
    back.rotation.x = -0.14
    put(box(0.34, 0.2, 0.12, dark), -0.16, 2.2, SEAT_Z - 0.32)
    for (const side of [1, -1]) {
      put(box(0.09, 0.08, 0.36, trim.trim), -0.16 + side * 0.3, 1.66, SEAT_Z)
    }

    // The dead man's pedal, on the floor where a foot would find it.
    const pedal = put(box(0.24, 0.05, 0.3, trim.chrome), -0.1, FLOOR + 0.06,
      SEAT_Z + 0.72)
    pedal.rotation.x = 0.22

    // A wiper on the OUTSIDE of the windscreen. Small, and the one thing in
    // here that is put on for the benefit of the view from the platform.
    const wiper = put(box(0.03, 0.03, 0.7, trim.trim), -0.3, 1.6, SCREEN_Z + 0.1)
    wiper.rotation.x = Math.PI / 2
    wiper.rotation.z = 0.5

    // EVERYTHING THAT MOVES, HANDED OUT AS ONE THING.
    //
    // Not six separate keys, which is what this was and which is why not one
    // of them worked: wrapTrafficMesh() carries NAMED keys up from the inner
    // group to the outer one, it had never heard of any of these, and so
    // updateMonorailCab() read `undefined` in silence on every frame - the
    // repeater black, the speed display stuck at full scale, the master
    // controller motionless however hard the train was being driven. One key
    // is one thing to carry, so an instrument added to this desk tomorrow is
    // reachable by construction rather than by remembering.
    group.userData.cab = cabParts

    // Lamps from the ONE builder, like every other vehicle.
    //
    // `vehiclelights.mjs` derives the list of builders from the switch and
    // insists every one of them routes through here, and it is right to: the
    // indicator and brake-light code reads `userData.lights` without asking
    // what shape the vehicle is, so a builder that skips this is a crash three
    // files away the first time somebody signals. It caught this one the day
    // it was written - "10 lamp calls vs 11 builders".
    this.addVehicleLamps(group, length, width, height)

    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.5, 0.22, 0.06), dark)
    board.position.set(0, 2.82, length * 0.44)
    group.add(board)

    return group
  }

  /**
   * The tow truck.
   *
   * Mike, adding a fifth callout to the world: "Lets also create a new vehicle
   * - a Tow Truck. Make this a high detail model just like the other vehicles."
   *
   * A wrecker is three volumes and one machine: a cab, a flat service body
   * with lockers down each side, a mast standing over the back of it, and the
   * wheel-lift boom that slides out from underneath. The boom is the only part
   * of any vehicle in this world that MOVES on its own, which is why its
   * geometry is not written here - `TOW_RIG` and `yokeAt()` live in
   * towGame.js, because the arithmetic that decides where a towed car hangs
   * has to agree with the mesh exactly, and those are in different files.
   *
   * `group.userData.tow` hands the moving parts back out. `updateTowRig()`
   * below is the only thing that writes to them.
   */
  buildTowTruck(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.tow
    const width = TRAFFIC_WIDTHS.tow
    const trim = this.vehicleTrim()

    // Recovery orange, which is what these are, and the one palette colour
    // nothing else in the fleet uses.
    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.crane, roughness: 0.5, metalness: 0.15, flatShading: true
    })
    group.userData.body = body

    const steel = new THREE.MeshStandardMaterial({
      color: 0x8d949c, roughness: 0.5, metalness: 0.55, flatShading: true
    })

    const CAB_ROOF = 2.46
    const DECK = 1.22          // the top of the service body

    // --- The cab: short, tall, and set well forward ---
    group.add(this.loftMesh([
      { z: length * 0.04, halfWidth: width / 2, yBottom: 0.48, yTop: CAB_ROOF },
      { z: length * 0.26, halfWidth: width / 2, yBottom: 0.44, yTop: CAB_ROOF },
      // The cowl, then a short bonnet. A cab that runs flat to the nose is a
      // van, and this fleet already has three of those.
      { z: length * 0.34, halfWidth: width * 0.48, yBottom: 0.44, yTop: 1.62 },
      { z: length * 0.46, halfWidth: width * 0.46, yBottom: 0.48, yTop: 1.5 },
      { z: length * 0.5, halfWidth: width * 0.4, yBottom: 0.56, yTop: 1.36 }
    ], body))

    // --- The service body: a flat deck on tall lockers ---
    //
    // Lower than the cab and a shade narrower, which is what makes the two
    // read as separate things bolted together rather than one van.
    group.add(this.loftMesh([
      { z: -length * 0.5, halfWidth: width * 0.48, yBottom: 0.5, yTop: DECK },
      { z: -length * 0.44, halfWidth: width / 2, yBottom: 0.46, yTop: DECK },
      { z: length * 0.04, halfWidth: width / 2, yBottom: 0.46, yTop: DECK }
    ], body))

    // Locker doors down each side: three per side, recessed dark, with a
    // handle. A blank orange slab is what this looked like without them.
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const at = -length * 0.42 + i * length * 0.16
        const door = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.5, length * 0.13), trim.trim)
        door.position.set(side * (width * 0.5), 0.82, at)
        group.add(door)
        const handle = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.06, 0.22), trim.chrome)
        handle.position.set(side * (width * 0.52), 0.82, at + length * 0.05)
        group.add(handle)
      }
      // A chevron stripe along the deck edge.
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.14, length * 0.52),
        new THREE.MeshStandardMaterial({
          color: PALETTE.carWhite, roughness: 0.6, flatShading: true }))
      stripe.position.set(side * (width * 0.5), DECK - 0.12, -length * 0.2)
      group.add(stripe)
    }

    // The headboard behind the cab, which every one of these has and which
    // stops the deck reading as an empty tray.
    const headboard = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.96, 0.9, 0.14), trim.trim)
    headboard.position.set(0, DECK + 0.45, length * 0.03)
    group.add(headboard)

    const glass = this.vehicleGlass()
    // The windscreen fills the cowl face rather than being floated at a
    // guessed angle in front of it: the loft steps from (0.26L, 2.46) down to
    // (0.34L, 1.62), so the screen is that segment's midpoint, that segment's
    // length, and that segment's lean.
    const cowlA = { z: length * 0.26, y: CAB_ROOF }
    const cowlB = { z: length * 0.34, y: 1.62 }
    const cowlDz = cowlB.z - cowlA.z
    const cowlDy = cowlA.y - cowlB.y
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.84, Math.hypot(cowlDz, cowlDy) * 0.9, 0.08),
      glass)
    // Pushed a hair PROUD of the cowl along its own normal. Sat exactly on the
    // face it is the same plane as the bodywork, and a coplanar pane loses the
    // z-fight to the panel behind it about half the time and vanishes.
    const cowlLen = Math.hypot(cowlDz, cowlDy)
    screen.position.set(0,
      (cowlA.y + cowlB.y) / 2 + (cowlDz / cowlLen) * 0.05,
      (cowlA.z + cowlB.z) / 2 + (cowlDy / cowlLen) * 0.05)
    screen.rotation.x = -Math.atan2(cowlDz, cowlDy)
    group.add(screen)
    for (const side of [1, -1]) {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.62, length * 0.15), glass)
      pane.position.set(side * width * 0.48, 1.94, length * 0.15)
      group.add(pane)
    }

    // --- The mast: two legs raked back over the wheel-lift ---
    //
    // This is the silhouette. A tow truck seen from across a street is a box
    // with a gantry standing on the back of it, and without the mast this is
    // an orange van.
    //
    // It stands over the BOOM PIVOT rather than behind the cab, which is where
    // it is on a real one and which is structurally the point: the mast is
    // what the lift hangs off. Every member here is placed by `strut()` between
    // two stated points - the first version guessed the rake and leaned the
    // whole thing forwards over the windscreen.
    const MAST_TOP = 2.92
    const footZ = TOW_RIG.pivotZ + 0.55
    const headZ = TOW_RIG.pivotZ - 0.25
    for (const side of [1, -1]) {
      const x = side * width * 0.34
      group.add(this.strut(
        { x, y: DECK - 0.1, z: footZ }, { x, y: MAST_TOP, z: headZ }, 0.16, steel))
      // A brace forward to the deck, so the mast is a triangle rather than two
      // posts standing in a tray.
      group.add(this.strut(
        { x, y: MAST_TOP - 0.5, z: headZ + 0.24 },
        { x, y: DECK, z: footZ + length * 0.2 }, 0.1, steel))
    }
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.78, 0.18, 0.22), steel)
    head.position.set(0, MAST_TOP, headZ)
    group.add(head)

    // The winch drum on the deck, and the cable running up to the head and
    // back down to a stowed hook. Three small things that between them say
    // what the mast is FOR.
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, width * 0.5, 8), trim.chrome)
    drum.rotation.z = Math.PI / 2
    drum.position.set(0, DECK + 0.24, footZ + length * 0.12)
    group.add(drum)
    group.add(this.strut(
      { x: 0, y: DECK + 0.32, z: footZ + length * 0.12 },
      { x: 0, y: MAST_TOP - 0.06, z: headZ }, 0.05, trim.trim))
    const hook = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.32, 0.14), trim.chrome)
    hook.position.set(0, MAST_TOP - 0.52, headZ - 0.16)
    group.add(hook)

    // --- The wheel-lift, which is the part that moves ---
    //
    // Built at full reach and full lift and then driven back to stowed by
    // updateTowRig() on the next frame, so there is exactly one piece of code
    // that decides where these parts are and it is the one that runs every
    // frame - not two that have to agree.
    const pivot = new THREE.Group()
    pivot.position.set(0, TOW_RIG.pivotY, TOW_RIG.pivotZ)
    group.add(pivot)

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.22, 1), steel)
    pivot.add(arm)

    // The yoke: a crossbar with two L-arms that go under the car's front
    // tyres. Kept LEVEL as the boom swings, because a real one is on its own
    // pivot and because a crossbar that tips with the boom looks broken.
    const yoke = new THREE.Group()
    pivot.add(yoke)
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(TOW_RIG.yokeWidth, 0.18, 0.2), steel)
    yoke.add(bar)
    for (const side of [1, -1]) {
      const cradle = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.14, 0.7), steel)
      cradle.position.set(side * TOW_RIG.yokeWidth * 0.42, -0.02, 0.35)
      yoke.add(cradle)
      const stop = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, 0.3, 0.12), trim.trim)
      stop.position.set(side * TOW_RIG.yokeWidth * 0.42, 0.16, 0.66)
      yoke.add(stop)
    }
    // The hydraulic ram, drawn between the body and the boom so the lift has
    // something visibly doing it.
    const ram = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.8, 6), trim.chrome)
    ram.position.set(0, 0.34, 0.42)
    ram.rotation.x = 1.1
    pivot.add(ram)

    // A step bumper across the tail, which the boom slides out under and
    // which gives the tail lamps something to sit on.
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.9, 0.16, 0.4), trim.trim)
    step.position.set(0, 0.66, -length * 0.5 - 0.1)
    group.add(step)

    group.userData.tow = { pivot, arm, yoke }
    this.updateTowRig(group, 0, 0)

    // --- Lights ---
    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS.tow)
    // Amber, not red and blue: this is a recovery vehicle, not an emergency
    // one, and addBeacons() only knows how to make a police bar.
    // On the CAB roof, not at z = 0 - which is behind the cab on a truck this
    // shape, and is exactly the mistake the fire engine's beacons shipped with
    // once already.
    group.userData.beacons =
      this.addAmberBar(group, CAB_ROOF + 0.1, width, length * 0.15)
    // Work lights on the mast head, pointing back at whatever is being picked
    // up - which is where they are on a real one and why they are worth having.
    for (const side of [1, -1]) {
      const work = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.16, 0.1),
        new THREE.MeshStandardMaterial({
          color: 0xfff4d8, roughness: 0.3,
          emissive: new THREE.Color(0xfff2cf), emissiveIntensity: 0
        }))
      work.position.set(side * width * 0.24, MAST_TOP - 0.16, headZ - 0.17)
      group.add(work)
    }

    const wheels = this.addWheels(group, length, width, 0.5,
      { thickness: 0.4, atFront: 0.33, atRear: 0.3 })
    this.addWheelArches(group, wheels, 0.5, body, { tube: 0.07 })
    this.addRoadTrim(group, length, width,
      { body, bumperY: 0.58, grilleY: 1.0, mirrorY: 1.76, mirrorAt: 0.3,
        exhaust: true, sills: false })
    return group
  }

  /**
   * An amber light bar, for the one vehicle that is not an emergency.
   *
   * Returns the same `[{ material, side }]` shape addBeacons() does, so
   * vehicleLights.js drives it without knowing the difference - the two sides
   * alternate exactly as a police bar's do, they are just both amber.
   */
  addAmberBar(group, height, width, along = 0) {
    const beacons = []
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.72, 0.1, 0.26), this.vehicleTrim().trim)
    base.position.set(0, height - 0.06, along)
    group.add(base)

    for (const side of [1, -1]) {
      const material = new THREE.MeshStandardMaterial({
        color: 0xd08a1e, roughness: 0.4,
        emissive: new THREE.Color(0xffa62b), emissiveIntensity: 0
      })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(width * 0.3, 0.18, 0.24),
        material)
      lamp.position.set(side * width * 0.2, height + 0.06, along)
      group.add(lamp)
      beacons.push({ material, side })
    }
    return beacons
  }

  /**
   * Put the wheel-lift where the game says it is.
   *
   * `reach01` and `lift01` are 0..1 and come straight out of `hitchStage()`.
   * The yoke's position comes from `yokeAt()` - the same function the towing
   * arithmetic uses to work out where a car hangs - so the boom the player
   * watches and the point the car is attached to cannot disagree.
   *
   * The boom is a box of unit length SCALED rather than rebuilt, because this
   * runs every frame of a five-second animation and rebuilding a geometry
   * sixty times a second to change one number is how a frame budget goes.
   */
  updateTowRig(group, reach01, lift01) {
    const rig = group && group.userData && group.userData.tow
    if (!rig) return null

    const at = yokeAt(reach01, lift01)
    const dy = at.y - TOW_RIG.pivotY
    const dz = at.z - TOW_RIG.pivotZ          // negative: the boom points back
    const len = Math.hypot(dy, dz)

    // Rotating about +x tips the -z direction UP, and the yoke is below the
    // pivot, so this angle is positive as the boom lifts and negative when it
    // is hanging down at the road.
    const angle = Math.asin(dy / len)
    rig.pivot.rotation.x = angle
    rig.arm.scale.z = len
    rig.arm.position.z = -len / 2
    rig.yoke.position.z = -len
    rig.yoke.rotation.x = -angle
    return at
  }

  /**
   * An ambulance: a box body on a cab, with the cab lower than the box.
   *
   * Lofted as two volumes rather than two boxes so the cab's nose drops away
   * and the box's corners tuck in at the back. The step between them is the
   * shape that says ambulance, so it is built rather than implied.
   */
  buildAmbulance(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.ambulance
    const width = TRAFFIC_WIDTHS.ambulance
    const trim = this.vehicleTrim()

    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.ambulanceBody, roughness: 0.45, flatShading: true
    })
    group.userData.body = body

    // The box body.
    group.add(this.loftMesh([
      { z: -length * 0.48, halfWidth: width * 0.46, yBottom: 0.5, yTop: 2.4 },
      { z: -length * 0.42, halfWidth: width / 2, yBottom: 0.45, yTop: 2.45 },
      { z: length * 0.1, halfWidth: width / 2, yBottom: 0.45, yTop: 2.45 }
    ], body))

    // The cab, lower and narrower, with a dropped bonnet.
    group.add(this.loftMesh([
      { z: length * 0.08, halfWidth: width * 0.47, yBottom: 0.45, yTop: 1.98 },
      { z: length * 0.3, halfWidth: width * 0.47, yBottom: 0.42, yTop: 1.94 },
      { z: length * 0.44, halfWidth: width * 0.45, yBottom: 0.46, yTop: 1.5 },
      { z: length * 0.5, halfWidth: width * 0.4, yBottom: 0.52, yTop: 1.32 }
    ], body))

    const glass = this.vehicleGlass()
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.82, 0.62, 0.08), glass)
    screen.position.set(0, 1.6, length * 0.38)
    screen.rotation.x = -0.2
    group.add(screen)
    for (const side of [1, -1]) {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.5, length * 0.16), glass)
      pane.position.set(side * width * 0.48, 1.56, length * 0.24)
      group.add(pane)
      // A window in the box's back door.
      const rear = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.3, 0.5, 0.06), glass)
      rear.position.set(side * width * 0.2, 1.9, -length * 0.49)
      group.add(rear)
    }

    // The Battenburg stripe, in blocks rather than one band.
    for (const side of [1, -1]) {
      for (let i = 0; i < 9; i++) {
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(0.05, 0.3, length * 0.09),
          i % 2
            ? new THREE.MeshStandardMaterial({
              color: PALETTE.ambulanceStripe, roughness: 0.6, flatShading: true })
            : new THREE.MeshStandardMaterial({
              color: 0x2f6fc0, roughness: 0.6, flatShading: true }))
        block.position.set(side * (width * 0.5), 1.16, -length * 0.4 + i * length * 0.1)
        group.add(block)
      }
    }

    // A step under the back doors and a bumper.
    const step = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.8, 0.1, 0.3), trim.trim)
    step.position.set(0, 0.42, -length * 0.5)
    group.add(step)

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    const wheels = this.addWheels(group, length, width, 0.52,
      { thickness: 0.38, atFront: 0.33, atRear: 0.3 })
    this.addWheelArches(group, wheels, 0.52, body, { tube: 0.07 })
    this.addRoadTrim(group, length, width,
      { body, bumperY: 0.6, grilleY: 1.0, mirrorY: 1.72, mirrorAt: 0.32,
        exhaust: false, sills: false })
    group.userData.beacons = this.addBeacons(group, 2.42, 0.6)
    return group
  }

  /**
   * A fire engine: a tall crew cab, a pump body, and the aerial stowed on top.
   */
  buildFireEngine(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.fire
    const width = TRAFFIC_WIDTHS.fire
    const trim = this.vehicleTrim()

    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.fireBody, roughness: 0.5, metalness: 0.12, flatShading: true
    })
    group.userData.body = body

    // The cab's roof, named once and used by everything that sits on it.
    //
    // The beacons used to be a bare 2.55 over the REAR body, whose roof is at
    // 2.0 - so they hung half a unit clear of the truck in mid air. Every other
    // emergency vehicle happened to have a flat back at about the right height,
    // so nobody noticed the number was a guess. vehiclelights.mjs guards that
    // this is derived rather than written down, and it caught it again when
    // the cab was re-lofted and the derived number silently became a literal.
    const CAB_ROOF = 2.4

    // The crew cab, with a windscreen that leans back.
    group.add(this.loftMesh([
      { z: length * 0.18, halfWidth: width / 2, yBottom: 0.5, yTop: CAB_ROOF },
      { z: length * 0.4, halfWidth: width / 2, yBottom: 0.46, yTop: CAB_ROOF },
      { z: length * 0.5, halfWidth: width * 0.46, yBottom: 0.52, yTop: 2.0 }
    ], body))

    // The pump body behind it, a little lower.
    group.add(this.loftMesh([
      { z: -length * 0.5, halfWidth: width * 0.46, yBottom: 0.52, yTop: 1.98 },
      { z: -length * 0.44, halfWidth: width / 2, yBottom: 0.48, yTop: 2.02 },
      { z: length * 0.18, halfWidth: width / 2, yBottom: 0.48, yTop: 2.02 }
    ], body))

    const glass = this.vehicleGlass()
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.84, 0.8, 0.08), glass)
    screen.position.set(0, 1.94, length * 0.47)
    screen.rotation.x = -0.16
    group.add(screen)
    for (const side of [1, -1]) {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, 0.6, length * 0.2), glass)
      pane.position.set(side * width * 0.48, 1.86, length * 0.32)
      group.add(pane)
    }

    // The aerial, stowed: what makes it a fire engine at fifty units.
    //
    // Rear-mounted, as in Mike's photographs - the turntable is at the BACK,
    // and the ladder lies forward from it over the cab and out past the
    // windscreen. It was a single box over the middle of the roof before,
    // which is where you would put it if you had never seen one. Built as the
    // same box truss the deployed aerial is, at the same width and depth, so
    // running it out does not swap one object for a different-looking one.
    const stowed = new THREE.Group()
    const steel = new THREE.MeshStandardMaterial({
      color: 0xd8d2c4, roughness: 0.6, metalness: 0.3, flatShading: true
    })

    const pivot = -length * LADDER_MOUNT_BACK
    const nose = length * 0.54
    const run = nose - pivot
    const halfW = LADDER_WIDTH / 2

    const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 1.5), body)
    pedestal.position.set(0, 2.15, pivot)
    stowed.add(pedestal)

    for (const side of [1, -1]) {
      for (const level of [0, LADDER_DEPTH]) {
        const chord = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.1, run), steel)
        chord.position.set(side * halfW, 2.42 + level, pivot + run / 2)
        stowed.add(chord)
      }
    }
    const bays = Math.max(2, Math.round(run / LADDER_BAY))
    for (let i = 0; i < bays; i++) {
      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(LADDER_WIDTH, 0.05, 0.05), steel)
      rung.position.set(0, 2.42, pivot + (i + 0.5) * (run / bays))
      stowed.add(rung)
    }

    group.add(stowed)
    // Hidden while the deployed aerial is out, or the truck carries two of
    // them - one lying on the roof and one in the air.
    group.userData.stowedLadder = stowed

    // Lockers down each side, with roller-shutter ribs.
    const lockerMat = new THREE.MeshStandardMaterial({
      color: PALETTE.carGrey, roughness: 0.55, metalness: 0.45, flatShading: true
    })
    for (const side of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const locker = new THREE.Mesh(
          new THREE.BoxGeometry(0.09, 0.78, length * 0.17), lockerMat)
        locker.position.set(side * (width / 2 + 0.02), 1.08,
          -length * 0.38 + i * length * 0.19)
        group.add(locker)
      }
    }

    // A hose reel and a monitor on the pump deck, because a flat red roof
    // behind the cab is the one place this truck had nothing at all.
    const reel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.3, 0.3, 0.36, 10), trim.chrome)
    reel.rotation.z = Math.PI / 2
    reel.position.set(0, 2.24, -length * 0.14)
    group.add(reel)

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    const wheels = this.addWheels(group, length, width, 0.6,
      { thickness: 0.42, atFront: 0.34, atRear: 0.29 })
    this.addWheelArches(group, wheels, 0.6, body, { tube: 0.08 })
    this.addRoadTrim(group, length, width,
      { body, bumperY: 0.66, grilleY: 1.1, mirrorY: 2.02, mirrorAt: 0.42,
        exhaust: false, sills: false })
    // On the CAB roof, not over the back.
    //
    // The cab's roof is at 2.4 and the pump body's at 2.0, and the beacons
    // were at 2.55 over the rear - hanging half a unit clear of the vehicle
    // in mid air. Every other emergency vehicle happened to have a flat back
    // at about the right height, so nobody noticed the number was a guess.
    group.userData.beacons = this.addBeacons(group, CAB_ROOF + 0.12, 0.7, length * 0.33)
    return group
  }

  /**
   * A bus: one long volume with the corners rounded off at both ends.
   *
   * Lofted rather than boxed because the whole difference between a bus and a
   * shipping container is that a bus's front and back tuck in and its roof
   * curves over. Twelve extra triangles buy all of it.
   */
  buildBus() {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.bus
    const width = TRAFFIC_WIDTHS.bus
    const trim = this.vehicleTrim()

    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.busBody, roughness: 0.45, metalness: 0.12, flatShading: true
    })
    group.userData.body = body

    const hw = width / 2
    group.add(this.loftMesh([
      { z: -length / 2, halfWidth: hw * 0.9, yBottom: 0.52, yTop: 2.66 },
      { z: -length * 0.44, halfWidth: hw, yBottom: 0.42, yTop: 2.76 },
      { z: length * 0.44, halfWidth: hw, yBottom: 0.42, yTop: 2.76 },
      { z: length / 2, halfWidth: hw * 0.9, yBottom: 0.52, yTop: 2.6 }
    ], body))

    // A roof cap, slightly proud, which is how a real bus's roof reads.
    group.add(this.loftMesh([
      { z: -length * 0.48, halfWidth: hw * 0.9, yBottom: 2.62, yTop: 2.82 },
      { z: -length * 0.42, halfWidth: hw * 0.98, yBottom: 2.7, yTop: 2.9 },
      { z: length * 0.42, halfWidth: hw * 0.98, yBottom: 2.7, yTop: 2.9 },
      { z: length * 0.48, halfWidth: hw * 0.9, yBottom: 2.62, yTop: 2.82 }
    ], new THREE.MeshStandardMaterial({
      color: PALETTE.busRoof, roughness: 0.8, flatShading: true
    })))

    const glass = this.vehicleGlass()

    // Windows as separate panes with pillars between them, which is what a
    // bus actually has - one long band was the single flattest thing on it.
    const panes = Math.max(4, Math.round((length - 2.4) / 1.5))
    const paneLength = (length - 2.6) / panes
    for (const side of [1, -1]) {
      for (let i = 0; i < panes; i++) {
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.95, paneLength * 0.86), glass)
        pane.position.set(side * (hw + 0.01), 2.1,
          -length / 2 + 1.3 + (i + 0.5) * paneLength)
        group.add(pane)
      }
    }
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.84, 1.1, 0.1), glass)
    screen.position.set(0, 2.02, length / 2 - 0.02)
    group.add(screen)
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.8, 0.9, 0.1), glass)
    back.position.set(0, 2.1, -length / 2 + 0.02)
    group.add(back)

    // A destination board over the windscreen. Lit at night like a window.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.6, 0.28, 0.06),
      new THREE.MeshStandardMaterial({
        color: 0x1d232b, roughness: 0.5,
        emissive: new THREE.Color(0xffd98a), emissiveIntensity: 0
      }))
    board.position.set(0, 2.62, length / 2 + 0.01)
    group.add(board)
    this.registerNightLight(board.material, 1.4)

    // Doors, on the kerb side. Lanes run on the right, so the kerb is to the
    // vehicle's right: -X, because the mesh faces +Z.
    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x39424d, roughness: 0.7, flatShading: true
    })
    for (const along of [length * 0.3, -length * 0.12]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.09, 1.86, 1.05), doorMat)
      door.position.set(-(hw + 0.02), 1.4, along)
      group.add(door)
      const doorGlass = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.8, 0.85), glass)
      doorGlass.position.set(-(hw + 0.05), 1.85, along)
      group.add(doorGlass)
    }

    // A skirt along the bottom, which hides where the wheels meet the body.
    for (const side of [1, -1]) {
      const skirt = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.34, length * 0.9), trim.trim)
      skirt.position.set(side * (hw + 0.01), 0.56, 0)
      group.add(skirt)
    }

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS.bus)
    const wheels = this.addWheels(group, length, width, 0.54,
      { thickness: 0.4, atFront: 0.36, atRear: 0.28 })
    this.addWheelArches(group, wheels, 0.54, body, { tube: 0.07 })
    return group
  }
  /**
   * Roof beacons. Returned so updateTraffic can flash them: red one side,
   * blue the other, alternating, which is what reads as a siren without any
   * sound.
   */
  addBeacons(group, height, spread, along = 0) {
    const beacons = []

    for (const [side, colour] of [[1, PALETTE.sirenRed], [-1, PALETTE.sirenBlue]]) {
      const material = new THREE.MeshStandardMaterial({
        color: colour, roughness: 0.4,
        emissive: new THREE.Color(colour), emissiveIntensity: 0
      })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.3), material)
      lamp.position.set(side * spread, height, along)
      group.add(lamp)
      beacons.push({ material, side })
    }

    return beacons
  }

  /** A shelter and a flag at each bus stop, on the pavement side. */
  createBusStops() {
    const postMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.8, metalness: 0.3, flatShading: true
    })
    const roofMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.3, metalness: 0.2,
      transparent: true, opacity: 0.55
    })

    for (const stop of this.busStops) {
      // The kerb is to the right of the direction of travel
      const fx = Math.sin(stop.heading)
      const fz = Math.cos(stop.heading)
      const sx = -fz
      const sz = fx

      // How far out the pavement starts, measured rather than assumed.
      //
      // A flat 4.6 was used before, from the LANE centre - but a lane sits a
      // quarter of the road's width off the road's centre line, so how far the
      // kerb is depends on the road, and on a wide one the shelter ended up in
      // the carriageway. From the road edge outwards there is no such doubt.
      const out = stop.kerb + SHELTER_SETBACK

      const x = stop.x - sx * out
      const z = stop.z - sz * out

      const post = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.11, 2.8, 7), postMat)
      const stopGround = this.groundAt(x, z)
      post.position.set(x, stopGround + 1.4, z)
      post.castShadow = true
      this.game.add(post)

      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.06), postMat)
      flag.position.set(x, stopGround + 2.65, z)
      flag.rotation.y = stop.heading
      this.game.add(flag)

      // A shelter behind it, set back off the kerb.
      //
      // 1.9 ACROSS the road and 3.6 ALONG it. The box was the other way round,
      // which put a shelter 3.6 wide broadside to the kerb and reaching a
      // metre and a half into the carriageway - the mesh is rotated by the
      // heading, so its local X is across the road, not along it.
      const bx = x - sx * SHELTER_DEPTH
      const bz = z - sz * SHELTER_DEPTH

      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.12, 3.6), roofMat)
      roof.position.set(bx, this.groundAt(bx, bz) + 2.5, bz)
      roof.rotation.y = stop.heading
      this.game.add(roof)

      for (const along of [1.6, -1.6]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.5, 0.1), postMat)
        leg.position.set(bx + fx * along, 1.25, bz + fz * along)
        this.game.add(leg)
      }

      // The stop's HEADING, not the stop. This read
      // `{ x: stop.x, z: stop.z }` - an object where a number goes - and
      // `facing + Math.PI` inside addBench quietly produced the string
      // "[object Object]3.141592653589793". Three.js took it, wrote NaN into
      // the group's matrix, and every bench at every bus stop in the world -
      // 184 meshes - ended up at no position at all. It renders as a dark
      // slab hanging in the sky, which is how it was eventually noticed:
      // photographing something else entirely.
      this.addBench(bx, bz, stop.heading)
    }
  }

  // -------------------------------------------------------------
  // Fire stations, police stations and hospitals
  // -------------------------------------------------------------

  /**
   * Each station: the building, its yard, and its bays.
   *
   * The layout put every one of these somewhere - the position, the way it
   * faces and where each bay is all come from getStations(). Nothing here
   * decides anything; it draws what was decided.
   */
  createStations() {
    this.garageDoors = []

    for (const station of this.stations) this.buildStation(station)
  }

  buildStation(station) {
    const look = STATION_LOOKS[station.kind]
    const height = look.height

    // Which way is "out towards the road": the station's own heading, which
    // is how the bays were laid out too.
    const fx = Math.sin(station.heading)
    const fz = Math.cos(station.heading)

    const group = new THREE.Group()
    group.position.set(station.x, this.groundAt(station.x, station.z), station.z)
    group.rotation.y = station.heading

    const wall = new THREE.MeshStandardMaterial({
      color: look.wall, roughness: 0.85, flatShading: true
    })
    const trim = new THREE.MeshStandardMaterial({
      color: look.trim, roughness: 0.6, flatShading: true
    })

    const half = station.width / 2
    const deep = station.depth / 2

    // The three walls that have no doors in them, plus the roof. The FRONT is
    // built separately below because a fire station's front is mostly opening
    // - a solid box there and the engine would drive through its own wall.
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(station.width, height, 0.6), wall)
    back.position.set(0, height / 2, -deep)
    group.add(back)

    for (const side of [1, -1]) {
      const flank = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, height, station.depth), wall)
      flank.position.set(side * half, height / 2, 0)
      group.add(flank)
    }

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(station.width + 0.8, 0.5, station.depth + 0.8), trim)
    roof.position.set(0, height, 0)
    group.add(roof)

    // Front wall. Openings where the bays are, piers between them.
    const doorWidth = station.doorWidth
    const doorHeight = station.garage ? 5.2 : 3.2
    const openings = station.garage
      ? station.bays.map((_, i) =>
          (i - (station.bayCount - 1) / 2) * station.bayWidth)
      : [0]

    this.buildStationFront(group, station, {
      wall, trim, height, half, deep, doorWidth, doorHeight, openings
    })

    // A lit sign over the door, and the roof-line band that tells the three
    // kinds apart from the far side of the island.
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(station.width + 0.9, 0.9, 0.3), trim)
    band.position.set(0, height - 1.2, deep + 0.35)
    group.add(band)

    // The signboard: the station's name and its badge, on one canvas.
    //
    // Where it goes is stationSignBoard()'s answer, not a number picked here.
    // A fire station has a strip of wall 1.3 units tall between its door head
    // and its roof band, and every other kind has three times that - a board
    // sized to look right on the hospital hangs across the opening the engine
    // drives out of.
    const board = stationSignBoard(station, height, doorHeight)
    if (board) {
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(board.width + 0.3, board.height + 0.25, 0.2),
        new THREE.MeshStandardMaterial({
          color: look.trim, roughness: 0.7, flatShading: true
        }))
      plate.position.set(0, board.y, deep + 0.36)
      group.add(plate)

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(board.width, board.height),
        this.stationSignMaterial(station.kind))
      sign.position.set(0, board.y, deep + 0.47)
      group.add(sign)
    }

    // A hospital keeps its cross as well. It is the one badge that has to
    // read from an angle the sign cannot be seen from - you look for a
    // hospital while driving towards it with a patient in the back.
    if (station.kind === 'hospital') {
      // RED. Mike: "The hospital currently has a white cross - can you turn
      // that red?"
      //
      // It is the right call for more than taste: white-on-pale-grey is the
      // one badge in this world you cannot read at a distance, and a hospital
      // is a thing you look for while driving towards it with a patient in the
      // back. The emissive stays the same colour as the paint so it reads red
      // after dark too, rather than washing back to white when it lights up.
      const cross = new THREE.MeshStandardMaterial({
        color: PALETTE.ambulanceStripe,
        emissive: new THREE.Color(PALETTE.ambulanceStripe),
        emissiveIntensity: 0.4,
        roughness: 0.6
      })
      // Half height rather than 0.62: the signboard now hangs under the roof
      // band, and at 0.62 the top arm of the cross ran into it.
      const at = height * 0.5
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.2), cross)
      bar.position.set(0, at, deep + 0.4)
      group.add(bar)
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.4, 0.2), cross)
      post.position.set(0, at, deep + 0.4)
      group.add(post)
      this.registerNightLight(cross, 1.2)
    }

    group.traverse((part) => {
      if (part.isMesh) { part.castShadow = true; part.receiveShadow = true }
    })
    this.game.add(group)

    // Solid to the player. One box for the building, minus the front strip so
    // a fire engine on the apron isn't sitting inside a collider.
    this.game.physics.createStaticBoxAt(
      station.x - fx * 0.9,
      this.groundAt(station.x, station.z) + height / 2,
      station.z - fz * 0.9,
      station.width, height, Math.max(1, station.depth - 1.8), station.heading)

    this.buildStationYard(station)
    station.mesh = group
  }

  /**
   * One signboard face: badge on the left, lettering beside it.
   *
   * Cached per kind. There are seven stations and three kinds, so drawing it
   * per station is four wasted canvases - and, more to the point, four extra
   * materials for registerNightLight to walk at dusk.
   *
   * Emissive from its own map, like the monorail station names: at night the
   * lettering and the badge light and the dark plate behind them does not,
   * which is what a real illuminated sign does. A flat emissive colour makes
   * the whole board glow like a lightbox.
   */
  stationSignMaterial(kind) {
    this._stationSigns = this._stationSigns || new Map()
    if (this._stationSigns.has(kind)) return this._stationSigns.get(kind)

    const look = STATION_LOOKS[kind] || STATION_LOOKS.fire

    const canvas = document.createElement('canvas')
    canvas.width = STATION_SIGN_W
    canvas.height = STATION_SIGN_H
    const ctx = canvas.getContext('2d')

    // The plate
    ctx.fillStyle = '#141a21'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    const accent = '#' + (look.sign || 0xffffff).toString(16).padStart(6, '0')
    ctx.fillStyle = accent
    ctx.fillRect(0, canvas.height - 12, canvas.width, 12)
    ctx.fillRect(0, 0, canvas.width, 6)

    // The badge, square, at the left-hand end
    const pad = 18
    const badgeSize = canvas.height - pad * 2
    this.drawStationBadge(
      ctx, look.badge, pad + badgeSize / 2, canvas.height / 2, badgeSize / 2,
      accent)

    // And the words in what is left. Measured and shrunk to fit rather than
    // set at a size that happens to suit 'POLICE': 'FIRE STATION' is twice as
    // long and would run off the end of the board.
    const from = pad * 2 + badgeSize
    const room = canvas.width - from - pad
    const text = (look.label || kind || '').toUpperCase()

    let size = 132
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    do {
      ctx.font = `bold ${size}px Helvetica, Arial, sans-serif`
      if (ctx.measureText(text).width <= room) break
      size -= 4
    } while (size > 40)

    ctx.fillStyle = 'rgba(255,255,255,0.96)'
    ctx.fillText(text, from + room / 2, canvas.height / 2 + 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 8

    const material = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.55,
      emissive: new THREE.Color(0xffffff), emissiveMap: texture,
      emissiveIntensity: 0
    })
    this.registerNightLight(material, 1.1)

    this._stationSigns.set(kind, material)
    return material
  }

  /**
   * The badges: a Maltese cross for the fire service, a shield for the
   * police, a plain cross for the hospital.
   *
   * Drawn as paths rather than modelled, because at the size a station sign
   * is read from the road the difference is invisible and the cost is not:
   * a Maltese cross is eight curves and would be a few hundred triangles
   * apiece across seven stations.
   */
  drawStationBadge(ctx, badge, cx, cy, r, accent) {
    ctx.save()
    ctx.translate(cx, cy)

    if (badge === 'shield') {
      // A shield, point down, with a star in it
      ctx.beginPath()
      ctx.moveTo(-r * 0.82, -r * 0.9)
      ctx.lineTo(r * 0.82, -r * 0.9)
      ctx.lineTo(r * 0.82, r * 0.1)
      ctx.quadraticCurveTo(r * 0.72, r * 0.78, 0, r)
      ctx.quadraticCurveTo(-r * 0.72, r * 0.78, -r * 0.82, r * 0.1)
      ctx.closePath()
      ctx.fillStyle = accent
      ctx.fill()

      ctx.beginPath()
      for (let i = 0; i < 10; i++) {
        const reach = i % 2 ? r * 0.22 : r * 0.52
        const angle = -Math.PI / 2 + (i * Math.PI) / 5
        const x = Math.cos(angle) * reach
        const y = Math.sin(angle) * reach - r * 0.08
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
      }
      ctx.closePath()
      ctx.fillStyle = '#141a21'
      ctx.fill()
      ctx.restore()
      return
    }

    if (badge === 'maltese') {
      // Four arms, each narrow at the centre and forked at the tip. One arm
      // drawn and rotated four times, so they cannot come out uneven.
      ctx.fillStyle = accent
      for (let arm = 0; arm < 4; arm++) {
        ctx.save()
        ctx.rotate((arm * Math.PI) / 2)
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(-r * 0.62, -r * 0.98)
        ctx.lineTo(-r * 0.2, -r * 0.72)
        ctx.lineTo(r * 0.2, -r * 0.72)
        ctx.lineTo(r * 0.62, -r * 0.98)
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }
      ctx.restore()
      return
    }

    if (badge === 'drop') {
      // A fuel drop: a circle with a point on top. Two arcs would do it, but
      // the point is what stops it reading as a full stop at sign size.
      ctx.fillStyle = accent
      ctx.beginPath()
      ctx.moveTo(0, -r)
      ctx.quadraticCurveTo(r * 0.78, -r * 0.1, r * 0.6, r * 0.32)
      ctx.arc(0, r * 0.32, r * 0.6, 0, Math.PI)
      ctx.quadraticCurveTo(-r * 0.78, -r * 0.1, 0, -r)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      return
    }

    // A plain cross, which is also the fallback: an unknown kind gets a mark
    // rather than a blank square where its badge should be.
    ctx.fillStyle = accent
    ctx.fillRect(-r * 0.9, -r * 0.28, r * 1.8, r * 0.56)
    ctx.fillRect(-r * 0.28, -r * 0.9, r * 0.56, r * 1.8)
    ctx.restore()
  }

  // -------------------------------------------------------------
  // Gas stations
  // -------------------------------------------------------------

  /**
   * Every gas station: forecourt, canopy, pumps, kiosk and the painted bay
   * outline you aim at.
   *
   * Where they are and how wide the bays sit comes from getFuelStations() in
   * the layout, like every other station. Nothing here decides anything; it
   * draws what was decided.
   */
  createFuelStations() {
    // Already sited in the constructor, so the towns could keep clear of them.
    // Asking again here would be harmless (it is cached) but would read as if
    // this were where the decision is made, and it is not.
    for (const station of this.fuelStations || []) this.buildFuelStation(station)
  }

  buildFuelStation(station) {
    const look = STATION_LOOKS.fuel
    const fx = Math.sin(station.heading)
    const fz = Math.cos(station.heading)

    // The bays sit in front of the kiosk; the canopy goes over them and the
    // forecourt under them. Derived from the bays rather than guessed, so if
    // the layout moves them the concrete follows.
    const bays = station.bays || []
    const out = bays.length
      ? bays.reduce((n, b) =>
          n + ((b.x - station.x) * fx + (b.z - station.z) * fz), 0) / bays.length
      : station.depth / 2 + 3

    // How big the concrete is and how far out it goes is the layout's
    // answer, not one picked here - fuelApron(), the same split and the same
    // reason as stationApron(). Sized in the renderer it ran out into the
    // carriageway, which is the white block Mike photographed.
    const yard = fuelApron(station)
    if (!yard) return

    const span = yard.width

    // --- The forecourt, following the ground ---
    //
    // pavedPatch, not a slab: the driveway taught this one the expensive way.
    // A level plate over ground that falls stands proud at its far end and
    // every long vehicle sinks into it.
    const padX = station.x + fx * yard.offset
    const padZ = station.z + fz * yard.offset
    this.pavedPatch(
      padX, padZ, yard.width, yard.depth, station.heading,
      SURFACE_PAVED + 0.02,
      new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.95
      }))

    const group = new THREE.Group()
    group.position.set(station.x, this.groundAt(station.x, station.z), station.z)
    group.rotation.y = station.heading

    const wall = new THREE.MeshStandardMaterial({
      color: look.wall, roughness: 0.85, flatShading: true
    })
    const trim = new THREE.MeshStandardMaterial({
      color: look.trim, roughness: 0.6, flatShading: true
    })

    // --- The kiosk ---
    const kiosk = new THREE.Mesh(
      new THREE.BoxGeometry(station.width, look.height, station.depth), wall)
    kiosk.position.set(0, look.height / 2, 0)
    group.add(kiosk)

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(station.width + 0.7, 0.45, station.depth + 0.7),
      new THREE.MeshStandardMaterial({
        color: look.trim, roughness: 0.6, flatShading: true
      }))
    roof.position.set(0, look.height, 0)
    group.add(roof)

    // A lit shopfront, so it reads as open after dark like the other shops
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.25, metalness: 0.35,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glassMat, 1.6)
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(station.width * 0.72, 2.4, 0.2), glassMat)
    glass.position.set(0, 1.5, station.depth / 2 + 0.05)
    group.add(glass)

    // --- The canopy over the pumps ---
    //
    // PALE, and smaller than the kiosk. Built in the station's own trim green
    // and a full four units deeper than this, it merged with the kiosk roof
    // into one 18x22 green rectangle that read as a warehouse from above -
    // the canopy was invisible as a separate thing, which is the one job it
    // has. A cream deck on a coloured fascia is what a real forecourt does
    // and it separates the two at any angle.
    const canopyDeep = station.depth - 1

    const canopy = new THREE.Mesh(
      new THREE.BoxGeometry(span, CANOPY_DEPTH, canopyDeep), wall)
    canopy.position.set(0, CANOPY_CLEAR + CANOPY_DEPTH * 1.5, out)
    group.add(canopy)

    const fascia = new THREE.Mesh(
      new THREE.BoxGeometry(span + 0.2, CANOPY_DEPTH, canopyDeep + 0.2), trim)
    fascia.position.set(0, CANOPY_CLEAR + CANOPY_DEPTH / 2, out)
    group.add(fascia)

    // The sign goes on the fascia, road side, where you can read it driving in
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(Math.min(8, span * 0.55), 1.7),
      this.stationSignMaterial('fuel'))
    sign.position.set(0, CANOPY_CLEAR + CANOPY_DEPTH / 2,
                      out + canopyDeep / 2 + 0.17)
    group.add(sign)

    // Columns at the back corners only. A column in front of a bay is a
    // column you drive into on the way in, and the canopy is a box - it does
    // not need four legs to look held up.
    for (const side of [1, -1]) {
      const column = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, CANOPY_CLEAR, 0.5), trim)
      column.position.set(side * (span / 2), CANOPY_CLEAR / 2,
                          out - canopyDeep / 2 + 0.6)
      group.add(column)

      this.game.physics.createStaticBoxAt(
        station.x + fx * (out - canopyDeep / 2 + 0.6)
                  - fz * side * (span / 2),
        this.groundAt(station.x, station.z) + CANOPY_CLEAR / 2,
        station.z + fz * (out - canopyDeep / 2 + 0.6)
                  + fx * side * (span / 2),
        0.5, CANOPY_CLEAR, 0.5, station.heading)
    }

    // --- A pump beside each bay ---
    const pumpMat = new THREE.MeshStandardMaterial({
      color: 0xe8e4dc, roughness: 0.6, flatShading: true
    })
    const faceMat = new THREE.MeshStandardMaterial({
      color: look.sign, emissive: new THREE.Color(look.sign),
      emissiveIntensity: 0.3, roughness: 0.5
    })
    this.registerNightLight(faceMat, 1.1)

    this.fuelPumps = this.fuelPumps || []

    bays.forEach((bay, i) => {
      // Beside the bay, towards the middle of the forecourt, so the hose
      // reaches the vehicle without the pump standing where a wheel goes.
      const side = i < bays.length / 2 ? 1 : -1
      const across = (bay.x - station.x) * -fz + (bay.z - station.z) * fx
      const px = across + side * (station.bayWidth / 2 - 0.9)

      const island = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.25, 3.4), trim)
      island.position.set(px, 0.12, out)
      group.add(island)

      const pump = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, PUMP_HEIGHT, 1.1), pumpMat)
      pump.position.set(px, 0.25 + PUMP_HEIGHT / 2, out)
      group.add(pump)

      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.55, 0.7), faceMat)
      face.position.set(px - side * 0.39, 0.25 + PUMP_HEIGHT * 0.72, out)
      face.rotation.y = -side * Math.PI / 2
      group.add(face)

      // Where the attendant stands and where the hose starts. Kept in WORLD
      // coordinates, because stage two walks a figure to it and a figure is
      // not in this group.
      this.fuelPumps.push({
        station: station.id,
        bay: bay.index,
        x: station.x - fz * px + fx * out,
        z: station.z + fx * px + fz * out
      })

      this.paintBayOutline(bay, station)
    })

    group.traverse((part) => {
      if (part.isMesh) { part.castShadow = true; part.receiveShadow = true }
    })
    this.game.add(group)

    // The kiosk is solid; the forecourt is not, or you could not drive on it.
    this.game.physics.createStaticBoxAt(
      station.x, this.groundAt(station.x, station.z) + look.height / 2,
      station.z, station.width, look.height, station.depth, station.heading)

    this.addLightPool(padX, padZ, span, 0.85)
    station.mesh = group
  }

  /**
   * The outline you drive into, painted on the forecourt.
   *
   * Four thin strips and a chevron rather than a filled shape, so it reads as
   * paint and not as a slab - the same trick the emergency stations' bay
   * boxes use. Sized to the LONGEST vehicle, because the bus has to fit the
   * same bay a sedan does and a box that fits a sedan is a box the bus parks
   * halfway out of.
   *
   * Every strip asks the ground its own height. A single quad across eleven
   * units of falling ground is the flat-slab mistake again, in miniature.
   */
  paintBayOutline(bay, station) {
    const paint = this.fuelPaint = this.fuelPaint ||
      new THREE.MeshStandardMaterial({ color: 0xf4efd6, roughness: 0.9 })

    const long = TRAFFIC_LENGTHS.bus + 1.5
    const wide = Math.min(station.bayWidth - 1.6, 3.4)
    const bx = Math.sin(bay.heading)
    const bz = Math.cos(bay.heading)
    const sx = -bz
    const sz = bx

    const strip = (cx, cz, w, d, turn) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paint)
      mesh.rotation.x = -Math.PI / 2
      mesh.rotation.z = -turn
      mesh.position.set(cx, this.groundAt(cx, cz) + SURFACE_PAVED + 0.05, cz)
      this.game.add(mesh)
    }

    // The two long sides
    for (const side of [1, -1]) {
      strip(bay.x + sx * side * wide / 2, bay.z + sz * side * wide / 2,
            0.18, long, bay.heading)
    }
    // And the back of the box
    strip(bay.x - bx * long / 2, bay.z - bz * long / 2, wide, 0.18, bay.heading)

    // A chevron at the head, pointing the way in - which is the one thing a
    // plain rectangle cannot tell you.
    for (const side of [1, -1]) {
      const cx = bay.x + bx * (long / 2 - 0.8) + sx * side * wide * 0.25
      const cz = bay.z + bz * (long / 2 - 0.8) + sz * side * wide * 0.25
      strip(cx, cz, 0.18, 1.8, bay.heading + side * 0.6)
    }
  }

  /**
   * The front wall: piers between the openings, a lintel over them, and a
   * door in each opening.
   *
   * The openings are the bay spacing, so a fire engine drives through the
   * middle of one with two units of clear air on each side. Getting that from
   * the same numbers the bays came from is the whole point - a door width
   * picked by eye is a door the engine catches on.
   */
  buildStationFront(group, station, o) {
    const { wall, trim, height, half, deep, doorWidth, doorHeight } = o

    // Where the wall is solid: the gaps between and beside the openings
    const edges = [-half]
    for (const at of o.openings) {
      edges.push(at - doorWidth / 2, at + doorWidth / 2)
    }
    edges.push(half)

    for (let i = 0; i < edges.length; i += 2) {
      const from = edges[i]
      const to = edges[i + 1]
      const span = to - from
      if (span <= 0.05) continue

      const pier = new THREE.Mesh(
        new THREE.BoxGeometry(span, height, 0.6), wall)
      pier.position.set((from + to) / 2, height / 2, deep)
      group.add(pier)
    }

    // The lintel across the whole front, above the openings
    const lintelHeight = height - doorHeight
    if (lintelHeight > 0.2) {
      const lintel = new THREE.Mesh(
        new THREE.BoxGeometry(station.width, lintelHeight, 0.6), wall)
      lintel.position.set(0, doorHeight + lintelHeight / 2, deep)
      group.add(lintel)
    }

    // The doors. Each one slides up into the lintel when its own vehicle is
    // coming or going - see updateGarageDoors().
    const doorMat = new THREE.MeshStandardMaterial({
      color: STATION_LOOKS[station.kind].door, roughness: 0.55,
      metalness: 0.35, flatShading: true
    })

    o.openings.forEach((at, index) => {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(doorWidth - 0.2, doorHeight, 0.22), doorMat)
      door.position.set(at, doorHeight / 2, deep + 0.05)
      group.add(door)

      this.garageDoors.push({
        mesh: door, station, bay: index,
        shut: doorHeight / 2, height: doorHeight, open: 0
      })
    })
  }

  /** The hard standing in front, and a painted box for each bay. */
  buildStationYard(station) {
    const fx = Math.sin(station.heading)
    const fz = Math.cos(station.heading)

    // From the front wall out to just short of the pavement - and this time
    // it really does stop short of it. See stationApron(): the old slab was
    // STATION_SETBACK - 2 deep and station.width + 4 across, which covered
    // the pavement, reached the kerb and hung two units over the plot on each
    // side. Because it is also drawn a third of a unit above the road, the
    // overlap read as a pale shelf standing over the tarmac.
    const yard = stationApron(station)
    if (!yard) return

    // Laid on the ground rather than over it - see pavedPatch(). Still above
    // the grass cap, because the apron is a raised forecourt and does not
    // claim the ground beneath it; what has changed is that "above the grass
    // cap" is now measured at every point of it instead of once at its middle.
    const apronX = station.x + fx * yard.offset
    const apronZ = station.z + fz * yard.offset
    this.pavedPatch(
      apronX, apronZ, yard.width, yard.depth, station.heading,
      GRASS_ABOVE_SAND + 0.05,
      new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.95
      }))

    const paint = new THREE.MeshStandardMaterial({
      color: 0xf2e9c8, roughness: 0.9
    })

    for (const bay of station.bays) {
      // A box round the bay itself, drawn as four thin strips so it reads as
      // markings rather than a slab
      const long = 7.5
      const wide = station.bayWidth - 1.2
      const bx = Math.sin(bay.heading)
      const bz = Math.cos(bay.heading)
      const sx = -bz
      const sz = bx

      for (const side of [1, -1]) {
        const line = new THREE.Mesh(
          new THREE.PlaneGeometry(0.2, long), paint)
        line.rotation.x = -Math.PI / 2
        line.rotation.z = -bay.heading
        const lineX = bay.x + sx * side * wide / 2
        const lineZ = bay.z + sz * side * wide / 2
        line.position.set(
          lineX, this.groundAt(lineX, lineZ) + GRASS_ABOVE_SAND + 0.07, lineZ)
        this.game.add(line)
      }

      const end = new THREE.Mesh(new THREE.PlaneGeometry(wide, 0.2), paint)
      end.rotation.x = -Math.PI / 2
      end.rotation.z = -bay.heading
      const endX = bay.x - bx * long / 2
      const endZ = bay.z - bz * long / 2
      end.position.set(
        endX, this.groundAt(endX, endZ) + GRASS_ABOVE_SAND + 0.07, endZ)
      this.game.add(end)
    }
  }

  /**
   * Doors up when a vehicle is on its way in or out, down once it is settled.
   *
   * Driven by the vehicle's own parking state, so a door is never open on an
   * empty bay and never shut on an engine halfway through it.
   */
  updateGarageDoors(delta) {
    if (!this.garageDoors || !this.garageDoors.length) return

    const wants = new Set()

    for (const v of this.traffic) {
      if (!v.home) continue
      // Moving on the bay path, or on the last stretch of road before it
      const onTheMove = v.parking
        ? v.parking.phase !== 'waiting'
        : v.why === 'turning in'
      if (onTheMove) wants.add(v.home.station.id + ':' + v.home.bay.index)
    }

    for (const door of this.garageDoors) {
      const target = wants.has(door.station.id + ':' + door.bay) ? 1 : 0
      const rate = delta / GARAGE_DOOR_TIME

      door.open += Math.sign(target - door.open) *
        Math.min(rate, Math.abs(target - door.open))
      door.mesh.position.y = door.shut + door.open * door.height
    }
  }

  /**
   * Something hit the player. Make a noise about it.
   *
   * Split out from updateTraffic() so the impact and the reaction to it are
   * separable: the physics half is tested through islandLayout, and this is the
   * part that only makes sense with a browser attached.
   *
   * The force is the closing speed against the fastest anything in this world
   * closes at - two vehicles head-on at their own top speeds - so a scrape is
   * quiet and a proper shunt is not.
   */
  onImpact(impact) {
    // A sustained push is not a crash, and sounding one thirty times a second
    // is a buzz rather than a bang.
    if (impact.sustained) return
    const audio = this.game.audio
    if (audio && audio.thud) audio.thud(Math.min(1, impact.closing / 26))
  }

  /**
   * Drive the traffic, then move the meshes and the colliders to match.
   *
   * The simulation is stepTraffic() in islandLayout.js, for the usual reason:
   * World.js needs a browser, so the tests can only read it, and the traffic
   * rules are the part with logic in them.
   */
  updateTraffic(delta) {
    if (!this.traffic || !this.traffic.length) return

    // Where the player is, so the traffic gives way to it rather than
    // shunting it along the road.
    //
    // AND WHAT IT IS DOING, which is new. This used to be a bare `{ x, z }` -
    // a point to queue behind - and an impact needs a heading, a speed and a
    // kind before it can work out who wins. See `bumpPlayer()` in
    // islandLayout.js, which still accepts the bare point and does nothing
    // with it, so every test that passes one keeps working.
    const vehicle = this.game.vehicle
    const car = vehicle && vehicle.mesh
    const player = car ? {
      x: car.position.x,
      z: car.position.z,
      heading: vehicle.heading,
      speed: vehicle.getSpeed ? vehicle.getSpeed() : 0,
      kind: vehicle.kind
    } : null

    stepTraffic(this.lanes, this.traffic, delta, this.elapsed, player,
                this.roadIncident)

    // THE PLAYER'S HALF OF THE HIT.
    //
    // Mike: "whenever a car hits me, I sometimes go flying... Can we make this
    // go both ways so that any car hitting another car will make both cars
    // react?" The traffic's half was applied inside stepTraffic as a knock; the
    // player is a real dynamic body, so its half is applied here, through the
    // vehicle's own model rather than as a raw impulse - see applyImpact().
    if (player && player.impact && vehicle.applyImpact) {
      vehicle.applyImpact(player.impact.dvx, player.impact.dvz)
      this.onImpact(player.impact)
    }

    // One flash cycle for the whole city, so the emergency lights beat
    // together rather than each one drifting
    const beat = sirenBeat(this.elapsed, SIREN_RATE)

    // How dark it is, worked out once for the whole fleet rather than a
    // hundred times. Weather as well as night: the traffic used to light up
    // at dusk only, so a storm at two in the afternoon left every car on the
    // road dark while the player's headlights were on.
    const gloom = gloomLevel(this.game.environment)

    for (const v of this.traffic) {
      const at = trafficPosition(this.lanes, v)

      // Turned towards, not set to. A vehicle on a short lane can change
      // direction sharply at a junction, and snapping the heading makes it
      // pirouette.
      //
      // AN EASE AND A CAP, not a cap alone. A pure rate limiter chasing a
      // target that steps produces a heading that slews at exactly the maximum
      // rate and then stops dead the instant it catches up - a constant-speed
      // rotation with a corner at each end, which is the "jagged turn" Mike
      // described even though nothing was actually snapping.
      //
      // The other half of that fix is upstream: `pointAlong()` now sweeps the
      // heading through a bend instead of holding each segment's bearing and
      // jumping at the vertex, so on an ordinary corner the target no longer
      // steps at all and the limiter never binds. What is left for this to
      // handle is the genuine discontinuity at a JUNCTION, where the vehicle
      // leaves one lane and appears on another at a real angle to it.
      let turn = at.heading - v.heading
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      const eased = turn * Math.min(1, delta / TRAFFIC_TURN_EASE)
      const rate = TRAFFIC_TURN_RATE * delta
      v.heading += Math.max(-rate, Math.min(rate, eased))

      // And the POSITION is eased too, which is the actual fix for jagged
      // turns.
      //
      // A car turning at a junction moves from one road's right-hand lane to
      // another's, and those two lanes are up to 3.6 units apart at the
      // corner - so the simulated position jumps sideways in a single frame,
      // and no amount of heading smoothing hides that. Easing it over about a
      // tenth of a second turns the step into the curve the car should have
      // driven.
      //
      // Tapering the lanes together in the layout was tried first and halved
      // the traffic: converging lanes put oncoming cars nose to nose at every
      // junction. This is the cosmetic problem it always was, fixed in the
      // cosmetic layer.
      if (v.drawn) {
        const k = 1 - Math.exp(-delta / TRAFFIC_SMOOTHING)
        v.drawn.x += (at.x - v.drawn.x) * k
        v.drawn.z += (at.z - v.drawn.z) * k

        // Unless it has been picked up and put down somewhere else, in which
        // case easing would draw it flying across the island.
        if (Math.hypot(at.x - v.drawn.x, at.z - v.drawn.z) > 20) {
          v.drawn.x = at.x
          v.drawn.z = at.z
        }
      } else {
        v.drawn = { x: at.x, z: at.z }
      }

      // On the ground, and pitched to it. The road corridor is level across
      // its width, so a vehicle only ever tips along its own length - which is
      // why one pitch angle is enough and no roll is needed.
      const ground = this.groundAt(v.drawn.x, v.drawn.z)
      const ahead = this.groundAt(
        v.drawn.x + Math.sin(v.heading) * 2,
        v.drawn.z + Math.cos(v.heading) * 2)

      v.mesh.position.set(v.drawn.x, ground, v.drawn.z)
      v.mesh.rotation.set(-Math.atan2(ahead - ground, 2), v.heading, 0, 'YXZ')

      // The collider follows the DRAWN position, not the simulated one, or you
      // could bump a car that isn't where you can see it.
      if (v.body) {
        this.game.physics.moveKinematic(v.body, v.drawn.x,
          ground + TRAFFIC_HEIGHTS[v.kind] / 2, v.drawn.z, v.heading)
      }

      // Every lamp on the vehicle, from the same function the player's car
      // uses. Brake lights are most of what makes traffic look like traffic;
      // the indicators are the rest of it, and they show the turn the
      // simulation has actually committed to rather than a guess at it.
      const lights = v.mesh.userData.lights
      if (lights) {
        const level = lampBrightness({
          gloom,
          braking: v.speed >= 0.5 && v.why !== 'cruise',
          stopped: v.speed < 0.5,
          indicate: v.signal || 0,
          blink: blinkOn(this.elapsed, v.blinkPhase || 0)
        })
        lights.head.emissiveIntensity = level.head
        lights.tail.emissiveIntensity = level.tail
        lights.left.emissiveIntensity = level.left
        lights.right.emissiveIntensity = level.right
      }

      if (v.mesh.userData.beacons) {
        for (const beacon of v.mesh.userData.beacons) {
          const on = (beacon.side === 1) === beat
          beacon.material.emissiveIntensity = on ? 2.4 : 0.05
        }
      }
    }
  }

  // -------------------------------------------------------------
  // Harbours
  // -------------------------------------------------------------

  /**
   * A quay per island: a solid deck out over the water with the port road
   * running along it, bollards down both edges, and cranes and sheds at the
   * two big ones.
   *
   * The deck is a collider, unlike the monorail beam - you can drive out to
   * the end of it, which is the whole point of a pier. There are no railings
   * for the same reason there are none on a real quay: the edge is the edge.
   */
  createPorts() {
    for (const port of this.ports) this.buildPort(port)
  }

  buildPort(port) {
    const deckMat = new THREE.MeshStandardMaterial({
      color: PALETTE.quay, roughness: 0.92, metalness: 0.04, flatShading: true
    })
    const edgeMat = new THREE.MeshStandardMaterial({
      color: PALETTE.quayEdge, roughness: 0.95, flatShading: true
    })

    const fx = port.dirX
    const fz = port.dirZ
    const sx = -fz
    const sz = fx

    // The deck. Sits just above the water with its underside below it, so
    // there's no gap to see through at the waterline.
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(port.width, PIER_DECK_DEPTH, port.length), deckMat)
    deck.position.set(port.mid.x, PIER_DECK_Y - PIER_DECK_DEPTH / 2, port.mid.z)
    deck.rotation.y = port.rotationY
    deck.castShadow = true
    deck.receiveShadow = true
    this.game.add(deck)

    this.game.physics.createStaticBoxAt(
      port.mid.x, PIER_DECK_Y - PIER_DECK_DEPTH / 2, port.mid.z,
      port.width, PIER_DECK_DEPTH, port.length, port.rotationY)

    // A rubbing strip along each edge, which is what stops the deck reading
    // as a plain slab from the water
    for (const side of [1, -1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.55, port.length), edgeMat)
      strip.position.set(
        port.mid.x + sx * (port.width / 2 - 0.25),
        PIER_DECK_Y + 0.1,
        port.mid.z + sz * (port.width / 2 - 0.25))
      strip.rotation.y = port.rotationY
      this.game.add(strip)
    }

    // Bollards. Spaced along both edges, inside the rubbing strip.
    const bollardMat = new THREE.MeshStandardMaterial({
      color: PALETTE.bollard, roughness: 0.7, metalness: 0.35, flatShading: true
    })
    const spacing = port.big ? 9 : 7
    const count = Math.max(2, Math.floor(port.length / spacing))

    for (let i = 0; i <= count; i++) {
      const along = -port.length / 2 + (port.length * i) / count
      for (const side of [1, -1]) {
        const bx = port.mid.x + fx * along + sx * (port.width / 2 - 1.3)
        const bz = port.mid.z + fz * along + sz * (port.width / 2 - 1.3)
        const bollard = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.42, 1.1, 8), bollardMat)
        bollard.position.set(bx, PIER_DECK_Y + 0.55, bz)
        bollard.castShadow = true
        this.game.add(bollard)
      }
    }

    // Lighting, so the quay is somewhere you'd go after dark
    for (let i = 0; i <= count; i += 2) {
      const along = -port.length / 2 + (port.length * i) / count
      const lx = port.mid.x + fx * along + sx * (port.width / 2 - 0.9)
      const lz = port.mid.z + fz * along + sz * (port.width / 2 - 0.9)
      this.addStreetlight(lx, lz, { x: port.mid.x + fx * along, z: port.mid.z + fz * along })
    }

    if (port.big) this.buildCargoTerminal(port)
    else this.buildFishingJetty(port)
  }

  /** Cranes and a shed. What makes a big port read as a big port. */
  buildCargoTerminal(port) {
    const fx = port.dirX
    const fz = port.dirZ
    const sx = -fz
    const sz = fx

    const craneMat = new THREE.MeshStandardMaterial({
      color: PALETTE.crane, roughness: 0.6, metalness: 0.3, flatShading: true
    })
    const legMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.9, flatShading: true
    })

    // Two gantry cranes, straddling the deck, along the seaward half
    for (const frac of [0.42, 0.74]) {
      const along = -port.length / 2 + port.length * frac
      const cx = port.mid.x + fx * along
      const cz = port.mid.z + fz * along
      // On the deck, not beside it. At 0.62 of the width the legs stood a
      // unit and a half outside a 13-wide pier - in the water, holding up
      // nothing.
      const legSpan = port.width * 0.36
      const height = 17

      for (const side of [1, -1]) {
        const leg = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, height, 0.8), legMat)
        leg.position.set(cx + sx * legSpan * side, height / 2, cz + sz * legSpan * side)
        leg.rotation.y = port.rotationY
        leg.castShadow = true
        this.game.add(leg)

        this.game.physics.createStaticBoxAt(
          cx + sx * legSpan * side, height / 2, cz + sz * legSpan * side,
          0.9, height, 0.9, port.rotationY)
      }

      // The gantry across the top, and the jib reaching out over the water
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(legSpan * 2 + 2, 1.3, 2.4), craneMat)
      beam.position.set(cx, height + 0.65, cz)
      beam.rotation.y = port.rotationY
      beam.castShadow = true
      this.game.add(beam)

      const jib = new THREE.Mesh(new THREE.BoxGeometry(16, 0.8, 1.4), craneMat)
      jib.position.set(
        cx + sx * (legSpan + 7), height + 0.3, cz + sz * (legSpan + 7))
      jib.rotation.y = port.rotationY
      jib.castShadow = true
      this.game.add(jib)
    }

    // The yard: a shed and stacked containers, on ground the layout has
    // measured as clear. It used to be placed by dead reckoning from the pier
    // root, which put a 22-unit concrete shed across the coast road and out
    // onto the beach on EXPERIENCE. If nothing fits, nothing is built.
    const yard = getPortYard(port)

    if (yard.shed) {
      const shedMat = new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.9, flatShading: true
      })
      const shed = new THREE.Mesh(
        new THREE.BoxGeometry(yard.shed.width, 8, yard.shed.depth), shedMat)
      shed.position.set(
        yard.shed.x, this.groundAt(yard.shed.x, yard.shed.z) + 4, yard.shed.z)
      shed.rotation.y = yard.shed.heading
      shed.castShadow = true
      shed.receiveShadow = true
      this.game.add(shed)

      this.game.physics.createStaticBoxAt(
        yard.shed.x, this.groundAt(yard.shed.x, yard.shed.z) + 4, yard.shed.z,
        yard.shed.width, 8, yard.shed.depth, yard.shed.heading)
    }

    // Sizes from the layout, which is what tested the ground they stand on.
    const colours = [PALETTE.container, PALETTE.containerAlt, PALETTE.containerRust]
    for (const box of yard.containers) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(CONTAINER_LONG, CONTAINER_LIFT - 0.05, CONTAINER_WIDE),
        new THREE.MeshStandardMaterial({
          color: this.pick(colours), roughness: 0.85, flatShading: true
        }))
      crate.position.set(
        box.x, CONTAINER_LIFT / 2 + box.level * CONTAINER_LIFT, box.z)
      crate.rotation.y = box.heading
      crate.castShadow = true
      crate.receiveShadow = true
      this.game.add(crate)

      // Only the bottom of a stack needs a collider - you cannot drive into
      // the one above it without going through the one below.
      if (box.level === 0) {
        this.game.physics.createStaticBoxAt(
          box.x, CONTAINER_LIFT / 2, box.z,
          CONTAINER_LONG, CONTAINER_LIFT, CONTAINER_WIDE, box.heading)
      }
    }
  }

  /** A jetty's worth of clutter: crates, pots, a hut. */
  buildFishingJetty(port) {
    const fx = port.dirX
    const fz = port.dirZ
    const sx = -fz
    const sz = fx

    const hutX = port.mid.x - fx * (port.length / 2 + 6) + sx * (port.width / 2 + 5)
    const hutZ = port.mid.z - fz * (port.length / 2 + 6) + sz * (port.width / 2 + 5)
    this.addHut(hutX, hutZ)

    const crateMat = new THREE.MeshStandardMaterial({
      color: PALETTE.timber, roughness: 0.95, flatShading: true
    })
    for (let i = 0; i < 8; i++) {
      const along = this.randRange(-port.length / 2 + 3, port.length / 2 - 6)
      const across = (port.width / 2 - this.randRange(2.4, 3.4)) * (this.rand() < 0.5 ? 1 : -1)
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.1, 1.5), crateMat)
      crate.position.set(
        port.mid.x + fx * along + sx * across,
        PIER_DECK_Y + 0.55,
        port.mid.z + fz * along + sz * across)
      crate.rotation.y = port.rotationY + this.rand() * 0.6
      crate.castShadow = true
      this.game.add(crate)
    }
  }

  /**
   * The player's garage, on the hub.
   *
   * Where it stands is decided in islandLayout.js - clear of the fountain, off
   * the roads, facing the way out - so a test can check it. This draws it.
   */
  createPlayerGarage() {
    const garage = getPlayerGarage()
    this.playerGarage = garage
    if (!garage) return

    const ground = this.groundAt(garage.x, garage.z)
    const wallMat = new THREE.MeshStandardMaterial({
      color: PALETTE.wallCream, roughness: 0.85, flatShading: true
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roofDark, roughness: 0.8, flatShading: true
    })
    const doorMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.6, metalness: 0.3, flatShading: true
    })

    const fx = Math.sin(garage.heading)
    const fz = Math.cos(garage.heading)
    const sx = Math.cos(garage.heading)
    const sz = -Math.sin(garage.heading)

    // Three walls and a roof. The front is left open except for the piers
    // either side of the door, the same way a fire station's front is built.
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(garage.width, GARAGE_HEIGHT, 0.6), wallMat)
    back.position.set(garage.x - fx * garage.depth / 2,
                      ground + GARAGE_HEIGHT / 2,
                      garage.z - fz * garage.depth / 2)
    back.rotation.y = garage.heading
    back.castShadow = true
    this.game.add(back)

    for (const side of [1, -1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, GARAGE_HEIGHT, garage.depth), wallMat)
      wall.position.set(garage.x + sx * (garage.width / 2) * side,
                        ground + GARAGE_HEIGHT / 2,
                        garage.z + sz * (garage.width / 2) * side)
      wall.rotation.y = garage.heading
      wall.castShadow = true
      this.game.add(wall)
    }

    // The piers either side of the opening. Their width follows from the door
    // width, so the opening is what the layout says it is.
    const pier = (garage.width - garage.doorWidth) / 2
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(pier, GARAGE_HEIGHT, 0.6), wallMat)
      post.position.set(
        garage.x + fx * garage.depth / 2 + sx * (garage.doorWidth / 2 + pier / 2) * side,
        ground + GARAGE_HEIGHT / 2,
        garage.z + fz * garage.depth / 2 + sz * (garage.doorWidth / 2 + pier / 2) * side)
      post.rotation.y = garage.heading
      post.castShadow = true
      this.game.add(post)
    }

    // Lintel over the opening, and a roof.
    const lintel = new THREE.Mesh(
      new THREE.BoxGeometry(garage.doorWidth + 0.4, 1.4, 0.6), doorMat)
    lintel.position.set(garage.x + fx * garage.depth / 2,
                        ground + GARAGE_HEIGHT - 0.7,
                        garage.z + fz * garage.depth / 2)
    lintel.rotation.y = garage.heading
    this.game.add(lintel)

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(garage.width + 1, 0.7, garage.depth + 1), trimMat)
    roof.position.set(garage.x, ground + GARAGE_HEIGHT + 0.35, garage.z)
    roof.rotation.y = garage.heading
    roof.castShadow = true
    this.game.add(roof)

    // --- The door ---
    //
    // Mike: "I want the player garage to have a garage door that opens and
    // closes as my vehicle enters and exits the garage."
    //
    // A roller shutter, because it is the only kind that does not need
    // somewhere to swing to: it rises into the lintel, so it can never hit
    // the vehicle that is triggering it, which a hinged or up-and-over door
    // sitting across a bay this size absolutely could.
    //
    // It is drawn as slats and it is SCALED rather than rebuilt to open, with
    // the geometry anchored at its top edge so scaling shortens it upwards -
    // a box scaled about its middle would sink into the ground as it rose.
    const doorHeight = GARAGE_HEIGHT - 1.4
    const shutter = new THREE.Group()
    shutter.position.set(garage.x + fx * (garage.depth / 2 + 0.12),
                         ground + GARAGE_HEIGHT - 1.4,
                         garage.z + fz * (garage.depth / 2 + 0.12))
    shutter.rotation.y = garage.heading
    const slats = 9
    const slatMat = new THREE.MeshStandardMaterial({
      color: 0xb9c0c8, roughness: 0.55, metalness: 0.45, flatShading: true
    })
    for (let i = 0; i < slats; i++) {
      const slat = new THREE.Mesh(
        new THREE.BoxGeometry(garage.doorWidth, doorHeight / slats - 0.04, 0.16),
        i % 2 ? slatMat : doorMat)
      slat.position.y = -(i + 0.5) * (doorHeight / slats)
      slat.castShadow = true
      shutter.add(slat)
    }
    // A handle bar along the bottom, so which way it moves is readable.
    const pull = new THREE.Mesh(
      new THREE.BoxGeometry(garage.doorWidth * 0.9, 0.18, 0.24), doorMat)
    pull.position.y = -doorHeight + 0.09
    shutter.add(pull)

    this.game.add(shutter)
    this.garageDoor = { group: shutter, height: doorHeight, open: 0, ground }

    // Solid, but only the walls - you have to be able to drive out of the
    // front. Three boxes rather than one, for exactly that reason.
    this.game.physics.createStaticBoxAt(
      garage.x - fx * garage.depth / 2, ground + GARAGE_HEIGHT / 2,
      garage.z - fz * garage.depth / 2,
      garage.width, GARAGE_HEIGHT, 0.6, garage.heading)

    for (const side of [1, -1]) {
      this.game.physics.createStaticBoxAt(
        garage.x + sx * (garage.width / 2) * side, ground + GARAGE_HEIGHT / 2,
        garage.z + sz * (garage.width / 2) * side,
        0.6, GARAGE_HEIGHT, garage.depth, garage.heading)
    }

    // An apron in front, so the way out reads as a driveway rather than grass.
    //
    // Draped on the surface, not a flat slab. The ground here falls about
    // 0.4 from the garage to the road - the driveway fix ramped it rather
    // than levelling it - and a level slab set at the garage's height stood
    // up to 0.47 over the collider at its far end. Every vehicle sank into
    // it, and the long ones (fire engine, bus) most visibly.
    const apronLength = Math.hypot(garage.apron.x - garage.x, garage.apron.z - garage.z)
    const apronGeometry = new THREE.PlaneGeometry(
      garage.doorWidth + 4, apronLength, 6, Math.ceil(apronLength))
    apronGeometry.rotateX(-Math.PI / 2)
    apronGeometry.rotateY(garage.heading)
    apronGeometry.translate((garage.x + garage.apron.x) / 2, 0,
                            (garage.z + garage.apron.z) / 2)
    const apron = new THREE.Mesh(
      this.drapeOnSurface(apronGeometry),
      new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.95, flatShading: true,
        // Over the plaza where the two overlap, at the same clearance.
        polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
      }))
    apron.receiveShadow = true
    this.game.add(apron)
  }

  // -------------------------------------------------------------
  // The airport
  // -------------------------------------------------------------

  /**
   * The platform, its piles, the runway and the terminal.
   *
   * Every piece is placed from the layout in islandLayout.js rather than
   * measured out here, for the reason that file gives: World.js needs a
   * browser, so nothing in it can be run by a test. The geometry that has to
   * be RIGHT - where the platform sits, whether its corners are in open
   * water, whether a stand overlaps the runway - is decided where a test can
   * check it. This draws what it is told.
   */
  createAirport() {
    const air = getAirport()
    this.airport = air
    if (!air) return

    const deckY = PIER_DECK_Y
    const along = air.along
    const across = air.across

    const at = (a, c, y = deckY) => ({
      x: air.x + along.x * a + across.x * c,
      z: air.z + along.z * a + across.z * c,
      y
    })

    const concreteMat = new THREE.MeshStandardMaterial({
      color: PALETTE.quay, roughness: 0.9, flatShading: true
    })
    const asphaltMat = new THREE.MeshStandardMaterial({
      color: PALETTE.asphalt, roughness: 0.95, flatShading: true
    })
    const lineMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roadLine, roughness: 0.8, flatShading: true
    })

    // The deck. Underside below the waterline, like the quays, so there is no
    // gap to see the sea through at the edge.
    const plat = air.platform
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(plat.width, PIER_DECK_DEPTH, plat.length), concreteMat)
    deck.position.set(plat.x, deckY - PIER_DECK_DEPTH / 2, plat.z)
    deck.rotation.y = air.heading
    deck.receiveShadow = true
    this.game.add(deck)

    // Solid, so you can drive onto it once something reaches it - and so a
    // plane is standing on something rather than hovering over water.
    this.game.physics.createStaticBoxAt(
      plat.x, deckY - PIER_DECK_DEPTH / 2, plat.z,
      plat.width, PIER_DECK_DEPTH, plat.length, air.heading)

    // Piles. A platform at sea has to stand on something visible or it reads
    // as a raft: spaced along both long edges and down into the water.
    const pileMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.85, flatShading: true
    })
    const piles = Math.max(4, Math.round(plat.length / 26))
    for (let i = 0; i <= piles; i++) {
      const a = -plat.length / 2 + (plat.length * i) / piles
      for (const side of [1, -1]) {
        const c = (plat.width / 2 - 3) * side + (air.platformOffset || 0)
        const p = at(a, c)
        const pile = new THREE.Mesh(
          new THREE.CylinderGeometry(1.5, 1.8, 9, 8), pileMat)
        pile.position.set(p.x, SEA_LEVEL - 3.6, p.z)
        pile.castShadow = true
        this.game.add(pile)
      }
    }

    // The runway, laid on the deck rather than replacing it.
    const run = air.runway
    const strip = new THREE.Mesh(
      new THREE.BoxGeometry(run.width, 0.32, run.length), asphaltMat)
    strip.position.set((run.from.x + run.to.x) / 2, deckY + 0.16,
                       (run.from.z + run.to.z) / 2)
    strip.rotation.y = air.heading
    strip.receiveShadow = true
    this.game.add(strip)

    // Centreline, dashed, and a threshold bar at each end. The markings are
    // what makes it read as a runway rather than a grey rectangle.
    const dashes = Math.floor(run.length / 24)
    for (let i = 0; i < dashes; i++) {
      const a = -run.length / 2 + 12 + i * 24
      const p = at(a, 0)
      const dash = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 12), lineMat)
      dash.position.set(p.x, deckY + 0.34, p.z)
      dash.rotation.y = air.heading
      this.game.add(dash)
    }

    for (const end of [-1, 1]) {
      for (let b = 0; b < 6; b++) {
        const c = (b - 2.5) * 3.2
        const p = at(end * (run.length / 2 - 7), c)
        const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 11), lineMat)
        bar.position.set(p.x, deckY + 0.34, p.z)
        bar.rotation.y = air.heading
        this.game.add(bar)
      }
    }

    // The taxiway, and a marked box at every stand.
    const taxi = air.taxiway
    const taxiLen = Math.hypot(taxi.to.x - taxi.from.x, taxi.to.z - taxi.from.z)
    const taxiway = new THREE.Mesh(
      new THREE.BoxGeometry(taxi.width, 0.3, taxiLen), asphaltMat)
    taxiway.position.set((taxi.from.x + taxi.to.x) / 2, deckY + 0.15,
                         (taxi.from.z + taxi.to.z) / 2)
    taxiway.rotation.y = air.heading
    this.game.add(taxiway)

    for (const stand of air.stands) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(PLANE_SPAN + 4, 0.06, PLANE_LENGTH + 4), lineMat)
      box.position.set(stand.x, deckY + 0.33, stand.z)
      box.rotation.y = air.heading
      this.game.add(box)
    }

    this.buildTerminal(air, deckY)

    // Approach lights on the water, leading in to each threshold. Cheap, and
    // it is what tells you at night that the thing out there is an airport.
    for (const end of air.stands.length ? [0, 1] : []) {
      const graph = getAirGraph(air)
      if (!graph) break
      const e = graph.ends[end]
      for (let i = 1; i <= 6; i++) {
        const d = i * 12
        this.addStreetlight(e.at.x - e.dir.x * d, e.at.z - e.dir.z * d,
                            { x: e.at.x, z: e.at.z })
      }
    }

    this.createCauseway()
  }

  /**
   * The causeway, and the road that runs round the platform.
   *
   * The airport was buildable and standable-on from the day it was sited - the
   * deck has always been a collider - but there was no way to GET there, so it
   * was scenery you flew past. This is the road link, and it is deliberately
   * the ordinary road machinery: the same ribbon builder as every street, the
   * same railings as a bridge, and both pieces are in getRoadNetwork() so the
   * town's own traffic drives out to the terminal.
   *
   * The loop is what makes it work. The runway lies between the world and the
   * terminal, so any direct approach would cross it; going round the outside
   * does not, and it puts the kerb at the terminal's front door on the way.
   */
  createCauseway() {
    const way = getAirportCauseway()
    const loop = getApronRoad(this.airport)
    const road = getCausewayRoadPath()
    // Kept on the world so a browser probe can ask where the crossing is,
    // rather than deriving it a second time - the same reason `this.airport`
    // and `this.ports` are kept.
    this.causeway = way
    this.apron = loop
    if (!way || !loop || !road) return

    const concreteMat = new THREE.MeshStandardMaterial({
      color: PALETTE.concrete, roughness: 0.9, metalness: 0.05, flatShading: true
    })

    // The deck, top face on the sea-level datum like every bridge in the
    // world - see PIER_DECK_Y for what happens when a deck disagrees.
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(way.width + CAUSEWAY_DECK_MARGIN, PIER_DECK_DEPTH, way.deckLength),
      concreteMat)
    deck.position.set(way.mid.x, PIER_DECK_Y - PIER_DECK_DEPTH / 2, way.mid.z)
    deck.rotation.y = way.rotationY
    deck.castShadow = true
    deck.receiveShadow = true
    this.game.add(deck)

    this.game.physics.createStaticBoxAt(
      way.mid.x, PIER_DECK_Y - PIER_DECK_DEPTH / 2, way.mid.z,
      way.width + CAUSEWAY_DECK_MARGIN, PIER_DECK_DEPTH, way.deckLength, way.rotationY)

    // Piles, so it stands on something rather than floating - the same
    // reasoning as the platform's own.
    const pileMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.85, flatShading: true
    })
    const bays = Math.max(2, Math.round(way.deckLength / 22))
    for (let i = 1; i < bays; i++) {
      const d = (way.deckLength * i) / bays
      for (const side of [1, -1]) {
        const px = way.root.x + way.dirX * d - way.dirZ * side * (way.width / 2)
        const pz = way.root.z + way.dirZ * d + way.dirX * side * (way.width / 2)
        const pile = new THREE.Mesh(
          new THREE.CylinderGeometry(1, 1.2, 7, 8), pileMat)
        pile.position.set(px, SEA_LEVEL - 2.4, pz)
        pile.castShadow = true
        this.game.add(pile)
      }
    }

    // Railings over the water only. The same builder the bridges use, handed a
    // bridge-shaped description of the causeway - one implementation, so a
    // barrier here can never be a different height from a barrier there.
    this.addBridgeRailings({
      x: way.mid.x, z: way.mid.z,
      length: way.deckLength, width: way.width + CAUSEWAY_DECK_MARGIN,
      rotationY: way.rotationY
    })

    // The road itself: island ring, across the water, onto the loop - one
    // unbroken surface, so there is no seam where the land ends.
    this.buildRoadSurface(road.points, road.width)

    // And the loop round the platform. Closed, so the last point joins the
    // first: passing `true` is what stops the ribbon ending in a square edge
    // across the taxiway.
    this.buildRoadSurface([...loop.points, loop.points[0]], loop.width)

    // Lit, like every other road. Every fourth point of the loop, so the lamps
    // are evenly spaced round it whatever size the platform is - and set OFF
    // the carriageway, on the seaward side, aimed back at the road. A pole
    // placed on the loop's own points would stand in the middle of it.
    const centre = this.airport
    const stand = loop.width / 2 + 2.5
    for (let i = 0; i < loop.points.length; i += 4) {
      const p = loop.points[i]
      const ox = p.x - centre.x
      const oz = p.z - centre.z
      const len = Math.hypot(ox, oz) || 1
      this.addStreetlight(p.x + (ox / len) * stand, p.z + (oz / len) * stand, p)
    }
  }

  /** The terminal, its glass, and an airbridge reaching to each stand. */
  buildTerminal(air, deckY) {
    const t = air.terminal

    const shellMat = new THREE.MeshStandardMaterial({
      color: PALETTE.wallWhite, roughness: 0.7, flatShading: true
    })
    const roofMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roofDark, roughness: 0.8, flatShading: true
    })

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(t.depth, 11, t.length), shellMat)
    shell.position.set(t.x, deckY + 5.5, t.z)
    shell.rotation.y = air.heading
    shell.castShadow = true
    shell.receiveShadow = true
    this.game.add(shell)

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(t.depth + 3, 0.8, t.length + 3), roofMat)
    roof.position.set(t.x, deckY + 11.4, t.z)
    roof.rotation.y = air.heading
    this.game.add(roof)

    // Glass along the apron face, lit after dark. registerNightLight is the
    // same path the shopfronts and the station signs use - one implementation
    // of "this glows at night", so a terminal cannot come on at a different
    // hour from everything else.
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.4,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glassMat, 1)

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 6, t.length - 4), glassMat)
    const face = {
      x: t.x - air.across.x * (t.depth / 2 + 0.1),
      z: t.z - air.across.z * (t.depth / 2 + 0.1)
    }
    glass.position.set(face.x, deckY + 5, face.z)
    glass.rotation.y = air.heading
    this.game.add(glass)

    this.game.physics.createStaticBoxAt(t.x, deckY + 5.5, t.z,
                                        t.depth, 11, t.length, air.heading)

    // An airbridge per stand, reaching from the terminal toward the aircraft.
    this.airbridges = []
    for (const stand of air.stands) {
      const reach = 12
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(reach, 3.4, 4.2), shellMat)
      const mid = {
        x: (stand.x + t.x) / 2,
        z: (stand.z + t.z) / 2
      }
      bridge.position.set(mid.x, deckY + 5.4, mid.z)
      bridge.rotation.y = air.heading
      bridge.castShadow = true
      this.game.add(bridge)
      this.airbridges.push({ mesh: bridge, stand: stand.index, home: bridge.position.clone() })
    }
  }

  /**
   * The aircraft, hung off the flight the layout is already flying.
   *
   * No colliders, for the same reason the ships have none.
   */
  createPlanes() {
    this.airGraph = getAirGraph(this.airport)
    this.planes = []
    if (!this.airGraph) return

    this.planes = makePlanes(this.airGraph)

    for (const plane of this.planes) {
      plane.mesh = this.buildPlane()
      const where = planePosition(this.airGraph, plane)
      plane.mesh.position.set(where.x, where.y, where.z)
      plane.mesh.rotation.y = where.heading
      this.game.add(plane.mesh)
    }
  }

  buildPlane() {
    const group = new THREE.Group()

    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.carWhite, roughness: 0.42, metalness: 0.25, flatShading: true
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: PALETTE.trainBody, roughness: 0.5, metalness: 0.2, flatShading: true
    })
    const darkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.7, flatShading: true
    })
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xb9c0c8, roughness: 0.35, metalness: 0.7, flatShading: true
    })

    // FUSELAGE, lofted. It was a cylinder with a cone stuck on each end, and
    // the joins were visible from any angle because a 10-sided cylinder and a
    // 10-sided cone do not agree about where their facets are. One loft is one
    // continuous surface: a nose that tapers, a constant-section cabin, and a
    // tail cone that LIFTS as it narrows - which is the most recognisable
    // thing about an airliner after the wings, and is what gives the fin
    // something to stand on.
    //
    // Built along +Z, which is the direction everything else in this world
    // calls forward.
    group.add(this.loftMesh(fuselageBody(PLANE_LENGTH, 2.1), bodyMat))

    // WINGS, swept, one loft per side turned on its edge.
    //
    // Span is the constant the stands are spaced off, so the drawn aircraft
    // and the parking box cannot disagree.
    for (const side of [1, -1]) {
      // THE SWEEP HAS TO BE MIRRORED, not copied. The loft runs along +Z and
      // is turned a quarter to lie along X, and that quarter turn maps local
      // +X onto world -Z on one side and onto +Z on the other - so building
      // both wings from the same sections gave one swept back and one swept
      // FORWARD, which is exactly as odd as it sounds and was obvious the
      // moment it was photographed.
      const wing = this.loftMesh(
        wingBody(PLANE_SPAN, 7.5, 2.6, -side * 4.2, 0.62), bodyMat)
      // The loft runs along +Z; a wing runs along X, so it is turned a quarter
      // and mirrored for the other side.
      wing.rotation.y = side * Math.PI / 2
      wing.position.set(0, 2.6, -0.5)
      wing.scale.z = 1
      group.add(wing)

      // ENGINES: round nacelles under and ahead of the wing.
      //
      // Lofted rectangles first, which photographed as two dark cubes hanging
      // off the wings - a nacelle is the one thing on an airliner that is
      // unambiguously a cylinder, and drawing it as a box is worse than not
      // drawing it. A 12-sided cylinder next to a flat-shaded world reads as
      // faceted rather than smooth, which is what the rest of it does.
      const at = PLANE_SPAN * 0.29
      const back = -1.4
      const nacelle = new THREE.Mesh(
        new THREE.CylinderGeometry(1.15, 1.0, 4.6, 12), metalMat)
      nacelle.rotation.x = Math.PI / 2
      nacelle.position.set(side * at, 1.55, 1.6 + back)
      nacelle.castShadow = true
      group.add(nacelle)

      // The intake lip and the dark fan behind it, so it reads as a tube you
      // could look down rather than as a pod.
      const lip = new THREE.Mesh(
        new THREE.CylinderGeometry(1.22, 1.15, 0.42, 12), trimMat)
      lip.rotation.x = Math.PI / 2
      lip.position.set(side * at, 1.55, 3.9 + back)
      group.add(lip)
      const fan = new THREE.Mesh(
        new THREE.CylinderGeometry(1.02, 1.02, 0.16, 12), darkMat)
      fan.rotation.x = Math.PI / 2
      fan.position.set(side * at, 1.55, 3.72 + back)
      group.add(fan)

      const pylon = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 1.5, 2.6), bodyMat)
      pylon.position.set(side * at, 2.35, 0.7 + back)
      group.add(pylon)

      // Undercarriage: a leg and a pair of wheels under each wing root.
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.5, 0.36), darkMat)
      leg.position.set(side * 2.4, 0.75, -1.2)
      group.add(leg)
      for (const pair of [-0.5, 0.5]) {
        const tyre = new THREE.Mesh(
          new THREE.CylinderGeometry(0.62, 0.62, 0.42, 10), darkMat)
        tyre.rotation.z = Math.PI / 2
        tyre.position.set(side * 2.4, 0.62, -1.2 + pair)
        group.add(tyre)
      }
    }

    // Nose gear.
    const noseLeg = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.3), darkMat)
    noseLeg.position.set(0, 0.72, PLANE_LENGTH * 0.3)
    group.add(noseLeg)
    const noseTyre = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.34, 10), darkMat)
    noseTyre.rotation.z = Math.PI / 2
    noseTyre.position.set(0, 0.48, PLANE_LENGTH * 0.3)
    group.add(noseTyre)

    // THE FIN IS AUTHORED STANDING UP, not built flat and rotated.
    //
    // The first version lofted it like a wing and turned it with
    // `rotation.z = -PI/2`, which cannot work: the loft runs along +Z and a
    // rotation ABOUT z leaves z exactly where it was. The fin came out lying
    // flat across the tail, which is what the photograph showed.
    //
    // A fin is a shape whose HEIGHT varies along the fore-aft direction, and
    // that is what this primitive already expresses - z is the chord, yTop is
    // the height at that station, and halfWidth is the thickness. No rotation
    // needed, and nothing to get wrong.
    const fin = this.loftMesh([
      { z: -3.4, halfWidth: 0.34, yBottom: 0, yTop: 0.25 },
      { z: -1.0, halfWidth: 0.3, yBottom: 0, yTop: 4.4 },
      { z: 1.2, halfWidth: 0.24, yBottom: 0, yTop: 5.2 },
      { z: 2.6, halfWidth: 0.18, yBottom: 0, yTop: 4.6 }
    ], trimMat)
    fin.position.set(0, 4.0, -PLANE_LENGTH * 0.38)
    group.add(fin)

    // The tailplane is horizontal, so it IS a wing and the same builder does.
    for (const side of [1, -1]) {
      const tp = this.loftMesh(wingBody(11, 3.2, 1.3, -side * 1.6, 0.34), bodyMat)
      tp.rotation.y = side * Math.PI / 2
      tp.position.set(0, 4.9, -PLANE_LENGTH * 0.42)
      group.add(tp)
    }

    // A cheatline down the side, and a dark flight deck.
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(4.32, 0.7, PLANE_LENGTH * 0.72), trimMat)
    stripe.position.set(0, 3.5, -1)
    group.add(stripe)

    const cockpit = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.75, 1.5), darkMat)
    cockpit.position.set(0, 4.05, PLANE_LENGTH * 0.36)
    cockpit.rotation.x = -0.14
    group.add(cockpit)

    // Cabin windows, lit at night with everything else.
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.3, flatShading: true,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glassMat, 1)
    for (const side of [1, -1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.56, PLANE_LENGTH * 0.56), glassMat)
      strip.position.set(side * 2.12, 4.05, 0.5)
      group.add(strip)
    }

    return group
  }

  /**
   * Fly them.
   *
   * The flying itself is stepPlanes() in islandLayout.js, for the same reason
   * the train timetable and the traffic rules live there: this file cannot be
   * run by a test, so anything with a decision in it belongs where one can.
   * This asks where each aircraft is and puts it there.
   */
  updatePlanes(delta) {
    if (!this.airGraph || !this.planes || !this.planes.length) return

    stepPlanes(this.airGraph, this.planes, delta)

    for (const plane of this.planes) {
      const where = planePosition(this.airGraph, plane)
      plane.mesh.position.set(where.x, where.y, where.z)

      // THE DRAWN HEADING IS EASED, like the traffic's.
      //
      // Every phase is a different path, and where two paths meet the heading
      // can change outright however carefully the paths are built - the
      // pushback ends facing the terminal and the taxi out faces the taxiway,
      // which is a real 180-degree turn that a tug takes half a minute over.
      // Measured across a full cycle, the routes themselves now agree to
      // within 0.0 degrees at every boundary on the ground; this handles the
      // deliberate exceptions and anything a future route change introduces.
      if (plane.drawnHeading === undefined) plane.drawnHeading = where.heading
      let turn = where.heading - plane.drawnHeading
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      const eased = turn * Math.min(1, delta / PLANE_TURN_EASE)
      const cap = PLANE_TURN_RATE * delta
      plane.drawnHeading += Math.max(-cap, Math.min(cap, eased))
      plane.mesh.rotation.y = plane.drawnHeading

      // Nose up on the climb and down on the approach, from the gradient the
      // route is actually flying rather than from the phase name. Eased too,
      // for the same reason.
      if (plane.drawnPitch === undefined) plane.drawnPitch = where.pitch
      plane.drawnPitch += (where.pitch - plane.drawnPitch) *
        Math.min(1, delta / PLANE_TURN_EASE)
      plane.mesh.rotation.x = -plane.drawnPitch
    }

    // The airbridge reaches out when its aircraft is on stand and sits back
    // against the terminal when it isn't - which is the only way to see, from
    // outside, that anybody is getting on.
    if (!this.airbridges) return
    for (const bridge of this.airbridges) {
      const parked = this.planes.some(p => p.stand === bridge.stand &&
                                           p.phase === 'stand')
      const want = parked ? 1 : 0
      bridge.at = bridge.at === undefined ? want : bridge.at
      bridge.at += Math.max(-delta * 0.6, Math.min(delta * 0.6, want - bridge.at))
      const reach = 4.5 * bridge.at
      bridge.mesh.position.set(
        bridge.home.x - this.airport.across.x * reach,
        bridge.home.y,
        bridge.home.z - this.airport.across.z * reach)
    }
  }

  // -------------------------------------------------------------
  // Helicopters
  // -------------------------------------------------------------

  /**
   * The pads and the machines.
   *
   * Where a pad may go is decided in islandLayout.js - it is a question about
   * the monorail beam and about roof sizes, and both are things a test has to
   * be able to check. This draws them.
   */
  createHelicopters() {
    // The pads are PROPOSED by the layout and settled here, because the height
    // of a rooftop pad is a fact about a mesh that only exists once the town
    // has been built. See fitRoofPads(): the layout has no way of knowing that
    // a "five storey" plot came out of the loader four units tall, so every
    // rooftop pad in the world used to sit at a flat 12.5 with nothing under
    // it. createIslands() runs before this, so `this.buildings` is complete.
    this.helipads = fitRoofPads(getHelipads(), this.buildings)
    this.helicopters = []
    if (!this.helipads.length) return

    const padMat = new THREE.MeshStandardMaterial({
      color: PALETTE.asphalt, roughness: 0.92, flatShading: true
    })
    const markMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roadLine, roughness: 0.8, flatShading: true
    })

    const skirtMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.85, flatShading: true
    })

    for (const pad of this.helipads) {
      // The deck. A rooftop pad sits ON the roof, so it is drawn just above
      // the height fitRoofPads() measured; a ground pad sits on the ground.
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(HELIPAD_SIZE, 0.3, HELIPAD_SIZE), padMat)
      deck.position.set(pad.x, pad.y + 0.15, pad.z)
      deck.rotation.y = pad.heading
      deck.receiveShadow = true
      this.game.add(deck)

      // A ROOFTOP DECK IS BUILT OVER THE ROOF, NOT LAID ON IT.
      //
      // `pad.y` is the top of the building's bounding box, which on a model
      // with any pitch to its roof is the RIDGE - so a deck resting exactly
      // there touches the building along one line and shows daylight under it
      // everywhere else. That is the same complaint in miniature, and the
      // answer is the one real rooftop helidecks use: a short skirt down into
      // the roof, so the pad reads as a platform that was built up there
      // rather than a slab that landed on it.
      if (pad.kind === 'roof') {
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(HELIPAD_SIZE - 0.5, 1.1, HELIPAD_SIZE - 0.5),
          skirtMat)
        skirt.position.set(pad.x, pad.y - 0.55, pad.z)
        skirt.rotation.y = pad.heading
        this.game.add(skirt)
      }

      // The circle and the H, which is the only thing that says "helipad"
      // rather than "grey square".
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(HELIPAD_SIZE * 0.34, 0.22, 6, 18), markMat)
      ring.rotation.x = -Math.PI / 2
      ring.position.set(pad.x, pad.y + 0.33, pad.z)
      this.game.add(ring)

      for (const bar of [[-1.1, 0.5, 2.4], [1.1, 0.5, 2.4], [0, 2.2, 0.5]]) {
        const mark = new THREE.Mesh(
          new THREE.BoxGeometry(bar[1], 0.08, bar[2]), markMat)
        const c = Math.cos(pad.heading)
        const sn = Math.sin(pad.heading)
        mark.position.set(pad.x + bar[0] * c, pad.y + 0.34, pad.z - bar[0] * sn)
        mark.rotation.y = pad.heading
        this.game.add(mark)
      }

      // A ground pad gets a light so it reads after dark. A rooftop one does
      // not - a lamp post on a roof looks like a mistake.
      if (pad.kind === 'ground') {
        this.addStreetlight(pad.x + HELIPAD_SIZE, pad.z, { x: pad.x, z: pad.z })
      }
    }

    this.helicopters = makeHelicopters(this.helipads)
    for (const machine of this.helicopters) {
      machine.mesh = this.buildHelicopter()
      const where = helicopterPosition(this.helipads, machine, 0)
      machine.mesh.position.set(where.x, where.y, where.z)
      machine.mesh.rotation.y = where.heading
      this.game.add(machine.mesh)
    }
  }

  buildHelicopter() {
    const group = new THREE.Group()

    const bodyMat = new THREE.MeshStandardMaterial({
      color: PALETTE.carBlue, roughness: 0.48, metalness: 0.25, flatShading: true
    })
    const darkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.7, flatShading: true
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.4, flatShading: true
    })
    const metalMat = new THREE.MeshStandardMaterial({
      color: 0xb9c0c8, roughness: 0.35, metalness: 0.7, flatShading: true
    })

    // CABIN AND BOOM AS ONE LOFT. It was a 3x3x5.4 box with a separate
    // 0.9-square boom stuck on the back, and the step between them was the
    // most obvious thing about it. A helicopter's whole shape is a cabin that
    // narrows continuously into a tail, so it is one surface.
    //
    // Built along +Z like everything else that moves in this world - the loft
    // runs nose-negative, so it is turned to face forward.
    const shell = this.loftMesh(helicopterBody(HELI_LENGTH, 3), bodyMat)
    shell.rotation.y = Math.PI
    group.add(shell)

    // The glazed nose: a bubble rather than a slab, which is what a light
    // helicopter has and what says "you can see out of it".
    const canopy = this.loftMesh([
      { z: -1.6, halfWidth: 1.35, yBottom: 1.0, yTop: 2.35 },
      { z: 0.2, halfWidth: 1.2, yBottom: 1.05, yTop: 2.2 },
      { z: 1.4, halfWidth: 0.8, yBottom: 1.25, yTop: 1.85 }
    ], glassMat)
    canopy.position.set(0, 0, 3.1)
    group.add(canopy)

    // A door frame and a step, so the cabin has a way in.
    for (const side of [1, -1]) {
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 1.9), darkMat)
      frame.position.set(side * 1.48, 1.75, 0.5)
      group.add(frame)
      const step = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.2), darkMat)
      step.position.set(side * 1.5, 0.95, 0.5)
      group.add(step)
    }

    // The fin, and a horizontal stabiliser on the boom.
    const fin = this.loftMesh([
      { z: 0, halfWidth: 1.1, yBottom: -0.16, yTop: 0.16 },
      { z: 1.3, halfWidth: 0.85, yBottom: -0.12, yTop: 0.12, xShift: -0.5 },
      { z: 2.1, halfWidth: 0.5, yBottom: -0.1, yTop: 0.1, xShift: -0.9 }
    ], bodyMat)
    fin.rotation.z = -Math.PI / 2
    fin.rotation.order = 'ZYX'
    fin.position.set(0, 2.4, -5.2)
    group.add(fin)

    const stab = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.16, 0.9), bodyMat)
    stab.position.set(0, 2.5, -4.6)
    group.add(stab)

    // SKIDS, which is what makes it read as a helicopter on a pad. Now with
    // the forward sweep and the cross-tubes a real skid gear has.
    for (const side of [1, -1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 5.4), metalMat)
      skid.position.set(side * 1.45, 0.14, 0.6)
      group.add(skid)
      const toe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.9), metalMat)
      toe.position.set(side * 1.45, 0.3, 3.4)
      toe.rotation.x = -0.4
      group.add(toe)
      for (const along of [-1.3, 1.7]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), metalMat)
        leg.position.set(side * 1.32, 0.62, along)
        leg.rotation.z = side * 0.16
        group.add(leg)
      }
    }
    for (const along of [-1.3, 1.7]) {
      const cross = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.16, 0.16), metalMat)
      cross.position.set(0, 1.02, along)
      group.add(cross)
    }

    // Main rotor: a mast, a hub, FOUR blades that droop, and the control
    // linkage under them. Two flat blades on a stub was the other half of why
    // this read as a toy.
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 1.0, 8), metalMat)
    mast.position.set(0, 2.9, 0.6)
    group.add(mast)

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.52, 0.5, 8), darkMat)
    hub.position.set(0, 3.5, 0.6)
    group.add(hub)

    const rotor = new THREE.Group()
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group()
      arm.rotation.y = (i * Math.PI) / 2

      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.09, HELI_ROTOR / 2), darkMat)
      blade.position.set(0, 0, HELI_ROTOR / 4)
      // Coning: the blades droop at rest, which is what a stopped rotor does
      // and what makes a spinning one read as a disc rather than a cross.
      blade.rotation.x = 0.05
      arm.add(blade)

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.7), metalMat)
      grip.position.set(0, 0, 0.55)
      arm.add(grip)

      rotor.add(arm)
    }
    rotor.position.set(0, 3.72, 0.6)
    group.add(rotor)

    // Tail rotor, on the fin, with its own hub.
    const tailRotor = new THREE.Group()
    for (let i = 0; i < 3; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.7, 0.3), darkMat)
      blade.position.set(0, 0.85, 0)
      const arm = new THREE.Group()
      arm.rotation.z = (i * Math.PI * 2) / 3
      arm.add(blade)
      tailRotor.add(arm)
    }
    tailRotor.position.set(0.42, 3.0, -5.4)
    group.add(tailRotor)

    const tailHub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 0.34, 8), metalMat)
    tailHub.rotation.z = Math.PI / 2
    tailHub.position.set(0.3, 3.0, -5.4)
    group.add(tailHub)

    group.userData.rotor = rotor
    group.userData.tailRotor = tailRotor
    return group
  }

  /**
   * Fly them, and spin the rotors.
   *
   * The flying is stepHelicopters() in islandLayout.js. The only thing decided
   * here is the rotor speed, which is cosmetic: it idles on the pad and winds
   * up in the air, because a machine sitting with its rotor stopped reads as
   * broken and one with it at full speed reads as about to leave.
   */
  updateHelicopters(delta) {
    if (!this.helipads || !this.helicopters || !this.helicopters.length) return

    stepHelicopters(this.helipads, this.helicopters, delta, this.elapsed)

    for (const machine of this.helicopters) {
      const where = helicopterPosition(this.helipads, machine, delta)
      machine.mesh.position.set(where.x, where.y, where.z)
      machine.mesh.rotation.y = where.heading
      machine.mesh.rotation.x = where.pitch

      const spin = where.flying ? 26 : 6
      machine.mesh.userData.rotor.rotation.y += spin * delta
      machine.mesh.userData.tailRotor.rotation.x += spin * 1.4 * delta
    }
  }

  // -------------------------------------------------------------
  // People
  // -------------------------------------------------------------

  /**
   * Everybody who walks about the town.
   *
   * Mike: "can we also create people that walk around town? I want them to
   * have a walking legs, swinging arms. obviously a head, torso (with arms
   * described) and legs."
   *
   * WHY THIS IS FIVE INSTANCED MESHES AND NOT A HUNDRED AND TWENTY GROUPS
   * ---------------------------------------------------------------------
   * A person is seven pieces - head, hair, torso, two arms, two legs - and
   * there are a hundred and twenty of them, which is eight hundred and forty
   * objects. Built the obvious way, as a Group per person, that is eight
   * hundred and forty draw calls added to a world that manages the whole city
   * in a few hundred, and the frame rate would have gone with it.
   *
   * So each BODY PART is one InstancedMesh across every person: all the heads
   * are one mesh, all the arms are another. Five draw calls for the entire
   * population, and a limb swinging is one matrix written into a buffer rather
   * than an object in a scene graph. It is the same trick the flowers already
   * use, and it is the only reason the density Mike asked for is affordable.
   *
   * The cost that remains is CPU: composing seven matrices per visible person
   * per frame. That is what DRAW_RANGE is for - a person past it keeps a
   * zero-scale matrix and is skipped entirely, so the work is proportional to
   * what can be seen rather than to what exists.
   */
  createPedestrians() {
    this.people = []
    this.pedestrianNet = null
    if (!this.pavementSource || !this.pavementSource.length) return

    const stations = this.monorail ? this.monorail.stations : []
    this.pedestrianNet = buildPavementGraph(this.pavementSource, {
      pavementWidth: PAVEMENT_WIDTH,
      stops: this.busStops || [],
      platforms: platformSpots(stations, {
        offset: MONORAIL_PLATFORM_OFFSET,
        length: MONORAIL_PLATFORM_LENGTH,
        // The deck's top, which is where a foot goes. buildStation() puts the
        // 0.45-thick slab at MONORAIL_HEIGHT + 0.55, so its surface is that
        // plus half the thickness - written out rather than as a number,
        // because the two have to move together.
        y: MONORAIL_HEIGHT + 0.55 + 0.225
      })
    })

    this.people = makePedestrians(this.pedestrianNet, PEDESTRIANS)
    if (!this.people.length) return

    // Ground height is sampled as they walk rather than every frame - see
    // updatePedestrians() - so it has to be right the first time.
    for (const person of this.people) {
      if (person.mode !== 'platform') person.y = this.groundAt(person.x, person.z)
      person.groundX = person.x
      person.groundZ = person.z
      person.drawn = false
    }

    this.buildPedestrianParts()
  }

  /**
   * The figure, as one InstancedMesh per body part.
   *
   * Proportions are a person: 1.8 units head to heel, with the hips at 0.86
   * and the shoulders at 1.44. Those two numbers are the ones that matter,
   * because they are the PIVOTS - an arm that swings from the middle of the
   * torso and a leg that swings from the waist both read as a puppet, and no
   * amount of getting the swing angle right fixes either.
   *
   * Everything is a box. At the distance a pedestrian is actually seen from,
   * a rounded limb costs triangles nobody can see, and the whole world is flat
   * shaded anyway.
   */
  buildPedestrianParts() {
    const count = this.people.length

    // The pivots and lengths, shared with updatePedestrians(). One place, so
    // the matrix that swings a limb and the geometry that draws it cannot
    // disagree about where its shoulder is.
    // Proportions, measured against a car rather than guessed. A person is
    // 1.8 units and a saloon is 4.3 long by 1.9 wide, and getting that ratio
    // right is most of what makes a street read as a street - a figure even
    // slightly too big turns the city into a model village.
    //
    // The first pass had a 0.44-wide torso on 0.8 legs and read as an ape:
    // wide in the chest, short in the leg, with the hands hanging past the
    // hips. Narrower and longer-legged is the fix, and the arm is shortened
    // so the hands stop at mid-thigh where they belong.
    const rig = {
      hip: 0.88,
      shoulder: 1.46,
      leg: 0.82,
      arm: 0.6,
      head: 1.64,
      hair: 1.795,
      torso: 1.18,
      armX: 0.25,
      legX: 0.105
    }
    this.pedestrianRig = rig

    const skin = new THREE.MeshStandardMaterial({
      roughness: 0.82, flatShading: true
    })
    const cloth = new THREE.MeshStandardMaterial({
      roughness: 0.9, flatShading: true
    })

    const part = (geometry, material, per) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count * per)
      // A pedestrian is a metre and a half of person on a street full of
      // buildings; a shadow from one is not worth a shadow map's worth of
      // work, and eight hundred casters would be.
      mesh.castShadow = false
      mesh.receiveShadow = false
      // They move every frame and they are all over the world, so a bounding
      // sphere computed once is wrong immediately. Frustum culling the whole
      // population on one stale sphere is how a crowd vanishes when you look
      // at it.
      mesh.frustumCulled = false
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      this.game.add(mesh)
      return mesh
    }

    this.pedestrianParts = {
      head: part(new THREE.BoxGeometry(0.25, 0.27, 0.24), skin, 1),
      hair: part(new THREE.BoxGeometry(0.27, 0.09, 0.26), cloth, 1),
      torso: part(new THREE.BoxGeometry(0.38, 0.6, 0.24), cloth, 1),
      // Limbs are built with their TOP at the origin, so the instance matrix
      // can rotate them about the shoulder or the hip without a second
      // translation to undo the box being centred on itself.
      arm: part(armGeometry(0.12, rig.arm, 0.13), cloth, 2),
      leg: part(legGeometry(0.16, rig.leg, 0.19), cloth, 2)
    }

    // Colours, set ONCE. Every person keeps a fixed instance index for the
    // whole session - see updatePedestrians() for why that is worth more than
    // packing the visible ones together - so a shirt never changes colour.
    const shirts = [
      PALETTE.carRed, PALETTE.carBlue, PALETTE.wallTeal, PALETTE.signPink,
      PALETTE.carGreen, PALETTE.wallCoral, PALETTE.carWhite, PALETTE.crane
    ]
    const trousers = [
      0x39424f, 0x5b4a3c, 0x2f3a46, 0x6a6f78, 0x40506b
    ]
    const skins = [0xf0c8a4, 0xd8a271, 0xa9713f, 0x76492a]
    const hairs = [0x2b2118, 0x4b3423, 0x8a6a3c, 0x9a9a9a]

    const colour = new THREE.Color()
    this.people.forEach((person, i) => {
      colour.setHex(skins[person.skin % skins.length])
      this.pedestrianParts.head.setColorAt(i, colour)

      colour.setHex(person.hat
        ? shirts[(person.shirt + 3) % shirts.length]
        : hairs[person.skin % hairs.length])
      this.pedestrianParts.hair.setColorAt(i, colour)

      colour.setHex(shirts[person.shirt % shirts.length])
      this.pedestrianParts.torso.setColorAt(i, colour)
      // The sleeves are the same shirt, a shade darker. Not for realism - for
      // SILHOUETTE. An arm the exact colour of the torso it hangs beside
      // disappears into it at any distance, and then the swinging that Mike
      // asked for is happening where nobody can see it.
      colour.multiplyScalar(0.78)
      this.pedestrianParts.arm.setColorAt(i * 2, colour)
      this.pedestrianParts.arm.setColorAt(i * 2 + 1, colour)

      colour.setHex(trousers[person.trousers % trousers.length])
      this.pedestrianParts.leg.setColorAt(i * 2, colour)
      this.pedestrianParts.leg.setColorAt(i * 2 + 1, colour)
    })
    for (const mesh of Object.values(this.pedestrianParts)) {
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }

    // Scratch, made once. Allocating a Matrix4 per limb per person per frame
    // is eight hundred objects a frame for the collector to deal with.
    this._pedM = new THREE.Matrix4()
    this._pedRoot = new THREE.Matrix4()
    this._pedLimb = new THREE.Matrix4()
    this._pedQ = new THREE.Quaternion()
    this._pedV = new THREE.Vector3()
    this._pedS = new THREE.Vector3()
    this._pedHide = new THREE.Matrix4().makeScale(0, 0, 0)
  }

  /**
   * Walk them, and swing their arms and legs.
   *
   * The simulation is `stepPedestrians()` in pedestrians.js and costs almost
   * nothing - a hundred and twenty people is twenty microseconds. Everything
   * expensive is here, in the matrices, which is why so much of this function
   * is about deciding NOT to write one.
   *
   * A person past DRAW_RANGE is collapsed to a zero-scale matrix once and then
   * skipped. A person past ANIMATE_RANGE is drawn but not animated: the limbs
   * keep whatever angle they had, which at ninety units is a pixel or two and
   * saves the trigonometry and four of the seven matrices.
   *
   * The instance index is FIXED per person and the far ones are hidden rather
   * than packed out of the buffer. Packing would keep the instance count down,
   * but it would also renumber everybody every frame - and the per-instance
   * COLOURS are indexed the same way, so the whole colour buffer would have to
   * be rewritten too. A degenerate instance costs the rasteriser nothing; a
   * colour upload every frame costs something real.
   */
  updatePedestrians(delta) {
    if (!this.people || !this.people.length || !this.pedestrianNet) return

    // Everything worth being frightened of: the traffic, and the player.
    //
    // `v.drawn` is the eased position the mesh is actually at rather than the
    // raw one the simulation holds - a person should dodge the car they can
    // see. See updateTraffic() for why the two differ at a junction.
    const threats = this._pedThreats || (this._pedThreats = [])
    threats.length = 0
    for (const v of this.traffic || []) {
      if (!v.drawn || (v.speed || 0) < 2) continue
      threats.push({
        x: v.drawn.x, z: v.drawn.z, speed: v.speed,
        vx: Math.sin(v.heading) * v.speed,
        vz: Math.cos(v.heading) * v.speed
      })
    }
    const car = this.game.vehicle
    if (car && car.mesh) {
      const speed = Math.abs(car.currentSpeed || 0)
      if (speed > 2) {
        const heading = car.mesh.rotation.y
        threats.push({
          x: car.mesh.position.x, z: car.mesh.position.z, speed,
          vx: Math.sin(heading) * speed,
          vz: Math.cos(heading) * speed
        })
      }
    }

    stepPedestrians(this.pedestrianNet, this.people, delta, { vehicles: threats })

    const camera = this.game.camera && this.game.camera.instance
    if (!camera) return
    const eye = camera.position
    const drawRange = DRAW_RANGE * DRAW_RANGE
    const animRange = ANIMATE_RANGE * ANIMATE_RANGE

    const parts = this.pedestrianParts
    const rig = this.pedestrianRig
    const root = this._pedRoot
    const limb = this._pedLimb
    const q = this._pedQ
    const pos = this._pedV
    const scale = this._pedS

    let drawn = 0

    for (let i = 0; i < this.people.length; i++) {
      const person = this.people[i]

      const dx = person.x - eye.x
      const dz = person.z - eye.z
      const far = dx * dx + dz * dz

      if (far > drawRange) {
        // Hide once, then leave alone. Rewriting the same zero matrix sixty
        // times a second for eighty people who are nowhere near the camera is
        // exactly the work this range exists to avoid.
        if (person.drawn) {
          parts.head.setMatrixAt(i, this._pedHide)
          parts.hair.setMatrixAt(i, this._pedHide)
          parts.torso.setMatrixAt(i, this._pedHide)
          parts.arm.setMatrixAt(i * 2, this._pedHide)
          parts.arm.setMatrixAt(i * 2 + 1, this._pedHide)
          parts.leg.setMatrixAt(i * 2, this._pedHide)
          parts.leg.setMatrixAt(i * 2 + 1, this._pedHide)
          person.drawn = false
          drawn++
        }
        continue
      }

      // The ground, resampled only when they have actually gone somewhere.
      // Pavements sit on the flattened road corridor, so the height under a
      // person changes slowly - and groundAt() is a real terrain lookup, not
      // a field read.
      if (person.mode !== 'platform') {
        const moved = Math.hypot(person.x - person.groundX, person.z - person.groundZ)
        if (moved > 1.2 || !person.drawn) {
          person.y = this.groundAt(person.x, person.z)
          person.groundX = person.x
          person.groundZ = person.z
        }
      }

      const walking = isWalking(person)
      const cycle = far < animRange
        ? walkCycle(person, walking)
        : STILL_CYCLE

      const build = person.build
      scale.set(build, build, build)
      q.setFromAxisAngle(UP, person.heading)
      pos.set(person.x, person.y + cycle.bob * build, person.z)
      root.compose(pos, q, scale)

      // Torso and head ride the body. The lean is small and only shows when
      // somebody is running from a car, which is the one time it should.
      setLimb(parts.torso, i, root, limb, 0, rig.torso, 0, cycle.lean)
      setLimb(parts.head, i, root, limb, 0, rig.head, 0, cycle.lean * 0.4)
      setLimb(parts.hair, i, root, limb, 0, rig.hair, 0, cycle.lean * 0.4)

      // Arms from the shoulders, legs from the hips, each swinging about its
      // own pivot - see armGeometry() for why the box hangs below the origin.
      setLimb(parts.arm, i * 2, root, limb,
        rig.armX, rig.shoulder, 0, cycle.armLeft)
      setLimb(parts.arm, i * 2 + 1, root, limb,
        -rig.armX, rig.shoulder, 0, cycle.armRight)
      setLimb(parts.leg, i * 2, root, limb,
        rig.legX, rig.hip, 0, cycle.legLeft)
      setLimb(parts.leg, i * 2 + 1, root, limb,
        -rig.legX, rig.hip, 0, cycle.legRight)

      person.drawn = true
      drawn++
    }

    if (drawn) {
      parts.head.instanceMatrix.needsUpdate = true
      parts.hair.instanceMatrix.needsUpdate = true
      parts.torso.instanceMatrix.needsUpdate = true
      parts.arm.instanceMatrix.needsUpdate = true
      parts.leg.instanceMatrix.needsUpdate = true
    }
  }

  /**
   * Who could get on a vehicle standing here - the hook the passenger game
   * will use, and nothing calls it yet.
   *
   * Mike: "later be people we can pick up and drop off for a future city bus
   * and monorail game." The people are already waiting; this is how a bus will
   * find them. Kept on World rather than left in the pure module so the game
   * can ask a question about the world it is in, and put here now so that the
   * waiting people have a reason to exist rather than being scenery.
   */
  passengersAt(x, z, kind = 'bus', reach = undefined) {
    if (!this.people) return []
    return boardable(this.people, { x, z, kind }, reach)
  }

  // -------------------------------------------------------------
  // Shipping
  // -------------------------------------------------------------

  /**
   * The fleet. Hulls hung off the ships the layout is already sailing.
   *
   * No colliders. A moving collider has to be a kinematic body and told
   * where it is every frame, and the payoff would be being able to shunt a
   * container ship with a hatchback.
   */
  createShips() {
    this.ships = makeShips(this.seaGraph)

    for (const ship of this.ships) {
      ship.mesh = ship.kind === 'cargo' ? this.buildCargoShip() : this.buildBoat()
      // Started where it actually is, so nothing flies in from the origin
      // on the first frame.
      const at = shipPosition(this.seaGraph, ship)
      ship.mesh.position.set(at.x, SEA_LEVEL, at.z)
      ship.mesh.rotation.y = at.heading
      ship.heading = at.heading
      this.game.add(ship.mesh)
    }
  }

  buildCargoShip() {
    const group = new THREE.Group()

    const hullMat = new THREE.MeshStandardMaterial({
      color: PALETTE.hull, roughness: 0.75, metalness: 0.15, flatShading: true
    })
    const bootMat = new THREE.MeshStandardMaterial({
      color: PALETTE.hullDark, roughness: 0.8, flatShading: true
    })
    const houseMat = new THREE.MeshStandardMaterial({
      color: PALETTE.superstructure, roughness: 0.6, flatShading: true
    })

    const length = 46
    const beam = 9.5

    const hull = new THREE.Mesh(new THREE.BoxGeometry(beam, 4.2, length), hullMat)
    hull.position.y = 1.4
    hull.castShadow = true
    group.add(hull)

    // A darker band at the waterline, and a narrower forward section that
    // reads as a bow without needing a tapered mesh
    const boot = new THREE.Mesh(new THREE.BoxGeometry(beam + 0.2, 1.1, length), bootMat)
    boot.position.y = -0.2
    group.add(boot)

    const bow = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.55, 4.2, 7), hullMat)
    bow.position.set(0, 1.4, length / 2 + 2.6)
    bow.castShadow = true
    group.add(bow)

    // Bridge and funnel, aft
    const house = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.8, 7, 8), houseMat)
    house.position.set(0, 5.6, -length / 2 + 7)
    house.castShadow = true
    group.add(house)

    const windowMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.25, metalness: 0.4,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(windowMat, 1.2)

    const bridgeWindows = new THREE.Mesh(
      new THREE.BoxGeometry(beam * 0.82, 1.4, 0.12), windowMat)
    bridgeWindows.position.set(0, 7.6, -length / 2 + 11.05)
    group.add(bridgeWindows)

    const funnel = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.3, 4.5, 10), bootMat)
    funnel.position.set(0, 11.2, -length / 2 + 4.5)
    funnel.castShadow = true
    group.add(funnel)

    // Deck cargo
    const colours = [PALETTE.container, PALETTE.containerAlt, PALETTE.containerRust]
    for (let row = 0; row < 5; row++) {
      for (let col = -1; col <= 1; col++) {
        const stack = 1 + Math.floor(this.rand() * 3)
        for (let level = 0; level < stack; level++) {
          const box = new THREE.Mesh(
            new THREE.BoxGeometry(2.5, 2.4, 5.6),
            new THREE.MeshStandardMaterial({
              color: this.pick(colours), roughness: 0.85, flatShading: true
            }))
          box.position.set(col * 2.7, 4.7 + level * 2.45, 6 - row * 6.1)
          box.castShadow = true
          group.add(box)
        }
      }
    }

    return group
  }

  buildBoat() {
    const group = new THREE.Group()

    const hullMat = new THREE.MeshStandardMaterial({
      color: PALETTE.boatHull, roughness: 0.6, metalness: 0.1, flatShading: true
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: PALETTE.boatTrim, roughness: 0.7, flatShading: true
    })

    const length = 13
    const beam = 3.8

    const hull = new THREE.Mesh(new THREE.BoxGeometry(beam, 1.8, length), hullMat)
    hull.position.y = 0.7
    hull.castShadow = true
    group.add(hull)

    const bow = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.5, 1.8, 2.6), hullMat)
    bow.position.set(0, 0.7, length / 2 + 1.1)
    group.add(bow)

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(beam + 0.15, 0.4, length), trimMat)
    stripe.position.y = 1.35
    group.add(stripe)

    const cabinMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.25, metalness: 0.4,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(cabinMat, 1)

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.7, 1.9, 3.4), hullMat)
    cabin.position.set(0, 2.5, -1.4)
    cabin.castShadow = true
    group.add(cabin)

    const glass = new THREE.Mesh(new THREE.BoxGeometry(beam * 0.72, 0.85, 0.12), cabinMat)
    glass.position.set(0, 2.9, 0.34)
    group.add(glass)

    // THE MAST, AND WHY IT IS SHORTER THAN IT WAS.
    //
    // It stood 5.5 units tall from y = 5.2, so the truck reached 7.95 - on a
    // boat 13 units long, which is a mast taller than half the hull and was
    // always out of proportion. It is now 2.4 from y = 3.15, topping out at
    // 4.35, which is BOAT_AIR_DRAFT in bridgeDeck.js.
    //
    // That number is a contract, not a preference: the navigable channel under
    // an arched deck gives 5.18 of clear air, so this leaves 0.83 - and
    // tests/elevated.mjs reads this file as text to check the two still agree,
    // because World.js needs a browser and cannot be run in the suite. Raise
    // the mast here without raising it there and the boats go through the
    // bridges again, which is the bug this whole change exists to fix.
    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 2.4, 6), trimMat)
    mast.position.set(0, 3.15, -1.4)
    group.add(mast)

    return group
  }

  /**
   * Sail the fleet, then place the hulls.
   *
   * The heading is turned TOWARDS where the ship should be pointing rather
   * than set to it, at a fixed rate. Two things need that: a lane waypoint,
   * where a straight set would pivot a 46-unit ship on the spot, and leaving
   * a berth, where the ship has to come round 180 degrees. Rate-limiting it
   * turns both into something that looks like a vessel manoeuvring.
   */
  updateShips(delta) {
    if (!this.ships || !this.ships.length) return

    stepShips(this.seaGraph, this.ships, delta)

    for (const ship of this.ships) {
      const at = shipPosition(this.seaGraph, ship)

      // Shortest way round to the target heading
      let turn = at.heading - ship.heading
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2

      const rate = (ship.kind === 'cargo' ? 0.25 : 0.55) * delta
      ship.heading += Math.max(-rate, Math.min(rate, turn))

      // A slow lift and roll, so a moored ship isn't a static prop. Phased
      // off the position so neighbouring ships aren't in lockstep.
      const phase = this.elapsed * 0.55 + (at.x + at.z) * 0.03
      const swell = at.docked ? 0.25 : 0.55

      // SEA_LEVEL, not zero. The hulls are modelled with their waterline at
      // local y = 0 - the cargo ship's boot topping, the dark band a real ship
      // wears at the waterline, straddles it from -0.75 to +0.35 - so leaving
      // the group at world zero floated the whole fleet exactly 1.4 units
      // clear of the water it was supposed to be sitting in.
      ship.mesh.position.set(at.x, SEA_LEVEL + Math.sin(phase) * swell * 0.5, at.z)
      ship.mesh.rotation.y = ship.heading
      ship.mesh.rotation.z = Math.sin(phase * 0.8) * swell * 0.035
      ship.mesh.rotation.x = Math.sin(phase * 1.3 + 1) * swell * 0.02
    }
  }

  // -------------------------------------------------------------
  // Decoration
  // -------------------------------------------------------------

  /**
   * Populate an island. Explicit districts are placed first, then the
   * island's theme fills whatever space is left over.
   */
  decorateIsland(island, roads) {
    // Hand-placed buildings go down first and claim their footprint, so
    // nothing scattered afterwards lands on top of them.
    //
    // The monorail's piers and stair towers are already on the list. They
    // were worked out before anything was built precisely so that they
    // could be: a building through a pier is not something you can fix
    // afterwards.
    this.placedFootprints = this.monorailFootprints(island)
    for (const building of island.buildings || []) {
      this.buildPlacedBuilding(island, building)
    }

    // Then the town: rows of buildings squared up to the streets.
    //
    // Anything you placed by hand wins, because these are generated and
    // yours aren't - a plot that would land on one of your buildings is
    // dropped rather than built through it.
    // Every building in the world comes from a plot, and a plot is always
    // squared up to a kerb at a constant setback. Nothing is placed at a
    // random angle any more: `mixed` islands used to get theirs from the
    // scatter, so CONTACT was a field of houses pointing every which way
    // while the towns next door were laid out in rows.
    const plots = getTownPlots(island)
    const roadside = getRoadsidePlots(island)

    for (const plot of [...plots, ...roadside]) {
      if (!this.clearOfPlaced(plot.x, plot.z)) continue
      this.buildPlacedBuilding(island, {
        ...plot,
        floors: 2 + Math.floor(this.rand() * 4)
      })
    }

    for (const district of island.districts || []) {
      this.buildDistrict(island, district, roads)
    }

    // A town gets its furniture from the street dressing, which knows where
    // the pavements are. Everywhere else gets the scatter - which now fills
    // in AROUND the rows of buildings rather than laying them out: trees,
    // bushes, rocks, huts. It no longer places a single building.
    if (plots.length) this.dressStreets(island, roads, plots)
    else this.scatterTheme(island, roads)

    const palmCount = island.palms !== undefined ? island.palms : 8
    if (palmCount > 0) this.ringOfPalms(island, palmCount, roads)

    // `bare: true` means no sown ground cover - no wildflowers, no seasonal
    // decorations. It is set on the two motorsport islands, for two reasons
    // that happen to agree.
    //
    // The content reason: a stunt park and a racing circuit are GRADED. Every
    // square metre is engineered - hardstanding, gravel trap, banking - and a
    // meadow growing up through it reads as a field somebody left a ramp in.
    //
    // The mechanical reason, which is why this is a flag rather than a
    // judgement call inside sowFlowers(): these two sowings are the last thing
    // an island does, and on a plain, road-less island they are the ONLY draws
    // it makes from the world's random sequence. That sequence is shared and
    // positional - see rand() - so a few hundred draws here would move every
    // container's colour, every ship's deck cargo and every traffic car's
    // paint, right across the world. Skipping them is what lets two islands be
    // added with the other six coming out byte for byte identical, which is a
    // thing a test can assert rather than a thing to hope for.
    // See tools/mapFingerprint.mjs.
    if (island.bare) return

    this.sowFlowers(island, roads)
    this.sowDecorations(island, roads)
  }

  /**
   * Where spring flowers will come up on this island.
   *
   * Nothing is built here - only positions are collected, and createFlowers()
   * turns the lot into two instanced meshes at the end of the build. That
   * matters for load time: this is the last thing that runs per island and it
   * is by far the cheapest way to add several thousand objects to the world.
   *
   * Sampled AFTER everything else on the island, so isBuildable() already
   * knows about every road, every hand-placed building and every monorail
   * pier - flowers grow in the gaps that are left, which is what flowers do.
   */
  sowFlowers(island, roads) {
    const reach = islandReach(island)
    const area = Math.PI * reach * reach
    const sites = Math.round(area / 70)

    for (let i = 0; i < sites; i++) {
      const a = this.rand() * Math.PI * 2
      const d = this.randRange(6, reach)
      const x = island.x + Math.sin(a) * d
      const z = island.z + Math.cos(a) * d

      // 0.9 rather than the default 1.5: a flower is allowed closer to the
      // kerb than a tree is, and the verge is where they look best.
      if (!this.isBuildable(island, roads, x, z, 0.9)) continue

      this.flowerSites.push({
        x, z,
        y: this.groundAt(x, z),
        rotation: this.rand() * Math.PI * 2,
        size: this.randRange(0.7, 1.25),
        colour: this.pick(FLOWER_COLOURS)
      })
    }
  }

  /**
   * Where holiday decorations can go on this island.
   *
   * A separate, much sparser sowing than the flowers rather than a reuse of
   * theirs. Flowers are a field you look across; a decoration is an object
   * you come across, and at flower density an Easter lawn is a carpet of eggs
   * rather than a hunt.
   *
   * `roll` is drawn once, here, and every kind then takes the sites below its
   * own share. That is what keeps the turkeys sparse and the eggs thick
   * WITHOUT a second sowing per kind - and, more usefully, it means the
   * bunnies always appear in the same places rather than moving about
   * whenever another kind is added in front of them in the draw order.
   */
  sowDecorations(island, roads) {
    const reach = islandReach(island)
    const area = Math.PI * reach * reach
    const sites = Math.round(area / DECOR_SITE_AREA)

    for (let i = 0; i < sites; i++) {
      const a = this.rand() * Math.PI * 2
      const d = this.randRange(6, reach)
      const x = island.x + Math.sin(a) * d
      const z = island.z + Math.cos(a) * d

      if (!this.isBuildable(island, roads, x, z, 1.7)) continue

      this.decorSites.push({
        x, z,
        y: this.groundAt(x, z),
        rotation: this.rand() * Math.PI * 2,
        // Well over life size, and deliberately.
        //
        // Authored at true scale first - an egg 44cm across, a pumpkin 60 -
        // and driving past a lawn at speed you could not tell there was
        // anything on it. Photographed, an Easter island was a single yellow
        // pixel on a verge. The world's own scale is the reason: a car here
        // is 4.4 long and the buildings are ten and up, so a real egg is
        // sub-pixel from the road, and the road is where you always are. At
        // roughly twice size they read as decorations you can go and look at,
        // which is the whole point of putting them out.
        size: this.randRange(1.9, 2.5),
        roll: this.rand(),
        egg: this.pick(EGG_COLOURS),
        gift: this.pick(GIFT_COLOURS)
      })
    }
  }

  /**
   * The spring flower field: a clump of stems and heads at every sown site.
   *
   * They do not appear and disappear - they GROW. The whole field is scaled
   * from zero at its base by the season's flower amount, so through spring
   * they push up out of the ground and through summer they die back down
   * into it. That is also why they cost nothing out of season: an instanced
   * mesh that is not visible is not drawn.
   */
  createFlowers() {
    const count = this.flowerSites.length * FLOWERS_PER_CLUMP
    if (!count) return

    // Authored with the base at the origin, so scaling grows them out of the
    // ground rather than shrinking them toward their own middle.
    const stemGeo = new THREE.CylinderGeometry(0.028, 0.045, 1, 4)
    stemGeo.translate(0, 0.5, 0)
    const headGeo = new THREE.IcosahedronGeometry(0.17, 0)
    headGeo.translate(0, 1.06, 0)

    const stemMat = new THREE.MeshStandardMaterial({
      color: 0x4f8f3e, roughness: 0.95, flatShading: true
    })
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.8, flatShading: true
    })

    this.flowerStems = new THREE.InstancedMesh(stemGeo, stemMat, count)
    this.flowerHeads = new THREE.InstancedMesh(headGeo, headMat, count)
    this.flowerStems.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.flowerHeads.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.flowerStems.frustumCulled = false
    this.flowerHeads.frustumCulled = false

    // Each sown site becomes a small clump, so the field reads as dense
    // without sampling the ground thousands more times.
    this.flowerInstances = []
    const colour = new THREE.Color()
    let n = 0
    for (const site of this.flowerSites) {
      for (let j = 0; j < FLOWERS_PER_CLUMP; j++) {
        const a = this.rand() * Math.PI * 2
        const d = this.randRange(0, 0.55)
        const x = site.x + Math.sin(a) * d
        const z = site.z + Math.cos(a) * d
        this.flowerInstances.push({
          x, y: this.groundAt(x, z), z,
          rotation: site.rotation + this.rand(),
          size: site.size * this.randRange(0.75, 1.15)
        })
        this.flowerHeads.setColorAt(n, colour.setHex(site.colour))
        n++
      }
    }
    this.flowerHeads.instanceColor.needsUpdate = true

    this.game.add(this.flowerStems)
    this.game.add(this.flowerHeads)

    this.flowerField = this.registerField(
      'flowers', [this.flowerStems, this.flowerHeads], this.flowerInstances)
  }

  // -------------------------------------------------------------
  // Fields that grow
  // -------------------------------------------------------------
  /**
   * A set of instanced meshes that share one list of placements and one
   * amount, and grow out of the ground together.
   *
   * This is the spring flower field, generalised - not a second copy of it.
   * The holiday decorations want exactly the same behaviour and it would have
   * been quicker to write a second version than to lift this one out, which
   * is precisely how a codebase ends up with two implementations of the same
   * idea that then disagree. Rule 1.
   *
   * Every part gets the SAME matrix, so a prop made of several pieces has to
   * be authored with each piece already translated into place relative to the
   * base at the origin. That is what makes a bunny four instanced meshes and
   * not four transforms to keep in step.
   */
  registerField(name, parts, instances, scale = 1) {
    const field = { name, parts, instances, amount: -1, scale }
    for (const part of parts) {
      part.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
      part.frustumCulled = false
    }
    this.fields.push(field)
    this.growField(field, 0)
    return field
  }

  /**
   * Grow a field to `amount`, 0 (nothing there) to 1 (fully out).
   *
   * The matrices are rewritten only when the amount has actually moved.
   * Spring takes a couple of minutes to arrive and then the number sits
   * still, so this writes for a few seconds a year and costs nothing for the
   * rest of it - which is the difference between an instanced field being
   * free and it being the most expensive thing on the frame.
   */
  growField(field, amount) {
    if (!field || !field.parts.length) return

    // Snapped to exactly nothing once it is nearly nothing. The easing is
    // exponential and never actually reaches zero, so without this a field
    // that has been turned off sits at 0.003 for ever - invisible, but with
    // its state saying "very slightly on". That is the sort of almost-off
    // that eventually gets read as on by something else.
    let a = Math.max(0, Math.min(1, amount))
    if (a < 0.02) a = 0
    if (Math.abs(a - field.amount) < 0.004 && a !== 0) return
    if (a === field.amount) return
    field.amount = a

    // Below this it is not worth drawing, and - more to the point - a field
    // scaled to zero still costs a draw call if it is left visible.
    const visible = a > 0
    for (const part of field.parts) part.visible = visible
    if (!visible) return

    const m = this._fieldMatrix || (this._fieldMatrix = new THREE.Matrix4())
    const q = this._fieldQuat || (this._fieldQuat = new THREE.Quaternion())
    const p = this._fieldPos || (this._fieldPos = new THREE.Vector3())
    const s = this._fieldScale || (this._fieldScale = new THREE.Vector3())
    const up = this._fieldUp || (this._fieldUp = new THREE.Vector3(0, 1, 0))

    for (let i = 0; i < field.instances.length; i++) {
      const f = field.instances[i]
      const grow = f.size * a * field.scale
      p.set(f.x, f.y, f.z)
      q.setFromAxisAngle(up, f.rotation)
      s.set(grow, grow, grow)
      m.compose(p, q, s)
      for (const part of field.parts) part.setMatrixAt(i, m)
    }

    for (const part of field.parts) part.instanceMatrix.needsUpdate = true
  }

  /** Grow the flower field. Kept as its own name because seasons.js asks for it. */
  setFlowering(amount) {
    this.growField(this.flowerField, amount)
  }

  // -------------------------------------------------------------
  // Holiday decorations
  // -------------------------------------------------------------
  /**
   * A prop made of several pieces, as a set of instanced meshes.
   *
   * Each piece's geometry is translated into place at build time, so all of
   * them take the same instance matrix. That is why there is no merge step
   * and no dependency on BufferGeometryUtils: three small instanced meshes
   * drawing the same thousand transforms cost three draw calls, and merging
   * them would cost a per-vertex copy of the whole prop for no visible gain.
   *
   * `tint` names which colour off the site to use, or is left out for a prop
   * that is always the same colour - a pumpkin is orange and a turkey is
   * brown, and giving them a palette would be inventing variety rather than
   * finding it.
   */
  decorPart(geometry, colour, count,
            { rough = 0.9, tint = null, sites = null, ghostly = false } = {}) {
    const material = new THREE.MeshStandardMaterial({
      color: colour, roughness: rough, flatShading: true,
      // A sheet you can see through. Not a subtlety: a translucent white
      // figure cannot be mistaken for a snowman, whatever its shape.
      // depthWrite stays off so the parts do not cut holes in each other.
      ...(ghostly
        ? { transparent: true, opacity: 0.72, depthWrite: false }
        : {})
    })
    const mesh = new THREE.InstancedMesh(geometry, material, count)

    if (tint && sites) {
      const c = new THREE.Color()
      for (let i = 0; i < sites.length; i++) mesh.setColorAt(i, c.setHex(sites[i][tint]))
      mesh.instanceColor.needsUpdate = true
    }

    this.game.add(mesh)
    return mesh
  }

  /**
   * Build every holiday field, once, from the sites the islands collected.
   *
   * Authored with the base at the origin in each case, so the field grows up
   * out of the ground rather than swelling from its own middle - the same
   * rule the flowers follow, and the reason a half-grown egg looks like an
   * egg coming up rather than a small egg.
   */
  createDecorations() {
    if (!this.decorSites.length) return

    const take = (kind) =>
      this.decorSites.filter(s => s.roll < DECOR_SHARE[kind])

    // --- Easter eggs: an ovoid, in one of six pastel colours ---
    const eggSites = take('eggs')
    if (eggSites.length) {
      const egg = new THREE.SphereGeometry(0.22, 8, 6)
      egg.scale(1, 1.35, 1)
      egg.translate(0, 0.3, 0)
      this.eggField = this.registerField('eggs', [
        this.decorPart(egg, 0xffffff, eggSites.length,
          { rough: 0.45, tint: 'egg', sites: eggSites })
      ], eggSites)
    }

    // --- Easter bunnies: body, head and two ears ---
    const bunnySites = take('bunnies')
    if (bunnySites.length) {
      const fur = 0xf2ece2
      const body = new THREE.SphereGeometry(0.3, 8, 6); body.translate(0, 0.3, 0)
      const head = new THREE.SphereGeometry(0.19, 8, 6); head.translate(0, 0.6, 0.2)
      const earL = new THREE.CapsuleGeometry(0.055, 0.26, 2, 5)
      earL.translate(-0.09, 0.85, 0.16)
      const earR = earL.clone(); earR.translate(0.18, 0, 0)
      this.bunnyField = this.registerField('bunnies', [
        this.decorPart(body, fur, bunnySites.length),
        this.decorPart(head, fur, bunnySites.length),
        this.decorPart(earL, fur, bunnySites.length),
        this.decorPart(earR, fur, bunnySites.length)
      ], bunnySites)
    }

    // --- Jack-o'-lanterns: squashed, with a stem and a face that lights ---
    const pumpkinSites = take('pumpkins')
    if (pumpkinSites.length) {
      const body = new THREE.SphereGeometry(0.32, 9, 6)
      body.scale(1, 0.78, 1)
      body.translate(0, 0.25, 0)
      const stem = new THREE.CylinderGeometry(0.035, 0.055, 0.16, 5)
      stem.translate(0, 0.52, 0)

      // The carving. Two triangular eyes and a grin, sitting just proud of the
      // skin and glowing after dark - which is the whole difference between a
      // pumpkin and a jack-o'-lantern. On the festive list, so they light on
      // the same dusk curve as everything else and go out with the holiday.
      const faceMat = new THREE.MeshStandardMaterial({
        color: 0xffb03a, roughness: 0.5, flatShading: true,
        emissive: new THREE.Color(0xffa42a), emissiveIntensity: 0
      })
      this.registerNightLight(faceMat, 2.8, true)

      const carved = []
      for (const eye of [-0.11, 0.11]) {
        const g = new THREE.ConeGeometry(0.075, 0.11, 3)
        g.rotateX(Math.PI / 2)
        g.translate(eye, 0.31, 0.3)
        carved.push(g)
      }
      const grin = new THREE.BoxGeometry(0.24, 0.06, 0.04)
      grin.translate(0, 0.17, 0.3)
      carved.push(grin)
      for (const tooth of [-0.06, 0.06]) {
        const g = new THREE.BoxGeometry(0.05, 0.09, 0.04)
        g.translate(tooth, 0.21, 0.3)
        carved.push(g)
      }

      this.pumpkinField = this.registerField('pumpkins', [
        this.decorPart(body, 0xe8761f, pumpkinSites.length, { rough: 0.7 }),
        this.decorPart(stem, 0x4f6b32, pumpkinSites.length),
        ...carved.map(g => {
          const m = new THREE.InstancedMesh(g, faceMat, pumpkinSites.length)
          this.game.add(m)
          return m
        })
      ], pumpkinSites)
    }

    // --- Ghosts ---
    //
    // REDESIGNED, because the first ones were snowmen. Mike sent a photograph
    // of an autumn Halloween street and said "there are still snowmen in this
    // setting" - and the snowman field was measured at amount 0 and not drawn.
    // They were these. A white sphere on a white cone, sitting on the grass
    // with two dark dots on its face, IS a snowman; nothing about it said
    // ghost except my intention.
    //
    // Five things fix it, and every one of them is a thing a snowman cannot
    // do: it FLOATS with a gap underneath, it TAPERS to a tattered hem instead
    // of bulging, it has ARMS out to the sides, it has an open MOUTH as well
    // as eyes, and you can see through it. The last one alone would nearly do
    // it - a translucent snowman is not a snowman - but the silhouette is what
    // reads at distance, and the silhouette is the float and the taper.
    const ghostSites = take('ghosts')
    if (ghostSites.length) {
      const HOVER = 0.55

      const head = new THREE.SphereGeometry(0.34, 9, 7)
      head.scale(1, 1.1, 1)
      head.translate(0, HOVER + 1.28, 0)

      // Narrowing DOWNWARD - wide at the shoulders, thin at the tail. The old
      // one was a cone the other way up, which is the shape of a snowman's
      // body and the opposite of a hanging sheet.
      const body = new THREE.CylinderGeometry(0.4, 0.17, 1.0, 9)
      body.translate(0, HOVER + 0.62, 0)

      // A tattered hem: three points trailing off the bottom at different
      // lengths, so the edge is ragged rather than a rim.
      const hem = []
      for (const [i, a] of [0.5, 2.6, 4.6].entries()) {
        const g = new THREE.ConeGeometry(0.13, 0.45 + i * 0.12, 5)
        g.rotateX(Math.PI)
        g.translate(Math.cos(a) * 0.13, HOVER + 0.05 - i * 0.04, Math.sin(a) * 0.13)
        hem.push(g)
      }

      // Sleeves, out and slightly up - the pose is the whole joke.
      const arms = []
      for (const side of [1, -1]) {
        const g = new THREE.CapsuleGeometry(0.11, 0.42, 3, 7)
        g.rotateZ(side * 1.15)
        g.translate(side * 0.5, HOVER + 0.95, 0)
        arms.push(g)
      }

      const faceMat = new THREE.MeshStandardMaterial({
        color: 0x14141c, roughness: 0.95, flatShading: true
      })
      const face = []
      for (const e of [-0.13, 0.13]) {
        const g = new THREE.SphereGeometry(0.07, 6, 5)
        g.scale(1, 1.25, 1)
        g.translate(e, HOVER + 1.36, 0.29)
        face.push(g)
      }
      // The mouth. Two dots on their own are eyes on a snowman; a dark open
      // mouth under them is a ghost saying boo, and it is the cheapest single
      // thing that tells them apart close up.
      const mouth = new THREE.SphereGeometry(0.11, 7, 6)
      mouth.scale(1, 1.35, 0.6)
      mouth.translate(0, HOVER + 1.13, 0.28)
      face.push(mouth)

      const sheet = 0xeef2fb
      this.ghostField = this.registerField('ghosts', [
        this.decorPart(head, sheet, ghostSites.length, { rough: 0.95, ghostly: true }),
        this.decorPart(body, sheet, ghostSites.length, { rough: 0.95, ghostly: true }),
        ...hem.map(g => this.decorPart(g, sheet, ghostSites.length,
          { rough: 0.95, ghostly: true })),
        ...arms.map(g => this.decorPart(g, sheet, ghostSites.length,
          { rough: 0.95, ghostly: true })),
        ...face.map(g => {
          const m = new THREE.InstancedMesh(g, faceMat, ghostSites.length)
          this.game.add(m)
          return m
        })
      ], ghostSites, DECOR_SCALE.ghosts)
    }

    // --- Witches: hat, robe, and a green face ---
    const witchSites = take('witches')
    if (witchSites.length) {
      const robe = new THREE.ConeGeometry(0.5, 1.5, 8)
      robe.translate(0, 0.75, 0)
      const head = new THREE.SphereGeometry(0.24, 8, 6)
      head.translate(0, 1.62, 0)
      const brim = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 10)
      brim.translate(0, 1.83, 0)
      const hat = new THREE.ConeGeometry(0.3, 0.85, 8)
      hat.translate(0, 2.25, 0)
      // A broom, because a witch without one is a person in a hat.
      const handle = new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5)
      handle.rotateZ(0.42)
      handle.translate(0.52, 0.95, 0.16)
      const bristles = new THREE.ConeGeometry(0.19, 0.5, 6)
      bristles.rotateZ(0.42 + Math.PI)
      bristles.translate(0.9, 0.12, 0.16)

      this.witchField = this.registerField('witches', [
        this.decorPart(robe, 0x2b2140, witchSites.length, { rough: 0.9 }),
        this.decorPart(head, 0x74b05a, witchSites.length, { rough: 0.8 }),
        this.decorPart(brim, 0x17141f, witchSites.length),
        this.decorPart(hat, 0x17141f, witchSites.length),
        this.decorPart(handle, 0x7a5a33, witchSites.length),
        this.decorPart(bristles, 0xb9873f, witchSites.length, { rough: 0.95 })
      ], witchSites, DECOR_SCALE.witches)
    }

    // --- Gravestones, in the grass ---
    const graveSites = take('graves')
    if (graveSites.length) {
      // A slab with a rounded top, and a mound in front of it. Leaning
      // slightly - a headstone standing perfectly true reads as a bollard.
      const slab = new THREE.BoxGeometry(0.7, 0.95, 0.16)
      slab.translate(0, 0.48, 0)
      const top = new THREE.CylinderGeometry(0.35, 0.35, 0.16, 10, 1, false, 0, Math.PI)
      top.rotateZ(Math.PI / 2)
      top.rotateY(Math.PI / 2)
      top.translate(0, 0.95, 0)
      const mound = new THREE.SphereGeometry(0.5, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2)
      mound.scale(1, 0.35, 1.5)
      mound.translate(0, 0.02, 0.55)

      this.graveField = this.registerField('graves', [
        this.decorPart(slab, 0x8a8d92, graveSites.length, { rough: 0.95 }),
        this.decorPart(top, 0x8a8d92, graveSites.length, { rough: 0.95 }),
        this.decorPart(mound, 0x5b4a33, graveSites.length, { rough: 1 })
      ], graveSites, DECOR_SCALE.graves)
    }

    // --- HAPPY HALLOWEEN signs ---
    const signSites = take('signs')
    if (signSites.length) {
      const post = new THREE.BoxGeometry(0.09, 1.15, 0.09)
      post.translate(0, 0.58, 0)
      const posts = [-0.62, 0.62].map(x => {
        const g = post.clone()
        g.translate(x, 0, 0)
        return g
      })
      const board = new THREE.BoxGeometry(1.7, 0.62, 0.07)
      board.translate(0, 1.45, 0)

      this.signField = this.registerField('signs', [
        ...posts.map(g => this.decorPart(g, 0x4a3624, signSites.length)),
        this.signBoard(board, signSites.length)
      ], signSites, DECOR_SCALE.signs)
    }

    // --- Turkeys: body, head, and the fan ---
    const turkeySites = take('turkeys')
    if (turkeySites.length) {
      const body = new THREE.SphereGeometry(0.28, 8, 6)
      body.scale(1, 0.9, 1.15)
      body.translate(0, 0.29, 0.04)
      const head = new THREE.SphereGeometry(0.12, 7, 5)
      head.translate(0, 0.56, 0.22)
      // The fan is a flattened half-sphere standing up behind: a cone would
      // read as a tail down rather than a tail up, which is the whole
      // silhouette of the bird.
      const fan = new THREE.SphereGeometry(0.42, 9, 6, 0, Math.PI)
      fan.scale(1, 1, 0.12)
      fan.rotateY(Math.PI)
      fan.translate(0, 0.44, -0.2)
      this.turkeyField = this.registerField('turkeys', [
        this.decorPart(body, 0x6d4526, turkeySites.length),
        this.decorPart(head, 0xc4462f, turkeySites.length),
        this.decorPart(fan, 0x8c5a2e, turkeySites.length)
      ], turkeySites)
    }

    // --- Gifts: a box and a ribbon across it ---
    const giftSites = take('gifts')
    if (giftSites.length) {
      const box = new THREE.BoxGeometry(0.46, 0.4, 0.46)
      box.translate(0, 0.2, 0)
      // 0.21, not 0.2: the ribbon is 0.42 tall, so centring it at 0.2 puts a
      // centimetre of it under the ground. Nobody would ever see it - and
      // that is exactly why it is worth fixing, because "base at the origin"
      // is the rule the whole growing field depends on and an exception that
      // does not show is an exception that gets copied.
      const bandX = new THREE.BoxGeometry(0.48, 0.42, 0.09)
      bandX.translate(0, 0.21, 0)
      const bandZ = new THREE.BoxGeometry(0.09, 0.42, 0.48)
      bandZ.translate(0, 0.21, 0)
      this.giftField = this.registerField('gifts', [
        this.decorPart(box, 0xffffff, giftSites.length,
          { rough: 0.6, tint: 'gift', sites: giftSites }),
        this.decorPart(bandX, 0xf3e2b0, giftSites.length, { rough: 0.5 }),
        this.decorPart(bandZ, 0xf3e2b0, giftSites.length, { rough: 0.5 })
      ], giftSites)
    }

    // --- Christmas trees: three tiers, a star, and a trunk ---
    const treeSites = take('trees')
    if (treeSites.length) {
      const trunk = new THREE.CylinderGeometry(0.11, 0.14, 0.42, 6)
      trunk.translate(0, 0.21, 0)
      const tiers = []
      for (const [i, [r, h, y]] of [[0.62, 0.75, 0.38], [0.46, 0.62, 0.86],
                                    [0.3, 0.5, 1.28]].entries()) {
        const cone = new THREE.ConeGeometry(r, h, 7)
        cone.translate(0, y + h / 2, 0)
        tiers.push(cone)
      }
      const star = new THREE.OctahedronGeometry(0.15, 0)
      star.translate(0, 1.86, 0)

      // LIGHTS ON THE TREE. Mike: "It's too dark at night" - and it was: a
      // dark green cone under a night sky is a silhouette, and the star alone
      // is one bright dot on it.
      //
      // Spiralling down rather than ringed, because a ring per tier reads as a
      // hoop and a spiral reads as a string that was wound on. One part per
      // bulb: they cannot share a geometry without merging, and nine extra
      // instanced meshes over seventy-odd trees is cheaper than the merge.
      const treeBulbs = []
      for (let k = 0; k < TREE_BULBS; k++) {
        const t = k / (TREE_BULBS - 1)
        const angle = k * 2.4
        // Following the taper, and just proud of the foliage so the bulb sits
        // ON the branch rather than inside it.
        const radius = 0.62 * (1 - t * 0.62) + 0.06
        const g = new THREE.SphereGeometry(0.075, 5, 4)
        g.translate(Math.cos(angle) * radius, 0.55 + t * 1.15,
                    Math.sin(angle) * radius)
        treeBulbs.push({ geometry: g, colour: k % FESTIVE_COLOURS.length })
      }

      // The star is on the festive list, so it lights with everything else
      // rather than being the one dark thing on a lit tree.
      const starMat = new THREE.MeshStandardMaterial({
        color: 0xffd75e, roughness: 0.35, flatShading: true,
        emissive: new THREE.Color(0xffdf7a), emissiveIntensity: 0
      })
      this.registerNightLight(starMat, 2.2, true)
      const starMesh = new THREE.InstancedMesh(star, starMat, treeSites.length)
      this.game.add(starMesh)

      // One material per colour, shared by every bulb of that colour, so the
      // whole string is three entries on the festive list rather than nine.
      const bulbMats = FESTIVE_COLOURS.map(hex => {
        const m = new THREE.MeshStandardMaterial({
          color: hex, roughness: 0.4, flatShading: true,
          emissive: new THREE.Color(hex), emissiveIntensity: 0
        })
        this.registerNightLight(m, 2.4, true)
        return m
      })

      const bulbMeshes = treeBulbs.map(b => {
        const mesh = new THREE.InstancedMesh(
          b.geometry, bulbMats[b.colour], treeSites.length)
        this.game.add(mesh)
        return mesh
      })

      this.treeField = this.registerField('trees', [
        this.decorPart(trunk, 0x6b4a2a, treeSites.length),
        // Lifted from 0x225c30. Unlit at night the old green went almost to
        // black and the tree read as a hole in the snow.
        ...tiers.map(t => this.decorPart(t, 0x2d7a3c, treeSites.length, { rough: 0.9 })),
        starMesh,
        ...bulbMeshes
      ], treeSites, DECOR_SCALE.trees)
    }

    // --- Snowmen: winter, not Christmas ---
    //
    // On the SEASON, deliberately. A snowman is what happens when there is
    // snow on the ground, not what happens on the 25th, and putting it in the
    // holiday table would mean no snowmen in January and a snowman in a green
    // Christmas. It is driven by the same `snow` number that whitens the
    // grass, so they appear as the world goes white and melt as it thaws -
    // which is exactly what they should do and cost nothing extra to arrange.
    const snowmanSites = take('snowmen')
    if (snowmanSites.length) {
      const base = new THREE.SphereGeometry(0.52, 8, 6); base.translate(0, 0.5, 0)
      const middle = new THREE.SphereGeometry(0.38, 8, 6); middle.translate(0, 1.24, 0)
      const head = new THREE.SphereGeometry(0.27, 8, 6); head.translate(0, 1.8, 0)
      const hat = new THREE.CylinderGeometry(0.2, 0.2, 0.28, 8); hat.translate(0, 2.1, 0)
      const brim = new THREE.CylinderGeometry(0.32, 0.32, 0.05, 8); brim.translate(0, 1.97, 0)
      const nose = new THREE.ConeGeometry(0.06, 0.3, 5)
      nose.rotateX(Math.PI / 2)
      nose.translate(0, 1.82, 0.3)
      const arms = []
      for (const side of [1, -1]) {
        const arm = new THREE.CylinderGeometry(0.045, 0.045, 0.8, 5)
        arm.rotateZ(side * 1.1)
        arm.translate(side * 0.46, 1.42, 0)
        arms.push(arm)
      }

      const white = 0xf4f8fb
      this.snowmanField = this.registerField('snowmen', [
        this.decorPart(base, white, snowmanSites.length, { rough: 0.95 }),
        this.decorPart(middle, white, snowmanSites.length, { rough: 0.95 }),
        this.decorPart(head, white, snowmanSites.length, { rough: 0.95 }),
        this.decorPart(hat, 0x27272c, snowmanSites.length),
        this.decorPart(brim, 0x27272c, snowmanSites.length),
        this.decorPart(nose, 0xe4762a, snowmanSites.length),
        ...arms.map(a => this.decorPart(a, 0x6b4a2a, snowmanSites.length))
      ], snowmanSites, DECOR_SCALE.snowmen)
    }

    this.createFestiveLights()
  }

  /**
   * The board of a HAPPY HALLOWEEN sign.
   *
   * Painted onto a canvas rather than built out of boxes, because the sign has
   * to actually say something and there is no low-poly way to spell. One
   * canvas, one texture, one material, shared by every sign in the world - the
   * text is identical on all of them, so anything else would be paying per
   * instance for a picture that never changes.
   */
  signBoard(geometry, count) {
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 192
    const ctx = canvas.getContext('2d')

    ctx.fillStyle = '#1b1220'
    ctx.fillRect(0, 0, 512, 192)
    ctx.strokeStyle = '#e8761f'
    ctx.lineWidth = 12
    ctx.strokeRect(10, 10, 492, 172)

    ctx.fillStyle = '#ff8c2b'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 62px Georgia, serif'
    ctx.fillText('HAPPY', 256, 64)
    ctx.fillText('HALLOWEEN', 256, 132)

    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4

    const material = new THREE.MeshStandardMaterial({
      map: texture, roughness: 0.75, flatShading: true,
      // Lit like everything else on the festive list, so the sign is readable
      // after dark instead of being the one Halloween decoration you cannot
      // see at Halloween.
      emissive: new THREE.Color(0xff8c2b),
      emissiveMap: texture,
      emissiveIntensity: 0
    })
    this.registerNightLight(material, 1.5, true)

    const mesh = new THREE.InstancedMesh(geometry, material, count)
    this.game.add(mesh)
    return mesh
  }

  /**
   * Festive lights: a strand of bulbs round the eaves of every building.
   *
   * The bulbs are ordinary emissive materials on the night-emissive list, not
   * a second lighting system - so they fade up at dusk with every other lit
   * thing in the world and there is still exactly one answer to "how dark is
   * it". What the holiday layer contributes is a MULTIPLIER on that, applied
   * in setTimeOfDay: at Christmas the strand is at full strength, in March it
   * is at nothing, and the geometry is scaled away with it so an unlit bulb is
   * not a dark speck on every roofline for eleven months of the year.
   */
  createFestiveLights() {
    if (!this.buildings.length) return

    const strands = FESTIVE_COLOURS.map(() => [])
    this.wreathSites = []
    this.doorSites = []

    // The RUNS, as polylines - which is the thing that was missing.
    //
    // Mike: the lights "still seem detached from the buildings, making them
    // look like floating balls in space." They were floating: a bulb was a
    // coloured sphere at a computed point and there was nothing else there.
    // No flex, no socket, nothing joining one bulb to the next.
    //
    // The bulbs cannot carry the wire themselves. They are sorted into three
    // INSTANCED meshes by colour, so consecutive bulbs along one string live
    // in different meshes and none of them knows where its neighbour is. So
    // the path is recorded here as it is walked, and the flex is built from
    // the paths afterwards as a single mesh.
    const runs = []

    for (const b of this.buildings) {
      // Round the top of the walls, just under the roof line. Following the
      // rectangle rather than a circle matters: a ring of bulbs floating
      // clear of the corners of a square building reads as a halo.
      const hw = b.width / 2 + 0.12
      const hd = b.depth / 2 + 0.12
      // ON THE GROUND THE BUILDING IS ON.
      //
      // `b.height` is the height the building came out AT, measured from its
      // own base - and addBuilding() puts that base at groundAt(x, z). So
      // every decoration hung off it has to start there too. Without this the
      // whole set is placed at absolute world heights, which is right only
      // where the terrain happens to be at zero: on a slope the lights float
      // over the roof at the top of the hill and sink into the wall at the
      // bottom. It is the habit worldsanity exists to catch, and it slipped in
      // because the buildings I was looking at were on flat ground.
      const foot = this.groundAt(b.x, b.z)
      const y = foot + b.height - 0.35
      if (b.height < 1) continue

      // 1. ALONG THE EAVES, all the way round.
      const eaves = []
      for (let i = 0; i < BULBS_PER_BUILDING; i++) {
        const t = (i / BULBS_PER_BUILDING) * 4
        const side = Math.floor(t)
        const f = t - side
        let x, z
        if (side === 0) { x = -hw + f * 2 * hw; z = -hd }
        else if (side === 1) { x = hw; z = -hd + f * 2 * hd }
        else if (side === 2) { x = hw - f * 2 * hw; z = hd }
        else { x = -hw; z = hd - f * 2 * hd }

        // Bulbs sag a little between their fixings, which is most of what
        // makes a string of lights look like a string rather than a row.
        const sag = Math.sin(f * Math.PI) * 0.14

        const at = { x: b.x + x, y: y - sag, z: b.z + z, rotation: 0, size: 1 }
        strands[i % strands.length].push(at)
        eaves.push(at)
      }
      // Closed, so the flex runs round the last corner back to the first bulb
      // rather than leaving one dark corner on every building in the city.
      if (eaves.length > 1) runs.push([...eaves, eaves[0]])

      // 2. DOWN THE FRONT, framing the windows.
      //
      // The eaves alone put one thin line of colour at the top of a
      // five-storey building and left four storeys of dark wall under it -
      // which is why Mike asked for "a lot lot lot more". A house is lit
      // across its face, not along its gutter.
      //
      // The front is the face the building was rotated to present, which is
      // the street. Every building on every island already knows which way
      // that is; it simply was not written down until the decorations needed
      // it, and hanging lights on all four sides instead would light the
      // backs of terraces into gardens nobody can see.
      const face = b.rotation || 0
      const sf = Math.sin(face)
      const cf = Math.cos(face)
      const onFront = (across, height, out) => ({
        x: b.x + across * cf + (hd + out) * sf,
        y: foot + height,
        z: b.z - across * sf + (hd + out) * cf,
        rotation: 0, size: 1
      })

      const storeys = Math.max(1, Math.floor(b.height / STOREY_HEIGHT))
      let n = 0
      for (let s = 0; s < storeys; s++) {
        // Just above each row of windows, so the light reads as being hung
        // over them rather than floating in the middle of the wall.
        const sillY = (s + 1) * STOREY_HEIGHT - 0.55
        if (sillY > b.height - 0.4) continue
        const across_n = Math.max(2, Math.round(b.width / 1.5))
        const row = []
        for (let i = 0; i <= across_n; i++) {
          const across = -hw + (i / across_n) * 2 * hw
          const swag = Math.sin((i / across_n) * Math.PI) * 0.18
          const at = onFront(across, sillY - swag, 0.12)
          strands[n++ % strands.length].push(at)
          row.push(at)
        }
        if (row.length > 1) runs.push(row)
      }

      // 3. ROUND THE DOOR, which is the bit you drive past at eye level.
      const doorTop = DOOR_HEIGHT + 0.15
      const doorHalf = DOOR_WIDTH / 2 + 0.2
      const arch = []
      for (let i = 0; i <= DOOR_BULBS; i++) {
        const t = i / DOOR_BULBS
        // Up one side, across the top, down the other - an arch rather than a
        // rectangle, because a doorway lit as an arch reads as decorated and
        // one lit as a rectangle reads as a fire exit.
        const angle = Math.PI * t
        const at = onFront(
          -Math.cos(angle) * doorHalf,
          Math.min(doorTop, Math.sin(angle) * doorTop + 0.3),
          0.16)
        strands[n++ % strands.length].push(at)
        arch.push(at)
      }
      if (arch.length > 1) runs.push(arch)

      // 4. THE DOOR ITSELF - a wreath at Christmas, a basket of sweets at
      //    Halloween. One place, two decorations, so they cannot end up on
      //    different doors.
      this.wreathSites.push({
        x: b.x + (hd + 0.22) * sf,
        y: foot + DOOR_HEIGHT * 0.62,
        z: b.z + (hd + 0.22) * cf,
        rotation: face,
        size: 1
      })
      this.doorSites.push({
        x: b.x + (hd + 0.55) * sf,
        y: this.groundAt(b.x + (hd + 0.55) * sf, b.z + (hd + 0.55) * cf),
        z: b.z + (hd + 0.55) * cf,
        rotation: face,
        size: 1
      })
    }

    this.festiveFields = []
    this.strandMaterials = []

    strands.forEach((sites, i) => {
      if (!sites.length) return
      // 0.22, not the 0.085 a real bulb would be. Photographed at true size
      // against a five-storey building they were three or four pixels of
      // colour on a roofline you could not pick out from the window lights -
      // the same lesson the ground decorations taught, in the same world
      // where a car is 4.4 units long.
      // A bulb and its SOCKET, merged into one geometry.
      //
      // The socket is a stub of dark cap sitting where the flex meets the
      // glass, and it is doing more work than its size suggests: a bare
      // sphere has no top and no bottom, so it reads as a ball wherever you
      // put it. Give it a fitting and it reads as hanging from the thing the
      // fitting is attached to. Merged rather than added as a second
      // instanced mesh so there is still one draw call per colour.
      const bulb = this.bulbGeometry(0.22)
      const material = new THREE.MeshStandardMaterial({
        color: FESTIVE_COLOURS[i], roughness: 0.4, flatShading: true,
        // THE EMISSIVE COLOUR, which was the whole bug.
        //
        // Mike: "Christmas Decorations (the lights) should light up. They are
        // currently just colorful balls." Exactly right, and the reason is one
        // missing line. registerNightLight() only ensures the material HAS an
        // emissive colour - and MeshStandardMaterial's default is black. Every
        // other lit thing in the world sets its own emissive explicitly; these
        // did not, so `emissiveIntensity` was faithfully scaling black by 2.6
        // all night and the bulbs stayed unlit paint.
        emissive: new THREE.Color(FESTIVE_COLOURS[i]),
        emissiveIntensity: 0
      })
      this.registerNightLight(material, 2.6, true)
      this.strandMaterials.push(material)
      const mesh = new THREE.InstancedMesh(bulb, material, sites.length)
      this.game.add(mesh)
      // One field per colour, because the three strands hold different
      // placements - they cannot share an instance list.
      this.festiveFields.push(this.registerField(`festive${i}`, [mesh], sites))
    })

    this.buildFestiveFlex(runs)
    this.createWreaths()
    this.createBaskets()
  }

  /**
   * A bulb: a sphere with a cap on top, as one geometry.
   *
   * The cap is not decoration. A sphere on its own has no top and no bottom,
   * so wherever it is put it reads as a ball floating there - which is exactly
   * what Mike reported. A fitting gives it an up, and something for the flex
   * to arrive at.
   */
  bulbGeometry(radius) {
    const glass = new THREE.SphereGeometry(radius, 6, 5)
    // Squashed slightly and dropped, so the cap sits ON it rather than in it.
    glass.scale(1, 0.92, 1)
    glass.translate(0, -radius * 0.28, 0)

    const cap = new THREE.CylinderGeometry(radius * 0.46, radius * 0.6, radius * 0.7, 6)
    cap.translate(0, radius * 0.5, 0)

    // Concatenated by hand rather than with BufferGeometryUtils, which this
    // project does not import anywhere: two position arrays end to end is the
    // whole of what a merge is for two non-indexed, same-attribute meshes.
    const a = glass.toNonIndexed()
    const b = cap.toNonIndexed()
    const pa = a.attributes.position.array
    const pb = b.attributes.position.array
    const na = a.attributes.normal.array
    const nb = b.attributes.normal.array

    const position = new Float32Array(pa.length + pb.length)
    position.set(pa, 0)
    position.set(pb, pa.length)
    const normal = new Float32Array(na.length + nb.length)
    normal.set(na, 0)
    normal.set(nb, na.length)

    const out = new THREE.BufferGeometry()
    out.setAttribute('position', new THREE.BufferAttribute(position, 3))
    out.setAttribute('normal', new THREE.BufferAttribute(normal, 3))
    glass.dispose()
    cap.dispose()
    a.dispose()
    b.dispose()
    return out
  }

  /**
   * The flex the bulbs hang from: every run, as one mesh.
   *
   * ONE mesh for the whole city, not one per building and certainly not one
   * per segment. Five thousand eight hundred bulbs means five thousand eight
   * hundred segments, and at a draw call each that would cost more than
   * everything else on this island put together.
   *
   * Each segment is a CROSS of two thin ribbons rather than a tube. A tube
   * round a 0.03-wide wire is eight triangles that resolve to one pixel; a
   * cross is four, and it cannot disappear when looked at edge-on, which a
   * single ribbon can.
   *
   * It is not part of the growing field machinery. Fields grow by scaling
   * each instance up from the ground, which is right for a pumpkin and
   * meaningless for a wire strung between two fixed points - so the flex
   * simply appears with the lights and goes with them. Since the whole fade
   * takes a couple of minutes once a year, a wire that arrives before its
   * bulbs is the better of the two wrong answers.
   */
  buildFestiveFlex(runs) {
    const positions = []
    const HALF = 0.035
    // The flex meets the bulb's CAP, not its middle. A site is the centre of
    // the glass, and running the wire through there photographs as a string
    // skewered through a row of baubles - which is a different wrong picture
    // from the one this is fixing, not a better one.
    const TO_CAP = 0.15

    for (const run of runs) {
      for (let i = 0; i < run.length - 1; i++) {
        const a = { x: run[i].x, y: run[i].y + TO_CAP, z: run[i].z }
        const b = { x: run[i + 1].x, y: run[i + 1].y + TO_CAP, z: run[i + 1].z }
        const dx = b.x - a.x
        const dy = b.y - a.y
        const dz = b.z - a.z
        const len = Math.hypot(dx, dy, dz)
        // A closed eaves loop repeats its first point at the end, and a
        // degenerate segment is four triangles of nothing with a normal that
        // is a division by zero.
        if (len < 1e-4) continue

        // Two perpendiculars to the run, so the cross stands up whichever way
        // the segment happens to point.
        const ux = dx / len
        const uy = dy / len
        const uz = dz / len
        // Sideways: the run crossed with world up, unless the run IS up.
        let sx = uz
        let sy = 0
        let sz = -ux
        let sl = Math.hypot(sx, sy, sz)
        if (sl < 1e-4) { sx = 1; sy = 0; sz = 0; sl = 1 }
        sx /= sl; sy /= sl; sz /= sl
        // And the third axis, which is the first two crossed.
        const tx = uy * sz - uz * sy
        const ty = uz * sx - ux * sz
        const tz = ux * sy - uy * sx

        for (const [px, py, pz] of [[sx, sy, sz], [tx, ty, tz]]) {
          const a0 = [a.x - px * HALF, a.y - py * HALF, a.z - pz * HALF]
          const a1 = [a.x + px * HALF, a.y + py * HALF, a.z + pz * HALF]
          const b0 = [b.x - px * HALF, b.y - py * HALF, b.z - pz * HALF]
          const b1 = [b.x + px * HALF, b.y + py * HALF, b.z + pz * HALF]
          positions.push(...a0, ...b0, ...b1, ...a0, ...b1, ...a1)
        }
      }
    }

    if (!positions.length) return

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(positions), 3))
    geometry.computeVertexNormals()

    const material = new THREE.MeshStandardMaterial({
      color: 0x22262c, roughness: 0.9, flatShading: true,
      side: THREE.DoubleSide
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    mesh.visible = false
    this.game.add(mesh)
    this.festiveFlex = mesh
  }

  /**
   * A trick-or-treat basket on every doorstep.
   *
   * Built here rather than with the other scattered props because it hangs off
   * `doorSites`, and those are collected by createFestiveLights() when it walks
   * the buildings. Written the other way round first and the baskets simply
   * never appeared: the list was empty at the moment the field was made, so
   * `if (this.doorSites.length)` was false and nothing was built. Nothing threw
   * and nothing looked wrong - the decoration was just absent, which is the
   * quietest way for an ordering mistake to present.
   */
  createBaskets() {
    if (!this.doorSites.length) return
    // --- Trick-or-treat baskets, on the doorsteps ---
      const pail = new THREE.CylinderGeometry(0.3, 0.24, 0.42, 9)
      pail.translate(0, 0.21, 0)
      const rim = new THREE.TorusGeometry(0.3, 0.045, 5, 10)
      rim.rotateX(Math.PI / 2)
      rim.translate(0, 0.42, 0)
      // Sweets spilling over the top, which is what makes it a full basket
      // rather than a bucket.
      const sweets = []
      for (const [i, a] of [0.4, 2.1, 3.8, 5.4].entries()) {
        const g = new THREE.SphereGeometry(0.1, 5, 4)
        g.translate(Math.cos(a) * 0.13, 0.46 + (i % 2) * 0.06, Math.sin(a) * 0.13)
        sweets.push({ g, colour: [0x8e3fd4, 0xd43f6a, 0x3fb0d4, 0xd4a63f][i] })
      }

      this.basketField = this.registerField('baskets', [
        this.decorPart(pail, 0xe8761f, this.doorSites.length, { rough: 0.6 }),
        this.decorPart(rim, 0x2a2028, this.doorSites.length),
        ...sweets.map(x =>
          this.decorPart(x.g, x.colour, this.doorSites.length, { rough: 0.4 }))
      ], this.doorSites)
  }

  /**
   * A wreath on every front door.
   *
   * A ring of foliage with a bow, hung flat against the wall - which is why
   * the site carries the building's own facing and the geometry is authored in
   * the XY plane: the field's growing machinery applies a rotation about Y, so
   * a wreath authored lying down would grow into a doormat.
   *
   * It grows from the ground up like everything else in a field, which for a
   * thing hung at chest height means it rises up the door as Christmas
   * arrives. That is a small lie about how wreaths work and a much smaller one
   * than popping into existence.
   */
  createWreaths() {
    if (!this.wreathSites.length) return

    const ring = new THREE.TorusGeometry(0.42, 0.12, 6, 12)
    const berry = new THREE.SphereGeometry(0.075, 5, 4)
    const bow = new THREE.BoxGeometry(0.34, 0.16, 0.1)

    // Authored standing up and lifted onto the door. The site's y is the hook;
    // the field scales from the site, so everything here is measured from it.
    ring.translate(0, 0, 0)
    bow.translate(0, -0.44, 0)

    const green = new THREE.MeshStandardMaterial({
      color: 0x2f6b34, roughness: 0.85, flatShading: true
    })
    const red = new THREE.MeshStandardMaterial({
      color: 0xc22f2f, roughness: 0.6, flatShading: true
    })
    // The berries glow with the rest of the festive lighting rather than
    // sitting dark next to it - same list, same dusk curve, same holiday
    // multiplier.
    const berryMat = new THREE.MeshStandardMaterial({
      color: 0xd8402f, roughness: 0.4, flatShading: true,
      emissive: new THREE.Color(0xff6a4a), emissiveIntensity: 0
    })
    this.registerNightLight(berryMat, 1.6, true)

    const n = this.wreathSites.length
    const parts = [
      this.decorPart(ring, 0, n, { rough: 0.85 }),
      this.decorPart(bow, 0, n, { rough: 0.6 })
    ]
    parts[0].material = green
    parts[1].material = red

    // Three berries, spaced round the ring.
    for (const angle of [0.6, 2.5, 4.4]) {
      const g = berry.clone()
      g.translate(Math.cos(angle) * 0.42, Math.sin(angle) * 0.42, 0.06)
      const mesh = new THREE.InstancedMesh(g, berryMat, n)
      this.game.add(mesh)
      parts.push(mesh)
    }

    this.wreathField = this.registerField('wreaths', parts, this.wreathSites)
  }

  /**
   * The snowmen, which answer to the snow AND to the holiday.
   *
   * The snow is the season's and puts them up; a holiday may take them down
   * again. Mike: "no snowmen should be present for the Halloween decoration
   * mode" - and he is right, a snowman on a Halloween lawn is somebody else's
   * decoration. It only comes up if you force winter weather at Halloween,
   * which the conditions panel lets you do.
   *
   * Called from both setSeason and setHolidayLayer, because either can change
   * the answer and neither knows the other's number. Recomputed from the two
   * stored values rather than nudged from wherever it was, so it cannot drift.
   */
  growSnowmen() {
    const veto = (this.holiday && this.holiday.noSnowmen) || 0
    this.growField(this.snowmanField, (this.snowLevel || 0) * (1 - veto))
  }

  /**
   * Apply a holiday. `layer` comes from holidays.js via Environment, already
   * eased - nothing here decides anything, it only paints.
   *
   * Note what this does NOT do: touch a single material colour, or the snow,
   * or anything else the season owns. A holiday is a layer over the season,
   * which is why Christmas arrives on top of winter instead of replacing it.
   */
  setHolidayLayer(layer) {
    this.holiday = layer

    this.growField(this.eggField, layer.eggs)
    this.growField(this.bunnyField, layer.bunnies)
    this.growField(this.pumpkinField, layer.pumpkins)
    this.growField(this.turkeyField, layer.turkeys)
    this.growField(this.giftField, layer.gifts)
    this.growField(this.treeField, layer.trees)
    this.growField(this.wreathField, layer.lights)

    this.growField(this.ghostField, layer.ghosts)
    this.growField(this.witchField, layer.witches)
    this.growField(this.graveField, layer.graves)
    this.growField(this.signField, layer.signs)
    this.growField(this.basketField, layer.baskets)
    this.growSnowmen()

    // ONE SET OF STRANDS, TWO TONES.
    //
    // The bulbs are the same objects on the same buildings whichever holiday
    // is on; only their colour changes. Building a second set in orange would
    // have been four and a half thousand more instances to hold a copy of a
    // thing already there, and two lots of geometry to keep in step the next
    // time the strands move.
    //
    // The tone is the RATIO of the two amounts rather than a switch, so a
    // holiday handing over to another mid-fade changes the colour on the way
    // instead of snapping. In practice Halloween and Christmas are four months
    // apart and it never happens - but a ratio costs nothing and a switch is
    // the kind of thing that shows up the one time two windows do overlap.
    const warm = layer.lights + layer.spooky
    const tone = warm > 0 ? layer.spooky / warm : 0
    this.festiveLevel = Math.max(layer.lights, layer.spooky)

    const strandMats = this.strandMaterials || []
    for (let i = 0; i < strandMats.length; i++) {
      const material = strandMats[i]
      const hex = mixHex(FESTIVE_COLOURS[i], SPOOKY_COLOURS[i], tone)
      material.color.setHex(hex)
      material.emissive.setHex(hex)
    }

    for (const field of this.festiveFields || []) {
      this.growField(field, this.festiveLevel)
    }
    // The flex comes and goes with them. See buildFestiveFlex() for why it is
    // not grown like the rest.
    if (this.festiveFlex) this.festiveFlex.visible = this.festiveLevel > 0.02
  }

  /**
   * A building placed at an exact spot, rather than scattered.
   *
   *   { x, z, rotation, width, depth, floors, model }
   *
   * x/z are island-local; rotation is in degrees so it's readable in the
   * map file. Anything left out falls back to a sensible default.
   */
  buildPlacedBuilding(island, def) {
    const x = island.x + (def.x || 0)
    const z = island.z + (def.z || 0)
    const rotation = ((def.rotation || 0) * Math.PI) / 180

    // These defaults MUST match DEFAULT_BUILDING in public/map-editor.html.
    // The editor leaves default values out of the exported file to keep it
    // readable, so if the two disagree, buildings quietly come out the wrong
    // size in the world compared to how they looked in the editor.
    const width = def.width || 6
    const depth = def.depth || 6
    const floors = def.floors || 3

    // Remember the footprint so scattered props keep clear of it
    this.placedFootprints.push({
      x: def.x || 0,
      z: def.z || 0,
      radius: Math.hypot(width, depth) / 2 + 1.5
    })

    const built = this.addBuilding(x, z, {
      rotation,
      width,
      depth,
      floors,
      model: def.model,
      colour: def.colour
    })

    // And remember the building, so something can be set alight later.
    //
    // Recorded with the height addBuilding ACTUALLY produced, not the height
    // that was asked for. Under the monorail a building loses storeys until
    // its roof clears the beam, and a model is squashed rather than shortened,
    // so the number that went in is regularly not the number that came out -
    // and a smoke column starting at the requested roof would hang in the air
    // above a building that is no longer that tall.
    if (built > 0) {
      this.buildings.push({
        x, z,
        island: islandName(island),
        width, depth,
        // Which way it faces. Recorded because the Christmas decorations need
        // a FRONT: a wreath belongs on the door and a strand of lights along
        // the windows, and both of those are on one face of the building
        // rather than distributed round it. Without this the only honest
        // option is a ring of something, which is what a first pass did and
        // it read as bunting on a roundabout.
        rotation: rotation || 0,
        height: built,
        // The model itself, so a fire can put flames in its real windows.
        // Only the .glb path sets this; a box building leaves it null and
        // buildingVents() works the openings out from the footprint instead.
        model: this._builtModel || null
      })
    }
  }

  /**
   * Everything that makes a street look inhabited rather than laid out:
   * shopfronts, street trees, benches, bins, planters and parked cars.
   *
   * All of it hangs off the plot layout rather than being scattered.
   * A bench belongs on a pavement facing the road, a parked car belongs
   * at the kerb pointing along it, a tree belongs in the gap between two
   * buildings - none of which a random scatter can know.
   */
  dressStreets(island, roads, plots) {
    const streets = roads.filter(r => r.street || r.ring)

    for (let i = 0; i < plots.length; i++) {
      const plot = plots[i]
      const road = streets[plot.roadIndex]
      if (!road) continue

      const facing = (plot.rotation * Math.PI) / 180
      // Unit vector from the building toward its road
      const fx = Math.sin(facing)
      const fz = Math.cos(facing)
      // And along the kerb
      const ax = fz
      const az = -fx

      const wx = island.x + plot.x
      const wz = island.z + plot.z

      // Ground floor gets a shopfront on the busier streets. Not every
      // building - a street of nothing but shops reads as a film set.
      if (this.rand() < 0.45) {
        this.addShopfront(wx + fx * (plot.depth / 2), wz + fz * (plot.depth / 2), facing, plot.width)
      }

      // Kerbside dressing sits on the pavement between wall and road
      const kerb = plot.depth / 2 + PAVEMENT_WIDTH * 0.55
      const kx = wx + fx * kerb
      const kz = wz + fz * kerb
      const roll = this.rand()

      // AND NOT ACROSS A WAY IN. Same rule the streetlights follow, asked
      // from the same place. A bench on the pavement is right everywhere
      // except the stretch of kerb an ambulance has to cross, or the one you
      // turn across to reach a pump - which is what Mike could see hiding the
      // hospital and the gas station behind trees and bus shelters.
      const clearHere = !blocksStationEntrance(kx, kz, this.accessStations)

      if (!clearHere) {
        // nothing on the pavement here
      } else if (roll < 0.22) {
        this.addBench(kx, kz, facing)
      } else if (roll < 0.34) {
        this.addBin(kx + ax * plot.width * 0.3, kz + az * plot.width * 0.3)
      } else if (roll < 0.52) {
        this.addPlanter(kx + ax * plot.width * 0.3, kz + az * plot.width * 0.3)
      }

      // A street tree in the gap between this plot and the next - a tree is
      // the worst of these, because it is tall enough to hide a whole
      // building rather than just stand in front of one.
      if (this.rand() < 0.5) {
        const gapX = wx + ax * (plot.width / 2 + PLOT_GAP / 2) + fx * (kerb - 0.4)
        const gapZ = wz + az * (plot.width / 2 + PLOT_GAP / 2) + fz * (kerb - 0.4)
        if (!blocksStationEntrance(gapX, gapZ, this.accessStations)) {
          this.addStreetTree(gapX, gapZ)
        }
      }

      // There used to be a parked car here.
      //
      // It was placed a fixed distance out from the plot, which on a narrow
      // street put it in the carriageway rather than at the kerb, and its
      // fallback shape was a flat slab that read as a car sunk into the road.
      // The cars in the world are the moving ones now; the fleet was made
      // bigger to make up for these.
    }
  }

  /** A glazed ground floor with an awning, flush to the building's front. */
  addShopfront(x, z, facing, width) {
    const group = new THREE.Group()

    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.8, 2.6, 0.25),
      this.registerNightLight(new THREE.MeshStandardMaterial({
        color: PALETTE.glass, roughness: 0.25, metalness: 0.35,
        emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
      }), 1.6)
    )
    glass.position.y = 1.4
    group.add(glass)

    const awning = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.85, 0.18, 1.5),
      new THREE.MeshStandardMaterial({
        color: this.pick([PALETTE.wallTerracotta, PALETTE.wallTeal, PALETTE.wallCoral]),
        roughness: 0.85, flatShading: true
      })
    )
    awning.position.set(0, 3.1, 0.75)
    awning.castShadow = true
    group.add(awning)

    group.position.set(x, this.groundAt(x, z), z)
    group.rotation.y = facing
    this.game.add(group)
  }

  /**
   * Is this world point on a carriageway?
   *
   * Mike: "check that no trees, traffic lights, lamps or other objects are in
   * the middle of the road."
   *
   * distanceToNearestRoad() measures from the KERB, not the centre line, so a
   * negative answer means inside the road and `margin` is how much pavement
   * to insist on as well. The streetlights already asked a version of this;
   * the street dressing did not, and a placer that computes a position from a
   * plot has no idea whether that plot happens to back onto a bend.
   *
   * Asked INSIDE each placer rather than at every call site, so it cannot be
   * forgotten by the next thing that puts an object on a pavement.
   */
  onCarriageway(x, z, margin = 0.5) {
    const island = islandAt(x, z)
    if (!island) return false

    return distanceToNearestRoad(
      getIslandRoads(island), x - island.x, z - island.z) < margin
  }

  /**
   * Slatted bench, back to the building, facing the road.
   *
   * `facing` is an ANGLE in radians. Stated because it was not: one of the two
   * callers passed a point, `facing + Math.PI` concatenated it into a string,
   * and three.js wrote NaN through the whole matrix without a word. Nothing
   * threw, nothing was logged, and 184 meshes went somewhere that is not a
   * place. A guard here is worth more than the guard it replaces because the
   * failure it catches is invisible.
   */
  addBench(x, z, facing) {
    // Never in the road. See onCarriageway().
    if (this.onCarriageway(x, z)) return

    if (typeof facing !== 'number' || !Number.isFinite(facing)) facing = 0
    const group = new THREE.Group()
    const wood = new THREE.MeshStandardMaterial({
      color: PALETTE.timber, roughness: 0.9, flatShading: true
    })

    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.6), wood)
    seat.position.y = 0.45
    seat.castShadow = true
    group.add(seat)

    const back = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.5, 0.12), wood)
    back.position.set(0, 0.72, -0.24)
    group.add(back)

    for (const side of [-0.9, 0.9]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.45, 0.5), wood)
      leg.position.set(side, 0.22, 0)
      group.add(leg)
    }

    group.position.set(x, this.groundAt(x, z), z)
    group.rotation.y = facing + Math.PI
    this.game.add(group)
  }

  addBin(x, z) {
    // Never in the road. See onCarriageway().
    if (this.onCarriageway(x, z)) return

    const bin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.32, 0.26, 0.85, 8),
      new THREE.MeshStandardMaterial({
        color: 0x5a6470, roughness: 0.85, flatShading: true
      })
    )
    bin.position.set(x, this.groundAt(x, z) + 0.42, z)
    bin.castShadow = true
    this.game.add(bin)
  }

  /** Planter box with something growing out of it. */
  addPlanter(x, z) {
    // Never in the road. See onCarriageway().
    if (this.onCarriageway(x, z)) return

    const group = new THREE.Group()

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 0.5, 1.2),
      new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.95, flatShading: true
      })
    )
    box.position.y = 0.25
    box.castShadow = true
    group.add(box)

    const shrub = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.55, 0),
      new THREE.MeshStandardMaterial({
        color: PALETTE.bush, roughness: 0.95, flatShading: true
      })
    )
    shrub.position.y = 0.85
    group.add(shrub)
    this.registerSeasonal(shrub.material, 'foliage', 0.8)
    this.swayables.push({ object: shrub, phase: this.rand() * Math.PI * 2, scale: 0.3 })

    group.position.set(x, this.groundAt(x, z), z)
    this.game.add(group)
  }

  /**
   * A narrow street tree - tidier than the palms, which are for beaches.
   *
   * Drawn from the pool rather than always being `tree_a`. Every street tree
   * in every town on the map was the same model, while `tree_b` sat in the
   * manifest, loaded on every visit, and appeared only on the beaches.
   */
  addStreetTree(x, z) {
    // Never in the road. See onCarriageway().
    if (this.onCarriageway(x, z)) return

    // THE MODEL IS NOT USED FOR STREET TREES, and it took photographing it to
    // find out why it should not be.
    //
    // `TREE_MODELS` is a pair of loaded assets, and the branch that used them
    // ran every time - so the procedural tree below had never once been seen
    // in the game. Photographed, the asset is not a tree: it is a CLUMP of
    // four conifers standing on a square of green ground, which is fine
    // scattered on a hillside and wrong on a pavement, where it puts a
    // floating lawn at every kerb. That is most of what Mike was looking at
    // when he said the trees needed work.
    //
    // The models are still used where they belong - see the beaches and the
    // grass scatter - and this is the only caller that opted out.

    const group = new THREE.Group()

    // A TRUNK THAT FORKS, AND A CANOPY OF SEVERAL MASSES.
    //
    // It was a cylinder with one icosahedron balanced on top - a lollipop, and
    // the single most obvious "this is a placeholder" object in the world. Two
    // things fix it and neither is expensive: a trunk that divides into a few
    // limbs, so there is something holding the leaves up; and a canopy built
    // from three to five overlapping lobes at different heights, because that
    // is what catches the light unevenly and reads as foliage. One sphere,
    // however many facets it has, reads as a sphere.
    const barkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.palmTrunk, roughness: 0.96, flatShading: true
    })
    const leafMat = new THREE.MeshStandardMaterial({
      color: this.rand() < 0.5 ? PALETTE.frond : PALETTE.frondLight,
      roughness: 0.92, flatShading: true
    })

    const height = this.randRange(2.4, 3.2)
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.26, height, 7), barkMat)
    trunk.position.y = height / 2
    trunk.castShadow = true
    group.add(trunk)

    // A root flare, so the trunk meets the ground instead of being pushed
    // into it.
    const flare = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.44, 0.34, 7), barkMat)
    flare.position.y = 0.17
    group.add(flare)

    const spread = this.randRange(1.25, 1.7)
    const lobes = canopyLobes(() => this.rand(), height + spread * 0.7, spread)

    // Limbs out to the lobes that are not the crown.
    for (const lobe of lobes) {
      const reach = Math.hypot(lobe.x, lobe.z)
      if (reach < 0.1) continue
      const limb = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.11,
          Math.hypot(reach, lobe.y - height * 0.75), 5), barkMat)
      limb.position.set(lobe.x / 2, (height * 0.75 + lobe.y) / 2, lobe.z / 2)
      limb.rotation.set(0, Math.atan2(lobe.x, lobe.z), 0, 'YXZ')
      limb.rotateX(Math.atan2(reach, lobe.y - height * 0.75))
      group.add(limb)
    }

    const canopy = new THREE.Group()
    for (const lobe of lobes) {
      const blob = new THREE.Mesh(
        new THREE.IcosahedronGeometry(lobe.radius, 0), leafMat)
      blob.position.set(lobe.x, lobe.y, lobe.z)
      // Squashed a little, because a canopy is wider than it is tall.
      blob.scale.set(1, 0.82, 1)
      blob.rotation.set(this.rand() * 3, this.rand() * 3, this.rand() * 3)
      blob.castShadow = true
      canopy.add(blob)
    }
    group.add(canopy)

    // Street trees are the deciduous ones, so they take the season in full.
    this.registerSeasonal(leafMat, 'foliage')
    this.swayables.push({ object: canopy, phase: this.rand() * Math.PI * 2, scale: 0.4 })

    group.position.set(x, this.groundAt(x, z), z)
    this.game.add(group)
  }

  /** A parked car at the kerb. Uses the car model if one is loaded. */
  /**
   * Lamps down both sides of every road on an island, alternating, each
   * aimed at the carriageway it lights.
   *
   * Applies to all islands, not just towns - the hub's plaza had no
   * lighting whatsoever because this used to be part of the town dressing.
   */
  lightRoads(island, roads) {
    const outline = islandOutline(island)

    for (const road of roads) {
      // Bridge approaches are lit by the bridge's own lamps
      if (road.auto) continue

      const spacing = LAMP_SPACING
      const tangents = pathTangents(road.points)
      let travelled = 0
      let side = 1

      for (let i = 1; i < road.points.length; i++) {
        const step = Math.hypot(
          road.points[i].x - road.points[i - 1].x,
          road.points[i].z - road.points[i - 1].z
        )
        travelled += step
        if (travelled < spacing) continue
        travelled = 0
        side *= -1

        const tan = tangents[i]
        const offset = road.width / 2 + PAVEMENT_WIDTH * 0.45
        const lx = road.points[i].x - tan.z * offset * side
        const lz = road.points[i].z + tan.x * offset * side

        // Not in the sea, and not on some other road
        if (inlandDistance(island, lx, lz) < 2) continue
        if (distanceToNearestRoad(roads, lx, lz) < 0.8) continue

        // AND NOT ACROSS A STATION'S DOORS.
        //
        // Mike: "make sure that their entrances are not blocked by things like
        // lamp posts, signal lights or bus stations."
        //
        // A lamp every twenty-odd units along a street is right everywhere
        // except the one stretch of kerb a fire engine has to cross. Nothing
        // here was wrong - a station simply fronts a street like everything
        // else does - so the rule lives in blocksStationEntrance() and every
        // placer asks it rather than each one growing its own idea of where a
        // door is.
        if (blocksStationEntrance(island.x + lx, island.z + lz,
                                  this.accessStations)) {
          continue
        }

        this.addStreetlight(island.x + lx, island.z + lz, {
          x: island.x + road.points[i].x,
          z: island.z + road.points[i].z
        })
      }
    }
  }

  /** Is this island-local point clear of every hand-placed building? */
  /**
   * How tall something at this world point may be.
   *
   * Infinity almost everywhere. Under the monorail it's about 8 units, and
   * everything that puts an object on the ground asks before deciding how
   * big to make it. See monorailCeiling() for why the buildings give way to
   * the line rather than the other way round.
   */
  ceilingAt(x, z) {
    return monorailCeiling(this.monorail, x, z)
  }

  clearOfPlaced(localX, localZ) {
    for (const f of this.placedFootprints || []) {
      if (Math.hypot(localX - f.x, localZ - f.z) < f.radius) return false
    }
    return true
  }

  /** An explicitly placed area of a given type. */
  buildDistrict(island, district, roads) {
    const cx = island.x + (district.x || 0)
    const cz = island.z + (district.z || 0)
    const size = district.size || 14
    const density = district.density !== undefined ? district.density : 1

    if (district.type === 'plaza') {
      // Draped on the surface rather than laid flat at the centre's height.
      // The disc's radius is `size`, but the pad that levels the ground under
      // it is only `size` across - so its outer half lies over ground that
      // falls away, and a flat disc stood 0.4 over the collider there. The
      // garage sits in exactly that band, and every vehicle leaving it sank
      // into the paving. A ring with radial segments, so there are vertices
      // to lift; CircleGeometry is a fan with none inside the rim.
      const plazaGeometry = new THREE.RingGeometry(0, size, 48, Math.ceil(size / 1.5))
      plazaGeometry.rotateX(-Math.PI / 2)
      plazaGeometry.translate(cx, 0, cz)
      const plaza = new THREE.Mesh(
        this.drapeOnSurface(plazaGeometry),
        new THREE.MeshStandardMaterial({
          color: PALETTE.concrete, roughness: 0.9, metalness: 0.05
        })
      )
      plaza.receiveShadow = true
      this.game.add(plaza)

      this.addFountain(cx, cz + PLAZA_FOUNTAIN_OFFSET)

      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2
        this.addStreetlight(cx + Math.sin(a) * size * 0.75, cz + Math.cos(a) * size * 0.75)
      }
      return
    }

    const count = Math.round(size * density * (district.type === 'town' ? 0.7 : 1.2))


    for (let i = 0; i < count; i++) {
      const a = this.rand() * Math.PI * 2
      const d = Math.sqrt(this.rand()) * size
      const x = cx + Math.sin(a) * d
      const z = cz + Math.cos(a) * d

      if (!this.isBuildable(island, roads, x, z)) continue

      if (district.type === 'town') {
        // Buildings in a district come from plots too, placed above. What's
        // left to scatter is the furniture.
        this.rand() < 0.5 ? this.addStreetlight(x, z) : this.addStreetTree(x, z)
      } else if (district.type === 'jungle') {
        const r = this.rand()
        if (r < 0.62) this.addPalm(x, z)
        else if (r < 0.88) this.addBush(x, z)
        else this.addRock(x, z)
      }
    }
  }

  /** Fill the rest of the island according to its theme. */
  scatterTheme(island, roads) {
    const theme = island.theme || 'plain'
    if (theme === 'plain') return

    const reach = islandReach(island)
    const area = Math.PI * reach * reach
    const budget = Math.round(area / 55)

    // Rejection sampling: shaped islands aren't circles, so we try points
    // across the bounding area and keep the ones that land on grass.
    for (let i = 0; i < budget; i++) {
      const a = this.rand() * Math.PI * 2
      const d = this.randRange(8, reach)
      const x = island.x + Math.sin(a) * d
      const z = island.z + Math.cos(a) * d

      if (!this.isBuildable(island, roads, x, z)) continue

      // No buildings here. They come from plots, which are squared up to a
      // kerb; a building dropped at a random bearing among them is exactly
      // what made the cities look unplanned.
      if (theme === 'town') {
        const r = this.rand()
        if (r < 0.5) this.addStreetTree(x, z)
        else this.addPalm(x, z)
      } else if (theme === 'jungle') {
        const r = this.rand()
        if (r < 0.58) this.addPalm(x, z)
        else if (r < 0.82) this.addBush(x, z)
        else if (r < 0.94) this.addRock(x, z)
        else this.addHut(x, z)
      } else if (theme === 'mixed') {
        const r = this.rand()
        if (r < 0.42) this.addPalm(x, z)
        else if (r < 0.74) this.addBush(x, z)
        else this.addRock(x, z)
      }
    }
  }

  /**
   * Palms spaced around the beach. Walks the compass and drops each palm
   * just inland of wherever the coast actually is in that direction, so
   * they hug the shore of any shape.
   */
  ringOfPalms(island, count, roads) {
    const outline = islandOutline(island)

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rand() * 0.35
      const dirX = Math.sin(a), dirZ = Math.cos(a)

      // Where the coast is in this direction
      const shore = rayDistanceToBoundary(outline, dirX, dirZ)
      const d = shore * this.randRange(0.82, 0.92)

      const x = island.x + dirX * d
      const z = island.z + dirZ * d
      if (!this.isBuildable(island, roads, x, z, 2.5)) continue
      this.addPalm(x, z, true)
    }
  }

  /**
   * Can something be placed here? Checks it's properly inland and clear of
   * every road. Works for any island shape and any road layout.
   */
  isBuildable(island, roads, worldX, worldZ, clearance = 1.5) {
    const localX = worldX - island.x
    const localZ = worldZ - island.z

    // Far enough from the coastline to be on grass rather than sand or sea.
    // inlandDistance is negative out at sea, so this rejects both.
    const beachWidth = Math.max(2, islandReach(island) * 0.13)
    if (inlandDistance(island, localX, localZ) < beachWidth + 0.5) return false

    // Keep clear of anything the map placed by hand
    if (!this.clearOfPlaced(localX, localZ)) return false

    // Clear of every road on this island?
    return distanceToNearestRoad(roads, localX, localZ) > clearance
  }

  // -------------------------------------------------------------
  // Individual props
  // -------------------------------------------------------------

  addFountain(x, z) {
    const basin = new THREE.Mesh(
      new THREE.CylinderGeometry(3.4, 3.8, 0.8, 18),
      new THREE.MeshStandardMaterial({
        color: PALETTE.wallWhite, roughness: 0.85, flatShading: true
      })
    )
    basin.position.set(x, this.groundAt(x, z) + 0.4, z)
    basin.castShadow = true
    basin.receiveShadow = true
    this.game.add(basin)

    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.0, 0.1, 18),
      new THREE.MeshStandardMaterial({
        color: PALETTE.seaShallow, roughness: 0.15, metalness: 0.5
      })
    )
    pool.position.set(x, this.groundAt(x, z) + 0.82, z)
    this.game.add(pool)

    this.game.physics.createStaticCylinder(x, 0.4, z, 3.8, 0.4)
  }

  /**
   * A building. With no options it's randomised, which is what the
   * scatter uses. Pass options to place one deliberately.
   *
   * @param {object} opts { rotation, width, depth, floors, model, colour }
   */
  addBuilding(x, z, opts = {}) {
    // The thing that was actually built, for whoever asked for it. Only the
    // return value - the height - is part of the contract; this is a side
    // channel, cleared first so a caller can never read the last building's
    // model when this one falls through to the box shape.
    this._builtModel = null

    const modelKey = opts.model || this.pick(BUILDING_MODELS)
    const rotation = opts.rotation !== undefined
      ? opts.rotation
      : this.rand() * Math.PI * 2

    if (this.assets && this.assets.has(modelKey)) {
      const model = this.assets.clone(modelKey)
      model.position.set(x, this.groundAt(x, z), z)

      // IMPORTANT: measure and scale BEFORE rotating.
      //
      // Box3.setFromObject returns an axis-aligned box, so measuring a
      // rotated model gives the diagonal extent, not its footprint - a
      // 6x6 building turned 45 degrees measures 8.49 across. Scaling to
      // that inflated figure shrinks the building well below the size
      // that was asked for, and by a different amount at every angle.
      model.rotation.y = 0
      const footprint = new THREE.Vector3()
      new THREE.Box3().setFromObject(model).getSize(footprint)

      if (opts.width) {
        const longest = Math.max(footprint.x, footprint.z)
        if (longest > 0) {
          const factor = opts.width / longest
          model.scale.multiplyScalar(factor)
          footprint.multiplyScalar(factor)
        }
      }

      // Under the monorail, shrink until it fits below the beam. A model
      // has no storeys to take away, so the whole thing comes down - which
      // is why a building under the line is small as well as short.
      const ceiling = this.ceilingAt(x, z)
      if (footprint.y > ceiling && footprint.y > 0) {
        const squash = ceiling / footprint.y
        model.scale.multiplyScalar(squash)
        footprint.multiplyScalar(squash)
      }

      // Only now turn it
      model.rotation.y = rotation

      // Windows that come on at night.
      //
      // This is why no building in the world ever lit up: the fallback shape
      // below builds its own window material and registers it, and this
      // branch - the one that actually runs, because the .glb models load -
      // returned before any of that. The lighting was written for a code path
      // the game never takes.
      //
      // The models are a single texture atlas called "colormap", with the
      // windows painted on and no separate glass material to make emissive.
      // So the lit windows are added as their own geometry, in a regular grid
      // sized off the building's measured footprint. They don't line up with
      // the painted ones, but at night the painted ones are dark and a grid
      // of warm rectangles is what reads as a lived-in building.
      if (this.rand() < WINDOWS_LIT_CHANCE) this.addLitWindows(model)

      this.game.add(model)

      // Collider gets the true footprint, with the rotation applied
      // separately - not a re-measured (and therefore inflated) box.
      this.game.physics.createStaticBoxAt(
        x, this.groundAt(x, z) + footprint.y / 2, z,
        footprint.x, footprint.y, footprint.z,
        rotation
      )
      // Kept so a fire can find this building's real window openings rather
      // than guessing a grid on its bounding box. See buildingVents().
      this._builtModel = model

      // The height it actually came out at, so a fire knows where the roof is.
      return footprint.y
    }

    const group = new THREE.Group()
    const width = opts.width || this.randRange(4, 6.5)
    const depth = opts.depth || this.randRange(4, 6)
    const floorHeight = 2.5

    // Storeys come off until the roof clears the beam. The rounding is in
    // monorailFloors() rather than here so a test can check the answer for
    // every plot in the world - World.js can't be run outside a browser.
    const floors = monorailFloors(
      this.monorail, x, z,
      opts.floors || Math.floor(this.randRange(2, 6)), floorHeight)
    if (floors < 1) return 0

    const height = floors * floorHeight

    const wallColour = opts.colour || this.pick([
      PALETTE.wallWhite, PALETTE.wallCream, PALETTE.wallTerracotta,
      PALETTE.wallTeal, PALETTE.wallCoral, PALETTE.wallWhite
    ])

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, depth),
      new THREE.MeshStandardMaterial({
        color: wallColour, roughness: 0.88, metalness: 0.02, flatShading: true
      })
    )
    shell.position.y = height / 2
    shell.castShadow = true
    shell.receiveShadow = true
    group.add(shell)

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.35, 0.35, depth + 0.35),
      new THREE.MeshStandardMaterial({
        color: this.rand() < 0.6 ? PALETTE.roof : PALETTE.roofDark,
        roughness: 0.9, flatShading: true
      })
    )
    roof.position.y = height + 0.15
    roof.castShadow = true
    // Snow lies on roofs, and this is the only place in the world that makes
    // one - so every building in every town gets it from one line.
    this.registerSeasonal(roof.material, 'roof')
    group.add(roof)

    // One shared window material per building, so switching the lights
    // on at night is a single update rather than hundreds.
    //
    // And not every building lights up. Registering all of them meant the
    // whole city came on together at dusk, which reads as a switch being
    // thrown rather than as people being in. Roughly two in three are
    // occupied; the rest stay dark all night.
    const windowMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass,
      roughness: 0.25,
      metalness: 0.4,
      emissive: new THREE.Color(PALETTE.windowLit),
      emissiveIntensity: 0
    })

    if (this.rand() < WINDOWS_LIT_CHANCE) {
      this.registerNightLight(windowMat, this.randRange(0.7, 1.5))
    }

    const perSide = Math.max(2, Math.floor(width / 1.8))
    for (let f = 0; f < floors; f++) {
      const y = f * floorHeight + floorHeight * 0.55

      for (let i = 0; i < perSide; i++) {
        const t = (i + 0.5) / perSide - 0.5
        for (const face of [1, -1]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.08), windowMat)
          win.position.set(t * width, y, face * (depth / 2 + 0.02))
          group.add(win)
        }
      }

      const sidePer = Math.max(1, Math.floor(depth / 2.2))
      for (let i = 0; i < sidePer; i++) {
        const t = (i + 0.5) / sidePer - 0.5
        for (const face of [1, -1]) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.9), windowMat)
          win.position.set(face * (width / 2 + 0.02), y, t * depth)
          group.add(win)
        }
      }
    }

    if (this.rand() < 0.45) {
      const awning = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.9, 0.12, 1.4),
        new THREE.MeshStandardMaterial({
          color: this.pick([PALETTE.wallCoral, PALETTE.wallTeal, PALETTE.roof]),
          roughness: 0.9, flatShading: true
        })
      )
      awning.position.set(0, 2.6, depth / 2 + 0.7)
      awning.castShadow = true
      group.add(awning)
    }

    if (floors >= 4 && this.rand() < 0.5) {
      const signMat = new THREE.MeshStandardMaterial({
        color: 0x223038,
        emissive: new THREE.Color(this.rand() < 0.5 ? PALETTE.signCyan : PALETTE.signPink),
        emissiveIntensity: 0
      })
      this.registerNightLight(signMat, 2.4)

      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.25, 2.6, 2.2), signMat)
      sign.position.set(width / 2 + 0.2, height - 2.2, 0)
      group.add(sign)
    }

    group.position.set(x, this.groundAt(x, z), z)
    group.rotation.y = rotation
    this.game.add(group)

    this.game.physics.createStaticBoxAt(
      x, this.groundAt(x, z) + height / 2, z, width, height, depth, rotation
    )

    return height
  }

  /**
   * A grid of windows that glow after dark, hung on a model building.
   *
   * Added to the model's own group BEFORE it is rotated, so the panels turn
   * with it - measuring or placing after rotation is the mistake that once
   * inflated every building's footprint, and the same trap applies here.
   *
   * The footprint passed in is the scaled size, so the grid adapts: a small
   * house gets two floors of two windows, a tall block six of four.
   *
   * @param {THREE.Object3D} model     the building, unrotated
   * @param {THREE.Vector3}  footprint its measured size after scaling
   */
  /**
   * Glass over the windows the model already has.
   *
   * Not a grid of panes on the bounding box - that was the first attempt, and
   * it hung sheets of glass in the air above the rooftops. Two reasons, both
   * worth remembering: the box is not where the windows are, and the panes
   * were sized in WORLD units inside a group the loader had already scaled up
   * by a factor of ten or more, so they came out enormous.
   *
   * `findWindowFaces` reads the model's own texture and returns the triangles
   * whose UVs land on the dark glass swatch. The sheet is built from those
   * triangles, in the model's own coordinates, and parented to the mesh it
   * came from - so it is the right size and in the right place by
   * construction, whatever the model is scaled to.
   */
  addLitWindows(model) {
    // One material per building, so dusk is a single update rather than one
    // per pane, and so a building lights all at once. Its unlit colour is the
    // swatch it covers, which is what makes it invisible by day.
    const glass = new THREE.MeshStandardMaterial({
      color: 0x3c3c42,
      roughness: 0.25,
      metalness: 0.3,
      emissive: new THREE.Color(PALETTE.windowLit),
      emissiveIntensity: 0
    })

    let lit = 0

    // Collected first, because the loop adds children and traverse() would
    // walk into them.
    const meshes = []
    model.traverse((part) => { if (part.isMesh && part.geometry) meshes.push(part) })

    for (const mesh of meshes) {
      const geometry = mesh.geometry
      const position = geometry.attributes.position
      const uv = geometry.attributes.uv
      const index = geometry.index
      if (!position || !uv || !index) continue

      // Plain, tightly packed arrays: the reader indexes by vertex number.
      if (uv.itemSize !== 2 || uv.isInterleavedBufferAttribute) continue
      if (position.itemSize !== 3 || position.isInterleavedBufferAttribute) continue

      const sample = this.textureSampler(mesh.material)
      if (!sample) continue

      // Cached against the geometry, which every copy of a building shares:
      // there are ninety buildings and three shapes between them, and the
      // answer cannot differ between two copies of the same mesh.
      this._windowFaces = this._windowFaces || new Map()
      let windows = this._windowFaces.get(geometry)

      if (!windows) {
        windows = findWindowFaces({
          position: position.array,
          uv: uv.array,
          index: index.array,
          sample
        })
        this._windowFaces.set(geometry, windows)
      }
      if (!windows.length) continue

      // Some rooms are empty. Decided per window rather than per triangle,
      // which is why findWindowFaces groups the pairs in the first place.
      const occupied = windows.filter(() => this.rand() >= WINDOW_DARK_CHANCE)
      if (!occupied.length) continue

      // The push is in MODEL units, so it has to scale with the model rather
      // than being a fixed number of world units.
      geometry.computeBoundingSphere()
      const push = (geometry.boundingSphere?.radius || 1) * 0.004

      const { positions, normals } = windowGeometry(occupied, position.array, push)

      const pane = new THREE.BufferGeometry()
      pane.setAttribute('position',
        new THREE.BufferAttribute(new Float32Array(positions), 3))
      pane.setAttribute('normal',
        new THREE.BufferAttribute(new Float32Array(normals), 3))

      mesh.add(new THREE.Mesh(pane, glass))
      lit += occupied.length
    }

    if (lit) this.registerNightLight(glass, this.randRange(0.8, 1.5))
  }

  /**
   * Every window on one building as a hole something can come out of, in
   * WORLD coordinates.
   *
   * The same openings that get glass over them at night, read back off the
   * model with `windowVents` and pushed through the mesh's own world matrix -
   * so the answer is right whatever the building was scaled or turned to,
   * without this method knowing either number.
   *
   * Cached twice over. The model-space vents are cached against the geometry,
   * which ninety buildings share three of; the world-space list is cached on
   * the building, which never moves. A fire is rare, but it should not cost a
   * texture read on the frame it starts.
   */
  buildingVents(building) {
    if (!building) return []
    if (building.vents) return building.vents

    const vents = []
    const model = building.model

    if (model) {
      model.updateWorldMatrix(true, true)

      const meshes = []
      model.traverse((part) => {
        if (part.isMesh && part.geometry) meshes.push(part)
      })

      const point = new THREE.Vector3()
      const direction = new THREE.Vector3()
      const normalMatrix = new THREE.Matrix3()
      const scale = new THREE.Vector3()
      const spare = new THREE.Vector3()
      const spin = new THREE.Quaternion()

      for (const mesh of meshes) {
        const geometry = mesh.geometry
        const position = geometry.attributes.position
        const uv = geometry.attributes.uv
        const index = geometry.index
        if (!position || !uv || !index) continue
        if (uv.itemSize !== 2 || uv.isInterleavedBufferAttribute) continue
        if (position.itemSize !== 3 || position.isInterleavedBufferAttribute) continue

        const sample = this.textureSampler(mesh.material)
        if (!sample) continue

        // Shared with addLitWindows on purpose: the windows a building lights
        // up at night and the windows it burns out of are the same windows,
        // and finding them twice would be two chances to disagree.
        this._windowFaces = this._windowFaces || new Map()
        let windows = this._windowFaces.get(geometry)
        if (!windows) {
          windows = findWindowFaces({
            position: position.array,
            uv: uv.array,
            index: index.array,
            sample
          })
          this._windowFaces.set(geometry, windows)
        }
        if (!windows.length) continue

        this._windowVents = this._windowVents || new Map()
        let local = this._windowVents.get(geometry)
        if (!local) {
          local = windowVents(windows, position.array)
          this._windowVents.set(geometry, local)
        }

        normalMatrix.getNormalMatrix(mesh.matrixWorld)
        mesh.matrixWorld.decompose(spare, spin, scale)

        // The openings are measured in model units, where a whole building is
        // about one unit across. A window "0.08 wide" is a metre and a half
        // once the world has scaled the model up, and a flame built to the
        // unscaled figure is invisible.
        const spread =
          (Math.abs(scale.x) + Math.abs(scale.y) + Math.abs(scale.z)) / 3

        for (const vent of local) {
          point.set(vent.center[0], vent.center[1], vent.center[2])
            .applyMatrix4(mesh.matrixWorld)
          direction.set(vent.normal[0], vent.normal[1], vent.normal[2])
            .applyMatrix3(normalMatrix).normalize()

          vents.push({
            x: point.x, y: point.y, z: point.z,
            nx: direction.x, ny: direction.y, nz: direction.z,
            width: vent.width * spread,
            height: vent.height * spread
          })
        }
      }
    }

    // A box building has no atlas to read, and neither does a world whose
    // models failed to load. Rather than quietly having no window fire at
    // all, lay the openings out on the footprint - which is a guess, and is
    // only ever reached when there is nothing better to ask.
    if (!vents.length) vents.push(...this.footprintVents(building))

    building.vents = vents
    return vents
  }

  /**
   * Windows worked out from a building's footprint, for the shapes that have
   * no model to read.
   *
   * Two per floor per face, inset from the corners. Deliberately plain: this
   * is the fallback, and anything cleverer would invite trusting it.
   */
  footprintVents(building) {
    const height = building.height || 6
    const width = building.width || 6
    const depth = building.depth || 6
    const rotation = building.rotation || 0
    const ground = this.groundAt(building.x, building.z)

    const floors = Math.max(1, Math.round(height / 2.5))
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)

    const faces = [
      { n: [0, 0, 1], out: depth / 2, span: width },
      { n: [0, 0, -1], out: depth / 2, span: width },
      { n: [1, 0, 0], out: width / 2, span: depth },
      { n: [-1, 0, 0], out: width / 2, span: depth }
    ]

    const out = []

    for (const face of faces) {
      // Along the face, square to its normal
      const tan = [face.n[2], 0, -face.n[0]]

      for (let floor = 0; floor < floors; floor++) {
        const y = ground + (floor + 0.55) * (height / floors)

        for (const side of [-0.28, 0.28]) {
          const lx = face.n[0] * face.out + tan[0] * face.span * side
          const lz = face.n[2] * face.out + tan[2] * face.span * side

          out.push({
            x: building.x + lx * cos + lz * sin,
            y,
            z: building.z - lx * sin + lz * cos,
            nx: face.n[0] * cos + face.n[2] * sin,
            ny: 0,
            nz: -face.n[0] * sin + face.n[2] * cos,
            width: Math.min(1.6, face.span * 0.24),
            height: Math.min(1.8, (height / floors) * 0.5)
          })
        }
      }
    }

    return out
  }

  /**
   * A function that reads a material's texture, cached per texture.
   *
   * Drawing a 512x512 atlas to a canvas and pulling the pixels back is not
   * something to do once per building - there are ninety of them and three
   * textures between them.
   */
  textureSampler(material) {
    const texture = Array.isArray(material)
      ? material[0]?.map
      : material?.map
    if (!texture || !texture.image) return null

    this._samplers = this._samplers || new Map()
    if (this._samplers.has(texture)) return this._samplers.get(texture)

    let sampler = null

    try {
      const image = texture.image
      const width = image.width
      const height = image.height

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, width, height).data

      sampler = (u, v) => {
        // No V flip. glTF puts UV (0,0) at the top left of the image; flipping
        // it here reads the empty half of this atlas and reports every
        // triangle as black, which looks exactly like a model with no windows.
        const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)))
        const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)))
        const i = (y * width + x) * 4
        return [pixels[i], pixels[i + 1], pixels[i + 2]]
      }
    } catch (err) {
      // A texture from another origin taints the canvas and getImageData
      // throws. Nothing here is worth failing a build over: no sampler means
      // no lit windows on that model.
      sampler = null
    }

    this._samplers.set(texture, sampler)
    return sampler
  }

  addPalm(x, z, beach = false) {
    const modelKey = this.pick(TREE_MODELS)

    // Palms are the only other thing that gets near the beam - the trunk
    // alone runs to 7.5 units, and the crown sits on top of that. The
    // fronds are the giveaway if this is skipped: they stick through the
    // guideway and wave about inside it.
    const ceiling = this.ceilingAt(x, z)

    if (this.assets && this.assets.has(modelKey)) {
      const model = this.assets.clone(modelKey)
      model.position.set(x, this.groundAt(x, z), z)
      model.rotation.y = this.rand() * Math.PI * 2
      model.scale.multiplyScalar(this.randRange(0.85, 1.25))

      if (ceiling < Infinity) {
        const size = new THREE.Vector3()
        new THREE.Box3().setFromObject(model).getSize(size)
        if (size.y > ceiling && size.y > 0) model.scale.multiplyScalar(ceiling / size.y)
      }

      this.game.add(model)
      this.game.physics.createStaticBoxAt(x, 1, z, 0.8, 2, 0.8, 0)
      return
    }

    const group = new THREE.Group()
    // The crown adds roughly a unit above the top of the trunk
    const height = Math.min(this.randRange(4.5, 7.5), ceiling - 1.2)
    if (height < 2) return
    const lean = beach ? this.randRange(0.12, 0.3) : this.randRange(0, 0.14)
    const leanDir = this.rand() * Math.PI * 2

    const trunkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.palmTrunk, roughness: 0.95, flatShading: true
    })

    const segments = 6
    for (let i = 0; i < segments; i++) {
      const t = i / segments
      const segH = height / segments
      const r = 0.26 * (1 - t * 0.45)

      const seg = new THREE.Mesh(
        new THREE.CylinderGeometry(r * 0.9, r, segH * 1.04, 7), trunkMat
      )
      const bend = lean * t * t * height
      seg.position.set(
        Math.cos(leanDir) * bend, segH * (i + 0.5), Math.sin(leanDir) * bend
      )
      seg.castShadow = true
      group.add(seg)
    }

    const crown = new THREE.Group()
    const topBend = lean * height
    crown.position.set(
      Math.cos(leanDir) * topBend, height, Math.sin(leanDir) * topBend
    )

    const frondMat = new THREE.MeshStandardMaterial({
      color: this.rand() < 0.5 ? PALETTE.frond : PALETTE.frondLight,
      roughness: 0.85,
      flatShading: true,
      side: THREE.DoubleSide
    })

    // A quarter of the season, no more. Palms are evergreen, and SKILLS and
    // BLOG are meant to stay jungle whatever month it is - a fully autumnal
    // coconut palm is not a jungle. They pick up a dusting in winter and a
    // touch of new green in spring, which is as much as a palm ever does.
    this.registerSeasonal(frondMat, 'foliage', 0.25)

    const frondCount = 7 + Math.floor(this.rand() * 3)
    for (let i = 0; i < frondCount; i++) {
      const a = (i / frondCount) * Math.PI * 2 + this.rand() * 0.25
      const droop = this.randRange(0.5, 0.95)

      const frond = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 3.2), frondMat)
      frond.position.set(Math.sin(a) * 1.5, -droop * 0.5, Math.cos(a) * 1.5)
      frond.rotation.y = -a
      frond.rotation.x = droop * 0.5
      frond.castShadow = true
      crown.add(frond)
    }

    if (this.rand() < 0.5) {
      const nutMat = new THREE.MeshStandardMaterial({
        color: 0x6b4b2a, roughness: 0.9, flatShading: true
      })
      for (let i = 0; i < 3; i++) {
        const a = this.rand() * Math.PI * 2
        const nut = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24, 0), nutMat)
        nut.position.set(Math.sin(a) * 0.42, -0.24, Math.cos(a) * 0.42)
        crown.add(nut)
      }
    }

    group.add(crown)
    group.position.set(x, this.groundAt(x, z), z)
    group.rotation.y = this.rand() * Math.PI * 2
    this.game.add(group)

    this.swayables.push({ object: crown, phase: this.rand() * Math.PI * 2 })
    this.game.physics.createStaticBoxAt(x, height / 2, z, 0.7, height, 0.7, 0)
  }

  addBush(x, z) {
    const group = new THREE.Group()
    const mat = new THREE.MeshStandardMaterial({
      color: this.rand() < 0.5 ? PALETTE.bush : PALETTE.grassDark,
      roughness: 0.95, flatShading: true
    })
    this.registerSeasonal(mat, 'foliage', 0.85)

    const lumps = 2 + Math.floor(this.rand() * 3)
    for (let i = 0; i < lumps; i++) {
      const r = this.randRange(0.6, 1.1)
      const lump = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), mat)
      lump.position.set(this.randRange(-0.7, 0.7), r * 0.75, this.randRange(-0.7, 0.7))
      lump.castShadow = true
      lump.receiveShadow = true
      group.add(lump)
    }

    if (this.rand() < 0.4) {
      const flowerMat = new THREE.MeshStandardMaterial({
        color: PALETTE.flower, roughness: 0.8, flatShading: true
      })
      for (let i = 0; i < 3; i++) {
        const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), flowerMat)
        f.position.set(
          this.randRange(-0.8, 0.8), this.randRange(0.8, 1.5), this.randRange(-0.8, 0.8)
        )
        group.add(f)
      }
    }

    group.position.set(x, this.groundAt(x, z), z)
    this.game.add(group)
    this.swayables.push({ object: group, phase: this.rand() * Math.PI * 2, scale: 0.35 })
  }

  addHut(x, z) {
    const group = new THREE.Group()

    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 2.2, 2.8),
      new THREE.MeshStandardMaterial({
        color: PALETTE.timber, roughness: 0.95, flatShading: true
      })
    )
    walls.position.y = 1.1
    walls.castShadow = true
    walls.receiveShadow = true
    group.add(walls)

    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(3, 1.6, 4),
      new THREE.MeshStandardMaterial({
        color: 0xb99a5e, roughness: 1, flatShading: true
      })
    )
    roof.position.y = 3
    roof.rotation.y = Math.PI / 4
    roof.castShadow = true
    group.add(roof)

    const doorMat = new THREE.MeshStandardMaterial({
      color: 0x2a1f16,
      emissive: new THREE.Color(PALETTE.windowLit),
      emissiveIntensity: 0
    })
    this.registerNightLight(doorMat, 1.6)

    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.1), doorMat)
    door.position.set(0, 0.75, 1.42)
    group.add(door)

    group.position.set(x, this.groundAt(x, z), z)
    group.rotation.y = this.rand() * Math.PI * 2
    this.game.add(group)

    this.game.physics.createStaticBoxAt(x, 1.1, z, 3.2, 2.2, 2.8, 0)
  }

  addRock(x, z) {
    if (this.assets && this.assets.has('rock')) {
      const model = this.assets.clone('rock')
      const s = this.randRange(0.7, 1.4)
      model.position.set(x, this.groundAt(x, z), z)
      model.rotation.y = this.rand() * Math.PI * 2
      model.scale.multiplyScalar(s)
      this.game.add(model)
      this.game.physics.createStaticBoxAt(x, s, z, s * 2, s * 2, s * 2, 0)
      return
    }

    const scale = this.randRange(0.7, 1.5)
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(scale, 0),
      new THREE.MeshStandardMaterial({
        color: PALETTE.cliff, roughness: 0.98, flatShading: true
      })
    )
    rock.position.set(x, scale * 0.55, z)
    rock.rotation.set(this.rand() * Math.PI, this.rand() * Math.PI, this.rand() * Math.PI)
    rock.castShadow = true
    rock.receiveShadow = true
    this.game.add(rock)

    this.game.physics.createStaticBoxAt(
      x, scale * 0.55, z, scale * 1.4, scale * 1.4, scale * 1.4, 0
    )
  }

  /**
   * A street lamp. `aim` is the point it should lean over - normally the
   * middle of the road it's lighting.
   *
   * The arm and lamp head stick out along the group's local +X, so the
   * whole group is turned to put +X on the road. This used to be
   * `rand() * PI * 2` - every lamp pointing somewhere different, most of
   * them lighting the sea or a wall.
   */
  addStreetlight(x, z, aim = null) {
    const heading = aim
      ? Math.atan2(-(aim.z - z), aim.x - x)
      : this.rand() * Math.PI * 2

    if (this.assets && this.assets.has('streetlight')) {
      const model = this.assets.clone('streetlight')
      model.position.set(x, this.groundAt(x, z), z)
      model.rotation.y = heading
      this.game.add(model)

      // THE MODEL PATH HAS TO DO BOTH THE THINGS THE FALLBACK DOES.
      //
      // It did neither, and it had never once run - so the day a
      // streetlight.glb appeared, every lamp in the world would have stopped
      // coming on at dusk and every pool of light on every road would have
      // gone with it. Better geometry, darker night. Exactly the failure
      // already written up at addBuilding(): lighting written for a code path
      // the game never takes.
      //
      // Registered ONCE, not once per lamp. `assets.clone()` deep-copies the
      // scene graph and SHARES materials, so all of them are lit through one
      // material - which is also why the lens is its own material in the
      // .glb, or the pole and the arm would glow with it.
      if (!this._lampLens) {
        const lens = model.getObjectByName('lamp')
        if (lens && lens.material) {
          this._lampLens = lens.material
          lens.material.emissive = new THREE.Color(PALETTE.lampLit)
          this.registerNightLight(lens.material, 4.5)
        }
      }

      this.addLampPool(x, z, aim)
      return
    }

    const group = new THREE.Group()
    const poleMat = new THREE.MeshStandardMaterial({
      color: 0x3f4650, roughness: 0.7, metalness: 0.4, flatShading: true
    })

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 4.6, 7), poleMat)
    pole.position.y = 2.3
    pole.castShadow = true
    group.add(pole)

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.1, 0.1), poleMat)
    arm.position.set(0.4, 4.55, 0)
    group.add(arm)

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xd8d2c0,
      emissive: new THREE.Color(PALETTE.lampLit),
      emissiveIntensity: 0
    })
    this.registerNightLight(lampMat, 4.5)

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.32), lampMat)
    lamp.position.set(0.75, 4.44, 0)
    group.add(lamp)

    group.position.set(x, this.groundAt(x, z), z)
    group.rotation.y = heading
    this.game.add(group)

    this.addLampPool(x, z, aim)
  }

  /**
   * Light the road, not just the lamp.
   *
   * Offset toward whatever the lamp is aimed at, because that is where a lamp
   * on an arm actually throws it. Its own method so the model path and the
   * built-in path cannot drift - which they had already done, the model path
   * having no pool at all.
   */
  addLampPool(x, z, aim) {
    const reach = 11
    const px = aim ? x + (aim.x - x) * 0.45 : x
    const pz = aim ? z + (aim.z - z) * 0.45 : z
    this.addLightPool(px, pz, reach, 1)
  }

  // -------------------------------------------------------------
  // The two courses
  // -------------------------------------------------------------

  /**
   * The stunt arena and the speedway.
   *
   * Called after the roads and before the ports, and it draws NOTHING from
   * `this.rand()` - not one call, anywhere below this line. That is deliberate
   * and worth keeping. The world's randomness is a single shared sequence
   * walked in build order, so a course that took a few dozen draws would move
   * every container's colour, every ship's cargo and every traffic car's paint
   * on the six islands that were here first. Everything here is laid out from
   * `course.js`, which is arithmetic, so there is nothing to draw for.
   */
  createCourses() {
    this.buildStuntPark()
    this.buildSpeedway()
  }

  /**
   * One mound: the mesh and the collider, from the same triangles.
   *
   * This is why `moundSolid()` returns vertices rather than a description.
   * `Physics.js` has no pitch anywhere in its API - every collider in this
   * world before the courses was a box with a yaw or a cylinder on end - so a
   * sloped anything has to be a triangle mesh. Building the picture and the
   * collision from ONE array means they cannot drift apart, which is the
   * mistake this codebase keeps making: the kerb drawn 0.12 above a collider
   * that followed the ground, the car drawn 2.57 wide against a 1.9 collider.
   *
   * World-space vertices with the mesh left at the origin, the same way the
   * island ground is built, so there is no transform to get wrong either.
   */
  buildMound(island, spec, material, paint = null) {
    const solid = moundSolid({
      ...spec,
      x: island.x + spec.x,
      z: island.z + spec.z
    })

    const geometry = new THREE.BufferGeometry()
    const positions = new Float32Array(solid.positions)
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.computeVertexNormals()

    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    this.game.add(mesh)

    this.game.physics.createStaticTrimesh(positions, new Uint32Array(solid.indices))

    // The flat top, painted.
    //
    // Not decoration, and this is the second time this exact lesson has been
    // paid for. Photographed from above, the first version of this arena was
    // an empty brown field: the obstacles were built in a dirt colour standing
    // on dirt, and the two were within a few percent of each other, so there
    // was nothing to see and nothing to aim at. A Monster Jam floor is dark
    // shapes with painted tops on tan dirt for the same reason - from the
    // cheap seats, and from the driver's seat, colour is the only thing that
    // says where an obstacle is.
    if (paint) {
      const t = solid.top
      const flat = new THREE.BufferGeometry()
      // WOUND BACKWARDS ON PURPOSE, relative to the order moundSolid() hands
      // the corners back in. `solid.top` runs clockwise seen from above, and a
      // clockwise triangle faces DOWN - so the first version of this quad was
      // culled from every camera that could have seen it, and every mound in
      // the arena photographed as an unpainted black shape. Setting the normal
      // attribute to +Y did not save it: three.js culls on winding, not on the
      // normal you claim.
      flat.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
        t[0].x, solid.topY + 0.04, t[0].z,
        t[2].x, solid.topY + 0.04, t[2].z,
        t[1].x, solid.topY + 0.04, t[1].z,
        t[0].x, solid.topY + 0.04, t[0].z,
        t[3].x, solid.topY + 0.04, t[3].z,
        t[2].x, solid.topY + 0.04, t[2].z
      ]), 3))
      const normals = new Float32Array(18)
      for (let i = 1; i < 18; i += 3) normals[i] = 1
      flat.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
      const top = new THREE.Mesh(flat, paint)
      top.receiveShadow = true
      this.game.add(top)
    }

    return solid
  }

  /** The hazard paint. One material for every mark on both courses. */
  courseMarkMaterial() {
    if (!this._courseMark) {
      this._courseMark = new THREE.MeshStandardMaterial({
        color: PALETTE.crane, roughness: 0.8, flatShading: true
      })
    }
    return this._courseMark
  }

  /**
   * A flat painted ribbon following a path: racing lines, kerbs, markings.
   *
   * The same trick `buildRoadSurface()` uses, minus the road: one mesh for the
   * whole loop rather than a box per metre, because the arena's racing oval is
   * 350 units round and a box every two units would be 175 draw calls to paint
   * one line.
   */
  buildFlatRibbon(path, width, y, material) {
    if (!path || path.length < 2) return null
    const quads = ribbonQuads(path, width)
    if (!quads.length) return null

    const positions = []
    for (const { l0, r0, l1, r1 } of quads) {
      positions.push(
        l0.x, y, l0.z, r0.x, y, r0.z, l1.x, y, l1.z,
        l1.x, y, l1.z, r0.x, y, r0.z, r1.x, y, r1.z
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(positions), 3))
    const normals = new Float32Array(positions.length)
    for (let i = 1; i < normals.length; i += 3) normals[i] = 1
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

    const mesh = new THREE.Mesh(geometry, material)
    mesh.receiveShadow = true
    this.game.add(mesh)
    return mesh
  }

  /**
   * The flat middle of an island, cut from its ring road.
   *
   * `insetPolygon` on the ring gives the exact interior, whatever shape the
   * coast turned out to be, so there is no rectangle to poke out over a beach
   * at the narrow end. Drawn and not collided: both course islands are dead
   * flat, so the terrain trimesh underneath is already a perfectly good
   * surface, and a second collider a few centimetres above the first is how
   * you get a car that judders along the seam between them.
   */
  buildInfield(island, ring, inset, material) {
    const inner = insetPolygon(ring, inset)
    if (!inner || inner.length < 3) return null

    const shape = new THREE.Shape()
    shape.moveTo(inner[0].x, -inner[0].z)
    for (let i = 1; i < inner.length; i++) shape.lineTo(inner[i].x, -inner[i].z)
    shape.closePath()

    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), material)
    // ShapeGeometry is built in XY, so it is laid down by a quarter turn about
    // X - and that flips Z, which is why the outline above is fed in with -z.
    mesh.rotation.x = -Math.PI / 2
    mesh.position.set(island.x, COURSE_GROUND + 0.02, island.z)
    mesh.receiveShadow = true
    this.game.add(mesh)
    return mesh
  }

  // -------------------------------------------------------------
  // The stunt arena
  // -------------------------------------------------------------

  buildStuntPark() {
    const island = getIsland('stunt')
    if (!island) return

    const ring = getIslandRing(island)
    if (!ring) return

    // Dirt light, mounds dark. The other way round - `timber` mounds on
    // `cliff` dirt - was tried and the two are the same colour to within a few
    // percent, so the whole arena photographed as an empty brown field.
    const dirtMat = new THREE.MeshStandardMaterial({
      color: PALETTE.sandWet, roughness: 0.99, flatShading: true
    })
    // Dark bodies, painted tops, on tan dirt - which is what the reference
    // arenas look like and, more to the point, the only combination in which
    // anything is visible. See buildMound().
    // Dark EARTH, not near-black. The first attempt at fixing the invisible
    // arena went all the way to 0x33363d, which reads from the driver's seat
    // as a hole in the floor rather than a heap of dirt on it. This is three
    // stops below the floor's 0xd3bf8c - dark enough to see against it from
    // two hundred units up, brown enough to be a mound.
    const moundMat = new THREE.MeshStandardMaterial({
      color: 0x6b5233, roughness: 0.98, flatShading: true
    })
    const launchMat = new THREE.MeshStandardMaterial({
      color: 0x5d4629, roughness: 0.96, flatShading: true
    })
    const paints = {
      red: new THREE.MeshStandardMaterial({
        color: 0xc4322a, roughness: 0.9, flatShading: true
      }),
      blue: new THREE.MeshStandardMaterial({
        color: 0x2f5fa8, roughness: 0.9, flatShading: true
      }),
      hazard: new THREE.MeshStandardMaterial({
        color: PALETTE.crane, roughness: 0.88, flatShading: true
      })
    }

    this.buildInfield(island, ring, STUNT_COURSE.padInset, dirtMat)
    this.buildArenaLines(island, ring)

    // The floor. Everything here is a mound - sloped on all four faces, so it
    // can be hit from any direction and jumped off. See moundSolid().
    STUNT_COURSE.mounds.forEach((spec, i) => {
      const solid = this.buildMound(island, spec, moundMat,
        paints[MOUND_PAINT[i % MOUND_PAINT.length]])
      if (spec.crush) this.buildCrushCars(island, spec, solid)
    })

    // The double: take-off, gap, landing, sized for the monster truck.
    const double = STUNT_COURSE.double
    this.stuntTakeOff = this.buildMound(island, double.takeOff, launchMat, paints.hazard)
    this.buildMound(island, double.landing, moundMat, paints.hazard)
    this.markLaunchLip(island, double.takeOff, this.stuntTakeOff)

    this.buildArenaBarrier(island, ring)
    this.buildArenaStands(island, ring)
    this.buildArenaLights(island, ring)
  }

  /**
   * A bright bar across the lip of the launch, and chevrons pointing at it.
   *
   * Photographed from above, the first version of this arena was a brown
   * field: the mounds were the same colour as the dirt to within a few percent,
   * so from any distance there was nothing to see and nothing to aim at. Hazard
   * paint on the edge of a take-off is what a real course does, for exactly the
   * same reason.
   */
  markLaunchLip(island, spec, solid) {
    const material = this.courseMarkMaterial()

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(spec.topWidth + 2, 0.3, 1.1), material)
    bar.position.set(solid.crest.x, solid.crest.y + 0.12, solid.crest.z)
    bar.rotation.y = spec.heading
    this.game.add(bar)

    // Chevrons on the floor pointing at the take-off, so it reads as the thing
    // to aim at from the far end of the arena rather than as one more mound.
    const fx = Math.sin(spec.heading)
    const fz = Math.cos(spec.heading)
    for (let i = 0; i < 4; i++) {
      const back = 20 + i * 6
      const x = island.x + spec.x - fx * back
      const z = island.z + spec.z - fz * back
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.08, 4.6), material)
        wing.position.set(x + Math.cos(spec.heading) * side * 1.5,
                          COURSE_GROUND + 0.05,
                          z - Math.sin(spec.heading) * side * 1.5)
        wing.rotation.y = spec.heading + side * 0.55
        this.game.add(wing)
      }
    }
  }

  /**
   * The white racing oval painted on the dirt.
   *
   * Every arena floor in the reference has one, and it is doing more than
   * decoration: it is the line the racing runs on, and it turns a featureless
   * brown oval into a place with a direction. Two lines rather than one,
   * because one reads as an edge and two read as a track.
   */
  buildArenaLines(island, ring) {
    const paint = new THREE.MeshStandardMaterial({
      color: PALETTE.roadLine, roughness: 0.85, flatShading: true
    })
    const line = STUNT_COURSE.line

    for (const inset of [line.outer, line.inner]) {
      const loop = insetPolygon(ring, inset)
      if (!loop || loop.length < 3) continue
      const path = loop.map(p => ({ x: island.x + p.x, z: island.z + p.z }))
      path.push({ ...path[0] })
      this.buildFlatRibbon(path, line.width, COURSE_GROUND + 0.04, paint)
    }
  }

  /**
   * The padded barrier round the floor, and the hole you drive in through.
   *
   * Waist high, soft-looking, and a real collider - without one the interesting
   * half of the arena becomes "how do I get back on the floor after
   * overshooting". The gap is put where the bridge road comes ashore, which is
   * found rather than hardcoded: the landing direction is in the map data, so
   * moving the island moves the entrance with it.
   */
  buildArenaBarrier(island, ring) {
    const b = STUNT_COURSE.barrier
    const loop = insetPolygon(ring, b.inset)
    if (!loop || loop.length < 3) return

    const path = loop.map(p => ({ x: p.x, z: p.z }))
    path.push({ ...path[0] })
    const blocks = walkLoop(path, b.blockLength)
    if (!blocks.length) return

    const padMat = new THREE.MeshStandardMaterial({
      color: PALETTE.ambulanceStripe, roughness: 0.85, flatShading: true
    })
    const panelMat = new THREE.MeshStandardMaterial({
      color: PALETTE.wallWhite, roughness: 0.8, flatShading: true
    })

    const entrance = this.arenaEntranceFraction(island, blocks)

    blocks.forEach((at, i) => {
      // The vehicle entrance: a hole wide enough to drive a bus through.
      const away = Math.abs(((at.fraction - entrance) % 1 + 1.5) % 1 - 0.5)
      if (away * blocks.length * b.blockLength < b.gap * b.blockLength / 2) return

      // Alternating panels, which is what the sponsor boards in the reference
      // look like from any distance worth caring about.
      const material = i % 4 === 1 ? panelMat : padMat
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(b.thickness, b.height, b.blockLength * 0.94), material)
      block.position.set(island.x + at.x, COURSE_GROUND + b.height / 2,
                         island.z + at.z)
      block.rotation.y = at.heading
      block.castShadow = true
      block.receiveShadow = true
      this.game.add(block)

      this.game.physics.createStaticBoxAt(
        island.x + at.x, COURSE_GROUND + b.height / 2, island.z + at.z,
        b.thickness, b.height, b.blockLength * 0.94, at.heading)
    })
  }

  /**
   * Where round the arena the bridge road arrives, as a fraction of the loop.
   *
   * Read from the island's bridge landing rather than written down, so the
   * entrance follows the island if it ever moves in mapData.js. Falls back to
   * the start of the loop, which is at least deterministic.
   */
  arenaEntranceFraction(island, blocks) {
    const landings = getBridgeLandings(island)
    if (!landings.length || !blocks.length) return 0

    const dirX = landings[0].dirX
    const dirZ = landings[0].dirZ
    let best = 0
    let bestDot = -Infinity
    for (const at of blocks) {
      const len = Math.hypot(at.x, at.z) || 1
      const dot = (at.x / len) * dirX + (at.z / len) * dirZ
      if (dot > bestDot) { bestDot = dot; best = at.fraction }
    }
    return best
  }

  /**
   * Banked seating, stepping up and OUTWARD from the ring road.
   *
   * Outward, over the beach and out past the waterline on columns, because
   * there is nowhere else for it. Measured on this island: from the ring
   * road's outer kerb to the coastline is under six units, and five tiers of
   * seating is thirteen. Building them inward instead would have taken a third
   * of the arena floor, on an island whose narrow end is already only
   * twenty-five units across.
   *
   * A stand cantilevered out over the water on piles is a real thing, it is
   * the same trick the airport platform already uses here, and it means the
   * whole of the floor stays floor.
   */
  /**
   * Is this spot under the monorail?
   *
   * Mike: "the monorail has to go through/clip through a stadium twice... the
   * monorail shouldn't have to go through a wall."
   *
   * Measured, the loop crosses the stunt arena's seating twice - in one side
   * and out the other - and it is a height problem exactly as he guessed: the
   * beam sits at MONORAIL_HEIGHT (11), an eight-tier stand tops out at 13.9
   * and its roof at 19.4.
   *
   * Raising the beam is the wrong cure. It would have to go to 22 to clear the
   * roof, taking every pier, every platform and the walk up to them with it,
   * to solve a problem in one building. Re-routing the loop was tried at
   * length and is worse than it sounds - the curve is fitted from control
   * points and then filleted at a 40-unit radius, and a fillet rounds a corner
   * by cutting ACROSS it, so a detour pushed out by 12 units came back 39
   * units inside the island. Three attempts, best radius 21.56 against the
   * 36.61 the loop has now.
   *
   * The arena already knows how to leave a hole in itself: `entranceGap`,
   * where the bridge road comes ashore. This is the same idea, and a railway
   * running through a purpose-built opening in a stand is a better sight than
   * either a taller railway or a longer one.
   *
   * Measured against the drawn route rather than a bearing from the centre,
   * because the beam crosses on two different bearings and a dot-product test
   * would need to know about both.
   */
  underMonorail(x, z, margin = MONORAIL_CORRIDOR) {
    if (!this.monorail || !this.monorail.points) return false
    return distanceToPath(this.monorail.points, x, z) < margin
  }

  buildArenaStands(island, ring) {
    const s = STUNT_COURSE.stands
    const seatMat = new THREE.MeshStandardMaterial({
      color: PALETTE.concrete, roughness: 0.94, flatShading: true
    })
    const crowdMats = [
      new THREE.MeshStandardMaterial({ color: 0x3f6fb5, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xc94f4f, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xe8ecf1, roughness: 0.95, flatShading: true })
    ]
    const pileMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.9, flatShading: true
    })

    const entrance = null
    const landings = getBridgeLandings(island)
    const dir = landings.length ? landings[0] : null

    for (let tier = 0; tier < s.tiers; tier++) {
      // Each tier is the ring road pushed further out. A negative inset is an
      // OUTSET, which insetPolygon handles: it is the same maths with the sign
      // flipped, and it is why the tiers stay parallel to the coast rather
      // than drifting into it at the ends.
      const out = s.fromRing + tier * s.tread
      const loop = outsetLoop(ring, out)
      if (!loop || loop.length < 3) continue

      const path = loop.map(p => ({ x: p.x, z: p.z }))
      path.push({ ...path[0] })
      const seats = walkLoop(path, s.tread * 1.6)
      const y = COURSE_GROUND + (tier + 1) * s.rise

      seats.forEach((at, i) => {
        // A hole where the bridge road comes ashore. Without it the road runs
        // into the back of a grandstand.
        if (dir) {
          const len = Math.hypot(at.x, at.z) || 1
          const dot = (at.x / len) * dir.dirX + (at.z / len) * dir.dirZ
          if (dot > 0.86) return
        }

        // And a hole where the monorail crosses, for the same reason: without
        // it the beam runs through the back of a grandstand. See
        // underMonorail().
        if (this.underMonorail(island.x + at.x, island.z + at.z,
                               MONORAIL_CORRIDOR + s.tread)) {
          return
        }

        const step = new THREE.Mesh(
          new THREE.BoxGeometry(s.tread, s.rise * 2.2, s.tread * 1.55), seatMat)
        step.position.set(island.x + at.x, y - s.rise * 1.1, island.z + at.z)
        step.rotation.y = at.heading
        step.receiveShadow = true
        this.game.add(step)

        // A crowd, as three colours of small block. Nobody is going to count
        // them, and at this distance a crowd IS three colours of small block.
        if (tier > 0 && i % 2 === 0) {
          const people = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 1.1, s.tread * 1.3),
            crowdMats[(i + tier) % crowdMats.length])
          people.position.set(island.x + at.x, y + 0.55, island.z + at.z)
          people.rotation.y = at.heading
          this.game.add(people)
        }

        // The outer tiers stand over the water, so they stand on something.
        // Two ranks of piles now rather than one: at eight tiers the last
        // three are all out past the beach and a single row under the very
        // back looked like the stand was balanced on a fence.
        if (tier >= s.tiers - 3 && tier % 2 === 1 && i % 3 === 0) {
          const drop = y - COURSE_GROUND + 8
          const pile = new THREE.Mesh(
            new THREE.CylinderGeometry(0.75, 0.95, drop, 6), pileMat)
          pile.position.set(island.x + at.x, y - drop / 2, island.z + at.z)
          this.game.add(pile)
        }
      })
    }

    // --- The roof over the back rows ---
    //
    // The thing that turns a bank of seating into a stadium. It is a ring of
    // panels above the back tiers, carried on columns that come down behind
    // the stand rather than through it, with the same hole for the bridge road
    // that the seating has.
    const r = s.roof
    if (r) {
      const roofMat = new THREE.MeshStandardMaterial({
        color: PALETTE.trainSkirt, roughness: 0.82, flatShading: true
      })
      const backOut = s.fromRing + (s.tiers - 1) * s.tread
      const roofOut = backOut - (s.tiers - 1 - r.from) * s.tread + r.depth / 2
      const loop = outsetLoop(ring, roofOut)
      if (loop && loop.length >= 3) {
        const path = loop.map(p => ({ x: p.x, z: p.z }))
        path.push({ ...path[0] })
        const panels = walkLoop(path, r.depth)
        const y = COURSE_GROUND + s.tiers * s.rise + r.above

        panels.forEach((at, i) => {
          if (dir) {
            const len = Math.hypot(at.x, at.z) || 1
            const dot = (at.x / len) * dir.dirX + (at.z / len) * dir.dirZ
            if (dot > 0.86) return
          }

          // The roof is the highest part of the stand and the beam passes
          // BELOW it, so this hole matters more than the one in the seating.
          // Wider than the seats' gap by half a panel, so the opening reads as
          // deliberate from underneath rather than as a missing tile.
          if (this.underMonorail(island.x + at.x, island.z + at.z,
                                 MONORAIL_CORRIDOR + r.depth)) {
            return
          }
          // Sized to the spacing walkLoop() actually used, plus a hair of
          // overlap so the ring has no gaps in it. At 1.9x the spacing every
          // panel was drawn twice over, which is a lot of triangles to spend
          // on being darker.
          const panel = new THREE.Mesh(
            new THREE.BoxGeometry(r.depth * 1.08, r.thickness, r.depth * 1.02),
            roofMat)
          panel.position.set(island.x + at.x, y, island.z + at.z)
          panel.rotation.y = at.heading
          panel.castShadow = true
          this.game.add(panel)

          // A column every third panel, dropped BEHIND the back row so it
          // never lands in the seating.
          //
          // "Behind" is perpendicular to the stand, taken from the panel's own
          // heading - not radially outward from the island's centre, which is
          // what the first version did. On a long island the two are the same
          // only at the ends; along the flanks, radially-outward pointed
          // sideways and put columns down through the seating.
          if (i % 3 === 0) {
            const outX = Math.cos(at.heading)
            const outZ = -Math.sin(at.heading)
            const side = (at.x * outX + at.z * outZ) < 0 ? -1 : 1
            const cx = at.x + outX * side * r.depth * 0.62
            const cz = at.z + outZ * side * r.depth * 0.62
            const col = new THREE.Mesh(
              new THREE.CylinderGeometry(0.5, 0.6, y - COURSE_GROUND, 6), pileMat)
            col.position.set(island.x + cx, COURSE_GROUND + (y - COURSE_GROUND) / 2,
              island.z + cz)
            this.game.add(col)
          }
        })
      }
    }
  }

  /**
   * Floodlight towers.
   *
   * Registered as night emissives, so the arena lights up after dark with
   * everything else rather than being a stadium nobody bothered to switch on.
   */
  buildArenaLights(island, ring) {
    const l = STUNT_COURSE.lights
    const loop = outsetLoop(ring, STUNT_COURSE.stands.fromRing +
      STUNT_COURSE.stands.tiers * STUNT_COURSE.stands.tread)
    if (!loop || loop.length < 3) return

    const path = loop.map(p => ({ x: p.x, z: p.z }))
    path.push({ ...path[0] })
    const spots = walkLoop(path, 4)
    if (!spots.length) return

    const mastMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.85, flatShading: true
    })

    for (const fraction of l.at) {
      const at = spots[Math.floor(fraction * spots.length) % spots.length]
      const x = island.x + at.x
      const z = island.z + at.z

      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.55, 1.1, l.height, 6), mastMat)
      mast.position.set(x, COURSE_GROUND + l.height / 2, z)
      mast.castShadow = true
      this.game.add(mast)

      const head = new THREE.Mesh(
        new THREE.BoxGeometry(7, 2.2, 1.4), mastMat)
      head.position.set(x, COURSE_GROUND + l.height + 1, z)
      // Face the middle of the island, which is where the floor is.
      head.rotation.y = Math.atan2(island.x - x, island.z - z)
      this.game.add(head)

      const lampMat = new THREE.MeshStandardMaterial({
        color: 0xf2efe4, roughness: 0.4, flatShading: true,
        emissive: new THREE.Color(PALETTE.lampLit), emissiveIntensity: 0
      })
      for (let i = 0; i < l.lamps; i++) {
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.4, 0.4), lampMat)
        const across = (i - (l.lamps - 1) / 2) * 1.1
        lamp.position.set(
          x + Math.cos(head.rotation.y) * across + Math.sin(head.rotation.y) * 0.8,
          COURSE_GROUND + l.height + 1,
          z - Math.sin(head.rotation.y) * across + Math.cos(head.rotation.y) * 0.8)
        lamp.rotation.y = head.rotation.y
        this.game.add(lamp)
      }
      this.registerNightLight(lampMat, 3.4)
    }
  }

  /**
   * The wrecks on top of a crush mound.
   *
   * Built from the traffic's own vehicle builders - the same trick the roadside
   * crash uses. A row of boxes reads as a row of boxes; these are the cars you
   * have spent all session driving past, which is worth more than any amount of
   * bespoke geometry. Laid out on a fixed lattice rather than scattered,
   * because scattering would mean drawing from the world's shared random
   * sequence - see createCourses().
   */
  /**
   * A WRECK: a car that has already been driven over.
   *
   * Not `buildTrafficVehicle()`. Mike's note was that the crush pile was
   * "essentially worthless car assets placed in the game", and half of why is
   * that they were showroom cars - correct paint, clean glass, four round
   * wheels - sitting upright on a jump. A wreck has to look wrecked or the
   * pile reads as a car park somebody has parked on a hill.
   *
   * Built from the same loft as a real car so the proportions are right, then
   * ruined: squashed to two-thirds height, the roof caved in on one side, the
   * paint dulled towards rust, the glass gone and replaced with a dark hole,
   * and the wheels flat.
   */
  buildWreck(colour, seed = 0) {
    const group = new THREE.Group()
    const trim = this.vehicleTrim()
    const length = 4.4
    const width = 1.9

    // Dulled towards rust rather than the showroom colour, because a bright
    // clean panel is the single thing that says "this car is fine".
    const rust = new THREE.Color(colour).lerp(new THREE.Color(0x8a7460), 0.4)
    const body = new THREE.MeshStandardMaterial({
      color: rust, roughness: 0.92, metalness: 0.1, flatShading: true
    })
    const dark = new THREE.MeshStandardMaterial({
      color: 0x14171b, roughness: 0.95, flatShading: true
    })

    // Squashed, but still a car. The first version flattened it to 0.96 tall
    // and then scaled it to 0.72 of that, which is 0.7 units for a 4.4-long
    // body - at which point it reads as a dark slab rather than as a wreck,
    // and a slab is no more interesting than the showroom car it replaced.
    const shape = carBody(length, width, {
      sill: 0.2, shoulder: 0.78, roof: 1.3,
      noseDrop: 0.22, tuck: 0.82
    })
    // Crumpled: the nose and tail pushed down further than the middle, which
    // is what a car looks like after something heavy has been over it.
    const crush = shape.lower.map((sec, i) => ({
      ...sec,
      yTop: sec.yTop - (i === 0 || i === 4 ? 0.16 : 0) - (seed % 2) * 0.04
    }))
    group.add(this.loftMesh(crush, body))

    // The cabin, caved in on one side - a different amount each time, so a
    // pile of three does not read as three copies.
    const lean = (seed % 3) * 0.06 - 0.06
    group.add(this.loftMesh(shape.cabin.map((sec) => ({
      ...sec,
      halfWidth: sec.halfWidth * 0.9,
      yTop: sec.yTop - 0.12,
      xShift: lean
    })), body))

    // No glass. A dark band where the windows were, which reads as an empty
    // shell rather than as tinted glazing.
    group.add(this.loftMesh(shape.cabin.map((sec) => ({
      ...sec,
      halfWidth: sec.halfWidth * 0.92,
      yBottom: sec.yBottom + 0.06,
      yTop: sec.yTop - 0.2,
      xShift: lean
    })), dark))

    // Flat tyres: the same wheels, squashed, and no rim showing. The hub
    // height comes off wheelPositions() like everywhere else rather than being
    // written down - worldsanity.mjs cannot tell a local offset from a world
    // placement when both coordinates are names, and it is right not to try.
    for (const at of wheelPositions(length, width, 0.34, 0.3)) {
      const tyre = new THREE.Mesh(
        this.sharedGeometry('wrecktyre', () =>
          new THREE.CylinderGeometry(0.34, 0.34, 0.3, 10)), trim.tyre)
      tyre.rotation.z = Math.PI / 2
      tyre.scale.set(1, 1, 0.55)
      const pivot = new THREE.Group()
      pivot.position.set(at.x, at.y * 0.6, at.z)
      pivot.add(tyre)
      group.add(pivot)
    }

    return group
  }

  /**
   * The crush pile: a RAMP made of wrecks.
   *
   * The whole of Mike's complaint, answered in the collider rather than in the
   * model. It used to be three cars each wrapped in a static BOX - a 1.1-high
   * vertical wall at the top of a slope - so driving at the pile stopped you
   * dead. Now there is ONE trimesh over the pile, built by the same
   * `moundSolid()` as every other obstacle in the arena and therefore with the
   * same 25-degree faces, and the wrecks have no collider at all. You drive up
   * the mound, up over the wrecks, and off the far side.
   *
   * See CRUSH_PILE in course.js for why, and for the numbers.
   */
  buildCrushCars(island, spec, solid) {
    const colours = [PALETTE.carRed, PALETTE.carBlue, PALETTE.carSand,
                     PALETTE.carGreen, PALETTE.carGrey]

    // The ramp. Built in world coordinates like every other mound, standing on
    // the crest of the one it decorates.
    const ramp = crushSolid(
      { x: island.x + spec.x, z: island.z + spec.z, heading: spec.heading },
      solid.crest.y)

    const positions = new Float32Array(ramp.positions)
    this.game.physics.createStaticTrimesh(
      positions, new Uint32Array(ramp.indices))

    // The ramp itself is NOT drawn. The wrecks are what you see; the trimesh
    // is the shape you drive on, and a visible dirt wedge under a pile of cars
    // would look like the cars were sitting in a skip.
    const sx = Math.cos(spec.heading)
    const sz = -Math.sin(spec.heading)
    const spread = Math.min(2.2, (CRUSH_PILE.topWidth + 1.6) /
                                 Math.max(1, spec.crush - 1))

    for (let i = 0; i < spec.crush; i++) {
      const across = (i - (spec.crush - 1) / 2) * spread
      const x = island.x + spec.x + sx * across
      const z = island.z + spec.z + sz * across

      // SUNK INTO THE RAMP, and measured off the RAMP rather than off the
      // mound under it. Taking the height from `solid.crest.y` - the parent
      // mound's top - left the wrecks floating a clear unit above the ramp
      // they are supposed to be the surface of, which is exactly what the
      // first photograph showed.
      //
      // Each one sits a little below the ramp's own top face, so the trimesh
      // you drive on runs through the wrecks rather than over them: you go up
      // the cars, not up an invisible wedge above the cars.
      const mesh = this.buildWreck(colours[i % colours.length], i)
      const middle = i === Math.floor(spec.crush / 2)
      mesh.position.set(x, ramp.topY - (middle ? 0.5 : 0.72), z)
      mesh.rotation.set(0, spec.heading + Math.PI / 2 + (i - 1) * 0.16,
                        (i % 2 ? 1 : -1) * 0.09, 'YXZ')
      mesh.scale.set(1, 0.88, 1)
      this.game.add(mesh)
    }
  }

  // -------------------------------------------------------------
  // The speedway
  // -------------------------------------------------------------

  /**
   * The circuit's surface and its furniture.
   *
   * The circuit itself IS the island's ring road - see mapData.js. That is not
   * a shortcut: the ring is already a 380-unit oval of proper road with a
   * flattened corridor under it, being a real road is what keeps the bridge
   * joined to the network, and `noTraffic` on the island is what keeps the
   * public off it. What is built here is everything that makes it read as a
   * circuit rather than as a road round an empty island.
   */
  /**
   * How wide the circuit is.
   *
   * From the ISLAND, not from DEFAULT_ROAD_WIDTH. The speedway's ring road is
   * widened on its own (see `ringWidth` in mapData.js) because seven units is
   * a residential street and there are six cars on the grid - and every piece
   * of circuit furniture is placed off the width, so a constant here would put
   * the kerbs, the armco and the start line at the old edges of a wider track.
   */
  circuitWidth() {
    const island = getIsland('speedway')
    return (island && island.ringWidth) || DEFAULT_ROAD_WIDTH
  }

  buildSpeedway() {
    const island = getIsland('speedway')
    if (!island) return

    const ring = getIslandRing(island)
    if (!ring) return

    const world = ring.map(p => ({ x: island.x + p.x, z: island.z + p.z }))
    world.push({ ...world[0] })

    this.speedwayLine = pointAlongRing(ring, RACE_LINE_AT)
    if (!this.speedwayLine) return
    // How far round the ring road's own point list the start line is. Every
    // race distance is measured from the LINE, so this is the one place the
    // two origins are reconciled - see circuitAlong().
    this.speedwayLineAlong = this.speedwayLine.along

    // Before ANYTHING that calls circuitPoint() - see measureCircuit().
    this.measureCircuit()

    // BLACK, laid over the road rather than replacing it. The world's roads are
    // `asphalt`, which is a warm grey-purple chosen to sit under a bright sky
    // next to sand - correct for a street and wrong for a circuit, which reads
    // as black in every photograph of one. Two hundredths of a unit up, so it
    // covers the lane markings the road painted on itself.
    const trackMat = new THREE.MeshStandardMaterial({
      color: 0x22242a, roughness: 0.88, metalness: 0.04, side: THREE.DoubleSide
    })
    this.buildFlatRibbon(world, this.circuitWidth(), COURSE_ROAD + 0.02, trackMat)

    this.buildCircuitKerbs(island, ring)
    this.buildCircuitBarriers(island, ring)
    this.buildStartLine(island)
    this.buildPitStraight(island)
  }

  /**
   * Red-and-white kerbs down both edges of the circuit.
   *
   * The single most recognisable thing about a racing track, and the reason a
   * strip of tarmac reads as a circuit rather than as a road. Alternating
   * blocks laid along both edges, sunk almost flush so they are paint you can
   * feel rather than a wall - a kerb you can trip over is a kerb that ends
   * races.
   */
  buildCircuitKerbs(island, ring) {
    // A metre of kerb on a seven-metre road. The first version was 1.9 by 3.0
    // on a 3.2 pitch, which is more than a quarter of the road's width in red
    // and white on each side - from the driver's seat that reads as a
    // chequerboard runway with a black stripe down the middle rather than as a
    // circuit with kerbs.
    const KERB_WIDTH = 1.1
    const KERB_BLOCK = 2.6
    // Half the road, less half the kerb, so the kerb sits ON the edge of the
    // track rather than beside it.
    const half = this.circuitWidth() / 2
    const inner = insetPolygon(ring, half - KERB_WIDTH / 2)
    const outer = outsetLoop(ring, half - KERB_WIDTH / 2)

    const redMat = new THREE.MeshStandardMaterial({
      color: PALETTE.ambulanceStripe, roughness: 0.88, flatShading: true
    })
    const whiteMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roadLine, roughness: 0.88, flatShading: true
    })

    const gate = this.circuitGate(island, this.circuitWidth() + 2)

    for (const loop of [inner, outer]) {
      if (!loop || loop.length < 3) continue
      const path = loop.map(p => ({ x: p.x, z: p.z }))
      path.push({ ...path[0] })

      walkLoop(path, KERB_BLOCK + 0.2).forEach((at, i) => {
        // No kerb across the junction either. A kerb is only paint you can
        // feel, so this is cosmetic - but a red-and-white kerb laid over a
        // zebra crossing reads as a mistake, because it is one.
        if (gate(at.x, at.z)) return
        const block = new THREE.Mesh(
          new THREE.BoxGeometry(KERB_WIDTH, 0.18, KERB_BLOCK), i % 2 ? whiteMat : redMat)
        block.position.set(island.x + at.x, COURSE_ROAD + 0.06, island.z + at.z)
        block.rotation.y = at.heading
        block.receiveShadow = true
        this.game.add(block)
      })
    }
  }

  /**
   * A test for "is this on the bit of the circuit the bridge road crosses?"
   *
   * Returns a predicate over ISLAND-LOCAL positions. Every bridge that lands
   * on this island gets a gate: a corridor of the given width running out from
   * the island's centre along the bearing of that bridge, which is the line
   * the approach road takes. Anything inside a gate does not get built.
   *
   * Bearing-and-corridor rather than an arc of the loop, because the circuit
   * is a 160-by-61 oval - equal angles round it are wildly unequal distances,
   * so an angular window that is right at the ends is far too wide down the
   * straights.
   */
  circuitGate(island, width) {
    const landings = getBridgeLandings(island)
    if (!landings.length) return () => false
    const half = width / 2
    return (x, z) => landings.some((l) => {
      // Out along the bridge's bearing, not back the other way.
      if (x * l.dirX + z * l.dirZ <= 0) return false
      return Math.abs(x * l.dirZ - z * l.dirX) < half
    })
  }

  /**
   * Armco round the outside of the circuit, and a tyre wall at the two ends.
   *
   * Outside only. A barrier on the inside of a 380-unit oval would be the
   * thing you hit every lap; outside, it is the thing that stops a spin
   * becoming a swim, which on an island is a real risk.
   */
  buildCircuitBarriers(island, ring) {
    const loop = outsetLoop(ring, this.circuitWidth() / 2 + 3)
    if (!loop || loop.length < 3) return

    const path = loop.map(p => ({ x: p.x, z: p.z }))
    path.push({ ...path[0] })

    const railMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beam, roughness: 0.6, metalness: 0.35, flatShading: true
    })
    const postMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.85, flatShading: true
    })

    // THE WAY IN. Armco all the way round an island is armco across the
    // bridge road, and the first version of this walled the circuit off
    // completely - you drove over the bridge, past the traffic lights, over
    // the zebra crossing and into a steel barrier. The arena on the other
    // island already leaves a hole for its bridge; this did not, and nothing
    // failed, because a wall in the wrong place is a perfectly good wall.
    const gate = this.circuitGate(island, CIRCUIT_GATE)

    walkLoop(path, 5).forEach((at, i) => {
      if (gate(at.x, at.z)) return
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.7, 4.9), railMat)
      rail.position.set(island.x + at.x, COURSE_ROAD + 0.95, island.z + at.z)
      rail.rotation.y = at.heading
      rail.castShadow = true
      this.game.add(rail)

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), postMat)
      post.position.set(island.x + at.x, COURSE_ROAD + 0.6, island.z + at.z)
      post.rotation.y = at.heading
      this.game.add(post)

      this.game.physics.createStaticBoxAt(
        island.x + at.x, COURSE_ROAD + 0.8, island.z + at.z,
        0.5, 1.6, 4.9, at.heading)
    })
  }

  /** The bar across the road, and the grid boxes behind it. */
  buildStartLine(island) {
    const at = this.speedwayLine
    const whiteMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roadLine, roughness: 0.85, flatShading: true
    })

    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(this.circuitWidth(), 0.1, 1.6), whiteMat)
    bar.position.set(island.x + at.x, COURSE_ROAD + 0.09, island.z + at.z)
    bar.rotation.y = at.heading
    bar.receiveShadow = true
    this.game.add(bar)

    // The grid boxes, back down the road from the line.
    //
    // ALONG THE CIRCUIT, not along a straight line drawn back from the start.
    // The first version walked back on a fixed bearing, and this circuit is an
    // oval - by the sixth box the grid had left the road and was painted on
    // the beach. `circuitPoint()` is the same thing the field itself is drawn
    // with, so the boxes are where the cars will be by construction.
    for (let slot = 0; slot < RACE_FIELD + 1; slot++) {
      const spot = this.circuitPoint(-gridOffset(slot))
      if (!spot) continue
      const across = gridSide(slot) * GRID_COLUMN_OFFSET

      const box = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.1, 5.4), whiteMat)
      box.position.set(
        spot.x - Math.cos(spot.heading) * across,
        COURSE_ROAD + 0.09,
        spot.z + Math.sin(spot.heading) * across)
      box.rotation.y = spot.heading
      this.game.add(box)
    }
  }

  /**
   * The main straight: pit building, grandstand, and the lights over the line.
   *
   * One side only, which is what Mike asked for and what a circuit actually
   * looks like - Monaco, Austin and Las Vegas all have one grandstand you can
   * see and a lot of armco you cannot. It goes on the INSIDE of the loop, where
   * there is room: the outside of this circuit is four units of grass and then
   * the sea.
   */
  buildPitStraight(island) {
    const stands = new THREE.Group()

    const concreteMat = new THREE.MeshStandardMaterial({
      color: PALETTE.concrete, roughness: 0.93, flatShading: true
    })
    const roofMat = new THREE.MeshStandardMaterial({
      color: PALETTE.trainSkirt, roughness: 0.8, flatShading: true
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.25, metalness: 0.1, flatShading: true
    })
    const crowd = [
      new THREE.MeshStandardMaterial({ color: 0x3f6fb5, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xc94f4f, roughness: 0.95, flatShading: true }),
      new THREE.MeshStandardMaterial({ color: 0xe8ecf1, roughness: 0.95, flatShading: true })
    ]

    const gate = this.circuitGate(island, CIRCUIT_GATE + 6)

    // Every offset below comes out of here rather than being a number typed
    // next to the mesh that uses it. See pitStraightPlan(): the pit wall was
    // a literal 5.5, which put it two units inside the tarmac the moment the
    // circuit was widened.
    const plan = pitStraightPlan(this.circuitWidth())

    // Down the straight from a little before the line to well past it.
    const SEATS = 26
    const SPACING = 3.4
    const FROM = -46

    for (let i = 0; i < SEATS; i++) {
      const along = FROM + i * SPACING
      const at = this.circuitPoint(along)
      if (!at) continue

      // Inward is toward the middle of the island, which for a ring road is
      // always the same side of the loop.
      const inX = Math.sin(Math.atan2(island.x - at.x, island.z - at.z))
      const inZ = Math.cos(Math.atan2(island.x - at.x, island.z - at.z))

      // And not on top of the road in from the bridge. The stands are built
      // INSIDE the loop, which is exactly where the approach road runs.
      if (gate(at.x - island.x, at.z - island.z)) continue

      // Four tiers, rising away from the track.
      for (let tier = 0; tier < plan.tiers; tier++) {
        const off = plan.tierAt + tier * plan.tierStep
        const y = COURSE_ROAD + 1.4 + tier * 1.5
        const x = at.x + inX * off
        const z = at.z + inZ * off

        const step = new THREE.Mesh(
          new THREE.BoxGeometry(plan.tierDepth * 2, 3, SPACING * 0.96), concreteMat)
        step.position.set(x, y - 1.5, z)
        step.rotation.y = at.heading
        step.receiveShadow = true
        stands.add(step)

        if (tier > 0 && i % 2 === 0) {
          const people = new THREE.Mesh(
            new THREE.BoxGeometry(1.5, 1.1, SPACING * 0.8),
            crowd[(i + tier) % crowd.length])
          people.position.set(x, y + 0.55, z)
          people.rotation.y = at.heading
          stands.add(people)
        }
      }

      // The pit building, tight to the track and lower than the seating.
      if (i % 2 === 0) {
        const off = plan.wallAt
        const x = at.x + inX * off
        const z = at.z + inZ * off
        const wall = new THREE.Mesh(
          new THREE.BoxGeometry(plan.wallDepth * 2, 3.6, SPACING * 1.96), concreteMat)
        wall.position.set(x, COURSE_ROAD + 1.8, z)
        wall.rotation.y = at.heading
        wall.castShadow = true
        stands.add(wall)

        const window_ = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 1.3, SPACING * 1.7), glassMat)
        window_.position.set(x - inX * (plan.wallDepth + 0.1), COURSE_ROAD + 2.5,
          z - inZ * (plan.wallDepth + 0.1))
        window_.rotation.y = at.heading
        stands.add(window_)

        this.game.physics.createStaticBoxAt(
          x, COURSE_ROAD + 1.8, z, plan.wallDepth * 2, 3.6, SPACING * 1.96,
          at.heading)
      }

      // A roof over the back of the stand.
      if (i % 3 === 0) {
        const off = plan.roofAt
        const at2 = { x: at.x + inX * off, z: at.z + inZ * off }
        const roof = new THREE.Mesh(
          new THREE.BoxGeometry(plan.roofDepth * 2, 0.5, SPACING * 2.9), roofMat)
        roof.position.set(at2.x, COURSE_ROAD + 8.4, at2.z)
        roof.rotation.y = at.heading
        roof.castShadow = true
        stands.add(roof)

        const prop = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 8, 0.5), roofMat)
        prop.position.set(at.x + inX * plan.propAt, COURSE_ROAD + 4.2,
          at.z + inZ * plan.propAt)
        stands.add(prop)
      }
    }

    this.game.add(stands)
    this.buildStartGantry(island, this.speedwayLine)
  }

  /**
   * The lights over the start/finish line.
   *
   * Three lamps in a row - red, amber, green - registered as night emissives so
   * they carry the same glow the rest of the world's lamps do. The race drives
   * which one is lit; before one starts they are all dark, which is what an
   * empty circuit looks like.
   */
  buildStartGantry(island, at) {
    const height = 8.5
    // Just past the run-off either side, which is where pitStraightPlan() puts
    // the pit wall's near face too - the two used to be independent numbers and
    // the leg ended up standing inside the wall.
    const span = pitStraightPlan(this.circuitWidth()).gantrySpan
    const fx = Math.sin(at.heading)
    const fz = Math.cos(at.heading)
    const sx = fz
    const sz = -fx

    const material = new THREE.MeshStandardMaterial({
      color: PALETTE.ambulanceStripe, roughness: 0.85, flatShading: true
    })

    for (const side of [-1, 1]) {
      const x = island.x + at.x + sx * (span / 2) * side
      const z = island.z + at.z + sz * (span / 2) * side
      const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, height, 1.2), material)
      leg.position.set(x, COURSE_ROAD + height / 2, z)
      leg.castShadow = true
      this.game.add(leg)
      this.game.physics.createStaticBoxAt(
        x, COURSE_ROAD + height / 2, z, 1.2, height, 1.2, 0)
    }

    const beam = new THREE.Mesh(new THREE.BoxGeometry(span + 1.2, 1.8, 1.5), material)
    beam.position.set(island.x + at.x, COURSE_ROAD + height + 0.9, island.z + at.z)
    beam.rotation.y = at.heading
    beam.castShadow = true
    this.game.add(beam)

    this.raceLamps = {}
    const colours = { red: 0xff2b1c, amber: 0xffb020, green: 0x2bd94a }
    let i = -1
    for (const name of ['red', 'amber', 'green']) {
      i++
      const mat = new THREE.MeshStandardMaterial({
        color: 0x22252b, roughness: 0.6, flatShading: true,
        emissive: new THREE.Color(colours[name]), emissiveIntensity: 0
      })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.6), mat)
      lamp.position.set(
        island.x + at.x + sx * (i - 1) * 2.2 - fx * 0.9,
        COURSE_ROAD + height + 0.9,
        island.z + at.z + sz * (i - 1) * 2.2 - fz * 0.9)
      lamp.rotation.y = at.heading
      this.game.add(lamp)
      this.raceLamps[name] = mat
    }
  }
  createHubSign() {
    const spawn = getSpawnIsland()
    if (!spawn) return

    const canvas = document.createElement('canvas')
    canvas.width = 1024
    canvas.height = 256
    const ctx = canvas.getContext('2d')

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    ctx.font = 'bold 88px Helvetica, Arial, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.94)'
    ctx.strokeStyle = 'rgba(20,60,80,0.55)'
    ctx.lineWidth = 5
    ctx.strokeText('MIKE SUKHYUNG LEE', canvas.width / 2, 92)
    ctx.fillText('MIKE SUKHYUNG LEE', canvas.width / 2, 92)

    ctx.font = 'bold 52px Helvetica, Arial, sans-serif'
    ctx.strokeText('DRIVE TO EXPLORE', canvas.width / 2, 176)
    ctx.fillText('DRIVE TO EXPLORE', canvas.width / 2, 176)

    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 8

    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 6.5),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false })
    )
    sign.rotation.x = -Math.PI / 2
    sign.position.set(spawn.x, 0.14, spawn.z - 10)
    this.game.add(sign)
  }

  // -------------------------------------------------------------
  // The fire
  //
  // The incident itself is decided in fireGame.js, which has no THREE in it.
  // Everything here is smoke, flame and a ladder - and sending the engines.
  // -------------------------------------------------------------

  /**
   * The smoke column, the flames and the water jet.
   *
   * Built once, at the origin, and moved to whatever is alight. A fire is a
   * rare event and building the plume each time would mean a hitch on the
   * frame it starts - which is the frame you are looking at it.
   */
  createFireEffects() {
    this.fireGroup = new THREE.Group()
    this.fireGroup.visible = false

    // --- Flames: a few flat panels that flicker, cheaper than a fluid ---
    this.flameMaterial = new THREE.MeshBasicMaterial({
      color: 0xff8a2b, transparent: true, opacity: 0.9,
      depthWrite: false, side: THREE.DoubleSide, fog: false
    })
    this.flames = []
    for (let i = 0; i < 7; i++) {
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 3.4, 5), this.flameMaterial)
      flame.rotation.y = (i / 7) * Math.PI * 2
      this.flames.push(flame)
      this.fireGroup.add(flame)
    }

    // --- Windows: flame leaning out of the openings the model already has ---
    //
    // Same pool-and-reuse as the roof flames, and the same reason: a fire
    // starts on the frame you are looking at it, so nothing may be built
    // then. Where they go is decided in updateWindowFire(); here they are
    // only made and parked.
    this.windowFlameMaterial = new THREE.MeshBasicMaterial({
      color: 0xffa33a, transparent: true, opacity: 0,
      depthWrite: false, side: THREE.DoubleSide, fog: false
    })
    this.windowFlames = []
    for (let i = 0; i < WINDOW_FIRE_MAX; i++) {
      // A unit cone, so the scale below reads directly as the size of the
      // opening rather than as a factor of some arbitrary built size.
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.5, 1, 5), this.windowFlameMaterial)
      flame.visible = false
      this.windowFlames.push(flame)
      this.fireGroup.add(flame)
    }

    // A real light, so the fire lights the street it is in. One, not seven.
    this.fireLight = new THREE.PointLight(0xff7a20, 0, 46, 1.6)
    this.fireGroup.add(this.fireLight)

    // --- Smoke: the thing you actually navigate by ---
    //
    // Rises and spreads, and is drawn big enough to read from the next
    // island. It is what replaces an arrow on the screen: Mike asked to find
    // the fire by looking for the smoke, so the smoke has to be findable.
    this.smokePositions = new Float32Array(SMOKE_COUNT * 3)
    this.smokeAge = new Float32Array(SMOKE_COUNT)
    for (let i = 0; i < SMOKE_COUNT; i++) this.smokeAge[i] = Math.random() * SMOKE_LIFE

    const smokeGeo = new THREE.BufferGeometry()
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(this.smokePositions, 3))
    this.smokeMaterial = new THREE.PointsMaterial({
      color: 0x4a4a4e, size: 6, sizeAttenuation: true,
      transparent: true, opacity: 0.5, depthWrite: false, fog: true
    })
    this.smoke = new THREE.Points(smokeGeo, this.smokeMaterial)
    this.smoke.frustumCulled = false
    this.fireGroup.add(this.smoke)

    this.game.add(this.fireGroup)

    // --- The aerial and the jet, which live on the player's truck ---
    //
    // See the LADDER_* constants for what the photographs changed. The build
    // below is in four parts because they move differently:
    //
    //   ladderYaw     the turntable, swinging
    //   ladderPitch   the elevation
    //   ladderArm     the four chords, SCALED in z - they really do stretch
    //   ladderStruct  rungs and bracing, PLACED each frame at constant size
    //   ladderTip     the basket, carried out to the end, never scaled
    //
    // Nested rather than composed into one matrix, because they ease at
    // different rates: the turntable swings round, then the ladder lifts,
    // then it telescopes out. As one rotation they could only move together.
    this.ladderGroup = new THREE.Group()
    this.ladderGroup.visible = false

    this.ladderYaw = new THREE.Group()
    this.ladderPitch = new THREE.Group()
    this.ladderArm = new THREE.Group()
    this.ladderStruct = new THREE.Group()
    this.ladderTip = new THREE.Group()
    this.ladderYaw.add(this.ladderPitch)
    this.ladderPitch.add(this.ladderArm)
    this.ladderPitch.add(this.ladderStruct)
    this.ladderPitch.add(this.ladderTip)
    this.ladderGroup.add(this.ladderYaw)

    const ladderMat = new THREE.MeshStandardMaterial({
      color: 0xd8d2c4, roughness: 0.6, metalness: 0.3, flatShading: true
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: PALETTE.fireBody, roughness: 0.55, metalness: 0.1, flatShading: true
    })

    // The pedestal and turntable it stands on, so it sits on something rather
    // than sprouting out of the bodywork.
    const pedestal = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.3, 1.5), trimMat)
    pedestal.position.y = -0.15
    this.ladderGroup.add(pedestal)
    const turntable = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.66, 0.26, 12), ladderMat)
    this.ladderYaw.add(turntable)

    // FOUR chords, not two rails: this is the box truss, and its depth is
    // most of what you see of it side-on. Authored one unit long from the
    // base, so extension is one number.
    const halfW = LADDER_WIDTH / 2
    for (const side of [1, -1]) {
      for (const [level, thick] of [[0, 0.1], [LADDER_DEPTH, 0.08]]) {
        const chord = new THREE.Mesh(
          new THREE.BoxGeometry(thick, thick, 1), ladderMat)
        chord.geometry.translate(0, 0, 0.5)
        chord.position.set(side * halfW, level, 0)
        this.ladderArm.add(chord)
      }
    }

    // Rungs across the bottom pair, and a diagonal each side per bay. Built
    // once at unit length and moved into place each frame - see LADDER_BAY.
    this.ladderRungs = []
    this.ladderBraces = []
    for (let i = 0; i < LADDER_MAX_BAYS; i++) {
      const rung = new THREE.Mesh(
        new THREE.BoxGeometry(LADDER_WIDTH, 0.05, 0.05), ladderMat)
      rung.visible = false
      this.ladderStruct.add(rung)
      this.ladderRungs.push(rung)

      const bay = []
      for (const side of [1, -1]) {
        const brace = new THREE.Mesh(
          new THREE.BoxGeometry(0.045, 0.045, 1), ladderMat)
        brace.visible = false
        brace.position.x = side * halfW
        this.ladderStruct.add(brace)
        bay.push(brace)
      }
      this.ladderBraces.push(bay)
    }

    // The basket. A floor, four corner posts and a rail round the top, with
    // the monitor on the front rail - which is where the water comes from.
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(BASKET_WIDTH, 0.1, BASKET_DEPTH), trimMat)
    floor.position.set(0, LADDER_DEPTH / 2, BASKET_DEPTH / 2)
    this.ladderTip.add(floor)

    for (const sx of [1, -1]) {
      for (const sz of [0.06, 0.94]) {
        const post = new THREE.Mesh(
          new THREE.BoxGeometry(0.07, BASKET_RAIL, 0.07), ladderMat)
        post.position.set(sx * (BASKET_WIDTH / 2 - 0.06),
                          LADDER_DEPTH / 2 + BASKET_RAIL / 2,
                          BASKET_DEPTH * sz)
        this.ladderTip.add(post)
      }
      const railSide = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, BASKET_DEPTH), ladderMat)
      railSide.position.set(sx * (BASKET_WIDTH / 2 - 0.06),
                            LADDER_DEPTH / 2 + BASKET_RAIL, BASKET_DEPTH / 2)
      this.ladderTip.add(railSide)
    }
    for (const sz of [0.06, 0.94]) {
      const railEnd = new THREE.Mesh(
        new THREE.BoxGeometry(BASKET_WIDTH, 0.06, 0.06), ladderMat)
      railEnd.position.set(0, LADDER_DEPTH / 2 + BASKET_RAIL, BASKET_DEPTH * sz)
      this.ladderTip.add(railEnd)
    }

    // The monitor: a stubby nozzle on the front rail. The jet is emitted from
    // here in world space rather than parented to it, so the arc does not
    // rotate with the basket - but this is what you see it come out of.
    const monitor = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.1, 0.45, 8), ladderMat)
    monitor.rotation.x = Math.PI / 2
    monitor.position.set(0, LADDER_DEPTH / 2 + BASKET_RAIL, BASKET_DEPTH + 0.18)
    this.ladderTip.add(monitor)

    // Where the nozzle is in the ladder's own frame, so the jet can start
    // exactly there rather than somewhere near it.
    this.basketNozzle = new THREE.Vector3(
      0, LADDER_DEPTH / 2 + BASKET_RAIL, BASKET_DEPTH + 0.4)

    this.jetMaterial = new THREE.PointsMaterial({
      color: 0xbfe4ff, size: 0.7, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false
    })
    this.jetPositions = new Float32Array(JET_COUNT * 3)
    this.jetAge = new Float32Array(JET_COUNT)
    for (let i = 0; i < JET_COUNT; i++) this.jetAge[i] = Math.random()
    const jetGeo = new THREE.BufferGeometry()
    jetGeo.setAttribute('position', new THREE.BufferAttribute(this.jetPositions, 3))
    this.jet = new THREE.Points(jetGeo, this.jetMaterial)
    this.jet.frustumCulled = false
    this.ladderGroup.add(this.jet)

    // Where it currently is, as opposed to where it is going. Eased toward
    // the target every frame - that easing IS the animation.
    this.ladderNow = { yaw: 0, pitch: 0, length: 0 }

    this.game.add(this.ladderGroup)
  }

  /**
   * Send fire engines to the fire, and take them off the call afterwards.
   *
   * `v.mission` is a hops-per-lane table, exactly the shape the layout
   * already uses to send a service vehicle home - so the routing is the
   * routing that has always been there, pointed somewhere else.
   */
  callOutEngines(fire) {
    const engines = this.traffic.filter(v => v.kind === 'fire')

    if (!fire) {
      for (const v of engines) v.mission = null
      this.fireRoute = null
      return
    }

    if (this.fireRoute && this.fireRoute.for === fire) return

    const route = routeToPoint(this.lanes, fire.x, fire.z)
    this.fireRoute = route ? { for: fire, hops: route.hops } : null
    if (!this.fireRoute) return

    // Nearest first, so the ones that turn out are the ones that would
    // plausibly be sent - and only a few, or every fire empties the streets.
    const sorted = engines
      .map(v => ({ v, hops: this.fireRoute.hops[v.lane] ?? Infinity }))
      .sort((a, b) => a.hops - b.hops)

    sorted.forEach(({ v }, i) => {
      v.mission = i < RESPONDERS ? this.fireRoute.hops : null
    })
  }

  /**
   * Fuel, one frame.
   *
   * Speed comes from the vehicle's own `currentSpeed` and its own
   * `maxForwardSpeed`, so gasGame.js never has to know what units this game
   * drives in - it only ever uses their ratio.
   */
  updateGas(delta) {
    if (!this.gas) return

    const vehicle = this.game.vehicle
    const mesh = vehicle && vehicle.mesh
    const player = mesh
      ? {
          x: mesh.position.x, z: mesh.position.z,
          kind: vehicle.kind,
          speed: vehicle.currentSpeed || 0
        }
      : null

    stepGas(this.gas, delta, {
      player,
      maxSpeed: (vehicle && vehicle.params && vehicle.params.maxForwardSpeed) || 18,
      bays: this.fuelBays,
      // Stage three hooks the tow truck on here. Until then running dry is a
      // banner and an empty gauge, which is honest about what it does rather
      // than half-starting a recovery that cannot finish.
      tow: null
    })
  }

  /** What the gauge shows. UI.js works nothing out for itself. */
  fuelGauge() {
    return fuelGauge(this.gas || { fuel: null })
  }

  updateFire(delta) {
    if (!this.fire) return

    const vehicle = this.game.vehicle
    const player = vehicle && vehicle.mesh
      ? { x: vehicle.mesh.position.x, z: vehicle.mesh.position.z,
          isFire: vehicle.kind === 'fire' }
      : null

    stepFire(this.fire, delta, {
      buildings: this.buildings,
      player,
      engines: (this.traffic || [])
        .filter(v => v.kind === 'fire' && v.drawn)
        .map(v => ({ x: v.drawn.x, z: v.drawn.z })),
      rand: () => this.rand()
    })

    const fire = this.fire.fire
    this.callOutEngines(fire)
    this.updateFireEffects(delta, fire, player)
  }

  /**
   * The ladder lying on the truck's roof: on when it is stowed, off while the
   * aerial is run out.
   *
   * Asked of the mesh every time rather than held as a reference, for the
   * reason the headlights taught: setKind() rebuilds the mesh, and a
   * reference kept across that swap points at a truck that is no longer in
   * the scene.
   */
  showStowedLadder(show) {
    const vehicle = this.game.vehicle
    const stowed = vehicle && vehicle.mesh && vehicle.mesh.userData
      ? vehicle.mesh.userData.stowedLadder
      : null
    if (stowed) stowed.visible = show
  }

  /**
   * Which windows of the burning building are showing flame.
   *
   * Worked out once per incident and kept on the fire, because the answer
   * cannot change while one building burns and the alternative is a texture
   * read every frame.
   *
   * The lowest windows are left alone. A fire vents upward, and a flame in a
   * ground-floor window is at the height an engine parks - so the truck you
   * drove there ends up standing in it.
   */
  windowFireVents(fire) {
    if (fire.windowVents) return fire.windowVents

    const all = this.buildingVents(fire.building)
    const base = this.groundAt(fire.x, fire.z)
    const cutoff = base + (fire.top || 6) * WINDOW_FIRE_FLOOR

    // A bungalow has nothing above the cutoff. Better its one window burns
    // than that a whole class of building never shows any fire at all.
    const upper = all.filter(v => v.y >= cutoff)
    const pool = upper.length ? upper : all

    fire.windowVents = pool
      .slice()
      .sort((a, b) => b.y - a.y)
      .slice(0, WINDOW_FIRE_MAX)

    return fire.windowVents
  }

  /**
   * Flame in each of those windows, leaning out and up.
   *
   * The lean is the whole difference between this and a cone parked in a
   * hole: fire out of a window goes up the wall above it, so each flame is
   * tilted from vertical towards the way its window faces and no further -
   * pointing it straight out would lay it flat across the street.
   */
  updateWindowFire(fire, base, strength) {
    if (!this.windowFlames || !this.windowFlames.length) return

    const showing = strength > 0.05
    this.windowFlameMaterial.opacity = 0.95 * strength

    const vents = showing ? this.windowFireVents(fire) : []

    this._ventLean = this._ventLean || new THREE.Vector3()
    this._ventSpin = this._ventSpin || new THREE.Quaternion()
    this._ventUp = this._ventUp || new THREE.Vector3(0, 1, 0)

    for (let i = 0; i < this.windowFlames.length; i++) {
      const flame = this.windowFlames[i]
      const vent = vents[i]

      if (!vent) { flame.visible = false; continue }

      const flicker = 0.65 + 0.35 * Math.sin(this.elapsed * (6.5 + i * 0.7) + i * 1.7)

      // The group sits on the ground under the building, so everything in it
      // is measured from there - the same rule the roof flames follow, and
      // the one worldsanity exists to enforce.
      flame.position.set(
        vent.x - fire.x + vent.nx * vent.width * WINDOW_FIRE_LEAN,
        vent.y - base,
        vent.z - fire.z + vent.nz * vent.width * WINDOW_FIRE_LEAN
      )

      this._ventLean
        .set(vent.nx * 0.55, 1, vent.nz * 0.55)
        .normalize()
      this._ventSpin.setFromUnitVectors(this._ventUp, this._ventLean)
      flame.quaternion.copy(this._ventSpin)

      const across = Math.max(0.6, vent.width) * 1.25
      const tall = Math.max(0.8, vent.height) * 1.9

      flame.scale.set(
        across * strength, tall * flicker * strength, across * strength)
      flame.visible = true
    }
  }

  updateFireEffects(delta, fire, player) {
    if (!this.fireGroup) return

    this.fireGroup.visible = !!fire
    if (!fire) {
      this.ladderGroup.visible = false
      // And the stowed one goes back on the roof. Missed on the first pass:
      // put the fire out while parked alongside it and the truck drove away
      // for the rest of the session with no ladder on it at all, because the
      // only line that restored it was further down and unreachable from here.
      this.showStowedLadder(true)
      return
    }

    // The group sits ON THE GROUND under the building, and everything in it
    // is measured from there. Parking it at y=0 and giving the children
    // absolute heights worked and is the habit worldsanity exists to catch:
    // it is right only while the ground under that particular building
    // happens to be at zero.
    const base = this.groundAt(fire.x, fire.z)
    const roof = fire.top
    const strength = smokeStrength(this.fire)

    this.fireGroup.position.set(fire.x, base, fire.z)

    // Flames at the roof, flickering out of step with each other
    for (let i = 0; i < this.flames.length; i++) {
      const flicker = 0.7 + 0.3 * Math.sin(this.elapsed * (5 + i) + i * 2.1)
      this.flames[i].position.set(
        Math.sin(i * 2.4) * 1.6, roof + 1.2 * flicker, Math.cos(i * 2.4) * 1.6)
      this.flames[i].scale.set(strength, flicker * strength, strength)
      this.flames[i].visible = strength > 0.05
    }
    this.flameMaterial.opacity = 0.9 * strength
    this.fireLight.position.set(0, roof + 2, 0)
    this.fireLight.intensity = 26 * strength

    // And out of the windows, which is what says the building is alight
    // rather than something on its roof is.
    this.updateWindowFire(fire, base, strength)

    // Smoke: straight up, spreading, blown by whatever wind there is
    const env = this.game.environment
    const wind = env ? env.windVector : { x: 0, z: 0 }
    for (let i = 0; i < SMOKE_COUNT; i++) {
      this.smokeAge[i] += delta
      if (this.smokeAge[i] > SMOKE_LIFE) this.smokeAge[i] -= SMOKE_LIFE
      const t = this.smokeAge[i] / SMOKE_LIFE
      const spread = 1.5 + t * 11
      const angle = i * 2.399                      // golden angle, so no rows
      const i3 = i * 3
      this.smokePositions[i3] = Math.sin(angle + t * 3) * spread * t + wind.x * t * 26
      this.smokePositions[i3 + 1] = roof + t * SMOKE_RISE
      this.smokePositions[i3 + 2] = Math.cos(angle + t * 3) * spread * t + wind.z * t * 26
    }
    this.smoke.geometry.attributes.position.needsUpdate = true
    this.smokeMaterial.opacity = 0.5 * strength

    // The ladder and the jet, only for the player's own truck and only when
    // it is actually alongside. Both are drawn from the truck to the fire, so
    // they point wherever it is parked rather than assuming an approach.
    const vehicle = this.game.vehicle
    const alongside = !!(player && player.isFire && fire.playerOnStation)
    this.ladderGroup.visible = alongside

    // The stowed ladder comes off the roof while the aerial is out, or the
    // truck is carrying two of them.
    this.showStowedLadder(!alongside)

    if (!alongside || !vehicle) return

    const from = vehicle.mesh.position

    // REAR-MOUNTED. The turntable is at the back of the truck, not in the
    // middle of the roof, so the whole aerial has to be based there - and
    // "the back" is in the TRUCK's frame, which turns with it.
    const heading = vehicle.mesh.rotation.y
    const back = TRAFFIC_LENGTHS.fire * LADDER_MOUNT_BACK
    const baseX = from.x - Math.sin(heading) * back
    const baseZ = from.z - Math.cos(heading) * back
    const foot = from.y + LADDER_MOUNT

    this.ladderGroup.position.set(baseX, foot, baseZ)
    this.ladderGroup.rotation.y = 0

    const dx = fire.x - baseX
    const dz = fire.z - baseZ
    const flat = Math.hypot(dx, dz)

    // THE BASKET STANDS OFF THE BUILDING. It parks in the air a few metres
    // clear and hoses in; it does not go up to the wall and touch it.
    //
    // How far clear is measured from the building's own footprint, because a
    // fixed standoff from the CENTRE would put the basket inside a wide
    // building and out in the street beside a narrow one. The mean half-extent
    // rather than a proper ray-box intersection: the buildings are rotated,
    // the difference is under a metre, and a metre is not visible at the
    // distance you watch a ladder from.
    const b = fire.building || {}
    const halfSpan = ((b.width || 6) + (b.depth || 6)) / 4
    const basketFlat = Math.max(1.4, flat - halfSpan - LADDER_STANDOFF)

    const basketY = base + roof + BASKET_ABOVE_ROOF
    const rise = basketY - foot
    const reach = Math.hypot(basketFlat, rise)

    // Turned in the WORLD rather than in the truck's frame, because the
    // truck's frame turns with the truck: parked nose-on or side-on to the
    // building, the ladder must still end up pointing at the building.
    const wantYaw = Math.atan2(dx, dz)
    const wantPitch = Math.atan2(rise, basketFlat)

    const k = 1 - Math.exp(-LADDER_RATE * delta)
    let turn = wantYaw - this.ladderNow.yaw
    while (turn > Math.PI) turn -= Math.PI * 2
    while (turn < -Math.PI) turn += Math.PI * 2
    this.ladderNow.yaw += turn * k
    this.ladderNow.pitch += (wantPitch - this.ladderNow.pitch) * k
    // Extension eases from stowed, so arriving at a fire visibly runs the
    // ladder out rather than having it already there.
    this.ladderNow.length += (reach - this.ladderNow.length) * k

    const length = Math.max(0.01, this.ladderNow.length)
    this.ladderYaw.rotation.y = this.ladderNow.yaw
    this.ladderPitch.rotation.x = -this.ladderNow.pitch
    this.ladderArm.scale.z = length
    this.ladderTip.position.z = length

    // THE BASKET STAYS LEVEL.
    //
    // A real platform hangs on a levelling mechanism and is horizontal at
    // every elevation - you can see it in all of Mike's photographs, and it
    // has to be: people stand in it. Bolted rigidly to the tip, as this was
    // first built, it rode up with the ladder and sat at 45 degrees, which
    // reads as a basket about to tip its crew into the street.
    //
    // The tip node is a child of the pitch node, so cancelling the pitch here
    // is the whole of the mechanism: the platform is carried out to the end
    // of the ladder and hangs level, exactly as the real linkage does.
    this.ladderTip.rotation.x = this.ladderNow.pitch

    // Rungs and bracing, in bays of roughly constant length however far it is
    // run out - so the lattice keeps its proportions instead of a fixed
    // number of bays stretching into a set of long thin rectangles.
    const bays = Math.max(2, Math.min(LADDER_MAX_BAYS,
      Math.round(length / LADDER_BAY)))
    const bayLength = length / bays
    const braceLength = Math.hypot(bayLength, LADDER_DEPTH)
    const braceTilt = Math.atan2(LADDER_DEPTH, bayLength)

    for (let i = 0; i < LADDER_MAX_BAYS; i++) {
      const on = i < bays
      this.ladderRungs[i].visible = on
      this.ladderBraces[i][0].visible = on
      this.ladderBraces[i][1].visible = on
      if (!on) continue

      this.ladderRungs[i].position.z = (i + 0.5) * bayLength

      // Alternating, so the bracing zigzags up the side the way a truss does
      // rather than leaning the same way all the way out.
      const up = i % 2 === 0
      for (const brace of this.ladderBraces[i]) {
        brace.position.y = LADDER_DEPTH / 2
        brace.position.z = (i + 0.5) * bayLength
        brace.scale.z = braceLength
        brace.rotation.x = up ? -braceTilt : braceTilt
      }
    }

    // THE WATER COMES OUT OF THE BASKET, which is the whole reason the basket
    // exists. The nozzle's position is worked out in the ladder's own frame
    // from where the tip actually is - not from where the ladder was asked to
    // go - so the jet starts at the monitor throughout the run-out rather than
    // arriving at the end of a ladder that has not got there yet.
    const cp = Math.cos(this.ladderNow.pitch)
    const sp = Math.sin(this.ladderNow.pitch)
    const sy = Math.sin(this.ladderNow.yaw)
    const cy = Math.cos(this.ladderNow.yaw)

    // The ladder tip, and then the nozzle's offset from it. Two steps, and
    // they are in DIFFERENT frames now that the basket is levelled: the tip
    // is along the pitched ladder, but the monitor's offset from the tip is
    // horizontal-and-vertical, because that is what levelling the platform
    // means. Rotating the offset with the ladder - which is what the first
    // version did - put the nozzle a metre out of place at full elevation and
    // the stream appeared to start beside the basket rather than in it.
    const tipFlat = length * cp
    const tipY = length * sp
    const alongFlat = tipFlat + this.basketNozzle.z
    const nozzleY = tipY + this.basketNozzle.y
    const nozzleX = sy * alongFlat
    const nozzleZ = cy * alongFlat

    // From the nozzle to the roof of the burning building, in the same frame.
    const aimX = dx - nozzleX
    const aimY = (base + roof + 0.6) - (foot + nozzleY)
    const aimZ = dz - nozzleZ

    // Held back until the ladder is most of the way out - not because the jet
    // would be wrong, but because a basket still on its way up should not
    // already be fighting the fire.
    const out = reach > 0 ? this.ladderNow.length / reach : 0
    this.jetMaterial.opacity = out > 0.8 ? 0.85 : 0
    for (let i = 0; i < JET_COUNT; i++) {
      this.jetAge[i] += delta * 1.7
      if (this.jetAge[i] > 1) this.jetAge[i] -= 1
      const t = this.jetAge[i]
      const i3 = i * 3
      const spray = (Math.random() - 0.5) * 0.7 * t
      this.jetPositions[i3] = nozzleX + aimX * t + spray
      // Arcing over rather than running straight: a monitor throws a stream,
      // and a straight line between two points reads as a rod.
      this.jetPositions[i3 + 1] = nozzleY + aimY * t + Math.sin(t * Math.PI) * 1.8
      this.jetPositions[i3 + 2] = nozzleZ + aimZ * t + spray
    }
    this.jet.geometry.attributes.position.needsUpdate = true
  }

  // -------------------------------------------------------------
  // The pursuit
  // -------------------------------------------------------------

  /**
   * Turn an ordinary car into a robber, or let one go.
   *
   * A robber is not a new vehicle - it is a car already on the road, told to
   * run. That is worth more than it sounds: it is already in traffic, already
   * has a lane, already collides with everything, and when the chase ends it
   * simply carries on with its day. Spawning a bespoke fleeing car would mean
   * a second kind of vehicle with a second set of rules.
   */
  makeRobber() {
    const candidates = (this.traffic || [])
      .filter(v => v.drawn && !v.parking)
      .map(v => ({ ...v, x: v.drawn.x, z: v.drawn.z, ref: v }))

    const car = this.game.vehicle && this.game.vehicle.mesh
    const player = car ? { x: car.position.x, z: car.position.z } : null

    const chosen = chooseRobber(candidates, player, () => this.rand())
    if (!chosen) return null

    const v = chosen.ref
    v.robber = true

    // The paint has no emissive colour until it needs one - every other car
    // in the world keeps a plain material, and only the one that is running
    // gets something to flash with.
    const body = v.mesh && v.mesh.userData.body
    if (body) {
      body.emissive = new THREE.Color(ROBBER_FLASH_COLOUR)
      body.emissiveIntensity = 0
    }

    v.wasCruise = v.cruise
    // Slightly slower than a police car at full pelt, so a chase is winnable
    // by driving well rather than by holding the boost - and cannot be lost
    // to something simply faster than you.
    v.cruise = PLAYER_TOP_SPEED * ROBBER_SPEED
    v.robberId = (this._robberId = (this._robberId || 0) + 1)
    return v.robberId
  }

  releaseRobber(id) {
    for (const v of this.traffic || []) {
      if (v.robberId !== id) continue
      v.robber = false
      v.robberId = null
      v.fleeFrom = null
      if (v.wasCruise !== undefined) { v.cruise = v.wasCruise; v.wasCruise = undefined }
      if (v.mesh && v.mesh.userData.body) {
        v.mesh.userData.body.emissiveIntensity = 0
      }
    }
  }

  updatePolice(delta) {
    if (!this.police) return

    const car = this.game.vehicle && this.game.vehicle.mesh
    const player = car
      ? { x: car.position.x, z: car.position.z,
          isPolice: this.game.vehicle.kind === 'police' }
      : null

    const robbers = (this.traffic || [])
      .filter(v => v.robber && v.drawn)
      .map(v => ({ id: v.robberId, x: v.drawn.x, z: v.drawn.z, ref: v }))

    stepPolice(this.police, delta, {
      player,
      robbers,
      stations: this.policeStations(),
      spawn: () => this.makeRobber(),
      release: (id) => this.releaseRobber(id),
      rand: () => this.rand()
    })

    // Who each robber is running from, and the flash that lets you pick it
    // out of the traffic.
    const beat = Math.floor(this.elapsed * ROBBER_FLASH) % 2 === 0
    for (const robber of robbers) {
      let nearest = null
      let best = Infinity

      // The player's police car counts, and so does every patrol car - a
      // robber that only ran from the player would drive straight past three
      // stationary police cars, which looks like it has not noticed them.
      const pursuers = (this.traffic || [])
        .filter(v => v.kind === 'police' && v.drawn)
        .map(v => ({ x: v.drawn.x, z: v.drawn.z }))
      if (player && player.isPolice) pursuers.push(player)

      for (const p of pursuers) {
        const gap = Math.hypot(p.x - robber.x, p.z - robber.z)
        if (gap < best) { best = gap; nearest = p }
      }
      robber.ref.fleeFrom = nearest

      const body = robber.ref.mesh && robber.ref.mesh.userData.body
      if (body) body.emissiveIntensity = beat ? 1.9 : 0.15
    }

    // Patrol cars converge on the nearest robber. Same callout machinery the
    // fire engines use - they cannot END a chase, but they can be in it.
    this.callOutPolice(robbers)
  }

  callOutPolice(robbers) {
    const patrol = (this.traffic || []).filter(v => v.kind === 'police')

    if (!robbers.length) {
      for (const v of patrol) v.mission = null
      this.chaseRoutes = null
      return
    }

    // Recomputed only when the set of chases changes, not every frame: a BFS
    // per robber per frame would be sixty of them a second for a table that
    // is stale by a lane at most.
    const key = robbers.map(r => r.id).join(',')
    if (this.chaseRoutes && this.chaseRoutes.key === key &&
        this.elapsed - this.chaseRoutes.at < CHASE_REROUTE) return

    this.chaseRoutes = { key, at: this.elapsed, hops: [] }
    for (const robber of robbers) {
      const route = routeToPoint(this.lanes, robber.x, robber.z)
      if (route) this.chaseRoutes.hops.push(route.hops)
    }

    patrol.forEach((v, i) => {
      const hops = this.chaseRoutes.hops[i % Math.max(1, this.chaseRoutes.hops.length)]
      v.mission = hops || null
    })
  }

  // -------------------------------------------------------------
  // The ambulance run
  // -------------------------------------------------------------

  /**
   * Every place a crash can happen: points along the roads, each labelled
   * with the island it is on.
   *
   * On the ROADS, because that is where cars crash and, more to the point,
   * the only places an ambulance can reach. Scattering crashes across the
   * map would put some of them on beaches and hillsides where the run could
   * never be completed - a failure the player would read as their own.
   *
   * Worked out once, at build time. The road network does not move.
   */
  findCrashSites() {
    const sites = []

    for (let i = 0; i < this.lanes.lanes.length; i++) {
      const lane = this.lanes.lanes[i]
      if (lane.length < 20) continue

      // NOT ON A CLOSED COURSE.
      //
      // The racing circuit and the stunt arena floor are real lanes in the
      // network - that is what keeps their bridges joined to the rest of the
      // world - and `noTraffic` is what keeps the city's cars off them. It did
      // not keep CRASHES off them: found while photographing a recovery, by
      // asking for the crash site furthest from the garage and being given a
      // spot on the speedway's pit straight.
      //
      // A crash there is wrong twice over. Two wrecked cars on the racing line
      // are an obstacle in the middle of a ten-lap race, and the ambulance and
      // the tow truck would both be sent onto a course the traffic is
      // deliberately kept off. Same guard as relocate() in islandLayout.js.
      if (lane.noTraffic) continue

      const at = pointAlong(lane, lane.length * 0.5)
      // Which island it is on, by asking which one it is inside rather than
      // which centre is nearest: the islands are different sizes, and the
      // nearest CENTRE to a road on the edge of a big island is regularly a
      // small island across the water.
      let island = null
      for (const candidate of ISLANDS) {
        const here = getIsland(candidate.id)
        if (inlandDistance(here, at.x - here.x, at.z - here.z) > 0) {
          island = here
          break
        }
      }
      if (!island) continue

      sites.push({
        x: at.x, z: at.z, heading: at.heading,
        island: islandName(island)
      })
    }

    return sites
  }

  /**
   * The wreck: two cars that have met. Built once and moved, like the fire.
   */
  /**
   * The two crashed cars, as two INDEPENDENT objects.
   *
   * They used to be one Group with two cars parented inside it, positioned at
   * the incident and hidden when the run was over. That was right while the
   * only thing that ever happened to a crash was that it stopped existing.
   *
   * It stopped being right the moment Mike asked for the tow truck: "the
   * crashed cars no longer disappear after the ambulance rescues them.
   * Instead, it kicks off the tow truck game... After the first car is taken
   * back to the garage, the first car will then disappear. The player's tow
   * truck will then go to the second car."
   *
   * One car leaves and one stays. Two children of a shared group cannot do
   * that, so each car is now its own three-deep rig standing in WORLD
   * coordinates:
   *
   *   carrier   at the car's REAR AXLE, turned to its heading
   *     inner   pitched nose-up by however far the wheel-lift has raised it
   *       mesh  the car itself, pushed forward so its rear axle is the origin
   *
   * The rear axle is the origin because that is the point a towed car pivots
   * about: its back wheels are the ones still on the road. Build it around the
   * car's centre instead and lifting the nose sinks the tail through the
   * tarmac.
   */
  createWreckCars() {
    this.wreckCars = []

    // TWO REAL CARS, from the same builders the traffic uses.
    //
    // They were two plain boxes, which read as two boxes. Using the fleet's
    // own meshes costs nothing - they are built once and moved, like the fire
    // - and means the crash is made of the same cars you have been driving
    // past all session, wheels, lamps and all. A sedan and an SUV rather than
    // two sedans, because two identical cars nose to nose reads as one car
    // reflected.
    const colours = [PALETTE.carRed, PALETTE.carBlue]

    for (let i = 0; i < CRASH_CARS.length; i++) {
      const spec = CRASH_CARS[i]
      const length = TRAFFIC_LENGTHS[spec.kind]
      const mesh = this.buildTrafficVehicle({ kind: spec.kind, colour: colours[i] })

      // The fleet's wheels sit at 0.31 of the length either side of centre,
      // so this is the axle-to-axle distance and the amount the mesh has to
      // move forward for its rear axle to land on the carrier's origin. Both
      // come from the one number; see wheelPositions().
      const back = length * 0.31
      mesh.position.z = back

      const inner = new THREE.Group()
      inner.add(mesh)
      const carrier = new THREE.Group()
      carrier.add(inner)
      carrier.visible = false
      this.game.add(carrier)

      // Hazard lights, so a wreck is findable in the dark as well as in the
      // day - and now they travel WITH the car, including up onto the hook,
      // because a car being towed with its hazards on is what one looks like.
      const hazard = new THREE.MeshStandardMaterial({
        color: 0x7a4a10, roughness: 0.5,
        emissive: new THREE.Color(0xffa62b), emissiveIntensity: 0
      })
      for (const side of [1, -1]) {
        for (const along of [length * 0.46, -length * 0.46]) {
          const lamp = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, 0.16, 0.16), hazard)
          lamp.position.set(side * 0.68, 0.78, along)
          mesh.add(lamp)
        }
      }

      this.wreckCars.push({
        kind: spec.kind,
        carrier,
        inner,
        mesh,
        hazard,
        length,
        width: TRAFFIC_WIDTHS[spec.kind],
        wheelbase: back * 2,
        roll: spec.roll,
        // Where the smoke comes out, along the car from its rear axle.
        engineAt: length * 0.42 + back
      })
    }

    // Smoke out of both bonnets. One buffer for the pair, and deliberately
    // NOT the fire's smoke: that column is forty-six units tall and visible
    // from the next island, which is its job. This is a wisp off an engine
    // that says "something happened here" from across the street and does not
    // pretend the road is ablaze.
    //
    // A child of the SCENE now rather than of the wreck, because there is no
    // longer one wreck to be a child of - the two cars can be a kilometre
    // apart, one on a hook and one still in the road.
    this.crashSmokeMaterial = new THREE.PointsMaterial({
      color: 0x6f6f74, size: 0.95, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false
    })
    this.crashSmokePositions = new Float32Array(CRASH_SMOKE_COUNT * 3)
    this.crashSmokeAge = new Float32Array(CRASH_SMOKE_COUNT)
    for (let i = 0; i < CRASH_SMOKE_COUNT; i++) {
      this.crashSmokeAge[i] = Math.random() * CRASH_SMOKE_LIFE
    }
    const smokeGeo = new THREE.BufferGeometry()
    smokeGeo.setAttribute('position',
      new THREE.BufferAttribute(this.crashSmokePositions, 3))
    this.crashSmoke = new THREE.Points(smokeGeo, this.crashSmokeMaterial)
    this.crashSmoke.frustumCulled = false
    this.wreckEngines = []
    this.game.add(this.crashSmoke)
  }

  /**
   * Put one wrecked car on the ground at a stated pose.
   *
   * `pitch` is how far its nose is up in the air, which is zero for anything
   * that is not currently hanging off a wheel-lift.
   */
  placeWreckCar(car, x, z, heading, pitch = 0) {
    car.carrier.visible = true
    car.carrier.position.set(x, this.groundAt(x, z), z)
    car.carrier.rotation.y = heading
    car.inner.rotation.x = -pitch
    car.mesh.rotation.z = car.roll
    car.pose = { x, z, heading, pitch }
  }



  /** The wisp of smoke off each crashed engine. */
  updateCrashSmoke(delta) {
    if (!this.crashSmoke) return

    // Off the bonnet of every car STILL IN THE ROAD, in world coordinates.
    //
    // These used to be two fixed points inside the wreck's own group, which
    // worked while the wreck was one object that only ever moved as a whole.
    // Now the two cars can be anywhere - and a car that has been recovered
    // should stop smoking, because it has been recovered.
    this.wreckEngines.length = 0
    for (const w of this.wreckCars || []) {
      // `atScene`, not just "visible and flat". A car that has been recovered
      // and parked in the garage is both of those, and it went on smoking
      // gently in the middle of the bay - which is a fine joke and not what
      // anybody meant. Only a car still lying where it crashed has a bonnet
      // worth steaming.
      if (!w.carrier.visible || !w.pose || !w.atScene) continue
      this.wreckEngines.push({
        x: w.pose.x + Math.sin(w.pose.heading) * w.engineAt,
        y: this.groundAt(w.pose.x, w.pose.z) + 0.95,
        z: w.pose.z + Math.cos(w.pose.heading) * w.engineAt
      })
    }
    if (!this.wreckEngines.length) {
      this.crashSmokeMaterial.opacity = 0
      return
    }

    const per = Math.max(1, Math.floor(CRASH_SMOKE_COUNT / this.wreckEngines.length))
    for (let i = 0; i < CRASH_SMOKE_COUNT; i++) {
      this.crashSmokeAge[i] += delta
      if (this.crashSmokeAge[i] > CRASH_SMOKE_LIFE) {
        this.crashSmokeAge[i] -= CRASH_SMOKE_LIFE
      }
      const t = this.crashSmokeAge[i] / CRASH_SMOKE_LIFE
      const engine = this.wreckEngines[Math.min(this.wreckEngines.length - 1,
        Math.floor(i / per))]
      // Golden angle again, so the puffs do not come out in rows.
      const a = i * 2.399
      const spread = 0.25 + t * 1.5
      const i3 = i * 3
      this.crashSmokePositions[i3] = engine.x + Math.sin(a + t * 2) * spread
      this.crashSmokePositions[i3 + 1] = engine.y + t * CRASH_SMOKE_RISE
      this.crashSmokePositions[i3 + 2] = engine.z + Math.cos(a + t * 2) * spread
    }
    this.crashSmoke.geometry.attributes.position.needsUpdate = true
    // Thinning as it goes up is done with one opacity rather than per-point
    // colour: the whole plume is small, and a gradient on something two
    // metres tall is detail nobody will ever see.
    this.crashSmokeMaterial.opacity = 0.5
  }

  updateAmbulance(delta) {
    if (!this.ambulance) return

    const car = this.game.vehicle && this.game.vehicle.mesh
    const player = car
      ? { x: car.position.x, z: car.position.z,
          isAmbulance: this.game.vehicle.kind === 'ambulance' }
      : null

    stepAmbulance(this.ambulance, delta, {
      sites: this.crashSites,
      hospitals: this.hospitals(),
      player,
      ambulances: (this.traffic || [])
        .filter(v => v.kind === 'ambulance' && v.drawn)
        .map(v => ({ x: v.drawn.x, z: v.drawn.z })),
      // Where everything else is, so a crash is not placed on top of a bus -
      // see CRASH_CLEARANCE. Read every frame and used on about one of them a
      // minute, which is the wrong way round but costs a map over fifty-odd
      // vehicles; making it lazy would mean the game module reaching back into
      // World for it, and that is a worse trade than the map.
      busy: (this.traffic || []).filter(v => v.drawn)
        .map(v => ({ x: v.drawn.x, z: v.drawn.z })),
      // DON'T START ANOTHER ONE WHILE THE LAST ONE IS STILL IN THE ROAD.
      //
      // There is exactly one pair of wrecked cars in this world, because a
      // pair of cars is two full vehicle meshes and building a fresh pair per
      // crash would leak them. That was fine while a crash ended when the
      // ambulance drove off; now the wrecks outlive the ambulance run by
      // however long the recovery takes, and the next crash is due in sixty
      // to a hundred and eighty seconds. Without this the second crash would
      // teleport both cars out from under the tow truck.
      hold: !!(this.tow && this.tow.job),
      rand: () => this.rand()
    })

    const job = this.ambulance.incident

    if (job) {
      // The ambulance run owns where the cars are: they are lying where they
      // landed and nothing has come for them yet.
      const blocks = crashBlocks(job, {
        sedan: { length: TRAFFIC_LENGTHS.sedan, width: TRAFFIC_WIDTHS.sedan },
        suv: { length: TRAFFIC_LENGTHS.suv, width: TRAFFIC_WIDTHS.suv }
      })
      for (let i = 0; i < this.wreckCars.length; i++) {
        const w = this.wreckCars[i]
        const b = blocks[i]
        if (!b) continue
        // crashBlocks() gives the car's CENTRE; the carrier stands on its rear
        // axle. One subtraction, in the one place that knows about both.
        const back = w.wheelbase / 2
        this.placeWreckCar(w,
          b.x - Math.sin(b.heading) * back,
          b.z - Math.cos(b.heading) * back,
          b.heading + w.roll * 0.3)
        w.atScene = true
      }
      this.wreckIncident = { x: job.x, z: job.z, island: job.island }

      const beat = Math.floor(this.elapsed * 1.6) % 2 === 0
      for (const w of this.wreckCars) w.hazard.emissiveIntensity = beat ? 2.2 : 0.1

      this.roadIncident = { x: job.x, z: job.z, blocks }
      this.updateCrashSmoke(delta)
    } else if (this.wreckIncident && !(this.tow && this.tow.job)) {
      // THE AMBULANCE HAS FINISHED AND THE CARS ARE STILL THERE.
      //
      // This is the join Mike asked for. The run used to end by clearing the
      // scene; now it ends by handing the scene to the recovery, and the cars
      // stay exactly where they were - same meshes, same poses, nothing moves
      // on the frame the ambulance leaves.
      const cars = this.wreckCars.map((w) => ({
        kind: w.kind,
        x: w.pose ? w.pose.x : this.wreckIncident.x,
        z: w.pose ? w.pose.z : this.wreckIncident.z,
        heading: w.pose ? w.pose.heading : 0
      }))
      startTow(this.tow, this.wreckIncident, cars)
      this.wreckIncident = null
    }

    this.callOutCrews('ambulance', crewTarget(this.ambulance), 'ambulanceRoute')
  }

  /**
   * The recovery: where the two cars are once the ambulance has gone.
   *
   * This function is the whole of the towing, and all of it is arithmetic on
   * one point - the yoke on the end of the wheel-lift. Everything else follows:
   * a car being hooked eases towards that point, a car on the hook trails it,
   * a car being dropped eases away from it, and a car that has been delivered
   * is not attached to anything and just stands in the garage.
   *
   * There is no Rapier joint. The wrecked cars have never had colliders, and
   * adding a constraint between a heavy car and a boom - which would be this
   * codebase's first joint - is precisely where the jitter Mike asked me to
   * avoid comes from. `dragStep()` re-satisfies the tow-bar constraint exactly
   * every frame instead, which cannot drift, oscillate or explode.
   */
  updateTow(delta) {
    if (!this.tow) return

    const v = this.game.vehicle
    const mesh = v && v.mesh
    // The field World already keeps, not a fresh getPlayerGarage() - which is
    // memoised, but calling it every frame from a second place is how two
    // answers to "where is the garage" get started.
    const garage = this.playerGarage
    const isTow = !!(v && v.kind === 'tow')
    const player = mesh
      ? { x: mesh.position.x, z: mesh.position.z, isTow }
      : null

    // A metre and a half of slack on the bay, and a speed limit, because
    // arriving is meant to be parking rather than driving through. The same
    // rectangle the vehicle picker uses - see inGarageBay().
    const atGarage = !!(player && isTow && garage &&
      inGarageBay(garage, player.x, player.z, 1.5) &&
      Math.abs(v.getSpeed()) < 4)

    stepTow(this.tow, delta, {
      player,
      tows: (this.traffic || []).filter(t => t.kind === 'tow' && t.drawn)
        .map(t => ({ x: t.drawn.x, z: t.drawn.z })),
      garage: garage ? { x: garage.x, z: garage.z } : null,
      atGarage,
      rand: () => this.rand()
    })

    const job = this.tow.job
    if (!job) {
      this.callOutCrews('tow', null, 'towRoute')

      // THE AMBULANCE MIGHT STILL BE ON THE SCENE.
      //
      // This runs immediately after updateAmbulance() every frame, and for the
      // whole of the ambulance run there is no tow job yet - so without this
      // guard the recovery hides the two cars and wipes their poses on the
      // very frame the ambulance placed them, and the crash is invisible until
      // the moment it is handed over. Measured before the guard existed: the
      // cars reported no pose at all through the entire ambulance phase.
      if (this.wreckIncident) return

      this.roadIncident = null

      // LET THE PLAYER SEE WHAT THEY BROUGHT BACK.
      //
      // Mike: "Inside the garage bay, but once the game is done, you can make
      // the cars disappear." The first version took him at his word to the
      // frame - the second car was delivered and both vanished on the same
      // update, so the one moment the job is actually finished is the one
      // moment you cannot see it. They stay parked for as long as the
      // "ALL WRECKS RECOVERED" banner is up, which is what `messageFor` is
      // already counting down, and go when it does.
      if (this.tow.messageFor > 0 && this.wreckCars.some(w => w.pose)) {
        const beat = Math.floor(this.elapsed * 1.6) % 2 === 0
        for (const w of this.wreckCars) {
          if (w.pose) w.hazard.emissiveIntensity = beat ? 1.4 : 0.1
        }
        if (this.crashSmokeMaterial) this.crashSmokeMaterial.opacity = 0
        return
      }

      // Otherwise everything is recovered, or somebody else dealt with it. The
      // cars go, the smoke goes, and - the one that would not have been visible
      // at all - so does the obstacle the traffic has been steering round.
      // Leaving that behind would leave an invisible crash in the road
      // diverting the city for the rest of the session.
      for (const w of this.wreckCars) {
        w.carrier.visible = false
        w.hazard.emissiveIntensity = 0
        w.pose = null
      }
      if (this.crashSmokeMaterial) this.crashSmokeMaterial.opacity = 0
      return
    }

    const beat = Math.floor(this.elapsed * 1.6) % 2 === 0
    const hooked = carOnHook(job)
    const slots = garageBaySlots(garage, this.wreckCars.length)

    // Where the yoke is right now, in the world. Zero reach and zero lift
    // unless something is being picked up or put down, so a tow truck driving
    // around with nothing on the hook has its boom stowed.
    let stage = { reach: 0, winch: 0, lift: 0 }
    if (this.tow.phase === 'hitching') stage = hitchStage(job.hitch)
    else if (this.tow.phase === 'hauling') stage = { reach: 1, winch: 1, lift: 1 }
    else if (this.tow.phase === 'dropping') stage = dropStage(job.drop)

    // Kept on the world, not local, for two reasons: the boom's position is
    // genuinely a piece of this frame's state, and `probe/tow.mjs` measures the
    // tow bar against it from inside the browser, where it cannot import
    // towGame.js to ask what the answer should have been.
    this.towStage = stage
    if (isTow && mesh) this.updateTowRig(mesh, stage.reach, stage.lift)

    const yoke = (mesh && isTow) ? this.yokeWorld(mesh, v.heading, stage) : null

    for (let i = 0; i < this.wreckCars.length; i++) {
      const w = this.wreckCars[i]
      const c = job.cars[i]
      if (!c) continue
      w.hazard.emissiveIntensity = beat ? 2.2 : 0.1
      w.atScene = c.state === 'down'

      if (c.state === 'delivered') {
        const slot = slots[i] || slots[0]
        if (slot) {
          const back = w.wheelbase / 2
          this.placeWreckCar(w,
            slot.x - Math.sin(slot.heading) * back,
            slot.z - Math.cos(slot.heading) * back,
            slot.heading)
          c.x = slot.x
          c.z = slot.z
        }
        continue
      }

      if (c !== hooked || !yoke) {
        // Lying where it was left.
        this.placeWreckCar(w, c.x, c.z, c.heading)
        continue
      }

      // --- On the hook, or being got onto it ---
      const geo = towGeometry(w.wheelbase, yoke.lift)

      // Where the car would sit if it were already coupled and lined up
      // straight behind the truck. The winch eases towards this, the drop
      // eases away from it, and the haul starts exactly here - so there is no
      // frame on which the car jumps between the three.
      const straight = {
        x: yoke.x - Math.sin(v.heading) * geo.trail,
        z: yoke.z - Math.cos(v.heading) * geo.trail,
        heading: v.heading
      }

      if (this.tow.phase === 'hitching') {
        if (stage.winch <= 0) {
          // The boom is still coming out. Remember where the car is lying, so
          // the winch has somewhere to interpolate FROM that does not change
          // under it half way through.
          c.from = { x: c.x, z: c.z, heading: c.heading }
          this.placeWreckCar(w, c.x, c.z, c.heading)
          continue
        }
        const from = c.from || { x: c.x, z: c.z, heading: c.heading }
        const k = ease(stage.winch)
        const x = from.x + (straight.x - from.x) * k
        const z = from.z + (straight.z - from.z) * k
        const heading = turnToward(from.heading, straight.heading, k)
        this.placeWreckCar(w, x, z, heading, geo.pitch * stage.lift)
        c.x = x
        c.z = z
        c.heading = heading
        // Hand the trailer a starting rear-axle position, so the first frame
        // of hauling continues the motion rather than snapping to it.
        c.rear = { x, z }
        continue
      }

      if (this.tow.phase === 'dropping') {
        const slot = slots[i] || slots[0]
        if (!slot) continue
        if (!c.releaseFrom) c.releaseFrom = { x: c.x, z: c.z, heading: c.heading }
        const back = w.wheelbase / 2
        const parked = {
          x: slot.x - Math.sin(slot.heading) * back,
          z: slot.z - Math.cos(slot.heading) * back,
          heading: slot.heading
        }
        // The lift comes off first and the car rolls back off the yoke second,
        // which is the order a real one does it in and the order dropStage()
        // hands back.
        const k = ease(1 - stage.winch)
        const x = c.releaseFrom.x + (parked.x - c.releaseFrom.x) * k
        const z = c.releaseFrom.z + (parked.z - c.releaseFrom.z) * k
        const heading = turnToward(c.releaseFrom.heading, parked.heading, k)
        this.placeWreckCar(w, x, z, heading, geo.pitch * stage.lift * (1 - k))
        c.x = x
        c.z = z
        c.heading = heading
        continue
      }

      // --- Being towed ---
      if (!c.rear) c.rear = { x: straight.x, z: straight.z }
      const at = dragStep(c.rear, yoke, geo.trail)
      this.placeWreckCar(w, at.x, at.z, at.heading, geo.pitch)
      c.x = at.x
      c.z = at.z
      c.heading = at.heading
      c.releaseFrom = null
    }

    // What the traffic has to get round: the cars STILL IN THE ROAD, at wherever
    // they actually are now. The old version handed over a fixed pair of boxes
    // derived from the crash's layout table, which stopped being true of them
    // the moment one was dragged away.
    const down = carsDown(job)
    if (down.length) {
      this.roadIncident = {
        x: job.x, z: job.z,
        blocks: down.map((c) => {
          const w = this.wreckCars[c.index]
          return { x: c.x, z: c.z, heading: c.heading, length: w.length, width: w.width }
        })
      }
    } else {
      this.roadIncident = null
    }

    this.updateCrashSmoke(delta)
    this.callOutCrews('tow', towCrewTarget(this.tow), 'towRoute')
  }

  /**
   * Is there a car physically hanging off the player's boom?
   *
   * The vehicle picker asks, because opening the garage door on a tow truck
   * with a wreck on the hook would swap the truck out from under the car and
   * leave it parked in mid air. `waiting` is deliberately NOT included: with
   * nothing on the hook the player is free to change their mind and go and get
   * something else, and an AI truck will pick the job up.
   */
  /**
   * The trailer arithmetic, reachable from a page.
   *
   * A seam for `probe/tow.mjs`, which measures the drawn distance between the
   * yoke and the towed car against what `towGeometry()` says it should be. The
   * probe runs inside the browser and cannot import the module, so the check
   * would otherwise have to re-implement the sum it is checking - which is not
   * a check.
   */
  towGeom(wheelbase, lift) { return towGeometry(wheelbase, lift) }

  /**
   * Where the wheel-lift's yoke is, in the world.
   *
   * The one point every part of the towing is computed from. Its LOCAL
   * position comes from `yokeAt()`, which is also what positions the mesh -
   * so the boom the player watches and the point the car hangs off cannot
   * disagree. Only x and z matter to the drag; the y is the lift, which is
   * what tilts the car.
   */
  yokeWorld(mesh, heading, stage) {
    const at = yokeAt(stage.reach, stage.lift)
    return {
      x: mesh.position.x + Math.sin(heading) * at.z,
      z: mesh.position.z + Math.cos(heading) * at.z,
      lift: at.y - TOW_RIG.restY
    }
  }

  /**
   * Open the garage door for whoever is coming, and shut it behind them.
   *
   * Driven from the player's distance to the bay rather than from any game
   * state, which is what makes it feel like a door: it is already moving when
   * you arrive, and it closes on its own once you have gone. `GARAGE_DOOR_NEAR`
   * is measured from the middle of the bay, so it takes in the whole apron.
   *
   * It also opens for the vehicle picker's roll-out - the one moment a vehicle
   * leaves the bay without having driven up to it - and it never shuts while
   * anything is inside, because a shutter closing through the roof of your own
   * car is worse than a shutter that is open too often.
   */
  updateGarageDoor(delta) {
    const door = this.garageDoor
    const garage = this.playerGarage
    if (!door || !garage) return

    const v = this.game.vehicle
    const at = v && v.mesh ? v.mesh.position : null
    let want = 0
    if (at) {
      const gap = Math.hypot(at.x - garage.x, at.z - garage.z)
      const inside = inGarageBay(garage, at.x, at.z, -1)
      const rolling = !!(this.game.vehicleSelector &&
                         this.game.vehicleSelector.isBusy())
      if (inside || rolling || gap < GARAGE_DOOR_NEAR) want = 1
    }

    // Eased at a fixed rate rather than lerped towards the target, so it takes
    // the same time to open however far away you stopped - a shutter has a
    // motor, not a spring.
    const step = delta / GARAGE_DOOR_SECONDS
    door.open = want > door.open
      ? Math.min(1, door.open + step)
      : Math.max(0, door.open - step)

    // Scale from the top edge: the slats are all at negative y inside the
    // group, so shrinking the group's y draws them up into the lintel.
    door.group.scale.y = Math.max(0.02, 1 - door.open)
    door.group.visible = door.open < 0.995
  }

  towBusy() {
    if (!this.tow || !this.tow.job) return false
    return this.tow.phase === 'hitching' ||
           this.tow.phase === 'hauling' ||
           this.tow.phase === 'dropping'
  }



  /**
   * The police stations, for the run to the cells.
   *
   * Cached the same way the hospitals are, and read off the same `stations`
   * list - a station is a station, and there is one place that knows where
   * they all are.
   */
  policeStations() {
    if (!this._policeStations) {
      this._policeStations = (this.stations || [])
        .filter(s => s.kind === 'police')
        .map(s => ({ x: s.x, z: s.z, island: islandName(s.island) }))
    }
    return this._policeStations
  }

  hospitals() {
    if (!this._hospitals) {
      this._hospitals = (this.stations || [])
        .filter(s => s.kind === 'hospital')
        .map(s => ({ x: s.x, z: s.z, island: islandName(s.island) }))
    }
    return this._hospitals
  }

  /**
   * Send ambulances to wherever the run currently needs them - the crash
   * first, the hospital afterwards. Same callout machinery as the engines
   * and the patrol cars.
   */
  /**
   * Send the nearest few of a kind towards a point, or stand them all down.
   *
   * This was `callOutAmbulances`, hard-wired to one kind and one cached route.
   * The tow truck needed exactly the same thing with a different kind, and the
   * honest way to get it was to pass the kind in rather than to write the
   * function out twice - two copies of a route cache is two things to keep in
   * step and one of them will be forgotten.
   *
   * `cache` names the field the last route is remembered in, so an ambulance
   * heading for a crash and a tow truck heading for the same crash do not
   * overwrite each other's routing every frame.
   */
  callOutCrews(kind, target, cache) {
    const crews = (this.traffic || []).filter(v => v.kind === kind)

    if (!target) {
      for (const v of crews) v.mission = null
      this[cache] = null
      return
    }

    const key = `${Math.round(target.x)},${Math.round(target.z)}`
    if (this[cache] && this[cache].key === key) return

    const route = routeToPoint(this.lanes, target.x, target.z)
    this[cache] = route ? { key, hops: route.hops } : null
    if (!this[cache]) return

    const sorted = crews
      .map(v => ({ v, hops: this[cache].hops[v.lane] ?? Infinity }))
      .sort((a, b) => a.hops - b.hops)

    sorted.forEach(({ v }, i) => {
      v.mission = i < RESPONDERS ? this[cache].hops : null
    })
  }



  // -------------------------------------------------------------
  // The race
  // -------------------------------------------------------------

  /**
   * The five cars that come out of the garage.
   *
   * Built once, at load, and hidden until a race starts - the same pattern the
   * wreck and the fire use. Building them on demand would mean five vehicle
   * meshes and their materials arriving in one frame the moment a child drove
   * onto the circuit, which is exactly the wrong moment for a stutter.
   *
   * Colours from the traffic palette rather than new ones, so a racing car is
   * recognisably one of this world's cars in a different shape.
   */
  createRaceField() {
    this.raceCars = []

    const island = getIsland('speedway')
    if (!island) return
    const ring = getIslandRing(island)
    if (!ring) return

    this.measureCircuit()

    const colours = [PALETTE.carRed, PALETTE.carBlue, PALETTE.carGreen,
                     PALETTE.carWhite, PALETTE.carSand]

    for (let i = 0; i < RACE_FIELD; i++) {
      const mesh = this.buildTrafficVehicle({ kind: 'race', colour: colours[i % colours.length] })
      mesh.visible = false
      this.game.add(mesh)
      this.raceCars.push(mesh)
    }
  }

  /**
   * The circuit as a world-space loop, and how long a lap of it is.
   *
   * Split out and called TWICE - once while the speedway is being built and
   * once when the field is created - because the order those two happen in is
   * not obvious and got this wrong the first time. `createCourses()` runs
   * twenty lines before `createRaceField()`, so everything the builder placed
   * with `circuitPoint()` - the grid boxes, the whole pit straight and
   * grandstand - was asking a ring that did not exist yet and silently got
   * null back. A missing grandstand is a quiet failure; a null check that
   * returns early is quieter still.
   *
   * Idempotent, so calling it from both places costs one walk of 385 points.
   */
  measureCircuit() {
    if (this.raceRing) return true

    const island = getIsland('speedway')
    if (!island) return false
    const ring = getIslandRing(island)
    if (!ring) return false

    this.raceRing = ring.map((p) => ({ x: island.x + p.x, z: island.z + p.z }))
    this.raceLapLength = 0
    for (let i = 1; i < this.raceRing.length; i++) {
      this.raceLapLength += Math.hypot(
        this.raceRing[i].x - this.raceRing[i - 1].x,
        this.raceRing[i].z - this.raceRing[i - 1].z)
    }
    return true
  }

  /**
   * Where a point on the circuit is, and which way it faces.
   *
   * `along` is measured from the start/finish line rather than from the first
   * point of the ring road, because that is where a lap begins - so this is
   * the one place the offset between the two is applied and everything else
   * can think in laps.
   */
  circuitPoint(along) {
    if (!this.raceRing || !this.raceLapLength) return null
    const line = this.speedwayLineAlong || 0
    const lap = this.raceLapLength
    const wrapped = (((along + line) % lap) + lap) % lap
    return pointAlongRing(this.raceRing, wrapped / lap)
  }

  /**
   * How far round the lap a world position is.
   *
   * Found by walking the ring and taking the nearest point on it, which is
   * cheap enough at 385 points and once a frame, and is honest in a way that
   * a lane lookup would not be: the player is not on a lane, they are on a
   * circuit, and they may well be on the grass at the time.
   */
  circuitAlong(x, z) {
    if (!this.raceRing) return null

    let best = Infinity
    let at = 0
    let run = 0
    for (let i = 1; i < this.raceRing.length; i++) {
      const ax = this.raceRing[i - 1].x
      const az = this.raceRing[i - 1].z
      const dx = this.raceRing[i].x - ax
      const dz = this.raceRing[i].z - az
      const l2 = dx * dx + dz * dz
      const step = Math.sqrt(l2)
      if (l2 > 0) {
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2))
        const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t))
        if (d < best) { best = d; at = run + step * t }
      }
      run += step
    }

    // Measured from the start/finish line, not from wherever the ring road's
    // point list happens to begin.
    const line = this.speedwayLineAlong || 0
    const along = ((at - line) % this.raceLapLength + this.raceLapLength) % this.raceLapLength
    return { along, offCircuit: best }
  }

  updateRace(delta) {
    if (!this.race || !this.raceRing) return

    const vehicle = this.game.vehicle
    const at = vehicle && vehicle.mesh ? vehicle.mesh.position : null
    const found = at ? this.circuitAlong(at.x, at.z) : null

    // "On the course" is a distance from the circuit rather than a test of
    // which island you are on, and deliberately: the island is 200 units
    // across and most of it is not the track. Twenty-two units is the road
    // plus its verges plus enough grass that spinning off does not abandon
    // your race.
    const ON_COURSE = 22
    const onCourse = !!found && found.offCircuit < ON_COURSE

    let toGrid = Infinity
    if (found && this.speedwayLine) {
      const pole = this.circuitPoint(-8)
      if (pole && at) toGrid = Math.hypot(at.x - pole.x, at.z - pole.z)
    }

    stepRace(this.race, delta, {
      onCourse,
      kind: vehicle ? vehicle.kind : null,
      along: found ? found.along : 0,
      lapLength: this.raceLapLength,
      pace: RACE_PACE,
      toGrid,
      elapsed: this.elapsed
    })

    this.drawRaceField()
    this.drawRaceLights()
  }

  /** Put the field where the state says it is. */
  drawRaceField() {
    if (!this.raceCars) return

    const racing = this.race.phase !== 'idle'
    for (let i = 0; i < this.raceCars.length; i++) {
      const mesh = this.raceCars[i]
      const car = this.race.cars[i]
      if (!racing || !car) { mesh.visible = false; continue }

      const point = this.circuitPoint(car.along)
      if (!point) { mesh.visible = false; continue }

      // A quarter of the road's width to their own side of the centre line,
      // and alternating, so a grid of six is two columns and a race is two
      // cars wide rather than five cars in single file down the middle.
      const side = car.side * (this.circuitWidth() / 4)
      mesh.visible = true
      mesh.position.set(
        point.x + Math.cos(point.heading) * side,
        COURSE_ROAD,
        point.z - Math.sin(point.heading) * side)
      mesh.rotation.y = point.heading
    }
  }

  /** Red, amber, green, or all dark. */
  drawRaceLights() {
    if (!this.raceLamps) return
    for (const [name, material] of Object.entries(this.raceLamps)) {
      material.emissiveIntensity = this.race.light === name ? 2.4 : 0
    }
  }

  /**
   * The one callout on screen.
   *
   * Every game hands over the same shape and chooseMission() picks between
   * them - a callout you can act on beats one you can only watch. Nothing
   * here knows what a fire or a pursuit is, which is the point: the ambulance
   * run will slot in as a third entry in this list and change nothing else.
   */
  activeMission() {
    const kind = this.game.vehicle ? this.game.vehicle.kind : null
    const mesh = this.game.vehicle && this.game.vehicle.mesh
    const garage = this.playerGarage
    const robbers = (this.traffic || [])
      .filter(v => v.robber && v.drawn)
      .map(v => ({ id: v.robberId, x: v.drawn.x, z: v.drawn.z }))

    return chooseMission([
      fireHud(this.fire, kind === 'fire'),
      policeHud(this.police, kind === 'police', robbers),
      ambulanceHud(this.ambulance, kind === 'ambulance'),
      // The truck's own position picks WHICH of two wrecks to point at, and
      // the garage is passed in because towGame.js does not know where the
      // garage is and should not - that is a fact about the map.
      towHud(this.tow, kind === 'tow',
        mesh ? { x: mesh.position.x, z: mesh.position.z } : null,
        garage ? { x: garage.x, z: garage.z } : null),
      raceHud(this.race),
      // LAST on purpose. A callout you are actually running keeps the arrow;
      // low fuel takes it only when nothing else wants it. The gauge is drawn
      // separately and is always on screen, so being outranked here never
      // leaves you without the information.
      gasHud(this.gas, hasTank(kind))
    ])
  }

  /**
   * Everything the sound needs, gathered from wherever it actually lives.
   *
   * The mix itself is in `systems/audioMix.js`, which has no THREE in it and
   * knows nothing about any of this - the same split the seasons, the holidays
   * and the three mission games have. This method is the join, and it belongs
   * here because World is already the one place that can reach the vehicle,
   * the weather, the picker and the coastline at once.
   *
   * Every field is allowed to be missing. `mix()` reads an absent field as
   * "none of that" and returns a silent world rather than throwing, which
   * matters because this is called on the very first frame, before some of
   * these systems have finished arriving.
   */
  audioState() {
    const vehicle = this.game.vehicle
    const selector = this.game.vehicleSelector
    const weather = this.game.environment ? this.game.environment.current : null
    const at = vehicle ? vehicle.getPosition() : null

    // A siren is not "this vehicle has a roof bar". Police cars, ambulances
    // and fire engines flash their beacons the whole time they are on the
    // road - that is what the light bar does - but a siren running for the
    // entire session because you happened to pick the ambulance would be
    // unbearable within a minute. It sounds when there is a callout to sound
    // it for, which is the same question the HUD asks.
    const mission = this.activeMission()
    const emergency = vehicle && vehicle.mesh &&
                      vehicle.mesh.userData && vehicle.mesh.userData.beacons

    return {
      speed: vehicle ? vehicle.getSignedSpeed() : 0,
      topSpeed: vehicle && vehicle.params ? vehicle.params.maxForwardSpeed : 18,
      // In the garage with the picker open you are not driving anything.
      running: !!vehicle && !(selector && selector.isBusy()),
      siren: !!(emergency && mission && mission.active),
      elapsed: this.elapsed,
      sirenRate: SIREN_RATE,
      indicator: vehicle ? vehicle.indicator : 0,
      // The same blink the lamps use, so the tick and the flash are one thing.
      blink: blinkOn(this.elapsed, 0),
      wind: weather ? weather.wind : 0,
      rain: weather ? weather.rain : 0,
      flake: weather ? weather.flake : 0,
      toShore: at ? this.distanceInland(at.x, at.z) : 0
    }
  }

  /**
   * How far inland a point is, in world coordinates - 0 anywhere over water.
   *
   * Asked of the island's real outline rather than of a radius, for the reason
   * this file keeps rediscovering: the coastlines are arbitrary polygons and a
   * circle is wrong about all of them. It is what tells the sea how loud to be.
   */
  distanceInland(x, z) {
    const island = islandAt(x, z)
    if (!island) return 0
    return Math.max(0, inlandDistance(island, x - island.x, z - island.z))
  }

  // -------------------------------------------------------------
  // Per-frame
  // -------------------------------------------------------------
  setTimeOfDay(dayFactor, nightFactor) {
    const glow = Math.pow(nightFactor, 1.4)
    for (const entry of this.nightEmissives) {
      // Festive lights are the same dusk curve as everything else, multiplied
      // by how much of the holiday is up. Out of season that is zero and the
      // bulbs are simply dark - and scaled away too, in setHolidayLayer, so
      // they are not dark specks on every roofline all year.
      const holiday = entry.festive ? this.festiveLevel : 1
      entry.material.emissiveIntensity = glow * entry.strength * holiday
    }

    // Pools of light on the ground, fading in with the emissives
    for (const pool of this.lightPools) {
      pool.mesh.material.opacity = glow * pool.strength
      pool.mesh.visible = pool.mesh.material.opacity > 0.01
    }
  }

  update(delta) {
    this.elapsed += delta

    if (this.seaUniforms) {
      this.seaUniforms.uTime.value = this.elapsed
    }

    // Lights run day and night - they aren't part of the night-emissive
    // set, because a red light is a red light at noon.
    this.updateTrafficLights()
    this.updateMonorail(delta)
    this.updateShips(delta)
    this.updatePlanes(delta)
    this.updateHelicopters(delta)
    this.updateTraffic(delta)
    // After the traffic, because a person dodges the car's DRAWN position and
    // that is not settled until updateTraffic() has eased it this frame.
    this.updatePedestrians(delta)
    this.updateGarageDoors(delta)
    this.updateFire(delta)
    this.updateGas(delta)
    this.updatePolice(delta)
    this.updateAmbulance(delta)
    this.updateTow(delta)
    this.updateGarageDoor(delta)
    this.updateRace(delta)

    const env = this.game.environment
    if (!env) return

    for (const entry of this.swayables) {
      const amount = env.getSway(this.elapsed, entry.phase) * (entry.scale || 1)
      entry.object.rotation.z = amount
      entry.object.rotation.x = amount * 0.6
    }
  }
}
