// GG · Community chat for signed-in members who accepted the community rules.
// GET  /gg-community?room=general[&after=ISO]   -> { me, messages }
// POST /gg-community { action: 'join', name, accept, rulesVersion }
// POST /gg-community { action: 'send', room, content }
// POST /gg-community { action: 'report', id, reason }
// DELETE /gg-community?id=...   (author or admin)
import { MODEL, moderate } from "../../lib/community-moderate.mjs";
import { getUser } from "@netlify/identity";
import { and, asc, desc, eq, gt, gte, sql } from "drizzle-orm";
import { randomBytes, randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { communityMembers, communityMessages, communityReports } from "../../db/schema.js";
import {
  RULES_VERSION, REPORT_HIDE_THRESHOLD, REPORT_REASONS, isRoom, cleanText, cleanName,
  applyStrike, rateLimit,
} from "../../community-core.js";

import { validatePublicPost, publicPost } from "../../community-public-core.js";
export { MODEL, moderate };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
const ID = /^[A-Za-z0-9-]{8,64}$/;
type Member = typeof communityMembers.$inferSelect;

const publicMessage = (m: typeof communityMessages.$inferSelect, userId: string) =>
  ({ id: m.id, author: m.authorName, content: m.content, createdAt: m.createdAt, mine: m.userId === userId });

const status = (member: Member | undefined, admin: boolean) => member && {
  name: member.displayName,
  acceptedAt: member.acceptedAt,
  needsRules: member.rulesVersion < RULES_VERSION,
  mutedUntil: member.mutedUntil && member.mutedUntil > new Date() ? member.mutedUntil : null,
  banned: member.banned,
  strikes: member.lastStrikeAt && Date.now() - +member.lastStrikeAt < 864e5 ? member.strikes : 0,
  admin,
  handle: member.handle,
  city: member.city,
  bio: member.bio,
  allowDms: member.allowDms,
};

export default async (req: Request) => {
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) return reply({ error: "Invalid origin" }, 403);
  const user = await getUser();
  const publicFeed = new URL(req.url).searchParams.get("feed") === "public";
  if (req.method === "GET" && publicFeed) {
    try {
      const rows = await db.select().from(communityMessages).where(and(eq(communityMessages.isPublic, true), eq(communityMessages.hidden, false))).orderBy(desc(communityMessages.createdAt)).limit(60);
      return reply({ signedIn: !!user, messages: rows.map(m => publicPost(m, user?.id, !!user?.roles?.includes("admin"))) });
    } catch { return reply({ error: "Feed unavailable. Riprova tra poco." }, 503); }
  }
  if (!user) return reply({ error: "Sign in to talk with other members." }, 401);
  const admin = !!user.roles?.includes("admin");
  const url = new URL(req.url);
  try {
    const [member] = await db.select().from(communityMembers).where(eq(communityMembers.userId, user.id));

    if (req.method === "GET") {
      const me = status(member, admin);
      if (!me || me.needsRules) return reply({ me: me || null, messages: [] });
      const room = url.searchParams.get("room") || "general";
      if (!isRoom(room)) return reply({ error: "Unknown room" }, 400);
      const after = url.searchParams.get("after");
      const since = after ? new Date(after) : null;
      if (since && isNaN(+since)) return reply({ error: "Invalid time" }, 400);
      const visible = and(eq(communityMessages.room, room), eq(communityMessages.hidden, false));
      const rows = since
        ? await db.select().from(communityMessages).where(and(visible, gt(communityMessages.createdAt, since))).orderBy(asc(communityMessages.createdAt)).limit(100)
        : (await db.select().from(communityMessages).where(visible).orderBy(desc(communityMessages.createdAt)).limit(60)).reverse();
      return reply({ me, messages: rows.map(m => publicMessage(m, user.id)) });
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id") || "";
      if (!ID.test(id)) return reply({ error: "Invalid message" }, 400);
      // Authors delete their own messages for good; moderators hide other members' messages.
      const own = await db.delete(communityMessages).where(and(eq(communityMessages.id, id), eq(communityMessages.userId, user.id))).returning({ id: communityMessages.id });
      if (own.length) { await db.delete(communityReports).where(eq(communityReports.messageId, id)); return reply({ ok: true }); }
      if (!admin) return reply({ error: "Not found" }, 404);
      const hidden = await db.update(communityMessages).set({ hidden: true }).where(eq(communityMessages.id, id)).returning({ id: communityMessages.id });
      return hidden.length ? reply({ ok: true }) : reply({ error: "Not found" }, 404);
    }

    if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    if (Number(req.headers.get("content-length")) > 20000) return reply({ error: "Message too large" }, 413);
    const raw = await req.text();
    if (raw.length > 20000) return reply({ error: "Message too large" }, 413);
    const body = (() => { try { return JSON.parse(raw); } catch { return null; } })();
    if (!body || typeof body !== "object") return reply({ error: "Invalid request" }, 400);

    if (body.action === "join") {
      if (body.accept !== true || body.rulesVersion !== RULES_VERSION) return reply({ error: "Please read and accept the community rules to join." }, 400);
      let name: string;
      try { name = cleanName(body.name); } catch (e: any) { return reply({ error: e.message }, 400); }
      if (member?.banned) return reply({ error: "Your access to the community has been suspended." }, 403);
      const check = await moderate(name, "general");
      if (!check.allow) return reply({ error: "Please choose a respectful name without personal data.", reason: check.reason }, 422);
      await db.insert(communityMembers).values({ userId: user.id, displayName: name, rulesVersion: RULES_VERSION, handle: randomBytes(8).toString("hex") })
        .onConflictDoUpdate({ target: communityMembers.userId, set: { displayName: name, rulesVersion: RULES_VERSION, acceptedAt: new Date(), handle: sql`coalesce(${communityMembers.handle}, ${randomBytes(8).toString("hex")})` } });
      const [fresh] = await db.select().from(communityMembers).where(eq(communityMembers.userId, user.id));
      return reply({ me: status(fresh, admin) });
    }

    if (body.action === "publish-public") {
      if (!member || member.rulesVersion < RULES_VERSION || member.banned || (member.mutedUntil && member.mutedUntil > new Date())) return reply({ error: "Join the community and respect its rules before posting." }, 403);
      let post;
      try { post = validatePublicPost(body, url.origin); } catch (e: any) { return reply({ error: e.message }, 400); }
      // Atomic persistent cooldown also covers concurrent requests, including rejected moderation attempts.
      const allowed = await db.update(communityMembers).set({ publicActionAt: new Date() }).where(and(eq(communityMembers.userId, user.id), sql`(${communityMembers.publicActionAt} IS NULL OR ${communityMembers.publicActionAt} < now() - interval '30 seconds')`)).returning({ id: communityMembers.userId });
      if (!allowed.length) return reply({ error: "Wait 30 seconds between public actions. Attendi 30 secondi." }, 429);
      let verdict;
      try { verdict = await moderate(post.alias + "\n" + post.content + (post.remixLink ? "\n" + decodeURIComponent(new URL(post.remixLink).hash) : ""), "ideas"); }
      catch { return reply({ error: "Moderation unavailable. Nothing published." }, 503); }
      if (!verdict.allow) return reply({ error: "Content does not follow community rules.", reason: verdict.reason }, 422);
      const [saved] = await db.insert(communityMessages).values({ id: randomUUID(), room: "ideas", userId: user.id, authorName: post.alias, content: post.content, isPublic: true, remixLink: post.remixLink }).returning();
      return reply({ message: publicPost(saved, user.id, admin) });
    }

    if (!member || member.rulesVersion < RULES_VERSION) return reply({ error: "Accept the community rules first." }, 403);
    if (member.banned) return reply({ error: "Your access to the community has been suspended." }, 403);

    if (body.action === "send") {
      if (member.mutedUntil && member.mutedUntil > new Date()) return reply({ error: "You are paused from writing for a while because several messages broke the rules.", mutedUntil: member.mutedUntil }, 429);
      if (!isRoom(body.room)) return reply({ error: "Unknown room" }, 400);
      let content: string;
      try { content = cleanText(body.content); } catch (e: any) { return reply({ error: e.message }, 400); }
      const recent = await db.select({ createdAt: communityMessages.createdAt }).from(communityMessages)
        .where(and(eq(communityMessages.userId, user.id), gte(communityMessages.createdAt, new Date(Date.now() - 3e5))));
      const limited = rateLimit(recent.map(r => r.createdAt));
      if (limited) return reply({ error: limited }, 429);
      let verdict;
      try { verdict = await moderate(content, body.room); }
      catch { return reply({ error: "Messages can’t be checked right now, so they can’t be posted. Try again in a moment." }, 503); }
      if (!verdict.allow) {
        const strike = applyStrike(member);
        await db.update(communityMembers).set(strike).where(eq(communityMembers.userId, user.id));
        return reply({
          error: "This message wasn’t posted because it doesn’t follow the community rules.",
          blocked: true, category: verdict.category, reason: verdict.reason, suggestion: verdict.suggestion,
          mutedUntil: strike.mutedUntil && strike.mutedUntil > new Date() ? strike.mutedUntil : null,
        }, 422);
      }
      const [saved] = await db.insert(communityMessages).values({ id: randomUUID(), room: body.room, userId: user.id, authorName: member.displayName, content }).returning();
      return reply({ message: publicMessage(saved, user.id) });
    }

    if (body.action === "report") {
      if (typeof body.id !== "string" || !ID.test(body.id)) return reply({ error: "Invalid message" }, 400);
      const allowed = await db.update(communityMembers).set({ publicActionAt: new Date() }).where(and(eq(communityMembers.userId, user.id), sql`(${communityMembers.publicActionAt} IS NULL OR ${communityMembers.publicActionAt} < now() - interval '10 seconds')`)).returning({ id: communityMembers.userId });
      if (!allowed.length) return reply({ error: "Wait before reporting again." }, 429);
      const reason = typeof body.reason === "string" && Object.hasOwn(REPORT_REASONS, body.reason) ? body.reason : "other";
      const [target] = await db.select().from(communityMessages).where(eq(communityMessages.id, body.id));
      if (!target || target.hidden) return reply({ error: "Not found" }, 404);
      if (target.userId === user.id) return reply({ error: "You can’t report your own message." }, 400);
      const added = await db.insert(communityReports).values({ messageId: target.id, reporterId: user.id, reason }).onConflictDoNothing().returning({ id: communityReports.messageId });
      if (!added.length) return reply({ ok: true, already: true });
      const [updated] = await db.update(communityMessages).set({ reports: sql`${communityMessages.reports} + 1` }).where(eq(communityMessages.id, target.id)).returning();
      if (admin || updated.reports >= REPORT_HIDE_THRESHOLD) {
        await db.update(communityMessages).set({ hidden: true }).where(eq(communityMessages.id, target.id));
        const [author] = await db.select().from(communityMembers).where(eq(communityMembers.userId, target.userId));
        if (author) await db.update(communityMembers).set(applyStrike(author)).where(eq(communityMembers.userId, author.userId));
        return reply({ ok: true, hidden: true });
      }
      return reply({ ok: true });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch {
    return reply({ error: "The community is unavailable right now." }, 503);
  }
};

export const config = { path: "/gg-community" };
