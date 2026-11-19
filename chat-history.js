import { downloadText } from './code-artifacts.js';
// Saved chats and custom instructions, similar to ChatGPT's sidebar history and "Personalize".
// Chats are stored in Netlify Database for signed-in users. Signed-out users keep the chat in this page only.
(() => {
  const q = s => document.querySelector(s);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text) n.textContent = text; if (cls) n.className = cls; return n; };
  let signedIn = false, chats = [], currentId = null, transcript = [], saving = Promise.resolve(), viewVersion = 0, sessionVersion = 0;

  const api = async (path, options = {}) => {
    const response = await fetch('/gg-chats' + path, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) { const error = Error(data.error || 'Request failed'); error.status = response.status; throw error; }
    return data;
  };

  const init = () => {
    const newchat = q('#newchat');
    if (!newchat || !window.GG_AI) return;
    const section = el('section', '', 'chat-history'); section.setAttribute('aria-label', 'Your chats');
    const search = el('input', '', 'chat-search'); search.type = 'search'; search.placeholder = 'Search chats'; search.setAttribute('aria-label', 'Search chats'); search.maxLength = 100;
    const label = el('div', 'CHATS', 'navlabel');
    const list = el('ul', '', 'chat-list');
    const note = el('p', '', 'chat-history-note');
    const personalize = el('button', '✦ Personalize GG', 'personalize-button'); personalize.type = 'button';
    section.append(search, label, list, note);
    newchat.after(section, personalize);
    const exportChat = el('button', 'Export chat', 'personalize-button'); exportChat.type = 'button';
    personalize.after(exportChat);
    exportChat.onclick = () => {
      if (!transcript.length) { note.textContent = 'Start a conversation to export it as Markdown.'; return; }
      const title = chats.find(c => c.id === currentId)?.title || transcript.find(m => m.role === 'user')?.content.slice(0, 60) || 'GG conversation';
      const text = '# ' + title.replace(/\s+/g, ' ') + '\n\n' + transcript.map(m => '## ' + (m.role === 'user' ? 'You' : 'Assistant') + '\n\n' + m.content).join('\n\n');
      downloadText(text, 'gg-conversation.md', 'text/markdown;charset=utf-8');
    };

    const dialog = el('dialog', '', 'personalize-dialog'); dialog.setAttribute('aria-labelledby', 'personalize-title');
    const form = el('form'); form.method = 'dialog';
    const title = el('h2', 'Custom instructions'); title.id = 'personalize-title';
    const help = el('p', 'What should GG know about you, and how should it reply? For example: “I run a bakery in Milan. Answer in Italian, briefly, with bullet points.”');
    const area = el('textarea'); area.maxLength = 1500; area.rows = 7; area.setAttribute('aria-label', 'Custom instructions');
    const counter = el('small', '0 / 1500', 'personalize-count');
    const formStatus = el('p', '', 'personalize-status'); formStatus.setAttribute('role', 'status');
    const actions = el('div', '', 'personalize-actions');
    const cancel = el('button', 'Cancel'); cancel.type = 'button'; cancel.onclick = () => dialog.close();
    const save = el('button', 'Save', 'primary'); save.type = 'submit';
    actions.append(cancel, save);
    form.append(title, help, area, counter, formStatus, actions); dialog.append(form); document.body.append(dialog);
    area.oninput = () => { counter.textContent = area.value.length + ' / 1500'; };
    personalize.onclick = () => {
      area.value = window.GG_AI.getInstructions(); area.oninput();
      formStatus.textContent = signedIn ? 'Saved to your account and used in every chat.' : 'Not signed in: instructions apply until you reload this page. Sign in to keep them.';
      dialog.showModal(); area.focus();
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const text = area.value.trim().slice(0, 1500);
      window.GG_AI.setInstructions(text);
      if (signedIn) {
        save.disabled = true;
        try { await api('?settings=1', { method: 'PUT', body: JSON.stringify({ instructions: text }) }); dialog.close(); }
        catch { formStatus.textContent = 'Could not save to your account. The instructions apply to this page for now.'; }
        finally { save.disabled = false; }
      } else dialog.close();
    };

    const render = () => {
      list.replaceChildren();
      if (!signedIn) {
        note.replaceChildren(document.createTextNode('Sign in to save your chats and pick up where you left off. '));
        const login = el('button', 'Sign in', 'chat-signin'); login.type = 'button'; login.onclick = () => q('.gg-login')?.click();
        note.append(login); search.hidden = true; return;
      }
      search.hidden = false;
      const term = search.value.trim().toLowerCase();
      const shown = chats.filter(c => !term || c.title.toLowerCase().includes(term));
      note.textContent = chats.length ? (shown.length ? '' : 'No chats match your search.') : 'Your saved chats appear here.';
      for (const chat of shown) {
        const item = el('li', '', 'chat-item' + (chat.id === currentId ? ' current' : ''));
        const open = el('button', chat.title, 'chat-open'); open.type = 'button'; open.title = chat.title;
        if (chat.id === currentId) open.setAttribute('aria-current', 'true');
        open.onclick = () => openChat(chat.id);
        const rename = el('button', '✎', 'chat-icon'); rename.type = 'button'; rename.setAttribute('aria-label', 'Rename ' + chat.title);
        rename.onclick = async () => {
          const name = prompt('Rename chat', chat.title);
          if (!name || !name.trim() || name.trim() === chat.title) return;
          try { const data = await api('?id=' + chat.id, { method: 'PATCH', body: JSON.stringify({ title: name }) }); chat.title = data.title; render(); }
          catch { toast('Could not rename this chat.'); }
        };
        const remove = el('button', '×', 'chat-icon'); remove.type = 'button'; remove.setAttribute('aria-label', 'Delete ' + chat.title);
        remove.onclick = async () => {
          if (!confirm('Delete “' + chat.title + '”? This cannot be undone.')) return;
          try {
            await api('?id=' + chat.id, { method: 'DELETE' });
            chats = chats.filter(c => c.id !== chat.id);
            if (chat.id === currentId) newchat.click();
            render();
          } catch { toast('Could not delete this chat.'); }
        };
        item.append(open, rename, remove); list.append(item);
      }
    };
    const toast = text => { const t = q('#toast'); if (!t) return; t.textContent = text; t.style.display = 'block'; setTimeout(() => { t.style.display = 'none'; }, 2800); };
    search.oninput = render;

    const refresh = async () => {
      const session = sessionVersion;
      try {
        const data = await api('');
        if (session !== sessionVersion) return;
        signedIn = true; chats = data.conversations || [];
        window.GG_AI.setInstructions(data.instructions || '');
      } catch (error) {
        if (session !== sessionVersion) return;
        if (error.status === 401) { signedIn = false; chats = []; }
        else { signedIn = false; note.textContent = 'Saved chats are unavailable right now.'; list.replaceChildren(); return; }
      }
      render();
    };

    async function openChat(id) {
      const version = ++viewVersion, session = sessionVersion;
      try {
        window.GG_AI.cancel();
        await saving;
        const chat = await api('?id=' + id);
        if (version !== viewVersion || session !== sessionVersion) return;
        currentId = chat.id; transcript = chat.messages || [];
        window.GG_AI.loadConversation(transcript);
        render();
        if (window.matchMedia('(max-width: 760px)').matches) q('.menu-toggle')?.click();
      } catch { if (version === viewVersion && session === sessionVersion) toast('Could not open this chat.'); }
    }

    // Saves are queued so a chat is written in order, even if New conversation is clicked right after an answer.
    const persist = () => {
      if (!signedIn || !transcript.length) return;
      if (!currentId) currentId = crypto.randomUUID();
      const id = currentId, messages = transcript.slice(-200).map(m => ({ ...m })), session = sessionVersion;
      saving = saving.then(async () => {
        if (session !== sessionVersion) return;
        try {
          const data = await api('?id=' + id, { method: 'PUT', body: JSON.stringify({ messages }) });
          if (session !== sessionVersion) return;
          const entry = chats.find(c => c.id === id) || { id, title: data.title };
          entry.updatedAt = new Date().toISOString();
          chats = [entry, ...chats.filter(c => c.id !== id)];
          render();
        } catch (error) {
          if (session !== sessionVersion) return;
          if (error.status === 401) { signedIn = false; render(); }
          else toast('This chat could not be saved.');
        }
      });
    };

    document.addEventListener('gg:turn', event => {
      const { prompt, text, replace, historyOnly } = event.detail || {};
      if (typeof prompt !== 'string' || typeof text !== 'string') return;
      if (replace && historyOnly) { const last = transcript[transcript.length - 1]; if (last?.role === 'assistant') last.content = text; }
      else {
        if (replace && transcript.length >= 2) transcript.splice(-2);
        transcript.push({ role: 'user', content: prompt.slice(0, 16000) }, { role: 'assistant', content: text.slice(0, 16000) });
      }
      persist();
    });
    document.addEventListener('gg:turn-removed', () => { if (transcript.length >= 2) { transcript.splice(-2); persist(); } });
    newchat.addEventListener('click', () => { viewVersion++; currentId = null; transcript = []; render(); });

    refresh();
    import('./identity-sdk.js').then(sdk => sdk.onAuthChange(event => {
      if (event === sdk.AUTH_EVENTS.LOGOUT) { sessionVersion++; signedIn = false; chats = []; currentId = null; transcript = []; window.GG_AI.setInstructions(''); newchat.click(); render(); }
      else if (event === sdk.AUTH_EVENTS.LOGIN) { sessionVersion++; refresh().then(persist); }
    })).catch(() => {});
  };
  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once: true });
})();
