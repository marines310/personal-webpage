# Adding 3D Models

The world runs right now with built-in shapes. Drop `.glb` files into
`public/models/` with the exact filenames below and they replace those
shapes automatically — no code changes needed.

**Every model is optional.** Add them one at a time and reload to see each
one appear. Nothing breaks if a file is missing.

---

## The whole workflow, in four steps

1. Download a model as **`.glb`**
2. Rename it to one of the filenames in the table below
3. Put it in **`public/models/`**
4. Reload the browser

That's it. No code to edit, nothing to import, nothing to register.

There's already a `car.glb` in that folder — a simple placeholder car I
generated so you can confirm the pipeline works. Overwrite it whenever
you find one you prefer.

### How to tell whether it worked

Open the browser console (**Cmd+Option+J**). On every load the game
reports exactly which models it used and which fell back:

```
[Assets] Using built-in shapes for: building_a, tree_a, rock, streetlight.
Drop matching .glb files into public/models/ to replace them - see MODELS.md.
```

Anything **not** on that list loaded successfully. If a file you added is
still listed, it's almost always a filename typo or a `.gltf` where the
manifest expects `.glb`.

---

## The filenames

| Filename | What it becomes | Roughly how many |
|---|---|---|
| `car.glb` | The car you drive | 1 |
| `building_a.glb` | City tower | picked at random |
| `building_b.glb` | City tower | picked at random |
| `building_c.glb` | City tower | picked at random |
| `tree_a.glb` | Jungle tree | ~30 across two islands |
| `tree_b.glb` | Jungle tree | ~30 across two islands |
| `rock.glb` | Scattered rock | ~15 |
| `streetlight.glb` | Street lamp | ~16 |

Put them here:

```
public/models/car.glb
public/models/building_a.glb
public/models/tree_a.glb
...
```

Start with `car.glb` — it's the one you look at constantly, so it makes
the biggest difference.

---

## Where to download

All three of these are **CC0**: free for any use, no attribution needed.

### [Poly Pizza](https://poly.pizza/)
The biggest library, and it hosts the archived Google Poly collection.
No login. Search "cyberpunk", "sci-fi car", "neon", "palm tree".
Download button gives you `.glb` directly.

### [Kenney](https://kenney.nl/assets)
Whole themed packs in one download. Look at:
- **Car Kit** — clean low-poly vehicles with separate wheels
- **City Kit (Commercial)** — buildings that suit a neon repaint
- **Nature Kit** — trees and rocks

The advantage of a Kenney pack is everything matches out of the box.

### [Quaternius](https://quaternius.com/)
Big uniform low-poly library. His **Sci-Fi** and **Cyberpunk** packs
suit this world especially well.

> **Pick everything from one source if you can.** A realistic car next to
> cartoon trees looks worse than any single style used consistently.

---

## Format

Download **`.glb`** whenever it's offered. It packs the mesh, textures and
materials into one file, which is by far the easiest thing to load.

If you only get `.gltf` (plus a folder of textures) or `.fbx`, convert it
free at [gltf.report](https://gltf.report/) or in Blender
(File → Export → glTF 2.0, format "glTF Binary").

---

## Everything is white / has no colour

The single most common problem, and it's not your fault — it's how the
model was exported.

Some packs (Kenney's especially) don't put colours **inside** the `.glb`.
Instead every model shares one small palette image, usually
`Textures/colormap.png`, and each surface points at a pixel in it. If you
copy only the `.glb` files and leave that image behind, the models load
fine but render plain white.

**Fix:** copy the texture folder from the pack into `public/models/`,
keeping its original folder name:

```
public/models/
├── building_a.glb
├── building_b.glb
├── car.glb
└── Textures/
    └── colormap.png
```

The path inside the model is relative to the `.glb`, so the folder has to
sit right beside them.

The console tells you when this is the problem:

```
[Assets] 1 texture file(s) could not be loaded, so those models will
appear plain white:
  http://localhost:3000/models/Textures/colormap.png
```

That URL is exactly where the file needs to go — everything after
`localhost:3000/` maps to inside your `public/` folder.

**Alternative:** if you'd rather have self-contained files, open the
`.glb` at [gltf.report](https://gltf.report/) and re-export — it embeds
the texture into the file so there's no separate folder to keep track of.

---

## If something looks wrong

Everything below is adjusted in **`src/world/modelManifest.js`**.

### The car faces backwards

Set `rotationY` to `Math.PI` on the car entry:

```js
{ key: 'car', url: path('car.glb'), fitLength: 2, rotationY: Math.PI, yOffset: -0.35 }
```

Don't change any driving code — the physics assumes the car's front is
`+Z` and everything else is built on that.

### The car is huge or tiny

`fitLength: 2` auto-scales the model so its longest horizontal dimension
is 2 units, matching the physics body. If the proportions look off, try
setting an explicit `scale` instead:

```js
{ key: 'car', url: path('car.glb'), scale: 0.4 }
```

### The car floats or sinks into the road

Adjust `yOffset` in small steps (`-0.5` to `0.5`).

### Wheels don't spin or steer

The code looks for child objects whose names contain "wheel", "tyre" or
"tire", and needs to find at least four. If your model names them
something else, it quietly falls back to the built-in wheels — which
still work, they just may not line up with the model.

To check the names, open the model at [gltf.report](https://gltf.report/)
and look at the scene tree.

### Buildings are the wrong size

Change `fitLength` on those entries — it's in world units, and the car
is 2 units long. So `fitLength: 6` is a building three car-lengths wide.

### A model didn't load at all

Open the browser console. The loader logs exactly which keys fell back to
built-in shapes:

```
[Assets] Using built-in shapes for: car, tree_a. Drop matching .glb files into public/models/
```

Common causes: filename typo, or the file is `.gltf` when the manifest
expects `.glb`.

---

## Keep an eye on file size

The JS bundle is already about 1MB gzipped. Aim for **under 1MB per
model**, ideally a few hundred KB. Low-poly CC0 assets are usually well
under that.

If a model is large, compress it at [gltf.report](https://gltf.report/) —
it has a one-click Draco compression that typically cuts 70–90% with no
visible difference.

Total page weight worth staying under: **~5MB**. Past that, first-time
visitors on a phone start giving up before it loads.

---

## Restyling without any models

The whole colour scheme lives in one object at the top of
`src/world/World.js`:

```js
export const PALETTE = {
  night: 0x070713,
  cyan: 0x00f0ff,
  magenta: 0xff2d95,
  ...
}
```

Change those hex values to restyle every island, building, road line and
glow at once.

The island positions, sizes and themes are in
`src/world/islandLayout.js` — one array. Change an island's `theme` to
`'town'`, `'jungle'` or `'mixed'`, or move it by changing its `angle`.
The zone markers, roads, bridges and minimap all read from that same
file, so they follow automatically.
