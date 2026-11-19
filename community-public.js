import { openCommunity } from "./community.js?v=20261116-dm";
import { shareIntents } from "./community-public-core.js";
const root = document.createElement("div");
root.className = "cp";
document.querySelector("#community").prepend(root);
let en = new URLSearchParams(location.search).get("lang") === "en",
  signedIn = false;
const t = (it, eng) => (en ? eng : it);
const node = (tag, text) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  return n;
};
const api = async (options = {}) => {
  const r = await fetch("/gg-community?feed=public", {
    cache: "no-store",
    credentials: "same-origin",
    ...options,
  });
  const d = await r.json();
  if (!r.ok)
    throw Error(
      d.error || t("Servizio non disponibile.", "Service unavailable."),
    );
  return d;
};
const send = (body) =>
  api({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
function render() {
  root.innerHTML = `<div class="cp-top"><span>GG / COMMUNITY</span><button id="cp-lang" type="button">${en ? "Italiano" : "English"}</button></div>
<div class="cp-hero"><div><p class="cp-eyebrow">${t("UNO SPAZIO PER LE IDEE ORIGINALI", "A SPACE FOR ORIGINAL IDEAS")}</p><h1>${t("Le idee crescono<br>quando le condividi.", "Ideas grow<br>when you share them.")}</h1><p>${t("Un laboratorio aperto di persone, tentativi e nuove prospettive. Leggi liberamente. Entra per condividere il tuo lavoro.", "An open workshop of people, experiments and fresh perspectives. Read freely. Sign in to share your work.")}</p><a href="#cp-compose">${t("Porta la tua idea ↓", "Bring your idea ↓")}</a></div><div class="cp-mark" aria-hidden="true">GG<span>IN GOOD<br>COMPANY.</span></div></div>
<div class="cp-prompts"><article><small>${t("SPUNTO EDITORIALE / 01", "EDITORIAL PROMPT / 01")}</small><h2>Un brief, tre idee</h2><p>${t("Mostra un tuo brief originale e tre direzioni diverse. Quale merita di diventare reale?", "One brief, three ideas. Show your original brief and three different directions. Which deserves to become real?")}</p></article><article><small>${t("SPUNTO EDITORIALE / 02", "EDITORIAL PROMPT / 02")}</small><h2>${t("Dietro la prima bozza", "Behind the first draft")}</h2><p>${t("Condividi un lavoro originale e racconta una scelta che lo ha cambiato. Invita un feedback concreto.", "Share original work and explain one choice that changed it. Invite specific feedback.")}</p></article></div>
<div class="cp-columns"><div><div class="cp-feedhead"><h2>${t("Il feed pubblico", "The public feed")}</h2><button id="cp-refresh">${t("Aggiorna", "Refresh")}</button></div><p>${t("Solo post pubblicati esplicitamente come pubblici. Le stanze dei membri restano separate.", "Only explicitly public posts appear here. Members’ rooms remain separate.")}</p><div id="cp-feed" aria-live="polite"></div></div>
<aside><form id="cp-compose"><small>${t("IL TUO CONTRIBUTO", "YOUR CONTRIBUTION")}</small><h2>${t("Fai partire una conversazione.", "Start a conversation.")}</h2><p id="cp-session"></p><button id="cp-login" type="button">${t("Accedi / Iscriviti", "Sign in / Join")}</button><label>${t("Alias pubblico scelto", "Chosen public alias")}<input name="alias" required minlength="2" maxlength="30" autocomplete="nickname"></label><label>${t("Il tuo post · massimo 1.000 caratteri", "Your post · up to 1,000 characters")}<textarea name="content" required maxlength="1000" rows="5"></textarea></label><label class="cp-check"><input name="shareBrief" type="checkbox">${t("Condividi anche il mio brief Creator Studio", "Also share my Creator Studio brief")}</label><label id="cp-remix-label" hidden>Remix link<input name="remixLink" type="url" maxlength="12000"></label><small>${t("Il link rende leggibili tutti i cinque campi del brief. Non includere dati personali.", "The link exposes all five brief fields. Do not include personal information.")}</small><label class="cp-check"><input name="publicConsent" type="checkbox" required>${t("Confermo: testo, alias e brief selezionato saranno pubblici e condivisibili.", "I confirm: text, alias and any selected brief become public and shareable.")}</label><p>${t("Rispetta gli altri. Niente odio, spam o dati personali. Pubblica solo lavori tuoi. Per iniziare, accetta le regole nella sezione membri qui sotto.", "Respect others. No hate, spam or personal data. Share your own work. First accept the rules in the members section below.")}</p><button type="submit">${t("Pubblica dopo verifica", "Publish after review")}</button><p id="cp-notice" role="status"></p></form>
<details class="cp-share"><summary>${t("Condividi GG / Community", "Share GG / Community")}</summary><label>${t("Testo di lancio modificabile", "Editable launch text")}<textarea id="cp-launch" rows="4">${t("Un brief, tre idee. Porta il tuo lavoro originale nella GG Community.", "One brief, three ideas. Bring your original work to GG Community.")}</textarea></label><input id="cp-shareurl" aria-label="Community URL" readonly value="https://gg-ai-studio.netlify.app/community"><button id="cp-copy">${t("Copia link", "Copy link")}</button><button id="cp-share">Web Share</button><div id="cp-intents"></div><p>${t("LinkedIn condivide il link; puoi aggiungere il testo nella sua finestra. Nulla viene inviato automaticamente.", "LinkedIn shares the link; add your text in its window. Nothing is sent automatically.")}</p><p id="cp-sharestatus" role="status"></p></details></aside></div><h2 class="cp-private">${t("Spazio membri · stanze e messaggi privati", "Members space · rooms and private messages")}</h2>`;
  const q = (s) => root.querySelector(s);
  q("#cp-lang").onclick = () => {
    en = !en;
    history.replaceState(null, "", "/community" + (en ? "?lang=en" : ""));
    document.documentElement.lang = en ? "en" : "it";
    render();
  };
  q("#cp-login").onclick = () => document.querySelector(".gg-login")?.click();
  q("[name=shareBrief]").onchange = (e) => {
    q("#cp-remix-label").hidden = !e.target.checked;
  };
  q("#cp-refresh").onclick = load;
  q("#cp-compose").onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target,
      b = f.querySelector("[type=submit]");
    b.disabled = true;
    q("#cp-notice").textContent = t("Verifica in corso…", "Reviewing…");
    try {
      await send({
        action: "publish-public",
        alias: f.alias.value,
        content: f.content.value,
        shareBrief: f.shareBrief.checked,
        remixLink: f.remixLink.value,
        publicConsent: f.publicConsent.checked,
      });
      f.reset();
      q("#cp-remix-label").hidden = true;
      q("#cp-notice").textContent = t("Pubblicato.", "Published.");
      await load();
    } catch (err) {
      q("#cp-notice").textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
  const url = "https://gg-ai-studio.netlify.app/community";
  const intents = () => {
    q("#cp-intents").replaceChildren();
    for (const [name, href] of Object.entries(
      shareIntents(q("#cp-launch").value, url),
    )) {
      const a = node(
        "a",
        name === "x" ? "X" : name === "linkedin" ? "LinkedIn" : "WhatsApp",
      );
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      q("#cp-intents").append(a);
    }
  };
  q("#cp-launch").oninput = intents;
  intents();
  q("#cp-copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(url);
      q("#cp-sharestatus").textContent = t("Link copiato.", "Link copied.");
    } catch {
      q("#cp-shareurl").focus();
      q("#cp-shareurl").select();
      q("#cp-sharestatus").textContent = t(
        "Seleziona e copia il link.",
        "Select and copy the link.",
      );
    }
  };
  q("#cp-share").onclick = async () => {
    if (!navigator.share) {
      q("#cp-sharestatus").textContent = t(
        "Usa Copia link o una delle opzioni.",
        "Use Copy link or a sharing option.",
      );
      return;
    }
    try {
      await navigator.share({
        title: "GG Community",
        text: q("#cp-launch").value,
        url,
      });
    } catch (e) {
      if (e.name !== "AbortError")
        q("#cp-sharestatus").textContent = t(
          "Condivisione non disponibile. Copia il link.",
          "Sharing unavailable. Copy the link.",
        );
    }
  };
  load();
}
async function load() {
  const box = root.querySelector("#cp-feed");
  box.textContent = t("Caricamento…", "Loading…");
  try {
    const d = await api();
    signedIn = d.signedIn;
    root.querySelector("#cp-session").textContent = signedIn
      ? t(
          "Account connesso. Usa solo un alias pubblico.",
          "Signed in. Use only a public alias.",
        )
      : t(
          "Leggi senza account. Accedi per pubblicare o segnalare.",
          "Read without an account. Sign in to publish or report.",
        );
    root.querySelector("#cp-login").hidden = signedIn;
    box.replaceChildren();
    if (!d.messages.length)
      box.append(
        node(
          "p",
          t(
            "Qui c’è spazio per la tua prima idea. Nessun post pubblico, per ora.",
            "Room for your first idea. No public posts yet.",
          ),
        ),
      );
    for (const m of d.messages) {
      const card = node("article");
      card.className = "cp-post";
      card.append(
        node("strong", m.author),
        node(
          "time",
          new Date(m.createdAt).toLocaleDateString(en ? "en-GB" : "it-IT"),
        ),
        node("p", m.content),
      );
      if (m.remixLink) {
        const a = node("a", "Remix in Creator Studio ↗");
        a.href = m.remixLink;
        card.append(a);
      }
      if (m.canRemove) {
        const b = node("button", t("Rimuovi", "Remove"));
        b.onclick = async () => {
          b.disabled = true;
          try {
            const r = await fetch(
              "/gg-community?id=" + encodeURIComponent(m.id),
              { method: "DELETE" },
            );
            if (!r.ok)
              throw Error(t("Rimozione non riuscita.", "Removal failed."));
            await load();
          } catch (e) {
            b.disabled = false;
            root.querySelector("#cp-notice").textContent = e.message;
          }
        };
        card.append(b);
      } else {
        const report = node("button", t("Segnala", "Report"));
        report.onclick = () => {
          if (!signedIn) {
            document.querySelector(".gg-login")?.click();
            return;
          }
          const select = node("select");
          select.setAttribute(
            "aria-label",
            t("Motivo segnalazione", "Report reason"),
          );
          for (const [v, label] of Object.entries({
            disrespect: t("Offese", "Abuse"),
            hate: t("Odio", "Hate"),
            spam: "Spam",
            privacy: "Privacy",
            other: t("Altro", "Other"),
          })) {
            const o = node("option", label);
            o.value = v;
            select.append(o);
          }
          const confirm = node(
            "button",
            t("Invia segnalazione", "Submit report"),
          );
          confirm.onclick = async () => {
            confirm.disabled = true;
            try {
              await send({ action: "report", id: m.id, reason: select.value });
              card.append(
                node("p", t("Segnalazione ricevuta.", "Report received.")),
              );
              select.remove();
              confirm.remove();
            } catch (e) {
              confirm.disabled = false;
              root.querySelector("#cp-notice").textContent = e.message;
            }
          };
          report.replaceWith(select, confirm);
        };
        card.append(report);
      }
      box.append(card);
    }
  } catch {
    box.textContent = t(
      "Feed non disponibile. Usa Aggiorna per riprovare.",
      "Feed unavailable. Use Refresh to retry.",
    );
  }
}
render();
const nav = [...document.querySelectorAll(".sidebar .nav")].find((n) =>
  n.textContent.includes("Community"),
);
if (nav) nav.onclick = () => location.assign("/community");
if (location.pathname.replace(/\/$/, "") === "/community") {
  openCommunity();
  document.documentElement.lang = en ? "en" : "it";
}
window.openPublicCommunity = (text, link) => {
  openCommunity();
  history.pushState(null, "", "/community");
  root.querySelector("[name=content]").value = text;
  root.querySelector("[name=remixLink]").value = link || "";
  root.querySelector("[name=shareBrief]").checked = !!link;
  root.querySelector("#cp-remix-label").hidden = !link;
  root.querySelector("#cp-compose").scrollIntoView();
};
import("./identity-sdk.js")
  .then((s) => s.onAuthChange(() => load()))
  .catch(() => {});
