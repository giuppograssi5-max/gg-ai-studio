import { readAIStream } from './ai-stream.js';
import { addResearchFollowups } from './research-followups.js';
import { isNewsRequest } from './news-intent.js';
import { renderMarkdown } from './markdown.js';
import { attachImages, googleImagesLink, imageSearchQuery, wantsImages } from './search-images.js?v=20261119-research-readability';
import { buildOfficeFile, describeFile, detectFileFormat, fileName, FILE_TYPES } from './office-files.js';
// Office files travel in chat history as a fenced JSON block so the AI can revise them later.
const FILE_BLOCK = /\n*```gg-file\n([\s\S]*?)\n```\s*$/;
const withoutFile = text => String(text || '').replace(FILE_BLOCK, '').trim();
function readFileBlock(text) {
  const match = FILE_BLOCK.exec(String(text || ''));
  if (!match) return null;
  try { const spec = JSON.parse(match[1]); return FILE_TYPES[spec?.format] && (Array.isArray(spec.blocks) || Array.isArray(spec.sheets) || Array.isArray(spec.slides)) ? spec : null; } catch { return null; }
}
// A download card for a generated Word, Excel or PowerPoint file.
function fileCard(spec) {
  const card = document.createElement('div'); card.className = 'office-file-card office-file-' + spec.format;
  const badge = document.createElement('span'); badge.className = 'office-file-badge'; badge.textContent = { docx: 'W', xlsx: 'X', pptx: 'P' }[spec.format]; badge.setAttribute('aria-hidden', 'true');
  const info = document.createElement('div'); info.className = 'office-file-info';
  const name = document.createElement('strong'); name.textContent = fileName(spec);
  const detail = document.createElement('small'); detail.textContent = describeFile(spec);
  info.append(name, detail);
  const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Download ' + FILE_TYPES[spec.format].label;
  const note = document.createElement('p'); note.className = 'office-file-note'; note.setAttribute('role', 'status');
  let blob;
  button.onclick = async () => {
    button.disabled = true; note.textContent = blob ? '' : 'Building your file…';
    try {
      blob ||= await buildOfficeFile(spec);
      const a = document.createElement('a'); const url = URL.createObjectURL(blob); a.href = url; a.download = fileName(spec); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      note.textContent = 'Downloaded. Check your browser downloads.';
    } catch (error) { note.textContent = error.message || 'The file could not be built. Retry.'; }
    finally { button.disabled = false; }
  };
  card.append(badge, info, button);
  const wrap = document.createElement('div'); wrap.append(card, note); return wrap;
}
// Conversation context and attachments live only in this open page.
(() => {
  const history = [];
  let files = [], active, generation = 0, lastResearchMode = null, lastFileFormat = null, customInstructions = '';
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  const q = s => document.querySelector(s);
  window.addEventListener('load', () => {
    const mode = q('#creationmode'), input = q('#prompt');
    for (const [value, label] of [['chat', 'Chat · follow-up questions'], ['deep', 'Deep research · compare sources'], ['image', 'Create an image'], ['file-docx', 'Create a Word file (.docx)'], ['file-xlsx', 'Create an Excel file (.xlsx)'], ['file-pptx', 'Create a PowerPoint file (.pptx)']]) {
      const option = el('option', label); option.value = value; mode.append(option);
    }
    mode.options[0].textContent = 'Auto · AI conversation';
    const toolbar = el('div', '', 'assistant-toolbar');
    const picker = el('input'); picker.type = 'file'; picker.multiple = true; picker.hidden = true;
    picker.accept = '.txt,.md,.csv,.json,.js,.jsx,.ts,.tsx,.py,.html,.css,.yaml,.yml,.log,.sql,.xml,.sh,.pdf,.png,.jpg,.jpeg,.webp';
    const attach = el('button', 'Attach files'), voice = el('button', 'Read replies: off');
    attach.type = voice.type = 'button';
    const status = el('p', '', 'assistant-status'); status.setAttribute('role', 'status');
    // AI model switch: Claude (Anthropic) or ChatGPT (OpenAI). The choice is kept in this browser.
    const providerNames = { claude: 'Claude', chatgpt: 'ChatGPT' };
    // 'both' (Compare) asks Claude and ChatGPT together, a multi-model feature a single-model chat cannot offer.
    const switchNames = { ...providerNames, both: 'Compare' };
    // The model switch buttons are hidden: GG answers with a single assistant model.
    let provider = 'claude';
    try { localStorage.removeItem('gg-ai-provider'); } catch {}
    const models = el('div', '', 'model-switch'); models.setAttribute('role', 'group'); models.setAttribute('aria-label', 'AI model');
    const modelButtons = Object.entries(switchNames).map(([value, label]) => {
      const b = el('button', label); b.type = 'button';
      b.onclick = () => { provider = value; try { localStorage.setItem('gg-ai-provider', value); } catch {} syncModels(); status.textContent = value === 'both' ? providerNames.claude + ' and ' + providerNames.chatgpt + ' both answer your next messages side by side.' : label + ' answers your next messages.'; };
      if (value === 'both') b.title = 'Ask ' + providerNames.claude + ' and ' + providerNames.chatgpt + ' at once and merge the best answer';
      models.append(b); return [value, b];
    });
    const syncModels = () => modelButtons.forEach(([value, b]) => b.setAttribute('aria-pressed', String(value === provider)));
    syncModels();
    const chips = el('div', '', 'attachment-list');
    let reading = false;
    voice.setAttribute('aria-pressed', 'false');
    voice.onclick = () => {
      if (!window.speechSynthesis) { status.textContent = 'Read aloud is unavailable in this browser.'; return; }
      reading = !reading; voice.textContent = 'Read replies: ' + (reading ? 'on' : 'off'); voice.setAttribute('aria-pressed', String(reading));
      speechSynthesis.cancel();
    };
    attach.onclick = () => picker.click();
    const renderFiles = () => {
      chips.replaceChildren();
      files.forEach((file, index) => { const remove = el('button', file.name + ' ×'); remove.type = 'button'; remove.setAttribute('aria-label', 'Remove ' + file.name); remove.onclick = () => { files.splice(index, 1); renderFiles(); }; chips.append(remove); });
    };
    const loadFiles = async selected => {
      attach.disabled = true;
      try {
        const fileGeneration = generation;
        if (files.length + selected.length > 3) throw Error('Attach up to three files.');
        if (selected.reduce((s, f) => s + f.size, 0) + files.reduce((s, f) => s + f.size, 0) > 2500000) throw Error('Files must total less than 2.5 MB.');
        const pending = [];
        for (const file of selected) {
          const extension = file.name.split('.').pop().toLowerCase();
          const type = { txt: 'text/plain', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }[extension] || (['md','csv','json','js','jsx','ts','tsx','py','html','css','yaml','yml','log','sql','xml','sh'].includes(extension) ? 'text/plain' : null);
          if (!type) throw Error('Choose text, code, CSV, PDF, PNG, JPEG or WebP files.');
          if (file.name.length > 200) throw Error('Shorten the file name to 200 characters.');
          if (type === 'text/plain' && file.size > 60000) throw Error('Text files must be under 60 KB.');
          const data = type === 'text/plain' ? await file.text() : await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file); });
          pending.push({ name: file.name, type, data, size: file.size });
        }
        if (fileGeneration !== generation) return;
        files.push(...pending); renderFiles(); status.textContent = 'Files ready. Add a question and send. Files are sent to the AI provider for analysis.';
      } catch (error) { status.textContent = error.message || 'Could not read this file.'; }
      finally { picker.value = ''; attach.disabled = false; }
    };
    picker.onchange = () => loadFiles([...picker.files]);
    const composer = q('#chatform');
    composer.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) { event.preventDefault(); composer.classList.add('file-dragover'); } });
    composer.addEventListener('dragleave', event => { if (!composer.contains(event.relatedTarget)) composer.classList.remove('file-dragover'); });
    composer.addEventListener('drop', event => { composer.classList.remove('file-dragover'); if (event.dataTransfer?.files.length) { event.preventDefault(); if (!attach.disabled) loadFiles([...event.dataTransfer.files]); } });
    input.addEventListener('paste', event => { const pasted = [...(event.clipboardData?.files || [])]; if (pasted.length) { event.preventDefault(); if (!attach.disabled) loadFiles(pasted); } });
    toolbar.append(attach, voice, picker); q('#chatform').append(toolbar, chips, status);
    q('.fineprint').textContent = 'AI can make mistakes. Check important information. Sign in to save your conversations. Attachments are used for the current request; reattach them for later questions.';
    q('.composer-bottom .subtle')?.remove();
    q('#newchat').addEventListener('click', () => { generation++; active?.abort(); history.length = 0; lastResearchMode = null; lastFileFormat = null; files = []; renderFiles(); status.textContent = ''; window.speechSynthesis?.cancel(); });
    window.addEventListener('pagehide', () => { active?.abort(); window.speechSynthesis?.cancel(); });
    async function run(payload, container, shared) {
      let controller, runId, streamed = '', paint;
      const paintStream = () => { paint = null; body.textContent = streamed; };
      if (shared) ({ controller, runId } = shared);
      else { active?.abort(); controller = new AbortController(); active = controller; runId = ++generation; }
      const body = el('div', '', 'assistant-output');
      const progress = el('p', payload.mode === 'file' ? 'Building your ' + FILE_TYPES[payload.format].label + ' file…' : payload.mode === 'deep' ? 'Comparing web sources and preparing a research report…' : payload.mode === 'image' ? 'Creating your image…' : ['news', 'search'].includes(payload.mode) ? 'Searching current sources and preparing a cited answer…' : 'Preparing an answer…'); progress.setAttribute('role', 'status');
      const stop = el('button', 'Stop'); stop.type = 'button'; stop.onclick = () => controller.abort();
      if (payload.mode === 'merge') progress.textContent = 'Merging both answers and checking where they disagree…';
      container.replaceChildren(el('span', 'GG' + (payload.mode === 'file' ? ' · ' + FILE_TYPES[payload.format].label + ' file' : payload.mode === 'image' ? ' · Image' : ''), 'author'), progress, body, stop);
      if (['search', 'deep', 'news'].includes(payload.mode)) { container.classList.add('research-conversation'); container.querySelector('.author').textContent = 'GG'; body.classList.add('fast-excerpt'); progress.classList.add('fast-status'); }
      const timer = shared ? null : setTimeout(() => controller.abort(), 115000);
      try {
        const response = await fetch('/gg-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream, application/json' }, body: JSON.stringify(payload), signal: controller.signal });
        let data;
        if (response.headers.get('content-type')?.includes('text/event-stream')) {
          await readAIStream(response, event => {
            if (controller.signal.aborted || runId !== generation) return;
            if (event.type === 'delta') { streamed += event.text || ''; body.textContent = streamed; if (!paint) paint = setTimeout(paintStream, 60); progress.textContent = 'Writing…'; }
            if (event.type === 'result') data = event.data;
            if (event.type === 'error') throw Error(event.error);
          }, controller.signal);
          if (!data) throw Error('The connection closed before the answer finished. Retry.');
        } else data = await response.json().catch(() => { throw Error('The assistant returned an unreadable response. Retry.'); });
        if (!response.ok || data.error) throw Error(data.error || 'Request failed.');
        if (controller.signal.aborted || runId !== generation) return null;
        clearTimeout(paint);
        const answerText = data.text || '';
        body.classList.add('has-markdown');
        body.replaceChildren(renderMarkdown(answerText, data.sources));
        if (data.scope) body.append(el('p', data.scope, 'research-scope'));
        const sources = el('details', '', 'research-source-panel');
        sources.append(el('summary', `Sources · ${(data.sources || []).length}`));
        for (const [index, source] of (data.sources || []).entries()) {
          try { const url = new URL(source.url); if (url.protocol !== 'https:' || url.username || url.password) continue;
            const link = el('a', `[${index + 1}] ${source.title}`); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link);
          } catch {}
        }
        if (data.sources?.length) body.append(sources);
        if (!shared && wantsImages(payload.prompt, payload.mode, payload.files?.length)) attachImages(body, payload.prompt, { signal: controller.signal });
        if (data.image && /^image\/(png|jpeg|webp)$/.test(data.image.mimeType) && /^[A-Za-z0-9+/]+={0,2}$/.test(data.image.data)) {
          const image = el('img'); image.alt = payload.prompt; image.src = `data:${data.image.mimeType};base64,${data.image.data}`; body.append(image);
          const download = el('a', 'Download image'); download.href = image.src; download.download = 'gg-image.' + data.image.mimeType.split('/')[1]; body.append(download);
        }
        if (payload.mode === 'file') {
          if (!data.file || data.file.format !== payload.format) throw Error('The AI could not build this file. Retry.');
          body.append(fileCard(data.file));
          progress.textContent = data.incomplete ? 'File ready, shortened by the time limit · download it below.' : 'File ready · download it below.';
          return (answerText + '\n\n```gg-file\n' + JSON.stringify(data.file) + '\n```').slice(0, 16000);
        }
        progress.textContent = data.incomplete ? 'Partial answer. Ask “continue” for more.' : data.researched ? 'Research complete · sources below the answer.' : 'Complete';
        if (reading && data.text && !shared) { speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(data.text); utterance.lang = document.documentElement.lang || navigator.language; speechSynthesis.speak(utterance); }
        if (['search', 'deep', 'news'].includes(payload.mode) && data.text) addResearchFollowups(container, { mode: payload.mode });
        return data.text || '[Generated image]';
      } catch (error) {
        if (runId !== generation) return null;
        progress.textContent = controller.signal.aborted ? 'Stopped. You can ask to continue or try again.' : error.message;
        if (streamed) { body.replaceChildren(renderMarkdown(streamed)); body.classList.add('has-markdown'); return streamed; }
        if (!shared) { const retry = el('button', 'Retry', 'turn-latest'); retry.type = 'button'; retry.onclick = async () => { if (active && !active.signal.aborted) return; const text = await run(payload, container); if (text) container.ggRetryComplete?.(text); }; container.append(retry); }
        if (['deep', 'search', 'news'].includes(payload.mode)) { const fallback = el('button', 'Try basic web search'); fallback.type = 'button'; fallback.onclick = () => document.dispatchEvent(new CustomEvent('gg:research', { detail: { query: payload.prompt } })); container.append(fallback); }
        return null;
      } finally { clearTimeout(paint); clearTimeout(timer); stop.remove(); if (!shared && active === controller) active = null; }
    }
    // Compare: same question to both models in parallel, shown side by side, with an optional merge step.
    async function runCompare(payload, container) {
      active?.abort(); const controller = new AbortController(); active = controller; const runId = ++generation;
      const timer = setTimeout(() => controller.abort(), 115000);
      const grid = el('div', '', 'compare-grid'), actions = el('div', '', 'compare-actions'), merged = el('div', '', 'compare-merged');
      const panes = ['claude', 'chatgpt'].map(p => { const pane = el('div', '', 'compare-pane'); grid.append(pane); return [p, pane]; });
      const stopAll = el('button', 'Stop both'); stopAll.type = 'button'; stopAll.onclick = () => controller.abort(); actions.append(stopAll);
      container.replaceChildren(el('span', 'GG · ' + providerNames.claude.toUpperCase() + ' vs ' + providerNames.chatgpt.toUpperCase() + ' · ' + payload.mode.toUpperCase(), 'author'), grid, actions, merged);
      if (wantsImages(payload.prompt, payload.mode, payload.files?.length)) attachImages(grid, payload.prompt, { signal: controller.signal, position: 'before' });
      let texts;
      try { texts = await Promise.all(panes.map(([p, pane]) => run({ ...payload, provider: p }, pane, { controller, runId }))); }
      finally { clearTimeout(timer); stopAll.remove(); if (active === controller) active = null; }
      if (runId !== generation) return null;
      const answers = panes.map(([p], i) => ({ provider: p, text: texts[i] })).filter(a => a.text);
      if (answers.length < 2) return answers[0]?.text || null;
      const clean = t => t.replace(/\s?\[\d+\]/g, '').slice(0, 16000);
      let summary = answers.map(a => providerNames[a.provider] + ' answered:\n' + clean(a.text)).join('\n\n').slice(0, 16000);
      const mergeWith = (p, label) => { const b = el('button', label); b.type = 'button'; b.onclick = async () => {
        actions.querySelectorAll('button').forEach(x => x.disabled = true);
        if (active && !active.signal.aborted) { actions.querySelectorAll('button').forEach(x => x.disabled = false); return; }
        let text;
        try { text = await run({ prompt: payload.prompt, provider: p, mode: 'merge', history: [], files: [], answers: answers.map(a => ({ provider: a.provider, text: clean(a.text) })), instructions: customInstructions }, merged); }
        finally { actions.querySelectorAll('button').forEach(x => x.disabled = false); }
        if (text) { const last = history[history.length - 1]; if (last?.content === summary) { last.content = text.slice(0, 16000); summary = last.content; document.dispatchEvent(new CustomEvent('gg:turn', { detail: { prompt: payload.prompt, text: summary, replace: true, historyOnly: true } })); } if (reading) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = document.documentElement.lang || navigator.language; speechSynthesis.speak(u); } }
      }; return b; };
      const copy = el('button', 'Copy both'); copy.type = 'button';
      copy.onclick = async () => { try { await navigator.clipboard.writeText(answers.map(a => providerNames[a.provider] + ':\n' + a.text).join('\n\n')); status.textContent = 'Both answers copied.'; } catch { status.textContent = 'Copy is unavailable in this browser.'; } };
      actions.append(mergeWith('claude', 'Merge best answer (' + providerNames.claude + ')'), mergeWith('chatgpt', 'Merge best answer (' + providerNames.chatgpt + ')'), copy);
      return summary;
    }
    // Keep research from the streaming view available when the user returns to chat.
    document.addEventListener('gg:turn', event => {
      if (!event.detail?.research) return;
      history.push({ role: 'user', content: event.detail.prompt }, { role: 'assistant', content: event.detail.text.slice(0, 16000) });
      if (history.length > 16) history.splice(0, history.length - 16);
      lastResearchMode = 'search';
    });
    function remember(payload, text, replace = false) { if (replace && history.length >= 2) history.splice(-2); document.dispatchEvent(new CustomEvent('gg:turn', { detail: { prompt: payload.prompt, text: text.slice(0, 16000), replace } })); lastResearchMode = ['news', 'search', 'deep'].includes(payload.mode) ? payload.mode : null; lastFileFormat = payload.mode === 'file' ? payload.format : null; history.push({ role: 'user', content: payload.prompt }, { role: 'assistant', content: text.slice(0, 16000) }); if (history.length > 16) history.splice(0, history.length - 16); }
    const speak = text => { if (!window.speechSynthesis) { status.textContent = 'Read aloud is unavailable in this browser.'; return; } speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text.replace(/\s?\[\d+\]/g, '')); u.lang = document.documentElement.lang || navigator.language; speechSynthesis.speak(u); };
    function addCopy(container, text) {
      text = withoutFile(text);
      const bar = el('div', '', 'message-actions');
      const copy = el('button', 'Copy'); copy.type = 'button';
      copy.onclick = async () => { try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; setTimeout(() => { copy.textContent = 'Copy'; }, 1800); } catch { status.textContent = 'Copy is unavailable in this browser.'; } };
      const listen = el('button', 'Read aloud'); listen.type = 'button'; listen.onclick = () => speak(text);
      bar.append(copy, listen); container.append(bar); return bar;
    }
    // ChatGPT-style actions: copy and read any answer; regenerate the latest answer or edit the latest question.
    function addTurnActions(userBubble, container, payload, ask, text) {
      container.ggRetryComplete = again => { remember(payload, again, true); addTurnActions(userBubble, container, payload, ask, again); };
      const bar = addCopy(container, text);
      const regenerate = el('button', 'Regenerate', 'turn-latest'); regenerate.type = 'button';
      regenerate.onclick = async () => {
        if (active && !active.signal.aborted) return;
        bar.remove();
        userBubble.querySelector('.user-edit')?.remove();
        const again = await ask();
        if (again) { remember(payload, again, true); addTurnActions(userBubble, container, payload, ask, again); }
      };
      const edit = el('button', 'Edit', 'turn-latest user-edit'); edit.type = 'button';
      edit.setAttribute('aria-label', 'Edit this message and ask again');
      edit.onclick = () => {
        if (active && !active.signal.aborted) return;
        if (history.length >= 2) history.splice(-2);
        document.dispatchEvent(new CustomEvent('gg:turn-removed'));
        userBubble.remove(); container.remove();
        files = payload.files.map(f => ({ ...f, size: f.type === 'text/plain' ? new Blob([f.data]).size : Math.ceil(f.data.length * 0.75) })); renderFiles();
        mode.value = payload.mode === 'file' ? 'file-' + payload.format : ['chat', 'search', 'deep', 'image'].includes(payload.mode) ? payload.mode : 'auto';
        input.value = payload.prompt; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus();
        status.textContent = 'Edit your message and send it again.';
        if (!q('#messages').children.length) { q('.welcome').classList.remove('hidden'); q('#ideas').classList.remove('hidden'); }
      };
      bar.append(regenerate); userBubble.append(edit);
    }
    window.GG_AI = {
      getStatus: async () => ({ available: true, configured: true }),
      cancel: () => { generation++; active?.abort(); },
      answer: async (prompt, tool, container, turns = []) => run({ prompt, provider: provider === 'both' ? 'claude' : provider, mode: tool === 'search' ? 'search' : 'support', instructions: customInstructions, history: turns.slice(-16), files: [] }, container),
      setInstructions: text => { customInstructions = String(text || '').slice(0, 1500); },
      getInstructions: () => customInstructions,
      // Restore a saved chat: show every message and keep the latest turns as model context.
      loadConversation: messages => {
        generation++; active?.abort(); window.speechSynthesis?.cancel(); files = []; renderFiles(); status.textContent = ''; lastResearchMode = null; lastFileFormat = null;
        history.length = 0; history.push(...messages.slice(-16).map(m => ({ role: m.role, content: m.content.slice(0, 16000) })));
        const list = q('#messages'); list.replaceChildren();
        q('.welcome').classList.add('hidden'); q('#ideas').classList.add('hidden'); q('.research-shortcuts')?.classList.add('hidden'); q('.composer-wrap').before(list);
        let lastUser;
        for (const [index, m] of messages.entries()) {
          if (m.role === 'user') lastUser = message('user', m.content);
          else { const c = message('assistant', ''); c.classList.add('research-message'); const out = el('div', '', 'assistant-output has-markdown'); out.append(renderMarkdown(withoutFile(m.content))); const spec = readFileBlock(m.content); if (spec) out.append(fileCard(spec)); c.replaceChildren(el('span', 'GG', 'author'), out); if (index === messages.length - 1 && lastUser && messages[index - 1]?.role === 'user') {
            const payload = { prompt: messages[index - 1].content, provider: provider === 'both' ? 'claude' : provider, mode: spec ? 'file' : 'chat', ...(spec ? { format: spec.format } : {}), instructions: customInstructions, history: messages.slice(0, index - 1).slice(-16), files: [] };
            addTurnActions(lastUser, c, payload, () => run(payload, c), m.content);
          } else addCopy(c, m.content); }
        }
        list.lastElementChild?.scrollIntoView({ block: 'end' });
      },
      configure: () => { status.textContent = 'The assistant uses this site’s AI connection. No personal API key is needed.'; }
    };
    q('.demo').textContent = 'AI chat · web research · creative tools';
    input.placeholder = 'Ask a question, research a topic, or attach a file…';
    window.addEventListener('submit', async event => {
      if (event.target.id !== 'chatform') return;
      const selected = mode.value, prompt = input.value.trim();
      if (!prompt) return;
      const imageSubject = ['auto', 'chat', 'search'].includes(selected) && !files.length && !attach.disabled ? imageSearchQuery(prompt) : null;
      if (imageSubject !== null) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (active && !active.signal.aborted) { status.textContent = 'Attendi la risposta in corso o premi Stop.'; return; }
        q('.welcome').classList.add('hidden'); q('#ideas').classList.add('hidden'); q('.research-shortcuts')?.classList.add('hidden');
        q('.composer-wrap').before(q('#messages'));
        message('user', prompt);
        const result = message('assistant', ''); result.classList.add('research-message');
        const author = result.querySelector('.author'); if (author) author.textContent = 'GG · Ricerca immagini';
        if (imageSubject) {
          const lang = window.GG_LANGUAGE?.wiki || 'it';
          const link = googleImagesLink(imageSubject, lang); result.append(link);
          attachImages(link, imageSubject, { lang, showGoogle: false });
        } else result.append(el('p', 'Quale immagine vuoi cercare?'));
        input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true }));
        mode.value = 'auto'; status.textContent = ''; result.scrollIntoView({ block: 'start' });
        return;
      }
      // Plain research uses the dedicated streaming bar; attachments keep multimodal handling.
      if (selected === 'search' && !files.length && !attach.disabled) return;
      const news = isNewsRequest(prompt, selected);
      // Word, Excel and PowerPoint requests: chosen in the menu, detected in the message, or a follow-up edit of the last file.
      const followUpEdit = /\b(add|change|modify|edit|update|remove|delete|replace|rename|translate|shorter|longer|more|fewer|less|aggiungi|cambia|modifica|aggiorna|togli|rimuovi|elimina|sostituisci|rinomina|traduci|accorcia|allunga|pi[uù]|meno|ajoute|modifie|añade|ändere|füge)\b/i;
      const fileFormat = selected.startsWith('file-') ? selected.slice(5) : ['auto', 'chat'].includes(selected) ? detectFileFormat(prompt) || (lastFileFormat && prompt.length < 400 && followUpEdit.test(prompt) ? lastFileFormat : null) : null;
      if (fileFormat && !FILE_TYPES[fileFormat]) return;
      const specialized = /\b(meteo|weather|forecast|previsioni|film|trailer|serie tv)\b|che tempo (fa|farà)/i.test(prompt);
      if (!fileFormat && !files.length && !news && !['chat', 'search', 'deep', 'image', 'content'].includes(selected) && !(selected === 'auto' && !specialized)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (attach.disabled) { status.textContent = 'Wait for the files to finish loading.'; return; }
      if (active && !active.signal.aborted) { status.textContent = 'Wait for the current answer, or press Stop before sending another message.'; return; }
      if (selected === 'image' && files.some(f => !f.type.startsWith('image/'))) { status.textContent = 'Image creation accepts image attachments. Choose Chat to analyze PDFs or text.'; return; }
      const payload = { prompt, provider, ...(fileFormat ? { format: fileFormat } : {}), mode: fileFormat ? 'file' : news ? 'news' : selected === 'deep' ? 'deep' : selected === 'search' ? 'search' : selected === 'image' ? 'image' : selected === 'auto' && /\b(search|research|latest|today|current|cerca|ricerca|oggi|aggiornamenti)\b/i.test(prompt) ? 'search' : 'chat', language: window.GG_LANGUAGE?.locale || document.documentElement.lang || 'en', instructions: customInstructions, history: history.map(m => ({ ...m })), files: files.map(({ size, ...f }) => f) };
      q('.welcome').classList.add('hidden'); q('#ideas').classList.add('hidden'); q('.research-shortcuts')?.classList.add('hidden'); q('.composer-wrap').before(q('#messages'));
      q('#messages').querySelectorAll('.turn-latest').forEach(n => n.remove());
      const userBubble = message('user', prompt + (files.length ? '\n' + files.map(f => f.name).join(', ') : ''));
      const container = message('assistant', ''); container.classList.add('research-message');
      input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); files = []; renderFiles(); status.textContent = ''; container.scrollIntoView({ block: 'start', behavior: 'smooth' });
      const ask = () => payload.provider === 'both' && !['image', 'file'].includes(payload.mode) ? runCompare(payload, container) : run({ ...payload, provider: payload.provider === 'both' ? 'claude' : payload.provider }, container);
      container.ggRetryComplete = text => { remember(payload, text); addTurnActions(userBubble, container, payload, ask, text); };
      const text = await ask(); if (text) container.ggRetryComplete(text);
    }, true);
  }, { once: true });
})();
