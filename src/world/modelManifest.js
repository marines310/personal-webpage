/**
 * Model manifest
 * =============================================================
 * Drop .glb files into  public/models/  using the filenames below
 * and they'll automatically replace the built-in shapes.
 *
 * EVERY ENTRY IS OPTIONAL. Missing files just fall back to the
 * procedural geometry, so you can add them one at a time.
 *
 * See MODELS.md for where to download these.
 * =============================================================
 */

// Respects the deploy base path (vite.config.js `base`), so models
// resolve correctly both locally and on GitHub Pages.
// `import.meta.env` is Vite's, and doesn't exist under plain Node - where it
// isn't undefined but MISSING, so reading .BASE_URL off it throws rather than
// returning undefined. Guarded so this module can be imported by the tests:
// without it, anything that transitively reaches here (Game, and so
// Environment) can't be loaded outside a browser at all.
const BASE = (import.meta.env && import.meta.env.BASE_URL) || '/'
const path = (file) => `${BASE}models/${file}`

export const MODEL_MANIFEST = [
  {
    key: 'car',
    url: path('car.glb'),
    // Fitted to a FOOTPRINT, not just a length - CAR_LENGTH and CAR_WIDTH
    // from Vehicle.js, which are also the collider's dimensions.
    //
    // fitLength alone was not enough. This model is 1.3 wide by 2.0 long, a
    // ratio of 0.65 where a real car is nearer 0.42, so scaling uniformly to
    // 3.96 long made it 2.57 wide - wider than the fire engine, and well
    // wider than its own collider. It looked far bigger than the traffic
    // while measuring shorter than all of it.
    //
    // If you change CAR_SCALE or CAR_WIDTH, change these too. They are
    // numbers that have to agree and there is no way for one to find out
    // about the other: the manifest is loaded before any vehicle exists.
    // tests/traffic.mjs section 7 checks they still match.
    fitBox: { length: 4.4, width: 1.9 },
    // If your car model faces the wrong way, set this to Math.PI
    // (180 degrees) rather than changing any driving code.
    rotationY: 0,
    yOffset: -0.77
  },

  // --- Town / city props (cyberpunk districts) ---
  { key: 'building_a', url: path('building_a.glb'), fitLength: 6 },
  { key: 'building_b', url: path('building_b.glb'), fitLength: 7 },
  { key: 'building_c', url: path('building_c.glb'), fitLength: 5 },

  // --- Jungle props ---
  { key: 'tree_a', url: path('tree_a.glb'), fitLength: 3 },
  { key: 'tree_b', url: path('tree_b.glb'), fitLength: 3.5 }

  // Not downloaded yet. Listing a file you don't have still works - the
  // built-in shape is used instead - but it costs a failed request and a
  // red line in the browser console on every single visit, which is not
  // what you want on a site you're sending to people. Uncomment once the
  // file is actually sitting in public/models/.
  // { key: 'rock', url: path('rock.glb'), fitLength: 2 },
  // { key: 'streetlight', url: path('streetlight.glb'), fitLength: 1 }
]
