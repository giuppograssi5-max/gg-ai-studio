// Run against netlify dev on port 8889; all API calls are intercepted, never production writes.
import assert from "node:assert/strict";
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || "playwright"
);
const browser = await chromium.launch({ headless: true });
let signedIn = false,
  posts = [],
  fail = false,
  published = [];
const context = await browser.newContext({
  permissions: ["clipboard-read", "clipboard-write"],
});
await context.route("**/*", async (route) => {
  const r = route.request(),
    u = new URL(r.url());
  if (u.origin !== "http://localhost:8889") return route.abort();
  if (u.pathname === "/gg-community") {
    if (r.method() === "DELETE") {
      posts = [];
      return route.fulfill({ json: { ok: true } });
    }
    if (r.method() === "POST") {
      const b = r.postDataJSON();
      published.push(b);
      if (b.action === "publish-public")
        posts = [
          {
            id: "test-post-123",
            author: b.alias,
            content: b.content,
            createdAt: new Date().toISOString(),
            mine: true,
            canRemove: true,
          },
        ];
      return route.fulfill({ json: { ok: true } });
    }
    if (u.searchParams.get("feed") === "public") {
      if (fail)
        return route.fulfill({ status: 503, json: { error: "Unavailable" } });
      return route.fulfill({ json: { signedIn, messages: posts } });
    }
    return route.fulfill({ status: 401, json: { error: "Sign in" } });
  }
  if (
    u.pathname.startsWith("/gg-") ||
    u.pathname.startsWith("/.netlify/identity") ||
    u.pathname.startsWith("/api/")
  )
    return route.fulfill({ status: 401, json: { error: "Sign in" } });
  return route.continue();
});
const p = await context.newPage();
await p.goto("http://localhost:8889/community");
await p.locator(".cp h1").waitFor();
assert.match(await p.title(), /Community/);
await p.getByText("Nessun post pubblico, per ora.", { exact: false }).waitFor();
await p.reload();
await p.locator(".cp h1").waitFor();
assert.equal(
  await p.locator("link[rel=canonical]").getAttribute("href"),
  "https://gg-ai-studio.netlify.app/community",
);
await p.getByRole("button", { name: "English", exact: true }).click();
assert.match(await p.locator(".cp h1").textContent(), /Ideas grow/);
await p.locator(".cp-share summary").click();
await p.locator("#cp-launch").fill("Original launch & ideas");
assert.match(
  await p.locator("#cp-intents a").first().getAttribute("href"),
  /Original%20launch%20%26%20ideas/,
);
await p.locator("#cp-copy").click();
await p.getByText("Link copied.", { exact: true }).waitFor();
assert.equal(
  await p.evaluate(() => navigator.clipboard.readText()),
  "https://gg-ai-studio.netlify.app/community",
);
await p.evaluate(() => {
  navigator.share = async (d) => (window.__shared = d);
});
await p.locator("#cp-share").click();
assert.equal(
  await p.evaluate(() => window.__shared.text),
  "Original launch & ideas",
);
signedIn = true;
posts = [
  {
    id: "mock-public-123",
    author: "Chosen alias",
    content: "<img src=x onerror=alert(1)>",
    createdAt: new Date().toISOString(),
    remixLink:
      "http://localhost:8889/#creator=" +
      encodeURIComponent(
        JSON.stringify({
          title: "Browser brief",
          audience: "Artists",
          message: "Original work",
          objective: "Feedback",
          cta: "Join",
        }),
      ),
    canRemove: false,
  },
];
await p.locator("#cp-refresh").click();
await p.locator(".cp-post").waitFor();
assert.equal(await p.locator(".cp-post img").count(), 0);
await p.getByRole("link", { name: "Remix in Creator Studio ↗" }).click();
await p.locator("#cr-form [name=title]").waitFor();
assert.equal(
  await p.locator("#cr-form [name=title]").inputValue(),
  "Browser brief",
);
await p.goBack();
await p.locator(".cp-post").waitFor();
await p.locator(".cp-post button").click();
await p.locator(".cp-post select").selectOption("privacy");
await p.getByRole("button", { name: "Submit report", exact: true }).click();
assert.equal(published.at(-1).action, "report");
await p.locator("[name=alias]").fill("Test alias");
await p.locator("[name=content]").fill("An original draft for testing");
await p.locator("[name=publicConsent]").check();
await p.locator("#cp-compose [type=submit]").click();
await p.getByText("Published.", { exact: true }).waitFor();
assert.equal(published.at(-1).publicConsent, true);
assert.equal(published.at(-1).shareBrief, false);
await p.getByRole("button", { name: "Remove", exact: true }).click();
await p.getByText("No public posts yet.", { exact: false }).waitFor();
fail = true;
await p.locator("#cp-refresh").click();
await p
  .getByText("Feed unavailable. Use Refresh to retry.", { exact: true })
  .waitFor();
fail = false;
for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 390, height: 844 },
]) {
  await p.setViewportSize(viewport);
  await p.goto("http://localhost:8889/community");
  await p.locator(".cp h1").waitFor();
  assert.equal(
    await p.locator(".cp").evaluate((n) => n.scrollWidth <= n.clientWidth + 1),
    true,
  );
  await p.screenshot({
    path: "/tmp/gg-community-" + viewport.width + ".png",
    fullPage: true,
  });
}
await p.goto("http://localhost:8889/");
await p.locator(".menu-toggle").click();
await p.locator(".sidebar .nav").filter({ hasText: "Community" }).click();
await p.waitForURL("**/community");
await p.locator(".cp h1").waitFor();
console.log(
  "PASS: direct link/refresh, guest feed, English, desktop/mobile, escaped content, share actions, signed-in publishing, reports, removal, errors and sidebar navigation. All APIs mocked.",
);
await browser.close();
