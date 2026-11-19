// GG Studio · "Create with AI": a chat where users type what they want and get a photo or a
// video short. The AI plans the creation, each still is generated on the server one at a time
// (so no request runs long), and shorts are animated, captioned, scored and exported in the
// browser, so nothing heavy is uploaded or stored.
import { cleanCreation } from './media-core.js';

let api, panel, log, form, input, sendBtn, stopBtn;
const state = { messages: [], current: null, busy: false, abort: null };
const RATIO = { '9:16': 9 / 16, '1:1': 1, '4:5': 4 / 5, '16:9': 16 / 9, '3:4': 3 / 4 };
const IDEAS = [
  'A 20-second vertical short about a sunrise hike in the Dolomites, with captions',
  'Short reel: 5 tips for a cozy reading corner, warm and calm',
  'A photo of a cappuccino on a marble bar in Rome, morning light',
  'Product poster for a lemon soda called "Zest", bold and summery',
  'Epic short trailer about the life of a lighthouse keeper',
];

export function init(deps) {
  api = deps; panel = deps.panel;
  const el = api.el;
  panel.innerHTML = `<div class="mc">
  <div class="mc-head"><b>💬 Create with AI</b><span>Type what you want: a photo, an illustration or a video short for Reels, TikTok and Shorts. Then ask for changes in plain words, like “make it darker” or “change scene 2 to a beach”.</span></div>
  <div class="mc-log" role="log" aria-live="polite" aria-label="Create with AI conversation"></div>
  <div class="media-chips mc-ideas"></div>
  <form class="mc-form"><label class="sr-only" for="mc-input">Describe what to create</label>
    <textarea id="mc-input" rows="2" maxlength="1500" placeholder="e.g. a 15-second short about Italian street food, upbeat, with captions"></textarea>
    <div class="mc-actions"><button type="button" class="mc-stop" hidden>Stop</button><button type="button" class="mc-clear">New chat</button><button type="submit" class="media-primary">Create ↑</button></div></form>
</div>`;
  log = panel.querySelector('.mc-log'); form = panel.querySelector('.mc-form'); input = panel.querySelector('#mc-input');
  sendBtn = form.querySelector('[type=submit]'); stopBtn = form.querySelector('.mc-stop');
  const ideas = panel.querySelector('.mc-ideas');
  for (const idea of IDEAS) { const b = el('button', idea); b.type = 'button'; b.onclick = () => send(idea); ideas.append(b); }
  form.onsubmit = e => { e.preventDefault(); send(input.value); };
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
  stopBtn.onclick = () => state.abort?.abort();
  panel.querySelector('.mc-clear').onclick = () => { if (state.busy) state.abort?.abort(); state.messages = []; state.current = null; log.replaceChildren(); ideas.hidden = false; input.focus(); };
  bubble('assistant', 'Hi! What would you like to create today? Describe a photo or a video short and I will make it.');
}

export const focus = () => input?.focus();

function bubble(role, text) {
  const b = api.el('div', null, `mc-msg mc-${role}`);
  if (text) b.append(api.el('p', text));
  log.append(b); b.scrollIntoView?.({ block: 'nearest' });
  return b;
}
const status = (box, text) => { let s = box.querySelector('.mc-status'); if (!s) { s = api.el('p', '', 'mc-status'); box.append(s); } s.textContent = text; return s; };

export async function send(raw) {
  const text = String(raw || '').trim().slice(0, 1500);
  if (!text || state.busy) { if (!text) input.focus(); return; }
  panel.querySelector('.mc-ideas').hidden = true;
  input.value = '';
  bubble('user', text);
  state.messages.push({ role: 'user', text });
  const box = bubble('assistant');
  box.append(api.el('span', '', 'media-spin mc-spin'));
  status(box, 'Thinking…');
  setBusy(true);
  const signal = (state.abort = new AbortController()).signal;
  try {
    const decision = cleanCreation(await api.postMedia({ action: 'chat', messages: state.messages, current: state.current, language: window.GG_LANGUAGE?.locale || document.documentElement.lang || 'en' }, signal),
      state.current?.kind === 'short' ? state.current.scenes.length : 0);
    box.querySelector('.mc-spin')?.remove();
    box.prepend(api.el('p', decision.reply));
    state.messages.push({ role: 'assistant', text: decision.reply });
    if (decision.kind === 'photo') await makePhoto(decision.photo, box, signal);
    else if (decision.kind === 'short') await makeShort(decision.short, box, signal);
    box.querySelector('.mc-status')?.remove();
  } catch (error) {
    box.querySelector('.mc-spin')?.remove();
    status(box, error.name === 'AbortError' ? 'Stopped.' : error.message || 'Something went wrong. Try again.').classList.add('mc-error');
  } finally { setBusy(false); state.abort = null; }
}

function setBusy(on) { state.busy = on; sendBtn.disabled = on; stopBtn.hidden = !on; }

async function generate(prompt, aspect, signal, image) {
  let last;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await api.postMedia({ action: 'generate', prompt, aspect, ...(image ? { image } : {}) }, signal);
      const img = new Image();
      img.src = `data:${r.image.mimeType};base64,${r.image.data}`;
      await img.decode();
      return img;
    } catch (error) { if (error.name === 'AbortError') throw error; last = error; }
  }
  throw last;
}
function toCanvas(img) {
  const c = api.el('canvas'); c.width = img.naturalWidth || img.width; c.height = img.naturalHeight || img.height;
  c.getContext('2d').drawImage(img, 0, 0); return c;
}
const slug = text => api.nameBase((text || 'gg-creation').toLowerCase().slice(0, 50));

// --- Photos ---------------------------------------------------------------------------------
async function makePhoto(spec, box, signal) {
  const base = spec.edit && state.current?.kind === 'photo' ? state.current : null;
  status(box, base ? 'Editing the photo…' : 'Creating your image… this can take up to a minute.');
  let ref = null;
  if (base) {
    const s = Math.min(1, 2048 / Math.max(base.canvas.width, base.canvas.height)), c = api.el('canvas');
    c.width = Math.round(base.canvas.width * s); c.height = Math.round(base.canvas.height * s);
    c.getContext('2d').drawImage(base.canvas, 0, 0, c.width, c.height);
    ref = { mimeType: 'image/jpeg', data: api.canvasBase64(c, 'image/jpeg', 0.88) };
  }
  const prompt = spec.prompt;
  const img = await generate(prompt, base ? base.aspect : spec.aspect, signal, ref);
  const canvas = toCanvas(img);
  const name = slug(base ? `${base.name}-edit` : spec.prompt);
  state.current = { kind: 'photo', prompt: base ? `${base.prompt}. Then: ${spec.prompt}` : spec.prompt, aspect: base ? base.aspect : spec.aspect, canvas, name };
  const card = api.el('figure', null, 'mc-card');
  const shown = api.el('img'); shown.src = img.src; shown.alt = spec.prompt.slice(0, 200);
  const row = api.el('div', null, 'media-row');
  const dl = api.el('button', '↓ Download', 'media-primary'); dl.type = 'button';
  dl.onclick = () => canvas.toBlob(b => b && api.download(b, `${name}.png`), 'image/png');
  const edit = api.el('button', '✎ Open in photo editor'); edit.type = 'button';
  edit.onclick = () => api.editPhoto(toCanvas(img), name);
  const again = api.el('button', '↻ Another version'); again.type = 'button';
  again.onclick = () => send('Create another version of this image with a different composition.');
  row.append(dl, edit, again);
  card.append(shown, row);
  box.append(card);
  card.scrollIntoView?.({ block: 'nearest' });
}

// --- Video shorts ----------------------------------------------------------------------------
async function makeShort(spec, box, signal) {
  const previous = state.current?.kind === 'short' ? state.current : null;
  const scenes = spec.scenes.map(s => ({ ...s, img: s.reuse !== null && previous?.scenes[s.reuse] ? previous.scenes[s.reuse].img : null }))
    .map(s => ({ ...s, prompt: s.prompt || (s.reuse !== null ? previous?.scenes[s.reuse]?.prompt || '' : '') }))
    .filter(s => s.img || s.prompt);
  const todo = scenes.filter(s => !s.img);
  const strip = api.el('div', null, 'mc-strip');
  box.append(strip);
  const thumbs = scenes.map((s, i) => { const t = api.el('div', String(i + 1), 'mc-thumb'); t.style.aspectRatio = String(RATIO[spec.aspect]); if (s.img) t.replaceChildren(thumbImg(s.img)); strip.append(t); return t; });
  let done = 0;
  const tick = () => status(box, todo.length ? `Creating scene images… ${done} of ${todo.length} ready. Keep this tab open.` : 'Assembling your short…');
  tick();
  const style = spec.style ? `Visual style: ${spec.style}. ` : '';
  const queue = scenes.map((s, i) => [s, i]).filter(([s]) => !s.img);
  const worker = async () => {
    while (queue.length) {
      const [s, i] = queue.shift();
      try { s.img = await generate(`${style}${s.prompt}. Cinematic still frame for a ${spec.aspect} video. No text, no letters, no captions, no watermark.`, spec.aspect, signal); thumbs[i].replaceChildren(thumbImg(s.img)); }
      catch (error) { if (error.name === 'AbortError') throw error; thumbs[i].classList.add('is-failed'); thumbs[i].title = 'This scene could not be created and was skipped.'; }
      done++; tick();
    }
  };
  await Promise.all([worker(), worker()]);
  const ready = scenes.filter(s => s.img);
  if (!ready.length) throw Error('The AI could not create the scenes for this short. Try again or describe it differently.');
  strip.remove();
  const short = { kind: 'short', title: spec.title, aspect: spec.aspect, mood: spec.mood, style: spec.style, scenes: ready };
  state.current = short;
  box.append(shortPlayer(short, ready.length < scenes.length ? `${scenes.length - ready.length} scene(s) could not be created and were skipped.` : ''));
}
function thumbImg(img) { const i = api.el('img'); i.src = img.src; i.alt = ''; return i; }

function sizeFor(aspect, long = 1280) {
  const r = RATIO[aspect] || 1, even = v => Math.round(v / 2) * 2;
  return r < 1 ? { w: even(long * r), h: long } : { w: long, h: even(long / r) };
}
const totalOf = short => short.scenes.reduce((s, x) => s + x.seconds, 0);
const FADE = 0.6;

function drawCover(ctx, img, w, h, scale, px, py) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.max(w / iw, h / ih) * scale, dw = iw * s, dh = ih * s;
  ctx.drawImage(img, (w - dw) / 2 + px * (dw - w) / 2, (h - dh) / 2 + py * (dh - h) / 2, dw, dh);
}
// Camera motion per scene: alternate zoom in/out with a gentle pan, eased.
function drawScene(ctx, scene, i, local, w, h) {
  const p = Math.min(1, Math.max(0, local / scene.seconds)), e = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2;
  const zoomIn = i % 2 === 0, scale = zoomIn ? 1.04 + 0.12 * e : 1.16 - 0.12 * e;
  const dir = [[1, 0], [-1, 0.3], [0, 1], [0.4, -1]][i % 4];
  drawCover(ctx, scene.img, w, h, scale, dir[0] * (e - 0.5), dir[1] * (e - 0.5));
}
function drawFrame(ctx, short, t, w, h) {
  const total = totalOf(short);
  ctx.globalAlpha = 1; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  let start = 0, i = 0;
  while (i < short.scenes.length - 1 && t >= start + short.scenes[i].seconds) { start += short.scenes[i].seconds; i++; }
  const local = t - start, scene = short.scenes[i];
  if (i > 0 && local < FADE) {
    const prev = short.scenes[i - 1];
    drawScene(ctx, prev, i - 1, prev.seconds + local, w, h);
    ctx.globalAlpha = local / FADE;
  }
  drawScene(ctx, scene, i, local, w, h);
  ctx.globalAlpha = 1;
  // Soft gradient so white text stays readable on bright images.
  const g = ctx.createLinearGradient(0, h * 0.62, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
  ctx.fillStyle = g; ctx.fillRect(0, h * 0.62, w, h * 0.38);
  if (scene.caption) { ctx.globalAlpha = Math.min(1, Math.max(0, (local - 0.25) / 0.4), Math.max(0, (scene.seconds - local) / 0.3)); api.drawText(ctx, scene.caption, w, h, 'caption'); }
  if (short.title && t < 3) { ctx.globalAlpha = Math.min(1, t / 0.4, (3 - t) / 0.5); api.drawText(ctx, short.title, w, h, 'title'); }
  const edge = Math.min(t / 0.4, (total - t) / 0.5);
  if (edge < 1) { ctx.globalAlpha = 1 - Math.max(0, edge); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h); }
  ctx.globalAlpha = 1;
}

// Simple generated background music (no external files): chords, bass and, for upbeat/epic, drums.
const MUSIC = {
  calm: { bpm: 72, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], wave: 'sine', drums: false },
  upbeat: { bpm: 112, chords: [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]], wave: 'triangle', drums: true },
  epic: { bpm: 84, chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]], wave: 'sawtooth', drums: true },
};
const hz = n => 440 * 2 ** ((n - 69) / 12);
function playMusic(ctx, out, mood, duration, offset = 0) {
  const m = MUSIC[mood]; if (!m) return () => {};
  const t0 = ctx.currentTime + 0.05, beat = 60 / m.bpm, master = ctx.createGain(), filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = mood === 'epic' ? 1400 : 2400;
  master.connect(out); filter.connect(master);
  const left = duration - offset;
  master.gain.setValueAtTime(0, t0); master.gain.linearRampToValueAtTime(0.5, t0 + 0.6);
  master.gain.setValueAtTime(0.5, t0 + Math.max(0.7, left - 1.2)); master.gain.linearRampToValueAtTime(0, t0 + left);
  const nodes = [];
  const note = (freq, at, len, type, vol, dest = filter) => {
    if (at + len < 0 || at > left) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + Math.max(0, at);
    o.type = type; o.frequency.value = freq; o.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(vol, s + Math.min(0.3, len / 3)); g.gain.linearRampToValueAtTime(0, s + len);
    o.start(s); o.stop(s + len + 0.05); nodes.push(o);
  };
  const kick = at => {
    if (at < 0 || at > left) return;
    const o = ctx.createOscillator(), g = ctx.createGain(), s = t0 + at;
    o.frequency.setValueAtTime(140, s); o.frequency.exponentialRampToValueAtTime(40, s + 0.18);
    g.gain.setValueAtTime(mood === 'epic' ? 0.9 : 0.6, s); g.gain.exponentialRampToValueAtTime(0.001, s + 0.3);
    o.connect(g); g.connect(master); o.start(s); o.stop(s + 0.32); nodes.push(o);
  };
  const bar = beat * 4;
  for (let b = 0; b * bar < duration; b++) {
    const at = b * bar - offset, chord = m.chords[b % m.chords.length];
    chord.forEach(n => note(hz(n), at, bar + 0.2, m.wave, m.wave === 'sawtooth' ? 0.05 : 0.08));
    note(hz(chord[0] - 12), at, bar, 'sine', 0.18);
    if (mood === 'upbeat') for (let k = 0; k < 8; k++) note(hz(chord[k % 3] + 12), at + k * beat / 2, beat / 2.2, 'triangle', 0.05);
    if (m.drums) for (let k = 0; k < 4; k++) if (mood === 'upbeat' || k % 2 === 0) kick(at + k * beat);
  }
  return () => { nodes.forEach(o => { try { o.stop(); } catch {} }); try { master.disconnect(); } catch {} };
}

function shortPlayer(short, note) {
  const el = api.el, { w, h } = sizeFor(short.aspect, 720), total = totalOf(short);
  const card = el('div', null, 'mc-card mc-short');
  const canvas = el('canvas'); canvas.width = w; canvas.height = h; canvas.setAttribute('aria-label', short.title || 'Video short preview');
  const ctx = canvas.getContext('2d');
  const controls = el('div', null, 'mc-controls');
  const play = el('button', '▶'); play.type = 'button'; play.setAttribute('aria-label', 'Play');
  const seek = Object.assign(el('input'), { type: 'range', min: 0, max: total, step: 0.05, value: 0 }); seek.setAttribute('aria-label', 'Position');
  const time = el('span', `0:00 / 0:${String(Math.round(total)).padStart(2, '0')}`);
  controls.append(play, seek, time);
  const music = el('label', null, 'media-check'); const musicBox = Object.assign(el('input'), { type: 'checkbox', checked: short.mood !== 'none' });
  music.append(musicBox, ` Background music${short.mood !== 'none' ? ` (${short.mood})` : ''}`);
  if (short.mood === 'none') { short.mood = 'calm'; }
  const row = el('div', null, 'media-row');
  const exp = el('button', '⬇ Export video', 'media-primary'); exp.type = 'button';
  const again = el('button', '↻ Remake'); again.type = 'button'; again.onclick = () => send('Remake this short with new scenes, same idea.');
  row.append(exp, again);
  const prog = el('div', null, 'media-progress'); prog.hidden = true;
  const bar = Object.assign(el('progress'), { max: 1, value: 0 }); const label = el('span', ''); prog.append(bar, label);
  const hint = el('p', `${short.scenes.length} scenes · ${Math.round(total)} s · ${short.aspect}. Ask in the chat for any change.${note ? ' ' + note : ''}`, 'media-hint');
  card.append(canvas, controls, music, row, prog, hint);

  let t = 0, playing = false, startAt = 0, raf = 0, audio = null, stopMusic = () => {};
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const show = () => { drawFrame(ctx, short, t, w, h); seek.value = t; time.textContent = `${fmt(t)} / ${fmt(total)}`; };
  const stop = () => { playing = false; cancelAnimationFrame(raf); stopMusic(); stopMusic = () => {}; play.textContent = '▶'; play.setAttribute('aria-label', 'Play'); };
  const loop = () => { t = Math.min(total, (performance.now() - startAt) / 1000); show(); if (t >= total) { stop(); t = 0; return; } raf = requestAnimationFrame(loop); };
  play.onclick = () => {
    if (playing) { stop(); return; }
    if (t >= total - 0.05) t = 0;
    playing = true; play.textContent = '❚❚'; play.setAttribute('aria-label', 'Pause');
    startAt = performance.now() - t * 1000;
    if (musicBox.checked && window.AudioContext) { audio ||= new AudioContext(); audio.resume().catch(() => {}); stopMusic = playMusic(audio, audio.destination, short.mood, total, t); }
    loop();
  };
  seek.oninput = () => { const was = playing; stop(); t = Number(seek.value); show(); if (was) play.onclick(); };
  musicBox.onchange = () => { if (playing) { stop(); play.onclick(); } };
  canvas.onclick = () => play.onclick();
  show();

  exp.onclick = async () => {
    const mime = api.pickMime();
    if (!mime || !HTMLCanvasElement.prototype.captureStream) { hint.textContent = 'This browser cannot export video. Use a recent Chrome, Edge, Firefox or Safari.'; return; }
    stop(); exp.disabled = true; prog.hidden = false; bar.value = 0;
    const size = sizeFor(short.aspect, 1280), out = el('canvas'); out.width = size.w; out.height = size.h;
    const octx = out.getContext('2d'), stream = out.captureStream(30);
    let actx = null, endMusic = () => {};
    if (musicBox.checked && window.AudioContext) {
      actx = new AudioContext(); await actx.resume().catch(() => {});
      const dest = actx.createMediaStreamDestination();
      dest.stream.getAudioTracks().forEach(track => stream.addTrack(track));
      endMusic = playMusic(actx, dest, short.mood, total, 0);
    }
    const chunks = [], recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8e6 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise(r => { recorder.onstop = r; });
    drawFrame(octx, short, 0, size.w, size.h);
    recorder.start(1000);
    const begin = performance.now();
    label.textContent = 'Rendering… keep this tab open in front.';
    await new Promise(resolve => {
      const step = () => {
        const now = Math.min(total, (performance.now() - begin) / 1000);
        drawFrame(octx, short, now, size.w, size.h); bar.value = now / total;
        if (now >= total) resolve(); else setTimeout(step, 1000 / 30);
      };
      step();
    });
    await new Promise(r => setTimeout(r, 200));
    recorder.stop(); await finished;
    endMusic(); actx?.close().catch(() => {}); stream.getTracks().forEach(tr => tr.stop());
    const type = mime.split(';')[0], ext = type.includes('mp4') ? 'mp4' : 'webm';
    api.download(new Blob(chunks, { type }), `${slug(short.title || 'gg-short')}.${ext}`);
    label.textContent = `Done · ${ext.toUpperCase()} ${size.w}×${size.h}`; exp.disabled = false;
  };
  return card;
}

