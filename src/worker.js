// Worker entry point. Static files in public/ are served by the assets layer before this runs,
// so only paths with no matching file (the API) reach fetch().
import { elevators } from './elevators.js';

export default {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/elevators') {
      return request.method === 'GET' ? elevators() : new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET' } });
    }
    return new Response('Not Found', { status: 404 });
  },
};
