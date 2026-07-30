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
- [x] **Window lights at night** — two buildings in three, which had never
      once worked before: the code lived in a branch no building reaches
- [x] Fixed: **the patience valve was teleporting cars queueing at a red**,
      including service vehicles seconds from their own door
- [x] Fixed: **window glass floating above the rooftops** — it is now cut from
      the models' own window faces, found by sampling their texture, so it sits
      on the glass whatever the model is scaled to
- [x] Fixed: **shipping containers hanging in mid-air** beside the coast road —
      stacks are stacks, and every one is tested by its own four corners

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
- [ ] Working headlights plus a day/night toggle
- [ ] Horn

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
