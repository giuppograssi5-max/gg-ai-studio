// Image gallery backed by Google Images search on the server.
import { safeImage, imageQuery } from './images-core.js';
const cache = new Map();
const LOOKUP = /^\s*(?:chi (?:è|e'|era|sono|erano)|cos[’']?è|che cos[’']?è|cosa (?:è|sono)|dov[’']?è|dove si trova|parlami d|informazioni su|cerca|ricerca|trova|mostrami|mostra|fammi vedere|who (?:is|was|are)|what (?:is|are)|where is|tell me about|search|find|show me|look up)(?=[\s,.:;!?]|$)/i;
const VISUAL = /\b(foto|fotografie|immagini|immagine|photos?|pictures?|images?)\b/i;
const NOT_LOOKUP = /\b(scrivi|crea|genera|traduci|riassumi|correggi|codice|programma|calcola|write|create|generate|translate|summari[sz]e|code|script|function|debug|calculate|email|lettera|letter)\b/i;

const SMALL_TALK = /^\s*(?:ciao|salve|grazie|ok(?:ay)?|sì|si|no|hi|hey|hello|thanks|thank you|buongiorno|buonasera|buonanotte|come stai|how are you|continua|continue|vai avanti|go on|perfetto|great|good|bene)\b[\s!.?,]*$/i;
const FOLLOW_UP = /^\s*(?:e |and |ma |but |perch[eé]|why|puoi |can you |could you |rispondi|riprova|try again|spiega meglio|explain more|altro|more|ancora|again)\b/i;
// Research modes always get images. In chat, any question or search about a subject gets them too
// (people, places, things, topics); writing/coding tasks, small talk and follow-ups do not.
export function wantsImages(prompt, mode, hasFiles = false) {
  if (hasFiles || !prompt || ['image', 'merge', 'support'].includes(mode)) return false;
  if (['search', 'deep', 'news'].includes(mode)) return true;
  if (VISUAL.test(prompt) || LOOKUP.test(prompt)) return true;
  if (NOT_LOOKUP.test(prompt) || SMALL_TALK.test(prompt) || FOLLOW_UP.test(prompt)) return false;
  const words = prompt.trim().split(/\s+/);
  if (words.length > 30 || /^[\d\s+\-*/^().,=x%]+$/.test(prompt)) return false;
  return /[\p{L}]{3,}/u.test(imageQuery(prompt));
}
async function fromServer(query, lang, signal) {
  // Protected sites require their access cookie on this same-site endpoint.
  const response = await fetch('/gg-images?' + new URLSearchParams({ q: query, lang, v: 'subject-8' }), { credentials: 'same-origin', signal });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw Error('Images unavailable');
  const data = await response.json();
  if (data.error || !Array.isArray(data.images)) throw Error('Images unavailable');
  return data;
}
async function load(query, lang, signal) {
  const key = 'subject-8:' + lang + ':' + query.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;
  const data = await fromServer(query, lang, signal);
  if (data.placeholder || !data.images.length) return data;
  if (cache.size >= 50) cache.delete(cache.keys().next().value);
  cache.set(key, { data, expires: Date.now() + 600000 });
  return data;
}
function el(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
function viewer(image) {
  let dialog = document.querySelector('.image-viewer');
  if (!dialog) {
    dialog = el('dialog', null, 'image-viewer'); dialog.setAttribute('aria-label', 'Anteprima immagine');
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
    document.body.append(dialog);
  }
  const close = el('button', '×', 'image-viewer-close'); close.type = 'button'; close.setAttribute('aria-label', 'Chiudi'); close.onclick = () => dialog.close();
  const img = el('img'); img.alt = image.title; img.referrerPolicy = 'no-referrer';
  // Full-size hosts can rate-limit or block hotlinks while the thumbnail still works.
  img.onerror = () => {
    img.onerror = null;
    if (img.src !== image.src) img.src = image.src;
  };
  img.src = image.full || image.src;
  const caption = el('p', image.title + (image.credit ? ' — ' + image.credit : ''));
  const link = el('a', 'Apri su ' + image.source + ' ↗'); link.href = image.page; link.target = '_blank'; link.rel = 'noopener noreferrer';
  dialog.replaceChildren(close, img, caption, link);
  if (!dialog.open) dialog.showModal();
}
// Insert a gallery placeholder now; fill it when Google results arrive.
export function attachImages(anchor, query, { signal, lang = window.GG_LANGUAGE?.wiki || 'it', position = 'after' } = {}) {
  const section = el('section', null, 'search-images is-loading'); section.setAttribute('aria-label', 'Immagini');
  const heading = el('h4', 'Immagini'); const strip = el('div', null, 'search-images-strip');
  for (let i = 0; i < 4; i++) strip.append(el('span', null, 'search-image-skeleton'));
  section.append(heading, strip);
  if (position === 'before') anchor.before(section); else if (position === 'prepend') anchor.prepend(section); else anchor.after(section);
  function showPlaceholder(message) {
    section.replaceChildren(heading);
    section.classList.remove('is-loading');
    const note = el('p', message, 'search-images-note');
    const link = el('a', 'Cerca su Google Immagini ↗');
    link.href = 'https://www.google.com/search?' + new URLSearchParams({ q: imageQuery(query) || query, udm: '2', hl: lang });
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    const retry = el('button', 'Riprova immagini'); retry.type = 'button';
    retry.onclick = () => {
      const replacement = attachImages(section, query, { signal, lang });
      section.remove();
      return replacement;
    };
    section.append(note, retry, link);
  }
  load(query, lang, signal).then(({ images, placeholder, provider }) => {
    if (signal?.aborted || !section.isConnected) return;
    if (placeholder) {
      showPlaceholder('Nessuna immagine disponibile per questa ricerca.');
      return;
    }
    const valid = images.map(i => ({ ...i, src: safeImage(i.src), full: safeImage(i.full), page: safeImage(i.page) })).filter(i => i.src && i.page);
    if (!valid.length) { showPlaceholder('Nessuna immagine disponibile per questa ricerca.'); return; }
    strip.replaceChildren();
    for (const image of valid) {
      const figure = el('figure', null, 'search-image');
      const button = el('button'); button.type = 'button'; button.title = image.title; button.setAttribute('aria-label', 'Ingrandisci: ' + image.title);
      const img = el('img'); img.src = image.src; img.alt = image.title; img.loading = strip.children.length < 2 ? 'eager' : 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      img.onerror = () => { if (image.full && img.src !== image.full) { img.src = image.full; return; } cache.delete('subject-8:' + lang + ':' + query.toLocaleLowerCase().replace(/\s+/g, ' ').trim()); figure.remove(); if (!strip.children.length) showPlaceholder('Nessuna immagine caricabile per questa ricerca.'); };
      button.append(img); button.onclick = () => viewer(image);
      const caption = el('figcaption', image.title);
      figure.append(button, caption); strip.append(figure);
    }
    section.classList.remove('is-loading');
    section.append(el('p', 'Immagini da ' + (provider || 'ricerca web') + ' · tocca per ingrandire e aprire la fonte.', 'search-images-note'));
  }).catch(() => {
    if (signal?.aborted || !section.isConnected) { section.remove(); return; }
    showPlaceholder('Immagini temporaneamente non disponibili.');
  });
  return section;
}
