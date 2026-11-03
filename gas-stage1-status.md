# Gas, stage 1: built, green on its own, two regressions open

30 October 2026. Everything in `claude/gas-design.md` stage 1 is written and
working. It is **not ready to ship** — two pre-existing suites regress, and
the cause is understood but not fixed.

## What exists

Patch: `gas-stage1.patch` in the repo root (1,902 lines, 8 files). Apply with
`git apply` from the repo root. It is a clean diff against `2d94853`, the
merge commit. It is untracked, which is why it is not on GitHub.

- **`src/world/gasGame.js`** — pure, no THREE. Per-kind tank table (sedan 540s
  down to monster 270s at full throttle), burn proportional to effort rather
  than wall-clock, `LOW_FUEL` at a quarter, `TOP_UP` at 0.995, `FILL_SECONDS`
  9, nearest-bay choice, and the fill phases. The monorail is excluded by
  being absent from the table, not by an `if`.
- **`islandLayout.js`** — `getFuelStations()`, `getFuelBays()`, `fuelApron()`,
  `fuelApronClearance()`, `FUEL_STATION`. Sited with `findStationSite`, which
  gained an optional `spacing` and an `accept` predicate.
- **`World.js`** — `createFuelStations()`, `buildFuelStation()`,
  `paintBayOutline()`, `updateGas()`, `fuelGauge()`, `onCarriageway()`, and a
  `drop` badge for the sign.
- **`index.html` / `styles.css` / `UI.js`** — the gauge, green/amber/red.
- **`tests/gas.mjs`** — 79 checks, all green, registered in `run-all.mjs`.

## Mike's three notes from the screenshots, all addressed

1. **White block in the road.** It was the forecourt and the canopy. Two
   separate mistakes: the canopy was sized `bayWidth * bayCount + 2` = 28 on a
   16-unit plot, and `fuelApron` derived its depth from `STATION_SETBACK` on
   the assumption that the setback is wall-to-kerb. **It is not** —
   `findStationSite` measures it from the LANE's centre line, and the real
   clearance from a sited station to the nearest carriageway is about 12, not
   17.6. The apron now *measures* the room with `distanceToNearestRoad` and
   fits itself to it. Worst forecourt corner is now +0.23 from any
   carriageway, from -6.43 before.
2. **Entrances hidden behind props.** `blocksStationEntrance()` already
   existed and the streetlights already asked it; the street dressing never
   did, and gas stations were not in the list. There is now one
   `this.accessStations` list that benches, bins, planters, trees, lamps and
   bus stops all consult.
3. **Bus facing the wrong way.** `bayPositions()` points a bay at the
   building, which suits a garage door and not a pump. Fuel bays are turned a
   quarter turn in `makeFuelStation()` and stack in DEPTH rather than across
   the frontage — side by side needed 26 units on a 16-unit plot, which is
   what made the canopy overhang in the first place.

Also, per "no trees, traffic lights, lamps or other objects in the middle of
the road": `onCarriageway()` is asked inside `addBench`, `addBin`,
`addPlanter` and `addStreetTree` rather than at their call sites, so the next
placer cannot forget it.

## The two open regressions

```
--- incident.mjs ---  FAIL  a clear road barely needs the rescue valve  9 of 71
--- traffic.mjs  ---  FAIL  no vehicle is moved across the map (worst 560)
```

**Ruled out:** the gas stations are not physically blocking anything. Nearest
lane to each kiosk is 16.5-18.7 against a 9.2 building half-diagonal, and the
canopy columns are further in again.

**The two plausible causes, both in `islandLayout.js`:**

1. Fuel stations were added to the terrain pads in `getIslandTerrain()`, so
   the height field now has four more terraces in it. Road gradients change,
   and `traffic.mjs` and `incident.mjs` both care about vehicles getting
   stuck on slopes.
2. Fuel stations were added to the bus-stop exclusion in `getBusStops()`, so
   stops moved. Traffic queues behind stops.

**How to tell which:** revert one at a time and run `traffic.mjs` alone
(about four minutes). If it is the pads, the fix is probably to give a fuel
station a flatter, smaller terrace than a hospital's. If it is the bus stops,
check whether a stop has been pushed somewhere that narrows a lane.

Do not ship until both are green. Everything else is done and measured.

## Still to come

Stage 2 (the attendant, the hose, filling over time) and stage 3 (the tow when
dry) are untouched. `World.js` already records `this.fuelPumps` in world
coordinates — where the attendant stands and where the hose starts — because
stage 2 needs it and a figure is not in the station's group.
