// Briefs and campaign edits live in the open page; exports are the user's durable copy.
export const FIELDS = ['title', 'audience', 'message', 'objective', 'cta'];
export function cleanBrief(value) {
  const b = {};
  for (const k of FIELDS) {
    if (typeof value?.[k] !== 'string' || !value[k].trim() || value[k].length > (k === 'message' ? 600 : 160)) throw Error('Complete all five brief fields within their limits.');
    b[k] = value[k].trim();
  }
  return b;
}
export function template(b) {
  return {
    storyboard: `0–3s · HOOK\nShow the problem facing ${b.audience}. On screen: ${b.title}.\n\n3–12s · REVEAL\nVoiceover: ${b.message}\nFilm one clear demonstration; add captions.\n\n12–22s · VALUE\nShow how this helps ${b.audience}. Use verified details, no invented claims.\n\n22–30s · NEXT STEP\nOn screen and spoken: ${b.cta}. Goal: ${b.objective}.`,
    instagram: `${b.title}\n\n${b.message}\n\nMade for ${b.audience}.\n${b.cta}\n\n#BehindTheScenes #CreativeProcess`,
    linkedin: `${b.title}\n\nFor ${b.audience}: ${b.message}\n\nOur focus: ${b.objective}.\n\n${b.cta}\n\nWhat would make this most useful to you?`,
    x: `${b.title}: ${b.message}\n${b.cta}`.slice(0, 280),
    plan: ['Introduce the idea · Instagram carousel', 'Show the problem · Short', 'Explain the process · LinkedIn', 'Answer one audience question · Instagram Story', 'Demonstrate the value · Short', 'Invite feedback · X', 'Recap and invite action · All channels'].map((s,i) => `Day ${i+1} · ${s}\n${i === 6 ? b.cta : b.message}`).join('\n\n'),
    headline: b.title, caption: b.message, action: b.cta,
    launch: `I’m launching ${b.title}.\n\n${b.message}\n\nFor ${b.audience}. ${b.cta}`
  };
}
export function parseCampaign(text) {
  const raw = JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, ''));
  for (const key of Object.keys(template({}))) if (typeof raw[key] !== 'string' || !raw[key].trim() || raw[key].length > 6000) throw Error('Incomplete AI campaign.');
  if (raw.headline.length > 160 || raw.caption.length > 600 || raw.action.length > 160 || raw.x.length > 280) throw Error('AI draft exceeded the card or channel limits.');
  return Object.fromEntries(Object.keys(template({})).map(k => [k, raw[k]]));
}
export function remixURL(brief, base) {
  const url = new URL(base); url.search = ''; url.hash = 'creator=' + encodeURIComponent(JSON.stringify(cleanBrief(brief))); return url.href;
}
export function readRemix(hash) {
  if (!hash.startsWith('#creator=')) return null;
  if (hash.length > 12000) throw Error('Remix link is too long.');
  return cleanBrief(JSON.parse(decodeURIComponent(hash.slice(9))));
}
export function markdown(brief, campaign, source) {
  return `# ${brief.title}\n\nSource: ${source}\n\n## Brief\n${FIELDS.map(k => `${k}: ${brief[k]}`).join('\n')}\n\n${Object.entries(campaign).map(([k,v]) => `## ${k}\n\n${v}`).join('\n\n')}\n\nReview claims, accessibility and platform limits before publishing.\n`;
}
