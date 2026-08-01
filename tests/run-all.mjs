/**
 * Run every check.
 *
 *   node tests/run-all.mjs
 *
 * No test framework and nothing to install - each file is a plain script
 * that prints PASS/FAIL lines and exits non-zero if anything failed.
 *
 * `linkcheck.mjs` is not included here because it needs a built site and
 * a local server; see tests/README.md.
 */
import { execFileSync } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const HERE = dirname(fileURLToPath(import.meta.url))

const SUITES = [
  // The world: geometry, roads, the network
  'ring.mjs',          // ring roads are on land, closed and drivable
  'nogaps.mjs',        // bridge roads are solid, full width, watertight
  'islandroads.mjs',   // every road on every island holds up
  'cont.mjs',          // bridge roads run ring to ring without gaps
  'approach.mjs',      // editable bridge approaches, pinned at the shore
  'network.mjs',       // the road graph: connections and reachability
  'town.mjs',          // street grids, and buildings squared up to them
  'stress.mjs',        // 3000 deliberately awful hand-drawn roads
  'terrain.mjs',       // the height field: drivable roads, level pads, a coast at sea level
  'worldsanity.mjs',   // World.js read statically: it can't be run here
  'lights.mjs',        // the traffic light cycle: never two greens at once
  'conditions.mjs',    // setting the time and weather by hand
  'camera.mjs',        // free look, the saved view, reversing, occlusion
  'vehiclelights.mjs', // headlights, brake lights and indicators, on every kind
  'fire.mjs',          // the fire callout: who may fight it, and getting there
  'seasons.mjs',       // the year: colour, snow, leaves and flowers
  'zebra.mjs',         // crossing bars run along the road, side by side
  'traffic.mjs',       // lanes, right of way, and thirty vehicles on them
  'monorail.mjs',      // the loop, its piers and stations, and the trains
  'ports.mjs',         // quays, shipping lanes, and the fleet at sea
  'airport.mjs',       // the platform at sea, and the aircraft flying to it
  'garage.mjs',        // the player's garage, and getting out of it
  'helicopters.mjs',   // rooftop and ground pads, and clearance above them
  'stations.mjs',      // fire, police and hospital: bays, doors, coming and going
  'windows.mjs',       // the windows in the building models, read from the models

  // The editor, driven through real events
  'alltools.mjs',      // every tool does what it claims
  'draw.mjs',          // it renders in every mode and zoom without throwing
  'roadmatch.mjs',     // the preview matches the game exactly
  'roundtrip.mjs',     // export loses nothing
  'buttons.mjs',       // the per-island buttons appear
  'approachedit.mjs',  // taking over a bridge road doesn't move it
  'ringedit.mjs',      // taking over / removing a ring
  'bridges.mjs',       // bridge properties and deletion
  'bridgemerge.mjs',   // roads build bridges when they cross water
  'cityui.mjs',        // demolish, drag-to-draw, snapping, links
  'streetedit.mjs'     // taking over, reshaping and removing town streets
]

let failed = []

for (const suite of SUITES) {
  process.stdout.write(`  ${suite.padEnd(20)}`)
  try {
    const out = execFileSync('node', [join(HERE, suite)], {
      encoding: 'utf8',
      // The editor prints a WebGL warning on load; it has no GPU here and
      // doesn't need one. Kept off the summary so a green run reads green.
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const last = out.trim().split('\n')
      .filter(l => /\d+ passed|^PASS$/.test(l.trim()))
      .pop() || 'ok'
    console.log(last.trim())
  } catch (err) {
    console.log('FAILED')
    failed.push({ suite, output: (err.stdout || '') + (err.stderr || '') })
  }
}

if (failed.length) {
  console.log(`\n${failed.length} suite(s) failed:\n`)
  for (const f of failed) {
    console.log(`--- ${f.suite} ---`)
    console.log(f.output.split('\n').filter(l => /FAIL|Error/.test(l)).slice(0, 10).join('\n'))
  }
  process.exit(1)
}

console.log('\nAll suites passed.')
