// GG Places: find restaurants, clubs and bars, show GG deals from partner places,
// let venues join the partner programme and let admins contact places with a proposal.
import { KINDS, kindInfo, proposalTemplate, mailtoUrl, STATUSES } from './places-core.js';
import { createPlacesMap, COLORS } from './places-map.js?v=20261118-visible-pins';
const $p = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const kindOptions = () => Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`).join('');

const CITIES = [['Milano', 45.4642, 9.19], ['Roma', 41.8986, 12.4769], ['Napoli', 40.8399, 14.2525], ['Firenze', 43.7696, 11.2558], ['Paris', 48.8606, 2.3376], ['London', 51.5136, -0.1340], ['Barcelona', 41.3828, 2.1770], ['Ibiza', 38.9089, 1.4329], ['Berlin', 52.5200, 13.4050], ['New York', 40.7231, -73.9990], ['Miami', 25.7743, -80.1937], ['Tokyo', 35.6595, 139.7005], ['Dubai', 25.1972, 55.2744]];
const section = el('section', null, 'view hidden places-view');
section.id = 'places';
section.innerHTML = `<div class="places-heading"><span>GG · PLACES</span><h2>Restaurants, clubs & bars</h2><p>Find the best places to eat and go out in any city, on a 3D map. Places marked <b class="places-badge">GG deal</b> are GG partners: they give GG users a special discount.</p><p class="places-ask"><button type="button" class="places-link" id="places-ask-members">💬 Ask GG members for tips</button> · <button type="button" class="places-link" id="places-meet-members">🤝 Meet members near you</button></p></div>
<form id="places-form" class="places-form"><label class="places-grow">City or neighbourhood<input id="places-city" maxlength="80" placeholder="e.g. Milano Navigli, Roma Trastevere, London Soho" required></label>
<label>Looking for<select id="places-kind"><option value="all">📍 All: restaurants, bars & clubs</option>${kindOptions()}</select></label>
<label class="places-check"><input type="checkbox" id="places-deals"> Only GG deals</label>
<button class="places-primary" type="submit">Search</button></form>
<p id="places-status" role="status" aria-live="polite"></p>
<div class="places-cities" aria-label="Fly to a city">${CITIES.map(([n, la, lo]) => `<button type="button" data-lat="${la}" data-lon="${lo}" data-name="${n}">${n}</button>`).join('')}</div>
<div id="places-mapwrap" class="places-mapwrap"><div id="places-map" class="places-map" aria-label="3D world map of restaurants, bars and clubs"></div>
<div class="places-maptools"><button type="button" id="places-world">🌍 World</button><button type="button" id="places-3d" aria-pressed="true">2D view</button><button type="button" id="places-spin" aria-pressed="true">⏸ Stop rotation</button></div>
<p id="places-maphint" class="places-maphint">Choose a city above or search to see large colored venue markers. Orange: restaurants. Select a marker for details. Zoom in to discover more places from OpenStreetMap.</p>
<div class="places-legend">${Object.entries(KINDS).map(([k, v]) => `<span><i style="background:${COLORS[k]}"></i>${v.label}</span>`).join('')}<span><i class="is-deal"></i>GG deal</span><span>Numbered markers: top picks</span></div></div>
<h3 id="places-top-title" class="places-top-title" hidden>Top picks</h3>
<div id="places-results" class="places-results"></div>
<section class="places-partner" aria-labelledby="places-partner-title"><div><span class="places-kicker">FOR OWNERS</span><h3 id="places-partner-title">Own a restaurant, club or bar?</h3>
<p>Offer GG users a discount and help promote GG (a QR code or sticker at the counter, or a post on your socials). In return GG advertises your place for free: a <b>GG deal</b> badge, a top spot in local results and links to your contacts. No cost, and you can stop anytime.</p></div>
<form id="places-join" class="places-join"><input name="company" tabindex="-1" autocomplete="off" class="places-hp" aria-hidden="true">
<label>Name of the place<input name="name" maxlength="100" required></label><label>Type<select name="kind">${kindOptions()}</select></label>
<label>City<input name="city" maxlength="80" required></label><label>Address<input name="address" maxlength="160"></label>
<label>Your name<input name="contactName" maxlength="80"></label><label>Email<input name="contactEmail" type="email" maxlength="254" required></label>
<label>Phone<input name="phone" maxlength="40"></label><label>Website or Instagram<input name="website" maxlength="300"></label>
<label class="places-wide">Discount for GG users<input name="discount" maxlength="200" placeholder="e.g. 10% off the bill, a free drink with dinner, free entry before midnight" required></label>
<label class="places-wide places-check"><input type="checkbox" name="promotesGg" required> We agree to promote GG to our customers, and GG advertises our place in return.</label>
<button class="places-primary" type="submit">Send partner request</button><p id="places-join-status" class="places-hint" role="status"></p></form></section>
<section id="places-admin" class="places-admin" hidden><h3>Partners · admin</h3><p class="places-hint">Places you contacted and partner requests. A place gets its GG deal once it is <b>active</b>.</p><div id="places-admin-list"></div></section>
<dialog id="places-dialog" class="places-dialog"><form method="dialog"><h3>Invite <span id="places-d-name"></span></h3>
<label>To<input id="places-d-to" type="email" placeholder="Email of the place"></label><label>Subject<input id="places-d-subject"></label><label>Message<textarea id="places-d-body" rows="14"></textarea></label>
<p id="places-d-contacts" class="places-hint"></p>
<div class="places-row"><a id="places-d-mail" class="places-primary" target="_blank" rel="noopener">✉ Open in my email</a><button type="button" id="places-d-copy">Copy message</button><button type="button" id="places-d-mark">Mark as contacted</button><button value="close">Close</button></div></form></dialog>`;
$p('.main').append(section);

const nav = el('button', '🍽 Restaurants & clubs', 'nav');
nav.type = 'button';
$p('.sidebar nav').append(nav);

let last = { places: [], admin: false, signedIn: false, city: '' };
let pmap = null;
const cards = new Map();
let areaReq = 0, areaName = '';
// Load the places around the point the user is looking at on the map.
async function loadArea({ lat, lon }) {
  const id = ++areaReq, kind = $p('#places-kind').value;
  status(`Looking for ${kindInfo(kind).label.toLowerCase()} ${areaName ? 'in ' + areaName : 'in this area'}…`);
  try {
    const data = await api(`/search?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&kind=${kind}${areaName ? '&city=' + encodeURIComponent(areaName) : ''}`);
    if (id !== areaReq) return;
    last = data;
    if (areaName) $p('#places-city').value = areaName;
    render({ fit: false });
  } catch (err) { if (id === areaReq) status(err.message); }
  areaName = '';
}
function ensureMap() {
  if (pmap) return pmap;
  $p('#places-mapwrap').hidden = false;
  pmap = createPlacesMap($p('#places-map'), { onArea: loadArea, onSelect: p => { const c = cards.get(p); if (c) { highlight(c); c.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } } });
  pmap.ready.catch(err => { $p('#places-mapwrap').hidden = true; pmap = null; status(err.message + ' The list below still works.'); });
  return pmap;
}
function highlight(c) { document.querySelectorAll('.places-card.is-active').forEach(x => x.classList.remove('is-active')); c.classList.add('is-active'); }
$p('#places-world').onclick = () => { areaReq++; ensureMap().world(); };
section.querySelector('.places-cities').onclick = e => {
  const b = e.target.closest('button[data-lat]');
  if (!b) return;
  areaName = b.dataset.name;
  status(`Flying to ${areaName}…`);
  ensureMap().ready.then(() => pmap.flyTo(+b.dataset.lat, +b.dataset.lon)).catch(() => {});
};
$p('#places-3d').onclick = e => { const is3d = pmap?.toggle3d(); e.target.textContent = is3d ? '2D view' : '3D view'; e.target.setAttribute('aria-pressed', String(!!is3d)); };
$p('#places-spin').onclick = e => { const on = pmap?.spin(); e.target.textContent = on ? '⏸ Stop rotation' : '⟳ Rotate'; e.target.setAttribute('aria-pressed', String(!!on)); };
const status = t => { $p('#places-status').textContent = t; };
const api = async (path, opts = {}) => {
  const r = await fetch('/gg-places' + path, { ...opts, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(data.error || 'Service unavailable.');
  return data;
};

export function openPlaces(query = '') {
  if (typeof view === 'function') view('places');
  document.querySelectorAll('.sidebar .nav').forEach(n => n.classList.toggle('active', n === nav));
  $p('#viewtitle').textContent = 'Restaurants & clubs';
  if (query) {
    const isClub = /club|disco|discoteca|nightclub|ballare/i.test(query), isBar = /\b(bar|pub|cocktail|aperitivo|drink)\b/i.test(query), isFood = /restaurant|ristorant|mangiare|cena|pranzo|food/i.test(query);
    $p('#places-kind').value = isClub + isBar + isFood !== 1 ? 'all' : isClub ? 'club' : isBar ? 'bar' : 'restaurant';
    const city = query.match(/.*\b(?:in|a|at|near|vicino a)\s+(.+)$/i)?.[1] || query;
    $p('#places-city').value = city.replace(/[?.!]+$/, '').trim().slice(0, 80);
    $p('#places-form').requestSubmit();
  } else loadAdmin();
  ensureMap();
  setTimeout(() => pmap?.resize(), 50);
}
nav.onclick = () => openPlaces();
window.openPlaces = openPlaces;

$p('#places-form').onsubmit = async e => {
  e.preventDefault();
  const city = $p('#places-city').value.trim(), kind = $p('#places-kind').value;
  if (!city) return;
  syncMapFilters();
  const id = ++areaReq; areaName = '';
  const btn = e.target.querySelector('button'); btn.disabled = true;
  status(`Looking for the best ${kindInfo(kind).label.toLowerCase()} in ${city}…`);
  $p('#places-results').replaceChildren();
  ensureMap().show([], null, { fit: false }).catch(() => {});
  try {
    const data = await api(`/search?city=${encodeURIComponent(city)}&kind=${kind}`);
    if (id !== areaReq) return;
    last = data;
    render();
    loadAdmin();
  } catch (err) { if (id === areaReq) status(err.message); }
  finally { btn.disabled = false; }
};
$p('#places-deals').onchange = () => { syncMapFilters(); render({ fit: false }); };
function syncMapFilters() { ensureMap().setFilters($p('#places-kind').value, $p('#places-deals').checked); }
$p('#places-kind').onchange = () => { syncMapFilters(); if (!last.center) return; if ($p('#places-city').value.trim()) $p('#places-form').requestSubmit(); else loadArea(last.center); };

function render({ fit = true } = {}) {
  const onlyDeals = $p('#places-deals').checked;
  const list = last.places.filter(p => !onlyDeals || p.deal);
  const deals = last.places.filter(p => p.deal).length;
  status([last.warning, `${list.length} ${kindInfo(last.kind)?.label.toLowerCase() || 'places'} in ${last.city}, best first${deals ? ` · ${deals} with a GG deal` : ''}.`, !last.signedIn && deals ? 'Sign in to see your GG discount codes.' : ''].filter(Boolean).join(' '));
  const box = $p('#places-results');
  cards.clear();
  box.replaceChildren(...list.map(p => { const c = card(p); cards.set(p, c); return c; }));
  $p('#places-top-title').hidden = !list.length;
  ensureMap().show(list, last.center, { fit }).catch(() => {});
  $p('#places-maphint').hidden = false;
  if (!list.length) box.append(el('p', onlyDeals ? 'No GG deals here yet. Know a great place? Tell them about the partner programme below.' : 'No places found here. Try a nearby area.', 'places-hint'));
}

function card(p) {
  const c = el('article', null, 'places-card' + (p.deal ? ' has-deal' : ''));
  const head = el('div', null, 'places-card-head');
  const title = el('strong', p.name);
  if (p.rank && p.rank <= 10) title.prepend(el('span', '#' + p.rank, 'places-rank'));
  head.append(title);
  c.style.setProperty('--pin', COLORS[p.kind] || '#111');
  if (p.deal) head.append(el('b', 'GG deal', 'places-badge'));
  c.append(head);
  const meta = [KINDS[p.kind]?.icon + ' ' + (p.cuisine || KINDS[p.kind]?.one), p.address].filter(Boolean).join(' · ');
  c.append(el('p', meta, 'places-meta'));
  if (p.hours) c.append(el('p', '🕑 ' + p.hours, 'places-meta'));
  if (p.deal) {
    const d = el('div', null, 'places-deal');
    d.append(el('span', '🎁 ' + p.deal.discount));
    d.append(p.deal.code ? el('code', p.deal.code) : el('small', 'Sign in to get your code'));
    if (p.deal.code) d.append(el('small', 'Show this code when you order or at the door.'));
    c.append(d);
  }
  const links = el('div', null, 'places-links');
  const link = (label, href) => { const a = el('a', label); a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer'; links.append(a); };
  if (p.website) link('Website ↗', p.website);
  if (p.phone) { const a = el('a', '📞 ' + p.phone); a.href = 'tel:' + p.phone.replace(/[^\d+]/g, ''); links.append(a); }
  if (p.lat != null) { const b = el('button', '📍 Show in 3D'); b.type = 'button'; b.onclick = () => { highlight(c); pmap?.focus(p); $p('#places-mapwrap').scrollIntoView({ behavior: 'smooth', block: 'center' }); }; links.append(b); }
  if (p.lat != null) link('Map ↗', `https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lon}#map=18/${p.lat}/${p.lon}`);
  else if (p.address) link('Map ↗', `https://www.openstreetmap.org/search?query=${encodeURIComponent(p.name + ' ' + p.address)}`);
  if (last.admin && !p.deal) { const b = el('button', '🤝 Invite to partner'); b.type = 'button'; b.onclick = () => invite(p); links.append(b); }
  c.append(links);
  return c;
}

// Admin: write a proposal for a place and send it from the admin's own email.
let current = null;
async function invite(p) {
  current = { ...p, city: last.city };
  const dlg = $p('#places-dialog');
  $p('#places-d-name').textContent = p.name;
  $p('#places-d-to').value = p.email || '';
  $p('#places-d-contacts').textContent = [p.email ? '' : 'No email on the map for this place: find it on their website or socials, or call them.', p.phone && '📞 ' + p.phone, p.website].filter(Boolean).join(' · ');
  const fill = ({ subject, body }) => { $p('#places-d-subject').value = subject; $p('#places-d-body').value = body; syncMail(); };
  fill(proposalTemplate(current, { url: location.origin }));
  $p('#places-d-body').placeholder = 'Writing a personalised message…';
  dlg.showModal();
  try { fill(await api('/proposal', { method: 'POST', body: JSON.stringify({ place: current }) })); } catch {}
}
function syncMail() { $p('#places-d-mail').href = mailtoUrl($p('#places-d-to').value.trim(), { subject: $p('#places-d-subject').value, body: $p('#places-d-body').value }); }
['#places-d-to', '#places-d-subject', '#places-d-body'].forEach(s => { $p(s).oninput = syncMail; });
$p('#places-d-copy').onclick = async () => {
  try { await navigator.clipboard.writeText(`${$p('#places-d-subject').value}\n\n${$p('#places-d-body').value}`); $p('#places-d-copy').textContent = '✓ Copied'; } catch { $p('#places-d-body').select(); }
  setTimeout(() => { $p('#places-d-copy').textContent = 'Copy message'; }, 1500);
};
$p('#places-d-mark').onclick = async () => {
  if (!current) return;
  try {
    await api('/admin', { method: 'POST', body: JSON.stringify({ action: 'save', status: 'contacted', osmId: current.osmId, name: current.name, kind: current.kind, city: current.city.split(',')[0], address: current.address, phone: current.phone, website: current.website, contactEmail: $p('#places-d-to').value }) });
    $p('#places-d-mark').textContent = '✓ Saved'; loadAdmin();
  } catch (err) { $p('#places-d-mark').textContent = err.message; }
  setTimeout(() => { $p('#places-d-mark').textContent = 'Mark as contacted'; }, 2000);
};

// Venue partner request.
$p('#places-join').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, out = $p('#places-join-status'), btn = f.querySelector('button');
  const body = Object.fromEntries(['company', 'name', 'kind', 'city', 'address', 'contactName', 'contactEmail', 'phone', 'website', 'discount'].map(k => [k, f[k].value]));
  body.promotesGg = f.promotesGg.checked;
  btn.disabled = true; out.textContent = 'Sending…';
  try { await api('/partner', { method: 'POST', body: JSON.stringify(body) }); f.reset(); out.textContent = 'Thank you! We review every request and reply by email. Your GG deal goes live once it is approved.'; }
  catch (err) { out.textContent = err.message; }
  btn.disabled = false;
};

// Admin list of partners.
async function loadAdmin() {
  const box = $p('#places-admin');
  let data;
  try { data = await api('/admin'); } catch { box.hidden = true; return; }
  box.hidden = false;
  last.admin = true;
  const list = $p('#places-admin-list');
  list.replaceChildren();
  if (!data.partners.length) list.append(el('p', 'No partners yet. Search for places and use “Invite to partner”.', 'places-hint'));
  for (const p of data.partners) {
    const row = el('div', null, 'places-admin-row is-' + p.status);
    const info = el('div');
    info.append(el('strong', `${KINDS[p.kind]?.icon || ''} ${p.name}`), el('small', [p.city, p.contactName, p.contactEmail, p.phone].filter(Boolean).join(' · ')));
    if (p.code) info.append(el('small', 'Code: ' + p.code));
    const discount = el('input'); discount.value = p.discount; discount.placeholder = 'Agreed discount'; discount.maxLength = 200; discount.setAttribute('aria-label', 'Discount for ' + p.name);
    const promo = el('label', null, 'places-check'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = p.promotesGg; promo.append(cb, document.createTextNode(' Promotes GG'));
    const st = el('select'); STATUSES.forEach(s => st.append(new Option(s, s))); st.value = p.status; st.setAttribute('aria-label', 'Status of ' + p.name);
    const save = el('button', 'Save'); save.type = 'button';
    save.onclick = async () => {
      try { await api('/admin', { method: 'POST', body: JSON.stringify({ ...p, action: 'save', discount: discount.value, promotesGg: cb.checked, status: st.value }) }); save.textContent = '✓'; loadAdmin(); }
      catch (err) { alert(err.message); }
    };
    const del = el('button', '×'); del.type = 'button'; del.setAttribute('aria-label', 'Delete ' + p.name);
    del.onclick = async () => { if (confirm(`Delete ${p.name}?`)) { try { await api('/admin', { method: 'POST', body: JSON.stringify({ action: 'delete', id: p.id }) }); loadAdmin(); } catch (err) { alert(err.message); } } };
    row.append(info, discount, promo, st, save, del);
    list.append(row);
  }
  if (last.places.length) render();
}

// "restaurants in Milano", "clubs near Roma", "ristoranti a Napoli" typed in the chat open this tool.
const VENUE = '(?:restaurants?|ristoranti|clubs?|nightclubs?|discoteche|locali|bars?|pubs?)';
const INTENT = new RegExp(`^\\s*(?:find\\s+|cerca(?:mi)?\\s+|show me\\s+|mostra(?:mi)?\\s+)?(?:(?:the\\s+|i\\s+)?(?:best|migliori|top)\\s+)?${VENUE}(?:(?:\\s*(?:,|&|and|e)\\s*|\\s+)${VENUE})*\\s+(?:in|a|at|near|vicino a)\\s+\\S`, 'i');
window.addEventListener('submit', e => {
  if (e.target?.id !== 'chatform') return;
  const input = $p('#prompt'), value = input?.value || '';
  if (!INTENT.test(value)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  input.value = '';
  openPlaces(value.trim());
}, true);

import('./identity-sdk.js').then(sdk => sdk.onAuthChange(() => { last.admin = false; if (!section.classList.contains('hidden')) { loadAdmin(); if (last.city) $p('#places-form').requestSubmit(); } })).catch(() => {});

document.getElementById('places-ask-members')?.addEventListener('click', () => window.openCommunity?.('rooms', 'places'));
document.getElementById('places-meet-members')?.addEventListener('click', () => window.openCommunity?.('meet'));
