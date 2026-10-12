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

export async function metraAlerts(env) {
  if (!env.METRA_API_TOKEN) return json({ error: 'Metra alerts are not configured', alerts: [] }, 60, 503);
  try {
    const token = env.METRA_API_TOKEN.trim();
    const r = await fetch(SOURCE, { headers: {
      authorization: `Bearer ${token}`,
      'user-agent': 'cta-access-map (+https://github.com/aconaway1/cta-access-map)',
    } });
    if (!r.ok) {
      // TEMPORARY diagnostic for the first Metra connection: what answered and what it said, with the token
      // redacted. Remove once working.
      const body = (await r.text()).split(token).join('[redacted]').slice(0, 300);
      return json({ error: `Metra returned ${r.status}`, diag: { server: r.headers.get('server'), type: r.headers.get('content-type'), body } , alerts: [] }, 0, 502);
    }
    const feed = decode(new Uint8Array(await r.arrayBuffer()));
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
    return json({ updated: ts ? time(ts) : new Date().toISOString(), alerts }, 60);
  } catch (e) {
    // Only our own message: never forward Metra's response body or anything containing the request.
    return json({ error: String(e.message || e), alerts: [] }, 30, 502);
  }
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
