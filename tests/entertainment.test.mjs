import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entertainmentHandler, mergeResults } from '../entertainment-core.js';
const request = query => new Request('https://local/gg-entertainment?' + query);
const movie = { id: 'tt1160419', qid: 'movie', l: 'Dune', y: 2021, s: 'Cast', i: { imageUrl: 'https://m.media-amazon.com/poster.jpg' } };
const wiki = { query: { pages: { 1: { pageid: 1, index: 1, title: 'Dune (film 2021)', extract: 'Dune è un film del 2021. Trama italiana.', fullurl: 'https://it.wikipedia.org/wiki/Dune' }, 2: { pageid: 2, title: 'Dune', extract: 'Dune è un romanzo del 1965.' } } } };

test('validates request before contacting catalogs', async () => {
  const fetcher = () => { throw Error('must not fetch'); };
  for (const query of ['q=a', 'q=' + 'x'.repeat(101), 'q=dune&type=invalid']) assert.equal((await entertainmentHandler(request(query), fetcher)).status, 400);
  assert.equal((await entertainmentHandler(new Request('https://local', { method: 'POST' }), fetcher)).status, 405);
});
test('merges live film posters and trailers with Italian synopsis, excludes books', async () => {
  const response = await entertainmentHandler(request('q=Dune&type=movie'), async url => {
    assert.ok(!String(url).includes('tvmaze'));
    return Response.json(String(url).includes('imdb') ? { d: [movie, { id: 'nm123', qid: 'name', l: 'Person' }] } : wiki);
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(data.results.length, 1);
  assert.match(data.results[0].summary, /Trama italiana/);
  assert.match(data.results[0].image, /^https:/);
  assert.match(data.results[0].trailer, /tt1160419\/videogallery\/content_type-trailer/);
  assert.ok(data.fetchedAt);
});
test('preserves TV results during IMDb failure and normalizes synopsis', async () => {
  const response = await entertainmentHandler(request('q=Office&type=series'), async url => {
    if (String(url).includes('imdb')) throw Error('Unavailable');
    return Response.json([{ show: { id: 526, name: 'The Office', url: 'https://www.tvmaze.com/shows/526', genres: ['Comedy'], summary: '<p>Office &amp; friends</p>', premiered: '2005-03-24', externals: { imdb: 'tt0386676' }, image: { medium: 'javascript:bad' } } }]);
  });
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.results[0].type, 'series');
  assert.equal(data.results[0].image, null);
  assert.equal(data.results[0].summary, 'Office & friends');
  assert.equal(data.sources[0].status, 'unavailable');
});
test('distinguishes no matches from unavailable services', async () => {
  const empty = await entertainmentHandler(request('q=nomatch&type=series'), async url => Response.json(String(url).includes('imdb') ? { d: [] } : []));
  assert.equal(empty.status, 200);
  assert.deepEqual((await empty.json()).results, []);
  const failed = await entertainmentHandler(request('q=dune'), async () => { throw Error('network'); });
  assert.equal(failed.status, 503);
});
test('deduplicates by IMDb ID across different title translations, preserves remakes', () => {
  assert.equal(mergeResults([[{ title: 'A', type: 'movie', year: '2021', imdb: 'tt1' }], [{ title: 'B', type: 'movie', year: '2021', imdb: 'tt1', summary: 'Plot' }, { title: 'A', type: 'movie', year: '1984', imdb: 'tt2' }]]).length, 2);
});
