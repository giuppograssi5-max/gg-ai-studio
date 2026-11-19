import { IMAGE_TYPES, MAX_PHOTO_CHARS } from "./media-core.js";
// Native rendering is unavailable in the existing media integration. Never infer it from image support.
export const VIDEO_CAPABILITIES = Object.freeze({
  rendering: false,
  imageInput: false,
  durations: [],
  aspects: [],
  reason:
    "Native video rendering is not configured. Existing Photo & Video AI makes still-image slideshow shorts. You can prepare and export a storyboard here.",
});
export const PLAN_DURATIONS = [6, 10, 15, 30];
export const PLAN_ASPECTS = ["16:9", "9:16", "1:1"];
export function cleanVideoBrief(body, capabilities, planning = false) {
  if (
    typeof body?.prompt !== "string" ||
    !body.prompt.trim() ||
    body.prompt.length > 4000
  )
    throw Error("Describe a clip in 1–4,000 characters.");
  const durations = planning ? PLAN_DURATIONS : capabilities.durations;
  const aspects = planning ? PLAN_ASPECTS : capabilities.aspects;
  if (!durations?.includes(body.duration))
    throw Error("Unsupported duration. Choose an available option.");
  if (!aspects?.includes(body.aspect))
    throw Error("Unsupported aspect ratio. Choose an available option.");
  if (body.image && !capabilities.imageInput)
    throw Error(
      "Reference images are not supported by the current video configuration.",
    );
  if (
    body.image &&
    (!IMAGE_TYPES.includes(body.image.mimeType) ||
      typeof body.image.data !== "string" ||
      !body.image.data ||
      body.image.data.length > MAX_PHOTO_CHARS ||
      !/^[A-Za-z0-9+/=]+$/.test(body.image.data))
  )
    throw Error("Invalid reference image.");
  return {
    prompt: body.prompt.trim(),
    duration: body.duration,
    aspect: body.aspect,
  };
}
export function storyboard(brief, refinements = []) {
  if (
    refinements.length > 8 ||
    refinements.some(
      (x) => typeof x !== "string" || !x.trim() || x.length > 4000,
    )
  )
    throw Error("Start a new video brief after eight refinements.");
  const directives = refinements.length
    ? "\n\nRefinement notes (apply to every shot):\n" +
      refinements.map((x, i) => `${i + 1}. ${x}`).join("\n")
    : "";
  const third = brief.duration / 3;
  return `# GG VIDEO / STORYBOARD & PROMPT\n\nLOCAL PLANNING TEMPLATE — NOT A GENERATED VIDEO\nNo video renderer was called. These are creative directions, not rendered frames.\n\nTarget: ${brief.duration} seconds · ${brief.aspect} (planning preferences only)\n\n## Master prompt\n${brief.prompt}${directives}\n\n## 01 / Establish · 0–${third.toFixed(1)}s\nIntroduce the subject and setting from the master prompt. Establish the intended light and camera position.\n\n## 02 / Develop · ${third.toFixed(1)}–${(third * 2).toFixed(1)}s\nFocus on one action or detail from the brief. Keep visual continuity and apply all refinement notes.\n\n## 03 / Resolve · ${(third * 2).toFixed(1)}–${brief.duration}s\nFinish with a clear final composition. Leave room for a closing line only if requested.\n\n## Before rendering\nReview motion, audio, rights and any on-screen text. Duration, aspect ratio and image input depend on the renderer eventually used.\n`;
}
export function videoIntent(prompt, mode) {
  const video = /\b(video|clip|film|filmato|animazione|animation|cartone|reels?|shorts?)\b/i.exec(prompt);
  const text = /\b(caption|copione|testo|description|descrizione|post)\b/i.exec(prompt);
  return (
    mode === "gg-video" ||
    (mode === "auto" &&
      /\b(crea\w*|genera\w*|create|generate|make)\b/i.test(prompt) &&
      !!video &&
      !/\b(script|storyboard|copione)\b/i.test(prompt) &&
      (!text || video.index < text.index))
  );
}
export function safeVideoURL(value, origin) {
  const u = new URL(value, origin);
  if (
    u.origin !== origin ||
    u.username ||
    u.password ||
    !["http:", "https:"].includes(u.protocol)
  )
    throw Error("The video file must use an authorized same-site media URL.");
  return u.href;
}
const pause = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted)
      return reject(new DOMException("Stopped", "AbortError"));
    const done = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(done, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Stopped", "AbortError"));
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
// A bounded lifecycle for a renderer's real job responses. Production never starts it without capability support.
export async function pollVideoJob({
  read,
  signal,
  onUpdate = () => {},
  wait = pause,
  maxPolls = 90,
  interval = 4000,
}) {
  for (let i = 0; i < maxPolls; i++) {
    signal?.throwIfAborted();
    const job = await read(signal);
    signal?.throwIfAborted();
    if (
      !["queued", "running", "succeeded", "failed", "cancelled"].includes(
        job?.status,
      )
    )
      throw Error("Unrecognized video job status. Tracking stopped.");
    onUpdate({
      status: job.status,
      progress:
        Number.isFinite(job.progress) &&
        job.progress >= 0 &&
        job.progress <= 100
          ? job.progress
          : null,
    });
    if (job.status === "failed")
      throw Error(typeof job.error === 'string' && job.error.length <= 400 && job.error
        ? job.error : "Video rendering failed. Your brief is still available.");
    if (job.status === "cancelled")
      throw Error("Video rendering was cancelled.");
    if (job.status === "succeeded") {
      if (
        !job.video?.url ||
        !["video/mp4", "video/webm"].includes(job.video.mimeType)
      )
        throw Error("The job did not return a playable video file.");
      return job.video;
    }
    if (i + 1 < maxPolls) await wait(interval, signal);
  }
  throw Error("Video tracking timed out. No completed video was confirmed.");
}
