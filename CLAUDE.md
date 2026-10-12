# CLAUDE.md — Loop L access map

Context handoff from a claude.ai chat (2026-10-11). Read this before touching the code.

## What this is

A Cloudflare Worker with static assets: a Leaflet map of CTA 'L' stations in the Loop and West Loop showing
elevator access, line colors, Loop direction of travel, and live elevator outages. Static site +
a small Worker for the API, `*.workers.dev` subdomain, no custom domain, no build step. The owner's older
projects (ronconrails.com, the CML Springfield schedule map) are on Pages, but Cloudflare now treats Pages as
legacy ("applications" are Workers), so this one is a Worker; don't suggest Pages.

Owner: Aaron (network engineer). Prefers direct, technically precise communication.

## Files

- `public/` — the static site (`[assets] directory`; the assets layer serves these before the Worker runs):
- `public/index.html` — page shell, collapsible key panel (auto-collapsed under 600px width)
- `public/style.css` — light/dark via `prefers-color-scheme`
- `public/app.js` — `STATIONS` data, `METRA` downtown stations, `TRACKS` geometry, map setup, pixel-offset track rendering, alert polling (5 min), locate-me control (watchPosition; position stays client-side)
- `src/worker.js` — Worker entry; routes `GET`/`HEAD /api/elevators`, 405 for other methods, 404 for anything else
- `src/elevators.js` — `GET /api/elevators`; proxies CTA Customer Alerts API
  (`accessibility=TRUE&activeonly=TRUE`, JSON), normalizes to `{updated, alerts:[{id,headline,short,stations:[{id,name}]}]}`, 120s cache
- `README.md` — deploy and dev commands (`npx wrangler deploy`, `npx wrangler dev`)

CDNs: Leaflet 1.9.4 (cdnjs), leaflet-polylinedecorator 1.6.0 (unpkg), Tabler icons webfont (jsdelivr).
Basemap: Stadia Maps alidade_smooth / alidade_smooth_dark (CARTO now requires an API key). Production
needs the workers.dev hostname registered in the Stadia dashboard. `wrangler.toml` holds name, output dir, compat date.

## Status (2026-10-11): deployed, map and live alerts working in production

GitHub: https://github.com/aconaway1/cta-access-map (public). Connected to a Cloudflare Worker via
Workers Builds; live at https://cta-access-map.jaconaway1.workers.dev (domain registered with Stadia; tiles 401 on any other hostname).
The first build failed ("Missing entry-point") because the repo was still Pages-shaped;
converted to Workers static assets on 2026-10-11.

Tested with `npx wrangler dev` (Pages-era runs used `wrangler pages dev`) + headless Chromium (Playwright's cached build; the Chrome extension
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

## Metra (added 2026-10-11, no accessibility data yet)

The six downtown Metra stations are shown as gray square markers for transfers: OTC, Union Station, LaSalle
Street, Millennium, Van Buren Street, Museum Campus/11th St. No tracks, no accessibility status, no alerts.
`ll`/`lines`/colors come from Metra static GTFS (published 2026-10-03), except LaSalle Street, which was moved
south onto the platforms because its GTFS point sits on the CTA LaSalle stations. The opening view still fits
CTA stations only (fitting the Metra Electric stations as well drops a 1400px desktop from zoom 15 to 14).

Researched for the accessibility follow-up:
- Static GTFS is public, no key: `https://schedules.metrarail.com/gtfs/schedule.zip` (check `published.txt`).
  `stops.txt` has `wheelchair_boarding` (196 × `1`, 45 × `0` = unknown, none `2`). It disagrees with Metra's
  elevator list (79th/Chatham, 87th/Woodruff, 103rd/Rosemoor, Grand/Cicero are `0` but have elevators;
  Millennium is `1` while its only elevator is closed until winter 2026–27), so overrides are needed.
- Realtime: `https://gtfspublic.metrarr.com/gtfs/public/alerts` (protobuf, 30s refresh), free key via
  metra.com/developers, Bearer header or `api_token` param. Not yet requested. Unknown whether elevator
  outages appear in it; there's no accessibility filter like CTA's.
- License: serve data through our own host (the Function does), show last-updated time, state the app isn't
  affiliated with Metra (footer note in the panel), no Metra trademarks.
- Metra step-free access is mostly level/ramped platforms plus the accessible car's bridge plate, not elevators
  (~30 elevator sites), so "accessible" needs its own key entries.
- GTFS change notice (Oct 2026): trip/service/shape ID formats changing; stop_id not mentioned.

## Ideas not yet done

- Load station IDs/coords from the city's open data instead of hand-maintaining them.
- Show escalator outages too, or alerts for stations just outside the area (Merchandise Mart, Roosevelt).
- Stale-data indicator if `/api/elevators` hasn't succeeded recently.
