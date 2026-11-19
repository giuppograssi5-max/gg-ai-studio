const countries = {
  IT: ['italy', 'italia'], GB: ['uk', 'united kingdom'], US: ['usa', 'united states'],
  IE: ['ireland'], DE: ['germany', 'deutschland'], AT: ['austria'], CH: ['switzerland'],
  FR: ['france'], BE: ['belgium'], ES: ['spain'], PT: ['portugal'], NL: ['netherlands'],
  CA: ['canada'], AU: ['australia'], OTHER: [],
};
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const regionCodes = new Set('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' '));
const eu = new Set(['IT','IE','DE','AT','FR','BE','ES','PT','NL']);
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const clean = value => String(value || '').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Math.min(Number(n), 0x10ffff))).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/<[^>]*>/g, '').slice(0, 500);
const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const validURL = (url, host) => { try { const u = new URL(url); return u.protocol === 'https:' && u.hostname === host && u.pathname.startsWith('/jobs/'); } catch { return false; } };

export function filterJobs(jobs, { q, city = '', country = 'IT', remote = 'any' }) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  return jobs.filter(job => {
    if (!words.every(word => norm(job.title + ' ' + job.company + ' ' + (job.tags || []).join(' ')).includes(word))) return false;
    if (city && !norm(job.location).includes(norm(city))) return false;
    if (remote !== 'any' && job.arrangement !== remote) return false;
    if (country === 'OTHER') return true;
    if (job.country) return job.country === country;
    const geo = norm(job.location);
    return [...(countries[country] || []), regionNames.of(country)].some(name => new RegExp('\\b' + norm(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(geo)) || /\b(worldwide|anywhere)\b/.test(geo) || (eu.has(country) && /\b(europe|eu)\b/.test(geo));
  });
}
async function load(url, key) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error('Source unavailable');
  const data = await response.json();
  if (!Array.isArray(data[key])) throw new Error('Invalid source response');
  return data;
}
export default async request => {
  if (request.method !== 'GET') return reply({ error: 'Method not allowed' }, 405);
  const params = new URL(request.url).searchParams;
  const q = (params.get('q') || '').trim();
  const city = (params.get('city') || '').trim();
  const country = params.get('country') || 'IT';
  const remote = params.get('remote') || 'any';
  if (!q || q.length > 120 || city.length > 100 || !(regionCodes.has(country) || country === 'OTHER') || !['any','remote','hybrid','onsite'].includes(remote)) return reply({ error: 'Invalid search' }, 400);
  const page = Number(params.get('page') || 1);
  if (!Number.isInteger(page) || page < 1 || page > 20) return reply({ error: 'Invalid page' }, 400);
  if (process.env.JSEARCH_API_KEY) return searchWorldwide({ q, city, country, remote, page });
  if (page > 1) return reply({ jobs: [], total: 0, hasMore: false, limited: true });
  const results = await Promise.allSettled([
    load('https://www.arbeitnow.com/api/job-board-api', 'data'),
    load('https://jobicy.com/api/v2/remote-jobs?count=100', 'jobs'),
  ]);
  const good = results.filter(r => r.status === 'fulfilled');
  const jobs = [];
  const arbeit = results[0];
  if (arbeit.status === 'fulfilled') {
    for (const j of arbeit.value.data) {
      if (!j.title || !j.location || !validURL(j.url, 'www.arbeitnow.com')) continue;
      const hybrid = /\bhybrid\b/i.test([j.title, ...(j.job_types || [])].join(' '));
      jobs.push({ title: clean(j.title), company: clean(j.company_name), location: clean(j.location), country: 'DE', arrangement: hybrid ? 'hybrid' : j.remote === true ? 'remote' : 'unknown', url: j.url, tags: j.tags, description: cleanDescription(j.description), source: 'Arbeitnow' });
    }
  }
  const jobicy = results[1];
  if (jobicy.status === 'fulfilled') {
    for (const j of jobicy.value.jobs) {
      if (!j.jobTitle || !j.jobGeo || !validURL(j.url, 'jobicy.com')) continue;
      jobs.push({ title: clean(j.jobTitle), company: clean(j.companyName), location: clean(j.jobGeo), arrangement: 'remote', url: j.url, tags: j.jobIndustry, description: cleanDescription(j.jobDescription), source: 'Jobicy' });
    }
  }
  const matches = filterJobs([...new Map(jobs.map(j => [j.url, j])).values()], { q, city, country, remote });
  if (!matches.length) return reply({ jobs: [sampleJob({ q, city, country, remote })], total: 0, demo: true, limited: true, hasMore: false, partial: good.length < results.length });
  return reply({ jobs: matches.slice(0, 50), total: matches.length, partial: good.length < results.length, limited: true, hasMore: false });
};
export const config = { path: '/gg-career/jobs' };

function cleanDescription(value) {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').slice(0, 8000);
}
function safeLink(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; } catch { return ''; }
}
export async function searchWorldwide({ q, city, country, remote, page }) {
  const url = new URL('https://jsearch.p.rapidapi.com/search');
  url.search = new URLSearchParams({ query: q + ' in ' + [city, country === 'OTHER' ? '' : regionNames.of(country)].filter(Boolean).join(', '), page: String(page), num_pages: '1', date_posted: 'all', ...(country !== 'OTHER' ? { country: country.toLowerCase() } : {}), ...(remote === 'remote' ? { work_from_home: 'true' } : {}) });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(18000), headers: { 'X-RapidAPI-Key': process.env.JSEARCH_API_KEY, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com', accept: 'application/json' } });
    if (!response.ok) return reply({ error: response.status === 429 ? 'Job search quota reached. Please try again later.' : 'Worldwide job search is temporarily unavailable.' }, response.status === 429 ? 429 : 503);
    const data = await response.json();
    if (data.status !== 'OK' || !Array.isArray(data.data)) throw new Error('Invalid response');
    const jobs = [];
    for (const j of data.data) {
      const link = safeLink(j.job_apply_link) || safeLink(j.job_google_link);
      if (!j.job_title || !link) continue;
      // Geography is checked independently of the free-text provider query.
      if (country !== 'OTHER' && j.job_country?.toUpperCase() !== country) continue;
      const location = [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ');
      if (city && !norm(location).includes(norm(city))) continue;
      const hybrid = /\bhybrid\b/i.test(j.job_title + ' ' + (j.job_description || ''));
      const arrangement = hybrid ? 'hybrid' : j.job_is_remote === true ? 'remote' : j.job_is_remote === false ? 'onsite' : 'unknown';
      if (remote !== 'any' && arrangement !== remote) continue;
      jobs.push({ title: clean(j.job_title), company: clean(j.employer_name), location: clean(location), country: j.job_country, arrangement, url: link, description: cleanDescription(j.job_description), source: clean(j.job_publisher || 'JSearch') });
    }
    return reply({ jobs: [...new Map(jobs.map(j => [j.url, j])).values()], total: jobs.length, page, hasMore: data.data.length > 0 && page < 20, limited: false });
  } catch {
    return reply({ error: 'Worldwide job search is temporarily unavailable. Please try again.' }, 503);
  }
}

function sampleJob({ q, city, country, remote }) {
  return {
    title: q,
    company: 'Sample employer — not a real vacancy',
    location: [city, country === 'OTHER' ? 'Selected location' : regionNames.of(country)].filter(Boolean).join(', '),
    arrangement: remote === 'any' ? 'unknown' : remote,
    source: 'DEMONSTRATION ONLY',
    isDemo: true,
    description: 'SAMPLE ONLY — this is not a real vacancy. Target role: ' + q + '. Paste a real job description before preparing an actual application. Use only the candidate’s real experience.',
  };
}
