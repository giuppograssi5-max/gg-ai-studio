import {
  VIDEO_CAPABILITIES,
  PLAN_DURATIONS,
  PLAN_ASPECTS,
  cleanVideoBrief,
  storyboard,
  videoIntent,
  pollVideoJob,
  safeVideoURL,
} from "./video-chat-core.js";
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const q = (s) => document.querySelector(s);
let caps = null,
  brief = null,
  refinements = [],
  active = null,
  version = 0,
  submitting = false;
let savedJobs = [], savedList;
const mode = q("#creationmode"),
  form = q("#chatform"),
  input = q("#prompt");
const controls = el("section", null, "gv-controls");
controls.hidden = true;
controls.setAttribute("aria-label", "GG video creation settings");
controls.innerHTML = `<div class="gv-top"><strong>GG / VIDEO</strong><button type="button" data-v="exit">Back to chat</button></div><p class="gv-capability" role="status">Checking rendering availability…</p><div class="gv-settings"><label>Storyboard target duration<select data-v="duration" aria-label="Video target duration"></select></label><label>Storyboard aspect ratio<select data-v="aspect" aria-label="Video aspect ratio"></select></label></div><label class="gv-reference">Reference image<input data-v="image" type="file" accept="image/jpeg,image/png,image/webp" disabled></label><small data-v="image-note">Image input is unavailable for native video rendering.</small><p>Describe a clip below, then send follow-ups to refine this brief. Each submission with a configured provider generates a new paid clip. Jobs are saved to your GG account; retrieve them after returning. Without a configured provider, only a local storyboard is prepared.</p><div class="gv-top"><button data-v="new" type="button">New video brief</button><button data-v="stop" type="button" hidden>Stop tracking</button></div><p data-v="notice" role="status"></p>`;
form.before(controls);
const c = (s) => controls.querySelector(`[data-v="${s}"]`);
const note = (t) => (c("notice").textContent = t);
const providerLabel = el('label', 'Video service');
const providerSelect = el('select');
providerSelect.dataset.v = 'provider';
providerSelect.setAttribute('aria-label', 'Video service');
for (const [id, name] of [['runway', 'Runway · Gen-4.5'], ['luma', 'Luma · Ray 2']]) {
  const option = el('option', name); option.value = id; providerSelect.append(option);
}
providerLabel.append(providerSelect);
controls.querySelector('.gv-settings').prepend(providerLabel);
providerSelect.onchange = () => settings();
function selectedCapabilities() {
  const selected = caps?.providers?.find(p => p.id === providerSelect.value);
  return selected ? { ...caps, rendering: !!selected.configured, durations: selected.durations, aspects: selected.aspects } : caps;
}
const historyButton = el('button', 'Retrieve my video jobs'); historyButton.type = 'button';
historyButton.onclick = () => history();
savedList = el('div', null, 'gv-saved');
controls.append(historyButton, savedList);
function settings() {
  const selected = caps?.providers?.find(p => p.id === providerSelect.value);
  const rendering = caps?.rendering === true && (!selected || selected.configured);
  for (const [key, values] of [
    ["duration", rendering ? (selected?.durations || caps.durations) : PLAN_DURATIONS],
    ["aspect", rendering ? (selected?.aspects || caps.aspects) : PLAN_ASPECTS],
  ]) {
    const select = c(key),
      old = select.value;
    select.replaceChildren();
    for (const v of values) {
      const o = el("option", String(v) + (key === "duration" ? "s" : ""));
      o.value = v;
      select.append(o);
    }
    if (values.map(String).includes(old)) select.value = old;
  }
  controls.querySelector(".gv-capability").textContent =
    caps?.reason ||
    "Rendering status cannot be verified. No video rendering starts. Local storyboard export is available.";
  controls.querySelector(
    '[data-v="duration"]',
  ).closest('label').firstChild.textContent = rendering
    ? "Clip duration"
    : "Storyboard target duration";
  controls.querySelector(
    '[data-v="aspect"]',
  ).closest('label').firstChild.textContent = rendering
    ? "Aspect ratio"
    : "Storyboard aspect ratio";
  c("image").disabled = !(rendering && caps.imageInput);
  c("image").closest("label").hidden = c("image").disabled;
  c("image-note").textContent =
    rendering && caps.imageInput
      ? "Optional JPEG, PNG or WebP · up to 3 MB. Sent only when you submit."
      : "Image input is unavailable for native video rendering. No image is sent.";
}
settings();
async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(35000)])
      : AbortSignal.timeout(35000),
  });
  const data = await response.json();
  if (!response.ok || data.error)
    throw Error(data.error || "Video service unavailable.");
  return data;
}
async function capabilities() {
  try {
    const data = await request("/gg-videos?capabilities=video");
    if (
      typeof data.rendering !== "boolean" ||
      !Array.isArray(data.durations) ||
      !Array.isArray(data.aspects)
    )
      throw Error("Invalid capabilities");
    if (
      data.rendering &&
      (!data.durations.length ||
        !data.aspects.length ||
        data.durations.some((x) => !Number.isInteger(x) || x <= 0 || x > 120) ||
        data.aspects.some((x) => !/^\d{1,2}:\d{1,2}$/.test(x)))
    )
      throw Error("Invalid settings");
    caps = data;
    if (data.providers) {
      for (const option of providerSelect.options) option.disabled = data.rendering && !data.providers.find(p => p.id === option.value)?.configured;
      if (data.rendering && !data.providers.find(p => p.id === providerSelect.value)?.configured) providerSelect.value = data.providers.find(p => p.configured).id;
    }
  } catch {
    caps = null;
  }
  settings();
}
const ready = capabilities();
function open() {
  mode.value = "gg-video";
  controls.hidden = false;
  input.placeholder = "Describe your clip, or refine the current video brief…";
  input.focus();
}
async function history() {
  try {
    savedJobs = (await request('/gg-videos')).jobs;
    savedList.replaceChildren();
    for (const job of savedJobs) {
      const row = el('div', null, 'gv-saved-job');
      row.append(el('span', `${job.provider} · ${job.duration}s · ${job.status} · ${job.prompt.slice(0, 70)}`));
      const button = el('button', job.status === 'succeeded' ? 'Open video' : 'Check status'); button.type = 'button';
      button.onclick = () => resume(job);
      row.append(button); savedList.append(row);
    }
    if (!savedJobs.length) savedList.append(el('p', 'No saved video jobs yet.'));
  } catch (error) { note(error.message); }
}
async function resume(job) {
  if (active || submitting) return note('Stop tracking the current request first.');
  const controller = new AbortController(), run = version;
  active = controller; c('stop').hidden = false;
  const box = card('Your saved video'); box.append(el('p', job.prompt));
  const state = el('p', 'Retrieving the provider job…', 'gv-state'); box.append(state);
  try {
    const file = await pollVideoJob({ signal: controller.signal, read: signal => request(`/gg-videos?id=${encodeURIComponent(job.id)}`, { signal }),
      onUpdate: current => { state.textContent = current.status; } });
    await playback(box, file, controller.signal); state.textContent = 'Video ready. Download it soon: provider links may expire.';
  } catch (error) { state.textContent = error.name === 'AbortError' ? 'Tracking stopped. The provider may still continue.' : error.message; }
  finally { if (run === version) { active = null; c('stop').hidden = true; } }
}
window.GGVideoChat = {
  handles: (prompt, selected) =>
    videoIntent(prompt, selected) && !q(".attachment-list")?.children.length,
  open,
};
mode.addEventListener("change", () => {
  controls.hidden = mode.value !== "gg-video";
  if (!controls.hidden) open();
});
c("exit").onclick = () => {
  mode.value = "chat";
  mode.dispatchEvent(new Event("change", { bubbles: true }));
  input.placeholder = "Ask GG a question…";
};
function reset() {
  version++;
  active?.abort();
  active = null;
  brief = null;
  refinements = [];
  c("image").value = "";
  c("stop").hidden = true;
  savedList.replaceChildren(); savedJobs = [];
  note("New video brief. Previous cards remain in this conversation.");
}
c("new").onclick = reset;
c("stop").onclick = () => active?.abort();
q("#newchat")?.addEventListener("click", () => {
  reset();
  controls.hidden = true;
  if (mode.value === "gg-video") mode.value = "auto";
});
window.addEventListener("pagehide", () => active?.abort());
function card(text) {
  q(".welcome")?.classList.add("hidden");
  q("#ideas")?.classList.add("hidden");
  q(".research-shortcuts")?.classList.add("hidden");
  q(".composer-wrap").before(q("#messages"));
  const n = el("article", null, "gv-card");
  n.append(el("small", "GG / VIDEO WORKSPACE"), el("h2", text));
  q("#messages").append(n);
  return n;
}
document.addEventListener(
  "click",
  (event) => {
    if (event.target.closest(".chat-open")) {
      reset();
      controls.hidden = true;
      if (mode.value === "gg-video") mode.value = "chat";
    }
  },
  true,
);

function exportDraft(box, draft) {
  const label = el("label", "Editable storyboard & prompt · text only");
  const editor = el("textarea");
  editor.value = draft;
  editor.rows = 10;
  editor.setAttribute("aria-label", "Editable video storyboard");
  label.append(editor);
  const button = el("button", "Download storyboard / prompt (.md)");
  button.type = "button";
  button.onclick = () => {
    const a = el("a");
    const url = URL.createObjectURL(
      new Blob([editor.value], { type: "text/markdown;charset=utf-8" }),
    );
    a.href = url;
    a.download = "gg-video-storyboard.md";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  box.append(
    label,
    el(
      "small",
      "Edits affect this export. Follow-ups use the original brief and your refinement notes.",
    ),
    button,
  );
}
async function reference() {
  const file = c("image").files?.[0];
  if (!file) return null;
  if (!caps?.imageInput || !caps?.rendering)
    throw Error("Reference images are not supported.");
  if (
    !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
    file.size > 3 * 1024 * 1024
  )
    throw Error("Use a JPEG, PNG or WebP image up to 3 MB.");
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () =>
      resolve({ mimeType: file.type, data: String(r.result).split(",")[1] });
    r.onerror = () => reject(Error("Image could not be read."));
    r.readAsDataURL(file);
  });
}
async function playback(box, file, signal) {
  signal.throwIfAborted();
  const url = safeVideoURL(file.url, location.origin),
    video = el("video");
  video.controls = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("aria-label", "Generated video");
  const state = el("p", "Checking video playback…");
  box.append(state, video);
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      video.onloadeddata = null;
      video.onerror = null;
    };
    const fail = (message) => {
      cleanup();
      video.remove();
      reject(Error(message));
    };
    const abort = () => {
      cleanup();
      video.removeAttribute("src");
      video.load();
      video.remove();
      reject(new DOMException("Stopped", "AbortError"));
    };
    const timer = setTimeout(
      () =>
        fail("Video playback could not be verified. Try retrieving the saved job again; the provider link may have expired."),
      20000,
    );
    signal.addEventListener("abort", abort, { once: true });
    video.onloadeddata = () => {
      if (
        !video.videoWidth ||
        !video.videoHeight ||
        !Number.isFinite(video.duration) ||
        video.duration <= 0
      )
        return fail("The returned file is not a playable clip.");
      cleanup();
      resolve();
    };
    video.onerror = () =>
      fail("The returned video could not be played. Try retrieving the saved job again; the provider link may have expired.");
    video.src = url;
  });
  state.textContent = "Playable video ready.";
  const a = el("a", "Download video");
  a.href = url;
  if (new URL(url).pathname === '/gg-videos') a.href = url + '&download=1';
  a.download =
    file.mimeType === "video/webm" ? "gg-video.webm" : "gg-video.mp4";
  box.append(a);
}
window.addEventListener(
  "submit",
  async (event) => {
    if (event.target !== form || !videoIntent(input.value, mode.value)) return;
    if (q(".attachment-list")?.children.length) {
      if (mode.value === "gg-video") {
        event.preventDefault();
        event.stopImmediatePropagation();
        note(
          "Existing chat attachments remain attached. Remove them before preparing a video brief. Image input is available only when the video renderer supports it.",
        );
      }
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (active || submitting) {
      note(
        "A video request is already being tracked. Stop tracking before starting another.",
      );
      return;
    }
    const text = input.value.trim();
    if (!text) return;
    submitting = true;
    const startedVersion = version;
    open();
    await ready;
    if (startedVersion !== version) {
      submitting = false;
      return;
    }
    let next, image;
    try {
      image = await reference();
      next = cleanVideoBrief(
        {
          prompt: brief?.prompt || text,
          duration: Number(c("duration").value),
          aspect: c("aspect").value,
          image,
        },
        selectedCapabilities() || VIDEO_CAPABILITIES,
        !caps?.rendering,
      );
      if (brief && refinements.length >= 8)
        throw Error("Start a new video brief after eight refinements.");
    } catch (e) {
      submitting = false;
      note(e.message);
      return;
    }
    submitting = false;
    if (startedVersion !== version) return;
    const revision = brief ? [...refinements, text] : [];
    const draft = storyboard(next, revision);
    brief = next;
    refinements = revision;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    note("");
    const box = card(
      caps?.rendering
        ? "Your clip · rendering request"
        : "Your clip · storyboard only",
    );
    box.append(el("p", text, "gv-user"));
    if (!caps?.rendering) {
      box.append(
        el(
          "p",
          "No video generated. This is a local planning template, not AI footage, a preview or a rendering job.",
          "gv-state",
        ),
      );
      exportDraft(box, draft);
      return;
    }
    const run = version,
      controller = new AbortController();
    active = controller;
    c("stop").hidden = false;
    const state = el("p", "Submitting your rendering request…", "gv-state");
    state.setAttribute("role", "status");
    box.append(state);
    try {
      const created = await request("/gg-videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          action: "video-create",
          id: crypto.randomUUID(),
          provider: providerSelect.value,
          ...next,
          prompt: [
            next.prompt,
            ...revision.map((x) => "Refinement: " + x),
          ].join("\n"),
          ...(image ? { image } : {}),
        }),
      });
      if (typeof created.id !== "string" || !/^[-\w]{1,160}$/.test(created.id))
        throw Error("No valid rendering job was confirmed.");
      const file = await pollVideoJob({
        signal: controller.signal,
        read: (signal) =>
          request("/gg-videos?id=" + encodeURIComponent(created.id), {
            signal,
          }),
        onUpdate: (job) => {
          state.textContent =
            job.status +
            (job.progress === null ? "" : " · " + job.progress + "%");
        },
      });
      await playback(box, file, controller.signal);
      state.textContent = "Rendering completed and playback verified.";
    } catch (e) {
      state.textContent =
        e.name === "AbortError"
          ? "Tracking stopped. Any submitted provider job may continue; cancellation was not confirmed."
          : e.message;
      exportDraft(box, draft);
    } finally {
      if (run === version) {
        active = null;
        c("stop").hidden = true;
      }
    }
  },
  true,
);
