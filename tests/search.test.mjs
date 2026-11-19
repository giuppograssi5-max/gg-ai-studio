import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { searchWeb, searchWikipedia } from '../netlify/functions/search.mjs';

test('search rejects empty, oversized queries and unsupported methods', async () => {
  assert.equal((await handler(new Request('https://local/gg-search?q=%20'))).status, 400);
  assert.equal((await handler(new Request('https://local/gg-search?q=' + 'x'.repeat(4001)))).status, 400);
  assert.equal((await handler(new Request('https://local/gg-search?q=test', { method: 'DELETE' }))).status, 405);
});
test('web search returns a grounded summary with deduplicated safe sources', async () => {
  const client = { messages: { create: async (request) => {
    assert.equal(request.messages[0].content, 'solar energy');
    assert.equal(request.tools[0].name, 'web_search');
    return { content: [
      { type: 'web_search_tool_result', content: [
        { type: 'web_search_result', title: 'Solar', url: 'https://example.org/solar' },
        { type: 'web_search_result', title: 'Unsafe', url: 'javascript:alert(1)' },
      ] },
      { type: 'text', text: 'Solar panels convert sunlight into electricity.', citations: [
        { type: 'web_search_result_location', title: 'Solar', url: 'https://example.org/solar' },
      ] },
    ] };
  } } };
  const result = await searchWeb('solar energy', 'en', client);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].url, 'https://example.org/solar');
  assert.match(result.summary, /sunlight/);
});
test('ungrounded AI output is rejected instead of presented as researched', async () => {
  await assert.rejects(searchWeb('test', 'en', { messages: { create: async () => ({ content: [{ type: 'text', text: 'Unverified answer' }] }) } }));
});
test('encyclopedic fallback preserves ranking, language and query and labels its scope', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async url => {
      assert.equal(url.hostname, 'it.wikipedia.org');
      assert.equal(url.searchParams.get('gsrsearch'), 'energia solare');
      return Response.json({ query: { pages: [
        { index: 2, title: 'Second', fullurl: 'https://it.wikipedia.org/wiki/Second', extract: 'Second excerpt' },
        { index: 1, title: 'First', fullurl: 'https://it.wikipedia.org/wiki/First', extract: 'First excerpt' },
      ] } });
    };
    const result = await searchWikipedia('energia solare', 'it');
    assert.equal(result.provider, 'Wikipedia');
    assert.match(result.scope, /enciclopedici/);
    assert.equal(result.results[0].title, 'First');
  } finally { globalThis.fetch = original; }
});

test('streaming research delivers sources and answer text before the final result', async () => {
  const { streamResearch } = await import('../netlify/functions/search.mjs');
  let finish;
  const gate = new Promise(resolve => { finish = resolve; });
  const final = { content: [
    { type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: 'Solar', url: 'https://example.org/solar' }] },
    { type: 'text', text: 'Grounded answer.' },
  ] };
  const client = { messages: { stream: (_options, settings) => {
    assert.ok(settings.signal);
    return {
      async *[Symbol.asyncIterator]() {
        yield { type: 'content_block_start', content_block: { type: 'server_tool_use' } };
        yield { type: 'content_block_start', content_block: final.content[0] };
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Grounded answer.' } };
        await gate;
      },
      finalMessage: async () => final,
    };
  } } };
  const response = streamResearch(new Request('https://local/gg-search'), 'solar', 'en', client);
  assert.match(response.headers.get('content-type'), /text\/event-stream/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const reader = response.body.getReader(), decoder = new TextDecoder(); let output = '';
  try {
    while (!output.includes('"type":"delta"')) output += decoder.decode((await reader.read()).value);
    assert.match(output, /"type":"sources"/);
    assert.doesNotMatch(output, /"type":"result"/);
  } finally { finish(); }
  for (;;) { const part = await reader.read(); if (part.done) break; output += decoder.decode(part.value); }
  assert.match(output, /"type":"result"/);
  assert.match(output, /Grounded answer/);
});

test('cancelling research aborts the provider request', async () => {
  const { streamResearch } = await import('../netlify/functions/search.mjs');
  let signal;
  const client = { messages: { stream: (_options, settings) => {
    signal = settings.signal;
    return {
      async *[Symbol.asyncIterator]() { await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); throw Error('aborted'); },
    };
  } } };
  const response = streamResearch(new Request('https://local/gg-search'), 'solar', 'en', client);
  await response.body.cancel();
  assert.equal(signal.aborted, true);
});

test('stream errors switch to a clearly labelled encyclopedic fallback', async () => {
  const { streamResearch } = await import('../netlify/functions/search.mjs');
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ query: { pages: [{ index: 1, title: 'Solar energy', fullurl: 'https://en.wikipedia.org/wiki/Solar_energy', extract: 'Encyclopedic excerpt' }] } });
  try {
    const client = { messages: { stream: () => { throw Error('Provider unavailable'); } } };
    const output = await streamResearch(new Request('https://local/gg-search'), 'solar', 'en', client).text();
    const events = output.split('\n\n').filter(Boolean).map(frame => JSON.parse(frame.slice(6)));
    assert.ok(events.some(e => e.type === 'reset'));
    const result = events.find(e => e.type === 'result').data;
    assert.equal(result.provider, 'Wikipedia');
    assert.match(result.scope, /enciclopedici/);
  } finally { globalThis.fetch = original; }
});


test('follow-up research passes earlier questions and answers as conversation messages', async () => {
  const history = [{ role: 'user', content: 'Tell me about solar panels' }, { role: 'assistant', content: 'Solar panels convert sunlight to electricity.' }];
  const client = { messages: { create: async request => {
    assert.deepEqual(request.messages, [...history, { role: 'user', content: 'What do they cost?' }]);
    return { content: [
      { type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: 'Costs', url: 'https://example.org/costs' }] },
      { type: 'text', text: 'Prices depend on capacity.', citations: [{ type: 'web_search_result_location', title: 'Costs', url: 'https://example.org/costs' }] },
    ] };
  } } };
  const result = await searchWeb('What do they cost?', 'en', client, history);
  assert.match(result.summary, /\[1\]/);
  assert.equal(result.results[0].url, 'https://example.org/costs');
});

test('research POST rejects malformed and excessive conversation payloads', async () => {
  for (const body of ['{', 'null', '[]', JSON.stringify({ q: '' })]) {
    assert.equal((await handler(new Request('https://local/gg-search', { method: 'POST', body }))).status, 400);
  }
  assert.equal((await handler(new Request('https://local/gg-search', { method: 'POST', body: 'x'.repeat(70001) }))).status, 413);
});

test('paused research resumes with tool context and returns the final cited answer', async () => {
  let calls = 0;
  const client = { messages: { create: async request => {
    calls++;
    if (calls === 1) return { stop_reason: 'pause_turn', content: [{ type: 'server_tool_use', id: 'search-1', name: 'web_search', input: { query: 'solar costs' } }] };
    assert.equal(request.messages.at(-1).role, 'assistant');
    assert.equal(request.messages.at(-1).content[0].id, 'search-1');
    return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Verified costs.', citations: [{ type: 'web_search_result_location', title: 'Report', url: 'https://example.org/costs' }] }] };
  } } };
  const result = await searchWeb('Costs?', 'en', client);
  assert.equal(calls, 2);
  assert.equal(result.summary, 'Verified costs. [1]');
  assert.equal(result.incomplete, false);
});

test('streamed paused research continues without losing sources', async () => {
  const { streamResearch } = await import('../netlify/functions/search.mjs');
  let calls = 0;
  const client = { messages: { stream: request => {
    const first = ++calls === 1;
    if (!first) assert.equal(request.messages.at(-1).role, 'assistant');
    return {
      async *[Symbol.asyncIterator]() {
        if (first) yield { type: 'content_block_start', content_block: { type: 'server_tool_use' } };
        else yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Final answer.' } };
      },
      finalMessage: async () => first
        ? { stop_reason: 'pause_turn', content: [{ type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: 'Report', url: 'https://example.org/report' }] }] }
        : { stop_reason: 'end_turn', content: [{ type: 'text', text: 'Final answer.' }] },
    };
  } } };
  const output = await streamResearch(new Request('https://local/gg-search'), 'Question', 'en', client).text();
  const events = output.split('\n\n').filter(Boolean).map(frame => JSON.parse(frame.slice(6)));
  assert.equal(calls, 2);
  assert.ok(events.some(e => e.type === 'delta'));
  const result = events.find(e => e.type === 'result').data;
  assert.equal(result.summary, 'Final answer.');
  assert.equal(result.results[0].url, 'https://example.org/report');
});
