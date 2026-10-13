// GET /api/status: health of the data behind the map, for public/status.html. Live-checks CTA's feed; reports the
// stored Metra copy and its scheduled-run history from KV; names the deployed version. Never includes API keys,
// only whether they're set.
import { SOURCE as CTA_SOURCE } from './elevators.js';
import { metraStatus } from './metra.js';

const arr = x => x == null ? [] : Array.isArray(x) ? x : [x];

export async function status(env) {
  const t0 = Date.now();
  let cta;
  try {
    const r = await fetch(CTA_SOURCE, { cache: 'no-store' });
    const ms = Date.now() - t0;
    if (!r.ok) throw new Error(`CTA returned ${r.status}`);
    const alerts = arr((await r.json())?.CTAAlerts?.Alert);
    cta = { ok: true, ms, alerts: alerts.length,
      stationAlerts: alerts.filter(a => arr(a?.ImpactedService?.Service).some(s => s.ServiceType === 'T')).length };
  } catch (e) {
    cta = { ok: false, ms: Date.now() - t0, error: String(e.message || e) };
  }
  const v = env.CF_VERSION;
  const body = {
    now: new Date().toISOString(),
    deploy: v ? { id: v.id, tag: v.tag || null, timestamp: v.timestamp || null } : null,
    cta,
    metra: await metraStatus(env),
  };
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
