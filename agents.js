// GG · AI Agents: a gallery of task-focused agents (PC Doctor, Research, Code, Writing, Tutor, Planner)
// plus user-made custom agents. Each agent keeps its own conversation in this browser.
import { AGENTS, OS_OPTIONS, MAX_PROMPT, MAX_TURNS, MAX_CUSTOM_INSTRUCTIONS } from './agents-core.js';
import { readAIStream } from './ai-stream.js';
import { renderMarkdown } from './markdown.js';

const $a = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const STORE = 'gg-agents-v1';

let store = { chats: {}, custom: [] };
try { const s = JSON.parse(localStorage.getItem(STORE) || 'null'); if (s && typeof s === 'object') store = { chats: s.chats && typeof s.chats === 'object' ? s.chats : {}, custom: Array.isArray(s.custom) ? s.custom.slice(0, 12) : [] }; } catch {}
const save = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch {} };

const section = el('section', null, 'view hidden agents-view');
section.id = 'agents';
section.innerHTML = `<div id="agents-home"><div class="agents-heading"><span>GG · AI AGENTS</span><h2>Agents that get things done</h2><p>Pick an agent for the job. Each one works through your task step by step: it asks what it needs, searches the web when useful and shows you what it is doing.</p></div>
<div id="agents-grid" class="agents-grid"></div>
<div class="agents-custom-head"><h3>Your agents</h3><button type="button" id="agents-new" class="agents-ghost">+ Create an agent</button></div>
<div id="agents-custom" class="agents-grid"></div>
<form id="agents-builder" class="agents-builder" hidden><h3 id="agents-builder-title">Create your own agent</h3>
<label>Name<input name="name" maxlength="40" required placeholder="e.g. Fitness Coach"></label>
<label>Icon<input name="icon" maxlength="4" placeholder="🤖"></label>
<label class="agents-wide">What should it do?<textarea name="instructions" rows="5" maxlength="${MAX_CUSTOM_INSTRUCTIONS}" required placeholder="e.g. You are my personal fitness coach. Ask about my level and goals, then build weekly workout plans and adjust them when I report progress."></textarea></label>
<label class="agents-check agents-wide"><input type="checkbox" name="web"> Allow web search</label>
<div class="agents-wide agents-row"><button type="submit" class="agents-primary">Save agent</button><button type="button" id="agents-builder-cancel" class="agents-ghost">Cancel</button></div></form></div>
<div id="agents-room" class="agents-room" hidden>
<div class="agents-room-head"><button type="button" id="agents-back" class="agents-ghost" aria-label="Back to all agents">← All agents</button><div class="agents-room-title"><span id="agents-room-icon"></span><div><h2 id="agents-room-name"></h2><p id="agents-room-desc"></p></div></div><button type="button" id="agents-reset" class="agents-ghost">New task</button></div>
<div id="agents-pc-tools" class="agents-pc" hidden><label>Your system <select id="agents-os"><option value="">Choose…</option></select></label><label class="agents-check"><input type="checkbox" id="agents-device"> Share basic device details from this browser</label><button type="button" id="agents-device-show" class="agents-link">What is shared?</button><pre id="agents-device-preview" hidden></pre><p class="agents-note">PC Doctor can’t access your computer. It tells you what to check and you run each step yourself. Back up important files before any risky fix.</p></div>
<div id="agents-log" class="agents-log" aria-live="polite"></div>
<div id="agents-starters" class="agents-starters"></div>
<form id="agents-form" class="agents-form"><label class="sr-only" for="agents-prompt">Message to the agent</label><textarea id="agents-prompt" rows="3" maxlength="${MAX_PROMPT}" required></textarea><div class="agents-row"><small id="agents-status" role="status"></small><span><button type="button" id="agents-stop" class="agents-ghost" hidden>Stop</button><button type="submit" class="agents-primary" id="agents-send">Run agent ↑</button></span></div></form></div>`;
$a('.main').append(section);

const nav = el('button', null, 'nav'); nav.type = 'button';
nav.append(el('span', '🤖'), ' AI agents');
$a('.sidebar nav').append(nav);
const osSel = $a('#agents-os');
for (const [k, v] of Object.entries(OS_OPTIONS)) osSel.append(new Option(v, k));
osSel.value = store.os || '';
osSel.onchange = () => { store.os = osSel.value; save(); };

let current = null, controller = null;
const agentDef = id => id.startsWith('custom:') ? store.custom.find(c => c.id === id.slice(7)) : AGENTS[id] && { id, ...AGENTS[id] };

function card(def, id, extra) {
  const b = el('button', null, 'agents-card'); b.type = 'button';
  b.append(el('span', def.icon || '🤖', 'agents-icon'), el('strong', def.name), el('span', def.tagline || (def.instructions || '').slice(0, 90), 'agents-tag'));
  const n = (store.chats[id] || []).length;
  if (n) b.append(el('small', `${Math.ceil(n / 2)} message${n > 2 ? 's' : ''} in progress`, 'agents-progress'));
  b.onclick = () => openRoom(id);
  if (!extra) return b;
  const wrap = el('div', null, 'agents-card-wrap'); wrap.append(b, extra); return wrap;
}

function renderHome() {
  const grid = $a('#agents-grid'); grid.replaceChildren();
  for (const [id, def] of Object.entries(AGENTS)) grid.append(card(def, id));
  const mine = $a('#agents-custom'); mine.replaceChildren();
  if (!store.custom.length) mine.append(el('p', 'Create an agent with your own instructions, for example a fitness coach, a recipe helper or a customer-support assistant for your shop. It is saved in this browser.', 'agents-empty'));
  for (const c of store.custom) {
    const tools = el('div', null, 'agents-card-tools');
    const edit = el('button', 'Edit', 'agents-link'); edit.type = 'button'; edit.onclick = () => openBuilder(c);
    const del = el('button', 'Delete', 'agents-link'); del.type = 'button';
    del.onclick = () => { if (!confirm(`Delete the agent “${c.name}” and its conversation?`)) return; store.custom = store.custom.filter(x => x !== c); delete store.chats['custom:' + c.id]; save(); renderHome(); };
    tools.append(edit, del);
    mine.append(card(c, 'custom:' + c.id, tools));
  }
}

let editing = null;
function openBuilder(c = null) {
  editing = c; const f = $a('#agents-builder');
  f.hidden = false; f.reset();
  $a('#agents-builder-title').textContent = c ? `Edit ${c.name}` : 'Create your own agent';
  if (c) { f.name.value = c.name; f.icon.value = c.icon || ''; f.instructions.value = c.instructions; f.web.checked = !!c.web; }
  f.name.focus();
}
$a('#agents-new').onclick = () => { if (store.custom.length >= 12) return alert('You can save up to 12 agents. Delete one to create a new one.'); openBuilder(); };
$a('#agents-builder-cancel').onclick = () => { $a('#agents-builder').hidden = true; };
$a('#agents-builder').onsubmit = e => {
  e.preventDefault(); const f = e.target;
  const data = { name: f.name.value.trim().slice(0, 40), icon: [...f.icon.value.trim()].slice(0, 2).join('') || '🤖', instructions: f.instructions.value.trim().slice(0, MAX_CUSTOM_INSTRUCTIONS), web: f.web.checked };
  if (!data.name || !data.instructions) return;
  if (editing) Object.assign(editing, data); else store.custom.push({ id: crypto.randomUUID(), ...data });
  save(); f.hidden = true; renderHome();
};

export function openAgents(id = null, prompt = '') {
  if (typeof view === 'function') view('agents');
  document.querySelectorAll('.sidebar .nav').forEach(n => n.classList.toggle('active', n === nav));
  $a('#viewtitle').textContent = 'AI agents';
  if (id && agentDef(id)) openRoom(id, prompt); else showHome();
}
window.openAgents = openAgents;
nav.onclick = () => openAgents();

function showHome() { controller?.abort(); current = null; $a('#agents-room').hidden = true; $a('#agents-home').hidden = false; renderHome(); }
$a('#agents-back').onclick = showHome;

function openRoom(id, prompt = '') {
  const def = agentDef(id); if (!def) return;
  controller?.abort(); current = id;
  $a('#agents-home').hidden = true; $a('#agents-room').hidden = false;
  $a('#agents-room-icon').textContent = def.icon || '🤖';
  $a('#agents-room-name').textContent = def.name;
  $a('#agents-room-desc').textContent = def.description || 'Your custom agent.' + (def.web ? ' Web search on.' : '');
  $a('#agents-pc-tools').hidden = id !== 'pc';
  $a('#agents-prompt').placeholder = id === 'pc' ? 'Describe the problem: what happens, any error message, and when it started…' : id === 'research' ? 'What should I research?' : `Give ${def.name} a task…`;
  renderLog();
  $a('#agents-prompt').value = prompt;
  if (prompt) $a('#agents-form').requestSubmit(); else $a('#agents-prompt').focus();
}

function renderStarters() {
  const box = $a('#agents-starters'); box.replaceChildren();
  const def = agentDef(current);
  if (!def?.starters || (store.chats[current] || []).length) return;
  for (const s of def.starters) { const b = el('button', s, 'agents-starter'); b.type = 'button'; b.onclick = () => { $a('#agents-prompt').value = s; $a('#agents-form').requestSubmit(); }; box.append(b); }
}

function bubble(role, content, sources = []) {
  const m = el('div', null, `agents-msg is-${role}`);
  if (role === 'user') { m.append(el('p', content)); return m; }
  const body = el('div', null, 'agents-answer has-markdown'); body.append(renderMarkdown(content, sources)); m.append(body);
  if (sources.length) m.append(sourceList(sources));
  const copy = el('button', 'Copy', 'agents-link'); copy.type = 'button';
  copy.onclick = () => navigator.clipboard?.writeText(content).then(() => { copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1500); });
  m.append(copy);
  return m;
}
function sourceList(sources) {
  const d = el('details', null, 'agents-sources'); d.append(el('summary', `Sources (${sources.length})`));
  const ol = el('ol');
  for (const s of sources) { const li = el('li'); const a = el('a', s.title); a.href = s.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; li.append(a, el('small', ' ' + new URL(s.url).hostname)); ol.append(li); }
  d.append(ol); return d;
}
function renderLog() {
  const log = $a('#agents-log'); log.replaceChildren();
  for (const t of store.chats[current] || []) log.append(bubble(t.role, t.content, t.sources || []));
  renderStarters();
}

$a('#agents-reset').onclick = () => { if (!current) return; controller?.abort(); delete store.chats[current]; save(); renderLog(); $a('#agents-status').textContent = ''; $a('#agents-prompt').focus(); };
$a('#agents-stop').onclick = () => controller?.abort();

function deviceInfo() {
  const n = navigator, lines = [];
  const ua = n.userAgentData;
  lines.push(`Platform: ${ua?.platform || n.platform || 'unknown'}`);
  lines.push(`Browser: ${ua?.brands?.filter(b => !/Not.?A.?Brand/i.test(b.brand)).map(b => `${b.brand} ${b.version}`).join(', ') || n.userAgent}`);
  if (ua) lines.push(`Mobile device: ${ua.mobile ? 'yes' : 'no'}`);
  if (n.hardwareConcurrency) lines.push(`CPU threads: ${n.hardwareConcurrency}`);
  if (n.deviceMemory) lines.push(`Memory (approx., capped by browser): ${n.deviceMemory} GB or more`);
  lines.push(`Screen: ${screen.width}×${screen.height} at ${window.devicePixelRatio || 1}x`);
  lines.push(`Language: ${n.language}`);
  lines.push(`Online: ${n.onLine ? 'yes' : 'no'}`);
  if (n.connection?.effectiveType) lines.push(`Connection: ${n.connection.effectiveType}${n.connection.downlink ? `, ~${n.connection.downlink} Mb/s` : ''}`);
  return lines.join('\n');
}
$a('#agents-device-show').onclick = () => { const p = $a('#agents-device-preview'); p.hidden = !p.hidden; p.textContent = deviceInfo(); };

$a('#agents-form').onsubmit = async e => {
  e.preventDefault();
  const input = $a('#agents-prompt'), prompt = input.value.trim(), id = current, def = agentDef(id);
  if (!prompt || !def || controller) return;
  const chat = store.chats[id] = store.chats[id] || [];
  const history = chat.slice(-MAX_TURNS * 2).map(({ role, content }) => ({ role, content }));
  chat.push({ role: 'user', content: prompt }); save();
  input.value = ''; $a('#agents-starters').replaceChildren();
  const log = $a('#agents-log'); log.append(bubble('user', prompt));
  const work = el('div', null, 'agents-msg is-assistant is-working');
  const steps = el('ol', null, 'agents-steps'); const out = el('div', null, 'agents-answer has-markdown');
  work.append(steps, out); log.append(work); work.scrollIntoView({ block: 'end', behavior: 'smooth' });
  const step = t => { steps.querySelectorAll('li.is-active').forEach(li => li.classList.remove('is-active')); steps.append(el('li', t, 'is-active')); };
  const payload = { agent: id.startsWith('custom:') ? 'custom' : id, prompt, history };
  if (id.startsWith('custom:')) payload.custom = { name: def.name, instructions: def.instructions, web: !!def.web };
  if (id === 'pc') { if (osSel.value) payload.os = osSel.value; if ($a('#agents-device').checked) payload.device = deviceInfo(); }
  controller = new AbortController();
  const status = $a('#agents-status'); status.textContent = `${def.name} is working…`;
  $a('#agents-send').disabled = true; $a('#agents-stop').hidden = false;
  let text = '', sources = [], failed = null, frame = 0;
  const paint = () => { frame = 0; out.replaceChildren(renderMarkdown(text, sources)); };
  try {
    const r = await fetch('/gg-agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
    if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})); throw Error(d.error || 'The agent is not available right now.'); }
    await readAIStream(r, ev => {
      if (ev.type === 'step') step(ev.text);
      else if (ev.type === 'text') { text += ev.delta; if (!frame) frame = requestAnimationFrame(paint); }
      else if (ev.type === 'source') sources.push({ title: ev.title, url: ev.url });
      else if (ev.type === 'error') failed = ev.error;
    }, controller.signal);
  } catch (err) { failed = err.name === 'AbortError' ? 'Stopped.' : err.message; }
  if (frame) cancelAnimationFrame(frame);
  steps.querySelectorAll('li.is-active').forEach(li => li.classList.remove('is-active'));
  controller = null; $a('#agents-send').disabled = false; $a('#agents-stop').hidden = true;
  if (text.trim()) {
    chat.push({ role: 'assistant', content: text, sources }); save();
    const done = bubble('assistant', text, sources);
    if (steps.children.length) { const d = el('details', null, 'agents-trace'); d.append(el('summary', `What the agent did (${steps.children.length} steps)`), steps); done.prepend(d); }
    if (current === id) { if (work.isConnected) work.replaceWith(done); else renderLog(); }
    if (current === id) status.textContent = failed ? `${failed} The partial answer was kept.` : 'Done.';
  } else {
    chat.pop(); save(); work.remove();
    if (current === id) { input.value = prompt; renderStarters(); }
    if (current === id) status.textContent = failed || 'The agent returned no answer. Please try again.';
  }
};

// Typing "/agent …", "fix my pc …" or "research …" in the main chat hands the task to the matching agent.
const INTENTS = [
  [/^\s*\/(pc|fix)\b[\s:,]*/i, 'pc'], [/^\s*\/research\b[\s:,]*/i, 'research'], [/^\s*\/(code|coder)\b[\s:,]*/i, 'coder'],
  [/^\s*\/(write|writer)\b[\s:,]*/i, 'writer'], [/^\s*\/tutor\b[\s:,]*/i, 'tutor'], [/^\s*\/(plan|planner)\b[\s:,]*/i, 'planner'],
];
const PC_PHRASE = /^\s*(fix my (pc|computer|laptop)|ripara(mi)? il (mio )?(pc|computer))\b/i;
window.addEventListener('submit', e => {
  if (e.target?.id !== 'chatform') return;
  const input = $a('#prompt'), value = input?.value || '';
  const hit = INTENTS.find(([re]) => re.test(value)), pc = !hit && PC_PHRASE.test(value);
  if (!hit && !pc) return;
  e.preventDefault(); e.stopImmediatePropagation();
  input.value = '';
  if (pc) openAgents('pc', value.trim()); else openAgents(hit[1], value.replace(hit[0], '').trim());
}, true);

renderHome();
