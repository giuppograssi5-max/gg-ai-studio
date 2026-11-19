// GG · Fammi la spesa: builds a shopping list with AI, lets the user choose each product,
// then hands the cart to Amazon's official add-to-cart page, where the user reviews and pays.
import { MARKETPLACES, parseAsin, cartUrl, searchUrl, clampQty, MAX_ITEMS, freshUrl, shoppingListText } from './shop-core.js';
import { initShoppingVoice } from './shop-voice.js';
const $s = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const STORE = 'gg-shopping-list';

const section = el('section', null, 'view hidden shop-view');
section.id = 'shop';
section.innerHTML = `<div class="shop-heading"><span>GG · FAMMI LA SPESA</span><h2>Fammi la spesa</h2><p>La tua lista, il tuo negozio. Organizza la spesa qui e scegli i prodotti su Amazon Fresh o Amazon.</p></div>
<fieldset class="shop-services"><legend>Dove vuoi fare la spesa?</legend>
<label class="shop-service"><input type="radio" name="shop-service" value="fresh" checked><span><b>Amazon Fresh</b><small>Alimentari e spesa a domicilio · Italia</small></span></label>
<label class="shop-service"><input type="radio" name="shop-service" value="amazon"><span><b>Amazon</b><small>Dispensa, casa e prodotti di ogni giorno</small></span></label></fieldset>
<div class="shop-account"><div><span class="shop-account-label">GG · AMAZON FRESH</span><strong id="shop-account-title">Prepara qui, concludi su Amazon</strong><p id="shop-account-description">Prepara la lista con la chat o la voce di GG. Poi continua su Amazon Fresh per scegliere i prodotti e concludere l’ordine su Amazon.</p></div><button type="button" id="shop-prepare-fresh" aria-describedby="shop-account-description" aria-controls="shop-form">Prepara la spesa con Fresh</button></div>
<p id="shop-service-note" class="shop-hint"></p>
<div class="shop-safe" role="note"><strong>Accesso e acquisto su Amazon</strong><p>GG non collega né sincronizza il tuo account. Password, indirizzo e pagamento restano su Amazon. Prime è un abbonamento: vantaggi, disponibilità Fresh per il tuo CAP e consegna si verificano su Amazon.</p></div>
<div class="shop-chat" aria-labelledby="shop-chat-title">
<div class="shop-chat-heading"><div><span>GG · CHAT AI</span><h3 id="shop-chat-title">Parliamo della tua spesa</h3></div><span class="shop-connection">L’ordine si conclude su Amazon</span></div>
<p class="shop-chat-connection">GG ti aiuta a preparare la lista. Scegli i prodotti e concludi l’ordine su Amazon; la lista GG non viene trasferita al carrello.</p>
<div id="shop-chat-log" class="shop-chat-log" role="log" aria-live="polite" aria-label="Conversazione sulla spesa"><div class="shop-message shop-message-assistant">Ciao, sono GG. Dimmi per quante persone fai la spesa, cosa ti serve e le tue preferenze. Possiamo prepararla insieme.</div></div>
<form id="shop-form" class="shop-chat-form"><label for="shop-text">Scrivi a GG</label><textarea id="shop-text" rows="2" maxlength="3000" placeholder="Es. Aiutami a organizzare la spesa per due persone, senza lattosio" required></textarea>
<div class="shop-row"><label>Negozio <select id="shop-market"></select></label><button class="shop-primary" type="submit">Invia a GG</button></div></form></div>
<p id="shop-status" role="status" aria-live="polite"></p>
<div id="shop-list" class="shop-list"></div>
<div id="shop-cart" class="shop-cart" hidden></div>`;
$s('.main').append(section);
initShoppingVoice(section);
section.querySelector('.shop-heading').after(section.querySelector('.shop-account'));
section.querySelector('.shop-robot').after(section.querySelector('.shop-chat'));

const portals = el('div', null, 'shop-portals');
portals.innerHTML = `<h3>Alimentari, vini e altro</h3><p>Esplora i fornitori e verifica consegna nella tua zona, disponibilità, costo totale e tempi. Questi collegamenti aprono i portali: GG non confronta prezzi in tempo reale né inoltra ordini a questi negozi.</p><div class="shop-portal-links"></div><p>Per gli alcolici devi avere l’età legale richiesta nel Paese di consegna; il venditore verifica età e restrizioni.</p>`;
for (const [name, url] of [['Carrefour · alimentari', 'https://www.carrefour.it/'], ['Everli · supermercati', 'https://www.everli.com/'], ['Tannico · vini e champagne', 'https://www.tannico.it/'], ['Vivino · vini nel mondo', 'https://www.vivino.com/'], ['Instacart · Nord America', 'https://www.instacart.com/']]) {
  const a = el('a', name + ' ↗'); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; portals.querySelector('.shop-portal-links').append(a);
}
section.append(portals);
const payment = el('div', null, 'shop-safe shop-payment');
payment.innerHTML = `<strong>Prima dell’acquisto: registra la carta sul portale</strong><p>1. Accedi al fornitore e aggiungi la carta nella sua area pagamenti.<br>2. Chiedi a GG di preparare la lista e controlla prodotti e quantità.<br>3. Sul portale verifica prezzo totale, indirizzo e consegna, poi conferma l’ordine. GG non verifica la carta e non esegue addebiti o acquisti automatici. Non inserire numeri di carta o CVV nella chat o nella richiesta vocale.</p><a id="shop-payment-link" target="_blank" rel="noopener noreferrer">Gestisci le carte su Amazon ↗</a>`;
section.querySelector('.shop-chat').after(payment);

const nav = el('button', '🛒 Fammi la spesa', 'nav');
nav.type = 'button';
$s('.sidebar nav').append(nav);
const sel = $s('#shop-market');
sel.append(new Option('Amazon Fresh', 'fresh'));
for (const [k, v] of Object.entries(MARKETPLACES)) sel.append(new Option(v.label, k));

let service = 'fresh';
let state = { market: 'it', items: [] };
let cfg = { catalog: false, partnerTag: null };
try {
  const saved = JSON.parse(localStorage.getItem(STORE) || 'null');
  if (saved && Array.isArray(saved.items)) {
    state = { market: MARKETPLACES[saved.market] ? saved.market : 'it', items: saved.items.slice(0, MAX_ITEMS) };
    if (saved.service === 'amazon' || state.market !== 'it') service = 'amazon';
  }
} catch {}
sel.value = service === 'fresh' ? 'fresh' : state.market;
const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ market: state.market, service, items: state.items.map(({ options, loading, ...i }) => i) })); } catch {} };
const status = t => { $s('#shop-status').textContent = t; };

let cfgLoaded = false;
async function loadConfig() {
  if (cfgLoaded) return;
  try { const r = await fetch('/gg-shopping/config'); if (r.ok) { cfg = await r.json(); cfgLoaded = true; } } catch {}
}

export function openShopping(prompt = '') {
  if (typeof view === 'function') view('shop');
  document.querySelectorAll('.sidebar .nav').forEach(n => n.classList.toggle('active', n === nav));
  $s('#viewtitle').textContent = 'Fammi la spesa';
  loadConfig().then(render);
  if (prompt) { $s('#shop-text').value = prompt; $s('#shop-form').requestSubmit(); }
}
nav.onclick = () => openShopping();
window.openShopping = openShopping;

// Both store controls and the preparation button share the same selection path.
function selectStore(value) {
  const previousMarket = state.market;
  service = value === 'fresh' ? 'fresh' : 'amazon';
  state.market = value === 'fresh' ? 'it' : value;
  if (state.market !== previousMarket) state.items.forEach(i => { i.options = null; });
  save();
  render();
  if (service === 'amazon') searchAll();
}
sel.onchange = () => selectStore(sel.value);
document.querySelectorAll('input[name="shop-service"]').forEach(input => {
  input.onchange = () => selectStore(input.value === 'fresh' ? 'fresh' : state.market);
});
$s('#shop-prepare-fresh').onclick = () => {
  selectStore('fresh');
  status('Amazon Fresh selezionato. Prepara la lista qui; l’ordine si conclude su Amazon.');
  $s('#shop-form').scrollIntoView({ block: 'center', behavior: 'instant' });
  $s('#shop-text').focus({ preventScroll: true });
};

function renderService() {
  document.querySelectorAll('input[name="shop-service"]').forEach(input => {
    input.checked = input.value === service;
  });
  sel.value = service === 'fresh' ? 'fresh' : state.market;
  $s('#shop-payment-link').href = `https://${MARKETPLACES[state.market].domain}/cpe/yourpayments/wallet`;
  $s('#shop-service-note').textContent = service === 'fresh'
    ? 'Fresh: cerca ogni prodotto e aggiungilo su Amazon. La lista GG non viene trasferita automaticamente al carrello Fresh.'
    : 'Amazon: scegli i prodotti e apri la pagina per aggiungerli al carrello. Puoi usare i vantaggi Prime disponibili per il tuo account.' + (state.market !== 'it' ? ' Il collegamento Fresh di GG è disponibile per Amazon.it.' : '');
}

// Conversation stays in this page session; it is never an Amazon cart.
const conversation = [];
function chatMessage(role, text) {
  const log = $s('#shop-chat-log');
  const message = el('div', text, 'shop-message shop-message-' + role);
  log.append(message);
  log.scrollTop = log.scrollHeight;
  return message;
}
$s('#shop-form').onsubmit = async e => {
  e.preventDefault();
  const btn = e.target.querySelector('button[type=submit]'), input = $s('#shop-text');
  const text = input.value.trim();
  if (!text || btn.disabled) return;
  chatMessage('user', text);
  const pending = chatMessage('assistant', 'GG sta rispondendo…');
  pending.classList.add('is-pending');
  btn.disabled = true;
  input.value = '';
  status('');
  try {
    const r = await fetch('/gg-shopping/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [...conversation, { role: 'user', content: text }], marketplace: state.market, service }),
      signal: AbortSignal.timeout(45000),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.reply) throw Error(data.error || 'Chat non disponibile. Riprova.');
    pending.textContent = data.reply;
    conversation.push({ role: 'user', content: text }, { role: 'assistant', content: data.reply });
    conversation.splice(0, Math.max(0, conversation.length - 16));
  } catch (err) {
    pending.textContent = err.name === 'TimeoutError' ? 'La risposta sta impiegando troppo tempo. Riprova.' : err.message;
    input.value = text;
    status('Messaggio non inviato. La richiesta è rimasta nel campo di testo.');
  } finally {
    pending.classList.remove('is-pending');
    btn.disabled = false;
    input.focus();
  }
};

// Search sequentially: Amazon's catalog API allows about one request per second.
let searching = false;
async function searchAll() {
  await loadConfig();
  if (service === 'fresh' || !cfg.catalog || searching) return;
  searching = true;
  try {
    for (const item of state.items) {
      if (item.options || item.skip || !state.items.includes(item)) continue;
      item.loading = true; render();
      try {
        const r = await fetch(`/gg-shopping/search?m=${state.market}&q=${encodeURIComponent(item.query)}`);
        const data = await r.json().catch(() => ({}));
        item.options = data.mode === 'catalog' ? data.products : [];
        if (r.status === 429) { item.options = null; await new Promise(res => setTimeout(res, 2500)); }
      } catch { item.options = []; }
      item.loading = false; render();
      await new Promise(res => setTimeout(res, 1100));
    }
  } finally { searching = false; }
}

function productCard(item, p) {
  const label = el('label', null, 'shop-product');
  const radio = el('input'); radio.type = 'radio'; radio.name = 'pick-' + item.id; radio.checked = item.asin === p.asin;
  radio.onchange = () => { item.asin = p.asin; item.chosen = { title: p.title, price: p.price }; save(); render(); };
  label.append(radio);
  if (p.image) { const img = el('img'); img.src = p.image; img.alt = ''; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; label.append(img); }
  const info = el('span'); info.append(el('b', p.title), el('em', p.price || 'Prezzo su Amazon'));
  if (p.url) { const a = el('a', 'Dettagli ↗'); a.href = p.url; a.target = '_blank'; a.rel = 'noopener noreferrer sponsored'; info.append(a); }
  label.append(info);
  return label;
}

function render() {
  renderService();
  const list = $s('#shop-list');
  list.replaceChildren();
  state.items.forEach(item => {
    const row = el('article', null, 'shop-item' + (item.skip ? ' is-skipped' : '') + (item.asin ? ' is-chosen' : ''));
    const head = el('div', null, 'shop-item-head');
    const title = el('div'); title.append(el('strong', item.name)); if (item.note) title.append(el('small', item.note));
    const qty = el('input'); qty.type = 'number'; qty.min = 1; qty.max = 20; qty.value = item.quantity; qty.setAttribute('aria-label', 'Quantità di ' + item.name);
    qty.onchange = () => { item.quantity = clampQty(qty.value); qty.value = item.quantity; save(); renderCart(); };
    const skip = el('button', item.skip ? 'Includi' : 'Non comprare'); skip.type = 'button';
    skip.onclick = () => { item.skip = !item.skip; save(); render(); };
    const del = el('button', '×', 'shop-del'); del.type = 'button'; del.setAttribute('aria-label', 'Rimuovi ' + item.name);
    del.onclick = () => { state.items = state.items.filter(i => i !== item); save(); render(); };
    head.append(title, qty, skip, del);
    row.append(head);
    if (!item.skip) {
      if (service === 'amazon' && item.loading) row.append(el('p', 'Cerco su Amazon…', 'shop-hint'));
      else if (service === 'amazon' && item.options?.length) { const grid = el('div', null, 'shop-products'); item.options.forEach(p => grid.append(productCard(item, p))); row.append(grid); }
      const pick = el('div', null, 'shop-pick');
      const link = el('a', `Cerca “${item.query}” su ${service === 'fresh' ? 'Amazon Fresh' : MARKETPLACES[state.market].label} ↗`); link.href = service === 'fresh' ? freshUrl(item.query) : searchUrl(state.market, item.query, cfg.partnerTag); link.target = '_blank'; link.rel = 'noopener noreferrer sponsored';
      const paste = el('input'); paste.placeholder = item.asin && !item.chosen ? `Scelto: ${item.asin}` : 'Incolla il link del prodotto scelto (o il codice ASIN)'; paste.setAttribute('aria-label', 'Link del prodotto scelto per ' + item.name);
      paste.onchange = () => {
        const asin = parseAsin(paste.value);
        if (!asin) { status('Link non riconosciuto: copia l’indirizzo della pagina del prodotto su Amazon.'); return; }
        item.asin = asin; item.chosen = null; save(); render(); status(`Prodotto scelto per “${item.name}”.`);
      };
      if (service === 'amazon' && item.chosen) pick.append(el('p', `✓ ${item.chosen.title}${item.chosen.price ? ' · ' + item.chosen.price : ''}`, 'shop-hint'));
      pick.append(link);
      if (service === 'amazon') pick.append(paste);
      row.append(pick);
    }
    list.append(row);
  });
  renderCart();
}

function renderCart() {
  const box = $s('#shop-cart');
  const active = state.items.filter(i => !i.skip);
  const ready = active.filter(i => i.asin), missing = active.filter(i => !i.asin);
  box.hidden = service !== 'fresh' && !state.items.length;
  box.replaceChildren();
  box.append(el('h3', service === 'fresh' ? 'La tua lista per Fresh' : 'Il tuo carrello Amazon'), el('p', service === 'fresh' ? `${active.length} prodotti in lista. Continua su Fresh, verifica il CAP e scegli i prodotti su Amazon.` : `${ready.length} di ${active.length} prodotti scelti${missing.length ? ` · da scegliere: ${missing.map(i => i.name).join(', ')}` : ''}.`));
  const actions = el('div', null, 'shop-row');
  const go = el('a', service === 'fresh' ? 'Continua su Amazon Fresh' : `Apri il carrello su ${MARKETPLACES[state.market].label}`, 'shop-primary');
  if (service === 'fresh' || ready.length) { go.href = service === 'fresh' ? freshUrl() : cartUrl(state.market, ready, cfg.partnerTag); go.target = service === 'fresh' ? '_self' : '_blank'; go.rel = 'noopener noreferrer sponsored'; go.onclick = save; }
  else { go.setAttribute('aria-disabled', 'true'); go.classList.add('is-disabled'); }
  const clear = el('button', 'Svuota lista'); clear.type = 'button';
  clear.onclick = () => { if (confirm('Svuotare la lista della spesa?')) { state.items = []; save(); render(); status(''); } };
  const copy = el('button', 'Copia lista'); copy.type = 'button'; copy.disabled = !active.length;
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(shoppingListText(state.items)); status('Lista copiata. Puoi consultarla mentre fai la spesa su Amazon.'); }
    catch { status('Copia non disponibile in questo browser. Puoi selezionare i prodotti dalla lista qui sopra.'); }
  };
  actions.append(go, copy, clear);
  box.append(actions, el('p', (service === 'fresh' ? 'La lista resta salvata su questo dispositivo quando torni indietro. Il carrello Fresh si gestisce su Amazon e resta separato dalla lista GG. ' : '') + 'Amazon ti chiede di confermare i prodotti, poi completi l’ordine con il tuo account. Prezzi e disponibilità sono quelli mostrati da Amazon al momento dell’acquisto.' + (cfg.partnerTag ? ' Alcuni link sono link di affiliazione Amazon: GG può ricevere una commissione, senza costi per te.' : ''), 'shop-hint'));
}

// "Fammi la spesa …" typed in the chat opens this tool with the request.
const INTENT = /^\s*(?:(?:hey\s+|ehi\s+)?g\s*g[\s,:]+)?(fammi la spesa|fai la spesa|fare la spesa|lista della spesa|compra(mi)? su amazon|ordina su amazon|ordinami|comprami)\b[\s:,]*/i;
window.addEventListener('submit', e => {
  if (e.target?.id !== 'chatform') return;
  const input = $s('#prompt'), value = input?.value || '';
  if (!INTENT.test(value)) return;
  e.preventDefault(); e.stopImmediatePropagation();
  input.value = '';
  openShopping(value.replace(INTENT, '').trim());
}, true);

render();
