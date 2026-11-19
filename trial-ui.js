import {createTrial,trialStatus} from './trial-core.js';
const q=s=>document.querySelector(s),key='gg-premium-demo-trial-v1';let trial=null;
try{trial=JSON.parse(localStorage.getItem(key)||'null')}catch{}
const banner=document.createElement('section');banner.className='trial-banner';banner.setAttribute('aria-label','Tre mesi di prova gratuita');
const pill=document.createElement('span');pill.className='trial-pill';pill.textContent='APP GRATUITA · 3 MESI GRATIS';
const heading=document.createElement('h3');heading.textContent='Inizia con 3 mesi di prova Premium.';
const desc=document.createElement('p');desc.textContent='Scarica GG gratuitamente. Esplora la versione demo per tre mesi, poi scegli il piano più adatto a te. Nessuna carta richiesta e nessun addebito automatico.';
const action=document.createElement('button');action.className='trial-start';
const state=document.createElement('p');state.className='trial-status';state.setAttribute('role','status');
const note=document.createElement('small');note.textContent='Prova locale della demo, valida su questo dispositivo. Abbonamenti e funzioni commerciali non ancora acquistabili.';
banner.append(pill,heading,desc,action,state,note);q('#plans .billing').before(banner);
q('#plans h2').textContent='L’app è gratuita. Scegli come usarla.';q('#plans>.section-desc').textContent='Tre mesi di prova Premium. Standard e Premium restano visibili qui, nell’app.';
q('#plans>.fineprint').textContent='Prezzi proposti per il futuro servizio. Pagamenti, limiti AI e funzioni di team non sono ancora attivi. Alla fine della prova non scatta alcun addebito.';
q('#topplans').textContent='3 mesi gratis ↗';q('#upgrade').textContent='Scopri i 3 mesi gratis ↗';q('.upgrade h3').textContent='GG gratis. Più spazio alle idee.';q('.upgrade p').textContent='Scopri Standard, Premium e la prova di tre mesi.';
const nav=q('[data-view="plans"]');nav.childNodes.forEach(n=>{if(n.nodeType===Node.TEXT_NODE&&n.textContent.trim())n.textContent=' Piani e prova gratuita'});
function refresh(){const status=trialStatus(trial);action.disabled=status!=='none';action.textContent=status==='active'?'✓ Prova demo attiva':status==='expired'?'Prova demo terminata':'Inizia i 3 mesi gratis';const date=trial?.endsAt?new Date(trial.endsAt).toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'}):'';state.textContent=status==='active'?'Iniziata il '+new Date(trial.startedAt).toLocaleDateString('it-IT')+' · Termina il '+date:status==='expired'?'La prova è terminata il '+date+'. Puoi consultare i piani; nessun addebito è stato effettuato.':'La prova parte quando premi il pulsante.';if(status==='active')q('.profile small').textContent='Prova demo fino al '+new Date(trial.endsAt).toLocaleDateString('it-IT');}
action.onclick=()=>{if(trialStatus(trial)!=='none')return;const candidate=createTrial();try{localStorage.setItem(key,JSON.stringify(candidate));trial=candidate;refresh()}catch{state.textContent='Impossibile salvare la prova su questo dispositivo. Consenti l’archiviazione locale e riprova.'}};
document.querySelectorAll('[data-plan]').forEach(b=>{b.textContent='Scopri '+b.dataset.plan+' ↗';b.onclick=()=>{q('#modalheading').textContent=b.dataset.plan;const p=q('#planmodal>p');p.textContent='GG si scarica gratuitamente e prevede tre mesi di prova. Gli abbonamenti non sono ancora acquistabili in questa versione.';q('#modaldetail').textContent='Prezzo proposto: '+(b.dataset.plan==='Standard'?q('#standardprice').textContent:q('#premiumprice').textContent)+' € al mese. Alla fine della prova nessun addebito automatico.';q('#confirmplan').textContent='Torna ai piani';q('#planmodal').showModal()}});
refresh();
