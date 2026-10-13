// RunLog: a SQLite-backed Durable Object holding one row per request to Metra's feed (scheduled and page-visit),
// for /status and for the evidence we send Metra about their WAF blocking Cloudflare. One instance ('metra'), so
// every write goes through a single object: no lost updates (the KV list it replaced dropped runs when a cron run
// and a page visit wrote at the same time, Oct 13). Keeps 8 days.
import { DurableObject } from 'cloudflare:workers';

const KEEP_MS = 8 * 24 * 3600 * 1000;
const RECENT = 40;
const COLS = ['at', 'source', 'run', 'attempt', 'status', 'ok', 'ms', 'colo', 'server', 'gateway', 'error', 'approx'];

export class RunLog extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tries (id INTEGER PRIMARY KEY, at TEXT, source TEXT, run TEXT,
      attempt INTEGER, status INTEGER, ok INTEGER, ms INTEGER, colo TEXT, server TEXT, gateway INTEGER, error TEXT,
      approx INTEGER DEFAULT 0)`);
    this.sql.exec('CREATE INDEX IF NOT EXISTS tries_at ON tries(at)');
    this.sql.exec('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)');
  }

  insert(t) {
    this.sql.exec(`INSERT INTO tries (${COLS.join(',')}) VALUES (${COLS.map(() => '?').join(',')})`,
      t.at, t.source, t.run, t.attempt, t.status, t.ok ? 1 : 0, t.ms ?? null, t.colo || '', t.server || '',
      t.gateway ? 1 : 0, t.error || '', t.approx ? 1 : 0);
  }

  // One-time import of the history kept in KV before this log existed (Oct 12 8:30 PM CT onward). Those entries
  // only had each run's start time, so per-request times are reconstructed (start + 45 s per retry) and flagged
  // approx; runs that KV lost are missing.
  async importLegacy() {
    if (this.sql.exec("SELECT 1 FROM meta WHERE k = 'legacy'").toArray().length) return;
    const runs = (this.env.CACHE && await this.env.CACHE.get('metra-runs', 'json')) || [];
    for (const r of runs) {
      const n = r.attempts || 1;
      for (let i = 1; i <= n; i++) {
        const ok = r.ok && i === n;
        const status = ok ? 200 : Number((/(\d{3})/.exec(r.errors?.[i - 1] || '') || [])[1]) || 0;
        this.insert({ at: new Date(Date.parse(r.at) + (i - 1) * 45000).toISOString(), source: r.source || 'cron',
          run: `${r.source || 'cron'} ${r.at}`, attempt: i, status, ok, error: ok ? '' : r.errors?.[i - 1] || '', approx: true });
      }
    }
    this.sql.exec("INSERT INTO meta (k, v) VALUES ('legacy', ?)", String(runs.length));
  }

  async record(tries) {
    await this.importLegacy();
    for (const t of tries) this.insert(t);
    this.sql.exec('DELETE FROM tries WHERE at < ?', new Date(Date.now() - KEEP_MS).toISOString());
  }

  async report() {
    await this.importLegacy();
    const q = (s, ...a) => this.sql.exec(s, ...a).toArray();
    const AGG = `COUNT(*) AS tries, SUM(ok) AS ok, SUM(status = 403) AS blocked, SUM(gateway) AS gateway,
      COUNT(DISTINCT run) AS runs`;
    return {
      since: q('SELECT MIN(at) AS v FROM tries')[0]?.v || null,
      exactSince: q('SELECT MIN(at) AS v FROM tries WHERE approx = 0')[0]?.v || null,
      totals: q(`SELECT source, ${AGG} FROM tries GROUP BY source`),
      statuses: q('SELECT source, status, COUNT(*) AS n FROM tries GROUP BY source, status ORDER BY source, n DESC'),
      colos: q(`SELECT source, colo, ${AGG}, MIN(at) AS first, MAX(at) AS last FROM tries WHERE approx = 0
        GROUP BY source, colo ORDER BY source, tries DESC`),
      hourly: q(`SELECT substr(at, 1, 13) || ':00:00Z' AS hour, source, ${AGG}, MAX(approx) AS approx FROM tries
        GROUP BY hour, source ORDER BY hour DESC`),
      recent: q(`SELECT ${COLS.join(',')} FROM tries ORDER BY at DESC, id DESC LIMIT ?`, RECENT),
    };
  }

  async csv() {
    await this.importLegacy();
    const cell = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
    const rows = this.sql.exec(`SELECT ${COLS.join(',')} FROM tries ORDER BY at, id`).toArray();
    return [COLS.join(','), ...rows.map(r => COLS.map(c => cell(r[c])).join(','))].join('\n') + '\n';
  }
}
