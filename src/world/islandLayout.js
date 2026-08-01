/**
 * ============================================================================
 * MAP MACHINERY
 * ============================================================================
 * Bridge geometry, road generation, shape lookups and validation.
 *
 * >>> To change the world, edit mapData.js - not this file. <<<
 *
 * World.js builds the geography from here, ZoneManager.js places content
 * markers, and the minimap draws it, so they can never disagree.
 *
 * See MAP.md for the full guide.
 * ============================================================================
 */

import {
  getOutline,
  boundingRadius,
  rayDistanceToBoundary,
  distanceToEdge,
  polygonBounds,
  insetPolygon,
  pointInPolygon
} from './shapes.js'
import { ISLANDS, BRIDGES } from './mapData.js'
import { SIGNAL_HOLD, turnDirection } from './vehicleLights.js'
import {
  sampleSpline,
  bowedPath,
  distanceToPath,
  chaikinSmooth,
  chaikinClosed,
  resamplePath,
  turningRadii,
  pathLength
} from './curves.js'
import {
  makeHeightField,
  hillHeight,
  coastFactor,
  roadProfile,
  roadNetworkProfile,
  terracePads,
  nearestOnPath,
  PAD_MARGIN,
  ROAD_SHOULDER,
  ROAD_BLEND
} from './terrain.js'

// ---------------------------------------------------------------------------
// GLOBAL SETTINGS
// ---------------------------------------------------------------------------

/** Where the car spawns and respawns. Should sit on an island. */
export const SPAWN_POINT = { x: 0, y: 2, z: 0 }

/**
 * Where the car actually starts, with the ground taken into account.
 *
 * SPAWN_POINT's `y` is now a drop HEIGHT rather than an absolute one: put a
 * hill under the starting point and a fixed y would spawn the car inside it,
 * where it would either be flung out or fall through and respawn for ever.
 */
export function spawnPoint() {
  return {
    x: SPAWN_POINT.x,
    y: groundHeight(SPAWN_POINT.x, SPAWN_POINT.z) + SPAWN_POINT.y,
    z: SPAWN_POINT.z
  }
}

/** How thick the island slabs are, below the ground at that point. */
export const ISLAND_DEPTH = 8

/** Height of the sea surface. */
export const SEA_LEVEL = -1.4

/** Drive below this and the car respawns at SPAWN_POINT. */
export const FALL_LIMIT = -4.5

/**
 * Default width of a bridge deck.
 * Wider than DEFAULT_ROAD_WIDTH so the road running across it leaves a
 * concrete shoulder either side, with the railings outside that.
 */
export const DEFAULT_BRIDGE_WIDTH = 8.5

/** Default width of a road, and the clearance props keep from one. */
export const DEFAULT_ROAD_WIDTH = 7

/**
 * How much automatic bridge-to-centre roads bow sideways.
 * 0 = dead straight spokes, 0.3 = quite winding. Islands can override
 * this with their own `roadCurve`.
 */
export const DEFAULT_ROAD_CURVE = 0.16

/** Samples per span when smoothing a road. Higher = smoother, more geometry. */
export const ROAD_SMOOTHNESS = 9

/**
 * Target gap between points along a road, in world units.
 *
 * Corner rounding works over roughly the length of the segments either
 * side of the corner, so this is really "how wide a corner may be". A
 * 7-unit road needs about 2 units of run to bend 30 degrees without the
 * inside edge folding over itself, which is what leaves gaps.
 */
export const ROAD_POINT_SPACING = 2.2

/**
 * How far in from the coast the ring road sits, as a fraction of the
 * island's reach. Bigger pulls the loop tighter to the middle.
 * Islands can override with `ringInset` (world units), or opt out with
 * `noRing: true`.
 */
export const RING_INSET_FRACTION = 0.34

/**
 * Streets inside a town are narrower than the ring road and the bridge
 * roads, which reads as a hierarchy: main road round the edge, side
 * streets within.
 */
export const DEFAULT_STREET_WIDTH = 5.5

/**
 * How far apart the streets of a town grid run. This is the block size,
 * so it has to fit two rows of buildings back to back plus their gardens
 * - about 34 units for 8-deep buildings.
 */
export const DEFAULT_BLOCK_SIZE = 34

/** Shorter than this and a clipped street is a stub, not a road. */
export const MIN_STREET_LENGTH = 18

/** Pavement between the kerb and the building line. */
export const PAVEMENT_WIDTH = 2.4

/** Default footprint of a plot in a town row, and the gap between them. */
export const DEFAULT_PLOT_WIDTH = 9
export const DEFAULT_PLOT_DEPTH = 8
export const PLOT_GAP = 2.5

/**
 * How thinly buildings are spread along the roads of an island that isn't a
 * town: keep one plot in every N. A town keeps all of them.
 *
 * 0 means no buildings from the roadside at all - a jungle island's huts
 * come from the scatter, and a hut in a clearing is meant to look like one.
 */
export const ROADSIDE_DENSITY = { mixed: 2, jungle: 0, plain: 0 }

/** Footpaths to buildings no road passes. Narrower than a pavement. */
export const WALKWAY_WIDTH = 1.8

/**
 * Beyond this a building isn't on a back lot, it's standing in a field,
 * and a long path out to it looks stranger than no path at all.
 */
export const MAX_WALKWAY_LENGTH = 40

/**
 * Clear ground that must be left between two roads that aren't meeting.
 *
 * A street clipped from a grid can end up running almost alongside the
 * ring, leaving a sliver of pavement between two carriageways - which
 * looks like a mistake, because it is one. Streets that spend most of
 * their length this close to another road are dropped.
 */
export const MIN_ROAD_SEPARATION = 9

/**
 * How far two roads may run alongside each other before one of them is a
 * mistake, in world units.
 *
 * Measured as a LENGTH, not as a fraction of the street, because that's
 * what's actually objectionable: 30 units of double carriageway looks
 * wrong whether the street is 40 units long or 200.
 */
export const MAX_PARALLEL_RUN = 26

/**
 * The shallowest angle at which a street may join the ring, in degrees.
 *
 * A street meeting the ring at 8 degrees doesn't read as a junction - the
 * two carriageways converge over tens of units and leave a long thin
 * wedge of pavement between them, which looks like a mistake. Below this
 * the street is dropped rather than trimmed: a grid line grazing the edge
 * of the island wasn't worth having.
 */
export const MIN_JUNCTION_ANGLE = 32

/**
 * Junctions closer together than this are treated as one for signalling.
 *
 * Where a street meets the ring at an angle, the crossing maths finds two
 * or three separate contact points a dozen units apart. Signalling each
 * one gave a dozen poles in one place. Drivers see one junction there, so
 * it gets one set of lights.
 */
export const SIGNAL_MERGE_DISTANCE = 22

/**
 * Approaches within this many degrees of each other count as one.
 *
 * Two roads meeting at a shallow angle arrive from nearly the same
 * direction; signalling both puts two poles side by side facing the same
 * way, which reads as a mistake rather than as traffic control.
 */
export const ARM_MERGE_ANGLE = 40

/** Clear ground a signal pole needs between itself and any carriageway. */
export const POLE_CLEARANCE = 1.2

/**
 * Clear ground kept around a bridge landing.
 *
 * The arrival at an island is the one view every visitor gets, and a
 * building on the kerb right where the bridge lands stands directly in
 * it. Nothing is placed within this of a landing.
 */
export const LANDING_CLEARANCE = 26

// ---------------------------------------------------------------------------
// MONORAIL
// ---------------------------------------------------------------------------

/**
 * How high the top of the guideway runs, in world units.
 *
 * Started at 16, which was chosen to fly over a five-floor building with
 * room to spare. That turned out to look like a viaduct on stilts - too far
 * above the town to belong to it - so it came down by a third.
 *
 * At 11 the beam is BELOW the tallest thing the towns generate, which is
 * the whole reason monorailCeiling() exists: the line no longer clears the
 * buildings, so the buildings have to clear the line.
 *
 * The chase camera sits 5 to 7 units up, so it still passes underneath with
 * a couple of units to spare. Going much lower would start hiding the car.
 */
export const MONORAIL_HEIGHT = 11

/** Width of the beam. Narrow - a monorail rides a single beam, not rails. */
export const MONORAIL_BEAM_WIDTH = 2.6

/** How deep the beam is, top face to underside. */
export const MONORAIL_BEAM_DEPTH = 1.5

/**
 * Air kept between the beam's underside and whatever is beneath it.
 *
 * Not a safety margin - a visible gap. Half a unit reads as a roof touching
 * the beam even when the arithmetic says it clears.
 */
export const MONORAIL_CLEARANCE = 1.4

/**
 * How far either side of the beam's centre line the corridor reaches.
 *
 * Wide enough for the trains (1.8 either side), the station platforms
 * (3.5), and enough beyond that a building doesn't appear to graze a
 * passing train.
 */
export const MONORAIL_CORRIDOR = 6

/**
 * How far apart the piers stand.
 *
 * Real monorail spans run 25-30m. Any closer and the world fills up with
 * columns; any further and the beam looks unsupported.
 */
export const MONORAIL_PIER_SPACING = 27

/**
 * The order the line visits the islands.
 *
 * A closed loop, so the last one runs back to the first. The default is
 * worked out from where the islands actually are - see monorailOrder() -
 * which means moving an island in the editor reroutes the line instead of
 * leaving it crossing itself. Set `monorail: false` on an island to have
 * the line skip it.
 */
export const MONORAIL_SPEED = 26

/** Seconds a train waits at each station. */
export const MONORAIL_DWELL = 4.5

/** How many trains run the loop. Spaced evenly around it. */
export const MONORAIL_TRAINS = 3

/** Cars per train, and how long each car is. */
export const MONORAIL_CARS = 3
export const MONORAIL_CAR_LENGTH = 11

/**
 * Over what distance a train slows for a station, and picks up again after
 * one. Braking is the longer of the two: a train that dawdles away from a
 * platform looks careful, one that arrives at full speed and stops dead
 * looks broken.
 */
export const MONORAIL_BRAKING = 55
export const MONORAIL_PULLAWAY = 34

/**
 * How much room a train keeps behind the one in front.
 *
 * Three trains on this loop are hundreds of units apart and would never
 * meet, so this looks like belt and braces - but the speed of a train is a
 * function of where it is, and a train dwelling at a platform is stopped
 * while the one behind is still closing. Turn MONORAIL_TRAINS up and
 * without this they eventually pile into the same station.
 */
export const MONORAIL_HEADWAY = 40

/** Clear ground a pier or a station stair tower needs from any road. */
export const MONORAIL_ROAD_CLEARANCE = 4.2

/**
 * Below this, a pier is dropped rather than built.
 *
 * Half a pier's width plus a little. A column this close to a carriageway
 * is standing in it, and the span either side can carry the extra reach.
 */
export const MONORAIL_PIER_MIN_CLEARANCE = 1.9

/** How far to the side of the beam the platforms and stair tower sit. */
export const MONORAIL_PLATFORM_OFFSET = 3.5
export const MONORAIL_TOWER_OFFSET = 7.4

/** Length of a platform, and of the canopy over it. */
export const MONORAIL_PLATFORM_LENGTH = 26

/**
 * Where the fountain stands in a plaza, and how much room it takes.
 *
 * World.js builds it; the monorail needs to know so a stair tower doesn't
 * come down in the water. Stated once, here, because the alternative is the
 * monorail carrying its own guess about where fountains go - and a guess
 * like that goes stale silently the day the plaza changes.
 */
export const PLAZA_FOUNTAIN_OFFSET = 6
export const PLAZA_FOUNTAIN_RADIUS = 4.2

/**
 * The radius of the curve at each station, in world units.
 *
 * The line is straight spans joined by arcs of this radius - which is how
 * elevated railways are actually built, and the only construction that
 * gives a usable curve here.
 *
 * Two things that don't work, both tried and measured:
 *
 *  - A spline through the station points. To pass exactly through a point
 *    AND turn 120 degrees, the curve has to do it in almost no distance:
 *    measured radius 5.7 units, a hairpin no train could sit on. Slackening
 *    the tension makes the corners sharper still, and tightening it makes
 *    the curve swing 40 units past the island before coming back.
 *  - Chaikin smoothing. It rounds a corner over about the length of the
 *    segments either side of it, so on a finely spaced path it does nothing
 *    (8 passes took the tightest radius from 1.6 to 3.4), and on the coarse
 *    six-point loop it cuts the corners off entirely, 60 units at a time.
 *
 * The turn has to happen somewhere, and an arc puts it where you can
 * choose how tight it is. The cost is that a station sits off the middle of
 * its island - by R x (1/sin(half the angle) - 1), which is 44 units on the
 * sharpest corner here. Every station is still well inland; the test
 * measures it rather than trusting the arithmetic.
 */
export const MONORAIL_CURVE_RADIUS = 40

/**
 * A curve may not eat more than this fraction of the span either side of
 * it. Two sharp corners close together would otherwise ask for more
 * straight than there is, and the arcs would run through each other.
 */
export const MONORAIL_MAX_CURVE_SHARE = 0.42

/** Turns shallower than this are left as they are. Degrees. */
export const MONORAIL_MIN_TURN = 4

/** How finely the finished loop is resampled. Drives the beam geometry. */
export const MONORAIL_POINT_SPACING = 3.4

/**
 * A stop this close to the middle of the archipelago can't be placed by
 * bearing, because it hasn't got one worth speaking of. Expressed as a
 * fraction of how far out the islands sit on average.
 */
export const MONORAIL_INNER_FRACTION = 0.45

// ---------------------------------------------------------------------------
// TRAFFIC
// ---------------------------------------------------------------------------

/**
 * How long a full two-way traffic light cycle takes, and how much amber
 * comes at the end of each green.
 *
 * These used to live in World.js. They moved here when the cars started
 * obeying the lights: the cycle has to be one piece of arithmetic that both
 * the lamps and the drivers read, or they drift apart and you get cars
 * crossing on red while the lamp says otherwise.
 */
export const TRAFFIC_CYCLE = 18
export const TRAFFIC_AMBER = 2.5

/**
 * Shorter than this and a piece of road between two junctions isn't worth a
 * lane: a car would spend the whole of it deciding what to do next.
 */
export const LANE_MIN_LENGTH = 11

/**
 * Over what distance a lane's sideways offset fades to nothing at a junction.
 *
 * This is what makes consecutive lanes meet at a point instead of a couple of
 * units apart, and it is the whole of the fix for jagged turns: the heading
 * was already rate-limited, but the POSITION jumped sideways at every lane
 * change and no amount of heading smoothing hides that.
 */
/**
 * How close two lane ends must be to count as connected.
 *
 * Sharing a junction index is not sufficient. A closed ring gets attached to a
 * node when another road's end lands near it, and "near" is a five-unit
 * tolerance - so a ring lane claimed a successor whose start was 56 units
 * away, and a car taking that turn crossed the island in one frame.
 *
 * Generous enough for a genuine turn, where the two lanes are on opposite
 * sides of two different roads and about 3.6 units apart at the corner.
 */
export const LANE_JOIN_TOLERANCE = 7

/**
 * When two lanes count as the same piece of tarmac and one has to go.
 *
 * A street is allowed to run alongside the ring for up to 26 units, so their
 * lanes can genuinely occupy the same ground. Cars on them then interpenetrate
 * with no way out - reversing along a parallel road never widens the gap.
 */
export const LANE_SHARED_GAP = 3.2
export const LANE_SHARED_LENGTH = 12

/** Cruising speeds, world units a second. The player's car tops out at 18. */
export const TRAFFIC_SPEEDS = {
  sedan: 12,
  convertible: 13.5,
  pickup: 11.5,
  suv: 12.5,
  police: 15,
  ambulance: 14,
  fire: 11,
  bus: 9
}

/** Bumper to bumper. How much room a vehicle keeps to the one in front. */
export const TRAFFIC_HEADWAY = 7

/** How hard a vehicle can accelerate and brake. */
export const TRAFFIC_ACCEL = 7
export const TRAFFIC_BRAKE = 16

/** How far back a vehicle starts slowing for a red light. */
export const TRAFFIC_STOP_SIGHT = 26

/**
 * How close to the middle of a junction another vehicle has to be before one
 * arriving will hold back.
 *
 * This is what keeps unsignalled junctions from being a demolition derby.
 * Signals handle the big crossroads; most junctions on this map have only
 * three arms and no lights, and something has to give way there.
 */
export const JUNCTION_GUARD = 13

/**
 * How long a vehicle will wait before it stops giving way.
 *
 * A valve, not a behaviour. Every deadlock found so far had a specific cause
 * and each was fixed at the cause; this is here so that the next one nobody
 * has thought of resolves itself in fifteen seconds instead of leaving a car
 * standing in the road for the rest of the session. The collision veto still
 * applies, so an impatient vehicle can nose forward but cannot hit anything.
 */
export const TRAFFIC_PATIENCE = 15

/**
 * The slowest a vehicle will go while merely giving way.
 *
 * Every rule about who goes first is advisory: it lowers a vehicle's speed
 * but never to nothing. Only a red light, the vehicle directly in front on
 * the same lane, and the two-dimensional collision veto can actually stop
 * one. That distinction is what removed the last deadlock - two cars on
 * adjacent twelve-unit ring pieces, each waiting for the other to leave the
 * entrance of its onward lane, both stationary for 286 seconds out of 300.
 *
 * The cost is that traffic noses into a busy junction rather than waiting
 * politely behind the line, which is also what drivers do.
 */
export const TRAFFIC_CREEP = 2

/**
 * How long a vehicle stays blocked before it tries to go round, and how fast
 * it drifts back to the middle of its lane afterwards.
 *
 * Short, because two jammed cars stop everything behind them. Long enough that
 * ordinary queueing at a red doesn't have the whole line weaving.
 */
export const SWERVE_AFTER = 1.5
export const SIDESTEP_RECOVER = 1.2

/**
 * How far a vehicle may be shuffled back along its own lane to break a lock.
 *
 * The last resort, and the reason a jam can never be permanent: reversing
 * along the road you are already on always eventually clears whatever you are
 * inside. Rarely more than a unit is needed.
 */
export const UNJAM_REVERSE = 6

/**
 * How long a vehicle may be completely blocked before it is taken off the road
 * and put back somewhere clear.
 *
 * The last line of defence, and deliberately crude. Every specific cause of a
 * jam found so far has been fixed at the cause, and each time another turned
 * up: a long vehicle on a short lane where two lanes converge simply cannot
 * always be got out by rules about who gives way. Rather than leave one
 * standing in the road for the rest of the session, it leaves - as though it
 * had driven off - and a vehicle of the same kind arrives elsewhere.
 *
 * With thirty-one vehicles on eight hundred units of map, one reappearing out
 * of sight is invisible. If this fires often, something upstream is wrong:
 * tests/traffic.mjs reports how many times it happened.
 */
export const RESPAWN_AFTER = 25

/**
 * The backstop: standing still this long gets a vehicle moved whatever its
 * reason.
 *
 * Exempting lawful waits from the valve above was right - it stopped cars
 * queued at a red being teleported - but on its own it let one vehicle stand
 * for 162 seconds, because every car in a chain can plausibly claim to be
 * waiting for the one in front. Comfortably longer than a queue at a red: the
 * signal cycle is 18 seconds, so a queue that takes two greens to clear has
 * waited about 30 - but not so long that a car frozen at the kerb reads as a
 * bug, which a full minute does.
 */
export const STUCK_LIMIT = 35

/** How much clear road a relocated vehicle needs in front of it. */
export const RELOCATE_CLEAR_AHEAD = 22

/**
 * How long a service vehicle stays in its bay, and how long it works the
 * streets before going home again.
 *
 * Deliberately uneven, so the bays aren't all full or all empty at once.
 */
// Long enough that the bays actually look used. At an 18-second dwell against
// a 90-second shift only one vehicle in the whole world was ever parked at a
// given moment, so the car parks read as empty however well the coming and
// going worked.
export const STATION_DWELL = 70
export const STATION_PATROL = 75

/** How fast a vehicle creeps on and off the apron. Slow: it's manoeuvring. */
export const PARKING_SPEED = 3.5

/**
 * How long the run from the apron into a bay is, in the units the parking
 * progress is measured in. The real distance comes from the bay geometry;
 * this only sets how long the manoeuvre takes.
 */
export const PARKING_LEG = 11

/**
 * How far behind the junction patch a car waits at a red.
 *
 * Enough that its nose is clear of the crossing traffic rather than level
 * with it.
 */
export const STOP_LINE_MARGIN = 1.6

/** Bus stops: how far apart, and how clear of a junction they stay. */
export const BUS_STOP_SPACING = 90
export const BUS_STOP_CLEARANCE = 22
export const BUS_DWELL = 6

/**
 * How many of each kind are on the roads.
 *
 * A measured number, not a guess. Over five simulated minutes this fleet has
 * every vehicle covering at least 800 units and the median around 1,500. Push
 * it to 42 and the median halves and one vehicle covers 26 units: the road
 * network has a handful of 12-unit ring pieces, and once several vehicles are
 * queued across those the give-way rules have nothing left to give.
 *
 * So if you want busier streets, widen or lengthen the short pieces first -
 * or accept the jams. `tests/traffic.mjs` will tell you which you got.
 */
export const TRAFFIC_FLEET = {
  sedan: 30,
  convertible: 10,
  pickup: 10,
  suv: 20,
  police: 8,
  ambulance: 6,
  fire: 6,
  bus: 4
}

/** How long each kind of vehicle is, for headway and for the meshes. */
export const TRAFFIC_LENGTHS = {
  sedan: 4.4,
  convertible: 4.2,
  // A pickup is a cab and a bed; an SUV is a tall estate. Both longer than a
  // sedan and no wider than an ambulance, so both still fit a 5.5-unit street.
  pickup: 5.2,
  suv: 4.8,
  police: 4.6,
  ambulance: 6,
  fire: 7,
  bus: 11
}

/**
 * And how wide, which matters more than it looks.
 *
 * Lanes sit a quarter of the road's width either side of the centre line, so
 * two vehicles passing in opposite directions are `width / 2` apart - 2.75
 * units on a 5.5-wide street. Anything wider than that would clip its
 * oncoming neighbour, and it would look like a collision because it is one.
 */
export const TRAFFIC_WIDTHS = {
  sedan: 1.9,
  convertible: 1.9,
  pickup: 2.1,
  suv: 2.05,
  police: 2,
  ambulance: 2.2,
  fire: 2.4,
  bus: 2.5
}

/** Emergency lights: full flashes a second. */
export const SIREN_RATE = 2.4

// ---------------------------------------------------------------------------
// PORTS AND SHIPPING
// ---------------------------------------------------------------------------

/**
 * Islands with a shore radius at least this big get a cargo port rather
 * than a jetty. Two on the current map - EXPERIENCE and ABOUT - which is
 * the point: a working sea needs somewhere for the big ships to go and
 * somewhere they plainly don't fit.
 */
export const PORT_BIG_REACH = 100

/**
 * How far out to sea a port site is checked for open water.
 *
 * Far enough that a good frontage scores better than a merely adequate one,
 * near enough that walking it for 96 bearings on 6 islands isn't slow.
 */
export const PORT_MAX_FETCH = 340

/** Pier length and width, big port and small. */
export const PIER_LENGTH_BIG = 44
export const PIER_LENGTH_SMALL = 26
export const PIER_WIDTH_BIG = 13
export const PIER_WIDTH_SMALL = 8.5

/** How far inland the pier's root starts, so it beds into the beach. */
export const PIER_ROOT_INSET = 5

/**
 * A shipping container, and how the yard stacks them.
 *
 * Exported because World.js draws the boxes: if the two disagreed, the yard
 * that was tested for clearance would not be the yard that got built.
 * `CONTAINER_LIFT` is the height of one, so a stack sits level on the one
 * below rather than floating over it.
 */
export const CONTAINER_LONG = 6
export const CONTAINER_WIDE = 2.6
export const CONTAINER_LIFT = 2.65
export const CONTAINER_GAP = 1.1

/** How far a container's own CORNER stays from the edge of a road. */
export const CONTAINER_ROAD_CLEARANCE = 4

/** How many stacks a yard holds, nearest the shed first. */
export const CONTAINER_STACKS = 12

/** How far the cargo shed's own CORNER stays from the edge of a road. */
export const SHED_ROAD_CLEARANCE = 3

/** Deck height above the water, and how thick the deck is. */
export const PIER_DECK_Y = 0.3
export const PIER_DECK_DEPTH = 1.2

/** Width of the road out along the pier. */
export const PORT_ROAD_WIDTH = 6.5

/**
 * How far off the pier head a ship waits before turning in.
 *
 * Ships approach along the pier's own direction rather than cutting in from
 * wherever they happen to be, which is what makes an arrival look like
 * navigation instead of a mesh sliding into position.
 */
export const PORT_APPROACH = 70

/** How far out from the pier's centre line a berthed ship sits. */
// A cargo hull is 9.5 wide against a 13-unit pier, so at 12 the gap between
// them was 0.75 - inside the slack the heading smoothing leaves. 13.5 gives
// 2.25, which is a fender's worth.
export const BERTH_OFFSET_BIG = 13.5
export const BERTH_OFFSET_SMALL = 8

/**
 * How far out to sea a ship lines up before running in to its berth.
 *
 * Long enough that the turn onto the final approach happens clear of the pier
 * head - a cargo ship is 46 units long and swings its bow eight units sideways
 * on a modest turn, which is more than the gap between the berth and the deck.
 */
export const BERTH_RUN_IN = 90

/**
 * The open-water ring the shipping lanes run on.
 *
 * Every island is inside it, so a leg between two points on the ring can
 * never cross land - which is what makes the routing trivially safe
 * without a single obstacle test between waypoints.
 */
export const SEA_LANE_MARGIN = 60
export const SEA_LANE_NODES = 16

/**
 * How far out a ship has to get before it counts as gone.
 *
 * Well beyond the fog, which swallows anything past about 600 units. A ship
 * leaving reaches this and is quietly re-used for an arrival somewhere else;
 * nobody sees it happen because there is nothing to see at that range.
 */
export const OFF_WORLD_RADIUS = 780
export const OFF_WORLD_NODES = 6

/** Ship speeds, in world units a second. Cargo is slower than it looks. */
export const SHIP_SPEED_CARGO = 11
export const SHIP_SPEED_BOAT = 17

/** How long a ship stays alongside. */
export const SHIP_DWELL_CARGO = 26
export const SHIP_DWELL_BOAT = 14

/** How far out a ship starts easing off for its berth. */
export const SHIP_BRAKING = 60

/** How many of each are at sea. */
export const CARGO_SHIPS = 3
export const SMALL_BOATS = 5

/** Roughly how often a voyage heads off the edge of the world instead. */
export const OFF_WORLD_CHANCE = 0.38

// ---------------------------------------------------------------------------
// THE AIRPORT
// ---------------------------------------------------------------------------

/**
 * The aircraft, and the runway sized off them.
 *
 * Derived rather than picked: a runway is a multiple of the thing that uses
 * it. The proportions are compressed the way every game compresses them - a
 * real airliner wants seventy times its own length of concrete, which here
 * would be twice the width of the world.
 */
export const PLANE_LENGTH = 26
export const PLANE_SPAN = 24
export const AIRPORT_RUNWAY_LENGTH = PLANE_LENGTH * 8
export const AIRPORT_RUNWAY_WIDTH = 24

/** The apron and terminal sit alongside the runway, never on it. */
export const AIRPORT_APRON_DEPTH = 46
export const AIRPORT_EDGE = 14
export const AIRPORT_STANDS = 4

/**
 * Open water the platform needs around it, and how far a link to land may
 * reach.
 *
 * The clearance is what stops an apron overhanging a beach. The span is what
 * stops the search picking a beautiful site nothing could ever connect to:
 * the existing bridges cross about 130 units of water, so 210 is a long
 * crossing rather than an impossible one.
 */
export const AIRPORT_CLEARANCE = 30
export const AIRPORT_MAX_SPAN = 210

/** How long an aircraft sits on stand, boarding and disembarking. */
export const PLANE_TURNAROUND = 28

/** Cruise, approach and taxi speeds, world units a second. */
export const PLANE_SPEED_CRUISE = 46
export const PLANE_SPEED_APPROACH = 26
export const PLANE_SPEED_TAXI = 6

/** How many aircraft the world runs, and how high they cruise. */
export const PLANE_FLEET = 4
export const PLANE_CRUISE_HEIGHT = 120

// ---------------------------------------------------------------------------
// THE MAP DATA lives in mapData.js - that's the file you edit (or that the
// map editor overwrites). It's re-exported here so nothing else has to care
// where it came from.
// ---------------------------------------------------------------------------
export { ISLANDS, BRIDGES } from './mapData.js'

// ===========================================================================
// Everything below is machinery. You shouldn't need to edit it.
// ===========================================================================

// ---------------------------------------------------------------------------
// Shape helpers
// ---------------------------------------------------------------------------

/** The island's outline, island-local. A circle if no shape was given. */
export function islandOutline(island) {
  return getOutline(island)
}

/** Furthest the island reaches from its centre - its "worst case" radius. */
export function islandReach(island) {
  return boundingRadius(getOutline(island))
}

/** How far the coast is from the centre, along a given direction. */
export function shoreDistance(island, dx, dz) {
  return rayDistanceToBoundary(getOutline(island), dx, dz)
}

/**
 * How far inland a point is, island-local.
 * Positive means on land, negative means out at sea.
 */
export function inlandDistance(island, localX, localZ) {
  return distanceToEdge(getOutline(island), localX, localZ)
}

/** Bounding box of an island's outline, island-local. */
export function islandBounds(island) {
  return polygonBounds(getOutline(island))
}

/**
 * How wide the beach is on this island.
 *
 * Exported because three things have to agree about it: where the grass cap
 * starts, where the ground stops being flat, and where the terrain's height
 * has faded back to sea level. If they disagree you get grass standing proud
 * of the sand, or a hill that walks out into the water.
 */
export function beachWidth(island) {
  return Math.max(2, islandReach(island) * 0.13)
}

// ---------------------------------------------------------------------------
// TERRAIN
// ---------------------------------------------------------------------------

const terrainCache = new Map()

/**
 * The height field for one island: `heightAt(localX, localZ)`.
 *
 * Assembled here because this is where the roads and the plots are known;
 * the maths itself is in terrain.js, so a test can run any of it.
 *
 * Cached, and deliberately so - it walks every road on the island for every
 * query, and the ground mesh alone asks tens of thousands of times.
 */
export function getIslandTerrain(island) {
  if (!island) return null
  if (terrainCache.has(island.id)) return terrainCache.get(island.id)

  const beach = beachWidth(island)
  const inlandAt = (x, z) => inlandDistance(island, x, z)

  // The open ground: hills, faded out at the coast. Roads take their heights
  // from THIS rather than from the finished field, or each road would be
  // reading the flattening left by the last one and the answer would depend
  // on what order they happened to be in.
  const hills = (island.hills || []).filter(h => h && h.radius > 0)
  const openGround = (x, z) =>
    hillHeight(hills, x, z) * coastFactor(inlandAt(x, z), beach)

  // Solved together, not one at a time: where two roads meet they have to
  // arrive at the same height, or the ground steps between them.
  const shapes = getIslandRoads(island).map(road => ({
    points: road.points,
    width: road.width,
    // How far the DRAWN paving reaches: the carriageway plus its pavements.
    // The renderer ducks the grass under this; the height blends over a much
    // wider corridor, and using that instead sank the ground under buildings.
    pavedHalf: road.width / 2 + PAVEMENT_WIDTH
  }))
  const profiles = roadNetworkProfile(shapes, openGround)
  const roads = shapes.map((road, i) => ({ ...road, heights: profiles[i] }))

  // A terrace under every building, so it stands vertical on ground that
  // fully supports it - Mike's requirement, and the alternative is buildings
  // tilted on a slope with daylight under one corner.
  // Rectangles, not the circles round them - `rotation` on a plot is in
  // DEGREES, which is what the map file stores and what the editor shows.
  const pads = [...getTownPlots(island), ...getRoadsidePlots(island)]
    .map(plot => ({
      x: plot.x,
      z: plot.z,
      halfWidth: plot.width / 2,
      halfDepth: plot.depth / 2,
      heading: ((plot.rotation || 0) * Math.PI) / 180,
      // The height of the road it fronts, so a building sits level with its
      // own street rather than perched above or below it.
      height: heightOnRoads(roads, plot.x, plot.z, openGround)
    }))

  // A district - the hub's plaza - is a paved area laid on the ground, so it
  // has to claim that ground the same way a building does. Without it the
  // plaza is drawn five centimetres over a hillside the grass is still
  // following, and the grass comes through it.
  for (const district of island.districts || []) {
    const size = (district.size || 14) / 2
    pads.push({
      x: district.x || 0,
      z: district.z || 0,
      halfWidth: size,
      halfDepth: size,
      heading: 0,
      // Paved: it draws a surface of its own, so the grass may duck under it.
      // A building's plot may not - see claimAt() in terrain.js.
      paved: true,
      height: heightOnRoads(roads, district.x || 0, district.z || 0, openGround)
    })
  }

  for (const placed of island.buildings || []) {
    pads.push({
      x: placed.x,
      z: placed.z,
      halfWidth: (placed.width || 6) / 2,
      halfDepth: (placed.depth || 6) / 2,
      heading: ((placed.rotation || 0) * Math.PI) / 180,
      height: heightOnRoads(roads, placed.x, placed.z, openGround)
    })
  }

  terracePads(pads)

  // A provisional field, cached before the stations are asked for.
  //
  // Station siting consults monorailCeiling(), which asks how high the ground
  // is - so without something already in the cache, asking for the stations
  // from here would call straight back into this function and never return.
  // The provisional field has everything except the stations, which is all
  // the siting actually needs.
  terrainCache.set(island.id,
    makeHeightField({ hills, inlandAt, beach, roads, pads }))

  // Fire stations, police stations and hospitals stand on ground too. Without
  // a terrace of their own a hospital sat on the height at its centre while
  // the ground fell away around it, and you could drive underneath it.
  for (const station of getStations().filter(s => s.island === island)) {
    pads.push({
      x: station.x - island.x,
      z: station.z - island.z,
      halfWidth: station.width / 2,
      halfDepth: station.depth / 2,
      heading: station.heading,
      height: heightOnRoads(roads, station.x - island.x, station.z - island.z,
                            openGround)
    })

    // And the apron in front. Level, but NOT marked paved: a station's
    // forecourt overlaps the plots of nine ordinary buildings on this map,
    // and a paved claim would sink the ground under those too and leave them
    // floating. It is drawn as a raised forecourt instead - see the apron in
    // World.js, which sits above the grass rather than under it.
    const fx = Math.sin(station.heading)
    const fz = Math.cos(station.heading)
    const out = STATION_SETBACK / 2 + station.depth / 2 - 1

    pads.push({
      x: station.x - island.x + fx * out,
      z: station.z - island.z + fz * out,
      halfWidth: (station.width + 4) / 2,
      halfDepth: (STATION_SETBACK - 2) / 2,
      heading: station.heading,
      height: heightOnRoads(roads, station.x - island.x, station.z - island.z,
                            openGround)
    })
  }

  terracePads(pads)

  const field = makeHeightField({ hills, inlandAt, beach, roads, pads })
  terrainCache.set(island.id, field)
  return field
}

/** The height of the nearest road, or the open ground if there isn't one near. */
function heightOnRoads(roads, x, z, openGround) {
  let best = null

  for (const road of roads) {
    const near = nearestOnPath(road.points, x, z)
    const reach = road.width / 2 + PAD_MARGIN + ROAD_SHOULDER + ROAD_BLEND
    if (near.distance > reach) continue
    if (best && near.distance >= best.distance) continue

    const a = road.heights[near.index]
    const b = road.heights[near.index + 1] ?? a
    best = { distance: near.distance, height: a + (b - a) * near.t }
  }

  return best ? best.height : openGround(x, z)
}

/**
 * How high the ground is anywhere in the world.
 *
 * Sea level over water. This is the one every caller outside the layout
 * should use - World.js for placing things, the traffic for sitting on the
 * road, the monorail for the length of its pillars.
 */
export function groundHeight(x, z) {
  const island = islandAt(x, z)
  if (!island) return 0

  const terrain = getIslandTerrain(island)
  return terrain ? terrain.heightAt(x - island.x, z - island.z) : 0
}

/** Which way the ground tilts, in world coordinates. */
export function groundSlope(x, z) {
  const island = islandAt(x, z)
  if (!island) return { dx: 0, dz: 0, grade: 0 }

  const terrain = getIslandTerrain(island)
  return terrain
    ? terrain.slopeAt(x - island.x, z - island.z)
    : { dx: 0, dz: 0, grade: 0 }
}

/** Forget the cached height fields. The editor needs this after an edit. */
export function invalidateTerrain() {
  terrainCache.clear()
}

/** Look an island up by id. */
export function getIsland(id) {
  return ISLANDS.find((i) => i.id === id)
}

/** The island the car spawns on (used as the respawn target). */
export function getSpawnIsland() {
  return getIsland('hub') || ISLANDS[0]
}

/** Islands excluding the spawn hub - i.e. the ones that carry content. */
export function getContentIslands() {
  const spawn = getSpawnIsland()
  return ISLANDS.filter((i) => i !== spawn)
}

/** Straight-line distance between two islands' centres. */
export function distanceBetween(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/**
 * Resolve a bridge definition into everything needed to build it:
 * midpoint, length, and yaw. Returns null if either island is unknown.
 */
export function resolveBridge(def) {
  const a = getIsland(def.from)
  const b = getIsland(def.to)
  if (!a || !b) return null

  const dx = b.x - a.x
  const dz = b.z - a.z
  const centreDist = Math.hypot(dx, dz)
  if (centreDist === 0) return null

  // Angle measured the same way the rest of the world uses it:
  // atan2(x, z), so that 0 points along +Z.
  const rotationY = Math.atan2(dx, dz)

  // Where the shoreline actually is along this direction. For circular
  // islands this equals the radius; for shaped ones it follows the coast,
  // so bridges always meet real land.
  const aShore = shoreDistance(a, dx, dz)
  const bShore = shoreDistance(b, -dx, -dz)

  // Start and end just inside each island's edge so the deck overlaps
  // the land slightly rather than leaving a seam.
  const startDist = aShore - 1.5
  const endDist = centreDist - bShore + 1.5
  const length = endDist - startDist
  const midDist = startDist + length / 2

  return {
    from: a,
    to: b,
    x: a.x + (dx / centreDist) * midDist,
    z: a.z + (dz / centreDist) * midDist,
    length,
    width: def.width || DEFAULT_BRIDGE_WIDTH,
    railings: def.railings !== false,
    rotationY,
    accent: a.accent
  }
}

/** Every valid bridge, resolved and ready to build. */
export function getBridges() {
  return BRIDGES.map(resolveBridge).filter(Boolean)
}

/**
 * Which bridges touch a given island, and from what direction.
 * Used to run a road from each bridge landing toward the island centre.
 */
export function getBridgeLandings(island) {
  const landings = []

  for (const def of BRIDGES) {
    if (def.from !== island.id && def.to !== island.id) continue

    const other = getIsland(def.from === island.id ? def.to : def.from)
    if (!other) continue

    const dx = other.x - island.x
    const dz = other.z - island.z
    const dist = Math.hypot(dx, dz)
    if (dist === 0) continue

    landings.push({
      // Unit vector from this island's centre toward the bridge
      dirX: dx / dist,
      dirZ: dz / dist,
      // How far the coast is in that direction, so the road reaches it
      shore: shoreDistance(island, dx, dz),
      rotationY: Math.atan2(dx, dz),
      other,
      // The bridge this landing belongs to, so callers can look up an
      // edited approach road for it
      def
    })
  }

  return landings
}

/**
 * All road segments on an island, in island-local coordinates.
 * Combines the automatic bridge-to-centre roads with any hand-authored
 * ones from the island's `roads` array.
 *
 * Each entry: { ax, az, bx, bz, width } - a line from A to B.
 */
/**
 * Condition a road path so it can be turned into a solid ribbon.
 *
 * Two things go wrong otherwise:
 *
 *  1. Uneven spacing. Corner rounding works over about the length of the
 *     segments either side of a corner, so tightly packed points leave
 *     the corner effectively sharp. Re-spacing first fixes that.
 *
 *  2. Genuinely tight bends. A road can only turn as tightly as its own
 *     half-width before the inner edge folds through itself and the
 *     surface collapses to nothing - which is exactly what a gap in the
 *     road is. Extra rounding passes ease those bends out.
 *
 * @param {Array<{x,z}>} points
 * @param {number} width  the road's width, which sets how tight is too tight
 */
export function smoothRoad(points, width = DEFAULT_ROAD_WIDTH) {
  let path = chaikinSmooth(resamplePath(points, ROAD_POINT_SPACING), 2)

  // Keep easing until no bend is tighter than the road can physically
  // take. Capped, because a path can be asked to do the impossible and
  // we would rather return something slightly kinked than loop forever.
  const minRadius = width * 0.55
  for (let pass = 0; pass < 4 && tightestRadius(path) < minRadius; pass++) {
    path = chaikinSmooth(resamplePath(path, ROAD_POINT_SPACING), 2)
  }

  return path
}

/** Smallest turning radius anywhere along a path, in world units. */
function tightestRadius(path) {
  return Math.min(...turningRadii(path))
}

export function getIslandRoads(island) {
  const roads = []

  const ring = getIslandRing(island)
  if (ring && !island.noAutoRoad) {
    roads.push({
      points: ring,
      width: DEFAULT_ROAD_WIDTH,
      ring: true,
      closed: true
    })
  }

  for (const street of getTownGrid(island)) {
    roads.push({
      points: smoothRoad(street.points, street.width),
      width: street.width,
      street: true
    })
  }

  // The road out to the quay. An ordinary road as far as everything else
  // is concerned, but flagged so the pavements and the signals treat it as
  // a through route rather than as something to lay a kerb across.
  const portRoad = getPortRoad(island)
  if (portRoad && !island.noAutoRoad) {
    roads.push({
      points: smoothRoad(sampleSpline(portRoad.points, {
        samplesPerSpan: ROAD_SMOOTHNESS
      }), portRoad.width),
      width: portRoad.width,
      spur: true
    })
  }

  for (const landing of getBridgeLandings(island)) {
    const edited = !!getApproach(island, landing.def)

    // An island with auto roads switched off still gets any approach it
    // has been given by hand - turning them off shouldn't throw away work.
    if (island.noAutoRoad && !edited) continue

    // Same source as the road the game actually draws, so the editor
    // preview and the prop-avoidance both match what you'll drive on.
    const controls = approachControls(
      island, landing.dirX, landing.dirZ, landing.def
    )

    roads.push({
      points: smoothRoad(
        sampleSpline(controls, { samplesPerSpan: ROAD_SMOOTHNESS })
      ),
      width: DEFAULT_ROAD_WIDTH,
      // Drawn as part of the continuous bridge road instead, but still
      // needed here so props keep clear of it
      auto: true,
      // Which bridge this approach serves, and whether it's been taken
      // over by hand. The editor needs both to offer Make editable.
      bridgeTo: landing.def.from === island.id ? landing.def.to : landing.def.from,
      edited
    })
  }

  for (const road of island.roads || []) {
    // Approach roads were handled above - they're drawn as part of the
    // continuous bridge road, so drawing them again here would lay a
    // second surface on top of the first. Same for a hand-edited ring,
    // which is emitted as the ring at the top of this function.
    if (road.approachTo || road.isRing) continue

    const controls = resolveRoadControls(road)
    if (!controls || controls.length < 2) continue

    // A town street you've taken over is still a street. It has to keep
    // saying so, or the moment you touched one it would lose its pavements,
    // its building frontages and its traffic signals - the take-over is
    // supposed to change nothing but who's in charge of the shape.
    const width = road.width
      || (road.streetKey ? DEFAULT_STREET_WIDTH : DEFAULT_ROAD_WIDTH)

    roads.push({
      points: smoothRoad(sampleSpline(controls, {
        samplesPerSpan: ROAD_SMOOTHNESS,
        closed: !!road.closed
      }), width),
      width,
      ...(road.streetKey ? { street: true, streetKey: road.streetKey } : {})
    })
  }

  return roads
}

/**
 * A hand-authored road can be written either way:
 *   { points: [ {x,z}, {x,z}, {x,z} ] }   a curve through several points
 *   { from: 'centre', to: { x, z } }      a simple two-point run
 */
function resolveRoadControls(road) {
  if (Array.isArray(road.points) && road.points.length >= 2) {
    return road.points.map(resolvePoint).filter(Boolean)
  }

  const a = resolvePoint(road.from)
  const b = resolvePoint(road.to)
  return a && b ? [a, b] : null
}

/** Small stable hash, so an island always bows its roads the same way. */
export function hashString(str) {
  let h = 0
  for (let i = 0; i < String(str).length; i++) {
    h = (h * 31 + String(str).charCodeAt(i)) | 0
  }
  return Math.abs(h % 1000)
}

/**
 * Which of this island's bridge landings a given bridge is, so the road
 * bow can be seeded identically to getIslandRoads().
 */
function landingIndex(island, def, bridges = BRIDGES) {
  let index = 0
  for (const other of bridges) {
    if (other.from !== island.id && other.to !== island.id) continue
    if (other === def) return index
    index++
  }
  return 0
}

/**
 * Where a bridge road runs once it comes ashore, in ISLAND-LOCAL
 * coordinates, always ordered shore -> centre.
 *
 * Two sources, one shape:
 *
 *   - by default it's computed - a gentle bow from the landing point in to
 *     the middle, seeded off the island's name so it looks the same every
 *     time the page loads
 *   - if the island carries an `approaches` entry for this bridge, those
 *     stored points win, and the road goes exactly where you put it
 *
 * Both the game and the map editor call this, which is the point: there is
 * one definition of where these roads go, so the preview can't disagree
 * with the world.
 */
/**
 * The ring road on an island: a loop set in from the coast that the
 * bridge roads feed into, island-local and closed.
 *
 * Why a ring at all. Every bridge road used to run to the island centre,
 * so an island with five bridges got five roads converging on one point -
 * unreadable, and impossible to drive through. A ring gives each road
 * somewhere to arrive, turns the middle back into a place rather than a
 * junction, and gives you a circuit to drive.
 *
 * Returns null for islands too small to hold one, and for any island
 * with `noRing: true`.
 */
/**
 * An island's hand-edited ring, if it has one.
 *
 * Stored like the bridge approaches: an ordinary entry in the island's
 * `roads`, marked `isRing: true`. Same reasoning - the editor can then
 * select it, drag its points and delete it with the machinery it already
 * has, and deleting simply hands the loop back to the generator.
 */
export function getStoredRing(island) {
  if (!island || !Array.isArray(island.roads)) return null

  const found = island.roads.find(r => r.isRing)
  return found && Array.isArray(found.points) && found.points.length >= 3
    ? found
    : null
}

export function getIslandRing(island) {
  if (!island || island.noRing) return null

  // A ring you've taken over by hand wins outright. It isn't re-derived
  // from the coastline, so moving a headland won't drag your road with it.
  const stored = getStoredRing(island)
  if (stored) {
    const loop = stored.points.map(p => ({ x: p.x, z: p.z }))

    // Drop a repeated closing point: the spline wraps on its own.
    const first = loop[0]
    const last = loop[loop.length - 1]
    if (Math.hypot(first.x - last.x, first.z - last.z) < 1e-6) loop.pop()
    if (loop.length < 3) return null

    // Run the curve THROUGH the handles rather than rounding the corners
    // off them. Corner rounding pulls the loop inwards at every handle,
    // so taking a ring over visibly shrank it - by 3.3 units on a big
    // island, half a road width. A spline through the points doesn't
    // move them at all.
    let curve = sampleSpline(loop, {
      samplesPerSpan: ROAD_SMOOTHNESS,
      closed: true
    })

    // Ease it only if you've actually drawn something too tight to drive.
    // Easing unconditionally would drag the loop off the handles you
    // placed, for no benefit on a ring that was already fine.
    for (let pass = 0; pass < 8; pass++) {
      if (Math.min(...turningRadii(curve)) >= DEFAULT_ROAD_WIDTH * 0.75) break
      curve = chaikinClosed(resamplePath(curve, ROAD_POINT_SPACING), 1)
    }

    return curve
  }

  const outline = getOutline(island)
  const reach = boundingRadius(outline)

  // How far in from the coast, as a FRACTION of the coast distance in
  // each direction - not a fixed number of units.
  //
  // A fixed inset works out as a fraction of the island's longest axis,
  // which on a stretched island is more than the short axis has to give.
  // The sides then bottom out at the minimum width while the ends stay
  // wide, and the ring becomes two big lobes joined by a pinch - 2-unit
  // hairpins on a 7-unit road. Taking a proportion of the local shore
  // distance keeps the loop in step with the shape whatever it is.
  //
  // `ringInset` on an island still means an absolute number of units.
  const fraction = island.ringInsetFraction !== undefined
    ? island.ringInsetFraction
    : RING_INSET_FRACTION

  if (reach * (1 - fraction) < DEFAULT_ROAD_WIDTH * 1.6) return null

  // Built in polar form: for each direction out from the centre, take the
  // coast distance and come in by `inset`.
  //
  // The obvious approach - inset the outline polygon - does not survive
  // contact with a real coastline. Pulling a wobbly shape inward by 15
  // units makes it cross itself, and a self-crossing loop has a cusp in
  // it that no amount of smoothing removes; you get a 1.6-unit hairpin
  // where the road doubles back. Sweeping a radius around the centre
  // cannot self-intersect, because there is exactly one ring point per
  // direction.
  const STEPS = 96
  const radii = []

  for (let i = 0; i < STEPS; i++) {
    const angle = (i / STEPS) * Math.PI * 2
    const shore = rayDistanceToBoundary(outline, Math.cos(angle), Math.sin(angle))
    const pulled = island.ringInset !== undefined
      ? shore - island.ringInset
      : shore * (1 - fraction)
    radii.push(Math.max(DEFAULT_ROAD_WIDTH, pulled))
  }

  // Smooth the radius around the loop so bays and headlands become gentle
  // swells rather than corners. Circular, so there's no seam.
  //
  // How much smoothing is needed depends on how ragged the coast is, so
  // rather than guess a number of passes, keep going until the loop is
  // actually drivable. A deeply indented island simply ends up with a
  // rounder ring, which is the right answer.
  const toPoints = () => {
    const ring = radii.map((r, i) => {
      const angle = (i / STEPS) * Math.PI * 2
      return { x: Math.cos(angle) * r, z: Math.sin(angle) * r }
    })
    ring.push({ ...ring[0] })
    return chaikinClosed(ring, 2)
  }

  let ring = toPoints()

  for (let pass = 0; pass < 40; pass++) {
    if (Math.min(...turningRadii(ring)) >= DEFAULT_ROAD_WIDTH) break

    const next = radii.map((r, i) => {
      const prev = radii[(i - 1 + STEPS) % STEPS]
      const after = radii[(i + 1) % STEPS]
      return prev * 0.25 + r * 0.5 + after * 0.25
    })
    radii.splice(0, STEPS, ...next)
    ring = toPoints()
  }

  return ring
}

/** Does this island get a town laid out on it? */
export function isTown(island) {
  if (!island) return false
  return island.grid !== undefined ? island.grid : island.theme === 'town'
}

/**
 * A grid of streets inside the ring, island-local.
 *
 * Only for town islands - a grid on a jungle island would look absurd -
 * and only inside the ring, so the ring stays the edge of the built-up
 * area and the coast stays open.
 *
 * Each street is clipped to the ring and stops exactly on it, which is
 * what makes the junctions work: getIslandJunctions() sees the ends
 * touching the loop and lays a patch there without being told to.
 *
 * Islands can set `grid: false` to opt out, `blockSize` to change how big
 * the blocks are, and `gridAngle` (degrees) to turn the whole grid.
 *
 * Every street carries a `key`. Nothing here uses it, but the editor does:
 * a generated street isn't stored anywhere, so there is no object to click,
 * and the key is what lets one be named - taken over into the island's
 * `roads` so it can be dragged, or listed in `noStreets` so it stays gone.
 * See takenOverStreets() below for why the keys have to be stable.
 */
export function getTownGrid(island) {
  if (!isTown(island) || island.noAutoRoad) return []

  const ring = getIslandRing(island)
  if (!ring) return []

  const spacing = island.blockSize || DEFAULT_BLOCK_SIZE

  // Seeded off the island's name, so a town is laid out the same way on
  // every visit but no two towns line up with each other.
  const angle = island.gridAngle !== undefined
    ? (island.gridAngle * Math.PI) / 180
    : (hashString(island.id) % 90) * (Math.PI / 180)

  const bounds = polygonBounds(ring)
  const span = Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ)
  const streets = []

  // Two sets of parallel lines at right angles, swept across the island
  for (const axis of [0, 1]) {
    const dirX = axis ? Math.cos(angle) : -Math.sin(angle)
    const dirZ = axis ? Math.sin(angle) : Math.cos(angle)
    const perpX = -dirZ
    const perpZ = dirX

    const lines = Math.ceil(span / spacing)

    for (let i = -lines; i <= lines; i++) {
      const offset = i * spacing
      const ox = perpX * offset
      const oz = perpZ * offset

      // Walk the full length of this line and keep the stretches that
      // fall inside the ring. A concave island can give more than one.
      let runIndex = -1
      for (const run of runsInsideRing(ring, ox, oz, dirX, dirZ, span)) {
        runIndex++
        const candidate = {
          points: [run.from, run.to],
          width: DEFAULT_STREET_WIDTH,
          street: true,
          // Which sweep line this came off, and which stretch of it. Counted
          // before any of the tests below, so rejecting a street doesn't
          // renumber the ones after it.
          key: `s${axis}.${i}.${runIndex}`
        }

        // Reject anything running alongside a road already there. The
        // ring is the usual culprit: a grid line clipped near the edge of
        // the island can shadow it for most of its length, leaving two
        // carriageways with a sliver of pavement between them.
        if (crowdsAnother(candidate, [{ points: ring, width: DEFAULT_ROAD_WIDTH }, ...streets])) {
          continue
        }

        // And reject anything meeting the ring at a glancing angle
        if (meetsTooShallow(candidate, ring)) continue

        streets.push(candidate)
      }
    }
  }

  // Drop the ones you've taken over or removed - LAST, after every street
  // has been through the tests above.
  //
  // Filtering earlier would be quietly wrong: crowdsAnother() weighs each
  // candidate against the streets already accepted, so removing one changes
  // what happens to its neighbours. Take over a street and the street next
  // to it, previously rejected for shadowing it, would appear out of
  // nowhere. Generate the full grid, then hide what's been claimed.
  const claimed = takenOverStreets(island)
  return claimed.size ? streets.filter(s => !claimed.has(s.key)) : streets
}

/**
 * Street keys the generator should keep quiet about, because you've dealt
 * with them by hand: either taken over into `roads`, or removed outright.
 */
export function takenOverStreets(island) {
  const keys = new Set()
  if (!island) return keys

  for (const road of island.roads || []) {
    if (road.streetKey) keys.add(road.streetKey)
  }
  for (const key of island.noStreets || []) keys.add(key)

  return keys
}

/**
 * Where buildings go in a town: in rows along the streets, square to the
 * kerb, at a constant setback.
 *
 * The scatter that used to fill town islands put buildings at random
 * angles in random places, which reads as debris rather than a street.
 * Walking the roads and placing plots along them is what makes a row of
 * frontages line up.
 *
 * Returns island-local { x, z, rotation, width, depth, facing } where
 * `facing` is the direction the front looks, and rotation is in degrees
 * to match the map format.
 */
export function getTownPlots(island) {
  if (!isTown(island)) return []
  return roadsidePlots(island, getIslandRoads(island).filter(r => r.street || r.ring))
}

/**
 * The same rows of frontages, for an island that isn't a town.
 *
 * Islands with `theme: 'mixed'` used to get their buildings from the random
 * scatter, which meant a random angle and a random distance from the road -
 * a field of houses pointing in every direction while the town islands next
 * door were laid out in neat rows. Nothing about lining a building up to a
 * kerb is specific to a town, so the same machinery does both now.
 *
 * Sparser than a town, and taken from the ring and the port road, because a
 * non-town island has no street grid to work from.
 */
export function getRoadsidePlots(island) {
  if (!island || isTown(island)) return []

  const every = ROADSIDE_DENSITY[island.theme] || 0
  if (!every) return []

  const roads = getIslandRoads(island).filter(r => r.ring || r.street || r.spur)
  if (!roads.length) return []

  return roadsidePlots(island, roads).filter((_, i) => i % every === 0)
}

/** Plots along a given set of roads. The shared half of both of the above. */
function roadsidePlots(island, streets) {
  if (!streets.length) return []

  const outline = getOutline(island)
  const plots = []

  // Where each bridge comes ashore, island-local
  const landings = getBridgeLandings(island).map(l => {
    const reach = Math.max(2, l.shore - 1)
    return { x: l.dirX * reach, z: l.dirZ * reach }
  })

  const depth = island.plotDepth || DEFAULT_PLOT_DEPTH
  const width = island.plotWidth || DEFAULT_PLOT_WIDTH

  streets.forEach((road, roadIndex) => {
    // Setback measured from the centre line: half the road, the pavement,
    // then half the building. Constant for every plot, which is what
    // makes the frontages line up.
    const setback = road.width / 2 + PAVEMENT_WIDTH + depth / 2

    const path = resamplePath(road.points, width + PLOT_GAP)

    // Skip the first and last - a building right on a junction blocks the
    // corner and looks wrong from every direction.
    for (let i = 1; i < path.length - 1; i++) {
      // The plot's position comes from the coarse walk, but the direction
      // it faces must come from the road itself.
      //
      // Taking the tangent across the coarse spacing means measuring a
      // 23-unit chord, which on a curved ring points up to 28 degrees away
      // from the kerb the building actually sits on - visibly skewed.
      const tan = tangentAt(road.points, path[i].x, path[i].z)
      if (!tan) continue
      const tx = tan.x
      const tz = tan.z

      // One plot each side, facing back toward the road
      for (const side of [1, -1]) {
        const nx = -tz * side
        const nz = tx * side

        const x = path[i].x + nx * setback
        const z = path[i].z + nz * setback

        // Reject the inside of a tight bend.
        //
        // Where the road curves tighter than the setback, stepping inward
        // lands you near the centre of the curve - the plot ends up closer
        // to a different part of the same road than to the stretch it was
        // meant to front, so it faces off at an angle and crowds its
        // neighbours. Physically there is no room for a building there.
        const nearest = nearestOnPath(road.points, x, z)
        if (!nearest ||
            Math.hypot(nearest.x - path[i].x, nearest.z - path[i].z) > setback * 0.5) {
          continue
        }

        // Clear of every bridge landing. Arriving at an island is the one
        // view every visitor gets; a building on the kerb right where the
        // bridge lands stands squarely in it.
        if (landings.some(l => Math.hypot(l.x - x, l.z - z) < LANDING_CLEARANCE)) {
          continue
        }

        // On land, clear of the coast
        if (distanceToEdge(outline, x, z) < depth) continue

        // Clear of every OTHER road, not just the one it fronts.
        //
        // Without this, plots near an intersection sit almost on the
        // cross street - they measured 6.9 units from its centre line
        // against a 9.9 setback, so they'd be built halfway into it and
        // face the wrong way relative to the road you'd see them from.
        const others = streets.filter((_, k) => k !== roadIndex)
        if (others.length &&
            distanceToNearestRoad(others, x, z) < depth / 2 + PAVEMENT_WIDTH) {
          continue
        }

        // Face the road as seen FROM WHERE THE BUILDING ENDS UP, not from
        // where it started. Stepping 10 units off a curve moves you along
        // it as well as away from it, so the kerb in front of the finished
        // plot runs at a slightly different angle to the one at the start.
        const settled = tangentAt(road.points, x, z) || { x: tx, z: tz }
        const fx = -(-settled.z * side)
        const fz = -(settled.x * side)

        plots.push({
          x: Math.round(x * 10) / 10,
          z: Math.round(z * 10) / 10,
          // The front faces back at the road
          rotation: Math.round((Math.atan2(fx, fz) * 180) / Math.PI),
          width,
          depth,
          // Which road this plot fronts, so the frontage can be checked
          // against the right one
          roadIndex
        })
      }
    }
  })

  // Two streets running close together can both claim the same ground
  return dropOverlapping(plots, width * 0.9)
}

/**
 * The direction a path runs at the point nearest (x, z), measured on the
 * path's own points rather than any coarser sampling of it.
 */
function tangentAt(points, x, z) {
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

/**
 * Footpaths reaching buildings that no road goes past, island-local.
 *
 * Generated town plots always front a street - that's how they're placed.
 * Buildings you put down by hand don't: drop one in the middle of a block
 * and it sits on grass with no way to reach it on foot. This runs a narrow
 * path from each of those out to the nearest road.
 *
 * Returns { points: [from, to], width } - the same shape as a road, so it
 * can be drawn with the same ribbon code.
 */
export function getWalkways(island) {
  if (!island) return []

  const roads = getIslandRoads(island)
  if (!roads.length) return []

  const walkways = []

  for (const building of island.buildings || []) {
    const bx = building.x || 0
    const bz = building.z || 0
    const half = Math.max(building.width || 6, building.depth || 6) / 2

    // Which road is nearest, and where on it
    let target = null
    let gap = Infinity

    for (const road of roads) {
      const near = nearestOnPath(road.points, bx, bz)
      if (!near) continue
      const d = Math.hypot(near.x - bx, near.z - bz) - road.width / 2
      if (d < gap) { gap = d; target = near }
    }

    if (!target) continue

    // Already on a pavement: no path needed. Further than this and it
    // isn't a back lot, it's a building in a field - a long path to it
    // would look stranger than none.
    if (gap <= half + PAVEMENT_WIDTH * 1.5) continue
    if (gap > MAX_WALKWAY_LENGTH) continue

    // Start at the building's wall, not its centre, or the path would
    // appear to run out from underneath it.
    let dx = target.x - bx
    let dz = target.z - bz
    const len = Math.hypot(dx, dz)
    if (len < 1e-6) continue
    dx /= len
    dz /= len

    walkways.push({
      points: [
        { x: bx + dx * half, z: bz + dz * half },
        { x: target.x, z: target.z }
      ],
      width: WALKWAY_WIDTH
    })
  }

  return walkways
}

/** Remove plots that landed on top of each other. */
function dropOverlapping(plots, minGap) {
  const kept = []
  for (const p of plots) {
    if (kept.some(k => Math.hypot(k.x - p.x, k.z - p.z) < minGap)) continue
    kept.push(p)
  }
  return kept
}

/**
 * Does this street spend most of its length hugging another road?
 *
 * Crossing one is fine - that's a junction. Running parallel a few units
 * away is not, so the test is how MUCH of the street is too close, not
 * whether any of it is.
 */
function crowdsAnother(candidate, others) {
  const [from, to] = candidate.points
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  if (length < 1e-6) return true

  const dirX = (to.x - from.x) / length
  const dirZ = (to.z - from.z) / length

  const STEP = 2
  let run = 0

  for (let travelled = 0; travelled <= length; travelled += STEP) {
    const x = from.x + dirX * travelled
    const z = from.z + dirZ * travelled

    // Ignore the approach to each end: every street meets the ring there,
    // so of course it's close - that's the junction, not crowding.
    //
    // Expressed as a fraction of the street so it matches how this is
    // measured in tests/town.mjs. A fixed number of units disagreed with
    // it on long streets, and the generator accepted one the test then
    // rejected.
    const along = travelled / length
    if (Math.min(along, 1 - along) < 0.15) continue

    for (const other of others) {
      const near = nearestOnPath(other.points, x, z)
      if (!near) continue

      const gap = Math.hypot(near.x - x, near.z - z)
        - candidate.width / 2 - other.width / 2
      if (gap >= MIN_ROAD_SEPARATION) continue

      // Close is only a problem if they're going the SAME WAY. Two roads
      // crossing at an angle are a junction; two roads a few units apart
      // running parallel are a mistake.
      const tan = tangentAt(other.points, x, z)
      if (!tan) continue
      if (Math.abs(dirX * tan.x + dirZ * tan.z) > 0.9) { run += STEP; break }
    }
  }

  return run > MAX_PARALLEL_RUN
}

/**
 * Does this street run into the ring at a glancing angle?
 *
 * Both ends are checked. A street that grazes the ring converges with it
 * over a long distance instead of crossing it, which reads as two roads
 * squeezed together rather than as a junction.
 */
function meetsTooShallow(candidate, ring) {
  const [from, to] = candidate.points
  const length = Math.hypot(to.x - from.x, to.z - from.z)
  if (length < 1e-6) return true

  const dirX = (to.x - from.x) / length
  const dirZ = (to.z - from.z) / length
  const limit = Math.cos((MIN_JUNCTION_ANGLE * Math.PI) / 180)

  for (const end of [from, to]) {
    const tan = tangentAt(ring, end.x, end.z)
    if (!tan) continue
    // Parallel means dot product near 1; a right angle means near 0
    if (Math.abs(dirX * tan.x + dirZ * tan.z) > limit) return true
  }

  return false
}

/**
 * The stretches of a line that lie inside the ring.
 *
 * Sampled rather than solved: a ring is a many-sided polygon and an
 * island can be concave, so a line may enter and leave more than once.
 * Walking it and noting where it crosses is simpler than the algebra and
 * cannot miss a lobe.
 */
function runsInsideRing(ring, ox, oz, dirX, dirZ, span) {
  const STEP = 1.5
  const runs = []
  let start = null

  for (let t = -span; t <= span; t += STEP) {
    const x = ox + dirX * t
    const z = oz + dirZ * t
    const inside = pointInPolygon(ring, x, z)

    if (inside && start === null) start = t
    if ((!inside || t + STEP > span) && start !== null) {
      const from = { x: ox + dirX * start, z: oz + dirZ * start }
      const to = { x, z }

      // Ignore slivers clipped off a corner of the ring - a three-unit
      // stub of road leading nowhere is worse than no road.
      if (Math.hypot(to.x - from.x, to.z - from.z) >= MIN_STREET_LENGTH) {
        runs.push({ from, to })
      }
      start = null
    }
  }

  return runs
}

// ---------------------------------------------------------------------------
// Traffic
// ---------------------------------------------------------------------------

/**
 * What colour a signal is showing to one group of arms, right now.
 *
 * The single source of truth for the light cycle. The renderer lights the
 * lamps from this and the cars decide whether to stop from this, so they
 * cannot disagree - which they did, back when each worked it out for itself
 * from its own copy of the arithmetic.
 */
export function signalState(signal, group, elapsed) {
  const t = (elapsed + (signal.offset || 0)) % TRAFFIC_CYCLE
  const half = TRAFFIC_CYCLE / 2
  const firstGroupsTurn = t < half
  const intoPhase = firstGroupsTurn ? t : t - half

  if ((group === 0) !== firstGroupsTurn) return 'red'
  return intoPhase > half - TRAFFIC_AMBER ? 'amber' : 'green'
}

/**
 * The road network as directed lanes: what a car can actually drive along.
 *
 * Built from getRoadNetwork(), so it inherits the same connections the
 * editor draws and the same rule that none of it is stored.
 *
 * Three things make this more than an offset copy of the roads:
 *
 *  - **Each road is cut at every junction on it.** Without that a car on a
 *    through road passes a crossroads with no decision to make, so it can
 *    never turn off and never has a stop line to stop at.
 *  - **Each piece becomes two lanes**, one per direction, offset a quarter
 *    of the road's width to the right of travel. Right-hand traffic.
 *  - **Each lane knows what it can turn into**, and whether the junction at
 *    its far end has lights, and which phase it has to wait for.
 */
export function getLaneNetwork() {
  const net = getRoadNetwork()
  const lanes = []

  // Which nodes fall on each segment, and how far along
  const cuts = net.segments.map(() => [])

  net.nodes.forEach((node, nodeIndex) => {
    for (const segIndex of node.segments) {
      const seg = net.segments[segIndex]
      const along = distanceAlongPath(seg.points, node.x, node.z)
      if (along !== null) cuts[segIndex].push({ nodeIndex, along })
    }
  })

  let pieces = 0

  net.segments.forEach((seg, segIndex) => {
    const measured = measurePath(seg.points)
    const marks = cuts[segIndex].sort((a, b) => a.along - b.along)

    // Where the pieces begin and end. An open road runs from its own start
    // to its own end; a ring has no ends, so its first junction serves as
    // both - and if it has none at all it stays one continuous loop.
    const breaks = []
    if (!seg.closed) breaks.push({ nodeIndex: null, along: 0 })
    for (const m of marks) breaks.push(m)
    if (!seg.closed) breaks.push({ nodeIndex: null, along: measured.length })

    if (seg.closed) {
      if (!marks.length) breaks.push({ nodeIndex: null, along: 0 },
                                     { nodeIndex: null, along: measured.length })
      else breaks.push({ nodeIndex: marks[0].nodeIndex, along: measured.length })
    }

    for (let i = 0; i < breaks.length - 1; i++) {
      const from = breaks[i]
      const to = breaks[i + 1]
      const length = to.along - from.along
      if (length < LANE_MIN_LENGTH) continue

      const centre = slicePath(measured, from.along, to.along)
      if (centre.length < 2) continue

      const offset = seg.width / 4

      // Both directions of one stretch of road share a piece id.
      //
      // They used to be matched by the x of their first point, which is a
      // DIFFERENT point for each direction - so "the opposite lane" resolved
      // to whatever else happened to share that coordinate, and the U-turn
      // link at a dead end pointed 67 units away.
      const piece = pieces++

      lanes.push(makeLane(centre, offset, seg, from.nodeIndex, to.nodeIndex, piece))
      lanes.push(makeLane(centre.slice().reverse(), offset, seg,
                          to.nodeIndex, from.nodeIndex, piece))
    }
  })

  // Two roads can legitimately run close together - a street is allowed 26
  // units alongside the ring - and where they do, their lanes occupy the
  // same tarmac. Cars on them then veto each other's every move and the
  // whole island jams: three vehicles spent 266 of 300 seconds stationary on
  // one ring piece with a street lying on top of it.
  //
  // The roads stay as they are, because they look fine. What goes is the
  // duplicate LANE, so traffic only ever has one way through that space.
  const doubled = new Set()

  for (let i = 0; i < lanes.length; i++) {
    if (doubled.has(i)) continue
    for (let j = i + 1; j < lanes.length; j++) {
      if (doubled.has(j)) continue
      if (lanes[i].segment === lanes[j].segment) continue
      if (!lanesShareTarmac(lanes[i], lanes[j])) continue

      // Keep the ring, it's the arterial; otherwise keep the longer one
      const dropJ = lanes[i].kind === 'ring' || lanes[i].length >= lanes[j].length
      doubled.add(dropJ ? j : i)
      if (!dropJ) break
    }
  }

  const kept = lanes.filter((_, i) => !doubled.has(i))
  lanes.length = 0
  lanes.push(...kept)

  // What each lane can become at its far end
  for (const lane of lanes) {
    lane.next = []
    if (lane.toNode === null) continue

    for (let i = 0; i < lanes.length; i++) {
      const other = lanes[i]
      if (other === lane) continue
      if (other.fromNode !== lane.toNode) continue

      // And the two must actually meet. Sharing a node index is not enough:
      // buildNetwork can attach a closed ring to a node that its geometry only
      // passes within a tolerance of, which produced a "connection" whose ends
      // were 56 units apart. A car taking it teleported across the island.
      const end = lane.points[lane.points.length - 1]
      const start = other.points[0]
      if (Math.hypot(end.x - start.x, end.z - start.z) > LANE_JOIN_TOLERANCE) continue
      // Not straight back the way you came - the same piece of road, the
      // other way. Identified by piece id; comparing coordinates got this
      // wrong, because the two directions start at opposite ends.
      if (other.piece === lane.piece) continue
      lane.next.push(i)
    }

    // The opposite direction of the same piece of road. Kept on every lane,
    // not just the dead ends: it's the last resort for a vehicle that has
    // been pinned for a long time, which can then turn round and leave. A
    // U-turn reads as a decision; a car stuck for ever reads as a bug.
    lane.back = lanes.findIndex(o => o.piece === lane.piece && o !== lane)

    // A dead end: turning round is the only thing to do at all.
    if (!lane.next.length && lane.back >= 0) lane.next.push(lane.back)
  }

  attachSignals(lanes)

  return { lanes, nodes: net.nodes, segments: net.segments }
}

/**
 * Do two lanes run over the same ground for most of the shorter one?
 *
 * Sampled rather than solved, and deliberately strict about "most": two roads
 * crossing share a point and that's a junction, not a duplicate. The
 * threshold is under half a road width, so the two directions of the same
 * road - which sit width/2 apart by design - could never trip it even if they
 * were compared.
 */
function lanesShareTarmac(a, b) {
  const shorter = a.length <= b.length ? a : b
  const other = shorter === a ? b : a

  // Measured as an absolute LENGTH of shared tarmac, not as a fraction.
  //
  // The fraction version required 60% of a lane to be doubled up and found
  // nothing, while two pairs on this map ran alongside each other for 16 and
  // 18 units - enough for a car on one to be permanently interpenetrated with
  // a car on the other. And it was unrecoverable: backing off along a lane
  // that runs PARALLEL to the obstruction never increases the gap, so the
  // unjam reverse couldn't separate them either. Seven vehicles sat in that
  // knot for 235 of 300 seconds.
  let together = 0
  const step = 2

  for (let d = 0; d <= shorter.length; d += step) {
    const p = pointAlong(shorter, d)
    const near = nearestOnPath(other.points, p.x, p.z)
    if (near && Math.hypot(near.x - p.x, near.z - p.z) < LANE_SHARED_GAP) {
      together += step
    }
  }

  return together >= LANE_SHARED_LENGTH
}

/** One directed lane, offset to the right of the centre line it follows. */
function makeLane(centre, offset, seg, fromNode, toNode, piece) {
  const tangents = pathTangentsLocal(centre)
  // Lanes keep their full offset the whole way, on their own side of the road.
  //
  // Tapering them together at the junctions was tried, so that consecutive
  // lanes met at a point and a turning car had no sideways jump. It closed the
  // gap perfectly and halved the traffic: converging lanes put oncoming cars
  // nose to nose at every junction, the collision veto fired constantly, and
  // the median distance covered fell from 1518 to 174.
  //
  // The sideways step at a turn is real and belongs there - a car changing
  // from one road's right-hand lane to another's genuinely has to cross. It's
  // smoothed where it should be, in the renderer, over about a tenth of a
  // second. See updateTraffic in World.js.
  const points = centre.map((p, i) => ({
    x: p.x - tangents[i].z * offset,
    z: p.z + tangents[i].x * offset
  }))

  return {
    ...measurePath(points),
    segment: seg,
    kind: seg.kind,
    island: seg.island,
    width: seg.width,
    fromNode,
    toNode,
    piece,
    reversed: false,
    next: [],
    signal: null,
    signalGroup: 0,
    stops: []
  }
}

/** Tangents along a path. Local copy so the layout doesn't need curves.js. */
function pathTangentsLocal(points) {
  const out = []
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)]
    const b = points[Math.min(points.length - 1, i + 1)]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len = Math.hypot(dx, dz)
    out.push(len < 1e-9
      ? (out[out.length - 1] || { x: 0, z: 1 })
      : { x: dx / len, z: dz / len })
  }
  return out
}

/** How far along a polyline the nearest point to (x, z) is, or null. */
function distanceAlongPath(points, x, z) {
  let best = null
  let bestDist = Infinity
  let travelled = 0

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const lenSq = dx * dx + dz * dz
    const len = Math.sqrt(lenSq)

    if (lenSq > 1e-12) {
      let t = ((x - a.x) * dx + (z - a.z) * dz) / lenSq
      t = Math.max(0, Math.min(1, t))
      const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t))
      if (d < bestDist) { bestDist = d; best = travelled + len * t }
    }

    travelled += len
  }

  return best
}

/** The stretch of a measured path between two distances along it. */
function slicePath(measured, from, to) {
  const out = [pointAlong(measured, from)]

  for (let i = 0; i < measured.points.length; i++) {
    const d = measured.cumulative[i]
    if (d > from + 1e-6 && d < to - 1e-6) out.push({ ...measured.points[i] })
  }

  out.push(pointAlong(measured, to))
  return out.map(p => ({ x: p.x, z: p.z }))
}

/**
 * Give every lane its stop line: which signal governs its far end, and which
 * phase of that signal it has to wait for.
 *
 * The phase is matched by DIRECTION. A signal's arms each point back down
 * the road they govern, so the arm a lane belongs to is the one pointing
 * most nearly opposite the lane's own direction of travel.
 */
function attachSignals(lanes) {
  const all = []
  for (const island of ISLANDS) {
    for (const signal of getTrafficSignals(island)) {
      all.push({
        ...signal,
        x: island.x + signal.x,
        z: island.z + signal.z
      })
    }
  }

  for (const lane of lanes) {
    const end = lane.points[lane.points.length - 1]
    const before = lane.points[Math.max(0, lane.points.length - 2)]
    const dirX = end.x - before.x
    const dirZ = end.z - before.z
    const len = Math.hypot(dirX, dirZ) || 1

    let best = null
    let bestDist = Infinity

    // Close, not merely nearby. A lane end sits on a junction node and a
    // signal sits on the junction it governs, so a real match is a couple of
    // units. Allowing the full merge distance meant a lane picked up the
    // lights of the NEXT junction along and its cars waited at a red for a
    // crossroads they weren't at.
    for (const signal of all) {
      const d = Math.hypot(signal.x - end.x, signal.z - end.z)
      if (d > signal.radius + 8) continue
      if (d < bestDist) { bestDist = d; best = signal }
    }

    if (!best) continue

    // The arm pointing back at us
    let arm = null
    let bestDot = -2
    for (const a of best.arms) {
      const dot = -(a.x * (dirX / len) + a.z * (dirZ / len))
      if (dot > bestDot) { bestDot = dot; arm = a }
    }
    if (!arm || bestDot < 0.3) continue

    lane.signal = best
    lane.signalGroup = arm.group

    // Where to stop: clear of the junction patch, measured from the patch
    // itself rather than from this lane's width.
    //
    // It used to be `width * 0.75` back from the node, which happens to be
    // enough on a seven-unit road and is NOT enough on a five-and-a-half unit
    // street meeting one - the patch reaches 5.05 units out and the car
    // stopped at 4.53, half a unit inside the intersection, blocking the
    // traffic crossing it. The junction's own radius is the only figure that
    // knows how far it reaches.
    lane.stopLine = Math.max(0, lane.length - (best.radius + STOP_LINE_MARGIN))
  }
}

/**
 * Fire stations, police stations and hospitals, and the bays their vehicles
 * come and go from.
 *
 * Each one sits beside a lane, set back off the kerb, with its bays between
 * the building and the road so a vehicle can turn in off the carriageway.
 * Sites are scored the same way everything else here is: on land, clear of
 * every road, clear of the monorail, clear of each other.
 *
 * Every bay carries the lane it opens onto and how far along it - that's what
 * lets a vehicle pull in without any pathfinding, by leaving its lane at a
 * known point and driving a straight line to a known place.
 */
export function getStations(network = getLaneNetwork()) {
  const stations = []
  const route = getMonorailRoute()

  // One of each on the biggest towns, then spread the rest around
  const wanted = []
  const towns = ISLANDS.filter(isTown)
    .sort((a, b) => islandReach(b) - islandReach(a))
  const others = ISLANDS.filter(i => !isTown(i) && i.theme !== 'plain')

  for (const island of towns) {
    wanted.push({ island, kind: 'fire' }, { island, kind: 'police' },
                { island, kind: 'hospital' })
  }
  others.forEach((island, i) => {
    wanted.push({ island, kind: ['police', 'fire', 'hospital'][i % 3] })
  })

  for (const { island, kind } of wanted) {
    const spec = STATION_KINDS[kind]
    const site = findStationSite(network, island, spec, stations, route)
    if (!site) continue

    // spec first, site second: the site's `bays` array must win
    stations.push({
      ...spec, ...site, kind, island, id: `${island.id}-${kind}`,
      // How many lanes it takes to get back to this station's own lane, from
      // anywhere. Without it a vehicle only goes home if its wandering happens
      // to take it past the door - which over ten minutes happened twice out
      // of twenty-two.
      toHome: hopsToLane(network, site.lane)
    })
  }

  return stations
}

/** What each kind of station looks like and how many vehicles it holds. */
// `bayCount`, not `bays`. The site produced by findStationSite carries a
// `bays` ARRAY, and spreading the spec over it replaced the list of bays with
// the number 3 - so every station had bays that couldn't be iterated.
export const STATION_KINDS = {
  // `doorWidth` is narrower than the bay so there is a pier of brickwork
  // between one door and the next - at the full bay width the three openings
  // meet and the front of a fire station is one 19.5-unit hole. It is still
  // the number the ENGINE has to fit through, so it lives here with the bay
  // spacing rather than being picked in the renderer.
  fire: {
    width: 22, depth: 15, bayCount: 3, bayWidth: 6.5, doorWidth: 5.6,
    garage: true, vehicle: 'fire'
  },
  police: {
    width: 18, depth: 13, bayCount: 4, bayWidth: 4.2, doorWidth: 2.6,
    garage: false, vehicle: 'police'
  },
  hospital: {
    width: 24, depth: 16, bayCount: 3, bayWidth: 5, doorWidth: 2.6,
    garage: false, vehicle: 'ambulance'
  }
}

/** How far a station stands back from the kerb, leaving room for its bays. */
export const STATION_SETBACK = 15

/** Clear ground a station keeps from any road, and from another station. */
export const STATION_ROAD_CLEARANCE = 3
export const STATION_SPACING = 55

/**
 * Somewhere on this island to put one, beside a lane and off the road.
 *
 * Walks the lanes rather than the compass: a station has to open onto a road,
 * so starting from the roads is both faster and guarantees the one property
 * that matters.
 */
function findStationSite(network, island, spec, taken, route) {
  const roads = getIslandRoads(island)
  const reach = Math.hypot(spec.width / 2, spec.depth / 2)

  let best = null

  for (let index = 0; index < network.lanes.length; index++) {
    const lane = network.lanes[index]
    if (lane.island !== island.id) continue
    if (lane.kind !== 'ring' && lane.kind !== 'road') continue
    if (lane.length < 40) continue

    for (let at = 18; at < lane.length - 18; at += 9) {
      const on = pointAlong(lane, at)

      // Out to the kerb side, which is the vehicles' own side of the road
      const sx = -Math.cos(on.heading)
      const sz = Math.sin(on.heading)
      const out = lane.width / 4 + PAVEMENT_WIDTH + STATION_SETBACK

      const x = on.x - sx * out
      const z = on.z - sz * out

      // The building's own RECTANGLE, not the circle around it.
      //
      // Testing the centre against half the diagonal demands 16 units of
      // clear ground for a fire station, and a town with streets every 34
      // units never has that anywhere - which is why the first version of
      // this placed no stations at all. A 22x15 building set back 15 units
      // from a lane fits perfectly well; it just doesn't fit inside a circle
      // of its own diagonal.
      const heading = Math.atan2(sx, sz)
      if (!rectangleIsClear(island, roads, x, z, heading,
                            spec.width, spec.depth, STATION_ROAD_CLEARANCE)) {
        continue
      }
      if (route && monorailCeiling(route, x, z) < 14) continue

      if (taken.some(t => Math.hypot(t.x - x, t.z - z) < STATION_SPACING)) continue

      // Room in front for the bays, which sit between the building and the road
      const apron = {
        x: on.x - sx * (lane.width / 4 + PAVEMENT_WIDTH + 4),
        z: on.z - sz * (lane.width / 4 + PAVEMENT_WIDTH + 4)
      }
      if (inlandDistance(island, apron.x - island.x, apron.z - island.z) < 3) continue

      // Prefer a spot well clear of everything, so the yard has room
      const score = distanceToNearestRoad(roads, x - island.x, z - island.z)
      if (!best || score > best.score) {
        best = {
          x, z, score,
          // Facing the road, which is the way the doors open
          heading,
          lane: index,
          at,
          bays: bayPositions(on, sx, sz, lane, spec)
        }
      }
    }
  }

  return best
}

/**
 * How many lane changes it takes to reach `target` from every other lane.
 *
 * A breadth-first search backwards along the connections, so it is exact
 * rather than a guess at which way home is - and a greedy "head towards the
 * station" rule would corner itself on a one-way ring anyway.
 *
 * Infinity for a lane with no route home at all.
 */
function hopsToLane(network, target) {
  const lanes = network.lanes
  const hops = new Array(lanes.length).fill(Infinity)

  // Which lanes lead INTO each lane
  const into = lanes.map(() => [])
  lanes.forEach((lane, i) => {
    for (const next of lane.next) into[next].push(i)
  })

  hops[target] = 0
  const queue = [target]

  while (queue.length) {
    const at = queue.shift()
    for (const from of into[at]) {
      if (hops[from] !== Infinity) continue
      hops[from] = hops[at] + 1
      queue.push(from)
    }
  }

  return hops
}

/**
 * Is an oriented rectangle clear of the coast and of every road?
 *
 * Sampled around the outline rather than tested corner-only: a road can pass
 * through the middle of a long edge without coming near either corner, which
 * is exactly how a building ends up with a street through its lobby.
 */
function rectangleIsClear(island, roads, x, z, heading, width, depth, margin) {
  const fx = Math.sin(heading)
  const fz = Math.cos(heading)
  const sx = -fz
  const sz = fx

  for (let u = -1; u <= 1; u += 0.25) {
    for (let v = -1; v <= 1; v += 0.25) {
      // Only the outline needs testing, not the interior
      if (Math.abs(u) < 1 && Math.abs(v) < 1) continue

      const px = x + sx * (u * width / 2) + fx * (v * depth / 2)
      const pz = z + sz * (u * width / 2) + fz * (v * depth / 2)

      if (inlandDistance(island, px - island.x, pz - island.z) < 2) return false
      if (distanceToNearestRoad(roads, px - island.x, pz - island.z) < margin) {
        return false
      }
    }
  }

  return true
}

/**
 * Where each vehicle parks, and the point on the apron it drives to first.
 *
 * Two points, not one: a vehicle turns off the road onto the apron, then goes
 * straight back into its bay. Coming out it reverses the same way. That is
 * what keeps a fire engine square to its garage door instead of swinging
 * through the frame, and it means no pathfinding is involved at all.
 */
function bayPositions(on, sx, sz, lane, spec) {
  const fx = Math.sin(on.heading)
  const fz = Math.cos(on.heading)
  const bays = []

  const apronOut = lane.width / 4 + PAVEMENT_WIDTH + 3.5
  const bayOut = STATION_SETBACK - (spec.garage ? 1 : 3)

  for (let i = 0; i < spec.bayCount; i++) {
    const across = (i - (spec.bayCount - 1) / 2) * spec.bayWidth

    bays.push({
      // On the apron, straight out from the bay - the turning-in point
      approach: {
        x: on.x - sx * apronOut + fx * across,
        z: on.z - sz * apronOut + fz * across
      },
      // In the bay itself
      x: on.x - sx * bayOut + fx * across,
      z: on.z - sz * bayOut + fz * across,
      // Nose towards the building, so it drives in forwards and backs out
      heading: Math.atan2(-sx, -sz),
      index: i
    })
  }

  return bays
}

/**
 * Where the buses stop.
 *
 * On the ring and the streets only - a bus stop on a bridge or halfway out a
 * pier serves nobody. Spaced out along each lane, and never within a stop's
 * length of the lane's end, so a stopped bus is never sitting in a junction.
 */
export function getBusStops(network = getLaneNetwork()) {
  const stops = []

  network.lanes.forEach((lane, index) => {
    if (lane.kind !== 'ring' && lane.kind !== 'road') return
    if (lane.length < BUS_STOP_SPACING * 0.6) return

    const count = Math.max(1, Math.floor(lane.length / BUS_STOP_SPACING))
    for (let i = 1; i <= count; i++) {
      const at = (lane.length * i) / (count + 1)
      if (at < BUS_STOP_CLEARANCE || lane.length - at < BUS_STOP_CLEARANCE) continue

      const point = pointAlong(lane, at)
      stops.push({
        lane: index, at,
        x: point.x, z: point.z, heading: point.heading,
        island: lane.island,
        // How far the kerb is from HERE, not from the road's centre line. A
        // lane sits a quarter of the road's width off centre, so the kerb is
        // another quarter plus a bit away - and it's a different distance on a
        // 5.5-unit street and a 7-unit ring. The shelter is placed from this.
        kerb: lane.width / 4 + PAVEMENT_WIDTH
      })
      lane.stops.push({ at, index: stops.length - 1 })
    }
  })

  return stops
}

/**
 * Put vehicles on the road.
 *
 * Spread across the lanes rather than piled onto the first few, and never
 * two in the same place - a car that starts inside another one is a collision
 * you can't drive out of.
 */
export function makeTraffic(network, fleet = TRAFFIC_FLEET, stops = null,
                            stations = null) {
  const vehicles = []
  const lanes = network.lanes
  if (!lanes.length) return vehicles

  // A bay of its own for every service vehicle that can have one. Handed out
  // round-robin so the stations fill evenly rather than the first one taking
  // everything.
  // Named `spareBays`, not `free`. `spawn` below already has a local `free`
  // for the lanes it hasn't used yet, and the inner one shadowed this - so
  // every vehicle looked up its bay in a list of lane indices, found nothing,
  // and not one of fifty-two got a home.
  const spareBays = {}
  for (const station of stations || []) {
    const kind = station.vehicle
    spareBays[kind] = spareBays[kind] || []
    for (const bay of station.bays) spareBays[kind].push({ station, bay })
  }

  let seed = 424242
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  // Buses only run where there are stops to call at
  const busLanes = lanes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.stops.length)
    .map(({ i }) => i)

  const streetLanes = lanes
    .map((l, i) => ({ l, i }))
    .filter(({ l }) => l.length > TRAFFIC_HEADWAY * 3)
    .map(({ i }) => i)

  if (!streetLanes.length) return vehicles

  // One vehicle per lane while there are lanes to spare.
  //
  // Picking freely put several on the same short lane, and a knot like that
  // never came undone: measured over five minutes, the same fleet size flowed
  // three times better or worse depending purely on where it started. Spread
  // out, the numbers stopped depending on luck.
  const used = new Set()

  const spawn = (kind) => {
    const pool = kind === 'bus' ? (busLanes.length ? busLanes : streetLanes) : streetLanes
    const free = pool.filter((i) => !used.has(i))
    const choose = free.length ? free : pool

    // Somewhere with room. Ten tries, then give up on this one rather than
    // force it in on top of something.
    for (let attempt = 0; attempt < 10; attempt++) {
      const laneIndex = choose[Math.floor(rand() * choose.length)]
      const lane = lanes[laneIndex]
      const at = TRAFFIC_HEADWAY + rand() * (lane.length - TRAFFIC_HEADWAY * 2)

      const crowded = vehicles.some(v =>
        v.lane === laneIndex && Math.abs(v.at - at) < TRAFFIC_HEADWAY * 3)
      if (crowded) continue

      used.add(laneIndex)

      const home = (spareBays[kind] && spareBays[kind].length)
        ? spareBays[kind].shift()
        : null

      vehicles.push({
        kind,
        home,
        // Staggered, so they don't all head for the station together
        patrol: STATION_PATROL * (0.4 + rand()),
        parked: 0,
        lane: laneIndex,
        at,
        speed: 0,
        cruise: TRAFFIC_SPEEDS[kind] * (0.9 + rand() * 0.2),
        length: TRAFFIC_LENGTHS[kind],
        wide: TRAFFIC_WIDTHS[kind],
        dwell: 0,
        nextStop: -1,
        // Indicators: -1 left, 0 off, +1 right, and how long the lamp has
        // left to run. Given a number here rather than left undefined, so
        // nothing downstream has to guard against a vehicle that has not yet
        // turned a corner.
        signal: 0,
        signalFor: 0,
        // A settled heading, so the first frame doesn't snap it round
        heading: pointAlong(lane, at).heading,
        siren: kind === 'police' || kind === 'ambulance' || kind === 'fire',
        rand
      })
      return
    }
  }

  for (const [kind, count] of Object.entries(fleet)) {
    for (let i = 0; i < count; i++) spawn(kind)
  }

  return vehicles
}

/**
 * Move the traffic on by `delta` seconds.
 *
 * A vehicle's speed is whatever the most restrictive of these allows:
 *
 *   - its own cruising speed
 *   - the back of the vehicle in front, on this lane or the next one
 *   - a red or amber light at the end of this lane
 *   - anything already in the junction it is about to enter
 *   - the player's car, if that's what's in front
 *   - a bus stop it hasn't called at yet
 *
 * `player` is optional: pass `{ x, z }` and the traffic will treat it as
 * something to avoid, which is what stops a bus shunting you down the road
 * when you pull out in front of it.
 */
export function stepTraffic(network, vehicles, delta, elapsed, player = null) {
  const lanes = network.lanes
  if (!lanes.length) return vehicles

  // Who is on each lane, in order. Rebuilt每 step because they move; with a
  // few dozen vehicles that costs nothing and cannot go stale.
  const byLane = new Map()
  for (const v of vehicles) {
    if (!byLane.has(v.lane)) byLane.set(v.lane, [])
    byLane.get(v.lane).push(v)
  }
  for (const list of byLane.values()) list.sort((a, b) => a.at - b.at)

  // Who is being held at a red light. Worked out before anything else,
  // because it decides who may claim a junction.
  const heldAtRed = new Set()
  for (const v of vehicles) {
    const lane = lanes[v.lane]
    if (!lane.signal) continue

    const toEnd = lane.length - v.at
    if (toEnd > TRAFFIC_STOP_SIGHT) continue

    // Amber counts as red unless the vehicle is nearly on the line already,
    // in which case it carries on rather than stopping in the box.
    //
    // A "can it actually stop from this speed" rule was tried here instead
    // and was worse in both directions: a car standing AT the line has no
    // braking distance and no distance to the line, so it read itself as
    // committed and drove through the red, and once the speed of the thing
    // was taken into account it released cars into occupied junctions.
    // Vehicles brake hard enough that the simple rule is sufficient.
    const state = signalState(lane.signal, lane.signalGroup, elapsed)
    if (state === 'red' || (state === 'amber' && toEnd > 8)) heldAtRed.add(v)
  }

  // Where each junction is claimed, so an unsignalled one gets some
  // give-and-take rather than a pile-up.
  //
  // A vehicle waiting at a red does NOT get to claim the junction it is
  // waiting for. That was a proper deadlock: whoever was nearest owned the
  // node, a car stopped four units short of it on a red arm was always the
  // nearest, and so it held the junction shut against the arm that had the
  // green. Cars sat facing a green light for minutes. The rule is now that
  // you can only claim a junction you are actually free to enter.
  // A standing vehicle cannot claim one either. Excluding only the ones held
  // at a red was tried, on the reasoning that a stopped car should still keep
  // other arms out - and it put the median distance covered back down to 288
  // from 1283, because a car stopped for ANY reason then held the junction
  // shut. Only something actually moving into a junction gets to own it; two
  // stopped vehicles inside one are dealt with afterwards, by the unjam below.
  const busyNodes = new Map()
  for (const v of vehicles) {
    if (heldAtRed.has(v) || v.speed < 0.4) continue
    const lane = lanes[v.lane]
    const toGo = lane.length - v.at
    if (toGo < JUNCTION_GUARD && lane.toNode !== null) {
      const claim = busyNodes.get(lane.toNode)
      // Whoever is closest to the junction owns it
      if (!claim || toGo < claim.toGo) busyNodes.set(lane.toNode, { v, toGo })
    }
  }

  // Everyone's position at the START of the step, so each vehicle is judged
  // against the same picture. Evaluating against positions that have already
  // been updated gives whoever happens to be first in the list an advantage,
  // and makes the result depend on array order.
  const snapshot = vehicles.map(v => ({ v, ...trafficPosition(network, v) }))
  const indexOf = new Map(vehicles.map((v, i) => [v, i]))

  // Where everyone was, so anything that ends up overlapping can be put back
  // `sidestep` belongs in here too. Rolling back the position but keeping the
  // swerve left a vehicle parked inside the one it had just swerved into -
  // 7,530 overlapping frames from one missing field.
  const was = vehicles.map(v => ({ lane: v.lane, at: v.at, sidestep: v.sidestep || 0 }))

  for (const v of vehicles) {
    const lane = lanes[v.lane]

    // A vehicle in or entering its station is off the road network entirely -
    // it is following a two-point path of its own and nothing else can be in
    // the way, because a bay belongs to one vehicle.
    if (v.parking) {
      stepParking(v, delta)
      continue
    }

    if (v.dwell > 0) {
      v.dwell -= delta
      v.speed = 0
      continue
    }

    // Time to go home? Only from the lane the station opens onto, and only
    // near the point it opens at - which is what makes the turn-in a straight
    // line off the carriageway rather than a piece of pathfinding.
    if (v.home) {
      v.patrol -= delta
      if (v.patrol <= 0 && v.lane === v.home.station.lane) {
        const gap = v.home.station.at - v.at

        // Slow on the run-in. A vehicle at full speed covers half the window
        // in a frame, and one it overshoots has to go all the way round the
        // network again - which is where the eight-minute trips home came
        // from. A shade past the entrance still counts as arrived.
        if (gap > -2 && gap < 8) {
          v.parking = { phase: 'in', progress: 0 }
          v.speed = 0
          continue
        }
        if (gap > 0 && gap < 18) v.approach = Math.min(v.approach ?? 99, 5)
      }
    }

    // How long it has been standing still, which the patience valve reads
    v.stopped = v.speed < 0.3 ? (v.stopped || 0) + delta : 0

    let limit = v.cruise
    // Why it is going as slowly as it is. Costs a string assignment and has
    // already paid for itself twice: a system this stateful is very hard to
    // reason about from the outside, and a stalled car looks identical
    // whatever is stalling it.
    v.why = 'cruise'
    const hold = (speed, reason) => {
      if (speed < limit) { limit = speed; v.why = reason }
    }

    // Set above when a service vehicle is nearly at its own station door
    if (v.approach !== undefined) {
      hold(v.approach, 'turning in')
      v.approach = undefined
    }
    const toEnd = lane.length - v.at
    const mineAt = snapshot[indexOf.get(v)]

    // The vehicle in front, on this lane
    const here = byLane.get(v.lane) || []
    const mine = here.indexOf(v)
    v.waitingOn = null
    if (mine >= 0 && mine < here.length - 1) {
      const ahead = here[mine + 1]
      hold(gapSpeed(ahead.at - v.at - (ahead.length + v.length) / 2, v), 'queue')
      // Who it is waiting for, so the patience valve can tell a queue at a red
      // light from a genuine knot. See lawfulWait().
      if (v.why === 'queue') v.waitingOn = ahead
    }

    // And on the lane it is about to join, so cars don't materialise into
    // the back of a queue as they turn a corner
    //
    // Only vehicles genuinely sitting in the entrance count. Anything
    // further along an onward lane is not in the way, and treating it as
    // though it were caused a deadlock that took 288 seconds out of every
    // 300 on the short ring pieces: two cars on adjacent 12-unit lanes each
    // sat "at the start of the other's onward lane" and both waited for
    // ever. The patience valve is here too, for the same reason.
    // Don't block the box.
    //
    // A vehicle still BEHIND its stop line waits properly - a hard stop, no
    // creep - if the road beyond the junction is occupied. Once past the line
    // it is committed and keeps creeping until it is clear.
    //
    // This is the whole of the gridlock fix. With a creep floor applied
    // regardless, cars nosed into an intersection they couldn't clear, caught
    // the red there, and sat across the path of the traffic that then had a
    // green. Chains of three and four vehicles stayed put for 85 seconds and
    // longer, which is exactly what Mike described.
    const committed = lane.stopLine === undefined || noseGap(lane, v) <= 0
    const toStopLine = noseGap(lane, v)

    if (toEnd < TRAFFIC_STOP_SIGHT) {
      for (const nextIndex of lane.next) {
        for (const other of byLane.get(nextIndex) || []) {
          const entrance = (other.length + v.length) / 2 + 2
          if (other.at > entrance) continue

          const room = gapSpeed(toEnd + other.at - (other.length + v.length) / 2, v)
          hold(committed ? Math.max(TRAFFIC_CREEP, room)
                         : Math.min(room, stopSpeed(toStopLine - 0.4, v)),
               'queue ahead')
          if (v.why === 'queue ahead') v.waitingOn = other
        }
      }
    }

    // Lights. Amber counts as red for anything not already committed - a
    // vehicle inside the stopping distance carries on, which is what a
    // driver does.
    if (heldAtRed.has(v)) {
      // Stop line: clear of the junction patch, which is where a car waits.
      // stopSpeed, not gapSpeed - a car should come to rest AT the line, not
      // a headway short of it, or the queue reaches back round the block.
      // Snapped to a full stop once it's within a few centimetres, rather
      // than left to approach the line asymptotically. sqrt(2 a d) is still
      // over a unit a second when d is a hundredth of a unit, so a car
      // settling onto the line kept nudging across it - which reads as
      // jumping the light, and measured as 198 violations in five minutes
      // that were really one car twitching.
      // Aimed a little short of the line and snapped once it's close, so the
      // car comes to rest just behind it. Aiming AT the line meant every car
      // rolled a few centimetres over: sqrt(2 a d) is still 2 units a second
      // when d is a hundredth of a unit, and the step is taken before the
      // next speed is worked out.
      const gap = noseGap(lane, v) - 0.4
      hold(gap < 0.5 ? 0 : stopSpeed(gap, v), 'red light')
    }

    // Somebody else already in the junction ahead
    if (lane.toNode !== null && toEnd < JUNCTION_GUARD) {
      const claim = busyNodes.get(lane.toNode)
      // A hard stop, not a creep. This rule has a single unambiguous owner
      // per junction, so there is no symmetry to break and nothing to
      // deadlock: whoever holds the junction goes, everyone else waits. A
      // creep floor here let a second vehicle nose in anyway and jam against
      // the first, and the collision veto then held both of them there.
      if (claim && claim.v !== v) {
        hold(committed ? gapSpeed(toEnd - 4, v)
                       : Math.min(gapSpeed(toEnd - 4, v),
                                  stopSpeed(toStopLine - 0.4, v)),
             'junction busy')
      }
    }

    // And then the catch-all: anything at all in front of me, whatever lane
    // it happens to be on.
    //
    // Lane-following alone isn't enough, and the reason is in the road layout
    // rather than the traffic. A street is allowed to run alongside the ring
    // for up to 26 units, so two lanes can genuinely overlap in space while
    // being unrelated in the graph - and cars on them drove through each
    // other. Crossing traffic at an unsignalled junction is the same problem.
    //
    // Whoever is behind gives way. Only when BOTH have the other in front -
    // which happens for a few units either side of a crossing point, and is
    // a genuine imminent collision - is the tie broken by vehicle number, so
    // the lower-numbered one goes. That matters: an earlier version broke
    // every conflict by number, which meant a car with a low number would
    // cheerfully drive into the back of a stationary fire engine with a high
    // one.
    const myIndex = indexOf.get(v)

    for (let i = 0; i < snapshot.length; i++) {
      const other = snapshot[i]
      if (other.v === v || other.v.lane === v.lane) continue

      const gap = forwardGap(mineAt, other, v)
      if (gap === null) continue

      const mutual = forwardGap(other, mineAt, other.v) !== null
      if (mutual && myIndex < i) continue

      // A vehicle that has been standing still for a long time stops giving
      // way. The two-dimensional veto below still prevents it hitting
      // anything, so the worst this can do is make it nose forward - and it
      // means no rule added here can ever leave something stuck for good.
      if (v.stopped > TRAFFIC_PATIENCE) continue

      limit = Math.min(limit, gapSpeed(gap, v))
    }

    // The player
    if (player) {
      const ahead = aheadDistance(lane, v, player)
      if (ahead !== null) hold(gapSpeed(ahead - v.length / 2 - 2.5, v), 'player')
    }

    // A bus stop it hasn't called at.
    //
    // This uses stopSpeed, not gapSpeed. gapSpeed leaves a headway - it's
    // for following another vehicle - so a bus braked to a halt seven units
    // short of every stop and never reached one, which meant it never
    // triggered the dwell and never opened its doors.
    if (v.kind === 'bus') {
      for (const stop of lane.stops) {
        if (stop.index === v.nextStop) continue
        const gap = stop.at - v.at
        if (gap < -1 || gap > TRAFFIC_STOP_SIGHT) continue
        hold(stopSpeed(gap, v), 'bus stop')
        if (gap < 1.2) {
          v.dwell = BUS_DWELL
          v.nextStop = stop.index
          v.at = stop.at
          v.speed = 0
        }
      }
    }

    // Accelerate or brake towards the limit
    const target = Math.max(0, limit)
    if (target > v.speed) v.speed = Math.min(target, v.speed + TRAFFIC_ACCEL * delta)
    else v.speed = Math.max(target, v.speed - TRAFFIC_BRAKE * delta)

    // The last word: would this step put the vehicle inside another one?
    //
    // Everything above works in one dimension - distance along a lane - and
    // that is blind at the moment a vehicle changes lane, because it arrives
    // somewhere its old lane knew nothing about. A car turning out of a
    // junction landed on top of a stationary fire engine standing on a spur
    // that happens to overlap the ring. So the move is checked in two
    // dimensions before it is allowed.
    //
    // Where the step crosses a junction, EVERY onward lane is tried, in
    // preference order. Checking only the favourite froze eleven vehicles of
    // thirty-one: one exit was occupied, the vehicle vetoed its own move for
    // ever, and a queue built up behind it.
    let onward = null

    // The indicator runs down here; it is set at the crossing below.
    if (v.signalFor > 0) {
      v.signalFor -= delta
      if (v.signalFor <= 0) { v.signalFor = 0; v.signal = 0 }
    }

    if (v.speed > 0) {
      const step = v.speed * delta
      const crossing = v.at + step >= lane.length && lane.next.length > 0
      const options = crossing ? orderedNext(lanes, lane, v) : [null]

      // Straight ahead first, then a step to one side, then further out.
      //
      // A vehicle that cannot move forward tries to go ROUND. Without this,
      // two that jammed nose to nose both vetoed every move for ever and
      // everything behind them backed up. Pulling out is what a driver does
      // when the way ahead is blocked, and because every candidate still goes
      // through the collision veto, going round can never cause a crash.
      // Middle of the lane first, then out towards the KERB - never towards
      // the oncoming lane.
      //
      // Swerving either way let a car drift into the oncoming side and stop
      // there, where it blocked the traffic coming the other way AND was
      // blocked by it. Nine vehicles ended up in one such knot for 232 of the
      // 300 seconds. Positive sidestep is kerbward, the same direction the
      // lane is already offset, so a swerve can only ever use the shoulder.
      const swerves = (v.blockedFor || 0) > SWERVE_AFTER
        ? [0, v.sidestep || 0, 0.9, 1.6, 2.2]
        : [v.sidestep || 0, 0]

      let allowed = false

      for (const option of options) {
        for (const sidestep of swerves) {
          // Stay on the tarmac. Further off the lane than this and a car
          // climbs the pavement to get past.
          if (Math.abs(sidestep) > lane.width * 0.28) continue

          const where = whereAfter(lanes, lane, v, step, option, sidestep)
          if (blocked(where, v, snapshot)) continue

          onward = option
          v.sidestep = sidestep
          allowed = true
          break
        }
        if (allowed) break
      }

      if (!allowed) { v.speed = 0; v.why = 'blocked' }
      v.blockedFor = allowed ? 0 : (v.blockedFor || 0) + delta
    } else {
      v.blockedFor = (v.blockedFor || 0) + delta
    }

    // Waiting your turn is not being stuck. A queue at a long red built up
    // twenty-five seconds of "blocked" and the valve teleported the car at the
    // back of it - including service vehicles two seconds from their own
    // station door, which is why one ambulance in three never got home.
    if (lawfulWait(v)) v.blockedFor = 0

    // Been stuck far too long: leave, and come back somewhere clear.
    if (v.blockedFor > RESPAWN_AFTER || v.stopped > STUCK_LIMIT) {
      // Almost home already: turn in from where it is stood rather than be
      // sent across the map to find its way back, which is what stretched one
      // trip home to eight minutes. It is a short shuffle forward on the
      // apron, not a jump - hence the limit on how far short it can be.
      if (v.home && v.patrol <= 0 && v.lane === v.home.station.lane) {
        const gap = v.home.station.at - v.at
        if (gap > -2 && gap < 25) {
          v.parking = { phase: 'in', progress: 0 }
          v.blockedFor = 0
          v.stopped = 0
          v.speed = 0
          continue
        }
      }

      if (relocate(network, v, snapshot, byLane)) {
        v.blockedFor = 0
        v.stopped = 0
        v.sidestep = 0
        v.speed = 0
        v.why = 'relocated'
        v.relocations = (v.relocations || 0) + 1
        continue
      }

      // Nowhere clear to go right now. Back off and ask again in a couple of
      // seconds: retrying every frame means scanning every lane against every
      // vehicle thirty times a second, which took the simulation from seconds
      // to minutes.
      v.blockedFor = Math.min(v.blockedFor, RESPAWN_AFTER - 5)
      v.stopped = Math.min(v.stopped, STUCK_LIMIT - 5)
    }

    // Always drifting back to the middle, blocked or not. Only recovering
    // while unblocked meant a car that swerved and then stopped kept its
    // offset for ever, which is how it came to camp on the wrong side.
    if (v.sidestep) {
      const back = SIDESTEP_RECOVER * delta
      v.sidestep = Math.abs(v.sidestep) <= back
        ? 0
        : v.sidestep - Math.sign(v.sidestep) * back
    }

    v.at += v.speed * delta

    // Onto the next lane
    if (v.at >= lane.length) {
      const over = v.at - lane.length
      if (onward === null) {
        v.at = lane.length
        v.speed = 0
      } else {
        // The indicator, set from the turn the vehicle is ACTUALLY taking.
        //
        // It would be better to signal before the junction, and that was
        // built first: the onward lane was chosen a couple of seconds early
        // and remembered, so the same function made the same choice with the
        // same randomness, only sooner. It read correctly and it cost
        // nothing - except that moving the `v.rand()` draws re-shuffled every
        // vehicle's route, and one car in the re-shuffled 94-vehicle run
        // crossed a red light. Measured over four durations the old code
        // never did and the new one did twice. A red light is one of only
        // three things allowed to stop a vehicle here, so an indicator is not
        // worth paying for with one.
        //
        // Signalling from the committed turn instead costs the simulation
        // exactly nothing - the traffic numbers are bit-identical to before
        // this existed - and looks almost the same, because the heading eases
        // round at 2.6 rad/s and the car is still visibly turning for most of
        // the time the lamp is lit.
        const turn = turnDirection(
          pointAlong(lane, lane.length).heading,
          pointAlong(lanes[onward], 0).heading)
        if (turn) { v.signal = turn; v.signalFor = SIGNAL_HOLD }

        v.lane = onward
        v.at = Math.min(over, lanes[onward].length)
        v.nextStop = -1
      }
    }

  }

  // Everything above decided where to go from where everyone was at the START
  // of the step, which is what keeps the traffic flowing - judged against
  // positions that have already advanced, vehicles are far more timid and the
  // whole city slows to a crawl. The cost is that two of them can move into
  // the same empty space, because it was empty when they both looked.
  //
  // So it's resolved afterwards instead: any pair that ended up overlapping,
  // the later-numbered one goes back where it was. Cheap, keeps the optimism,
  // and makes an overlap impossible rather than unlikely.
  resolveOverlaps(network, vehicles, was)

  return vehicles
}

/** Put back anything that ended the step inside something else. */
function resolveOverlaps(network, vehicles, was) {
  const rewind = (i) => {
    vehicles[i].lane = was[i].lane
    vehicles[i].at = was[i].at
    vehicles[i].sidestep = was[i].sidestep
    vehicles[i].speed = 0
    vehicles[i].why = 'blocked'
  }

  // Three passes. The first sends the later vehicle of each pair back where it
  // was; the last resort sends BOTH back and straightens them up.
  //
  // One pass isn't enough because everyone decided from the same start-of-step
  // picture: two vehicles can move into the same gap, and the one sent back may
  // find its old place now taken by the one that stayed. Where that happens,
  // neither move was safe and neither is kept.
  for (let pass = 0; pass < 3; pass++) {
    const boxes = vehicles.map(v => vehicleBox(trafficPosition(network, v), v))
    let clashes = 0

    for (let a = 0; a < vehicles.length; a++) {
      for (let b = a + 1; b < vehicles.length; b++) {
        if (!boxesOverlap(boxes[a], boxes[b])) continue
        clashes++

        rewind(b)
        boxes[b] = vehicleBox(trafficPosition(network, vehicles[b]), vehicles[b])
        if (!boxesOverlap(boxes[a], boxes[b])) continue

        // Where it was is occupied too, so going back there is no escape.
        // Straighten up and back off along its own lane until it is clear.
        //
        // This is the guarantee that a lock cannot become permanent. Without
        // it, one pair that interpenetrated at a junction stayed welded
        // together for the rest of the run - 7,530 frames of the 9,000 - and
        // nothing behind them moved either.
        vehicles[b].sidestep = 0

        // Backwards first, then forwards. Backwards alone was not enough: a
        // vehicle a metre PAST a junction node sits at at≈0 on its new lane
        // and has nothing to reverse into, so it stayed welded in place for
        // the rest of the run. Where two lanes converge, one of the two
        // directions always separates them.
        let freed = false
        const lane = network.lanes[was[b].lane]

        for (let shift = 0.4; shift <= UNJAM_REVERSE && !freed; shift += 0.4) {
          for (const direction of [-1, 1]) {
            const at = was[b].at + direction * shift
            if (at < 0 || at > lane.length) continue
            vehicles[b].at = at
            boxes[b] = vehicleBox(trafficPosition(network, vehicles[b]), vehicles[b])
            if (!boxesOverlap(boxes[a], boxes[b])) { freed = true; break }
          }
        }
      }
    }

    if (!clashes) break
  }
}

/**
 * The onward lanes from a junction, best first.
 *
 * A gentle preference for carrying straight on, so traffic doesn't spend its
 * whole life turning corners, plus a little randomness so it doesn't all
 * follow the same route round the island.
 */
function orderedNext(lanes, lane, v) {
  const dir = pointAlong(lane, lane.length).heading

  // A service vehicle whose shift is over heads for its station, choosing the
  // turn that shortens the route home. Everything else wanders.
  const goingHome = v.home && v.patrol <= 0 ? v.home.station.toHome : null

  const options = lane.next
    .map((index) => {
      const turn = Math.abs(angleDelta(pointAlong(lanes[index], 0).heading, dir))
      const straightish = -turn + v.rand() * 1.6
      return {
        index,
        score: goingHome
          ? -(goingHome[index] ?? 999) * 10 + v.rand()
          : straightish
      }
    })
    .sort((a, b) => b.score - a.score)
    .map((o) => o.index)

  // Long-pinned: turning round becomes an option, last. Every onward lane
  // being occupied is the one situation the give-way rules can't talk their
  // way out of, and the alternative is a vehicle parked at a junction for the
  // rest of the session.
  if (v.stopped > TRAFFIC_PATIENCE && lane.back >= 0 && !options.includes(lane.back)) {
    options.push(lane.back)
  }

  return options
}

/**
 * Put a hopelessly stuck vehicle somewhere else on the network.
 *
 * Reads as a car having driven off and another arriving. Only ever called
 * after RESPAWN_AFTER seconds of being completely unable to move.
 */
/**
 * Is this vehicle stopped for a reason that will clear itself?
 *
 * A red light will go green; a bus at a stop will pull away; a fire engine
 * turning into its garage is nearly there. Anything queued behind one of those
 * is waiting lawfully too, so the chain is followed - up to a dozen cars, and
 * with a guard against the ring of vehicles that are all waiting on each
 * other, which is exactly the knot the valve exists to break.
 */
function lawfulWait(v) {
  const seen = new Set()
  let at = v

  for (let hop = 0; hop < 12 && at; hop++) {
    if (seen.has(at)) return false          // a ring: a genuine deadlock
    seen.add(at)

    if (at.why === 'red light' || at.why === 'turning in') return true
    if (at.parking || at.dwell > 0) return true

    at = at.waitingOn
  }

  return false
}

function relocate(network, v, snapshot, byLane) {
  const lanes = network.lanes

  // Where everyone is NOW, not where they were at the start of the step.
  //
  // Everything else in the simulation judges against the start-of-step
  // picture on purpose - it keeps the traffic flowing - and pays for it with
  // resolveOverlaps() afterwards. Relocation can't be paid for that way: the
  // vehicle's own "where it was" is the jam it is being rescued from, so
  // sending it back there is no escape. Cheap enough, at twenty-odd
  // relocations in five minutes.
  const live = snapshot.map(s => ({ v: s.v, ...trafficPosition(network, s.v) }))

  for (let tries = 0; tries < 30; tries++) {
    const index = Math.floor(v.rand() * lanes.length)
    const lane = lanes[index]
    if (lane.length < v.length * 3) continue
    if (v.kind === 'bus' && !lane.stops.length) continue

    const at = v.length + v.rand() * (lane.length - v.length * 2)

    // Clear road AHEAD, not just a gap big enough to stand in. Dropped into
    // the back of a queue a vehicle stops again immediately, trips the valve
    // again thirty-five seconds later, and stands still for as long as if it
    // had never been moved at all.
    //
    // Asked BEFORE the collision test, because this reads the handful of
    // vehicles on one lane and that one reads all fifty-two.
    let queueAhead = false
    for (const other of (byLane && byLane.get(index)) || []) {
      if (other === v) continue
      const gap = other.at - at
      if (gap > -v.length && gap < RELOCATE_CLEAR_AHEAD) { queueAhead = true; break }
    }
    if (queueAhead) continue

    const where = pointAlong(lane, at)
    if (blocked(where, v, live)) continue

    v.lane = index
    v.at = at
    v.nextStop = -1
    return true
  }

  return false
}

/** Would a vehicle at `where` be inside any of the others? */
function blocked(where, v, snapshot) {
  const box = vehicleBox(where, v)
  for (let i = 0; i < snapshot.length; i++) {
    if (snapshot[i].v === v) continue
    if (boxesOverlap(box, vehicleBox(snapshot[i], snapshot[i].v))) return true
  }
  return false
}

/**
 * How fast you may go with `gap` units of road in front of you before the
 * back of something else. Leaves a headway, so vehicles queue rather than
 * touch.
 */
/**
 * How far a vehicle's NOSE is from its lane's stop line.
 *
 * `at` is the middle of the vehicle. Everything about stopping has to work in
 * terms of the front of it, or a long vehicle stops with half its length in the
 * junction - 5.5 units for a bus, which is most of the way across. Every kind
 * was poking in; the bus was simply the one you could see.
 */
function noseGap(lane, v) {
  return (lane.stopLine ?? lane.length) - v.at - v.length / 2
}

function gapSpeed(gap, v) {
  return stopSpeed(gap - TRAFFIC_HEADWAY, v)
}

/**
 * How fast you may go if you have to be stopped in `gap` units - a stop
 * line, or a bus stop you actually want to arrive at.
 */
function stopSpeed(gap, v) {
  if (gap <= 0) return 0
  return Math.min(v.cruise, Math.sqrt(2 * TRAFFIC_BRAKE * gap))
}

/**
 * Where a vehicle would be after moving `step` further, following the same
 * lane choice it will actually make.
 *
 * Only used to look one step ahead for a collision, so it takes the first
 * onward lane rather than the one the vehicle will eventually pick - close
 * enough at a tenth of a second's travel, and it means this can't disagree
 * with the real choice in a way that matters.
 */
function whereAfter(lanes, lane, v, step, onward, sidestep = 0) {
  const at = v.at + step
  const on = (at <= lane.length || onward === null)
    ? pointAlong(lane, Math.min(at, lane.length))
    : pointAlong(lanes[onward], Math.min(at - lane.length, lanes[onward].length))

  if (!sidestep) return on

  return {
    x: on.x - Math.cos(on.heading) * sidestep,
    z: on.z + Math.sin(on.heading) * sidestep,
    heading: on.heading
  }
}

/**
 * How far in front of `me` the vehicle `other` is, or null if it isn't in
 * the way at all.
 *
 * Measured in my own frame: forward along my heading, sideways across it.
 * Anything beside me rather than in front of me is not an obstacle - which
 * is the whole point, because a car passing the other way is `width / 2`
 * away by design and must not be treated as something to brake for.
 */
function forwardGap(me, other, v) {
  const dx = other.x - me.x
  const dz = other.z - me.z

  const fx = Math.sin(me.heading)
  const fz = Math.cos(me.heading)

  const forward = dx * fx + dz * fz
  if (forward <= 0 || forward > TRAFFIC_STOP_SIGHT) return null

  const sideways = Math.abs(dx * fz - dz * fx)
  if (sideways > (v.wide + other.v.wide) / 2 + 0.5) return null

  // To the back of it, not its middle
  return forward - (v.length + other.v.length) / 2
}

/** Shortest signed difference between two headings. */
function angleDelta(a, b) {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * How far ahead of a vehicle a world point is, along its lane - or null if
 * it's behind, or off to one side and so not in the way.
 */
function aheadDistance(lane, v, point) {
  const along = distanceAlongPath(lane.points, point.x, point.z)
  if (along === null) return null

  const on = pointAlong(lane, along)
  const sideways = Math.hypot(on.x - point.x, on.z - point.z)
  if (sideways > lane.width * 0.6) return null

  const gap = along - v.at
  return gap > 0 && gap < TRAFFIC_STOP_SIGHT ? gap : null
}

/**
 * Drive a vehicle into its bay, wait, and drive it out again.
 *
 * Three legs, each a straight line: off the carriageway onto the apron,
 * straight back into the bay, then the reverse. Straight lines are the whole
 * point - a fire engine that swung into its garage would clip the door frame,
 * and squaring it up on the apron first means it goes through the opening
 * dead straight. It is also why no pathfinding is involved: the two points
 * come from the layout.
 */
function stepParking(v, delta) {
  const p = v.parking
  const rate = PARKING_SPEED * delta

  if (p.phase === 'in') {
    p.progress = Math.min(1, p.progress + rate / PARKING_LEG)
    v.speed = PARKING_SPEED
    if (p.progress >= 1) {
      p.phase = 'waiting'
      p.wait = STATION_DWELL * (0.6 + v.rand() * 0.8)
      v.speed = 0
    }
    return
  }

  if (p.phase === 'waiting') {
    v.speed = 0
    p.wait -= delta
    if (p.wait <= 0) p.phase = 'out'
    return
  }

  // Backing out
  p.progress = Math.max(0, p.progress - rate / PARKING_LEG)
  v.speed = PARKING_SPEED
  if (p.progress <= 0) {
    v.parking = null
    v.patrol = STATION_PATROL * (0.7 + v.rand() * 0.6)
    v.speed = 0
  }
}

/** Where a vehicle is now, and which way it's pointing. */
export function trafficPosition(network, v) {
  // In its station: on its own little path, not on the road at all
  if (v.parking) {
    const bay = v.home.bay
    const t = v.parking.progress
    return {
      x: bay.approach.x + (bay.x - bay.approach.x) * t,
      z: bay.approach.z + (bay.z - bay.approach.z) * t,
      heading: bay.heading,
      stopped: v.speed < 0.2,
      parking: true
    }
  }

  const lane = network.lanes[v.lane]
  const at = pointAlong(lane, v.at)

  // Including however far it has pulled out to get round something. This has
  // to live here rather than in the renderer: the collision veto asks for a
  // vehicle's position, and if that answer left the swerve out it would be
  // checking a place the vehicle isn't.
  const sidestep = v.sidestep || 0
  if (sidestep) {
    at.x -= Math.cos(at.heading) * sidestep
    at.z += Math.sin(at.heading) * sidestep
  }

  return { ...at, stopped: v.speed < 0.2 }
}

/**
 * A vehicle as an oriented rectangle.
 *
 * Exported because the test needs the same shape the simulation uses. Asking
 * "are their centres closer than a car length" is the wrong question - two
 * cars passing in opposite lanes are `width / 2` apart by design, and a test
 * built on centre distance reported every one of them as a crash.
 */
export function vehicleBox(pos, v) {
  return {
    x: pos.x,
    z: pos.z,
    // Along the vehicle, and across it
    fx: Math.sin(pos.heading), fz: Math.cos(pos.heading),
    halfLength: v.length / 2,
    halfWidth: v.wide / 2
  }
}

/** Do two oriented rectangles overlap? Separating axis, both ways round. */
export function boxesOverlap(a, b) {
  const oneWay = (p, q) => {
    const axes = [
      { x: p.fx, z: p.fz, half: p.halfLength },
      { x: p.fz, z: -p.fx, half: p.halfWidth }
    ]
    for (const axis of axes) {
      const centres = Math.abs((q.x - p.x) * axis.x + (q.z - p.z) * axis.z)
      const spread =
        Math.abs(q.fx * axis.x + q.fz * axis.z) * q.halfLength +
        Math.abs(q.fz * axis.x - q.fx * axis.z) * q.halfWidth
      if (centres > axis.half + spread) return false
    }
    return true
  }
  return oneWay(a, b) && oneWay(b, a)
}

// ---------------------------------------------------------------------------
// Ports
// ---------------------------------------------------------------------------

/**
 * Where an island's port goes, and everything about it.
 *
 * The site is chosen by sweeping the compass and scoring each direction,
 * rather than written down, for the same reason as everything else here: a
 * position in the data is wrong the moment you drag the island.
 *
 * What a port wants, in order of how much it matters:
 *
 *  - **Open water in front of it.** A quay facing the island next door has
 *    ships sailing into a beach. This is the heaviest term by far.
 *  - **Clear of the bridge landings.** The arrival at an island is the view
 *    every visitor gets, and a container crane in the middle of it isn't it.
 *  - **Clear of where the monorail crosses the coast**, so the beam doesn't
 *    pass over the cranes.
 *  - **A shore that isn't a cliff-edge sliver**, i.e. somewhere the pier
 *    root has land under it.
 *
 * Returns null for `port: false`, or for an island too small to hold one.
 */
export function getPort(island) {
  if (!island || island.port === false) return null

  const reach = islandReach(island)
  if (reach < 24) return null

  const big = reach >= PORT_BIG_REACH
  const pierLength = big ? PIER_LENGTH_BIG : PIER_LENGTH_SMALL
  const pierWidth = big ? PIER_WIDTH_BIG : PIER_WIDTH_SMALL

  // Where the bridges come ashore, as directions
  const landings = getBridgeLandings(island)

  // Where the monorail crosses this island's coast, as directions. Cheap
  // enough: the route is derived once and cached by the caller in practice.
  const route = getMonorailRoute()
  const beamDirs = []
  if (route) {
    for (const p of route.points) {
      const lx = p.x - island.x
      const lz = p.z - island.z
      // Points near the shore line, either side
      const inland = inlandDistance(island, lx, lz)
      if (Math.abs(inland) < 12) {
        const len = Math.hypot(lx, lz)
        if (len > 1) beamDirs.push({ x: lx / len, z: lz / len })
      }
    }
  }

  const STEPS = 96
  let best = null

  for (let i = 0; i < STEPS; i++) {
    const angle = (i / STEPS) * Math.PI * 2
    const dirX = Math.sin(angle)
    const dirZ = Math.cos(angle)

    const shore = shoreDistance(island, dirX, dirZ)
    if (shore < reach * 0.45) continue          // a notch, not a frontage

    // How far a ship could sail straight out from here before it ran into
    // something. Walked step by step rather than worked out from island
    // centres and radii: the first version compared the bearing against
    // each island's bounding circle and decided it would "sail past", which
    // was true of almost everything, so every bearing scored the same and
    // the term did nothing at all. Hub ended up with a quay facing the
    // 36-unit gap between two islands.
    let openWater = PORT_MAX_FETCH
    for (let d = 4; d <= PORT_MAX_FETCH; d += 12) {
      const px = island.x + dirX * (shore + d)
      const pz = island.z + dirZ * (shore + d)
      if (islandAt(px, pz)) { openWater = d; break }
    }
    // In practice this reads as a filter rather than a ranking: on a map
    // this open, every surviving bearing has the full fetch, and the choice
    // then comes down to the bridge and the beam. That's the right order of
    // priority anyway - it just means the number below is doing less work
    // than it looks.
    if (openWater < pierLength + PORT_APPROACH) continue

    // How far this bearing is from the nearest bridge and from the beam
    let landingGap = Math.PI
    for (const l of landings) {
      landingGap = Math.min(landingGap, angleBetween(dirX, dirZ, l.dirX, l.dirZ))
    }
    let beamGap = Math.PI
    for (const b of beamDirs) {
      beamGap = Math.min(beamGap, angleBetween(dirX, dirZ, b.x, b.z))
    }

    // Scored in units, so the terms are comparable rather than a pile of
    // arbitrary weights: how much sea, plus how far the bridge and the beam
    // are round the coast at this radius.
    const score = openWater * 0.5
      + Math.min(landingGap * shore, 90)
      + Math.min(beamGap * shore, 60) * 0.8

    if (!best || score > best.score) {
      best = { angle, dirX, dirZ, shore, score, openWater, landingGap, beamGap }
    }
  }

  if (!best) return null

  // Island-local geometry. The pier runs from inside the beach out to sea.
  const rootDist = best.shore - PIER_ROOT_INSET
  const headDist = best.shore + pierLength
  const midDist = (rootDist + headDist) / 2

  const local = (d) => ({ x: best.dirX * d, z: best.dirZ * d })
  const root = local(rootDist)
  const head = local(headDist)

  // Berths: alongside the pier, facing along it. A big port works both
  // sides, a jetty only the one.
  const offset = big ? BERTH_OFFSET_BIG : BERTH_OFFSET_SMALL
  const acrossX = -best.dirZ
  const acrossZ = best.dirX
  const berthAt = (side, alongFrac) => {
    const d = rootDist + (headDist - rootDist) * alongFrac
    return {
      x: island.x + best.dirX * d + acrossX * offset * side,
      z: island.z + best.dirZ * d + acrossZ * offset * side,
      // Bow pointing INLAND, along the pier - which is the direction a ship
      // is already travelling when it arrives, because it comes in from the
      // approach point straight out to sea. Pointing it the other way would
      // have every ship spin 180 degrees the instant it tied up.
      //
      // Departure still turns it round, but that happens over a couple of
      // seconds at the rate World.js limits ships to, and reads as a vessel
      // swinging off its berth.
      heading: Math.atan2(-best.dirX, -best.dirZ),
      side
    }
  }

  const berths = big
    ? [berthAt(1, 0.62), berthAt(-1, 0.62)]
    : [berthAt(1, 0.66)]

  return {
    island,
    id: island.id,
    big,
    dirX: best.dirX,
    dirZ: best.dirZ,
    rotationY: Math.atan2(best.dirX, best.dirZ),
    shore: best.shore,
    openWater: best.openWater,
    // World-space
    root: { x: island.x + root.x, z: island.z + root.z },
    head: { x: island.x + head.x, z: island.z + head.z },
    mid: { x: island.x + best.dirX * midDist, z: island.z + best.dirZ * midDist },
    length: headDist - rootDist,
    width: pierWidth,
    berths,
    // Where a ship waits before turning in, straight out from the head
    approach: {
      x: island.x + best.dirX * (headDist + PORT_APPROACH),
      z: island.z + best.dirZ * (headDist + PORT_APPROACH)
    },
    // Island-local, for the road that runs out along it
    localRoot: root,
    localHead: head
  }
}

/** How far a world-space point is from the nearest road on an island. */
function roadClearance(island, roads, worldX, worldZ) {
  return distanceToNearestRoad(roads, worldX - island.x, worldZ - island.z)
}

/** The angle between two unit vectors, in radians. */
function angleBetween(ax, az, bx, bz) {
  return Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz)))
}

/** Every port in the world. */
export function getPorts() {
  return ISLANDS.map(getPort).filter(Boolean)
}

let airportCache = null

/**
 * The airport: a platform on piers out at sea, with a runway, a taxiway, a
 * terminal and its stands.
 *
 * **Derived, like everything else.** Nothing about it is written in the map
 * file: move an island and the airport re-sites itself, the same way the
 * monorail reroutes and the ports re-aim. What it wants, in order:
 *
 *  1. **Open water all round it**, measured against each island's real
 *     coastline rather than the circle round it. That distinction has caught
 *     this project out five times now - most recently the hub getting a quay
 *     facing a 36-unit gap - so the platform's own half-diagonal is checked,
 *     not its centre.
 *  2. **Out of the bridge corridors.** A bridge crossing is the view every
 *     visitor gets on the way to an island, and a runway across it isn't it.
 *  3. **Within reach of land**, or nothing could ever connect to it.
 *
 * The runway lies TANGENTIALLY - across the line out from the middle of the
 * world rather than along it. Pointing it outward would push one threshold
 * another hundred units out to sea and into the shipping lane ring, which is
 * derived from the map extent and would then have to grow to dodge it.
 */
export function getAirport() {
  if (airportCache) return airportCache

  // How much open water is under a point: its distance beyond the nearest
  // island's actual shore, in the direction that island sees it.
  const openWater = (x, z) => {
    let worst = Infinity
    for (const island of ISLANDS) {
      const dx = x - island.x
      const dz = z - island.z
      worst = Math.min(worst, Math.hypot(dx, dz) - shoreDistance(island, dx, dz))
    }
    return worst
  }

  const offBridges = (x, z) => {
    let worst = Infinity
    for (const def of BRIDGES) {
      const from = getIsland(def.from)
      const to = getIsland(def.to)
      if (!from || !to) continue
      const vx = to.x - from.x
      const vz = to.z - from.z
      const len2 = vx * vx + vz * vz || 1
      let u = ((x - from.x) * vx + (z - from.z) * vz) / len2
      u = Math.max(0, Math.min(1, u))
      worst = Math.min(worst,
        Math.hypot(x - (from.x + vx * u), z - (from.z + vz * u)))
    }
    return worst
  }

  // A bound generous enough that it can never reject a site the exact test
  // would have accepted: the platform's own half-diagonal PLUS how far its
  // centre sits from the point being scored, because the runway is on one
  // side of the platform and the terminal on the other.
  // The site IS the platform's centre, so this is simply its half-diagonal.
  // Adding the runway-to-platform offset on top - which was right back when
  // the site meant the runway - demanded 190 units of open water against a
  // 210-unit reachability limit, and the search found nowhere in the world to
  // put an airport at all.
  const { length, width } = airportFootprint()
  const bound = Math.hypot(length / 2, width / 2)

  let best = null
  const reach = getMapExtent() + AIRPORT_MAX_SPAN
  for (let x = -reach; x <= reach; x += 10) {
    for (let z = -reach; z <= reach; z += 10) {
      // Cheap rejection first, on the centre. Everything that survives is then
      // measured properly - the fast test is allowed to be approximate only
      // because it is never the one that decides.
      const water = openWater(x, z)
      if (water < bound + AIRPORT_CLEARANCE) continue
      if (water > AIRPORT_MAX_SPAN) continue             // unreachable
      if (offBridges(x, z) < bound + 25) continue

      // Now ask the geometry where it actually ends up. The site is not the
      // platform's centre and the platform is not the circle around it -
      // scoring the centre against a formula for the size left one corner 26
      // units off CONTACT where 30 were asked for.
      const laid = layOutAirport({ x, z }, Math.atan2(x, z) + Math.PI / 2)
      let worstWater = Infinity
      let worstBridge = Infinity
      let reachesOut = 0
      for (const corner of platformCorners(laid)) {
        worstWater = Math.min(worstWater, openWater(corner.x, corner.z))
        worstBridge = Math.min(worstBridge, offBridges(corner.x, corner.z))
        reachesOut = Math.max(reachesOut, Math.hypot(corner.x, corner.z))
      }
      if (worstWater < AIRPORT_CLEARANCE || worstBridge < 25) continue

      // And it has to stay inside the shipping lane ring. The ring is a circle
      // of waypoints at the map extent plus a margin, and every leg between two
      // adjacent waypoints is safe BY CONSTRUCTION because there is nothing out
      // there - a platform sitting on it would quietly break that guarantee and
      // no test would catch it, because the sea graph never asks about
      // anything but islands. Keeping the airport inside the ring also keeps it
      // part of the world rather than a thing beyond the horizon.
      if (reachesOut > innermostShippingLane() - AIRPORT_CLEARANCE) continue

      // Deep water and clear of the crossings, without wandering off to the
      // horizon: the last term is what keeps it part of the world.
      const score = Math.min(worstWater, 140) + Math.min(worstBridge, 200) * 0.5 -
                    Math.hypot(x, z) * 0.15
      if (!best || score > best.score) {
        best = { x, z, water: worstWater, bridges: worstBridge, score }
      }
    }
  }

  if (!best) return (airportCache = null)

  // Tangential: across the line out from the middle of the world.
  airportCache = layOutAirport(best, Math.atan2(best.x, best.z) + Math.PI / 2)
  return airportCache
}

/**
 * How big the platform is, and how far its centre sits from the runway.
 *
 * One implementation, so the search and the layout cannot disagree about the
 * size of the thing being sited - which is exactly how a corner ended up in
 * the wrong place the first time.
 */
function airportFootprint() {
  const taxiAcross = AIRPORT_RUNWAY_WIDTH / 2 + 12
  const standAcross = taxiAcross + 20
  const offset = (standAcross + AIRPORT_APRON_DEPTH / 2) / 2

  return {
    taxiAcross,
    standAcross,
    offset,
    length: AIRPORT_RUNWAY_LENGTH + AIRPORT_EDGE * 2,
    width: AIRPORT_RUNWAY_WIDTH / 2 + standAcross +
           AIRPORT_APRON_DEPTH / 2 + AIRPORT_EDGE
  }
}

/** The four corners of the platform, in world coordinates. */
export function platformCorners(airport) {
  const p = airport.platform
  const hl = p.length / 2
  const hw = p.width / 2
  const out = []

  for (const [sl, sw] of [[1, 1], [1, -1], [-1, -1], [-1, 1]]) {
    out.push({
      x: p.x + airport.along.x * hl * sl + airport.across.x * hw * sw,
      z: p.z + airport.along.z * hl * sl + airport.across.z * hw * sw
    })
  }

  return out
}

/**
 * Where the open-water shipping lane runs.
 *
 * The same figure `buildSeaGraph()` uses, taken from the same two inputs, so
 * the airport cannot be sited onto a lane that has moved.
 */
export function shippingRingRadius() {
  return getMapExtent() + SEA_LANE_MARGIN
}

/**
 * How close to the middle of the world a ship on the lane ring ever gets.
 *
 * Not the ring's radius: the waypoints sit on the circle but a ship sails the
 * straight leg between two of them, and a chord dips inside the arc. With
 * SEA_LANE_NODES waypoints that is a factor of cos(pi / nodes) - nineteen
 * units on the current map, which is most of the clearance a platform sited
 * against the radius would have thought it had.
 *
 * The same shape of mistake as measuring a building against the circle round
 * it instead of its rectangle. Ask where the ship actually goes.
 */
export function innermostShippingLane() {
  return shippingRingRadius() * Math.cos(Math.PI / SEA_LANE_NODES)
}

/**
 * The pieces, once the site and the heading are settled.
 *
 * Everything is measured from the runway centre line outward, so the apron
 * cannot end up under the runway and a stand cannot end up off the platform -
 * the two mistakes this project keeps making when a position is worked out
 * from a formula instead of from the thing it has to sit beside.
 */
function layOutAirport(site, heading) {
  const ax = Math.sin(heading)          // along the runway
  const az = Math.cos(heading)

  // Across it, toward the apron - and it points OUT to sea, away from the
  // middle of the world.
  //
  // The runway is laid tangentially, so this axis runs either straight at the
  // islands or straight away from them. It used to run at them, which put the
  // terminal between the world and the runway: everything worth looking at -
  // the aircraft, the markings, the stands - was behind an eleven-metre wall
  // from every angle anyone would ever see it. Facing it the other way makes
  // the apron the thing you see and the terminal the backdrop.
  //
  // Worth stating because it is not a preference: this platform is only ever
  // viewed from one side. There is no land on the other.
  const acrossAngle = heading - Math.PI / 2
  const sx = Math.sin(acrossAngle)
  const sz = Math.cos(acrossAngle)

  // The site is the middle of the PLATFORM, not the middle of the runway.
  //
  // Everything below is still measured from the runway, because that is what
  // the distances mean - a stand is so far across from the runway, not so far
  // from the centre of a slab. So the whole layout is shifted by the offset
  // between the two, which puts the platform symmetrically about the site.
  //
  // Getting this wrong is why the search could not place the airport at all
  // once the terminal moved to the seaward side: the slab hung 33 units off
  // to one side of the point being scored, so it reached 67 units further out
  // than the search believed and every candidate failed the shipping lane.
  const at = (along, across) => ({
    x: site.x + ax * along + sx * (across - offset),
    z: site.z + az * along + sz * (across - offset)
  })

  const halfRun = AIRPORT_RUNWAY_LENGTH / 2
  const { taxiAcross, standAcross, offset, length, width } = airportFootprint()

  // Stands spaced by a wingspan and a gap, centred on the apron.
  const pitch = PLANE_SPAN + 8
  const stands = []
  for (let i = 0; i < AIRPORT_STANDS; i++) {
    const along = (i - (AIRPORT_STANDS - 1) / 2) * pitch
    stands.push({
      index: i,
      ...at(along, standAcross),
      // Nose in, tail toward the taxiway: the aircraft faces the terminal.
      // Taken from the across axis rather than written out again, so it cannot
      // end up pointing the opposite way when that axis is flipped - which is
      // exactly what happened when the terminal was moved to the seaward side.
      heading: acrossAngle,
      hold: at(along, taxiAcross)
    })
  }

  return {
    ...site,
    heading,
    along: { x: ax, z: az },
    across: { x: sx, z: sz },
    runway: {
      from: at(-halfRun, 0),
      to: at(halfRun, 0),
      width: AIRPORT_RUNWAY_WIDTH,
      length: AIRPORT_RUNWAY_LENGTH
    },
    // Where a landing rolls out to, and where a departure lines up.
    threshold: [at(-halfRun, 0), at(halfRun, 0)],
    taxiway: {
      from: at(-halfRun + 14, taxiAcross),
      to: at(halfRun - 14, taxiAcross),
      width: 14
    },
    terminal: {
      ...at(0, standAcross + AIRPORT_APRON_DEPTH / 2),
      heading,
      length: AIRPORT_STANDS * pitch,
      depth: 22
    },
    stands,
    platform: { x: site.x, z: site.z, heading, length, width }
  }
}

/**
 * Where a cargo port's shed and containers stand.
 *
 * Every candidate is measured: on land, well inland, clear of every road, and
 * clear of the monorail. If nothing fits, nothing is built.
 *
 * This exists because the first version placed the shed by dead reckoning -
 * a fixed 12 units back and 12 to the side of the pier root - with no test of
 * any kind. On EXPERIENCE that put a 22 x 13 x 8 concrete shed squarely
 * across the coast road and out onto the beach. It is the same mistake as the
 * signal poles in the carriageway and the piers through the bridge deck: ask
 * the geometry where the thing ends up, never a formula for it.
 */
export function getPortYard(port) {
  if (!port || !port.big) return { shed: null, containers: [] }

  const island = port.island
  const roads = getIslandRoads(island)
  const route = getMonorailRoute()

  const fx = port.dirX
  const fz = port.dirZ
  const sx = -fz
  const sz = fx

  // A big shed if there's room for one, a smaller one if not. A cargo port
  // with no shed at all still reads as a cargo port - it has the cranes - but
  // a smaller building is better than none, and better than one on the road.
  let best = null

  for (const size of [{ width: 22, depth: 13 }, { width: 14, depth: 9 }]) {
    const reach = Math.hypot(size.width / 2, size.depth / 2)

    // Behind the pier root, both sides, out to a sensible walk from the quay
    for (let back = 4; back <= 56; back += 4) {
      for (const side of [1, -1]) {
        for (let across = port.width / 2 + 5; across <= port.width / 2 + 44; across += 3) {
          const x = port.root.x - fx * back + sx * across * side
          const z = port.root.z - fz * back + sz * across * side

          // Room for the whole footprint, not just its middle: a corner on
          // the beach looks exactly as wrong as the whole building on it.
          //
          // The rectangle, not the circle around it. Testing the centre
          // against half the diagonal is the same mistake that placed no fire
          // stations at all - and here it cut the other way: a shed corner
          // came within half a unit of the coast road on ABOUT, because a
          // circle that clears a road says nothing about where the corners
          // are once the building is turned to face it.
          if (!rectangleIsClear(island, roads, x, z, port.rotationY,
                                size.width, size.depth, SHED_ROAD_CLEARANCE)) {
            continue
          }
          const inland = inlandDistance(island, x - island.x, z - island.z)
          const clear = distanceToNearestRoad(roads, x - island.x, z - island.z)

          if (route && monorailCeiling(route, x, z) < 10) continue

          // Nearest to the quay wins, so the yard stays part of the port
          const score = -back - across * 0.5
          if (!best || score > best.score) {
            best = { x, z, heading: port.rotationY, score, clear, inland, ...size }
          }
        }
      }
    }

    if (best) break
  }

  const containers = []
  if (best) {
    // Rows of stacks beside the shed, laid out on the yard's own axes.
    //
    // The first version scattered them at random and gave each one a random
    // LEVEL of 0, 1 or 2 - so two thirds of the containers on the map stood in
    // mid-air with nothing under them, at head height beside the coast road.
    // A stack is a stack: every level below the top one is filled.
    //
    // They are also tested by their own four corners now. A 6-unit box whose
    // CENTRE is five units clear of a road has a corner two units clear of it,
    // which reads as cargo in the carriageway - which is what Mike saw.
    let seed = hashString(`${island.id}:yard`)
    const rand = () => {
      seed = (seed * 16807) % 2147483647
      return (seed - 1) / 2147483646
    }

    // Every spot on a grid in the yard's own axes, then the ones nearest the
    // shed. Laying out a fixed block beside it doesn't work: the shed stands
    // close to the water, so half of any such block is over the beach - on
    // EXPERIENCE, thirteen of twenty-four positions.
    const rowStep = CONTAINER_LONG + CONTAINER_GAP
    const columnStep = CONTAINER_WIDE + CONTAINER_GAP
    const spots = []

    for (let row = -6; row <= 6; row++) {
      const across = row * rowStep

      for (let column = -6; column <= 6; column++) {
        // Not through the shed itself
        if (Math.abs(across) < best.width / 2 + CONTAINER_LONG / 2 + 2 &&
            Math.abs(column * columnStep) < best.depth / 2 + CONTAINER_WIDE / 2 + 2) {
          continue
        }
        const along = column * columnStep
        const x = best.x + fx * along + sx * across
        const z = best.z + fz * along + sz * across

        // The box itself: CONTAINER_LONG across the yard, CONTAINER_WIDE
        // along it, square to the shed.
        if (!rectangleIsClear(island, roads, x, z, port.rotationY,
                              CONTAINER_LONG, CONTAINER_WIDE,
                              CONTAINER_ROAD_CLEARANCE)) {
          continue
        }
        if (route && monorailCeiling(route, x, z) < 9) continue

        spots.push({ x, z, from: Math.abs(across) + Math.abs(along) * 0.4 })
      }
    }

    spots.sort((a, b) => a.from - b.from)

    for (const spot of spots.slice(0, CONTAINER_STACKS)) {
      const height = 1 + Math.floor(rand() * 3)
      for (let level = 0; level < height; level++) {
        containers.push({ x: spot.x, z: spot.z, level, heading: port.rotationY })
      }
    }
  }

  return { shed: best, containers }
}

/**
 * The road out to the quay: from the ring road, across the beach, and along
 * the pier to its head.
 *
 * Island-local, and emitted by getIslandRoads() as an ordinary road, so it
 * gets its junction patch where it meets the ring, its lighting and its
 * place in the network without any special handling.
 */
export function getPortRoad(island) {
  const port = getPort(island)
  if (!port) return null

  const points = []

  // Start on the ring if there is one, so the junction is real
  const ring = getIslandRing(island)
  if (ring) {
    const on = nearestOnPath(ring, port.localRoot.x, port.localRoot.z)
    if (on) points.push({ x: on.x, z: on.z })
  }

  // If there's no ring, start at the island centre - something has to
  // connect the quay to the rest of the island.
  if (!points.length) points.push({ x: 0, z: 0 })

  points.push({ x: port.localRoot.x, z: port.localRoot.z })
  points.push({ x: port.localHead.x, z: port.localHead.z })

  return { points, width: PORT_ROAD_WIDTH, port }
}

// ---------------------------------------------------------------------------
// Shipping lanes
// ---------------------------------------------------------------------------

/**
 * The sea as a graph: berths, port approaches, a ring of open-water
 * waypoints, and the points where ships leave the world.
 *
 * Derived, never stored - same rule as the road network and for the same
 * reason. Drag an island and the lanes move with it.
 *
 * The shape of it is deliberately simple, and the reason is worth stating:
 * **every waypoint on the lane ring is outside every island**, because the
 * ring's radius is the map extent plus a margin. So a leg between two
 * adjacent ring waypoints can never cross land, and no obstacle test is
 * needed between them. All the geometry risk is concentrated in the short
 * legs from each port out to the ring, which ARE checked.
 *
 *   berth  -> approach  -> ring -> ... -> ring -> approach -> berth
 *   berth  -> approach  -> ring -> off-world
 *
 * Nodes carry `kind`: 'berth', 'approach', 'lane' or 'offworld'.
 */
export function getSeaGraph() {
  const nodes = []
  const edges = new Map()   // node index -> [{ to, cost }]

  const add = (node) => { nodes.push(node); edges.set(nodes.length - 1, []); return nodes.length - 1 }
  const join = (a, b) => {
    const cost = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z)
    edges.get(a).push({ to: b, cost })
    edges.get(b).push({ to: a, cost })
  }

  const ports = getPorts()

  // Ports: one approach node each, with its berths hanging off it
  const approachOf = new Map()
  for (const port of ports) {
    const approach = add({ kind: 'approach', port, x: port.approach.x, z: port.approach.z })
    approachOf.set(port.id, approach)

    port.berths.forEach((berth, i) => {
      const b = add({ kind: 'berth', port, berth: i, x: berth.x, z: berth.z, heading: berth.heading })

      // A holding point straight out to sea from the berth, on the berth's own
      // side of the pier, so the last leg runs PARALLEL to the quay.
      //
      // Going straight from the approach point to the berth kept the ship's
      // centre line clear of the pier but not its hull: a 46-unit ship turning
      // in sweeps its bow seven or eight units sideways, straight through the
      // deck. With a holding point the turn happens well offshore and the ship
      // comes alongside without changing heading.
      const hold = add({
        kind: 'hold', port, berth: i,
        x: berth.x + port.dirX * BERTH_RUN_IN,
        z: berth.z + port.dirZ * BERTH_RUN_IN
      })

      join(approach, hold)
      join(hold, b)
    })
  }

  // The lane ring
  const radius = getMapExtent() + SEA_LANE_MARGIN
  const lane = []
  for (let i = 0; i < SEA_LANE_NODES; i++) {
    const angle = (i / SEA_LANE_NODES) * Math.PI * 2
    lane.push(add({
      kind: 'lane',
      x: Math.sin(angle) * radius,
      z: Math.cos(angle) * radius,
      angle
    }))
  }
  for (let i = 0; i < lane.length; i++) join(lane[i], lane[(i + 1) % lane.length])

  // Off-world nodes, out past where anything can be seen
  for (let i = 0; i < OFF_WORLD_NODES; i++) {
    const angle = (i / OFF_WORLD_NODES) * Math.PI * 2
    const off = add({
      kind: 'offworld',
      x: Math.sin(angle) * OFF_WORLD_RADIUS,
      z: Math.cos(angle) * OFF_WORLD_RADIUS,
      angle
    })
    // Straight in to the nearest lane waypoint. Both are outside every
    // island, so this leg is clear by construction.
    let nearest = lane[0]
    let best = Infinity
    for (const l of lane) {
      const d = Math.hypot(nodes[l].x - nodes[off].x, nodes[l].z - nodes[off].z)
      if (d < best) { best = d; nearest = l }
    }
    join(off, nearest)
  }

  // Each port out to the lane ring. These are the legs that can cross land,
  // so they're the ones actually tested.
  for (const port of ports) {
    const a = approachOf.get(port.id)
    const candidates = lane
      .map(l => ({ l, d: Math.hypot(nodes[l].x - nodes[a].x, nodes[l].z - nodes[a].z) }))
      .sort((p, q) => p.d - q.d)

    let joined = 0
    for (const { l } of candidates) {
      if (joined >= 3) break
      if (!seaLegIsClear(nodes[a], nodes[l])) continue
      join(a, l)
      joined++
    }

    // Nothing reachable at all would leave a port no ship could use, so
    // fall back to the nearest waypoint regardless and let it look odd
    // rather than have a dead port.
    if (!joined) join(a, candidates[0].l)
  }

  // And port to port directly, where the sea allows it. This is what makes
  // short local runs look local instead of sending every ship out to the
  // horizon and back.
  for (let i = 0; i < ports.length; i++) {
    for (let j = i + 1; j < ports.length; j++) {
      const a = approachOf.get(ports[i].id)
      const b = approachOf.get(ports[j].id)
      if (seaLegIsClear(nodes[a], nodes[b])) join(a, b)
    }
  }

  return { nodes, edges, lane, radius }
}

/**
 * Is the straight line between two points entirely water?
 *
 * Walked in steps rather than solved: the islands are arbitrary polygons,
 * and a segment-versus-polygon test would have to be right for concave bays
 * and atoll lagoons too. Stepping asks the same question the ship will ask.
 */
export function seaLegIsClear(a, b, step = 9) {
  const dx = b.x - a.x
  const dz = b.z - a.z
  const len = Math.hypot(dx, dz)
  if (len < 1e-6) return true

  const steps = Math.max(2, Math.ceil(len / step))
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    if (islandAt(a.x + dx * t, a.z + dz * t)) return false
  }
  return true
}

/**
 * Cheapest way through the sea graph, as a list of node indices.
 *
 * Plain Dijkstra over a few dozen nodes. Returns null if there's no way,
 * which the caller has to handle - a port cut off by a change to the map
 * shouldn't crash the world.
 */
export function seaPath(graph, from, to) {
  if (from === to) return [from]

  const dist = new Map([[from, 0]])
  const prev = new Map()
  const seen = new Set()

  while (true) {
    let current = -1
    let best = Infinity
    for (const [node, d] of dist) {
      if (!seen.has(node) && d < best) { best = d; current = node }
    }
    if (current < 0) return null
    if (current === to) break
    seen.add(current)

    for (const edge of graph.edges.get(current) || []) {
      const through = best + edge.cost
      if (through < (dist.has(edge.to) ? dist.get(edge.to) : Infinity)) {
        dist.set(edge.to, through)
        prev.set(edge.to, current)
      }
    }
  }

  const route = [to]
  while (route[0] !== from) route.unshift(prev.get(route[0]))
  return route
}

/**
 * A voyage: the path a ship will follow, measured so it can be walked at a
 * constant speed.
 */
export function seaVoyage(graph, from, to) {
  const route = seaPath(graph, from, to)
  if (!route) return null

  return {
    from,
    to,
    nodes: route,
    ...measurePath(route.map(i => ({ x: graph.nodes[i].x, z: graph.nodes[i].z })))
  }
}

// ---------------------------------------------------------------------------
// The ships
// ---------------------------------------------------------------------------

/**
 * A fleet, and the rules it sails by.
 *
 * A ship is a voyage plus how far along it is. Nothing here knows what one
 * looks like; World.js hangs a hull off each and reads the position back.
 *
 * Cargo ships only use berths at the big ports, so a container ship never
 * tries to tie up at a fishing jetty. That's the only difference in
 * behaviour between the two kinds - everything else is speed and size.
 */
export function makeShips(graph, cargo = CARGO_SHIPS, boats = SMALL_BOATS) {
  const ships = []
  const berths = graph.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.kind === 'berth')

  const bigBerths = berths.filter(({ n }) => n.port.big).map(({ i }) => i)
  const anyBerths = berths.map(({ i }) => i)
  const offworld = graph.nodes
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.kind === 'offworld')
    .map(({ i }) => i)

  if (!anyBerths.length || !offworld.length) return ships

  // Deterministic, so the shipping looks the same on every visit. Seeded off
  // a fixed number rather than Math.random for the same reason the world is.
  let seed = 90210
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  // Berths already promised to a ship. makeShips used to pick freely, which
  // put a container ship and a fishing boat in the same twelve metres of
  // water on the very first frame - and because it happened at start-up
  // rather than during a voyage, no amount of care in nextVoyage() fixed it.
  const claimed = new Set()

  const spawn = (kind, atSea) => {
    const home = kind === 'cargo' ? bigBerths : anyBerths
    if (!home.length) return

    const free = home.filter((b) => !claimed.has(b))

    // Some of the fleet starts out at sea, so the harbours aren't all full
    // and motionless the moment the world loads.
    const start = (atSea || !free.length)
      ? offworld[Math.floor(rand() * offworld.length)]
      : free[Math.floor(rand() * free.length)]

    if (graph.nodes[start].kind === 'berth') claimed.add(start)

    const berth = start
    const ship = {
      kind,
      speed: kind === 'cargo' ? SHIP_SPEED_CARGO : SHIP_SPEED_BOAT,
      dwellFor: kind === 'cargo' ? SHIP_DWELL_CARGO : SHIP_DWELL_BOAT,
      berthOptions: home,
      offworld,
      at: berth,
      voyage: null,
      distance: 0,
      // Staggered, so the whole fleet doesn't sail on the same tick. A ship
      // that starts at sea gets going straight away.
      dwell: graph.nodes[start].kind === 'berth'
        ? rand() * (kind === 'cargo' ? SHIP_DWELL_CARGO : SHIP_DWELL_BOAT) * 2
        : 0,
      speedNow: 0,
      voyages: 0,
      rand
    }
    ships.push(ship)
  }

  // Every third one starts out at sea and sails in
  for (let i = 0; i < cargo; i++) spawn('cargo', i % 3 === 2)
  for (let i = 0; i < boats; i++) spawn('boat', i % 3 === 2)

  return ships
}

/**
 * Choose where a ship goes next.
 *
 * From a berth it either runs to another berth or heads off the edge of the
 * world. From off-world it always comes back to a berth - which is what
 * makes departures and arrivals balance without anything counting them.
 */
export function nextVoyage(graph, ship, fleet = []) {
  const here = graph.nodes[ship.at]
  const pick = (list) => list[Math.floor(ship.rand() * list.length)]

  // A berth another ship is in, or on its way to. Without this two hulls
  // end up occupying the same twelve metres of water, which at a two-berth
  // port with three cargo ships happens within the first minute.
  const taken = new Set(fleet.filter(o => o !== ship).map(o => o.at))
  const free = ship.berthOptions.filter(b => !taken.has(b))

  let target

  if (here.kind === 'offworld') {
    target = free.length ? pick(free) : pick(ship.offworld)
  } else if (ship.rand() < OFF_WORLD_CHANCE) {
    target = pick(ship.offworld)
  } else {
    // Somewhere that isn't here. With one berth of its kind in the world a
    // cargo ship would otherwise sail to the berth it's already in.
    const elsewhere = free.filter((b) => graph.nodes[b].port !== here.port)
    target = elsewhere.length ? pick(elsewhere) : pick(ship.offworld)
  }

  const voyage = seaVoyage(graph, ship.at, target)
  if (!voyage) return null

  ship.voyage = voyage
  ship.distance = 0
  ship.at = target
  ship.voyages++
  return voyage
}

/**
 * Move one ship.
 *
 * Ships ease off for a berth in the same way the trains do, and for the same
 * reason: a hull that arrives at full speed and stops dead looks like a bug
 * even when the timing is right. They don't slow for an off-world waypoint -
 * they're leaving, and by then they're far out in the fog.
 */
export function stepShip(graph, ship, delta, fleet = []) {
  if (ship.dwell > 0) {
    ship.dwell -= delta
    ship.speedNow = 0
    return ship
  }

  if (!ship.voyage) {
    if (!nextVoyage(graph, ship, fleet)) { ship.dwell = 5; return ship }
  }

  const remaining = ship.voyage.length - ship.distance
  const arriving = graph.nodes[ship.voyage.to].kind === 'berth'

  ship.speedNow = arriving
    ? ship.speed * Math.min(1, Math.max(0.08, remaining / SHIP_BRAKING))
    : ship.speed

  ship.distance += ship.speedNow * delta

  if (ship.distance >= ship.voyage.length - 0.05) {
    ship.distance = ship.voyage.length

    if (arriving) {
      // Alongside. Wait, then sail again.
      ship.dwell = ship.dwellFor
      ship.speedNow = 0
      ship.voyage = null
    } else {
      // Gone. The hull is reused for an arrival from somewhere else, which
      // nobody can see happen: off-world nodes are 780 units out and the fog
      // is opaque well before that.
      ship.at = ship.offworld[Math.floor(ship.rand() * ship.offworld.length)]
      ship.voyage = null
      ship.distance = 0
      nextVoyage(graph, ship, fleet)
    }
  }

  return ship
}

/**
 * Move the whole fleet.
 *
 * Together, not one at a time, because choosing a berth means knowing which
 * berths the others have taken.
 */
export function stepShips(graph, ships, delta) {
  for (const ship of ships) stepShip(graph, ship, delta, ships)
  return ships
}

/** Where a ship is now, and which way it's pointing. */
export function shipPosition(graph, ship) {
  if (!ship.voyage) {
    const node = graph.nodes[ship.at]
    return { x: node.x, z: node.z, heading: node.heading || 0, docked: true }
  }

  const at = pointAlong(ship.voyage, ship.distance)
  return { ...at, docked: ship.dwell > 0 }
}

// ---------------------------------------------------------------------------
// The monorail
// ---------------------------------------------------------------------------

/**
 * Which islands the line calls at, in the order it visits them.
 *
 * Worked out from where the islands actually are, not written down, for the
 * usual reason: an order in the data goes stale the moment you drag an
 * island in the editor, and a stale order shows up as a line that crosses
 * itself. Set `monorail: false` on an island to be skipped.
 *
 * Bearings alone aren't enough. Sorting the islands by their angle around
 * the middle gives a clean loop for anything arranged in a ring - but the
 * hub sits AT the middle, where a bearing means nothing, and sorting it
 * with the rest put it in an arbitrary place in the running order.
 *
 * So the ring is built from the outer islands by bearing, and each inner
 * island is then dropped into whichever leg it lengthens least. On this map
 * that threads the hub between contact and about, which is the shortest way
 * to serve a central interchange.
 */
export function getMonorailStops() {
  const stops = ISLANDS.filter((i) => i.monorail !== false)
  if (stops.length < 3) return []

  const cx = stops.reduce((s, i) => s + i.x, 0) / stops.length
  const cz = stops.reduce((s, i) => s + i.z, 0) / stops.length
  const out = stops.map((i) => Math.hypot(i.x - cx, i.z - cz))
  const mean = out.reduce((s, d) => s + d, 0) / out.length

  const bearing = (i) => Math.atan2(i.x - cx, i.z - cz)
  const ring = []
  const middle = []

  stops.forEach((island, k) => {
    ;(out[k] > mean * MONORAIL_INNER_FRACTION ? ring : middle).push(island)
  })

  // Not enough on the outside to make a ring: fall back to plain bearings,
  // which is at least deterministic.
  if (ring.length < 3) return stops.slice().sort((a, b) => bearing(a) - bearing(b))

  ring.sort((a, b) => bearing(a) - bearing(b))

  // Sorted by id so the running order doesn't depend on the file's order
  middle.sort((a, b) => (a.id < b.id ? -1 : 1))

  const tour = ring.slice()
  for (const island of middle) {
    let bestAt = 0
    let bestCost = Infinity

    for (let i = 0; i < tour.length; i++) {
      const a = tour[i]
      const b = tour[(i + 1) % tour.length]
      const cost = Math.hypot(island.x - a.x, island.z - a.z)
                 + Math.hypot(b.x - island.x, b.z - island.z)
                 - Math.hypot(b.x - a.x, b.z - a.z)
      if (cost < bestCost) { bestCost = cost; bestAt = i + 1 }
    }
    tour.splice(bestAt, 0, island)
  }

  return tour
}

/**
 * Everything about one corner of a closed polygon: the two leg directions,
 * how much of each leg the curve eats, the radius it settles on, and the
 * bisector it curves towards.
 *
 * Shared, because two things need exactly the same arithmetic - the code
 * that draws the arc, and the code that works out where to put the
 * polygon's corners so the arcs come out over the islands. When those two
 * disagree, the line and the stations part company.
 *
 * Returns null for a corner too straight or too degenerate to curve.
 */
function cornerGeometry(pts, i, radius) {
  const n = pts.length
  const prev = pts[(i - 1 + n) % n]
  const cur = pts[i]
  const next = pts[(i + 1) % n]

  const la = Math.hypot(prev.x - cur.x, prev.z - cur.z)
  const lb = Math.hypot(next.x - cur.x, next.z - cur.z)
  if (la < 1e-6 || lb < 1e-6) return null

  // Unit vectors from the corner back along each leg
  const ax = (prev.x - cur.x) / la, az = (prev.z - cur.z) / la
  const bx = (next.x - cur.x) / lb, bz = (next.z - cur.z) / lb

  const theta = Math.acos(Math.max(-1, Math.min(1, ax * bx + az * bz)))
  if (Math.PI - theta < (MONORAIL_MIN_TURN * Math.PI) / 180) return null

  const half = theta / 2
  const tan = Math.tan(half)
  const sin = Math.sin(half)
  if (tan < 1e-6 || sin < 1e-6) return null

  // How far back along each leg the curve starts, and how big it can be.
  // A short leg gives a smaller curve rather than one that overruns into
  // the next corner.
  let along = radius / tan
  let r = radius
  const room = MONORAIL_MAX_CURVE_SHARE * Math.min(la, lb)
  if (along > room) { along = room; r = along * tan }

  const bisLen = Math.hypot(ax + bx, az + bz)
  if (bisLen < 1e-6) return null

  return {
    ax, az, bx, bz, r, along, sin,
    bisX: (ax + bx) / bisLen,
    bisZ: (az + bz) / bisLen,
    // How far the middle of the arc ends up from the corner itself. This is
    // the number that decides whether a station lands on its island.
    offset: r * (1 / sin - 1)
  }
}

/**
 * Where to put the polygon's corners so that the ARCS land on the islands.
 *
 * A curve of radius R turning through an angle passes the corner at a
 * distance of R x (1/sin(half the angle) - 1) on the inside. On the
 * sharpest corner here that's 44 units, which put the `about` platform 3
 * units from the water - the station was on the beach, and its stairs would
 * have come down in the sea.
 *
 * So the corner is aimed OUTWARD by that distance, and the curve comes back
 * to the island centre. The corner itself may end up offshore; nobody sees
 * it, because only the arc is built.
 *
 * The offset depends on the angle, which depends on where the corners are,
 * so this settles in by iteration. It converges quickly - the corners move
 * tens of units on the first pass and fractions by the fourth.
 */
function aimCurvesAtCentres(stops, radius, passes = 5) {
  const n = stops.length
  let controls = stops.map((i) => ({ x: i.x, z: i.z }))

  for (let pass = 0; pass < passes; pass++) {
    const next = []
    for (let i = 0; i < n; i++) {
      const c = cornerGeometry(controls, i, radius)
      next.push(c
        ? { x: stops[i].x - c.bisX * c.offset, z: stops[i].z - c.bisZ * c.offset }
        : { x: stops[i].x, z: stops[i].z })
    }
    controls = next
  }

  return controls
}

/**
 * Round the corners of a closed polygon with arcs of a given radius.
 *
 * Straight runs joined by circular curves - the way a railway is set out on
 * paper, and the reason it works here is that the radius is something you
 * state rather than something that falls out of a smoothing pass.
 *
 * Each corner is replaced by an arc tangent to both legs. Where a leg is
 * too short to give the curve room, that corner gets a smaller radius
 * rather than overrunning into the next one.
 *
 * Takes and returns points with no repeated closing point.
 */
export function filletCorners(pts, radius) {
  const n = pts.length
  if (n < 3) return pts.map((p) => ({ ...p }))

  const out = []

  for (let i = 0; i < n; i++) {
    const cur = pts[i]
    const c = cornerGeometry(pts, i, radius)
    if (!c) { out.push({ ...cur }); continue }

    const { ax, az, bx, bz, along, r, sin, bisX, bisZ } = c

    const start = { x: cur.x + ax * along, z: cur.z + az * along }
    const end = { x: cur.x + bx * along, z: cur.z + bz * along }

    // The centre sits along the bisector, on the inside of the turn -
    // which is the right side whether the corner is convex or concave.
    const cxx = cur.x + bisX * (r / sin)
    const czz = cur.z + bisZ * (r / sin)

    let a0 = Math.atan2(start.z - czz, start.x - cxx)
    let a1 = Math.atan2(end.z - czz, end.x - cxx)

    // The short way round. The long way would send the line off round the
    // far side of the circle and back.
    let sweep = a1 - a0
    while (sweep > Math.PI) sweep -= Math.PI * 2
    while (sweep < -Math.PI) sweep += Math.PI * 2

    const steps = Math.max(4, Math.ceil(Math.abs(sweep) * r / 3))
    for (let s = 0; s <= steps; s++) {
      const a = a0 + (sweep * s) / steps
      out.push({ x: cxx + Math.cos(a) * r, z: czz + Math.sin(a) * r })
    }
  }

  out.push({ ...out[0] })
  return out
}

/**
 * The guideway: one closed loop through every station, in WORLD
 * coordinates (unlike roads, which are island-local - the line spends most
 * of its length out over the water, belonging to no island).
 *
 * Straight spans between the islands, with a curve of a stated radius at
 * each one - see MONORAIL_CURVE_RADIUS for the two constructions that were
 * tried first and why neither survived being measured.
 *
 * A station therefore sits on the curve rather than at the island's dead
 * centre. That's a consequence of the geometry, not a choice: a line can't
 * pass through a point and turn 120 degrees around it at the same time.
 *
 * Returns null if there aren't enough islands to make a loop.
 *
 *   points     world-space polyline, evenly spaced, last === first
 *   cumulative distance along the loop at each point
 *   length     the whole loop
 *   stations   { island, x, z, heading, at } - `at` is distance along
 */
export function getMonorailRoute() {
  const stops = getMonorailStops()
  if (stops.length < 3) return null

  const curve = filletCorners(
    aimCurvesAtCentres(stops, MONORAIL_CURVE_RADIUS), MONORAIL_CURVE_RADIUS)

  // Evenly spaced, because everything downstream measures along the line:
  // where the piers stand, where the trains are, how far to the next
  // station.
  //
  // The spacing is stretched so it divides the loop a whole number of
  // times. Resampling at a fixed step leaves whatever is left over as one
  // short final segment - which on this loop was 0.45 units against 3.4,
  // and which shows in the beam as a facet at the seam.
  const total = pathLength(curve)
  const steps = Math.max(8, Math.round(total / MONORAIL_POINT_SPACING))
  const points = resamplePath(curve, total / steps)

  // Close it exactly. Even with the spacing made to fit, rounding leaves
  // the walk a hair short of the start, and a hair is a hole in the beam.
  const first = points[0]
  const last = points[points.length - 1]
  if (Math.hypot(last.x - first.x, last.z - first.z) < (total / steps) * 0.5) {
    points[points.length - 1] = { x: first.x, z: first.z }
  } else {
    points.push({ x: first.x, z: first.z })
  }

  const { cumulative, length } = measurePath(points)

  const stations = stops.map((island) => {
    // Where the loop passes closest to the island's middle. That's the
    // middle of the curve at that island, but it is found by measuring the
    // finished beam rather than worked out from the arc, so the platform
    // cannot end up anywhere the beam isn't.
    let bestAt = 0
    let bestDist = Infinity
    for (let i = 0; i < points.length; i++) {
      const d = Math.hypot(points[i].x - island.x, points[i].z - island.z)
      if (d < bestDist) { bestDist = d; bestAt = i }
    }

    const prev = points[(bestAt - 1 + points.length) % points.length]
    const next = points[(bestAt + 1) % points.length]

    return {
      island,
      id: island.id,
      name: island.name || island.id,
      accent: island.accent,
      x: points[bestAt].x,
      z: points[bestAt].z,
      // Which way the beam runs here, so the platform lies along it
      heading: Math.atan2(next.x - prev.x, next.z - prev.z),
      at: cumulative[bestAt],
      offCentre: bestDist
    }
  })

  // In the order the line meets them, which is what a train needs
  stations.sort((a, b) => a.at - b.at)

  return { points, cumulative, length, stations }
}

/**
 * Where the piers stand, and what each one is standing on.
 *
 * Evenly spaced along the loop, skipping the stretch under each station -
 * a station carries its own, heavier, supports and a column in the middle
 * of the platform would be in the way.
 *
 * `island` is the island a pier comes down on, or null if it's standing in
 * the sea. World.js needs to know: a pier on land wants a collider and has
 * to keep clear of the roads, and one in the water wants neither.
 */
export function getMonorailPiers(route = getMonorailRoute()) {
  if (!route) return []

  const piers = []
  const stationClear = MONORAIL_PIER_SPACING * 0.75

  for (let d = 0; d < route.length - 1; d += MONORAIL_PIER_SPACING) {
    // Not under a platform
    const nearStation = route.stations.some((s) => {
      const gap = Math.abs(s.at - d)
      return Math.min(gap, route.length - gap) < stationClear
    })
    if (nearStation) continue

    // A column standing in the middle of a street is the one thing here
    // that would look like a mistake rather than a design, so a pier that
    // lands on a road slides along the beam until it finds room. The beam
    // doesn't move; only which point of it the pier holds up.
    const found = bestPierSpot(route, d, 16)

    // Where the beam runs along a road rather than across one, no amount of
    // sliding helps: every point for the length of the block is over
    // tarmac. The pier is left out here and the gap filled below.
    if (found.road < MONORAIL_PIER_MIN_CLEARANCE ||
        found.deck < MONORAIL_PIER_MIN_CLEARANCE) continue

    piers.push(found)
  }

  // Now fill any span that ended up far longer than intended, because the
  // beam has to look supported. A gap containing a station is left alone -
  // the platform carries its own, heavier columns.
  //
  // These fills accept a column near a kerb, which the pass above would
  // have rejected. What they will not accept is one through a bridge deck:
  // that's a hole in a road you drive over, and no span length is worth it.
  const stationClear2 = stationClear
  const limit = MONORAIL_PIER_SPACING * 2.2

  piers.sort((a, b) => a.at - b.at)

  for (let i = 0; i < piers.length; i++) {
    const from = piers[i].at
    const to = i === piers.length - 1 ? piers[0].at + route.length : piers[i + 1].at
    if (to - from <= limit) continue

    const middle = (from + to) / 2
    const hasStation = route.stations.some((s) => {
      const gap = Math.abs(s.at - middle)
      return Math.min(gap, route.length - gap) < stationClear2 + MONORAIL_PIER_SPACING
    })
    if (hasStation) continue

    const fill = bestPierSpot(route, middle, (to - from) / 4)
    if (fill.deck < MONORAIL_PIER_MIN_CLEARANCE) continue

    piers.push(fill)
    piers.sort((a, b) => a.at - b.at)
    i = -1   // spans changed; start again
  }

  return piers
}

/**
 * The roomiest point on the beam within `reach` of a given distance along it.
 *
 * Stops as soon as it finds somewhere comfortable rather than searching the
 * whole window, because the nearest acceptable spot keeps the piers evenly
 * spaced and the search cheap.
 */
function bestPierSpot(route, at, reach) {
  // `sideways` moves the COLUMN off the beam's centre line, with a cross-arm
  // reaching back up to it. That's how an elevated line crosses a road
  // bridge in reality: the columns stand either side of it, not on it. It's
  // the only option on the hub-to-contact crossing, where a hundred units of
  // beam runs directly over the bridge and its approach roads.
  const make = (d, sideways = 0) => {
    const beam = monorailPointAt(route, d)
    const acrossX = -Math.cos(beam.heading)
    const acrossZ = Math.sin(beam.heading)
    const x = beam.x + acrossX * sideways
    const z = beam.z + acrossZ * sideways

    const island = islandAt(x, z)
    const clear = pierClearances(x, z, island)

    return {
      x, z, at: d, island, heading: beam.heading,
      // Where the cross-arm has to reach
      beamX: beam.x, beamZ: beam.z, offset: sideways,
      road: clear.road, deck: clear.deck,
      clearance: Math.min(clear.road, clear.deck)
    }
  }

  let best = make(at)
  if (best.clearance >= MONORAIL_ROAD_CLEARANCE) return best

  // Along the beam first: a column directly under it is always tidier than
  // one on an arm, so the sideways options are only tried once sliding has
  // failed to find anywhere comfortable.
  for (let step = 2; step <= reach; step += 2) {
    for (const shift of [step, -step]) {
      const candidate = make(at + shift)
      if (candidate.clearance > best.clearance) best = candidate
    }
    if (best.clearance >= MONORAIL_ROAD_CLEARANCE) break
  }

  if (best.clearance >= MONORAIL_ROAD_CLEARANCE) return best

  for (const sideways of [8, -8, 11, -11, 14, -14]) {
    const candidate = make(at, sideways)
    if (candidate.clearance > best.clearance) best = candidate
    if (best.clearance >= MONORAIL_ROAD_CLEARANCE) break
  }

  return best
}

/**
 * How much room a pier has at a point: the distance to the nearest thing
 * you could be driving on.
 *
 * Roads on the island it stands on, AND the bridges, AND the roads across
 * them. The bridges are the part that was missed: a pier out over water used
 * to be given a free pass, on the reasoning that there are no roads at sea -
 * except that a bridge is a road at sea, and the beam crosses several of
 * them. Columns came down through the deck.
 */
export function pierClearance(worldX, worldZ, island = islandAt(worldX, worldZ)) {
  return Math.min(...Object.values(pierClearances(worldX, worldZ, island)))
}

/**
 * The same measurement, kept apart.
 *
 * `deck` is absolute: a column through a bridge deck is a hole in the road
 * you drive over, and no span length justifies it. `road` is a preference -
 * a column near a kerb is untidy, and much better than leaving a hundred
 * units of beam with nothing under it.
 */
export function pierClearances(worldX, worldZ, island = islandAt(worldX, worldZ)) {
  let road = Infinity
  let deck = Infinity

  if (island) {
    road = distanceToNearestRoad(
      getIslandRoads(island), worldX - island.x, worldZ - island.z)
  }

  // The decks. Measured against the rectangle, not the centre line, because
  // a bridge is 8.5 wide and a pier beside the middle of it is still on it.
  for (const bridge of getBridges()) {
    const dx = worldX - bridge.x
    const dz = worldZ - bridge.z
    const cos = Math.cos(bridge.rotationY)
    const sin = Math.sin(bridge.rotationY)

    // Into the bridge's own frame: along the deck, and across it
    const along = Math.abs(dz * cos + dx * sin)
    const across = Math.abs(dx * cos - dz * sin)

    // Past either end of the deck, the distance is to the end itself
    const overhang = Math.max(0, along - bridge.length / 2)
    const sideways = Math.max(0, across - bridge.width / 2)
    deck = Math.min(deck, Math.hypot(overhang, sideways))
  }

  // And the continuous roads that run across them, which reach a little
  // further inland than the deck does
  for (const path of getBridgeRoadPaths()) {
    deck = Math.min(deck,
      distanceToPath(path.points, worldX, worldZ) - path.width / 2)
  }

  return { road, deck }
}

/**
 * Where each station's stair tower comes down.
 *
 * The platform is 16 units up, so there has to be something joining it to
 * the pavement. It goes beside the platform rather than under it, and it
 * has to miss the roads - and the fountain, on the hub, where the station
 * lands squarely on the plaza.
 *
 * Every candidate is scored and the best wins, rather than the first
 * acceptable one, because on a dense island none of them is clear and
 * "least bad" is a better answer than "the first one I tried".
 */
export function getMonorailStationTowers(route = getMonorailRoute()) {
  if (!route) return []

  return route.stations.map((station) => {
    const island = station.island
    const roads = getIslandRoads(island)

    const fx = Math.sin(station.heading)
    const fz = Math.cos(station.heading)
    const sx = -fz
    const sz = fx

    let best = null

    for (const side of [1, -1]) {
      for (const along of [0, 6, -6, 11, -11]) {
        const x = station.x + fx * along + sx * MONORAIL_TOWER_OFFSET * side
        const z = station.z + fz * along + sz * MONORAIL_TOWER_OFFSET * side

        // On this island at all? A tower on the beach is worse than one
        // squeezed between two streets.
        const inland = inlandDistance(island, x - island.x, z - island.z)
        if (inland < 4) continue

        let score = Math.min(roadClearance(island, roads, x, z), 12)

        // Room for the fountain, wherever the plaza put it
        for (const d of island.districts || []) {
          if (d.type !== 'plaza') continue
          const fxx = island.x + (d.x || 0)
          const fzz = island.z + (d.z || 0) + PLAZA_FOUNTAIN_OFFSET
          const gap = Math.hypot(x - fxx, z - fzz) - PLAZA_FOUNTAIN_RADIUS
          if (gap < 3) score -= (3 - gap) * 4
        }

        if (!best || score > best.score) {
          best = { station, island, x, z, heading: station.heading, side, along, score }
        }
      }
    }

    // Nowhere on the island passed the inland test - put it beside the
    // platform and let it be seen, rather than dropping it and leaving a
    // station nobody could reach.
    return best || {
      station, island, heading: station.heading, side: 1, along: 0, score: -Infinity,
      x: station.x + sx * MONORAIL_TOWER_OFFSET,
      z: station.z + sz * MONORAIL_TOWER_OFFSET
    }
  })
}

/**
 * How tall something at this point is allowed to be, in world units.
 *
 * Infinity everywhere except in the strip under the beam, where it's the
 * beam's underside less the clearance - about 8 units.
 *
 * This is the answer to "make the line lower without it cutting through
 * anything". The line can't dodge the buildings, because the buildings
 * aren't there yet when the route is worked out: the towns are generated
 * afterwards, from the island's shape. What CAN happen is what happens under
 * a real elevated railway - the buildings beneath it are low ones.
 *
 * So this is consulted by everything that puts something on the ground, and
 * it decides how much room there is. Which also means the rule is stated
 * once, here, rather than as a height check copied into six prop functions
 * that would drift apart.
 */
export function monorailCeiling(route, x, z) {
  if (!route) return Infinity

  // Cheap reject first. The loop is 500-odd points and this is asked for
  // every building, tree and bench in the world.
  const near = distanceToPath(route.points, x, z)
  if (near > MONORAIL_CORRIDOR) return Infinity

  // Headroom above the GROUND, not above sea level. The beam stays level
  // while the land does not, so a building on a six-unit hill has six units
  // less room under it - and if this returned the same figure everywhere,
  // that building would grow straight through the line.
  //
  // Safe to ask the terrain from here: nothing the terrain is assembled from
  // consults the monorail's ceiling, so this cannot come back round on itself.
  return MONORAIL_HEIGHT - MONORAIL_BEAM_DEPTH - MONORAIL_CLEARANCE
    - groundHeight(x, z)
}

/**
 * How many floors will fit at this point.
 *
 * Buildings are the main thing the corridor has to shorten, and they're
 * built in whole storeys, so the rounding belongs here rather than in the
 * renderer - and the test can then check the answer for every plot in the
 * world without needing a browser.
 *
 * Returns 0 if not even one floor fits, which means don't build.
 */
export function monorailFloors(route, x, z, floors, floorHeight = 2.5, roof = 0.5) {
  const ceiling = monorailCeiling(route, x, z)
  if (ceiling === Infinity) return floors

  const fit = Math.floor((ceiling - roof) / floorHeight)
  return Math.max(0, Math.min(floors, fit))
}

/** Which island a world-space point is standing on, or null for open water. */
export function islandAt(x, z) {
  for (const island of ISLANDS) {
    if (inlandDistance(island, x - island.x, z - island.z) > 0) return island
  }
  return null
}

/**
 * Wrap a polyline up with its cumulative distances, so it can be walked at
 * a constant speed.
 *
 * Shared by the monorail and the shipping lanes. They're the same problem -
 * something moving along a fixed line at a known rate - and having one
 * implementation means a fix to the awkward end cases benefits both.
 */
export function measurePath(points) {
  const cumulative = [0]
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] +
      Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z))
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] }
}

/**
 * A point some distance along a measured path, with the direction of travel.
 *
 * `wrap` for a loop, where a train can keep counting up forever and never
 * needs to know it has been round. Without it the distance is clamped, so a
 * ship that overruns its voyage sits at the end rather than flying off.
 */
export function pointAlong(path, distance, wrap = false) {
  const { points, cumulative, length } = path
  if (points.length < 2) return { x: points[0].x, z: points[0].z, heading: 0 }

  let d = distance
  if (wrap) {
    d %= length
    if (d < 0) d += length
  } else {
    d = Math.max(0, Math.min(length, d))
  }

  // Walk to the span containing d. Start from an estimate rather than from
  // zero: this is asked for several times a frame, per vehicle.
  let i = Math.min(points.length - 2,
    Math.max(0, Math.floor((d / Math.max(length, 1e-9)) * (points.length - 1))))
  while (i > 0 && cumulative[i] > d) i--
  while (i < points.length - 2 && cumulative[i + 1] < d) i++

  const a = points[i]
  const b = points[i + 1]
  const span = cumulative[i + 1] - cumulative[i]
  const t = span > 1e-9 ? (d - cumulative[i]) / span : 0

  const out = {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    heading: Math.atan2(b.x - a.x, b.z - a.z)
  }

  // Height, when the path has any. Everything that used this before was flat -
  // ships on the sea, trains on a level beam, traffic on roads that carry
  // their own height per vertex - so `y` was simply dropped. An aircraft
  // asking this for its approach would have been told it was at sea level the
  // whole way down, and the descent would have been invisible.
  //
  // Interpolated here rather than left to whatever draws it: a descent is a
  // property of the route. Same reason the train timetable lives in this file.
  //
  // Note the distance along a path is still measured in the HORIZONTAL plane
  // (see measurePath), so a climb does not shorten the ground track. That is
  // what you want for a speed: it is a ground speed.
  if (a.y !== undefined || b.y !== undefined) {
    out.y = (a.y || 0) + ((b.y || 0) - (a.y || 0)) * t
  }

  return out
}

/** The monorail loop is a measured path that wraps. */
export function monorailPointAt(route, distance) {
  return pointAlong(route, distance, true)
}

/**
 * The trains, ready to run, spread evenly around the loop.
 *
 * Each one starts AT a station rather than at an arbitrary fraction of the
 * way round, so no train spends its first seconds braking for a stop it has
 * already half passed.
 *
 * A train is just a distance along the line and a countdown. Nothing here
 * knows what one looks like - World.js hangs the meshes off these and reads
 * the distance back every frame.
 */
export function makeMonorailTrains(route, count = MONORAIL_TRAINS) {
  if (!route || !route.stations.length) return []

  const trains = []
  const stride = Math.max(1, Math.floor(route.stations.length / count))

  for (let i = 0; i < count; i++) {
    const station = route.stations[(i * stride) % route.stations.length]
    trains.push({
      distance: station.at,
      // Staggered, so they don't all pull out of their platforms together
      dwell: MONORAIL_DWELL * (i / count),
      speed: 0,
      stops: 0
    })
  }

  return trains
}

/**
 * Advance one train by `delta` seconds.
 *
 * Speed comes from where the train IS, not from a timer: how far to the
 * next platform, how far since the last one, and how close the train ahead
 * is. That's what stops a train creeping past its station and halting in
 * mid air, which is exactly what a timed approach does the first time the
 * frame rate dips.
 *
 * `gapAhead` is the distance to the back of the train in front, or
 * Infinity if there isn't one worth worrying about.
 *
 * Mutates the train and returns it.
 */
export function stepMonorailTrain(route, train, delta, gapAhead = Infinity) {
  if (!route || !route.stations.length) return train

  if (train.dwell > 0) {
    train.dwell -= delta
    train.speed = 0
    return train
  }

  let ahead = Infinity
  let behind = Infinity

  for (const station of route.stations) {
    // The station the train is STANDING AT is a lap away, not nought away.
    //
    // Without the epsilon a train that has just finished its dwell reads the
    // platform it is on as zero distance ahead, stops for it again, and does
    // that forever: the trains never left their first station and the line
    // sat there looking like scenery.
    let gap = station.at - train.distance
    while (gap <= 1e-3) gap += route.length
    while (gap > route.length) gap -= route.length
    if (gap < ahead) ahead = gap

    let back = train.distance - station.at
    while (back < 0) back += route.length
    while (back >= route.length) back -= route.length
    if (back < behind) behind = back
  }

  const slowing = Math.min(1, Math.max(0.06, ahead / MONORAIL_BRAKING))
  const leaving = Math.min(1, Math.max(0.12, behind / MONORAIL_PULLAWAY))
  const following = Math.min(1, Math.max(0, (gapAhead - MONORAIL_HEADWAY) / MONORAIL_HEADWAY))

  train.speed = MONORAIL_SPEED * Math.min(slowing, leaving, following)

  // Close enough that another step would overshoot the platform: stop ON it
  if (ahead <= Math.max(train.speed * delta, 0.05)) {
    train.distance += ahead
    train.dwell = MONORAIL_DWELL
    train.speed = 0
    train.stops++
  } else {
    train.distance += train.speed * delta
  }

  while (train.distance >= route.length) train.distance -= route.length
  return train
}

/**
 * Move every train, working out each one's headway for it.
 *
 * The trains have to be dealt with together, because a train's speed
 * depends on the one in front. Doing them one at a time from the outside
 * meant every caller had to sort them first, and the renderer got it wrong.
 */
export function stepMonorailTrains(route, trains, delta) {
  if (!route || !trains.length) return trains

  // Length of a whole train, so the gap is measured to its BACK
  const rake = MONORAIL_CARS * MONORAIL_CAR_LENGTH

  for (const train of trains) {
    let gapAhead = Infinity

    for (const other of trains) {
      if (other === train) continue
      let gap = other.distance - rake - train.distance
      while (gap < 0) gap += route.length
      if (gap < gapAhead) gapAhead = gap
    }

    stepMonorailTrain(route, train, delta, gapAhead)
  }

  return trains
}

/**
 * The whole drivable network, in world coordinates.
 *
 * Returns:
 *   segments - every road in the world, as a world-space polyline, with
 *              where it came from so the editor can point at it
 *   nodes    - every place segments touch: { x, z, segments: [i, …] }
 *
 * This is DERIVED, never stored. Connections that live in the data go
 * stale the moment you drag an island; connections worked out from where
 * the roads actually are cannot. It costs a little to recompute and is
 * always right.
 *
 * A node with two or more segments is a junction. A node with one is a
 * dead end - which the editor draws differently, because a road you meant
 * to join to something and didn't is the mistake worth catching.
 *
 * Anything wanting to drive a car around later wants this: nodes are
 * where you can choose a direction, segments are what you follow.
 */
export function getRoadNetwork() {
  const segments = []

  for (const island of ISLANDS) {
    for (const road of getIslandRoads(island)) {
      // Approach roads are drawn as part of the bridge run, so taking
      // them here as well would double every one of them up.
      if (road.auto) continue

      segments.push({
        points: road.points.map(p => ({ x: island.x + p.x, z: island.z + p.z })),
        island: island.id,
        // Carried through because the traffic needs it: a lane sits a
        // quarter of the road's width off the centre line, so a car on a
        // 5.5-wide street and one on an 8.5-wide bridge are not the same
        // distance from the middle.
        width: road.width || DEFAULT_ROAD_WIDTH,
        kind: road.ring ? 'ring' : road.spur ? 'spur' : 'road',
        closed: !!road.ring
      })
    }
  }

  for (let i = 0; i < BRIDGES.length; i++) {
    const path = getBridgeRoadPaths()[i]
    if (!path) continue
    segments.push({
      points: path.points,
      island: null,
      width: path.width || DEFAULT_BRIDGE_WIDTH,
      kind: 'bridge',
      bridge: BRIDGES[i],
      closed: false
    })
  }

  return buildNetwork(segments)
}

/**
 * Work out where a set of road polylines join each other.
 *
 * Split out from getRoadNetwork so the map editor can feed in the roads
 * it is currently drawing - including ones you haven't saved yet - and
 * get connections worked out by exactly the same code the game uses.
 *
 * @param {Array<{points, closed}>} segments  world-space polylines
 */
export function buildNetwork(segments) {
  // A node wherever segment ends land on, or near, another segment.
  const TOLERANCE = DEFAULT_ROAD_WIDTH * 0.75
  const nodes = []

  const addNode = (x, z, index) => {
    const existing = nodes.find(n => Math.hypot(n.x - x, n.z - z) < TOLERANCE)
    if (existing) {
      if (!existing.segments.includes(index)) existing.segments.push(index)
      return existing
    }
    const node = { x, z, segments: [index] }
    nodes.push(node)
    return node
  }

  segments.forEach((seg, i) => {
    const ends = seg.closed
      ? []                                  // a loop has no loose ends
      : [seg.points[0], seg.points[seg.points.length - 1]]

    for (const end of ends) {
      const node = addNode(end.x, end.z, i)

      // Anything else passing within a road's width of this end counts as
      // joined - that's what a T-junction is.
      segments.forEach((other, k) => {
        if (k === i) return
        const near = nearestOnPath(other.points, end.x, end.z)
        if (near && Math.hypot(near.x - end.x, near.z - end.z) <= TOLERANCE) {
          if (!node.segments.includes(k)) node.segments.push(k)
        }
      })
    }
  })

  // Crossings, for roads that pass through each other rather than end
  segments.forEach((a, i) => {
    segments.forEach((b, k) => {
      if (k <= i) return
      for (let p = 1; p < a.points.length; p++) {
        for (let q = 1; q < b.points.length; q++) {
          const hit = segmentIntersection(
            a.points[p - 1], a.points[p], b.points[q - 1], b.points[q]
          )
          if (hit) {
            const node = addNode(hit.x, hit.z, i)
            if (!node.segments.includes(k)) node.segments.push(k)
          }
        }
      }
    })
  })

  return { segments, nodes }
}

/**
 * Where traffic signals belong, island-local.
 *
 * Not simply "every junction": the crossing maths finds several contact
 * points where a street meets the ring at an angle, and signalling each
 * of them put a dozen poles in one place. Junctions within
 * SIGNAL_MERGE_DISTANCE are one junction as far as a driver is concerned.
 *
 * Each signal reports its `arms` - one per approach. A crossroads has
 * four, a T has three, and a bend has two and gets no lights at all.
 * That's what stops a plain corner sprouting signals.
 */
export function getTrafficSignals(island) {
  // Bridge approaches count. They're marked `auto` because they're drawn
  // as part of the continuous bridge run rather than separately, but where
  // one meets the ring a driver arrives at a T-junction and expects to be
  // told what to do. Leaving them out was why the hub had no lights at
  // all: its five junctions each saw only the ring, so only two arms.
  const roads = getIslandRoads(island)
    .filter(r => r.street || r.ring || r.auto || r.spur)
  if (!roads.length) return []

  // Cluster the raw junctions
  const clusters = []
  for (const j of getIslandJunctions(island)) {
    const near = clusters.find(c =>
      Math.hypot(c.x - j.x, c.z - j.z) < SIGNAL_MERGE_DISTANCE)

    if (near) {
      near.members.push(j)
      near.x = near.members.reduce((a, m) => a + m.x, 0) / near.members.length
      near.z = near.members.reduce((a, m) => a + m.z, 0) / near.members.length
      near.radius = Math.max(near.radius, j.radius)
    } else {
      clusters.push({ x: j.x, z: j.z, radius: j.radius, members: [j] })
    }
  }

  const signals = []

  for (const cluster of clusters) {
    const arms = []

    for (const road of roads) {
      let nearest = Infinity
      let index = 0
      road.points.forEach((p, i) => {
        const d = Math.hypot(p.x - cluster.x, p.z - cluster.z)
        if (d < nearest) { nearest = d; index = i }
      })
      if (nearest > cluster.radius + SIGNAL_MERGE_DISTANCE * 0.7) continue

      const tan = tangentAt(road.points, cluster.x, cluster.z)
      if (!tan) continue

      // A road that STOPS here is one approach. A road that carries on
      // through is two. Counting every road as two was what turned every
      // T-junction into a four-way.
      const fromStart = index
      const fromEnd = road.points.length - 1 - index
      const terminates = !road.closed &&
        Math.min(fromStart, fromEnd) < road.points.length * 0.12

      if (terminates) {
        // Point back along the road, away from the junction
        const sign = fromStart < fromEnd ? -1 : 1
        arms.push({ x: tan.x * sign, z: tan.z * sign })
      } else {
        arms.push({ x: tan.x, z: tan.z })
        arms.push({ x: -tan.x, z: -tan.z })
      }
    }

    // Merge approaches pointing much the same way. Two roads crossing at
    // a shallow angle arrive from nearly the same direction, and a driver
    // reads that as one approach - two poles side by side just look like a
    // mistake.
    const distinct = []
    for (const arm of arms) {
      const same = distinct.find(d =>
        d.x * arm.x + d.z * arm.z > Math.cos((ARM_MERGE_ANGLE * Math.PI) / 180))
      if (!same) distinct.push(arm)
    }

    // Work out where each pole actually stands.
    //
    // Offsetting a fixed amount sideways from the junction centre put half
    // of them in the middle of the carriageway: the junction disc is 3.5
    // units across but the roads are 5.5 to 7 wide. So step outwards until
    // the spot is genuinely clear of every road, and drop the pole if no
    // such spot exists.
    const withPoles = []

    for (const arm of distinct) {
      const pole = clearSpotBeside(cluster, arm, roads)
      if (pole) withPoles.push({ ...arm, pole })
    }

    if (withPoles.length >= 3) {
      // Two phases: arms roughly in line with the first one share a phase,
      // everything else takes the other. That's what makes the crossing
      // flows complementary rather than decorative.
      //
      // Assigned HERE rather than in the renderer, because the cars have to
      // agree with the lamps about who has a green. When each worked it out
      // for itself there was nothing keeping them in step.
      const base = withPoles[0]
      for (const arm of withPoles) {
        arm.group = Math.abs(base.x * arm.x + base.z * arm.z) > 0.7 ? 0 : 1
      }

      signals.push({
        x: cluster.x, z: cluster.z, radius: cluster.radius, arms: withPoles,
        // Where this junction is in its cycle, derived from where it is in
        // the world. It used to come from the renderer's random number
        // generator, which meant nothing outside the renderer could know it.
        offset: (hashString(
          `${island.id}:${Math.round(cluster.x)}:${Math.round(cluster.z)}`
        ) % 1000) / 1000 * TRAFFIC_CYCLE
      })
    }
  }

  return signals
}

/**
 * A spot for a signal pole beside an approach: back from the junction and
 * off to the right, stepped outwards until it clears every carriageway.
 *
 * Returns null if nothing within reach is clear, which is better than
 * planting a pole in the road.
 */
function clearSpotBeside(cluster, arm, roads) {
  // Candidates in order of preference: near the junction and to the right
  // of oncoming traffic first, then further back, then the left side.
  //
  // Only searching one side at one setback failed at exactly the junctions
  // that matter most - where a bridge approach meets the ring, there's
  // another carriageway on the right, so no spot was found and the whole
  // junction went unsignalled.
  for (const back of [3.4, 6, 9, 12]) {
    for (const hand of [-1, 1]) {
      for (let side = 3; side <= 15; side += 0.75) {
        const reach = cluster.radius + back
        const x = cluster.x + arm.x * reach + arm.z * side * hand
        const z = cluster.z + arm.z * reach - arm.x * side * hand

        // Round FIRST, then test. Rounding after the test can shift the
        // pole by up to 0.05 and push a borderline spot back into the road.
        const spot = { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10 }
        if (distanceToNearestRoad(roads, spot.x, spot.z) >= POLE_CLEARANCE) {
          return spot
        }
      }
    }
  }

  return null
}

/**
 * Every place two roads on an island meet or cross, island-local.
 *
 * A road is a ribbon with square ends. Where one runs into another they
 * overlap in a rough T with visible corners, and where two cross at an
 * angle the outer corners of the crossing are left bare. Laying a disc of
 * the same asphalt at each of these points covers both cases - and because
 * the whole surface is one flat colour at one height, the disc is
 * invisible except for the corner it fills.
 *
 * Returns { x, z, radius }. Nearby hits are merged so a spur meeting a
 * ring produces one junction rather than a cluster.
 */
export function getIslandJunctions(island) {
  const roads = getIslandRoads(island)
  const hits = []

  for (let a = 0; a < roads.length; a++) {
    for (let b = a + 1; b < roads.length; b++) {
      // Big enough to reach the CORNERS of the crossing, not just the
      // edge of the wider road. Two roads crossing at right angles form a
      // diamond whose corners sit hypot(wA/2, wB/2) from the centre -
      // using max(w)/2 left those corners bare, which is what read as one
      // road's surface overlapping the other's.
      const radius = Math.hypot(roads[a].width / 2, roads[b].width / 2) + 0.6

      for (const point of pathCrossings(roads[a].points, roads[b].points, radius)) {
        hits.push({ ...point, radius })
      }
    }
  }

  // Merge anything closer together than a road is wide
  const merged = []
  for (const hit of hits) {
    const near = merged.find(m =>
      Math.hypot(m.x - hit.x, m.z - hit.z) < Math.max(m.radius, hit.radius))

    if (near) {
      near.radius = Math.max(near.radius, hit.radius)
    } else {
      merged.push({ ...hit })
    }
  }

  return merged
}

/**
 * Where two polylines cross, plus where one simply ends on the other -
 * which is the common case here, a spur running into the ring.
 */
function pathCrossings(pathA, pathB, tolerance) {
  const out = []

  for (let i = 1; i < pathA.length; i++) {
    for (let k = 1; k < pathB.length; k++) {
      const hit = segmentIntersection(
        pathA[i - 1], pathA[i], pathB[k - 1], pathB[k]
      )
      if (hit) out.push(hit)
    }
  }

  // A spur that stops just short of the ring never technically crosses it,
  // so check both endpoints against the other path too.
  for (const [path, other] of [[pathA, pathB], [pathB, pathA]]) {
    for (const end of [path[0], path[path.length - 1]]) {
      const near = nearestOnPath(other, end.x, end.z)
      if (near && Math.hypot(near.x - end.x, near.z - end.z) <= tolerance) {
        out.push({ x: end.x, z: end.z })
      }
    }
  }

  return out
}

/** Where two line segments cross, or null. */
function segmentIntersection(p1, p2, p3, p4) {
  const d1x = p2.x - p1.x, d1z = p2.z - p1.z
  const d2x = p4.x - p3.x, d2z = p4.z - p3.z

  const denom = d1x * d2z - d1z * d2x
  if (Math.abs(denom) < 1e-12) return null // parallel

  const t = ((p3.x - p1.x) * d2z - (p3.z - p1.z) * d2x) / denom
  const u = ((p3.x - p1.x) * d1z - (p3.z - p1.z) * d1x) / denom

  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { x: p1.x + d1x * t, z: p1.z + d1z * t }
}

export function approachControls(island, dx, dz, def, bridges = BRIDGES) {
  const dist = Math.hypot(dx, dz)
  const ux = dx / dist
  const uz = dz / dist
  const shore = shoreDistance(island, dx, dz)
  const reach = Math.max(2, shore - 1)
  const landing = { x: ux * reach, z: uz * reach }

  const stored = getApproach(island, def)
  if (stored) {
    // The first point is where the road meets the bridge deck. It is
    // pinned to the landing whatever the saved file says, because a road
    // that starts anywhere else tears open a hole at the join - and a
    // stale saved point is exactly what you'd get after moving an island.
    const points = stored.points.map(p => ({ x: p.x, z: p.z }))
    points[0] = landing
    return points
  }

  // Where the road is heading: the near side of the ring if there is one,
  // otherwise the middle as before.
  const ring = getIslandRing(island)
  const target = ring
    ? nearestOnPath(ring, landing.x, landing.z) || { x: 0, z: 0 }
    : { x: 0, z: 0 }

  const curve = island.roadCurve !== undefined ? island.roadCurve : DEFAULT_ROAD_CURVE
  const seed = hashString(island.id) + landingIndex(island, def, bridges) * 37

  // A spur onto a ring is short. Bowing it as hard as a full run to the
  // centre would make it wander noticeably on its way to a target only a
  // few units away, so the bow is eased off for short roads.
  const runLength = Math.hypot(target.x - landing.x, target.z - landing.z)
  const eased = curve * Math.min(1, runLength / 18)

  return bowedPath(landing, target, eased, seed)
}

/**
 * The island's hand-edited approach for one bridge, if it has one.
 *
 * These live in the island's ordinary `roads` array, marked with
 * `approachTo: '<island id>'`:
 *
 *   roads: [
 *     { approachTo: 'hub', points: [ {x,z}, {x,z}, ... ] }
 *   ]
 *
 * Keeping them there rather than in a separate list means the map editor
 * can select, drag and delete them with the machinery it already has -
 * and deleting one simply hands the road back to the generator.
 */
export function getApproach(island, def) {
  if (!island || !def || !Array.isArray(island.roads)) return null

  const otherId = def.from === island.id ? def.to : def.from
  const found = island.roads.find(r => r.approachTo === otherId)

  return found && Array.isArray(found.points) && found.points.length >= 2
    ? found
    : null
}

/** The approach road on one island, as world-space points. */
function approachPath(island, dx, dz, def, towardCentre) {
  const dist = Math.hypot(dx, dz)
  const ux = dx / dist
  const uz = dz / dist
  const shore = shoreDistance(island, dx, dz)

  if (island.noAutoRoad && !getApproach(island, def)) {
    return [{ x: island.x + ux * shore, z: island.z + uz * shore }]
  }

  const controls = approachControls(island, dx, dz, def)
  const sampled = sampleSpline(controls, { samplesPerSpan: ROAD_SMOOTHNESS })

  // Sampled shore -> centre. Reverse when we want centre -> shore.
  const ordered = towardCentre ? sampled : [...sampled].reverse()
  return ordered.map(p => ({ x: island.x + p.x, z: island.z + p.z }))
}

/**
 * One continuous road per bridge, in world coordinates:
 *
 *   island A centre -> A shore -> across the bridge -> B shore -> B centre
 *
 * Built as a single path so there is no join between the island road and
 * the bridge deck. The corners where they meet are rounded off, and the
 * bridge span is sampled densely enough that the smoothing leaves it
 * straight - a road that wandered off a rigid deck would look worse than
 * the seam it replaced.
 */
export function getBridgeRoadPaths() {
  const paths = []

  for (const def of BRIDGES) {
    const a = getIsland(def.from)
    const b = getIsland(def.to)
    if (!a || !b) continue

    const dx = b.x - a.x
    const dz = b.z - a.z
    const dist = Math.hypot(dx, dz)
    if (dist === 0) continue

    const ux = dx / dist
    const uz = dz / dist
    const aShore = shoreDistance(a, dx, dz)
    const bShore = shoreDistance(b, -dx, -dz)

    const points = []

    // Down island A, centre first
    points.push(...approachPath(a, dx, dz, def, false))

    // Straight across the bridge. Several points keep it straight through
    // the smoothing pass.
    //
    // These MUST pick up exactly where the approach roads left off. The
    // deck itself starts slightly further back (shore - 1.5) so it tucks
    // under the land, but starting the road there would send it half a
    // unit backwards - a cusp, which collapses the ribbon to zero width
    // and leaves a hole across the road.
    const startDist = Math.max(2, aShore - 1)
    const endDist = dist - Math.max(2, bShore - 1)
    const span = endDist - startDist

    if (span > 0) {
      const steps = Math.max(2, Math.round(span / 2.5))
      for (let i = 0; i <= steps; i++) {
        const t = startDist + span * (i / steps)
        points.push({ x: a.x + ux * t, z: a.z + uz * t })
      }
    }

    // Up island B, ending at its centre
    points.push(...approachPath(b, -dx, -dz, def, true))

    // Even out the spacing before smoothing. The approach roads arrive
    // finely sampled and the bridge span coarsely, and a corner only gets
    // rounded over about the length of its neighbouring segments - so
    // where points are packed tightly the junction stays sharp, and a
    // sharp corner pinches the road ribbon shut.
    paths.push({
      points: smoothRoad(points, DEFAULT_ROAD_WIDTH),
      width: DEFAULT_ROAD_WIDTH
    })
  }

  return paths
}

/** Turn 'centre' or { x, z } into a plain point. */
function resolvePoint(point) {
  if (point === 'centre' || point === 'center') return { x: 0, z: 0 }
  if (point && typeof point.x === 'number' && typeof point.z === 'number') {
    return { x: point.x, z: point.z }
  }
  return null
}

/**
 * Shortest distance from an island-local point to any road on that island.
 * World.js uses this to keep props from spawning in the road.
 */
export function distanceToNearestRoad(roads, localX, localZ) {
  let best = Infinity

  for (const road of roads) {
    // Distance to the curve itself, then back off by half the road width
    const dist = distanceToPath(road.points, localX, localZ) - road.width / 2
    if (dist < best) best = dist
  }

  return best
}

/** Half-extent of the whole map, so the minimap can auto-fit any layout. */
export function getMapExtent() {
  let max = 1
  for (const island of ISLANDS) {
    max = Math.max(max, Math.hypot(island.x, island.z) + islandReach(island))
  }
  return max * 1.08 // a little breathing room
}

/**
 * Sanity-check the map and report problems in the console.
 * Called once at startup so hand-editing fails loudly instead of
 * silently producing a broken world.
 */
export function validateLayout() {
  const problems = []
  const warnings = []
  const ids = new Set()

  for (const island of ISLANDS) {
    if (ids.has(island.id)) problems.push(`Duplicate island id: "${island.id}"`)
    ids.add(island.id)

    if (typeof island.x !== 'number' || typeof island.z !== 'number') {
      problems.push(`Island "${island.id}" is missing x/z`)
    }
    if (!island.radius || island.radius <= 0) {
      problems.push(`Island "${island.id}" needs a positive radius`)
    }
  }

  // Overlapping landmasses. Checked along the line between the two
  // centres, using each island's real coastline rather than its radius,
  // so a long thin island doesn't false-alarm on its narrow axis.
  for (let i = 0; i < ISLANDS.length; i++) {
    for (let j = i + 1; j < ISLANDS.length; j++) {
      const a = ISLANDS[i]
      const b = ISLANDS[j]
      const dx = b.x - a.x
      const dz = b.z - a.z
      const centreDist = Math.hypot(dx, dz)
      if (centreDist === 0) {
        problems.push(`Islands "${a.id}" and "${b.id}" sit on the same spot`)
        continue
      }

      const gap = centreDist - shoreDistance(a, dx, dz) - shoreDistance(b, -dx, -dz)

      if (gap < 0) {
        problems.push(
          `Islands "${a.id}" and "${b.id}" overlap by ${(-gap).toFixed(1)} units`
        )
      } else if (gap < 4) {
        warnings.push(
          `Islands "${a.id}" and "${b.id}" are only ${gap.toFixed(1)} units apart - ` +
          `their bridge will be very short`
        )
      }
    }
  }

  // Bridges
  for (const def of BRIDGES) {
    if (!getIsland(def.from)) problems.push(`Bridge references unknown island "${def.from}"`)
    if (!getIsland(def.to)) problems.push(`Bridge references unknown island "${def.to}"`)
    if (def.from === def.to) problems.push(`Bridge from "${def.from}" to itself`)

    const resolved = resolveBridge(def)
    if (resolved && resolved.length <= 0) {
      problems.push(
        `Bridge "${def.from}" - "${def.to}" has no length; the islands are touching`
      )
    }
  }

  // Buildings you placed by hand that the monorail will shorten.
  //
  // Generated buildings get quietly capped, which is fine - nobody chose
  // their height. One you positioned yourself is different: it will still
  // be built, but lower than you asked for, and without being told you'd
  // assume the file was being ignored.
  const route = getMonorailRoute()
  if (route) {
    for (const island of ISLANDS) {
      for (const building of island.buildings || []) {
        const x = island.x + (building.x || 0)
        const z = island.z + (building.z || 0)
        const floors = building.floors || 3
        const allowed = monorailFloors(route, x, z, floors)

        if (allowed < floors) {
          warnings.push(
            `A building on "${island.id}" at (${x.toFixed(0)}, ${z.toFixed(0)}) sits ` +
            `under the monorail, so it will be built ${allowed} floors ` +
            `instead of ${floors}. Move it clear of the line to keep its height.`
          )
        }
      }
    }
  }

  // Reachability from the spawn island
  const spawn = getSpawnIsland()
  if (spawn) {
    const reached = new Set([spawn.id])
    const queue = [spawn.id]

    while (queue.length) {
      const current = queue.shift()
      for (const def of BRIDGES) {
        let next = null
        if (def.from === current) next = def.to
        else if (def.to === current) next = def.from
        if (next && !reached.has(next) && getIsland(next)) {
          reached.add(next)
          queue.push(next)
        }
      }
    }

    for (const island of ISLANDS) {
      if (!reached.has(island.id)) {
        warnings.push(
          `Island "${island.id}" can't be driven to - it has no bridge path ` +
          `from "${spawn.id}"`
        )
      }
    }
  }

  if (problems.length) {
    console.error(
      '[Map] Problems found in islandLayout.js:\n  - ' + problems.join('\n  - ')
    )
  }
  if (warnings.length) {
    console.warn(
      '[Map] Warnings for islandLayout.js:\n  - ' + warnings.join('\n  - ')
    )
  }
  if (!problems.length && !warnings.length) {
    console.info(
      `[Map] Layout OK - ${ISLANDS.length} islands, ${BRIDGES.length} bridges.`
    )
  }

  return { problems, warnings }
}

// ---------------------------------------------------------------------------
// FLYING
// ---------------------------------------------------------------------------

/**
 * The air routes: stands, the taxiway, the two runway thresholds, the fixes
 * an aircraft flies to, and the points off the edge of the world.
 *
 * Derived from the airport the same way the sea graph is derived from the
 * ports. Nothing is stored, so moving an island re-sites the airport and the
 * routes follow it.
 */
export function getAirGraph(airport = getAirport()) {
  if (!airport) return null

  const { along, across, runway, stands, taxiway } = airport

  // The two ends of the runway, each with the fix an aircraft lines up on.
  // A threshold is a DIRECTION as much as a place: which way you land tells
  // you which way the approach lies, and getting that backwards would put
  // aircraft landing downwind into the terminal.
  const ends = [0, 1].map(i => {
    const at = i === 0 ? runway.from : runway.to
    const other = i === 0 ? runway.to : runway.from
    const dx = other.x - at.x
    const dz = other.z - at.z
    const len = Math.hypot(dx, dz) || 1
    const dir = { x: dx / len, z: dz / len }   // the way you travel on landing

    return {
      at,
      dir,
      heading: Math.atan2(dir.x, dir.z),
      // Where the wheels touch: into the runway, not on its very edge.
      touchdown: { x: at.x + dir.x * PLANE_LENGTH, z: at.z + dir.z * PLANE_LENGTH },
      // Lined up on the approach, out and high.
      approach: {
        x: at.x - dir.x * AIRPORT_APPROACH_RUN,
        z: at.z - dir.z * AIRPORT_APPROACH_RUN,
        y: AIRPORT_APPROACH_HEIGHT
      },
      // And where a departure has climbed to by the time it leaves the circuit.
      climbout: {
        x: other.x + dir.x * AIRPORT_APPROACH_RUN,
        z: other.z + dir.z * AIRPORT_APPROACH_RUN,
        y: AIRPORT_APPROACH_HEIGHT
      }
    }
  })

  // Where a landing turns off, and where a departure joins: the taxiway ends.
  const exits = [taxiway.from, taxiway.to]

  // Off the edge of the world, well past the fog, at cruising height. Same
  // idea as the shipping: an aircraft that leaves is re-used as one arriving
  // from somewhere else, so departures and arrivals balance without anything
  // counting them.
  const offworld = []
  for (let i = 0; i < OFF_WORLD_NODES; i++) {
    const angle = (i / OFF_WORLD_NODES) * Math.PI * 2
    offworld.push({
      x: Math.sin(angle) * OFF_WORLD_RADIUS,
      z: Math.cos(angle) * OFF_WORLD_RADIUS,
      y: PLANE_CRUISE_HEIGHT
    })
  }

  return { airport, ends, exits, stands, offworld, along, across }
}

/**
 * How far out an aircraft is established on the approach, and how high.
 *
 * The run is what makes a landing read as a landing rather than a drop: at
 * PLANE_SPEED_APPROACH it is several seconds of visible straight-and-level
 * before the wheels touch. The height is set from that run and the gradient a
 * real approach uses - about one in sixteen - rather than picked, so
 * lengthening the approach does not quietly make it a dive.
 */
export const AIRPORT_APPROACH_RUN = 320
export const AIRPORT_APPROACH_HEIGHT = AIRPORT_APPROACH_RUN / 16

/**
 * The fleet, spread across the phases so the airport is not empty at start-up
 * and not all-at-once either.
 *
 * **Stands are claimed here, not on arrival.** The ships taught this one: the
 * bug was never during a voyage, it was `makeShips` picking start berths
 * freely and putting two hulls in the same water on frame one. Start-up state
 * needs the same invariants as the running simulation.
 */
export function makePlanes(graph, fleet = PLANE_FLEET) {
  const planes = []
  if (!graph || !graph.stands.length) return planes

  let seed = 24601
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  const takenStands = new Set()

  for (let i = 0; i < fleet; i++) {
    // Half the fleet starts on stand, the rest strung out on the way in, so
    // the first thing you see is an airport working rather than one waiting.
    const onStand = i % 2 === 0
    const free = graph.stands.filter(s => !takenStands.has(s.index))
    if (!free.length) break

    const stand = free[Math.floor(rand() * free.length) % free.length]
    takenStands.add(stand.index)

    const plane = {
      id: i,
      stand: stand.index,
      end: i % 2,                       // which runway direction it uses
      phase: onStand ? 'stand' : 'inbound',
      // Staggered, so four aircraft don't all push back together.
      timer: onStand ? PLANE_TURNAROUND * (0.2 + rand() * 0.8) : 0,
      progress: onStand ? 0 : rand() * 0.6,
      from: Math.floor(rand() * graph.offworld.length) % graph.offworld.length,
      boarding: onStand
    }

    plane.path = planePath(graph, plane)
    planes.push(plane)
  }

  return planes
}

/**
 * The route for whatever an aircraft is currently doing.
 *
 * Every phase is a measured path and a speed, so one piece of machinery moves
 * everything - the same `measurePath` / `pointAlong` the ships and the trains
 * use. There is no second implementation of "something moving along a fixed
 * line at a known rate" anywhere in this project and there should not be one.
 */
function planePath(graph, plane) {
  const end = graph.ends[plane.end]
  const other = graph.ends[1 - plane.end]
  const stand = graph.stands.find(s => s.index === plane.stand) || graph.stands[0]
  const exit = nearestPoint(graph.exits, end.touchdown)

  switch (plane.phase) {
    case 'inbound':
      return measurePath([
        { ...graph.offworld[plane.from], y: PLANE_CRUISE_HEIGHT },
        { ...end.approach }
      ])

    case 'finals':
      return measurePath([
        { ...end.approach },
        { x: end.touchdown.x, z: end.touchdown.z, y: 0 }
      ])

    case 'rollout':
      return measurePath([
        { x: end.touchdown.x, z: end.touchdown.z, y: 0 },
        { x: exit.x, z: exit.z, y: 0 }
      ])

    case 'taxiIn':
      return measurePath([
        { x: exit.x, z: exit.z, y: 0 },
        { x: stand.hold.x, z: stand.hold.z, y: 0 },
        { x: stand.x, z: stand.z, y: 0 }
      ])

    case 'taxiOut': {
      // Out to the far end and line up: you take off INTO the direction the
      // other threshold faces, which is why this walks to `other`.
      const lineup = nearestPoint(graph.exits, other.at)
      return measurePath([
        { x: stand.x, z: stand.z, y: 0 },
        { x: stand.hold.x, z: stand.hold.z, y: 0 },
        { x: lineup.x, z: lineup.z, y: 0 },
        { x: other.at.x, z: other.at.z, y: 0 }
      ])
    }

    case 'takeoff':
      return measurePath([
        { x: other.at.x, z: other.at.z, y: 0 },
        { x: other.touchdown.x, z: other.touchdown.z, y: 0 },
        { ...other.climbout }
      ])

    case 'outbound':
      return measurePath([
        { ...other.climbout },
        { ...graph.offworld[plane.from], y: PLANE_CRUISE_HEIGHT }
      ])

    default:
      return measurePath([{ x: stand.x, z: stand.z, y: 0 },
                          { x: stand.x, z: stand.z, y: 0 }])
  }
}

/** Whichever of these is closest to a point. */
function nearestPoint(points, to) {
  let best = points[0]
  let bd = Infinity
  for (const p of points) {
    const d = Math.hypot(p.x - to.x, p.z - to.z)
    if (d < bd) { bd = d; best = p }
  }
  return best
}

/** How fast an aircraft moves in each phase. */
function planeSpeed(phase) {
  switch (phase) {
    case 'inbound':
    case 'outbound': return PLANE_SPEED_CRUISE
    case 'finals': return PLANE_SPEED_APPROACH
    case 'rollout': return PLANE_SPEED_APPROACH * 0.7
    case 'takeoff': return PLANE_SPEED_APPROACH
    case 'taxiIn':
    case 'taxiOut': return PLANE_SPEED_TAXI
    default: return 0
  }
}

/** What each phase does when it finishes. */
const PLANE_NEXT = {
  inbound: 'finals',
  finals: 'rollout',
  rollout: 'taxiIn',
  taxiIn: 'stand',
  stand: 'taxiOut',
  taxiOut: 'takeoff',
  takeoff: 'outbound',
  outbound: 'inbound'
}

/** Which phases have the aircraft on the runway itself. */
const ON_RUNWAY = new Set(['finals', 'rollout', 'takeoff'])

/**
 * Move the fleet on.
 *
 * **One aircraft on the runway at a time**, which is the whole of the
 * separation rule and the only thing here that can block. A landing already
 * committed is never held - there is nowhere for it to wait - so the runway is
 * claimed at the point an aircraft would BEGIN using it and held until it is
 * clear. Anything else queues on the ground, where queueing is free.
 *
 * That asymmetry is deliberate and it is the same lesson the traffic learned
 * the hard way: a rule that can stop something with nowhere to stop is a rule
 * that produces a deadlock.
 */
export function stepPlanes(graph, planes, delta) {
  if (!graph) return

  // Who has the runway. A committed landing outranks anything on the ground.
  let runway = null
  for (const plane of planes) {
    if (!ON_RUNWAY.has(plane.phase)) continue
    if (!runway || plane.phase === 'finals') runway = plane
  }

  for (const plane of planes) {
    if (plane.phase === 'stand') {
      plane.timer -= delta
      plane.boarding = true
      if (plane.timer <= 0) {
        plane.boarding = false
        advance(graph, plane)
      }
      continue
    }

    // Waiting for the runway to clear. Two places can hold, and they are the
    // two places where holding is free:
    //
    //   taxiOut - stopped at the holding point, which is what it is for;
    //   inbound - still out at the approach fix, where an aircraft can be
    //             turned round and brought back in.
    //
    // Nothing holds once it is on finals. By then it is committed and there is
    // nowhere to wait, which is precisely the shape of rule the traffic
    // learned the hard way: a rule that can stop something with nowhere to
    // stop is a rule that produces a deadlock. Holding only `taxiOut` left
    // landings queueing up behind a rollout - 980 frames of two aircraft on
    // the runway in six minutes.
    const canHold = plane.phase === 'taxiOut' || plane.phase === 'inbound'
    if (canHold && plane.progress >= 0.999 && runway && runway !== plane) {
      plane.holding = true
      continue
    }
    plane.holding = false

    const length = plane.path.length || 1
    plane.progress += (planeSpeed(plane.phase) * delta) / length

    if (plane.progress >= 1) {
      plane.progress = 1
      // Don't enter the runway while somebody else is on it.
      if (canHold && runway && runway !== plane) continue
      advance(graph, plane)
      // Whatever just took the runway holds it against everyone else this
      // frame, or two aircraft cleared into it in the same step.
      if (ON_RUNWAY.has(plane.phase)) runway = plane
    }
  }
}

function advance(graph, plane) {
  plane.phase = PLANE_NEXT[plane.phase] || 'stand'
  plane.progress = 0

  if (plane.phase === 'stand') {
    plane.timer = PLANE_TURNAROUND
    plane.arrivals = (plane.arrivals || 0) + 1
  }

  if (plane.phase === 'inbound') {
    // Re-used as an arrival from somewhere else, exactly as a hull is. The
    // aircraft that left is not the one that comes back, and nobody can tell.
    plane.from = (plane.from + 3) % graph.offworld.length
    plane.end = 1 - plane.end
    plane.departures = (plane.departures || 0) + 1
  }

  plane.path = planePath(graph, plane)
}

/**
 * Where an aircraft is right now, and which way it is pointing.
 *
 * Height comes from the path, so a descent is a property of the route rather
 * than a thing the renderer works out for itself - the trains taught that one:
 * anything with logic in it belongs where a test can run it.
 */
export function planePosition(graph, plane) {
  const at = pointAlong(plane.path, plane.progress * plane.path.length)
  const ahead = pointAlong(plane.path,
    Math.min(plane.path.length, plane.progress * plane.path.length + 2))

  const dx = ahead.x - at.x
  const dz = ahead.z - at.z
  const heading = (dx || dz) ? Math.atan2(dx, dz) : 0

  // Pitch from the climb or descent actually being flown, not from the phase.
  const run = Math.hypot(dx, dz) || 1
  const pitch = Math.atan2((ahead.y || 0) - (at.y || 0), run)

  return {
    x: at.x,
    y: (at.y || 0) + PIER_DECK_Y,
    z: at.z,
    heading,
    pitch,
    onGround: !ON_RUNWAY.has(plane.phase) || (at.y || 0) < 0.5,
    boarding: plane.phase === 'stand'
  }
}

// ---------------------------------------------------------------------------
// HELICOPTERS
// ---------------------------------------------------------------------------

/**
 * Rooftop pads, ground pads, and the machines that use them.
 *
 * A helicopter needs far less than an aircraft - no runway, no taxiway, just
 * somewhere flat and something above it that is nothing. So the whole problem
 * is clearance, and there is exactly one thing in this world that takes it
 * away: the monorail beam, which runs 9.5 to 11 units up straight over the
 * towns. A pad under it has no way out.
 */
/**
 * The pad is sized off the ROOF it has to sit on, not off the helicopter.
 *
 * A town plot is 9 by 8, so a 9-unit pad fits none of them once you want any
 * margin - and the first version placed zero rooftop pads in the entire world
 * while looking perfectly reasonable. Tied to the plot depth so it cannot come
 * adrift from it again.
 *
 * The ROTOR may overhang the pad, as it does on real rooftop pads, so that is
 * sized off the airframe instead.
 */
export const HELIPAD_SIZE = DEFAULT_PLOT_DEPTH - 2
export const HELI_ROTOR = 11
export const HELI_LENGTH = 12

/**
 * How much clear air a pad needs above it before a machine can lift off.
 *
 * A rotor's width, so the disc clears whatever it is sitting between, plus a
 * little. Anything less and the pad is decorative.
 */
export const HELIPAD_HEADROOM = HELI_ROTOR + 4

/** How many floors a rooftop pad's building gets, where the beam allows. */
export const HELIPAD_FLOORS = 5
export const FLOOR_HEIGHT = 2.5

/** Cruise height, speeds, and how long one sits on the pad. */
export const HELI_CRUISE_HEIGHT = 46
export const HELI_SPEED_CRUISE = 22
export const HELI_SPEED_CLIMB = 7
export const HELI_TURN_RATE = 0.8
export const HELI_DWELL = 22
export const HELI_FLEET = 3

let helipadCache = null

/**
 * Every pad in the world: on rooftops where a town has them, on the ground
 * where it doesn't.
 *
 * Derived, and each one measured for the thing that actually matters - open
 * air above it. `monorailCeiling()` states how tall anything may be at a
 * point, and a pad has to clear that by a rotor's width, not merely fit under
 * it: a machine that can sit on a pad and never leave is worse than no pad.
 */
export function getHelipads() {
  if (helipadCache) return helipadCache

  const route = getMonorailRoute()
  const pads = []

  for (const island of ISLANDS) {
    const roads = getIslandRoads(island)

    // Rooftops first, on the islands that have towns to put them on. Plots are
    // spaced apart so two pads are never on adjacent roofs, which would read
    // as a heliport rather than as a city with a few pads on it.
    const plots = getTownPlots(island)
    let taken = 0
    for (let i = 0; i < plots.length && taken < 2; i += 7) {
      const plot = plots[i]
      const x = island.x + plot.x
      const z = island.z + plot.z

      // How tall this building may be, and therefore where its roof lands.
      const floors = monorailFloors(route, x, z, HELIPAD_FLOORS, FLOOR_HEIGHT)
      if (floors < 3) continue                    // a pad on a bungalow is odd

      const roof = groundHeight(x, z) + floors * FLOOR_HEIGHT
      const ceiling = monorailCeiling(route, x, z)
      if (ceiling !== Infinity &&
          ceiling - floors * FLOOR_HEIGHT < HELIPAD_HEADROOM) continue

      // The pad must fit the roof it sits on, with a margin either side.
      if (Math.min(plot.width, plot.depth) < HELIPAD_SIZE + 1) continue

      pads.push({
        kind: 'roof', island: island.id, x, z, y: roof,
        heading: (plot.rotation || 0) * Math.PI / 180,
        floors
      })
      taken++
    }

    // And a pad on the ground, clear of the roads and of the beam. Islands
    // without towns get one too - that is the point of them: somewhere to fly
    // to that isn't a city.
    const ground = findGroundPad(island, roads, route)
    if (ground) pads.push(ground)
  }

  helipadCache = pads
  return pads
}

/**
 * Somewhere flat on an island for a ground pad.
 *
 * Swept like the ports are, and tested as a RECTANGLE against the roads
 * rather than as the circle round it - the mistake that once placed no fire
 * stations at all, because a town with streets every 34 units has 16 clear
 * units nowhere.
 */
function findGroundPad(island, roads, route) {
  const reach = islandReach(island)

  for (let ring = 0.35; ring <= 0.75; ring += 0.1) {
    for (let a = 0; a < 360; a += 15) {
      const angle = (a * Math.PI) / 180
      const localX = Math.sin(angle) * reach * ring
      const localZ = Math.cos(angle) * reach * ring
      const x = island.x + localX
      const z = island.z + localZ

      // On land, with room for the pad and a margin.
      if (inlandDistance(island, localX, localZ) < HELIPAD_SIZE) continue

      // Clear of every road, by the pad's own half-diagonal.
      const half = Math.hypot(HELIPAD_SIZE, HELIPAD_SIZE) / 2
      if (distanceToNearestRoad(roads, localX, localZ) < half + 4) continue

      // And open air above it.
      const ceiling = monorailCeiling(route, x, z)
      if (ceiling !== Infinity && ceiling < HELIPAD_HEADROOM) continue

      return {
        kind: 'ground', island: island.id, x, z,
        y: groundHeight(x, z), heading: angle, floors: 0
      }
    }
  }

  return null
}

/**
 * The machines, spread across the pads.
 *
 * **A pad is claimed at departure, not on arrival**, and claimed here at
 * start-up too. That is the ships' lesson written down once and applied every
 * time since: the bug was never during a voyage, it was `makeShips` picking
 * start berths freely and putting two hulls in the same water on frame one.
 */
export function makeHelicopters(pads = getHelipads(), fleet = HELI_FLEET) {
  const machines = []
  if (pads.length < 2) return machines

  let seed = 7331
  const rand = () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }

  const claimed = new Set()

  for (let i = 0; i < fleet && claimed.size < pads.length; i++) {
    let home = Math.floor(rand() * pads.length) % pads.length
    let guard = 0
    while (claimed.has(home) && guard++ < pads.length) {
      home = (home + 1) % pads.length
    }
    if (claimed.has(home)) break
    claimed.add(home)

    machines.push({
      id: i,
      pad: home,
      target: home,
      phase: 'parked',
      timer: HELI_DWELL * (0.3 + rand() * 1.2),
      progress: 0,
      heading: pads[home].heading,
      path: null
    })
  }

  return machines
}

/** Where a machine is going next: any pad but the one it is standing on. */
function nextPad(pads, from, rand) {
  if (pads.length < 2) return from
  let to = Math.floor(rand * pads.length) % pads.length
  if (to === from) to = (to + 1) % pads.length
  return to
}

/**
 * Fly them.
 *
 * Three phases and nothing else: straight up, across, straight down. A
 * helicopter is the one thing in this world that can stop in mid-air, so it
 * needs no separation rule - two of them cannot want the same piece of sky
 * for long, and they cannot want the same PAD at all, because a pad is
 * reserved before anyone sets off for it.
 */
export function stepHelicopters(pads, machines, delta, elapsed = 0) {
  if (!pads.length) return

  const reserved = new Set(machines.map(m => m.target))

  for (const machine of machines) {
    const pad = pads[machine.pad]

    switch (machine.phase) {
      case 'parked': {
        machine.timer -= delta
        if (machine.timer > 0) break

        // Somewhere to go, and it has to be free before setting off.
        const wanted = nextPad(pads, machine.pad,
                               (machine.id * 0.37 + elapsed * 0.013) % 1)
        if (reserved.has(wanted) && wanted !== machine.pad) {
          machine.timer = 2                   // wait, try again shortly
          break
        }
        reserved.add(wanted)
        machine.target = wanted
        machine.phase = 'climb'
        machine.progress = 0
        break
      }

      case 'climb': {
        machine.progress += (HELI_SPEED_CLIMB * delta) / HELI_CRUISE_HEIGHT
        if (machine.progress >= 1) {
          machine.progress = 0
          machine.phase = 'cruise'
          const to = pads[machine.target]
          machine.path = measurePath([
            { x: pad.x, z: pad.z, y: pad.y + HELI_CRUISE_HEIGHT },
            { x: to.x, z: to.z, y: to.y + HELI_CRUISE_HEIGHT }
          ])
        }
        break
      }

      case 'cruise': {
        const length = machine.path.length || 1
        machine.progress += (HELI_SPEED_CRUISE * delta) / length
        if (machine.progress >= 1) {
          machine.progress = 0
          machine.phase = 'descend'
          machine.pad = machine.target
        }
        break
      }

      case 'descend': {
        machine.progress += (HELI_SPEED_CLIMB * delta) / HELI_CRUISE_HEIGHT
        if (machine.progress >= 1) {
          machine.progress = 0
          machine.phase = 'parked'
          machine.timer = HELI_DWELL
          machine.landings = (machine.landings || 0) + 1
        }
        break
      }
    }
  }
}

/**
 * Where a machine is, and which way it points.
 *
 * Headings are TURNED, not set - the same rule the ships needed. A straight
 * set spins the airframe on the spot at the moment it starts moving, which
 * reads as a glitch rather than as a departure.
 */
export function helicopterPosition(pads, machine, delta = 0) {
  const pad = pads[machine.pad]
  let x = pad.x
  let z = pad.z
  let y = pad.y
  let want = machine.heading

  if (machine.phase === 'climb') {
    y = pad.y + HELI_CRUISE_HEIGHT * machine.progress
  } else if (machine.phase === 'descend') {
    y = pad.y + HELI_CRUISE_HEIGHT * (1 - machine.progress)
  } else if (machine.phase === 'cruise' && machine.path) {
    const at = pointAlong(machine.path, machine.progress * machine.path.length)
    x = at.x
    z = at.z
    y = at.y
    want = at.heading
  }

  if (delta > 0) {
    let diff = want - machine.heading
    while (diff > Math.PI) diff -= Math.PI * 2
    while (diff < -Math.PI) diff += Math.PI * 2
    const step = HELI_TURN_RATE * delta
    machine.heading += Math.max(-step, Math.min(step, diff))
  }

  return {
    x, y, z,
    heading: machine.heading,
    // Nose down a little in the cruise, level on the pad. A helicopter that
    // flies dead flat looks like it is being dragged.
    pitch: machine.phase === 'cruise' ? 0.12 : 0,
    flying: machine.phase !== 'parked'
  }
}

// ---------------------------------------------------------------------------
// THE PLAYER'S GARAGE
// ---------------------------------------------------------------------------

/**
 * The garage the player's vehicle comes out of, and goes back into to change.
 *
 * Sized off the widest thing that has to fit through the door, which is the
 * fire engine, plus room either side. That is the fire station's lesson (item
 * 22) written down once: `doorWidth` there is 5.6 against a 2.4-wide engine
 * because the run-in has to be straight and square to the opening, and nothing
 * may swing near a door frame. Same rule, same reason.
 */
export const GARAGE_DOOR_WIDTH = Math.max(...Object.values(TRAFFIC_WIDTHS)) + 3.2
export const GARAGE_WIDTH = GARAGE_DOOR_WIDTH + 6
export const GARAGE_DEPTH = Math.max(...Object.values(TRAFFIC_LENGTHS)) + 6
export const GARAGE_HEIGHT = 7

/** How far in front of the doors a vehicle finishes rolling out. */
export const GARAGE_APRON = 14

let garageCache = null

/**
 * Is this garage, and the drive out of it, clear of the monorail?
 *
 * Checked along the whole roll-out, not just at the building: the point of a
 * garage is getting out of it.
 */
function clearOfMonorail(island, localX, localZ, heading) {
  const route = getMonorailRoute()
  if (!route) return true

  const points = route.points || route
  const need = MONORAIL_CORRIDOR + GARAGE_DOOR_WIDTH / 2 + 2

  // The building's own footprint, and then every step of the way out.
  const steps = []
  for (let t = -0.5; t <= 1.05; t += 0.05) {
    steps.push({
      x: island.x + localX + Math.sin(heading) * (GARAGE_DEPTH / 2 + GARAGE_APRON) * t,
      z: island.z + localZ + Math.cos(heading) * (GARAGE_DEPTH / 2 + GARAGE_APRON) * t
    })
  }

  for (const step of steps) {
    for (const p of points) {
      if (Math.hypot(p.x - step.x, p.z - step.z) < need) return false
    }
  }

  return true
}

/**
 * Where it stands: on the hub, on the plaza, facing the way out.
 *
 * Derived rather than written into the map, like everything else. Three things
 * decide it and they are checked rather than assumed:
 *
 *  1. **It faces the nearest road**, so rolling out points you at somewhere to
 *     go rather than at the sea.
 *  2. **It is clear of the fountain.** The hub's plaza has one at
 *     PLAZA_FOUNTAIN_OFFSET, and a garage dropped on the plaza centre would
 *     sit on top of it.
 *  3. **The building's RECTANGLE is clear of every road** - not the circle
 *     round it. Testing the circle is what once placed no fire stations at all
 *     on a town with streets every 34 units.
 */
export function getPlayerGarage() {
  if (garageCache) return garageCache

  const island = getIsland('hub') || ISLANDS[0]
  if (!island) return null

  const roads = getIslandRoads(island)
  const ring = getIslandRing(island)
  if (!ring) return null

  // The plaza, if there is one - that is the middle of the island and the
  // place a player would look for it.
  const plaza = (island.districts || []).find(d => d.type === 'plaza')
  const centre = { x: plaza ? (plaza.x || 0) : 0, z: plaza ? (plaza.z || 0) : 0 }

  // Sweep round the plaza for a spot that is clear of the fountain and whose
  // whole footprint is off the roads.
  const half = Math.hypot(GARAGE_WIDTH, GARAGE_DEPTH) / 2
  const fountain = { x: centre.x, z: centre.z + PLAZA_FOUNTAIN_OFFSET }
  const reach = plaza ? Math.max(10, plaza.size - GARAGE_DEPTH / 2 - 2) : 18

  let best = null

  for (let ring0 = 0.45; ring0 <= 1.0; ring0 += 0.15) {
    for (let a = 0; a < 360; a += 10) {
      const angle = (a * Math.PI) / 180
      const localX = centre.x + Math.sin(angle) * reach * ring0
      const localZ = centre.z + Math.cos(angle) * reach * ring0

      // Clear of the fountain, by both their half-sizes.
      if (Math.hypot(localX - fountain.x, localZ - fountain.z) < half + 4) continue

      // Face the nearest road, so the way out is obvious.
      const near = nearestOnPath(ring, localX, localZ)
      if (!near) continue
      const heading = Math.atan2(near.x - localX, near.z - localZ)

      if (!rectangleIsClear(island, roads, localX, localZ, heading,
                           GARAGE_WIDTH, GARAGE_DEPTH, 3)) continue

      // And clear of the monorail - the building AND the way out.
      //
      // This was missed first time round, and it is the same shape of mistake
      // as everything else on the tally: the siting asked about roads and
      // about the fountain, and never asked about the thing standing over the
      // plaza. The first site put the roll-out 3.2 units from the beam's
      // centre line, inside its 6-unit corridor, where a pier stands every 27
      // units. Piers slide along the beam to miss ROADS; an apron is not a
      // road, so one could have stood squarely in the doorway.
      if (!clearOfMonorail(island, localX, localZ, heading)) continue

      // The apron in front has to be clear too, or you roll out into a wall.
      const apronX = localX + Math.sin(heading) * (GARAGE_DEPTH / 2 + GARAGE_APRON / 2)
      const apronZ = localZ + Math.cos(heading) * (GARAGE_DEPTH / 2 + GARAGE_APRON / 2)
      if (!rectangleIsClear(island, roads, apronX, apronZ, heading,
                            GARAGE_DOOR_WIDTH, GARAGE_APRON, 1)) continue

      const toRoad = Math.hypot(near.x - localX, near.z - localZ)
      const score = -toRoad
      if (!best || score > best.score) {
        best = { localX, localZ, heading, score, toRoad }
      }
    }
  }

  if (!best) return (garageCache = null)

  garageCache = {
    island: island.id,
    x: island.x + best.localX,
    z: island.z + best.localZ,
    localX: best.localX,
    localZ: best.localZ,
    heading: best.heading,
    width: GARAGE_WIDTH,
    depth: GARAGE_DEPTH,
    height: GARAGE_HEIGHT,
    doorWidth: GARAGE_DOOR_WIDTH,
    // Where a vehicle sits inside, and where it finishes rolling out.
    bay: {
      x: island.x + best.localX,
      z: island.z + best.localZ,
      heading: best.heading
    },
    apron: {
      x: island.x + best.localX + Math.sin(best.heading) * (GARAGE_DEPTH / 2 + GARAGE_APRON),
      z: island.z + best.localZ + Math.cos(best.heading) * (GARAGE_DEPTH / 2 + GARAGE_APRON),
      heading: best.heading
    }
  }

  return garageCache
}
