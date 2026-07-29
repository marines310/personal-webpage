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
  getIslandJunctions
} from './islandLayout.js'
import { insetPolygon, polygonCentroid, rayDistanceToBoundary } from './shapes.js'
import { pathTangents, ribbonQuads } from './curves.js'

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
    this.elapsed = 0

    // Deterministic pseudo-random so the world looks the same each visit
    this._seed = 20260727

    this.createSea()
    this.createIslands()
    this.createBridges()
    this.createConnectingRoads()
    this.createHubSign()
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
      for (const road of roads) {
        if (!road.auto) this.buildRoad(island, road)
      }

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
    const grassRing = insetPolygon(outline, beachWidth)

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

        if (side === 1 && i % 4 === 2) this.addStreetlight(px, pz)
      }
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
    this.placedFootprints = []
    for (const building of island.buildings || []) {
      this.buildPlacedBuilding(island, building)
    }

    for (const district of island.districts || []) {
      this.buildDistrict(island, district, roads)
    }

    this.scatterTheme(island, roads)

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

  /** Is this island-local point clear of every hand-placed building? */
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

      this.addFountain(cx, cz + 6)

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
        this.rand() < 0.78 ? this.addBuilding(x, z) : this.addStreetlight(x, z)
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

      if (theme === 'town') {
        const r = this.rand()
        if (r < 0.62) this.addBuilding(x, z)
        else if (r < 0.82) this.addStreetlight(x, z)
        else this.addPalm(x, z)
      } else if (theme === 'jungle') {
        const r = this.rand()
        if (r < 0.58) this.addPalm(x, z)
        else if (r < 0.82) this.addBush(x, z)
        else if (r < 0.94) this.addRock(x, z)
        else this.addHut(x, z)
      } else if (theme === 'mixed') {
        const r = this.rand()
        if (r < 0.3) this.addBuilding(x, z)
        else if (r < 0.62) this.addPalm(x, z)
        else if (r < 0.85) this.addBush(x, z)
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

      // Only now turn it
      model.rotation.y = rotation
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
    const floors = opts.floors || Math.floor(this.randRange(2, 6))
    const floorHeight = 2.5
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
    // on at night is a single update rather than hundreds
    const windowMat = new THREE.MeshStandardMaterial({
      color: PALETTE.glass,
      roughness: 0.25,
      metalness: 0.4,
      emissive: new THREE.Color(PALETTE.windowLit),
      emissiveIntensity: 0
    })
    this.registerNightLight(windowMat, this.randRange(0.7, 1.5))

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

  addPalm(x, z, beach = false) {
    const modelKey = this.rand() < 0.5 ? 'tree_a' : 'tree_b'

    if (this.assets && this.assets.has(modelKey)) {
      const model = this.assets.clone(modelKey)
      model.position.set(x, 0, z)
      model.rotation.y = this.rand() * Math.PI * 2
      model.scale.multiplyScalar(this.randRange(0.85, 1.25))
      this.game.add(model)
      this.game.physics.createStaticBoxAt(x, 1, z, 0.8, 2, 0.8, 0)
      return
    }

    const group = new THREE.Group()
    const height = this.randRange(4.5, 7.5)
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

  addStreetlight(x, z) {
    if (this.assets && this.assets.has('streetlight')) {
      const model = this.assets.clone('streetlight')
      model.position.set(x, 0, z)
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
    this.registerNightLight(lampMat, 2.6)

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.32), lampMat)
    lamp.position.set(0.75, 4.44, 0)
    group.add(lamp)

    group.position.set(x, 0, z)
    group.rotation.y = this.rand() * Math.PI * 2
    this.game.add(group)
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
  }

  update(delta) {
    this.elapsed += delta

    if (this.seaUniforms) {
      this.seaUniforms.uTime.value = this.elapsed
    }

    const env = this.game.environment
    if (!env) return

    for (const entry of this.swayables) {
      const amount = env.getSway(this.elapsed, entry.phase) * (entry.scale || 1)
      entry.object.rotation.z = amount
      entry.object.rotation.x = amount * 0.6
    }
  }
}
