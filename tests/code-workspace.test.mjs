import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openCodePreview, codeFilename } from '../code-artifacts.js';

test('generated HTML stays inside a restricted iframe and editing updates only its preview', () => {
  const original = globalThis.document;
  class Element {
    children = []; attributes = {};
    constructor(tag) { this.tag = tag; }
    append(...items) { this.children.push(...items); }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener() {} showModal() { this.open = true; }
  }
  const body = new Element('body');
  globalThis.document = { body, createElement: tag => new Element(tag) };
  try {
    const source = '<h1>Example</h1><script>parent.document.body.remove()</script><img src="https://example.org/tracker">';
    openCodePreview(source, 'html');
    const dialog = body.children[0], panes = dialog.children[3], [editor, frame] = panes.children;
    assert.equal(dialog.open, true);
    assert.equal(frame.attributes.sandbox, '');
    assert.equal(frame.referrerPolicy, 'no-referrer');
    assert.ok(frame.srcdoc.indexOf('Content-Security-Policy') < frame.srcdoc.indexOf('<script>'));
    assert.match(frame.srcdoc, /default-src 'none'/);
    assert.match(frame.srcdoc, /form-action 'none'/);
    assert.equal(editor.value, source);
    editor.value = '<h1>Updated</h1>'; editor.oninput();
    dialog.children[2].children[0].onclick();
    assert.match(frame.srcdoc, /<h1>Updated<\/h1>/);
    assert.doesNotMatch(frame.srcdoc, /parent.document/);
    assert.equal(codeFilename('python'), 'gg-code.py');
    assert.equal(codeFilename('../../unexpected'), 'gg-code.txt');
  } finally { globalThis.document = original; }
});
