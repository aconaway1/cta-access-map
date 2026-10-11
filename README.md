# Loop L access map

Leaflet map of CTA L stations in the Loop and West Loop showing elevator access, line colors, Loop direction of travel, and live elevator outages.

## Layout

```
index.html               page + key panel
style.css
app.js                   stations, track geometry, map, alert polling
functions/api/elevators.js   Pages Function proxying CTA accessibility alerts
```

## Deploy (Cloudflare Pages, no build step)

```
npx wrangler pages project create cta-access-map --production-branch main
npx wrangler pages deploy . --project-name cta-access-map
```

Or connect a GitHub repo in the Pages dashboard with build command empty and output directory `/`. The `functions/` folder is picked up automatically and serves `/api/elevators`.

## Notes

- Live alerts come from CTA's Customer Alerts API (`accessibility=TRUE&activeonly=TRUE`), no key required. Stations are matched by CTA map ID, with name matching as a fallback. Verify the IDs in `app.js` against `/api/elevators` output after the first deploy.
- Track offsets are recomputed in screen pixels on every zoom, so parallel Loop lines stay separated at any zoom level.
- Station and track coordinates are approximate.
- Accessibility status is hand-maintained in `STATIONS` (k: `y` elevator, `n` stairs, `c` closed). Update State/Lake when it reopens (expected 2029).
