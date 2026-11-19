export const NEWS_COUNTRIES='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
export const NEWS_REFRESH_MS=86400000;
export const NEWS_SOURCES=[
 {id:'corriere',name:'Corriere della Sera',feed:'https://xml2.corriereobjects.it/feed-hp/homepage-restyle-2025.xml',home:'https://www.corriere.it/',hosts:['corriere.it'],language:'it',country:'IT'},
 {id:'tgcom24',name:'TGcom24',feed:'https://www.tgcom24.mediaset.it/rss/homepage.xml',home:'https://www.tgcom24.mediaset.it/',hosts:['tgcom24.mediaset.it'],language:'it',country:'IT'},
 {id:'bbc',name:'BBC News',feed:'https://feeds.bbci.co.uk/news/world/rss.xml',home:'https://www.bbc.com/news',hosts:['bbc.com','bbc.co.uk'],language:'en',country:'GB'}
];
const newsEditions={ar:'SA',bn:'BD',bg:'BG',ca:'ES',cs:'CZ',da:'DK',de:'DE',el:'GR',en:'US',es:'ES',et:'EE',fa:'IR',fi:'FI',fil:'PH',fr:'FR',gu:'IN',he:'IL',hi:'IN',hr:'HR',hu:'HU',id:'ID',it:'IT',ja:'JP',kn:'IN',ko:'KR',lt:'LT',lv:'LV',ml:'IN',mr:'IN',ms:'MY',nl:'NL',no:'NO',pl:'PL',pt:'BR',ro:'RO',ru:'RU',sk:'SK',sl:'SI',sr:'RS',sv:'SE',sw:'KE',ta:'IN',te:'IN',th:'TH',tr:'TR',uk:'UA',ur:'PK',vi:'VN','zh-CN':'CN','zh-TW':'TW'};
const newsEditionCountries={en:'US GB CA AU NZ IN IE ZA NG KE UG BW ET GH MY NA PK PH SG TZ ZW',fr:'FR BE CH CA MA SN',de:'DE AT CH',es:'ES AR CL CO CU MX PE VE US',pt:'BR PT',ar:'AE EG LB SA','zh-CN':'CN','zh-TW':'TW'};
const newsCache=new Map(),newsPending=new Map();
export function resolveNewsLocale(lang='it',country='IT'){
 if(typeof lang!=='string'||!/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(lang))throw new RangeError('Invalid news language');
 country=String(country).toUpperCase();if(country!=='WORLD'&&!NEWS_COUNTRIES.includes(country))throw new RangeError('Invalid news country');
 const base=lang.toLowerCase().split('-')[0];let effective=base==='zh'?(/tw|hant|hk/i.test(lang)||['TW','HK'].includes(country)?'zh-TW':'zh-CN'):base==='nb'||base==='nn'?'no':base==='iw'?'he':base==='tl'?'fil':base;
 const fallback=!newsEditions[effective];if(fallback)effective='en';
 const supported=(newsEditionCountries[effective]||newsEditions[effective]).split(' '),regional=country!=='WORLD'&&supported.includes(country);const edition=regional?country:newsEditions[effective];
 let countryName='';try{if(country!=='WORLD')countryName=new Intl.DisplayNames([effective],{type:'region'}).of(country)}catch{}
 return {requestedLanguage:lang,language:effective,country,edition,countryName,languageFallback:fallback,countryFallback:country!=='WORLD'&&!regional};
}
function newsDecode(value){return String(value).replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,(_,entity)=>{const e=entity.toLowerCase();if(e[0]==='#'){const n=e[1]==='x'?parseInt(e.slice(2),16):Number(e.slice(1));return n>0&&n<=0x10ffff&&!(n>=0xd800&&n<=0xdfff)?String.fromCodePoint(n):''}return {amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '}[e]||''})}
function newsText(value=''){return newsDecode(String(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1')).replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim()}
function newsField(item,name){return item.match(new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i'))?.[1]||''}
function newsSafeURL(value,hosts){try{const u=new URL(newsText(value));if(u.protocol!=='https:'||u.username||u.password||hosts&&!hosts.some(h=>u.hostname===h||u.hostname.endsWith('.'+h)))return null;u.hash='';return u.href}catch{return null}}
export function parsePublisherRSS(xml,source){
 if(typeof xml!=='string'||xml.length>1200000||/<!DOCTYPE|<!ENTITY/i.test(xml)||!/<rss[\s>]/i.test(xml)||!/<channel[\s>]/i.test(xml))throw new Error('Invalid RSS feed');
 const articles=[],seen=new Set();
 for(const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
  const item=match[1],url=newsSafeURL(newsField(item,'link'),source.hosts);let title=newsText(newsField(item,'title')).slice(0,260);if(!title||!url||seen.has(url))continue;
  const newsroom=source.aggregate?newsText(newsField(item,'source')).slice(0,120):source.name;if(source.aggregate&&!newsroom)continue;
  if(source.aggregate&&title.endsWith(' - '+newsroom))title=title.slice(0,-newsroom.length-3).trim();
  const date=newsText(newsField(item,'pubDate')||newsField(item,'dc:date')),time=Date.parse(date);seen.add(url);
  articles.push({title,url,source:newsroom,sourceId:source.id,publishedAt:Number.isFinite(time)?new Date(time).toISOString():null,language:source.language,via:source.aggregate?'Google News':null});if(articles.length===100)break;
 }
 return articles;
}
async function newsReadRSS(response){
 if(!response.ok)throw new Error('HTTP '+response.status);if(Number(response.headers.get('content-length')||0)>1200000)throw new Error('Feed exceeds size limit');
 if(!response.body?.getReader){const b=await response.arrayBuffer();if(b.byteLength>1200000)throw new Error('Feed exceeds size limit');return new TextDecoder().decode(b)}
 const reader=response.body.getReader(),decoder=new TextDecoder();let size=0,text='';try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1200000){await reader.cancel();throw new Error('Feed exceeds size limit')}text+=decoder.decode(value,{stream:true})}return text+decoder.decode()}finally{reader.releaseLock()}
}
export function newsSearchURL(query,locale,sourceId='all'){
 const source=NEWS_SOURCES.find(s=>s.id===sourceId);const terms=[query.trim(),source?'site:'+source.hosts[0]:'',locale.countryFallback?'"'+locale.countryName+'"':''].filter(Boolean);
 const u=new URL('https://news.google.com/rss'+(terms.length?'/search':''));u.search=new URLSearchParams({hl:locale.language,gl:locale.edition,ceid:locale.edition+':'+locale.language});if(terms.length)u.searchParams.set('q',terms.join(' ')+' when:1d');return u.href;
}
function newsFold(value){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()}
export async function publisherNewsData(query='',sourceId='all',options={}){
 if(typeof query!=='string'||query.length>200)throw new RangeError('Use a topic of at most 200 characters');
 if(sourceId!=='all'&&!NEWS_SOURCES.some(s=>s.id===sourceId))throw new RangeError('Invalid publisher');
 const locale=resolveNewsLocale(options.lang||'it',options.country||'IT'),now=options.now??Date.now(),cache=options.cache||newsCache,pending=options.pending||newsPending,fetcher=options.fetcher||fetch;
 const direct=NEWS_SOURCES.filter(s=>sourceId==='all'?s.language===locale.language&&(locale.country==='WORLD'||s.country===locale.country):s.id===sourceId);
 const regional={id:'regional',name:'Google News · '+locale.language,home:'https://news.google.com/',feed:newsSearchURL(query,locale,sourceId),hosts:['news.google.com'],language:locale.language,aggregate:true};
 const jobs=[...direct,regional];
 const loaded=await Promise.all(jobs.map(async source=>{
  const key=source.id==='regional'?source.feed:source.id,saved=cache.get(key);let articles=[],fetchedAt=null,status='ok',notice='',feedLanguage=source.language;
  try{
   if(saved&&!options.force&&saved.until>now){articles=saved.articles;fetchedAt=saved.fetchedAt;feedLanguage=saved.language||source.language;}
   else{let task=pending.get(key);if(!task){task=(async()=>{let target=source.feed;const allowed=[new URL(target).hostname,...source.hosts];let response;
      for(let step=0;step<4;step++){response=await fetcher(target,{headers:{Accept:'application/rss+xml, application/xml, text/xml','User-Agent':'GG-News/2.0 RSS reader'},redirect:'manual',credentials:'omit',signal:AbortSignal.timeout(10000)});if(response.status<300||response.status>=400)break;const next=new URL(response.headers.get('location')||'',target);if(!newsSafeURL(next.href,allowed))throw new Error('Unexpected feed redirect');target=next.href;}
      const xml=await newsReadRSS(response);const raw=newsText(xml.match(/<language>(.*?)<\/language>/i)?.[1]||'');return {articles:parsePublisherRSS(xml,source),language:raw||source.language};})();pending.set(key,task);task.finally(()=>pending.delete(key)).catch(()=>{});}
    const value=await task;articles=value.articles;feedLanguage=value.language;fetchedAt=new Date(now).toISOString();if(cache.size>=128)cache.delete(cache.keys().next().value);cache.set(key,{articles,fetchedAt,language:feedLanguage,until:now+900000});}
  }catch(error){if(saved&&now-Date.parse(saved.fetchedAt)<172800000){articles=saved.articles;fetchedAt=saved.fetchedAt;status='cached';notice='Last successful consultation; source currently unavailable';}else{status='unavailable';notice='Source temporarily unavailable';}}
  return {source,articles,status,notice,fetchedAt,feedLanguage};
 }));
 const terms=newsFold(query).split(/[^\p{L}\p{N}]+/u).filter(t=>t.length>1),cutoff=now-NEWS_REFRESH_MS;
 const lists=loaded.map(g=>g.articles.filter(a=>a.publishedAt&&Date.parse(a.publishedAt)>=cutoff&&Date.parse(a.publishedAt)<=now+300000&&(g.source.aggregate||terms.every(t=>newsFold(a.title).includes(t)))).map(a=>({...a,language:g.feedLanguage})));
 const results=[],used=new Set(),titles=new Set();for(let rank=0;rank<100&&results.length<24;rank++)for(const list of lists){const a=list[rank],key=a&&newsFold(a.title).replace(/[^\p{L}\p{N}]/gu,'');if(a&&!used.has(a.url)&&!titles.has(key)&&results.length<24){used.add(a.url);titles.add(key);results.push(a)}}
 const actual=loaded.find(g=>g.source.aggregate&&g.status!=='unavailable')?.feedLanguage;if(actual&&actual.split('-')[0]!==locale.language.split('-')[0]){locale.languageFallback=true;locale.language=actual;}
 return {type:'news',provider:'Publisher RSS and Google News',query,selectedSource:sourceId,locale,results,sources:loaded.map((g,i)=>({id:g.source.id,name:g.source.name,home:g.source.home,status:g.status,notice:g.notice,fetchedAt:g.fetchedAt,matching:lists[i].length,language:g.feedLanguage})),allUnavailable:loaded.every(g=>g.status==='unavailable'),windowHours:24,refreshEveryMs:NEWS_REFRESH_MS,nextRefreshAt:new Date(now+NEWS_REFRESH_MS).toISOString(),fetchedAt:new Date(now).toISOString()};
}
export async function publisherNewsEndpoint(url){try{const data=await publisherNewsData((url.searchParams.get('q')||'').trim(),url.searchParams.get('source')||'all',{lang:url.searchParams.get('lang')||'it',country:url.searchParams.get('country')||'IT',force:url.searchParams.get('refresh')==='1'});return new Response(JSON.stringify(data),{status:data.allUnavailable?503:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})}catch(error){return new Response(JSON.stringify({error:error instanceof RangeError?error.message:'News sources unavailable'}),{status:error instanceof RangeError?400:503,headers:{'Content-Type':'application/json; charset=utf-8'}})}}
