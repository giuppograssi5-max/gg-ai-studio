// GG · Community rules agreement as a downloadable PDF.
import { RULES, RULES_VERSION, ROOMS, REPORT_HIDE_THRESHOLD, STRIKES_BEFORE_MUTE, MUTE_MINUTES, MIN_SECONDS_BETWEEN, MAX_PER_FIVE_MINUTES, MAX_MESSAGE } from './community-core.js';
import { makePdf } from './pdf-lite.js';

const fmtDate = (d, locale) => new Intl.DateTimeFormat(locale || 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

// member: { name, acceptedAt } when the signed-in member has accepted the current rules, otherwise null.
export function agreementBlocks(member, { now = new Date(), locale } = {}) {
  const h = (text) => ({ text, size: 13, bold: true, gap: 16, keep: true });
  const p = (text, extra = {}) => ({ text, gap: 4, ...extra });
  const li = (text) => ({ text: '•  ' + text, indent: 12, gap: 2 });
  const accepted = member?.acceptedAt ? new Date(member.acceptedAt) : null;
  return [
    { text: 'GG · COMMUNITY', size: 9, bold: true, color: [0.45, 0.45, 0.45] },
    { text: 'Community Rules Agreement', size: 22, bold: true, gap: 4 },
    { text: `Rules version ${RULES_VERSION}  ·  Document generated on ${fmtDate(now, locale)}`, size: 9.5, color: [0.4, 0.4, 0.4], gap: 2 },
    { rule: true, gap: 10 },
    h('1. Purpose'),
    p('The GG Community is a space where signed-in members talk with each other to ask questions, help, learn and share ideas. This agreement sets out the rules every member accepts before reading or writing in the community, so that every conversation stays polite, educated and respectful.'),
    p(`Rooms: ${Object.values(ROOMS).map(r => r.name).join(', ')}.`),
    h('2. Community rules'),
    p('By joining, the member agrees to follow these rules in every message and in the name shown to other members:'),
    ...RULES.flatMap((r, i) => [{ text: `${i + 1}. ${r.title}`, bold: true, gap: 8, indent: 12, keep: true }, { text: r.text, indent: 26, gap: 1 }]),
    h('3. How the rules are enforced'),
    li('Every message and every chosen name is checked before it is posted: first by automatic checks, then by an AI moderator that judges it against these rules. Messages that break the rules are not posted or saved, and the member receives the reason and a suggested respectful rewrite.'),
    li(`After ${STRIKES_BEFORE_MUTE} blocked messages within 24 hours, the member's writing is paused for ${MUTE_MINUTES} minutes. Reading remains available.`),
    li(`Members can report messages anonymously. A message reported by ${REPORT_HIDE_THRESHOLD} different members is hidden automatically and its author receives a warning.`),
    li('Moderators can remove any message, and a report from a moderator hides the message immediately. Serious or repeated violations may lead to suspension of community access.'),
    li(`Limits: messages up to ${MAX_MESSAGE} characters, at most one message every ${MIN_SECONDS_BETWEEN} seconds and ${MAX_PER_FIVE_MINUTES} messages every 5 minutes.`),
    h('4. Privacy'),
    p('Other members only see the chosen name and the messages, never the email address. GG stores the chosen name, the date the rules were accepted, posted messages with room and time, reports sent and the moderation status. Before posting, each message and the chosen name are sent to Anthropic through Netlify AI Gateway to check them against the rules. Members can delete their own messages at any time. Never share personal data in the community. Full details are in the GG privacy page.'),
    h('5. Changes to the rules'),
    p('If the rules change, the version number increases and members are asked to read and accept the new rules again before continuing to use the community.'),
    h('6. Acceptance'),
    ...(accepted
      ? [p(`The member below read and accepted these rules in the GG app.`),
         { text: `Member name: ${member.name}`, bold: true, gap: 10 },
         { text: `Accepted on: ${fmtDate(accepted, locale)}`, gap: 3 },
         { text: `Rules version: ${RULES_VERSION}`, gap: 3 }]
      : [p('Acceptance happens in the GG app: members tick “I have read the community rules and I agree to follow them” and join. This copy is for reference.'),
         { text: 'Member name: ______________________________', gap: 18 },
         { text: 'Date: ______________________________', gap: 12 }]),
    { rule: true, gap: 18 },
    { text: 'GG is software by Giuseppe Grassi. For help and data requests: giuppograssi5@gmail.com', size: 9, color: [0.4, 0.4, 0.4], gap: 2 },
  ];
}

export function agreementPdf(member, options) {
  return makePdf(agreementBlocks(member, options), { title: `GG Community Rules Agreement (v${RULES_VERSION})`, footer: `GG Community Rules Agreement · v${RULES_VERSION}` });
}

export function downloadAgreement(member) {
  const blob = new Blob([agreementPdf(member)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = `GG-Community-Rules-v${RULES_VERSION}.pdf`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
