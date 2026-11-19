// Connection privacy check: reports what a website can see about the visitor's connection.
// Nothing is stored; the response is built from the current request only.
function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
}
const clean = (value, max = 120) => typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;

export function describeConnection(req, context = {}) {
  const geo = context.geo || {};
  const ip = clean(context.ip, 64) || clean(req.headers.get('x-nf-client-connection-ip'), 64);
  return {
    ip,
    ipVersion: ip ? (ip.includes(':') ? 6 : 4) : null,
    location: {
      city: clean(geo.city),
      region: clean(geo.subdivision?.name),
      country: clean(geo.country?.name),
      countryCode: clean(geo.country?.code, 4),
      timezone: clean(geo.timezone, 64),
      latitude: Number.isFinite(geo.latitude) ? Math.round(geo.latitude * 10) / 10 : null,
      longitude: Number.isFinite(geo.longitude) ? Math.round(geo.longitude * 10) / 10 : null,
    },
    userAgent: clean(req.headers.get('user-agent'), 400),
    acceptLanguage: clean(req.headers.get('accept-language'), 200),
    doNotTrack: req.headers.get('dnt') === '1' || req.headers.get('sec-gpc') === '1',
    checkedAt: new Date().toISOString(),
  };
}

export default async (req, context) => {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  return json(describeConnection(req, context));
};

export const config = { path: '/gg-connection' };
