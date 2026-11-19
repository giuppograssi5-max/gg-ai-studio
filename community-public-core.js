import { cleanText, cleanName, quickCheck } from "./community-core.js";
import { readRemix, remixURL, FIELDS } from "./creator-core.js";
export function validatePublicPost(body, origin) {
  if (body.publicConsent !== true)
    throw Error("Confirm public visibility. Conferma la visibilità pubblica.");
  const alias = cleanName(body.alias),
    content = cleanText(body.content);
  const violation = quickCheck(alias + "\n" + content);
  if (violation) throw Error(violation.reason);
  let remixLink = null;
  if (body.shareBrief === true) {
    const url = new URL(body.remixLink);
    if (
      url.origin !== origin ||
      url.pathname !== "/" ||
      url.search ||
      url.username ||
      url.password
    )
      throw Error("Use a same-site Creator Studio remix link.");
    const brief = readRemix(url.hash);
    if (!brief) throw Error("Invalid remix brief.");
    const bad = quickCheck(FIELDS.map((k) => brief[k]).join("\n"));
    if (bad) throw Error(bad.reason);
    remixLink = remixURL(brief, origin + "/");
  }
  return { alias, content, remixLink };
}
export function publicPost(m, userId, admin = false) {
  return {
    id: m.id,
    author: m.authorName,
    content: m.content,
    createdAt: m.createdAt,
    remixLink: m.remixLink,
    mine: !!userId && m.userId === userId,
    canRemove: !!userId && (m.userId === userId || admin),
  };
}
export function shareIntents(text, url) {
  return {
    whatsapp: "https://wa.me/?text=" + encodeURIComponent(text + "\n" + url),
    linkedin:
      "https://www.linkedin.com/sharing/share-offsite/?url=" +
      encodeURIComponent(url),
    x:
      "https://twitter.com/intent/tweet?text=" +
      encodeURIComponent(text) +
      "&url=" +
      encodeURIComponent(url),
  };
}
