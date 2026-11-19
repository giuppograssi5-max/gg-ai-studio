import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toPlaces, overpassQuery, cleanPartner, makeCode, proposalTemplate, mailtoUrl, cleanUrl, cleanEmail } from '../places-core.js';

test('OpenStreetMap elements become place cards', () => {
  const places = toPlaces({ elements: [
    { type: 'node', id: 1, lat: 45.1, lon: 9.2, tags: { name: 'Trattoria Da Mario', cuisine: 'italian;pizza', 'addr:street': 'Via Roma', 'addr:housenumber': '3', website: 'damario.it', email: 'INFO@damario.it' } },
    { type: 'way', id: 2, center: { lat: 45, lon: 9 }, tags: { name: 'Club Notte', phone: '+39 02 1234' } },
    { type: 'node', id: 3, tags: {} },
    { type: 'node', id: 4, lat: 45.1, lon: 9.2, tags: { name: 'trattoria da mario', 'addr:street': 'Via Roma', 'addr:housenumber': '3' } },
  ] }, 'restaurant');
  assert.equal(places.length, 2);
  assert.equal(places[0].osmId, 'node/1');
  assert.equal(places[0].cuisine, 'italian, pizza');
  assert.equal(places[0].address, 'Via Roma 3');
  assert.equal(places[0].website, 'https://damario.it/');
  assert.equal(places[0].email, 'info@damario.it');
  assert.equal(places[1].lat, 45);
  assert.match(overpassQuery('club', 45, 9), /nightclub.*around:3000,45\.00000,9\.00000/);
});

test('partner requests need a discount, an email and the agreement to promote GG', () => {
  const base = { name: 'Bar Luna', kind: 'bar', city: 'Milano', contactEmail: 'owner@luna.it', discount: '10% off', promotesGg: true };
  assert.ok(cleanPartner(base).partner);
  assert.match(cleanPartner({ ...base, promotesGg: false }).error, /promote GG/);
  assert.match(cleanPartner({ ...base, discount: '' }).error, /discount/);
  assert.match(cleanPartner({ ...base, contactEmail: 'nope' }).error, /email/);
  assert.match(cleanPartner({ ...base, kind: 'casino' }).error, /type/);
  assert.ok(cleanPartner({ name: 'X', kind: 'club', city: 'Roma' }, { requireAgreement: false }).partner);
  assert.equal(cleanPartner({ ...base, osmId: 'node/1; drop' }).partner.osmId, null);
});

test('codes, links and proposal', () => {
  assert.match(makeCode('Caffè Nero!'), /^GG-CAFFENERO-[A-Z2-9]{4}$/);
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanEmail('a@b'), '');
  const p = proposalTemplate({ name: 'Bar Luna', kind: 'bar', city: 'Milano' }, { url: 'https://example.com' });
  assert.match(p.subject, /Bar Luna/);
  assert.match(p.body, /discount/);
  assert.match(p.body, /promote GG/);
  assert.match(p.body, /advertise/);
  assert.ok(mailtoUrl('a@b.it', p).startsWith('mailto:a%40b.it?subject='));
});

test('best places come first and "all" mixes restaurants, bars and clubs', async () => {
  const { placeScore, kindOf } = await import('../places-core.js');
  assert.ok(placeScore({ wikidata: 'Q1', website: 'x', opening_hours: 'Mo-Su' }) > placeScore({ brand: 'Chain', amenity: 'fast_food' }));
  assert.equal(kindOf({ amenity: 'nightclub' }), 'club');
  assert.equal(kindOf({ amenity: 'pub' }), 'bar');
  const els = [
    ...[1, 2, 3, 4].map(i => ({ type: 'node', id: i, lat: 45, lon: 9, tags: { name: 'R' + i, amenity: 'restaurant', website: 'r.it', wikidata: 'Q' } })),
    { type: 'node', id: 10, lat: 45, lon: 9, tags: { name: 'Bar A', amenity: 'bar' } },
    { type: 'node', id: 11, lat: 45, lon: 9, tags: { name: 'Club A', amenity: 'nightclub' } },
  ];
  const all = toPlaces({ elements: els }, 'all', { lat: 45, lon: 9 });
  assert.deepEqual(all.slice(0, 3).map(p => p.kind).sort(), ['bar', 'club', 'restaurant']);
  assert.deepEqual(all.map(p => p.rank), [1, 2, 3, 4, 5, 6]);
  assert.match(overpassQuery('all', 45, 9), /nightclub/);
});
