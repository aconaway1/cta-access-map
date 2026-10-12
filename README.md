# Loop L access map

Leaflet map of CTA L stations in the Loop and West Loop showing elevator access, line colors, Loop direction of travel, and live elevator outages.

## Layout

```
public/                  static site (served by Workers static assets)
  index.html             page + key panel
  style.css
  app.js                 stations, track geometry, map, alert polling
src/worker.js            Worker entry: routes /api/elevators (static files never reach it)
src/elevators.js         proxies and normalizes CTA accessibility alerts
```

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
- Accessibility status is hand-maintained in `STATIONS` (k: `y` elevator, `n` stairs, `c` closed). Update State/Lake when it reopens (expected 2029).
