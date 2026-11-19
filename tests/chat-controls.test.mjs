import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { readAIStream } from '../ai-stream.js';
import { streamAIResult } from '../lib/ai-events.mjs';

class Element {
  children = []; options = [{}]; value = ''; textContent = ''; attributes = {}; listeners = {};
  classList = { add() {}, remove() {} };
  constructor(tag = 'div') { this.tag = tag; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { this.children = []; this.textContent = ''; this.append(...children); }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  click() { this.onclick?.(); this.listeners.click?.(); }
  dispatchEvent() {} focus() {} before() {} scrollIntoView() {}
  contains(n) { return n === this || this.children.some(c => c.contains(n)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(c => c !== this); }
  querySelectorAll(selector) { return this.children.flatMap(c => [...(selector.startsWith('.') && c.className?.split(' ').includes(selector.slice(1)) ? [c] : []), ...c.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
const find = (root, text) => root.children.flatMap(c => [c, ...all(c)]).find(c => c.textContent === text);
const all = root => root.children.flatMap(c => [c, ...all(c)]);
const settle = () => new Promise(resolve => setImmediate(resolve));

async function chatHarness(respond) {
  const nodes = new Map(), events = [], requests = [], listeners = {};
  const q = selector => { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); };
  const document = { querySelector: q, documentElement: { lang: 'en' }, createElement: tag => new Element(tag), addEventListener() {}, dispatchEvent: event => events.push(event) };
  const window = { addEventListener: (name, fn) => { listeners[name] = fn; } };
  const context = vm.createContext({ window, document, navigator: { language: 'en' }, AbortController, URL, Blob, Event, setTimeout, clearTimeout, readAIStream,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    addResearchFollowups: () => {}, isNewsRequest: () => false, detectFileFormat: () => null, FILE_TYPES: {}, wantsImages: () => false,
    renderMarkdown: text => { const n = new Element(); n.textContent = text; return n; },
    message: (role, text) => { const n = new Element(); n.role = role; n.textContent = text; q('#messages').append(n); return n; },
    fetch: async (url, init) => { const body = JSON.parse(init.body); requests.push(body); return respond(body, init, requests.length); },
  });
  vm.runInContext((await readFile(new URL('../assistant-tools.js', import.meta.url), 'utf8')).replace(/^import .*\n/gm, ''), context);
  listeners.load();
  const submit = async (prompt, mode = 'chat') => {
    q('#creationmode').value = mode; q('#prompt').value = prompt;
    await listeners.submit({ target: { id: 'chatform' }, preventDefault() {}, stopImmediatePropagation() {} });
  };
  return { q, events, requests, window, submit, latest: () => q('#messages').children.at(-1) };
}

test('live text is visible before completion; Stop keeps context and the composer has no model switch buttons', async () => {
  const h = await chatHarness((body, init, count) => count === 1 ? streamAIResult(async (emit, signal) => {
    emit('An unfinished answer');
    await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true }));
    return { text: 'An unfinished answer' };
  }) : Response.json({ text: 'Next answer' }));
  const pending = h.submit('First question'); await settle();
  assert.equal(h.latest().children[2].textContent, 'An unfinished answer');
  assert.equal(h.events.length, 0);
  assert.equal(find(h.q('#chatform'), 'ChatGPT'), undefined);
  assert.equal(find(h.q('#chatform'), 'Compare'), undefined);
  find(h.latest(), 'Stop').onclick(); await pending;
  assert.equal(h.events[0].detail.text, 'An unfinished answer');
  await h.submit('Continue');
  assert.equal(h.requests[1].provider, 'claude');
  assert.equal(h.requests[1].history[1].content, 'An unfinished answer');
});

test('retrying a failed regeneration replaces its existing turn without duplicating history', async () => {
  const h = await chatHarness((body, init, count) => count === 2 ? Response.json({ error: 'Unavailable' }, { status: 503 }) : Response.json({ text: 'Answer ' + count }));
  await h.submit('Question');
  await find(h.latest(), 'Regenerate').onclick();
  assert.equal(h.events.length, 1);
  await find(h.latest(), 'Retry').onclick();
  assert.equal(h.events.length, 2);
  assert.equal(h.events[1].detail.replace, true);
  await h.submit('Follow up');
  assert.equal(h.requests[3].history.length, 2);
  assert.equal(h.requests[3].history[1].content, 'Answer 3');
});

test('reopened chats restore regeneration with the preceding context and editing restores code attachments', async () => {
  const h = await chatHarness(() => Response.json({ text: 'Updated' }));
  h.window.GG_AI.loadConversation([{ role: 'user', content: 'Earlier' }, { role: 'assistant', content: 'Before' }, { role: 'user', content: 'Latest' }, { role: 'assistant', content: 'Saved' }]);
  await find(h.latest(), 'Regenerate').onclick();
  assert.equal(h.requests[0].prompt, 'Latest');
  assert.equal(h.requests[0].history.length, 2);
  const picker = all(h.q('#chatform')).find(n => n.type === 'file');
  picker.files = [{ name: 'example.py', size: 8, text: async () => 'print(1)' }];
  await picker.onchange(); await h.submit('Explain this code');
  assert.equal(h.requests[1].files[0].type, 'text/plain');
  const user = h.q('#messages').children.at(-2);
  find(user, 'Edit').onclick();
  assert.equal(h.q('#prompt').value, 'Explain this code');
  assert.ok(find(h.q('#chatform'), 'example.py ×'));
});

test('switching conversations discards pending output from the previous chat', async () => {
  const h = await chatHarness(() => streamAIResult(async (emit, signal) => {
    emit('Old partial text'); await new Promise(resolve => signal.addEventListener('abort', resolve, { once: true })); return { text: 'Old answer' };
  }));
  const pending = h.submit('Old question'); await settle();
  h.window.GG_AI.loadConversation([{ role: 'user', content: 'New question' }, { role: 'assistant', content: 'New answer' }]);
  await pending;
  assert.equal(h.events.length, 0);
  assert.equal(h.latest().children[1].children[0].textContent, 'New answer');
});


test('image creation uses a supported provider', async () => {
  const h = await chatHarness(() => Response.json({ text: 'Image created' }));
  await h.submit('Draw a landscape', 'image');
  assert.equal(h.requests[0].mode, 'image');
  assert.equal(h.requests[0].provider, 'claude');
});

test('Auto uses conversational follow-ups after research and retains earlier answers', async () => {
  const h = await chatHarness(() => Response.json({ text: 'Contextual answer', sources: [] }));
  await h.submit('Research solar energy', 'deep');
  await h.submit('Explain that more simply', 'auto');
  assert.equal(h.requests[1].mode, 'chat');
  assert.equal(h.requests[1].history[0].content, 'Research solar energy');
  assert.equal(h.requests[1].history[1].content, 'Contextual answer');
  await h.submit('Search current prices today', 'auto');
  assert.equal(h.requests[2].mode, 'search');
});
