import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseServers, nextAddress, hasVpnAccess, validPublicKey, withStatus, recommend, protectedBy, meshGroup, publicServer } from '../lib/vpn-lib.mjs';
import { excludeRanges, buildConfig, parseCidr, breachCount, sha1Hex, LAN_RANGES } from '../vpn-core.js';

const KEY = 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=';
const servers = JSON.stringify([
  { id: 'it-mil', country: 'Italia', countryCode: 'it', city: 'Milano', endpoint: '203.0.113.10:51820', publicKey: KEY, subnet: '10.66.0.0/24', features: ['p2p', 'bogus'] },
  { id: 'de-fra', country: 'Germania', countryCode: 'DE', endpoint: 'de.example.com:51820', publicKey: KEY, subnet: '10.67.0.0/24', exitIp: '198.51.100.4', capacity: 10 },
  { id: 'BAD id', endpoint: 'x:1', publicKey: KEY, subnet: '10.0.0.0/24' },
  { id: 'it-mil', endpoint: '1.1.1.1:51820', publicKey: KEY, subnet: '10.68.0.0/24' },
]);

test('server settings are validated and normalized', () => {
  const list = parseServers(servers);
  assert.deepEqual(list.map(s => s.id), ['it-mil', 'de-fra']);
  assert.equal(list[0].countryCode, 'IT');
  assert.deepEqual(list[0].dns, ['10.66.0.1']);
  assert.equal(list[0].exitIp, '203.0.113.10');
  assert.deepEqual(list[0].features, ['p2p']);
  assert.equal(list[1].exitIp, '198.51.100.4');
  assert.equal('capacity' in publicServer(list[1]), false);
  assert.deepEqual(parseServers('not json'), []);
});

test('addresses skip the network, server and broadcast addresses', () => {
  assert.equal(nextAddress('10.66.0.0/24', []), '10.66.0.2');
  assert.equal(nextAddress('10.66.0.0/24', ['10.66.0.2', '10.66.0.4']), '10.66.0.3');
  const all = Array.from({ length: 5 }, (_, i) => `10.9.0.${i + 2}`);
  assert.equal(nextAddress('10.9.0.0/29', all), null);
});

test('access needs the vpn or admin role; keys must be WireGuard keys', () => {
  assert.equal(hasVpnAccess({ roles: ['vpn'] }), true);
  assert.equal(hasVpnAccess({ roles: ['admin'] }), true);
  assert.equal(hasVpnAccess({ roles: ['member'] }), false);
  assert.equal(hasVpnAccess(null), false);
  assert.equal(validPublicKey(KEY), true);
  assert.equal(validPublicKey('abc='), false);
});

test('load, online status, quick connect and protection status', () => {
  const now = Date.parse('2026-11-16T10:00:00Z');
  const list = withStatus(parseServers(servers), [
    { serverId: 'it-mil', activePeers: 80, reportedAt: new Date(now - 30000) },
    { serverId: 'de-fra', activePeers: 2, reportedAt: new Date(now - 30000) },
  ], now);
  assert.equal(list[0].load, 80);
  assert.equal(list[1].load, 20);
  assert.equal(recommend(list, 'IT'), 'it-mil');
  assert.equal(recommend(list, 'FR'), 'de-fra');
  const offline = withStatus(parseServers(servers), [{ serverId: 'it-mil', activePeers: 1, reportedAt: new Date(now - 3600000) }], now);
  assert.equal(offline[0].online, false);
  assert.equal(recommend(offline, 'IT'), 'de-fra');
  assert.equal(protectedBy(list, '198.51.100.4'), 'de-fra');
  assert.equal(protectedBy(list, '192.0.2.1'), null);
  assert.equal(meshGroup('u1'), meshGroup('u1'));
  assert.notEqual(meshGroup('u1'), meshGroup('u2'));
});

test('split tunneling routes everything except the excluded ranges', () => {
  assert.deepEqual(excludeRanges([]), ['0.0.0.0/0']);
  assert.deepEqual(excludeRanges(['128.0.0.0/1']), ['0.0.0.0/1']);
  const routes = excludeRanges(LAN_RANGES);
  assert.ok(routes.includes('11.0.0.0/8'));
  assert.ok(!routes.some(r => r.startsWith('192.168.')));
  // Total size of the routes equals the full space minus the LAN ranges.
  const size = list => list.reduce((n, r) => { const [s, e] = parseCidr(r); return n + e - s + 1; }, 0);
  assert.equal(size(routes), 2 ** 32 - size(LAN_RANGES));
  assert.equal(parseCidr('300.1.1.1'), null);
});

test('config includes threat protection DNS, kill switch and IPv6 leak protection', () => {
  const server = parseServers(servers)[0];
  const full = buildConfig({ privateKey: 'PRIV', address: '10.66.0.2', server, dnsPreset: 'adblock', killSwitch: true, platform: 'linux' });
  assert.match(full, /DNS = 94\.140\.14\.14, 94\.140\.15\.15/);
  assert.match(full, /AllowedIPs = 0\.0\.0\.0\/0, ::\/0/);
  assert.match(full, /PostUp = iptables -I OUTPUT/);
  const split = buildConfig({ privateKey: 'PRIV', address: '10.66.0.2', server, dnsPreset: 'gg', allowLan: true, platform: 'linux' });
  assert.match(split, /DNS = 10\.66\.0\.1/);
  assert.doesNotMatch(split, /PostUp/);
  assert.match(split, /10\.66\.0\.0\/24/);
  assert.doesNotMatch(split.split('AllowedIPs = ')[1], /203\.0\.113\.10\/32/);
});

test('breach check only uses the hash suffix match', async () => {
  const hash = await sha1Hex('password');
  assert.equal(hash, '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8');
  assert.equal(breachCount('1E4C9B93F3F0682250B6CF8331B7EE68FD8:42\r\nAAA:1', hash), 42);
  assert.equal(breachCount('AAA:1', hash), 0);
});

test('demo servers are complete, distinct and clearly marked', async () => {
  const { DEMO_SERVERS } = await import('../lib/vpn-lib.mjs');
  assert.ok(DEMO_SERVERS.length >= 3);
  assert.ok(DEMO_SERVERS.every(s => s.id.startsWith('demo-') && s.endpoint.endsWith('.invalid:51820')));
  assert.equal(recommend(DEMO_SERVERS, 'NL'), 'demo-nl');
});
