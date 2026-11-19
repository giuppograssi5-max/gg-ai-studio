// GG VPN · pure helpers shared by the browser and the tests (no DOM access here).

// Threat protection: DNS resolvers that block known malicious, ad and tracker domains.
export const DNS_PRESETS = {
  gg: { label: 'DNS del server GG', detail: 'Le richieste DNS restano dentro il tunnel GG.' },
  threat: { label: 'Protezione dalle minacce', detail: 'Blocca siti di malware e phishing (Quad9).', dns: ['9.9.9.9', '149.112.112.112'] },
  adblock: { label: 'Minacce + pubblicità e tracker', detail: 'Blocca anche annunci e tracker (AdGuard DNS).', dns: ['94.140.14.14', '94.140.15.15'] },
  family: { label: 'Protezione famiglia', detail: 'Blocca anche contenuti per adulti (AdGuard Family).', dns: ['94.140.14.15', '94.140.15.16'] },
};

// Ranges excluded by "Consenti la rete locale" (printers, NAS, Chromecast, router).
export const LAN_RANGES = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '169.254.0.0/16'];

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;
const toInt = ip => ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
const toIp = n => [24, 16, 8, 0].map(s => Math.floor(n / 2 ** s) % 256).join('.');

// Accepts "1.2.3.4" or "1.2.3.0/24"; returns [start, end] or null.
export function parseCidr(text) {
  const [ip, bitsText] = String(text).trim().split('/');
  const bits = bitsText === undefined ? 32 : Number(bitsText);
  if (!IPV4.test(ip) || !Number.isInteger(bits) || bits < 0 || bits > 32 || (bitsText !== undefined && !/^\d{1,2}$/.test(bitsText))) return null;
  const size = 2 ** (32 - bits);
  const start = toInt(ip) - (toInt(ip) % size);
  return [start, start + size - 1];
}

// Minimal CIDR list covering [start, end].
function rangeToCidrs(start, end) {
  const out = [];
  while (start <= end) {
    let size = 1;
    while (start % (size * 2) === 0 && start + size * 2 - 1 <= end && size < 2 ** 32) size *= 2;
    out.push(`${toIp(start)}/${32 - Math.log2(size)}`);
    start += size;
  }
  return out;
}

// 0.0.0.0/0 minus the excluded ranges: WireGuard has no "exclude", so the routes are computed instead.
export function excludeRanges(excluded) {
  const ranges = excluded.map(parseCidr).filter(Boolean).sort((a, b) => a[0] - b[0]);
  const out = [];
  let cursor = 0;
  for (const [s, e] of ranges) {
    if (s > cursor) out.push(...rangeToCidrs(cursor, s - 1));
    cursor = Math.max(cursor, e + 1);
  }
  if (cursor <= 2 ** 32 - 1) out.push(...rangeToCidrs(cursor, 2 ** 32 - 1));
  return out;
}

// Linux kill switch from the wg-quick manual: reject anything that doesn't leave through the tunnel.
const KILL = '! -o %i -m mark ! --mark $(wg show %i fwmark) -m addrtype ! --dst-type LOCAL -j REJECT';

export function buildConfig({ privateKey, address, server, dnsPreset = 'gg', killSwitch = true, platform = 'other', allowLan = false, exclude = [] }) {
  const dns = DNS_PRESETS[dnsPreset]?.dns || server.dns;
  const excluded = [...(allowLan ? LAN_RANGES : []), ...exclude];
  const split = excluded.length > 0;
  if (split && server.exitIp) excluded.push(server.exitIp + '/32'); // avoid a routing loop to the server itself
  // IPv6 always goes into the tunnel, which has no IPv6 exit: this blocks IPv6 leaks.
  const allowed = split ? [...excludeRanges(excluded), server.subnet, '::/0'] : ['0.0.0.0/0', '::/0'];
  const lines = ['[Interface]', `PrivateKey = ${privateKey}`, `Address = ${address}/32`, `DNS = ${dns.join(', ')}`];
  if (killSwitch && platform === 'linux' && !split) {
    lines.push(`PostUp = iptables -I OUTPUT ${KILL} && ip6tables -I OUTPUT ${KILL}`,
      `PreDown = iptables -D OUTPUT ${KILL} && ip6tables -D OUTPUT ${KILL}`);
  }
  lines.push('', '[Peer]', `# GG · ${server.country}${server.city ? ' · ' + server.city : ''}`, `PublicKey = ${server.publicKey}`,
    `Endpoint = ${server.endpoint}`, `AllowedIPs = ${[...new Set(allowed)].join(', ')}`, 'PersistentKeepalive = 25', '');
  return lines.join('\n');
}

export const validExclusion = text => parseCidr(text) !== null;

// Breach check: k-anonymity, only the first 5 hex characters of the SHA-1 leave the browser.
export async function sha1Hex(text) {
  const buf = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function breachCount(rangeBody, hash) {
  const suffix = hash.slice(5);
  for (const line of rangeBody.split('\n')) {
    const [s, n] = line.trim().split(':');
    if (s === suffix) return Number(n) || 0;
  }
  return 0;
}
