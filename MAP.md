# Editing the Map

The shape of the world — where islands sit, what connects to what, where
roads and towns go — lives in **one file**:

```
src/world/mapData.js
```

That's the file you edit, and the file the map editor produces. Its
companion `islandLayout.js` holds the machinery (bridge maths, road
generation, validation) and **should be left alone**.

---

## The visual editor (easiest way)

```bash
npm run dev
```

then open **<http://localhost:3000/map-editor.html>**

> The editor now loads your actual `.glb` models so it can show real
> thumbnails and draw each building at its true size on the ground.

### Applying your map

1. Design it in the editor
2. Hit **Download mapData.js**
3. Move that file into `src/world/`, replacing the one already there
4. The dev server reloads on its own

That's the whole workflow. You're replacing a file, not pasting
fragments. If you'd rather paste, the **Copy** button gives you the same
content to paste over the whole of `mapData.js`.

> **Don't delete `islandLayout.js`.** It's the machinery. Only
> `mapData.js` gets replaced.

To pick up where you left off later, paste the contents of your current
`mapData.js` into the editor's **Import** box.

### The tools

- **Select** — drag islands to move; drag the dot on the rim to resize
- **Bridge** — click two islands to connect; click the pair again to disconnect
- **District** — click inside an island to place a town, jungle or plaza
- **Road** — click two points inside an island to draw a road
- **Shape** — click an island, then drag the white dots to reshape its coast
- **Building** — click to place a building; drag the orange dot to rotate

Shift-drag (or right-drag) to pan, scroll to zoom, keys **1–6** switch
tools, **Delete** removes what's selected.

The right-hand panel validates continuously — overlapping islands,
bridges to nowhere, islands you can't drive to.

---

## Island shapes

Islands don't have to be circles. There are three ways to shape one.

### 1. A preset

```js
{
  id: 'skills',
  x: 36.4, z: -50.2, radius: 20,
  shape: 'crescent',   // <-- pick a shape
  shapeSeed: 3,        // <-- change for a different crescent
  theme: 'jungle'
}
```

| Preset | Looks like |
|---|---|
| `circle` | a plain disc (the default) |
| `blob` | wobbly organic island — the most natural-looking |
| `long` | stretched along Z, the "forward" axis |
| `wide` | stretched along X |
| `crescent` | a bay bitten out of one side — makes a natural harbour |
| `lshape` | right-angled, good for a town with a corner |
| `triangle` | three rounded corners |
| `star` | spiky, reads as rocky rather than sandy |
| `atoll` | horseshoe ring around a lagoon |

`shapeSeed` re-rolls the randomness. Same seed always gives the same
island, so your world looks identical on every visit.

### 2. Draw it by hand

In the map editor, hit the **Shape** tool (key `5`), click an island, and
drag the white dots to reshape its coastline.

- **Drag** a dot to move that point
- **Alt-click** an edge to add a point there
- **Delete** removes the selected point (minimum three)
- **Revert to preset** in the side panel throws your edits away

### 3. Explicit points in the file

What the editor writes out. Points are island-local, centre at `(0, 0)`:

```js
{
  id: 'custom',
  x: 70, z: -40, radius: 18,
  outline: [
    { x: -18, z: -10 }, { x: 2, z: -20 }, { x: 18, z: -4 },
    { x: 12, z: 14 }, { x: -6, z: 18 }, { x: -16, z: 6 }
  ]
}
```

`outline` beats `shape` when both are present. `radius` is still used as
a size hint, so keep it roughly matching.

### What follows the shape automatically

Everything. Bridges find the real coastline instead of assuming a
radius, so they always meet land. Roads run from wherever a bridge
actually lands. The beach ring and grass cap follow the outline. Palms
hug the true shore. Buildings and trees only spawn on grass. Collision
matches the visible shape — including concave bays and atoll lagoons, so
you can drive into a harbour and fall in the water where the water is.

### Things to watch

Concave shapes like `atoll` and `lshape` have interior water you can
drive off into — that's the point, but the respawn will pick you up.

Very spiky shapes (a high-point `star`, or hand-drawn needles) can pinch
the grass cap at sharp corners. If an island looks odd, round the
corners off or lower the vertex count.

The validator measures overlap along the line between two island
centres, using each island's real coastline. So a `long` island won't
false-alarm just because its narrow axis is small.

---

## Islands in detail

```js
{
  id: 'about',        // must be unique. Matches a zone in ZoneManager.js
  x: 0, z: 62,        // position
  radius: 20,         // size
  theme: 'town',      // 'town' | 'jungle' | 'mixed' | 'plain'
  accent: 0x4facfe,   // marker colour
  name: 'ABOUT',      // marker label
  palms: 8            // beach palms. 0 for none
}
```

### `theme`

Controls what gets scattered across any part of the island not covered
by a district:

| Theme | What appears |
|---|---|
| `town` | buildings, streetlights, some palms |
| `jungle` | palms, bushes, rocks, occasional huts |
| `mixed` | a bit of everything |
| `plain` | nothing — you're placing things yourself with districts |

### `buildings` — placing individual buildings

For real control over a town, place buildings one at a time instead of
scattering them:

```js
{
  id: 'projects',
  x: 174, z: 49, radius: 80,
  buildings: [
    { x: -12, z: 10, width: 8, depth: 6, floors: 5 },
    { x:  -2, z: 10, width: 8, depth: 6, floors: 4 },
    { x:   8, z: 10, width: 8, depth: 6, floors: 6 },
    { x: -12, z: -8, width: 8, depth: 6, floors: 3, rotation: 180 }
  ]
}
```

| Field | Meaning | Default |
|---|---|---|
| `x`, `z` | position, relative to the island centre | required |
| `width`, `depth` | footprint in world units | `6` |
| `floors` | storeys — each is 2.5 units tall | `3` |
| `rotation` | degrees, 0 faces +Z | `0` |
| `model` | which `.glb` to use, e.g. `'building_a'` | random each load |

**Pick a model.** With no `model` set the game chooses one at random every
time the page loads, so the footprint can't be shown accurately. Choosing
one in the editor pins it, and the editor then draws the building at the
model's real measured size with a thumbnail in the panel. New buildings
placed with the Building tool pin a model automatically.

Placed buildings claim their footprint, so scattered props and trees keep
clear of them automatically.

**Use the Building tool** (key `6`) rather than typing these by hand —
click to place, drag to move, drag the orange dot to rotate. Turn on
**Snap** for tidy rows and right angles. The panel has **Duplicate** and
**Duplicate as a row of 4** for laying out streets quickly.

> The size defaults are shared between the editor and the game. If you
> ever change them, change both — `DEFAULT_BUILDING` in
> `map-editor.html` and `buildPlacedBuilding` in `World.js` — or
> buildings will come out a different size than they looked.

### `districts` — placing areas deliberately

Instead of relying on random scatter, you can say exactly where things
go. Coordinates are **relative to the island's centre**:

```js
{
  id: 'projects',
  x: 59, z: 19.2, radius: 22,
  theme: 'plain',              // turn off random scatter
  districts: [
    { type: 'town',   x: -8, z:  6, size: 10, density: 1.4 },
    { type: 'town',   x:  9, z: -4, size:  8 },
    { type: 'jungle', x:  0, z: 14, size:  7 },
    { type: 'plaza',  x:  0, z:  0, size: 10 }
  ]
}
```

- `type` — `'town'`, `'jungle'` or `'plaza'`
- `size` — radius of the district
- `density` — optional multiplier, default `1`

A `plaza` lays down paving, a fountain and a ring of streetlights. It's
what the hub uses.

### `roads` — laying out streets by hand

Roads follow smooth curves. List a few points and the road bends through
all of them:

```js
{
  id: 'projects',
  x: 59, z: 19.2, radius: 22,
  roads: [
    { points: [
        { x: 0, z: 0 }, { x: 9, z: 6 }, { x: 12, z: -4 }, { x: 4, z: -12 }
      ] },
    { points: [{ x: -13, z: 2 }, { x: -4, z: 8 }], width: 5 }
  ]
}
```

Points are `{ x, z }` relative to the island centre. Two points give a
straight run; three or more bend through every one of them.

Add `closed: true` to make a road loop back on itself — handy for a ring
road around a town.

The old two-point form still works:

```js
{ from: 'centre', to: { x: 12, z: 8 } }
```

Props never spawn in a road, whichever way it curves.

**Automatic roads.** Every bridge landing gets a road in to the island
centre. These bow gently rather than running dead straight, so islands
don't look like wheel hubs. Control it per island:

```js
roadCurve: 0        // dead straight
roadCurve: 0.16     // the default, a gentle lean
roadCurve: 0.35     // properly winding
```

Set `noAutoRoad: true` to suppress them entirely if you're laying out
every street yourself.

**A note on very tight bends.** A road of width W can only follow a curve
of radius greater than W/2 — any tighter and the inner edge would fold
through itself. The road narrows automatically through hairpins rather
than turning inside out. If a road looks pinched, spread its points out
or reduce its `width`.

---

## Three layouts to try

All three are verified to work. Replace the `ISLANDS` and `BRIDGES`
arrays in `mapData.js` wholesale.

### Ring road

Keep the current islands, and use these bridges:

```js
export const BRIDGES = [
  { from: 'hub', to: 'about' },
  { from: 'about',    to: 'projects' },
  { from: 'projects', to: 'skills'   },
  { from: 'skills',   to: 'blog'     },
  { from: 'blog',     to: 'contact'  },
  { from: 'contact',  to: 'about'    }
]
```

One spoke in, then a full circuit. Rewards exploring.

### Winding chain

Visitors travel a route instead of returning to a hub:

```js
export const ISLANDS = [
  { id: 'hub',      x:   0, z:   0, radius: 20, theme: 'plain',
    districts: [{ type: 'plaza', x: 0, z: 0, size: 15 }], palms: 10 },
  { id: 'about',    x:   5, z:  55, radius: 18, theme: 'town',   accent: 0x4facfe, name: 'ABOUT' },
  { id: 'projects', x:  48, z:  88, radius: 20, theme: 'town',   accent: 0x00f2fe, name: 'EXPERIENCE' },
  { id: 'skills',   x: 100, z:  78, radius: 18, theme: 'jungle', accent: 0xa855f7, name: 'SKILLS' },
  { id: 'blog',     x: 132, z:  36, radius: 17, theme: 'jungle', accent: 0xfbbf24, name: 'BLOG' },
  { id: 'contact',  x: 126, z: -18, radius: 18, theme: 'mixed',  accent: 0xf472b6, name: 'CONTACT' }
]

export const BRIDGES = [
  { from: 'hub',      to: 'about'    },
  { from: 'about',    to: 'projects' },
  { from: 'projects', to: 'skills'   },
  { from: 'skills',   to: 'blog'     },
  { from: 'blog',     to: 'contact'  }
]
```

### One big city

A dense main island with hand-laid streets, smaller islands around it:

```js
{
  id: 'projects',
  x: 70, z: 0, radius: 34,
  theme: 'plain',
  palms: 6,
  districts: [
    { type: 'plaza', x:   0, z:   0, size:  9 },
    { type: 'town',  x: -14, z:  10, size: 11, density: 1.6 },
    { type: 'town',  x:  13, z:  11, size: 11, density: 1.6 },
    { type: 'town',  x: -13, z: -12, size: 11, density: 1.6 },
    { type: 'town',  x:  14, z: -11, size: 11, density: 1.6 }
  ],
  roads: [
    { from: { x: -26, z:   0 }, to: { x: 26, z:  0 } },
    { from: { x:   0, z: -26 }, to: { x:  0, z: 26 } }
  ]
}
```

A crossroads with four blocks in the quadrants.

---

## The validator

Every reload, `mapData.js` is checked and the result logged to the
browser console:

```
[Map] Layout OK - 6 islands, 5 bridges.
```

If something's wrong you get told exactly what:

```
[Map] Problems found in the map:
  - Islands "hub" and "about" overlap by 38.0 units
  - Bridge references unknown island "ghost"
  - Bridge "hub" - "about" has no length; the islands are touching

[Map] Warnings for the map:
  - Island "blog" can't be driven to - it has no bridge path from "hub"
  - Islands "skills" and "blog" are only 2.1 units apart
```

It catches overlapping islands, bridges pointing at ids that don't
exist, zero-length bridges, and islands you've orphaned by forgetting a
bridge. **Open the console after editing** — it's much faster than
hunting for the problem in 3D.

---

## Adding a whole new island

Three steps:

1. Add it to `ISLANDS` in `mapData.js` with a unique `id`
2. Add at least one bridge to it in `BRIDGES`
3. If it should show content, add a matching zone in
   `src/world/ZoneManager.js` using the same `id`

The zone picks up its position, colour and label from the island
automatically — you only write the content.

To make an island **decorative** (no content marker), just skip step 3.

---

## Global settings

These live in `islandLayout.js`, near the top:

```js
SPAWN_POINT     // where the car starts and respawns
ISLAND_DEPTH    // how thick the landmasses are
SEA_LEVEL       // height of the water
FALL_LIMIT      // drive below this and you respawn
```

---

## Moving the bridge roads

Every bridge gets a road running from where it lands in to the island
centre. By default these are *generated* — a gentle bow, seeded off the
island's name so it looks the same on every page load. That's why there's
nothing to grab in the editor: there are no stored points, just a formula.

To take one over:

1. Click the island (Select tool)
2. In the panel, under **Bridge roads**, click **Edit the road to …**
3. Handles appear. Drag the white ones.

Taking a road over bakes its *current* shape into points, so nothing moves
at the moment you click — it simply stops being generated and becomes
yours. **Back to automatic** hands it to the generator again.

**The grey handle at the shore can't be moved.** It's welded to where the
bridge deck lands. If it could drift, the road would tear away from the
bridge and leave a hole you could see the sea through — so it's pinned,
and pinned again when the file loads, in case an island got moved after
the road was saved.

In the data file an edited approach is an ordinary road carrying an
`approachTo`:

```js
{
  id: 'blog',
  roads: [
    { approachTo: 'hub', points: [ { x: 10.1, z: 13.9 }, … ] }
  ]
}
```

Points are island-local and run **shore first, centre last**. Delete the
entry and the road goes back to being generated.

---

## What is *not* in this file

| What | Where |
|---|---|
| Island positions, shapes, bridges | `src/world/mapData.js` |
| Colours and materials | `src/world/World.js` → `PALETTE` |
| What props look like | `src/world/World.js` → `addBuilding`, `addPalm`, … |
| Content text and links | `src/world/ZoneManager.js` |
| Driving feel | `src/world/Vehicle.js` → `this.params` |
| Day length, weather | `src/systems/Environment.js` |
| 3D model files | `public/models/` — see `MODELS.md` |
