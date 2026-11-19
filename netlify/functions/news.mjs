import { publisherNewsData } from '../../news-engine.js';

export async function handleNews(req, load = publisherNewsData) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (req.method !== 'GET') return Response.json({ error: 'Method not allowed' }, { status: 405, headers });
  const params = new URL(req.url).searchParams;
  try {
    // Deduplicate feed requests only within this response; do not retain server state.
    const data = await load((params.get('q') || '').trim(), params.get('source') || 'all', {
      lang: params.get('lang') || 'it', country: params.get('country') || 'IT',
      force: true, cache: new Map(), pending: new Map(),
    });
    return Response.json(data, { status: data.allUnavailable ? 503 : 200, headers });
  } catch (error) {
    return Response.json({ error: error instanceof RangeError ? error.message : 'News sources unavailable' }, {
      status: error instanceof RangeError ? 400 : 503, headers,
    });
  }
}

export default async function handler(req) { return handleNews(req); }
export const config = { path: '/gg-news' };
