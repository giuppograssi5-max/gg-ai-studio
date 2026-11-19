export function initialNewsRequest(prompt){
 const names=prompt.match(/corriere(?: della sera)?|tg\s*com\s*24|bbc(?: news)?/gi)||[];
 const source=names.length===1?(/corriere/i.test(names[0])?'corriere':/bbc/i.test(names[0])?'bbc':'tgcom24'):'all';
 const query=prompt.replace(/corriere(?: della sera)?|tg\s*com\s*24|bbc(?: news)?/gi,' ').replace(/\b(mostrami|mostra|dammi|cerca|cercami|le|gli|i|il|lo|la|di|da|del|della|delle|dei|dai|dal|dalla|dalle|su|sul|sulla|sulle|notizie|notizia|news|headlines|latest|show|find|search|me|the|from|about|today|breaking|ultima|ultime|ultimi|oggi|recenti|giornali|giornale|testate|importanti|principali|attualità|e|actualités|actualite|dernières|noticias|últimas|notícias|nachrichten|neueste|heute|nieuws|berita)\b/gi,' ').replace(/أخبار|اخبار|ニュース|新闻|新聞|новости|समाचार/g,' ').replace(/[?!.,]/g,' ').replace(/\s+/g,' ').trim();
 return {query,source};
}
export function isNewsRequest(prompt,mode){
 if(mode==='news')return true;if(mode!=='auto')return false;
 const creating=/\b(crea|scrivi|genera|create|write|build|écris|escribe|schreib)\b/i.test(prompt)&&/\b(sito|website|post|email|testo|contenuto|article|articolo|newsletter)\b/i.test(prompt);
 return !creating&&/(?:\bnotizie\b|\bnews\b|\bheadlines\b|attualità|corriere|tg\s*com\s*24|\bbbc\b|actualit|noticias|notícias|nachrichten|nieuws|berita|أخبار|اخبار|ニュース|新闻|新聞|समाचार|новости|haberler)/i.test(prompt);
}
