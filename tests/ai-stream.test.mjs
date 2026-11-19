import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readAIStream } from '../ai-stream.js';
import { streamAIResult } from '../lib/ai-events.mjs';
import { answer, answerOpenAI, validate } from '../netlify/functions/assistant.mjs';

test('both providers deliver live text before their normalized final answer', async () => {
  const body = validate({ mode: 'chat', prompt: 'Hello' });
  const claudeDeltas = [];
  const claude = { messages: { stream: () => {
    let listener;
    return { on: (type, fn) => { assert.equal(type, 'text'); listener = fn; }, finalMessage: async () => {
      listener('Hello '); listener('there');
      assert.deepEqual(claudeDeltas, ['Hello ', 'there']);
      return { content: [{ type: 'text', text: 'Hello there' }], stop_reason: 'end_turn' };
    } };
  } } };
  assert.equal((await answer(body, claude, { onDelta: text => claudeDeltas.push(text) })).text, 'Hello there');
  const openAIDeltas = [];
  const openai = { responses: { create: async request => {
    assert.equal(request.stream, true);
    return (async function* () {
      yield { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'Hello ' };
      yield { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'there' };
      assert.deepEqual(openAIDeltas, ['Hello ', 'there']);
      yield { type: 'response.completed', response: { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello there' }] }] } };
    })();
  } } };
  assert.equal((await answerOpenAI(body, openai, { onDelta: text => openAIDeltas.push(text) })).text, 'Hello there');
});

test('SSE transports text, Unicode, and final citations through the actual browser parser', async () => {
  const data = { text: 'Città 世界', sources: [{ title: 'Source', url: 'https://example.org/' }] };
  const response = streamAIResult(async emit => { emit('Città '); emit('世界'); return data; });
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  const events = [];
  await readAIStream(response, e => events.push(e));
  assert.equal(events.filter(e => e.type === 'delta').map(e => e.text).join(''), data.text);
  assert.deepEqual(events.at(-1), { type: 'result', data });
});

test('SSE parser handles byte-fragmented multibyte characters and CRLF frames', async () => {
  const bytes = new TextEncoder().encode('data: {"type":"delta","text":"世界"}\r\n\r\ndata: [DONE]\r\n\r\n');
  const response = new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } }));
  const events = []; await readAIStream(response, e => events.push(e));
  assert.deepEqual(events, [{ type: 'delta', text: '世界' }]);
});

test('provider failures return a public error without exposing internal details', async () => {
  const events = [];
  await readAIStream(streamAIResult(async emit => { emit('Partial'); throw Error('Private provider diagnostic'); }), e => events.push(e));
  assert.equal(events.at(-1).type, 'error');
  assert.doesNotMatch(JSON.stringify(events), /Private provider diagnostic/);
  assert.equal(events.some(e => e.type === 'result'), false);
});

test('stopping a browser read cancels provider work even while waiting for a token', async () => {
  const controller = new AbortController();
  let providerSignal;
  const response = streamAIResult(async (emit, signal) => {
    providerSignal = signal;
    emit('Partial');
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    return { text: 'Partial' };
  });
  const reading = readAIStream(response, event => { if (event.type === 'delta') controller.abort(); }, controller.signal);
  await assert.rejects(reading, { name: 'AbortError' });
  assert.equal(providerSignal.aborted, true);
});

test('truncated event frames and malformed JSON fail instead of reporting completion', async () => {
  for (const content of ['data: {"type":"result"}', 'data: invalid\n\n']) {
    await assert.rejects(readAIStream(new Response(content), () => {}));
  }
});
