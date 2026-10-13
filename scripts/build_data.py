#!/usr/bin/env python3
"""Build public/cta-data.js: every CTA 'L' station plus track geometry outside the hand-drawn downtown area.

Sources (both public, no key):
  - City of Chicago L stops dataset (8pix-ypme): station map IDs, names, lines, coordinates.
  - CTA GTFS (google_transit.zip): accessibility (platform wheelchair_boarding), route shapes for track
    geometry, and stop order per trip pattern for the step-free alternatives of stations outside downtown.
    GTFS wins on accessibility: the city dataset lagged CTA renovations (Racine, Austin Green) in Oct 2026.

Downtown (the Loop, West Loop, River North) stays hand-maintained in public/app.js: its stations override
these by map ID, and its tracks are drawn from TRACKS there. This script never touches app.js.

Usage: python3 scripts/build_data.py [--cache DIR]   (standard library only)
"""
import argparse, csv, io, json, math, os, re, sys, urllib.request, zipfile
from datetime import date

GTFS_URL = 'https://www.transitchicago.com/downloads/sch_data/google_transit.zip'
STOPS_URL = 'https://data.cityofchicago.org/resource/8pix-ypme.json?$limit=1000'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'public', 'cta-data.js')

ROUTE_COLOR = {'Red': 'red', 'Blue': 'blue', 'Brn': 'brown', 'G': 'green', 'Org': 'orange', 'Pink': 'pink', 'P': 'purple', 'Y': 'yellow'}
# Dataset line flags, in the order lines are listed in names ("Ashland (Green/Pink)").
FLAGS = [('red', 'red'), ('blue', 'blue'), ('brn', 'brown'), ('g', 'green'), ('o', 'orange'), ('pnk', 'pink'), ('p', 'purple'), ('pexp', 'purple'), ('y', 'yellow')]
LINE_NAME = {'red': 'Red', 'blue': 'Blue', 'brown': 'Brown', 'green': 'Green', 'orange': 'Orange', 'pink': 'Pink', 'purple': 'Purple', 'yellow': 'Yellow'}

# Hand-drawn downtown tracks in app.js end at these edges; GTFS geometry is kept only beyond them.
def keep_point(route, lat, lon):
    return {
        'red':    lat > 41.9005 or lat < 41.8673,
        'blue':   lon < -87.6720 or lat > 41.9000,
        'brown':  lat > 41.9005,
        'purple': lat > 41.9005,
        'yellow': True,
        'green':  lon < -87.6720 or lat < 41.8674,
        'orange': lat < 41.8674,
        'pink':   lon < -87.6720 or (lat < 41.8848 and lon < -87.66),   # branch leaves Lake St. at Paulina
    }[route]

# Subway stretches just beyond downtown, drawn dashed like the downtown subways.
def subway(route, lat, lon):
    return {'red': 41.9005 < lat < 41.9135 or 41.8605 < lat < 41.8673,   # portals north of North/Clybourn, near 15th
            'blue': 41.9000 < lat < 41.9065 and lon > -87.6720}.get(route, False)   # Division (Blue) is underground


def crossing(route, a, b, pred):
    """Point on segment a-b where pred changes value (bisection), so pieces end exactly at the edge."""
    lo, hi, va = 0.0, 1.0, pred(route, *a)
    for _ in range(30):
        mid = (lo + hi) / 2
        p = (a[0] + (b[0] - a[0]) * mid, a[1] + (b[1] - a[1]) * mid)
        if pred(route, *p) == va:
            lo = mid
        else:
            hi = mid
    t = (lo + hi) / 2
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


# Pixel offsets for GTFS pieces, oriented outward from downtown, chosen to meet the hand-drawn offsets at the
# seams (see TRACKS in app.js) and to separate lines that share track (Brown/Purple/Red north of the river).
def offset_for(route, start):
    lat, lon = start
    side = 'north' if lat > 41.89 else 'west' if lon < -87.66 else 'south'
    return {('brown', 'north'): -4, ('purple', 'north'): 14, ('green', 'west'): 4, ('green', 'south'): -12,
            ('orange', 'south'): 9}.get((route, side), 0)

LOOP_CENTER = (41.8812, -87.6298)


def track(route, d, pts, dash):
    t = {'c': route, 'd': d, 'p': [[round(a, 5), round(b, 5)] for a, b in rdp(pts, 0.00006)]}
    if dash:
        t['dash'] = True
    return t


def fetch(url, path):
    if not os.path.exists(path):
        print('downloading', url, file=sys.stderr)
        req = urllib.request.Request(url, headers={'User-Agent': 'step-free-chicago-transit build script'})
        with urllib.request.urlopen(req) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def miles(a, b):
    """Approximate walking distance: along the street grid, or straight line +25% where that's shorter
    (diagonal streets like Milwaukee, Ogden, Archer)."""
    dy, dx = abs(a[0] - b[0]) * 69.05, abs(a[1] - b[1]) * 51.45
    return min(dy + dx, math.hypot(dy, dx) * 1.25)


def compass(a, b):
    ang = math.degrees(math.atan2((b[0] - a[0]) * 69.05, (b[1] - a[1]) * 51.45)) % 360
    return ['east', 'northeast', 'north', 'northwest', 'west', 'southwest', 'south', 'southeast'][int((ang + 22.5) // 45) % 8]


def rdp(pts, eps):
    """Douglas-Peucker simplification in degrees."""
    if len(pts) < 3:
        return pts
    (y1, x1), (y2, x2) = pts[0], pts[-1]
    dx, dy = x2 - x1, y2 - y1
    norm = math.hypot(dx, dy) or 1e-12
    dmax, idx = 0, 0
    for i in range(1, len(pts) - 1):
        y, x = pts[i]
        d = abs(dy * x - dx * y + x2 * y1 - y2 * x1) / norm
        if d > dmax:
            dmax, idx = d, i
    if dmax > eps:
        return rdp(pts[:idx + 1], eps)[:-1] + rdp(pts[idx:], eps)
    return [pts[0], pts[-1]]


def station_names(groups):
    """Display names: the dataset name, plus lines when the name repeats ("Chicago (Red)"), plus the branch when
    that still repeats ("Western (Blue, O'Hare branch)")."""
    by_name = {}
    for mid, g in groups.items():
        by_name.setdefault(g['name'], []).append(mid)
    names = {}
    for base, ids in by_name.items():
        for mid in ids:
            g = groups[mid]
            if len(ids) == 1:
                names[mid] = base
                continue
            label = '/'.join(LINE_NAME[l] for l in g['lines'])
            same = [m for m in ids if groups[m]['lines'] == g['lines']]
            if len(same) > 1:
                br = re.search(r"-\s*([^)]+?)\s+Branch", g['desc'])
                label += f", {br.group(1)} branch" if br else ''
            names[mid] = f"{base} ({label})"
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', default=os.path.join(ROOT, '.cache'))
    args = ap.parse_args()
    os.makedirs(args.cache, exist_ok=True)

    # Stations from the city dataset, grouped by map ID.
    rows = json.load(open(fetch(STOPS_URL, os.path.join(args.cache, 'l_stops.json'))))
    groups = {}
    for r in rows:
        mid = int(r['map_id'])
        g = groups.setdefault(mid, {'name': r['station_name'], 'desc': r['station_descriptive_name'], 'ada': set(), 'lines': [],
                                    'll': (float(r['location']['latitude']), float(r['location']['longitude']))})
        g['ada'].add(r['ada'] in (True, 'true'))
        for flag, line in FLAGS:
            if r.get(flag) in (True, 'true') and line not in g['lines']:
                g['lines'].append(line)
    for g in groups.values():
        g['lines'].sort(key=[l for _, l in FLAGS].index)
    names = station_names(groups)
    # Downtown display names live in app.js; use the same ones when naming alternatives.
    app = open(os.path.join(ROOT, 'public', 'app.js')).read()
    for mid, nm in re.findall(r"\{id:(\d+),name:'((?:[^'\\]|\\.)*)'", app):
        names[int(mid)] = nm.replace("\\'", "'")
    downtown = {int(m) for m in re.findall(r"\{id:(\d+),name:'", app)}
    closed = {int(m) for m in re.findall(r"\{id:(\d+),[^}]*?k:'c'", app)}

    # GTFS: rail trips, one representative trip per shape.
    z = zipfile.ZipFile(fetch(GTFS_URL, os.path.join(args.cache, 'cta_gtfs.zip')))
    rd = lambda n: csv.DictReader(io.TextIOWrapper(z.open(n), encoding='utf-8-sig'))
    parent = {r['stop_id']: int(r['parent_station']) for r in rd('stops.txt') if r['parent_station'].isdigit() and r['stop_id'].startswith('3')}
    gtfs_ada = {}
    for r in rd('stops.txt'):
        if r['stop_id'].startswith('3') and r['parent_station'].isdigit():
            gtfs_ada.setdefault(int(r['parent_station']), set()).add(r['wheelchair_boarding'])
    # Accessibility from GTFS (all of a station's platforms wheelchair_boarding=1), else the dataset flag.
    accessible = lambda m: gtfs_ada[m] == {'1'} if m in gtfs_ada else all(groups[m]['ada'])
    trips, count = {}, {}
    for t in rd('trips.txt'):
        if t['route_id'] in ROUTE_COLOR:
            key = (t['route_id'], t['shape_id'])
            count[key] = count.get(key, 0) + 1
            trips.setdefault(key, t['trip_id'])
    # Shapes run by at least a few trips a day (drops one-off yard moves).
    rep = {tid: key for key, tid in trips.items() if count[key] >= 20}
    seq = {}
    for r in rd('stop_times.txt'):
        if r['trip_id'] in rep and r['stop_id'] in parent:
            seq.setdefault(r['trip_id'], []).append((int(r['stop_sequence']), parent[r['stop_id']]))
    patterns = {}
    for tid, s in seq.items():
        stops = [p for _, p in sorted(s)]
        stops = [p for i, p in enumerate(stops) if i == 0 or p != stops[i - 1]]
        patterns[tid] = (ROUTE_COLOR[rep[tid][0]], stops)

    shapes = {}
    want = {key[1] for key in rep.values()}
    for r in rd('shapes.txt'):
        if r['shape_id'] in want:
            shapes.setdefault(r['shape_id'], []).append((int(r['shape_pt_sequence']), float(r['shape_pt_lat']), float(r['shape_pt_lon'])))

    # Track pieces outside downtown, oriented outward, deduplicated by endpoints.
    pieces = []
    for (route_id, shape_id) in sorted(set(rep.values())):
        route = ROUTE_COLOR[route_id]
        pts = [(la, lo) for _, la, lo in sorted(shapes[shape_id])]
        run, prev = [], None
        for p in pts + [None]:
            if p is not None and keep_point(route, *p):
                if not run and prev is not None:
                    run.append(crossing(route, prev, p, keep_point))
                run.append(p)
                prev = p
                continue
            if run and p is not None:
                run.append(crossing(route, run[-1], p, keep_point))
            if len(run) >= 2:
                if miles(run[-1], LOOP_CENTER) < miles(run[0], LOOP_CENTER):
                    run = run[::-1]
                pieces.append((route, run))
            run, prev = [], p
    lines, seen = [], []
    for route, run in pieces:
        ends = (run[0], run[-1])
        if any(r == route and miles(ends[0], e[0]) < 0.15 and miles(ends[1], e[1]) < 0.15 for r, e in seen):
            continue
        seen.append((route, ends))
        d = offset_for(route, run[0])
        # Split into subway (dashed) and elevated/at-grade runs, sharing the boundary point.
        part, is_sub = [run[0]], subway(route, *run[0])
        for a, b in zip(run, run[1:]):
            if subway(route, *b) != is_sub:
                x = crossing(route, a, b, subway)
                part.append(x)
                lines.append(track(route, d, part, is_sub))
                part, is_sub = [x], not is_sub
            part.append(b)
        lines.append(track(route, d, part, is_sub))

    # Step-free alternatives outside downtown: along each trip pattern, the nearest station with an elevator in
    # each direction of travel. All track outside the Loop is two-way, so "next stop" wording holds there.
    usable = lambda m: m in groups and accessible(m) and m not in closed
    alts = {}
    for line, stops in patterns.values():
        for i, m in enumerate(stops):
            if m in downtown:
                continue
            for j in range(i + 1, len(stops)):
                n = stops[j]
                if n == m:
                    break
                if usable(n):
                    hops = j - i
                    best = alts.setdefault(m, {})
                    if n not in best or hops < best[n]['hops']:
                        best[n] = {'hops': hops, 'lines': {line}}
                    elif hops == best[n]['hops']:
                        best[n]['lines'].add(line)
                    break

    stations = []
    for mid, g in sorted(groups.items()):
        s = {'id': mid, 'name': names[mid], 'll': [round(g['ll'][0], 5), round(g['ll'][1], 5)],
             'k': 'y' if accessible(mid) else 'n', 'lines': g['lines']}
        if mid in alts:
            rows_ = []
            for n, info in alts[mid].items():
                d = miles(g['ll'], groups[n]['ll'])
                where = compass(g['ll'], groups[n]['ll'])
                hop = 'next stop' if info['hops'] == 1 else f"{info['hops']} stops"
                # At multi-line stations, say which line: "next stop west" on Green and on Pink are different stops.
                on = ''
                if len(g['lines']) > 1:
                    ls = [LINE_NAME[l] for l in g['lines'] if l in info['lines']]
                    on = (' and '.join(ls) if len(ls) < 3 else ', '.join(ls[:-1]) + ' and ' + ls[-1]) + \
                        (' Lines, ' if len(ls) > 1 else ' Line, ')
                rows_.append((d, [names[n], f"{d:.1f} mi · {on}{hop} {where}"]))
            # Up to six: one per line and direction at three-line stations like Roosevelt.
            s['alt'] = [r for _, r in sorted(rows_)][:6]
        stations.append(s)

    # Report where the dataset's ADA flag disagrees with GTFS (GTFS is used) so the downtown overrides in app.js
    # and the dataset can be checked.
    for mid, g in sorted(groups.items()):
        ga = gtfs_ada.get(mid, set())
        if ga and (('1' in ga) != all(g['ada'])):
            print(f"note: ADA mismatch {mid} {names[mid]}: dataset {sorted(g['ada'])}, GTFS {sorted(ga)}", file=sys.stderr)

    data = {'generated': date.today().isoformat(), 'stations': stations, 'lines': lines}
    with open(OUT, 'w') as f:
        f.write('// Generated by scripts/build_data.py from the city L stops dataset (8pix-ypme) and CTA GTFS. Do not edit.\n')
        f.write('const CTA_DATA = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f"wrote {OUT}: {len(stations)} stations, {len(lines)} track pieces, {sum(len(l['p']) for l in lines)} points, "
          f"{os.path.getsize(OUT)//1024} KiB", file=sys.stderr)


if __name__ == '__main__':
    main()
