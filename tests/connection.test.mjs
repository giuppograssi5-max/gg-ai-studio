import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../netlify/functions/connection.mjs';

test('connection check reports IP and approximate location without caching', async () => {
  const res = await handler(new Request('https://local/gg-connection', { headers: { 'user-agent': 'TestUA', 'accept-language': 'it-IT', 'sec-gpc': '1' } }), {
    ip: '203.0.113.7',
    geo: { city: 'Milano', subdivision: { name: 'Lombardia' }, country: { code: 'IT', name: 'Italy' }, timezone: 'Europe/Rome', latitude: 45.4642, longitude: 9.19 },
  });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('cache-control'), /no-store/);
  const data = await res.json();
  assert.equal(data.ip, '203.0.113.7');
  assert.equal(data.ipVersion, 4);
  assert.equal(data.location.city, 'Milano');
  assert.equal(data.location.latitude, 45.5);
  assert.equal(data.doNotTrack, true);
});
test('connection check rejects non-GET requests and handles missing geo', async () => {
  assert.equal((await handler(new Request('https://local/gg-connection', { method: 'POST' }), {})).status, 405);
  const data = await (await handler(new Request('https://local/gg-connection'), { ip: '2001:db8::1' })).json();
  assert.equal(data.ipVersion, 6);
  assert.equal(data.location.country, null);
});
