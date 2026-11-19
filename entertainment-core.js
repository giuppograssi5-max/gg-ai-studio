// Live catalog lookup. No title catalog is stored by the application.
function https(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : null; } catch { return null; }
}
async function read(url, fetcher) {
  const response = await fetcher(url, { signal: AbortSignal.timeout(6000), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Catalog unavailable');
  return response.json();
}
export async function imdbSearch(q, type, fetcher = fetch) {
  const data = await read('https://v3.sg.media-imdb.com/suggestion/x/' + encodeURIComponent(q.toLowerCase()) + '.json', fetcher);
  if (!Array.isArray(data.d)) throw new Error('Invalid catalog');
  return data.d.filter(r => /^tt\d+$/.test(r.id) && ['movie', 'tvSeries', 'tvMiniSeries', 'tvMovie'].includes(r.qid)).map(r => ({
    id: 'imdb-' + r.id, imdb: r.id, title: r.l, type: ['tvSeries', 'tvMiniSeries'].includes(r.qid) ? 'series' : 'movie',
    year: String(r.y || ''), image: https(r.i?.imageUrl), summary: '', cast: r.s || '', genre: '', source: 'IMDb',
    url: 'https://www.imdb.com/title/' + r.id + '/', trailer: 'https://www.imdb.com/title/' + r.id + '/videogallery/content_type-trailer/',
  })).filter(r => type === 'all' || r.type === type);
}
export async function seriesSearch(q, fetcher = fetch) {
  const data = await read('https://api.tvmaze.com/search/shows?q=' + encodeURIComponent(q), fetcher);
  if (!Array.isArray(data)) throw new Error('Invalid catalog');
  return data.slice(0, 12).map(({ show: r }) => ({
    id: 'tvmaze-' + r.id, imdb: r.externals?.imdb || null, title: r.name, type: 'series', year: (r.premiered || '').slice(0, 4),
    image: https(r.image?.medium), summary: (r.summary || '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').slice(0, 500),
    summarySource: 'TVmaze', summaryUrl: https(r.url), genre: (r.genres || []).join(' · '), rating: r.rating?.average, status: r.status, source: 'TVmaze', url: https(r.url),
    trailer: /^tt\d+$/.test(r.externals?.imdb || '') ? 'https://www.imdb.com/title/' + r.externals.imdb + '/videogallery/content_type-trailer/' : null,
  }));
}
export async function wikiSearch(q, fetcher = fetch) {
  const url = new URL('https://it.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({ action: 'query', format: 'json', generator: 'search', gsrsearch: q + ' film', gsrlimit: '8', prop: 'extracts|pageimages|info', exintro: '1', explaintext: '1', exchars: '500', piprop: 'thumbnail', pithumbsize: '500', inprop: 'url' });
  const data = await read(url, fetcher);
  if (data.error || !('query' in data || 'batchcomplete' in data)) throw new Error('Invalid catalog');
  return Object.values(data.query?.pages || {}).sort((a,b) => a.index-b.index).filter(r => /(?:^|\s)è un film\b/i.test(r.extract || '')).map(r => ({
    id: 'wiki-' + r.pageid, title: r.title.replace(/\s*\(film(?: \d{4})?\)$/, ''), type: 'movie', year: (r.extract.match(/\b(?:19|20)\d{2}\b/) || [''])[0],
    summarySource: 'Wikipedia', summaryUrl: https(r.fullurl), image: https(r.thumbnail?.source), summary: r.extract.slice(0, 500), genre: '', source: 'Wikipedia', url: https(r.fullurl),
  }));
}
function key(r) { return r.type + ':' + r.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '') + ':' + r.year; }
export function mergeResults(groups) {
  const results = [];
  for (const group of groups) for (const row of group) {
    const prior = results.find(r => (r.imdb && r.imdb === row.imdb) || key(r) === key(row));
    if (!prior) results.push({ ...row });
    else for (const field of ['summary', 'summarySource', 'summaryUrl', 'genre', 'image', 'rating', 'cast', 'trailer']) if (!prior[field] && row[field]) prior[field] = row[field];
  }
  return results.slice(0, 24);
}
export async function entertainmentHandler(req, fetcher = fetch) {
  const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
  if (req.method !== 'GET') return json({ error: 'Metodo non consentito.' }, 405);
  const params = new URL(req.url).searchParams, q = (params.get('q') || '').trim(), type = params.get('type') || 'all';
  if (q.length < 2 || q.length > 100 || !['all', 'movie', 'series'].includes(type)) return json({ error: 'Inserisci un titolo da 2 a 100 caratteri e un filtro valido.' }, 400);
  const jobs = [['IMDb', () => imdbSearch(q, type, fetcher)]];
  if (type !== 'movie') jobs.push(['TVmaze', () => seriesSearch(q, fetcher)]);
  if (type !== 'series') jobs.push(['Wikipedia', () => wikiSearch(q, fetcher)]);
  const settled = await Promise.allSettled(jobs.map(([, run]) => run()));
  const sources = settled.map((r, i) => ({ source: jobs[i][0], status: r.status === 'fulfilled' ? 'ok' : 'unavailable' }));
  const results = mergeResults(settled.filter(r => r.status === 'fulfilled').map(r => r.value));
  if (settled.every(r => r.status === 'rejected')) return json({ error: 'Cataloghi temporaneamente non raggiungibili. Riprova.', results, sources }, 503);
  return json({ results, sources, fetchedAt: new Date().toISOString() });
}
