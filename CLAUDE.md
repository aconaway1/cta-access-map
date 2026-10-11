# CLAUDE.md — Loop L access map

Context handoff from a claude.ai chat (2026-10-11). Read this before touching the code.

## What this is

A Cloudflare Pages web app: a Leaflet map of CTA 'L' stations in the Loop and West Loop showing
elevator access, line colors, Loop direction of travel, and live elevator outages. Deployed like the
owner's other Pages projects (ronconrails.com, the CML Springfield schedule map): static site +
Pages Functions, `*.pages.dev` subdomain, no custom domain, no build step.

Owner: Aaron (network engineer). Prefers direct, technically precise communication.

## Files

- `index.html` — page shell, collapsible key panel (auto-collapsed under 600px width)
- `style.css` — light/dark via `prefers-color-scheme`
- `app.js` — `STATIONS` data, `TRACKS` geometry, map setup, pixel-offset track rendering, alert polling (5 min)
- `functions/api/elevators.js` — `GET /api/elevators`; proxies CTA Customer Alerts API
  (`accessibility=TRUE&activeonly=TRUE`, JSON), normalizes to `{updated, alerts:[{id,headline,short,stations:[{id,name}]}]}`, 120s cache
- `README.md` — deploy commands (`wrangler pages deploy . --project-name cta-access-map`)

CDNs: Leaflet 1.9.4 (cdnjs), leaflet-polylinedecorator 1.6.0 (unpkg), Tabler icons webfont (jsdelivr).
Basemap: Stadia Maps alidade_smooth / alidade_smooth_dark (CARTO now requires an API key). Production
needs the pages.dev domain registered in the Stadia dashboard. `wrangler.toml` holds name, output dir, compat date.

## Status (2026-10-11): runs locally, not yet deployed

Tested with `npx wrangler pages dev` + headless Chromium (Playwright's cached build; the Chrome extension
wasn't connected). No console errors or failed requests, light and dark.

- `/api/elevators` verified against the live feed: shape matches (`CTAAlerts.Alert[]` →
  `ImpactedService.Service[]`, `ServiceType` is `T`/`R`/`B`, `T` ServiceId = station map ID as a string).
- All 20 station map IDs verified against the city L stops dataset (`8pix-ypme`); its `ada` flag agrees
  with every `k`. Feed/dataset name for Quincy is "Quincy/Wells" (match fixed).
- Labels: no marker/label overlaps at zoom 16–17.
- Fixed after first run: basemap (CARTO → Stadia), zoom control moved top-right (panel covered it),
  Red Line straightened onto State, initial view via fitBounds (Loop-only on phones).

Known, not fixed:
- Brown and Purple have poor contrast on the dark basemap (consider a light casing in dark mode).
- West of the Loop, Pink (d:4, south of Lake) sits ~14px from Green (north) though they share track;
  the offsets are tuned for the Loop where Brown sits between them.
- Static files are served from the repo root, so README/CLAUDE.md/wrangler.toml get deployed too.
  Move the site into `public/` before the systemwide work.

Long-term goal: systemwide CTA rail accessibility map (trains only, no buses).

## Accessibility data (as of Oct 2026, researched in chat)

Elevator (`k:'y'`): Clark/Lake (elevated + Blue subway), Washington/Wabash, Harold Washington Library,
Quincy, Washington/Wells, Lake (Red), Jackson (Red), Jackson (Blue), Clinton (Green/Pink), Morgan,
Ashland (Green/Pink), UIC-Halsted.

Stairs only (`k:'n'`): LaSalle/Van Buren, Adams/Wabash, Monroe (Red), Washington (Blue), Monroe (Blue),
LaSalle (Blue), Clinton (Blue).

Closed (`k:'c'`): State/Lake elevated — closed Jan 5, 2026 for full reconstruction, reopening expected
2029 with elevators and an ADA connection to the Lake Red Line station. CTA directs Lake (Red) ↔ elevated
transfers to Washington/Wabash. Lake Red Line subway stays open.

Sources: CTA State/Lake announcement, ABC7 (July 2026 update), Duckworth/Tribune (2021 inaccessible list),
ABC7 I-Team (Clinton Blue), wheelchairtravel.org. Some per-station status came from secondary sources —
spot-check on transitchicago.com station pages.

## Track geometry and direction (verified)

- Loop rectangle: Lake (N), Wabash (E), Van Buren (S), Wells (W). Corners `NW/NE/SE/SW` in `app.js`.
- Brown: counterclockwise, Outer Loop. Enters/exits at Tower 18 (NW) via Wells.
- Orange, Pink, Purple Express: clockwise, Inner Loop. Orange enters at Tower 12 (SE) from Roosevelt;
  Pink enters at Tower 18 from the west on Lake; Purple at Tower 18 from the north.
- Green: through-routed on Lake and Wabash, both directions (drawn as two offset lines with opposite arrows).
- Red: subway under State (dashed). Blue: subway under Dearborn, west along Congress; at-grade in the
  Eisenhower median west of the river (solid).
- `d` in `TRACKS` is a pixel offset to the right of travel direction; `offsetPath()` recomputes miter
  offsets in layer-pixel space on every `zoomend`, and arrow decorators are rebuilt with it.
  Closed paths (first point == last) are handled for the rectangle.
- Coordinates are approximate (hand-placed), good enough for a schematic, not survey-grade.

## Ideas not yet done

- Load station IDs/coords from the city's open data instead of hand-maintaining them.
- Show escalator outages too, or alerts for stations just outside the area (Merchandise Mart, Roosevelt).
- Stale-data indicator if `/api/elevators` hasn't succeeded recently.
