import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanRenderRequest, normalizeRender, publicRender } from '../video-provider-core.js';
import { createRender, readRender, videoCapabilities, renderError } from '../lib/video-providers.mjs';
import { videoIntent } from '../video-chat-core.js';
const input = { id: '12345678-1234-4234-8234-123456789abc', provider: 'runway', prompt: 'A lighthouse in motion', duration: 5, aspect: '16:9' };

test('chat routes video genres and captioned clips while preserving text-only requests', () => {
  for (const prompt of ['crea un video con didascalie', 'crea un video con testo', 'crea un film di fantascienza', 'create an animation']) assert.equal(videoIntent(prompt, 'auto'), true);
  for (const prompt of ['crea un testo per un video', 'create a video script']) assert.equal(videoIntent(prompt, 'auto'), false);
});

test('rendering capabilities depend on each configured video service', () => {
  assert.equal(videoCapabilities({}).rendering, false);
  assert.equal(videoCapabilities({ RUNWAYML_API_SECRET: true }).providers.find(p => p.id === 'runway').configured, true);
  assert.deepEqual(videoCapabilities({ LUMAAI_API_KEY: true }).durations, [5, 9]);
  assert.equal(videoCapabilities({ LUMAAI_API_KEY: true }).imageInput, false);
});
test('creation validates native provider settings, prompt budget and request id', () => {
  assert.deepEqual(cleanRenderRequest(input), input);
  for (const bad of [{ provider: '__proto__' }, { duration: 9 }, { aspect: '1:1' }, { prompt: 'x'.repeat(1001) }, { prompt: '' }, { id: '../other' }, { image: {} }]) assert.throws(() => cleanRenderRequest({ ...input, ...bad }));
  assert.equal(cleanRenderRequest({ ...input, provider: 'luma', aspect: '1:1', duration: 9 }).duration, 9);
});
test('Runway submits native text-to-video parameters without retries', async () => {
  const calls = [];
  const sdk = { textToVideo: { create: async body => { calls.push(body); return { id: 'provider-task' }; } } };
  assert.equal((await createRender(input, sdk)).providerId, 'provider-task');
  await createRender({ ...input, duration: 10, aspect: '9:16' }, sdk);
  assert.deepEqual(calls, [
    { model: 'gen4.5', promptText: input.prompt, duration: 5, ratio: '1280:720' },
    { model: 'gen4.5', promptText: input.prompt, duration: 10, ratio: '720:1280' },
  ]);
  let attempts = 0;
  await assert.rejects(createRender(input, { textToVideo: { create: async () => { attempts++; throw Error('network'); } } }));
  assert.equal(attempts, 1);
});
test('Luma submits native duration and format and polls the correct generation', async () => {
  let body, polled;
  const sdk = { generations: {
    create: async value => { body = value; return { id: 'luma-task', state: 'queued' }; },
    get: async id => { polled = id; return { state: 'completed', assets: { video: 'https://cdn.example.com/video.mp4' } }; },
  } };
  const task = await createRender({ ...input, provider: 'luma', duration: 9, aspect: '1:1' }, sdk);
  assert.deepEqual(body, { model: 'ray-2', prompt: input.prompt, duration: '9s', aspect_ratio: '1:1', resolution: '720p' });
  assert.equal((await readRender({ provider: 'luma', providerId: task.providerId }, sdk)).status, 'succeeded');
  assert.equal(polled, 'luma-task');
});
test('failed, missing and unsafe video output never becomes a downloadable result', () => {
  assert.equal(normalizeRender('runway', { status: 'SUCCEEDED', output: [] }).status, 'failed');
  assert.equal(normalizeRender('runway', { status: 'THROTTLED' }).status, 'queued');
  assert.equal(normalizeRender('luma', { state: 'dreaming' }).status, 'running');
  assert.equal(normalizeRender('luma', { state: 'completed', assets: { video: 'javascript:alert(1)' } }).status, 'failed');
  assert.equal(renderError({ status: 401, message: 'private details' }).includes('private details'), false);
});
test('public jobs expose only owned same-site media handles, never provider ids or asset URLs', () => {
  const output = publicRender({ ...input, userId: 'owner', providerId: 'hidden', status: 'succeeded', outputUrl: 'https://provider.example.com/private.mp4' });
  assert.equal('userId' in output, false); assert.equal('providerId' in output, false); assert.equal('outputUrl' in output, false);
  assert.equal(output.video.url, `/gg-videos?asset=${input.id}`);
});
