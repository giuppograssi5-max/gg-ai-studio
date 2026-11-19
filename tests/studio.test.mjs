import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanBrief, cleanScript, cleanProject, validateAiRequest, scriptPrompt, episodePrompt, scenePrompt, portraitPrompt, screenplay, parseJson, SLOT, LIMITS, ALL_ENVIRONMENTS } from '../studio-core.js';
import handler from '../netlify/functions/studio-ai.mjs';

const brief = { format: 'series', episodes: 5, genre: 'Comedy', style: 'anime', story: 'Two cousins open a pizza truck on the Moon and fight for customers.', people: [{ name: 'Lia', role: 'the chef', photo: true }, { name: 'Grumbol', kind: 'monster', description: 'mossy swamp giant' }], environments: ['Moon base', 'Moon base', 'Grandma’s kitchen'] };
const raw = {
  title: 'Moon Slice', logline: 'Pizza in space.', synopsis: 'They cook.', posterShot: 'A truck on the Moon',
  characters: [{ name: 'Lia', role: 'chef', look: 'curly hair, red apron', personality: 'bold' }, { name: 'Teo', role: 'cousin', look: 'tall', personality: 'shy' }],
  environments: [{ name: 'Moon base', look: 'white domes' }],
  episodes: [{ title: 'Pilot', summary: 'Opening day.', scenes: [{ heading: 'EXT. MOON BASE - DAY', environment: 'Moon base', characters: ['Lia'], action: 'Lia parks.', shot: 'Wide shot', dialogue: [{ character: 'Lia', line: 'Open!' }, { character: '', line: 'dropped' }] }] }, { title: 'Two', summary: 'Rivals.', scenes: [] }],
};

test('brief keeps the story, people and every chosen environment, without duplicates', () => {
  const b = cleanBrief(brief);
  assert.equal(b.format, 'series'); assert.equal(b.episodes, 5); assert.equal(b.style, 'anime'); assert.equal(b.aspect, '16:9');
  assert.deepEqual(b.environments, ['Moon base', 'Grandma’s kitchen']);
  assert.deepEqual(b.people, [{ name: 'Lia', role: 'the chef', kind: 'person', description: '' }, { name: 'Grumbol', role: '', kind: 'monster', description: 'mossy swamp giant' }]);
  assert.equal(cleanBrief({ ...brief, format: 'movie' }).episodes, 1);
  assert.equal(cleanBrief({ ...brief, episodes: 99 }).episodes, LIMITS.episodes);
  assert.throws(() => cleanBrief({ ...brief, story: 'short' }), /at least 20/);
  assert.throws(() => cleanBrief({ ...brief, format: 'opera' }), /movie or TV series/);
  assert.throws(() => cleanBrief({ ...brief, people: [{ role: 'x' }] }), /name is required/);
  assert.throws(() => cleanBrief({ ...brief, environments: ALL_ENVIRONMENTS }), /up to 16/);
});

test('script prompt carries people and environments and asks only for the pilot', () => {
  const { system, user } = scriptPrompt(cleanBrief(brief));
  assert.match(user, /Lia \[Invented person\] \(the chef\)/); assert.match(user, /Moon base, Grandma’s kitchen/);
  assert.match(system, /exactly 5 episodes/); assert.match(system, /ONLY episode 1/);
  assert.match(scriptPrompt(cleanBrief({ ...brief, format: 'movie' })).system, /7 scenes/);
});

test('AI script output is sanitised', () => {
  const s = cleanScript(raw);
  assert.equal(s.episodes.length, 2); assert.equal(s.episodes[1].number, 2);
  assert.equal(s.episodes[0].scenes[0].dialogue.length, 1);
  assert.throws(() => cleanScript({ ...raw, episodes: [{ title: 'x', scenes: [] }] }), /Incomplete/);
  assert.deepEqual(parseJson('Sure! {"a":1} done'), { a: 1 });
  assert.match(episodePrompt(s, 2, 'Italian').user, /Episode 1 "Pilot"/);
  assert.throws(() => episodePrompt(s, 9), /Unknown episode/);
});

test('image prompts keep characters consistent', () => {
  const s = cleanScript(raw);
  const p = scenePrompt(s, s.episodes[0].scenes[0], 'noir');
  assert.match(p, /film noir/); assert.match(p, /Lia: curly hair/); assert.doesNotMatch(p, /Teo/); assert.match(p, /white domes/);
  assert.doesNotMatch(portraitPrompt(s.characters[0], 'cinematic', true), /reference photo/);
  assert.match(portraitPrompt(s.characters[0], 'cinematic'), /must not resemble any real person/);
  assert.match(p, /must not resemble real people/);
});

test('requests and saved productions are validated', () => {
  assert.equal(validateAiRequest({ action: 'image', prompt: 'A truck on the moon', aspect: '4:3' }).aspect, '16:9');
  assert.throws(() => validateAiRequest({ action: 'image', prompt: 'A truck on the moon', refs: [{ mimeType: 'image/gif', data: 'AA==' }] }), /Invalid image/);
  assert.throws(() => validateAiRequest({ action: 'image', prompt: 'A truck on the moon', refs: [{ mimeType: 'image/png', data: 'not base64!' }] }), /Invalid image/);
  assert.throws(() => validateAiRequest({ action: 'episode', script: raw, number: 7 }), /Unknown episode/);
  assert.throws(() => validateAiRequest({ action: 'nope' }), /Unknown action/);
  const project = cleanProject({ brief, script: raw, images: ['poster', 'char-0', 'scene-1-0', '../x', 'poster'] });
  assert.deepEqual(project.images, ['poster', 'char-0', 'scene-1-0']);
  assert.ok(SLOT.test('scene-12-3') && !SLOT.test('scene-1') && !SLOT.test('poster/..'));
});

test('screenplay export lists cast, scenes and dialogue', () => {
  const text = screenplay(cleanScript(raw), cleanBrief(brief));
  assert.match(text, /MOON SLICE/); assert.match(text, /EPISODE 1: Pilot/); assert.match(text, /LIA\n\s+Open!/); assert.match(text, /not scripted yet/);
});

test('AI endpoint rejects bad requests before calling any model', async () => {
  const post = (body, headers = {}) => handler(new Request('https://local/gg-studio/ai', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body }));
  assert.equal((await handler(new Request('https://local/gg-studio/ai'))).status, 405);
  assert.equal((await post('{}', { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post('not json')).status, 400);
  const r = await post(JSON.stringify({ action: 'script', brief: { ...brief, story: 'tiny' } }));
  assert.equal(r.status, 400); assert.match((await r.json()).error, /at least 20/);
});

test('a prompt-only brief lets the AI pick the genre', () => {
  const b = cleanBrief({ format: 'movie', genre: 'Auto', story: 'A shy lighthouse keeper finds a talking whale.' });
  assert.equal(b.genre, 'Auto');
  assert.match(scriptPrompt(b).user, /Genre: choose the best fit/);
  assert.doesNotMatch(screenplay({ title: 'T', logline: '', synopsis: '', characters: [], episodes: [] }, b), /Auto/);
});

test('only invented characters: monsters are welcome, real people are replaced', () => {
  const { system, user } = scriptPrompt(cleanBrief(brief));
  assert.match(user, /Grumbol \[Monster\]: mossy swamp giant/);
  assert.match(system, /Never portray, name or imitate real people/); assert.match(system, /realPeopleReplaced/);
  assert.match(episodePrompt(cleanScript(raw), 2).system, /never portray, name or imitate real people/);
  const s = cleanScript({ ...raw, realPeopleReplaced: true, characters: [{ name: 'Grumbol', kind: 'monster', role: 'guard', look: 'mossy', personality: 'shy' }, { name: 'X', kind: 'celebrity' }] });
  assert.equal(s.realPeopleReplaced, true); assert.equal(s.characters[0].kind, 'monster'); assert.equal(s.characters[1].kind, 'person');
  assert.match(portraitPrompt(s.characters[0], 'animation'), /monster, guard/);
  assert.equal(cleanScript(raw).realPeopleReplaced, false);
  assert.match(screenplay(s, cleanBrief(brief)), /Grumbol — Monster, guard/);
});
