# Project handoff

Written so a fresh conversation can pick this up without re-deriving
anything. Last updated: 29 July 2026.

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

---

## Testing

```bash
npm test          # all 17 suites, ~330 checks
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
- Deployed, auto-publishing on push

**Open:**

1. **Street grids on town islands** — a block grid inside the ring on
   `theme: 'town'` islands, buildings placed in blocks. Mike asked for
   this; not started.
2. **Map redesign** — Mike wants to rethink island placement and sizes
   *with* me, designed around driving rather than a symmetric hub-and-spoke.
   Worth doing **before** the grid, or the grid work gets redone.
3. **Better/more 3D models** — his standing top priority. Only
   `car`, `building_a/b/c`, `tree_a/b` exist. `rock` and `streetlight` are
   commented out of `modelManifest.js` until the files exist.
4. **`BLOG_URL` placeholder** in `ZoneManager.js` still points at
   `https://your-blog-url.com`. Live and reachable by visitors.
5. **Custom domain** — Mike wants help buying one. `DEPLOY.md` Part 3 has
   registrar comparison and DNS records. Remember rule 8.
6. **AI traffic** — cars and pedestrians using the road graph. His stated
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
