# Tests

```bash
npm test
```

No framework, nothing to install. Each file is a plain Node script that
prints PASS/FAIL lines and exits non-zero if anything failed.

## What each one covers

**The world**

| Suite | Checks |
|---|---|
| `ring.mjs` | Ring roads sit on land, close on themselves, and never bend tighter than the road is wide |
| `nogaps.mjs` | Bridge roads are solid, full width and watertight — no holes |
| `islandroads.mjs` | Every road on every island holds up |
| `cont.mjs` | Bridge roads run ring to ring with no gaps and stay on the deck |
| `approach.mjs` | Editable bridge approaches stay pinned at the shore |
| `network.mjs` | The road graph: what connects to what, and whether you can drive everywhere |
| `stress.mjs` | 3,000 deliberately awful hand-drawn roads — hairpins, zigzags, paths doubling back |

**The editor**

| Suite | Checks |
|---|---|
| `alltools.mjs` | Every tool does what it claims, driven through real mouse events |
| `draw.mjs` | Renders in every mode and at every zoom without throwing |
| `roadmatch.mjs` | The preview matches the game exactly — this one guards against the editor drifting |
| `roundtrip.mjs` | Export loses nothing |
| `buttons.mjs` | Per-island buttons appear for the right islands |
| `approachedit.mjs` | Taking over a bridge road doesn't move it |
| `ringedit.mjs` | Taking over, editing, removing and restoring a ring |
| `bridges.mjs` | Bridge properties, clamping and deletion |
| `bridgemerge.mjs` | Drawing a road onto another island builds the bridge |
| `cityui.mjs` | Demolish, drag-to-draw, snapping, connection display |

## How the editor tests work

`editor.mjs` loads `map-editor.html` into a Node VM behind a DOM and
canvas shim, injects the real `src/world` modules, and dispatches genuine
mouse events. Tests click things the way you would.

This exists because "it parses and it builds" passed twice while the
feature was completely broken — once because a helper function was never
inserted, once because buttons were rendered into an unreachable branch.

**Be suspicious of the harness.** Two shim bugs have already made tests
report the wrong thing:

- `innerHTML = ''` didn't clear children, so rebuilt panels appeared to
  accumulate buttons forever
- one suite overwrote the project's real `mapData.js` and quietly poisoned
  every suite that ran after it

If a result surprises you, check the harness before the product.

## Not in `npm test`

`linkcheck.mjs` needs a built site and a running server, because it checks
that every asset the published page requests actually returns 200 — the
class of failure that only shows up once deployed:

```bash
npm run build
mkdir -p /tmp/serve/personal-webpage && cp -r dist/* /tmp/serve/personal-webpage/
(cd /tmp/serve && python3 -m http.server 8899 &)
node tests/linkcheck.mjs
```
