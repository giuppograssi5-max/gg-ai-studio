// GG · Community private messages, member directory and meetups.
// Only members who accepted the community rules can use it. Every message is moderated like the rooms.
// GET  /gg-community-dm?view=inbox                      -> { threads, unread }
// GET  /gg-community-dm?view=thread&id=...[&after=ISO]  -> { thread, messages }
// GET  /gg-community-dm?view=members[&city=..&q=..]     -> { members }
// GET  /gg-community-dm?view=blocked                    -> { blocked }
// POST { action: 'profile', city, bio, allowDms }
// POST { action: 'start', handle | messageId }          -> { thread }
// POST { action: 'send', thread, content }
// POST { action: 'meetup', thread, place, city, when, note }
// POST { action: 'respond', id, answer }                (accepted | declined | cancelled)
// POST { action: 'read', thread }
// POST { action: 'block' | 'unblock', handle }
// POST { action: 'report', id, reason }
// DELETE ?id=...                                        (own message)
import { getUser } from "@netlify/identity";
import { and, asc, count, desc, eq, gt, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../../db/index.js";
import { communityBlocks, communityMembers, communityMessages, communityReports, dmMessages, dmThreads } from "../../db/schema.js";
import {
  RULES_VERSION, REPORT_REASONS, cleanText, cleanProfile, cleanMeetup, meetupTransition, pairOf, previewOf, applyStrike, rateLimit,
} from "../../community-core.js";
import { moderate } from "../../lib/community-moderate.mjs";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store, private" } });
const ID = /^[A-Za-z0-9-]{8,64}$/;
const HANDLE = /^[a-f0-9]{16}$/;
type Member = typeof communityMembers.$inferSelect;
type Thread = typeof dmThreads.$inferSelect;
type Dm = typeof dmMessages.$inferSelect;

const like = (v: string) => `%${v.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
const publicMember = (m: Member) => ({ handle: m.handle, name: m.displayName, city: m.city, bio: m.bio });
const publicDm = (m: Dm, me: string) => ({ id: m.id, kind: m.kind, content: m.content, meetup: m.meetup, createdAt: m.createdAt, mine: m.senderId === me });
const otherOf = (t: Thread, me: string) => (t.userA === me ? t.userB : t.userA);

async function blockedEither(a: string, b: string) {
  const rows = await db.select({ x: communityBlocks.blockerId }).from(communityBlocks)
    .where(or(and(eq(communityBlocks.blockerId, a), eq(communityBlocks.blockedId, b)), and(eq(communityBlocks.blockerId, b), eq(communityBlocks.blockedId, a))));
  return rows.map((r) => r.x);
}

async function threadFor(id: unknown, me: string) {
  if (typeof id !== "string" || !ID.test(id)) return null;
  const [t] = await db.select().from(dmThreads).where(and(eq(dmThreads.id, id), or(eq(dmThreads.userA, me), eq(dmThreads.userB, me))));
  return t || null;
}

// Rate limit is shared between rooms and private messages.
async function recentSends(me: string) {
  const since = new Date(Date.now() - 3e5);
  const [a, b] = await Promise.all([
    db.select({ t: communityMessages.createdAt }).from(communityMessages).where(and(eq(communityMessages.userId, me), gte(communityMessages.createdAt, since))),
    db.select({ t: dmMessages.createdAt }).from(dmMessages).where(and(eq(dmMessages.senderId, me), gte(dmMessages.createdAt, since))),
  ]);
  return [...a, ...b].map((r) => r.t);
}

export default async (req: Request) => {
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) return reply({ error: "Invalid origin" }, 403);
  const user = await getUser();
  if (!user) return reply({ error: "Sign in to send private messages." }, 401);
  const me = user.id;
  const url = new URL(req.url);
  try {
    const [member] = await db.select().from(communityMembers).where(eq(communityMembers.userId, me));
    if (!member || member.rulesVersion < RULES_VERSION) return reply({ error: "Join the community and accept its rules first.", needsJoin: true }, 403);
    if (member.banned) return reply({ error: "Your access to the community has been suspended." }, 403);

    if (req.method === "GET") {
      const view = url.searchParams.get("view") || "inbox";

      if (view === "inbox") {
        const threads = await db.select().from(dmThreads).where(or(eq(dmThreads.userA, me), eq(dmThreads.userB, me))).orderBy(desc(dmThreads.updatedAt)).limit(60);
        const others = [...new Set(threads.map((t) => otherOf(t, me)))];
        const [people, unread, blocks] = await Promise.all([
          others.length ? db.select().from(communityMembers).where(inArray(communityMembers.userId, others)) : [],
          threads.length ? db.select({ id: dmMessages.threadId, n: count() }).from(dmMessages).innerJoin(dmThreads, eq(dmThreads.id, dmMessages.threadId))
            .where(and(inArray(dmMessages.threadId, threads.map((t) => t.id)), ne(dmMessages.senderId, me),
              gt(dmMessages.createdAt, sql`case when ${dmThreads.userA} = ${me} then ${dmThreads.readA} else ${dmThreads.readB} end`)))
            .groupBy(dmMessages.threadId) : [],
          db.select({ id: communityBlocks.blockedId }).from(communityBlocks).where(eq(communityBlocks.blockerId, me)),
        ]);
        const byId = new Map(people.map((p) => [p.userId, p]));
        const counts = new Map(unread.map((u) => [u.id, Number(u.n)]));
        const blocked = new Set(blocks.map((b) => b.id));
        const list = threads.filter((t) => byId.has(otherOf(t, me)) && t.lastSender).map((t) => {
          const o = byId.get(otherOf(t, me))!;
          return { id: t.id, other: publicMember(o), blocked: blocked.has(o.userId), preview: t.lastPreview, mine: t.lastSender === me, updatedAt: t.updatedAt, unread: blocked.has(o.userId) ? 0 : counts.get(t.id) || 0 };
        });
        return reply({ threads: list, unread: list.reduce((n, t) => n + t.unread, 0) });
      }

      if (view === "thread") {
        const t = await threadFor(url.searchParams.get("id"), me);
        if (!t) return reply({ error: "Conversation not found" }, 404);
        const after = url.searchParams.get("after");
        const since = after ? new Date(after) : null;
        if (since && isNaN(+since)) return reply({ error: "Invalid time" }, 400);
        const [[other], rows, blocks] = await Promise.all([
          db.select().from(communityMembers).where(eq(communityMembers.userId, otherOf(t, me))),
          since
            ? db.select().from(dmMessages).where(and(eq(dmMessages.threadId, t.id), gt(dmMessages.createdAt, since))).orderBy(asc(dmMessages.createdAt)).limit(100)
            : db.select().from(dmMessages).where(eq(dmMessages.threadId, t.id)).orderBy(desc(dmMessages.createdAt)).limit(80).then((r) => r.reverse()),
          blockedEither(me, otherOf(t, me)),
        ]);
        if (!other) return reply({ error: "Conversation not found" }, 404);
        return reply({
          thread: { id: t.id, other: { ...publicMember(other), allowDms: other.allowDms && !other.banned }, blockedByMe: blocks.includes(me), blockedByOther: blocks.includes(other.userId) },
          // Meetup updates change existing messages, so they are always re-sent with the latest state.
          messages: rows.map((m) => publicDm(m, me)),
          meetups: since ? (await db.select().from(dmMessages).where(and(eq(dmMessages.threadId, t.id), eq(dmMessages.kind, "meetup"))).orderBy(desc(dmMessages.createdAt)).limit(20)).map((m) => publicDm(m, me)) : undefined,
        });
      }

      if (view === "members") {
        const city = (url.searchParams.get("city") || "").trim().slice(0, 60);
        const q = (url.searchParams.get("q") || "").trim().slice(0, 60);
        const blocks = await db.select().from(communityBlocks).where(or(eq(communityBlocks.blockerId, me), eq(communityBlocks.blockedId, me)));
        const hide = [...new Set(blocks.map((b) => (b.blockerId === me ? b.blockedId : b.blockerId)))];
        const conds = [ne(communityMembers.userId, me), eq(communityMembers.banned, false), eq(communityMembers.allowDms, true), gte(communityMembers.rulesVersion, RULES_VERSION)];
        if (city) conds.push(ilike(communityMembers.city, like(city)));
        if (q) conds.push(or(ilike(communityMembers.displayName, like(q)), ilike(communityMembers.bio, like(q)))!);
        if (hide.length) conds.push(sql`${communityMembers.userId} not in (${sql.join(hide.map((h) => sql`${h}`), sql`, `)})`);
        const rows = await db.select().from(communityMembers).where(and(...conds)).orderBy(desc(sql`${communityMembers.city} <> ''`), desc(communityMembers.acceptedAt)).limit(60);
        return reply({ members: rows.map(publicMember) });
      }

      if (view === "blocked") {
        const rows = await db.select({ m: communityMembers }).from(communityBlocks).innerJoin(communityMembers, eq(communityMembers.userId, communityBlocks.blockedId)).where(eq(communityBlocks.blockerId, me));
        return reply({ blocked: rows.map((r) => publicMember(r.m)) });
      }
      return reply({ error: "Unknown view" }, 400);
    }

    if (req.method === "DELETE") {
      const id = url.searchParams.get("id") || "";
      if (!ID.test(id)) return reply({ error: "Invalid message" }, 400);
      const gone = await db.delete(dmMessages).where(and(eq(dmMessages.id, id), eq(dmMessages.senderId, me))).returning();
      if (!gone.length) return reply({ error: "Not found" }, 404);
      const [last] = await db.select().from(dmMessages).where(eq(dmMessages.threadId, gone[0].threadId)).orderBy(desc(dmMessages.createdAt)).limit(1);
      await db.update(dmThreads).set(last ? { lastPreview: previewOf(last.kind, last.content, last.meetup), lastSender: last.senderId } : { lastPreview: "", lastSender: "" }).where(eq(dmThreads.id, gone[0].threadId));
      return reply({ ok: true });
    }

    if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);
    if (Number(req.headers.get("content-length")) > 20000) return reply({ error: "Message too large" }, 413);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return reply({ error: "Invalid request" }, 400);
    const muted = member.mutedUntil && member.mutedUntil > new Date();

    if (body.action === "profile") {
      let profile;
      try { profile = cleanProfile(body); } catch (e: any) { return reply({ error: e.message }, 400); }
      const text = [profile.city, profile.bio].filter(Boolean).join("\n");
      if (text && (profile.city !== member.city || profile.bio !== member.bio)) {
        let check;
        try { check = await moderate(text, "general"); } catch { return reply({ error: "Your profile can’t be checked right now. Try again in a moment." }, 503); }
        if (!check.allow) return reply({ error: "Please keep your profile friendly and without personal data such as phone numbers or emails.", reason: check.reason }, 422);
      }
      await db.update(communityMembers).set(profile).where(eq(communityMembers.userId, me));
      return reply({ profile });
    }

    if (body.action === "start") {
      let target: Member | undefined;
      if (typeof body.handle === "string" && HANDLE.test(body.handle)) {
        [target] = await db.select().from(communityMembers).where(eq(communityMembers.handle, body.handle));
      } else if (typeof body.messageId === "string" && ID.test(body.messageId)) {
        const [m] = await db.select({ userId: communityMessages.userId }).from(communityMessages).where(and(eq(communityMessages.id, body.messageId), eq(communityMessages.hidden, false)));
        if (m) [target] = await db.select().from(communityMembers).where(eq(communityMembers.userId, m.userId));
      }
      if (!target || target.banned || target.rulesVersion < RULES_VERSION) return reply({ error: "This member can’t be found." }, 404);
      if (target.userId === me) return reply({ error: "You can’t message yourself." }, 400);
      const [a, b] = pairOf(me, target.userId);
      const [existing] = await db.select().from(dmThreads).where(and(eq(dmThreads.userA, a), eq(dmThreads.userB, b)));
      if (existing) return reply({ thread: existing.id });
      if (!target.allowDms) return reply({ error: `${target.displayName} isn’t accepting private messages.` }, 403);
      if ((await blockedEither(me, target.userId)).length) return reply({ error: "You can’t message this member." }, 403);
      const [t] = await db.insert(dmThreads).values({ id: randomUUID(), userA: a, userB: b }).onConflictDoNothing().returning();
      if (t) return reply({ thread: t.id });
      const [again] = await db.select().from(dmThreads).where(and(eq(dmThreads.userA, a), eq(dmThreads.userB, b)));
      return reply({ thread: again.id });
    }

    if (body.action === "read") {
      const t = await threadFor(body.thread, me);
      if (!t) return reply({ error: "Conversation not found" }, 404);
      await db.update(dmThreads).set(t.userA === me ? { readA: new Date() } : { readB: new Date() }).where(eq(dmThreads.id, t.id));
      return reply({ ok: true });
    }

    if (body.action === "block" || body.action === "unblock") {
      if (typeof body.handle !== "string" || !HANDLE.test(body.handle)) return reply({ error: "Invalid member" }, 400);
      const [target] = await db.select().from(communityMembers).where(eq(communityMembers.handle, body.handle));
      if (!target || target.userId === me) return reply({ error: "This member can’t be found." }, 404);
      if (body.action === "block") await db.insert(communityBlocks).values({ blockerId: me, blockedId: target.userId }).onConflictDoNothing();
      else await db.delete(communityBlocks).where(and(eq(communityBlocks.blockerId, me), eq(communityBlocks.blockedId, target.userId)));
      return reply({ ok: true });
    }

    if (body.action === "send" || body.action === "meetup") {
      if (muted) return reply({ error: "You are paused from writing for a while because several messages broke the rules.", mutedUntil: member.mutedUntil }, 429);
      const t = await threadFor(body.thread, me);
      if (!t) return reply({ error: "Conversation not found" }, 404);
      const otherId = otherOf(t, me);
      const [[other], blocks] = await Promise.all([db.select().from(communityMembers).where(eq(communityMembers.userId, otherId)), blockedEither(me, otherId)]);
      if (!other || other.banned) return reply({ error: "This member is no longer in the community." }, 403);
      if (blocks.includes(me)) return reply({ error: "You blocked this member. Unblock them to write again." }, 403);
      if (blocks.length) return reply({ error: "You can’t message this member." }, 403);
      if (!other.allowDms) return reply({ error: `${other.displayName} isn’t accepting private messages right now.` }, 403);

      let content = "", meetup = null, toCheck: string;
      try {
        if (body.action === "send") toCheck = content = cleanText(body.content);
        else { meetup = cleanMeetup(body); content = meetup.note; toCheck = [`Meetup at: ${meetup.place}`, meetup.city, meetup.note].filter(Boolean).join("\n"); }
      } catch (e: any) { return reply({ error: e.message }, 400); }
      const limited = rateLimit(await recentSends(me));
      if (limited) return reply({ error: limited }, 429);
      let verdict;
      try { verdict = await moderate(toCheck, "private"); }
      catch { return reply({ error: "Messages can’t be checked right now, so they can’t be sent. Try again in a moment." }, 503); }
      if (!verdict.allow) {
        const strike = applyStrike(member);
        await db.update(communityMembers).set(strike).where(eq(communityMembers.userId, me));
        return reply({
          error: "This message wasn’t sent because it doesn’t follow the community rules.",
          blocked: true, category: verdict.category, reason: verdict.reason, suggestion: body.action === "send" ? verdict.suggestion : "",
          mutedUntil: strike.mutedUntil && strike.mutedUntil > new Date() ? strike.mutedUntil : null,
        }, 422);
      }
      const kind = body.action === "send" ? "text" : "meetup";
      const [saved] = await db.insert(dmMessages).values({ id: randomUUID(), threadId: t.id, senderId: me, kind, content, meetup }).returning();
      const now = new Date();
      await db.update(dmThreads).set({ lastPreview: previewOf(kind, content, meetup), lastSender: me, updatedAt: now, ...(t.userA === me ? { readA: now } : { readB: now }) }).where(eq(dmThreads.id, t.id));
      return reply({ message: publicDm(saved, me) });
    }

    if (body.action === "respond") {
      if (typeof body.id !== "string" || !ID.test(body.id)) return reply({ error: "Invalid meetup" }, 400);
      const [m] = await db.select().from(dmMessages).where(and(eq(dmMessages.id, body.id), eq(dmMessages.kind, "meetup")));
      const t = m && await threadFor(m.threadId, me);
      if (!m || !t || !m.meetup) return reply({ error: "Meetup not found" }, 404);
      const isProposer = m.senderId === me;
      if (!isProposer && (await blockedEither(me, m.senderId)).length) return reply({ error: "You can’t answer this member." }, 403);
      const next = meetupTransition(m.meetup, body.answer, isProposer);
      if (!next) return reply({ error: "This meetup can’t be changed that way." }, 400);
      const [saved] = await db.update(dmMessages).set({ meetup: { ...m.meetup, status: next } }).where(eq(dmMessages.id, m.id)).returning();
      const label = { accepted: "✅ Meetup accepted", declined: "Meetup declined", cancelled: "Meetup cancelled" }[next as "accepted"];
      await db.update(dmThreads).set({ lastPreview: `${label}: ${m.meetup.place}`.slice(0, 120), lastSender: me, updatedAt: new Date() }).where(eq(dmThreads.id, t.id));
      return reply({ message: publicDm(saved, me) });
    }

    if (body.action === "report") {
      if (typeof body.id !== "string" || !ID.test(body.id)) return reply({ error: "Invalid message" }, 400);
      const reason = typeof body.reason === "string" && Object.hasOwn(REPORT_REASONS, body.reason) ? body.reason : "other";
      const [m] = await db.select().from(dmMessages).where(eq(dmMessages.id, body.id));
      const t = m && await threadFor(m.threadId, me);
      if (!m || !t) return reply({ error: "Not found" }, 404);
      if (m.senderId === me) return reply({ error: "You can’t report your own message." }, 400);
      const added = await db.insert(communityReports).values({ messageId: m.id, reporterId: me, reason: `dm:${reason}` }).onConflictDoNothing().returning({ id: communityReports.messageId });
      await db.insert(communityBlocks).values({ blockerId: me, blockedId: m.senderId }).onConflictDoNothing();
      if (!added.length) return reply({ ok: true, already: true });
      await db.update(dmMessages).set({ reported: true }).where(eq(dmMessages.id, m.id));
      const [author] = await db.select().from(communityMembers).where(eq(communityMembers.userId, m.senderId));
      if (author) await db.update(communityMembers).set(applyStrike(author)).where(eq(communityMembers.userId, author.userId));
      return reply({ ok: true });
    }

    return reply({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("community-dm", e);
    return reply({ error: "Private messages are unavailable right now." }, 503);
  }
};

export const config = { path: "/gg-community-dm" };
