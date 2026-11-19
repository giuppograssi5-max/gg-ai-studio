function ggPublicFetch(input, init={}) { return fetch(input, {...init, credentials:"omit"}); }
import {readAIStream} from './ai-stream.js';
const q=s=>document.querySelector(s),make=(tag,text,cls)=>{const e=document.createElement(tag);if(text)e.textContent=text;if(cls)e.className=cls;return e};
const badge=make('button','AI: controllo…','ai-state');badge.type='button';q('.header-right').prepend(badge);
let statePromise,latest={available:false,configured:false};const active=new Set();
async function refresh(){statePromise=(async()=>{try{const r=await ggPublicFetch('/api/ai/status',{signal:AbortSignal.timeout(2000)});if(r.ok)latest=await r.json();else latest={available:false,configured:false}}catch{latest={available:false,configured:false}}badge.textContent=latest.configured?'AI configurata':'Collega AI';return latest})();return statePromise}
function safeLink(label,address){const a=make('a',label);try{const u=new URL(address);if(u.protocol!=='https:'||u.username||u.password)throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';return a}catch{return make('span',label)}}
function sources(response){const out=[];for(const item of response?.output||[])for(const content of item.content||[])for(const a of content.annotations||[])if(a.type==='url_citation'&&a.url&&!out.some(s=>s.url===a.url))out.push(a);return out}
async function answer(prompt,mode,container,history=[]){
  const controller=new AbortController();active.add(controller);let output='',completed=false;
  container.replaceChildren(make('span','✧ GG · AI OPENAI','author'));container.classList.add('research-message');
  const status=make('p',mode==='search'?'Cerco sul web e preparo la risposta…':'Preparo i controlli per il problema…','fast-status');status.setAttribute('role','status');
  const text=make('div',null,'ai-output'),links=make('div',null,'research-links'),stop=make('button','Interrompi');stop.type='button';stop.onclick=()=>controller.abort();container.append(status,text,links,stop);
  try{
    const r=await ggPublicFetch('/api/ai/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt,mode,history,language:window.GG_LANGUAGE?.code||'ita'}),signal:controller.signal});
    if(!r.ok){const error=await r.json();throw Error(error.error||'Risposta AI non disponibile.')}
    await readAIStream(r,event=>{
      if(event.type==='response.output_text.delta'){output+=event.delta||'';text.textContent=output;status.textContent='Risposta in corso…'}
      if(event.type==='response.web_search_call.searching')status.textContent='Consulto le fonti sul web…';
      if(event.type==='response.completed'){
        completed=true;
        const reference=sources(event.response);reference.forEach((s,i)=>links.append(safeLink('['+(i+1)+'] '+(s.title||new URL(s.url).hostname),s.url)));
        status.textContent='Risposta completata'+(reference.length?' · Fonti consultate sotto.':'.');
      }
      if(['error','response.failed','response.incomplete'].includes(event.type))throw Error(event.error?.message||'La risposta non è stata completata. Riprova.');
    },controller.signal);
    if(!completed)throw Error('La connessione si è chiusa prima di completare la risposta.');
    return output;
  }catch(e){status.textContent=controller.signal.aborted?'Risposta interrotta. Il testo mostrato può essere incompleto.':e.message;return null}
  finally{active.delete(controller);stop.remove()}
}
const settings=make('dialog',null,'ai-settings');settings.setAttribute('aria-label','Collegamento AI OpenAI');
settings.innerHTML='<button type="button" class="ai-close" aria-label="Chiudi impostazioni AI">×</button><h2>Collega l’AI a GG.</h2><p>Le risposte AI e la ricerca web usano il tuo account API OpenAI. Le richieste possono generare costi. La velocità dipende dal modello, dalla connessione e dalle fonti.</p><p><a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">Apri il tuo account API OpenAI ↗</a></p><form><label>Chiave API<input name="key" type="password" autocomplete="off" spellcheck="false" placeholder="Inserisci la tua chiave API"></label><label>Modello<input name="model" value="gpt-5.4-mini" maxlength="75" spellcheck="false"></label><label class="ai-consent"><input name="consent" type="checkbox" required>Acconsento a inviare a OpenAI il testo delle richieste AI e il contesto della conversazione e a usare il mio credito API.</label><p class="ai-limits">Massimo 20 richieste AI per avvio di GG, una alla volta. È un limite locale di richieste, non un limite di spesa in euro. Imposta i limiti anche nel tuo account API.</p><button type="submit">Salva e attiva AI</button><button type="button" class="ai-disable">Disattiva e rimuovi chiave</button></form><p class="ai-config-status" role="status"></p><p class="ai-security">La chiave viene protetta dal sistema Windows e non è inclusa nei file del sito, negli screenshot o nei riepiloghi.</p>';
document.body.append(settings);
const form=settings.querySelector('form'),configStatus=settings.querySelector('.ai-config-status');
function clearKey(){form.elements.key.value='';form.elements.consent.checked=false}
settings.querySelector('.ai-close').onclick=()=>settings.close();settings.addEventListener('close',clearKey);
badge.onclick=async()=>{const s=await(statePromise||refresh());form.hidden=!s.available;settings.querySelector('.ai-security').hidden=!s.available;configStatus.textContent=s.available?(s.configured?'AI configurata. Puoi sostituire la chiave oppure disattivarla.':'AI non ancora attiva. Inserisci una chiave solo se hai accesso API OpenAI. Questo salvataggio non esegue richieste a pagamento.'):'Il collegamento API è disponibile nella versione Windows aggiornata di GG. Nel sito rimangono disponibili le ricerche di base.';form.elements.model.value=s.model||'gpt-5.4-mini';settings.showModal()};
form.onsubmit=async e=>{e.preventDefault();const submit=form.querySelector('[type=submit]');submit.disabled=true;const key=form.elements.key.value;clearKey();try{const r=await ggPublicFetch('/api/ai/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({key,model:form.elements.model.value.trim(),consent:true})});const data=await r.json();if(!r.ok)throw Error(data.error);await refresh();configStatus.textContent='Configurazione salvata. La prima richiesta AI verificherà il collegamento al servizio.'}catch(e){configStatus.textContent=e.message}finally{submit.disabled=false}};
settings.querySelector('.ai-disable').onclick=async()=>{active.forEach(c=>c.abort());try{const r=await ggPublicFetch('/api/ai/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({disable:true})});if(!r.ok)throw Error();await refresh();clearKey();configStatus.textContent='AI disattivata e chiave rimossa dalla configurazione.'}catch{configStatus.textContent='Non è stato possibile aggiornare la configurazione.'}};
q('#newchat').addEventListener('click',()=>active.forEach(c=>c.abort()));
window.GG_AI={getStatus:()=>statePromise||refresh(),refresh,answer,configure:()=>badge.click(),cancel:()=>active.forEach(c=>c.abort())};
refresh();
