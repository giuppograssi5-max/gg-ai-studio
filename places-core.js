// GG Places: shared helpers (browser + server) for finding restaurants, clubs and bars
// and for the partner programme: a place gives GG users a discount and promotes GG,
// and in return GG features it with a "GG deal" badge.

export const KINDS = {
  restaurant: { label: 'Restaurants', one: 'restaurant', icon: '🍽', osm: '["amenity"~"^(restaurant|fast_food)$"]' },
  club: { label: 'Clubs', one: 'club', icon: '🪩', osm: '["amenity"="nightclub"]' },
  bar: { label: 'Bars & pubs', one: 'bar', icon: '🍸', osm: '["amenity"~"^(bar|pub|biergarten)$"]' },
};
// "all" searches restaurants, bars and clubs together (used by the 3D map).
export const ALL = { label: 'Restaurants, bars & clubs', one: 'place', icon: '📍', osm: '["amenity"~"^(restaurant|bar|pub|biergarten|nightclub)$"]' };
export const kindInfo = k => (k === 'all' ? ALL : KINDS[k]);
export const isSearchKind = k => k === 'all' || isKind(k);
// Kind of an OpenStreetMap element from its amenity tag.
export const kindOf = (tags = {}) => tags.amenity === 'nightclub' ? 'club' : /^(bar|pub|biergarten)$/.test(tags.amenity || '') ? 'bar' : 'restaurant';
export const isKind = k => Object.prototype.hasOwnProperty.call(KINDS, k);
export const STATUSES = ['contacted', 'pending', 'active', 'rejected', 'ended'];
export const MAX_RESULTS = 60;
export const RADIUS = 3000;

const text = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
export const clean = text;

export const normCity = c => text(c, 80).toLowerCase();
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}\.[a-z]{2,}$/i;
export const cleanEmail = v => { const e = text(v, 254).toLowerCase(); return EMAIL.test(e) ? e : ''; };
export const cleanPhone = v => text(v, 40).replace(/[^\d+()\s./-]/g, '');
export function cleanUrl(v) {
  const s = text(v, 300);
  if (!s) return '';
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u.toString() : ''; } catch { return ''; }
}
export const OSM_ID = /^(node|way|relation)\/\d{1,15}$/;

// Discount code shown to GG users at the venue, e.g. "GG-TRATTORIA-7K3Q".
export function makeCode(name, rand = Math.random) {
  const slug = String(name || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || 'PLACE';
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let tail = '';
  for (let i = 0; i < 4; i++) tail += abc[Math.floor(rand() * abc.length)];
  return `GG-${slug}-${tail}`;
}

// Overpass QL query for one kind of place around a point.
export function overpassQuery(kind, lat, lon, radius = RADIUS) {
  const f = kindInfo(kind).osm;
  return `[out:json][timeout:20];(nwr${f}["name"](around:${radius},${(+lat).toFixed(5)},${(+lon).toFixed(5)}););out center tags ${kind === 'all' ? 600 : 300};`;
}

// How "good" a place looks from its OpenStreetMap data (there are no star ratings on OSM):
// well-known places (Wikipedia/Wikidata, awards) and well-documented independent venues rank
// first, chains and fast food last, and places close to the searched spot get a small boost.
export function placeScore(t = {}, dist = 0) {
  let s = 0;
  if (t.wikidata || t.wikipedia) s += 5;
  if (Object.keys(t).some(k => /^(awards?|michelin|stars|guide)/i.test(k))) s += 4;
  if (t.website || t['contact:website']) s += 2;
  if (t.opening_hours) s += 1.5;
  if (t.phone || t['contact:phone']) s += 1;
  if (t.cuisine) s += 1;
  if (t['contact:instagram'] || t['contact:facebook'] || t.facebook || t.instagram) s += 1;
  if (t['addr:street']) s += 0.5;
  if (t.outdoor_seating === 'yes') s += 0.5;
  if (t.description) s += 0.5;
  if (t.brand || t['brand:wikidata']) s -= 3;
  if (t.amenity === 'fast_food') s -= 3;
  return Math.round((s - Math.min(dist, 3000) / 1500) * 10) / 10;
}
const distance = (a, b, c, d) => {
  const r = Math.PI / 180, x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * 6371e3;
};

// Turns an OpenStreetMap element into a place card.
export function toPlace(el, kind, center) {
  const t = el?.tags || {};
  const name = text(t.name, 100);
  if (!name || !el.type || !el.id) return null;
  const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
  const street = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
  const dist = center && typeof lat === 'number' ? distance(center.lat, center.lon, lat, lon) : 0;
  return {
    osmId: `${el.type}/${el.id}`,
    kind: kind === 'all' || !kind ? kindOf(t) : kind,
    name,
    cuisine: text(String(t.cuisine || '').replace(/[;_]/g, (m) => (m === ';' ? ', ' : ' ')), 80),
    address: text([street, t['addr:city']].filter(Boolean).join(', '), 160),
    phone: cleanPhone(t.phone || t['contact:phone'] || ''),
    email: cleanEmail(t.email || t['contact:email'] || ''),
    website: cleanUrl(t.website || t['contact:website'] || ''),
    instagram: text(t['contact:instagram'] || '', 120),
    hours: text(t.opening_hours || '', 120),
    lat: typeof lat === 'number' ? lat : null,
    lon: typeof lon === 'number' ? lon : null,
    distance: Math.round(dist),
    score: placeScore(t, dist),
  };
}

// Best places first; the top ones are marked as "top picks".
export function toPlaces(data, kind, center) {
  const seen = new Set();
  const best = (a, b) => b.score - a.score || a.distance - b.distance;
  let list = (data?.elements || []).map(e => toPlace(e, kind, center))
    .filter(p => p && !seen.has(p.name.toLowerCase() + p.address) && seen.add(p.name.toLowerCase() + p.address))
    .sort(best);
  if (kind === 'all') {
    // Mix the kinds so restaurants don't crowd out bars and clubs: best of each kind take turns.
    const pos = {};
    list = list.map(p => ({ p, i: (pos[p.kind] = (pos[p.kind] ?? -1) + 1) })).sort((a, b) => a.i - b.i || best(a.p, b.p)).map(x => x.p);
  }
  list = list.slice(0, MAX_RESULTS);
  list.forEach((p, i) => { p.rank = i + 1; });
  return list;
}

// Validates a partnership request sent by a venue (or saved by an admin after contacting one).
export function cleanPartner(b, { requireAgreement = true } = {}) {
  const p = {
    name: text(b?.name, 100), kind: isKind(b?.kind) ? b.kind : '', city: text(b?.city, 80), address: text(b?.address, 160),
    contactName: text(b?.contactName, 80), contactEmail: cleanEmail(b?.contactEmail), phone: cleanPhone(b?.phone || ''),
    website: cleanUrl(b?.website || ''), discount: text(b?.discount, 200), promotesGg: b?.promotesGg === true,
    osmId: OSM_ID.test(b?.osmId || '') ? b.osmId : null, notes: text(b?.notes, 500),
  };
  if (!p.name) return { error: 'Enter the name of the place.' };
  if (!p.kind) return { error: 'Choose the type of place.' };
  if (!p.city) return { error: 'Enter the city.' };
  if (requireAgreement) {
    if (!p.contactEmail) return { error: 'Enter a valid contact email.' };
    if (p.discount.length < 3) return { error: 'Describe the discount for GG users.' };
    if (!p.promotesGg) return { error: 'To join, the place must agree to promote GG.' };
  }
  return { partner: p };
}

// Ready-to-send outreach message used when the AI is unavailable.
export function proposalTemplate(place, { site = 'GG', url = '', sender = 'The GG team' } = {}) {
  const kind = KINDS[place?.kind]?.one || 'place';
  const subject = `Partnership proposal: free promotion for ${place?.name || 'your ' + kind} on ${site}`;
  const body = `Hello ${place?.name || ''} team,

I'm writing from ${site}${url ? ` (${url})` : ''}, an AI assistant that helps people find restaurants, clubs and bars in ${place?.city || 'your city'}.

We would like to feature your ${kind} in GG Places, free of charge. Here is the idea:

• You offer GG users a special discount of your choice (for example 10% off the bill, a free drink, or free entry before midnight). Users show their GG code at your ${kind}.
• You help promote GG, for example with a QR code or sticker at the counter, or a post or story on your social channels.
• In return, we advertise your ${kind}: a "GG deal" badge, a top spot in search results for your area and a link to your website and contacts.

There is no cost and no commitment: you can change the offer or stop at any time.

If you are interested, just reply to this email with the discount you would like to offer, or fill in the partner form in GG Places.

Kind regards,
${sender}`;
  return { subject, body };
}

export const mailtoUrl = (to, { subject, body }) =>
  `mailto:${encodeURIComponent(to || '')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
