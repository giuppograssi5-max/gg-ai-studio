// Shared AI moderation for community rooms and private messages.
import Anthropic from "@anthropic-ai/sdk";
import { quickCheck, moderationPrompt, parseModeration } from "../community-core.js";

export const MODEL = "claude-haiku-4-5";

// Asks the AI moderator whether a message follows the rules. Throws if moderation is unavailable.
export async function moderate(text, room, client = new Anthropic()) {
  const local = quickCheck(text);
  if (local) return { allow: false, suggestion: "", ...local };
  const { system, messages } = moderationPrompt(text, room);
  const res = await client.messages.create({ model: MODEL, max_tokens: 400, system, messages }, { timeout: 20000, maxRetries: 1 });
  return parseModeration(res.content.filter((b) => b.type === "text").map((b) => b.text).join(""));
}
