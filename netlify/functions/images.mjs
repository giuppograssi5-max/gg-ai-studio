import Anthropic from '@anthropic-ai/sdk';
import { LANGUAGES, safeImage, imageQuery, matchesImageSubject } from '../../images-core.js';

export async function findImages(query, language, { signal, apiKey = process.env.SERPAPI_API_KEY, fetcher = fetch } = {}) {
  if (!apiKey) throw Error('Image search is not configured');
  const url = new URL('https://serpapi.com/search.json');
  url.search = new URLSearchParams({ engine: 'google_images', q: query, hl: language, safe: 'active', api_key: apiKey });
  const response = await fetcher(url, { signal });
  if (!response.ok) throw Error('Image search unavailable');
  const data = await response.json();
  if (data.error || !Array.isArray(data.images_results)) {
    if (data.search_information?.image_results_state === 'Fully empty') return [];
    throw Error('Image search unavailable');
  }
  const seen = new Set(), images = [];
  for (const result of data.images_results) {
    const src = safeImage(result.thumbnail), full = safeImage(result.original), page = safeImage(result.link);
    const key = full || src;
    if (!src || !page || seen.has(key)) continue;
    seen.add(key);
    images.push({ src, full, page, title: String(result.title || query).slice(0, 300), source: new URL(page).hostname });
    if (images.length === 8) break;
  }
  return images;
}

// Free, keyless source of real photos used until a Google Images (SerpAPI) key is configured.
export async function findCommonsImages(query, { signal, fetcher = fetch } = {}) {
  const url = new URL('https://commons.wikimedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: 'filetype:bitmap ' + query,
    gsrnamespace: '6', gsrlimit: '12', prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '400'
  });
  const response = await fetcher(url, { signal, headers: { 'User-Agent': 'gg-ai-studio-image-search/1.0', Accept: 'application/json' } });
  if (!response.ok) throw Error('Image search unavailable');
  const data = await response.json();
  const pages = Object.values(data.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0));
  const images = [];
  for (const p of pages) {
    const info = p.imageinfo?.[0];
    if (!matchesImageSubject(query, p.title)) continue;
    if (!info || !/^image\/(?:jpeg|png|webp|gif)$/.test(info.mime || '')) continue;
    const src = safeImage(info.thumburl), full = safeImage(info.url), page = safeImage(info.descriptionurl);
    if (!src || !page) continue;
    const title = String(p.title || query).replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '').replace(/_/g, ' ').slice(0, 300);
    images.push({ src, full, page, title, source: 'commons.wikimedia.org' });
    if (images.length === 8) break;
  }
  return images;
}

// Article images keep ambiguous and translated topics tied to actual search results.
export async function findTopicImages(query, language, { signal, fetcher = fetch, strict = true } = {}) {
  const url = new URL(`https://${language}.wikipedia.org/w/api.php`);
  url.search = new URLSearchParams({ action: 'query', format: 'json', formatversion: '2',
    generator: 'search', gsrsearch: query, gsrnamespace: '0', gsrlimit: '4',
    prop: 'pageimages|info', piprop: 'thumbnail|original', pithumbsize: '500', inprop: 'url' });
  const response = await fetcher(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw Error('Image search unavailable');
  const data = await response.json();
  return (Array.isArray(data.query?.pages) ? data.query.pages : [])
    .sort((a, b) => a.index - b.index)
    .filter(p => matchesImageSubject(query, p.title, { minShare: strict ? 1 : 0.5 }))
    .map(p => ({ src: safeImage(p.thumbnail?.source), full: safeImage(p.original?.source),
      page: safeImage(p.fullurl), title: String(p.title || query), source: `${language}.wikipedia.org` }))
    .filter(p => p.src && p.page);
}

function json(body, status = 200, cache = 'no-store') {
  const headers = { 'Cache-Control': cache };
  // Share successful searches at the CDN to limit provider requests.
  if (status === 200 && cache !== 'no-store') headers['Netlify-CDN-Cache-Control'] = 'public, s-maxage=86400, stale-while-revalidate=86400, durable';
  if (status === 200) headers['Netlify-Vary'] = 'query=q|lang|v';
  return Response.json(body, { status, headers });
}
export { imageQuery };
// Turn the user's words (any language) into a short English image-search phrase, so
// "gatti" means cats and not the footballer Federico Gatti.
export async function englishSubject(query, { client, signal } = {}) {
  try {
    client ||= new Anthropic();
    const message = await client.messages.create({
      model: 'claude-haiku-4-5', max_tokens: 40,
      system: 'You convert an image search request or question into the short English name of the main visual subject, i.e. what a photo of it would show. Keep proper names (people, places, brands, models, titles) unchanged. Translate common nouns to English singular. Drop question words, verbs, opinions and rankings (best, top, migliori), years and dates, and words like history, guide, how to. Never add words that the request does not contain. Reply with the subject only, no quotes, 1-4 words.',
      messages: [{ role: 'user', content: query }],
    }, { signal, timeout: 3500, maxRetries: 0 });
    const text = (message.content || []).filter(b => b.type === 'text').map(b => b.text).join(' ')
      .replace(/["'`*\n]/g, ' ').replace(/\s+/g, ' ').trim();
    return text && text.length <= 80 ? text : query;
  } catch { return query; }
}

// Openverse indexes millions of real Creative Commons photos (Flickr, museums...) by title and tags.
export async function findOpenverseImages(query, { signal, fetcher = fetch } = {}) {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.search = new URLSearchParams({ q: query, page_size: '20', mature: 'false' });
  const response = await fetcher(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw Error('Image search unavailable');
  const data = await response.json();
  const images = [];
  for (const r of Array.isArray(data.results) ? data.results : []) {
    const tags = (r.tags || []).map(t => t.name).join(' ');
    if (!matchesImageSubject(query, `${r.title || ''} ${tags}`)) continue;
    const full = safeImage(r.url), src = safeImage(r.thumbnail) || full, page = safeImage(r.foreign_landing_url);
    if (!src || !page) continue;
    images.push({ src, full, page, title: String(r.title || query).slice(0, 300), source: new URL(page).hostname,
      credit: r.creator ? `${r.creator}${r.license ? ' · CC ' + String(r.license).toUpperCase() : ''}` : undefined });
    if (images.length === 8) break;
  }
  return images;
}

function merge(groups, limit = 8) {
  const seen = new Set(), out = [];
  for (const group of groups) for (const image of group) {
    const key = (image.full || image.src).replace(/\?.*$/, '');
    if (seen.has(key)) continue;
    seen.add(key); out.push(image);
    if (out.length === limit) return out;
  }
  return out;
}

export default async function handler(req) {
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const params = new URL(req.url).searchParams;
  const raw = (params.get('q') || '').trim();
  if (!raw || raw.length > 4000) return json({ error: 'Inserisci una ricerca da 1 a 4000 caratteri.' }, 400);
  const language = LANGUAGES.includes(params.get('lang')) ? params.get('lang') : 'en';
  const query = imageQuery(raw) || raw.slice(0, 120);
  let images = [], provider = 'Google Images';
  if (process.env.SERPAPI_API_KEY) {
    try { images = await findImages(query, language, { signal: AbortSignal.timeout(3500) }); } catch {}
  }
  if (!images.length) {
    const english = await englishSubject(query, { signal: AbortSignal.timeout(4000) });
    const safe = (promise) => promise.catch(() => []);
    const [topic, openverse, commons] = await Promise.all([
      safe(findTopicImages(english, 'en', { signal: AbortSignal.timeout(4500) })),
      safe(findOpenverseImages(english, { signal: AbortSignal.timeout(6000) })),
      safe(findCommonsImages(english, { signal: AbortSignal.timeout(5000) })),
    ]);
    // Encyclopedia lead image first (exact subject), then real photos matching the search.
    images = merge([topic.slice(0, 1), openverse, commons, topic.slice(1)]);
    if (!images.length && english !== query) {
      const [localTopic, localOpenverse, localCommons] = await Promise.all([
        safe(findTopicImages(query, language, { signal: AbortSignal.timeout(4000) })),
        safe(findOpenverseImages(query, { signal: AbortSignal.timeout(5000) })),
        safe(findCommonsImages(query, { signal: AbortSignal.timeout(4000) })),
      ]);
      images = merge([localTopic.slice(0, 1), localOpenverse, localCommons, localTopic.slice(1)]);
    }
    // Last resort: top-ranked encyclopedia articles whose title names at least half of the
    // subject, so natural-language questions still get images of the topic they are about.
    if (!images.length) {
      const [enLoose, localLoose] = await Promise.all([
        safe(findTopicImages(english, 'en', { signal: AbortSignal.timeout(4000), strict: false })),
        language !== 'en' ? safe(findTopicImages(query, language, { signal: AbortSignal.timeout(4000), strict: false })) : [],
      ]);
      images = merge([enLoose.slice(0, 4), localLoose.slice(0, 4)], 6);
    }
    const label = i => /wikipedia\.org$/.test(i.source) ? 'Wikipedia' : i.source === 'commons.wikimedia.org' ? 'Wikimedia Commons' : 'Openverse';
    provider = [...new Set(images.map(label))].join(', ') || 'Wikipedia';
  }
  if (!images.length) return json({ query, provider, images: [], placeholder: true });
  return json({ query, provider, fallback: provider !== 'Google Images', images, fetchedAt: new Date().toISOString() }, 200, 'public, max-age=600');
}
export const config = { path: '/gg-images' };
