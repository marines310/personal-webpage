# Project handoff

Written so a fresh conversation can pick this up without re-deriving
anything. Last updated: 29 July 2026 (after the map redesign, the town generator,
and a long run of geometry fixes driven by screenshots).

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

src/world/curves.js        Splines, smoothing, resampling, ribbon meshes.
src/world/shapes.js        Island outline polygons and polygon geometry.
src/world/World.js         Builds the 3D world from the above.
src/world/ZoneManager.js   CV content and the zone markers.
src/systems/               Camera, Inputs, Physics, Assets, Environment.

map-editor.html            The whole editor: one file, Vite entry, imports
                           the real modules from src/world/.

tests/                     17 suites, ~330 checks. `npm test`.
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
npm test          # all 21 suites, ~408 checks
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

1. **Make the towns feel lived in.** Shopfronts, benches, bins, planters,
   street trees, parked cars, undergrowth. Biggest visible gain per unit
   of work, and it builds straight on the plot layout that already
   exists. `getTownPlots()` gives position, facing and footprint for
   every building; the gaps between plots and the pavement strips are
   where clutter goes.
2. **Back-lot walkways.** Pavements exist along streets. This is the
   narrow paths reaching buildings with no road frontage.
3. **Terrain height — hills, ridges, ponds.** THE BIG ONE. Everything
   built so far assumes the ground is flat at y=0: road surfaces,
   junction patches, pavements, crossings, plot placement, and the
   physics trimesh. Adding height means revisiting all of it, and things
   will look wrong for a while in the middle. Mike has been told this.
4. **Cities-Skylines-style editor UX.** Ongoing.

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
