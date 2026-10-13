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

// Metra's Azure Application Gateway (WAF) intermittently answers 403 to requests from Cloudflare egress (roughly
// half of them on Oct 12, 2026, in runs of ~30 s), regardless of the valid key; a bad key gets 401 instead. So the
// feed is fetched on a schedule, not per page view: a Cron Trigger every 5 minutes calls refreshMetra(), which tries
// up to 4 times 45 s apart and stores the last good copy in KV (binding CACHE). /api/metra-alerts serves that copy.
// The copy keeps Metra's own feed time (`updated`), so the page's "as of" stays truthful. Writes happen only on
// success: at most 288/day, inside the free plan's 1,000.
const KV_KEY = 'metra-alerts';
const RUNS_KEY = 'metra-runs';   // last 24 refresh attempts (scheduled and page-visit), for /status
const RUNS_KEPT = 24;
const ATTEMPTS = 4, RETRY_MS = 45 * 1000;

// Page visits also help: if the saved copy is over 5 minutes old, the Worker answers with it right away and then
// makes ONE background attempt from the visitor's data center (scheduled runs may come from addresses Metra's WAF
// blocks more often). At most one try per isolate every 2 minutes, so bursts of visitors don't pile onto Metra.
const VISIT_REFRESH_AFTER_MS = 5 * 60 * 1000, VISIT_TRY_EVERY_MS = 2 * 60 * 1000;
let lastVisitTry = 0;   // per isolate

export async function metraAlerts(env, ctx) {
  if (!env.METRA_API_TOKEN) return json({ error: 'Metra alerts are not configured', alerts: [] }, 60, 503);
  const stored = env.CACHE && await env.CACHE.get(KV_KEY, 'json');
  if (stored) {
    const age = Date.now() - Date.parse(stored.fetched || stored.updated);
    if (ctx && age > VISIT_REFRESH_AFTER_MS && Date.now() - lastVisitTry > VISIT_TRY_EVERY_MS) {
      lastVisitTry = Date.now();
      ctx.waitUntil(visitRefresh(env));   // one attempt, well inside waitUntil's ~30 s
    }
    return json(stored, 60);
  }
  // Nothing stored yet (first deploy, or no KV binding): one live attempt, and seed KV if it works.
  try {
    const body = await fetchOnce(env);
    if (env.CACHE) await env.CACHE.put(KV_KEY, JSON.stringify(body));
    return json(body, 60);
  } catch (e) {
    // Only our own message: never forward Metra's response body or anything containing the request.
    return json({ error: String(e.message || e), alerts: [] }, 30, 502);
  }
}

async function visitRefresh(env) {
  const started = new Date().toISOString();
  try {
    await env.CACHE.put(KV_KEY, JSON.stringify(await fetchOnce(env)));
    await recordRun(env, { at: started, source: 'visit', ok: true, attempts: 1, summary: 'stored', errors: [] });
  } catch (e) {
    await recordRun(env, { at: started, source: 'visit', ok: false, attempts: 1, summary: 'kept previous copy', errors: [String(e.message || e)] });
  }
}

async function recordRun(env, run) {
  try {
    const runs = (await env.CACHE.get(RUNS_KEY, 'json')) || [];
    runs.unshift(run);
    await env.CACHE.put(RUNS_KEY, JSON.stringify(runs.slice(0, RUNS_KEPT)));
  } catch (e) { /* history is best effort */ }
}

// Cron Trigger handler body. Returns a short outcome string, and records it in the run history for /status
// (one more KV write per run: with the data writes, at most 576/day, under the free plan's 1,000).
export async function refreshMetra(env, { attempts = ATTEMPTS, retryMs = RETRY_MS } = {}) {
  if (!env.METRA_API_TOKEN || !env.CACHE) return 'skipped: not configured';
  const started = new Date().toISOString();
  const errors = [];
  let outcome = null;
  for (let n = 1; n <= attempts && !outcome; n++) {
    try {
      const body = await fetchOnce(env);
      await env.CACHE.put(KV_KEY, JSON.stringify(body));
      outcome = { ok: true, attempts: n, summary: `stored on attempt ${n}` };
    } catch (e) {
      errors.push(String(e.message || e));
      if (n < attempts) await new Promise(res => setTimeout(res, retryMs));
    }
  }
  outcome ||= { ok: false, attempts, summary: `kept previous copy: ${errors.at(-1)} after ${attempts} attempts` };
  await recordRun(env, { at: started, source: 'cron', ...outcome, errors });
  return outcome.summary;
}

// For /api/status: the stored copy's times and counts, and the run history. Never includes the token.
export async function metraStatus(env) {
  const copy = env.CACHE ? await env.CACHE.get(KV_KEY, 'json') : null;
  const runs = env.CACHE ? (await env.CACHE.get(RUNS_KEY, 'json')) || [] : [];
  return {
    keySet: Boolean(env.METRA_API_TOKEN),
    kvBound: Boolean(env.CACHE),
    copy: copy && { updated: copy.updated, fetched: copy.fetched || null, alerts: copy.alerts.length,
      accessibility: copy.alerts.filter(a => /elevator|escalator|\bramps?\b|\bADA\b|accessib|wheelchair/i.test(`${a.header} ${a.description}`)).length },
    runs,
  };
}

async function fetchOnce(env) {
  // Trimmed: a key pasted into the dashboard can carry whitespace. Sent as a header, never in the URL.
  const r = await fetch(SOURCE, { headers: {
    authorization: `Bearer ${env.METRA_API_TOKEN.trim()}`,
    'user-agent': 'cta-access-map (+https://github.com/aconaway1/cta-access-map)',
  } });
  if (!r.ok) throw new Error(`Metra returned ${r.status}`);
  return { ...parseFeed(new Uint8Array(await r.arrayBuffer())), fetched: new Date().toISOString() };
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
