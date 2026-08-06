# Interactive Portfolio — Improvement Roadmap

Mike Sukhyung Lee · Three.js + Rapier driving portfolio
Last updated: 27 July 2026

---

## Current state

Working and verified:

- Drivable car using the kinematic bicycle model (correct forward and reverse turning arcs)
- Rapier physics, frame-rate independent from 30–144Hz
- Chase camera behind the car
- Five content zones: About, Experience, Skills, Blog, Contact — populated with real resume content
- Minimap, speedometer, mobile touch controls
- Builds clean with `npm run build`

Known placeholders:

- `BLOG_URL` in `src/world/ZoneManager.js` still points at `https://your-blog-url.com`
- Car and world are untextured boxes, cones and cylinders
- Not yet deployed anywhere public

---

# Priority 1 — Graphics: replace box models with real 3D assets

**Goal:** the site should look intentional, not like a physics test.

**Approach chosen:** download free CC0 models rather than modelling from scratch. No 3D skills needed, and CC0 means no attribution required and commercial use is fine.

### Where to get models

| Source | Best for | Notes |
|---|---|---|
| [Poly Pizza](https://poly.pizza/) | Cars, trees, buildings, props | 10,400+ models, includes the archived Google Poly library. No login. |
| [Kenney](https://kenney.nl/assets) | Coherent themed packs | Everything CC0, consistent art style, ships GLB/GLTF directly. |
| [Quaternius](https://quaternius.com/) | Low-poly nature and vehicles | Large CC0 library, clean uniform style. |

**Download `.glb` format** — it is a single self-contained file (mesh + textures + materials), which is by far the easiest to load in Three.js.

**Pick everything from one source** if possible. Mixing a realistic car with cartoon trees looks worse than any single style used consistently.

### Shopping list

- [ ] 1 car (low-poly, ideally with separate wheel objects so they can still steer and spin)
- [ ] 2–3 tree variants
- [ ] 3–5 building or prop models to give the world landmarks
- [ ] Optional: road/kerb tiles, streetlights, fences

### Implementation steps

1. **Add a loading system.** Three.js needs `GLTFLoader`, and models must finish loading before the game starts. This means adding a proper asset-loading step to `Game.init()` and wiring it to the existing loading bar (which currently just animates without measuring anything real).
2. **Create `src/systems/Assets.js`** — a small loader that takes a manifest of model paths, loads them all, reports progress, and resolves when done.
3. **Put models in `public/models/`** so Vite copies them to the build as-is.
4. **Swap `Vehicle.createMesh()`** to use the loaded car model instead of building boxes. Keep the physics collider as a simple box — never use a detailed mesh as a collider, it is dramatically slower and less stable.
5. **Re-attach the wheels.** The steering and spin code expects four wheel objects; find them in the loaded model by name and reuse the existing pivot logic.
6. **Swap `World.createTree()` / `createRock()`** for model instances. Use `.clone()` for repeats rather than loading the file multiple times.

### Also worth doing while in here

- [ ] Better lighting — soften the directional light, raise shadow map resolution, add subtle fog for depth
- [ ] Replace the flat green ground with a texture or subtle colour variation
- [ ] Add an environment map (HDRI) so metallic surfaces have something to reflect
- [ ] Sky: gradient shader or skybox instead of the flat `0x87ceeb` clear colour

### Watch out for

- **File size.** The JS bundle is already ~960KB gzipped. Keep each model under ~1MB. Compress with [gltf-transform](https://gltf-transform.dev/) or Draco if they are large.
- **Scale.** Models arrive at wildly different scales. The car should be ~2 units long to match the current physics body and the 1.4-unit wheelbase.
- **Orientation.** The code assumes the car's front is local **+Z**. If the model faces a different way, rotate it once on load rather than changing the driving code.

---

# Priority 2 — Go live on a custom domain

**Goal:** `mikeshlee.com` (or similar) resolving to the site over HTTPS.

**Why custom domain:** on a resume or LinkedIn, a real domain reads as professional in a way `marines310.github.io/coding-sandbox-physcs-experiment` does not.

**Cost:** roughly $12–15/year for the domain. GitHub Pages hosting itself is free.

### Step 1 — Buy the domain (~10 min)

Registrars worth using: **Cloudflare Registrar** (sells at cost, no markup on renewal), **Namecheap**, or **Porkbun**. Avoid GoDaddy — cheap first year, expensive renewals.

Try for `mikeshlee.com`. Fallbacks: `.dev`, `.io`, or `mikelee.dev`.

Turn on WHOIS privacy — it is free at all three registrars above and keeps your home address out of public records.

### Step 2 — Deploy to GitHub Pages first (~5 min)

Get it working on the free URL before adding the domain — it isolates problems.

```bash
cd path/to/your/project
npm run deploy
```

This builds and pushes to a `gh-pages` branch. Then on GitHub: **repo → Settings → Pages → Source: `gh-pages` branch**.

Wait a few minutes, then check `https://marines310.github.io/coding-sandbox-physcs-experiment/`.

> If you see a blank page, it is almost certainly the `base` path in `vite.config.js` not matching the repo name.

### Step 3 — Point the domain at GitHub (~15 min + waiting)

**Order matters.** Add the domain in GitHub *before* configuring DNS — doing it the other way round briefly leaves the subdomain open for someone else to claim.

**3a. In GitHub:** repo → Settings → Pages → "Custom domain" → enter `mikeshlee.com` → Save.

**3b. At your registrar's DNS panel**, create these records:

For the apex domain (`mikeshlee.com`) — four `A` records, all with name `@`:

```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

For `www` — one `CNAME` record, name `www`, value:

```
marines310.github.io
```

Note the CNAME value excludes the repository name — just `username.github.io`.

Delete any default parking records the registrar added, or they will conflict.

**3c. Wait.** DNS changes can take up to 24 hours, though it is often minutes.

**3d. Verify** from Terminal:

```bash
dig mikeshlee.com +noall +answer -t A
```

You should see the four GitHub IPs above.

**3e. Enable HTTPS:** back in Settings → Pages, tick **Enforce HTTPS**. The option can take up to 24 hours to become available while GitHub provisions the certificate.

### Step 4 — Housekeeping

- [ ] Replace `BLOG_URL` placeholder in `ZoneManager.js` — or remove the Blog zone until you have one
- [ ] Add `<meta>` description and Open Graph tags to `index.html` so links preview nicely when shared
- [ ] Add a social preview image (`og:image`) — a screenshot of the game works well
- [ ] Add a `favicon.ico`
- [ ] Consider a static HTML fallback for visitors whose device cannot run WebGL
- [ ] Test on a phone — touch controls exist but are untested on real hardware

### Ongoing deploys

After the first setup, publishing an update is just:

```bash
npm run deploy
```

**Consider verifying your domain** in GitHub (Settings → Pages) — it prevents anyone else from attaching your domain to their repo.

---

# Priority 3 — Camera improvements

Three specific behaviours wanted. All live in `src/systems/Camera.js`.

### 3a. Pull back and rise with speed

Interpolate the camera offset based on `vehicle.getSpeed()` — at rest sit close and low, at top speed pull back and up so more of the road ahead is visible. Adds a real sense of velocity.

Additions: `offsetNear` / `offsetFar` vectors, lerped by speed ratio. Optionally widen the field of view slightly at speed too, which exaggerates the sensation further.

### 3b. Mouse orbit / look around

Drag to swing the camera around the car; release and it eases back behind after a short idle delay.

Needs: pointer event listeners, yaw/pitch offset state, pitch clamping so it cannot flip under the ground, and a timer to resume auto-follow. Use Pointer Events rather than mouse events so it works for touch too.

### 3c. Softer, less rigid follow

Current follow is a single exponential lerp toward a point rigidly locked behind the car. Improvements:

- Separate, slower smoothing for rotation than position, so the camera swings behind gradually instead of snapping
- Bias the look-at point toward the direction of travel rather than where the car is pointing — this reads better mid-drift
- Optional slight banking roll in corners

### Also worth considering

- [ ] Collision avoidance — raycast from car to camera and pull in if a building is between them
- [ ] Cinematic intro — slow orbit of the scene on first load before handing over control
- [ ] Subtle screen shake on collisions and at boost speed

---

# Infrastructure and controls — added 29 July 2026

Mike's second list. Kept here in full; `HANDOFF.md` has the ordering and
the notes on what each one can reuse.

### Docks, boats and ships — done, 29 July

- [x] **A port on every island**, sited by scoring the compass: open water in
      front, clear of the bridges, clear of the monorail
- [x] **Drivable quays** — a road spur off the ring, out along a solid pier
- [x] **Cargo terminals** on the two biggest islands: gantry cranes, shed,
      stacked containers, two berths. Fishing jetties elsewhere
- [x] **A sea route network**, derived: berths, port approaches, an open-water
      lane ring and off-world waypoints. Nothing stored
- [x] **Three cargo ships and five boats**, berthing, waiting and sailing on
- [x] **Ships come and go off-world** — out past the fog at 780 units, and the
      hull returns as an arrival from a different direction
- [x] Quays and ships shown on the minimap; quays drawn in the map editor
- [ ] Still to do: **edit** the ports in the editor (the site is derived, so
      there's nothing stored to drag yet)

### Monorail — done, 29 July

- [x] **Elevated guideway**, one closed loop 16 units up: blog → contact →
      hub → about → projects → skills → back round
- [x] **A station on each island** — two platforms, canopy, the island's
      name lit at night, stair tower down to the street
- [x] **Piers** every 27 units, sliding along the beam to miss the roads and
      dropped where there's no room. Solid: you can crash into them
- [x] **Three trains**, three cars each, easing into every platform,
      dwelling 4.5s, pulling away
- [x] Route derived from where the islands are, so moving one reroutes the
      line. `monorail: false` on an island skips it
- [x] Shown on the minimap as a dashed line with a dot per station
- [ ] Still to do: draw the line in the **map editor** too

### Editor support

- [ ] Place and edit **docks** in the map editor
- [ ] Route the **monorail** in the map editor
- [ ] Same drag-and-snap treatment roads got — and the editor must
      **import** the real geometry functions, never reimplement them

### Editing what the generator made

- [x] **Generated town streets are selectable.** Click one with Select and
      it's handed over — written into the island's `roads` with a
      `streetKey`, ready to drag.
- [x] Take-over is exact: measured at 0.003 units, which is the two decimal
      places the points are stored to
- [x] Demolish or Delete records the key in `island.noStreets`, so a removed
      street stays removed; the island panel brings them back
- [x] Handles are draggable with Select, not only with the Road tool
- [x] Alt-click a road to add a handle — a street arrives with two ends and
      nothing in between, so without this you could move one but not bend one
- [x] Generated streets joined the editor's segment list, so roads snap to
      them and the connection overlay includes them

### Manual time and weather — done, 29 July

- [x] Clicking the **time/weather box** (top left) opens controls
- [x] **Time slider** at minute resolution, plus Dawn / Noon / Dusk / Night
- [x] **All five weathers** as buttons, the current one lit
- [x] **Back to the automatic cycle** in one click, and a "HELD" marker on the
      readout while anything is set by hand
- [x] Changes ease in over the same eight seconds the automatic cycle uses —
      no snapping, and no second code path to keep in step

---

# Traffic and city polish — done, 29 July 2026

- [x] **AI traffic**: sedans, convertibles, police cars, ambulances, fire
      engines and city buses, 31 vehicles in all
- [x] A **directed lane network** derived from the road graph, cut at every
      junction, right-hand traffic
- [x] **They obey the lights** — one shared cycle function, so the lamps and
      the drivers can't disagree
- [x] **They don't crash** — car-following, give-way at junctions, and a
      two-dimensional veto on any move that would overlap
- [x] **Bus stops** with shelters, and buses that call at them
- [x] **Flashing beacons** on the emergency vehicles, brake lights on all
- [x] **Kinematic colliders**, so your car bumps them instead of passing
      through — and parked cars are solid now too
- [x] Fixed: **two suns** (the sky shader and a mesh both drew a disc)
- [x] Fixed: **monorail piers on roads and bridges** — decks are now tested,
      and a column steps onto a cross-arm where the beam crosses a bridge
- [x] Fixed: **buildings at random angles** — every building on every island
      now fronts a street at a constant setback

---

# Emergency services and night lighting — done, 30 July 2026

- [x] **Fire stations, police stations and hospitals** — seven of them, each
      facing a street with a marked apron and a bay per vehicle
- [x] **Working garages** — a fire station's front wall has an opening per
      bay, and each door lifts for its own engine. The opening is the bay
      spacing, so an engine goes through with two units of air each side
- [x] **Four times the service fleet** — 12 police cars, 8 ambulances, 8 fire
      engines, 52 vehicles in all
- [x] **They come and go from their own car parks** — each vehicle works the
      streets for a shift, navigates back to its own station and parks
- [x] **Police cars in the proper livery** — black body, white doors, built as
      their own vehicle rather than a recoloured sedan
- [x] **Window lights at night** — glass laid over the models' own window
      faces, found by sampling their texture. Had never once worked before:
      the code lived in a branch no building reaches
- [x] Fixed: **the patience valve was teleporting cars queueing at a red**,
      including service vehicles seconds from their own door
- [x] Fixed: **window glass floating above the rooftops** — it is now cut from
      the models' own window faces, found by sampling their texture, so it sits
      on the glass whatever the model is scaled to
- [x] Fixed: **shipping containers hanging in mid-air** beside the coast road —
      stacks are stacks, and every one is tested by its own four corners

---

# Terrain — the height field is in, 30 July

The ground can have hills, and one function answers how high it is anywhere.
Islands declare them (`hills` in `mapData.js`); the current map is deliberately
mild, topping out at six units.

Three rules are built into the field rather than left to whoever draws things:
roads are level across their width and no steeper than 8% along their length,
buildings get a flat terrace under their whole footprint, and the land still
meets the sea at the waterline. `tests/terrain.mjs` measures all three on the
real map.

The world now stands on it:

- [x] the ground mesh and the physics collider follow the height field
- [x] roads, pavements and crossings get a height per vertex
- [x] props, buildings, signs and station bays sit on the ground
- [x] the AI traffic sits on the road and pitches to the slope
- [x] the monorail beam stays level and its pillars vary in length
- [x] the car follows the ground down instead of flying off crests
- [ ] the player's car checked on the steepest slopes, by hand
- [ ] load time: the sand, grass and collider each subdivide separately (3.2s)
- [ ] bridges rise clear of the water, with ramps every vehicle can drive

# The road network — junctions that agree, 4 August 2026

The lights and the road network had two different opinions about what
counted as one junction, and the gap between them was where the traffic
jammed. The lights merged anything within 22 units into one intersection;
the network kept them as two, cut the road at both, and left a 12-unit lane
in between. A 12-unit lane holds one vehicle, so stopping on it blocked
everything behind. Shorter than 11 units and no lane was built at all — a
hole in the road.

Fixed where the streets are generated rather than patched afterwards,
because the only honest way to remove a junction is to stop the two roads
crossing there. A street whose end lands near an existing junction is now
**moved onto it** — one four-armed crossroads instead of two three-armed
ones fifteen units apart. Failing that it is trimmed back to its last real
crossing, and failing that it is dropped.

- [x] no road has two junctions between 5.25 and 22 units apart — was 13 pairs
- [x] shortest lane on the map is 19.7 units — 12 were under 16
- [x] 163 lanes and 54 junctions, from 190 and 65: fewer lanes, better flow
- [x] 16 of the 17 streets kept — the rule moves streets, it does not delete
      towns
- [x] at the same fleet of 68, the slowest vehicle covers 731 units in five
      minutes against 591 before, and the median 1403 against 1194
- [x] `tests/network.mjs` measures both halves of the rule

**The fleet did not go up, and that was the point of the exercise.** Every
attempt past 68 fails something: 72 and 75 leave cars piled against the
staged crash in `tests/incident.mjs`, 81 leaves one stuck for 52 seconds. The
binding constraint is no longer stub lanes — it is that the map has few
alternative routes, so shutting one lane backs up everything behind it. More
lanes will not fix that. More ways round will: a second road across an
island, or a bridge that does not funnel through the hub.

Still open:

- [ ] one pair of junctions 13 units apart on PROJECTS, on two *different*
      roads — no short lane, but one set of lights covers both
- [ ] over fifteen simulated minutes the frames in which two vehicles are
      interpenetrated are 926, against 528 before. Both are far outside the
      five-minute window the suite actually runs, and both fail there; worth
      a look when the routing gets attention

Two things came out of it that were not the point but are worth having.
Taking a street over in the editor now puts it back in its own place in the
row rather than at the end, so the island no longer gains or loses a
building when you click one. And `tests/stations.mjs` now asks the
allocation whether every station is somebody's home, instead of watching ten
minutes of simulation and hoping.

**And one that nearly shipped.** The first version of the rule dropped a
street rather than moving it when the move would have left it grazing the
ring. The hub lost two of its three streets, which left the player's garage
sited 26 units from the nearest road with a 52% grass bank between — the car
spawns and cannot move. Mike hit it within seconds of opening the page. A
street that cannot join the junction it is crowding now slides clear of it
instead, and only gives up if neither will do.

# Ground you cannot get stuck on, and a drive to the street — 5 August 2026

Mike opened the page and could not move. Two separate faults, both real.

**The ground was a wall in places.** Roads are gradient-limited and pinned at
sea level where the bridges land, so a road crossing a hill stays low while
the hill does not, and the blend between them made up the difference across
nine units. Measured over the whole map: 486 places steeper than 30%, worst
114%.

- [x] the ground has a gradient limit of its own — 25%, against the roads' 8%
- [x] enforced by relaxing a coarse grid until no two neighbouring cells
      differ by more than the limit allows, which costs milliseconds
- [x] where a car can actually stand, spots over 30% are down from 187 to 63
      and over 50% from 40 to 2
- [x] `tests/terrain.mjs` measures it, sampling only ground a car could
      reach — the bank between two building terraces is deliberately steep
      and has a building on each side

**And the garage opened onto grass.** It is sited on a spot whose footprint is
clear of the roads, which is exactly the ground the town generator is free to
build on. The apron was checked; the thirty units after it were nobody's job.

- [x] a drive from the doors to the nearest street, derived from where the
      garage ended up
- [x] it is a ROAD, so everything that already avoids roads avoids it: the
      terrain gives it a road profile, plots keep their setback, and trees,
      lamps, brush and the holiday props all site themselves clear of it
- [x] the AI traffic cannot use it — `getRoadNetwork` skips it, so no lane is
      ever built on it and no vehicle can be assigned to one
- [x] no pavements, no crossings, no signals: a private drive has none, and
      they are all gated on `street || ring || auto || spur`
- [x] it meets the street square, so the player gives way — which falls out of
      the geometry rather than needing a rule
- [x] `tests/garage.mjs` measures all of it: 13.4 units long, nearest building
      4.4 clear, steepest ground on the way out 4.8%, zero AI lanes on it

Still open: two spots on CONTACT where a building terrace abuts a road 1.2
units below it, leaving a step. Both are beside a building rather than on any
route, and neither is on the way out of anywhere.

# Next up — ships, bridges and terrain

### Ships sail through the bridges

They clip straight through the decks today. Two ways out, and the second is
the one worth having:

- **Route around.** Treat each bridge as an obstacle in the sea graph, so no
  leg crosses a deck. Cheap and quick. Worth checking it doesn't strand a port:
  the bridges radiate from the hub, and the ring waypoints out at the map edge
  are what would keep everything connected.
- **Sail underneath.** Which needs the bridges raised, which needs terrain
  height — below.

### Elevated bridges, on real terrain height

The reason to finally do the terrain work: bridges standing clear of the water
with ships passing beneath them.

- A height field for the world. Everything so far assumes flat ground at y=0 —
  road surfaces, junction patches, pavements, crossings, plot and prop
  placement, and the physics mesh.
- Decks lifted to a stated air draught, measured against the tallest mast in
  the fleet rather than picked by eye. Same rule as the monorail beam and the
  chase camera: when two numbers have to clear each other, derive one from the
  other and assert it.
- **Ramps up to and down from every deck**, at a gradient the car can climb —
  and that every AI vehicle can climb too, buses included. The lane network
  carries height as well, and the following distances and speeds have to hold
  up on a slope.
- Ships then route *under* the deck rather than around it, which replaces the
  first option above rather than adding to it.

Order: terrain, then deck height, then ramps, then lanes. The world will look
wrong in the middle of this one.

---

# Backlog — not prioritised

### Feel and polish
- [ ] Sound: engine note tied to speed, ambient background, zone-entry chime (Howler.js or the Web Audio API)
- [ ] Particles: dust from tyres, exhaust, skid marks on hard braking
- [ ] Better zone markers — animated, floating, more visually distinct than the current cylinders
- [ ] Smooth panel transitions when entering/leaving a zone (GSAP)

### Content and UX
- [ ] Onboarding hint for first-time visitors — many will not realise they can drive
- [ ] "Jump to section" menu for people who do not want to drive at all — an accessibility and patience issue worth taking seriously
- [ ] Downloadable resume PDF linked from the About zone
- [ ] Simple analytics (Plausible or GoatCounter — privacy-friendly, no cookie banner needed)

### Technical
- [ ] Code-split the bundle (currently one ~960KB gzipped chunk)
- [ ] Real loading progress instead of the fake animated bar
- [ ] Handle WebGL context loss gracefully
- [ ] Performance: instanced meshes for repeated trees/props, LODs for distant objects
- [ ] Reduce quality automatically on low-end devices

### Gameplay
- [ ] Collectibles scattered around the map
- [ ] Lap timer or small challenge course
- [x] Working headlights plus a day/night toggle
- [ ] Horn

---

## Station signage, and fire out of the windows — done, 6 August 2026

Two things the last session named and did not have room to do properly.

- [x] **Signage and badges on the emergency stations.** FIRE STATION,
      POLICE and HOSPITAL lettered over the doors, each with a badge — a
      Maltese cross, a shield with a star, a cross. Badge and lettering are
      one canvas per kind, emissive from its own map so the words light at
      night and the plate behind them does not, which is the same trick the
      monorail station names use. The hospital keeps its separate 3D cross:
      it is the badge you need from an angle the sign cannot be read from.
- [x] **Where the board hangs is the layout's decision**, not the
      renderer's — `stationSignBoard()` in `islandLayout.js`, tested in
      `stations.mjs`. A fire station is 8.5 up with a 5.2 door head and a
      roof band taking the top 1.65, which leaves a strip 1.3 units tall;
      the hospital has nine. A board sized to look right on the hospital
      hangs across the opening the engine drives out of.
- [x] **Fire comes out of the windows.** `windowVents()` in `windows.js`
      turns the window quads that already get glass at night into one
      emitter each — centre, facing, size, in model units — and World.js
      pushes them through the mesh's own world matrix. No guessed grid:
      that mistake is already written up at the top of `windows.js`, and it
      would have put flames in the sky beside the buildings the same way it
      once put glass there.
- [x] **The ground floor does not burn**, because that is the height a fire
      engine parks at. The roof plume stays — it is what you navigate by
      from the next island.

Verified by driving the built site in a headless browser and looking at it,
not only by the suites: three stations photographed from the road by day and
the fire photographed by day and night.

---

## The three callouts — done, 1 August 2026

One mini-game per emergency vehicle, asked for 31 July. All three built, and
all three arrived at the same rule: **the pressure mechanic belongs to the
player.**

- [x] **The fire** — a building catches light every two minutes; hold station
      outside in a fire engine and a containment bar fills. The AI engines
      cannot finish it while you are the one in an engine
- [x] **The pursuit** — a car runs and ignores red lights; drive the police
      car into it. One to three background chases run as scenery when you are
      in anything else, with nothing on screen for them
- [x] **The ambulance run** — a crash every one to three minutes; get there,
      ten seconds to load, two minutes to a hospital. The AI crews do it
      without the load or the clock, because measured against the player's
      standard every background crash ended in PATIENT LOST
- [x] **One generic HUD** — `missions.js` holds the arrow and the arbitration:
      a callout you can act on beats one you can only watch

---

## Holiday moments — done, 1 August 2026

Asked for 31 July, built 1 August. Pick a holiday and the world dresses itself
for it, the way picking a season already changes the ground and the trees —
or leave it alone and they arrive on the calendar.

- [x] **New Year and the Fourth of July** — fireworks over the water, after
      dark only
- [x] **Easter** — eggs on the verges, and bunnies
- [x] **Halloween** — pumpkins, and lights on the buildings
- [x] **Thanksgiving** — turkeys, with the pumpkins carrying over at about half
- [x] **Christmas** — gifts, and a strand of red, green and gold bulbs round
      every roofline
- [x] **A holiday is a LAYER over the season**, so Christmas keeps winter's
      snow. There is a test that drives the real seasons code to prove it

The notes below were written before it was built. They turned out to be right
on every count, which is why they are kept rather than deleted.

| Holiday | What appears |
|---|---|
| New Year | fireworks |
| Fourth of July | fireworks |
| Easter | Easter eggs scattered about, and Easter bunnies |
| Halloween | Halloween decorations |
| Thanksgiving | turkeys, and Thanksgiving decorations |
| Christmas | Christmas decorations and lights |

Most of the machinery already exists. `seasons.js` tints registered materials
by role and grows an instanced field of props up out of the ground; between
them those two cover nearly everything in the table. Notes for whoever builds
it:

- **Fireworks are the only genuinely new thing.** The rest is props on the
  ground or on buildings, which the spring flower field already shows how to
  do cheaply. Fireworks want a particle burst high over the water, and the
  drift field in `Environment.js` is the nearest existing machinery.
- **Christmas lights belong on `registerNightLight`**, not in a new emissive
  system - that list is exactly for things that glow after dark, and it
  already fades them up at dusk.
- **A holiday is not a season, and must not be one.** They have to compose:
  Christmas happens in winter and wants both. So a holiday is its own layer
  over the seasonal tint rather than another row in the seasons table -
  otherwise picking one silently undoes the other, and the bug looks like the
  snow disappearing when you put the decorations up.
- Whether a holiday follows the real calendar or is picked by hand is a
  decision nobody has made yet. The conditions panel is the pattern for
  "pick it and it eases in".

---

## Suggested order of attack

1. **Deploy on the free GitHub URL first.** Fastest confidence boost, and shakes out build problems while the stakes are low.
2. **Buy the domain and point it.** DNS takes time to propagate, so start it early and let it settle while you work on other things.
3. **Swap in real 3D models.** Biggest visible improvement per hour spent.
4. **Camera work.** Lands better once there is an actual scene worth looking at.
5. **Sound and particles.** The polish that makes it feel finished.

---

## Quick reference

```bash
npm run dev      # local dev server at localhost:3000
npm run build    # production build into dist/
npm run deploy   # build + publish to gh-pages branch
```

| What | Where |
|---|---|
| Handling / driving feel | `src/world/Vehicle.js` → `this.params` |
| Zone content and links | `src/world/ZoneManager.js` → `createZones()` |
| Camera behaviour | `src/systems/Camera.js` |
| World, lighting, props | `src/world/World.js` |
| Keyboard and touch input | `src/systems/Inputs.js` |
| Physics setup | `src/systems/Physics.js` |
| Deploy base path | `vite.config.js` → `base` |

---

## Sources

- [Managing a custom domain for your GitHub Pages site — GitHub Docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Securing your GitHub Pages site with HTTPS — GitHub Docs](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- [Poly Pizza — free low-poly models](https://poly.pizza/)
- [Kenney — CC0 game assets](https://kenney.nl/assets)
- [Quaternius — CC0 low-poly models](https://quaternius.com/)
