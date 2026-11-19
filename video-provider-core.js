export const VIDEO_SERVICES = {
  runway: { name: 'Runway · Gen-4.5', durations: [5, 10], aspects: ['16:9', '9:16'] },
  luma: { name: 'Luma · Ray 2', durations: [5, 9], aspects: ['16:9', '9:16', '1:1'] },
};
export const JOB_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ACTIVE_VIDEO = ['submitting', 'queued', 'running'];
export function cleanRenderRequest(raw) {
  const spec = Object.hasOwn(VIDEO_SERVICES, raw?.provider) && VIDEO_SERVICES[raw.provider];
  if (!spec) throw Error('Choose Runway or Luma.');
  if (!JOB_ID.test(raw.id || '')) throw Error('Invalid request identifier.');
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
  if (!prompt || prompt.length > 1000) throw Error('Describe your video in 1–1,000 characters, including refinements.');
  if (!spec.durations.includes(raw.duration) || !spec.aspects.includes(raw.aspect)) throw Error('Unsupported duration or format for this provider.');
  if (raw.image) throw Error('Reference image input is not supported by this integration.');
  return { id: raw.id, provider: raw.provider, prompt, duration: raw.duration, aspect: raw.aspect };
}
export function httpsVideoURL(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function normalizeRender(provider, raw) {
  const states = provider === 'runway'
    ? { PENDING: 'queued', THROTTLED: 'queued', RUNNING: 'running', SUCCEEDED: 'succeeded', FAILED: 'failed', CANCELLED: 'cancelled' }
    : { queued: 'queued', dreaming: 'running', completed: 'succeeded', failed: 'failed' };
  let status = states[provider === 'runway' ? raw.status : raw.state] || 'queued';
  const outputUrl = httpsVideoURL(provider === 'runway' ? raw.output?.[0] : raw.assets?.video);
  if (status === 'succeeded' && !outputUrl) status = 'failed';
  return { status, outputUrl: status === 'succeeded' ? outputUrl : null,
    error: status === 'failed' ? 'The provider could not complete this video. Try a different description that follows its content rules.' : '' };
}
export function publicRender(job) {
  return { id: job.id, provider: job.provider, prompt: job.prompt, duration: job.duration, aspect: job.aspect,
    status: job.status === 'submitting' ? 'queued' : job.status, error: job.error, createdAt: job.createdAt,
    ...(job.status === 'succeeded' && job.outputUrl ? { video: { url: `/gg-videos?asset=${encodeURIComponent(job.id)}`, mimeType: 'video/mp4' } } : {}) };
}
