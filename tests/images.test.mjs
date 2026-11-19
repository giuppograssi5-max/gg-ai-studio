import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler, { findImages, findCommonsImages, findTopicImages } from '../netlify/functions/images.mjs';
import { imageQuery, safeImage } from '../images-core.js';

test('image search validates requests', async () => {
  assert.equal((await handler(new Request('https://local/gg-images?q=%20'))).status, 400);
  assert.equal((await handler(new Request('https://local/gg-images?q=' + 'x'.repeat(4001)))).status, 400);
  assert.equal((await handler(new Request('https://local/gg-images?q=test', { method: 'POST' }))).status, 405);
});
test('questions about people and things become image subjects', () => {
  assert.equal(imageQuery('Chi è Marie Curie?'), 'Marie Curie');
  assert.equal(imageQuery('mostrami foto del Colosseo'), 'Colosseo');
  assert.equal(imageQuery("Come funziona l'energia solare?"), 'energia solare');
  assert.equal(imageQuery('Who is Taylor Swift'), 'Taylor Swift');
  assert.equal(imageQuery('Lionel Messi'), 'Lionel Messi');
});
test('gallery URLs require HTTPS and reject embedded credentials', () => {
  assert.ok(safeImage('https://example.org/photo.jpg'));
  for (const value of ['http://example.org/x', 'javascript:alert(1)', 'data:image/png;base64,x', 'https://user:pass@example.org/x']) assert.equal(safeImage(value), null);
});
test('Google image search preserves ranking, validates links and removes duplicates', async () => {
  const item = n => ({ title: 'Harry Potter ' + n, thumbnail: `https://encrypted-tbn0.gstatic.com/image${n}`, original: `https://example.org/photo${n}.jpg`, link: `https://example.org/page${n}` });
  const images = await findImages('Harry Potter', 'it', { apiKey: 'test-placeholder', fetcher: async url => {
    assert.equal(url.hostname, 'serpapi.com');
    assert.equal(url.searchParams.get('engine'), 'google_images');
    assert.equal(url.searchParams.get('q'), 'Harry Potter');
    assert.equal(url.searchParams.get('hl'), 'it');
    assert.equal(url.searchParams.get('safe'), 'active');
    return Response.json({ images_results: [item(1), item(1), { ...item(2), link: 'javascript:alert(1)' }, ...Array.from({ length: 10 }, (_, n) => item(n + 3))] });
  } });
  assert.equal(images.length, 8);
  assert.equal(images[0].title, 'Harry Potter 1');
  assert.equal(images[1].title, 'Harry Potter 3');
  assert.equal(images[0].source, 'example.org');
  assert.equal(images[0].full, 'https://example.org/photo1.jpg');
});
test('Google failures do not fall back to unrelated image sources', async () => {
  await assert.rejects(findImages('test', 'en', { apiKey: '' }));
  for (const response of [new Response('', { status: 429 }), Response.json({ error: 'Provider failure' }), Response.json({})]) {
    await assert.rejects(findImages('test', 'en', { apiKey: 'test-placeholder', fetcher: async () => response }));
  }
  assert.deepEqual(await findImages('test', 'en', { apiKey: 'test-placeholder', fetcher: async () => Response.json({ images_results: [] }) }), []);
});
test('chat questions about a subject show images; tasks and small talk do not', async () => {
  globalThis.window ??= {};
  const { wantsImages } = await import('../search-images.js');
  for (const p of ["Come funziona l'energia solare?", 'history of the Roman Empire?', 'best beaches in Sardinia', 'Chi è Marie Curie?']) assert.equal(wantsImages(p, 'chat'), true, p);
  for (const p of ['ciao', 'grazie!', 'scrivi una email al capo', 'e la moglie?', '2+2']) assert.equal(wantsImages(p, 'chat'), false, p);
  assert.equal(wantsImages('Colosseo', 'search', 1), false);
  assert.equal(wantsImages('Colosseo', 'support'), false);
});

test('count questions extract the subject shown in the reported gallery', () => {
  assert.equal(imageQuery('how many harry potter there are?'), 'harry potter');
  assert.equal(imageQuery('How many Harry Potter are there?'), 'Harry Potter');
  assert.equal(imageQuery('Quanti Harry Potter ci sono?'), 'Harry Potter');
});


test('missing credentials return an explicitly labelled, uncached placeholder', async () => {
  const previous = process.env.SERPAPI_API_KEY;
  delete process.env.SERPAPI_API_KEY;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 503 });
  try {
    const response = await handler(new Request('https://local/gg-images?q=Harry+Potter'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Netlify-CDN-Cache-Control'), null);
    const data = await response.json();
    assert.equal(data.placeholder, true);
    assert.deepEqual(data.images, []);
  } finally {
    globalThis.fetch = realFetch;
    if (previous === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = previous;
  }
});

test('local sample image paths are no longer accepted', () => {
  for (const path of ['/images/samples/city.svg', '//example.org/photo.svg', '/other.svg']) assert.equal(safeImage(path), null);
});

test('without a Google key, real Wikimedia Commons photos are returned and labelled', async () => {
  const page = (i, mime = 'image/jpeg') => ({ index: i, title: `File:Colosseo_${i}.jpg`, imageinfo: [{ mime, thumburl: `https://upload.wikimedia.org/t${i}.jpg`, url: `https://upload.wikimedia.org/f${i}.jpg`, descriptionurl: `https://commons.wikimedia.org/wiki/File:C${i}` }] });
  const images = await findCommonsImages('Colosseo', { fetcher: async url => {
    assert.equal(url.hostname, 'commons.wikimedia.org');
    assert.match(url.searchParams.get('gsrsearch'), /Colosseo/);
    return Response.json({ query: { pages: { b: page(2), a: page(1), c: page(3, 'image/tiff') } } });
  } });
  assert.deepEqual(images.map(i => i.title), ['Colosseo 1', 'Colosseo 2']);
  assert.equal(images[0].source, 'commons.wikimedia.org');
  const previous = process.env.SERPAPI_API_KEY, realFetch = globalThis.fetch;
  delete process.env.SERPAPI_API_KEY;
  globalThis.fetch = async () => Response.json({ query: { pages: { a: page(1) } } });
  try {
    const data = await (await handler(new Request('https://local/gg-images?q=Colosseo'))).json();
    assert.equal(data.fallback, true);
    assert.equal(data.provider, 'Wikimedia Commons');
    assert.equal(data.images.length, 1);
  } finally {
    globalThis.fetch = realFetch;
    if (previous !== undefined) process.env.SERPAPI_API_KEY = previous;
  }
});


test('topic images use ranked articles in the requested language and reject unsafe URLs', async () => {
  const images = await findTopicImages('Harry Potter', 'it', { fetcher: async url => {
    assert.equal(url.hostname, 'it.wikipedia.org');
    assert.equal(url.searchParams.get('gsrsearch'), 'Harry Potter');
    assert.equal(url.searchParams.get('prop'), 'pageimages|info');
    const page = (index, source) => ({ index, title: 'Harry Potter ' + index,
      thumbnail: { source }, fullurl: 'https://it.wikipedia.org/wiki/Harry_Potter' });
    return Response.json({ query: { pages: [page(2, 'https://upload.wikimedia.org/2.jpg'),
      page(1, 'https://upload.wikimedia.org/1.jpg'), page(3, 'javascript:alert(1)')] } });
  } });
  assert.deepEqual(images.map(i => i.title), ['Harry Potter 1', 'Harry Potter 2']);
});

test('Google outages fall back to topic images rather than failing the gallery', async () => {
  const previous = process.env.SERPAPI_API_KEY, realFetch = globalThis.fetch;
  process.env.SERPAPI_API_KEY = 'test-placeholder';
  globalThis.fetch = async url => url.hostname === 'serpapi.com'
    ? new Response('', { status: 503 })
    : Response.json({ query: { pages: [{ index: 1, title: 'Saturn',
      thumbnail: { source: 'https://upload.wikimedia.org/saturn.jpg' },
      fullurl: 'https://en.wikipedia.org/wiki/Saturn' }] } });
  try {
    const data = await (await handler(new Request('https://local/gg-images?q=Saturn&lang=en'))).json();
    assert.equal(data.provider, 'Wikipedia');
    assert.equal(data.images[0].title, 'Saturn');
  } finally {
    globalThis.fetch = realFetch;
    if (previous === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = previous;
  }
});

test('fallback images reject articles and files that only partially match the subject', async () => {
  const { matchesImageSubject } = await import('../images-core.js');
  assert.equal(matchesImageSubject('Harry Potter', 'Harry Potter and the Philosopher’s Stone'), true);
  assert.equal(matchesImageSubject('Harry Potter', 'Daniel Radcliffe'), false);
  assert.equal(matchesImageSubject('Harry Potter', 'Harry Styles'), false);
  assert.equal(matchesImageSubject('Colosseo', 'File:Colosseo_Roma.jpg'), true);
  assert.equal(matchesImageSubject('Marie Curie', 'Pierre Curie'), false);
  assert.equal(matchesImageSubject('città', 'Città'), true);
  const images = await findTopicImages('Harry Potter', 'en', { fetcher: async () => Response.json({ query: { pages: [
    { index: 1, title: 'Daniel Radcliffe', thumbnail: { source: 'https://example.org/actor.jpg' }, fullurl: 'https://en.wikipedia.org/wiki/Daniel_Radcliffe' },
    { index: 2, title: 'Harry Potter', thumbnail: { source: 'https://example.org/book.jpg' }, fullurl: 'https://en.wikipedia.org/wiki/Harry_Potter' },
  ] } }) });
  assert.deepEqual(images.map(image => image.title), ['Harry Potter']);
  const commons = await findCommonsImages('Harry Potter', { fetcher: async () => Response.json({ query: { pages: {
    1: { title: 'File:Harry_Styles.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://example.org/styles.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Harry_Styles.jpg' }] },
  } } }) });
  assert.deepEqual(commons, []);
});

test('follow-up image subjects include the latest request and survive retries', async () => {
  const query = 'Tell me about Harry Potter\n\nDomanda successiva / Follow-up: show me photos of Hogwarts';
  assert.equal(imageQuery(query), 'Harry Potter Hogwarts');
  const { readFile } = await import('node:fs/promises');
  const research = await readFile(new URL('../fast-research.js', import.meta.url), 'utf8');
  assert.match(research, /\n  attachImages\(sources, query,/);
  assert.doesNotMatch(research, /if \(\!history\.length/);
});

test('unrelated fallback hits produce an uncached empty gallery', async () => {
  const previous = process.env.SERPAPI_API_KEY, realFetch = globalThis.fetch;
  delete process.env.SERPAPI_API_KEY;
  globalThis.fetch = async url => Response.json({ query: { pages: url.hostname === 'commons.wikimedia.org'
    ? { 1: { title: 'File:Unrelated.jpg', imageinfo: [{ mime: 'image/jpeg', thumburl: 'https://example.org/unrelated.jpg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Unrelated.jpg' }] } }
    : [{ index: 1, title: 'Unrelated article', thumbnail: { source: 'https://example.org/unrelated.jpg' }, fullurl: 'https://en.wikipedia.org/wiki/Unrelated' }] } });
  try {
    const response = await handler(new Request('https://local/gg-images?q=Harry+Potter&lang=en'));
    const data = await response.json();
    assert.deepEqual(data.images, []);
    assert.equal(data.placeholder, true);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  } finally {
    globalThis.fetch = realFetch;
    if (previous === undefined) delete process.env.SERPAPI_API_KEY;
    else process.env.SERPAPI_API_KEY = previous;
  }
});

test('question-style searches keep the visual subject and can match partially as a last resort', async () => {
  const { matchesImageSubject } = await import('../images-core.js');
  assert.equal(matchesImageSubject('best electric cars 2025', 'Electric car'), true);
  assert.equal(matchesImageSubject('carbonara recipe', 'Carbonara'), true);
  assert.equal(matchesImageSubject('Tesla Model Y Italy', 'Tesla Model Y'), false);
  assert.equal(matchesImageSubject('Tesla Model Y Italy', 'Tesla Model Y', { minShare: 0.5 }), true);
  assert.equal(matchesImageSubject('Tesla Model Y Italy', 'Unrelated article', { minShare: 0.5 }), false);
});
