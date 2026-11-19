export const UI_LANGUAGES=['it','en','fr','es','de','pt'];
export function languageSearchLabel(language,ui='it'){
  let local=language.name,native=language.name;
  try{const name=new Intl.DisplayNames([ui],{type:'language'}).of(language.locale);if(name&&name!==language.locale)local=name;}catch{}
  try{if(Intl.DisplayNames.supportedLocalesOf([language.locale]).length){const name=new Intl.DisplayNames([language.locale],{type:'language'}).of(language.locale);if(name&&name!==language.locale)native=name;}}catch{}
  return local===native?local:local+' / '+native;
}
export function chooseLanguage(code,languages,wiki){
  const language=languages.find(l=>l.code===code)||languages.find(l=>l.code==='eng');
  const ui=UI_LANGUAGES.includes(language.locale)?language.locale:'en';
  return {...language,ui,wiki:wiki.includes(language.locale)?language.locale:wiki.includes(language.code)?language.code:'en',fallback:ui!==language.locale};
}
export function searchLanguages(query,languages,labels,limit=200){
  const fold=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
  const terms=fold(query.trim()).split(/\s+/).filter(Boolean);
  const all=languages.filter(l=>terms.every(t=>fold([l.code,l.locale,l.name,labels?.get(l.code)||''].join(' ')).includes(t)));
  return {count:all.length,items:all.slice(0,limit)};
}
