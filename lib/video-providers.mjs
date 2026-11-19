import RunwayML from '@runwayml/sdk';
import LumaAI from 'lumaai';
import { VIDEO_SERVICES, normalizeRender } from '../video-provider-core.js';
import { VIDEO_CAPABILITIES } from '../video-chat-core.js';

export const configuredVideo = (env = process.env) => ({ runway: !!env.RUNWAYML_API_SECRET, luma: !!env.LUMAAI_API_KEY });
export function videoCapabilities(env = process.env) {
  const configured = configuredVideo(env);
  const providers = Object.entries(VIDEO_SERVICES).map(([id, spec]) => ({ id, ...spec, configured: configured[id] }));
  const first = providers.find(p => p.configured);
  return { ...(first ? { rendering: true, imageInput: false, durations: first.durations, aspects: first.aspects,
    reason: 'Native video generation · Runway / Luma. Silent 720p clips; duration, availability and content rules depend on the selected provider. Each submission uses the site owner’s provider credits.' } : VIDEO_CAPABILITIES), providers };
}
function client(provider) {
  // Never retry a paid creation automatically after an ambiguous connection failure.
  const options = { timeout: 18000, maxRetries: 0 };
  return provider === 'runway' ? new RunwayML(options) : new LumaAI({ ...options, authToken: process.env.LUMAAI_API_KEY });
}
export async function createRender(req, sdk = client(req.provider)) {
  const result = req.provider === 'runway'
    ? await sdk.textToVideo.create({ model: 'gen4.5', promptText: req.prompt, duration: req.duration, ratio: req.aspect === '9:16' ? '720:1280' : '1280:720' })
    : await sdk.generations.create({ model: 'ray-2', prompt: req.prompt, duration: `${req.duration}s`, aspect_ratio: req.aspect, resolution: '720p' });
  if (typeof result.id !== 'string' || !result.id) throw Error('No provider task identifier');
  return { providerId: result.id, ...normalizeRender(req.provider, result) };
}
export async function readRender(job, sdk = client(job.provider)) {
  return normalizeRender(job.provider, job.provider === 'runway' ? await sdk.tasks.retrieve(job.providerId) : await sdk.generations.get(job.providerId));
}
export function renderError(error) {
  if ([401, 403].includes(error?.status)) return 'The video provider rejected its configuration. Contact the GG site owner.';
  if (error?.status === 402) return 'The video provider has no available credit. Contact the GG site owner.';
  if (error?.status === 429) return 'The video provider is busy or its usage limit was reached. Try later.';
  if ([400, 422].includes(error?.status)) return 'The provider rejected this request. Try another description that follows its rules.';
  return 'The submission could not be confirmed and was not retried automatically. Check the provider dashboard before creating another video to avoid duplicate charges.';
}
