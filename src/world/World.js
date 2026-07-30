import * as THREE from 'three'
import { Game } from '../core/Game.js'
import {
  ISLANDS,
  ISLAND_DEPTH,
  SEA_LEVEL,
  getBridges,
  getIslandRoads,
  distanceToNearestRoad,
  getSpawnIsland,
  getBridgeRoadPaths,
  validateLayout,
  islandOutline,
  islandReach,
  inlandDistance,
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
  getStations,
  STATION_SETBACK,
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
  PLAZA_FOUNTAIN_OFFSET
} from './islandLayout.js'
import { findWindowFaces, windowGeometry } from './windows.js'
import { insetPolygon, insetPolygonRadial, polygonCentroid, rayDistanceToBoundary } from './shapes.js'
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
    door: 0xe8e2d4, sign: 0xffcf6b
  },
  police: {
    height: 9.5, wall: 0x2f4f7a, trim: 0x223b5d,
    door: 0xdfe6ee, sign: 0x7fc8ff
  },
  hospital: {
    height: 14, wall: 0xf1ece1, trim: 0xd8d0c0,
    door: 0xbfd8e4, sign: 0xff7d7d
  }
}

/** How long a garage door takes to go all the way up, in seconds. */
export const GARAGE_DOOR_TIME = 2.4

export const TRAFFIC_HEIGHTS = {
  sedan: 1.8,
  convertible: 1.5,
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

export class World {
  constructor() {
    this.game = Game.getInstance()
    this.assets = this.game.assets

    // Warn about map mistakes before we try to build anything
    validateLayout()

    // Exposed so the minimap can draw the same geography
    this.layout = { islands: ISLANDS, bridges: getBridges() }

    this.nightEmissives = []  // materials that light up after dark
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
    this.createBusStops()
    this.createStations()
    this.createTraffic()
    this.createHubSign()
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
    pool.position.set(x, 0.15, z)
    this.game.add(pool)
    this.lightPools.push({ mesh: pool, strength })
    return pool
  }

  registerNightLight(material, strength = 1) {
    material.emissive = new THREE.Color(material.emissive || 0x000000)
    this.nightEmissives.push({ material, strength })
    return material
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

    // --- Top face (sand) ---
    const sandTop = this.polygonMesh(outline, cx, 0, cz, {
      color: PALETTE.sand, roughness: 1, metalness: 0, flatShading: true
    })
    sandTop.receiveShadow = true
    this.game.add(sandTop)

    // --- Grass cap, inset so the sand reads as a beach ---
    const beachWidth = Math.max(2, islandReach(island) * 0.13)

    // Radial, not the bisector inset. Pulling a wobbly coastline in by 16
    // units with the bisector method makes the polygon cross itself, and
    // the triangulation then leaves a star-shaped hole with the sand
    // showing through - which is what the pale patch on About was.
    const grassRing = insetPolygonRadial(outline, beachWidth)

    if (grassRing.length >= 3) {
      const grass = this.polygonMesh(grassRing, cx, 0.03, cz, {
        color: PALETTE.grass, roughness: 0.95, metalness: 0, flatShading: true
      })
      grass.receiveShadow = true
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

    this.buildLandCollider(island, outline, cx, cz)
  }

  /**
   * Triangulate a polygon into a flat horizontal mesh at height `y`.
   * Points are island-local; cx/cz place it in the world.
   */
  polygonMesh(points, cx, y, cz, materialOptions) {
    // THREE triangulates in the XY plane, so feed it (x, z) and lay it flat
    const contour = points.map(p => new THREE.Vector2(p.x, p.z))
    const faces = THREE.ShapeUtils.triangulateShape(contour, [])

    const positions = new Float32Array(faces.length * 9)
    let o = 0
    for (const face of faces) {
      // Reversed winding so the surface faces up after the flip below
      for (const idx of [face[2], face[1], face[0]]) {
        positions[o++] = contour[idx].x
        positions[o++] = y
        positions[o++] = contour[idx].y
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
  buildLandCollider(island, outline, cx, cz) {
    const verts = []

    const push = (x, y, z) => { verts.push(x + cx, y, z + cz) }

    // Top surface
    const contour = outline.map(p => new THREE.Vector2(p.x, p.z))
    const faces = THREE.ShapeUtils.triangulateShape(contour, [])
    for (const face of faces) {
      for (const idx of [face[2], face[1], face[0]]) {
        push(contour[idx].x, 0, contour[idx].y)
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
    patch.position.set(x, 0.065, z)
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
        let onAnotherRoad = false
        for (const other of allRoads) {
          if (other === road) continue
          if (!other.street && !other.ring && !other.auto && !other.spur) continue
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

        positions.push(
          l0.x, 0.12, l0.z, r0.x, 0.12, r0.z, l1.x, 0.12, l1.z,
          l1.x, 0.12, l1.z, r0.x, 0.12, r0.z, r1.x, 0.12, r1.z
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
        lamps: this.addTrafficLight(
          island.x + arm.pole.x,
          island.z + arm.pole.z,
          Math.atan2(-arm.x, -arm.z)
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

    group.position.set(x, 0, z)
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
      // Just outside the junction, on the approach itself
      const along = signal.radius + 2.6
      const lx = signal.x + arm.x * along
      const lz = signal.z + arm.z * along

      // Which road is this, and how wide? A crossing has to span the
      // carriageway it's painted on, not a fixed guess.
      let road = null
      let best = Infinity
      for (const r of roads) {
        if (!r.street && !r.ring && !r.auto && !r.spur) continue
        const d = distanceToPath(r.points, lx, lz) - r.width / 2
        if (d < best) { best = d; road = r }
      }

      // Nothing here. This is what put zebra stripes on the sand: the old
      // version laid them on both sides of every arm, so a road that ENDS
      // at the junction got a crossing painted out into the grass beyond.
      if (!road || best > 0.5) continue

      // Square the crossing to the ROAD IT LANDS ON, not to the arm.
      //
      // Approaches within 40 degrees of each other get merged into one, so
      // the surviving arm can point up to 40 degrees away from the road the
      // crossing is actually painted on - which is why some of them sat
      // diagonally across the carriageway.
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
        stripe.position.set(island.x + lx + ox, 0.08, island.z + lz + oz)
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
      positions.push(
        l0.x, 0.1, l0.z, r0.x, 0.1, r0.z, l1.x, 0.1, l1.z,
        l1.x, 0.1, l1.z, r0.x, 0.1, r0.z, r1.x, 0.1, r1.z
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

  buildRoadSurface(path, width, dashOffset = 0, y = 0.06) {
    if (!path || path.length < 2) return

    // ribbonQuads gives one full-width quad per step, already wound to
    // face up. Through a bend tighter than the road is wide the inside
    // edge overlaps itself; that's deliberate, and invisible once the
    // whole slab is one colour at one height.
    const quads = ribbonQuads(path, width)
    if (!quads.length) return

    const positions = []

    for (const { l0, r0, l1, r1 } of quads) {
      positions.push(
        l0.x, y, l0.z,  r0.x, y, r0.z,  l1.x, y, l1.z,
        l1.x, y, l1.z,  r0.x, y, r0.z,  r1.x, y, r1.z
      )
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(positions), 3))

    // The road is flat, so every normal points straight up. Setting them
    // directly rather than deriving them from the triangles means an
    // overlapping fold can't shade itself darker than the rest.
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
  addRoadMarkings(path, tangents, dashOffset = 0, roadY = 0.06) {
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
        dash.position.set(x, markY, z)
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
    const top = MONORAIL_HEIGHT - MONORAIL_BEAM_DEPTH
    const base = pier.island ? 0 : SEA_LEVEL - 2.5
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

    // Stair tower, and a walkway from it to the platform
    const towerHeight = deckY
    const shaft = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, towerHeight, 3.2), concrete)
    shaft.position.set(tower.x, towerHeight / 2, tower.z)
    shaft.rotation.y = heading
    shaft.castShadow = true
    this.game.add(shaft)

    this.game.physics.createStaticBoxAt(
      tower.x, towerHeight / 2, tower.z, 3.2, towerHeight, 3.2, heading)

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
      const at = trafficPosition(this.lanes, v)
      v.mesh.position.set(at.x, 0, at.z)
      v.mesh.rotation.y = at.heading
      v.heading = at.heading
      this.game.add(v.mesh)

      v.body = this.game.physics.createKinematicBox(
        at.x, TRAFFIC_HEIGHTS[v.kind] / 2, at.z,
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

    for (const along of [length * 0.31, -length * 0.31]) {
      for (const side of [1, -1]) {
        const wheel = new THREE.Mesh(geometry, tyre)
        wheel.rotation.z = Math.PI / 2
        wheel.position.set(side * track, radius, along)
        group.add(wheel)
      }
    }
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

    this.addLampsAndTail(group, length, width)
    this.addWheels(group, length, width)
    return group
  }

  /** Headlights that glow at night, and brake lights that come on. */
  addLampsAndTail(group, length, width) {
    const head = new THREE.MeshStandardMaterial({
      color: 0xfff6e0, roughness: 0.3,
      emissive: new THREE.Color(0xfff2cf), emissiveIntensity: 0
    })
    this.registerNightLight(head, 1.4)

    for (const side of [1, -1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.1), head)
      lamp.position.set(side * width * 0.3, 0.78, length / 2 + 0.02)
      group.add(lamp)
    }

    // Kept on the vehicle so updateTraffic can brighten them under braking
    const tailMat = new THREE.MeshStandardMaterial({
      color: 0x6b2620, roughness: 0.5,
      emissive: new THREE.Color(PALETTE.brakeLight), emissiveIntensity: 0.15
    })
    for (const side of [1, -1]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.1), tailMat)
      lamp.position.set(side * width * 0.3, 0.78, -length / 2 - 0.02)
      group.add(lamp)
    }
    group.userData.tail = tailMat
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

    this.addLampsAndTail(group, length, width)
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

    this.addLampsAndTail(group, length, width)
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

    // The ladder, which is what makes it a fire engine at fifty units
    const ladder = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.22, length * 0.72),
      new THREE.MeshStandardMaterial({
        color: PALETTE.beam, roughness: 0.7, metalness: 0.3, flatShading: true
      }))
    ladder.position.set(0, 2.1, -length * 0.1)
    group.add(ladder)

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

    this.addLampsAndTail(group, length, width)
    this.addWheels(group, length, width, 0.58)
    group.userData.beacons = this.addBeacons(group, 2.55, 0.7)
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

    this.addLampsAndTail(group, length, width)
    this.addWheels(group, length, width, 0.52)
    return group
  }

  /**
   * Roof beacons. Returned so updateTraffic can flash them: red one side,
   * blue the other, alternating, which is what reads as a siren without any
   * sound.
   */
  addBeacons(group, height, spread) {
    const beacons = []

    for (const [side, colour] of [[1, PALETTE.sirenRed], [-1, PALETTE.sirenBlue]]) {
      const material = new THREE.MeshStandardMaterial({
        color: colour, roughness: 0.4,
        emissive: new THREE.Color(colour), emissiveIntensity: 0
      })
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.22, 0.3), material)
      lamp.position.set(side * spread, height, 0)
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
      post.position.set(x, 1.4, z)
      post.castShadow = true
      this.game.add(post)

      const flag = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.06), postMat)
      flag.position.set(x, 2.65, z)
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
      roof.position.set(bx, 2.5, bz)
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
    group.position.set(station.x, 0, station.z)
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

    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(9, station.width * 0.5), 1.4, 0.25),
      new THREE.MeshStandardMaterial({
        color: look.sign, emissive: look.sign, emissiveIntensity: 0.35,
        roughness: 0.5, flatShading: true
      }))
    sign.position.set(0, height - 3, deep + 0.4)
    group.add(sign)
    this.registerNightLight(sign.material, 1.1)

    // A hospital gets a cross; a fire station gets its bay numbers implicitly
    // in the door pattern. Cheap, and it reads instantly from the road.
    if (station.kind === 'hospital') {
      const cross = new THREE.MeshStandardMaterial({
        color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.4,
        roughness: 0.6
      })
      const bar = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.2), cross)
      bar.position.set(0, height * 0.62, deep + 0.4)
      group.add(bar)
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.4, 0.2), cross)
      post.position.set(0, height * 0.62, deep + 0.4)
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
      station.x - fx * 0.9, height / 2, station.z - fz * 0.9,
      station.width, height, Math.max(1, station.depth - 1.8), station.heading)

    this.buildStationYard(station)
    station.mesh = group
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

    // From the front wall out to just short of the pavement
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(station.width + 4, STATION_SETBACK - 2),
      new THREE.MeshStandardMaterial({
        color: PALETTE.concrete, roughness: 0.95
      }))
    apron.rotation.x = -Math.PI / 2
    apron.rotation.z = -station.heading
    apron.position.set(
      station.x + fx * (STATION_SETBACK / 2 + station.depth / 2 - 1), 0.05,
      station.z + fz * (STATION_SETBACK / 2 + station.depth / 2 - 1))
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
        line.position.set(
          bay.x + sx * side * wide / 2, 0.07, bay.z + sz * side * wide / 2)
        this.game.add(line)
      }

      const end = new THREE.Mesh(new THREE.PlaneGeometry(wide, 0.2), paint)
      end.rotation.x = -Math.PI / 2
      end.rotation.z = -bay.heading
      end.position.set(
        bay.x - bx * long / 2, 0.07, bay.z - bz * long / 2)
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

    stepTraffic(this.lanes, this.traffic, delta, this.elapsed, player)

    // One flash cycle for the whole city, so the emergency lights beat
    // together rather than each one drifting
    const beat = Math.floor(this.elapsed * SIREN_RATE) % 2 === 0

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

      v.mesh.position.set(v.drawn.x, 0, v.drawn.z)
      v.mesh.rotation.y = v.heading

      // The collider follows the DRAWN position, not the simulated one, or you
      // could bump a car that isn't where you can see it.
      if (v.body) {
        this.game.physics.moveKinematic(v.body, v.drawn.x,
          TRAFFIC_HEIGHTS[v.kind] / 2, v.drawn.z, v.heading)
      }

      // Brake lights, which is most of what makes traffic look like traffic
      const tail = v.mesh.userData.tail
      if (tail) tail.emissiveIntensity = v.speed < 0.5 ? 1.5 : v.why === 'cruise' ? 0.15 : 0.7

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
      shed.position.set(yard.shed.x, 4, yard.shed.z)
      shed.rotation.y = yard.shed.heading
      shed.castShadow = true
      shed.receiveShadow = true
      this.game.add(shed)

      this.game.physics.createStaticBoxAt(
        yard.shed.x, 4, yard.shed.z,
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
      ship.mesh.position.set(at.x, 0, at.z)
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

      ship.mesh.position.set(at.x, Math.sin(phase) * swell * 0.5, at.z)
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

    this.addBuilding(x, z, {
      rotation,
      width,
      depth,
      floors,
      model: def.model,
      colour: def.colour
    })
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

    group.position.set(x, 0, z)
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

    group.position.set(x, 0, z)
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
    bin.position.set(x, 0.42, z)
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
    this.swayables.push({ object: shrub, phase: this.rand() * Math.PI * 2, scale: 0.3 })

    group.position.set(x, 0, z)
    this.game.add(group)
  }

  /** A narrow street tree - tidier than the palms, which are for beaches. */
  addStreetTree(x, z) {
    const model = this.assets && this.assets.get && this.assets.get('tree_a')
    if (model) {
      const tree = model.clone()
      tree.position.set(x, 0, z)
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
    this.swayables.push({ object: canopy, phase: this.rand() * Math.PI * 2, scale: 0.4 })

    group.position.set(x, 0, z)
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
      plaza.position.set(cx, 0.05, cz)
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
    basin.position.set(x, 0.4, z)
    basin.castShadow = true
    basin.receiveShadow = true
    this.game.add(basin)

    const pool = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.0, 0.1, 18),
      new THREE.MeshStandardMaterial({
        color: PALETTE.seaShallow, roughness: 0.15, metalness: 0.5
      })
    )
    pool.position.set(x, 0.82, z)
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
    const modelKey = opts.model ||
      this.pick(['building_a', 'building_b', 'building_c'])
    const rotation = opts.rotation !== undefined
      ? opts.rotation
      : this.rand() * Math.PI * 2

    if (this.assets && this.assets.has(modelKey)) {
      const model = this.assets.clone(modelKey)
      model.position.set(x, 0, z)

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
        x, footprint.y / 2, z,
        footprint.x, footprint.y, footprint.z,
        rotation
      )
      return
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
    if (floors < 1) return

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

    group.position.set(x, 0, z)
    group.rotation.y = rotation
    this.game.add(group)

    this.game.physics.createStaticBoxAt(
      x, height / 2, z, width, height, depth, rotation
    )
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
      model.position.set(x, 0, z)
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
    group.position.set(x, 0, z)
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

    group.position.set(x, 0, z)
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

    group.position.set(x, 0, z)
    group.rotation.y = this.rand() * Math.PI * 2
    this.game.add(group)

    this.game.physics.createStaticBoxAt(x, 1.1, z, 3.2, 2.2, 2.8, 0)
  }

  addRock(x, z) {
    if (this.assets && this.assets.has('rock')) {
      const model = this.assets.clone('rock')
      const s = this.randRange(0.7, 1.4)
      model.position.set(x, 0, z)
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
      model.position.set(x, 0, z)
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

    group.position.set(x, 0, z)
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
  // Per-frame
  // -------------------------------------------------------------
  setTimeOfDay(dayFactor, nightFactor) {
    const glow = Math.pow(nightFactor, 1.4)
    for (const entry of this.nightEmissives) {
      entry.material.emissiveIntensity = glow * entry.strength
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
    this.updateTraffic(delta)
    this.updateGarageDoors(delta)

    const env = this.game.environment
    if (!env) return

    for (const entry of this.swayables) {
      const amount = env.getSway(this.elapsed, entry.phase) * (entry.scale || 1)
      entry.object.rotation.z = amount
      entry.object.rotation.x = amount * 0.6
    }
  }
}
