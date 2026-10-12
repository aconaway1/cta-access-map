// GET /api/metra-alerts
// Fetches Metra's GTFS-realtime service alerts (protobuf) with the METRA_API_TOKEN Worker secret and returns
// them as JSON. Metra's license requires serving the data through our own host, which this does; alert text is
// passed through unmodified. The token is sent in a header (not the URL) and never logged or echoed.
const SOURCE = 'https://gtfspublic.metrarr.com/gtfs/public/alerts';

// GTFS-realtime Alert.Effect / Alert.Cause enum names.
const EFFECT = ['', 'NO_SERVICE', 'REDUCED_SERVICE', 'SIGNIFICANT_DELAYS', 'DETOUR', 'ADDITIONAL_SERVICE', 'MODIFIED_SERVICE',
  'OTHER_EFFECT', 'UNKNOWN_EFFECT', 'STOP_MOVED', 'NO_EFFECT', 'ACCESSIBILITY_ISSUE'];
const CAUSE = ['', 'UNKNOWN_CAUSE', 'OTHER_CAUSE', 'TECHNICAL_PROBLEM', 'STRIKE', 'DEMONSTRATION', 'ACCIDENT', 'HOLIDAY',
  'WEATHER', 'MAINTENANCE', 'CONSTRUCTION', 'POLICE_ACTIVITY', 'MEDICAL_EMERGENCY'];

// Metra's Azure Application Gateway (WAF) intermittently answers 403 to requests from some Cloudflare egress
// addresses, in runs of ~30 s, regardless of the (valid) key; a bad key gets 401 instead (seen Oct 12, 2026). So:
// retry once, then serve the last good response from this isolate if it's under 15 minutes old. Its `updated` is
// Metra's own feed time, so the page's "as of" stays truthful.
const STALE_OK_MS = 15 * 60 * 1000;
let lastGood = null;   // {body, at}; per isolate, best effort

export async function metraAlerts(env) {
  if (!env.METRA_API_TOKEN) return json({ error: 'Metra alerts are not configured', alerts: [] }, 60, 503);
  try {
    let r = await fetchFeed(env);
    if (r.status === 403) {
      await new Promise(res => setTimeout(res, 1500));
      r = await fetchFeed(env);
    }
    if (!r.ok) throw new Error(`Metra returned ${r.status}`);
    const body = parseFeed(new Uint8Array(await r.arrayBuffer()));
    lastGood = { body, at: Date.now() };
    return json(body, 60);
  } catch (e) {
    if (lastGood && Date.now() - lastGood.at < STALE_OK_MS) return json({ ...lastGood.body, cached: true }, 30);
    // Only our own message: never forward Metra's response body or anything containing the request.
    return json({ error: String(e.message || e), alerts: [] }, 30, 502);
  }
}

// Trimmed: a key pasted into the dashboard can carry whitespace. Sent as a header, never in the URL.
function fetchFeed(env) {
  return fetch(SOURCE, { headers: {
    authorization: `Bearer ${env.METRA_API_TOKEN.trim()}`,
    'user-agent': 'cta-access-map (+https://github.com/aconaway1/cta-access-map)',
  } });
}

function parseFeed(buf) {
  const feed = decode(buf);
  const header = one(feed, 1, decode);
  const ts = header && one(header, 3);
  const alerts = all(feed, 2).map(decode).filter(e => e[5]).map(e => {
    const a = decode(e[5][0]);
    return {
      id: str(one(e, 1)),
      header: text(one(a, 10)),
      description: text(one(a, 11)),
      url: text(one(a, 8)),
      effect: EFFECT[one(a, 7) ?? 0] || String(one(a, 7) ?? ''),
      cause: CAUSE[one(a, 6) ?? 0] || String(one(a, 6) ?? ''),
      periods: all(a, 1).map(decode).map(p => ({ start: time(one(p, 1)), end: time(one(p, 2)) })),
      stops: uniq(all(a, 5).map(decode).map(s => str(one(s, 5))).filter(Boolean)),
      routes: uniq(all(a, 5).map(decode).map(s => str(one(s, 2))).filter(Boolean)),
    };
  });
  return { updated: ts ? time(ts) : new Date().toISOString(), alerts };
}

// Minimal protobuf reader: returns {fieldNumber: [values]}, with varints as numbers and length-delimited fields
// as Uint8Array (decode again for nested messages, or str() for strings). Enough for GTFS-realtime alerts.
function decode(buf) {
  const out = {};
  let i = 0;
  const varint = () => {
    let v = 0, mul = 1, b;
    do { b = buf[i++]; v += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
    return v;
  };
  while (i < buf.length) {
    const key = varint(), field = Math.floor(key / 8), type = key & 7;
    let val;
    if (type === 0) val = varint();
    else if (type === 2) { const n = varint(); val = buf.subarray(i, i + n); i += n; }
    else if (type === 1) { i += 8; continue; }
    else if (type === 5) { i += 4; continue; }
    else throw new Error(`Unsupported protobuf wire type ${type}`);
    (out[field] ||= []).push(val);
  }
  return out;
}
const all = (m, f) => m[f] || [];
const one = (m, f, fn) => (m[f] ? (fn ? fn(m[f][0]) : m[f][0]) : undefined);
const str = b => (b instanceof Uint8Array ? new TextDecoder().decode(b) : b);
const uniq = a => [...new Set(a)];
const time = s => new Date(s * 1000).toISOString();
// TranslatedString: prefer English, else the first translation.
function text(b) {
  if (!b) return '';
  const tr = all(decode(b), 1).map(decode).map(t => ({ text: str(one(t, 1)) || '', lang: str(one(t, 2)) || '' }));
  return (tr.find(t => /^en/i.test(t.lang)) || tr[0] || { text: '' }).text;
}

function json(body, maxAge, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
  });
}
