// GG · Community private messages, member directory and meetups.
// Members write to each other privately to ask for tips on restaurants, bars and clubs, and can propose to meet.
import { MAX_MESSAGE, MAX_BIO, MAX_NOTE, MEET_SAFETY, REPORT_REASONS } from './community-core.js';

const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const btn = (text, cls, onclick) => { const b = el('button', text, cls); b.type = 'button'; if (onclick) b.onclick = onclick; return b; };
const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const full = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const when = d => (d.toDateString() === new Date().toDateString() ? '' : day.format(d) + ' · ') + time.format(d);
const STATUS = { proposed: 'Waiting for an answer', accepted: 'Accepted ✓', declined: 'Declined', cancelled: 'Cancelled' };

async function api(path = '', options = {}) {
  const res = await fetch('/gg-community-dm' + path, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(Error(data.error || 'Private messages are unavailable right now.'), { status: res.status, data });
  return data;
}
const post = body => api('', { method: 'POST', body: JSON.stringify(body) });

const mapsUrl = m => 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([m.place, m.city].filter(Boolean).join(', '));
function downloadIcs(m, other) {
  const start = new Date(m.when), end = new Date(+start + 2 * 36e5);
  const stamp = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const esc = s => String(s).replace(/[\\,;]/g, c => '\\' + c).replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GG//Community//EN', 'BEGIN:VEVENT', `UID:${stamp(start)}-${Math.random().toString(36).slice(2)}@gg`, `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(`Meet ${other} at ${m.place}`)}`, `LOCATION:${esc([m.place, m.city].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${esc((m.note ? m.note + '\n\n' : '') + 'Planned with GG Community. Meet in a public place and tell a friend where you are going.')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = el('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'gg-meetup.ics'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function mountDm({ section, nav, getMe, onMuted }) {
  const $ = s => section.querySelector(s);
  const dmPane = $('#community-dm-pane'), meetPane = $('#community-meet-pane');

  dmPane.innerHTML = `<div class="dm-layout">
  <aside class="dm-list-wrap"><div class="dm-list-head"><strong>Conversations</strong><button type="button" class="community-link" id="dm-find">Find members</button></div><div id="dm-list" class="dm-list" aria-label="Conversations"></div></aside>
  <div id="dm-chat" class="dm-chat">
    <div id="dm-empty" class="dm-empty"><span>✉️</span><h3>Your private messages</h3><p>Write privately to other members to ask where to eat, have a drink or go out, and propose to meet at a public place.</p><p>Tap <b>Message</b> on someone’s message in a room, or find members in <b>Meet members</b>.</p></div>
    <div id="dm-open" hidden>
      <div class="dm-head"><button type="button" class="community-link dm-back" id="dm-back">← Conversations</button><div><strong id="dm-name"></strong><small id="dm-about"></small></div>
        <div class="dm-actions"><button type="button" class="community-ghost" id="dm-meet">📍 Propose a meetup</button><button type="button" class="community-link" id="dm-block"></button></div></div>
      <p class="dm-safe">🔒 Only you and this member can read this conversation. Messages are checked against the community rules. Don’t share phone numbers, emails or your home address.</p>
      <div id="dm-log" class="community-log dm-log" aria-live="polite" aria-label="Private messages"></div>
      <div id="dm-notice" class="community-notice" role="alert" hidden></div>
      <form id="dm-form" class="community-form"><label class="sr-only" for="dm-text">Private message</label><textarea id="dm-text" rows="2" maxlength="${MAX_MESSAGE}" required placeholder="e.g. Any tips for a good pizzeria near the centre?"></textarea>
        <div class="community-row"><small id="dm-hint">Enter to send, Shift+Enter for a new line</small><button type="submit" class="community-primary" id="dm-send">Send ↑</button></div></form>
    </div>
  </div></div>
  <dialog id="dm-meetup" class="community-dialog dm-dialog"><form id="dm-meetup-form"><h3>Propose a meetup</h3><p>Suggest a public place — a restaurant, bar, café or club — and a time. The other member can accept or decline.</p>
    <label>Place<input name="place" maxlength="100" required placeholder="e.g. Bar Basso"></label><label>City or area<input name="city" maxlength="60" placeholder="e.g. Milano"></label>
    <label>Date and time<input name="when" type="datetime-local" required></label><label>Note (optional)<textarea name="note" rows="2" maxlength="${MAX_NOTE}" placeholder="e.g. Aperitivo after work?"></textarea></label>
    <details class="dm-tips" open><summary>Meeting safely</summary><ul>${MEET_SAFETY.map(t => `<li>${t}</li>`).join('')}</ul></details>
    <small id="dm-meetup-status" role="status"></small>
    <div class="community-row"><button type="button" class="community-ghost" id="dm-meetup-cancel">Cancel</button><button class="community-primary" type="submit">Send proposal</button></div></form></dialog>
  <dialog id="dm-report" class="community-dialog"><form method="dialog"><h3>Report this message</h3><p>The member is blocked from writing to you and moderation is informed.</p><div id="dm-reasons"></div><div class="community-row"><button value="cancel" class="community-ghost" formnovalidate>Cancel</button><button value="send" class="community-primary">Report and block</button></div></form></dialog>`;

  meetPane.innerHTML = `<div class="meet-grid">
  <form id="meet-profile" class="meet-card meet-profile"><h3>Your profile</h3><p class="community-muted">Add your city so members nearby can find you and ask for tips. Other members only see your community name, city and bio.</p>
    <label>City<input name="city" maxlength="60" placeholder="e.g. Roma"></label><label>About you<textarea name="bio" rows="2" maxlength="${MAX_BIO}" placeholder="e.g. Love sushi and live music, happy to share tips on Trastevere."></textarea></label>
    <label class="community-check"><input type="checkbox" name="allowDms"> Other members can send me private messages</label>
    <div class="community-row"><small id="meet-profile-status" role="status"></small><button class="community-primary" type="submit">Save profile</button></div></form>
  <div class="meet-find"><form id="meet-search" class="meet-search"><label>City<input name="city" maxlength="60" placeholder="Any city"></label><label>Interest or name<input name="q" maxlength="60" placeholder="e.g. jazz, sushi, Giulia"></label><button class="community-primary" type="submit">Search</button></form>
    <p id="meet-status" class="community-muted" role="status"></p><div id="meet-results" class="meet-results"></div>
    <details id="meet-blocked" class="meet-blocked"><summary>Blocked members</summary><div id="meet-blocked-list"></div></details></div></div>`;

  for (const [k, v] of Object.entries(REPORT_REASONS)) {
    const l = el('label', null, 'community-check'); const i = el('input'); i.type = 'radio'; i.name = 'reason'; i.value = k; i.required = true; l.append(i, ' ' + v); $('#dm-reasons').append(l);
  }

  const badge = el('span', '', 'dm-badge'); badge.hidden = true; nav.append(badge);
  const tabBadge = el('span', '', 'dm-badge'); tabBadge.hidden = true; $('[data-pane=dm]').append(tabBadge);

  let threads = [], current = null, info = null, messages = [], loading = false, reportTarget = null, inboxTimer = null, threadTimer = null, enabled = false;

  function setUnread(n) {
    for (const b of [badge, tabBadge]) { b.textContent = n > 9 ? '9+' : String(n); b.hidden = !n; }
    badge.setAttribute('aria-label', `${n} unread private messages`);
  }
  function notice(parts) {
    const n = $('#dm-notice'); n.replaceChildren();
    if (!parts) { n.hidden = true; return; }
    n.append(el('strong', parts.title));
    if (parts.reason) n.append(el('p', parts.reason));
    if (parts.suggestion) {
      n.append(el('p', 'A respectful way to say it:', 'community-muted'), el('blockquote', parts.suggestion));
      n.append(btn('Use this text', 'community-ghost', () => { $('#dm-text').value = parts.suggestion; notice(null); $('#dm-text').focus(); }));
    }
    if (parts.extra) n.append(el('p', parts.extra, 'community-muted'));
    n.hidden = false;
  }

  // ---- Conversation list ----
  function renderList() {
    const box = $('#dm-list'); box.replaceChildren();
    if (!threads.length) box.append(el('p', 'No conversations yet.', 'community-muted dm-none'));
    for (const t of threads) {
      const b = btn('', 'dm-thread' + (t.id === current ? ' is-active' : '') + (t.unread ? ' is-unread' : ''), () => openThread(t.id));
      const top = el('span', null, 'dm-thread-top'); top.append(el('strong', t.other.name), el('time', when(new Date(t.updatedAt))));
      const sub = el('span', (t.mine ? 'You: ' : '') + (t.blocked ? 'Blocked' : t.preview), 'dm-thread-preview');
      b.append(top, sub); if (t.other.city) b.append(el('small', '📍 ' + t.other.city));
      if (t.unread) b.append(el('span', String(t.unread), 'dm-badge'));
      box.append(b);
    }
  }
  async function loadInbox() {
    try { const r = await api('?view=inbox'); threads = r.threads; setUnread(r.unread); if (!dmPane.hidden) renderList(); enabled = true; }
    catch (e) { if (e.status === 401 || e.status === 403) { enabled = false; setUnread(0); } }
  }

  // ---- Open conversation ----
  function meetupEl(m) {
    const mu = m.meetup, card = el('div', null, 'dm-meetup is-' + mu.status);
    card.append(el('span', m.mine ? '📍 You proposed to meet' : `📍 ${info.other.name} proposes to meet`, 'dm-meetup-kicker'), el('strong', mu.place + (mu.city ? ` · ${mu.city}` : '')),
      el('span', full.format(new Date(mu.when)), 'dm-meetup-when'));
    if (mu.note) card.append(el('p', mu.note, 'community-text'));
    const past = new Date(mu.when) < new Date();
    card.append(el('span', past && mu.status !== 'cancelled' && mu.status !== 'declined' ? 'Date passed' : STATUS[mu.status], 'dm-status'));
    const row = el('div', null, 'dm-meetup-actions');
    const a = el('a', 'Open in Maps ↗', 'community-link'); a.href = mapsUrl(mu); a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(a);
    if (!past) {
      if (mu.status === 'accepted' || mu.status === 'proposed') row.append(btn('Add to calendar', 'community-link', () => downloadIcs(mu, info.other.name)));
      if (!m.mine && mu.status === 'proposed') row.append(btn('Accept', 'community-primary', () => respond(m, 'accepted')), btn('Decline', 'community-ghost', () => respond(m, 'declined')));
      if (!m.mine && mu.status === 'accepted') row.append(btn('I can’t make it', 'community-ghost', () => respond(m, 'declined')));
      if (m.mine && (mu.status === 'proposed' || mu.status === 'accepted')) row.append(btn('Cancel meetup', 'community-ghost', () => respond(m, 'cancelled')));
    }
    card.append(row);
    return card;
  }
  function messageEl(m) {
    const item = el('article', null, 'community-msg' + (m.mine ? ' is-mine' : ''));
    const head = el('div', null, 'community-msg-head'); const d = new Date(m.createdAt);
    const t = el('time', when(d)); t.dateTime = d.toISOString();
    head.append(el('strong', m.mine ? 'You' : info.other.name), t);
    const tools = el('span', null, 'community-tools');
    if (m.mine) tools.append(btn('Delete', 'community-link', () => remove(m)));
    else tools.append(btn('Report', 'community-link', () => { reportTarget = m; $('#dm-report form').reset(); $('#dm-report').showModal(); }));
    head.append(tools); item.append(head);
    if (m.kind === 'meetup' && m.meetup) item.append(meetupEl(m)); else item.append(el('p', m.content, 'community-text'));
    return item;
  }
  function renderLog() {
    const log = $('#dm-log'), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 80;
    log.replaceChildren();
    if (!messages.length) log.append(el('p', `Say hello to ${info.other.name} 👋 — ask for a recommendation or propose to meet.`, 'community-empty'));
    for (const m of messages) log.append(messageEl(m));
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  function renderHead() {
    $('#dm-name').textContent = info.other.name;
    $('#dm-about').textContent = [info.other.city && '📍 ' + info.other.city, info.other.bio].filter(Boolean).join(' · ');
    $('#dm-block').textContent = info.blockedByMe ? 'Unblock' : 'Block';
    const me = getMe(), muted = me?.mutedUntil && new Date(me.mutedUntil) > new Date();
    const stop = info.blockedByMe ? 'You blocked this member. Unblock them to write again.'
      : info.blockedByOther ? 'You can’t write to this member.'
      : !info.other.allowDms ? `${info.other.name} isn’t accepting private messages right now.`
      : muted ? `You can write again at ${time.format(new Date(me.mutedUntil))}.` : '';
    $('#dm-text').disabled = $('#dm-send').disabled = $('#dm-meet').disabled = !!stop;
    $('#dm-hint').textContent = stop || 'Enter to send, Shift+Enter for a new line';
  }
  async function markRead() {
    const t = threads.find(x => x.id === current);
    if (t?.unread) { t.unread = 0; setUnread(threads.reduce((n, x) => n + x.unread, 0)); renderList(); }
    post({ action: 'read', thread: current }).catch(() => {});
  }
  async function loadThread(reload = false) {
    if (!current || loading) return; loading = true;
    const id = current, after = !reload && messages.at(-1)?.createdAt;
    try {
      const r = await api(`?view=thread&id=${encodeURIComponent(id)}` + (after ? `&after=${encodeURIComponent(after)}` : ''));
      if (id !== current) return;
      info = r.thread;
      let fresh = !after;
      if (after) {
        const ids = new Set(messages.map(m => m.id)), add = r.messages.filter(m => !ids.has(m.id));
        if (add.length) { messages.push(...add); fresh = true; }
        for (const u of r.meetups || []) { const i = messages.findIndex(m => m.id === u.id); if (i >= 0 && messages[i].meetup?.status !== u.meetup?.status) { messages[i] = u; fresh = true; } }
        if (add.some(m => !m.mine) && !document.hidden) markRead();
      } else messages = r.messages;
      renderHead(); if (fresh) renderLog();
    } catch (e) { if (id === current) notice({ title: e.message }); }
    finally { loading = false; }
  }
  async function openThread(id) {
    showPane('dm');
    current = id; messages = []; info = null; notice(null);
    $('#dm-empty').hidden = true; $('#dm-open').hidden = false; dmPane.classList.add('is-open');
    $('#dm-log').replaceChildren(el('p', 'Loading…', 'community-empty'));
    renderList();
    await loadThread(true);
    const log = $('#dm-log'); log.scrollTop = log.scrollHeight;
    markRead();
    clearInterval(threadTimer);
    threadTimer = setInterval(() => { if (!section.classList.contains('hidden') && !dmPane.hidden && !document.hidden) loadThread(); }, 4000);
    if (matchMedia('(min-width: 761px)').matches) $('#dm-text').focus();
  }
  function closeThread() { current = null; clearInterval(threadTimer); $('#dm-empty').hidden = false; $('#dm-open').hidden = true; dmPane.classList.remove('is-open'); renderList(); }

  async function startWith(target) {
    try { const r = await post({ action: 'start', ...target }); await loadInbox(); await openThread(r.thread); }
    catch (e) { showPane('dm'); closeThread(); const p = $('#dm-empty'); p.querySelector('.dm-err')?.remove(); p.append(el('p', e.message, 'community-notice dm-err')); }
  }

  function blocked(err) {
    const d = err.data || {};
    if (d.mutedUntil) onMuted(d.mutedUntil);
    if (d.blocked) notice({ title: err.message, reason: d.reason, suggestion: d.suggestion, extra: d.mutedUntil ? `Because several messages broke the rules, writing is paused until ${time.format(new Date(d.mutedUntil))}.` : 'Please rewrite it kindly. Repeated violations pause your writing for an hour.' });
    else notice({ title: err.message });
    renderHead();
  }
  function added(m) {
    if (!messages.some(x => x.id === m.id)) messages.push(m);
    const log = $('#dm-log'); renderLog(); log.scrollTop = log.scrollHeight;
    loadInbox();
  }
  async function respond(m, answer) {
    if (answer === 'cancelled' && !confirm('Cancel this meetup?')) return;
    try { const r = await post({ action: 'respond', id: m.id, answer }); const i = messages.findIndex(x => x.id === m.id); if (i >= 0) messages[i] = r.message; renderLog(); loadInbox(); }
    catch (e) { notice({ title: e.message }); }
  }
  async function remove(m) {
    if (!confirm('Delete your message?')) return;
    try { await api(`?id=${encodeURIComponent(m.id)}`, { method: 'DELETE' }); messages = messages.filter(x => x.id !== m.id); renderLog(); loadInbox(); }
    catch (e) { notice({ title: e.message }); }
  }

  $('#dm-form').onsubmit = async e => {
    e.preventDefault();
    const box = $('#dm-text'), content = box.value.trim(); if (!content || !current) return;
    $('#dm-send').disabled = true; $('#dm-send').textContent = 'Checking…'; notice(null);
    try { const r = await post({ action: 'send', thread: current, content }); box.value = ''; added(r.message); }
    catch (err) { blocked(err); }
    finally { $('#dm-send').textContent = 'Send ↑'; if (info) renderHead(); }
  };
  $('#dm-text').onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#dm-form').requestSubmit(); } };
  $('#dm-back').onclick = closeThread;
  $('#dm-find').onclick = () => showPane('meet');
  $('#dm-block').onclick = async () => {
    if (!info) return;
    const unblock = info.blockedByMe;
    if (!unblock && !confirm(`Block ${info.other.name}? You won’t be able to message each other and you won’t see each other in Meet members.`)) return;
    try { await post({ action: unblock ? 'unblock' : 'block', handle: info.other.handle }); await loadThread(true); loadInbox(); }
    catch (e) { notice({ title: e.message }); }
  };

  const mForm = $('#dm-meetup-form');
  $('#dm-meet').onclick = () => {
    mForm.reset(); $('#dm-meetup-status').textContent = '';
    mForm.elements.city.value = getMe()?.city || info?.other.city || '';
    const d = new Date(Date.now() + 864e5); d.setMinutes(0, 0, 0); d.setHours(19);
    const local = dt => new Date(+dt - dt.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
    mForm.elements.when.value = local(d); mForm.elements.when.min = local(new Date());
    $('#dm-meetup').showModal(); mForm.elements.place.focus();
  };
  $('#dm-meetup-cancel').onclick = () => $('#dm-meetup').close();
  mForm.onsubmit = async e => {
    e.preventDefault();
    const f = mForm.elements, st = $('#dm-meetup-status'), submit = mForm.querySelector('button[type=submit]');
    const at = new Date(f.when.value);
    if (isNaN(+at)) { st.textContent = 'Choose a date and time.'; return; }
    submit.disabled = true; st.textContent = 'Checking…';
    try {
      const r = await post({ action: 'meetup', thread: current, place: f.place.value, city: f.city.value, when: at.toISOString(), note: f.note.value });
      $('#dm-meetup').close(); added(r.message);
    } catch (err) {
      const d = err.data || {};
      st.textContent = err.message + (d.reason ? ' ' + d.reason : '');
      if (d.mutedUntil) { $('#dm-meetup').close(); blocked(err); }
    } finally { submit.disabled = false; }
  };
  $('#dm-report').addEventListener('close', async () => {
    const dlg = $('#dm-report'), target = reportTarget; reportTarget = null;
    if (dlg.returnValue !== 'send' || !target) return;
    const reason = dlg.querySelector('input[name=reason]:checked')?.value || 'other';
    try { const r = await post({ action: 'report', id: target.id, reason }); notice({ title: r.already ? 'You already reported this message.' : 'Thank you for your report.', reason: 'This member is now blocked and can’t write to you.' }); await loadThread(true); loadInbox(); }
    catch (e) { notice({ title: e.message }); }
  });

  // ---- Meet members ----
  const pForm = $('#meet-profile');
  function fillProfile() { const me = getMe(); if (!me) return; pForm.elements.city.value = me.city || ''; pForm.elements.bio.value = me.bio || ''; pForm.elements.allowDms.checked = me.allowDms !== false; }
  pForm.onsubmit = async e => {
    e.preventDefault();
    const f = pForm.elements, st = $('#meet-profile-status'), submit = pForm.querySelector('button[type=submit]');
    submit.disabled = true; st.textContent = 'Saving…';
    try { const r = await post({ action: 'profile', city: f.city.value, bio: f.bio.value, allowDms: f.allowDms.checked }); Object.assign(getMe() || {}, r.profile); st.textContent = 'Saved ✓'; if (!$('#meet-search').elements.city.value && r.profile.city) $('#meet-search').elements.city.value = r.profile.city; }
    catch (err) { st.textContent = err.message + (err.data?.reason ? ' ' + err.data.reason : ''); }
    finally { submit.disabled = false; }
  };
  async function searchMembers() {
    const f = $('#meet-search').elements, st = $('#meet-status'), box = $('#meet-results');
    st.textContent = 'Searching…';
    try {
      const r = await api(`?view=members&city=${encodeURIComponent(f.city.value.trim())}&q=${encodeURIComponent(f.q.value.trim())}`);
      box.replaceChildren();
      st.textContent = r.members.length ? `${r.members.length} member${r.members.length === 1 ? '' : 's'} open to private messages` : 'No members found. Try another city, or ask in the Places & going out room.';
      for (const m of r.members) {
        const card = el('article', null, 'meet-card meet-member');
        card.append(el('strong', m.name));
        if (m.city) card.append(el('span', '📍 ' + m.city, 'community-muted'));
        if (m.bio) card.append(el('p', m.bio));
        card.append(btn('Message', 'community-primary', () => startWith({ handle: m.handle })));
        box.append(card);
      }
    } catch (e) { st.textContent = e.message; }
  }
  async function loadBlocked() {
    const box = $('#meet-blocked-list');
    try {
      const r = await api('?view=blocked'); box.replaceChildren();
      if (!r.blocked.length) box.append(el('p', 'You haven’t blocked anyone.', 'community-muted'));
      for (const m of r.blocked) { const row = el('div', null, 'community-row'); row.append(el('span', m.name), btn('Unblock', 'community-link', async () => { await post({ action: 'unblock', handle: m.handle }).catch(() => {}); loadBlocked(); })); box.append(row); }
    } catch (e) { box.textContent = e.message; }
  }
  $('#meet-search').onsubmit = e => { e.preventDefault(); searchMembers(); };
  $('#meet-blocked').addEventListener('toggle', e => { if (e.target.open) loadBlocked(); });

  // ---- Panes ----
  function showPane(name) {
    section.querySelectorAll('[data-pane]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.pane === name)));
    $('#community-rooms-pane').hidden = name !== 'rooms'; dmPane.hidden = name !== 'dm'; meetPane.hidden = name !== 'meet';
    if (name === 'dm') { renderList(); loadInbox(); }
    if (name === 'meet') { fillProfile(); if (!$('#meet-search').elements.city.value) $('#meet-search').elements.city.value = getMe()?.city || ''; searchMembers(); }
  }
  section.querySelectorAll('[data-pane]').forEach(b => b.onclick = () => showPane(b.dataset.pane));

  function start() {
    clearInterval(inboxTimer); loadInbox();
    inboxTimer = setInterval(() => { if (!document.hidden && enabled) loadInbox(); }, 20000);
  }
  function reset() { threads = []; messages = []; current = null; info = null; enabled = false; clearInterval(inboxTimer); clearInterval(threadTimer); setUnread(0); closeThread(); showPane('rooms'); }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && enabled) { loadInbox(); if (current && !section.classList.contains('hidden')) loadThread(); } });

  return { start, reset, startWith, showPane };
}
