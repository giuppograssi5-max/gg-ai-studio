import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import { keepAliveJSON, withDeadline } from '../../lib/keepalive.mjs';
import { validateAiRequest, scriptPrompt, episodePrompt, parseJson, cleanScript, cleanScenes } from '../../studio-core.js';

// GG · Movies & TV series AI. Writes the script from the user's story, invented characters and environments,
// then creates every portrait, poster and scene still one request at a time.
const WRITER_MODEL = 'claude-sonnet-5-5';
const IMAGE_MODEL = 'gemini-3.1-flash-image';
// Every image is of invented characters only, whatever the prompt says.
const NO_REAL_PEOPLE = 'Every character shown is fictional: never depict or reproduce the likeness of a real person, celebrity or public figure.';
const MAX_BODY = 5800000;
const reply = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function write({ system, user }, signal, maxTokens) {
  const client = new Anthropic();
  const message = await client.messages.create({ model: WRITER_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }, { signal, timeout: 56000, maxRetries: 0 });
  return parseJson(message.content.filter(b => b.type === 'text').map(b => b.text).join(''));
}

async function script(req, signal) {
  const raw = await write(scriptPrompt(req.brief), signal, 7000);
  try { return { script: cleanScript(raw, req.brief) }; }
  catch { throw Object.assign(Error('Incomplete script'), { status: 422, publicMessage: 'The AI could not finish the script. Add a little more detail to your story and try again.' }); }
}

async function episode(req, signal) {
  const raw = await write(episodePrompt(req.script, req.number, req.language), signal, 4500);
  const scenes = cleanScenes(raw.scenes);
  if (!scenes.length) throw Object.assign(Error('No scenes'), { status: 422, publicMessage: 'The AI could not write this episode. Try again.' });
  return { number: req.number, scenes };
}

async function image(req, signal) {
  const ai = new GoogleGenAI({ apiKey: process.env.NETLIFY_AI_GATEWAY_KEY, httpOptions: { baseUrl: process.env.NETLIFY_AI_GATEWAY_URL?.replace(/\/$/, ''), timeout: 55000 } });
  const parts = [...req.refs.map(r => ({ inlineData: r })), { text: (req.refs.length ? 'Reference images of the invented characters are attached. ' : '') + req.prompt + ' ' + NO_REAL_PEOPLE }];
  const result = await ai.models.generateContent({
    model: IMAGE_MODEL,
    contents: [{ role: 'user', parts }],
    config: { abortSignal: signal, responseModalities: ['IMAGE', 'TEXT'], imageConfig: { aspectRatio: req.aspect } },
  });
  const out = result.candidates?.[0]?.content?.parts || [];
  const img = out.find(p => p.inlineData && /^image\/(png|jpeg|webp)$/.test(p.inlineData.mimeType));
  if (!img) throw Object.assign(Error('No image'), { status: 422, publicMessage: 'The AI could not create this image. Try again or edit the description.' });
  return { image: { mimeType: img.inlineData.mimeType, data: img.inlineData.data } };
}

export default async function handler(request) {
  if (request.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return reply({ error: 'Invalid origin' }, 403);
  if (Number(request.headers.get('content-length')) > MAX_BODY) return reply({ error: 'Request too large.' }, 413);
  let req;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY) return reply({ error: 'Request too large.' }, 413);
    req = validateAiRequest(JSON.parse(raw));
  } catch (error) {
    return reply({ error: error instanceof SyntaxError ? 'Invalid request.' : error.message }, 400);
  }
  return keepAliveJSON(async () => {
    try {
      return await withDeadline(57000, signal => ({ script, episode, image }[req.action](req, signal)));
    } catch (error) {
      if (error.publicMessage) throw error;
      const busy = error.status === 429;
      throw Object.assign(Error('Studio AI failed'), {
        status: busy ? 429 : 503,
        publicMessage: busy ? 'The AI is busy. Try again in a minute.' : req.action === 'image' ? 'The image did not finish. Try again.' : 'The AI writer did not finish in time. Try again, or shorten your story.',
      });
    }
  });
}

export const config = { path: '/gg-studio/ai' };
