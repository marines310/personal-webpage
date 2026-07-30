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
| `town.mjs` | Street grids, buildings squared to the kerb, junction patches, signal placement, crossings, pavements, walkways |
| `worldsanity.mjs` | `World.js` read statically — it needs a browser, so it can't be run. Methods, list shapes, palette colours, model keys, layout imports, and every constant **and function** it uses |
| `conditions.mjs` | Setting the clock is the exact inverse of reading it, holding suspends only the advancing, a hand-picked change eases in rather than snapping, and every button in the HUD names a weather that exists |
| `lights.mjs` | The traffic light cycle: never two greens, amber only between green and red |
| `traffic.mjs` | Lanes stay on the tarmac and lead somewhere, the light cycle is one piece of arithmetic, and thirty-one vehicles run for five simulated minutes without one collision, one jumped red or one deadlock |
| `zebra.mjs` | Crossing bars run ALONG the road, set side by side across it |
| `ports.mjs` | Piers start on land and end in water, the quay is drivable and in the road network, no shipping lane crosses an island, and the fleet sails 15 simulated minutes without a hull ever standing on land |
| `monorail.mjs` | The loop closes and never crosses itself, platforms stand on land near each island's middle, no pier in a carriageway, nothing under the beam reaches it, and the trains run 400 simulated seconds calling everywhere |
| `windows.mjs` | The windows in the building models, read out of the real `.glb` files and the real texture atlas: every building has 4-8 panes, none on a roof, the walls stay clear of the darkness threshold, and the glass lands on the model at the model's own scale |
| `stations.mjs` | Fire, police and hospital: no corner of a building in a road, a garage door wider than the engine with a run-in square to it, every bay promised to one vehicle, and ten simulated minutes in which they actually come and go from their own bays |

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
| `streetedit.mjs` | Clicking a generated town street takes it over without moving it, then reshaping, removing and restoring |

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

## The trap to watch for

**A test that measures a proxy agrees with code that measures a proxy, and
both are wrong together.**

This shipped once. To stop pavements crossing junctions, the code tested
the quad's *corner* distance against `width/2` — but the corner sits
exactly on `width/2` by construction, so it deleted every pavement in the
world. The test measured the *centre line*, which is comfortably clear, so
it passed. Every kerb vanished with 396 checks green.

Where a test replicates renderer logic, replicate it **step for step** and
say so. `town.mjs` sections 9c and 9d2 do exactly this.

**And check the test is asking the right question.** Crossings were sitting
skewed while every test confirmed they were "square to the road" — which a
bar parallel to the road also is. `zebra.mjs` now asks which way the bar's
*length* points and which way successive bars *step*.

**Then I made it worse, which is the sharper lesson.** Having fixed the
skew, I decided the bars were oriented wrongly and rebuilt them to span the
carriageway and step along it — reasoning that a driver crosses one after
another. Zebra bars are paint; real ones run ALONG the direction of travel,
side by side across the width. I broke correct geometry from a mental model
and wrote a test asserting the wrong property, which would have kept it
broken. It took a photograph of a real crossing to settle it.

If a visual property is being changed on intuition rather than a
measurement or a reference, stop and ask.

## The other trap: the test that is stricter than the thing

Traffic made this one obvious. Three questions were asked about collisions
before the right one:

1. **"Are two vehicles closer than a car length?"** No - two cars passing in
   opposite lanes are half a road width apart *by design*. Every one of them
   registered as a crash. The right question is whether their rectangles
   overlap, and `boxesOverlap()` is exported from the layout so the test uses
   the same function the simulation uses to prevent it.
2. **"Did a car touch the stop line on red?"** Cars settle onto a line
   asymptotically - sqrt(2ad) is still two units a second a hundredth of a
   unit out - so 198 "violations" were one car rolling to a halt.
3. **"Was the light red when it got into the junction?"** That counts cars
   that entered on green and were still crossing when it changed.

What it asks now: was the light red, and had it been red for a moment
already, when the vehicle crossed the line and carried two units into the
junction under power. Each of those rewrites was prompted by a failure that
turned out to be the test's fault, and each time the real behaviour was fine.

A test that cries wolf gets weakened, and a weakened test catches nothing.
Sharpen the question instead.

## Measure the asset, not your idea of it

`windows.mjs` reads the actual `.glb` files and the actual PNG atlas, through
the little readers beside it. That is deliberate, and it is the second time
this project has paid for skipping it - the first was the car, which looked
wrong through three rounds of uniform scaling because nobody read its bounding
box.

The window glass was hung on the models' bounding boxes, in world units,
inside a group that had already been scaled up. It floated over the rooftops
at ten times the size of a window. Five minutes with the file would have shown
that each building already has 4 to 8 window quads, all pointing at one dark
swatch of the shared atlas.

The readers are worth keeping for the next asset question: `glbread.mjs` gets
at positions, UVs and indices, and `pngread.mjs` decodes an 8-bit PNG with
Node's zlib.

## Count the events, not the state

The stations were the clearest case yet of a feature that is invisible to a
snapshot. Everything static was right on the first run - buildings clear of
the roads, doors wide enough, bays square, every vehicle assigned a bay - and
the thing Mike asked for was not happening at all:

- service vehicles reached their own door **twice in ten minutes** out of
  twenty-two, because they only went home if their wandering happened to take
  them past it;
- the ones that did get there were teleported away by the patience valve while
  queueing at the red before it;
- and once both were fixed, the car parks still read as empty, because the
  dwell was 18 seconds against a 90-second shift.

None of those is a wrong number you can look up. Each was found by running ten
minutes and counting: how many turned in, how many drove past, how long from
the end of a shift to the bay, how many were parked at a given moment. **If
the feature is "things come and go", the test has to count comings and
goings** - the same lesson as the trains that stopped 89 times without ever
leaving their first station.

A related one from the same work: **"never" is sometimes the wrong bar.**
Everything in the traffic decides from the same start-of-step picture, so two
vehicles can move into one gap and be pulled apart on the next step. Asserting
zero overlapping frames over ten minutes fails on a single frame nobody could
see. What matters is that no pair stays stuck together, so `stations.mjs`
measures the longest *run* of overlapping samples as well as the count.

## And the third trap: scaling the wrong axis

The car you drive looked bigger than the traffic through three rounds of
"scale it down", because the problem was never its length. `fitLength` in the
model manifest scales uniformly off the longest horizontal dimension, so
whatever proportions the source has, it keeps — and `car.glb` is 1.3 wide by
2.0 long, a ratio of 0.65 where a real car is nearer 0.42. Fitted to 3.96
long it came out 2.57 wide: wider than the fire engine.

Every number in the code said the car was *smaller* than the traffic. The
number nobody had looked at was the model's own bounding box, which is
readable straight out of the .glb's POSITION accessors in about thirty lines —
`traffic.mjs` section 7 does it on every run.

**When a report is about size, measure the asset before touching a scale
factor.** Uniform scaling can't fix a proportion problem, and three rounds of
it just moved the error around.

## And the near miss: a guard that covered half the case

`worldsanity.mjs` section 6 checks that every SHOUTY constant `World.js` uses
is imported or declared. It was written after exactly that mistake and it
works. Then `getPortYard(port)` was called without being imported, the world
failed to load with "getPortYard is not defined", and section 6 said nothing —
because the name is camelCase, and the check only looked at capitals.

Section 7 is its twin, for plain function calls, and it catches that case.
The lesson: when a guard is written for a specific slip, ask what the *class*
of slip is. "A name used but never imported" is the class; "a CONSTANT used
but never imported" was half of it.

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
