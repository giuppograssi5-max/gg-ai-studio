import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  validatePublicPost,
  publicPost,
  shareIntents,
} from "../community-public-core.js";
import { remixURL } from "../creator-core.js";
const origin = "https://gg-ai-studio.netlify.app";
const brief = {
  title: "Original work",
  audience: "Artists",
  message: "Make space for new ideas",
  objective: "Invite feedback",
  cta: "Join in",
};
const post = {
  alias: "Luna",
  content: "My original idea",
  publicConsent: true,
};
test("public consent, alias, privacy, size and explicit brief opt-in", () => {
  assert.equal(
    validatePublicPost({ ...post, remixLink: "https://evil.test" }, origin)
      .remixLink,
    null,
  );
  for (const bad of [
    { publicConsent: false },
    { alias: "person@example.com" },
    { content: "x".repeat(1001) },
    { content: "Email me at person@example.com" },
  ])
    assert.throws(() => validatePublicPost({ ...post, ...bad }, origin));
  const good = remixURL(brief, origin + "/");
  assert.equal(
    validatePublicPost({ ...post, shareBrief: true, remixLink: good }, origin)
      .remixLink,
    good,
  );
  for (const bad of [
    good.replace(origin, "https://evil.test"),
    good.replace("/#", "/community#"),
    origin + "/#creator=%",
    origin + "/?private=yes#creator=x",
  ])
    assert.throws(() =>
      validatePublicPost({ ...post, shareBrief: true, remixLink: bad }, origin),
    );
});
test("public projection never exposes account, reports or private profile", () => {
  const m = {
    id: "post-1234",
    userId: "owner",
    authorName: "Luna",
    content: "hello",
    createdAt: new Date(),
    remixLink: null,
    email: "private",
    reports: 4,
  };
  assert.deepEqual(Object.keys(publicPost(m, null)), [
    "id",
    "author",
    "content",
    "createdAt",
    "remixLink",
    "mine",
    "canRemove",
  ]);
  assert.equal(publicPost(m, null).canRemove, false);
  assert.equal(publicPost(m, "other").canRemove, false);
  assert.equal(publicPost(m, "owner").canRemove, true);
  assert.equal(publicPost(m, "mod", true).canRemove, true);
});
test("share intents encode editable text and canonical link", () => {
  const s = shareIntents("Ciao & hello", origin + "/community");
  assert.match(s.whatsapp, /Ciao%20%26%20hello/);
  assert.equal(
    new URL(s.linkedin).searchParams.get("url"),
    origin + "/community",
  );
  assert.equal(new URL(s.x).searchParams.get("text"), "Ciao & hello");
});
// Execute the real handler with isolated dependencies. No network or production writes.
let user = null,
  rows = [],
  member,
  allowed = true,
  removed = [],
  inserted = [],
  verdict = true,
  reportAdded = true;
let feedFilter;
const table = new Proxy({}, { get: (_, key) => key });
const db = {
  select: () => ({
    from: () => ({
      where: (predicate) => ({
        then: (resolve) => resolve(member ? [member] : []),
        orderBy: () => {
          feedFilter = new PgDialect().sqlToQuery(predicate);
          return { limit: async () => rows };
        },
      }),
    }),
  }),
  update: () => ({
    set: () => ({
      where: () => ({
        returning: async () => (allowed ? [{ id: "member", reports: 1 }] : []),
      }),
    }),
  }),
  insert: () => ({
    values: (v) => {
      inserted.push(v);
      return {
        returning: async () => [{ ...v, createdAt: new Date() }],
        onConflictDoNothing: () => ({
          returning: async () => (reportAdded ? [{ id: "post" }] : []),
        }),
      };
    },
  }),
  delete: () => ({
    where: () => ({
      returning: async () => removed,
      then: (resolve) => resolve([]),
    }),
  }),
};
globalThis.__cp = {
  getUser: async () => user,
  db,
  table,
  moderate: async () => ({ allow: verdict }),
};
const result = await build({
  entryPoints: ["netlify/functions/community.mts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  plugins: [
    {
      name: "isolated",
      setup(b) {
        b.onResolve(
          {
            filter:
              /(@netlify\/identity|db\/index\.js|db\/schema\.js|lib\/community-moderate\.mjs)$/,
          },
          (a) => ({ path: a.path, namespace: "mock" }),
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, () => ({
          contents:
            'export const getUser=globalThis.__cp.getUser,db=globalThis.__cp.db,communityMembers=globalThis.__cp.table,communityMessages=globalThis.__cp.table,communityReports=globalThis.__cp.table,moderate=globalThis.__cp.moderate,MODEL="mock";',
          loader: "js",
        }));
      },
    },
  ],
});
const { default: handler } = await import(
  "data:text/javascript;base64," +
    Buffer.from(result.outputFiles[0].text).toString("base64")
);
const request = (method = "GET", body, path = "/gg-community?feed=public") =>
  new Request(origin + path, {
    method,
    ...(body && {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  });
test("guest feed, authenticated publishing, rate limit and removal permissions", async () => {
  rows = [];
  let r = await handler(request());
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).messages, []);
  assert.deepEqual(feedFilter.params, ["isPublic", true, "hidden", false]);
  assert.equal(
    (await handler(request("POST", { ...post, action: "publish-public" })))
      .status,
    401,
  );
  user = { id: "member", roles: [] };
  member = { userId: "member", rulesVersion: 1, banned: false };
  r = await handler(request("POST", { ...post, action: "publish-public" }));
  assert.equal(r.status, 200);
  assert.equal(inserted.at(-1).isPublic, true);
  assert.equal(inserted.at(-1).authorName, "Luna");
  allowed = false;
  assert.equal(
    (await handler(request("POST", { ...post, action: "publish-public" })))
      .status,
    429,
  );
  allowed = true;
  member.banned = true;
  assert.equal(
    (await handler(request("POST", { ...post, action: "publish-public" })))
      .status,
    403,
  );
  member.banned = false;
  verdict = false;
  assert.equal(
    (await handler(request("POST", { ...post, action: "publish-public" })))
      .status,
    422,
  );
  verdict = true;
  assert.equal(
    (await handler(request("DELETE", null, "/gg-community?id=post-1234")))
      .status,
    404,
  );
  removed = [{ id: "post-1234" }];
  assert.equal(
    (await handler(request("DELETE", null, "/gg-community?id=post-1234")))
      .status,
    200,
  );
  removed = [];
  user.roles = ["admin"];
  assert.equal(
    (await handler(request("DELETE", null, "/gg-community?id=post-1234")))
      .status,
    200,
  );
});

test("reports are deduplicated, limited, and require membership", async () => {
  user = { id: "reporter", roles: [] };
  member = {
    userId: "author",
    id: "post-1234",
    rulesVersion: 1,
    banned: false,
    hidden: false,
  };
  allowed = true;
  reportAdded = false;
  let response = await handler(
    request("POST", { action: "report", id: "post-1234", reason: "privacy" }),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).already, true);
  allowed = false;
  assert.equal(
    (await handler(request("POST", { action: "report", id: "post-1234" })))
      .status,
    429,
  );
  allowed = true;
  member.banned = true;
  assert.equal(
    (await handler(request("POST", { action: "report", id: "post-1234" })))
      .status,
    403,
  );
  member = undefined;
  assert.equal(
    (await handler(request("POST", { action: "publish-public", ...post })))
      .status,
    403,
  );
});
