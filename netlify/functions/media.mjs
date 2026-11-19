import { VIDEO_CAPABILITIES } from '../../video-chat-core.js';
import { videoCapabilities } from '../../lib/video-providers.mjs';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { keepAliveJSON, withDeadline } from '../../lib/keepalive.mjs';
import { validateMediaRequest, planPrompt, parseJsonObject, cleanPlan, formatTime, chatSystemPrompt, cleanCreation } from '../../media-core.js';

// GG Photo & Video studio. Videos never reach the server: the browser sends a handful of small
// still frames for the AI edit plan, so a video of any length costs the same here.
const PLAN_MODEL = 'claude-sonnet-5-5';
const PHOTO_MODEL = 'gemini-3.1-flash-image';
const MAX_BODY = 5800000;

const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function editPhoto(req, signal) {
  const ai = new GoogleGenAI({ apiKey: process.env.NETLIFY_AI_GATEWAY_KEY, httpOptions: { baseUrl: process.env.NETLIFY_AI_GATEWAY_URL?.replace(/\/$/, ''), timeout: 55000 } });
  const prompt = `Edit this photo as requested and return the edited photo. Keep the subject, identity, composition and resolution unless the request asks to change them. Keep it photorealistic unless a style is requested. Request: ${req.prompt}`;
  const result = await ai.models.generateContent({
    model: PHOTO_MODEL,
    contents: [{ role: 'user', parts: [{ inlineData: req.image }, { text: prompt }] }],
    config: { abortSignal: signal },
  });
  const parts = result.candidates?.[0]?.content?.parts || [];
  const image = parts.find(p => p.inlineData && /^image\/(png|jpeg|webp)$/.test(p.inlineData.mimeType));
  if (!image) throw Object.assign(Error('No image'), { status: 422, publicMessage: 'The AI could not edit this photo. Try describing the edit differently.' });
  return { image: { mimeType: image.inlineData.mimeType, data: image.inlineData.data }, text: parts.filter(p => p.text).map(p => p.text).join('\n').slice(0, 600) };
}

// "Create with AI" chat: decide whether to make a photo, a video short or just reply.
async function chat(req, signal) {
  const client = new Anthropic();
  // Merge consecutive turns from the same side and start with the user, as the API expects.
  const messages = [];
  for (const m of req.messages) {
    const last = messages[messages.length - 1];
    if (last?.role === m.role) last.content += `\n\n${m.text}`;
    else if (messages.length || m.role === 'user') messages.push({ role: m.role, content: m.text });
  }
  const message = await client.messages.create({ model: PLAN_MODEL, max_tokens: 2500, system: chatSystemPrompt(req), messages }, { signal, timeout: 45000, maxRetries: 1 });
  const textReply = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let raw;
  try { raw = parseJsonObject(textReply); } catch { raw = { kind: 'reply', reply: textReply.slice(0, 900) }; }
  return cleanCreation(raw, req.current?.kind === 'short' ? req.current.scenes.length : 0);
}

// Generate one image from text (optionally changing a reference image), at the requested aspect ratio.
async function generate(req, signal) {
  const ai = new GoogleGenAI({ apiKey: process.env.NETLIFY_AI_GATEWAY_KEY, httpOptions: { baseUrl: process.env.NETLIFY_AI_GATEWAY_URL?.replace(/\/$/, ''), timeout: 55000 } });
  const parts = req.image
    ? [{ inlineData: req.image }, { text: `Edit this image as requested and return the edited image, keeping everything else the same. Request: ${req.prompt}` }]
    : [{ text: `Create this image. ${req.prompt}` }];
  const result = await ai.models.generateContent({
    model: PHOTO_MODEL,
    contents: [{ role: 'user', parts }],
    config: { abortSignal: signal, responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: req.aspect } },
  });
  const out = result.candidates?.[0]?.content?.parts || [];
  const image = out.find(p => p.inlineData && /^image\/(png|jpeg|webp)$/.test(p.inlineData.mimeType));
  if (!image) throw Object.assign(Error('No image'), { status: 422, publicMessage: 'The AI could not create this image. Try describing it differently.' });
  return { image: { mimeType: image.inlineData.mimeType, data: image.inlineData.data } };
}

async function makePlan(req, signal) {
  const client = new Anthropic();
  const content = [];
  for (const f of req.frames) {
    content.push({ type: 'text', text: `Frame at ${f.t.toFixed(1)} s (${formatTime(f.t)})` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: f.data } });
  }
  content.push({ type: 'text', text: planPrompt(req) });
  const message = await client.messages.create({ model: PLAN_MODEL, max_tokens: 3000, messages: [{ role: 'user', content }] }, { signal, timeout: 50000, maxRetries: 1 });
  const textReply = message.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return { plan: cleanPlan(parseJsonObject(textReply), req.duration) };
}

export default async function handler(request) {
  if (request.method === 'GET' && new URL(request.url).searchParams.get('capabilities') === 'video') return reply(videoCapabilities());
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Invalid origin' }, 403);
  if (Number(request.headers.get('content-length')) > MAX_BODY) return reply({ error: 'Request too large.' }, 413);
  let req;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply({ error: 'Request too large.' }, 413);
    const body = JSON.parse(raw);
    if (body?.action === 'video-create') {
      if (videoCapabilities().rendering) return new Response(null, { status: 307, headers: { Location: '/gg-videos', 'Cache-Control': 'no-store' } });
      return reply({ error: VIDEO_CAPABILITIES.reason, code: 'video_not_configured' }, 501);
    }
    req = validateMediaRequest(body);
  } catch (error) {
    return reply({ error: error instanceof SyntaxError ? 'Invalid request.' : error.message }, 400);
  }
  // Image models and vision calls can exceed Netlify's 30-second idle limit: keep the connection alive.
  return keepAliveJSON(async () => {
    try {
      return await withDeadline(57000, signal => ({ photo: editPhoto, plan: makePlan, chat, generate }[req.action](req, signal)));
    } catch (error) {
      if (error.publicMessage) throw error;
      const busy = error.status === 429;
      throw Object.assign(Error('Media AI failed'), {
        status: busy ? 429 : 503,
        publicMessage: busy ? 'The AI is busy. Try again in a minute.' : req.action === 'photo' ? 'The AI photo edit did not finish. Try again or use a simpler request.' : req.action === 'generate' ? 'The image did not finish. Try again.' : req.action === 'chat' ? 'The AI could not answer right now. Try again.' : 'The AI could not analyse this video right now. Try again.',
      });
    }
  });
}

export const config = { path: '/gg-media' };
