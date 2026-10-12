# CTA L access map

Leaflet map of every CTA L station showing elevator access, line colors, Loop direction of travel, live elevator outages and step-free alternatives.

## Layout

```
public/                  static site (served by Workers static assets)
  index.html             page + key panel
  style.css
  app.js                 downtown stations and tracks (hand-maintained), map, alert polling
  cta-data.js            generated: all stations + track geometry beyond downtown
scripts/build_data.py    regenerates public/cta-data.js from the city L stops dataset and CTA GTFS
src/worker.js            Worker entry: routes /api/elevators (static files never reach it)
src/elevators.js         proxies and normalizes CTA accessibility alerts
```

## Station data

`python3 scripts/build_data.py` (Python 3, standard library only) downloads the city's L stops dataset and CTA's
GTFS into `.cache/` and rewrites `public/cta-data.js`. Run it when CTA opens, closes or renovates stations, check
the "ADA mismatch" notes it prints, and commit the result. Accessibility comes from GTFS; downtown stations in
`public/app.js` override the generated entries.

## Deploy (Cloudflare Workers with static assets, no build step)

The repo is connected to a Cloudflare Worker (Workers Builds): pushes to `main` run `npx wrangler deploy`.
Manual deploy: `npx wrangler deploy`. Local dev: `npx wrangler dev` (serves on :8787 with the API).

`wrangler.toml` sets the Worker name, entry point, assets directory (`public`) and compatibility date. The
Worker name in the Cloudflare dashboard must match `name` there.

**Basemap:** Stadia Maps (Alidade Smooth / Smooth Dark). Works on `localhost` with no key; for production, create a free Stadia account and add the `cta-access-map.jaconaway1.workers.dev` hostname under Authentication → domains, or tiles return 401. (CARTO's `light_all`/`dark_all` now return an "API KEY REQUIRED" placeholder, which is why it was replaced.)


## Notes

- Live alerts come from CTA's Customer Alerts API (`accessibility=TRUE&activeonly=TRUE`), no key required. Stations are matched by CTA map ID, with name matching as a fallback. Verify the IDs in `public/app.js` against `/api/elevators` output after the first deploy.
- Track offsets are recomputed in screen pixels on every zoom, so parallel Loop lines stay separated at any zoom level.
- Station and track coordinates are approximate.
- Downtown Metra stations are shown for transfers only (positions and lines from Metra static GTFS); no Metra accessibility data or alerts yet.
- Accessibility status (k: `y` elevator, `n` stairs, `c` closed) is generated from CTA GTFS, with downtown overrides in `DOWNTOWN` in `public/app.js`. Update State/Lake there when it reopens (expected 2029).
