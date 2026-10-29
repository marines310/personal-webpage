/**
 * Elevated bridges, and the ships that used to sail through them.
 *
 * Mike: "fix the ships clipping/going through the bridges. Lets make that
 * elevated bridge now so we can avoid seeing ships go through bridges like
 * they're not there."
 *
 * The decks were slabs with their top face at y = 0, which is the world's
 * sea-level datum, so every hull passed straight through every one. Measured
 * before the fix: 2,601 ship-frames inside a deck in ten minutes, across three
 * of the seven crossings.
 *
 * Four things have to hold at once, and each gets a section:
 *
 *   1. The arch is a shape you can drive over - continuous, symmetric, and
 *      nowhere steeper than it claims.
 *   2. It is exactly zero at both shores, which is the invariant that lets the
 *      deck be folded into the ground height with a max() and change nothing
 *      on land. The map fingerprint is byte-identical across this change and
 *      that is why.
 *   3. Nothing clips any more, and boats DO still pass under - a fix that
 *      routed every vessel round the outside would measure perfectly and lose
 *      the point.
 *   4. The hulls in World.js are built to the air drafts this depends on.
 *      World.js needs a browser, so it is read as text.
 */
import {
  BRIDGE_RISE,
  BRIDGE_EASE,
  BRIDGE_CHANNEL,
  BRIDGE_DECK_THICKNESS,
  BOAT_AIR_DRAFT,
  CARGO_AIR_DRAFT,
  bridgeGradient,
  bridgeDeckProfile,
  bridgeClearance,
  bridgeAirDraft,
  bridgeFrame,
  bridgeDeckAt,
  measureDeckGradient
} from '../src/world/bridgeDeck.js'
import {
  getBridges,
  getSeaGraph,
  makeShips,
  stepShips,
  shipPosition,
  seaPath,
  legClearance,
  groundHeight,
  WIDEST_HALF_BEAM
} from '../src/world/islandLayout.js'
import { MAX_ROAD_GRADIENT } from '../src/world/terrain.js'
import { readFileSync } from 'node:fs'

let pass = 0, fail = 0
const chk = (n, c, d = '') => {
  c ? (pass++, console.log('  PASS  ' + n))
    : (fail++, console.log('  FAIL  ' + n + '  ' + d))
}
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol

const bridges = getBridges()

/**
 * How steep a bridge deck is allowed to be.
 *
 * DELIBERATELY ABOVE `MAX_ROAD_GRADIENT`, and the reason is worth writing
 * down rather than leaving as a magic number that looks like a mistake.
 *
 * 8% is the limit for ISLAND roads, and it is there because those roads wind
 * across terrain: a car on a cambered bend on a slope has three things going
 * on at once. A bridge deck has none of them - it is dead straight, level
 * across its width, walled on both sides, and 130 units long. The physical
 * cost of the extra gradient is a cosine: at 8% the car keeps 99.7% of its
 * grip, at 12.5% it keeps 99.2%.
 *
 * And the alternative was measured before this number was chosen. At 8%, a
 * deck high enough to clear even a small boat needs 119 units of ramp per
 * side. The bridges are 114-132 long and the islands are 70-100 in radius,
 * with SEVEN crossings meeting at a hub of radius 80. Those ramps would meet
 * in the middle of every island. There is no 8% version of this feature.
 */
const MAX_DECK_GRADIENT = 0.13

// ---------------------------------------------------------------------------
console.log('1. The arch is a shape you can drive over\n')

console.log(`   ${bridges.length} crossings, crown ${BRIDGE_RISE}, ` +
            `deck ${BRIDGE_DECK_THICKNESS} thick`)
for (const b of bridges) {
  console.log(`   ${(b.from.id + '->' + b.to.id).padEnd(18)} span ` +
              `${b.length.toFixed(1).padStart(6)}  ` +
              `grade ${(measureDeckGradient(b.length) * 100).toFixed(1)}%  ` +
              `channel air draft ${bridgeAirDraft(b.length).toFixed(2)}`)
}

chk('every deck reaches the same crown',
    bridges.every(b => near(bridgeDeckProfile(0.5, b.length), BRIDGE_RISE, 1e-9)))

chk('and no deck is steeper than a bridge deck may be',
    bridges.every(b => measureDeckGradient(b.length) <= MAX_DECK_GRADIENT),
    `${Math.max(...bridges.map(b => measureDeckGradient(b.length)))}`)

chk('and the measured gradient is the one the formula claims',
    bridges.every(b =>
      near(measureDeckGradient(b.length), bridgeGradient(b.length), 1e-3)))

// This is the check that documents the exception rather than hiding it: the
// deck IS steeper than any road, on purpose, and if someone ever brings the
// two into line this says so out loud instead of silently passing.
chk('a deck is steeper than an island road, which is the deliberate exception',
    bridges.every(b => measureDeckGradient(b.length) > MAX_ROAD_GRADIENT))

{
  // Continuous: no step anywhere, at a resolution far finer than the mesh.
  let worstStep = 0, at = 0
  for (const b of bridges) {
    let last = bridgeDeckProfile(0, b.length)
    for (let i = 1; i <= 20000; i++) {
      const h = bridgeDeckProfile(i / 20000, b.length)
      if (Math.abs(h - last) > worstStep) { worstStep = Math.abs(h - last); at = i / 20000 }
      last = h
    }
  }
  console.log(`   worst step at 20,000 samples: ${(worstStep * 1000).toFixed(3)}mm`)
  chk('the profile is continuous', worstStep < 0.002, `${worstStep} at t=${at}`)
}

{
  // Symmetric. Written longhand as two halves first, and they disagreed by
  // 4mm at the crown - which is a seam in the road ribbon.
  let worst = 0
  for (const b of bridges) {
    for (let i = 0; i <= 500; i++) {
      const t = i / 1000
      worst = Math.max(worst, Math.abs(
        bridgeDeckProfile(t, b.length) - bridgeDeckProfile(1 - t, b.length)))
    }
  }
  chk('and symmetric about midspan', worst < 1e-9, `${worst}`)
}

{
  // Rises then falls, once. A profile with a dip in it is a puddle you cannot
  // see and a jump you can feel.
  let turns = 0
  const b = bridges[0]
  let last = bridgeDeckProfile(0, b.length)
  let rising = true
  for (let i = 1; i <= 4000; i++) {
    const h = bridgeDeckProfile(i / 4000, b.length)
    const up = h >= last - 1e-12
    if (up !== rising) { turns++; rising = up }
    last = h
  }
  chk('and it climbs once and falls once', turns === 1, `${turns} turning points`)
}

// ---------------------------------------------------------------------------
console.log('\n2. It is exactly zero where it meets the land\n')

chk('the profile is zero at both shores',
    bridges.every(b => bridgeDeckProfile(0, b.length) === 0 &&
                       bridgeDeckProfile(1, b.length) === 0))

// The load-bearing consequence. groundAt() takes max(land, deck), and that is
// only safe because the deck arrives at the coast at the same height the sea
// and the shoreline are already at. Set BRIDGE_EASE to 0 and the deck starts
// with a kink at the shore instead - which is why this is a check and not a
// comment.
chk('so folding it into the ground height changes nothing on land',
    bridges.every(b => {
      for (const t of [0, 0.001, 0.002]) {
        if (bridgeDeckProfile(t, b.length) > 0.02) return false
      }
      return true
    }))

chk('and the easing is what makes that true',
    BRIDGE_EASE > 0 && BRIDGE_EASE < 0.25, `${BRIDGE_EASE}`)

{
  // Off the deck entirely, the answer is zero - so max() is a no-op over open
  // water too, and the sea is still the sea.
  chk('and the deck is zero out at sea',
      bridgeDeckAt(bridges, 400, 400) === 0)
  chk('and zero at the centre of every island',
      bridges.every(b => bridgeDeckAt(bridges, b.from.x, b.from.z) === 0))

  // On the deck it agrees with the profile, which is the same walk World.js
  // builds the mesh and the collider from.
  const b = bridges[0]
  const sin = Math.sin(b.rotationY), cos = Math.cos(b.rotationY)
  let worst = 0
  for (let i = 0; i <= 200; i++) {
    const t = i / 200
    const along = (t - 0.5) * b.length
    const h = bridgeDeckAt(bridges, b.x + sin * along, b.z + cos * along)
    worst = Math.max(worst, Math.abs(h - bridgeDeckProfile(t, b.length)))
  }
  chk('and on the deck it agrees with the profile', worst < 1e-9, `${worst}`)
}

// ---------------------------------------------------------------------------
console.log('\n3. Nothing clips, and boats still go under\n')

console.log(`   channel is +/-${BRIDGE_CHANNEL} of the span - ` +
            `${(2 * BRIDGE_CHANNEL * 114).toFixed(1)} units on the shortest`)
console.log(`   air draft in the channel ${bridgeAirDraft(114).toFixed(2)}, ` +
            `boat ${BOAT_AIR_DRAFT}, cargo ${CARGO_AIR_DRAFT}`)

chk('a boat fits under the channel with room to spare',
    bridgeAirDraft(114) > BOAT_AIR_DRAFT + 0.5,
    `${bridgeAirDraft(114) - BOAT_AIR_DRAFT}`)

// Not excluded by a special case anywhere - excluded by being too tall, which
// is one rule instead of two.
chk('and a cargo ship does not, by a long way',
    bridgeAirDraft(114) < CARGO_AIR_DRAFT / 2,
    `${bridgeAirDraft(114)} vs ${CARGO_AIR_DRAFT}`)

const graph = getSeaGraph()

{
  const channels = graph.nodes.filter(n => n.kind === 'channel')
  console.log(`   ${channels.length} navigation channels in the sea graph`)
  chk('every bridge has a marked channel', channels.length === bridges.length,
      `${channels.length}/${bridges.length}`)

  // A channel nothing can reach is decoration.
  const reachable = channels.filter((n, i) => {
    const index = graph.nodes.indexOf(n)
    return (graph.edges.get(index) || []).length > 0
  })
  chk('and each one is connected to the rest of the sea',
      reachable.length === channels.length,
      `${reachable.length}/${channels.length}`)
}

{
  // Every edge that passes under a deck is tagged with what fits through it.
  let tagged = 0, tight = 0
  for (const [, list] of graph.edges) {
    for (const e of list) {
      if (e.clearance !== undefined && e.clearance !== Infinity) {
        tagged++
        if (e.clearance < BOAT_AIR_DRAFT) tight++
      }
    }
  }
  console.log(`   ${tagged} edges pass under a deck, ${tight} too low for a boat`)
  chk('edges under a deck carry a clearance', tagged > 0, `${tagged}`)
  chk('and the widest hull is what the margin was measured for',
      WIDEST_HALF_BEAM >= 4.75, `${WIDEST_HALF_BEAM}`)
}

/** Sail the fleet and count what goes through a deck. */
function sail(seconds) {
  const g = getSeaGraph()
  const ships = makeShips(g)
  let clips = 0, passes = 0
  const clipKinds = {}
  const passKinds = {}
  const dt = 1 / 30

  for (let f = 0; f < seconds / dt; f++) {
    stepShips(g, ships, dt)
    for (const s of ships) {
      const at = shipPosition(g, s)
      if (!at) continue
      const draft = s.kind === 'cargo' ? CARGO_AIR_DRAFT : BOAT_AIR_DRAFT
      const beam = s.kind === 'cargo' ? 4.75 : 1.9
      for (const b of bridges) {
        const frame = bridgeFrame(b, at.x, at.z, beam)
        if (!frame) continue
        if (bridgeClearance(frame.t, b.length) < draft) {
          clips++
          clipKinds[s.kind] = (clipKinds[s.kind] || 0) + 1
        } else {
          passes++
          passKinds[s.kind] = (passKinds[s.kind] || 0) + 1
        }
      }
    }
  }
  return { ships, clips, passes, clipKinds, passKinds }
}

{
  const out = sail(600)
  console.log(`   ten minutes: ${out.clips} clipping frames, ` +
              `${out.passes} clean passes under a deck`)
  console.log(`   passes by kind: ${JSON.stringify(out.passKinds)}`)

  chk('nothing sails through a bridge', out.clips === 0,
      `${out.clips} ${JSON.stringify(out.clipKinds)}`)

  // The other half of the promise, and the one a lazy fix would fail: it
  // would be trivial to score zero here by routing every vessel round the
  // outside, and the arch would then be scenery.
  chk('but boats do still pass under them', out.passes > 0, `${out.passes}`)
  chk('and it is the boats doing it, not the cargo ships',
      (out.passKinds.boat || 0) > 0 && !(out.passKinds.cargo > 0),
      JSON.stringify(out.passKinds))
}

{
  // THE ORIGINAL BUG. With the deck back at sea level - which is what
  // `rise = 0` reproduces - a boat in the channel does not fit, and the
  // routing that keeps it out of trouble is doing so on the numbers rather
  // than by luck.
  chk('a flat deck leaves no air at all',
      bridgeClearance(0.5, 130, 0) === 0)
  chk('and a boat would not fit under one',
      bridgeClearance(0.5, 130, 0) < BOAT_AIR_DRAFT)

  // And the routing genuinely refuses a tall vessel rather than never being
  // asked. Find a channel and check who may use it.
  const channelIndex = graph.nodes.findIndex(n => n.kind === 'channel')
  const neighbours = graph.edges.get(channelIndex) || []
  const usable = neighbours.filter(e => e.clearance >= BOAT_AIR_DRAFT).length
  const barred = neighbours.filter(e => e.clearance < CARGO_AIR_DRAFT).length
  console.log(`   the first channel: ${neighbours.length} legs, ` +
              `${usable} open to a boat, ${barred} shut to a cargo ship`)
  chk('a boat may use a channel', usable > 0, `${usable}`)
  chk('and a cargo ship may not', barred === neighbours.length,
      `${neighbours.length - barred} legs a cargo ship could take`)
}

{
  // A leg well out at sea is unconstrained, or the whole fleet would be
  // routed as though the map were full of low bridges.
  const open = legClearance({ x: 400, z: 400 }, { x: 460, z: 380 }, bridges)
  chk('open water has no ceiling', open === Infinity, `${open}`)
}

// ---------------------------------------------------------------------------
console.log('\n4. The hulls in World.js are built to these numbers\n')

{
  // World.js needs a browser and cannot be run here, so it is read. This is
  // the same approach worldsanity.mjs takes, and it exists because the air
  // drafts are a CONTRACT between two files that never call each other.
  const world = readFileSync('src/world/World.js', 'utf8')

  chk('the ground follows the deck',
      /bridgeDeckAt\(this\._bridgeDecks, x, z\)/.test(world))
  chk('the deck mesh is built from the profile',
      /bridgeDeckProfile\(t, bridge\.length\)/.test(world))
  chk('the collider is a trimesh, not a stack of boxes',
      /createStaticTrimesh\(\s*\n?\s*new Float32Array\(positions\)/.test(world))
  chk('and the mesh and the collider are built from the same arrays',
      /new Float32Array\(positions\), new Uint32Array\(indices\)/.test(world))
  chk('the railings climb with the deck',
      /deckAt\(mid\) \+ 0\.95/.test(world))

  // The mast. 2.4 tall from y = 3.15 tops out at 4.35 = BOAT_AIR_DRAFT.
  const mast = world.match(
    /CylinderGeometry\(0\.09, 0\.11, ([\d.]+), 6\), trimMat\)\s*\n\s*mast\.position\.set\(0, ([\d.]+), -1\.4\)/)
  chk('the boat has a mast built to a known height', !!mast)
  if (mast) {
    const top = Number(mast[2]) + Number(mast[1]) / 2
    console.log(`   boat mast tops out at ${top}, BOAT_AIR_DRAFT is ${BOAT_AIR_DRAFT}`)
    chk('and it matches BOAT_AIR_DRAFT', near(top, BOAT_AIR_DRAFT, 1e-9),
        `${top} vs ${BOAT_AIR_DRAFT}`)
  }

  // The cargo ship's funnel is its tallest point.
  const funnel = world.match(
    /CylinderGeometry\(1\.1, 1\.3, ([\d.]+), 10\), bootMat\)\s*\n\s*funnel\.position\.set\(0, ([\d.]+),/)
  chk('the cargo ship has a funnel built to a known height', !!funnel)
  if (funnel) {
    const top = Number(funnel[2]) + Number(funnel[1]) / 2
    console.log(`   cargo funnel tops out at ${top}, ` +
                `CARGO_AIR_DRAFT is ${CARGO_AIR_DRAFT}`)
    chk('and it matches CARGO_AIR_DRAFT', near(top, CARGO_AIR_DRAFT, 1e-9),
        `${top} vs ${CARGO_AIR_DRAFT}`)
  }

  // The piers hold the arch up and must not stand in the channel.
  const piers = world.match(/for \(const t of \[([\d.]+), ([\d.]+)\]\)/)
  chk('the piers are placed at named fractions of the span', !!piers)
  if (piers) {
    const clear = [Number(piers[1]), Number(piers[2])].every(
      t => Math.abs(t - 0.5) > BRIDGE_CHANNEL)
    chk('and neither one stands in the navigation channel', clear,
        `${piers[1]}, ${piers[2]} against +/-${BRIDGE_CHANNEL}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
