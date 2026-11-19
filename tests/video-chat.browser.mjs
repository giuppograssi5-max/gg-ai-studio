// All service responses are mocked. The playable WebM fixture is recorded locally in the test browser.
import assert from "node:assert/strict";
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("Browser error:", e.message));
const fixture = Buffer.from(
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#89a562";
    ctx.fillRect(0, 0, 64, 64);
    const stream = canvas.captureStream(10);
    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
    });
    recorder.ondataavailable = (e) => chunks.push(e.data);
    recorder.start();
    const timer = setInterval(() => {
      ctx.fillRect(0, 0, 64, 64);
    }, 50);
    await new Promise((resolve) => setTimeout(resolve, 400));
    recorder.stop();
    await stopped;
    clearInterval(timer);
    stream.getTracks().forEach((t) => t.stop());
    return btoa(
      String.fromCharCode(
        ...new Uint8Array(await new Blob(chunks).arrayBuffer()),
      ),
    );
  }),
  "base64",
);
let scenario = "unavailable",
  polls = 0,
  submissions = [];
await context.route("**/*", async (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== "http://localhost:8889") return route.abort();
  if (["/gg-media", "/gg-videos"].includes(u.pathname)) {
    if (u.searchParams.has("capabilities"))
      return route.fulfill({
        json:
          scenario === "unavailable"
            ? {
                rendering: false,
                imageInput: false,
                durations: [],
                aspects: [],
                reason: "Native video rendering is not configured.",
              }
            : {
                rendering: true,
                imageInput: false,
                durations: [5, 10],
                aspects: ["16:9", "9:16"],
                providers: [
                  { id: "runway", configured: true, durations: [5, 10], aspects: ["16:9", "9:16"] },
                  { id: "luma", configured: true, durations: [5, 9], aspects: ["16:9", "9:16", "1:1"] },
                ],
                reason: "MOCK RENDERER — browser test only",
              },
      });
    if (u.pathname === '/gg-videos' && r.method() === 'GET' && !u.searchParams.has('id') && !u.searchParams.has('asset'))
      return route.fulfill({ json: { jobs: [{ id: 'mock-saved', provider: 'luma', prompt: 'Saved lighthouse scene', duration: 9, aspect: '1:1', status: 'succeeded' }] } });
    if (u.searchParams.has("asset"))
      return route.fulfill({ body: fixture, contentType: "video/webm" });
    if (r.method() === "POST") {
      submissions.push(r.postDataJSON());
      return route.fulfill({ json: { id: "mock-job" } });
    }
    if (u.searchParams.has("id")) {
      polls++;
      return route.fulfill({
        json:
          scenario === "failure"
            ? { status: "failed" }
            : scenario === "waiting"
              ? { status: "running", progress: 12 }
              : polls === 1
                ? { status: "running", progress: 37 }
                : {
                    status: "succeeded",
                    video: {
                      url: "/gg-media?asset=mock-fixture",
                      mimeType: "video/webm",
                    },
                  },
      });
    }
  }
  if (u.pathname === "/gg-community" && u.searchParams.get("feed") === "public")
    return route.fulfill({ json: { signedIn: false, messages: [] } });
  if (
    u.pathname.startsWith("/gg-") ||
    u.pathname.startsWith("/.netlify/identity") ||
    u.pathname.startsWith("/api/")
  )
    return route.fulfill({ status: 401, json: { error: "Sign in" } });
  return route.continue();
});
const open = async () => {
  await page.locator(".tools-toggle").click();
  await page
    .getByRole("button", { name: "Create video · Crea video", exact: false })
    .click();
  await page.locator(".gv-controls").waitFor();
};
const send = async (text) => {
  await page.locator("#prompt").fill(text);
  await page.locator("#chatform").evaluate((f) => f.requestSubmit());
};
await page.goto("http://localhost:8889/");
await open();
await page
  .getByText("Native video rendering is not configured.", { exact: true })
  .waitFor();
assert.equal(await page.locator("[data-v=image]").isDisabled(), true);
await send("A lighthouse in the rain");
await page.locator(".gv-card").waitFor();
assert.match(
  await page.locator(".gv-card").textContent(),
  /No video generated/,
);
assert.match(
  await page.locator(".gv-card textarea").inputValue(),
  /LOCAL PLANNING TEMPLATE/,
);
await send("Make the light warmer");
await page.waitForFunction(
  () => document.querySelectorAll(".gv-card").length === 2,
);
assert.match(
  await page.locator(".gv-card textarea").last().inputValue(),
  /Make the light warmer/,
);
assert.equal(submissions.length, 0);
assert.equal(polls, 0);
assert.equal(await page.locator(".gv-card video").count(), 0);
await page.locator("[data-v=duration]").evaluate((s) => {
  const o = new Option("99s", "99");
  s.add(o);
  s.value = "99";
});
await send("Unsupported duration");
await page
  .getByText("Unsupported duration. Choose an available option.", {
    exact: true,
  })
  .waitFor();
assert.equal(submissions.length, 0);
await page.locator("[data-v=duration]").selectOption("6");

let downloaded;
page.once("download", (d) => (downloaded = d));
await page.locator(".gv-card button").last().click({ timeout: 5000 });
await page.waitForTimeout(300);
assert.equal(downloaded?.suggestedFilename(), "gg-video-storyboard.md");
for (const width of [1440, 390]) {
  await page.setViewportSize({ width, height: 900 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  if (width < 760)
    await page.waitForFunction(() => document.querySelector(".sidebar").inert);
  assert.equal(
    await page
      .locator(".gv-controls")
      .evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
    true,
  );
  await page.screenshot({
    path: "/tmp/gg-video-" + width + ".png",
    fullPage: true,
    animations: "disabled",
  });
}
await page.locator("[data-v=exit]").click();
assert.equal(await page.locator(".gv-controls").isVisible(), false);
scenario = "success";
polls = 0;
await page.goto("http://localhost:8889/");
await open();
await page.locator("[data-v=provider]").selectOption("luma");
await page.locator("[data-v=duration]").selectOption("9");
await page.locator("[data-v=aspect]").selectOption("1:1");
await send("A lantern beside the sea");
await page
  .getByText("Rendering completed and playback verified.", { exact: true })
  .waitFor({ timeout: 15000 });
assert.equal(polls, 2);
assert.equal(submissions.at(-1).action, "video-create");
assert.equal(submissions.at(-1).duration, 9);
assert.equal(submissions.at(-1).provider, "luma");
assert.equal(submissions.at(-1).aspect, "1:1");
assert.equal(
  await page
    .locator(".gv-card video")
    .evaluate((v) => v.readyState >= 2 && v.videoWidth === 64),
  true,
);
await page.getByRole("link", { name: "Download video", exact: true }).waitFor();
const ended = polls;
await page.waitForTimeout(4200);
assert.equal(polls, ended);
await page.getByRole('button', { name: 'Retrieve my video jobs' }).click();
await page.locator('.gv-saved-job').waitFor();
await page.getByRole('button', { name: 'Open video', exact: true }).click();
await page.getByText('Video ready. Download it soon: provider links may expire.', { exact: true }).waitFor();
assert.equal(await page.locator('.gv-card video').count(), 2);
scenario = "failure";
polls = 0;
await page.goto("http://localhost:8889/");
await open();
await send("A lantern");
await page
  .getByText("Video rendering failed. Your brief is still available.", {
    exact: true,
  })
  .waitFor();
assert.equal(polls, 1);
assert.equal(await page.locator(".gv-card video").count(), 0);
assert.equal(
  await page.getByRole("link", { name: "Download video", exact: true }).count(),
  0,
);
assert.equal(await page.locator(".gv-card textarea").count(), 1);
scenario = "waiting";
polls = 0;
await page.goto("http://localhost:8889/");
await open();
await send("A lighthouse at dusk");
await page.getByText("running · 12%", { exact: true }).waitFor();
await page.locator('[data-v="stop"]').click();
await page
  .getByText(
    "Tracking stopped. Any submitted provider job may continue; cancellation was not confirmed.",
    { exact: true },
  )
  .waitFor();
const stoppedPolls = polls;
await page.waitForTimeout(4200);
assert.equal(polls, stoppedPolls);
assert.equal(
  await page.getByRole("link", { name: "Download video", exact: true }).count(),
  0,
);
await page.locator('[data-v="exit"]').click();
assert.equal(await page.locator("#creationmode").inputValue(), "chat");
await page.locator("#creationmode").evaluate((select) => {
  select.value = "media-create";
  select.dispatchEvent(new Event("change", { bubbles: true }));
});
await page.locator("#media:not(.hidden) #create-panel .mc-form").waitFor();
assert.equal(await page.locator("#media:not(.hidden)").count(), 1);
console.log(
  "PASS (MOCK service only): unavailable renderer, tool picker, local storyboard and follow-up export, desktop/mobile, real playable test fixture, success/failure, download gating and polling termination. No provider rendering invoked.",
);
await browser.close();
