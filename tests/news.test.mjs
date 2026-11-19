import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { handleNews } from '../netlify/functions/news.mjs';
import { publisherNewsData } from '../news-engine.js';

test('news endpoint validates methods, publishers and locale', async () => {
  assert.equal((await handler(new Request('https://local/gg-news', { method: 'POST' }))).status, 405);
  for (const query of ['source=unknown', 'country=invalid', 'lang=invalid!', 'q=' + 'x'.repeat(201)]) {
    assert.equal((await handler(new Request('https://local/gg-news?' + query))).status, 400);
  }
});

test('news endpoint retrieves RSS on the server and retains healthy sources when one fails', async () => {
  const now = Date.now();
  const response = await handleNews(new Request('https://local/gg-news?lang=it&country=IT&q=energia'),
    (query, source, options) => publisherNewsData(query, source, { ...options, now, fetcher: async url => {
      if (url.includes('corriere')) throw new Error('Publisher unavailable');
      const google = url.includes('news.google.com');
      return new Response(`<rss><channel><language>it</language><item><title>Energia: aggiornamento</title><link>${google ? 'https://news.google.com/articles/story' : 'https://www.tgcom24.mediaset.it/story'}</link><source>Test publisher</source><pubDate>${new Date(now - 60000).toUTCString()}</pubDate></item></channel></rss>`);
    } }));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.allUnavailable, false);
  assert.ok(data.results.length > 0);
  assert.equal(data.sources.find(s => s.id === 'corriere').status, 'unavailable');
  assert.equal(data.sources.find(s => s.id === 'tgcom24').status, 'ok');
  assert.ok(data.results.every(r => r.url.startsWith('https://')));
});

test('total feed failure returns structured status for the retry and external links', async () => {
  const response = await handleNews(new Request('https://local/gg-news'), (query, source, options) =>
    publisherNewsData(query, source, { ...options, fetcher: async () => { throw new Error('Offline'); } }));
  const data = await response.json();
  assert.equal(response.status, 503);
  assert.equal(data.allUnavailable, true);
  assert.deepEqual(data.results, []);
  assert.ok(data.sources.every(s => s.status === 'unavailable'));
});
