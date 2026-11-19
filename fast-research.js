import { addResearchFollowups } from './research-followups.js';
import { renderMarkdown } from './markdown.js';
import { attachImages } from './search-images.js?v=20261119-gallery-recovery';
import { readAIStream } from './ai-stream.js';
const q = s => document.querySelector(s), cache = new Map();
let current, sequence = 0;
function node(tag, text, cls) { const e = document.createElement(tag); if (text) e.textContent = text; if (cls) e.className = cls; return e; }
function sourceLink(title, url) {
  const a = node('a', title);
  try { const u = new URL(url); if (u.protocol !== 'https:' || u.username || u.password) throw Error(); a.href = u.href; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
  catch { return node('span', title); }
  return a;
}
function prepare(prompt) {
  q('.welcome').classList.add('hidden'); q('#ideas').classList.add('hidden'); q('.research-shortcuts').classList.add('hidden');
  q('.composer-wrap').before(q('#messages')); message('user', prompt).dataset.researchPrompt = prompt; q('#prompt').value = ''; q('#prompt').dispatchEvent(new Event('input', { bubbles: true }));
  const result = message('assistant', ''); result.classList.add('research-message', 'research-conversation'); return result;
}
function external(container, prompt) {
  const links = node('div', null, 'research-links');
  links.append(sourceLink('Cerca sul web ↗', 'https://www.google.com/search?q=' + encodeURIComponent(prompt)), sourceLink('DuckDuckGo ↗', 'https://duckduckgo.com/?q=' + encodeURIComponent(prompt)));
  container.append(links);
}
async function search(prompt, { history: retryHistory } = {}) {
  prompt = prompt.trim(); if (!prompt) return;
  current?.abort(); window.GG_AI?.cancel();
  const controller = new AbortController(); current = controller;
  // Every turn carries the actual conversation, including answers, without keyword guessing.
  const history = retryHistory || [...q('#messages').children].flatMap(element => {
    if (element.classList.contains('user')) return [{ role: 'user', content: (element.dataset.researchPrompt || [...element.childNodes].filter(n => !n.classList?.contains('author')).map(n => n.textContent).join('')).slice(0, 4000) }];
    const content = element.dataset.researchAnswer || element.querySelector('.assistant-output')?.textContent;
    return content ? [{ role: 'assistant', content: content.slice(0, 4000) }] : [];
  }).slice(-12);
  const query = prompt;
  const run = ++sequence, result = prepare(prompt);
  const status = node('p', 'Cerco le fonti…', 'fast-status'); status.setAttribute('role', 'status');
  const stop = node('button', 'Interrompi', 'research-stop'); stop.type = 'button'; stop.onclick = () => controller.abort();
  const body = node('div', null, 'assistant-output has-markdown fast-excerpt');
  const sources = node('details', null, 'research-source-panel'), sourceTitle = node('summary', 'Fonti'), list = node('div', null, 'research-results');
  sources.append(sourceTitle, list); sources.hidden = true;
  result.replaceChildren(node('span', 'GG', 'author'), status, stop, body, sources);
  result.setAttribute('aria-busy', 'true');
  // Images and the answer load independently; neither waits for the other.
  attachImages(sources, query, { signal: controller.signal });
  result.scrollIntoView({ behavior: 'auto', block: 'start' });
  let text = '', data, paint;
  function renderSources(items) {
    list.replaceChildren();
    for (const item of items) { const article = node('article'); article.append(sourceLink(`[${items.indexOf(item) + 1}] ${item.title}`, item.url)); list.append(article); }
    sourceTitle.textContent = `Fonti · ${items.length}`; sources.hidden = !items.length;
  }
  function renderText() { body.replaceChildren(renderMarkdown(text, data?.results)); }
  const timeout = setTimeout(() => controller.abort(), 55000);
  try {
    const key = JSON.stringify([window.GG_LANGUAGE?.wiki || 'it', query, history]);
    const hit = cache.get(key), cached = hit?.expires > Date.now();
    if (cached) data = hit.data;
    else {
      const response = await fetch('/gg-search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: query, lang: window.GG_LANGUAGE?.wiki || 'it', stream: true, history }), credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw Error('Ricerca temporaneamente non disponibile.');
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        await readAIStream(response, event => {
          if (run !== sequence || controller.signal.aborted || !result.isConnected) return;
          if (event.type === 'status') status.textContent = event.text;
          if (event.type === 'reset') { text = ''; clearTimeout(paint); paint = null; body.replaceChildren(); sources.hidden = true; }
          if (event.type === 'sources') renderSources(event.results);
          if (event.type === 'delta') { text += event.text; status.textContent = 'Scrivo la risposta…'; if (!paint) paint = setTimeout(() => { paint = null; renderText(); }, 60); }
          if (event.type === 'result') data = event.data;
          if (event.type === 'error') throw Error(event.error);
        }, controller.signal);
      } else if (response.headers.get('content-type')?.includes('application/json')) data = await response.json();
      if (!data || data.error || !Array.isArray(data.results) || typeof data.provider !== 'string') throw Error(data?.error || 'Risposta incompleta. Riprova.');
      if (cache.size >= 50) cache.delete(cache.keys().next().value);
      cache.set(key, { data, expires: Date.now() + 600000 });
    }
    if (run !== sequence || controller.signal.aborted || !result.isConnected) return;
    clearTimeout(paint); text = data.summary || data.results[0]?.description || 'Nessun risultato. Prova una ricerca più specifica.'; renderText(); renderSources(data.results);
    if (data.scope) body.before(node('p', data.scope, 'research-scope'));
    status.textContent = data.incomplete ? 'Risposta parziale · chiedi di continuare.' : cached ? 'Ricerca completata · dalla cache' : 'Ricerca completata';
    const actions = node('div', null, 'research-actions');
    const copy = node('button', 'Copia risposta'); copy.type = 'button'; copy.onclick = async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'Copiata'; } catch { copy.textContent = 'Copia non disponibile'; } };
    const retry = node('button', 'Ripeti ricerca'); retry.type = 'button'; retry.onclick = () => { cache.delete(key); search(prompt, { history }); };
    actions.append(copy, retry); result.append(actions);
    result.dataset.researchAnswer = text;
    document.dispatchEvent(new CustomEvent('gg:turn', { detail: { prompt, text, research: true } }));
    addResearchFollowups(result, { busy: () => !!current });
    q('#creationmode').value = 'auto';
    const italian = (window.GG_LANGUAGE?.wiki || 'it') === 'it';
    q('#prompt').placeholder = italian ? 'Fai una domanda di approfondimento…' : 'Ask a follow-up question…';

  } catch (error) {
    if (run !== sequence) return;
    clearTimeout(paint);
    status.textContent = controller.signal.aborted ? 'Ricerca interrotta o tempo scaduto.' : error.message;
    if (text) {
      renderText();
      result.dataset.researchAnswer = text;
      document.dispatchEvent(new CustomEvent('gg:turn', { detail: { prompt, text, research: true } }));
    }
    const retry = node('button', 'Riprova'); retry.type = 'button'; retry.onclick = () => search(prompt, { history }); result.append(retry); external(result, query);
  } finally { clearTimeout(timeout); clearTimeout(paint); stop.remove(); result.removeAttribute('aria-busy'); if (current === controller) current = null; }
}
q('#newchat').addEventListener('click', () => { current?.abort(); sequence++; q('#prompt').placeholder = 'Ask a question, research a topic, or attach a file…'; });
document.addEventListener('gg:support-started', () => { current?.abort(); sequence++; q('#prompt').placeholder = 'Ask a question, research a topic, or attach a file…'; });
document.addEventListener('gg:research', e => { if (typeof e.detail?.query === 'string') search(e.detail.query); });
document.addEventListener('submit', e => {
  if (e.target.id !== 'chatform' || q('#creationmode').value !== 'search') return;
  const prompt = q('#prompt').value.trim(); if (!prompt) return;
  // File attachments are handled by the existing multimodal assistant.
  if (document.querySelector('.attachment-list button')) return;
  e.preventDefault(); e.stopImmediatePropagation(); search(prompt.replace(/^(?:cerca|ricerca|search|find)(?: informazioni)?(?: su| for| about)?\s+/i, ''));
}, true);
export { search };
