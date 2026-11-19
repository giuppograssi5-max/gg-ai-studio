import { getUser } from "@netlify/identity";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/index.js";
import { conversations, userSettings } from "../../db/schema.js";

type Message = { role: "user" | "assistant"; content: string };
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
const ID = /^[A-Za-z0-9-]{8,64}$/;

export function cleanMessages(value: unknown): Message[] {
  if (!Array.isArray(value) || value.length > 200) throw Error("Invalid messages");
  return value.map((m: any) => {
    if (!m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || m.content.length > 16000) throw Error("Invalid message");
    return { role: m.role, content: m.content };
  });
}
export const cleanTitle = (value: unknown, fallback = "New chat") =>
  (typeof value === "string" && value.trim() ? value.trim() : fallback).replace(/\s+/g, " ").slice(0, 120);

export default async (req: Request) => {
  if (req.headers.get("origin") && req.headers.get("origin") !== new URL(req.url).origin) return reply({ error: "Invalid origin" }, 403);
  const user = await getUser();
  if (!user) return reply({ error: "Sign in to save chats." }, 401);
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id !== null && !ID.test(id)) return reply({ error: "Invalid chat" }, 400);
  const mine = (chatId: string) => and(eq(conversations.id, chatId), eq(conversations.userId, user.id));
  try {
    if (req.method === "GET") {
      if (id) {
        const [chat] = await db.select().from(conversations).where(mine(id));
        return chat ? reply({ id: chat.id, title: chat.title, messages: chat.messages, updatedAt: chat.updatedAt }) : reply({ error: "Not found" }, 404);
      }
      const list = await db.select({ id: conversations.id, title: conversations.title, updatedAt: conversations.updatedAt })
        .from(conversations).where(eq(conversations.userId, user.id)).orderBy(desc(conversations.updatedAt)).limit(100);
      const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, user.id));
      return reply({ conversations: list, instructions: settings?.instructions || "" });
    }
    if (Number(req.headers.get("content-length")) > 3500000) return reply({ error: "Chat too large" }, 413);
    const body = req.method === "DELETE" ? {} : await req.json().catch(() => null);
    if (!body || typeof body !== "object") return reply({ error: "Invalid request" }, 400);
    if (req.method === "PUT" && url.searchParams.get("settings") === "1") {
      const instructions = typeof body.instructions === "string" ? body.instructions.trim().slice(0, 1500) : "";
      await db.insert(userSettings).values({ userId: user.id, instructions })
        .onConflictDoUpdate({ target: userSettings.userId, set: { instructions, updatedAt: new Date() } });
      return reply({ instructions });
    }
    if (!id) return reply({ error: "Missing chat" }, 400);
    if (req.method === "PUT") {
      const messages = cleanMessages(body.messages);
      const title = cleanTitle(body.title, messages.find(m => m.role === "user")?.content.slice(0, 60));
      const [existing] = await db.select({ userId: conversations.userId }).from(conversations).where(eq(conversations.id, id));
      if (existing && existing.userId !== user.id) return reply({ error: "Not found" }, 404);
      if (existing) await db.update(conversations).set({ messages, updatedAt: new Date(), ...(body.title ? { title } : {}) }).where(mine(id));
      else await db.insert(conversations).values({ id, userId: user.id, title, messages });
      return reply({ id, title });
    }
    if (req.method === "PATCH") {
      const title = cleanTitle(body.title);
      const updated = await db.update(conversations).set({ title }).where(mine(id)).returning({ id: conversations.id });
      return updated.length ? reply({ id, title }) : reply({ error: "Not found" }, 404);
    }
    if (req.method === "DELETE") {
      await db.delete(conversations).where(mine(id));
      return reply({ ok: true });
    }
    return reply({ error: "Method not allowed" }, 405);
  } catch {
    return reply({ error: "Chats are unavailable right now." }, 503);
  }
};

export const config = { path: "/gg-chats" };
