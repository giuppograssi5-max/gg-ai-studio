// GG Photo & Video studio: AI photo editing and an in-browser video editor.
// Videos stay on the user's device and are rendered locally, so they can be hours long:
// only a few small still frames are sent to the AI to plan the edit.
import { DEFAULT_ADJUST, ADJUST_LIMITS, PRESETS, ASPECTS, filterString, cleanAdjust, cropRect, outputSize, cleanSegments, segmentsDuration, scanTimes, pickFrames, formatTime, parseTime, captionAt, MAX_PHOTO_CHARS, mediaIntent, createIntent } from './media-core.js';

const $m = s => document.querySelector(s);
const el = (tag, text, cls) => { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
const ADJUST_LABELS = { brightness: 'Brightness', contrast: 'Contrast', saturate: 'Saturation', warmth: 'Warmth', blur: 'Blur', grayscale: 'Black & white', sepia: 'Sepia' };

const section = el('section', null, 'view hidden media-view');
section.id = 'media';
section.innerHTML = `<div class="media-heading"><span>GG · STUDIO</span><h2>Photo & video editing with AI</h2>
<p>Describe the edit you want and let the AI do it, or fine-tune it yourself. Videos are edited on your device and never uploaded, so even long videos work: only a few still frames are sent to the AI.</p></div>
<div class="media-tabs" role="tablist"><button type="button" role="tab" data-tab="photo" aria-selected="true">🖼 Photo</button><button type="button" role="tab" data-tab="video" aria-selected="false">🎬 Video</button><button type="button" role="tab" data-tab="create" aria-selected="false">💬 Create with AI</button></div>
<div class="media-panel" data-panel="create" id="create-panel" hidden></div>

<div class="media-panel" data-panel="photo">
  <label class="media-drop" id="photo-drop"><input type="file" id="photo-file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" hidden><strong>Choose a photo</strong><span>or drop it here · JPEG, PNG, WebP</span></label>
  <div class="media-work" id="photo-work" hidden>
    <div class="media-stage"><canvas id="photo-canvas" aria-label="Photo preview"></canvas><div class="media-busy" id="photo-busy" hidden><span></span>AI is editing your photo…</div></div>
    <div class="media-side">
      <form class="media-ai" id="photo-ai"><label for="photo-prompt"><b>✧ Edit with AI</b></label>
        <textarea id="photo-prompt" rows="3" maxlength="1000" placeholder="e.g. remove the people in the background, make the sky a sunset, turn it into a watercolor painting…"></textarea>
        <div class="media-chips" id="photo-chips"></div>
        <button class="media-primary" type="submit">Apply AI edit</button></form>
      <details class="media-box" open><summary>Adjust</summary><div class="media-presets" id="photo-presets"></div><div id="photo-sliders"></div></details>
      <details class="media-box"><summary>Crop & rotate</summary><div class="media-row" id="photo-aspects"></div>
        <div class="media-row"><button type="button" id="photo-rotate">⟳ Rotate</button><button type="button" id="photo-flip">⇋ Flip</button></div></details>
      <div class="media-row"><button type="button" id="photo-undo" disabled>↶ Undo</button><button type="button" id="photo-compare">Hold to compare</button><button type="button" id="photo-reset">Reset</button></div>
      <div class="media-row"><button class="media-primary" type="button" id="photo-download">↓ Download JPEG</button><button type="button" id="photo-download-png">PNG</button><button type="button" id="photo-new">New photo</button></div>
      <p class="media-hint" id="photo-status" role="status" aria-live="polite"></p>
    </div>
  </div>
</div>

<div class="media-panel" data-panel="video" hidden>
  <label class="media-drop" id="video-drop"><input type="file" id="video-file" accept="video/*" hidden><strong>Choose a video</strong><span>or drop it here · MP4, MOV, WebM · any length, it stays on your device</span></label>
  <div class="media-work" id="video-work" hidden>
    <div class="media-stage"><div class="media-video-frame" id="video-frame"><video id="video-preview" controls playsinline preload="metadata"></video><div class="media-caption" id="video-caption"></div><div class="media-overlay-title" id="video-title-preview"></div></div>
      <p class="media-hint" id="video-info"></p></div>
    <div class="media-side">
      <form class="media-ai" id="video-ai"><label for="video-goal"><b>✧ Edit with AI</b></label>
        <textarea id="video-goal" rows="3" maxlength="600" placeholder="e.g. make a 30-second highlight reel for Instagram with captions, warm colors"></textarea>
        <div class="media-chips" id="video-chips"></div>
        <button class="media-primary" type="submit">Analyse whole video</button>
        <div class="media-progress" id="video-scan" hidden><progress max="1" value="0"></progress><span></span></div></form>
      <div class="media-plan" id="video-plan" hidden></div>
      <details class="media-box" open><summary>Cut</summary>
        <div class="media-row media-cutmode"><label><input type="radio" name="cutmode" value="trim" checked> Trim</label><label><input type="radio" name="cutmode" value="highlights" disabled> AI highlights</label></div>
        <div class="media-trim" id="video-trim"><label>Start<input id="trim-start" value="0:00" inputmode="decimal"></label><button type="button" data-set="start" title="Use current position">⌖ Now</button>
          <label>End<input id="trim-end" value="0:00" inputmode="decimal"></label><button type="button" data-set="end" title="Use current position">⌖ Now</button></div>
        <div id="video-segments" class="media-segments" hidden></div>
        <p class="media-hint" id="video-length"></p></details>
      <details class="media-box"><summary>Look</summary><div class="media-presets" id="video-presets"></div><div id="video-sliders"></div></details>
      <details class="media-box"><summary>Format, speed & sound</summary><div class="media-row" id="video-aspects"></div>
        <label class="media-field">Speed<select id="video-speed"><option value="0.5">0.5×</option><option value="0.75">0.75×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
        <label class="media-field">Volume<input type="range" id="video-volume" min="0" max="200" value="100"><output>100%</output></label>
        <label class="media-check"><input type="checkbox" id="video-mute"> Remove sound</label>
        <label class="media-check"><input type="checkbox" id="video-fade" checked> Fade in/out and smooth cuts</label></details>
      <details class="media-box"><summary>Text & captions</summary>
        <label class="media-field">Title on screen<input id="video-title" maxlength="80" placeholder="Optional"></label>
        <label class="media-field">Show title for<select id="video-title-time"><option value="3">first 3 s</option><option value="5" selected>first 5 s</option><option value="all">the whole video</option></select></label>
        <label class="media-check"><input type="checkbox" id="video-captions" checked disabled> Burn in AI captions</label></details>
      <details class="media-box" open><summary>Export</summary>
        <label class="media-field">Quality<select id="video-quality"><option value="720">720p · smaller file</option><option value="1080" selected>1080p · HD</option><option value="2160">Original up to 4K</option></select></label>
        <button class="media-primary" type="button" id="video-export">⬇ Export video</button>
        <div class="media-progress" id="video-render" hidden><progress max="1" value="0"></progress><span></span><button type="button" id="video-cancel">Cancel</button></div>
        <p class="media-hint" id="video-export-note">Export plays the edit once in the background, at about real-time speed. Keep this tab open in front until it finishes.</p>
        <div class="media-row"><button type="button" id="video-frame-photo">🖼 Edit current frame as photo</button><button type="button" id="video-new">New video</button></div>
        <p class="media-hint" id="video-status" role="status" aria-live="polite"></p></details>
    </div>
  </div>
</div>`;
$m('.main').append(section);

const nav = el('button', '🎬 Photo & Video AI', 'nav');
nav.type = 'button';
$m('.sidebar nav').append(nav);

export function openMedia(tab, goal = '') {
  if (typeof view === 'function') view('media');
  else document.querySelectorAll('.view').forEach(v => v.classList.toggle('hidden', v !== section));
  document.querySelectorAll('.sidebar .nav').forEach(n => n.classList.toggle('active', n === nav));
  $m('#viewtitle').textContent = 'Photo & Video AI';
  if (tab) showTab(tab);
  if (goal && tab === 'create') createChat.then(m => m.send(goal));
  else if (goal) { const box = tab === 'photo' ? $m('#photo-prompt') : $m('#video-goal'); box.value = goal.slice(0, box.maxLength); }
  section.scrollIntoView?.({ block: 'start' });
}
nav.onclick = () => openMedia();

function showTab(name) {
  section.querySelectorAll('[role=tab]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  section.querySelectorAll('.media-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
}
section.querySelectorAll('[role=tab]').forEach(b => { b.onclick = () => showTab(b.dataset.tab); });

// --- Shared controls -------------------------------------------------------------------------
function buildAdjust(slidersBox, presetsBox, onChange) {
  let state = { ...DEFAULT_ADJUST };
  const inputs = {};
  for (const [key, [min, max]] of Object.entries(ADJUST_LIMITS)) {
    const label = el('label', null, 'media-field');
    const input = Object.assign(el('input'), { type: 'range', min, max, step: 1, value: state[key] });
    const out = el('output', '');
    label.append(ADJUST_LABELS[key], input, out);
    input.oninput = () => { state[key] = Number(input.value); sync(); onChange(get()); };
    inputs[key] = { input, out };
    slidersBox.append(label);
  }
  for (const [key, preset] of Object.entries(PRESETS)) {
    const b = el('button', preset.label); b.type = 'button';
    b.onclick = () => { set({ ...DEFAULT_ADJUST, ...preset.adjust }); onChange(get()); };
    presetsBox.append(b);
  }
  function sync() {
    for (const [key, { input, out }] of Object.entries(inputs)) {
      input.value = state[key];
      out.textContent = key === 'blur' ? `${state[key]}px` : key === 'warmth' ? String(state[key]) : `${state[key]}%`;
    }
  }
  const get = () => ({ ...state });
  const set = next => { state = cleanAdjust(next); sync(); };
  sync();
  return { get, set };
}
function buildAspects(box, onChange) {
  let value = 'original';
  const buttons = Object.keys(ASPECTS).map(key => {
    const b = el('button', key === 'original' ? 'Original' : key); b.type = 'button';
    b.onclick = () => { set(key); onChange(key); };
    box.append(b); return [key, b];
  });
  const set = key => { value = key; buttons.forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === key))); };
  set('original');
  return { get: () => value, set };
}
function chips(box, list, target) {
  for (const text of list) {
    const b = el('button', text); b.type = 'button';
    b.onclick = () => { target.value = text; target.focus(); };
    box.append(b);
  }
}
function dropZone(label, input, onFile) {
  input.onchange = () => { const f = input.files?.[0]; input.value = ''; if (f) onFile(f); };
  label.addEventListener('dragover', e => { e.preventDefault(); label.classList.add('is-over'); });
  label.addEventListener('dragleave', () => label.classList.remove('is-over'));
  label.addEventListener('drop', e => { e.preventDefault(); label.classList.remove('is-over'); const f = e.dataTransfer?.files?.[0]; if (f) onFile(f); });
}
async function postMedia(body, signal) {
  const r = await fetch('/gg-media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw Error(data.error || 'The AI service is unavailable. Try again.');
  return data;
}
const canvasBase64 = (canvas, type = 'image/jpeg', quality = 0.9) => canvas.toDataURL(type, quality).split(',')[1];
function scaledCanvas(source, w, h, maxSide) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  const c = el('canvas'); c.width = Math.max(1, Math.round(w * s)); c.height = Math.max(1, Math.round(h * s));
  c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
  return c;
}
const nameBase = name => (name || 'gg').replace(/\.[^.]+$/, '').replace(/[^\w-]+/g, '-').slice(0, 60) || 'gg';
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(el('a'), { href: url, download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// --- Photo editor ------------------------------------------------------------------------------
const photo = { original: null, base: null, history: [], name: 'photo', comparing: false };
const photoCanvas = $m('#photo-canvas');
const photoStatus = t => { $m('#photo-status').textContent = t; };
const photoAdjust = buildAdjust($m('#photo-sliders'), $m('#photo-presets'), () => renderPhoto());
const photoAspect = buildAspects($m('#photo-aspects'), () => renderPhoto());
chips($m('#photo-chips'), ['Enhance lighting and colors', 'Remove the background', 'Remove people in the background', 'Make it look professional', 'Turn it into a painting', 'Change the sky to a sunset'], $m('#photo-prompt'));

function copyCanvas(src) { const c = el('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }
// Draw the current photo with crop and adjustments into `target`, at most `maxSide` pixels.
function drawPhoto(target, maxSide = 4096, source = photo.base, adjust = photoAdjust.get(), aspect = photoAspect.get()) {
  const r = cropRect(source.width, source.height, aspect);
  const s = Math.min(1, maxSide / Math.max(r.sw, r.sh));
  target.width = Math.max(1, Math.round(r.sw * s)); target.height = Math.max(1, Math.round(r.sh * s));
  const ctx = target.getContext('2d');
  ctx.filter = filterString(adjust);
  ctx.drawImage(source, r.sx, r.sy, r.sw, r.sh, 0, 0, target.width, target.height);
  ctx.filter = 'none';
  return target;
}
function renderPhoto() {
  if (!photo.base) return;
  if (photo.comparing) drawPhoto(photoCanvas, 1600, photo.original, DEFAULT_ADJUST, 'original');
  else drawPhoto(photoCanvas, 1600);
  $m('#photo-undo').disabled = !photo.history.length;
}
function pushHistory() { photo.history.push({ base: photo.base, adjust: photoAdjust.get(), aspect: photoAspect.get() }); if (photo.history.length > 12) photo.history.shift(); }

async function loadPhoto(file) {
  if (!file.type.startsWith('image/')) { photoStatus('Choose an image file.'); return; }
  try {
    const bitmap = await createImageBitmap(file);
    const c = scaledCanvas(bitmap, bitmap.width, bitmap.height, 4096);
    bitmap.close?.();
    Object.assign(photo, { original: c, base: copyCanvas(c), history: [], name: nameBase(file.name) });
    photoAdjust.set(DEFAULT_ADJUST); photoAspect.set('original');
    $m('#photo-drop').hidden = true; $m('#photo-work').hidden = false;
    renderPhoto();
    photoStatus(`${file.name} · ${c.width}×${c.height}px`);
  } catch { photoStatus('This photo format cannot be opened in this browser. Try a JPEG or PNG.'); }
}
function loadPhotoCanvas(canvas, name) {
  Object.assign(photo, { original: canvas, base: copyCanvas(canvas), history: [], name });
  photoAdjust.set(DEFAULT_ADJUST); photoAspect.set('original');
  $m('#photo-drop').hidden = true; $m('#photo-work').hidden = false;
  renderPhoto();
}
dropZone($m('#photo-drop'), $m('#photo-file'), loadPhoto);

let photoAbort;
$m('#photo-ai').onsubmit = async e => {
  e.preventDefault();
  const prompt = $m('#photo-prompt').value.trim();
  if (!photo.base) { photoStatus('Choose a photo first.'); return; }
  if (!prompt) { photoStatus('Describe the edit you want.'); $m('#photo-prompt').focus(); return; }
  const submit = e.target.querySelector('button[type=submit]');
  // Bake the current look into the image the AI receives, keeping the request under the size limit.
  let data, side = 2048;
  do { data = canvasBase64(drawPhoto(el('canvas'), side), 'image/jpeg', 0.88); side = Math.round(side * 0.75); } while (data.length > MAX_PHOTO_CHARS && side > 400);
  submit.disabled = true; $m('#photo-busy').hidden = false; photoStatus('');
  photoAbort?.abort(); photoAbort = new AbortController();
  try {
    const result = await postMedia({ action: 'photo', prompt, image: { mimeType: 'image/jpeg', data } }, photoAbort.signal);
    const img = new Image();
    img.src = `data:${result.image.mimeType};base64,${result.image.data}`;
    await img.decode();
    pushHistory();
    photo.base = scaledCanvas(img, img.naturalWidth, img.naturalHeight, 4096);
    photoAdjust.set(DEFAULT_ADJUST); photoAspect.set('original');
    renderPhoto();
    photoStatus('AI edit applied. Use Undo to go back, or describe another change.' + (result.text ? ` ${result.text}` : ''));
  } catch (error) { if (error.name !== 'AbortError') photoStatus(error.message); }
  finally { submit.disabled = false; $m('#photo-busy').hidden = true; }
};
$m('#photo-rotate').onclick = () => {
  if (!photo.base) return; pushHistory();
  const c = el('canvas'); c.width = photo.base.height; c.height = photo.base.width;
  const ctx = c.getContext('2d'); ctx.translate(c.width, 0); ctx.rotate(Math.PI / 2); ctx.drawImage(photo.base, 0, 0);
  photo.base = c; renderPhoto();
};
$m('#photo-flip').onclick = () => {
  if (!photo.base) return; pushHistory();
  const c = el('canvas'); c.width = photo.base.width; c.height = photo.base.height;
  const ctx = c.getContext('2d'); ctx.translate(c.width, 0); ctx.scale(-1, 1); ctx.drawImage(photo.base, 0, 0);
  photo.base = c; renderPhoto();
};
$m('#photo-undo').onclick = () => {
  const last = photo.history.pop(); if (!last) return;
  photo.base = last.base; photoAdjust.set(last.adjust); photoAspect.set(last.aspect); renderPhoto();
};
$m('#photo-reset').onclick = () => { if (!photo.original) return; pushHistory(); photo.base = copyCanvas(photo.original); photoAdjust.set(DEFAULT_ADJUST); photoAspect.set('original'); renderPhoto(); };
const compare = $m('#photo-compare');
const setCompare = on => { photo.comparing = on; renderPhoto(); };
compare.addEventListener('pointerdown', () => setCompare(true));
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => compare.addEventListener(t, () => photo.comparing && setCompare(false)));
compare.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!photo.comparing) setCompare(true); } });
compare.addEventListener('keyup', () => setCompare(false));
const exportPhoto = (type, ext) => {
  if (!photo.base) return;
  drawPhoto(el('canvas')).toBlob(blob => blob ? download(blob, `${photo.name}-gg-edit.${ext}`) : photoStatus('Export failed.'), type, 0.93);
};
$m('#photo-download').onclick = () => exportPhoto('image/jpeg', 'jpg');
$m('#photo-download-png').onclick = () => exportPhoto('image/png', 'png');
$m('#photo-new').onclick = () => { photoAbort?.abort(); Object.assign(photo, { original: null, base: null, history: [] }); $m('#photo-work').hidden = true; $m('#photo-drop').hidden = false; photoStatus(''); };

// --- Video editor ------------------------------------------------------------------------------
const video = { file: null, url: '', duration: 0, width: 0, height: 0, plan: null, selected: new Set(), rendering: null };
const preview = $m('#video-preview');
const videoStatus = t => { $m('#video-status').textContent = t; };
const videoAdjust = buildAdjust($m('#video-sliders'), $m('#video-presets'), () => updateVideoPreview());
const videoAspect = buildAspects($m('#video-aspects'), () => updateVideoPreview());
chips($m('#video-chips'), ['30-second highlight reel', 'Vertical Reel / TikTok with captions', 'Keep only the best 60 seconds', 'Fix dark or dull colors', 'Cinematic look with a title'], $m('#video-goal'));

const cutMode = () => section.querySelector('input[name=cutmode]:checked').value;
function currentSegments() {
  if (cutMode() === 'highlights' && video.plan) return cleanSegments(video.plan.highlights.filter((_, i) => video.selected.has(i)), video.duration);
  const start = parseTime($m('#trim-start').value), end = parseTime($m('#trim-end').value);
  return cleanSegments([{ start: Number.isFinite(start) ? start : 0, end: Number.isFinite(end) ? end : video.duration }], video.duration);
}
function captionsList() { return $m('#video-captions').checked && video.plan ? video.plan.captions : []; }
function updateVideoPreview() {
  preview.style.filter = filterString(videoAdjust.get());
  const ratio = ASPECTS[videoAspect.get()];
  const frame = $m('#video-frame');
  frame.style.aspectRatio = ratio ? String(ratio) : video.width ? `${video.width} / ${video.height}` : '';
  frame.classList.toggle('is-cropped', !!ratio);
  preview.playbackRate = Number($m('#video-speed').value);
  const segs = currentSegments(), speed = Number($m('#video-speed').value);
  $m('#video-length').textContent = segs.length ? `Result: ${formatTime(segmentsDuration(segs) / speed)}${segs.length > 1 ? ` · ${segs.length} clips` : ''} (from ${formatTime(video.duration)})` : 'Choose a part of the video to keep.';
  updateOverlay();
}
function updateOverlay() {
  const t = preview.currentTime;
  $m('#video-caption').textContent = captionAt(captionsList(), t);
  const title = $m('#video-title').value.trim(), dur = $m('#video-title-time').value;
  const start = currentSegments()[0]?.start || 0;
  $m('#video-title-preview').textContent = title && (dur === 'all' || t - start < Number(dur)) ? title : '';
}
preview.addEventListener('timeupdate', updateOverlay);
['#trim-start', '#trim-end', '#video-speed', '#video-title', '#video-title-time', '#video-captions'].forEach(s => $m(s).addEventListener('input', updateVideoPreview));
section.querySelectorAll('input[name=cutmode]').forEach(r => r.addEventListener('change', () => { $m('#video-trim').hidden = cutMode() !== 'trim'; $m('#video-segments').hidden = cutMode() !== 'highlights'; updateVideoPreview(); }));
section.querySelectorAll('[data-set]').forEach(b => { b.onclick = () => { $m(b.dataset.set === 'start' ? '#trim-start' : '#trim-end').value = formatTime(preview.currentTime) + (preview.currentTime % 1 ? (preview.currentTime % 1).toFixed(1).slice(1) : ''); updateVideoPreview(); }; });
const volume = $m('#video-volume');
volume.oninput = () => { volume.nextElementSibling.textContent = `${volume.value}%`; preview.volume = Math.min(1, volume.value / 100); };

function loadVideo(file) {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)) { videoStatus('Choose a video file.'); return; }
  if (video.rendering) return;
  if (video.url) URL.revokeObjectURL(video.url);
  Object.assign(video, { file, url: URL.createObjectURL(file), plan: null, selected: new Set() });
  $m('#video-plan').hidden = true; $m('#video-plan').replaceChildren();
  section.querySelector('input[name=cutmode][value=trim]').checked = true;
  section.querySelector('input[name=cutmode][value=highlights]').disabled = true;
  $m('#video-captions').disabled = true; $m('#video-trim').hidden = false; $m('#video-segments').hidden = true;
  preview.src = video.url;
  preview.onloadedmetadata = () => {
    Object.assign(video, { duration: preview.duration, width: preview.videoWidth, height: preview.videoHeight });
    if (!Number.isFinite(video.duration) || !video.width) { videoStatus('This video cannot be played in this browser. Try an MP4 (H.264) file.'); return; }
    $m('#trim-start').value = '0:00'; $m('#trim-end').value = formatTime(Math.ceil(video.duration));
    $m('#video-info').textContent = `${file.name} · ${formatTime(video.duration)} · ${video.width}×${video.height} · ${(file.size / 1048576).toFixed(file.size > 1e9 ? 0 : 1)} MB`;
    $m('#video-drop').hidden = true; $m('#video-work').hidden = false;
    updateVideoPreview(); videoStatus('');
  };
  preview.onerror = () => videoStatus('This video cannot be played in this browser. Try an MP4 (H.264) file.');
}
dropZone($m('#video-drop'), $m('#video-file'), loadVideo);

function seek(v, t) {
  return new Promise((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const fail = () => { cleanup(); reject(Error('Seek failed')); };
    const timer = setTimeout(done, 8000);
    const cleanup = () => { clearTimeout(timer); v.removeEventListener('seeked', done); v.removeEventListener('error', fail); };
    v.addEventListener('seeked', done, { once: true }); v.addEventListener('error', fail, { once: true });
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
  });
}
function hiddenVideo() {
  const v = el('video', null, 'media-offscreen');
  Object.assign(v, { muted: true, playsInline: true, preload: 'auto', src: video.url });
  document.body.append(v);
  return new Promise((resolve, reject) => { v.onloadeddata = () => resolve(v); v.onerror = () => reject(Error('Video could not be read.')); });
}

// Scan the whole timeline at low resolution for scene changes, then capture the frames for the AI.
let scanAbort;
$m('#video-ai').onsubmit = async e => {
  e.preventDefault();
  if (!video.duration || video.rendering) return;
  const submit = e.target.querySelector('button[type=submit]');
  const bar = $m('#video-scan'), progress = bar.querySelector('progress'), label = bar.querySelector('span');
  scanAbort?.abort(); scanAbort = new AbortController(); const { signal } = scanAbort;
  submit.disabled = true; bar.hidden = false; videoStatus('');
  let scanner;
  try {
    scanner = await hiddenVideo();
    const times = scanTimes(video.duration, video.duration > 600 ? 240 : 150);
    const tiny = el('canvas'); tiny.width = 32; tiny.height = 18;
    const tctx = tiny.getContext('2d', { willReadFrequently: true });
    const samples = []; let prev;
    for (let i = 0; i < times.length; i++) {
      if (signal.aborted) throw Object.assign(Error('cancelled'), { name: 'AbortError' });
      await seek(scanner, times[i]);
      tctx.drawImage(scanner, 0, 0, 32, 18);
      const px = tctx.getImageData(0, 0, 32, 18).data;
      let diff = 0;
      if (prev) for (let j = 0; j < px.length; j += 4) diff += Math.abs(px[j] - prev[j]) + Math.abs(px[j + 1] - prev[j + 1]) + Math.abs(px[j + 2] - prev[j + 2]);
      samples.push({ t: times[i], diff: prev ? diff : Infinity }); prev = px;
      progress.value = (i + 1) / times.length * 0.7; label.textContent = `Watching the video… ${Math.round(progress.value * 100)}%`;
    }
    const picks = pickFrames(samples, video.duration < 20 ? 8 : video.duration < 120 ? 12 : 18);
    const frames = [];
    for (const [i, t] of picks.entries()) {
      await seek(scanner, t);
      frames.push({ t, data: canvasBase64(scaledCanvas(scanner, scanner.videoWidth, scanner.videoHeight, 512), 'image/jpeg', 0.7) });
      progress.value = 0.7 + (i + 1) / picks.length * 0.1; label.textContent = `Picking key moments… ${Math.round(progress.value * 100)}%`;
    }
    progress.value = 0.85; label.textContent = 'AI is planning your edit…';
    const { plan } = await postMedia({ action: 'plan', duration: video.duration, goal: $m('#video-goal').value.trim(), name: video.file.name, language: document.documentElement.lang || navigator.language, frames }, signal);
    showPlan(plan, frames);
    progress.value = 1; label.textContent = 'Done';
  } catch (error) { if (error.name !== 'AbortError') videoStatus(error.message); }
  finally { scanner?.remove(); submit.disabled = false; setTimeout(() => { bar.hidden = true; }, 800); }
};

function showPlan(plan, frames) {
  video.plan = plan; video.selected = new Set(plan.highlights.map((_, i) => i));
  const box = $m('#video-plan'); box.replaceChildren(); box.hidden = false;
  box.append(el('h3', '✧ AI edit plan'), el('p', plan.summary));
  if (plan.title || plan.description) {
    const social = el('div', null, 'media-social');
    const copyText = [plan.title, plan.description, plan.hashtags.join(' ')].filter(Boolean).join('\n\n');
    social.append(el('strong', plan.title), el('p', plan.description), el('small', plan.hashtags.join(' ')));
    const copy = el('button', 'Copy caption'); copy.type = 'button';
    copy.onclick = () => navigator.clipboard?.writeText(copyText).then(() => { copy.textContent = 'Copied ✓'; }, () => {});
    social.append(copy); box.append(social);
  }
  if (plan.tips.length) { const ul = el('ul', null, 'media-tips'); plan.tips.forEach(t => ul.append(el('li', t))); box.append(ul); }
  const apply = el('button', 'Apply AI edit', 'media-primary'); apply.type = 'button';
  apply.onclick = () => {
    videoAdjust.set(plan.adjust); videoAspect.set(plan.aspect);
    $m('#video-speed').value = String([0.5, 0.75, 1, 1.25, 1.5, 2].reduce((a, b) => Math.abs(b - plan.speed) < Math.abs(a - plan.speed) ? b : a));
    if (plan.highlights.length) section.querySelector('input[name=cutmode][value=highlights]').checked = true;
    if (plan.title && !$m('#video-title').value) $m('#video-title').value = plan.title.slice(0, 80);
    section.querySelector('input[name=cutmode]:checked').dispatchEvent(new Event('change'));
    videoStatus('AI edit applied. Review the clips and press Export video.');
  };
  box.append(apply);
  // Highlight clips with thumbnails from the analysed frames.
  const list = $m('#video-segments'); list.replaceChildren();
  plan.highlights.forEach((h, i) => {
    const row = el('label', null, 'media-seg');
    const check = Object.assign(el('input'), { type: 'checkbox', checked: true });
    check.onchange = () => { check.checked ? video.selected.add(i) : video.selected.delete(i); updateVideoPreview(); };
    const near = frames.reduce((a, f) => Math.abs(f.t - h.start) < Math.abs(a.t - h.start) ? f : a, frames[0]);
    const img = Object.assign(el('img'), { src: `data:image/jpeg;base64,${near.data}`, alt: '' });
    const go = el('button', `▶ ${formatTime(h.start)}–${formatTime(h.end)}`); go.type = 'button';
    go.onclick = e => { e.preventDefault(); preview.currentTime = h.start; preview.play().catch(() => {}); };
    row.append(check, img, el('span', h.label || `Clip ${i + 1}`), go);
    list.append(row);
  });
  const highlightsRadio = section.querySelector('input[name=cutmode][value=highlights]');
  highlightsRadio.disabled = !plan.highlights.length;
  $m('#video-captions').disabled = !plan.captions.length;
  $m('#video-captions').checked = plan.captions.length > 0;
  updateVideoPreview();
}

// --- Export: render the edit in real time through a canvas and record it ------------------------
function pickMime() {
  const types = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find(t => window.MediaRecorder?.isTypeSupported?.(t)) || '';
}
function drawText(ctx, text, w, h, place) {
  if (!text) return;
  const size = Math.round(Math.min(w, h) * (place === 'title' ? 0.075 : 0.05));
  ctx.font = `700 ${size}px system-ui, -apple-system, Segoe UI, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const words = text.split(' '), lines = []; let line = '';
  for (const word of words) { const next = line ? `${line} ${word}` : word; if (ctx.measureText(next).width > w * 0.86 && line) { lines.push(line); line = word; } else line = next; }
  lines.push(line);
  const lh = size * 1.25, total = lh * lines.length;
  const top = place === 'title' ? h * 0.16 : h * 0.88 - total;
  ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.fillStyle = '#fff';
  lines.forEach((l, i) => { const y = top + lh * i + lh / 2; ctx.strokeText(l, w / 2, y); ctx.fillText(l, w / 2, y); });
}

async function exportVideo(audioCtx) {
  const segments = currentSegments();
  if (!segments.length) { videoStatus('Choose a part of the video to keep.'); audioCtx?.close(); return; }
  const mime = pickMime();
  if (!mime || !HTMLCanvasElement.prototype.captureStream) { videoStatus('This browser cannot export video. Use a recent Chrome, Edge, Firefox or Safari.'); audioCtx?.close(); return; }
  const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  const speed = Number($m('#video-speed').value), mute = $m('#video-mute').checked, fade = $m('#video-fade').checked;
  const quality = Number($m('#video-quality').value);
  const r = cropRect(video.width, video.height, videoAspect.get());
  const size = outputSize(r.sw, r.sh, quality === 2160 ? 3840 : quality === 1080 ? 1920 : 1280);
  const outSeconds = segmentsDuration(segments) / speed;
  const bitrate = quality === 720 ? 4e6 : quality === 1080 ? 8e6 : 16e6;
  const estimate = outSeconds * (bitrate + 160e3) / 8;
  const filename = `${nameBase(video.file.name)}-gg-edit.${ext}`;

  // Long exports stream straight to a file on disk where supported, so memory stays low.
  let writable = null, chunks = [];
  if (window.showSaveFilePicker && (estimate > 300e6 || outSeconds > 600)) {
    try {
      const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'Video', accept: { [mime.split(';')[0]]: [`.${ext}`] } }] });
      writable = await handle.createWritable();
    } catch (error) { if (error.name === 'AbortError') { audioCtx?.close(); return; } }
  } else if (!window.showSaveFilePicker && estimate > 1.5e9) {
    if (!confirm(`This export will be about ${(estimate / 1e9).toFixed(1)} GB and is kept in memory until it finishes. Choose 720p or a shorter cut if your device has little memory. Continue?`)) { audioCtx?.close(); return; }
  }

  const job = { cancelled: false };
  video.rendering = job;
  const exportBtn = $m('#video-export'), bar = $m('#video-render'), progress = bar.querySelector('progress'), label = bar.querySelector('span');
  exportBtn.disabled = true; bar.hidden = false; progress.value = 0; videoStatus('');
  preview.pause();
  const warn = () => { if (document.hidden) $m('#video-export-note').textContent = '⚠ Export pauses while this tab is in the background. Come back to this tab to continue.'; };
  document.addEventListener('visibilitychange', warn);

  let src, recorder, writeQueue = Promise.resolve(), drawHandle;
  try {
    src = await hiddenVideo();
    src.muted = false; src.playbackRate = speed; src.preservesPitch = true;
    const canvas = el('canvas'); canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext('2d', { alpha: false });
    const stream = canvas.captureStream(30);
    if (audioCtx) {
      const node = audioCtx.createMediaElementSource(src), gain = audioCtx.createGain(), dest = audioCtx.createMediaStreamDestination();
      gain.gain.value = Number(volume.value) / 100;
      node.connect(gain).connect(dest);
      dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
      await audioCtx.resume();
    } else src.muted = true;
    let soundNote = '';
    recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate, audioBitsPerSecond: 160000 });
    recorder.ondataavailable = e => {
      if (!e.data.size) return;
      if (writable) writeQueue = writeQueue.then(() => writable.write(e.data));
      else chunks.push(e.data);
    };
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });

    const filter = filterString(videoAdjust.get());
    const caps = captionsList(), title = $m('#video-title').value.trim(), titleFor = $m('#video-title-time').value;
    const total = segmentsDuration(segments);
    let doneBefore = 0;
    const started = performance.now();
    const draw = seg => {
      const t = src.currentTime, outT = doneBefore + Math.max(0, t - seg.start);
      ctx.filter = filter;
      ctx.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, size.width, size.height);
      ctx.filter = 'none';
      if (title && (titleFor === 'all' || outT < Number(titleFor))) drawText(ctx, title, size.width, size.height, 'title');
      drawText(ctx, captionAt(caps, t), size.width, size.height, 'caption');
      if (fade) {
        const edge = Math.min(0.35 * speed, (seg.end - seg.start) / 3);
        const first = doneBefore === 0, last = Math.abs(doneBefore + (seg.end - seg.start) - total) < 0.01;
        const dIn = first ? Math.min(1, outT / (0.6 * speed)) : Math.min(1, (t - seg.start) / edge);
        const dOut = last ? Math.min(1, (seg.end - t) / (0.8 * speed)) : Math.min(1, (seg.end - t) / edge);
        const alpha = 1 - Math.max(0, Math.min(dIn, dOut));
        if (alpha > 0.01) { ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.fillRect(0, 0, size.width, size.height); }
      }
      const doneFrac = Math.min(1, outT / total);
      progress.value = doneFrac;
      const elapsed = (performance.now() - started) / 1000;
      const eta = doneFrac > 0.02 ? elapsed / doneFrac - elapsed : NaN;
      label.textContent = `Exporting… ${Math.round(doneFrac * 100)}%` + (Number.isFinite(eta) ? ` · about ${formatTime(eta)} left` : '');
    };

    recorder.start(2000); recorder.pause();
    for (const seg of segments) {
      if (job.cancelled) break;
      await seek(src, seg.start);
      draw(seg);
      recorder.resume();
      try { await src.play(); }
      catch (error) {
        if (error.name !== 'NotAllowedError') throw error;
        src.muted = true; soundNote = ' The browser blocked the sound, so this export is silent: press Export again to retry.';
        await src.play();
      }
      await new Promise(resolve => {
        const finish = () => { src.removeEventListener('ended', finish); clearInterval(watch); resolve(); };
        const tick = () => {
          if (job.cancelled || src.currentTime >= seg.end || src.ended) { src.pause(); finish(); return; }
          draw(seg);
          drawHandle = src.requestVideoFrameCallback ? src.requestVideoFrameCallback(tick) : requestAnimationFrame(tick);
        };
        // Safety net: frame callbacks stop when the tab is hidden; this still ends the clip on time.
        const watch = setInterval(() => { if (job.cancelled || src.currentTime >= seg.end || src.ended) { src.pause(); finish(); } }, 250);
        src.addEventListener('ended', finish);
        tick();
      });
      recorder.pause();
      doneBefore += seg.end - seg.start;
    }
    recorder.resume(); recorder.stop();
    await stopped;
    await writeQueue;
    if (job.cancelled) { if (writable) await writable.abort?.(); videoStatus('Export cancelled.'); return; }
    if (writable) { await writable.close(); videoStatus(`Saved ${filename} · ${formatTime(outSeconds)}.${soundNote}`); }
    else { const blob = new Blob(chunks, { type: mime.split(';')[0] }); chunks = []; download(blob, filename); videoStatus(`Exported ${filename} · ${formatTime(outSeconds)} · ${(blob.size / 1048576).toFixed(1)} MB.${soundNote}`); }
    label.textContent = 'Done ✓'; progress.value = 1;
  } catch (error) {
    try { recorder?.state !== 'inactive' && recorder?.stop(); } catch {}
    try { await writable?.abort?.(); } catch {}
    videoStatus(`Export failed: ${error.message || 'unknown error'}. Try a lower quality or another browser.`);
  } finally {
    if (drawHandle && src?.cancelVideoFrameCallback) src.cancelVideoFrameCallback(drawHandle);
    src?.pause(); src?.remove(); audioCtx?.close().catch(() => {});
    document.removeEventListener('visibilitychange', warn);
    $m('#video-export-note').textContent = 'Export plays the edit once in the background, at about real-time speed. Keep this tab open in front until it finishes.';
    video.rendering = null; exportBtn.disabled = false;
    setTimeout(() => { if (!video.rendering) bar.hidden = true; }, 2500);
  }
}
// The audio context is created inside the click so the browser allows sound during export.
$m('#video-export').onclick = () => {
  if (video.rendering || !video.duration) return;
  let ctx = null;
  if (!$m('#video-mute').checked && window.AudioContext) { ctx = new AudioContext(); ctx.resume().catch(() => {}); }
  exportVideo(ctx);
};
$m('#video-cancel').onclick = () => { if (video.rendering) video.rendering.cancelled = true; };
$m('#video-frame-photo').onclick = () => {
  if (!video.width) return;
  const c = el('canvas'); c.width = video.width; c.height = video.height;
  c.getContext('2d').drawImage(preview, 0, 0);
  loadPhotoCanvas(c, `${nameBase(video.file.name)}-frame-${Math.round(preview.currentTime)}s`);
  showTab('photo'); photoStatus('Frame loaded. Describe an AI edit or adjust it, then download.');
};
$m('#video-new').onclick = () => {
  if (video.rendering) return;
  scanAbort?.abort(); preview.removeAttribute('src'); preview.load();
  if (video.url) URL.revokeObjectURL(video.url);
  Object.assign(video, { file: null, url: '', duration: 0, width: 0, height: 0, plan: null });
  $m('#video-work').hidden = true; $m('#video-drop').hidden = false; $m('#video-plan').hidden = true; videoStatus('');
};
window.addEventListener('beforeunload', e => { if (video.rendering) { e.preventDefault(); e.returnValue = ''; } });

// --- AI bar integration ------------------------------------------------------------------------
const mode = $m('#creationmode');
if (mode) {
  const option = el('option', '🎬 Photo & Video AI'); option.value = 'media'; mode.append(option);
  const chatOption = el('option', '💬 Create photos & video shorts (AI chat)'); chatOption.value = 'media-create'; mode.append(chatOption);
  mode.addEventListener('change', () => {
    if (mode.value === 'media') { openMedia(); mode.value = 'auto'; }
    if (mode.value === 'media-create') { openMedia('create'); mode.value = 'auto'; createChat.then(m => m.focus()); }
  });
}
// Registered on window (capture) so it runs before the other AI bar handlers on document.
window.addEventListener('submit', e => {
  if (e.target !== $m('#chatform')) return;
  const input = $m('#prompt'), prompt = input.value.trim();
  if (window.GGVideoChat?.handles(prompt, mode?.value)) return;
  if (prompt && mode?.value === 'media-create') { e.preventDefault(); e.stopImmediatePropagation(); input.value = ''; openMedia('create', prompt); return; }
  if (!prompt || (mode && mode.value !== 'auto')) return;
  if ($m('.attachment-list')?.children.length) return; // files attached in chat go to the AI chat
  const tab = mediaIntent(prompt) || (createIntent(prompt) === 'short' ? 'create' : null);
  if (!tab) return;
  e.preventDefault(); e.stopImmediatePropagation();
  input.value = '';
  openMedia(tab, prompt);
}, true);

// --- Create with AI chat (text → photo or video short) ----------------------------------------
const createChat = import('./media-chat.js?v=20261116-create').then(m => {
  m.init({
    panel: $m('#create-panel'), el, postMedia, download, pickMime, drawText, canvasBase64, nameBase,
    editPhoto: (canvas, name) => { loadPhotoCanvas(canvas, name); showTab('photo'); photoStatus('Loaded from the chat. Describe an AI edit or adjust it, then download.'); },
  });
  return m;
});
