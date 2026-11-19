// Enhance the existing composer without replacing its submission handlers.
(() => {
  const init = () => {
    const bar = document.querySelector('.composer-bottom');
    const input = document.querySelector('#prompt');
    const mode = document.querySelector('#creationmode');
    if (!bar || !input || !mode) return;
    const make = (tag, text, cls) => {
      const el = document.createElement(tag);
      if (text) el.textContent = text;
      if (cls) el.className = cls;
      return el;
    };
    const status = make('p', '', 'composer-status');
    status.setAttribute('role', 'status');
    bar.after(status);
    const announce = text => { status.textContent = text; };
    const group = make('div', '', 'composer-tools');
    const toggle = make('button', '+', 'tools-toggle');
    toggle.type = 'button';
    toggle.setAttribute('aria-label', 'Aggiungi file o scegli uno strumento');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'composer-tool-panel');
    const panel = make('div', '', 'composer-tool-panel');
    panel.id = 'composer-tool-panel';
    panel.hidden = true;
    panel.setAttribute('role', 'group');
    panel.setAttribute('aria-label', 'Strumenti della chat');
    const close = (focus = false) => {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (focus) toggle.focus();
    };
    const action = (label, detail, callback) => {
      const button = make('button');
      button.type = 'button';
      button.append(make('strong', label), make('small', detail));
      button.onclick = () => { close(); callback(); };
      panel.append(button);
    };
    const file = make('input');
    file.type = 'file'; file.accept = '.txt,text/plain'; file.hidden = true;
    file.setAttribute('aria-label', 'Importa un file di testo');
    action('Importa testo', 'File .txt · aggiunto al messaggio prima di inviarlo', () => file.click());
    file.onchange = async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      try {
        if (!/\.txt$/i.test(selected.name)) throw Error('Seleziona un file .txt. PDF e immagini non sono supportati.');
        if (selected.size > 64000) throw Error('File troppo grande. Seleziona un testo più breve.');
        const text = await selected.text();
        if (text.includes('\u0000')) throw Error('Il file non contiene testo leggibile.');
        const combined = [input.value, text].filter(Boolean).join('\n\n');
        if (combined.length > input.maxLength) throw Error(`Il messaggio supera ${input.maxLength} caratteri. Riduci il testo e riprova.`);
        input.value = combined;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        announce(`Testo importato da ${selected.name}. Controllalo prima di inviarlo.`);
        input.focus();
      } catch (error) { announce(error.message); }
      finally { file.value = ''; }
    };
    panel.append(make('p', 'Scegli come lavorare', 'tools-caption'));
    const descriptions = {
      auto: ['Automatico', 'Conversazione AI e strumenti'],
      chat: ['Chat', 'Conversazioni e domande successive'],
      deep: ['Ricerca approfondita', 'Confronta fonti e prepara un rapporto'],
      image: ['Crea un’immagine', 'Genera o modifica immagini'],
      search: ['Cerca sul web', 'Ricerca e fonti disponibili'],
      content: ['Scrivi contenuti', 'Post, email e descrizioni'],
      website: ['Crea un sito', 'Prepara una pagina web'],
      document: ['Documenti', 'Compila un documento'],
      presentation: ['Presentazioni', 'Prepara un PowerPoint'],
      text: ['Scrivi un testo', 'Apri lo strumento di scrittura'],
      weather: ['Meteo', 'Previsioni per una località'],
      news: ['Notizie', 'Cerca aggiornamenti'],
      career: ['Lavoro e CV', 'Offerte e candidature'],
      'gg-video': ['Create video · Crea video', 'Clip brief, rendering status and storyboard export'],
      media: ['Foto e video con AI', 'Modifica foto e video, anche lunghi']
    };
    if (![...mode.options].some(o => o.value === 'gg-video')) { const option = make('option', 'Create video'); option.value = 'gg-video'; mode.append(option); }
    for (const option of mode.options) {
      const [label, detail] = descriptions[option.value] || [option.textContent, 'Apri questa modalità'];
      action(label, detail, () => {
        mode.value = option.value;
        mode.dispatchEvent(new Event('change', { bubbles: true }));
        announce(`Strumento: ${label}.`);
        if (option.value !== 'career') input.focus();
      });
    }
    group.append(toggle, panel, file);
    bar.prepend(group);
    toggle.onclick = () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) panel.querySelector('button').focus();
    };
    document.addEventListener('click', event => { if (!group.contains(event.target)) close(); });
    group.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); close(true); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && !panel.hidden) {
        event.preventDefault();
        const buttons = [...panel.querySelectorAll('button')];
        const current = buttons.indexOf(document.activeElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next].focus();
      }
    });
    group.addEventListener('focusout', event => { if (!group.contains(event.relatedTarget)) close(); });
    const mic = make('button', '', 'composer-mic');
    mic.type = 'button';
    mic.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg>';
    mic.setAttribute('aria-label', 'Detta un messaggio');
    mic.setAttribute('aria-pressed', 'false');
    mic.title = 'Detta un messaggio';
    bar.insertBefore(mic, bar.querySelector('button[type="submit"]'));
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition, listening = false;
    if (!Speech) {
      mic.setAttribute('aria-disabled', 'true');
      mic.title = 'Dettatura non supportata da questo browser';
      mic.onclick = () => announce('Questo browser non supporta la dettatura. Puoi scrivere il messaggio o usare la dettatura della tastiera.');
    } else {
      recognition = new Speech();
      recognition.interimResults = false;
      recognition.continuous = false;
      recognition.onstart = () => {
        listening = true; mic.setAttribute('aria-pressed', 'true');
        mic.setAttribute('aria-label', 'Interrompi dettatura');
        announce('In ascolto… premi di nuovo il microfono per interrompere.');
      };
      recognition.onresult = event => {
        const text = event.results[0][0].transcript;
        const combined = [input.value, text].filter(Boolean).join(' ');
        if (combined.length > input.maxLength) { announce('Dettatura troppo lunga. Riduci il messaggio e riprova.'); return; }
        input.value = combined;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        announce('Dettatura aggiunta. Controlla il testo prima di inviarlo.');
        input.focus();
      };
      recognition.onerror = event => announce(event.error === 'not-allowed' ? 'Accesso al microfono negato. Controlla i permessi del browser.' : 'Dettatura non riuscita. Riprova o scrivi il messaggio.');
      recognition.onend = () => {
        listening = false; mic.setAttribute('aria-pressed', 'false');
        mic.setAttribute('aria-label', 'Detta un messaggio');
        if (status.textContent.startsWith('In ascolto')) announce('Dettatura terminata.');
      };
      mic.onclick = () => {
        if (listening) { recognition.stop(); return; }
        recognition.lang = document.documentElement.lang || navigator.language || 'it-IT';
        try { recognition.start(); } catch { announce('Microfono non disponibile. Riprova.'); }
      };
    }
    const stop = () => { recognition?.abort(); close(); };
    document.querySelector('#chatform').addEventListener('submit', stop, true);
    document.querySelector('#newchat').addEventListener('click', () => { stop(); announce(''); });
    window.addEventListener('pagehide', stop);
  };
  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once: true });
})();
