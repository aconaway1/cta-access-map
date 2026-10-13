// GET /api/metra-alerts
// Fetches Metra's GTFS-realtime service alerts (protobuf) with the METRA_API_TOKEN Worker secret and returns
// them as JSON. Metra's license requires serving the data through our own host, which this does; alert text is
// passed through unmodified. The token is sent in a header (not the URL) and never logged or echoed.
import { DurableObject } from 'cloudflare:workers';
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
// Every individual request to Metra is logged in the RunLog Durable Object (src/runlog.js) for /status.
//
// GEO-BLOCK (found Oct 13): the 403s are Metra's gateway refusing requests that leave Cloudflare outside the US.
// Cron Triggers ran in LHR, and free-plan workers.dev traffic from Chicago was served from CDG/MXP/WAW/NRT, while a
// plain US request gets through. So every request to Metra goes through the MetraFetcher Durable Object below,
// created with locationHint 'enam' (eastern North America): a Durable Object runs where it was placed, whichever
// data center the cron or the visitor landed in.
const KV_KEY = 'metra-alerts';
const ATTEMPTS = 4, RETRY_MS = 45 * 1000;

// Page visits also help: if the saved copy is over 5 minutes old, the Worker answers with it right away and then
// makes ONE background attempt from the visitor's data center (scheduled runs may come from addresses Metra's WAF
// blocks more often). At most one try per isolate every 2 minutes, so bursts of visitors don't pile onto Metra.
const VISIT_REFRESH_AFTER_MS = 5 * 60 * 1000, VISIT_TRY_EVERY_MS = 2 * 60 * 1000;
let lastVisitTry = 0;   // per isolate

const runLog = env => env.RUN_LOG && env.RUN_LOG.get(env.RUN_LOG.idFromName('metra'));

// The location hint only counts when the object is first created, so the name carries the region: changing the
// hint means a new name.
const fetcher = env => env.METRA_FETCHER?.get(env.METRA_FETCHER.idFromName('enam'), { locationHint: 'enam' });

export class MetraFetcher extends DurableObject {
  // One timed request to Metra from wherever this object lives; the result includes that data center.
  async attempt() {
    this.colo ||= await currentColo();
    return { ...await attempt(this.env), colo: this.colo };
  }
}

// Through the US-pinned fetcher when it's bound (local dev without it: direct). Never throws.
async function usAttempt(env) {
  const f = fetcher(env);
  if (!f) return { ...await attempt(env), colo: await currentColo() };
  try { return await f.attempt(); }
  catch (e) { return { at: new Date().toISOString(), status: 0, ok: false, error: `fetcher: ${e.message || e}` }; }
}

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
  const t = await usAttempt(env);
  if (!t.body) return json({ error: t.error, alerts: [] }, 30, 502);   // only our own message, never Metra's body
  if (env.CACHE) await env.CACHE.put(KV_KEY, JSON.stringify(t.body));
  return json(t.body, 60);
}

async function visitRefresh(env) {
  const t = await usAttempt(env);
  if (t.body) await env.CACHE.put(KV_KEY, JSON.stringify(t.body));
  await record(env, `visit ${t.at}`, 'visit', [t]);
}

// One request to Metra, timed, with what the log needs. Never throws.
async function attempt(env) {
  const at = new Date().toISOString(), t0 = Date.now(), meta = {};
  try {
    const body = await fetchOnce(env, meta);
    return { at, ms: Date.now() - t0, status: 200, ok: true, body, ...meta };
  } catch (e) {
    return { at, ms: Date.now() - t0, status: e.status || 0, ok: false, ...meta, gateway: Boolean(e.gateway),
      error: String(e.message || e) };
  }
}

async function record(env, run, source, tries) {
  try {
    await runLog(env)?.record(tries.map((t, i) => ({ run, source, attempt: i + 1, colo: t.colo || '', at: t.at, ms: t.ms,
      status: t.status, ok: t.ok, server: t.server || '', ratelimit: t.ratelimit || '', gateway: t.gateway || false, error: t.error || '' })));
  } catch (e) { console.log(`run log failed: ${e.message || e}`); }
}

// The Cloudflare data center running this code (where requests to Metra leave from).
async function currentColo() {
  try {
    const r = await fetch('https://www.cloudflare.com/cdn-cgi/trace');
    return (/^colo=(\w+)$/m.exec(await r.text()) || [])[1] || '';
  } catch { return ''; }
}

// Cron Trigger handler body. Returns a short outcome string; each request is logged.
export async function refreshMetra(env, { attempts = ATTEMPTS, retryMs = RETRY_MS } = {}) {
  if (!env.METRA_API_TOKEN || !env.CACHE) return 'skipped: not configured';
  const run = `cron ${new Date().toISOString()}`;
  const tries = [];
  for (let n = 1; n <= attempts; n++) {
    const t = await usAttempt(env);
    tries.push(t);
    if (t.body) { await env.CACHE.put(KV_KEY, JSON.stringify(t.body)); break; }
    if (n < attempts) await new Promise(res => setTimeout(res, retryMs));
  }
  await record(env, run, 'cron', tries);
  const last = tries.at(-1);
  return last.ok ? `stored on attempt ${tries.length} (${last.colo})` : `kept previous copy: ${last.error} after ${attempts} attempts (${last.colo})`;
}

// For /api/status: the stored copy's times and counts, and the request log summary. Never includes the token.
export async function metraStatus(env) {
  const copy = env.CACHE ? await env.CACHE.get(KV_KEY, 'json') : null;
  let log = null;
  try { log = await runLog(env)?.report(); } catch (e) { log = { error: String(e.message || e) }; }
  return {
    keySet: Boolean(env.METRA_API_TOKEN),
    kvBound: Boolean(env.CACHE),
    copy: copy && { updated: copy.updated, fetched: copy.fetched || null, alerts: copy.alerts.length,
      accessibility: copy.alerts.filter(a => /elevator|escalator|\bramps?\b|\bADA\b|accessib|wheelchair/i.test(`${a.header} ${a.description}`)).length },
    log,
  };
}

export async function metraLogCsv(env) {
  const log = runLog(env);
  if (!log) return new Response('Request log not configured', { status: 503 });
  return new Response(await log.csv(), { headers: { 'content-type': 'text/csv; charset=utf-8', 'cache-control': 'no-store',
    'content-disposition': 'attachment; filename="metra-requests.csv"' } });
}

// meta (optional) collects response headers for the request log: Server, and Metra's x-ratelimit-* values.
async function fetchOnce(env, meta = {}) {
  // Trimmed: a key pasted into the dashboard can carry whitespace. Sent as a header, never in the URL.
  const r = await fetch(SOURCE, { headers: {
    authorization: `Bearer ${env.METRA_API_TOKEN.trim()}`,
    'user-agent': 'cta-access-map (+https://github.com/aconaway1/cta-access-map)',
  } });
  meta.server = r.headers.get('server') || '';
  meta.ratelimit = ['limit', 'remaining', 'reset'].map(k => r.headers.get(`x-ratelimit-${k}`)).filter(v => v != null).join('/');
  if (!r.ok) {
    // Keep only what identifies the responder (status, Server header, whether the body is Azure Application
    // Gateway's error page), never the body itself.
    const e = new Error(`Metra returned ${r.status}`);
    e.status = r.status;
    e.gateway = /Application-Gateway/i.test(await r.text().catch(() => ''));
    throw e;
  }
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
