// Browser voice input prepares a request; it never places an order or handles card data.
export function initShoppingVoice(section) {
  const panel = document.createElement('div');
  panel.className = 'shop-robot';
  panel.innerHTML = `<div class="shop-robot-face" aria-hidden="true"><svg viewBox="0 0 100 100" fill="none"><path d="M50 16v12M43 15h14M24 47H15v23h9m52-23h9v23h-9" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><rect x="24" y="29" width="52" height="52" rx="17" stroke="currentColor" stroke-width="4"/><circle cx="39" cy="51" r="5" fill="currentColor"/><circle cx="61" cy="51" r="5" fill="currentColor"/><path d="M39 66q11 9 22 0" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span>GG</span></div>
  <div class="shop-robot-content"><span class="shop-robot-label">IL TUO ASSISTENTE ALLA SPESA</span><h3>Tu chiedi. GG prepara.</h3><p>Premi Parla con GG e di’ «GG, ordinami 4 bottiglie di champagne Moët &amp; Chandon». Controlla la trascrizione nella chat qui sotto, poi premi Invia a GG.</p><div class="shop-voice-controls"><label>Lingua <select id="shop-voice-lang" aria-label="Lingua del comando vocale"></select></label><button type="button" id="shop-listen" aria-pressed="false">Parla con GG</button><button type="button" id="shop-speak">Leggi la lista</button><button type="button" id="shop-voice-stop">Ferma voce</button></div><p id="shop-voice-status" role="status" aria-live="polite"></p><small>Lingue e voci dipendono da browser e dispositivo. Il microfono si attiva solo premendo il pulsante; il servizio vocale del browser può elaborare l’audio online. Puoi sempre scrivere la richiesta.</small></div>`;
  section.querySelector('.shop-heading').after(panel);
  const q = s => panel.querySelector(s);
  const language = q('#shop-voice-lang');
  const names = new Intl.DisplayNames([navigator.language || 'it'], { type: 'language' });
  const codes = new Set(['it-IT','en-US','en-GB','fr-FR','de-DE','es-ES','pt-BR','pt-PT','nl-NL','pl-PL','ro-RO','el-GR','uk-UA','ru-RU','tr-TR','ar-SA','he-IL','hi-IN','bn-IN','ur-PK','zh-CN','zh-TW','ja-JP','ko-KR','id-ID','ms-MY','th-TH','vi-VN','sv-SE','da-DK','nb-NO','fi-FI','cs-CZ','sk-SK','hu-HU','bg-BG','hr-HR','sr-RS','sl-SI','lt-LT','lv-LV','et-EE','ta-IN','te-IN','sw-KE', navigator.language || 'it-IT']);
  const synth = window.speechSynthesis;
  function populate() {
    const selected = language.value || navigator.language || 'it-IT';
    for (const voice of synth?.getVoices() || []) codes.add(voice.lang);
    language.replaceChildren(...Array.from(codes).sort().map(code => {
      let label = code;
      try { label = names.of(code) || code; } catch {}
      return new Option(`${label} · ${code}`, code);
    }));
    language.value = selected;
  }
  populate();
  synth?.addEventListener('voiceschanged', populate);
  const feedback = text => { q('#shop-voice-status').textContent = text; };
  let recognition = null;
  let listening = false;
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) {
    q('#shop-listen').disabled = true;
    feedback('Dettatura non disponibile in questo browser. Scrivi la richiesta qui sotto o usa la dettatura della tastiera.');
  }
  if (!synth) { q('#shop-speak').disabled = true; q('#shop-voice-stop').disabled = true; }
  function stop() { recognition?.abort(); synth?.cancel(); }
  q('#shop-listen').onclick = () => {
    if (listening) { recognition?.stop(); return; }
    synth?.cancel();
    const input = section.querySelector('#shop-text');
    const before = input.value.trim();
    let transcript = '';
    recognition = new Speech();
    recognition.lang = language.value;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onstart = () => {
      listening = true;
      panel.classList.add('is-listening');
      q('#shop-listen').textContent = 'Termina ascolto';
      q('#shop-listen').setAttribute('aria-pressed', 'true');
      language.disabled = true;
      feedback('Ti ascolto…');
    };
    recognition.onresult = event => {
      transcript = Array.from(event.results).map(result => result[0].transcript).join(' ').slice(0, 3000);
      input.value = [before, transcript].filter(Boolean).join(', ').slice(0, 3000);
      feedback('Ho sentito: ' + transcript);
    };
    recognition.onerror = event => {
      const errors = { 'not-allowed': 'Consenti l’accesso al microfono nel browser oppure scrivi la richiesta.', 'audio-capture': 'Microfono non disponibile.', 'no-speech': 'Non ho sentito una richiesta. Premi Parla con GG per riprovare.', network: 'Servizio vocale non raggiungibile. Puoi scrivere la richiesta.', 'language-not-supported': 'Questa lingua non è supportata dal servizio vocale del browser.' };
      feedback(errors[event.error] || 'Ascolto interrotto. Puoi riprovare o scrivere la richiesta.');
    };
    recognition.onend = () => {
      listening = false;
      panel.classList.remove('is-listening');
      q('#shop-listen').textContent = 'Parla con GG';
      q('#shop-listen').setAttribute('aria-pressed', 'false');
      language.disabled = false;
      if (transcript) { input.focus(); feedback('Richiesta trascritta. Controllala e premi Invia a GG. Nessun ordine è stato effettuato.'); }
    };
    try { recognition.start(); } catch { feedback('Impossibile avviare il microfono. Riprova.'); }
  };
  q('#shop-speak').onclick = () => {
    const rows = [...section.querySelectorAll('.shop-item:not(.is-skipped)')];
    if (!rows.length) { feedback('Prepara prima una lista da leggere.'); return; }
    const voices = synth.getVoices();
    const voice = voices.find(v => v.lang.toLowerCase() === language.value.toLowerCase()) || voices.find(v => v.lang.split('-')[0] === language.value.split('-')[0]);
    if (!voice) { feedback('Nessuna voce installata per questa lingua. Scegli una lingua con una voce disponibile sul dispositivo.'); return; }
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(rows.map(row => `${row.querySelector('input[type=number]').value}, ${row.querySelector('strong').textContent}`).join('. '));
    utterance.lang = language.value;
    utterance.voice = voice;
    utterance.onstart = () => feedback('GG sta leggendo la lista.');
    utterance.onend = () => feedback('Lettura terminata. Conferma prodotti e pagamento sul portale scelto.');
    utterance.onerror = () => feedback('Lettura interrotta o non disponibile.');
    synth.speak(utterance);
  };
  q('#shop-voice-stop').onclick = () => { stop(); feedback('Voce fermata.'); };
  new MutationObserver(() => { if (section.classList.contains('hidden')) stop(); }).observe(section, { attributes: true, attributeFilter: ['class'] });
  window.addEventListener('pagehide', stop);
}
