import { getUser } from '@netlify/identity';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { videoJobs } from '../../db/schema.js';
import { ACTIVE_VIDEO, JOB_ID, cleanRenderRequest, publicRender } from '../../video-provider-core.js';
import { configuredVideo, videoCapabilities, createRender, readRender, renderError } from '../../lib/video-providers.mjs';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });
export default async function handler(request: Request) {
  if (!['GET', 'POST'].includes(request.method)) return reply({ error: 'Method not allowed' }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Invalid origin' }, 403);
  const url = new URL(request.url);
  if (request.method === 'GET' && url.searchParams.has('capabilities')) return reply(videoCapabilities());
  const user = await getUser();
  if (!user) return reply({ error: 'Sign in to your GG account to generate videos and retrieve your saved jobs.' }, 401);
  const mine = (id: string) => and(eq(videoJobs.id, id), eq(videoJobs.userId, user.id));
  try {
    if (request.method === 'GET') {
      const id = url.searchParams.get('id') || url.searchParams.get('asset');
      if (!id) return reply({ jobs: (await db.select().from(videoJobs).where(eq(videoJobs.userId, user.id)).orderBy(desc(videoJobs.createdAt)).limit(30)).map(publicRender) });
      if (!JOB_ID.test(id)) return reply({ error: 'Invalid video' }, 400);
      let [job] = await db.select().from(videoJobs).where(mine(id));
      if (!job) return reply({ error: 'Video not found' }, 404);
      if (url.searchParams.has('asset')) {
        if (job.status !== 'succeeded' || !job.outputUrl) return reply({ error: 'The video is not ready.' }, 409);
        // URL originates exclusively from the authenticated provider response, never user input.
        const upstream = await fetch(job.outputUrl, { headers: request.headers.has('range') ? { Range: request.headers.get('range')! } : {}, signal: AbortSignal.timeout(20000) });
        if (![200, 206].includes(upstream.status) || !upstream.body) return reply({ error: 'The provider video link has expired or is unavailable.' }, 410);
        const type = upstream.headers.get('content-type') || '';
        if (!/^(video\/(mp4|webm)|application\/octet-stream)(;|$)/i.test(type)) return reply({ error: 'Invalid video response.' }, 502);
        const headers = new Headers({ 'Content-Type': type.startsWith('video/') ? type : 'video/mp4', 'Cache-Control': 'no-store, private',
          'Content-Disposition': `${url.searchParams.has('download') ? 'attachment' : 'inline'}; filename="gg-video.mp4"`, 'X-Content-Type-Options': 'nosniff' });
        for (const name of ['content-range', 'content-length', 'accept-ranges']) if (upstream.headers.has(name)) headers.set(name, upstream.headers.get(name)!);
        return new Response(upstream.body, { status: upstream.status, headers });
      }
      if (job.providerId && ACTIVE_VIDEO.includes(job.status) && Date.now() - +job.updatedAt > 4500) {
        const update = await readRender(job);
        const [saved] = await db.update(videoJobs).set({ ...update, updatedAt: new Date() }).where(and(mine(id), inArray(videoJobs.status, ACTIVE_VIDEO))).returning();
        if (saved) job = saved;
        else [job] = await db.select().from(videoJobs).where(mine(id));
      } else if (job.status === 'submitting' && Date.now() - +job.createdAt > 120000) {
        const [saved] = await db.update(videoJobs).set({ status: 'failed', error: renderError(null), updatedAt: new Date() }).where(and(mine(id), eq(videoJobs.status, 'submitting'))).returning();
        if (saved) job = saved;
      }
      return reply(publicRender(job));
    }
    if (Number(request.headers.get('content-length')) > 16000) return reply({ error: 'Request too large.' }, 413);
    let input;
    try {
      const raw = await request.text();
      if (raw.length > 16000) return reply({ error: 'Request too large.' }, 413);
      input = cleanRenderRequest(JSON.parse(raw));
    } catch (error: any) { return reply({ error: error instanceof SyntaxError ? 'Invalid request.' : error.message }, 400); }
    const [existing] = await db.select().from(videoJobs).where(mine(input.id));
    if (existing) return reply(publicRender(existing));
    if (!configuredVideo()[input.provider as 'runway' | 'luma']) return reply({ error: 'This provider has not been configured by the GG site owner.' }, 503);
    const count = await db.$count(videoJobs, and(eq(videoJobs.userId, user.id), gte(videoJobs.createdAt, new Date(Date.now() - 86400000))));
    const active = await db.$count(videoJobs, and(eq(videoJobs.userId, user.id), inArray(videoJobs.status, ACTIVE_VIDEO), gte(videoJobs.createdAt, new Date(Date.now() - 3600000))));
    if (count >= 10 || active >= 3) return reply({ error: 'Usage limit reached: up to 3 concurrent generations and 10 submissions in 24 hours.' }, 429);
    const [reserved] = await db.insert(videoJobs).values({ ...input, userId: user.id }).onConflictDoNothing().returning();
    if (!reserved) {
      const [own] = await db.select().from(videoJobs).where(mine(input.id));
      return own ? reply(publicRender(own)) : reply({ error: 'Request identifier already used.' }, 409);
    }
    let result;
    try { result = await createRender(input); } catch (error) { result = { status: 'failed', error: renderError(error) }; }
    const [job] = await db.update(videoJobs).set({ ...result, updatedAt: new Date() }).where(mine(input.id)).returning();
    return reply(publicRender(job), 202);
  } catch {
    return reply({ error: 'Unable to update this video. Refresh your saved jobs shortly; submitted provider work may still continue.' }, 503);
  }
}
export const config = { path: '/gg-videos' };
