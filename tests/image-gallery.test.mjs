import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attachImages } from '../search-images.js';

class Element {
  children = []; isConnected = true; classes = new Set();
  classList = { remove: name => this.classes.delete(name) };
  constructor(tag) { this.tag = tag; }
  setAttribute() {}
  addEventListener() {}
  append(...items) { for (const item of items) { item.parent = this; this.children.push(item); } }
  replaceChildren(...items) { this.children = []; this.append(...items); }
  after(item) { const p = this.parent; item.parent = p; p.children.splice(p.children.indexOf(this) + 1, 0, item); }
  remove() { this.parent.children = this.parent.children.filter(item => item !== this); this.isConnected = false; }
  showModal() { this.open = true; }
}
const settle = () => new Promise(resolve => setImmediate(resolve));
test('gallery retries empty results and keeps a working thumbnail when the original fails', async () => {
  const originalDocument = globalThis.document, originalFetch = globalThis.fetch;
  const body = new Element('body'), root = new Element('main'), anchor = new Element('div'); root.append(anchor);
  globalThis.document = { body, createElement: tag => new Element(tag), querySelector: () => null };
  const image = { src: 'https://example.org/thumb.jpg', full: 'https://example.org/full.jpg', page: 'https://example.org/page', title: 'Test', source: 'example.org' };
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url, 'https://local').pathname, '/gg-images');
    // Simulate the site's protection gate: omitted cookies return an HTML login page.
    if (options.credentials !== 'same-origin') return new Response('<title>Password Protection</title>', { status: 401 });
    return Response.json(++calls === 1 ? { images: [], placeholder: true } : { images: [image], provider: 'Test' });
  };
  try {
    const section = attachImages(anchor, 'gallery regression', { lang: 'en' });
    await settle();
    const retry = section.children.find(item => item.tag === 'button');
    assert.equal(retry.textContent, 'Riprova immagini');
    retry.onclick(); await settle();
    assert.equal(calls, 2);
    assert.equal(section.isConnected, false);
    const gallery = root.children[1], strip = gallery.children[1];
    const button = strip.children[0].children[0]; button.onclick();
    const preview = body.children[0].children.find(item => item.tag === 'img');
    assert.equal(preview.src, image.full);
    preview.onerror(); assert.equal(preview.src, image.src);
    assert.equal(preview.onerror, null);
    // If both gallery URLs fail, retry must make a fresh request instead of using the bad cache entry.
    const thumbnail = button.children[0]; thumbnail.onerror(); thumbnail.onerror();
    gallery.children.find(item => item.tag === 'button').onclick(); await settle();
    assert.equal(calls, 3);
  } finally { globalThis.document = originalDocument; globalThis.fetch = originalFetch; }
});
