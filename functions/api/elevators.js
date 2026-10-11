// Cloudflare Pages Function: GET /api/elevators
// Proxies CTA's Customer Alerts API (accessibility alerts only), normalizes it, and caches for 2 minutes.
const SOURCE = 'https://www.transitchicago.com/api/1.0/alerts.aspx?outputType=JSON&accessibility=TRUE&activeonly=TRUE';

const arr = x => x == null ? [] : Array.isArray(x) ? x : [x];

export async function onRequestGet() {
  try {
    const r = await fetch(SOURCE, { cf: { cacheTtl: 120, cacheEverything: true } });
    if (!r.ok) throw new Error(`CTA returned ${r.status}`);
    const j = await r.json();
    const alerts = arr(j?.CTAAlerts?.Alert).map(a => ({
      id: a.AlertId,
      headline: a.Headline || '',
      short: a.ShortDescription || '',
      stations: arr(a?.ImpactedService?.Service)
        .filter(s => s.ServiceType === 'T')
        .map(s => ({ id: s.ServiceId, name: s.ServiceName })),
    }));
    return json({ updated: new Date().toISOString(), alerts }, 120);
  } catch (e) {
    return json({ error: String(e.message || e), alerts: [] }, 30, 502);
  }
}

function json(body, maxAge, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` },
  });
}
