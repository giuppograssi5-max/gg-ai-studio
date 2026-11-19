import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const settle = () => new Promise(resolve => setImmediate(resolve));
async function historyHarness(respond) {
  const elements = [], nodes = new Map(), listeners = {}, exports = [], loaded = [];
  class Element {
    children = []; value = ''; listeners = {};
    constructor(tag, text = '') { this.tag = tag; this.textContent = text; elements.push(this); }
    append(...items) { this.children.push(...items); } after() {} setAttribute() {} focus() {}
    replaceChildren(...items) { this.children = items; }
    addEventListener(type, fn) { this.listeners[type] = fn; }
    click() { this.onclick?.(); this.listeners.click?.(); }
  }
  const q = selector => { if (!nodes.has(selector)) nodes.set(selector, new Element('div')); return nodes.get(selector); };
  const document = { readyState: 'complete', querySelector: q, body: new Element('body'), createElement: tag => new Element(tag), createTextNode: text => new Element('text', text), addEventListener: (type, fn) => { listeners[type] = fn; } };
  let authChange;
  const sdk = { AUTH_EVENTS: { LOGOUT: 'logout', LOGIN: 'login' }, onAuthChange: fn => { authChange = fn; } };
  const window = { GG_AI: { getInstructions: () => '', setInstructions() {}, cancel() {}, loadConversation: messages => loaded.push(messages) }, matchMedia: () => ({ matches: false }) };
  const context = vm.createContext({ window, document, sdk, setTimeout: () => {}, crypto: { randomUUID: () => 'chat-generated' }, downloadText: (...args) => exports.push(args), fetch: async (url, init) => respond(url, init) });
  const source = (await readFile(new URL('../chat-history.js', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '').replace("import('./identity-sdk.js')", 'Promise.resolve(sdk)');
  vm.runInContext(source, context); await settle();
  return { q, elements, listeners, exports, loaded, auth: event => authChange(event), turn: detail => listeners['gg:turn']({ detail }) };
}

test('chat exports reflect replacement answers and logout clears the exportable transcript', async () => {
  const h = await historyHarness(() => Response.json({ conversations: [] }));
  h.turn({ prompt: 'Explain CSS', text: 'First answer' });
  h.turn({ prompt: 'Explain CSS', text: 'Better answer', replace: true });
  const exportButton = h.elements.find(n => n.textContent === 'Export chat');
  exportButton.onclick();
  assert.match(h.exports[0][0], /Explain CSS[\s\S]*Better answer/);
  assert.doesNotMatch(h.exports[0][0], /First answer/);
  h.auth('logout'); exportButton.onclick();
  assert.equal(h.exports.length, 1);
  await settle();
});

test('New conversation prevents a slow saved-chat fetch from replacing the new view', async () => {
  let finish;
  const h = await historyHarness(url => url.includes('?id=') ? new Promise(resolve => { finish = resolve; }) : Response.json({ conversations: [{ id: 'chat-existing', title: 'Saved chat' }] }));
  const opening = h.elements.find(n => n.className === 'chat-open').onclick();
  await settle(); h.q('#newchat').click();
  finish(Response.json({ id: 'chat-existing', messages: [{ role: 'user', content: 'Old chat' }] }));
  await opening;
  assert.equal(h.loaded.length, 0);
});

test('signing out before queued persistence starts prevents saving a previous session transcript', async () => {
  const writes = [];
  const h = await historyHarness((url, init) => { if (init?.method === 'PUT') writes.push(init.body); return Response.json({ conversations: [] }); });
  h.turn({ prompt: 'Private question', text: 'Private answer' });
  h.auth('logout'); await settle();
  assert.equal(writes.length, 0);
});
