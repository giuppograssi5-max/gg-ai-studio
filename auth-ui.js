import {validateAccount,authErrorCode} from './auth-core.js';

const header=document.querySelector('.header-right');
const actions=document.createElement('div');
actions.className='gg-auth-actions';
actions.innerHTML='<button type="button" class="gg-login">Accedi</button><button type="button" class="gg-signup">Registrati</button><button type="button" class="gg-account" hidden>Il mio account</button>';
header.append(actions);
const dialog=document.createElement('dialog');
dialog.id='gg-auth';
dialog.setAttribute('aria-labelledby','gg-auth-title');
dialog.innerHTML=`<button type="button" class="gg-auth-close" aria-label="Chiudi">×</button>
  <span class="gg-auth-brand">GG</span><p class="gg-auth-eyebrow">YOUR IDEAS. GOOD TO GO.</p>
  <h2 id="gg-auth-title">Crea il tuo account GG</h2>
  <p class="gg-auth-intro">Un account tuo. Un nuovo spazio per le tue idee.</p>
  <div class="gg-auth-providers"><button type="button" class="gg-google" disabled><span aria-hidden="true">G</span> Continua con Google</button><p class="gg-provider-note">Accesso gestito da Netlify Identity.</p><div class="gg-auth-divider"><span>oppure con email e password</span></div></div>
  <form class="gg-auth-form">
    <label class="gg-name-label">Come ti chiami? <span>(facoltativo)</span><input name="name" autocomplete="name" maxlength="80"></label>
    <label class="gg-email-label">Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label>
    <label class="gg-password-label">Password<div class="gg-password-wrap"><input name="password" type="password" autocomplete="new-password" maxlength="128" required><button type="button" class="gg-show-password" aria-label="Mostra password" aria-pressed="false">Mostra</button></div><small class="gg-password-help">Almeno 12 caratteri.</small></label>
    <label class="gg-confirm-label">Conferma password<input name="confirmation" type="password" autocomplete="new-password" maxlength="128" required></label>
    <p class="gg-registration-info">Registrandoti, crei un account GG. Leggi come trattiamo i tuoi dati nella <a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a>.</p>
    <button type="submit" class="gg-auth-submit" disabled>Crea account</button>
  </form>
  <p class="gg-auth-status" role="status" aria-live="polite"></p>
  <button type="button" class="gg-recover">Hai dimenticato la password?</button>
  <p class="gg-auth-switch"></p>
  <section class="gg-account-detail" hidden><p class="gg-account-name"></p><p class="gg-account-email"></p><button type="button" class="gg-signout">Esci dall’account</button></section>
  <p class="gg-auth-local">Le bozze restano in questo browser: l’account non le sincronizza. Puoi anche continuare senza registrarti.</p>`;
document.body.append(dialog);
const $=s=>dialog.querySelector(s),form=$('form');
let sdk,settings,user=null,mode='signup',busy=false,inviteToken;
const errors={email:'Inserisci un indirizzo email valido.',password:'Usa una password di almeno 12 caratteri (massimo 128).',confirmation:'Le password non coincidono.',limit:'Troppe richieste. Attendi qualche minuto e riprova.',unconfirmed:'Conferma prima l’indirizzo dal link ricevuto via email.',credentials:'Email o password non corrette.',expired:'Il link non è valido o è scaduto. Richiedine uno nuovo.',existing:'Non è possibile creare questo account. Prova ad accedere o recupera la password.',unavailable:'Non è stato possibile completare l’operazione. Controlla la connessione e riprova.'};
function status(text,error=false){$('.gg-auth-status').textContent=text;$('.gg-auth-status').classList.toggle('is-error',error)}
function locked(value){busy=value;$('.gg-auth-submit').disabled=value||!sdk||!settings;$('.gg-google').disabled=value||!sdk||!settings?.providers?.google;$('.gg-signout').disabled=value;$('.gg-auth-switch button')?.toggleAttribute('disabled',value);$('.gg-recover').disabled=value}
function renderAccount(){actions.querySelector('.gg-login').hidden=!!user;actions.querySelector('.gg-signup').hidden=!!user;const button=actions.querySelector('.gg-account');button.hidden=!user;button.textContent=user?.name||'Il mio account';$('.gg-account-name').textContent=user?.name||'Il tuo account GG';$('.gg-account-email').textContent=user?.email||''}
function screen(next){mode=next;form.reset();status('');const account=next==='account',recover=next==='recover',reset=['new-password','invite'].includes(next),signup=next==='signup';
  $('.gg-auth-providers').hidden=account||recover||reset;form.hidden=account;$('.gg-account-detail').hidden=!account;$('.gg-name-label').hidden=!signup;$('.gg-email-label').hidden=reset;form.elements.email.disabled=reset;
  $('.gg-password-label').hidden=recover;form.elements.password.disabled=recover;form.elements.password.minLength=next==='login'?1:12;form.elements.password.autocomplete=next==='login'?'current-password':'new-password';form.elements.password.type='password';$('.gg-show-password').setAttribute('aria-pressed','false');$('.gg-show-password').textContent='Mostra';
  $('.gg-confirm-label').hidden=!signup&&!reset;form.elements.confirmation.disabled=!signup&&!reset;$('.gg-password-help').hidden=next==='login';$('.gg-registration-info').hidden=!signup;
  $('.gg-recover').hidden=next!=='login';$('.gg-auth-intro').textContent=account?'Sei entrato nel tuo account GG.':recover?'Ti invieremo un link per scegliere una nuova password.':reset?'Scegli una password di almeno 12 caratteri.':'Google oppure email: scegli come entrare in GG.';
  $('#gg-auth-title').textContent=({signup:'Crea il tuo account GG',login:'Bentornato su GG',recover:'Recupera la password','new-password':'Scegli una nuova password',invite:'Completa il tuo account',account:'Il tuo account GG'})[next];
  $('.gg-auth-submit').textContent=({signup:'Crea account',login:'Accedi',recover:'Invia link di recupero','new-password':'Salva nuova password',invite:'Attiva account'})[next]||'Continua';
  const alternate=next==='signup'?'login':'signup';$('.gg-auth-switch').replaceChildren();if(!account&&!reset){const text=document.createTextNode(next==='signup'?'Hai già un account? ':'Non hai un account? '),button=document.createElement('button');button.type='button';button.textContent=next==='signup'?'Accedi':'Registrati';button.onclick=()=>screen(alternate);$('.gg-auth-switch').append(text,button)}
  locked(false);if(!sdk||!settings)status('Caricamento del servizio di accesso…');
}
function open(next){if(busy)return;screen(next);if(!dialog.open)dialog.showModal();setTimeout(()=>{if(!form.hidden)(['new-password','invite'].includes(mode)?form.elements.password:form.elements.email).focus()},0)}
actions.querySelector('.gg-login').onclick=()=>open('login');actions.querySelector('.gg-signup').onclick=()=>open('signup');actions.querySelector('.gg-account').onclick=()=>open('account');
$('.gg-auth-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{form.elements.password.value='';form.elements.confirmation.value=''});$('.gg-recover').onclick=()=>screen('recover');
$('.gg-show-password').onclick=()=>{const show=form.elements.password.type==='password';form.elements.password.type=show?'text':'password';$('.gg-show-password').textContent=show?'Nascondi':'Mostra';$('.gg-show-password').setAttribute('aria-label',show?'Nascondi password':'Mostra password');$('.gg-show-password').setAttribute('aria-pressed',String(show))};
$('.gg-google').onclick=()=>{if(!sdk||!settings?.providers?.google)return;try{sdk.oauthLogin('google')}catch(error){status(errors[authErrorCode(error)],true)}};
form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!sdk||!settings)return;const email=form.elements.email.value.trim(),password=form.elements.password.value,confirmation=form.elements.confirmation.value;const invalid=validateAccount({mode,email,password,confirmation});if(invalid){status(errors[invalid],true);return}locked(true);status('Operazione in corso…');
  try{if(mode==='signup'){await sdk.signup(email,password,{full_name:form.elements.name.value.trim()});form.reset();status('Richiesta inviata. Controlla la tua email, anche nello spam, e apri il link di conferma per completare la registrazione.');}
    else if(mode==='login'){user=await sdk.login(email,password);renderAccount();screen('account');}
    else if(mode==='recover'){await sdk.requestPasswordRecovery(email);status('Se l’indirizzo corrisponde a un account, riceverai un link di recupero. Controlla anche lo spam.');form.reset();}
    else {user=mode==='invite'?await sdk.acceptInvite(inviteToken,password):await sdk.updateUser({password});inviteToken=undefined;renderAccount();screen('account');status('Password salvata.');}
  }catch(error){status(errors[authErrorCode(error)],true)}finally{form.elements.password.value='';form.elements.confirmation.value='';locked(false)}
});
$('.gg-signout').onclick=async()=>{if(busy||!sdk)return;locked(true);try{await sdk.logout();user=null;renderAccount();screen('login');status('Hai effettuato l’uscita. Le bozze locali restano in questo browser.')}catch(error){status(errors[authErrorCode(error)],true)}finally{locked(false)}};

async function initialize(){try{
  sdk=await import('./identity-sdk.js');
  sdk.onAuthChange(async()=>{user=await sdk.getUser();renderAccount()});
  const callback=await sdk.handleAuthCallback();
  settings=await sdk.getSettings();user=await sdk.getUser();renderAccount();locked(false);
  if(callback?.type==='invite'){inviteToken=callback.token;open('invite')}
  else if(callback?.type==='recovery')open('new-password');
  else if(callback){open('account');status(callback.type==='confirmation'?'Email confermata. Benvenuto in GG.':'Accesso completato.');}
  else {
    const requested=new URL(location.href).searchParams.get('account');
    if(['login','signup','google'].includes(requested)){
      const clean=new URL(location.href);clean.searchParams.delete('account');history.replaceState(null,'',clean.pathname+clean.search+clean.hash);
      if(user)open('account');else {open(requested==='signup'?'signup':'login');if(requested==='google'&&settings.providers.google)sdk.oauthLogin('google');}
    }
  }
  if(dialog.open&&!callback)status('');
}catch(error){locked(false);status('Il servizio di accesso non è disponibile. Puoi continuare a usare GG senza account.',true)}}
initialize();
