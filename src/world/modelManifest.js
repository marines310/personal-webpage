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
const BASE = import.meta.env.BASE_URL || '/'
const path = (file) => `${BASE}models/${file}`

export const MODEL_MANIFEST = [
  {
    key: 'car',
    url: path('car.glb'),
    // Auto-scaled so its longest horizontal dimension is 2 units,
    // matching the physics body and the 1.4 unit wheelbase.
    fitLength: 2,
    // If your car model faces the wrong way, set this to Math.PI
    // (180 degrees) rather than changing any driving code.
    rotationY: 0,
    yOffset: -0.35
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
