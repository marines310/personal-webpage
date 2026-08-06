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
src/systems/               Camera, Inputs, Physics, Assets, Environment,
                           plus three files with no THREE in them, so that a
                           test can run them: seasons.js (the year),
                           cameraPose.js (where the camera sits) and
                           world/vehicleLights.js (what the lamps are doing)
                           world/fireGame.js (the fire callout),
                           world/policeGame.js (the pursuit) and
                           world/missions.js (what they share).

map-editor.html            The whole editor: one file, Vite entry, imports
                           the real modules from src/world/.

tests/                     37 suites, ~1300 checks. `npm test`.
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
npm test          # all 37 suites, ~1300 checks
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
- **Station signage**: FIRE STATION, POLICE and HOSPITAL lettered over the
  doors with a badge each (Maltese cross, shield-and-star, cross), one
  canvas per kind, lit after dark like the monorail station names. Where
  the board hangs is `stationSignBoard()` in the layout, not a number in
  the renderer — a fire station has 1.3 units of wall between its door head
  and its roof band, and a board sized for the hospital covers the opening
  the engine drives out of
- **Fire out of the windows**: the burning building shows flame in the
  model's own window openings — the same ones `windows.js` finds and lights
  at night — as well as the roof plume. Ground floor is left dark on
  purpose; that is the height an engine parks at
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

30. **The fleet is deliberately ahead of the network. `npm test` FAILS.**
    Read this before assuming something regressed.

    Mike asked for 94 vehicles - 30 sedans, 10 convertibles, 10 pickups, 20
    SUVs, 8 police, 6 ambulances, 6 fire, 4 buses - and pickups and SUVs were
    added as new kinds to carry it. The network cannot take 94. Measured over
    five simulated minutes:

    | fleet | slowest covers | median | relocations |
    |---|---|---|---|
    | 58 | 507 | 1,169 | 18 |
    | 73 | 268 | 884 | 32 |
    | 94 | 97 | 704 | 37, and a pair welded together for 113 samples |

    So `traffic.mjs` and `stations.mjs` fail on purpose until task 94 lands.
    Either fix the network or scale the fleet by about 0.62, which keeps Mike's
    ratios exactly.

    **And the cause is worth the reading (task 94):** the short lanes are the
    gap between two opinions about what a junction is. The lights merge
    junctions within 22 units into one signal; the road network keeps them as
    two nodes and cuts the road at both, leaving a 12-unit lane between that
    holds exactly one vehicle. Four such pairs on this map. Make the two agree
    and the plugs disappear - and there are fewer traffic lights, which is what
    Mike wanted anyway.

**Added 31 July - task 94 investigated, and it is not what item 30 says.**

31. **The short lanes are real; fixing them is not the way to 94 vehicles.**
    Measured, not argued. Everything below was run in a mirror of the working
    tree; the simulation is deterministic, so these are exact comparisons.

    **What the four pairs actually are.** Item 30 has them as "two opinions
    about what a junction is". They are more specific than that:

    | apart | island | what meets what | what it costs |
    |---|---|---|---|
    | 11.0 | projects | two town streets on the ring | the piece is below `LANE_MIN_LENGTH`, so **no lane is built at all** - the ring is severed there |
    | 12.7 | projects | a street meeting the ring **12.7u from where the bridge lands** | 12.4 / 13.3-unit ring lanes |
    | 12.7 | about | the same shape | 12.4 / 13.0-unit ring lanes |
    | 18.7 | projects | two town roads, off the ring | an 18.7-unit lane |

    **Merging the network nodes is the wrong fix**, three ways:

    - A merged node moves off both junctions it replaces. Free for a road
      passing through; not free for one that ENDS there, because its last
      point does not move.
    - Widening `LANE_JOIN_TOLERANCE` from 7 to 15 to cover that put a sideways
      jump of up to **13.3 units into 19 of 211 turns** - against the 3.6-unit
      jumps item 19 already had to ease in the renderer - and made the traffic
      worse at every fleet size below 94.
    - Declining unsafe merges by testing the JUNCTIONS is a proxy, and it
      passed a merge that pulled the ring's cut eight units off a **bridge
      landing**. The bridge lane arrived at a node with nothing leaving it:
      you could drive onto the island and not off it. Reachability went from
      every lane to 42 of 109. Nothing about the members' own positions showed
      it. The bridge's last point did.

    **And the headline: 94 vehicles is more than this world holds, whatever
    the layout.** Six configurations, 113 to 202 lanes, 29 to 42 signals:

    | fleet | build | slowest | median | relocations |
    |---|---|---|---|---|
    | 52, last-committed mix | untouched (**the control**) | 658 | 1105 | 6 - passes 43/43 |
    | 58 | untouched | 508 | 882 | 11 |
    | 73 | untouched | 236 | 861 | 18 |
    | 94 | untouched | 97 | 704 | 37 |

    The median never leaves 528-704 across all of them, against a 1000 target.

    **Three corrections to item 30:**

    - **"Scale the fleet by about 0.62" does not work.** At 58 the suite still
      fails: median 882 against 1000, 11 relocations against 6.
    - **The network saturates between 52 and 58**, and it is not the extra
      metal: total vehicle length is 290 units at the passing 52 against 295
      at the failing 58. There is no slack left.
    - **The red-light violation at 94 is density, not geometry.** The
      untouched build at 73 produces one too.
    - Item 30's table does not reproduce. Like-for-like at 58 gives
      508 / 882 / 11, not 507 / 1,169 / 18 - that row used a different mix.
    - **Mike's ratios starve the stations.** Scaled to 52 they give 10 service
      vehicles across 7 stations, where the fleet that passes has 28.

32. **Denser towns: built, measured, and PARKED. Not in the repo.**
    Mike asked for busier, more urbanised cities using more land. It is done
    and it measures worse than what is committed, so it was not shipped. The
    work is in the session mirror only; re-derive it or ask for the diff.

    What it did: block size 34 -> 24; a `grid: true` flag on the hub (which had
    no streets at all, and carries five bridges); streets that SLIDE along the
    ring to clear a bridge landing rather than being deleted; a usefulness test
    that drops streets which neither shorten a journey nor cross anything; and
    lights only where a road meets an arterial. Streets 9 -> 20, lanes 113 -> 202.

    **Why it is parked.** At 52 vehicles it scores median 1025 / slowest 78 /
    25 relocations, against the committed build's 1105 / 658 / 6. The cause is
    specific: **`stepTraffic()` assumes a lane is long enough to queue on.** On
    a 24-unit block, five lanes cannot hold a bus behind their own stop line at
    all and 51 are shorter than a bus plus its stopping distance. Until a
    vehicle on a too-short lane commits and carries through - the way a bus
    already does on the two 12-unit ring pieces - a denser grid costs more than
    it gives.

    Two things learned on the way, both from Mike looking at the map:

    - **Only two of six islands had street grids.** `hub` was `plain` and
      `contact` was `mixed`, so both were bare rings. That, not the block size,
      was most of why the world read sparse.
    - **A street that clips a corner of the ring is a bad junction and a useful
      route.** Pruning them lifted the median (604 -> 687) and dropped the
      slowest vehicle from 186 to 32. The fix is to remove the LIGHTS, not the
      street.

33. **The whole fleet was floating 1.4 units above the water.** Fixed 31 July,
    from a screenshot of Mike's.

    The hulls are modelled with their waterline at local y = 0 - the cargo
    ship's boot topping, the dark band a real ship wears at the waterline,
    straddles it from -0.75 to +0.35 - and they were being placed at world
    y = 0 while the sea is drawn at `SEA_LEVEL` (-1.4).

    **The interesting part is why nothing caught it.** `worldsanity.mjs`
    section 8 exists to find things left at a fixed height and had an explicit
    exception: `ship - afloat`. True, and it quietly meant nobody ever asked at
    what height. `ports.mjs` sails the fleet for fifteen simulated minutes
    across 124 checks and never once looks up. Same shape as the tunable in a
    branch that never ran, and the pavement that shipped blank with 396 checks
    green.

    **When you exempt something from a rule, say what the rule IS for it.** The
    guard now checks every hull is placed at `SEA_LEVEL`, verified by putting
    the bug back and watching it fail.

34. **The Ticker could run time backwards, and it whited out the world.**
    Fixed 31 July.

    `this.delta = Math.min((currentTime - this.lastTime) / 1000, 0.1)` capped
    delta at the top and not at zero. It CAN go negative:
    requestAnimationFrame hands you the timestamp of the start of the frame,
    which is earlier than the `performance.now()` captured in `start()`.

    A negative delta does not pause things, it runs them in reverse, and
    anything decaying toward zero grows instead. The one that shows is
    `flash = Math.max(0, flash - delta * 4.5)`, which climbs - and flash feeds
    the fog. Measured in a headless browser: **flash 114 on a CLEAR morning
    with no lightning anywhere, fog density 0.093 against the 0.0018 it is
    meant to sit at.** Dense enough to white out anything past thirty units.
    Three screenshots of the new airport came back as a white void before the
    cause turned out to be this rather than the airport.

    Clamped at both ends now. Flash also drives sky brightness and light
    intensity, so a washed-out or oddly bright world after a tab switch was
    probably always this.

35. **The airport.** Done 31 July. A platform on piles out at sea, with a
    runway, taxiway, terminal and four stands. Four aircraft land, roll out,
    taxi in, board, push back, take off and depart off-world - and the hull is
    re-used as an arrival from a different direction, exactly as the ships do.
    15 simulated minutes: 22 arrivals, 21 departures, all four stands used,
    zero runway conflicts. `tests/airport.mjs`, 23 checks.

    **Nothing about it is in the map file.** The site is searched for: open
    water measured against each island's real coastline, clear of the bridge
    crossings, inside the shipping lane, within reach of land. Move an island
    192 units and the airport re-sites itself 787 units away - the test
    demonstrates that rather than asserting it.

    Four mistakes, and every one is the tally on the previous page wearing a
    new hat:

    - **The site was scored against a FORMULA for the platform's size** while
      the layout built a slightly different one. A corner came out 26 units off
      CONTACT where 30 were asked for.
    - **The site was not the platform's centre.** The runway is on one side and
      the terminal on the other, so scoring the site scored the wrong point -
      the slab hung 33 units off to one side.
    - **The shipping lane was checked against the ring's RADIUS.** A ship sails
      the chord between two waypoints and a chord dips inside the arc, ten
      units here. `innermostShippingLane()` is the honest figure.
    - **The terminal faced the islands**, so from every angle anyone will ever
      see it, an eleven-metre wall stood in front of the runway and the
      aircraft. Mike spotted it immediately. The runway is laid tangentially,
      so that axis points either straight at the world or straight away from
      it; it now points away. **No measurement I had written would ever have
      failed on this** - the checks asked whether the pieces fit, never whether
      you could see them.

    Also: `pointAlong()` silently dropped `y`. Everything that had ever used it
    was flat - ships on the sea, trains on a level beam, traffic on roads that
    carry their own height per vertex - so an aircraft would have flown its
    entire approach at sea level with the descent invisible. It carries height
    now, which the elevated bridges (25) will want too.

36. **Helicopters.** Done 31 July. Ten pads - four on rooftops across ABOUT and
    EXPERIENCE, one on the ground per island - and three machines lifting off
    vertically, crossing at 46 units and landing on a different pad. Ten
    simulated minutes: 34 landings, all ten pads used, no pad double-booked.
    `tests/helicopters.mjs`, 18 checks.

    The whole problem is clearance, and one thing takes it away: the monorail
    beam. `monorailCeiling()` states how tall anything may be at a point, and a
    pad has to clear it by a rotor's width rather than merely fit under it - a
    machine that can sit on a pad and never leave is worse than no pad.

    - **The pad was sized off the HELICOPTER instead of the roof it sits on.**
      A town plot is 9 by 8 and the pad was 9, so every rooftop failed by one
      unit and the world had **zero rooftop pads** while `getHelipads()`
      returned a healthy-looking six. Tied to `DEFAULT_PLOT_DEPTH` now, and the
      test asks whether there are pads OF EACH KIND - "are there pads" passed
      the whole time.
    - **And one of the checks passed for the wrong reason.** "Every pad clears
      the beam" was true and proved nothing, because no pad lands anywhere near
      the beam on this map; it would have read identically with the rule
      deleted. It now also finds ground under the line, confirms the ceiling
      there is 5.1 units against the 15 a pad needs, and confirms nothing was
      placed there.

37. **Pick your vehicle, and a garage to change it in.** Done 31 July. You now
    start in front of a garage on the hub and scroll the whole fleet with
    A/D or the arrows - **sedan, convertible, pickup, SUV, police, ambulance,
    fire, bus** - then drive out in whichever you chose. Driving back into the
    bay reopens the picker, on the vehicle you arrived in rather than reset to
    a sedan. `src/ui/VehicleSelector.js`, `tests/garage.mjs`, 12 checks.

    The preview **is** the vehicle - `setKind()` rebuilds mesh, collider and
    wheelbase together at the current position - so there is nothing to keep
    in step between what you looked at and what you drove away in.

    - **The garage is sized off the fleet, not off a number that looked
      right.** Door 5.7 (widest vehicle + 2), depth 17 (longest + 6). Add
      something bigger to `TRAFFIC_LENGTHS` and the building grows with it.
      Item 22's lesson, applied before it could bite again.
    - **The first site put the roll-out 3.2 units from the monorail beam**,
      inside its 6-unit corridor, where a pier stands every 27 units. The
      siting asked about roads and about the fountain and never about the
      thing standing over the plaza. Piers slide to miss *roads*, and an
      apron is not a road - so one could have stood in the doorway.
      `clearOfMonorail()` now, and the test walks the whole drive rather
      than checking only the building.

    **The bus now drives like a bus.** `WHEELBASE_RATIO` is 0.7 - the axle
    spacing the sedan already had, expressed as a fraction of its length - so
    wheelbase follows length instead of being a constant. The bus gets 7.70
    against the sedan's 3.08, which is a 9.1-unit turning circle against 3.7.
    The sedan is unchanged to the last decimal, which is the point: the ratio
    was derived from it.

38. **Seasons.** Done 31 July. Spring, summer, autumn and winter, one season
    per day so the year is four days long, with a **Season** row in the
    conditions box beside the weather. `src/systems/seasons.js`,
    `tests/seasons.mjs`, 85 checks.

    - **The maths has no THREE in it**, so the whole year can be run in a
      test. Environment turns the numbers into particles and a call to
      `World.setSeason()`; World turns them into material colours. Neither
      decides anything - the same split as islandLayout and World.
    - **Nothing paints an absolute colour.** Each role (`grass`, `foliage`,
      `ground`, `roof`) gets a target colour and an amount, and every material
      mixes from ITS OWN base toward that target. The world is not one green -
      two frond colours, a bush green, a dark grass - and setting them all to
      "autumn orange" would flatten variety the map already has. It also makes
      **summer the identity**: every amount is zero, so the world in summer is
      exactly the world before seasons existed. The test says so.
    - **The blend is weighted by the amounts, and that is the subtle line.**
      Summer's amount is zero, so its colour is never read and is written as
      black. A straight colour mix drags the grass toward that black halfway
      through August, and the bug looks like the sun going out. The test
      drives 4000 samples through the year and checks the grass never goes
      darker than the darkest season it visits.
    - **Snow is a covering, not a colour in the table.** Written the other way
      round first, with the white folded into winter's grass tint - which made
      `snow` a number nothing read: eased every frame, handed to World every
      frame, connected to nothing, so a flurry out of season settled on
      nothing at all. Winter's own tints are now dormant grass and bare
      branches, and `SNOW_TAKE` says how much lying snow each surface holds
      (lawn 0.88, roof 0.72, sand 0.45, foliage 0.35; roads and cliffs none).
    - **There is no snow mesh.** The ground goes white by being coloured
      white. A white surface laid over the grass is item 29 exactly, and the
      grass has already shown through the tarmac three times for that reason.
    - **SNOWING is a real weather**, reached by substitution rather than by a
      second chain: `showers` and `storm` become `snowing` when `chill` says
      so - always in winter, about one time in seven in late autumn. One
      chain, and the season decides what falls out of the cloud. `flake`
      rides alongside `rain`, so `rain * (1 - flake)` streaks down as water
      and `rain * flake` drifts down as snow; halfway between, for the few
      seconds it eases, is sleet.
    - **Falling leaves and falling snow are one particle field**, and they can
      be because no season asks for both - which the test asserts rather than
      assumes. Leaves put up a sixth of the flakes snow does: at equal density
      they read as confetti, which is what the first pass looked like.
    - **Spring flowers grow rather than appear.** About 1900 sown sites, three
      flowers each, two instanced meshes for the whole world, scaled from
      their base by the season's flower amount so they push up out of the
      ground and die back into it. The matrices are rewritten only when that
      amount actually moves - a few seconds a year.

    Two things want Mike's eye rather than more measurement: the sky under
    SNOWING is dark (the existing cloud shader, same as storm) against a
    bright snowy ground, and the palms take only a quarter of the season so
    SKILLS and BLOG stay jungle. Both are taste, not correctness.

39. **The camera you can move.** Done 31 July. Drag the world to look around,
    wheel to zoom, Q/E/R/F/Z/X for the same from the keyboard, and a **Camera**
    box top right to save a view you like. `src/systems/cameraPose.js`,
    `tests/camera.mjs`, 80 checks.

    - **The maths left Camera.js.** Camera.js needs a browser - THREE, a
      canvas, a physics world - so everything with a decision in it is in
      `cameraPose.js`, which has no THREE. Same split as islandLayout/World
      and seasons/Environment.
    - **The guarantee is section 1 of the test.** The old positioning code is
      copied into the test verbatim, and the new code has to agree with it at
      every speed and every angle: 1525 positions, worst disagreement 7e-15.
      Adding free look fails silently by *retuning the driving feel*, and this
      is what stops that happening by accident.
    - **The pose is three OFFSETS, not three absolutes**: yaw round from
      behind, pitch added to the rig's own elevation, zoom as a multiplier.
      Absolutes would fight the speed pull-back - you would set a nice height
      standing still and lose it the moment you accelerated - and at (0, 0, 1)
      the polar round trip is the identity, which is what makes the guarantee
      above possible at all.
    - **Default, saved, live.** Free look moves `live`; left alone it eases
      back to `saved` after 2.5s; V makes the live view the saved one; C snaps
      there. So "make it stick where I put it" and "let it drift back" are the
      same mechanism rather than a mode, and someone who never saves anything
      still gets the shipped camera back.
    - **Pitch is clamped on the TOTAL angle, not the offset.** The rig's own
      elevation moves with speed, so clamping the offset would make "as low as
      it goes" a different angle at 5mph and at 50, and the camera would sink
      into the road on a fast straight.
    - **Occlusion asks the physics world.** One `castRay` a frame against the
      colliders the car itself hits, so the camera and the car agree on what
      is solid. Raycasting meshes instead would have it stopped by a cloud, a
      light pool or a pane of glass, and slide through a collider with no mesh.
      Measured: at a normal or raised pitch the camera sees over the town and
      is almost never blocked, which is correct; at a lowered pitch 4 of 48
      bearings on the hub are blocked and it pulls in from 30.6 to 16.0.

    Three bugs, all caught by a check rather than by looking:

    - **The occlusion floor was applied in the wrong order.** `max(floor,
      min(wanted, hit))` reads fine and is wrong: zoom in to two units, put a
      wall at 1.9, and it pushed the camera OUT to 2.6 - past where it was
      asked to be and into the wall it was avoiding. Occlusion may only ever
      bring the camera closer.
    - **The tail of every drag was thrown away.** Reading the accumulated
      pixels only `if (dragging)` meant the movement between the last frame
      and the mouseup was counted and then never spent. Invisible at sixty
      frames a second and half the drag at ten - a bug that would only ever
      appear on a slow machine.
    - **`sanitisePose` had been `clampPose`.** The stored pitch is an OFFSET
      and may be negative; clamping it as though it were a total turned every
      saved low view into a raised one on reload.

    The reverse view swings the camera round after 0.75s of actually reversing
    and comes back after 0.35s of not - different on each edge because a blip
    of reverse is meaningless and the road ahead is not. Below 1.6 units/s
    nothing happens at all, so shuffling out of a parking space never spins
    the world.

40. **Lights that work on every vehicle, and indicators.** Done 31 July. Two
    headlights, two tail lights and four amber indicators on every kind,
    driven by one function. `src/world/vehicleLights.js`,
    `tests/vehiclelights.mjs`, 68 checks.

    **The bug Mike found.** There were two lighting systems: the traffic
    registered its headlights on the world's night-emissive list, and the
    player's car had its own materials and its own `updateLights()`. They
    already disagreed - the player's answered to weather and the traffic's
    only to nightfall, so a storm at two in the afternoon lit the player's car
    and nothing else on the road. Then `setKind()` started rebuilding the
    player's mesh from the traffic builder, and `this.headlightMaterial` went
    on pointing at the **sedan's** material from before the swap. Every
    vehicle out of the garage but the sedan drove around unlit while the code
    carefully lit a mesh that was no longer in the scene. The lamps are read
    off the mesh each frame now: a reference you re-read cannot go stale.

    Three more faults fell out of unifying the two:

    - **Every non-sedan was floating.** Traffic meshes are built standing on
      the ground; the player's is drawn at the chassis centre. Nothing said
      so and nothing converted - measured at 0.47 units for a saloon and 0.65
      for the bus. Now 0.03 to 0.21.
    - **And carrying eight wheels.** The player added four sedan-sized wheels
      on top of whatever body it was given, sunk into the road under the bus.
      The traffic builder records its own wheels on the mesh; the player uses
      those.
    - **Changing vehicle swung the car round to face north.** `this.heading`
      was stored and restored across `setKind` and nothing ever wrote it. It
      is read from the body now, and the body's rotation is restored with it.

    **Indicators.** Amber at all four corners, blinking at 1.4Hz with a
    per-vehicle phase offset so a queue at a red doesn't blink in unison. The
    player's follow the steering, with `,` and `.` as a stalk that overrides
    them and self-cancels once the car has actually gone round.

    Two sign bugs, and how they were caught:

    - **`turnDirection` was backwards, and the test agreed with it.** The sign
      was reasoned from a compass - "east is +PI/2, so turning right increases
      the heading" - which is false here, because the car's nose is +Z and its
      right is therefore **-X**. Every AI indicator was on the wrong side. The
      test compared the function's answer against the function's answer
      computed from the lane headings either side of a junction: both were
      flipped together and it passed perfectly. What settled it was a cross
      product against the car's real direction of travel in the running game.
      The suite now checks handedness geometrically, over 148 junction turns.
    - **The stalk never self-cancelled**, because "how far have I turned" was
      a wrapped difference of two headings. That cannot describe more than
      half a turn and its sign flips past 180 degrees: a car that had swung
      213 degrees to the right reported -2.56 radians, which reads as a left
      turn. Accumulating the small per-frame deltas has neither problem.

    **What was tried and rejected.** The AI should signal BEFORE a junction,
    and that was built: the onward lane was chosen a couple of seconds early
    by the same function with the same randomness, and remembered. It worked.
    It also moved every vehicle's `rand()` draws, which re-shuffled every
    route in the city, and one car in the re-shuffled 94-vehicle run crossed a
    red light - measured over four durations where the old code never did. A
    red light is one of only three things allowed to stop a vehicle here. So
    it signals from the turn it is committed to and already taking, and the
    traffic numbers are **bit-identical** to before indicators existed: min
    97, median 704, max 2448, 37 relocations. That equality is the check that
    this cost the simulation nothing.

41. **The fire callout.** Done 1 August. Every minute or two a building
    catches light somewhere; smoke goes up so you can find it from the next
    island; get a fire engine alongside and hold it there and it goes out.
    `src/world/fireGame.js`, `tests/fire.mjs`, 61 checks.

    **The rule it all hangs on is deliberately asymmetric.** Driving the fire
    engine, only YOUR engine can contain it - the AI turns out and fills the
    street and cannot finish the job, or the game plays itself while you
    watch. Driving anything else, the AI deals with it and there is no bar,
    because it is not your bar. One flag, asked in one place:
    `whoIsFighting()`.

    - **The decay nearly broke the second half.** Losing progress when nobody
      is on station is the player's challenge, and applying it to the AI as
      well meant a responding engine crossed the map, reached the fire, got
      the bar to 8.3 of 14, drove on round the block and lost the lot. The
      fire was still burning after 320 seconds, and would never have gone out
      for anyone not driving the engine themselves. It only shows in the
      running game - the pure test passed, because the test put an engine at
      the fire and left it there. Decay is now the player's alone.
    - **Callouts reuse the go-home routing.** `v.mission` is the same
      hops-per-lane table that already sends a service vehicle back to its
      station, and it goes through the SAME scoring branch - so it draws the
      same one `rand()` per option and cannot shift anybody's sequence. The
      traffic numbers with no fire burning are bit-identical: min 97, median
      704, max 2448, 37 relocations.
    - **Buildings are recorded with the height they came out at**, not the
      height that was asked for. Under the monorail a building loses storeys
      and a model is squashed, so the two regularly differ - and a smoke
      column started at the requested roof would hang in the air above a
      shorter building.
    - **worldsanity caught the fire group at y=0.** The children carried
      absolute heights, which is right only while the ground under that
      particular building happens to be at zero. The group sits on the ground
      now and everything in it is measured from there.

    **Changed 1 August at Mike's request:** fires now start every **two
    minutes** exactly - `FIRE_GAP_MIN` and `FIRE_GAP_MAX` are both 120, on
    purpose, because "every two minutes" is a promise you can feel and the
    70-150 second window it replaced read as random. And there is now an
    **arrow** under the banner with the distance to the fire.

    The arrow is aimed from the CAMERA, not the car - what "left" means on a
    screen is decided by where the camera is looking, and an arrow aimed from
    the car would swing about every time you looked over your shoulder while
    the world stayed still. Its angle comes out of `missionArrow()` already in
    screen terms (0 up, growing clockwise, which is what a CSS rotation
    wants), so the heading convention is flipped exactly once, in the pure
    module, rather than in the renderer where nobody would find it. The
    handedness was checked in the running game against the camera's own
    matrix - ahead/right/left/behind gave 0/90/-90/180 - rather than derived
    from the heading convention, which is the check that was missing when
    `turnDirection` came out backwards and its test agreed with it.

    One thing that needed fixing with it: the panel was only on screen while
    there was a banner or a bar, and the banner clears after five seconds
    while the fire burns for minutes. So the arrow was hidden for all but the
    first five seconds of every fire - the entire time you would be using it.

    Measured response times: **about 14 seconds** once you are alongside, and
    **roughly four minutes** for the AI to deal with a fire on the far side of
    the map on its own - it is a background event, and the engines have to
    drive there through the traffic like everything else. Say if that is too
    slow and it is one number.

42. **Clicking the weather box stopped you driving.** Fixed 1 August, and it
    was mine twice over.

    Clicking a button leaves it FOCUSED. That drew a ring round the whole
    conditions box, and it meant tapping space to brake re-pressed whichever
    button had been clicked last. The fix for the second problem was to stop
    key events propagating out of the panel - which worked, and created
    something far worse: `Inputs` listens on the WINDOW, so an event swallowed
    inside the panel never reaches the car at all. Click the weather box once
    and W, A, S and D did nothing until you clicked the world again. Mike
    found it; the screenshot showed the focus ring, which is the tell.

    Suppressing a symptom cost the entire keyboard. Blurring removes the
    cause: nothing is focused, so nothing can be re-pressed, and every key
    goes exactly where it always went.

    Two layers, because the first version of this rule only knew about the
    panels that existed when it was written:

    - `releaseFocusAfterClicks()` blurs on **mouseup** in the conditions and
      camera boxes. Mouseup rather than click, because a click fires after
      focus has been taken and, on a range slider, only when the drag ends.
    - `Inputs.onKeyDown` blurs whatever is focused before acting on any
      driving key, wherever the focus came from - the zone panel's links were
      never considered by the per-panel version. Unconditional, and safe:
      there is nothing in this game you type into.

43. **The pursuit.** Done 1 August. A car flashes and runs; drive the police
    car into it and it is over. `src/world/policeGame.js`,
    `tests/police.mjs`, 59 checks.

    Same asymmetry as the fire, deliberately. Driving the police car, only
    YOU can catch it - patrol cars converge and fill the mirror with blue
    lights and none of them can end it. Driving anything else, one to three
    chases run in the background and resolve on their own, off screen, the
    way a city does.

    - **A robber is a car already on the road, told to run** - not a new
      vehicle. It is already in traffic, already has a lane, already collides
      with everything, and when the chase ends it carries on with its day. A
      bespoke fleeing car would have been a second kind of vehicle with a
      second set of rules.
    - **It is slower than a police car on purpose.** `ROBBER_SPEED` 0.92 of
      the player's 18, so 16.6 against 18 - closing at 1.4 units a second,
      which reels it in over a long street and gives it back on a missed
      corner. Faster than the traffic's own 15, or it would not be running
      from anything. `PLAYER_TOP_SPEED` is a second copy of Vehicle's
      `maxForwardSpeed`, so the test reads both files and compares them.
    - **It runs red lights**, which is what makes a pursuit a pursuit: the
      patrol cars queue at the red and lose it, and you have to decide at
      each junction whether to follow. That is not an exception to the
      deadlock rule - it REMOVES a reason to stop rather than adding one, and
      the robber still gives way to the car in front and is still vetoed out
      of anything it would hit.
    - **It flees by where each way out GOES, not where it starts.** Every
      lane out of a junction begins within a few units of the others, so
      scoring the entrances scores four numbers that barely differ and the
      choice comes out as noise - a car dithering at every corner rather than
      running.
    - **Every scoring branch draws exactly one `v.rand()`**, so a chase
      cannot shift anybody else's sequence. Traffic with nothing happening is
      bit-identical again: min 97, median 704, max 2448, 37 relocations.

    **The HUD is now generic.** `missions.js` holds the arrow and
    `chooseMission()`, and every game hands over the same eight-field shape.
    UI.js asks World for one mission and draws it - it no longer mentions
    fires or pursuits at all, which is what will let the ambulance run arrive
    without touching it. The arbitration is one rule: **a callout you can act
    on beats one you can only watch**, whatever order they arrived in.
    Without it a fire that started first would sit on screen mid-pursuit.

    Two things worth knowing rather than guessing:

    - **A background chase has to time out.** The AI cannot catch a robber -
      that is the rule that makes your version a game - so a background chase
      that never ended would run all session and the world would slowly fill
      with flashing cars. `BACKGROUND_MIN_LIFE`/`MAX_LIFE` are the arrest
      nobody sees.
    - **A background chase gets nothing on screen** - no banner and no arrow.
      An arrow to the nearest one was built on 1 August and taken out again
      the same day at Mike's request. Worth recording so nobody adds it back
      reasoning from first principles: pointing the HUD at something you have
      no part in turns it into a list of everything happening in the world,
      which is the opposite of a callout. A background chase is scenery you
      may drive past and notice. If you want to be in one, get in the police
      car.

44. **Six things Mike found while driving, and CHASE MODE.** Fixed 1 August.

    - **The indicators were on the wrong sides of every vehicle.** This is the
      one worth reading. `turnDirection` had been checked against the geometry
      with a cross product and was right; the lamps were then hung on the car
      by assuming +X is the right-hand side, because that is what it is on a
      screen. It is not - the nose is +Z, so right is `forward x up` =
      (0,0,1) x (0,1,0) = **(-1,0,0)**. The suite passed throughout, because
      it verified which WAY to signal and never which LAMP that lit. One link
      of the chain checked and the next one assumed. `sideOfVehicle()` answers
      it now, in the pure module, where a test can ask it directly.
    - **The player's emergency lights never flashed.** `updateTraffic` drove
      the AI's beacons and nothing drove the player's - so driving a police
      car, an ambulance or a fire engine yourself was the one way to have a
      silent roof, which is exactly the vehicle you would pick to see them.
    - **The fire engine's beacons floated.** They were at 2.55 over the rear
      body, whose roof is at 2.0 - half a unit clear, in mid air. Every other
      emergency vehicle happened to have a flat back at about the right
      height, so nobody noticed the number was a guess. Both figures come off
      the cab now, which is where a real one puts them.
    - **Large vehicles could get wedged with no way out**, and **respawning
      dropped you on the plaza furniture**. These are the same problem - the
      car is somewhere it cannot drive out of - so there is now one
      `recoverToRoad()`, used by both. It puts the car on the nearest lane,
      pointing along it, dropped in from a little above so it lands rather
      than being placed inside the surface. Being stuck is judged on three
      things together: you are ASKING to move, you are NOT moving, and it has
      been true for three seconds. Deliberately not "speed is low" - a car
      stopped at a junction with no throttle is not stuck, and teleporting it
      would be alarming.
    - **The ladder was one pole.** It is a real ladder now - two rails and
      sixteen rungs on a turntable - and it animates: the turntable swings
      round, the ladder lifts, then it telescopes out, three nested groups
      easing at their own rate so they cannot only move together. The jet
      holds off until it is most of the way out, or the truck appears to hose
      the building through its own bodywork.
    - **CHASE MODE** stays on screen for as long as a pursuit is on. The
      banner clears after five seconds and a chase runs for minutes; without
      it the screen went quiet and nothing was left saying you were in one.

45. **The ambulance run**, the third of the three callouts. 1 August.
    `src/world/ambulanceGame.js`, no THREE, 58 checks in `tests/ambulance.mjs`.
    A crash every one to three minutes; get there, load the patient, get them
    to a hospital inside two minutes.

    **The rule this project keeps arriving at, for the third time: the
    pressure mechanic belongs to the player.** The fire's bar decays only for
    you; only your police car can end a pursuit; only your run to hospital is
    against a clock. It was found by measuring here as well, not by design.
    Held to the player's standard an AI crew reached the scene in 38 seconds,
    then took until **270 seconds** to accumulate ten seconds of standing
    within fourteen units of it - because an AI driver drives past rather than
    parking - and then sat **102 units** from the hospital as the clock ran
    out. Every background crash would have ended in PATIENT LOST. So
    *arriving* is the thing an AI can demonstrate, and once a crew is at the
    scene the rest of its run proceeds on its own timings
    (`CREW_LOAD_SECONDS`, `CREW_RUN_SECONDS`) and finishes off screen.

    Three decisions worth not re-deriving:

    - **The run is two phases, not one "on a job" flag.** Getting there is a
      search - a direction and a distance and no route. Getting back is a
      race - you know exactly where you are going. The arrow points at
      different things and the bar means different things in each, so they
      are separate.
    - **The loading bar pauses rather than decaying**, unlike the fire's. The
      fire's decays because holding station IS the skill being asked for.
      Here the skill was getting to the crash and it has already been
      demonstrated; punishing a nudge forward with the doors open would be
      punishing nothing.
    - **The transport bar drains.** A countdown that fills up is a countdown
      you read backwards.

    Crash sites come from the lanes, so a run is always completable - scatter
    them over the map and some land on beaches where the player would read
    the impossible run as their own failure. The island label is the one the
    road is *inside*, not the nearest centre: for a road on the edge of a big
    island the nearest centre is regularly a small island across water.

    **And the test-harness mistake this suite made for the fourth time in one
    session:** reading a timer immediately after `run(state, N)` steps *past*
    a phase transition. The clock has been counting down since the transition
    happened somewhere in the middle of those N seconds, so the reading is
    always short and it always looks like the product code is wrong. Step one
    frame at a time up to the transition and read THERE. A phase change is an
    event, not a state you can arrive at late and still ask when it happened.

46. **Holiday moments.** 1 August. `src/systems/holidays.js`, no THREE, 70
    checks in `tests/holidays.mjs`. Easter eggs and bunnies, Fourth of July
    and New Year fireworks, Halloween pumpkins, Thanksgiving turkeys,
    Christmas gifts and lights - on the calendar, or picked off the
    conditions panel.

    **A HOLIDAY IS A LAYER OVER THE SEASON, NEVER A SEASON.** The roadmap
    said so and it is worth restating with the reason, because the obvious
    build is extra rows in the SEASONS table and it fails immediately:
    Christmas happens IN winter and wants winter's bare trees and winter's
    snow. As a season it would replace them, and the bug would present as
    "the snow disappears when you put the decorations up" - a symptom that
    reads as a rendering fault and gets hunted for in the wrong file.

    So `HOLIDAY_KEYS` and `SEASON_ROLES` are disjoint sets, a test asserts
    that they are, and a second test drives the real seasons code through
    winter-plus-Christmas to prove the snow survives it. The structural
    version of the rule, rather than a comment asking nicely.

    Worth not re-deriving:

    - **The dates are the real ones**, `(date - 20 March) / 365`, not
      eyeballed into roughly the right season. Guessed at, Christmas and New
      Year came out 0.07 of a year apart with a gap between their windows, so
      the gifts were packed away before the fireworks started. They are 0.019
      apart in fact, which is inside one window, and the overlap is the point.
    - **Amounts, not flags.** Everything is 0..1 and eases, so decorations
      grow up out of the ground like the spring flowers do. A field that is
      either there or not there pops, and the eye reads a pop as a glitch.
    - **`growField()` is the flower field, generalised** - not a second copy
      of it. It was quicker to write a second version, which is exactly how a
      codebase ends up with two implementations that later disagree. Rule 1.
      `seasons.mjs` had one assertion that named `this.flowering`; it now
      names `field.amount`, same check.
    - **Festive bulbs are three strands, one per colour.** An InstancedMesh
      has one material and it is the material that carries `emissive`, so a
      single strand with per-instance colours washes out to one colour at
      night - which is when a string of lights is the whole point.
    - **They ride on `registerNightLight`** with a `festive` flag, not a
      second emissive system, so there is exactly one answer to "how dark is
      it" and the bulbs cannot drift onto their own dusk curve.

    **Three things that were only found by photographing them**, all the same
    mistake in different clothes - authoring at real-world scale in a world
    where a car is 4.4 units long and you are always on the road:

    - **The decorations were invisible.** A 44cm egg on a verge is a single
      pixel from a moving car. They are roughly twice life size now; measured
      through the real camera rather than judged by eye, the nearest egg is
      37 pixels across and a pumpkin 57.
    - **The fireworks were invisible.** Burst height was a fixed 42-78 units
      whatever the distance, so a near shell burst 40 degrees up - and the
      chase camera has about 30 degrees of sky above the crosshair, so the
      near half of every display was off the top of the frame. Height is now
      derived from the launch distance, holding every burst at about 19
      degrees. Ten photographs of a sky containing five shells had caught
      none of them.
    - **A burst was made of visible squares.** Points have no shape, so a
      point big enough to see is a big square. Twice the sparks at half the
      size is the same light and reads as a spray.

    And one measurement mistake worth recording, because it wasted three
    runs: `camera.project()` reads `matrixWorldInverse`, which the RENDERER
    refreshes - `updateMatrixWorld()` does not. Projecting without refreshing
    it reported every shell as beyond the far plane while they were plainly
    170 units away. A point BEHIND the camera also comes back with `w`
    negative and projects to nonsense, which is what the wild coordinates
    were; `z < 1` is the real in-front test.

47. **A callout that is not yours is not shown at all.** 1 August, at Mike's
    asking: *"if a user is not a firetruck, it should not see fire missions
    in the game world"*.

    This is the second half of a rule whose first half had been in the code
    since the pursuit was built. `chooseMission()` said "a callout you can act
    on beats one you can only watch", which sounds complete and is not: with
    nothing of yours running it fell through to `live[0]`, so driving a bus
    put FIRE AT ABOUT and an arrow on screen for a building you had no way of
    helping. One character of the fix - `|| live[0]` became `|| null`.

    Mike has now asked for this twice, once per game (*"no arrows for cops and
    robbers if I am not a police car"*, then the fire), which is what makes it
    a principle rather than two requests: **the HUD is a list of things you
    can DO, not a list of things that are happening.** A world event you
    cannot act on belongs in the world, and it is already there - the smoke
    still goes up, the wreck is still in the road, the patrol cars still go
    past with their lights on. You find them by looking out of the window.

    It lives in `chooseMission()` and nowhere else. `policeGame.js` had grown
    its own paragraph about hiding background chases; three games each
    enforcing the same rule is three chances to disagree about it. The games
    describe their callout, `chooseMission` decides what is worth your screen.

    **What the module test could not see**, and the browser did: hidden is not
    cleared. Driving a bus past the fire the panel was correctly hidden and
    still read `FIRE AT ABOUT · 300m` behind it. The arrow was already cleared
    explicitly for exactly this reason; the banner, the bar and the distance
    now are too. Verified by reading the real DOM in five vehicles - sedan,
    bus, fire, police, ambulance - against one fire that burned throughout.

48. **The aerial, rebuilt from photographs.** 1 August. Mike sent five
    pictures of tower ladders and pointed at three things. All three were
    wrong, and all three are the sort of thing you only get right by looking
    at the real object rather than by reasoning about it.

    - **It is REAR-MOUNTED.** The turntable sits at the back of the truck and
      the ladder lies forward over the cab when stowed. Ours rose out of the
      middle of the roof, which is where you would put it if you had never
      seen one. Now based at `LADDER_MOUNT_BACK` of the truck's length behind
      centre, in the TRUCK's frame so it stays at the back through a turn -
      measured at 2.10 units back on a 7-unit truck, 2.05 up, which is the top
      of the rear bodywork.
    - **It is a BOX TRUSS, not a ladder.** Four chords, rungs across the
      bottom pair, a diagonal each side per bay. That lattice is the whole
      silhouette against the sky and two rails could never read as it.
    - **The water comes out of the BASKET.** There is a platform at the tip
      with a monitor on its front rail, and the jet starts there. It used to
      run up the ladder from the truck.

    And a fourth Mike stated outright: **the basket stands off the building**.
    It parks a few metres clear and hoses in. The standoff is measured from
    the building's own footprint, not a fixed distance from its centre - a
    fixed one puts the basket inside a wide building and out in the street
    beside a narrow one.

    Two things worth not re-deriving:

    - **The bracing is placed, not scaled.** Diagonals inside a node scaled
      12x in z SHEAR: a brace authored at 45 degrees comes out at 5, which is
      indistinguishable from the chords it is meant to be bracing. So the
      chords - which genuinely stretch - are scaled, and the rungs and braces
      are positioned each frame in bays of roughly constant length. The basket
      is on a third node that is moved rather than scaled, or it would be
      stretched twelve times its own depth.
    - **The stowed ladder has to be hidden while the aerial is out**, and put
      back afterwards. The "afterwards" is easy to miss: the only line that
      restored it was below the no-fire early return, so putting a fire out
      while parked alongside left the truck with no ladder at all for the rest
      of the session.

    **Everything above was measured in the running game, not judged from a
    screenshot** - and one measurement caught the probe rather than the code:
    waited twenty seconds of wall time, the aerial was still on its way up at
    44 degrees where it was heading for 50, because the page renders about a
    frame a second here and the tick delta is clamped. Driving `updateFire()`
    directly settled it. Final numbers: 4 chords, 11 rungs, 11 braced bays at
    9.4 units of extension, basket 7.4 from the building centre and 1.6 above
    its roof, nearest droplet 0.12 from the nozzle and farthest 0.74 from the
    burning roof. Both ends of the stream, because one that starts in the
    right place and points out to sea is still wrong.

49. **The basket has to stay LEVEL.** 1 August, Mike on the first attempt:
    *"the baskets are all level"*. He was right and it is obvious once said -
    a real platform hangs on a levelling mechanism and is horizontal at every
    elevation, because people stand in it. Ours was bolted rigidly to the tip
    and rode up with the ladder, sitting at 45 degrees like a basket about to
    tip its crew into the street.

    The fix is one line - the tip node is a child of the pitch node, so
    cancelling the pitch there IS the mechanism. What is worth recording is
    the consequence that comes with it: once the platform is levelled, the
    nozzle's offset from the tip is horizontal-and-vertical, **not along the
    ladder**. The original maths rotated that offset with the ladder, which at
    full elevation put the stream starting beside the basket rather than in
    it. Two frames, and the levelling moves the boundary between them.

    **How it should have been caught the first time.** The maths for a rigidly
    bolted basket was perfectly self-consistent and every number checked out -
    it was simply describing the wrong object, which is the failure mode this
    project keeps meeting. The check that settles it does not look at the code
    at all: take the platform floor's own world quaternion, push (0,1,0)
    through it, and ask whether it points at the sky. With the ladder at 45.8
    degrees the arm tilts 45.8 and the floor and every railing tilt 0.00. The
    monitor reads 90 and is meant to - it is a cylinder laid on its side to
    point forward, and a first version of the probe that averaged it in
    reported a "90 degree worst part of the basket" that looked like a fault
    and was the nozzle doing its job.

50. **The crash scene, and traffic getting past it.** 1 August, three things
    Mike asked for together.

    **The wreck is two real cars.** They were two plain boxes; they are now
    built by the same builders the traffic uses - a sedan and an SUV, wheels
    and lamps and all - with a wisp of smoke off each bonnet. Its own smoke,
    not the fire's: that column rises 46 units and is meant to be seen from
    the next island.

    **The whole scene goes when the run ends**, which is three separate things
    and only two of them are visible: the wreck, the smoke, and the OBSTACLE
    the traffic has been steering round. Leaving that behind would have left
    an invisible crash diverting the city for the rest of the session.

    **And the jam.** Mike: *"traffic was completely blocked"*. What follows is
    four attempts, because the failures are the useful part.

    - **The wreck as a hard obstacle.** Correct and unusable: cars standing
      where the crash appeared were welded in place - 17,256 vehicle-frames
      inside a crashed car, six that never moved again.
    - **Exempting anything already inside.** Too generous. Everything that
      stops just short GRAZES it, counts as inside, and drives straight on
      through: 2,222 vehicle-frames of ghosting in the last twenty seconds.
    - **Letting the exempt ones move only outwards.** Same result by a longer
      route - "outwards" is satisfied by carrying on and coming out the far
      side.
    - **What it is now: a PREFERENCE, not a wall.** A vehicle at an incident
      first tries a way past that misses the wreck; if there genuinely is
      none, it goes anyway. Every absolute version was the same mistake - a
      fourth thing allowed to stop a vehicle dead, in a simulation whose
      central discipline is that only three may.

    Three things do the work, in this order: traffic is **routed away** at the
    junction before (a penalty on the score, so it cannot deadlock and a lane
    that is the only way out is still taken); whatever is committed **goes
    round** without waiting SWERVE_AFTER; and only then may it **cross the
    line**, one-sidedly and with a gap. One-sided is what makes it safe - the
    unobstructed direction never yields, so gaps keep appearing, which turns
    "both wait for each other" into "one at a time".

    **The measurement that unlocked all of it** was not about rules at all:
    the two cars were laid nose to nose ACROSS the lane, which on a seven-unit
    road spans the entire carriageway. No rule about giving way could do
    anything, because there was no gap to use. The wreck is shunted to one
    side now (`CRASH_SIDE_OFFSET`) and angled as a shunt rather than a
    T-bone - and the check that says whether there is room had to be fixed
    too, because it measured half-WIDTHS. A car turned across the road
    presents its length: at half a radian a 4.4-long sedan reaches 1.9 units
    across, twice what the arithmetic claimed. It passed a check while sitting
    on the middle of the lane.

    **Determinism held throughout**, and it was checked after every step: with
    no incident the simulation is bit-identical - min 97, median 704, max
    2448, 37 relocations. The avoidance is a subtraction applied AFTER the
    random draw for exactly that reason; a fourth branch in `orderedNext`
    would move somebody's draw and re-shuffle every route in the city.

    `tests/incident.mjs` runs the fleet for two minutes with a lane shut.
    Measured: median distance 317 against 303 on a clear run, longest anything
    stood still 36s against 35s, no extra collisions, no relocation spike.

    **What is honestly not fixed:** about two or three cars clip the wreck at
    any moment. Every position across a road is somebody's driving line - move
    the wreck off one lane and it lands on the next - so a crash in the road
    is always in somebody's way. It can be absolute and the city stops, or a
    preference and some cars clip it. The test threshold is set to catch a
    return to the old behaviour rather than to bless the number.

51. **Christmas, properly.** 1 August, four things Mike asked for.

    **The lights were never lit, and the cause is worth remembering.** His
    words: *"they are currently just colorful balls"* - exactly right.
    `registerNightLight()` only guarantees a material HAS an emissive colour,
    and `MeshStandardMaterial`'s default emissive is BLACK. Every other lit
    thing in the world sets its own emissive explicitly; the bulbs did not. So
    `emissiveIntensity` was faithfully scaling black by 2.6 all night. One
    missing line, and nothing about it looked wrong in the code - the strength
    was right, the flag was right, the dusk curve was right. The lesson is the
    check: the question is not "is the intensity set" but "is intensity times
    the emissive COLOUR a non-black thing", which is what being lit means.
    Measured after the fix: five festive materials, all with a real emissive
    colour, litness 1.48 to 2.6.

    **A lot more of them.** 16 bulbs a building became **50** - eaves the
    whole way round, a strand across each storey's windows down the front, and
    an arch round the door. 4,491 bulbs over 89 buildings. The front is the
    face the building was rotated to present, which meant recording
    `rotation` in the buildings registry: it was always known and simply never
    written down. Lighting all four sides instead would light the backs of
    terraces into gardens nobody can see.

    **A wreath on every front door** - a ring, a bow, and three berries that
    are on the festive list so they glow with everything else rather than
    being the one dark thing on a lit house.

    **Christmas trees** are a holiday prop (`trees`, 0.45 share, star on the
    festive list). **Snowmen are NOT.** They hang off the season's `snow`
    number, which is the whole point: a snowman is what happens when there is
    snow on the ground, not what happens on the 25th. In the holiday table
    there would be no snowmen in January and a snowman at a green Christmas.
    Verified in the running game - plain winter has snowmen and no
    decorations; summer has neither.

52. **The stuck valve never fired, and the reason is this project's oldest
    lesson in a new place.** 1 August. Mike got the ambulance wedged on a
    verge for the second time and asked why the recovery built for exactly
    that case was not rescuing it.

    `updateStuck()` asked `Math.abs(this.currentSpeed) > STUCK_SPEED`.
    `currentSpeed` is the bicycle model's **intended** speed: touch the
    throttle and it ramps to cruise whether or not the vehicle is going
    anywhere. So a vehicle wedged nose-up on a kerb reported a confident five
    units a second while its body sat perfectly still - `moving` was true, the
    timer reset every frame, and the valve could not fire however long you sat
    there.

    **Ask the geometry where the object ended up, never a proxy for it.** The
    body's own translation between frames is the geometry; `currentSpeed` is a
    proxy, and a proxy that disagrees with reality *precisely when something
    has gone wrong* is worse than having none - it reports healthiest at the
    moment of failure.

    Driven in the browser with the model claiming 5 and the body pinned:
    rescued at 3.0 seconds. A vehicle held still with NO throttle is still
    left alone, which is the property that stops this teleporting people out
    of queues.

    One thing the probe caught about itself, worth recording: the first
    version left `currentSpeed` at zero, so the OLD code would have passed it
    too and it proved nothing. A regression test for a bug has to reproduce
    the bug. The second version also measured nothing because `updateStuck()`
    bails out while the garage picker is up - correct in the game, and it
    reported the timer at zero as though the valve were dead.

53. **Lights on the Christmas trees.** Same day. A dark green cone under a
    night sky is a silhouette, and the star alone was one bright dot on it.
    Eleven bulbs wound down each tree in a spiral rather than a ring per tier
    - a ring reads as a hoop, a spiral reads as a string that was wound on -
    sharing three materials on the festive list. The foliage was lifted from
    `0x225c30` to `0x2d7a3c` as well, because unlit at night the old green
    went almost to black and the tree read as a hole in the snow.

54. **Two "it didn't go back" bugs, both from Mike, both measured.** 1 August.

    **The Christmas lights that would not leave.** They did leave - and the
    CALENDAR put them straight back. `phaseForSeason('winter')` is 0.75;
    Christmas sits at 0.77 with a half-window of 0.025. So **the very first
    instant of winter is inside Christmas, at 74% strength**. Turn the holiday
    off and then click Winter, or press "back to the automatic cycle", and the
    decorations return - which reads as them refusing to go.

    The rule that makes it predictable: **the calendar drives holidays only
    while the calendar is driving the season.** Pick a season by hand and you
    get that season and nothing else; pick a holiday as well and you get both.
    Nothing arrives that you did not ask for, and "back to auto" hands both
    back at once.

    Also tidied while in there: `growField` now snaps to exactly 0 below the
    visibility threshold. The easing is exponential and never reaches zero, so
    a field that had been turned off sat at 0.003 for ever - invisible, but
    with its state saying "very slightly on", which is the sort of almost-off
    that eventually gets read as on by something else.

    **The grass that would not go green again.** It did, eventually - the end
    state was always exactly `#5fa84e`. The problem was how long: measured at
    **65.2 seconds** for the snow to melt off it, so a minute after clicking
    Summer the grass was still `#62a951`.

    Snow's own clock is right for weather - a flurry blows through and its
    dusting lingers, which is what stops five seconds of sleet whitewashing an
    island - and wrong for a menu. Picking a season by hand now hurries the
    snow: **5.6 seconds** instead of 65.2.

    The hurry is a CAP with a condition, not a duration. A fixed ten seconds
    was tried first and expired while the WEATHER was still easing out of
    snowing, so the target was still high when the hurry stopped and the last
    of it melted at the slow rate anyway. It now ends when the snow has caught
    up with the season, which is the thing actually being waited for.

55. **Halloween gets its own decorations.** 1 August. Mike: *"don't add the
    Christmas lights - add more distinctly halloween decorations."* He was
    right that it was borrowing: Halloween had pumpkins and a red-green-gold
    strand, which reads as somebody having left the Christmas ones up.

    Now: jack-o'-lanterns with carved faces that glow, sheet ghosts, witches
    with brooms, gravestones in the grass, HAPPY HALLOWEEN signs, and a
    trick-or-treat basket on every doorstep. Measured in the running game: 80
    lanterns, 66 ghosts, 20 witches, 44 graves, 16 signs, 89 baskets.

    **One set of strands, two tones.** The lighting is two AMOUNTS - `lights`
    and `spooky` - rather than a colour, because every value in a layer has to
    be a number that eases from 0 to 1 and a colour cannot. The strand takes
    whichever is louder and its tone is the ratio between them, so a handover
    changes colour on the way rather than snapping. Building a second set of
    orange bulbs would have been four and a half thousand more instances
    holding a copy of something already there.

    The signs are a **canvas texture**, because a sign has to say something and
    there is no low-poly way to spell. One canvas, one material, shared by
    every sign - and on the festive list, so it is readable at night instead of
    being the one Halloween decoration you cannot see at Halloween.

    **Three mistakes worth keeping:**

    - **The baskets never appeared, and nothing threw.** They hang off
      `doorSites`, which `createFestiveLights()` collects while walking the
      buildings - and they were being built before that ran, so the list was
      empty and `if (length)` was simply false. The quietest way an ordering
      mistake can present: no error, no warning, just an absent decoration.
    - **The decorations were placed at absolute heights.** `b.height` is
      measured from the building's own base and `addBuilding()` puts that base
      at `groundAt(x, z)` - so every light, wreath and basket needed that
      offset. Without it the whole set is right only where the terrain happens
      to be at zero: on a slope they float over the roof at the top of the hill
      and sink into the wall at the bottom. It slipped in because the town I
      was looking at was flat.
    - **A probe measured a stale build.** The first Halloween run reported the
      ghosts, witches, graves and signs as missing entirely; they were fine,
      and `dist/` predated the density table they needed. Rebuild before
      measuring, or the measurement is of something else.

    And the thing Mike has now asked for twice, checked properly: turning the
    holiday off leaves NOTHING. The test walks the full field list rather than
    the ones I remembered to wire up, because a decoration that stays behind is
    exactly a decoration nobody connected to the layer.

56. **Respawning on top of other cars, and Halloween snowmen.** 1 August.

    **The respawn.** Mike: *"it tends to respawn on top of other cars"*. It
    did, and nothing stopped it: `recoverToRoad()` dropped the car twelve units
    along the nearest lane every single time, with no idea whether anything was
    standing there. The traffic's own `relocate()` has checked for a clear spot
    since the day it was written - the player's recovery never did, which is
    what happens when two things that do the same job are written years apart.

    Falling in the sea now puts you on the **garage apron**, and the reason is
    better than tidiness: that patch of ground was CHOSEN, when the garage was
    sited, to be clear of every road and big enough to hold a fire engine. No
    lane runs through it, so no traffic can ever be on it. Every other spot in
    the world is somebody's road. It is also where you started, so falling in
    the sea reads as being put back at the beginning.

    The nearest-lane recovery is still the fallback and now walks outward from
    its usual spot looking for a gap. Clearance is judged against where the
    traffic is DRAWN rather than its lane offset - the two differ by up to a
    lane width at a junction, and the drawn one is what you would land on.

    Measured over 25 respawns with the city moving between each: nearest
    vehicle 7.2 units at worst, median 17.8, **nothing landed on anything**.

    `placeAt()` came out of it - one stop-and-place, used by both. There are
    two answers to "where" now and still one implementation of "put it there".

    **No snowmen at Halloween**, also asked for directly. They belong to the
    season's snow rather than to the calendar, so the only way to get one is to
    force winter weather at Halloween - which the conditions panel lets you do,
    and a snowman on a Halloween lawn is somebody else's decoration.
    `noSnowmen` is the one key in a holiday layer that takes something away
    rather than putting it out, and it earns the exception by still being an
    amount that eases: it fades them rather than switching them off.
    `setSeason` records the snow, `setHolidayLayer` records the veto, and one
    function combines them - called from both, because either can change the
    answer and neither knows the other's number.

57. **"There are still snowmen" - and there weren't.** 1 August. Mike sent a
    photograph of an autumn Halloween street with a field of white figures on
    it. The snowman field measured **amount 0, not drawn**. They were the
    GHOSTS.

    The veto from item 56 was working perfectly and the report was still
    completely right, which is the part worth keeping: **"it looks like X" is a
    bug even when the logic says Y.** A white sphere on a white cone, standing
    on the grass with two dark dots on its face, IS a snowman. Nothing about it
    said ghost except my intention.

    Five changes, each of them something a snowman cannot do: it FLOATS with a
    gap underneath, it TAPERS downward to a tattered hem instead of bulging out
    at the base, it has ARMS, it has an open MOUTH as well as eyes, and you can
    see through it. Measured: the ghost floats 0.17 clear and goes 0.80 wide at
    the top to 0.17 at the bottom; the snowman sits at -0.02 and goes 0.84 to
    0.52. Their number came down from 66 to 32 as well - sixty-six on one
    island read as an installation rather than as decorations.

    **And everything tall was oversized**, which the same photograph showed and
    no test had ever asked about. The site size (1.9-2.5) exists because an
    Easter egg at true scale is one pixel from a moving car; every kind then
    inherited it, including the ones that were never small. Measured in world
    units against a 3-unit storey and a 4.4-unit car: a witch **6.1** tall, a
    snowman 5.0, a ghost 4.5, a headstone 2.9. `DECOR_SCALE` now gives each
    kind its own size and the site size goes back to being what it was for -
    the variation between one instance and the next. Ghost 2.6, witch 2.8,
    snowman 2.6, tree 3.6, headstone 1.4.

    Worth noting how it was found: the picture said "too big", and a picture
    cannot answer "how big" - a prop photographed from six units away always
    looks enormous. The measurement that settled it was world height against
    two things whose size is not in question.

58. **Falling in the sea puts you back in the garage.** 1 August, Mike's idea
    after the apron still was not good enough - and it is better than anything
    I had.

    Every version of "put the car back on the road" has the same problem: the
    road belongs to the traffic, so any spot on it might be occupied, and
    picking a clear one is a search that can fail. The garage bay cannot be
    occupied, cannot be on a slope, and needs no search - **and the flow out of
    it already exists and is already right, because it is how every session
    starts.** So falling in is not a teleport at all now: it is starting again.
    You pick a vehicle and drive out, which is something that happens to you
    rather than something the game does around you.

    Worth noticing as a pattern: three attempts were spent making a placement
    algorithm better, and the answer was to stop placing and reuse a flow that
    was already correct. The road recovery stays as the fallback for a world
    with no garage in it.

    **Two latent bugs in the garage came out with it**, both from the same
    root - the selector was written against fields that do not exist:

    - `park()` assigned `vehicle.speed = 0`, and a Vehicle has `currentSpeed`.
      Harmless while the car was always stationary at the start of a session;
      not harmless once falling in the sea brings you here at whatever speed
      you left the road, because the physics velocity was cleared and the
      driving model's own speed was not. It goes through `placeAt()` now, the
      one stop-and-place path.
    - `checkEntered()` guarded on `Math.abs(vehicle.speed || 0) > 2.5` to stop
      driving PAST the door snatching control away. Same missing field, so the
      guard has never once fired.

    The bay height also asked for a flat 2.2 rather than the ground - right by
    coincidence, because the hub is near zero.

    Driven through the real fall in the browser rather than by calling
    `respawn()`: put below FALL_LIMIT at speed, then `postPhysicsUpdate`.
    Measured - picker open, input held, car 0.00 from the bay, speed 0, facing
    the door.

    And one about the test: `!/vehicle\.speed = 0/` reported the fix as missing,
    because the COMMENT explaining the bug contains the bug. It checks line by
    line ignoring comments now.

59. **A vehicle under the water that nothing noticed.** 1 August. Mike
    photographed a fire engine sitting below the surface, city visible above
    it, speed zero, no recovery.

    **The gap:** `FALL_LIMIT` is -4.5 and `SEA_LEVEL` is -1.4. There are three
    units of depth in which a vehicle is completely submerged and no check
    exists. The fall test only ever asked "has it gone past -4.5".

    **What it is NOT:** the obvious cause is a car settling on the island's
    underwater slope, and that was measured and ruled out - 28,800 samples of
    ground around every island, and **not one point** sits between sea level
    and the fall limit. So something else was holding it: a quay collider, a
    pier, another vehicle. I could not reproduce it to find out which.

    Which is the argument for fixing the CLASS rather than the cause. "Under
    the water" is something the player can see and something no legitimate
    driving produces - every road on the map is above the waterline - so it is
    a sound trigger whatever put the car there. Submerged for a second and a
    half and you go back to the garage. The depth check runs ALONGSIDE the fall
    check rather than replacing it, so a car falling past -4.5 does not have to
    wait first. Measured in the browser: held at y = -3, rescued at 1.5s, back
    in the bay.

60. **The run to the cells.** 1 August, Mike's addition to the pursuit:
    catching the car is not the end of it. You have the suspect in the back and
    a station to drive to, the same second half the ambulance run has - and for
    the same reason, that arriving somewhere is a thing you can DO, where the
    chase ended the instant you touched the car.

    **It deliberately has no clock.** The ambulance's two minutes exist because
    a patient is dying; nothing is dying in the back of a police car, and a
    timer here would be jeopardy invented to match a shape rather than because
    the fiction asks for one. The pursuit already had its pressure - it was the
    pursuit. So this half is a delivery, not a race.

    Four cases that needed deciding rather than defaulting:

    - **No station in the world at all** - the arrest ends there rather than
      opening a leg that cannot be completed.
    - **Getting out of the police car mid-delivery** - SUSPECT HANDED OVER. The
      arrest already happened; losing it would punish a change of vehicle.
    - **Never delivering him** - `ABANDON_CUSTODY`, for the same reason the
      fire has a burn limit: the game must not end up holding a chase that can
      never finish.
    - **No new chase starts while you are holding somebody**, which falls out
      of the custody branch sitting ahead of the pursuit branch.

    Verified end to end in the browser: PURSUIT IN PROGRESS, caught, SUSPECT
    APPREHENDED with the arrow swung round to the nearest station to the catch,
    TAKE HIM IN while driving, SUSPECT BOOKED on arrival.

**Added 2 August.**

61. **The quay you could watch other cars drive onto.** Mike: *"weren't we
    supposed to be able to drive onto the docks as well? I see the
    environment's cars being able to however I am unable to."*

    He was right, and the reason is the best example this project has produced
    of why a proxy is not a measurement.

    **`PIER_DECK_Y` was 0.3.** Zero is the world's sea-level datum:
    `groundHeight()` returns it for every point that is not on an island, and
    `coastFactor()` takes every island's terrain to exactly zero at its own
    shoreline. Every road therefore arrives at zero where it meets the water,
    and the bridge decks are built with their top face at zero for that reason.
    The quays were the one structure that disagreed, which put a 30cm vertical
    face across the full width of the pier exactly where the road ran onto it.

    **Why only the player noticed.** A traffic vehicle's collider is kinematic
    and is placed at `groundAt() + height/2` every frame, so it walks straight
    THROUGH a step of any height. The player's chassis is a dynamic cuboid, and
    a cuboid against a vertical face is stopped dead. So the town's cars drove
    out onto a quay Mike could not reach, which is exactly what he described.

    Measured by driving it in the browser rather than by reading the geometry:
    before, the nose came to rest 2.2 units short of the pier root - half a car
    length - with the throttle open and the speedometer reading 18. After, it
    reaches the head of every pier tested.

    `tests/ports.mjs` now walks the deck's whole footprint and compares the
    height of the ground with the height of the deck at the same point, and
    asserts the shorelines really are at zero - which is what makes zero the
    right answer rather than a lucky one.

62. **The airport causeway, and the platform that had no room for a road.**

    The link is the easy half: a crossing from the nearest island to a service
    road that runs right round the platform. The loop is not decoration - the
    runway lies down the middle of the deck with the terminal on the far side
    of it, so any road heading straight for the terminal from the landward side
    would cross the runway. Round the outside does not, and the seaward leg
    passes seven units off the terminal's front door, so the perimeter road is
    the forecourt too and there is no dead end anywhere on it.

    **Three things had to be fixed before a road would fit at all.**

    - **The platform was 25 units too narrow.** `airportFootprint()` summed the
      width from the pieces and then added `AIRPORT_EDGE` on top, and the sum
      double-counted: 93 units of deck against 90 units of content, so the
      runway's landward edge finished ONE unit from the edge of the deck. Every
      screenshot looked fine - a runway fills its platform in a photograph -
      and nothing measured it, because every existing check was about the
      stands and the stands are nowhere near the outside.
    - **The causeway wanted the same coast as the quay.** A port picks the
      bearing with the most open water in front of it, and so, in effect, does
      the airport. Left alone the crossing came ashore on BLOG 9.8 units from
      the pier root at 5.6 degrees to it. The lane network agreed and rather
      more loudly: the two roads' lanes shared tarmac, the de-duplication
      dropped one of each pair, a lane whose opposite has been dropped has no
      U-turn, and blog's quay became the map's only dead end. `clearOfPort()`
      samples the whole crossing against the whole pier - a bearing tells you
      nothing, because five degrees is nothing at the beach and thirty units at
      the pier head.
    - **A closed segment's seam.** `getLaneNetwork()` cuts a closed segment at
      each junction on it and runs the last piece to the end of the polyline,
      so the stretch between the polyline's start and its first junction
      belongs to no lane. On an island ring that is a few units nobody notices.
      The loop is deliberately started AT the causeway junction, so its one cut
      lands exactly on the seam - and a billionth of floating point decided
      whether it was found at nought or at 623.9, giving one piece of zero
      length and **an airport with no lanes at all, while every existing test
      went on passing.** Folded to the start now.

    The apron loop goes into the network as two open halves rather than one
    closed loop, so the airport has two junctions instead of one and the
    distance between decisions is 300 units instead of 600.

    Verified by driving it: from SKILLS, across 63 units of water, onto the
    platform at a constant 18 units a second, y never below 0.44.

63. **The short-lane rule.** The one item 32 was waiting on.

    **Do not pull into a stretch you cannot stand on if the light at the far
    end of it is against you.** Don't-block-the-box, moved one junction back.
    The box rule looks at the VEHICLES in the entrance ahead; this looks at the
    road itself, because a short lane blocks the box whether or not anyone else
    is on it - the vehicle's own tail is what does the blocking.

    `laneHolds(lane, v)` is asked of the vehicle, not of the lane. A lane that
    holds a sedan may not hold a fire engine, and a single `lane.short` flag
    would be the same mistake as one turning circle for a bus and a saloon.

    **The version that did not ship** treated a short lane as part of the
    junction and let a vehicle already on one carry through the red rather than
    stop across the box behind it. Tidy sentence; eighteen red lights in five
    minutes. A blocked box clears in one cycle; a vehicle crossing traffic that
    has the green is a crash. The whole rule is now about not going in.

    `orderedNext()` carries the matching penalty, applied AFTER the random draw
    exactly like `INCIDENT_PENALTY`, so the lane a vehicle picks and the reason
    it slowed down cannot disagree.

    **Measured with the rule off and on, same map, same fleet:**

    | | turns onto a shut short lane | frames sitting on one | relocations |
    |---|---|---|---|
    | off | 8 | 7,378 | 40 |
    | on | 1 | 4,438 | 36 |

    Not zero, and it should not be: when every onward lane is a shut short one,
    or the preferred one is blocked and the collision veto falls through, the
    shut short lane is still the only way out.

**The new traffic baseline, 2 August.** The airport is on the road network now,
so the numbers in items 30 and 31 no longer reproduce - a different lane
network is a different roll of the same dice, and there is no seed to hold.
121 lanes, 45 junctions, 94 vehicles, five minutes:

| | slowest | median | max | relocations | worst stop |
|---|---|---|---|---|---|
| 1 August (113 lanes) | 97 | 704 | 2,448 | 37 | - |
| 2 August | 24 | 736 | 3,835 | 36 | 39.0s |

`traffic.mjs` still fails the same three checks it has failed since the fleet
went to 94, and the slowest vehicle is on the hub ring, nowhere near the new
roads. `stations.mjs` went the other way and is now **1 failure instead of 3** -
the welded pair from item 30 is gone.

64. **Sound.** 2 August. Mike chose synthesised-only, and default off.

    **No files.** Six voices out of oscillators and filtered noise: engine,
    tyres, siren, wind, sea, rain. Nothing to license, nothing added to the 3.4
    MB deploy, no loader to get wrong - and it is the same principle as the
    rest of the world, which stores no positions and derives everything.

    **The split is the usual one and it matters more here than anywhere else.**
    `audioMix.js` is a pure function from the frame's state to a set of gains
    and frequencies, with no Web Audio and no THREE in it; `Audio.js` is the
    node graph and contains no decisions at all. Sound is the ONE part of this
    project a screenshot cannot check - there is no picture to look at and no
    geometry to ask - so every claim about it has to be a claim about a
    function a test can run. If you find yourself writing an `if` about the
    world in `Audio.js`, it belongs in the mix.

    **Three things worth keeping:**

    - **The gears.** A single tone rising from idle to top speed is a vacuum
      cleaner; what makes an engine an engine is the shift. Five of them, at
      boundaries that are NOT evenly spaced - first gear covers 8% of the speed
      range and top gear 30%, which is why the changes come quickly as you pull
      away and then space out. `tests/audio.mjs` walks the whole speed range in
      0.05 steps and counts the points where the note falls: four, one per
      shift. Sampling at the boundaries would have missed a shift that landed
      between two samples, which is a shift nobody hears.
    - **`sirenBeat()`.** The expression `Math.floor(elapsed * SIREN_RATE) % 2`
      existed twice - the player's roof bar and the traffic's - and was about
      to exist a third time for the siren. It is now one function in
      `vehicleLights.js`, used by all three, so the lights and the siren cannot
      drift out of step. That is the only thing anybody would ever notice about
      either of them.
    - **A siren is a callout, not a roof bar.** Emergency vehicles flash their
      beacons the whole time they are on the road; a siren doing the same would
      be unbearable within a minute of picking the ambulance. It sounds when
      `activeMission()` says there is something to sound it for. Verified in
      the browser: police car parked, `siren: false`; CHASE MODE live,
      `siren: true`.

    **The NaN sweep is the test that earns its keep.** One non-finite value in
    an AudioParam throws, the frame's update aborts part-built, and every voice
    after it in the loop is left where it was - a graph that dies silently, mid
    drive, and stays dead. Ten bad values across ten fields, every gain and
    every frequency checked finite and non-negative.

    **Off by default, and the browser agrees.** A page cannot make a sound
    before the visitor has done something, so the AudioContext is built by the
    first click on the speaker button and not before - which means the one
    control the feature needs is also the gesture it needs. Confirmed by probe:
    `ctxBuiltBeforeClick: false`. The preference is kept in localStorage; a
    remembered "on" still waits for any gesture before it makes a noise.

    Proved to make an actual sound rather than merely to build a graph: an
    AnalyserNode on the master, RMS 0.068 pulling away and 0.10 at speed, and
    **exactly 0 when muted.**

    Not done, and cheap if wanted: a horn (no key is free), a chime when a
    callout completes (risks being annoying), and doppler on the traffic (would
    need a voice per vehicle, which is a different order of cost).

**Added 3 August.**

65. **The rings pushed outward, and the towns made denser.** Both halves of
    Mike's "busier, more urbanised cities using more land", done together
    because measuring the traffic twice would have been measuring nothing.

    **The rings reach 82% of the way to the coast, up from 68%.**
    `RING_INSET_FRACTION` 0.34 -> 0.2, with a new per-bearing cap
    (`RING_SHORE_CLEAR`) because a fraction on its own is the wrong shape of
    rule on a `crescent` or a `long`: a fifth of a long bearing is plenty of
    land, a fifth of a short one is not enough to stand a road on. Sweeping the
    fraction alone took ABOUT's tightest clearance from 8.5 units to 2.6 while
    the hub still had 7. The cap is re-applied after every smoothing pass -
    smoothing averages neighbouring radii, and averaging across a bay pushes
    the loop straight back over the water.

    **Four islands have street grids instead of two.** `grid: true` on the hub
    and on CONTACT. The theme governs the planting and `grid` governs the
    streets, and tying the two together was why the island every visitor starts
    on - and which carries five of the six bridges - was a bare ring round a
    plaza. That, not the block size, was most of why the world read empty.

    **The block size is now derived, and NOT from the houses.** Two rows back
    to back come to 28.3. I set it there, and the world went from seven
    stations to four with **no hospital anywhere in it** - which quietly ends
    the ambulance run, because there is nowhere to take the patient. A 24-wide
    hospital plus its clearances plus a street is 35.5, and that is what a
    block has to be. The old flat 34 was right for a reason nothing had written
    down; it is written down now.

    **The result, measured. This is the headline:**

    | | slowest | median | max | relocations | worst stop | overlaps | lanes |
    |---|---|---|---|---|---|---|---|
    | 2 Aug | 24 | 736 | 3,835 | 36 | 39.0s | 0 | 121 |
    | 3 Aug | **131** | **975** | 3,411 | **13** | **35.1s** | 0 | 190 |

    Better on every number, and `stations.mjs` went from three failures to one
    while the world gained two stations (7 -> 9). Item 31 concluded that "94
    vehicles is more than this world holds, whatever the layout" - and that was
    true of the layout it was measured on, where the median never left 528-704
    across six configurations. A denser town is not more traffic in the same
    space, it is more places to go, and with the short-lane rule (item 63)
    keeping the short pieces from plugging, it is what the fleet needed.

    Still failing, and still the same three that have failed since the fleet
    went to 94: slowest 131 against 150, median 975 against 1,000, relocations
    13 against 6. All three are closer than they have ever been and none of
    them is a new fault.

    **A tension worth knowing about.** At a 28.3 block the traffic is better
    still - 290 lanes, slowest 621, median 1,097, 14 relocations - but no civic
    building fits between two cross streets, so the world has no fire stations,
    police stations or hospitals at all. If the stations are ever made smaller,
    or allowed to span a block, the smaller block is waiting.

    Five other things had to be fixed on the way, each of which had been true
    all along and had nothing to collide with:

    - **The port road kinked.** It joined the ring at the ring point nearest
      the pier root; on a ring at 82% that is off the pier's line, and the bend
      came out at 2.9 units on a 6.5-unit road - a ribbon folded through
      itself. It joins where the port's own bearing crosses the ring now, so
      the ring crossing, the root and the head are collinear.
    - **Building plots stood in the bridge approaches.** The "clear of every
      other road" test was run against the roads plots FRONT, and an approach
      is marked `auto` because it is drawn as part of the bridge run, so it was
      in neither list. Nobody noticed while the hub had no town on it.
    - **And in the plaza's skirt.** A district claims its ground and the claim
      runs `PAD_BLEND` past its edge; a building inside that gets a moat.
    - **A lane could be shorter than the minimum.** The length test is on the
      piece and a lane sits a quarter of the road's width off it, so on a bend
      the inside lane is shorter - an 11-unit piece gave a 10.45-unit lane.
    - **Stations were asked for island by island**, so every island's fire
      station took the best frontage and the rest got what was left: five fire
      stations, two police, one hospital. Round-robin, rotated per island, now.
    - **A street ran through the plaza**, and `getPlayerGarage()` sweeps the
      plaza for a footprint clear of every road. The first time the hub had a
      grid there was no such spot anywhere, so the game had nowhere to start.
      A square with a road through it is not a square either.

**Still open after 3 August:**

- **The last three traffic failures**, all long-standing: slowest 131 against
  150, median 975 against 1,000, relocations 13 against 6.
- **The 19 structural failures** behind the old density work, including
  `streetedit` showing street take-over is no longer invisible.
- **The helicopter model**, which reads as a blue wedge at distance.

66. **A DRIVABLE MONORAIL - Mike's, 3 August, not started.**

    *"I also want to add a new drivable vehicle - the Monorail. This however
    will require a new mechanic or thinking to selecting and driving vehicles,
    as well as changing vehicles again."*

    He is right that it is not another entry in the vehicle picker, and it is
    worth writing down why before anyone starts.

    **Everything about driving assumes a road.** The player's car is a
    kinematic bicycle model on a dynamic cuboid, steered by yaw and held down
    by gravity, and it recovers by being put back on a lane. A train has no
    steering, cannot leave its beam, and is a distance along a loop - which is
    exactly what `stepMonorailTrain()` already models and what the AI trains
    already are. So the driving is not a variant of `Vehicle`; it is the train
    simulation with the throttle taken off the timetable and given to the
    player.

    **The questions that need answering first, in the order they bite:**

    - **How do you get in?** The picker is a garage: you choose and drive out.
      A train is at a station, sixteen units up, and you reach the platform by
      the stair tower. Does driving to a station and stopping put you in the
      cab? Does the picker gain a monorail entry that teleports you? The first
      is far better and costs a new mechanic - "leave the car, become the
      train" - which is the thing Mike is pointing at.
    - **What are the controls?** Throttle and brake, no steering. The camera
      wants to be different too: a train driver looks along the beam.
    - **What happens to the AI train you displaced?** Either you take one over
      - and the timetable has to cope with a train that stops where it likes -
      or a fourth train is added for you, and the headway rule has to cope with
      one that does not keep its slot.
    - **How do you get out?** At a station, presumably, and back onto the
      platform - which means the stair tower has to be walkable, or the car has
      to be waiting where you left it.
    - **And what is it FOR?** Every other vehicle here has a job: the fire
      engine fights fires, the ambulance runs to the hospital, the police car
      chases. A train that only goes round is scenery you are sitting in. The
      obvious answer is passengers - stop at each station, dwell, move on, and
      a score for keeping to time - and it would want designing rather than
      assuming.

    **What already exists and should be reused rather than rewritten:**
    `getMonorailRoute()` (the loop, its stations and their distances),
    `stepMonorailTrain()` (speed from where the train is, not from a timer,
    with braking and headway), `monorailPointAt()`, and `World.updateMonorail()`
    which already moves meshes from those numbers. `tests/monorail.mjs` is 77
    checks that a player-driven train must not break.
- The pads could be more obvious from the ground.

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
