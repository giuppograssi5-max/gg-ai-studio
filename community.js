// GG · Community: talk with other members, following the community rules (policy, education and respect).
import { RULES_VERSION, ROOMS, REPORT_REASONS, MAX_MESSAGE } from './community-core.js';
import { downloadAgreement } from './community-agreement.js';
import { mountDm } from './community-dm.js';

const $c = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };

const section = el('section', null, 'view hidden community-view');
section.id = 'community';
section.innerHTML = `<div class="community-heading"><span>GG · COMMUNITY</span><h2>Talk with other members</h2><p>A friendly place to ask, help and share ideas. Every message is checked against the community rules before it’s posted, so the conversation stays polite, educated and respectful.</p></div>
<div id="community-gate" class="community-gate" hidden>
  <h3>Community rules</h3><p>Read the community rules in the agreement PDF before joining.</p>
  <p><button type="button" class="community-ghost community-pdf">⬇ Download the rules agreement (PDF)</button></p>
  <div id="community-signin" hidden><p>Sign in to your GG account to join the conversation.</p><div class="community-row"><button type="button" class="community-primary" id="community-login">Sign in</button><button type="button" class="community-ghost" id="community-signup">Create an account</button></div></div>
  <form id="community-join" hidden><label>Name shown to other members<input name="name" minlength="2" maxlength="30" required autocomplete="nickname" placeholder="e.g. Giulia R."></label><small>Don’t use your full name or email. Other members only see this name.</small>
  <label class="community-check"><input type="checkbox" name="accept" required> I have read the community rules (PDF) and I agree to follow them. I understand that messages breaking the rules are not posted and that repeated violations pause my access.</label>
  <div class="community-row"><button type="submit" class="community-primary">Join the community</button><small class="community-status" role="status"></small></div></form>
</div>
<div id="community-room" class="community-room" hidden>
  <div class="community-panes" role="tablist" aria-label="Community"><button type="button" role="tab" data-pane="rooms" aria-selected="true">💬 Rooms</button><button type="button" role="tab" data-pane="dm" aria-selected="false">✉️ Private messages</button><button type="button" role="tab" data-pane="meet" aria-selected="false">🤝 Meet members</button></div>
  <div id="community-rooms-pane" class="community-room">
  <div class="community-bar"><div id="community-rooms" class="community-rooms" role="tablist" aria-label="Rooms"></div><div class="community-me"><span id="community-name"></span><button type="button" class="community-link community-pdf">My agreement (PDF)</button></div></div>
  <p id="community-room-desc" class="community-desc"></p>
  <div id="community-log" class="community-log" aria-live="polite" aria-label="Messages"></div>
  <div id="community-notice" class="community-notice" role="alert" hidden></div>
  <form id="community-form" class="community-form"><label class="sr-only" for="community-text">Your message</label><textarea id="community-text" rows="2" maxlength="${MAX_MESSAGE}" required placeholder="Write a kind message…"></textarea><div class="community-row"><small id="community-hint">Be polite and respectful · Enter to send, Shift+Enter for a new line</small><button type="submit" class="community-primary" id="community-send">Send ↑</button></div></form>
  </div>
  <div id="community-dm-pane" hidden></div>
  <div id="community-meet-pane" hidden></div>
</div>
<p id="community-error" class="community-notice" role="alert" hidden></p>
<dialog id="community-report" class="community-dialog"><form method="dialog"><h3>Report this message</h3><p>Reports are anonymous. Messages reported by several members are hidden automatically.</p><div id="community-reasons"></div><div class="community-row"><button value="cancel" class="community-ghost" formnovalidate>Cancel</button><button value="send" class="community-primary">Send report</button></div></form></dialog>`;
$c('.main').append(section);

const nav = el('button', null, 'nav'); nav.type = 'button';
nav.append(el('span', '👥'), ' Community');
$c('.sidebar nav').append(nav);

for (const [k, v] of Object.entries(REPORT_REASONS)) {
  const l = el('label', null, 'community-check'); const i = el('input'); i.type = 'radio'; i.name = 'reason'; i.value = k; i.required = true; l.append(i, ' ' + v); $c('#community-reasons').append(l);
}

const dm = mountDm({ section, nav, getMe: () => me, onMuted: until => { if (me) { me = { ...me, mutedUntil: until }; renderMuted(); } } });
let dmStarted = false;
let me = null, room = 'general', messages = [], timer = null, loading = false, reportTarget = null;
const fmt = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

async function api(path = '', options = {}) {
  const res = await fetch('/gg-community' + path, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(Error(data.error || 'The community is unavailable right now.'), { status: res.status, data });
  return data;
}

function showError(text) { const e = $c('#community-error'); e.textContent = text || ''; e.hidden = !text; }
function notice(parts) {
  const n = $c('#community-notice'); n.replaceChildren();
  if (!parts) { n.hidden = true; return; }
  n.append(el('strong', parts.title));
  if (parts.reason) n.append(el('p', parts.reason));
  if (parts.suggestion) {
    n.append(el('p', 'A respectful way to say it:', 'community-muted'), el('blockquote', parts.suggestion));
    const use = el('button', 'Use this text', 'community-ghost'); use.type = 'button';
    use.onclick = () => { $c('#community-text').value = parts.suggestion; notice(null); $c('#community-text').focus(); };
    n.append(use);
  }
  if (parts.extra) n.append(el('p', parts.extra, 'community-muted'));
  n.hidden = false;
}

function renderGate(signedIn) {
  $c('#community-gate').hidden = false; $c('#community-room').hidden = true;
  $c('#community-signin').hidden = signedIn; $c('#community-join').hidden = !signedIn;
  if (me?.name) $c('#community-join').elements.name.value = me.name;
}

function renderRooms() {
  const box = $c('#community-rooms'); box.replaceChildren();
  for (const [id, r] of Object.entries(ROOMS)) {
    const b = el('button', `${r.icon} ${r.name}`, 'community-tab'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === room));
    b.onclick = () => { if (room !== id) { room = id; messages = []; renderRooms(); renderLog(); load(); } };
    box.append(b);
  }
  $c('#community-room-desc').textContent = ROOMS[room].description;
}

function renderMuted() {
  const muted = me?.mutedUntil && new Date(me.mutedUntil) > new Date();
  $c('#community-text').disabled = $c('#community-send').disabled = !!muted || !!me?.banned;
  $c('#community-hint').textContent = me?.banned ? 'Your access to the community has been suspended.'
    : muted ? `You can write again at ${fmt.format(new Date(me.mutedUntil))}. You can still read the conversation.`
    : me?.strikes ? `Reminder: ${me.strikes} of your recent messages didn’t follow the rules. A few more pause your writing for an hour.`
    : 'Be polite and respectful · Enter to send, Shift+Enter for a new line';
}

function messageEl(m) {
  const item = el('article', null, 'community-msg' + (m.mine ? ' is-mine' : ''));
  const head = el('div', null, 'community-msg-head');
  const when = new Date(m.createdAt);
  const time = el('time', (when.toDateString() === new Date().toDateString() ? '' : day.format(when) + ' · ') + fmt.format(when)); time.dateTime = when.toISOString();
  head.append(el('strong', m.mine ? `${m.author} (you)` : m.author), time);
  const tools = el('span', null, 'community-tools');
  if (m.mine || me?.admin) { const d = el('button', m.mine ? 'Delete' : 'Remove', 'community-link'); d.type = 'button'; d.onclick = () => remove(m); tools.append(d); }
  if (!m.mine) { const p = el('button', 'Message', 'community-link'); p.type = 'button'; p.title = `Send ${m.author} a private message`; p.onclick = () => dm.startWith({ messageId: m.id }); tools.append(p); }
  if (!m.mine) { const r = el('button', 'Report', 'community-link'); r.type = 'button'; r.onclick = () => { reportTarget = m; $c('#community-report form').reset(); $c('#community-report').showModal(); }; tools.append(r); }
  head.append(tools);
  item.append(head, el('p', m.content, 'community-text'));
  return item;
}

function renderLog() {
  const log = $c('#community-log'); const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
  log.replaceChildren();
  if (!messages.length) log.append(el('p', 'No messages yet. Say hello and start the conversation! 👋', 'community-empty'));
  for (const m of messages) log.append(messageEl(m));
  if (atBottom) log.scrollTop = log.scrollHeight;
}

function renderRoom() {
  $c('#community-gate').hidden = true; $c('#community-room').hidden = false;
  $c('#community-name').textContent = `Chatting as ${me.name}` + (me.admin ? ' · moderator' : '');
  renderRooms(); renderMuted(); renderLog();
}

async function load() {
  if (loading) return; loading = true;
  const current = room, after = messages.at(-1)?.createdAt;
  try {
    const data = await api(`?room=${current}` + (after ? `&after=${encodeURIComponent(after)}` : ''));
    showError('');
    me = data.me;
    if (!me || me.needsRules) { renderGate(true); return; }
    if (!dmStarted) { dmStarted = true; dm.start(); }
    if (current !== room) return;
    if (after) { const ids = new Set(messages.map(m => m.id)); messages.push(...data.messages.filter(m => !ids.has(m.id))); }
    else messages = data.messages;
    if ($c('#community-room').hidden) renderRoom(); else { renderMuted(); if (data.messages.length || !after) renderLog(); }
  } catch (e) {
    if (e.status === 401) { me = null; renderGate(false); }
    else showError(e.message);
  } finally { loading = false; }
}

function poll() {
  clearInterval(timer);
  timer = setInterval(() => { if (!section.classList.contains('hidden') && !document.hidden && me && !me.needsRules) load(); }, 4000);
}

async function remove(m) {
  if (!confirm(m.mine ? 'Delete your message?' : 'Remove this message for everyone?')) return;
  try { await api(`?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' }); messages = messages.filter(x => x.id !== m.id); renderLog(); }
  catch (e) { showError(e.message); }
}

$c('#community-report').addEventListener('close', async () => {
  const dlg = $c('#community-report'), target = reportTarget; reportTarget = null;
  if (dlg.returnValue !== 'send' || !target) return;
  const reason = dlg.querySelector('input[name=reason]:checked')?.value || 'other';
  try {
    const r = await api('', { method: 'POST', body: JSON.stringify({ action: 'report', id: target.id, reason }) });
    if (r.hidden) { messages = messages.filter(x => x.id !== target.id); renderLog(); }
    notice({ title: r.already ? 'You already reported this message.' : 'Thank you for your report.', reason: r.hidden ? 'The message has been hidden.' : 'Our moderation reviews reported messages. Please don’t reply to provocations.' });
  } catch (e) { showError(e.message); }
});

$c('#community-join').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, st = f.querySelector('.community-status'), btn = f.querySelector('button[type=submit]');
  btn.disabled = true; st.textContent = 'Joining…';
  try {
    const r = await api('', { method: 'POST', body: JSON.stringify({ action: 'join', name: f.elements.name.value, accept: f.elements.accept.checked, rulesVersion: RULES_VERSION }) });
    me = r.me; st.textContent = ''; messages = []; renderRoom(); load();
  } catch (err) { st.textContent = err.message + (err.data?.reason ? ' ' + err.data.reason : ''); }
  finally { btn.disabled = false; }
};

$c('#community-form').onsubmit = async e => {
  e.preventDefault();
  const box = $c('#community-text'), content = box.value.trim(); if (!content) return;
  $c('#community-send').disabled = true; $c('#community-send').textContent = 'Checking…'; notice(null);
  try {
    const r = await api('', { method: 'POST', body: JSON.stringify({ action: 'send', room, content }) });
    box.value = '';
    if (!messages.some(m => m.id === r.message.id)) messages.push(r.message);
    const log = $c('#community-log'); renderLog(); log.scrollTop = log.scrollHeight;
  } catch (err) {
    const d = err.data || {};
    if (d.mutedUntil) me = { ...me, mutedUntil: d.mutedUntil };
    if (d.blocked) { me = { ...me, strikes: d.mutedUntil ? 0 : (me.strikes || 0) + 1 }; notice({ title: err.message, reason: d.reason, suggestion: d.suggestion, extra: d.mutedUntil ? `Because several messages broke the rules, writing is paused until ${fmt.format(new Date(d.mutedUntil))}.` : 'Please rewrite it kindly. Repeated violations pause your writing for an hour.' }); }
    else notice({ title: err.message });
  } finally { $c('#community-send').textContent = 'Send ↑'; renderMuted(); }
};
$c('#community-text').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $c('#community-form').requestSubmit(); } };
document.querySelectorAll('.community-pdf').forEach(b => b.onclick = () => downloadAgreement(me && !me.needsRules ? me : null));
$c('#community-login').onclick = () => document.querySelector('.gg-login')?.click();
$c('#community-signup').onclick = () => document.querySelector('.gg-signup')?.click();

// Loads membership quietly on page load so the unread badge for private messages appears in the sidebar.
async function checkMembership() {
  try { const data = await api('?room=general&after=' + encodeURIComponent(new Date().toISOString())); me = data.me; if (me && !me.needsRules && !me.banned && !dmStarted) { dmStarted = true; dm.start(); } } catch {}
}
checkMembership();

export function openCommunity(pane, roomId) {
  if (roomId && ROOMS[roomId] && roomId !== room) { room = roomId; messages = []; if (!$c('#community-room').hidden) { renderRooms(); renderLog(); } }
  if (typeof view === 'function') view('community');
  document.querySelectorAll('.sidebar .nav').forEach(n => n.classList.toggle('active', n === nav));
  $c('#viewtitle').textContent = 'Community';
  load(); poll();
  if (pane) dm.showPane(pane);
}
nav.onclick = () => openCommunity();
window.openCommunity = openCommunity;
document.addEventListener('visibilitychange', () => { if (!document.hidden && !section.classList.contains('hidden') && me) load(); });
import('./identity-sdk.js').then(sdk => sdk.onAuthChange(() => { me = null; messages = []; dmStarted = false; dm.reset(); checkMembership(); if (!section.classList.contains('hidden')) load(); })).catch(() => {});
