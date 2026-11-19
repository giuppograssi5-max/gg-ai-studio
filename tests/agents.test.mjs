import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAgentRequest, buildAgentCall, AGENTS } from '../agents-core.js';
import { runAgent, safeSource } from '../netlify/functions/agents.mjs';

test('requests are validated and history is normalized', () => {
  assert.throws(() => validateAgentRequest({ agent: 'pc', prompt: '' }), /1–4000/);
  assert.throws(() => validateAgentRequest({ agent: 'nope', prompt: 'hi' }), /Unknown agent/);
  assert.throws(() => validateAgentRequest({ agent: 'constructor', prompt: 'hi' }), /Unknown agent/);
  assert.throws(() => validateAgentRequest({ agent: 'custom', prompt: 'hi', custom: { name: 'x' } }), /name and instructions/);
  assert.throws(() => validateAgentRequest({ agent: 'pc', prompt: 'hi', history: [{ role: 'system', content: 'x' }] }), /history/);
  const r = validateAgentRequest({ agent: 'research', prompt: ' hi ', os: 'windows', device: 'x', history: [
    { role: 'assistant', content: 'lead' }, { role: 'user', content: 'a' }, { role: 'user', content: 'b' }, { role: 'assistant', content: 'c' }, { role: 'user', content: 'dangling' }] });
  assert.equal(r.prompt, 'hi');
  assert.equal(r.device, '', 'device info is only kept for PC Doctor');
  assert.deepEqual(r.history, [{ role: 'user', content: 'a\n\nb' }, { role: 'assistant', content: 'c' }]);
});

test('agent calls get the right prompt, device info and search budget', () => {
  const pc = buildAgentCall(validateAgentRequest({ agent: 'pc', prompt: 'slow', os: 'macos', device: 'CPU threads: 8' }));
  assert.match(pc.system, /PC Doctor/);
  assert.match(pc.messages.at(-1).content, /<device_info>[\s\S]*macOS[\s\S]*CPU threads: 8/);
  assert.equal(pc.searches, AGENTS.pc.searches);
  assert.equal(buildAgentCall(validateAgentRequest({ agent: 'writer', prompt: 'x' })).searches, 0);
  const custom = buildAgentCall(validateAgentRequest({ agent: 'custom', prompt: 'x', custom: { name: 'Coach', instructions: 'Be a coach', web: true } }));
  assert.match(custom.system, /<agent_instructions>\nBe a coach\n<\/agent_instructions>/);
  assert.match(custom.system, /Rules that always apply/);
  assert.equal(custom.searches, 3);
});

test('sources must be https without credentials', () => {
  assert.equal(safeSource('t', 'javascript:alert(1)'), null);
  assert.equal(safeSource('t', 'http://a.com'), null);
  assert.equal(safeSource('t', 'https://u:p@a.com'), null);
  assert.deepEqual(safeSource('', 'https://a.com/x'), { title: 'a.com', url: 'https://a.com/x' });
});

test('runAgent streams steps, text and sources and continues paused turns', async () => {
  const calls = [];
  const fake = { messages: { stream(params) {
    calls.push(params);
    const h = {};
    const s = { on(ev, fn) { h[ev] = fn; return s; }, async finalMessage() {
      if (calls.length === 1) {
        h.contentBlock({ type: 'server_tool_use', name: 'web_search', input: { query: 'error 0x80070005' } });
        h.contentBlock({ type: 'web_search_tool_result', content: [{ type: 'web_search_result', title: 'MS', url: 'https://learn.microsoft.com/x' }, { type: 'web_search_result', title: 'Bad', url: 'javascript:x' }] });
        return { stop_reason: 'pause_turn', content: [{ type: 'text', text: '' }] };
      }
      h.text('Fixed.');
      return { stop_reason: 'end_turn', content: [] };
    } };
    return s;
  } } };
  const events = [];
  await runAgent(validateAgentRequest({ agent: 'pc', prompt: 'update fails' }), e => events.push(e), fake);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].tools[0].max_uses, AGENTS.pc.searches);
  assert.equal(calls[1].messages.at(-1).role, 'assistant');
  assert.ok(events.some(e => e.type === 'step' && /0x80070005/.test(e.text)));
  assert.deepEqual(events.filter(e => e.type === 'source'), [{ type: 'source', title: 'MS', url: 'https://learn.microsoft.com/x' }]);
  assert.deepEqual(events.filter(e => e.type === 'text'), [{ type: 'text', delta: 'Fixed.' }]);
  assert.equal(events.at(-1).type, 'done');
});
