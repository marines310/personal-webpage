# Project handoff

Written so a fresh conversation can pick this up without re-deriving
anything. Last updated: 30 July 2026 (after the traffic, the monorail, the ports, and
the emergency services).

---

## Resuming in a new chat

**1.** Connect the folder `~/Documents/GitHub/Personal Webpage` (the
folder picker, or ask for access to it).

**2.** Paste this:

> Read `mike-portfolio-v1/HANDOFF.md` and `mike-portfolio-v1/MAP.md`, then
> run `npm test` from `mike-portfolio-v1` to confirm you're starting from
> green. Don't change anything until both are done. Then tell me what you
> understand the state to be and what you think the next step is, and wait
> for me to confirm.

The last sentence matters. It forces the new session to show you it has
actually understood the project before it starts editing, so you can catch
a bad read early rather than after it's changed twenty files.

**3.** If it says any test fails, stop and say so. Everything here was
green when this was written, so a failure means something changed
underneath — worth understanding before building on top of it.

---

## What this is

An interactive 3D driving portfolio, in the spirit of bruno-simon.com.
You drive a car around an archipelago; each island holds a section of
Mike's CV (About, Experience, Skills, Blog, Contact).

**Mike is not a developer.** He's a product / venture strategy lead in San
Francisco. He's comfortable being walked through Terminal but doesn't
write code, and he's been bitten more than once by instructions that
assumed knowledge he doesn't have. Explain *why*, not just *what*, and
prefer showing the consequence of getting something wrong.

He has asked for concise, direct answers with no filler.

---

## Where everything is

| | |
|---|---|
| **Repo (the real one)** | `~/Documents/GitHub/Personal Webpage/mike-portfolio-v1` |
| **GitHub** | `github.com/marines310/personal-webpage` |
| **Live site** | https://marines310.github.io/personal-webpage/ |
| **Map editor (live)** | https://marines310.github.io/personal-webpage/map-editor.html |
| **Local** | `npm run dev` → localhost:3000, editor at `/map-editor.html` |

> **There was once a second copy of this project** in a Cowork session
> folder, and work went into the wrong one for a while. If anything looks
> out of date, check you're in `~/Documents/GitHub/Personal Webpage/`.

**Publishing:** Mike uses **GitHub Desktop**, not the command line — the
CLI can't authenticate (GitHub retired password auth). Commit, then Push
origin. Pushing to `main` triggers `.github/workflows/deploy.yml`, which
builds and publishes. About 90 seconds. Full guide in `DEPLOY.md`.

---

## Stack

- **Three.js** r0.170 for rendering
- **Rapier** (`@dimforge/rapier3d-compat`) for physics — wasm is inlined,
  so nothing extra to serve
- **Vite 6**, two entry points: `index.html` (game) and `map-editor.html`
- No test framework, no TypeScript, no CSS framework

---

## The files that matter

```
src/world/mapData.js       THE MAP. Island positions, shapes, roads,
                           buildings, bridges. This is the only file that
                           describes the world. The editor writes it.

src/world/islandLayout.js  THE MACHINERY. Ring roads, bridge approaches,
                           junctions, the road network graph, validation.
                           Mike should not edit this.

src/world/terrain.js       HOW HIGH THE GROUND IS. Hills, the coast taper,
                           road profiles, building terraces. Pure maths;
                           getIslandTerrain() in islandLayout feeds it.

src/world/curves.js        Splines, smoothing, resampling, ribbon meshes.
src/world/shapes.js        Island outline polygons and polygon geometry.
src/world/World.js         Builds the 3D world from the above.
src/world/ZoneManager.js   CV content and the zone markers.
src/systems/               Camera, Inputs, Physics, Assets, Environment.

map-editor.html            The whole editor: one file, Vite entry, imports
                           the real modules from src/world/.

tests/                     30 suites, ~865 checks. `npm test`.
MAP.md                     How to edit the world. Written for Mike.
DEPLOY.md                  How to publish. Written for Mike.
ROADMAP.md                 Longer-term wishlist.
```

---

## Rules that have been learned the hard way

These are not style preferences. Each one is here because breaking it
cost real time.

**1. One implementation, never two.**
The editor used to keep its own copy of the road maths. It drifted, and
the preview showed buildings that weren't where the game put them. The
editor now *imports* `approachControls`, `getIslandRing`,
`getIslandJunctions`, `buildNetwork`, `smoothRoad` from `islandLayout.js`.
If you find yourself writing a second version of something, stop.

**2. The editor must open on the real map.**
It used to start from a hardcoded `DEFAULT_MAP` that duplicated
`mapData.js`. Exporting then silently deleted anything the copy didn't
know about — it destroyed two of Mike's buildings. It now imports
`mapData.js` directly.

**3. Derive connections, never store them.**
`getRoadNetwork()` / `buildNetwork()` work out where roads meet from where
the roads actually are. Stored connections go stale the instant an island
moves. This graph is also the foundation for the AI traffic Mike wants
later: nodes are decision points, segments are what you follow.

**4. Snapping distance and network tolerance must be the same number.**
Both are `DEFAULT_ROAD_WIDTH * 0.75`. If snapping were tighter, you could
join two roads in the editor that the network still considered separate —
looking connected while not being connected. That would break routing in a
way that's very hard to see.

**5. Roads overlap; they never narrow.**
Through a bend tighter than the road is wide, the inner edge is allowed to
fold over itself. The earlier version narrowed the road instead, which
pinched it to zero width and left visible holes. Every vertex gets an
upward normal and the material is double-sided, so a fold is invisible.

**6. Build rings in polar form, not by insetting.**
Insetting a wobbly coastline by 15 units makes the polygon self-intersect,
and a self-crossing loop has a cusp no smoothing removes — you get 1.6-unit
hairpins. Sweeping a radius around the centre can't self-intersect.

**7. Measure before rotating.**
Building footprints must be measured and scaled with `rotation.y = 0`,
then rotated. Measuring a rotated bounding box gives the wrong size.

**8. `SITE_BASE` in `vite.config.js` must match where the site is served.**
`'/personal-webpage/'` today. **If a custom domain is ever added, this
becomes `'/'`** — a domain serves from the root. Get it wrong and the page
loads completely blank with no error, because every asset 404s.

**9. GitHub Pages is case-sensitive; macOS isn't.**
`public/models/Textures/` with a capital T. A capitalisation slip works
perfectly locally and fails only once published.

**10. Inset the ring by a PROPORTION of the local coast distance.**
A fixed number of units works out as a fraction of the island's longest
axis, which is more than a short axis has to give. On a stretched island
the sides bottom out at the minimum width while the ends stay wide, and
the ring becomes two lobes joined by a pinch — 2-unit hairpins on a
7-unit road. Caught by `tests/ring.mjs` when the map was redesigned.

**11. Measure a road's direction where the thing ends up, not where it
started.** Stepping 10 units off a curve moves you *along* it as well as
away from it. Taking the tangent at the start point put building
frontages up to 28° off square to the kerb they face.

**12. Thinning a curve to draggable handles is lossy — measure it.**
Baking a 385-point ring to handles moved it 5.4 units at 18-unit spacing
and 0.8 at 8-unit spacing. The number was chosen from that measurement,
not guessed. Interpolate *through* handles (Catmull-Rom), never round the
corners off them (Chaikin), or the loop shrinks every time it's edited.

**13. If the site looks stale, check which folder Vite is running in
BEFORE anything else.** There were two copies of this project for a
while; the dev server was serving an eight-hour-old one from a scratch
folder while the repo was current. The scratch copy has been deleted, but
the failure mode is worth remembering — it looks exactly like a caching
problem and isn't.

---

## The single most important lesson

**Ask the geometry where the object ends up. Never a proxy for it.**

Every placement bug in this project has been the same mistake wearing a
different hat. Something is positioned, and then its orientation, size or
validity is decided using a direction or a distance taken from *somewhere
else* — the start point instead of the finish, a radius instead of a
surface, a centre line instead of a corner.

The tally so far:

| What went wrong | The proxy used | Should have used |
|---|---|---|
| Building frontages up to 28° off square | tangent at the walk position | tangent where the plot lands |
| Crossings up to 44° off square | the merged approach direction | tangent of the road it lands on |
| Pavements crossing junctions in an X | a circle round the junction centre | the other road's actual surface |
| Every pavement in the world deleted | corner distance vs `width/2` | quad centre, with tolerance |
| Traffic poles standing in the road | `junction.radius * 0.8` | stepped out until measurably clear |
| Junction patches leaving bare corners | `max(width)/2` | `hypot(wA/2, wB/2)` |
| Parallel-run measured along the wrong road | length along the ring | length along the street |
| Snap distance ≠ network tolerance | a screen-space radius | the same constant the graph uses |
| No station placed anywhere at all | the circle round the building | the building's own rectangle |
| Glass floating over the rooftops | the model's bounding box | the model's own window faces |
| Cargo containers at the kerb | the box's centre vs a flat 5 | its four corners vs the road edge |
| A garage door an engine could catch on | a width picked to look right | the bay spacing the engine parks on |

**And the corollary, which is worse:** when a test measures a proxy too, it
agrees with the code and both are wrong together. That is how a completely
blank pavement shipped with 396 checks green. Where a test replicates
renderer logic, it must replicate it *step for step* — `tests/town.mjs`
sections 9c and 9d2 do this deliberately and say so in comments.

**A test that asks the wrong question passes for the wrong reason.** The
crossings were reported skewed, and every test confirmed they were "square
to the road" — which a bar parallel to the road also is. `tests/zebra.mjs`
now asks which way the bar's *length* points and which way successive bars
*step*.

**Worst of all: don't change working geometry from a mental model. Look at
a reference.** Having fixed the crossing skew, I then decided the bars were
oriented wrongly and rebuilt them to span the road and step along it,
reasoning that a driver crosses one bar after another. Zebra bars are paint
— you feel nothing — and real ones run ALONG the direction of travel, side
by side across the width. I broke geometry that was already right, and then
wrote a test asserting the wrong property, which would have kept it broken.
Mike had to send a photograph of a real crossing to settle it.

If a visual property is being changed on the strength of intuition rather
than a measurement or a reference, that is the moment to stop and ask.

---

## Testing

```bash
npm test          # all 30 suites, ~865 checks
```

There's no framework. Each file in `tests/` is a plain script that prints
PASS/FAIL and exits non-zero on failure.

**The editor tests drive the real thing.** `tests/editor.mjs` loads
`map-editor.html` into a Node VM behind a DOM/canvas shim and dispatches
genuine mouse events, with the real `src/world` modules injected. This
exists because "it parses and builds" passed twice while the feature was
completely broken — once because a helper was never inserted, once because
buttons were rendered into an unreachable branch.

**Two shim bugs have already made tests lie**, so be suspicious:
- `innerHTML = ''` didn't clear children, so panels appeared to accumulate
- a test overwrote the real `mapData.js` and poisoned every later suite

If a test result looks surprising, check the harness before the product.

**The long ones take minutes, and that is the point.** `traffic.mjs` runs
five minutes of simulation and `stations.mjs` ten; the jams and the
never-goes-home bugs take a couple of minutes to appear. `traffic.mjs`
accepts `TRAFFIC_SECONDS` for a quick smoke test, but only a green from the
full length means anything - several of its thresholds are calibrated to
the five-minute run and will fail a short one for the wrong reason.

`tests/linkcheck.mjs` is separate: it needs a built `dist/` served over
HTTP, and checks every asset the published site requests actually returns
200. Run it after `npm run build` with a static server on port 8899.

---

## Where things stand

**Done and live:**

- Arcade car handling (kinematic bicycle model, correct reverse arcs)
- Chase camera with speed-based pullback, `C` re-centres
- Day/night cycle (5 min each way) and random weather
- Islands with custom shapes, real coastline collision
- **Ring road per island**, bridge roads feed into it rather than piling
  into the centre
- **Junction patches** wherever roads meet
- **Editable everything**: bridge approach roads and ring roads can be
  taken over as draggable points, or reverted, or removed
- **Bridges** selectable — deck width (min 7.5), railings, reverse, delete
- **Road network graph** with connection dots in the editor
- **Snapping** when drawing
- **Demolish tool** — click anything
- **Bridge tool merged into Road** — draw onto another island and the
  bridge is built for you
- **Map redesigned**: hub and spoke, 2.2x bigger, every bridge crossing
  solved to exactly 130 units of open water. Car raised to 18 u/s (boost
  29) with braking and camera pullback scaled to match. Fog eased from
  0.0035 to 0.0018 or the far side of the map would be invisible.
- **Town generator** on `theme: 'town'` islands: street grid clipped to
  the ring, buildings squared up to the kerb at a constant setback (worst
  0.43° off), pavements both sides that stop at the kerb they meet, zebra
  crossings square to the road they're painted on
- **Working traffic signals** — clustered so one junction gets one set,
  one pole per approach, 3–4 per junction, none in the carriageway, 18s
  cycle with 2.5s amber and never two greens at once
- **Street lighting on every island**, each lamp aimed at its carriageway,
  with a faked pool of light on the ground (emissive materials glow in
  Three.js but illuminate nothing, so the road stayed black)
- **Street dressing**: shopfronts that light at night, benches, bins,
  planters, street trees, parked cars in six colours
- Deployed, auto-publishing on push

**Open — agreed order, 29 July:**

1. **Make the towns feel lived in.** ✅ done — shopfronts, benches, bins,
   planters, street trees, parked cars, street lighting.
2. **Back-lot walkways.** ✅ done, but dormant: generated plots always front
   a street, so paths only appear for buildings placed by hand mid-block.
3. **Terrain height — hills, ridges, ponds.** THE BIG ONE. Everything built
   so far assumes the ground is flat at y=0: road surfaces, junction
   patches, pavements, crossings, plot placement, prop placement, and the
   physics trimesh. Adding height means revisiting all of it, and things
   will look wrong for a while in the middle. Mike has been told this.
4. **Cities-Skylines-style editor UX.** Ongoing.

**New, added 29 July (Mike's second list):**

5. **Docks and quaysides.** ✅ done, 29 July, with (6).
   A port on every island, and **you can drive out onto the quay** - a road
   leaves the ring, crosses the beach and runs the length of the pier, which
   is a solid collider. Two cargo terminals (cranes, shed, containers, two
   berths) on the islands at or above `PORT_BIG_REACH`; fishing jetties
   elsewhere. `port: false` opts an island out.

   - **Siting is a compass sweep, scored.** Open water in front, clear of the
     bridge landings, clear of where the monorail crosses the coast.
   - **Measure the water by walking it.** The first version scored open water
     by comparing the bearing against each island's bounding circle and
     deciding it would "sail past" - true of almost everything, so every
     bearing scored the same and the term did nothing. Hub got a quay facing
     the 36-unit gap between two islands. Now it steps out to sea and asks
     `islandAt()`, which is what a ship would ask.
   - The port road is emitted from `getIslandRoads()` marked `spur: true`,
     which had to be added to the three `street || ring || auto` filters or
     the ring's pavement would have been laid straight across it.
   - **A quay is a legitimate dead end.** `town.mjs` asserted no dead ends
     anywhere; it now asserts every dead end is a pier head, which is a
     stronger check, not a weaker one.

6. **Boats and ships, moving.** ✅ done, 29 July.
   Three cargo ships, five boats. Sail between berths, wait, sail again -
   and roughly two voyages in five head off past the horizon.

   - **The sea graph is safe by construction.** Waypoints on a ring at the
     map extent plus a margin are all outside every island, so a leg between
     two adjacent ring waypoints cannot cross land and needs no test. All the
     risk is in the short legs from each port out to the ring, and those are
     walked in steps. Ports are also joined directly where the water allows,
     so a hop between neighbours stays local.
   - **Off-world is a real departure.** A ship sails to a waypoint 780 units
     out, well past the fog, and the hull is re-used for an arrival from
     somewhere else. Arrivals and departures balance without being counted,
     because off-world always routes back to a berth.
   - **Reserve the berth at departure**, not on arrival. The bug this caused
     wasn't during a voyage at all - `makeShips` picked start berths freely
     and put a container ship and a fishing boat in the same water on frame
     one. Worth remembering: start-up state needs the same invariants as the
     running simulation.
   - **Turn headings, don't set them.** Rate-limited, which a lane waypoint
     needs (a straight set pivots a 46-unit hull on the spot) and so does
     leaving a berth, which is a 180. Berth headings point *inland* - the
     direction a ship is already travelling as it arrives - so tying up is
     smooth and only casting off has to swing.
   - No colliders on ships; a moving collider means a kinematic body updated
     every frame, for the ability to shunt a freighter with a hatchback.

   `measurePath()` / `pointAlong()` are now shared with the monorail. One
   implementation of "something moving along a fixed line at a known rate".

7. **Elevated monorail linking every island, station on each.**
   ✅ done, 29 July, together with (8). One closed loop calling at all six:
   blog - contact - hub - about - projects - skills. Beam 16 units up, piers
   every 27, platforms with canopies and lit name signs, stair towers down to
   street level. The whole route is derived from where the islands are, so
   moving one in the editor reroutes the line. `monorail: false` on an island
   skips it.

   What took the work was the route, and the lesson generalises:

   - **A curve cannot pass through a point and turn sharply around it.**
     A Catmull-Rom spline through the six island centres measured a 5.7-unit
     radius at the corners - a hairpin no train could sit on. Slackening the
     tension made the corners sharper; tightening it swung the line 40 units
     past the island and back. Chaikin rounds a corner over the length of
     the segments beside it, so it did nothing on a finely spaced path (8
     passes: 1.6 to 3.4) and cut 60-unit chunks off the coarse one. The
     answer was how railways are actually set out: straight spans with arcs
     of a **stated** radius at each stop.
   - **Then aim the arcs; don't accept where they land.** An arc passes its
     corner by `R x (1/sin(half the angle) - 1)` on the inside, 44 units on
     the sharpest corner here, which put the `about` platform 3 units from
     the water with its stairs in the sea. The polygon's corners are now
     pushed outward by exactly that, iteratively, so the arcs come back onto
     the island centres - every platform within 1.5 units of the middle. The
     corners themselves end up offshore and are never built.
   - **The island in the middle has no bearing.** Ordering stops by angle
     around the centroid works for the five outer islands and is meaningless
     for the hub; it gets threaded into whichever leg it lengthens least.
   - **Piers slide, then give up.** A pier landing on a road moves along the
     beam until it finds room, and is dropped if there isn't any - which
     happens where the line runs *along* a street. A 54-unit span beats a
     column in a traffic lane.

   **Then Mike asked for it a third lower, 16 to 11**, and for nothing to
   clip. Those two pull against each other: at 11 the beam is *below* a
   five-floor building. The line can't dodge them - the route is derived
   before the towns exist - so the answer is `monorailCeiling()`, which
   states how tall anything may be at a point: infinity except in a 6-unit
   strip either side of the beam, where it's 8.1. Buildings lose storeys
   (three floors under the line, five elsewhere), models shrink whole, palm
   trunks are capped because the crown adds a unit on top. 12 of 91 plots on
   the current map. A hand-placed building gets shortened too, but
   `validateLayout()` warns by island and position rather than doing it
   silently.

   **The floor on how low it can go is the camera**, which rides 5-7 units
   up. Underside 9.5 clears it. Lower and the beam would cut across the car
   every time you drove beneath it - which is a thing to check before
   changing MONORAIL_HEIGHT again.

8. **Monorail trains running the line.**
   ✅ done, 29 July. Three trains of three cars, easing into each platform,
   dwelling 4.5 seconds, pulling away. The first genuinely moving traffic in
   the world.

   **The timetable lives in `islandLayout.js`, not `World.js`** -
   `stepMonorailTrains()`. That was the point of putting it there: `World.js`
   needs a browser, so the tests can only ever *read* it, and anything with
   logic in it has to live where a test can run it. It paid immediately - the
   first version had every train reading the platform it was standing on as
   zero distance ahead, so it stopped there again, and again, forever. The
   trains never left their first station and the line was static scenery.

   `tests/monorail.mjs` caught it on the first run, but only because of how
   the check was written: "did it stop at least six times" passed happily -
   it had stopped 89 times without moving. What caught it was asking
   **which** stations each train had called at.

9. **Editor tools for docks and the monorail.** The monorail route is
   derived, so there's nothing to drag yet; what the editor needs is to
   *draw* the line (the in-game minimap already does) and a per-island
   `monorail: false` toggle. Docks still need the full treatment. Remember
   rule 1: the editor must import the real geometry functions, never
   reimplement them.
10. **Generated town streets can't be selected, edited or deleted.**
    ✅ done, 29 July. Click a street with Select and it's handed over:
    written into the island's `roads` with a `streetKey`, geometry
    untouched, and from then on it's an ordinary road. Demolish or Delete
    records the key in `island.noStreets` so it stays gone; the island panel
    can bring the removed ones back. Handles are now draggable in Select as
    well as Road, and Alt-clicking a road adds a handle, because a street
    arrives with two ends and nothing between them.

    Three things came out of doing it that are worth carrying forward:

    - **Filter derived things LAST.** `getTownGrid` weighs each candidate
      street against the ones already accepted (`crowdsAnother`), so hiding
      a taken-over street *before* those tests would make its neighbours
      appear and disappear. The full grid is generated, then claimed keys
      are removed.
    - **The take-over has to be invisible, and that includes downstream.**
      World.js decides what gets pavements, crossings, signals and building
      frontages by asking `road.street || road.ring || road.auto`, so a
      taken-over street has to keep saying `street: true`. Otherwise
      everything along it vanishes the moment you touch it, and the editor
      looks completely normal. `streetedit.mjs` section 7 measures
      junctions, signals and plots before and after.
    - **Generated streets were missing from `worldSegments()`.** Found by
      accident: a road drawn across a town snapped to nothing and joined
      nothing, because the editor's segment list only had rings, stored
      roads and bridges. Now included, which also means the connection
      overlay tells the truth about towns — worth remembering for AI
      traffic. The old `cityui.mjs` check *asserted the bug* ("the road
      just drawn shows a loose end") and had to be replaced.

11. **Click the HUD to set time and weather.** ✅ done, 29 July.
    The box top-left is a button. It opens a panel with a minute-resolution
    time slider, four presets (Dawn / Noon / Dusk / Night), the five weathers,
    and a button back to the automatic cycle. The readout shows a quiet
    "HELD" while anything is set by hand, so a stopped clock reads as
    deliberate rather than broken.

    - **No second code path.** `setClock()` moves the same `time` the cycle
      moves; `setWeather()` sets the same `target` the chain would set and it
      eases in over the same eight seconds. So a hand-set sunset runs through
      exactly the same sun, sky, fog and light code as one the cycle arrived
      at, and there is nothing to keep in step.
    - `timeLocked` and `weatherLocked` suspend only the *advancing*, not the
      rendering.
    - **`#conditions` had `pointer-events: none`**, which is what made the
      whole readout ignore the mouse. Worth remembering for any other HUD
      element that needs to become clickable.
    - Found on the way: **`getClock()` truncated its minutes.** Ask for 19:45
      and it showed 19:44 - the time goes through a fraction of a day and
      returns as 19.7499999. It rounds and carries now.
    - `modelManifest.js` guards `import.meta.env`, which is Vite's and MISSING
      under Node rather than undefined. Without that, anything that
      transitively reaches it - Game, and so Environment - couldn't be
      imported by a test at all. That's what made `conditions.mjs` possible.

**Added and done, 29 July (Mike's third list):**

11. **AI traffic.** ✅ done. 31 vehicles - sedans, convertibles, police,
    ambulances, fire engines, four buses that call at stops. Red and blue
    beacons on the emergency vehicles, brake lights on everything. They obey
    the lights, queue, give way, and you can hit them.

    The lane network is derived from the road graph: every road cut at every
    junction, two lanes per piece offset a quarter width right of centre,
    each lane knowing its turns and its stop line.

    **The whole difficulty was deadlock, and the lesson is one sentence:
    only three things may bring a vehicle to a complete stop** - a red light,
    the vehicle directly in front on the same lane, and the two-dimensional
    collision veto. Every give-way rule that could stop a vehicle dead
    produced a jam:

    - Nearest-to-the-junction owns it → a car stopped at a red was always
      nearest and held the junction shut against the green arm. Cars faced a
      green light for minutes.
    - Yield to anything in a lane entrance → two cars on adjacent 12-unit
      ring pieces each waited for the other. 286 seconds of 300 stationary.
    - Break every conflict by vehicle number → a low-numbered car drove into
      the back of a stationary fire engine.

    Now: whoever is behind gives way; mutual conflicts go to the lower
    number; only something moving may claim a junction; after 15 seconds
    standing a vehicle stops giving way at all. The veto makes that safe.

    **The veto is the part to keep.** Everything else reasons in one
    dimension - distance along a lane - and that is blind the moment a
    vehicle changes lane, because it arrives somewhere its old lane knew
    nothing about. Check the move in two dimensions, and try EVERY onward
    lane: checking only the preferred one froze 11 of 31 vehicles.

12. **The double sun.** ✅ The sky shader drew a hard disc at pow(d, 340) and
    there was already a sphere mesh at 430 units doing the same job. Two
    different apparent sizes, hence two rings. The shader now does the glow
    only.

13. **Piers on roads and bridges.** ✅ Piers only tested the roads of the
    island they stood on, so a pier over water got no test at all - and a
    bridge is a road over water. Columns came down through decks. Bridge
    decks and bridge roads are now tested for every pier, and where the beam
    runs directly over a crossing the column steps aside onto a cross-arm.
    Deck clearance is absolute; road clearance is a preference.

14. **Buildings at random angles.** ✅ Town islands used plots and lined up;
    `buildDistrict` and `scatterTheme` called `addBuilding` with no rotation,
    so every building on a `mixed` island had a random bearing and a random
    distance from the road. `getRoadsidePlots()` now gives non-town islands
    the same treatment, and the scatter places no buildings at all - only
    trees, bushes, rocks and huts.

15. **The harbour shed on the road.** ✅ It was placed by dead reckoning - a
    fixed 12 units back and 12 to the side of the pier root, with no test of
    any kind - so on EXPERIENCE a 22 x 13 x 8 concrete shed sat across the
    coast road and out onto the beach. `getPortYard()` now measures: on land,
    inland by the footprint's own half-diagonal, clear of every road, clear of
    the monorail. Big shed if it fits, small one if not, nothing if neither.
    The gantry legs were the same bug smaller - at 0.62 of the pier width they
    stood outside a 13-wide deck, in the water.

16. **The player's car was half the size of the traffic.** ✅ It was built
    around a 2-unit length (a sedan is 4.4, a bus 11), so it read as a toy.
    Everything now scales off `CAR_SCALE` in `Vehicle.js` - body, wheels,
    lamps, collider AND wheelbase, because a longer car genuinely turns wider
    and scaling the body alone would have it pivoting about a point inside
    itself. `maxSteerAngle` opened from 0.55 to 0.7 to keep the arc usable,
    and the chase camera pulled back from 9.5 to 12.5.

    **Two numbers that have to agree and can't find each other:** `CAR_SCALE`
    here and `fitLength` for the `car` entry in `modelManifest.js`. The
    manifest is loaded before any vehicle exists. Both are commented.

    **And a third:** the camera's `fastHeight` (7.8) has to stay below the
    monorail beam's underside (9.5), or the beam clips through the view every
    time you drive under it. `monorail.mjs` asserts the gap.

17. **The car looked too big because it was too WIDE, not too long.**
    Mike said it three times and each time I scaled it uniformly, which was
    the wrong axis. `fitLength` in the manifest scales off the longest
    horizontal dimension and lets the source model's proportions follow - and
    car.glb is 1.3 wide by 2.0 long, a ratio of 0.65 where a real car is
    nearer 0.42. Fitting the length to 3.96 gave a car **2.57 wide**: wider
    than the fire engine, and half a unit wider than its own collider. So it
    measured shorter than every AI vehicle while looking bigger than all of
    them.

    `fitBox: { length, width }` now scales the two horizontal axes
    independently, with height following their geometric mean. The model comes
    out at exactly CAR_LENGTH x CAR_WIDTH, which is also the collider - the
    first time the visible car and the solid one have agreed.

    **The lesson:** when someone reports a size problem, get the actual
    dimensions of the actual asset before touching a scale factor. I could
    have read the .glb's bounding box out of its own accessors in five
    minutes - `tests/traffic.mjs` section 7 now does exactly that, every run,
    and it fails if the manifest goes back to fitting one axis.

    Settled at **4.4 x 1.9 - exactly TRAFFIC_LENGTHS.sedan and
    TRAFFIC_WIDTHS.sedan**. The car you drive is one of the cars on the road,
    so the only defensible size for it is the size of one of them. Asserted.

    **And then the fittings hung over the sides.** The lamps were positioned
    at `0.4 * CAR_SCALE` - a LENGTH scale - so narrowing the body left them
    0.155 units proud of it, plainly visible from behind. Every wheel in the
    world, player and AI, sat at `width / 2 - 0.05` and then added half a tyre
    on top, standing 0.1 proud. Both are now fractions of the body width,
    which cannot come apart from it, and section 8 checks the arithmetic for
    the player and all six AI kinds.

    Two lessons in one bug: **derive a fitting's position from the dimension
    it has to stay inside**, and when a shape changes, list what was
    positioned relative to the old one.

18. **A guard that covered half its own case.** `worldsanity.mjs` section 6
    checks every SHOUTY constant `World.js` uses is imported. It was written
    for exactly that slip and it works. Then `getPortYard` was called without
    being imported, the world wouldn't load, and section 6 said nothing -
    because the name is camelCase. Section 7 now does the same for plain
    function calls, and was verified by removing the import again.

    When you write a guard for a specific slip, ask what the CLASS of slip is.
    "A name used but never imported" was the class; "a CONSTANT used but never
    imported" was half of it.

19. **Six fixes, 29 July, and the traffic ones were nearly all the same bug.**

    - **Building lights.** Every building registered a night-emissive window
      material, so the whole city lit at dusk like a switch. `WINDOWS_LIT_CHANCE`
      thinned it out. (Superseded twice since: see 21 and 23 - the constant was
      in a branch that never ran, and then the glass was in the wrong place.)
    - **Jagged turns.** The heading was already rate-limited; the POSITION
      jumped. A car turning moves from one road's right-hand lane to another's,
      and those are up to 3.6 units apart at the corner. Tapering the lanes
      together in the layout fixed the geometry and **halved the traffic** -
      converging lanes put oncoming cars nose to nose at every junction, median
      distance 1518 down to 174. So it's eased in the renderer instead, over
      0.11s, which is where a cosmetic problem belongs. The collider follows
      the drawn position, not the simulated one.
    - **Stopping in the middle of the intersection.** The stop line was 0.75 of
      the LANE's width back from the node. That's enough on a 7-unit road and
      half a unit short on a 5.5-unit street meeting one - so cars waited
      inside the box, across the green arm. It now comes from the junction's
      own radius, which is the only figure that knows how far the patch
      reaches. Plus a **don't-block-the-box** rule: a vehicle still behind its
      line waits hard if the far side is occupied; past the line it's committed
      and creeps clear.
    - **Cars crashing and stopping traffic.** Four separate causes, in order of
      how much they mattered:
      1. Two lanes genuinely overlapping - a street may run alongside the ring
         for 26 units. The dedupe measured a FRACTION of a lane (60%) and found
         nothing; two pairs overlapped for 16 and 18 units, absolute. Cars on
         them interpenetrated permanently, and backing off along a PARALLEL
         road never increases the gap, so nothing could free them. 235 seconds
         of 300 for seven vehicles.
      2. `resolveOverlaps` restored `lane` and `at` but not `sidestep`, so a
         swerving car was put back inside whatever it had swerved into.
      3. Swerving either way let a car camp in the oncoming lane. Swerves are
         kerbward only now, and recover even while blocked.
      4. A vehicle just past a node sits at `at ≈ 0` and had nothing to reverse
         into. The unjam tries both directions.
      And a last resort: `RESPAWN_AFTER`. Anything blocked for 25 seconds
      leaves and reappears somewhere clear. The test reports how often it
      fires - currently zero - so it can't hide a jam.
    - **Ships clipping the quay.** The path was clear; the HULL wasn't. A
      46-unit ship turning into its berth swings its bow eight units sideways,
      through the deck. Every berth now has a holding point 90 units out, so
      the final run is parallel to the quay and no turn happens near it. Berth
      offset 12 to 13.5, because 0.75 units of clearance is inside the slack
      the heading smoothing leaves.
    - **Bus shelters in the road.** Two things. The roof box was 3.6 ACROSS the
      road and 1.9 along - the mesh is rotated by the heading, so its local X
      is across. And the setback was a flat 4.6 from the LANE centre, which is
      a different distance from the kerb on every road width. Now measured from
      the road edge.

20. **And then the bus was still in the junction.** Moving the stop line back
    to the junction radius was necessary and not sufficient: `v.at` is where a
    vehicle's MIDDLE is, so stopping the middle on the line left half a length
    beyond it. Every kind was poking in - sedan by 0.6, ambulance 1.4, bus
    **3.9**. Stopping is now expressed in terms of the nose, `noseGap()`.

    Two lanes (12-unit ring pieces) are shorter than a bus plus its stopping
    distance, so a bus there carries on through rather than freezing. That is
    the only thing it can do, and the test reports the count rather than
    asserting zero.

    **The pattern across all of it:** every one of these was a number that had
    to relate to another number and didn't. Lamp positions to body width. Stop
    lines to junction radius, and then to vehicle length. Shelters to road
    width. Ship berths to hull width. When two quantities have to agree, derive
    one from the other.

    And a second pattern, worth as much: **a fix at the right place can still
    be measured at the wrong point.** The stop line was in the right place both
    times; what changed was which part of the vehicle was being put on it.

21. **Window lights that had never once come on.** ✅ 30 July.
    `WINDOWS_LIT_CHANCE` was real, the registration was real, and no building
    in the world had ever lit up - because `addBuilding` returns early when a
    `.glb` is found, and the night-light code lived in the procedural fallback
    below it. Every building uses a model, so that branch never runs.

    The models can't help either: each is a single material called
    "colormap" with no glass to pick out, so recolouring by material name has
    nothing to work with. `addLitWindows()` now hangs a grid of small emissive
    panes on all four faces of the model group **before** it is rotated, one
    shared material per building, a quarter of the panes left dark.

    **The lesson is about where a constant lives.** A tunable sitting in a
    branch that never executes looks exactly like a working feature: the name
    is right, the value is right, and it is used. Ask which code path actually
    runs before trusting that a knob is connected to anything.

22. **Emergency services: stations, car parks, and four times the fleet.**
    ✅ 30 July. Seven stations - three fire, two police, two hospital - each
    facing a street with a marked apron and numbered bays. Fire stations have
    a garage: the front wall is piers and lintels around an opening per bay,
    and each door lifts when its own engine is coming or going.
    `TRAFFIC_FLEET` is now 12 police, 8 ambulances, 8 fire engines.

    The police car was rebuilt rather than recoloured. A sedan picks its paint
    from a random palette entry, so cloning one and painting the doors white
    left red police cars.

    - **A rectangle is not the circle around it.** Siting first tested the
      centre against half the building's diagonal - 16 units clear for a fire
      station - and a town with streets every 34 units has that nowhere, so it
      placed **none at all**. `rectangleIsClear()` tests the rectangle.
    - **The door width comes from the bay spacing**, which is where the
      vehicles actually are: 6.5 against a 2.4-wide engine, 2.05 units of air
      each side, and the run-in is dead straight and square to the opening so
      nothing swings through a door frame.
    - **`bays` the number overwrote `bays` the array.** The kind spec was
      spread *after* the site. Renamed `bayCount`.
    - **A local variable shadowed the bay map.** `free` was the spare-bay
      list; `spawn` had its own `free` list of lanes. Not one vehicle of
      fifty-two got a home.

    **But the behaviour is where the real bugs were, and none of them could be
    seen standing still:**

    - **Vehicles only went home if their wandering happened to take them past
      their own door** - twice in ten minutes out of twenty-two. Fixed with a
      reverse breadth-first search from each station's lane, `toHome`, so a
      vehicle whose shift is over takes the turn that shortens the route.
    - **The patience valve was teleporting them away two seconds from the
      door.** Anything that hadn't moved for 25 seconds was moved somewhere
      clear - including a car queueing lawfully at a red. That is not a jam
      being cleared, it is a car vanishing from a queue. `lawfulWait()` now
      follows the chain of who is waiting for whom (with a ring check, since a
      ring of mutual waiting is exactly the deadlock the valve exists for) and
      exempts anything that traces back to a red light, a bus at a stop, or a
      vehicle turning in. `STUCK_LIMIT` is the backstop that still moves
      anyone standing still too long whatever their reason.
    - **A relocated vehicle was being dropped into the back of a queue**, where
      it stopped again immediately and tripped the valve again, so it stood
      still for as long as if it had never been moved. Relocation now demands
      clear road *ahead*, not just a gap to stand in.
    - **The car parks read as empty** however well the coming and going
      worked, because an 18-second dwell against a 90-second shift left about
      one vehicle parked in the whole world at any moment. 70 against 75 now:
      typically five in their bays.

    **The lesson, and it is the same shape as the trains that never left their
    first station:** a simulation rule can be exactly right and still produce
    nothing to look at. Every one of these passed every static check. What
    found them was running ten minutes and counting events - how many turned
    in, how long it took, how many were parked at a given moment. If a feature
    is "things come and go", the test has to count comings and goings.

23. **The window glass was in the sky, and the containers were in the air.**
    ✅ 30 July, both from screenshots.

    **The glass.** Lighting the windows by hanging a grid of panes on the
    model's bounding box was wrong twice over. The box is not where the windows
    are - and the panes were sized in WORLD units and added to a group the
    loader had already scaled up by ten or more, so they came out enormous and
    floated over the rooftops.

    The windows are in the model. Each building's `.glb` has 4 to 8 window
    quads whose UVs point at one dark grey swatch of the shared atlas, around
    (60, 60, 66) against a darkest wall of (90, 96, 120). So `windows.js` reads
    the texture, keeps the triangles that land on the dark swatch, groups them
    into panes and returns them; `World.js` builds a sheet of glass from those
    triangles, in the model's own coordinates, parented to the mesh they came
    from. Right size and right place by construction, whatever the model is
    scaled to.

    Two things to know if this ever needs touching:

    - **glTF puts UV (0,0) at the TOP left**, and this atlas has its top half
      empty. Sampling with V flipped returns black for every triangle, so
      every wall reads as glass - and a flipped sampler in the other direction
      would report no windows at all, which looks exactly like a model that
      hasn't any. `tests/windows.mjs` checks both.
    - **The outward offset is in MODEL units.** These buildings are one unit
      across before the world scales them; a world-unit offset would be a
      hundred times too big. Same class of mistake as the panes themselves.

    **The containers.** Each was given a random level of 0, 1 or 2 with nothing
    underneath, so two thirds of the cargo on the map stood in mid-air. And
    they were tested by their centre against a flat five units, which for a
    six-unit box is a corner two units from the kerb - cargo at the roadside,
    which is what Mike reported. Stacks are now stacks, every position is
    tested by its own four corners, and the shed is tested as a rectangle
    rather than the circle around it (it had a corner half a unit from the
    coast road on ABOUT).

    **The pattern, again:** both were something positioned from a proxy - a
    bounding box for a window, a centre point for a six-unit box. And both
    were invisible to every existing test, because nothing asked where the
    thing ended up.

    **And then a tuning change, from the same screenshots.** With the glass
    finally in the right place, a third of the town was still black at
    midnight - `WINDOWS_LIT_CHANCE` was 0.65. That was deliberate and it was
    wrong: on a street of four or five buildings, "one in three is dark" reads
    as broken rather than as people being out. It is 0.88 now, and the variety
    comes from `WINDOW_DARK_CHANCE` (0.3) instead - unlit ROOMS in an occupied
    building, which is where you actually notice it.

**Added 30 July, Mike's next list:**

24. **Ships sail through the bridges.** Not fixed yet. Either the sea graph
    treats a bridge as land - `seaLegIsClear()` already walks each leg in
    steps, so it is a small change - or the bridges go up and the ships go
    under, which is 25.

25. **Elevated bridges with ramps, on real terrain height.** The reason to do
    the terrain work at last. Decks raised to clear the tallest mast, ramps at
    both ends that the player AND every AI vehicle can drive, and the lane
    network carrying height. Blocked on the terrain height field, and it
    touches everything that assumes flat ground.

26. **Terrain, part one: the height field.** ✅ 30 July. The ground is no
    longer flat at y=0. Islands declare `hills`; `terrain.js` turns those into
    a height field that also enforces the three things Mike asked for - roads
    drivable, buildings vertical on ground that supports them, and a coast
    that still meets the sea.

    **Nothing is drawn on it yet.** The data is right and every test passes,
    but `World.js` still builds a flat world, so the game looks exactly as it
    did. That is a deliberate stopping point: the foundation can be checked
    without half a rendered world in the way. Tasks 90-93 are the visible half.

    What it cost, and what to know before touching it:

    - **Roads have to be solved together.** Each road profiled on its own gave
      two different heights where two roads met, and the ground stepped
      between them - one stretch measured a 276% gradient, which is a wall.
      They are one network now, pinned wherever their corridors overlap.
    - **And solved exactly, not approximately.** Nudging heights towards each
      other by halves was still 290% out after forty rounds. It is a
      shortest-path problem - every point is at most (some other point's
      ground, plus the gradient times the distance to it) - and relaxing edges
      until nothing changes gives the answer outright.
    - **Merging points by distance alone flattened the entire map.** Road
      points are resampled every couple of units, so a plain proximity test
      merged each road into a single node and every island came out perfectly
      level. Only a DIFFERENT road, or a distant part of the same one, is a
      junction.
    - **A building's pad is a rectangle.** The circle around it reaches a
      third of the way into the road it fronts, and the pad then cambered the
      carriageway. Third time this project has made that mistake.
    - **The carriageway outranks everything.** Inside a road's own width the
      answer is that road's profile, full stop - no terrace, no neighbouring
      corridor, not even a blend with one. A blend at the kerb left a 10%
      camber, from a sample sitting exactly on the boundary.
    - **`PAD_MARGIN` is smaller than half `PLOT_GAP` on purpose.** Any wider
      and every plot on a street chains into one terrace, which then sits
      several units off the street it fronts.

    And one about tests: three of these took pages of iteration because the
    TEST was asking for more than was ever promised - level ground on a circle
    round a rectangular plot, out where open hillside was always going to be.
    A test stricter than the thing gets weakened until it catches nothing.

27. **And a test that broke for a reason nothing to do with what changed.**
    `approachedit.mjs` copies `src/world` into a scratch folder so it can run
    the game against the map the editor just exported. It copied three NAMED
    files, so adding `terrain.js` broke it - a module-not-found from `/tmp`,
    which looks like the editor is broken when the editor never moved. It
    copies the whole folder now. **A list of files that shadows a directory is
    a second copy of that directory**, and rule 1 applies to it.

28. **Terrain, part two: the world stands on it.** ✅ 30 July. The ground mesh
    and its collider are subdivided and lifted by the height field; roads,
    pavements, crossings, markings and junction patches carry a height per
    vertex; every prop, building, sign, bus stop and station bay sits on the
    ground; the AI traffic sits on the road and pitches to the slope; the
    monorail pillars and stair towers run from the ground to a beam that stays
    level, so the train does not undulate.

    - **The mesh has to be subdivided or nothing else matters.** An island is
      triangulated from its outline, which gives triangles up to a hundred
      units across; lifting three corners of one of those leaves a flat plane
      with the road floating over it. `subdivideTriangles` splits the longest
      edge at its midpoint until nothing is longer than `GROUND_MESH_EDGE`,
      which keeps shared edges split in the same place - a mesh that cracks is
      a hole you can see the sea through.
    - **`monorailCeiling` now measures from the GROUND.** It returned a height
      above sea level, which was the same everywhere; on a six-unit hill a
      building would have grown straight through the beam.
    - **`SPAWN_POINT.y` is a drop height, not a position.** Put a hill under
      the start and a fixed y spawns the car inside it.

    And a new guard: `worldsanity.mjs` section 8 scans for anything placed by
    its own x and z at a FIXED height - the signature of a prop hovering over a
    hillside or buried in it. Written as a scan rather than a list of
    exceptions, because a list goes stale the moment someone adds a prop.
    Verified by putting a bin back at sea level and watching it fail.

    **The car flew off crests.** Reported straight away, and it is the
    horizontal-thrust problem: the car is pushed along a HORIZONTAL heading and
    left to gravity, so at any convex change of slope it carries on while the
    ground drops away - at 18 units a second that is a jump. When grounded it
    now descends at least as fast as the ground does. Downwards only: pushing a
    car UP to meet a slope would shove it through whatever it was climbing, and
    gravity handles that direction already.

    **Still to do:** the car on slopes needs checking with hands on
    the keyboard (it is a Rapier body that never touches its own vertical
    velocity, so it should climb, but its thrust is horizontal and loses bite
    on a gradient), and the bridges are still flat over the water.

29. **Green shards through the roads.** ✅ 30 July, from a screenshot. Grass
    poking up through the tarmac, the pavements and the plaza.

    Not z-fighting, and not a resolution problem. **Two surfaces meshed at
    different points cannot be stacked three centimetres apart.** The grass
    samples the height field at its own triangle corners; between them it is a
    flat chord, and where the ground curves away - which it does within a
    metre of every kerb - the chord sits above the true surface. Chasing it
    with subdivision halved the error each time the triangle count quadrupled,
    and was still 30cm out at five seconds an island.

    Three fixes, in the order they were found:

    - **The field had genuine cliffs in it.** Picking a single winner among
      overlapping claims - nearest road, most-inside pad - steps the moment the
      winner changes. Now every claim contributes with weight `s / (1 - s)`,
      which runs to infinity as a claim reaches full strength: on a carriageway
      or inside a footprint the answer is exactly that claim, and it is
      continuous everywhere else. And the coast taper is applied to the open
      ground and to the claim WEIGHTS, never to the finished height - gating
      twice put a 2.45-metre cliff around every terrace near the shore.
    - **`PAD_MARGIN` was too wide.** Plots sit 2.5 apart and on an 8% street the
      next one is a metre lower; at a margin of 1.2 the two level zones left a
      tenth of a unit to fall a metre in. It is 0.4 now, which leaves 1.7 units
      of bank.
    - **And then the grass gets out of the way.** `GROUND_SINK`: the DRAWN
      ground ducks 45cm under anything flat, in proportion to how strongly that
      thing claims the point. The collider does not - what you drive on is
      still the true surface. Hiding a decorative surface under the one you are
      meant to see is cheaper and more reliable than making the two agree to
      the centimetre.

    **And then the same bug twice more, in thinner slivers.** The grass cap is
    a ring inset inside the island's outline, so it is triangulated from a
    different polygon than the sand and their corners are nowhere near each
    other; at three centimetres apart they crossed constantly. It is 30cm now
    (`GRASS_ABOVE_SAND`), which reads as a low bank at the top of the beach.
    And the hub's plaza was drawn 5cm over ground the grass was still
    following - districts are claims on the ground now, like buildings, so the
    ground under them is flat and the grass ducks beneath.

    **And then the ducking itself floated every building.** Ducking the ground
    is only safe where something is DRAWN over the hole. A road, a pavement and
    a plaza all draw one; a building's plot does not, so sinking the ground
    under a building left it standing in the air over a moat of its own.
    `claimAt` now answers "is this covered by paving" - the carriageway plus
    its pavements, `pavedHalf` - rather than "does anything flatten the height
    here", which reached three times as far and swallowed every plot on the
    map. `tests/terrain.mjs` section 7 checks both halves of that.

    **And it took 34 seconds to load.** Not an error - the page came up
    eventually, which is worse, because nothing reports it. Subdividing the
    ground asks the height field for the midpoint of every edge, neighbouring
    triangles share edges, and the field walks every road on the island for
    every question. `heightAt` and `claimAt` are memoised on a one-centimetre
    grid now (`remember()` in terrain.js) and the same work takes 3.2 seconds.

    Still worth another pass: the sand, the grass and the collider each
    subdivide the island separately, and the collider could reuse the sand's
    triangles.

    **And the stations were missed entirely.** Fire stations, police stations
    and hospitals are buildings, but they are not PLOTS, so nothing gave them a
    terrace: the hospital on CONTACT stood on the height at its own centre
    while the ground fell away around it, and you could drive underneath it.
    They get pads now - which needed a two-phase build, because siting a
    station asks how high the ground is, and the ground now depends on where
    the stations are. A provisional field goes into the cache first, the
    stations are sited against it, then the field is rebuilt with them in.

    Their aprons are deliberately NOT marked paved. A station forecourt
    overlaps nine ordinary plots on this map, and a paved claim would sink the
    ground under those and float them; the apron is drawn as a raised forecourt
    above the grass instead.

    **The rule, stated once so it stops being rediscovered: two meshes with
    different vertices cannot be stacked closer than the error between them.**
    Give them the same vertices, or leave a real gap. And when you move one out
    of the way, check what was standing on it.

    `subdivideTriangles` moved to `terrain.js` on the way, because it is pure
    logic and it was sitting in the one file no test can run - and its error
    test only looked along the longest edge, so a bank running parallel to
    that edge sailed past it.

**Also open, from earlier:**

- **Better/more 3D models** — his standing top priority. Only `car`,
  `building_a/b/c`, `tree_a/b` exist. Every generated town building picks
  from those three, so a street reads as repetitive. `rock` and
  `streetlight` are commented out of `modelManifest.js` until the files
  exist.
- **`BLOG_URL`** in `ZoneManager.js` still points at
  `https://your-blog-url.com`. Live and reachable.
- **Custom domain** — he wants help buying one. `DEPLOY.md` Part 3.
  Remember rule 8.
- **AI traffic** — cars and pedestrians on the road graph. His stated
  reason for wanting connections modelled properly.

**Direction:** he wants the editor to feel like **Cities: Skylines**. The
tool merge and demolish tool were the first steps.

---

## Conventions

- British spelling in comments and docs
- Comments explain *why*, especially where something non-obvious prevents
  a specific failure. Don't narrate what the code plainly does
- Editor and game must never disagree; there's a test (`roadmatch.mjs`)
  that fails if they do
- Verify numerically rather than by eye. Nearly every bug found in this
  project was caught by measuring, not by looking
