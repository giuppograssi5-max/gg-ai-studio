import { admin } from '@netlify/identity';

// Keep account details on the server; the public response contains only a total.
export function createMembersHandler(listUsers = options => admin.listUsers(options)) {
  return async request => {
    if (request.method !== 'GET') {
      return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    }
    try {
      let count = 0;
      for (let page = 1; ; page++) {
        const users = await listUsers({ page, perPage: 100 });
        count += users.length;
        if (users.length < 100) break;
      }
      return Response.json({ count }, {
        headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' },
      });
    } catch {
      return Response.json({ error: 'Member count unavailable' }, {
        status: 503, headers: { 'Cache-Control': 'no-store' },
      });
    }
  };
}

export default createMembersHandler();
export const config = { path: '/gg-members' };
