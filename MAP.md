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

- **Select** — drag islands to move; drag the dot on the rim to resize.
  Click a road or a bridge to change it
- **District** — click inside an island to place a town, jungle or plaza
- **Road** — click point by point for a winding road, or press and drag
  for a straight one. Ends snap onto nearby roads. **Click a second
  island and the bridge across to it is built for you**
- **Shape** — click an island, then drag the white dots to reshape its coast
- **Building** — click to place a building; drag the orange dot to rotate
- **Demolish** — click anything to remove it

Two toggles sit alongside: **Props** shows scattered trees and buildings,
**Links** shows where roads connect.

Shift-drag (or right-drag) to pan, scroll to zoom, **Delete** removes
what's selected.

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

## Drawing roads

Two ways, both with the **Road** tool:

- **Click point by point** for a winding road. `Enter` finishes, `Esc`
  cancels, `Alt-click` a point removes it.
- **Press and drag** for a straight run. It's finished the moment you let
  go.

**Ends snap to other roads.** Come within about 5 units of another road
and the point is pulled onto it. That snap distance is deliberately the
same distance the network uses to decide two roads are joined — so
anything that snaps really is connected, rather than just looking it.

### Seeing what's connected

The **Links** toggle draws a dot at every junction:

- **green** — roads meeting here, you can drive from one to another
- **amber, with a dashed ring** — a dead end, joined to nothing

Amber is the one to look for. A loop that looks closed but has an amber
dot on it isn't closed, and a road that stops one unit short of another
looks fine and isn't a junction.

This is worked out from where the roads actually are, not from anything
saved in the file, so it can't go stale when you move an island. It's also
what traffic would follow if cars are added later: dots are where you can
choose a direction, roads are what you follow between them.

---

## Removing things

The **Demolish** tool removes whatever you click — road, town street,
bridge, building, district or island. Things sitting *on* an island are
checked before the island itself, so you can't wipe out an island while
aiming at a building on it. Islands ask for confirmation.

Demolishing a ring road you'd taken over switches the ring off, rather
than handing it back to the generator — otherwise it would look like
nothing happened. Town streets work the same way: the street is recorded as
removed, so it stays removed.

---

## Bridges

There is no Bridge tool any more. A bridge is what a road does when it
runs out of land.

**To add one:** the **Road** tool. Start a road on one island, then click
on another island. The bridge is built and you carry on drawing on the far
side. Crossing again between the same pair doesn't make a second one.

**To change one:** the **Select** tool, then click the bridge itself, out
over the water. You get:

- **deck width** — clamped to a minimum of 7.5, because the deck has to
  stay wider than the 7-unit road running over it or the road hangs off
  the sides with nothing underneath
- **railings** — on or off
- **Reverse direction** — swaps `from` and `to`. Only affects which end
  the road is measured from, so it's cosmetic
- **Delete bridge**

Bridges are checked last when you click, so one can never swallow a click
meant for the island it lands on. That does mean you have to click the
part of the bridge that's over open water.

---

## The ring road

Each island gets a loop set in from the coast, and the bridge roads run a
short way inland and join it. Before this, every bridge road drove to the
island centre, so hub — with five bridges — had five roads converging on a
single point.

Select an island and you get, in the panel:

- **Edit the ring road** — takes it over. The loop it's drawing right now
  becomes 24 draggable handles; the shape barely moves (under 0.8 units).
- **Back to the automatic ring** — while a taken-over ring is selected.
- **Remove the ring road** / **Bring the ring road back**.

In the data file:

```js
{
  id: 'contact',
  noRing: true,                    // no ring on this island at all
  ringInset: 12,                   // or: how far in from the coast
  roads: [
    { isRing: true, closed: true, points: [ … ] }   // or: your own loop
  ]
}
```

Delete the `isRing` entry and the loop goes back to being generated.

Wherever two roads meet, a disc of road surface fills the corners. You
don't have to do anything about these — they're worked out from wherever
the roads actually end up.

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

## Moving the town streets

Town islands get a grid of streets inside the ring. Like the ring and the
bridge roads, these are *generated* — worked out from the island's shape
every time — so for a while there was nothing to click.

Now there is:

- **Click a street** with the Select tool. It becomes yours, with handles
  at each end, and it doesn't move as you claim it.
- **Drag a handle** to move that end. You can do this with Select — the
  handles are live for whichever road is selected.
- **Alt-click the street** with the Road tool to add a handle, so you can
  bend it rather than only move the ends. Alt-click a handle removes it.
- **Demolish tool, or Delete** gets rid of the street for good.
- **Back to the automatic street**, in the panel, hands it back.
- Select the island and the panel says how many streets are automatic, how
  many are yours and how many you've removed, with a button to
  **bring back the removed ones**.

In the data file, a street you've taken over is a road carrying the key of
the generated street it replaces, and a street you've removed is just that
key on the island:

```js
{
  id: 'projects',
  noStreets: ['s1.0.0'],           // this one isn't generated any more
  roads: [
    { streetKey: 's0.0.0', points: [ … ], width: 5.5 }   // this one is yours
  ]
}
```

The key says which sweep line of the grid the street came off (`s0` / `s1`
are the two directions), which line along that direction, and which stretch
of it — a concave island can cut one line into more than one street.

**Why a key and not the geometry?** Because the grid is derived from the
island's shape. Reshape the coast and the streets change with it, which is
what you want. What has to survive is *which* of them you dealt with by
hand, not where they happened to be at the time.

Two consequences worth knowing:

- Move the coastline a long way and the keys can end up pointing at
  different streets. If your edits look scrambled after a big reshape, that
  is why. Nothing is lost — clear the island's `noStreets` and start again.
- A street you've taken over is still a street: it keeps its pavements, the
  buildings lining it, and its share of the traffic signals. Draw a road by
  hand in the same place and you'd get none of those.

---

## Hills, and the ground under everything

The world is no longer flat. Each island can declare `hills`, and everything
that touches the ground asks one function how high it is:

```js
{
  id: 'about',
  ...
  hills: [
    { x: -40, z: -18, radius: 50, height: 4.5 },
    { x: 46, z: 34, radius: 44, height: 3 }
  ]
}
```

`x`/`z` are island-local, like everything else in an island's entry. `radius`
is how far the hill reaches, `height` how high it stands at the middle. They
add up where they overlap, and each one is a smooth dome rather than a cone -
a cone has a crease down its side that catches the light and reads as a tent.

Start gentle. The current map tops out at six units, which is about two
storeys, and that is deliberate: everything else in the world has to react to
this, and mild ground makes it obvious when something doesn't.

### The three promises

The height field is not just the hills. Three rules are built into it, because
each is something you would otherwise have to trust every single object to
respect:

1. **Roads can be driven.** A corridor around every road is level ACROSS its
   width - no camber - and no steeper than `MAX_ROAD_GRADIENT` (8%) ALONG its
   length. The roads on an island are solved together, so where two meet they
   arrive at the same height rather than stepping.
2. **Buildings stand vertical on ground that holds them.** Every plot gets a
   flat terrace under its whole footprint and a little way beyond. Plots that
   share ground are levelled together, so a row of houses on a slope reads as
   a terrace rather than a set of tilted boxes.
3. **The land still meets the sea.** Height fades to zero at the waterline.
   The only things allowed above sea level at the shore are a road that
   crosses the beach on purpose, and a building's own terrace.

If you raise the hills a long way, the thing to watch is not the height - it
is what the ground does BETWEEN a road and a building, because that is where
all three rules meet. `tests/terrain.mjs` measures all of it on the real map.

### Why the grass sits under the roads

The drawn grass and sand duck about half a metre beneath anything flat - a
road, a pavement, a building's forecourt (`GROUND_SINK` in `World.js`). The
collider does not: what you drive on is the true ground.

**The rule behind it: two meshes with different corners cannot be stacked
closer than the error between them.** Either give them the same vertices, or
leave a real gap. It caught three pairs in a row here - grass against road,
grass against sand (the grass cap is a ring inset inside the island's
outline, so its corners are nowhere near the sand's), and grass against the
hub's plaza. The plaza is now a claim on the ground like a building is, so
the ground under it is flat and the grass ducks beneath it.

That looks like a fudge and is not. Two surfaces meshed at different points
cannot be reliably stacked three centimetres apart: between its own corners
the grass is a flat triangle, and wherever the ground curves away - which it
does within a metre of every kerb - that triangle sits above the true surface
and comes up through the tarmac. Finer triangles only halve the error each
time you quadruple the count. Ducking out of sight is exact, free, and hides
nothing you were meant to see.

### Where it lives

`src/world/terrain.js` is the maths - hills, coast taper, road profiles, pads -
and knows nothing about islands. `getIslandTerrain()` in `islandLayout.js`
feeds it the real roads and plots and caches the result. Everything outside
the layout should call `groundHeight(x, z)` and `groundSlope(x, z)`, which
work in world coordinates.

**One implementation, consulted by everyone.** If the grass mesh worked out
its own heights and the roads worked out theirs, they would disagree by a few
centimetres and every road in the world would either float or sink into the
hill it crosses.

---

## Lights in the windows after dark

Nearly nine buildings in ten light their windows at dusk
(`WINDOWS_LIT_CHANCE` in `World.js`), and within each of those about three
rooms in ten stay dark (`WINDOW_DARK_CHANCE`). That split matters: the variety
should come from unlit ROOMS, not unlit buildings. At the first setting - two
in three - a third of the town stood completely black at midnight, which on a
street of four or five buildings reads as broken rather than as people being
out. Turn `WINDOWS_LIT_CHANCE` down if you want a sleepier town.

**The glass goes on the windows the model already has.** Each building `.glb`
is a single material called "colormap" over a shared 512x512 atlas, with no
glass material to pick out by name - but the windows are there: 4 to 8 quads
per building whose UVs point at one dark grey swatch, around (60, 60, 66)
against a darkest wall of (90, 96, 120). `windows.js` samples the texture,
keeps the triangles that land on the dark swatch, groups them into panes, and
`World.js` lays a sheet of emissive glass over exactly those triangles.

Two things that will bite anyone changing this:

- **glTF puts UV (0,0) at the TOP left of the image**, and this atlas has its
  top half empty. Sample with V flipped and every triangle comes back black,
  so every wall is reported as glass.
- **The outward offset is in MODEL units.** These buildings are one unit
  across before the world scales them up, so a world-unit offset is a hundred
  times too big.

Both of those are what the first version got wrong. It hung a grid of panes on
the model's *bounding box*, in world units, inside a group already scaled up -
so the glass floated in the sky above the rooftops. Before that it did nothing
at all, because the code lived in the procedural fallback that `addBuilding`
only reaches when there is no model, and every building has a model. **A
tunable in a branch that never runs looks exactly like a working feature.**

Swap the models for better ones and `tests/windows.mjs` will tell you whether
the new ones have windows this can find.

---

## Traffic

Thirty-one vehicles drive the roads: sedans, convertibles, police cars,
ambulances, fire engines, and four city buses that call at bus stops. The
emergency vehicles flash red and blue. They stop at red lights, queue behind
each other, give way at junctions, and you can bump into them.

### Lanes

The road network becomes a **directed lane network**. Three things make that
more than an offset copy of the roads:

- **Every road is cut at every junction on it.** Without that, a car on a
  through road passes a crossroads with no decision to make - it can never
  turn off, and has no stop line to stop at.
- **Each piece becomes two lanes**, one per direction, a quarter of the
  road's width to the right of the centre line. Right-hand traffic.
- **Each lane knows what it can turn into**, whether its far end is
  signalled, and which phase it waits for.

Where a street runs alongside the ring - which the layout permits for up to
26 units - both lanes occupy the same tarmac. The duplicate lane is dropped,
so traffic only ever has one way through that space. The roads themselves are
left alone.

### Stopping at a red

The stop line is set back from the junction by the **junction's own radius**
plus a margin — not by a fraction of the lane's width, which is enough on a
7-unit road and half a unit short on a 5.5-unit street meeting one. A car
waiting inside the box blocks the arm that has the green, and chains of four
stayed put for eighty seconds.

And a vehicle stops with its **nose** on the line, not its middle. `at` is the
centre of a vehicle, so stopping the centre there left half a length in the
junction — six-tenths of a unit for a sedan, and 3.9 for a bus, which is most
of the way across.

Two of the twelve-unit ring pieces are shorter than a bus plus its stopping
distance. A bus there carries on through instead of freezing, which is the only
thing it can do.

There's also a **don't-block-the-box** rule: a vehicle still behind its stop
line waits properly if the road beyond the junction is occupied. Once past the
line it is committed, and creeps until it is clear.

### What can stop a vehicle

Only three things bring one to a halt: a red light, the vehicle directly in
front on the same lane, and the two-dimensional collision veto. Everything
else - giving way at a junction, waiting for a lane entrance to clear - lowers
a vehicle's speed but never below a crawl.

That distinction is the whole reason the traffic moves. Every version where a
give-way rule could stop a vehicle dead produced a deadlock:

| The rule | What it did |
|---|---|
| Whoever is nearest owns the junction | A car stopped at a red was always nearest, so it held the junction shut against the arm that had a green. Cars faced a green light for minutes. |
| Yield to anything on an onward lane | Two cars on adjacent 12-unit ring pieces each sat in the other's lane entrance. 286 seconds out of 300 stationary. |
| Break every conflict by vehicle number | A low-numbered car cheerfully drove into the back of a stationary fire engine. |

The rules now: whoever is *behind* gives way; where both have the other in
front - a genuine imminent collision - the lower-numbered one goes; only
something actually moving may claim a junction; and after fifteen seconds
standing still a vehicle stops giving way altogether, because the collision
veto means it still can't hit anything.

### The collision veto

Before any vehicle moves, the move is checked in two dimensions: would the
rectangle it would occupy overlap another vehicle's? If so it doesn't move.
Where the step crosses a junction, **every** onward lane is tried in
preference order - checking only the favourite froze eleven vehicles of
thirty-one.

This exists because everything else works in one dimension, distance along a
lane, and that is blind at the moment a vehicle changes lane: it arrives
somewhere its old lane knew nothing about. A car turning out of a junction
landed on top of a stationary fire engine parked on a spur that overlaps the
ring.

### Lights

`signalState()` is the single source of truth for the cycle - 18 seconds, two
phases, 2.5 seconds of amber at the end of each green. The lamps read it and
so do the drivers, so they cannot disagree. It used to be implemented twice,
once in `World.js` for the lamps and once in the test, and the offset of each
junction came from the renderer's random number generator - which meant
nothing outside the renderer could know whether a light was green.

### When two of them do jam

Four things conspire, and all four are handled:

1. **Overlapping lanes.** A street may run alongside the ring for 26 units, so
   two lanes can occupy the same tarmac. The duplicate is dropped — measured as
   an absolute shared length, not a fraction, because two pairs on this map
   overlapped for 16 and 18 units and a 60%-of-the-lane test found neither.
   This matters more than it sounds: reversing along a road that runs *parallel*
   to the obstruction never increases the gap, so cars caught this way could
   never free themselves.
2. **Swerving.** A vehicle blocked for a second and a half pulls out towards
   the kerb — never towards oncoming traffic, which it used to do and then camp
   there — and drifts back once the way is clear.
3. **The unjam.** Anything that ends a step overlapping is put back where it
   was; if that spot is taken too, it shuffles along its own lane, forwards or
   backwards, until clear.
4. **Giving up.** Blocked for 25 seconds and it leaves the road and reappears
   somewhere clear, as though it had driven off. Crude, deliberately, and
   `tests/traffic.mjs` reports how often it fires so it can't hide a jam.

   **Waiting your turn is not being stuck.** This used to fire on anything
   that hadn't moved for 25 seconds, including a car queueing lawfully at a
   red - which is a car vanishing from a queue, not a jam being cleared, and
   it was picking off service vehicles two seconds from their own station
   door. `lawfulWait()` follows the chain of who is waiting for whom and
   exempts anything that traces back to a red light, a bus at a stop or a
   vehicle turning into its bay. A ring of vehicles all waiting on each other
   is not exempt: that is the deadlock this exists for.

   `STUCK_LIMIT` (35 seconds) is the backstop that moves anyone standing
   still too long whatever the reason, so the exemption can't hide anything
   either. And a relocated vehicle needs clear road **ahead**, not just a gap
   to stand in - dropped into the back of a queue it stops again at once and
   has gained nothing.

### Colliders

Every AI vehicle has a **kinematic** collider: it goes exactly where the
simulation says and is never pushed off its lane, but your car collides with
it properly. A fully dynamic AI car spends its life on its roof. The traffic
also gives way to *you*, so pulling out in front of a bus gets you a stopped
bus rather than a shove down the road.

Parked cars are solid now too. They weren't, which is what made the streets
feel like scenery.

### How many vehicles

`TRAFFIC_FLEET` is 52 vehicles: sedans, convertibles, buses, and a service
fleet of 12 police cars, 8 ambulances and 8 fire engines. The figure is
measured rather than chosen - at 52 every vehicle still covers at least 500
units over five simulated minutes with a median around 1,000, and nothing
stands still for more than the backstop. Push it much further and the median
halves: the network has several 12-unit ring pieces, and once a few vehicles
are queued across those there is nothing left for the give-way rules to give.

There are no parked cars any more. They were placed a fixed distance out from
each building, which on a narrow street put them in the carriageway, and the
shape they fell back to was a flat slab that read as a car sunk into the road.
Every car in the world moves.

If you want busier streets, lengthen or widen the short ring pieces first, and
let `tests/traffic.mjs` tell you whether it worked.

### Where the numbers live

`islandLayout.js`, as `TRAFFIC_*`, `LANE_*` and `BUS_*`. The whole simulation
is there as well - `stepTraffic()` - for the same reason the trains and the
ships are: `World.js` needs a browser, so the tests can only read it, and the
traffic rules are the part with logic in them. `tests/traffic.mjs` runs the
fleet for five simulated minutes and checks every pair of vehicles every
frame.

---

## Fire stations, police stations and hospitals

Seven of them, sited by `getStations()` on the same principle as everything
else: it walks the lanes rather than guessing at a compass bearing, and asks
whether the building's **rectangle** is clear of the coast and every road.
(Testing the circle round it demanded 16 clear units for a fire station, which
a town with streets every 34 units has nowhere, so the first version placed
none at all.)

Each station faces its street, with an apron in front and a marked bay per
vehicle. A fire station's front wall is piers and lintels around **one opening
per bay**, and the door width lives beside the bay spacing in
`STATION_KINDS` - 5.6 units against a 2.4-wide engine, with a pier of
brickwork between one door and the next - so the run-in from the apron is a
straight line square to the opening. Nothing swings near a door frame. The doors lift when
their own engine is coming or going and stay shut otherwise.

Service vehicles work the streets for a while, then go home:

- **How they find their way back.** Each station carries `toHome`, a
  breadth-first search backwards from its own lane giving the number of turns
  home from every lane in the network. A vehicle whose shift has ended takes
  the turn that shortens it. Left to wander until it happened to pass its own
  door, a fleet of twenty-two managed two visits in ten minutes.
- **The bay path is two points**, `approach` then `bay`, and a parking vehicle
  is off the lane network entirely - nothing can be in its way, because a bay
  belongs to one vehicle.
- **`STATION_DWELL` (70s) against `STATION_PATROL` (75s)** is what makes the
  car parks look used. At 18 against 90 the parking worked perfectly and there
  was almost never a vehicle in a bay to see.

`tests/stations.mjs` measures the geometry and then runs ten simulated
minutes, counting how many vehicles turn in, how long they take and how many
are parked at a time.

---

## Ports and shipping

Every island has a port, and **you can drive out onto the quay**. A road
leaves the ring, crosses the beach and runs the length of the pier. The deck
is solid; there are no railings, for the same reason a real quay has none.

The two biggest islands (`radius` at or above `PORT_BIG_REACH`) get cargo
terminals - gantry cranes, a shed, stacked containers, two berths. The rest
get fishing jetties with one berth, a hut and some crates.

### Where a port goes

Chosen by sweeping the compass and scoring each bearing, not written down.
What a port wants, in order of how much it matters:

1. **Open water in front of it.** Walked step by step out to sea - how far a
   ship could actually sail from there. The first version compared the
   bearing against each island's bounding circle, decided it would "sail
   past" almost everything, and so scored every bearing the same; hub ended
   up with a quay facing a 36-unit gap between two islands.
2. **Clear of the bridge landings.** The arrival at an island is the view
   every visitor gets, and a container crane isn't it.
3. **Clear of where the monorail crosses the coast**, so the beam doesn't
   pass over the cranes.

Set `port: false` on an island to leave it without one.

### The shipping lanes

A graph over the sea, derived like the road network:

```
berth -> approach -> lane ring -> ... -> lane ring -> approach -> berth
berth -> approach -> lane ring -> off the edge of the world
```

The **lane ring** is a circle of waypoints at the map extent plus a margin,
so every one of them is outside every island. A leg between two adjacent ring
waypoints therefore cannot cross land, and needs no obstacle test. All the
geometry risk sits in the short legs from each port out to the ring, and
those *are* tested - walked in steps, because the islands are arbitrary
polygons and a segment-versus-polygon test would have to be right for
concave bays and atoll lagoons too.

Ports are also joined directly to each other where the water allows it, which
is what stops a run between neighbouring islands going out to the horizon
and back.

### The fleet

Three cargo ships and five small boats. A ship sails to a berth, waits,
and sails again - or heads off past the horizon. Roughly two voyages in five
go off-world.

**Going off-world is a real departure.** The ship sails to a waypoint 780
units out, well past where the fog hides anything, and the hull is then
re-used for an arrival from a different direction. Departures and arrivals
balance without anything counting them, because a ship that is off-world
always comes back to a berth.

Other things worth knowing:

- **A berth is reserved.** A ship claims its destination when it sets off,
  so two hulls can't end up in the same twelve metres of water. Getting this
  wrong at *start-up* rather than during a voyage was the actual bug: a
  container ship and a fishing boat in the same berth on frame one.
- **Cargo ships only use cargo berths**, so a container ship never ties up
  at a fishing jetty.
- **Headings are turned, not set.** A ship comes round at a fixed rate, which
  is what a lane waypoint needs (a straight set would pivot a 46-unit hull on
  the spot) and what leaving a berth needs (180 degrees, over a few seconds).
- **No colliders on ships.** A moving collider has to be a kinematic body
  told where it is every frame, and the payoff would be shunting a container
  ship with a hatchback.

Numbers live in `islandLayout.js` as `PORT_*`, `PIER_*`, `SEA_LANE_*`,
`OFF_WORLD_*` and `SHIP_*`. The lane routing and the fleet's behaviour are
there too, not in `World.js`, so the tests can run them: `tests/ports.mjs`
sails the fleet for fifteen simulated minutes and asks every hull, every
frame, whether it is standing on land.

The map editor draws the quay and its road, but you can't drag them yet -
the site is derived from the coastline, so there is nothing stored to move.

---

## The monorail

An elevated loop calls at every island: **blog - contact - hub - about -
projects - skills** and back round. Three trains run it, stopping at each
station for four and a half seconds.

Nothing about it is in the map file. The running order is worked out from
where the islands are, so moving one in the editor reroutes the line rather
than leaving it crossing itself. To have the line skip an island, add
`monorail: false` to it.

### How the route is built

Straight spans between the islands, with a curve of a stated radius at each
one - `MONORAIL_CURVE_RADIUS`, 40 units. That's a deliberate construction,
not the first thing that worked:

- **A spline through the station points** gives a curve that has to pass
  through a point *and* turn 120 degrees around it, which it can only do in
  almost no distance. Measured radius: 5.7 units. A hairpin.
- **Chaikin smoothing** rounds a corner over about the length of the
  segments either side of it. On the finely spaced loop it did nothing; on
  the coarse six-point one it cut the corners off 60 units at a time.

A curve of radius R turning through an angle passes the corner about
`R x (1/sin(half the angle) - 1)` to the inside - 44 units on the sharpest
corner here. So the corners of the underlying polygon are aimed *outward* by
that much, and the curve comes back onto the island centre. Every platform
now sits within 1.5 units of the middle of its island. The corners
themselves end up offshore, which nobody sees, because only the arcs are
built.

### How high, and what gives way

The beam's top runs at **11 units**, its underside at 9.5. It started at 16,
chosen to fly over a five-floor building, and looked like a viaduct on
stilts - too far above the town to belong to it.

At 11 the beam is *below* the tallest thing the towns generate, so something
has to give, and it can't be the line: the route is worked out before the
towns exist, from the island shapes, so it has nothing to route around yet.
What happens instead is what happens under a real elevated railway - the
buildings beneath it are low ones.

`monorailCeiling()` returns how tall anything may be at a given point:
infinity everywhere except a 6-unit-wide strip either side of the beam,
where it's about 8. Everything that puts an object on the ground consults it:

- **Buildings** lose storeys until the roof clears - at most three floors
  under the line, against five elsewhere. A `.glb` model has no storeys to
  take away, so it shrinks whole.
- **Palms** have their trunk capped, because the crown sits a further unit
  above it and the fronds are what show through the beam.
- Everything else - lamps at 4.6, traffic lights at 4.5, shopfronts at 2.6 -
  is already well under and needs nothing.

On the current map that touches **12 of 91** generated plots. The rest of
each town is untouched.

A building **you** placed by hand gets shortened too, but the validator says
so on load, naming the island and the position - a silent change to your own
file would just look like the file being ignored.

The chase camera rides 5 to 7 units up, so it still passes under the beam.
That's the floor on how low this can go: much lower and the beam would cut
across the car every time you drove beneath it.

### The yard

The shed sits on ground measured clear of the coast and every road - as a
**rectangle**, not as the circle around it, which had left a corner half a unit
from the coast road on ABOUT.

Containers are stacks of one to three on a grid in the yard's own axes,
nearest the shed first, each position tested by its own four corners against
`CONTAINER_ROAD_CLEARANCE`. Both parts of that sentence are fixes: each
container used to get a random level of 0, 1 or 2 with **nothing underneath**,
so two thirds of the cargo on the map hung in mid-air, and a six-unit box
tested by its centre against a flat five units has a corner two units from the
kerb.

A cargo port's shed and containers are placed by measurement: on land, well
inland, clear of every road, and clear of the monorail, with room for the
whole footprint rather than just its middle. A big shed if there's room, a
smaller one if not, and nothing at all if neither fits.

The first version placed the shed by dead reckoning - a fixed 12 units back
and 12 to the side of the pier root, no test of any kind. On EXPERIENCE that
put a 22 x 13 x 8 concrete shed squarely across the coast road and out onto
the beach. Same mistake as the signal poles in the carriageway and the piers
through the bridge deck: **ask the geometry where the thing ends up, never a
formula for it.**

The gantry legs had the same problem in miniature - at 0.62 of the pier's
width they stood a unit and a half outside a 13-wide deck, in the water,
holding up nothing.

### What gets built

| Thing | Where it comes from |
|---|---|
| The beam | One swept box for the whole 1,800-unit loop - one mesh, not 500 |
| Piers | Every 27 units, skipping the stretch under each station |
| Stations | Two platforms, a canopy, the island's name lit at night |
| Stair towers | Beside each platform, down to street level |
| Trains | Three cars each, running the timetable |

A pier that would land on a road slides along the beam until it finds room,
and is left out entirely if there isn't any - which happens where the line
runs *along* a street rather than across one. Better a 54-unit span than a
column in a traffic lane.

The piers and the stair towers are solid: you can crash into them. The beam
isn't, because there's no way to reach it.

### Where the numbers live

All of it in `islandLayout.js`, as `MONORAIL_*` constants: the height (16
units, chosen to clear a five-floor building and its roof), the line speed,
the dwell at each stop, how many trains, how far apart the piers stand.

The timetable is there too, not in `World.js`. `World.js` needs a browser,
so nothing in it can be run by the tests - only read. Anything with logic in
it belongs where a test can drive it. `tests/monorail.mjs` runs the trains
for four hundred simulated seconds and checks they call everywhere, never
stop in mid air, never exceed the line speed and never pile into each other.

---

## The airport

A platform on piles out at sea, with a runway, a taxiway, a terminal and four
stands. Four aircraft use it: they arrive from off the edge of the world, land,
taxi in, sit on stand with the airbridge on, push back, take off and leave
again. Roughly the same life the ships have.

**Nothing about it is in the map file.** The site is searched for, the way a
port's bearing is - move an island and the airport moves. What it wants, in
order:

1. **Open water all round it**, measured against each island's real coastline
   and tested at the platform's four CORNERS, not its centre.
2. **Out of the bridge crossings.** The arrival at an island is the view every
   visitor gets.
3. **Inside the shipping lane**, so the ships keep their circuit. Measured
   against where a ship actually goes - `innermostShippingLane()` - because the
   waypoints sit on a circle but a ship sails the chord between two of them,
   and a chord dips inside the arc.
4. **Within reach of land**, or nothing could ever connect to it.

**The runway lies tangentially** - across the line out from the middle of the
world, not along it. Pointing it outward would push one threshold another
hundred units out to sea and into the shipping lane.

**And the terminal is on the SEAWARD side.** That axis points either straight at
the islands or straight away from them, and it used to point at them - which put
an eleven-metre wall between you and everything worth looking at. The runway is
nearest you now, then the stands, then the terminal as a backdrop. This platform
is only ever viewed from one side; there is no land on the other.

### The numbers, and where they come from

`AIRPORT_RUNWAY_LENGTH` is eight times `PLANE_LENGTH`. A runway is a multiple of
the thing that uses it - the proportions are compressed the way every game
compresses them, because a real airliner wants seventy times its own length of
concrete and that would be twice the width of this world.

The rest live in `islandLayout.js` as `AIRPORT_*` and `PLANE_*`. The flying is
there too - `stepPlanes()` - not in `World.js`, for the same reason the train
timetable and the traffic rules are: `World.js` needs a browser, so a test can
only ever read it.

### One aircraft on the runway at a time

The whole of the separation rule, and the only thing that can block. Two places
may hold, and they are the two where holding is free: at the holding point on
the ground, and out at the approach fix, where an aircraft can be turned round
and brought back in. **Nothing holds once it is on finals** - by then it is
committed and there is nowhere to wait.

That asymmetry is the same lesson the traffic learned the hard way: a rule that
can stop something with nowhere to stop is a rule that produces a deadlock.
Holding only the ground traffic left landings queueing behind a rollout, which
measured as 980 frames of two aircraft on the runway in six minutes.

**You cannot drive there yet.** There is no causeway; the airport is something
you fly past. The site is deliberately kept within `AIRPORT_MAX_SPAN` of land so
one can be built.

---

## Helicopters

Ten pads: four on rooftops in the towns, and one on the ground on every island
including the jungle ones - the point of those being somewhere to fly that is
not a city. Three machines lift off vertically, cross at 46 units, and land on a
different pad.

**A pad is almost entirely a question of clearance.** A helicopter needs no
runway, so the only thing that can stop it is something overhead, and there is
exactly one such thing in this world: the monorail beam, 9.5 to 11 units up,
running straight over the towns. `monorailCeiling()` says how tall anything may
be at a point, and a pad must clear it by a **rotor's width** - not merely fit
under it. A machine that can sit on a pad and never leave is worse than no pad,
because it looks like it works.

**The pad is sized off the roof, not off the helicopter.** A town plot is 9 by 8;
the pad was 9, so every rooftop failed by one unit and the world had no rooftop
pads at all while the function returned a perfectly healthy six. `HELIPAD_SIZE`
comes off `DEFAULT_PLOT_DEPTH` now. The rotor is allowed to overhang the pad, as
it does on real ones.

A ground pad is tested as a **rectangle** against the roads, not as the circle
round it - the same distinction that once placed no fire stations anywhere.

Numbers in `islandLayout.js` as `HELI_*` and `HELIPAD_*`; the flying is
`stepHelicopters()`, in the same file and for the same reason as everything else
with a decision in it. `tests/helicopters.mjs` runs ten simulated minutes and
counts landings, pads used and double-bookings.

---

## Seasons

Four of them, one per day, so a year takes four days of playing. The conditions
box top-left has a **Season** row under the weather - pick one and the world
turns over the next few seconds. "Back to the automatic cycle" hands it back,
along with the clock and the weather.

**Spring** puts flowers up all over the grass and freshens the green.
**Summer** is the world exactly as it was before seasons existed - every tint
is zero, deliberately, so nothing about the map you already have has changed.
**Autumn** turns the street trees orange, straws the grass, and drops leaves.
**Winter** kills the colour back to a dormant grey-green, bares the branches
and lays snow on the lawns, the roofs and the sand.

### Snow

There is a new weather, **Snowing**, and you can pick it at any time of year.
It is not a separate weather cycle: showers and storms simply *become* snow
when it is cold enough - always in winter, occasionally in late autumn. The
season decides what falls out of the cloud, and there is one list of weather
rather than a summer one and a winter one.

Snow that has settled is a different thing from snow that is falling. Pick
Snowing in July and the ground goes white over about a minute, then melts off
more slowly once it stops - which is why a five-second flurry does not
whitewash an island.

**There is no snow layer.** The ground goes white by being *coloured* white,
not by having a white surface laid over it. A second surface a few centimetres
above the first is the same trap that made grass show through the roads three
times, and it is not worth re-entering for snow.

How much of the white each surface takes is `SNOW_TAKE` in
`src/systems/seasons.js`: lawns most, then roofs, then sand, then foliage.
Roads and cliff faces take none - roads in a working town get cleared, and snow
does not lie on a vertical face.

### Leaves and flowers

Falling leaves and falling snow are the same field of drifting specks with
different weight, size and colour, which works because no season asks for both.
Leaves put up about a sixth as many particles as snow: at the same density they
read as confetti rather than as autumn.

The spring flowers are sown once when the world is built, into whatever gaps
are left after every road, building and monorail pier - about 1900 clumps of
three. They **grow**: the whole field is scaled up from ground level by how far
into spring it is, so through spring they push up and through summer they sink
back. Out of season they are not drawn at all.

### Changing how it looks

Everything is in **`src/systems/seasons.js`**, and it is a table. Each season
gives four things a target colour and a strength:

| role | what it is |
|---|---|
| `grass` | the lawns - the one that matters most |
| `foliage` | tree canopies, palm fronds, bushes, planters |
| `ground` | the sand, and a fraction of the cliff faces |
| `roof` | every generated building's roof |

Nothing is painted an absolute colour: each material mixes from **its own**
colour toward the target, so a light frond stays lighter than a dark one in
every season. Turn a strength down to make a season subtler, up to make it
stronger. Summer's are all zero, which is what makes summer the world you
already know.

Palms are registered at a quarter strength on purpose, so SKILLS and BLOG stay
jungle whatever the month.

`SEASON_BLEND` is how much of each season is spent turning into the next -
0.25, so three quarters of a season looks like itself.

---

## The camera

**Drag the world to look around. Scroll to zoom.** That is the whole of it if
you never open the panel.

From the keyboard, if you would rather keep your hands where they are:

| key | what it does |
|---|---|
| **Q** / **E** | swing the camera left and right |
| **R** / **F** | raise it and lower it |
| **Z** / **X** | zoom out and in |
| **C** | back to your view |
| **V** | save this view |

### Saving a view

The **Camera** box, top right, has three buttons. The one that matters is
**Save this view**.

Normally, if you swing the camera somewhere and then let go, it eases back to
where it was after a couple of seconds - so looking round a corner is
temporary and you never have to remember to put it back. Saving changes what
it eases back TO. So if you find an angle you like, save it, and from then on
that is your camera: it holds there, and it is where C takes you.

That means there is no "lock the camera" button, because saving already is
one. **Reset to the default view** throws your saved view away and puts the
shipped camera back; it only appears once you have something to reset.

Your saved view is kept in the browser, so it survives a reload. Clearing site
data clears it.

### What it does on its own

- **It looks over your shoulder when you reverse.** Back up for about three
  quarters of a second and the camera swings round so you can see where you
  are going, then comes back when you drive forward. Shuffling slowly out of a
  parking space is too slow to trigger it, on purpose.
- **It ducks when something is in the way.** If a building, a pier or a cliff
  gets between you and the camera, the camera comes in closer rather than
  letting you drive blind. It snaps in and eases back out, because a frame
  spent easing toward a wall is a frame spent inside it. At the normal height
  this hardly ever fires - the camera is above most of the town - and at a low
  angle it fires often.
- **It still pulls back with speed**, exactly as it always did.

### Changing how it feels

`src/systems/cameraPose.js`. `RIG` is the chase camera itself: how high and
how far back, standing still and at speed. Below it are the rates (how fast a
drag or a key moves the view), the limits (how low, how high, how close, how
far), how long it waits before easing back, and the reverse timings.

Everything else - Camera.js - is easing and a raycast. If you want the camera
to feel different, the numbers are all in the one file.

---

## The fire

**Every two minutes** a building catches light. **FIRE AT (island)** appears at
the top of the screen, and a column of smoke goes up from the roof - that is
how you find it, so it is drawn big enough to see from the next island.

Under the banner is an **arrow**, with how far away the fire is. It points in
screen terms - straight up means dead ahead - and turns as you turn, so you can
follow it round a corner. It is aimed from the camera rather than from the car,
which is why swinging the camera round to look over your shoulder swings the
arrow with it instead of leaving it pointing at nothing. The banner clears
after a few seconds; the arrow stays for as long as the fire burns.

**Driving the fire engine**, it is yours to put out. Pull up outside (within
about sixteen units - anywhere along the frontage will do) and the aerial goes
to work: the turntable at the **back** of the truck swings round, the truss
lifts, it telescopes out, and the basket at the tip parks in the air a few
metres clear of the building and hoses in. The basket stays **level** however
far the ladder is raised, the way a real one does on its levelling linkage.
The water comes out of the monitor on the basket rail, not from the truck. It is a box truss - four chords, rungs
and diagonal bracing - built from photographs of real tower ladders, and the
ladder lying along the roof is the same object stowed. A **FIRE CONTAINMENT** bar fills while you
are there and turns green to say you are on station; hold it for fourteen
seconds and the fire is out. Drive off and the bar slips back, though more
slowly than it filled, so overshooting and coming round again costs you
something rather than everything.

The AI engines turn out too - up to three of them, from wherever the road
network says they are nearest - but **they cannot finish it while you are the
one in a fire engine.** That is deliberate. If they could, the game would play
itself while you watched.

**Driving anything else**, they can, and do - and **there is nothing on screen
about it at all**: no banner, no arrow, no bar. You see the smoke going up
over the rooftops and the engines going past, the way you would from a bus.
The fire is still there and still burning; it is just not a job you have been
given. If you want it, go and get a fire engine. Left to themselves the
engines take around four minutes to deal with something on the far side of
the map; they have to drive there through the traffic like everybody else.

That is the same rule the pursuit follows, and it is worth stating once for
all three callouts: **the HUD is a list of things you can do, not a list of
things that are happening.** Anything you cannot act on stays in the world
rather than on the screen.

A fire nobody ever attends burns out on its own after seven minutes, so the
world does not slowly fill up with them.

The numbers are all in `src/world/fireGame.js`: how often (`FIRE_GAP_MIN` and
`FIRE_GAP_MAX`, both 120 - set them apart if you would rather it were
irregular), how close counts as on station, how long you have to hold it, and
how fast the bar slips back.

---

## The pursuit

Every minute or two a car starts flashing and running. It ignores red lights,
and it drives a little slower than a police car does - so it is catchable by
driving well, and it cannot simply outrun you.

**Driving the police car**, it is yours. **PURSUIT IN PROGRESS** appears with
an arrow to it, and you end it by driving into it. Other patrol cars converge
and join in, and none of them can finish it - if they could, the game would
play itself. Lose it for four minutes and it gets away and says so; another
turns up a minute or two later.

**Driving anything else**, one to three chases are running somewhere in the
world at any time. You will come across them: a flashing car going too fast
with police behind it. They resolve on their own after a minute or two. There
is nothing on screen for these - no banner and no arrow. They are scenery, not
a callout, and you are not in them.

The robber is not a special car. It is whichever ordinary car happened to be
chosen, told to run, so when the chase ends it simply carries on with its day.
Buses and service vehicles are never picked.

Numbers in `src/world/policeGame.js`: how often, how much slower the robber is,
how close counts as a bump, and how long before it gets away.

---

## The ambulance run

Every one to three minutes there is a crash somewhere - two cars off the road,
smoking, always on an actual road so the run is always completable. **CAR CRASH
AT (island)** appears with an arrow and a distance, the same instrument the
fire uses.

**Driving the ambulance**, it is yours, and the run has two halves that ask
different things of you.

*Getting there* is a search: you have a direction and a distance and no route,
and the arrow is all you get. *Getting back* is a race: you know exactly where
you are going and the only question is whether you are quick enough. They are
separate phases in the code for that reason - the arrow points at different
things and the bar means different things in each.

Pull up at the scene and a **LOADING PATIENT** bar fills over ten seconds.
Unlike the fire's, it **pauses rather than slipping back** if you roll forward
- the skill being asked for at a fire is holding station, and the skill here
was getting to the crash, which you have already demonstrated. Punishing a
nudge with the doors open would be punishing nothing.

Loaded, the nearest hospital **to the crash** is chosen - not to you - and the
bar becomes **TIME TO HOSPITAL**, which **drains**. A countdown that fills up
is a countdown you read backwards. Two minutes, green while there is
comfortable time left. Arrive and it says **PATIENT DELIVERED**; run out and it
says **PATIENT LOST** and then quietly sets up another.

**Driving anything else**, the AI crews do it - and *without* the ten-second
load and the two-minute clock. That is the third time this project has arrived
at the same rule: **the pressure mechanic belongs to the player.** It was
measured, not assumed. Held to your standard, a crew reached a scene in 38
seconds, then took until 270 seconds to accumulate ten seconds of standing
within fourteen units of it - because an AI driver drives past rather than
parking - and then sat 102 units from the hospital while the clock expired.
Every background crash would have ended in PATIENT LOST. So *arriving* is the
thing an AI can demonstrate: once a crew is at the scene its run proceeds and
finishes off screen. You see the crash, the ambulance turning up, and the wreck
cleared.

**The crash is two real cars**, from the same builders the traffic uses, shunted
into each other with smoke coming off both bonnets. They end up against the
kerb the way they do in life, which leaves the driving line open - and that is
not decoration. Laid nose to nose across the middle of the road they span the
whole carriageway, and then nothing can get past whatever the rules say.

**The traffic gets round it** three ways, in order. Cars are routed away at the
junction before, the way you get waved down a different street at a real
incident. Anything already committed pulls out onto the shoulder straight away
rather than queueing first. And only if neither works does a car cross the
centre line - one direction at a time, and only with a clear gap, because the
unobstructed side never gives way. None of it can jam: routing away adds no
new reason to stop, and the wreck itself is something drivers PREFER to avoid
rather than something that can pin them.

The whole scene clears when the run ends - the cars, the smoke, and the
diversion the traffic has been making round it.

A crash nobody attends clears itself after five minutes, for the same reason a
fire burns out: otherwise the world quietly accumulates wrecks nobody dealt
with.

Numbers in `src/world/ambulanceGame.js`.

---

## The holidays

Six of them, and the world dresses for each. They arrive on the calendar as
the year turns, or you can pick one off the conditions panel and it eases in
over a few seconds.

| Holiday | What appears |
|---|---|
| Easter | eggs scattered on the verges, and bunnies |
| Fourth of July | fireworks over the water after dark |
| Halloween | pumpkins, and lights on the buildings |
| Thanksgiving | turkeys - and the pumpkins stay, at about half |
| Christmas | trees, gifts, wreaths on the doors, and red, green and gold lights across every building |
| New Year | fireworks, and the gifts still out |

**A holiday is a layer over the season, not another season.** That is the
whole design and it is the thing not to rearrange. Christmas happens *in*
winter and wants winter's bare trees and winter's snow; built as a season it
would replace them, and the symptom - the snow vanishing when you put the
decorations up - reads as a rendering fault rather than as the modelling
mistake it is. So a holiday only describes things a season has no opinion
about: how many eggs are on the grass, whether the fireworks are up. It never
names a colour and never mentions snow.

Which means picking Christmas in summer gives you a green Christmas, and
picking it in winter gives you gifts, lights **and** the snow. Both are
correct, and neither needed a special case.

**Christmas gets the most of it**: about fifty bulbs a building - along the
eaves, across the windows of every storey, and in an arch round the door - all
of which light up after dark on the same dusk curve as the street lamps. There
is a wreath on every front door, with berries that glow too.

**Snowmen are winter's, not Christmas's.** They belong to the snow on the
ground rather than to the calendar, so they build up as the world goes white
and melt as it thaws. A green Christmas has none; a cold January is full of
them.

The decorations grow rather than appear - the same trick the spring flowers
use - so they come up out of the ground over a few seconds and go back down
the same way. They are also about twice life size, deliberately: authored at
true scale, an Easter egg on a verge is one pixel from a moving car, and the
road is where you always are.

Fireworks only go up after dark, because a firework at noon is a grey puff.
They burst out over the water, at a height worked out from how far away they
are, so every one sits at about the same place up the sky whether it is close
or distant.

Dates are the real ones converted into the game's year, so the holidays turn
up in the right seasons and the Christmas and New Year decorations overlap the
way that week does. Everything is in `src/systems/holidays.js`: the table, the
dates, how long each lasts, and the fireworks.

---

## What is *not* in this file

| What | Where |
|---|---|
| Island positions, shapes, bridges | `src/world/mapData.js` |
| Colours and materials | `src/world/World.js` → `PALETTE` |
| What props look like | `src/world/World.js` → `addBuilding`, `addPalm`, … |
| Content text and links | `src/world/ZoneManager.js` |
| Driving feel | `src/world/Vehicle.js` → `this.params` |
| Camera feel, limits, free look | `src/systems/cameraPose.js` |
| Headlights, brake lights, indicators | `src/world/vehicleLights.js` |
| The fire callout | `src/world/fireGame.js` |
| The pursuit | `src/world/policeGame.js` |
| The ambulance run | `src/world/ambulanceGame.js` |
| The callout banner and arrow | `src/world/missions.js` |
| Day length, weather | `src/systems/Environment.js` |
| Season colours, snow, leaves, flowers | `src/systems/seasons.js` |
| Holiday decorations and fireworks | `src/systems/holidays.js` |
| 3D model files | `public/models/` — see `MODELS.md` |
| The airport and its aircraft | `src/world/islandLayout.js` → `AIRPORT_*`, `PLANE_*` |
| Helipads and helicopters | `src/world/islandLayout.js` → `HELIPAD_*`, `HELI_*` |
