// Worker entry point. Static files in public/ are served by the assets layer before this runs,
// so only paths with no matching file (the API) reach fetch().
import { elevators } from './elevators.js';
import { metraAlerts, refreshMetra } from './metra.js';
import { status } from './status.js';

const ROUTES = {
  '/api/elevators': () => elevators(),
  '/api/metra-alerts': env => metraAlerts(env),
  '/api/status': env => status(env),
};

export default {
  async fetch(request, env) {
    const route = ROUTES[new URL(request.url).pathname];
    if (!route) return new Response('Not Found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    return route(env);
  },
  // Cron Trigger (wrangler.toml [triggers]): refresh the stored Metra alerts every 5 minutes. Awaited, not handed
  // to ctx.waitUntil: waitUntil work only gets ~30 s after the handler returns, which killed runs during the 45 s
  // retry wait (first deploy, Oct 12). A scheduled handler's own promise can run for minutes.
  async scheduled(controller, env) {
    console.log(`metra refresh: ${await refreshMetra(env)}`);
  },
};
