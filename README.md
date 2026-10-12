# Loop L access map

Leaflet map of CTA L stations in the Loop and West Loop showing elevator access, line colors, Loop direction of travel, and live elevator outages.

## Layout

```
public/                  static site (the Pages output directory)
  index.html             page + key panel
  style.css
  app.js                 stations, track geometry, map, alert polling
functions/api/elevators.js   Pages Function proxying CTA accessibility alerts
```

## Deploy (Cloudflare Pages, no build step)

```
npx wrangler pages project create cta-access-map --production-branch main
npx wrangler pages deploy
```

`wrangler.toml` sets the project name, output directory (`public`) and compatibility date. Local dev: `npx wrangler pages dev` (serves on :8788 with the Function).

**Basemap:** Stadia Maps (Alidade Smooth / Smooth Dark). Works on `localhost` with no key; for production, create a free Stadia account and add the `*.pages.dev` hostname under Authentication → domains, or tiles return 401. (CARTO's `light_all`/`dark_all` now return an "API KEY REQUIRED" placeholder, which is why it was replaced.)

Or connect the GitHub repo as a **Pages** project (Workers & Pages → Create → Pages tab → Import an existing Git repository) with build command empty and output directory `public`. Don't use the Workers import: it runs `npx wrangler deploy`, which fails with "Missing entry-point to Worker script or to assets directory". The `functions/` folder is picked up automatically and serves `/api/elevators`.

## Notes

- Live alerts come from CTA's Customer Alerts API (`accessibility=TRUE&activeonly=TRUE`), no key required. Stations are matched by CTA map ID, with name matching as a fallback. Verify the IDs in `public/app.js` against `/api/elevators` output after the first deploy.
- Track offsets are recomputed in screen pixels on every zoom, so parallel Loop lines stay separated at any zoom level.
- Station and track coordinates are approximate.
- Downtown Metra stations are shown for transfers only (positions and lines from Metra static GTFS); no Metra accessibility data or alerts yet.
- Accessibility status is hand-maintained in `STATIONS` (k: `y` elevator, `n` stairs, `c` closed). Update State/Lake when it reopens (expected 2029).
