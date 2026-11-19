// GG · VPN: WireGuard connections to GG servers with NordVPN-style features, plus a connection check
// that shows what websites can see and flags common signs that a VPN is (or is not) protecting it.
import { DNS_PRESETS, buildConfig, validExclusion, sha1Hex, breachCount } from './vpn-core.js';
const vq = s => document.querySelector(s);
const ve = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

const vpnView = ve('section', null, 'view hidden vpn-view');
vpnView.id = 'vpn';
vpnView.innerHTML = `<div class="vpn-heading"><span>GG · VPN SICURA</span><h2>VPN GG</h2><p>Connessione WireGuard cifrata ai server di GG, con connessione rapida, protezione dalle minacce, kill switch, split tunneling, Meshnet tra i tuoi dispositivi e controllo delle password violate.</p></div>
<div id="vpn-banner" class="vpn-banner" data-state="unknown" role="status" aria-live="polite"><div><small>STATO</small><strong>Controllo della protezione…</strong><p></p></div><button class="vpn-primary vpn-quick" type="button" disabled>⚡ Connessione rapida</button></div>
<div class="vpn-tabs" role="tablist" aria-label="Sezioni VPN"><button role="tab" data-tab="servers" aria-selected="true">Server</button><button role="tab" data-tab="settings" aria-selected="false">Impostazioni</button><button role="tab" data-tab="devices" aria-selected="false">Dispositivi e Meshnet</button><button role="tab" data-tab="breach" aria-selected="false">Monitoraggio violazioni</button><button role="tab" data-tab="check" aria-selected="false">Controllo connessione</button></div>
<section class="vpn-panel" data-panel="servers" aria-labelledby="vpn-connect-title"><h3 id="vpn-connect-title">Server GG</h3><div id="vpn-access"></div><div class="vpn-output" id="vpn-output"></div></section>
<section class="vpn-panel hidden" data-panel="settings"><h3>Impostazioni di connessione</h3><p class="vpn-lead">Valgono per i prossimi file di configurazione creati da questo browser. Per cambiarle su un dispositivo già collegato, rimuovilo e collegalo di nuovo.</p><div id="vpn-settings"></div></section>
<section class="vpn-panel hidden" data-panel="devices"><h3>Dispositivi e Meshnet</h3><p class="vpn-lead">Con Meshnet attivo, i tuoi dispositivi collegati allo stesso server GG possono raggiungersi tra loro tramite l’indirizzo VPN (condivisione file, desktop remoto, giochi in LAN), ovunque si trovino. I dispositivi di altri utenti restano sempre isolati.</p><div class="vpn-devices" id="vpn-devices"></div></section>
<section class="vpn-panel hidden" data-panel="breach"><h3>Monitoraggio violazioni</h3><p class="vpn-lead">Controlla se una password compare in fughe di dati note. La password non lascia mai il browser: a Have I Been Pwned vengono inviati solo i primi 5 caratteri della sua impronta SHA‑1.</p><form id="vpn-breach" class="vpn-breach"><input type="password" autocomplete="off" placeholder="Password da controllare" aria-label="Password da controllare" required maxlength="200"><button class="vpn-primary" type="submit">Controlla</button></form><p id="vpn-breach-result" role="status" aria-live="polite"></p></section>
<section class="vpn-panel hidden vpn-check" data-panel="check" aria-labelledby="vpn-check-title"><h3 id="vpn-check-title">Controlla la connessione</h3><p class="vpn-lead">Verifica quale IP e quale posizione vedono i siti, e che la VPN non abbia perdite WebRTC.</p>
<div class="vpn-controls"><button class="vpn-primary" id="vpn-run" type="button">Controlla la connessione</button><label class="vpn-toggle"><input type="checkbox" id="vpn-webrtc" checked> Includi test di perdita WebRTC</label></div>
<p class="vpn-note">Il controllo legge i dati della richiesta inviata a GG e non li salva. Il test WebRTC contatta un server STUN pubblico di Google per scoprire quale IP rivela il browser.</p>
<p id="vpn-status" role="status" aria-live="polite"></p><div id="vpn-result"></div></section>`;
vq('.main').append(vpnView);

const vpnNav = ve('button', '⛨ VPN GG', 'nav');
vpnNav.type = 'button';
vq('.sidebar nav').append(vpnNav);

function openVpn() {
  view('vpn');
  vq('#viewtitle').textContent = 'VPN GG';
  loadAccess();
  vpnNav.classList.add('active');
}
vpnNav.onclick = openVpn;
window.openVpnCheck = openVpn;

vpnView.querySelectorAll('[role=tab]').forEach(t => t.onclick = () => showTab(t.dataset.tab));
function showTab(name) {
  vpnView.querySelectorAll('[role=tab]').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
  vpnView.querySelectorAll('.vpn-panel').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== name));
}

// Collect the public IPs the browser exposes through WebRTC (server-reflexive candidates).
function webrtcIps(timeout = 4000) {
  return new Promise(resolve => {
    if (typeof RTCPeerConnection !== 'function') return resolve(null);
    const found = new Set();
    let pc;
    const done = () => { try { pc.close(); } catch {} resolve([...found]); };
    try {
      pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('gg');
      pc.onicecandidate = ev => {
        if (!ev.candidate) return done();
        const c = ev.candidate.candidate || '';
        const m = c.match(/ ([0-9a-f.:]+) \d+ typ srflx/i);
        if (m) found.add(m[1]);
      };
      pc.createOffer().then(o => pc.setLocalDescription(o)).catch(done);
      setTimeout(done, timeout);
    } catch { resolve(null); }
  });
}

// Compare timezones by current UTC offset, so equivalent zones (e.g. Europe/Rome vs Europe/Berlin) match.
function offsetOf(tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || null;
  } catch { return null; }
}

function card(label, value, detail, badge) {
  const c = ve('article', null, 'vpn-card');
  c.append(ve('small', label), ve('b', value || 'Non disponibile'));
  if (detail) c.append(ve('p', detail));
  if (badge) { const b = ve('span', badge.text, 'vpn-badge'); b.dataset.tone = badge.tone; c.append(b); }
  return c;
}

async function runCheck() {
  const btn = vq('#vpn-run'), status = vq('#vpn-status'), out = vq('#vpn-result');
  btn.disabled = true; status.textContent = 'Controllo in corso…'; out.replaceChildren();
  try {
    const [res, rtc] = await Promise.all([
      fetch('/gg-connection', { cache: 'no-store' }),
      vq('#vpn-webrtc').checked ? webrtcIps() : Promise.resolve(undefined),
    ]);
    if (!res.ok) throw new Error('unavailable');
    const data = await res.json();
    render(data, rtc);
    status.textContent = 'Controllo completato alle ' + new Date(data.checkedAt).toLocaleTimeString('it-IT');
  } catch {
    status.textContent = 'Impossibile completare il controllo. Verifica la connessione e riprova.';
  } finally { btn.disabled = false; }
}

function render(d, rtc) {
  const out = vq('#vpn-result');
  const loc = d.location || {};
  const place = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
  const deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const tzMismatch = loc.timezone && deviceTz && offsetOf(loc.timezone) !== offsetOf(deviceTz);
  const browserRegion = (navigator.language || '').split('-')[1]?.toUpperCase();
  const langMismatch = browserRegion && loc.countryCode && browserRegion !== loc.countryCode.toUpperCase();
  const leaked = Array.isArray(rtc) ? rtc.filter(ip => ip !== d.ip) : [];

  // Overall verdict
  const verdict = ve('div', null, 'vpn-verdict');
  let title, text, tone;
  if (leaked.length) {
    tone = 'warn'; title = 'Possibile perdita WebRTC';
    text = 'Il browser rivela un indirizzo IP diverso da quello della connessione. Se usi una VPN, il tuo IP reale potrebbe essere visibile ai siti: attiva la protezione WebRTC della VPN o del browser.';
  } else if (tzMismatch) {
    tone = 'good'; title = 'La connessione sembra passare da una VPN o un proxy';
    text = `I siti ti collocano in ${place || 'un’altra zona'}, ma l’orologio del dispositivo usa il fuso ${deviceTz}. È il segnale tipico di una VPN attiva su un server in un altro paese.`;
  } else {
    tone = 'neutral'; title = 'Nessun segno evidente di VPN';
    text = `I siti vedono una posizione approssimativa ${place ? 'in ' + place : 'non determinata'}, coerente con il fuso orario del dispositivo. Se hai attivato una VPN con server in un altro paese, probabilmente non sta funzionando. Una VPN con server nel tuo paese può comunque risultare così.`;
  }
  verdict.dataset.tone = tone;
  verdict.append(ve('strong', title), ve('p', text));

  const grid = ve('div', null, 'vpn-grid');
  grid.append(
    card('Indirizzo IP pubblico', d.ip, d.ipVersion ? `IPv${d.ipVersion} · visibile a ogni sito che visiti` : null),
    card('Posizione approssimativa', place, loc.latitude != null ? `Coordinate circa ${loc.latitude}, ${loc.longitude} (precisione a livello di città o regione)` : 'Ricavata dall’indirizzo IP'),
    card('Fuso orario', loc.timezone, `Dispositivo: ${deviceTz || 'non disponibile'}`,
      loc.timezone ? (tzMismatch ? { tone: 'good', text: 'Diverso dal dispositivo' } : { tone: 'neutral', text: 'Coincide con il dispositivo' }) : null),
    card('Test WebRTC',
      rtc === undefined ? 'Non eseguito' : rtc === null ? 'Non supportato' : rtc.length ? rtc.join(', ') : 'Nessun IP esposto',
      rtc === undefined ? 'Attiva l’opzione per verificare le perdite di IP.' : 'IP pubblici rivelati dal browser tramite WebRTC.',
      Array.isArray(rtc) ? (leaked.length ? { tone: 'warn', text: 'IP diverso: possibile perdita' } : { tone: 'good', text: 'Nessuna perdita rilevata' }) : null),
    card('Lingua del browser', navigator.language, d.acceptLanguage ? `Inviata ai siti: ${d.acceptLanguage}` : null,
      langMismatch ? { tone: 'neutral', text: 'Paese diverso dalla posizione IP' } : null),
    card('Connessione al sito', location.protocol === 'https:' ? 'Cifrata (HTTPS)' : 'Non cifrata',
      d.doNotTrack ? 'Il browser chiede di non essere tracciato (DNT/GPC).' : 'Il browser non invia segnali Do Not Track o GPC.'),
    card('Browser e sistema', d.userAgent, 'Informazioni tecniche inviate a ogni sito (user agent).'),
  );

  const tips = ve('div', null, 'vpn-tips');
  tips.append(ve('h3', 'Consigli per una connessione più riservata'));
  const ul = ve('ul');
  ['Attiva la VPN prima di aprire il browser e ripeti il controllo: IP e posizione dovrebbero cambiare.',
   'Se il test WebRTC rileva un IP diverso, abilita la protezione WebRTC o il “kill switch” nelle impostazioni della VPN.',
   'Una VPN nasconde l’IP, ma i siti possono riconoscerti tramite account, cookie e dati del browser.',
   'Sulle reti Wi‑Fi pubbliche usa sempre siti HTTPS e, se possibile, una VPN affidabile.'].forEach(t => ul.append(ve('li', t)));
  tips.append(ul);

  out.replaceChildren(verdict, grid, tips);
}

vq('#vpn-run').onclick = runCheck;

// ---- GG secure VPN connections ----
// The WireGuard key pair is generated in this browser; only the public key is sent to GG.
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const flag = code => /^[A-Z]{2}$/.test(code || '') ? String.fromCodePoint(...[...code].map(c => 127397 + c.charCodeAt(0))) : '🌐';
const FEATURE_LABELS = { p2p: 'P2P', double: 'Double VPN', obfuscated: 'Offuscato', dedicated: 'IP dedicato', streaming: 'Streaming' };
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem('gg-vpn-' + key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('gg-vpn-' + key, JSON.stringify(value)); } catch {} },
};
const guessPlatform = () => {
  const p = (navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '').toLowerCase();
  if (/android/.test(navigator.userAgent.toLowerCase())) return 'android';
  if (/iphone|ipad|ios/.test(p) || /iphone|ipad/.test(navigator.userAgent.toLowerCase())) return 'ios';
  if (/mac/.test(p)) return 'macos';
  if (/win/.test(p)) return 'windows';
  if (/linux/.test(p)) return 'linux';
  return 'other';
};
const settings = Object.assign({ dnsPreset: 'adblock', killSwitch: true, platform: guessPlatform(), allowLan: false, exclude: [], meshnet: false }, store.get('settings', {}));
const favorites = new Set(store.get('favorites', []));
const saveSettings = () => store.set('settings', settings);

async function wireGuardKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'X25519' }, true, ['deriveBits']);
  const publicKey = b64(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)));
  const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const privateKey = d.replace(/-/g, '+').replace(/_/g, '/') + '=';
  return { publicKey, privateKey };
}

async function vpnApi(path = '', options = {}) {
  const res = await fetch('/gg-vpn' + path, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = Error(data.error || 'Richiesta non riuscita.'); err.data = data; err.status = res.status; throw err; }
  return data;
}

const btn = (text, cls, onclick) => { const b = ve('button', text, cls); b.type = 'button'; if (onclick) b.onclick = onclick; return b; };

let vpnState = null, filter = { text: '', feature: 'all' };
async function loadAccess() {
  const box = vq('#vpn-access');
  box.replaceChildren(ve('p', 'Caricamento dei server GG…', 'vpn-lead'));
  renderSettings();
  try { vpnState = await vpnApi(); renderAccess(); }
  catch (err) {
    vpnState = null;
    const msg = ve('div', null, 'vpn-locked');
    msg.append(ve('strong', err.status === 401 ? 'Accedi per usare la VPN GG' : err.status === 403 ? 'Accesso VPN non abilitato' : 'VPN non disponibile'), ve('p', err.message));
    if (err.status === 401) msg.append(btn('Accedi', 'vpn-secondary', () => document.querySelector('.gg-login')?.click()));
    box.replaceChildren(msg);
    vq('#vpn-devices').replaceChildren(ve('p', 'Accedi con un account abilitato alla VPN per gestire i dispositivi.', 'vpn-lead'));
    renderBanner();
  }
}

function renderBanner() {
  const banner = vq('#vpn-banner'), quick = banner.querySelector('.vpn-quick');
  const [strong, p] = [banner.querySelector('strong'), banner.querySelector('p')];
  const s = vpnState?.servers.find(x => x.id === vpnState.protectedBy);
  if (s) {
    banner.dataset.state = 'on';
    strong.textContent = `Protetto · ${flag(s.countryCode)} ${s.country}${s.city ? ' · ' + s.city : ''}`;
    p.textContent = 'Questo dispositivo naviga attraverso il server GG: i siti vedono l’IP del server, non il tuo.';
  } else {
    banner.dataset.state = 'off';
    strong.textContent = vpnState?.demo ? 'Non protetto · modalità dimostrativa' : 'Non protetto';
    p.textContent = vpnState ? 'Questo browser non sta usando un server GG. Usa la connessione rapida o scegli un server qui sotto.' : 'Accedi con un account abilitato per collegarti ai server GG.';
  }
  const rec = vpnState?.servers.find(x => x.id === vpnState.recommendedId);
  quick.disabled = !rec || full();
  quick.textContent = rec ? `⚡ Connessione rapida · ${flag(rec.countryCode)} ${rec.country}` : '⚡ Connessione rapida';
  quick.title = rec ? 'Sceglie automaticamente il server migliore: il più vicino e meno carico.' : '';
  quick.onclick = () => rec && connect(rec);
}

const full = () => vpnState && vpnState.devices.length >= vpnState.maxDevices;

function loadLabel(s) {
  if (s.online === false) return { text: 'Offline', tone: 'warn' };
  if (s.load == null) return { text: 'Carico n.d.', tone: 'neutral' };
  return { text: `Carico ${s.load}%`, tone: s.load < 50 ? 'good' : s.load < 80 ? 'neutral' : 'warn' };
}

function renderAccess() {
  renderBanner(); renderDevices();
  const box = vq('#vpn-access');
  const { servers } = vpnState;
  if (!servers.length) { box.replaceChildren(ve('p', 'I server GG non sono ancora attivi. Riprova più tardi.', 'vpn-lead')); return; }
  const tools = ve('div', null, 'vpn-tools');
  if (vpnState.demo) tools.append(ve('p', 'Modalità dimostrativa: questi server sono esempi e non permettono una connessione reale. Diventeranno server veri quando l’amministratore configura i server GG.', 'vpn-warning'));
  const search = ve('input'); search.type = 'search'; search.placeholder = 'Cerca paese o città'; search.setAttribute('aria-label', 'Cerca server'); search.value = filter.text;
  search.oninput = () => { filter.text = search.value; drawList(); };
  tools.append(search);
  const used = ['favorites', ...Object.keys(FEATURE_LABELS).filter(f => servers.some(s => s.features.includes(f)))];
  const chips = ve('div', null, 'vpn-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Categorie di server');
  [['all', 'Tutti'], ...used.map(f => [f, f === 'favorites' ? '★ Preferiti' : FEATURE_LABELS[f]])].forEach(([key, label]) => {
    const c = btn(label, 'vpn-chip', () => { filter.feature = key; chips.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === c))); drawList(); });
    c.setAttribute('aria-pressed', String(filter.feature === key));
    chips.append(c);
  });
  tools.append(chips);
  const status = ve('p', full() ? `Hai raggiunto il limite di ${vpnState.maxDevices} dispositivi: rimuovine uno in “Dispositivi e Meshnet”.` : '', 'vpn-form-status'); status.id = 'vpn-connect-status'; status.setAttribute('role', 'status');
  const list = ve('ul', null, 'vpn-server-list');
  box.replaceChildren(tools, status, list);
  drawList();

  function drawList() {
    const q = filter.text.trim().toLowerCase();
    const shown = servers.filter(s => (!q || `${s.country} ${s.city} ${s.countryCode}`.toLowerCase().includes(q))
      && (filter.feature === 'all' || (filter.feature === 'favorites' ? favorites.has(s.id) : s.features.includes(filter.feature))))
      .sort((a, b) => (favorites.has(b.id) - favorites.has(a.id)) || a.country.localeCompare(b.country, 'it'));
    list.replaceChildren();
    if (!shown.length) { list.append(ve('li', 'Nessun server corrisponde alla ricerca.', 'vpn-empty')); return; }
    shown.forEach(s => {
      const li = ve('li', null, 'vpn-server-row');
      const star = btn(favorites.has(s.id) ? '★' : '☆', 'vpn-star', () => {
        favorites.has(s.id) ? favorites.delete(s.id) : favorites.add(s.id); store.set('favorites', [...favorites]); drawList();
      });
      star.setAttribute('aria-label', (favorites.has(s.id) ? 'Rimuovi dai preferiti ' : 'Aggiungi ai preferiti ') + s.country);
      const info = ve('div', null, 'vpn-server-info');
      info.append(ve('strong', `${flag(s.countryCode)} ${s.country}`), ve('small', [s.city, ...s.features.map(f => FEATURE_LABELS[f])].filter(Boolean).join(' · ')));
      const l = loadLabel(s); const badge = ve('span', l.text, 'vpn-badge'); badge.dataset.tone = l.tone;
      if (s.id === vpnState.recommendedId) info.append(ve('span', 'Consigliato', 'vpn-rec'));
      const go = btn(vpnState.protectedBy === s.id ? 'Collegato' : 'Connetti', 'vpn-primary', () => connect(s));
      go.disabled = full() || s.online === false;
      li.append(star, info, badge, go); list.append(li);
    });
  }
}

async function connect(server) {
  const status = vq('#vpn-connect-status') || vq('#vpn-output');
  showTab('servers');
  if (vpnState?.demo) { status.textContent = `Server dimostrativo (${server.country}): nessuna connessione reale finché i server GG non sono configurati.`; return; }
  let keys;
  try { keys = await wireGuardKeys(); }
  catch { status.textContent = 'Il browser non supporta la creazione sicura delle chiavi. Aggiornalo e riprova.'; return; }
  vpnView.querySelectorAll('.vpn-server-row .vpn-primary, .vpn-quick').forEach(b => b.disabled = true);
  status.textContent = `Connessione a ${server.country}…`;
  const name = `${{ windows: 'Windows', macos: 'Mac', linux: 'Linux', ios: 'iPhone/iPad', android: 'Android' }[settings.platform] || 'Dispositivo'} · ${new Date().toLocaleDateString('it-IT')}`;
  try {
    const r = await vpnApi('', { method: 'POST', body: JSON.stringify({ serverId: server.id, name, publicKey: keys.publicKey, meshnet: settings.meshnet }) });
    const text = buildConfig({ privateKey: keys.privateKey, address: r.address, server: r.server, ...settings });
    vpnState.devices.push({ id: r.id, serverId: server.id, name: r.name, address: r.address, meshnet: r.meshnet, createdAt: new Date().toISOString() });
    renderAccess();
    showConfig(text, r);
    vq('#vpn-connect-status').textContent = 'Fatto: apri il file scaricato con l’app WireGuard per attivare la VPN.';
  } catch (err) { status.textContent = err.message; renderBanner(); vpnView.querySelectorAll('.vpn-server-row .vpn-primary').forEach(b => b.disabled = full()); }
}

const KILL_HELP = {
  windows: 'Kill switch: nell’app WireGuard per Windows l’opzione “Blocca il traffico fuori dal tunnel” si attiva da sola con questa configurazione.',
  macos: 'Kill switch: nell’app WireGuard modifica il tunnel e attiva “On-Demand” per riconnetterti in automatico su Wi‑Fi e rete cellulare.',
  ios: 'Kill switch: nell’app WireGuard modifica il tunnel e attiva “On-Demand”, così iOS riattiva la VPN da solo.',
  android: 'Kill switch: in Impostazioni › Rete › VPN tocca l’ingranaggio di WireGuard e attiva “VPN sempre attiva” e “Blocca connessioni senza VPN”.',
  linux: 'Kill switch: il file contiene regole che bloccano tutto il traffico fuori dal tunnel finché la VPN è attiva (usa wg-quick up).',
  other: 'Kill switch: attiva nelle impostazioni di sistema l’opzione che blocca le connessioni senza VPN, se disponibile.',
};

function showConfig(text, r) {
  const out = vq('#vpn-output');
  const fileName = 'GG-' + (r.server.countryCode || r.server.id) + '.conf';
  const download = () => { const a = ve('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' })); a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const copy = btn('Copia', 'vpn-secondary'); copy.onclick = () => navigator.clipboard?.writeText(text).then(() => { copy.textContent = 'Copiato'; });
  const steps = ve('ol', null, 'vpn-steps');
  const split = settings.allowLan || settings.exclude.length;
  ['Installa l’app gratuita WireGuard (wireguard.com/install) sul dispositivo.',
   'Nell’app scegli “Importa tunnel da file” e seleziona il file scaricato.',
   'Attiva il tunnel, poi apri “Controllo connessione”: IP e paese devono essere quelli del server GG.',
   settings.killSwitch && !split ? KILL_HELP[settings.platform] : split ? 'Split tunneling attivo: il kill switch automatico non è disponibile con indirizzi esclusi.' : null,
  ].filter(Boolean).forEach(t => steps.append(ve('li', t)));
  const warn = ve('p', 'Il file contiene la chiave privata del dispositivo: GG non la conserva e non potrà mostrarla di nuovo. Salvalo ora e non condividerlo.', 'vpn-warning');
  const actions = ve('div', null, 'vpn-actions'); actions.append(btn('Scarica file di configurazione', 'vpn-primary', download), copy);
  const details = ve('details'); details.append(ve('summary', 'Mostra configurazione'), ve('pre', text, 'vpn-config'));
  out.replaceChildren(ve('h4', `Connessione pronta · ${flag(r.server.countryCode)} ${r.server.country} · ${DNS_PRESETS[settings.dnsPreset]?.label || ''}`), warn, actions, steps, details);
  download();
}

function renderSettings() {
  const box = vq('#vpn-settings');
  if (box.childElementCount) return;
  const group = (title, help, ...controls) => { const g = ve('fieldset', null, 'vpn-setting'); g.append(ve('legend', title)); if (help) g.append(ve('p', help)); g.append(...controls); return g; };
  const toggle = (label, key, onchange) => {
    const l = ve('label', null, 'vpn-toggle'); const i = ve('input'); i.type = 'checkbox'; i.checked = !!settings[key];
    i.onchange = () => { settings[key] = i.checked; saveSettings(); onchange?.(); }; l.append(i, ' ' + label); return l;
  };
  // Threat protection
  const dnsBox = ve('div', null, 'vpn-radio');
  Object.entries(DNS_PRESETS).forEach(([key, p]) => {
    const l = ve('label'); const i = ve('input'); i.type = 'radio'; i.name = 'vpn-dns'; i.value = key; i.checked = settings.dnsPreset === key;
    i.onchange = () => { settings.dnsPreset = key; saveSettings(); };
    const t = ve('span'); t.append(ve('b', p.label), ve('small', p.detail)); l.append(i, t); dnsBox.append(l);
  });
  // Kill switch
  const platform = ve('select'); platform.setAttribute('aria-label', 'Sistema del dispositivo');
  [['windows', 'Windows'], ['macos', 'macOS'], ['ios', 'iPhone / iPad'], ['android', 'Android'], ['linux', 'Linux'], ['other', 'Altro']].forEach(([v, t]) => { const o = ve('option', t); o.value = v; platform.append(o); });
  platform.value = settings.platform;
  const killHelp = ve('p', KILL_HELP[settings.platform], 'vpn-note');
  platform.onchange = () => { settings.platform = platform.value; saveSettings(); killHelp.textContent = KILL_HELP[platform.value]; };
  // Split tunneling
  const exclude = ve('textarea'); exclude.rows = 3; exclude.placeholder = 'Un indirizzo per riga, es. 203.0.113.10 o 198.51.100.0/24';
  exclude.value = settings.exclude.join('\n'); exclude.setAttribute('aria-label', 'Indirizzi esclusi dalla VPN');
  const exStatus = ve('p', '', 'vpn-note');
  exclude.onchange = () => {
    const lines = exclude.value.split(/[\s,]+/).map(x => x.trim()).filter(Boolean);
    const bad = lines.filter(x => !validExclusion(x));
    settings.exclude = lines.filter(validExclusion).slice(0, 50); saveSettings();
    exStatus.textContent = bad.length ? `Ignorati perché non validi: ${bad.join(', ')}` : settings.exclude.length ? `${settings.exclude.length} indirizzi esclusi dalla VPN.` : '';
  };
  box.replaceChildren(
    group('Protezione dalle minacce', 'Blocca a livello DNS siti malevoli, phishing e, se scegli, pubblicità e tracker su tutte le app del dispositivo.', dnsBox),
    group('Kill switch', 'Blocca la connessione a Internet se la VPN si interrompe, così il tuo IP reale non viene mai esposto. Il traffico IPv6 viene sempre bloccato per evitare perdite.', toggle('Attiva il kill switch', 'killSwitch'), platform, killHelp),
    group('Split tunneling', 'Scegli cosa non passa dalla VPN. Con lo split tunneling attivo il kill switch automatico non è disponibile.', toggle('Consenti l’accesso alla rete locale (stampanti, NAS, TV)', 'allowLan'), exclude, exStatus),
    group('Meshnet', 'Rendi i nuovi dispositivi raggiungibili dagli altri tuoi dispositivi collegati allo stesso server.', toggle('Attiva Meshnet sui nuovi dispositivi', 'meshnet')),
  );
}

function renderDevices() {
  const list = vq('#vpn-devices');
  if (!vpnState) return;
  const { devices, servers } = vpnState;
  list.replaceChildren(ve('h4', `I tuoi dispositivi (${devices.length}/${vpnState.maxDevices})`));
  if (!devices.length) { list.append(ve('p', 'Nessun dispositivo collegato. Scegli un server in “Server” per collegarne uno.', 'vpn-lead')); return; }
  const ul = ve('ul');
  devices.forEach(d => {
    const s = servers.find(x => x.id === d.serverId);
    const peers = devices.filter(x => x.id !== d.id && x.meshnet && d.meshnet && x.serverId === d.serverId);
    const li = ve('li');
    const info = ve('div');
    info.append(ve('span', `${flag(s?.countryCode)} ${d.name}`), ve('small', `${s ? s.country : 'Server rimosso'} · IP VPN ${d.address} · ${new Date(d.createdAt).toLocaleDateString('it-IT')}`));
    if (peers.length) info.append(ve('small', 'Meshnet: raggiunge ' + peers.map(p => `${p.name} (${p.address})`).join(', ')));
    const mesh = ve('label', null, 'vpn-toggle'); const mi = ve('input'); mi.type = 'checkbox'; mi.checked = d.meshnet;
    mi.onchange = async () => {
      mi.disabled = true;
      try { const r = await vpnApi('?id=' + encodeURIComponent(d.id), { method: 'PATCH', body: JSON.stringify({ meshnet: mi.checked }) }); d.meshnet = r.meshnet; renderDevices(); }
      catch (err) { mi.checked = d.meshnet; mi.disabled = false; alert(err.message); }
    };
    mesh.append(mi, ' Meshnet');
    const rm = btn('Rimuovi', 'vpn-secondary', async () => {
      if (!confirm(`Rimuovere “${d.name}”? Il dispositivo non potrà più connettersi.`)) return;
      rm.disabled = true;
      try { await vpnApi('?id=' + encodeURIComponent(d.id), { method: 'DELETE' }); vpnState.devices = vpnState.devices.filter(x => x.id !== d.id); renderAccess(); }
      catch (err) { rm.disabled = false; alert(err.message); }
    });
    const act = ve('div', null, 'vpn-device-actions'); act.append(mesh, rm);
    li.append(info, act); ul.append(li);
  });
  list.append(ul, ve('p', 'Le modifiche a Meshnet e le rimozioni diventano effettive sul server entro un minuto.', 'vpn-note'));
}

// Breach monitor (Have I Been Pwned, k-anonymity range API).
vq('#vpn-breach').onsubmit = async e => {
  e.preventDefault();
  const input = e.target.querySelector('input'), out = vq('#vpn-breach-result'), submit = e.target.querySelector('button');
  submit.disabled = true; out.dataset.tone = ''; out.textContent = 'Controllo in corso…';
  try {
    const hash = await sha1Hex(input.value);
    const res = await fetch('https://api.pwnedpasswords.com/range/' + hash.slice(0, 5), { headers: { 'Add-Padding': 'true' } });
    if (!res.ok) throw Error();
    const n = breachCount(await res.text(), hash);
    out.dataset.tone = n ? 'warn' : 'good';
    out.textContent = n ? `Attenzione: questa password compare ${n.toLocaleString('it-IT')} volte in fughe di dati note. Cambiala ovunque la usi.` : 'Buone notizie: questa password non compare nelle fughe di dati note.';
  } catch { out.textContent = 'Impossibile completare il controllo. Riprova più tardi.'; }
  finally { submit.disabled = false; input.value = ''; }
};

// Refresh VPN access after signing in or out while the section is open.
import('./identity-sdk.js').then(sdk => sdk.onAuthChange(() => { if (!vpnView.classList.contains('hidden')) loadAccess(); })).catch(() => {});
