import * as THREE from 'three'
import { Game } from '../core/Game.js'
import {
  ISLANDS,
  ISLAND_DEPTH,
  SEA_LEVEL,
  getBridges,
  getIslandRoads,
  getIsland,
  pointAlong,
  distanceToNearestRoad,
  getSpawnIsland,
  getBridgeRoadPaths,
  validateLayout,
  islandOutline,
  islandReach,
  inlandDistance,
  islandAt,
  getIslandJunctions,
  getTownPlots,
  getRoadsidePlots,
  PAVEMENT_WIDTH,
  PLOT_GAP,
  getWalkways,
  getTrafficSignals,
  getMonorailRoute,
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
  getPlayerGarage,
  GARAGE_HEIGHT,
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
  PLAZA_FOUNTAIN_OFFSET,
  routeToPoint
} from './islandLayout.js'
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
import { chooseMission } from './missions.js'
import {
  insetPolygon, insetPolygonRadial, polygonCentroid, pointInPolygon,
  rayDistanceToBoundary
} from './shapes.js'
import { pathTangents, ribbonQuads, distanceToPath } from './curves.js'

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
  }
}

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
  bus: 3
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

    this.createSea()
    this.createIslands()
    this.createBridges()
    this.createConnectingRoads()
    this.createMonorail()
    this.createPorts()
    this.createShips()
    this.createAirport()
    this.createPlanes()
    this.createHelicopters()
    this.createPlayerGarage()
    this.createBusStops()
    this.createStations()
    this.createTraffic()
    this.createHubSign()

    // Last: a fire needs the buildings to exist before it can pick one, and
    // the traffic to exist before it can send anybody.
    this.fire = newFireState()
    this.createFireEffects()
    this.police = newPoliceState()
    this.ambulance = newAmbulanceState()
    this.crashSites = this.findCrashSites()
    this.createWreck()
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
      for (const signal of getTrafficSignals(island)) {
        this.buildTrafficSignal(island, signal)
        this.buildCrossings(island, signal, roads)
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

  /** How high the ground is, in world coordinates. Sea level over water. */
  groundAt(x, z) {
    return groundHeight(x, z)
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

      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(bridge.width, 0.5, bridge.length),
        new THREE.MeshStandardMaterial({
          color: PALETTE.concrete, roughness: 0.9, metalness: 0.05, flatShading: true
        })
      )
      deck.position.set(bridge.x, -0.25, bridge.z)
      deck.rotation.y = bridge.rotationY
      deck.castShadow = true
      deck.receiveShadow = true
      this.game.add(deck)

      this.game.physics.createStaticBoxAt(
        bridge.x, -0.25, bridge.z,
        bridge.width, 0.5, bridge.length,
        bridge.rotationY
      )

      if (bridge.railings) this.addBridgeRailings(bridge)
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

  addBridgeRailings(bridge) {
    const railMat = new THREE.MeshStandardMaterial({
      color: PALETTE.wallWhite, roughness: 0.8, flatShading: true
    })

    const cos = Math.cos(bridge.rotationY)
    const sin = Math.sin(bridge.rotationY)
    const halfW = bridge.width / 2

    for (const side of [-1, 1]) {
      const ox = cos * halfW * side
      const oz = -sin * halfW * side

      // Solid barrier so you can't drive off the side
      this.game.physics.createStaticBoxAt(
        bridge.x + ox, 0.5, bridge.z + oz,
        0.3, 1.4, bridge.length,
        bridge.rotationY
      )

      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.18, bridge.length), railMat
      )
      rail.position.set(bridge.x + ox, 0.95, bridge.z + oz)
      rail.rotation.y = bridge.rotationY
      rail.castShadow = true
      this.game.add(rail)

      const posts = Math.max(2, Math.floor(bridge.length / 4))
      for (let i = 0; i <= posts; i++) {
        const t = i / posts - 0.5
        const px = bridge.x + ox + sin * bridge.length * t
        const pz = bridge.z + oz + cos * bridge.length * t

        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1, 0.22), railMat)
        post.position.set(px, 0.5, pz)
        post.rotation.y = bridge.rotationY
        post.castShadow = true
        this.game.add(post)

        // Aimed at the deck's centre line rather than out to sea
        if (side === 1 && i % 4 === 2) {
          this.addStreetlight(px, pz, {
            x: bridge.x + sin * bridge.length * t,
            z: bridge.z + cos * bridge.length * t
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

        const body = new THREE.Mesh(
          new THREE.BoxGeometry(3.4, 2.6, MONORAIL_CAR_LENGTH - 0.7), bodyMat)
        body.position.y = 1.75
        body.castShadow = true
        car.add(body)

        // The skirt wraps the beam, which is what makes it read as a
        // monorail rather than a bus in the air
        const skirt = new THREE.Mesh(
          new THREE.BoxGeometry(3.6, 1.1, MONORAIL_CAR_LENGTH - 1.4), skirtMat)
        skirt.position.y = 0.3
        car.add(skirt)

        // A window band down each side
        for (const side of [1, -1]) {
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(0.1, 1.15, MONORAIL_CAR_LENGTH - 3), glassMat)
          band.position.set(side * 1.72, 2.05, 0)
          car.add(band)
        }

        // A face on the leading and trailing cars
        if (c === 0 || c === MONORAIL_CARS - 1) {
          const face = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.5, 0.12), glassMat)
          face.position.set(0, 2.1, (c === 0 ? 1 : -1) * (MONORAIL_CAR_LENGTH / 2 - 0.4))
          car.add(face)
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

    stepMonorailTrains(route, this.trains, delta)

    for (const train of this.trains) {
      if (!train.cars) continue
      for (let c = 0; c < train.cars.length; c++) {
        const at = monorailPointAt(route, train.distance - c * MONORAIL_CAR_LENGTH)
        train.cars[c].position.set(at.x, MONORAIL_HEIGHT + 0.15, at.z)
        train.cars[c].rotation.y = at.heading
      }
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
      case 'fire': return this.buildFireEngine(v)
      case 'convertible': return this.buildCar(v, true)
      case 'pickup': return this.buildPickup(v)
      case 'suv': return this.buildSUV(v)
      default: return this.buildCar(v, false)
    }
  }

  /** Wheels, shared by everything on the road. */
  addWheels(group, length, width, radius = 0.45) {
    const tyre = new THREE.MeshStandardMaterial({
      color: PALETTE.tyre, roughness: 0.95, flatShading: true
    })
    const thickness = 0.3
    const geometry = new THREE.CylinderGeometry(radius, radius, thickness, 8)

    // The outer face flush with the body. Offsetting to `width / 2 - 0.05` and
    // then adding half a tyre on top left every wheel standing 0.1 proud of
    // the bodywork, on every vehicle in the fleet.
    const track = width / 2 - thickness / 2

    // Each wheel hangs off a pivot, and the four are recorded on the group.
    //
    // The traffic never turns or spins its wheels, so on its own this looks
    // like ceremony - but the car the PLAYER drives is built by this same
    // code now, and the player's wheels steer and roll. Building them here
    // means a bus you drive turns bus-sized wheels, rather than having a
    // second set of sedan-sized ones added on top of them: which is what used
    // to happen, four spare wheels sunk into the road under the chassis.
    //
    // Front pair first, so indices 0 and 1 are the ones that steer.
    const wheels = []
    for (const along of [length * 0.31, -length * 0.31]) {
      for (const side of [1, -1]) {
        const pivot = new THREE.Group()
        pivot.position.set(side * track, radius, along)

        const wheel = new THREE.Mesh(geometry, tyre)
        wheel.rotation.z = Math.PI / 2
        wheel.castShadow = true

        pivot.add(wheel)
        group.add(pivot)
        wheels.push({ pivot, wheel, baseRotationY: 0 })
      }
    }

    group.userData.wheels = wheels
    return wheels
  }

  /**
   * A sedan, or a convertible - which is the same car with the roof taken
   * off and a pair of seats put in, because that reads at a distance and a
   * separate model wouldn't.
   */
  buildCar(v, open) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS[v.kind]
    const width = TRAFFIC_WIDTHS[v.kind]

    const paint = this.pick([
      PALETTE.carRed, PALETTE.carBlue, PALETTE.carWhite,
      PALETTE.carSand, PALETTE.carGreen, PALETTE.carGrey
    ])
    const body = new THREE.MeshStandardMaterial({
      color: paint, roughness: 0.45, metalness: 0.25, flatShading: true
    })

    // The paintwork, kept so a robber can be made to flash. Every kind of
    // car records it, because a robber is whichever car happened to be
    // chosen and not a special one.
    group.userData.body = body

    const shell = new THREE.Mesh(new THREE.BoxGeometry(width, 0.85, length), body)
    shell.position.y = 0.72
    shell.castShadow = true
    group.add(shell)

    const glass = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.5,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glass, 0.5)

    if (open) {
      // Windscreen and two seats, no roof
      const screen = new THREE.Mesh(new THREE.BoxGeometry(width * 0.85, 0.55, 0.1), glass)
      screen.position.set(0, 1.4, length * 0.08)
      screen.rotation.x = -0.32
      group.add(screen)

      for (const side of [1, -1]) {
        const seat = new THREE.Mesh(
          new THREE.BoxGeometry(width * 0.32, 0.5, 0.35),
          new THREE.MeshStandardMaterial({
            color: PALETTE.tyre, roughness: 0.9, flatShading: true
          }))
        seat.position.set(side * width * 0.22, 1.28, -length * 0.06)
        group.add(seat)
      }
    } else {
      const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(width * 0.88, 0.62, length * 0.46), body)
      cabin.position.set(0, 1.42, -length * 0.03)
      cabin.castShadow = true
      group.add(cabin)

      for (const side of [1, -1]) {
        const pane = new THREE.Mesh(
          new THREE.BoxGeometry(0.06, 0.4, length * 0.4), glass)
        pane.position.set(side * width * 0.45, 1.44, -length * 0.03)
        group.add(pane)
      }
    }

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    this.addWheels(group, length, width)
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

    const paint = this.pick([
      PALETTE.carRed, PALETTE.carBlue, PALETTE.carWhite,
      PALETTE.carSand, PALETTE.carGreen, PALETTE.carGrey
    ])
    const body = new THREE.MeshStandardMaterial({
      color: paint, roughness: 0.55, metalness: 0.2, flatShading: true
    })
    group.userData.body = body

    // Chassis, full length, sitting higher than a car
    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.7, length), body)
    chassis.position.y = 0.85
    chassis.castShadow = true
    group.add(chassis)

    // Cab over the front axle
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.94, 0.85, length * 0.38), body)
    cab.position.set(0, 1.62, length * 0.16)
    cab.castShadow = true
    group.add(cab)

    const glass = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.5,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glass, 0.5)

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.8, 0.5, 0.08), glass)
    screen.position.set(0, 1.68, length * 0.16 + length * 0.19)
    group.add(screen)

    for (const side of [1, -1]) {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.42, length * 0.3), glass)
      pane.position.set(side * width * 0.48, 1.66, length * 0.16)
      group.add(pane)
    }

    // The bed: three sides, open at the back
    const sideWall = new THREE.BoxGeometry(0.1, 0.42, length * 0.5)
    for (const side of [1, -1]) {
      const wall = new THREE.Mesh(sideWall, body)
      wall.position.set(side * (width / 2 - 0.05), 1.4, -length * 0.19)
      group.add(wall)
    }

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.42, 0.1), body)
    head.position.set(0, 1.4, -length * 0.19 + length * 0.25)
    group.add(head)

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    this.addWheels(group, length, width, 0.52)
    return group
  }

  /** An SUV: a sedan's shape, taller, with the cabin carried right back. */
  buildSUV(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS[v.kind]
    const width = TRAFFIC_WIDTHS[v.kind]

    const paint = this.pick([
      PALETTE.carRed, PALETTE.carBlue, PALETTE.carWhite,
      PALETTE.carSand, PALETTE.carGreen, PALETTE.carGrey
    ])
    const body = new THREE.MeshStandardMaterial({
      color: paint, roughness: 0.5, metalness: 0.22, flatShading: true
    })
    group.userData.body = body

    const shell = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.95, length), body)
    shell.position.y = 0.82
    shell.castShadow = true
    group.add(shell)

    // The cabin runs almost the whole length - that squarer profile is what
    // tells an SUV from a sedan at a distance, more than the extra height.
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.92, 0.78, length * 0.66), body)
    cabin.position.set(0, 1.68, -length * 0.06)
    cabin.castShadow = true
    group.add(cabin)

    const glass = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.5,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glass, 0.5)

    for (const side of [1, -1]) {
      const pane = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.48, length * 0.58), glass)
      pane.position.set(side * width * 0.47, 1.7, -length * 0.06)
      group.add(pane)
    }

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.82, 0.52, 0.08), glass)
    screen.position.set(0, 1.72, -length * 0.06 + length * 0.33)
    group.add(screen)

    // A roof rack, because an SUV without one is just a tall hatchback
    const rack = new THREE.MeshStandardMaterial({
      color: PALETTE.tyre, roughness: 0.9, flatShading: true
    })
    for (const side of [1, -1]) {
      const rail = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.08, length * 0.5), rack)
      rail.position.set(side * width * 0.3, 2.11, -length * 0.06)
      group.add(rail)
    }

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    this.addWheels(group, length, width, 0.5)
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
  addVehicleLamps(group, length, width, height = 1.8, baseY = 0) {
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
   * the shell, because the shell is one box and a door is a rectangle in the
   * middle of its side. Building it as its own car rather than recolouring a
   * sedan also means the black stays black - the sedan picks a random colour
   * from the palette, and cloning its material after the fact left the odd
   * red police car.
   */
  buildPoliceCar(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.police
    const width = TRAFFIC_WIDTHS.police

    const black = new THREE.MeshStandardMaterial({
      color: PALETTE.policeBody, roughness: 0.4, metalness: 0.3, flatShading: true
    })
    const white = new THREE.MeshStandardMaterial({
      color: PALETTE.policePanel, roughness: 0.5, flatShading: true
    })

    const shell = new THREE.Mesh(new THREE.BoxGeometry(width, 0.85, length), black)
    shell.position.y = 0.72
    shell.castShadow = true
    group.add(shell)

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.88, 0.62, length * 0.46), black)
    cabin.position.set(0, 1.42, -length * 0.03)
    cabin.castShadow = true
    group.add(cabin)

    // The white doors, one panel each side, proud of the flank by a hair so
    // they don't fight the black shell for the same pixels
    for (const side of [1, -1]) {
      const door = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.62, length * 0.4), white)
      door.position.set(side * (width / 2 + 0.02), 0.74, -length * 0.02)
      group.add(door)

      // and the door of the cabin above it, so the white runs up the side
      const upper = new THREE.Mesh(
        new THREE.BoxGeometry(0.05, 0.34, length * 0.3), white)
      upper.position.set(side * (width * 0.44 + 0.02), 1.32, -length * 0.03)
      group.add(upper)
    }

    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.5,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glassMat, 0.5)

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.8, 0.42, 0.08), glassMat)
    screen.position.set(0, 1.44, length * 0.19)
    group.add(screen)

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    this.addWheels(group, length, width)

    group.userData.beacons = this.addBeacons(group, 1.82, 0.55)
    return group
  }

  buildAmbulance(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.ambulance
    const width = TRAFFIC_WIDTHS.ambulance

    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.ambulanceBody, roughness: 0.5, flatShading: true
    })

    const box = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.9, length * 0.62), body)
    box.position.set(0, 1.3, -length * 0.16)
    box.castShadow = true
    group.add(box)

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.94, 1.25, length * 0.4), body)
    cab.position.set(0, 0.98, length * 0.29)
    cab.castShadow = true
    group.add(cab)

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.03, 0.3, length * 0.95),
      new THREE.MeshStandardMaterial({
        color: PALETTE.ambulanceStripe, roughness: 0.6, flatShading: true
      }))
    stripe.position.set(0, 1.1, -length * 0.05)
    group.add(stripe)

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    this.addWheels(group, length, width, 0.5)
    group.userData.beacons = this.addBeacons(group, 2.4, 0.6)
    return group
  }

  buildFireEngine(v) {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.fire
    const width = TRAFFIC_WIDTHS.fire

    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.fireBody, roughness: 0.55, metalness: 0.1, flatShading: true
    })

    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(width, 2.1, length * 0.3), body)
    cab.position.set(0, 1.35, length * 0.33)
    cab.castShadow = true
    group.add(cab)

    const rear = new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.7, length * 0.66), body)
    rear.position.set(0, 1.15, -length * 0.16)
    rear.castShadow = true
    group.add(rear)

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

    // Lockers down each side
    for (const side of [1, -1]) {
      const locker = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.7, length * 0.55),
        new THREE.MeshStandardMaterial({
          color: PALETTE.carGrey, roughness: 0.6, metalness: 0.4, flatShading: true
        }))
      locker.position.set(side * (width / 2 + 0.02), 1.05, -length * 0.16)
      group.add(locker)
    }

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS[v.kind])
    this.addWheels(group, length, width, 0.58)
    // On the CAB roof, not over the back.
    //
    // The cab's roof is at 2.4 and the rear body's at 2.0, and the beacons
    // were at 2.55 over the rear - hanging half a unit clear of the vehicle
    // in mid air. Every other emergency vehicle happened to have a flat back
    // at about the right height, so nobody noticed the number was a guess.
    // Both figures now come off the cab, which is where a real one puts them.
    group.userData.beacons = this.addBeacons(
      group, 1.35 + 2.1 / 2 + 0.11, 0.7, length * 0.33)
    return group
  }

  buildBus() {
    const group = new THREE.Group()
    const length = TRAFFIC_LENGTHS.bus
    const width = TRAFFIC_WIDTHS.bus

    const body = new THREE.MeshStandardMaterial({
      color: PALETTE.busBody, roughness: 0.5, metalness: 0.1, flatShading: true
    })

    const shell = new THREE.Mesh(new THREE.BoxGeometry(width, 2.5, length), body)
    shell.position.y = 1.55
    shell.castShadow = true
    group.add(shell)

    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(width + 0.06, 0.2, length + 0.06),
      new THREE.MeshStandardMaterial({
        color: PALETTE.busRoof, roughness: 0.8, flatShading: true
      }))
    roof.position.y = 2.85
    group.add(roof)

    const glass = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.45,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glass, 1.1)

    // A window band each side and a windscreen
    for (const side of [1, -1]) {
      const band = new THREE.Mesh(
        new THREE.BoxGeometry(0.08, 0.95, length - 1.4), glass)
      band.position.set(side * (width / 2 + 0.01), 2.05, 0)
      group.add(band)
    }
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(width * 0.88, 1, 0.1), glass)
    screen.position.set(0, 2.05, length / 2 + 0.02)
    group.add(screen)

    // Doors, on the kerb side. Lanes run on the right, so that's the left of
    // the vehicle looking forward... which is +X here, because the mesh faces
    // +Z and the kerb is to its right: -X.
    const door = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.9, 1.1),
      new THREE.MeshStandardMaterial({
        color: PALETTE.tyre, roughness: 0.7, flatShading: true
      }))
    door.position.set(-(width / 2 + 0.02), 1.4, length * 0.22)
    group.add(door)

    this.addVehicleLamps(group, length, width, TRAFFIC_HEIGHTS.bus)
    this.addWheels(group, length, width, 0.52)
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

      this.addBench(bx, bz, { x: stop.x, z: stop.z })
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
      const cross = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4,
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

    // A plain cross, which is also the fallback: an unknown kind gets a mark
    // rather than a blank square where its badge should be.
    ctx.fillStyle = accent
    ctx.fillRect(-r * 0.9, -r * 0.28, r * 1.8, r * 0.56)
    ctx.fillRect(-r * 0.28, -r * 0.9, r * 0.56, r * 1.8)
    ctx.restore()
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

    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(yard.width, yard.depth),
      new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.95
      }))
    apron.rotation.x = -Math.PI / 2
    apron.rotation.z = -station.heading
    const apronX = station.x + fx * yard.offset
    const apronZ = station.z + fz * yard.offset
    // Above the grass cap, not under it: the apron is a raised forecourt, so
    // it does not have to claim the ground and sink the plots around it.
    apron.position.set(
      apronX, this.groundAt(apronX, apronZ) + GRASS_ABOVE_SAND + 0.05, apronZ)
    apron.receiveShadow = true
    this.game.add(apron)

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
   * Drive the traffic, then move the meshes and the colliders to match.
   *
   * The simulation is stepTraffic() in islandLayout.js, for the usual reason:
   * World.js needs a browser, so the tests can only read it, and the traffic
   * rules are the part with logic in them.
   */
  updateTraffic(delta) {
    if (!this.traffic || !this.traffic.length) return

    // Where the player is, so the traffic gives way to it rather than
    // shunting it along the road
    const car = this.game.vehicle && this.game.vehicle.mesh
    const player = car ? { x: car.position.x, z: car.position.z } : null

    stepTraffic(this.lanes, this.traffic, delta, this.elapsed, player,
                this.roadIncident)

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
      let turn = at.heading - v.heading
      while (turn > Math.PI) turn -= Math.PI * 2
      while (turn < -Math.PI) turn += Math.PI * 2
      const rate = 2.6 * delta
      v.heading += Math.max(-rate, Math.min(rate, turn))

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
    const apron = new THREE.Mesh(
      new THREE.BoxGeometry(garage.doorWidth + 4, 0.2,
        Math.hypot(garage.apron.x - garage.x, garage.apron.z - garage.z)),
      new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.95, flatShading: true
      }))
    // Top face on the road surface, not 0.14 over it. The slab is 0.2 thick
    // and drawn from its middle, so the centre goes half a thickness below
    // where the top is wanted. This is the driveway Mike could see the car
    // sinking into.
    apron.position.set((garage.x + garage.apron.x) / 2,
                       ground + SURFACE_PAVED + 0.02 - 0.1,
                       (garage.z + garage.apron.z) / 2)
    apron.rotation.y = garage.heading
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
      color: PALETTE.carWhite, roughness: 0.45, metalness: 0.25, flatShading: true
    })
    const trimMat = new THREE.MeshStandardMaterial({
      color: PALETTE.trainBody, roughness: 0.5, metalness: 0.2, flatShading: true
    })
    const darkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.7, flatShading: true
    })

    // Fuselage. Built along +Z, which is the direction everything else in this
    // world calls forward - the car, the ships and the trains all do, and a
    // model that disagrees gets rotated once on load rather than everything
    // else being special-cased around it.
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(2.1, 2.1, PLANE_LENGTH * 0.78, 10), bodyMat)
    body.rotation.x = Math.PI / 2
    body.position.y = 3.4
    body.castShadow = true
    group.add(body)

    const nose = new THREE.Mesh(new THREE.ConeGeometry(2.1, 5, 10), bodyMat)
    nose.rotation.x = Math.PI / 2
    nose.position.set(0, 3.4, PLANE_LENGTH * 0.39 + 2.5)
    group.add(nose)

    const tailCone = new THREE.Mesh(new THREE.ConeGeometry(2.1, 6, 10), bodyMat)
    tailCone.rotation.x = -Math.PI / 2
    tailCone.position.set(0, 3.9, -PLANE_LENGTH * 0.39 - 3)
    group.add(tailCone)

    // Wings, swept back a little so it reads as an airliner rather than a
    // plank. Span is the constant the stands are spaced off, so the drawn
    // aircraft and the parking box cannot disagree.
    const wing = new THREE.Mesh(
      new THREE.BoxGeometry(PLANE_SPAN, 0.6, 6), bodyMat)
    wing.position.set(0, 2.9, -1)
    wing.castShadow = true
    group.add(wing)

    const tailplane = new THREE.Mesh(new THREE.BoxGeometry(9, 0.5, 3), bodyMat)
    tailplane.position.set(0, 5.4, -PLANE_LENGTH * 0.39 - 1.5)
    group.add(tailplane)

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 4.5), trimMat)
    fin.position.set(0, 7.4, -PLANE_LENGTH * 0.39 - 1.5)
    fin.castShadow = true
    group.add(fin)

    // Engines under the wings, and a stripe down the side.
    for (const side of [1, -1]) {
      const engine = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.5, 5, 8), darkMat)
      engine.rotation.x = Math.PI / 2
      engine.position.set(side * (PLANE_SPAN * 0.27), 1.9, 0.5)
      engine.castShadow = true
      group.add(engine)
    }

    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(4.35, 0.9, PLANE_LENGTH * 0.78), trimMat)
    stripe.position.y = 3.1
    group.add(stripe)

    // Cabin windows, lit at night with everything else.
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.3,
      emissive: new THREE.Color(PALETTE.windowLit), emissiveIntensity: 0
    })
    this.registerNightLight(glassMat, 1)
    for (const side of [1, -1]) {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.8, PLANE_LENGTH * 0.62), glassMat)
      strip.position.set(side * 2.05, 4.1, 1)
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
      plane.mesh.rotation.y = where.heading
      // Nose up on the climb and down on the approach, from the gradient the
      // route is actually flying rather than from the phase name.
      plane.mesh.rotation.x = -where.pitch
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
    this.helipads = getHelipads()
    this.helicopters = []
    if (!this.helipads.length) return

    const padMat = new THREE.MeshStandardMaterial({
      color: PALETTE.asphalt, roughness: 0.92, flatShading: true
    })
    const markMat = new THREE.MeshStandardMaterial({
      color: PALETTE.roadLine, roughness: 0.8, flatShading: true
    })

    for (const pad of this.helipads) {
      // The deck. A rooftop pad sits ON the roof, so it is drawn just above
      // the height the layout worked out; a ground pad sits on the ground.
      const deck = new THREE.Mesh(
        new THREE.BoxGeometry(HELIPAD_SIZE, 0.3, HELIPAD_SIZE), padMat)
      deck.position.set(pad.x, pad.y + 0.15, pad.z)
      deck.rotation.y = pad.heading
      deck.receiveShadow = true
      this.game.add(deck)

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
      color: PALETTE.carBlue, roughness: 0.5, metalness: 0.25, flatShading: true
    })
    const darkMat = new THREE.MeshStandardMaterial({
      color: PALETTE.beamDark, roughness: 0.7, flatShading: true
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass, roughness: 0.2, metalness: 0.4, flatShading: true
    })

    // Cabin, built along +Z like everything else that moves in this world.
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3, 3, 5.4), bodyMat)
    cabin.position.set(0, 1.9, 0.6)
    cabin.castShadow = true
    group.add(cabin)

    const nose = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.2, 1.8), glassMat)
    nose.position.set(0, 2.1, 3.6)
    group.add(nose)

    // Tail boom and fin.
    const boom = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 6), bodyMat)
    boom.position.set(0, 2.4, -3.6)
    group.add(boom)

    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 1.4), bodyMat)
    fin.position.set(0, 3.4, -6.2)
    group.add(fin)

    // Skids, which is what makes it read as a helicopter when it is on a pad.
    for (const side of [1, -1]) {
      const skid = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 5), darkMat)
      skid.position.set(side * 1.3, 0.2, 0.6)
      group.add(skid)
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.2, 0.25), darkMat)
      leg.position.set(side * 1.3, 0.8, 0.6)
      group.add(leg)
    }

    // Main rotor and tail rotor, kept on the group so they can be spun.
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.8, 6), darkMat)
    hub.position.set(0, 3.7, 0.6)
    group.add(hub)

    const rotor = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(
        new THREE.BoxGeometry(HELI_ROTOR, 0.12, 0.7), darkMat)
      blade.rotation.y = (i * Math.PI) / 2
      rotor.add(blade)
    }
    rotor.position.set(0, 4.1, 0.6)
    group.add(rotor)

    const tailRotor = new THREE.Group()
    for (let i = 0; i < 2; i++) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.12, 3.2, 0.4), darkMat)
      blade.rotation.z = (i * Math.PI) / 2
      tailRotor.add(blade)
    }
    tailRotor.position.set(0.6, 3.4, -6.2)
    group.add(tailRotor)

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

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.11, 5.5, 6), trimMat)
    mast.position.set(0, 5.2, -1.4)
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

        strands[i % strands.length].push({
          x: b.x + x, y: y - sag, z: b.z + z,
          rotation: 0, size: 1
        })
      }

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
        const runs = Math.max(2, Math.round(b.width / 1.5))
        for (let i = 0; i <= runs; i++) {
          const across = -hw + (i / runs) * 2 * hw
          const swag = Math.sin((i / runs) * Math.PI) * 0.18
          strands[n++ % strands.length].push(onFront(across, sillY - swag, 0.12))
        }
      }

      // 3. ROUND THE DOOR, which is the bit you drive past at eye level.
      const doorTop = DOOR_HEIGHT + 0.15
      const doorHalf = DOOR_WIDTH / 2 + 0.2
      for (let i = 0; i <= DOOR_BULBS; i++) {
        const t = i / DOOR_BULBS
        // Up one side, across the top, down the other - an arch rather than a
        // rectangle, because a doorway lit as an arch reads as decorated and
        // one lit as a rectangle reads as a fire exit.
        const angle = Math.PI * t
        strands[n++ % strands.length].push(onFront(
          -Math.cos(angle) * doorHalf,
          Math.min(doorTop, Math.sin(angle) * doorTop + 0.3),
          0.16))
      }

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
      const bulb = new THREE.SphereGeometry(0.22, 6, 5)
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

    this.createWreaths()
    this.createBaskets()
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
        island: island.name || island.id,
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

      if (roll < 0.22) {
        this.addBench(kx, kz, facing)
      } else if (roll < 0.34) {
        this.addBin(kx + ax * plot.width * 0.3, kz + az * plot.width * 0.3)
      } else if (roll < 0.52) {
        this.addPlanter(kx + ax * plot.width * 0.3, kz + az * plot.width * 0.3)
      }

      // A street tree in the gap between this plot and the next
      if (this.rand() < 0.5) {
        const gapX = wx + ax * (plot.width / 2 + PLOT_GAP / 2) + fx * (kerb - 0.4)
        const gapZ = wz + az * (plot.width / 2 + PLOT_GAP / 2) + fz * (kerb - 0.4)
        this.addStreetTree(gapX, gapZ)
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

  /** Slatted bench, back to the building, facing the road. */
  addBench(x, z, facing) {
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

  /** A narrow street tree - tidier than the palms, which are for beaches. */
  addStreetTree(x, z) {
    const model = this.assets && this.assets.get && this.assets.get('tree_a')
    if (model) {
      const tree = model.clone()
      tree.position.set(x, this.groundAt(x, z), z)
      tree.rotation.y = this.rand() * Math.PI * 2
      tree.scale.setScalar(this.randRange(0.8, 1.1))
      this.game.add(tree)
      return
    }

    const group = new THREE.Group()

    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 2.6, 6),
      new THREE.MeshStandardMaterial({
        color: PALETTE.palmTrunk, roughness: 0.95, flatShading: true
      })
    )
    trunk.position.y = 1.3
    trunk.castShadow = true
    group.add(trunk)

    const canopy = new THREE.Mesh(
      new THREE.IcosahedronGeometry(this.randRange(1.1, 1.5), 0),
      new THREE.MeshStandardMaterial({
        color: this.rand() < 0.5 ? PALETTE.frond : PALETTE.frondLight,
        roughness: 0.9, flatShading: true
      })
    )
    canopy.position.y = 3.1
    canopy.castShadow = true
    group.add(canopy)
    // Street trees are the deciduous ones, so they take the season in full.
    this.registerSeasonal(canopy.material, 'foliage')
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
      const plaza = new THREE.Mesh(
        new THREE.CircleGeometry(size, 36),
        new THREE.MeshStandardMaterial({
          color: PALETTE.concrete, roughness: 0.9, metalness: 0.05
        })
      )
      plaza.rotation.x = -Math.PI / 2
      // Above the grass, not just above the ground: the grass cap is drawn
      // GRASS_ABOVE_SAND up, and ducks GROUND_SINK under anything that claims
      // the ground - which a district now does - so this clears both.
      plaza.position.set(cx, this.groundAt(cx, cz) + 0.05, cz)
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

    const modelKey = opts.model ||
      this.pick(['building_a', 'building_b', 'building_c'])
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
    const modelKey = this.rand() < 0.5 ? 'tree_a' : 'tree_b'

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

    // Light the road, not just the lamp. Offset toward whatever it's
    // aimed at, because that's where a lamp on an arm actually throws it.
    const reach = 11
    const px = aim ? x + (aim.x - x) * 0.45 : x
    const pz = aim ? z + (aim.z - z) * 0.45 : z
    this.addLightPool(px, pz, reach, 1)
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
        island: island.name || island.id
      })
    }

    return sites
  }

  /**
   * The wreck: two cars that have met. Built once and moved, like the fire.
   */
  createWreck() {
    this.wreck = new THREE.Group()
    this.wreck.visible = false

    // TWO REAL CARS, from the same builders the traffic uses.
    //
    // They were two plain boxes, which read as two boxes. Using the fleet's
    // own meshes costs nothing - they are built once and moved, like the fire
    // - and means the crash is made of the same cars you have been driving
    // past all session, wheels, lamps and all. A sedan and an SUV rather than
    // two sedans, because two identical cars nose to nose reads as one car
    // reflected.
    const sedan = this.buildTrafficVehicle({ kind: 'sedan', colour: PALETTE.carRed })
    const suv = this.buildTrafficVehicle({ kind: 'suv', colour: PALETTE.carBlue })

    // Nose to nose and skewed, which reads as a collision from a distance far
    // better than any amount of dented geometry. Tipped slightly on their
    // springs too - a car that has just been hit is never sitting level.
    // Placed from CRASH_CARS, the same table the traffic simulation is given -
    // see CRASH_SIDE_OFFSET. The picture and the physics have to agree about
    // where the wreck is, and the only way to be sure of that is for there to
    // be one answer rather than two that look alike.
    this.wreckEngines = []
    for (const [i, mesh] of [[0, sedan], [1, suv]]) {
      const car = CRASH_CARS[i]
      const lx = car.x + CRASH_SIDE_OFFSET
      mesh.position.set(lx, 0, car.z)
      mesh.rotation.set(car.roll * 0.3, car.turn, car.roll, 'YXZ')
      this.wreck.add(mesh)

      // The engine end, so the smoke comes out of the right end of the right
      // car rather than out of the middle of the scene.
      const nose = (car.kind === 'sedan' ? TRAFFIC_LENGTHS.sedan : TRAFFIC_LENGTHS.suv) * 0.42
      this.wreckEngines.push(new THREE.Vector3(
        lx + Math.sin(car.turn) * nose, 0.95, car.z + Math.cos(car.turn) * nose))
    }

    // Smoke out of both bonnets. One buffer for the pair, and deliberately
    // NOT the fire's smoke: that column is forty-six units tall and visible
    // from the next island, which is its job. This is a wisp off an engine
    // that says "something happened here" from across the street and does not
    // pretend the road is ablaze.
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
    this.wreck.add(this.crashSmoke)

    // Hazard lights, so it is findable in the dark as well as in the day.
    this.wreckHazard = new THREE.MeshStandardMaterial({
      color: 0x7a4a10, roughness: 0.5,
      emissive: new THREE.Color(0xffa62b), emissiveIntensity: 0
    })
    for (const side of [1, -1]) {
      const lamp = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.2, 0.2), this.wreckHazard)
      lamp.position.set(side * 2.1, 1.1, 0)
      this.wreck.add(lamp)
    }

    this.game.add(this.wreck)
  }

  /** The wisp of smoke off each crashed engine. */
  updateCrashSmoke(delta) {
    if (!this.crashSmoke) return

    const per = Math.floor(CRASH_SMOKE_COUNT / this.wreckEngines.length)
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
      rand: () => this.rand()
    })

    const job = this.ambulance.incident
    this.wreck.visible = !!job

    if (job) {
      this.wreck.position.set(job.x, this.groundAt(job.x, job.z), job.z)
      this.wreck.rotation.y = job.heading || 0
      const beat = Math.floor(this.elapsed * 1.6) % 2 === 0
      this.wreckHazard.emissiveIntensity = beat ? 2.2 : 0.1
      this.updateCrashSmoke(delta)

      // What the traffic has to get round, and where it is routed away from.
      // The boxes come from crashBlocks(), which is also what positioned the
      // meshes - the traffic simulation has no idea what a wreck is and should
      // not learn, but it must not be told a different place from the one you
      // can see.
      this.roadIncident = {
        x: job.x, z: job.z,
        blocks: crashBlocks(job, {
          sedan: { length: TRAFFIC_LENGTHS.sedan, width: TRAFFIC_WIDTHS.sedan },
          suv: { length: TRAFFIC_LENGTHS.suv, width: TRAFFIC_WIDTHS.suv }
        })
      }
    } else {
      // THE WHOLE SCENE GOES when the run is over, not just the two cars.
      //
      // Mike asked for this explicitly, and it is three separate things that
      // each had to be turned off: the wreck, the smoke off its engines, and
      // - the one that would not have been visible at all - the obstacle the
      // traffic has been steering round. Leaving that behind would have left
      // an invisible crash in the road diverting the city for the rest of the
      // session, which is the kind of bug that gets blamed on the roads.
      this.roadIncident = null
      if (this.crashSmokeMaterial) this.crashSmokeMaterial.opacity = 0
      this.wreckHazard.emissiveIntensity = 0
    }

    this.callOutAmbulances(crewTarget(this.ambulance))
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
        .map(s => ({ x: s.x, z: s.z, island: s.island.name || s.island.id }))
    }
    return this._policeStations
  }

  hospitals() {
    if (!this._hospitals) {
      this._hospitals = (this.stations || [])
        .filter(s => s.kind === 'hospital')
        .map(s => ({ x: s.x, z: s.z, island: s.island.name || s.island.id }))
    }
    return this._hospitals
  }

  /**
   * Send ambulances to wherever the run currently needs them - the crash
   * first, the hospital afterwards. Same callout machinery as the engines
   * and the patrol cars.
   */
  callOutAmbulances(target) {
    const crews = (this.traffic || []).filter(v => v.kind === 'ambulance')

    if (!target) {
      for (const v of crews) v.mission = null
      this.ambulanceRoute = null
      return
    }

    const key = `${Math.round(target.x)},${Math.round(target.z)}`
    if (this.ambulanceRoute && this.ambulanceRoute.key === key) return

    const route = routeToPoint(this.lanes, target.x, target.z)
    this.ambulanceRoute = route ? { key, hops: route.hops } : null
    if (!this.ambulanceRoute) return

    const sorted = crews
      .map(v => ({ v, hops: this.ambulanceRoute.hops[v.lane] ?? Infinity }))
      .sort((a, b) => a.hops - b.hops)

    sorted.forEach(({ v }, i) => {
      v.mission = i < RESPONDERS ? this.ambulanceRoute.hops : null
    })
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
    const robbers = (this.traffic || [])
      .filter(v => v.robber && v.drawn)
      .map(v => ({ id: v.robberId, x: v.drawn.x, z: v.drawn.z }))

    return chooseMission([
      fireHud(this.fire, kind === 'fire'),
      policeHud(this.police, kind === 'police', robbers),
      ambulanceHud(this.ambulance, kind === 'ambulance')
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
    this.updateGarageDoors(delta)
    this.updateFire(delta)
    this.updatePolice(delta)
    this.updateAmbulance(delta)

    const env = this.game.environment
    if (!env) return

    for (const entry of this.swayables) {
      const amount = env.getSway(this.elapsed, entry.phase) * (entry.scale || 1)
      entry.object.rotation.z = amount
      entry.object.rotation.x = amount * 0.6
    }
  }
}
