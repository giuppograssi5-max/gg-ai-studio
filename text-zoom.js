// Zoom − / + control for text in the conversation (search answers, chat replies).
(()=>{
  const KEY='gg-text-zoom',MIN=0.8,MAX=2,STEP=0.1,root=document.documentElement;
  const messages=document.getElementById('messages');if(!messages)return;
  let zoom=1;try{const saved=parseFloat(localStorage.getItem(KEY));if(saved>=MIN&&saved<=MAX)zoom=saved}catch{}
  const bar=document.createElement('div');bar.className='gg-text-zoom';bar.setAttribute('role','group');bar.setAttribute('aria-label','Text size');bar.hidden=true;
  const btn=(label,aria,delta)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.setAttribute('aria-label',aria);b.title=aria;b.onclick=()=>set(zoom+delta);return b};
  const plus=btn('+','Zoom in text',STEP),minus=btn('−','Zoom out text',-STEP),value=document.createElement('output');
  value.title='Reset text size';value.setAttribute('aria-live','polite');value.onclick=()=>set(1);
  bar.append(plus,value,minus);document.body.append(bar);
  function set(next){zoom=Math.round(Math.min(MAX,Math.max(MIN,next))*10)/10;root.style.setProperty('--gg-text-zoom',zoom);value.textContent=Math.round(zoom*100)+'%';plus.disabled=zoom>=MAX;minus.disabled=zoom<=MIN;try{localStorage.setItem(KEY,String(zoom))}catch{}}
  const sync=()=>{const chat=document.getElementById('chat');bar.hidden=!messages.querySelector('.message')||!!chat?.classList.contains('hidden')};
  new MutationObserver(sync).observe(messages,{childList:true,subtree:true});
  const chat=document.getElementById('chat');if(chat)new MutationObserver(sync).observe(chat,{attributes:true,attributeFilter:['class']});
  document.addEventListener('keydown',e=>{if(bar.hidden||!e.altKey)return;if(e.key==='+'||e.key==='='){e.preventDefault();set(zoom+STEP)}else if(e.key==='-'){e.preventDefault();set(zoom-STEP)}else if(e.key==='0'){e.preventDefault();set(1)}});
  set(zoom);sync();
})();
