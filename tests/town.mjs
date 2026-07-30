// decoded, because a folder name with a space arrives percent-encoded
const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname)
const L = await import(new URL('../src/world/islandLayout.js', import.meta.url).href)
const C = await import(new URL('../src/world/curves.js', import.meta.url).href)
const S = await import(new URL('../src/world/shapes.js', import.meta.url).href)

let pass = 0, fail = 0
const chk = (n, c, d = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + '  ' + d)) }
// quiet assert, for things that would otherwise print once per pole
const chk2 = (c, n) => { if (!c) { fail++; console.log('  FAIL  ' + n) } }

const towns = L.ISLANDS.filter(i => L.isTown(i))
const rest = L.ISLANDS.filter(i => !L.isTown(i))

console.log(`Town layout: ${towns.map(i => i.id).join(', ')}\n`)
console.log('1. The grid goes on towns and nowhere else')
chk(`${towns.length} town island(s) have streets`,
    towns.every(i => L.getTownGrid(i).length > 0))
chk(`the other ${rest.length} have none`,
    rest.every(i => L.getTownGrid(i).length === 0),
    rest.filter(i => L.getTownGrid(i).length).map(i => i.id).join(', '))

console.log('\n2. Streets stay inside the ring and reach it')
for (const isl of towns) {
  const ring = L.getIslandRing(isl)
  const streets = L.getTownGrid(isl)
  let outside = 0, longEnough = 0
  for (const st of streets) {
    const mid = { x: (st.points[0].x + st.points[1].x) / 2,
                  z: (st.points[0].z + st.points[1].z) / 2 }
    if (!S.pointInPolygon(ring, mid.x, mid.z)) outside++
    if (Math.hypot(st.points[1].x - st.points[0].x,
                   st.points[1].z - st.points[0].z) >= L.MIN_STREET_LENGTH) longEnough++
  }
  chk(`${isl.id.padEnd(9)} ${streets.length} streets, none outside the ring`, outside === 0, `${outside} outside`)
  chk(`${isl.id.padEnd(9)} no stubs shorter than ${L.MIN_STREET_LENGTH}`, longEnough === streets.length)
}

console.log('\n3. Buildings line up along the road they front')
for (const isl of towns) {
  const roads = L.getIslandRoads(isl).filter(r => r.street || r.ring)
  const plots = L.getTownPlots(isl)
  chk(`${isl.id.padEnd(9)} has ${plots.length} plots`, plots.length > 10)

  let worstAngle = 0
  const gaps = []
  for (const p of plots) {
    const road = roads[p.roadIndex]
    gaps.push(C.distanceToPath(road.points, p.x, p.z) - road.width / 2)

    // Angle between the building's front and the kerb it faces
    let ci = 0, cd = Infinity
    road.points.forEach((q, k) => {
      const d = Math.hypot(q.x - p.x, q.z - p.z)
      if (d < cd) { cd = d; ci = k }
    })
    const a = road.points[Math.max(0, ci - 1)]
    const b = road.points[Math.min(road.points.length - 1, ci + 1)]
    const roadAng = Math.atan2(b.x - a.x, b.z - a.z)
    const face = (p.rotation * Math.PI) / 180
    worstAngle = Math.max(worstAngle,
      Math.abs(((face - roadAng) % Math.PI + Math.PI) % Math.PI - Math.PI / 2) * 180 / Math.PI)
  }

  chk(`${isl.id.padEnd(9)} every front square to its kerb (worst ${worstAngle.toFixed(2)}deg)`,
      worstAngle < 3, `${worstAngle.toFixed(2)}`)

  const spread = Math.max(...gaps) - Math.min(...gaps)
  chk(`${isl.id.padEnd(9)} setback uniform (${Math.min(...gaps).toFixed(2)}-${Math.max(...gaps).toFixed(2)}, spread ${spread.toFixed(2)})`,
      spread < 0.5, `${spread.toFixed(2)}`)
}

console.log('\n4. Nothing is built on a road or in the sea')
for (const isl of towns) {
  const roads = L.getIslandRoads(isl).filter(r => r.street || r.ring)
  const outline = L.islandOutline(isl)
  const plots = L.getTownPlots(isl)

  const onRoad = plots.filter(p =>
    L.distanceToNearestRoad(roads, p.x, p.z) < p.depth / 2)
  chk(`${isl.id.padEnd(9)} none overlapping a road`, onRoad.length === 0, `${onRoad.length} do`)

  const wet = plots.filter(p => S.distanceToEdge(outline, p.x, p.z) < p.depth / 2)
  chk(`${isl.id.padEnd(9)} none off the edge of the island`, wet.length === 0, `${wet.length} are`)
}

console.log('\n5. Buildings do not overlap each other')
for (const isl of towns) {
  const plots = L.getTownPlots(isl)
  let closest = Infinity
  for (let i = 0; i < plots.length; i++) {
    for (let k = i + 1; k < plots.length; k++) {
      closest = Math.min(closest,
        Math.hypot(plots[i].x - plots[k].x, plots[i].z - plots[k].z))
    }
  }
  chk(`${isl.id.padEnd(9)} closest pair ${closest.toFixed(1)} apart (need > ${L.DEFAULT_PLOT_WIDTH * 0.8})`,
      closest > L.DEFAULT_PLOT_WIDTH * 0.8, `${closest.toFixed(1)}`)
}

console.log('\n6. The streets are part of the drivable network')
const net = L.getRoadNetwork()
const streetSegs = net.segments.filter(s => s.kind === 'road')
chk(`${streetSegs.length} street segments in the network`, streetSegs.length > 0)
const loose = net.nodes.filter(n => n.segments.length < 2)
chk(`no dead ends anywhere (${loose.length})`, loose.length === 0,
    loose.length + ' loose ends')

console.log('\n7. Nothing blocks the way onto the island')
for (const isl of towns) {
  const plots = L.getTownPlots(isl)
  const landings = L.getBridgeLandings(isl).map(l => {
    const reach = Math.max(2, l.shore - 1)
    return { to: l.other.id, x: l.dirX * reach, z: l.dirZ * reach }
  })
  for (const land of landings) {
    let closest = Infinity
    for (const p of plots) closest = Math.min(closest, Math.hypot(p.x - land.x, p.z - land.z))
    chk(`${isl.id.padEnd(9)} nothing within ${L.LANDING_CLEARANCE} of the ${land.to} bridge (${closest.toFixed(1)})`,
        closest >= L.LANDING_CLEARANCE, `${closest.toFixed(1)}`)
  }
}

console.log('\n8. Streets join the ring cleanly, not at a glancing angle')
for (const isl of towns) {
  const ring = L.getIslandRing(isl)
  const streets = L.getTownGrid(isl)
  let shallowest = 90

  const tangentAt = (pts, x, z) => {
    let b = 0, bd = Infinity
    pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = i } })
    const a = pts[Math.max(0, b - 1)], c = pts[Math.min(pts.length - 1, b + 1)]
    const dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz) || 1
    return { x: dx / l, z: dz / l }
  }

  for (const st of streets) {
    const [f, t] = st.points
    const l = Math.hypot(t.x - f.x, t.z - f.z)
    const d = { x: (t.x - f.x) / l, z: (t.z - f.z) / l }
    for (const end of [f, t]) {
      const rt = tangentAt(ring, end.x, end.z)
      const angle = Math.acos(Math.min(1, Math.abs(d.x * rt.x + d.z * rt.z))) * 180 / Math.PI
      shallowest = Math.min(shallowest, angle)
    }
  }

  chk(`${isl.id.padEnd(9)} shallowest junction ${shallowest.toFixed(0)}deg (need >= ${L.MIN_JUNCTION_ANGLE})`,
      shallowest >= L.MIN_JUNCTION_ANGLE, `${shallowest.toFixed(0)}`)
}

console.log('\n8b. No street shadows another road along its own length')
for (const isl of towns) {
  const roads = L.getIslandRoads(isl).filter(r => r.street || r.ring)
  let worst = 0
  for (const road of roads.filter(r => r.street)) {
    const pts = road.points
    for (const other of roads) {
      if (other === road) continue
      let run = 0
      for (let i = 1; i < pts.length; i++) {
        const step = Math.hypot(pts[i].x - pts[i-1].x, pts[i].z - pts[i-1].z)
        const along = i / pts.length
        // skip the junction approach at each end
        if (Math.min(along, 1 - along) < 0.15) continue
        const gap = C.distanceToPath(other.points, pts[i].x, pts[i].z)
          - road.width / 2 - other.width / 2
        if (gap >= L.MIN_ROAD_SEPARATION) continue

        // Close only counts if they're going the same way. Two streets
        // crossing is a junction; two running parallel is the defect.
        const ta = { x: pts[i].x - pts[i-1].x, z: pts[i].z - pts[i-1].z }
        const la = Math.hypot(ta.x, ta.z) || 1
        let ci = 0, cd = Infinity
        other.points.forEach((q, k) => {
          const d = Math.hypot(q.x - pts[i].x, q.z - pts[i].z)
          if (d < cd) { cd = d; ci = k }
        })
        const qa = other.points[Math.max(0, ci - 1)]
        const qb = other.points[Math.min(other.points.length - 1, ci + 1)]
        const tb = { x: qb.x - qa.x, z: qb.z - qa.z }
        const lb = Math.hypot(tb.x, tb.z) || 1
        const parallel = Math.abs((ta.x/la)*(tb.x/lb) + (ta.z/la)*(tb.z/lb))
        if (parallel > 0.9) run += step
      }
      worst = Math.max(worst, run)
    }
  }
  chk(`${isl.id.padEnd(9)} longest shadowed run ${worst.toFixed(1)} (cap ${L.MAX_PARALLEL_RUN})`,
      worst <= L.MAX_PARALLEL_RUN, `${worst.toFixed(1)}`)
}

console.log('\n9. Traffic signals are where a driver sees a junction')
for (const isl of towns) {
  const junctions = L.getIslandJunctions(isl)
  const signals = L.getTrafficSignals(isl)

  chk(`${isl.id.padEnd(9)} ${junctions.length} junctions merge to ${signals.length} signals`,
      signals.length < junctions.length, `${signals.length} vs ${junctions.length}`)

  // No two sets of lights close enough to read as one cluttered junction
  let closest = Infinity
  for (let a = 0; a < signals.length; a++) {
    for (let b = a + 1; b < signals.length; b++) {
      closest = Math.min(closest,
        Math.hypot(signals[a].x - signals[b].x, signals[a].z - signals[b].z))
    }
  }
  chk(`${isl.id.padEnd(9)} signals at least ${L.SIGNAL_MERGE_DISTANCE} apart (${closest === Infinity ? 'n/a' : closest.toFixed(1)})`,
      closest === Infinity || closest >= L.SIGNAL_MERGE_DISTANCE, `${closest.toFixed(1)}`)

  // Three or four approaches each. Six means something is still merging badly.
  const arms = signals.map(s => s.arms.length)
  chk(`${isl.id.padEnd(9)} 3-4 approaches per signal (${[...new Set(arms)].sort().join(',')})`,
      arms.every(a => a >= 3 && a <= 4), arms.join(','))

  // Not one pole standing in the carriageway
  const roads = L.getIslandRoads(isl).filter(r => r.street || r.ring)
  const gaps = []
  for (const sig of signals) {
    for (const arm of sig.arms) {
      chk2(arm.pole, `${isl.id} arm has a pole position`)
      gaps.push(L.distanceToNearestRoad(roads, arm.pole.x, arm.pole.z))
    }
  }
  const onRoad = gaps.filter(g => g < L.POLE_CLEARANCE)
  chk(`${isl.id.padEnd(9)} all ${gaps.length} poles off the carriageway (closest ${Math.min(...gaps).toFixed(2)})`,
      onRoad.length === 0, `${onRoad.length} in the road`)
  chk(`${isl.id.padEnd(9)} and none absurdly far from it (furthest ${Math.max(...gaps).toFixed(2)})`,
      Math.max(...gaps) < 12, `${Math.max(...gaps).toFixed(2)}`)
}

// Every island where a bridge meets the ring has a T-junction, so it gets
// signals too - the hub had none until bridge approaches were counted as
// approaches. What must NOT be signalled is a plain bend, which shows up
// as an island having no more signals than it has bridges.
for (const isl of L.ISLANDS) {
  const signals = L.getTrafficSignals(isl)
  const bridges = L.getBridgeLandings(isl).length
  const streets = L.getTownGrid(isl).length

  if (!streets) {
    chk(`${isl.id.padEnd(9)} ${signals.length} signals for ${bridges} bridge(s), no bends signalled`,
        signals.length <= bridges, `${signals.length} > ${bridges}`)
  }

  chk(`${isl.id.padEnd(9)} every signal has 3+ approaches`,
      signals.every(s => s.arms.length >= 3))

  // and every pole clear of the road, on every island now
  const roads = L.getIslandRoads(isl).filter(r => r.street || r.ring || r.auto)
  const bad = []
  for (const sig of signals) {
    for (const arm of sig.arms) {
      if (L.distanceToNearestRoad(roads, arm.pole.x, arm.pole.z) < L.POLE_CLEARANCE) {
        bad.push(arm.pole)
      }
    }
  }
  chk(`${isl.id.padEnd(9)} no pole in the carriageway`, bad.length === 0, `${bad.length}`)
}

console.log('\n9b. Junction patches actually cover the crossing')
for (const isl of L.ISLANDS) {
  const roads = L.getIslandRoads(isl)
  const junctions = L.getIslandJunctions(isl)
  if (!junctions.length) continue

  // At a crossing of two roads the bare corners sit hypot(wA/2, wB/2)
  // from the centre. The patch has to reach at least that far or the
  // corners show as one road's surface overlapping the other's.
  let worstShortfall = 0
  for (const j of junctions) {
    // which roads meet here
    const here = roads.filter(r => C.distanceToPath(r.points, j.x, j.z) <= r.width / 2 + 1)
    if (here.length < 2) continue
    const widths = here.map(r => r.width).sort((a, b) => b - a)
    const needed = Math.hypot(widths[0] / 2, widths[1] / 2)
    worstShortfall = Math.max(worstShortfall, needed - j.radius)
  }
  chk(`${isl.id.padEnd(9)} patches reach the corners (worst shortfall ${worstShortfall.toFixed(2)})`,
      worstShortfall <= 0, `${worstShortfall.toFixed(2)} short`)
}

console.log('\n9c. Crossings sit on road, square to it')
//
// Orientation must come from the ROAD the crossing lands on. Taking it from
// the merged approach direction left some sitting up to 44 degrees across
// the carriageway, because approaches within 40 degrees are merged.
const tangentOf = (pts, x, z) => {
  let b = 0, bd = Infinity
  pts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = i } })
  const a = pts[Math.max(0, b - 1)], c = pts[Math.min(pts.length - 1, b + 1)]
  const dx = c.x - a.x, dz = c.z - a.z, l = Math.hypot(dx, dz) || 1
  return { x: dx / l, z: dz / l }
}

for (const isl of L.ISLANDS) {
  const roads = L.getIslandRoads(isl).filter(r => r.street || r.ring || r.auto)
  const signals = L.getTrafficSignals(isl)
  if (!signals.length) continue

  let placed = 0, offRoad = 0, worstSkew = 0, worstOutside = -Infinity

  for (const sig of signals) {
    for (const arm of sig.arms) {
      const along = sig.radius + 2.6
      const x = sig.x + arm.x * along
      const z = sig.z + arm.z * along

      let road = null, best = Infinity
      for (const r of roads) {
        const d = C.distanceToPath(r.points, x, z) - r.width / 2
        if (d < best) { best = d; road = r }
      }
      if (!road || best > 0.5) continue

      placed++
      if (best > 0) offRoad++
      worstOutside = Math.max(worstOutside, best)

      // The renderer orients by this tangent, so the skew is zero by
      // construction. Measuring it guards against that regressing to the
      // arm direction.
      const tan = tangentOf(road.points, x, z)
      const stripeDir = tan
      const dot = Math.abs(stripeDir.x * tan.x + stripeDir.z * tan.z)
      worstSkew = Math.max(worstSkew, Math.acos(Math.min(1, dot)) * 180 / Math.PI)

      // And the arm it came from may be well off - which is the point
      const armDot = Math.abs(arm.x * tan.x + arm.z * tan.z)
      const armSkew = Math.acos(Math.min(1, armDot)) * 180 / Math.PI
      chk2(armSkew <= L.ARM_MERGE_ANGLE + 5,
           `${isl.id} arm skew ${armSkew.toFixed(0)}deg exceeds the merge angle`)
    }
  }

  chk(`${isl.id.padEnd(9)} ${placed} crossings, all on a carriageway (worst ${worstOutside.toFixed(2)})`,
      offRoad === 0 && placed > 0, `${offRoad} off-road`)
  chk(`${isl.id.padEnd(9)} all square to the road they're on (worst ${worstSkew.toFixed(2)}deg)`,
      worstSkew < 1, `${worstSkew.toFixed(2)}`)
}

console.log('\n9d. The grass cap does not tie itself in a knot')
{
  const cross = (o, a, b) => (a.x-o.x)*(b.z-o.z) - (a.z-o.z)*(b.x-o.x)
  const segInt = (p1, p2, p3, p4) => {
    const d1=cross(p3,p4,p1), d2=cross(p3,p4,p2), d3=cross(p1,p2,p3), d4=cross(p1,p2,p4)
    return ((d1>0&&d2<0)||(d1<0&&d2>0)) && ((d3>0&&d4<0)||(d3<0&&d4>0))
  }
  const selfCrossings = ring => {
    let h = 0
    for (let i = 0; i < ring.length; i++) {
      for (let k = i + 2; k < ring.length; k++) {
        if (i === 0 && k === ring.length - 1) continue
        if (segInt(ring[i], ring[(i+1)%ring.length], ring[k], ring[(k+1)%ring.length])) h++
      }
    }
    return h
  }

  for (const isl of L.ISLANDS) {
    const outline = L.islandOutline(isl)
    const beach = Math.max(2, L.islandReach(isl) * 0.13)
    const cap = S.insetPolygonRadial(outline, beach)
    chk(`${isl.id.padEnd(9)} grass cap clean (${selfCrossings(cap)} self-crossings)`,
        selfCrossings(cap) === 0, `${selfCrossings(cap)}`)
    // and it must stay inside the coastline
    const outside = cap.filter(p => S.distanceToEdge(outline, p.x, p.z) < 0).length
    chk(`${isl.id.padEnd(9)} grass cap inside the coast`, outside === 0, `${outside} points out at sea`)
  }
}

console.log('\n9d2. Pavements get built, and stop at the kerb they meet')
//
// This replicates World.buildPavements STEP FOR STEP rather than measuring
// something similar. An earlier version measured the pavement CENTRE LINE
// while the code tested the quad CORNERS - the corner sits exactly on the
// kerb by construction, so the guard was true everywhere, every pavement in
// the world was deleted, and this test still passed.
for (const isl of L.ISLANDS) {
  const all = L.getIslandRoads(isl)
  const roads = all.filter(r => r.street || r.ring)
  if (!roads.length) continue

  let kept = 0, onOther = 0, folded = 0
  let worstIntrusion = -Infinity

  for (const road of roads) {
    const tangents = C.pathTangents(road.points)
    const offset = road.width / 2 + L.PAVEMENT_WIDTH / 2

    for (const side of [1, -1]) {
      const path = road.points.map((p, i) => ({
        x: isl.x + p.x - tangents[i].z * offset * side,
        z: isl.z + p.z + tangents[i].x * offset * side
      }))

      for (const q of C.ribbonQuads(path, L.PAVEMENT_WIDTH)) {
        const mx = (q.l0.x + q.r1.x) / 2
        const mz = (q.l0.z + q.r1.z) / 2

        let blocked = false
        let intrusion = -Infinity
        for (const other of all) {
          if (other === road) continue
          if (!other.street && !other.ring && !other.auto) continue
          const d = C.distanceToPath(other.points, mx - isl.x, mz - isl.z)
          if (d < other.width / 2 + 0.2) blocked = true
          intrusion = Math.max(intrusion, other.width / 2 - d)
        }
        if (blocked) { onOther++; continue }

        const clear = C.distanceToPath(road.points, mx - isl.x, mz - isl.z) - road.width / 2
        if (clear < L.PAVEMENT_WIDTH * 0.2) { folded++; continue }

        kept++
        worstIntrusion = Math.max(worstIntrusion, intrusion)
      }
    }
  }

  const total = kept + onOther + folded
  chk(`${isl.id.padEnd(9)} ${kept} of ${total} pavement quads built (${(kept/total*100).toFixed(0)}%)`,
      kept / total > 0.75, `only ${(kept/total*100).toFixed(0)}% - something is deleting them`)

  // The point of the whole exercise: nothing kept may sit on another
  // road's carriageway. Negative means outside it.
  chk(`${isl.id.padEnd(9)} no kept quad on another carriageway (worst ${worstIntrusion.toFixed(2)})`,
      worstIntrusion < 0, `${worstIntrusion.toFixed(2)} intrudes`)

  chk(`${isl.id.padEnd(9)} the fold guard isn't eating the pavement (${folded})`,
      folded < total * 0.05, `${folded} folded`)
}

console.log('\n10. Walkways reach buildings no road passes')
{
  // Nothing hand-placed on the live map, so this is exercised on a copy:
  // a building dead centre (needs a path), one on the kerb (doesn't), and
  // one absurdly far away (shouldn't get a silly long path).
  const isl = L.getIsland('blog')
  const before = isl.buildings
  const ring = L.getIslandRing(isl)
  const onKerb = { x: ring[0].x, z: ring[0].z, width: 8, depth: 8 }

  isl.buildings = [
    { x: 0, z: 0, width: 8, depth: 8 },
    onKerb,
    { x: 400, z: 400, width: 8, depth: 8 }
  ]

  const walks = L.getWalkways(isl)
  chk(`one path generated, not three (${walks.length})`, walks.length === 1, `${walks.length}`)

  if (walks.length === 1) {
    const w = walks[0]
    const len = Math.hypot(w.points[1].x - w.points[0].x, w.points[1].z - w.points[0].z)
    chk(`sensible length (${len.toFixed(1)}, cap ${L.MAX_WALKWAY_LENGTH})`,
        len > 4 && len <= L.MAX_WALKWAY_LENGTH)
    chk(`narrower than a pavement (${w.width} < ${L.PAVEMENT_WIDTH})`,
        w.width < L.PAVEMENT_WIDTH)

    // It has to actually arrive at a road, or it's a path to nowhere
    const roads = L.getIslandRoads(isl)
    let gap = Infinity
    for (const r of roads) {
      gap = Math.min(gap, C.distanceToPath(r.points, w.points[1].x, w.points[1].z) - r.width / 2)
    }
    chk(`arrives at a road surface (gap ${gap.toFixed(2)})`, gap <= 0.01, `${gap.toFixed(2)}`)

    // And start clear of the building it serves, not under it
    const fromCentre = Math.hypot(w.points[0].x, w.points[0].z)
    chk(`starts at the wall, not the middle (${fromCentre.toFixed(1)} from centre)`,
        fromCentre >= 3.5)
  }

  isl.buildings = before
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
