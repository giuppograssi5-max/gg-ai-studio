import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../netlify/functions/media.mjs";
import { videoCapabilities } from '../lib/video-providers.mjs';
import {
  VIDEO_CAPABILITIES,
  cleanVideoBrief,
  storyboard,
  pollVideoJob,
  safeVideoURL,
  videoIntent,
} from "../video-chat-core.js";
const available = {
  rendering: true,
  imageInput: false,
  durations: [6],
  aspects: ["16:9"],
};
const brief = {
  prompt: "A lighthouse in the rain",
  duration: 6,
  aspect: "16:9",
};
test("media handler reports provider configuration and routes configured rendering to its dedicated endpoint", async () => {
  const r = await handler(
    new Request("https://example.test/gg-media?capabilities=video"),
  );
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), videoCapabilities());
  const response = await handler(
    new Request("https://example.test/gg-media", {
      method: "POST",
      body: JSON.stringify({ action: "video-create", ...brief }),
    }),
  );
  if (videoCapabilities().rendering) {
    assert.equal(response.status, 307);
    assert.equal(response.headers.get('location'), '/gg-videos');
  } else {
    assert.equal(response.status, 501);
    assert.equal((await response.json()).code, "video_not_configured");
  }
  assert.equal(
    (
      await handler(
        new Request("https://example.test/gg-media?videoJob=not-a-job"),
      )
    ).status,
    405,
  );
});
test("supported settings are exact; unavailable rendering and image input never acquire capabilities from still images", () => {
  assert.deepEqual(cleanVideoBrief(brief, available), brief);
  assert.throws(() => cleanVideoBrief(brief, VIDEO_CAPABILITIES), /duration/);
  for (const input of [
    { duration: 7 },
    { duration: "6" },
    { aspect: "1:1" },
    { image: { mimeType: "image/png", data: "AAAA" } },
    { prompt: "x".repeat(4001) },
  ])
    assert.throws(() => cleanVideoBrief({ ...brief, ...input }, available));
  assert.throws(
    () =>
      cleanVideoBrief(
        { ...brief, image: { mimeType: "image/gif", data: "bad" } },
        { ...available, imageInput: true },
      ),
    /Invalid/,
  );
  assert.match(
    storyboard(cleanVideoBrief(brief, VIDEO_CAPABILITIES, true), [
      "Make the light warmer",
    ]),
    /NOT A GENERATED VIDEO/,
  );
  assert.match(
    storyboard(brief, ["Make the light warmer"]),
    /Refinement notes[\s\S]*Make the light warmer/,
  );
  assert.throws(() => storyboard(brief, Array(9).fill("more")), /eight/);
});
test("mock renderer: reports only provider progress and stops polling on playable-file success", async () => {
  const updates = [];
  let calls = 0;
  const jobs = [
    { status: "queued", progress: 0 },
    { status: "running", progress: 42 },
    {
      status: "succeeded",
      video: { url: "/gg-media?asset=mock", mimeType: "video/mp4" },
    },
  ];
  const file = await pollVideoJob({
    read: async () => {
      calls++;
      return jobs.shift();
    },
    wait: async () => {},
    onUpdate: (x) => updates.push(x),
  });
  assert.equal(calls, 3);
  assert.equal(file.mimeType, "video/mp4");
  assert.deepEqual(
    updates.map((x) => x.progress),
    [0, 42, null],
  );
});
test("mock renderer: failure, cancellation, invalid output and network errors terminate polling", async () => {
  for (const job of [
    { status: "failed" },
    { status: "cancelled" },
    { status: "unknown" },
    { status: "succeeded" },
    { status: "succeeded", video: { url: "/x.png", mimeType: "image/png" } },
  ]) {
    let count = 0;
    await assert.rejects(
      pollVideoJob({
        read: async () => {
          count++;
          return job;
        },
        wait: async () => {},
      }),
    );
    assert.equal(count, 1);
  }
  let count = 0;
  await assert.rejects(
    pollVideoJob({
      read: async () => {
        count++;
        throw Error("Offline");
      },
    }),
    /Offline/,
  );
  assert.equal(count, 1);
});
test("mock renderer: timeout and user stop are bounded and never manufacture success", async () => {
  let count = 0;
  await assert.rejects(
    pollVideoJob({
      read: async () => {
        count++;
        return { status: "running", progress: 500 };
      },
      maxPolls: 3,
      wait: async () => {},
    }),
    /timed out/,
  );
  assert.equal(count, 3);
  const controller = new AbortController();
  count = 0;
  await assert.rejects(
    pollVideoJob({
      signal: controller.signal,
      read: async () => {
        count++;
        controller.abort();
        return { status: "queued" };
      },
    }),
    { name: "AbortError" },
  );
  assert.equal(count, 1);
  await assert.rejects(
    pollVideoJob({
      signal: controller.signal,
      read: async () => {
        throw Error("must not call");
      },
    }),
    { name: "AbortError" },
  );
});
test("rendered media URL is restricted and existing specialized modes retain their handlers", () => {
  assert.equal(
    safeVideoURL("/gg-media?asset=one", "https://example.test"),
    "https://example.test/gg-media?asset=one",
  );
  for (const url of [
    "javascript:alert(1)",
    "https://evil.test/v.mp4",
    "//evil.test/v.mp4",
  ])
    assert.throws(() => safeVideoURL(url, "https://example.test"));
  assert.equal(videoIntent("Create a video about the ocean", "auto"), true);
  assert.equal(videoIntent("make it darker", "gg-video"), true);
  assert.equal(videoIntent("Create a video", "media-create"), false);
  assert.equal(videoIntent("create a video script", "auto"), false);
});
