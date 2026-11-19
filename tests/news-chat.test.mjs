import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isNewsRequest } from '../news-intent.js';

test('news submissions reach the assistant before legacy capture handlers and preserve follow-up context', async () => {
  class Element {
    constructor() { this.children = []; this.options = [{}]; this.value = ''; this.classList = { add() {} }; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute() {}
    addEventListener(name, fn) { this[name] = fn; }
    dispatchEvent() {}
    before() {}
    remove() {}
    scrollIntoView() {}
    querySelectorAll() { return []; }
    querySelector(selector) { return selector === '.author' ? this.children[0] : null; }
  }
  const nodes = new Map();
  const document = {
    documentElement: { lang: 'en' },
    querySelector(selector) { if (!nodes.has(selector)) nodes.set(selector, new Element()); return nodes.get(selector); },
    createElement: () => new Element(),
    createTextNode: text => text,
    dispatchEvent() {},
    addEventListener() {},
  };
  const listeners = {}, requests = [], replies = [];
  const window = { addEventListener: (name, fn, options) => { listeners[name] = { fn, options }; } };
  // Minimal stand-in for markdown.js: keeps citation markers as links so the test can inspect them.
  const renderMarkdown = (text, sources) => { const root = new Element(); for (const part of text.split(/(\[\d+\])/)) { const n = /^\[(\d+)\]$/.exec(part); if (n && sources?.[n[1] - 1]) { const a = new Element(); a.href = sources[n[1] - 1].url; a.textContent = part; root.append(a); } else if (part) root.append(part); } return root; };
  const galleries = [];
  const followups = [];
  const context = vm.createContext({ window, document, addResearchFollowups: result => followups.push(result), isNewsRequest, renderMarkdown, detectFileFormat: () => null, FILE_TYPES: {}, buildOfficeFile: async () => null, describeFile: () => '', fileName: () => '', wantsImages: (prompt, mode) => ['news', 'search', 'deep'].includes(mode), attachImages: (anchor, query) => galleries.push(query), CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, navigator: { language: 'en' }, AbortController, Event, URL, setTimeout, clearTimeout,
    message: role => { const element = new Element(); if (role === 'assistant') replies.push(element); return element; },
    fetch: async (url, options) => {
      assert.equal(url, '/gg-assistant'); requests.push(JSON.parse(options.body));
      return { ok: true, headers: new Headers({ 'Content-Type': 'application/json' }), json: async () => ({ text: 'Verified news [1]', sources: [{ title: 'Publisher', url: 'https://example.org/news' }], researched: true }) };
    },
  });
  const script = (await readFile(new URL('../assistant-tools.js', import.meta.url), 'utf8')).replace(/^import .*\n/gm, '');
  vm.runInContext(script, context);
  listeners.load.fn();
  assert.equal(listeners.submit.options, true); // Window capture runs before document capture.
  const mode = document.querySelector('#creationmode'), prompt = document.querySelector('#prompt');
  const submit = async (selected, text) => {
    mode.value = selected; prompt.value = text;
    const event = { target: { id: 'chatform' }, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } };
    await listeners.submit.fn(event); return event;
  };
  assert.equal((await submit('auto', 'Latest news about energy')).stopped, true);
  assert.deepEqual(galleries, ['Latest news about energy']); // Research answers show an image gallery.
  assert.equal(requests[0].mode, 'news');
  assert.equal(followups[0], replies[0]);
  assert.equal(requests[0].prompt, 'Latest news about energy');
  assert.equal((await submit('auto', 'What changed in Europe?')).stopped, true);
  assert.equal(requests[1].mode, 'chat');
  assert.equal(requests[1].history[0].content, 'Latest news about energy');
  assert.equal(requests[1].history[1].content, 'Verified news [1]');
  assert.equal((await submit('news', 'Technology')).stopped, true);
  assert.equal(requests[2].mode, 'news');
  assert.equal((await submit('weather', 'Weather in Rome')).stopped, undefined);
  const beforeResearch = requests.length;
  assert.equal((await submit('search', 'Solar energy')).stopped, undefined);
  assert.equal(requests.length, beforeResearch); // Dedicated research handler receives plain searches.
  const body = replies[0].children[2];
  assert.ok(body.children[0].children.some(child => child?.href === 'https://example.org/news' && child?.textContent === '[1]'));
  document.querySelector('#newchat').click();
  await submit('auto', 'Hello');
  assert.equal(requests.at(-1).mode, 'chat');
  assert.equal(requests.at(-1).history.length, 0);
});
