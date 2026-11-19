function ggPublicFetch(input, init={}) { return fetch(input, {...init, credentials:"omit"}); }
(() => {
  const get = s => document.querySelector(s);
  const node = (tag,text,cls) => { const e=document.createElement(tag); if(text)e.textContent=text;if(cls)e.className=cls;return e; };
  const outbound = (label,url) => { const a=node('a',label);try{const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password)throw Error();a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';}catch{return node('span',label)}return a; };
  const view=node('main',null,'view hidden entertainment-view'); view.id='entertainment';
  view.innerHTML='<div class="eyebrow">GG / INTRATTENIMENTO</div><div class="ent-heading"><div><h2>Una pausa.<br>Una bella storia.</h2><p>Cerca un titolo. Scopri subito immagini, cast e trailer.</p></div><span class="ent-mark" aria-hidden="true">✳</span></div><form class="ent-search"><label for="ent-query">Quale titolo cerchi?</label><div><input id="ent-query" type="search" placeholder="Un film o una serie, per esempio Dune…" minlength="2" maxlength="100" autocomplete="off" aria-describedby="ent-search-hint" required><button type="submit">Cerca ↗</button></div><small id="ent-search-hint">La ricerca si aggiorna mentre scrivi, da due caratteri.</small></form><div class="ent-filters" aria-label="Tipo di contenuto"><button type="button" data-kind="all" aria-pressed="true">Tutto</button><button type="button" data-kind="movie" aria-pressed="false">Film</button><button type="button" data-kind="series" aria-pressed="false">Serie TV</button><button type="button" data-kind="saved" aria-pressed="false">La mia lista <span id="ent-count">0</span></button></div><div class="ent-examples" aria-label="Idee di ricerca"><span>Da dove iniziamo?</span><button type="button">Dune</button><button type="button">The Office</button><button type="button">Interstellar</button></div><p class="ent-status" role="status"></p><section class="ent-results" aria-label="Risultati intrattenimento" aria-busy="false"></section><aside class="ent-platforms"><h3>Le tue piattaforme. Un punto di partenza.</h3><p>Apri il servizio e cerca il titolo. Disponibilità, prezzi e abbonamenti dipendono dal paese e dalla piattaforma.</p><div></div></aside><p class="ent-attribution">Cataloghi aggiornati a ogni ricerca: <a href="https://www.imdb.com/" target="_blank" rel="noopener noreferrer">IMDb</a>, <a href="https://it.wikipedia.org/" target="_blank" rel="noopener noreferrer">Wikipedia</a> e <a href="https://www.tvmaze.com/" target="_blank" rel="noopener noreferrer">TVmaze</a>. Trame Wikipedia e TVmaze: <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA</a>, abbreviate. Alcuni contenuti sono in inglese. I trailer si aprono su IMDb; se assenti, puoi cercarli su YouTube. Disponibilità e riproduzione dipendono dal servizio. La tua lista è salvata solo su questo dispositivo.</p>';
  get('.main').append(view);
  const platforms=[['Netflix','https://www.netflix.com/'],['Prime Video','https://www.primevideo.com/'],['Disney+','https://www.disneyplus.com/'],['Apple TV','https://tv.apple.com/it/'],['RaiPlay','https://www.raiplay.it/']];
  platforms.forEach(([label,url])=>view.querySelector('.ent-platforms div').append(outbound(label+' ↗',url)));
  const nav=node('button',null,'nav');nav.type='button';nav.dataset.view='entertainment';nav.append(node('span','▷'),document.createTextNode(' Intrattenimento'));get('.sidebar nav').append(nav);
  let mode='all', lastResults=[], controller, sequence=0, active=false, saved=[], debounce;
  try { const items=JSON.parse(localStorage.getItem('gg-entertainment-list')||'[]'); if(Array.isArray(items))saved=items.filter(r=>r&&typeof r.id==='string'&&typeof r.title==='string'&&['movie','series'].includes(r.type)).slice(0,100); }catch{}
  const status=view.querySelector('.ent-status'), results=view.querySelector('.ent-results'), input=get('#ent-query');
  const count=()=>get('#ent-count').textContent=saved.length;count();
  function open(){active=true;document.querySelectorAll('.view').forEach(v=>v.classList.add('hidden'));view.classList.remove('hidden');document.querySelectorAll('.sidebar .nav').forEach(n=>n.classList.toggle('active',n===nav));get('#viewtitle').textContent='Intrattenimento';input.focus();}
  nav.addEventListener('click',open);
  document.querySelectorAll('.sidebar .nav,#newchat,#topplans,#upgrade,.logo').forEach(b=>{if(b!==nav)b.addEventListener('click',()=>{active=false;view.classList.add('hidden')})});
  const shortcut=node('button','▷ Film e serie TV');shortcut.type='button';shortcut.addEventListener('click',open);get('.research-shortcuts')?.append(shortcut);
  const select=get('#creationmode'), option=node('option','▷ Intrattenimento');option.value='entertainment';select?.append(option);
  function paint(items){
    results.replaceChildren();count();
    for(const r of items){
      const card=node('article',null,'ent-card'),top=node('div',null,'ent-card-top');
      const artwork=node('div',null,'ent-artwork');
      const placeholder=node('span','Locandina non disponibile','ent-no-image');artwork.append(placeholder);
      try {const url=new URL(r.image);if(url.protocol==='https:'&&!url.username&&!url.password){const img=node('img');img.src=url.href;img.alt='Locandina di '+r.title;img.loading='lazy';img.decoding='async';img.onload=()=>placeholder.remove();img.onerror=()=>img.remove();artwork.append(img)}}catch{}
      card.append(artwork);
      top.append(node('span',r.type==='movie'?'FILM':'SERIE TV'),node('span',r.year||'Anno non indicato'));card.append(top,node('h3',r.title),node('p',r.genre||'Da scoprire','ent-genre'));
      if(r.cast)card.append(node('p',r.cast,'ent-cast'));
      card.append(node('p',r.summary?(r.summary+(r.summary.length>=500?'…':'')):'Trama non disponibile.','ent-summary'));
      const actions=node('div',null,'ent-card-actions');actions.append(outbound('Scheda '+r.source+' ↗',r.url),outbound('Cerca trailer ↗','https://www.youtube.com/results?'+new URLSearchParams({search_query:r.title+' '+(r.year||'')+' official trailer'})));
      if(r.trailer)actions.prepend(outbound('Trailer su IMDb ↗',r.trailer));
      if(r.summary&&r.summaryUrl)actions.append(outbound('Trama: '+r.summarySource+' ↗',r.summaryUrl));
      const find=node('details'),summary=node('summary','Cerca sulle piattaforme');find.append(summary);const links=node('div',null,'ent-provider-links');
      links.append(outbound('Netflix ↗','https://www.netflix.com/search?'+new URLSearchParams({q:r.title})),outbound('Prime Video ↗','https://www.primevideo.com/search/ref=atv_nb_sr?'+new URLSearchParams({phrase:r.title})),outbound('Disney+ · apri ricerca ↗','https://www.disneyplus.com/it-it/search'));
      find.append(links,node('small','Collegamenti di ricerca: disponibilità non verificata. Può essere necessario accedere.'));
      const save=node('button',saved.some(s=>s.id===r.id)?'✓ Nella mia lista':'＋ La mia lista','ent-save');save.type='button';save.setAttribute('aria-pressed',String(saved.some(s=>s.id===r.id)));save.setAttribute('aria-label','Salva o rimuovi '+r.title+' dalla mia lista');
      save.onclick=()=>{const next=saved.some(s=>s.id===r.id)?saved.filter(s=>s.id!==r.id):[r,...saved].slice(0,100);try{localStorage.setItem('gg-entertainment-list',JSON.stringify(next));saved=next;paint(mode==='saved'?saved:lastResults);if(mode==='saved')status.textContent=saved.length?saved.length+' titoli nella tua lista.':'La tua lista è vuota. Cerca un titolo e aggiungilo qui.';}catch{status.textContent='Non posso salvare la lista su questo dispositivo.'}};
      card.append(actions,find,save);results.append(card);
    }
  }
  async function search(){
    clearTimeout(debounce);
    if(mode==='saved'){lastResults=[];paint(saved);status.textContent=saved.length?saved.length+' titoli nella tua lista.':'La tua lista è vuota. Cerca un titolo e aggiungilo qui.';return}
    const q=input.value.trim();if(q.length<2){status.textContent='Scrivi almeno due caratteri del titolo.';return}
    controller?.abort();const current=new AbortController();controller=current;const run=++sequence;const timer=setTimeout(()=>current.abort(),16000);
    results.replaceChildren();results.setAttribute('aria-busy','true');status.textContent='Cerco nei cataloghi aggiornati…';
    for(let i=0;i<3;i++){const skeleton=node('div',null,'ent-skeleton');skeleton.setAttribute('aria-hidden','true');results.append(skeleton)}
    try{const response=await ggPublicFetch('/gg-entertainment?'+new URLSearchParams({q,type:mode}),{signal:current.signal,cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Ricerca non disponibile.');if(run!==sequence)return;lastResults=Array.isArray(data.results)?data.results:[];paint(lastResults);const unavailable=(data.sources||[]).filter(s=>s.status==='unavailable').map(s=>s.source);status.textContent=(lastResults.length?lastResults.length+' risultati per “'+q+'”.':'Nessun titolo trovato per “'+q+'”. Prova anche il titolo originale.')+(lastResults.length&&data.fetchedAt?' Aggiornato alle '+new Date(data.fetchedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+'.':'')+(unavailable.length?' Catalogo '+unavailable.join(', ')+' temporaneamente non disponibile. Puoi riprovare.':'');}
    catch(e){if(run!==sequence)return;results.replaceChildren();status.textContent=e.name==='AbortError'?'La ricerca ha impiegato troppo tempo. Riprova.':'Cataloghi non raggiungibili. Riprova o apri una piattaforma qui sotto.';}
    finally{clearTimeout(timer);if(run===sequence)results.setAttribute('aria-busy','false');}
  }
  function setMode(value){clearTimeout(debounce);controller?.abort();sequence++;results.setAttribute('aria-busy','false');mode=value;view.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===mode)));if(mode==='saved'||input.value.trim().length>=2)search();else{results.replaceChildren();status.textContent='Cerca un titolo per esplorare il catalogo.'}}
  function queueSearch(e){
    clearTimeout(debounce);controller?.abort();sequence++;results.setAttribute('aria-busy','false');
    if(mode==='saved'){mode='all';view.querySelectorAll('[data-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.kind===mode)))}
    results.replaceChildren();
    if(input.value.trim().length<2){status.textContent='Scrivi almeno due caratteri del titolo.';return}
    status.textContent='Ricerca in corso…';
    if(!e?.isComposing)debounce=setTimeout(search,300);
  }
  input.addEventListener('input',queueSearch);
  input.addEventListener('compositionend',queueSearch);
  view.querySelectorAll('[data-kind]').forEach(b=>b.onclick=()=>setMode(b.dataset.kind));
  view.querySelector('.ent-search').onsubmit=e=>{e.preventDefault();if(mode==='saved')setMode('all');else search()};
  view.querySelectorAll('.ent-examples button').forEach(b=>b.onclick=()=>{input.value=b.textContent;if(mode==='saved')setMode('all');else search()});
  document.addEventListener('submit',e=>{if(e.target.id!=='chatform')return;const text=get('#prompt').value.trim();const explicit=select?.value==='entertainment';if(!explicit&&!(select?.value==='auto'&&/\b(film|serie tv|serie televisiv[ae]|trailer|intrattenimento)\b/i.test(text)))return;e.preventDefault();e.stopImmediatePropagation();open();input.value=text.replace(/^(?:cerca|trova|mostrami|vorrei vedere|voglio vedere|cerco)\s+/i,'').replace(/^(?:un |una |il |la )?(?:film|serie tv|serie televisiva|trailer)(?:\s+(?:di|per))?\s*/i,'').trim();get('#prompt').value='';const kind=/\bserie\b/i.test(text)?'series':/\bfilm\b/i.test(text)?'movie':'all';setMode(kind);},true);
})();
