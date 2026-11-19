import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanPlan, cleanSegments, cropRect, outputSize, scanTimes, pickFrames, parseTime, formatTime, filterString, validateMediaRequest, planPrompt, parseJsonObject, mediaIntent, captionAt, MAX_FRAMES } from '../media-core.js';

test('scan cost stays bounded for very long videos', () => {
  assert.equal(scanTimes(3 * 3600, 240).length, 240);
  assert.ok(scanTimes(3 * 3600, 240).at(-1) < 3 * 3600);
  assert.ok(scanTimes(10, 150).length <= 21);
  assert.deepEqual(scanTimes(0), []);
});

test('frames cover the timeline and the biggest scene changes', () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({ t: i, diff: i === 42 ? 1e6 : i }));
  const picks = pickFrames(samples, 10);
  assert.equal(picks.length, 10);
  assert.ok(picks.includes(0) && picks.includes(99) && picks.includes(42));
  assert.deepEqual(picks, [...picks].sort((a, b) => a - b));
});

test('segments are clamped, sorted and merged', () => {
  const segs = cleanSegments([{ start: 50, end: 70 }, { start: -5, end: 10 }, { start: 65, end: 80 }, { start: 5, end: 5.1 }, { start: 90, end: 500 }], 100);
  assert.deepEqual(segs.map(s => [s.start, s.end]), [[0, 10], [50, 80], [90, 100]]);
});

test('AI plan output is sanitised', () => {
  const plan = cleanPlan({ summary: 'ok', highlights: [{ start: 10, end: 20, label: 'Goal' }, { start: 5000, end: 6000 }], captions: [{ start: 1, end: 3, text: 'Hi' }, { start: 1, end: 3, text: '' }], adjust: { brightness: 999, warmth: -999 }, aspect: '21:9', speed: 9, hashtags: ['travel', '#sun set'] }, 120);
  assert.deepEqual(plan.highlights, [{ start: 10, end: 20, label: 'Goal' }]);
  assert.equal(plan.captions.length, 1);
  assert.equal(plan.adjust.brightness, 180);
  assert.equal(plan.adjust.warmth, -50);
  assert.equal(plan.aspect, 'original');
  assert.equal(plan.speed, 2);
  assert.deepEqual(plan.hashtags, ['#travel', '#sunset']);
  assert.equal(captionAt(plan.captions, 2), 'Hi');
  assert.equal(captionAt(plan.captions, 4), '');
});

test('crop and output size', () => {
  assert.deepEqual(cropRect(1920, 1080, '9:16'), { sx: 656, sy: 0, sw: 608, sh: 1080 });
  assert.deepEqual(cropRect(1080, 1920, '1:1'), { sx: 0, sy: 420, sw: 1080, sh: 1080 });
  assert.deepEqual(cropRect(1920, 1080, 'original'), { sx: 0, sy: 0, sw: 1920, sh: 1080 });
  assert.deepEqual(outputSize(3840, 2160, 1920), { width: 1920, height: 1080 });
  const odd = outputSize(607, 1081, 1920);
  assert.equal(odd.width % 2, 0); assert.equal(odd.height % 2, 0);
});

test('time parsing and formatting', () => {
  assert.equal(parseTime('1:15.5'), 75.5);
  assert.equal(parseTime('1:00:00'), 3600);
  assert.equal(parseTime('42'), 42);
  assert.ok(Number.isNaN(parseTime('abc')));
  assert.equal(formatTime(3725), '1:02:05');
  assert.equal(formatTime(65), '1:05');
});

test('filter string reflects adjustments', () => {
  assert.equal(filterString({}), 'brightness(100%) contrast(100%) saturate(100%)');
  assert.match(filterString({ warmth: 20, blur: 2 }), /sepia\(12%\).*blur\(2px\)/);
  assert.match(filterString({ warmth: -20 }), /hue-rotate\(-10deg\)/);
});

test('media requests are validated', () => {
  assert.throws(() => validateMediaRequest({ action: 'nope' }), /Unknown/);
  assert.throws(() => validateMediaRequest({ action: 'photo', prompt: 'x', image: { mimeType: 'image/gif', data: 'AAAA' } }), /JPEG/);
  assert.throws(() => validateMediaRequest({ action: 'photo', prompt: '', image: { mimeType: 'image/png', data: 'AAAA' } }), /Describe/);
  const photo = validateMediaRequest({ action: 'photo', prompt: ' brighter ', image: { mimeType: 'image/png', data: 'AAAA' } });
  assert.equal(photo.prompt, 'brighter');
  const frames = Array.from({ length: MAX_FRAMES + 1 }, (_, i) => ({ t: i, data: 'AAAA' }));
  assert.throws(() => validateMediaRequest({ action: 'plan', duration: 100, frames }), /frames/);
  assert.throws(() => validateMediaRequest({ action: 'plan', duration: 100, frames: [{ t: 1, data: 'not base64!' }] }), /frame/);
  const plan = validateMediaRequest({ action: 'plan', duration: 7200, goal: 'reel', frames: [{ t: 9000, data: 'AAAA' }] });
  assert.equal(plan.frames[0].t, 7200);
  assert.match(planPrompt(plan), /2:00:00/);
});

test('model JSON is extracted from a reply', () => {
  assert.deepEqual(parseJsonObject('Here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonObject('no json'));
});

test('AI bar recognises photo and video editing requests', () => {
  assert.equal(mediaIntent('Modifica il mio video e taglia le parti noiose'), 'video');
  assert.equal(mediaIntent('edit this photo, make it brighter'), 'photo');
  assert.equal(mediaIntent('Rimuovi lo sfondo dalla foto'), 'photo');
  assert.equal(mediaIntent('crea una foto di un gatto'), null);
  assert.equal(mediaIntent('come si fa un video virale?'), null);
});
