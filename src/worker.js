// Worker entry point. Static files in public/ are served by the assets layer before this runs,
// so only paths with no matching file (the API) reach fetch().
import { elevators } from './elevators.js';
import { metraAlerts, refreshMetra } from './metra.js';

const ROUTES = {
  '/api/elevators': () => elevators(),
  '/api/metra-alerts': env => metraAlerts(env),
};

export default {
  async fetch(request, env) {
    const route = ROUTES[new URL(request.url).pathname];
    if (!route) return new Response('Not Found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    return route(env);
  },
  // Cron Trigger (wrangler.toml [triggers]): refresh the stored Metra alerts every 5 minutes.
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(refreshMetra(env).then(outcome => console.log(`metra refresh: ${outcome}`)));
  },
};
