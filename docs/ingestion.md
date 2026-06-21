# Mapping new waypoints (ingestion)

Grow the route graph from your phone while walking the corridors.

## On Termux
1. `pkg install python` (and optionally `termux-api` + the Termux:API app for GPS).
2. `python ingestion/server.py` (defaults to port 8788).
3. Open `http://localhost:8788/ingestion/` in Chrome.
4. For each waypoint: name it, pick building/level/type, tap its spot on the map,
   pick the connecting corridor(s), time the walk with the stopwatch, Save.
   Records append to `ingestion/staging/session-YYYYMMDD.json` (gitignored).

## Back at the desk
1. Review: `node tools/merge-staging.js` (dry-run — prints what would be added +
   any validation problems).
2. Apply: `node tools/merge-staging.js --apply` (writes `data/nodes.json` +
   `data/edges.json`, archives the staging file to `ingestion/staging/merged/`).
3. `npm run validate`, then commit the data change.

## Coordinates
Place nodes roughly to scale on a shared grid; the same spot keeps the same x/y on
every floor (so floors line up). Use the stopwatch / step count as a sense of
proportion. See `data/meta.json` to refine toward true scale later.
