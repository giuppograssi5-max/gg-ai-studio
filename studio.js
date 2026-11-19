// GG · Movies & TV series AI. Submit your story, the characters and monsters you invent and the environments it happens in;
// GG writes the film or series, creates the cast, poster and every scene, and plays it back as a
// narrated episode you can export as a video, save and share in the showcase.
import { FORMATS, STYLE_LABELS, LIMITS, CHARACTER_KINDS, portraitPrompt, scenePrompt, posterPrompt, screenplay } from './studio-core.js?v=20261117-cast';

const $s = sel => document.querySelector(sel);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const btn = (text, cls = 'studio-ghost', title) => { const b = el('button', text, cls); b.type = 'button'; if (title) b.title = title; return b; };
const lang = () => { try { return new Intl.DisplayNames(['en'], { type: 'language' }).of((document.documentElement.lang || navigator.language || 'en').split('-')[0]) || 'English'; } catch { return 'English'; } };

const section = el('section', null, 'view hidden studio-view');
section.id = 'studio';
section.innerHTML = `<div class="studio-hero"><span class="studio-kicker">GG · Movies &amp; TV series AI</span><h2>What do you want to create: a movie or a TV show?</h2>
  <form id="studio-form" class="studio-bar" novalidate>
    <textarea name="story" rows="1" maxlength="${LIMITS.story}" required aria-label="Describe your movie or TV show" placeholder="Describe your movie or TV show: the characters and monsters you invent, where it happens, how it feels…"></textarea>
    <ul class="studio-mycast" aria-label="Your characters"></ul>
    <fieldset class="studio-newchar" hidden><legend>New character</legend>
      <select name="kind" aria-label="Kind">${Object.entries(CHARACTER_KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
      <input name="cname" maxlength="60" placeholder="Name, e.g. Grumbol" aria-label="Character name">
      <input name="cdesc" maxlength="400" placeholder="What they look like and who they are" aria-label="Character description">
      <div class="studio-row"><button type="button" class="studio-link" data-c="random">🎲 Surprise me</button><button type="button" class="studio-ghost" data-c="cancel">Cancel</button><button type="button" class="studio-primary" data-c="add">Add</button></div>
    </fieldset>
    <div class="studio-bar-row">
      <div class="studio-row"><div class="studio-seg" role="radiogroup" aria-label="Format"><label><input type="radio" name="format" value="movie" checked><span>🎬 Movie</span></label><label><input type="radio" name="format" value="series"><span>📺 TV show</span></label></div><button type="button" class="studio-addchar" data-c="open">＋ Character or monster</button></div>
      <button type="submit" class="studio-send" id="studio-write" aria-label="Create">↑</button>
    </div>
  </form>
  <p class="studio-fiction">Only invented characters: people you make up, monsters, creatures, aliens, robots. Real people, celebrities and photos of anyone aren’t allowed.</p>
  <p class="studio-status" role="status"></p>
  <nav class="studio-tabs" role="tablist" aria-label="Studio"><button type="button" role="tab" data-tab="create" aria-selected="true">Create</button><button type="button" role="tab" data-tab="mine" aria-selected="false">My productions</button><button type="button" role="tab" data-tab="showcase" aria-selected="false">Showcase</button></nav>
</div>
<div class="studio-panel" data-panel="create">
  <div id="studio-production" class="studio-production" hidden></div>
</div>
<div class="studio-panel" data-panel="mine" hidden><div id="studio-mine"></div></div>
<div class="studio-panel" data-panel="showcase" hidden><p class="studio-hint">Films and series published by GG members. Open one to watch it.</p><div id="studio-showcase" class="studio-cards"></div></div>
<dialog id="studio-publish" class="studio-dialog"><form method="dialog"><h3>Publish to the showcase</h3><p>Your production becomes visible to everyone in the GG showcase. Its text is checked against the community rules first.</p><label>Name shown as the author<input name="author" minlength="2" maxlength="30" required placeholder="e.g. Giulia R."></label><small>Don’t use your full name or email.</small><p class="studio-status" role="status"></p><div class="studio-row"><button value="cancel" class="studio-ghost" formnovalidate>Cancel</button><button value="ok" class="studio-primary">Publish</button></div></form></dialog>
<div id="studio-player" class="studio-player" hidden role="dialog" aria-modal="true" aria-label="Player"><div class="studio-screen"><img alt=""><div class="studio-card-title"></div><p class="studio-sub"></p></div><div class="studio-controls"><button type="button" data-p="prev" aria-label="Previous scene">⏮</button><button type="button" data-p="play" aria-label="Pause">⏸</button><button type="button" data-p="next" aria-label="Next scene">⏭</button><button type="button" data-p="voice" aria-label="Turn voices off">🔊</button><span class="studio-where"></span><button type="button" data-p="close" aria-label="Close player">✕</button></div></div>`;
$s('.main').append(section);

const nav = el('button', null, 'nav'); nav.type = 'button';
nav.append(el('span', '🎞'), ' Movies & TV series AI');
$s('.sidebar nav').append(nav);

export function openStudio(tab) {
  if (typeof view === 'function') view('studio');
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v !== section));
  document.querySelectorAll('.sidebar .nav').forEach(n => n.classList.toggle('active', n === nav));
  $s('#viewtitle').textContent = 'Movies & TV series AI';
  if (tab) showTab(tab);
  section.scrollIntoView?.({ block: 'start' });
}
nav.onclick = () => openStudio();

function showTab(name) {
  section.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  section.querySelectorAll('.studio-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
  if (name === 'mine') loadMine();
  if (name === 'showcase') loadShowcase();
}
section.querySelectorAll('[role=tab]').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

// --- Network ---------------------------------------------------------------------------------
async function ai(body, signal) {
  const r = await fetch('/gg-studio/ai', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = JSON.parse((await r.text()).trim() || '{}');
  if (!r.ok || data.error) throw Error(data.error || 'The studio AI is unavailable right now.');
  return data;
}
async function api(path, options = {}) {
  const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(Error(data.error || 'The studio is unavailable right now.'), { status: r.status, data });
  return data;
}

// --- Images ----------------------------------------------------------------------------------
const dataUrl = img => `data:${img.mimeType};base64,${img.data}`;
function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(Error('Image unavailable')); i.src = src; });
}
// Small JPEG copies keep reference images well under the request limit.
async function toRef(src, max = 640) {
  const img = await loadImage(src);
  const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = el('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { mimeType: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.85).split(',')[1] };
}

// --- Prompt bar -------------------------------------------------------------------------------
// One prompt is the whole brief: GG picks the genre, cast and environments from it.
const form = $s('#studio-form');
const hero = $s('.studio-hero');
const status = text => { hero.querySelector('.studio-status').textContent = text || ''; };
const story = form.elements.story;
const grow = () => { story.style.height = 'auto'; story.style.height = Math.min(story.scrollHeight, 240) + 'px'; };
story.oninput = grow;
story.onkeydown = e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };

// --- Invented cast ---------------------------------------------------------------------------
// Users can add their own characters and monsters; GG invents the rest from the prompt.
const cast = [];
const castList = form.querySelector('.studio-mycast');
const editor = form.querySelector('.studio-newchar');
const RANDOM = {
  first: ['Grumbol', 'Vexa', 'Mortimer Fang', 'Zib', 'Old Thessaly', 'Krrak', 'Nimbleroot', 'Oona Gloom', 'Brakk', 'Pip-9', 'Lady Murk', 'Sorrel'],
  kinds: ['monster', 'creature', 'alien', 'robot', 'spirit', 'animal'],
  looks: ['a shy swamp monster covered in glowing moss', 'a three-eyed giant who collects lost umbrellas', 'a tiny dragon afraid of fire', 'a rusty robot who dreams of being a gardener', 'a ghost librarian who whispers forgotten stories', 'a fox with silver fur who runs a night market', 'a jelly-like alien who changes color with every mood', 'a horned beast who guards the last lighthouse', 'a shadow creature that only appears in mirrors'],
};
const pick = a => a[Math.floor(Math.random() * a.length)];
function renderCast() {
  castList.replaceChildren(...cast.map((c, i) => {
    const li = el('li', null, 'studio-castchip');
    li.append(el('span', CHARACTER_KINDS[c.kind].split(' ')[0]), el('b', c.name), c.description ? el('span', c.description, 'studio-castdesc') : '');
    const x = btn('✕', 'studio-castx', `Remove ${c.name}`); x.setAttribute('aria-label', `Remove ${c.name}`);
    x.onclick = () => { cast.splice(i, 1); renderCast(); };
    li.append(x); return li;
  }));
  form.querySelector('[data-c=open]').hidden = cast.length >= LIMITS.people;
}
function openEditor(show) {
  editor.hidden = !show;
  if (show) { editor.elements.cname.value = ''; editor.elements.cdesc.value = ''; editor.elements.kind.value = 'monster'; editor.elements.cname.focus(); }
}
form.addEventListener('click', e => {
  const c = e.target.closest('[data-c]')?.dataset.c;
  if (!c) return;
  if (c === 'open') openEditor(true);
  if (c === 'cancel') openEditor(false);
  if (c === 'random') {
    const kind = pick(RANDOM.kinds);
    editor.elements.kind.value = kind; editor.elements.cname.value = pick(RANDOM.first); editor.elements.cdesc.value = pick(RANDOM.looks);
  }
  if (c === 'add') {
    const name = editor.elements.cname.value.trim();
    if (!name) { editor.elements.cname.focus(); return; }
    if (cast.length < LIMITS.people) cast.push({ name, kind: editor.elements.kind.value, description: editor.elements.cdesc.value.trim() });
    renderCast(); openEditor(false); story.focus();
  }
});
editor.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); editor.querySelector('[data-c=add]').click(); } });

function readBrief() {
  const text = story.value.trim();
  if (text.length < 20) throw Error('Describe your idea in a sentence or two.');
  return { brief: { format: form.elements.format.value, genre: 'Auto', style: 'cinematic', aspect: '16:9', episodes: 4, language: lang(), story: text, environments: [], people: cast.map(c => ({ ...c })) } };
}

// --- Production state ----------------------------------------------------------------------------
let P = null; // { id, brief, script, images: {slot: src}, dirty: Set, mine, published, author }
let signedIn = null;
let busy = false;

form.onsubmit = async e => {
  e.preventDefault();
  if (busy) return;
  let input;
  try { input = readBrief(); } catch (err) { status(err.message); return; }
  busy = true; const write = $s('#studio-write'); write.disabled = true;
  status(input.brief.format === 'series' ? 'Writing your series… this takes about half a minute.' : 'Writing your movie… this takes about half a minute.');
  try {
    const { script } = await ai({ action: 'script', brief: input.brief });
    P = { id: null, brief: input.brief, script, images: {}, dirty: new Set(), mine: true, published: false };
    status(script.realPeopleReplaced ? 'Real people can’t appear in GG productions, so GG invented original characters in their place.' : '');
    renderProduction();
    autosave();
    createAll();
  } catch (err) { status(err.message); }
  finally { busy = false; write.disabled = false; }
};

const charSlot = i => `char-${i}`;
const sceneSlot = (ep, i) => `scene-${ep}-${i}`;

function slotJob(slot) {
  const { script, brief } = P;
  if (slot === 'poster') return { prompt: posterPrompt(script, brief.style), aspect: brief.aspect === '16:9' ? '9:16' : brief.aspect, refs: () => castRefs(script.characters.slice(0, 3)) };
  const [kind, a, b] = slot.split('-');
  if (kind === 'char') return { prompt: portraitPrompt(script.characters[+a], brief.style), aspect: '1:1', refs: async () => [] };
  const scene = script.episodes[+a - 1].scenes[+b];
  return { prompt: scenePrompt(script, scene, brief.style), aspect: brief.aspect, refs: () => castRefs(script.characters.filter(c => scene.characters.some(n => n.toLowerCase() === c.name.toLowerCase())).slice(0, LIMITS.refs)) };
}
async function castRefs(cast) {
  const refs = [];
  for (const c of cast) {
    const i = P.script.characters.indexOf(c), src = P.images[charSlot(i)];
    try { if (src) refs.push(await toRef(src, 512)); } catch {}
  }
  return refs.slice(0, LIMITS.refs);
}

const pending = new Set();
async function makeImage(slot) {
  if (pending.has(slot) || !P) return;
  const owner = P; pending.add(slot); paintSlot(slot);
  try {
    const job = slotJob(slot);
    const { image } = await ai({ action: 'image', prompt: job.prompt, aspect: job.aspect, refs: await job.refs() });
    if (owner !== P) return;
    P.images[slot] = dataUrl(image); P.dirty.add(slot);
  } catch (err) { if (owner === P) prodStatus(err.message); }
  finally { pending.delete(slot); if (owner === P) paintSlot(slot); }
}

let running = null;
async function createAll() {
  if (!P?.mine || running) return;
  const owner = P;
  const slots = [...P.script.characters.map((_, i) => charSlot(i)), 'poster'];
  P.script.episodes.forEach(ep => ep.scenes.forEach((_, i) => slots.push(sceneSlot(ep.number, i))));
  const todo = slots.filter(s => !P.images[s]);
  if (!todo.length) { prodStatus('Every image is ready.'); return; }
  running = { cancelled: false };
  let done = 0;
  const progress = () => prodStatus(`Creating images… ${done} / ${todo.length}. You can read the script meanwhile.`);
  progress();
  // Portraits first so that scenes can use them as references; then two at a time.
  const portraits = todo.filter(s => s.startsWith('char-')), rest = todo.filter(s => !s.startsWith('char-'));
  const runList = async list => {
    const queue = [...list];
    await Promise.all([0, 1].map(async () => { while (queue.length && !running.cancelled && owner === P) { await makeImage(queue.shift()); done++; progress(); } }));
  };
  await runList(portraits); await runList(rest);
  running = null;
  if (owner !== P) return;
  prodStatus(todo.every(s => P.images[s]) ? 'Your production is ready. Press ▶ Watch.' : 'Some images did not finish. Press “Create missing images” to try again.');
  autosave();
}

async function writeEpisode(number) {
  if (busy || !P) return;
  busy = true; const owner = P;
  prodStatus(`Writing episode ${number}…`);
  try {
    const { scenes } = await ai({ action: 'episode', script: P.script, number, language: P.brief.language });
    if (owner !== P) return;
    P.script.episodes[number - 1].scenes = scenes;
    renderProduction(number);
    autosave();
    busy = false;
    createAll();
  } catch (err) { prodStatus(err.message); }
  finally { busy = false; }
}

// --- Saving ------------------------------------------------------------------------------------------
async function save({ quiet = false } = {}) {
  if (!P?.mine) return;
  const owner = P;
  try {
    const project = { brief: P.brief, script: P.script, images: Object.keys(P.images) };
    const res = await api('/gg-studio/projects', { method: 'POST', body: JSON.stringify({ action: 'save', id: P.id, project }) });
    signedIn = true;
    if (owner !== P) return;
    P.id = res.id; if (res.published === false) P.published = false;
    for (const slot of [...P.dirty]) {
      const blob = await (await fetch(P.images[slot])).blob();
      const r = await fetch(`/gg-studio/image?id=${P.id}&slot=${slot}`, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': blob.type }, body: blob });
      if (r.ok) P.dirty.delete(slot);
    }
    if (!quiet) prodStatus(P.dirty.size ? 'Saved. Some images could not be uploaded; save again to retry.' : 'Saved to My productions.');
    renderActions();
  } catch (err) {
    if (err.status === 401) { signedIn = false; if (!quiet) { prodStatus('Sign in to save your productions, then press Save again. Until then, it stays in this page only.'); document.querySelector('.gg-login')?.click(); } }
    else if (!quiet) prodStatus(err.message);
  }
}
let saveTimer = null;
const autosave = () => { if (signedIn === false) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => save({ quiet: true }), 600); };

// --- Production view -------------------------------------------------------------------------------
const prod = $s('#studio-production');
const prodStatus = text => { const s = prod.querySelector('.studio-prod-status'); if (s) s.textContent = text || ''; };
let currentEp = 1;

function slotNode(slot, label, aspect) {
  const box = el('figure', null, 'studio-shot'); box.dataset.slot = slot; box.style.aspectRatio = aspect.replace(':', ' / ');
  box.dataset.label = label;
  return box;
}
function paintSlot(slot) {
  prod.querySelectorAll(`[data-slot="${slot}"]`).forEach(box => {
    box.replaceChildren();
    const src = P.images[slot];
    if (src) { const img = el('img'); img.src = src; img.alt = box.dataset.label; img.loading = 'lazy'; box.append(img); }
    else if (pending.has(slot)) box.append(el('span', null, 'studio-spin'), el('small', 'Creating…'));
    else box.append(el('small', P.mine ? 'No image yet' : 'No image'));
    if (P.mine && !pending.has(slot)) {
      const again = btn(src ? '↻' : '✦ Create', 'studio-redo', src ? 'Create this image again' : 'Create this image');
      again.onclick = () => makeImage(slot).then(() => autosave());
      box.append(again);
    }
  });
}

function renderActions() {
  const bar = prod.querySelector('.studio-actions'); if (!bar) return;
  bar.replaceChildren();
  const watch = btn('▶ Watch', 'studio-primary'); watch.onclick = () => play(currentEp);
  const video = btn('⬇ Export video'); video.onclick = () => exportVideo(currentEp);
  const text = btn('⬇ Screenplay'); text.onclick = downloadScript;
  bar.append(watch, video, text);
  if (P.mine) {
    const more = btn('✦ Create missing images'); more.onclick = createAll;
    const keep = btn(P.id ? 'Save' : 'Save to my account'); keep.onclick = () => save();
    bar.append(more, keep);
    if (P.id) {
      const pub = btn(P.published ? '✓ Published · Unpublish' : '🌍 Publish');
      pub.onclick = P.published ? unpublish : () => $s('#studio-publish').showModal();
      bar.append(pub);
    }
  }
  const fresh = btn('New story', 'studio-link'); fresh.onclick = () => { if (running) running.cancelled = true; P = null; prod.hidden = true; hero.hidden = false; story.value = ''; cast.length = 0; renderCast(); grow(); hero.scrollIntoView({ block: 'start' }); story.focus(); };
  bar.append(fresh);
}

function renderProduction(ep = 1) {
  const { script, brief } = P;
  currentEp = ep;
  hero.hidden = true; prod.hidden = false; prod.replaceChildren();
  const top = el('div', null, 'studio-top');
  const poster = slotNode('poster', `${script.title} poster`, brief.aspect === '16:9' ? '9:16' : brief.aspect); poster.classList.add('studio-poster');
  const info = el('div', null, 'studio-info');
  info.append(el('span', `${[FORMATS[brief.format], brief.genre !== 'Auto' && brief.genre, STYLE_LABELS[brief.style]].filter(Boolean).join(' · ')}${P.author ? ` · by ${P.author}` : ''}`, 'studio-kicker'), el('h3', script.title), el('p', script.logline, 'studio-logline'), el('p', script.synopsis));
  const actions = el('div', null, 'studio-row studio-actions');
  info.append(actions, el('p', null, 'studio-status studio-prod-status'));
  top.append(poster, info);

  const cast = el('div', null, 'studio-block'); cast.append(el('h3', 'Cast'));
  const castGrid = el('div', null, 'studio-cast');
  script.characters.forEach((c, i) => {
    const card = el('div', null, 'studio-cast-card');
    card.append(slotNode(charSlot(i), c.name, '1:1'), el('b', c.name), el('small', [c.kind && c.kind !== 'person' && CHARACTER_KINDS[c.kind], c.role].filter(Boolean).join(' · ')), el('p', c.look));
    castGrid.append(card);
  });
  cast.append(castGrid);

  const envs = el('div', null, 'studio-block'); envs.append(el('h3', 'Environments'));
  const envList = el('div', null, 'studio-env-list');
  script.environments.forEach(e => { const d = el('div', null, 'studio-env'); d.append(el('b', e.name), el('small', e.look)); envList.append(d); });
  envs.append(envList);

  const eps = el('div', null, 'studio-block');
  eps.append(el('h3', brief.format === 'series' ? 'Episodes' : 'Scenes'));
  if (brief.format === 'series') {
    const tabs = el('div', null, 'studio-ep-tabs'); tabs.setAttribute('role', 'tablist');
    script.episodes.forEach(e => { const t = btn(`${e.number}. ${e.title}`, 'studio-chip'); t.setAttribute('aria-pressed', String(e.number === ep)); t.onclick = () => { currentEp = e.number; renderEpisode(body, e); tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === t))); }; tabs.append(t); });
    eps.append(tabs);
  }
  const body = el('div'); eps.append(body);
  prod.append(top, cast, envs, eps);
  renderEpisode(body, script.episodes[ep - 1]);
  renderActions();
  Object.keys(P.images).concat(['poster'], script.characters.map((_, i) => charSlot(i))).forEach(paintSlot);
  prod.scrollIntoView({ block: 'start' });
}

function renderEpisode(box, ep) {
  box.replaceChildren();
  if (P.brief.format === 'series') box.append(el('p', ep.summary, 'studio-hint'));
  if (!ep.scenes.length) {
    if (P.mine) { const w = btn(`✦ Write episode ${ep.number}`, 'studio-primary'); w.onclick = () => writeEpisode(ep.number); box.append(w); }
    else box.append(el('p', 'This episode has not been scripted yet.', 'studio-hint'));
    return;
  }
  ep.scenes.forEach((s, i) => {
    const row = el('article', null, 'studio-scene');
    const text = el('div', null, 'studio-scene-text');
    text.append(el('span', `SCENE ${i + 1} · ${s.environment}`, 'studio-kicker'), el('h4', s.heading), el('p', s.action));
    const lines = el('div', null, 'studio-lines');
    s.dialogue.forEach(d => { const l = el('p'); l.append(el('b', d.character), el('span', d.line)); lines.append(l); });
    text.append(lines);
    row.append(slotNode(sceneSlot(ep.number, i), s.heading, P.brief.aspect), text);
    box.append(row);
  });
  ep.scenes.forEach((_, i) => paintSlot(sceneSlot(ep.number, i)));
}

function downloadScript() {
  const blob = new Blob([screenplay(P.script, P.brief)], { type: 'text/plain;charset=utf-8' });
  const a = el('a'); a.href = URL.createObjectURL(blob); a.download = `${P.script.title.replace(/[^\w\- ]+/g, '').trim() || 'gg-production'} - screenplay.txt`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// --- Publishing --------------------------------------------------------------------------------------
const pubDialog = $s('#studio-publish');
pubDialog.querySelector('form').onsubmit = async e => {
  if (e.submitter?.value !== 'ok') return;
  e.preventDefault();
  const note = pubDialog.querySelector('.studio-status');
  note.textContent = 'Checking and publishing…';
  try {
    await save({ quiet: true });
    const author = pubDialog.querySelector('input[name=author]').value;
    await api('/gg-studio/projects', { method: 'POST', body: JSON.stringify({ action: 'publish', id: P.id, author }) });
    P.published = true; P.author = author.trim(); note.textContent = ''; pubDialog.close();
    prodStatus('Published! Everyone can now watch it in the Showcase.'); renderActions();
  } catch (err) { note.textContent = err.data?.reason ? `${err.message} ${err.data.reason}` : err.message; }
};
async function unpublish() {
  try { await api('/gg-studio/projects', { method: 'POST', body: JSON.stringify({ action: 'unpublish', id: P.id }) }); P.published = false; prodStatus('Removed from the Showcase.'); renderActions(); }
  catch (err) { prodStatus(err.message); }
}

// --- Lists -------------------------------------------------------------------------------------------
function card(p, onOpen, extra) {
  const c = el('article', null, 'studio-pcard');
  const art = el('button', null, 'studio-pcard-art'); art.type = 'button'; art.setAttribute('aria-label', `Open ${p.title}`);
  if (p.poster) { const img = el('img'); img.src = p.poster; img.alt = ''; img.loading = 'lazy'; art.append(img); } else art.append(el('span', p.format === 'series' ? '📺' : '🎬'));
  art.onclick = onOpen;
  c.append(art, el('span', `${FORMATS[p.format] || ''}${p.genre && p.genre !== 'Auto' ? ' · ' + p.genre : ''}${p.author ? ' · by ' + p.author : ''}`, 'studio-kicker'), el('b', p.title), el('p', p.logline));
  if (extra) c.append(extra);
  return c;
}
async function openProject(id) {
  try {
    const { project } = await api(`/gg-studio/projects?id=${encodeURIComponent(id)}`);
    if (running) running.cancelled = true;
    const images = {}; for (const slot of project.images) images[slot] = `/gg-studio/image?id=${project.id}&slot=${slot}&v=${project.version}`;
    P = { id: project.id, brief: project.brief, script: project.script, images, dirty: new Set(), mine: project.mine, published: project.published, author: project.author };
    showTab('create'); renderProduction();
  } catch (err) { alert(err.message); }
}
async function loadMine() {
  const box = $s('#studio-mine');
  box.replaceChildren(el('p', 'Loading…', 'studio-hint'));
  try {
    const { projects } = await api('/gg-studio/projects'); signedIn = true;
    box.replaceChildren();
    if (!projects.length) { box.append(el('p', 'No saved productions yet. Create one and it appears here.', 'studio-hint')); return; }
    const grid = el('div', null, 'studio-cards');
    for (const p of projects) {
      const del = btn('Delete', 'studio-link');
      del.onclick = async () => { if (!confirm(`Delete “${p.title}” and its images?`)) return; try { await api(`/gg-studio/projects?id=${p.id}`, { method: 'DELETE' }); if (P?.id === p.id) P.id = null; loadMine(); } catch (err) { alert(err.message); } };
      const extra = el('div', null, 'studio-row'); extra.append(el('small', p.published ? '🌍 Published' : 'Private'), del);
      grid.append(card(p, () => openProject(p.id), extra));
    }
    box.append(grid);
  } catch (err) {
    box.replaceChildren();
    if (err.status === 401) { signedIn = false; const b = btn('Sign in', 'studio-primary'); b.onclick = () => document.querySelector('.gg-login')?.click(); box.append(el('p', 'Sign in to your GG account to save productions and find them here on any device.', 'studio-hint'), b); }
    else box.append(el('p', err.message, 'studio-hint'));
  }
}
async function loadShowcase() {
  const box = $s('#studio-showcase');
  box.replaceChildren(el('p', 'Loading…', 'studio-hint'));
  try {
    const { projects } = await api('/gg-studio/showcase');
    box.replaceChildren();
    if (!projects.length) box.append(el('p', 'Nothing published yet. Be the first: create a production and press Publish.', 'studio-hint'));
    for (const p of projects) box.append(card(p, () => openProject(p.id)));
  } catch (err) { box.replaceChildren(el('p', err.message, 'studio-hint')); }
}

// --- Playback: a sequence of title cards and scenes with narration and character voices ------------------
function sequence(epNumber) {
  const { script, brief } = P;
  const ep = script.episodes[epNumber - 1];
  const items = [{ title: script.title, sub: brief.format === 'series' ? `Episode ${ep.number}: ${ep.title}` : script.logline, img: P.images.poster }];
  ep.scenes.forEach((s, i) => items.push({
    img: P.images[sceneSlot(ep.number, i)], heading: s.heading,
    lines: [{ who: null, text: s.action }, ...s.dialogue.map(d => ({ who: d.character, text: d.line }))],
  }));
  items.push({ title: brief.format === 'series' && epNumber < script.episodes.length ? 'To be continued…' : 'The End', sub: 'Created with GG · Movies & TV series AI', img: null });
  return items;
}
const lineSeconds = text => Math.min(12, Math.max(2.5, text.length / 15));

const player = $s('#studio-player');
let show = null;
function voiceFor(who) {
  const voices = speechSynthesis.getVoices();
  const code = (document.documentElement.lang || navigator.language || 'en').slice(0, 2);
  const list = voices.filter(v => v.lang.toLowerCase().startsWith(code)); const pool = list.length ? list : voices;
  if (!who) return { voice: pool[0], pitch: 1, rate: 0.95 };
  const i = P.script.characters.findIndex(c => c.name.toLowerCase() === who.toLowerCase());
  const n = i < 0 ? 0 : i + 1;
  return { voice: pool[n % Math.max(1, pool.length)], pitch: [1.05, 0.8, 1.3, 0.95, 1.2, 0.7, 1.15][n % 7], rate: 1 };
}
function say(text, who) {
  return new Promise(resolve => {
    if (!show.voice || !window.speechSynthesis) { setTimeout(resolve, lineSeconds(text) * 1000); return; }
    const u = new SpeechSynthesisUtterance(text); const v = voiceFor(who);
    if (v.voice) u.voice = v.voice; u.pitch = v.pitch; u.rate = v.rate; u.lang = document.documentElement.lang || navigator.language;
    const guard = setTimeout(resolve, lineSeconds(text) * 1000 + 8000);
    u.onend = u.onerror = () => { clearTimeout(guard); resolve(); };
    speechSynthesis.speak(u);
  });
}
async function runShow(token) {
  const screen = player.querySelector('.studio-screen'), img = screen.querySelector('img'), titleBox = screen.querySelector('.studio-card-title'), sub = screen.querySelector('.studio-sub');
  while (show && show.token === token && show.i < show.items.length) {
    const it = show.items[show.i];
    player.querySelector('.studio-where').textContent = `${show.i + 1} / ${show.items.length}`;
    img.hidden = !it.img; if (it.img) { img.src = it.img; img.classList.remove('studio-kb'); void img.offsetWidth; img.classList.add('studio-kb'); }
    titleBox.replaceChildren(); sub.textContent = '';
    if (it.title) { titleBox.append(el('strong', it.title), el('span', it.sub)); await new Promise(r => setTimeout(r, 3500)); }
    else for (const line of it.lines) {
      if (!show || show.token !== token) return;
      while (show?.paused && show.token === token) await new Promise(r => setTimeout(r, 200));
      sub.replaceChildren(); if (line.who) sub.append(el('b', line.who + ' ')); sub.append(line.text); sub.classList.toggle('studio-narration', !line.who);
      await say(line.text, line.who);
    }
    if (show && show.token === token) show.i++;
  }
  if (show && show.token === token) closePlayer();
}
function play(epNumber, from = 0) {
  if (!P) return;
  const ep = P.script.episodes[epNumber - 1];
  if (!ep.scenes.length) { prodStatus('Write this episode first.'); return; }
  window.speechSynthesis?.cancel();
  show = { items: show?.items && show.ep === epNumber ? show.items : sequence(epNumber), ep: epNumber, i: from, token: Symbol(), paused: false, voice: show?.voice ?? !!window.speechSynthesis };
  player.hidden = false; player.querySelector('[data-p=play]').textContent = '⏸';
  player.querySelector('[data-p=voice]').textContent = show.voice ? '🔊' : '🔇';
  player.requestFullscreen?.().catch(() => {});
  runShow(show.token);
}
function closePlayer() { window.speechSynthesis?.cancel(); show = null; player.hidden = true; if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); }
player.querySelector('.studio-controls').onclick = e => {
  const b = e.target.closest('button'); if (!b || !show) return;
  const action = b.dataset.p;
  if (action === 'close') closePlayer();
  else if (action === 'prev' || action === 'next') play(show.ep, Math.max(0, Math.min(show.items.length - 1, show.i + (action === 'next' ? 1 : -1))));
  else if (action === 'play') { show.paused = !show.paused; b.textContent = show.paused ? '▶' : '⏸'; if (show.paused) window.speechSynthesis?.pause(); else window.speechSynthesis?.resume(); }
  else if (action === 'voice') { show.voice = !show.voice; b.textContent = show.voice ? '🔊' : '🔇'; if (!show.voice) window.speechSynthesis?.cancel(); }
};
document.addEventListener('keydown', e => { if (!player.hidden && e.key === 'Escape') closePlayer(); });

// --- Video export: render the episode with slow camera moves and subtitles through a canvas -------------
function pickMime() {
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}
function wrap(ctx, text, maxW) {
  const words = text.split(' '), lines = []; let line = '';
  for (const w of words) { const next = line ? `${line} ${w}` : w; if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = w; } else line = next; }
  lines.push(line); return lines;
}
async function exportVideo(epNumber) {
  if (!P) return;
  const ep = P.script.episodes[epNumber - 1];
  if (!ep.scenes.length) { prodStatus('Write this episode first.'); return; }
  const mime = pickMime();
  if (!mime || !HTMLCanvasElement.prototype.captureStream) { prodStatus('This browser cannot export video. Use a recent Chrome, Edge, Firefox or Safari.'); return; }
  const [aw, ah] = P.brief.aspect.split(':').map(Number);
  const W = aw >= ah ? 1280 : Math.round(1280 * aw / ah), H = aw >= ah ? Math.round(1280 * ah / aw) : 1280;
  const items = sequence(epNumber);
  const imgs = await Promise.all(items.map(it => it.img ? loadImage(it.img).catch(() => null) : null));
  // Timeline: each line is shown long enough to read it.
  const timeline = items.map(it => ({ it, parts: it.title ? [{ text: '', d: 3.5 }] : it.lines.map(l => ({ ...l, d: lineSeconds(l.text) })) }));
  const total = timeline.reduce((s, t) => s + t.parts.reduce((a, p) => a + p.d, 0), 0);
  const canvas = el('canvas'); canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  const recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: mime, videoBitsPerSecond: 6e6 });
  const chunks = []; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(r => { recorder.onstop = r; });
  const draw = (img, k) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    if (!img) return;
    const s = Math.max(W / img.naturalWidth, H / img.naturalHeight) * (1.04 + 0.08 * k);
    const w = img.naturalWidth * s, h = img.naturalHeight * s;
    ctx.drawImage(img, (W - w) / 2 - (k - 0.5) * W * 0.03, (H - h) / 2, w, h);
  };
  const text = (str, y, size, weight = 700) => {
    ctx.font = `${weight} ${size}px system-ui, -apple-system, Segoe UI, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.fillStyle = '#fff';
    const lines = wrap(ctx, str, W * 0.86), lh = size * 1.3;
    lines.forEach((l, i) => { const yy = y + (i - (lines.length - 1) / 2) * lh; ctx.strokeText(l, W / 2, yy); ctx.fillText(l, W / 2, yy); });
    return lines.length * lh;
  };
  const exportBtn = [...prod.querySelectorAll('.studio-actions button')].find(b => b.textContent.includes('Export'));
  if (exportBtn) exportBtn.disabled = true;
  recorder.start(1000);
  const start = performance.now(), size = Math.round(Math.min(W, H) * 0.042);
  await new Promise(resolve => {
    const frame = () => {
      const t = (performance.now() - start) / 1000;
      if (t >= total || !P) { resolve(); return; }
      let acc = 0, idx = 0;
      for (; idx < timeline.length; idx++) { const d = timeline[idx].parts.reduce((a, p) => a + p.d, 0); if (t < acc + d) break; acc += d; }
      const { it, parts } = timeline[Math.min(idx, timeline.length - 1)];
      const dur = parts.reduce((a, p) => a + p.d, 0), local = t - acc;
      draw(imgs[Math.min(idx, imgs.length - 1)], Math.min(1, local / dur));
      if (it.title) { if (it.img) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(0, 0, W, H); } text(it.title, H * 0.45, size * 2.1); text(it.sub || '', H * 0.6, size, 500); }
      else {
        let a = 0, part = parts[0]; for (const p of parts) { if (local < a + p.d) { part = p; break; } a += p.d; }
        text(part.who ? `${part.who}: ${part.text}` : part.text, H * 0.86, size, part.who ? 700 : 500);
      }
      // Fade in and out of each card.
      const edge = Math.min(local, dur - local); if (edge < 0.4) { ctx.fillStyle = `rgba(0,0,0,${1 - edge / 0.4})`; ctx.fillRect(0, 0, W, H); }
      prodStatus(`Exporting video… ${Math.round(t / total * 100)}% (keep this tab open; it records in real time)`);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  recorder.stop(); await stopped;
  if (exportBtn) exportBtn.disabled = false;
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const a = el('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: mime.split(';')[0] }));
  a.download = `${(P?.script.title || 'gg').replace(/[^\w\- ]+/g, '').trim()}${P?.brief.format === 'series' ? ` - episode ${epNumber}` : ''}.${ext}`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  prodStatus('Video exported. Voices are not included in the file; the subtitles carry the dialogue.');
}

window.addEventListener('pagehide', () => window.speechSynthesis?.cancel());
// Deep link: /?studio opens the studio.
if (new URLSearchParams(location.search).has('studio')) openStudio();
