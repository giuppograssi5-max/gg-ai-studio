// GG · Movies & TV series studio: saved productions, their images and the public showcase.
// GET    /gg-studio/projects            -> { projects }           (mine)
// GET    /gg-studio/projects?id=...     -> { project }            (mine, or anyone's once published)
// POST   /gg-studio/projects { action: 'save', id?, project }   -> { id }
// POST   /gg-studio/projects { action: 'publish', id, author } | { action: 'unpublish', id }
// DELETE /gg-studio/projects?id=...
// PUT    /gg-studio/image?id=...&slot=...  (image bytes)    GET same URL -> image
// GET    /gg-studio/showcase            -> { projects }           (published by everyone)
import { getUser } from "@netlify/identity";
import { getStore } from "@netlify/blobs";
import { and, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { studioProjects } from "../../db/schema.js";
import { cleanProject, cleanScript, SLOT, LIMITS } from "../../studio-core.js";
import { cleanName } from "../../community-core.js";
import { moderate } from "../../lib/community-moderate.mjs";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
const ID = /^[A-Za-z0-9-]{8,64}$/;
const MAX_PROJECTS = 60;
const images = () => getStore({ name: "studio-images", consistency: "strong" });
type Row = typeof studioProjects.$inferSelect;

const summary = (p: Row) => ({
  id: p.id, title: p.title, format: p.format, logline: (p.script as any)?.logline || "", genre: (p.brief as any)?.genre || "",
  poster: p.images.includes("poster") ? `/gg-studio/image?id=${p.id}&slot=poster&v=${+p.updatedAt}` : null,
  published: p.published, author: p.published ? p.authorName : undefined, updatedAt: p.updatedAt, publishedAt: p.publishedAt,
});
const full = (p: Row, mine: boolean) => ({ ...summary(p), brief: p.brief, script: p.script, images: p.images, mine, version: +p.updatedAt });

async function projects(req: Request, url: URL) {
  const user = await getUser();
  const id = url.searchParams.get("id");
  if (id !== null && !ID.test(id)) return reply({ error: "Invalid production" }, 400);

  if (req.method === "GET" && id) {
    const [p] = await db.select().from(studioProjects).where(eq(studioProjects.id, id));
    if (!p || (!p.published && p.userId !== user?.id)) return reply({ error: "Not found" }, 404);
    return reply({ project: full(p, p.userId === user?.id) });
  }
  if (!user) return reply({ error: "Sign in to save your productions." }, 401);
  const mine = (pid: string) => and(eq(studioProjects.id, pid), eq(studioProjects.userId, user.id));

  if (req.method === "GET") {
    const rows = await db.select().from(studioProjects).where(eq(studioProjects.userId, user.id)).orderBy(desc(studioProjects.updatedAt)).limit(MAX_PROJECTS);
    return reply({ projects: rows.map(summary) });
  }
  if (req.method === "DELETE") {
    if (!id) return reply({ error: "Invalid production" }, 400);
    const [gone] = await db.delete(studioProjects).where(mine(id)).returning();
    if (!gone) return reply({ error: "Not found" }, 404);
    const store = images();
    await Promise.allSettled(gone.images.map(slot => store.delete(`${id}/${slot}`)));
    return reply({ ok: true });
  }
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length")) > 400000) return reply({ error: "Production too large" }, 413);
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return reply({ error: "Invalid request" }, 400);

  if (body.action === "save") {
    let clean;
    try { clean = cleanProject(body.project); } catch (e: any) { return reply({ error: e.message }, 400); }
    const values = { title: clean.script.title, format: clean.brief.format, brief: clean.brief, script: clean.script, updatedAt: new Date() };
    if (body.id) {
      if (!ID.test(body.id)) return reply({ error: "Invalid production" }, 400);
      const [prior] = await db.select().from(studioProjects).where(mine(body.id));
      if (!prior) return reply({ error: "Not found" }, 404);
      // A published script that changes goes back to private until it's published (and checked) again.
      // jsonb reorders keys, so compare both after the same cleaning.
      let changed = true;
      try { changed = JSON.stringify(cleanScript(prior.script)) !== JSON.stringify(clean.script); } catch {}
      const [row] = await db.update(studioProjects).set({ ...values, published: prior.published && !changed }).where(mine(body.id)).returning();
      return reply({ id: row.id, images: row.images, published: row.published });
    }
    const count = await db.$count(studioProjects, eq(studioProjects.userId, user.id));
    if (count >= MAX_PROJECTS) return reply({ error: `You can keep up to ${MAX_PROJECTS} productions. Delete one to save a new one.` }, 409);
    const [row] = await db.insert(studioProjects).values({ id: randomUUID(), userId: user.id, ...values }).returning();
    return reply({ id: row.id, images: row.images });
  }

  if (!ID.test(body.id || "")) return reply({ error: "Invalid production" }, 400);
  const [p] = await db.select().from(studioProjects).where(eq(studioProjects.id, body.id));
  const admin = !!user.roles?.includes("admin");

  if (body.action === "unpublish") {
    if (!p || (p.userId !== user.id && !admin)) return reply({ error: "Not found" }, 404);
    await db.update(studioProjects).set({ published: false }).where(eq(studioProjects.id, p.id));
    return reply({ ok: true });
  }
  if (body.action === "publish") {
    if (!p || p.userId !== user.id) return reply({ error: "Not found" }, 404);
    let author: string;
    try { author = cleanName(body.author); } catch (e: any) { return reply({ error: e.message }, 400); }
    const s = p.script as any;
    const text = [author, s.title, s.logline, s.synopsis, ...(s.episodes || []).map((e: any) => `${e.title}: ${e.summary}`)].join("\n").slice(0, 6000);
    let verdict;
    try { verdict = await moderate(text, "general"); }
    catch { return reply({ error: "Productions can’t be checked right now, so they can’t be published. Try again in a moment." }, 503); }
    if (!verdict.allow) return reply({ error: "This production can’t be published because it doesn’t follow the community rules.", reason: verdict.reason }, 422);
    await db.update(studioProjects).set({ published: true, authorName: author, publishedAt: new Date() }).where(eq(studioProjects.id, p.id));
    return reply({ ok: true });
  }
  return reply({ error: "Unknown action" }, 400);
}

async function image(req: Request, url: URL) {
  const id = url.searchParams.get("id") || "", slot = url.searchParams.get("slot") || "";
  if (!ID.test(id) || !SLOT.test(slot)) return reply({ error: "Invalid image" }, 400);
  const user = await getUser();
  const [p] = await db.select().from(studioProjects).where(eq(studioProjects.id, id));
  const mine = !!p && !!user && p.userId === user.id;

  if (req.method === "GET") {
    if (!p || (!p.published && !mine) || !p.images.includes(slot)) return reply({ error: "Not found" }, 404);
    const blob = await images().getWithMetadata(`${id}/${slot}`, { type: "arrayBuffer" });
    if (!blob) return reply({ error: "Not found" }, 404);
    return new Response(blob.data, { headers: { "Content-Type": String(blob.metadata.type || "image/png"), "Cache-Control": p.published ? "public, max-age=300" : "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
  }
  if (req.method !== "PUT") return reply({ error: "Method not allowed" }, 405);
  if (!user) return reply({ error: "Sign in to save your productions." }, 401);
  if (!mine) return reply({ error: "Not found" }, 404);
  const type = (req.headers.get("content-type") || "").split(";")[0];
  if (!["image/png", "image/jpeg", "image/webp"].includes(type)) return reply({ error: "Unsupported image" }, 415);
  if (Number(req.headers.get("content-length")) > LIMITS.imageBytes) return reply({ error: "Image too large" }, 413);
  const data = await req.arrayBuffer();
  if (!data.byteLength || data.byteLength > LIMITS.imageBytes) return reply({ error: "Image too large" }, 413);
  if (!p.images.includes(slot) && p.images.length >= LIMITS.imagesPerProject) return reply({ error: "This production has too many images." }, 409);
  await images().set(`${id}/${slot}`, data, { metadata: { type } });
  if (!p.images.includes(slot)) await db.update(studioProjects).set({ images: [...p.images, slot] }).where(eq(studioProjects.id, id));
  return reply({ ok: true });
}

async function showcase() {
  const rows = await db.select().from(studioProjects).where(eq(studioProjects.published, true)).orderBy(desc(studioProjects.publishedAt)).limit(48);
  return reply({ projects: rows.map(summary) });
}

export default async (req: Request) => {
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) return reply({ error: "Invalid origin" }, 403);
  const url = new URL(req.url);
  try {
    if (url.pathname === "/gg-studio/image") return await image(req, url);
    if (url.pathname === "/gg-studio/showcase") return req.method === "GET" ? await showcase() : reply({ error: "Method not allowed" }, 405);
    return await projects(req, url);
  } catch (error) {
    console.error("studio", error);
    return reply({ error: "The studio is unavailable right now. Try again." }, 503);
  }
};

export const config = { path: ["/gg-studio/projects", "/gg-studio/image", "/gg-studio/showcase"] };
