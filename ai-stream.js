function ggPublicFetch(input, init={}) { return fetch(input, {...init, credentials:"omit"}); }
export async function readAIStream(response,onEvent,signal) {
  if (!response.body) throw Error('The assistant returned an empty response.');
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
  const abort=()=>reader.cancel().catch(()=>{});
  signal?.addEventListener('abort',abort,{once:true});
  try{
    while(true){if(signal?.aborted)throw new DOMException('Interrotto','AbortError');const {done,value}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});
      let split;while((split=buffer.search(/\r?\n\r?\n/))>=0){const frame=buffer.slice(0,split);const separator=/^\r?\n\r?\n/.exec(buffer.slice(split))[0];buffer=buffer.slice(split+separator.length);const data=frame.split(/\r?\n/).filter(line=>line.startsWith('data:')).map(line=>line.slice(5).trimStart()).join('\n');if(data&&data!=='[DONE]'){let event;try{event=JSON.parse(data)}catch{throw Error('Risposta AI non valida.')}onEvent(event)}}
      if(buffer.length>2000000)throw Error('Risposta AI troppo grande.');if(done){if(signal?.aborted)throw new DOMException('Stopped','AbortError');if(buffer.trim())throw Error('The assistant response ended early.');break;}
    }
  }finally{signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>{});reader.releaseLock()}
}
