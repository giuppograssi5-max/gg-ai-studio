// Server-side helpers for the GG VPN: server settings, address assignment, load and quick connect.
import { createHash } from 'node:crypto';

export const MAX_DEVICES = 5;
export const ONLINE_WINDOW_MS = 3 * 60 * 1000;
export const FEATURES = ['p2p', 'double', 'obfuscated', 'dedicated', 'streaming'];
const ID = /^[a-z0-9-]{1,32}$/;
const KEY = /^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export const validPublicKey = k => typeof k === 'string' && KEY.test(k);
export const isIPv4 = s => typeof s === 'string' && IPV4.test(s);
export const ipToInt = ip => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
export const intToIp = n => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.');

export function parseSubnet(cidr) {
  const [ip, bits] = String(cidr || '').split('/');
  const b = Number(bits);
  if (!isIPv4(ip) || !Number.isInteger(b) || b < 16 || b > 29) return null;
  const size = 2 ** (32 - b);
  const base = ipToInt(ip) - (ipToInt(ip) % size);
  return { cidr: `${intToIp(base)}/${b}`, base, size, gateway: intToIp(base + 1) };
}

const str = (v, max) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '';

// GG_VPN_SERVERS is a JSON array; invalid entries are skipped so one typo can't break the others.
export function parseServers(raw) {
  let list;
  try { list = JSON.parse(raw || '[]'); } catch { return []; }
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list.flatMap(s => {
    if (!s || typeof s !== 'object') return [];
    const id = str(s.id, 32).toLowerCase();
    const subnet = parseSubnet(s.subnet);
    const endpoint = str(s.endpoint, 200);
    if (!ID.test(id) || seen.has(id) || !subnet || !validPublicKey(s.publicKey) || !/^[A-Za-z0-9.-]+:\d{2,5}$/.test(endpoint)) return [];
    seen.add(id);
    const host = endpoint.split(':')[0];
    const exitIp = isIPv4(s.exitIp) ? s.exitIp : isIPv4(host) ? host : null;
    const dns = (Array.isArray(s.dns) ? s.dns : [subnet.gateway]).filter(isIPv4).slice(0, 4);
    return [{
      id,
      country: str(s.country, 60) || id.toUpperCase(),
      countryCode: /^[A-Za-z]{2}$/.test(s.countryCode || '') ? s.countryCode.toUpperCase() : '',
      city: str(s.city, 60),
      endpoint,
      publicKey: s.publicKey,
      subnet: subnet.cidr,
      dns: dns.length ? dns : [subnet.gateway],
      exitIp,
      capacity: Number.isInteger(s.capacity) && s.capacity > 0 ? s.capacity : 100,
      features: (Array.isArray(s.features) ? s.features : []).filter(f => FEATURES.includes(f)),
    }];
  });
}

// Lowest free host address; .0 is the network, .1 the server and the last one broadcast.
export function nextAddress(subnetCidr, used) {
  const s = parseSubnet(subnetCidr);
  if (!s) return null;
  const taken = new Set(used);
  for (let n = s.base + 2; n < s.base + s.size - 1; n++) {
    const ip = intToIp(n);
    if (!taken.has(ip)) return ip;
  }
  return null;
}

export const hasVpnAccess = user => Array.isArray(user?.roles) && user.roles.some(r => r === 'vpn' || r === 'admin');

// Meshnet group: devices of the same user share an opaque tag, so the server never sees account ids.
export const meshGroup = userId => createHash('sha256').update('gg-mesh:' + userId).digest('hex').slice(0, 16);

export function withStatus(servers, statuses, now = Date.now()) {
  const byId = new Map(statuses.map(s => [s.serverId, s]));
  return servers.map(s => {
    const st = byId.get(s.id);
    const online = st ? now - new Date(st.reportedAt).getTime() < ONLINE_WINDOW_MS : null;
    const load = st && online ? Math.min(100, Math.round((st.activePeers / s.capacity) * 100)) : null;
    return { ...s, online, load };
  });
}

// Quick connect: skip servers known to be offline, prefer the visitor's country, then the lowest load.
export function recommend(servers, countryCode) {
  const usable = servers.filter(s => s.online !== false);
  if (!usable.length) return null;
  const score = s => (s.countryCode && s.countryCode === countryCode ? 0 : 1000) + (s.load ?? 50);
  return [...usable].sort((a, b) => score(a) - score(b))[0].id;
}

export const protectedBy = (servers, ip) => servers.find(s => s.exitIp && s.exitIp === ip)?.id || null;

export function publicServer(s) {
  const { capacity, ...rest } = s;
  return rest;
}

// Sample servers shown only while GG_VPN_SERVERS is not set, so the interface can be explored.
// They cannot be connected to; the real list takes over as soon as the variable is set.
const DEMO_KEY = 'xTIBA5rboUvnH4htodjb6e697QjLERt1NAB4mZqp8Dg=';
export const DEMO_SERVERS = [
  { id: 'demo-it', country: 'Italia', countryCode: 'IT', city: 'Milano', features: ['p2p'], load: 34 },
  { id: 'demo-de', country: 'Germania', countryCode: 'DE', city: 'Francoforte', features: ['p2p', 'double'], load: 52 },
  { id: 'demo-nl', country: 'Paesi Bassi', countryCode: 'NL', city: 'Amsterdam', features: ['obfuscated'], load: 18 },
  { id: 'demo-us', country: 'Stati Uniti', countryCode: 'US', city: 'New York', features: ['streaming', 'dedicated'], load: 71 },
].map(s => ({ ...s, endpoint: 'demo.invalid:51820', publicKey: DEMO_KEY, subnet: '10.99.0.0/24', dns: ['10.99.0.1'], online: true }));
