// Shared query and URL validation for the Google Images gallery.
export const LANGUAGES = ['en', 'it', 'de', 'fr', 'es', 'pt', 'nl'];
export function safeImage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
// Turn a question ("Chi è Marie Curie?", "show me photos of the Colosseum") into a subject.
export function imageQuery(prompt) {
  const parts = String(prompt || '').split(/\n\nDomanda successiva \/ Follow-up: /);
  if (parts.length > 1) return parts.map(part => imageQuery(part)).filter(Boolean).join(' ').slice(-240);
  const q = String(prompt || '')
    .replace(/[?!.¿¡"“”«»]/g, ' ')
    .replace(/^\s*(?:(?:cerca|ricerca|trova|mostrami|mostra|fammi vedere|dimmi|search(?: for)?|find|show(?: me)?|tell me about|look up)\s+)+/i, '')
    .replace(/^\s*(?:how many|how much|quanti|quante|quanto|quanta)\s+/i, '')
    .replace(/\s+(?:(?:are |is )?there(?: are| is)?|ci sono|esistono)\s*$/i, '')
    .replace(/^\s*(?:chi (?:è|e'|era|sono|erano)|cos[’']?è|che cos[’']?è|cosa è|cosa sono|dov[’']?è|dove si trova|parlami (?:di|del|della|dei|delle)|informazioni (?:su|sul|sulla)|who (?:is|was|are|were)|what (?:is|are|was)|where is|come (?:funziona|funzionano|si fa)|how (?:does|do))\s+/i, '')
    .replace(/\b(?:foto|fotografie|immagini|immagine|photos?|pictures?|images?)\s+(?:di|del|della|dello|dei|delle|degli|of)\s+/gi, '')
    .replace(/\b(?:foto|immagini|photos|pictures|images)\b/gi, ' ')
    .replace(/^\s*(?:(?:il|lo|la|i|gli|le|un|una|the|a|an)\s+|l[’'])/i, '')
    .replace(/\s+(?:work|works)\s*$/i, '')
    .replace(/\s+/g, ' ').trim();
  return q.slice(0, 120);
}

// Fallback engines search article text and file descriptions too. Require the
// subject in the title rather than treating every ranked hit as a relevant image.
const QUERY_WORDS = new Set('of the a an in on at for to and or with about di del della dello dei delle degli da un una il lo la i gli le e con su sul sulla nel nella nei negli nelle al alla ai agli alle dal dalla come how does do is are what who which show me mostra mostrami quali quale qual sono si migliori migliore miglior best top storia history guida guide prepara preparare fare make made cook ricetta ricette recipe recipes prezzo prezzi price prices costo cost costs quanto costa'.split(' '));
function subjectWords(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
}
export function matchesImageSubject(query, title, { minShare = 1 } = {}) {
  const words = subjectWords(imageQuery(query)).filter(word => !QUERY_WORDS.has(word) && !/^(?:19|20)\d\d$/.test(word));
  const titleWords = new Set(subjectWords(title));
  const titleList = [...titleWords];
  // Accept simple inflections (cat/cats, gatto/gatti) without matching unrelated short words.
  const stem = word => word.length > 4 ? word.slice(0, -1) : word;
  const hit = word => titleWords.has(word) ||
    (word.length >= 3 && titleList.some(t => t.length >= 3 && (t.startsWith(stem(word)) && t.length - word.length <= 2 || word.startsWith(stem(t)) && word.length - t.length <= 2)));
  // minShare < 1 lets long questions match titles that name only part of the subject.
  return words.length > 0 && words.filter(hit).length >= Math.max(1, Math.ceil(words.length * minShare));
}
