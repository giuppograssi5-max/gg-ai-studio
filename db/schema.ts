import { pgTable, text, timestamp, jsonb, index, uniqueIndex, boolean, integer } from "drizzle-orm/pg-core";

export const videoJobs = pgTable("video_jobs", {
  id: text().primaryKey(), userId: text("user_id").notNull(),
  provider: text().notNull(), providerId: text("provider_id"),
  prompt: text().notNull(), duration: integer().notNull(), aspect: text().notNull(),
  status: text().notNull().default("submitting"), outputUrl: text("output_url"), error: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("video_jobs_user_created_idx").on(t.userId, t.createdAt)]);

// Saved chats for signed-in users. Messages are kept as an ordered JSON array of { role, content }.
export const conversations = pgTable("conversations", {
  id: text().primaryKey(),
  userId: text("user_id").notNull(),
  title: text().notNull(),
  messages: jsonb().$type<{ role: "user" | "assistant"; content: string }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("conversations_user_updated_idx").on(t.userId, t.updatedAt)]);

// Per-user personalization, similar to custom instructions.
export const userSettings = pgTable("user_settings", {
  userId: text("user_id").primaryKey(),
  instructions: text().notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// GG VPN devices. Only the WireGuard public key is stored; the private key stays on the device.
export const vpnDevices = pgTable("vpn_devices", {
  id: text().primaryKey(),
  userId: text("user_id").notNull(),
  serverId: text("server_id").notNull(),
  name: text().notNull(),
  publicKey: text("public_key").notNull().unique(),
  address: text().notNull(),
  meshnet: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("vpn_devices_user_idx").on(t.userId), uniqueIndex("vpn_devices_server_address_idx").on(t.serverId, t.address)]);

// Latest report from each VPN server, used for online status and load.
export const vpnServerStatus = pgTable("vpn_server_status", {
  serverId: text("server_id").primaryKey(),
  activePeers: integer("active_peers").notNull().default(0),
  reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
});

// Community: members who accepted the rules, their messages and reports from other members.
export const communityMembers = pgTable("community_members", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).defaultNow().notNull(),
  rulesVersion: integer("rules_version").notNull().default(1),
  strikes: integer().notNull().default(0),
  lastStrikeAt: timestamp("last_strike_at", { withTimezone: true }),
  mutedUntil: timestamp("muted_until", { withTimezone: true }),
  banned: boolean().notNull().default(false),
  publicActionAt: timestamp("public_action_at", { withTimezone: true }),
  // Public, random reference other members use to message this member (the account id stays private).
  handle: text().unique(),
  city: text().notNull().default(""),
  bio: text().notNull().default(""),
  allowDms: boolean("allow_dms").notNull().default(true),
});

export const communityMessages = pgTable("community_messages", {
  id: text().primaryKey(),
  room: text().notNull(),
  userId: text("user_id").notNull(),
  authorName: text("author_name").notNull(),
  content: text().notNull(),
  isPublic: boolean("is_public").notNull().default(false),
  remixLink: text("remix_link"),
  hidden: boolean().notNull().default(false),
  reports: integer().notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("community_messages_room_created_idx").on(t.room, t.createdAt), index("community_messages_user_created_idx").on(t.userId, t.createdAt)]);

export const communityReports = pgTable("community_reports", {
  messageId: text("message_id").notNull(),
  reporterId: text("reporter_id").notNull(),
  reason: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("community_reports_message_reporter_idx").on(t.messageId, t.reporterId)]);

// GG Places: restaurants, clubs and bars that GG contacted or that asked to partner.
// A place is "active" only after it agreed to give GG users a discount and to promote GG,
// and an admin approved it. In return GG features it in GG Places.
export const placePartners = pgTable("place_partners", {
  id: text().primaryKey(),
  osmId: text("osm_id"),
  name: text().notNull(),
  kind: text().notNull(),
  city: text().notNull(),
  address: text().notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  phone: text().notNull().default(""),
  website: text().notNull().default(""),
  discount: text().notNull().default(""),
  code: text().notNull(),
  promotesGg: boolean("promotes_gg").notNull().default(false),
  status: text().notNull().default("pending"),
  notes: text().notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("place_partners_status_city_idx").on(t.status, t.city), index("place_partners_osm_idx").on(t.osmId), uniqueIndex("place_partners_code_idx").on(t.code)]);

// Private conversations between two community members. user_a is always the smaller id of the pair.
export const dmThreads = pgTable("dm_threads", {
  id: text().primaryKey(),
  userA: text("user_a").notNull(),
  userB: text("user_b").notNull(),
  readA: timestamp("read_a", { withTimezone: true }).defaultNow().notNull(),
  readB: timestamp("read_b", { withTimezone: true }).defaultNow().notNull(),
  lastPreview: text("last_preview").notNull().default(""),
  lastSender: text("last_sender").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("dm_threads_pair_idx").on(t.userA, t.userB), index("dm_threads_a_updated_idx").on(t.userA, t.updatedAt), index("dm_threads_b_updated_idx").on(t.userB, t.updatedAt)]);

// Messages in a private conversation. kind "meetup" carries a proposal to meet at a public place.
export type Meetup = { place: string; city: string; when: string; note: string; status: "proposed" | "accepted" | "declined" | "cancelled" };
export const dmMessages = pgTable("dm_messages", {
  id: text().primaryKey(),
  threadId: text("thread_id").notNull(),
  senderId: text("sender_id").notNull(),
  kind: text().notNull().default("text"),
  content: text().notNull().default(""),
  meetup: jsonb().$type<Meetup>(),
  reported: boolean().notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("dm_messages_thread_created_idx").on(t.threadId, t.createdAt), index("dm_messages_sender_created_idx").on(t.senderId, t.createdAt)]);

// Members someone blocked: they can't message each other or see each other in the member list.
export const communityBlocks = pgTable("community_blocks", {
  blockerId: text("blocker_id").notNull(),
  blockedId: text("blocked_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [uniqueIndex("community_blocks_pair_idx").on(t.blockerId, t.blockedId), index("community_blocks_blocked_idx").on(t.blockedId)]);

// GG Studio: movies and TV series created with AI from a user's story, people and environments.
// The brief and script are JSON; generated images live in Netlify Blobs under "<id>/<slot>".
export const studioProjects = pgTable("studio_projects", {
  id: text().primaryKey(),
  userId: text("user_id").notNull(),
  title: text().notNull(),
  format: text().notNull(),
  brief: jsonb().notNull(),
  script: jsonb().notNull(),
  images: jsonb().$type<string[]>().notNull().default([]),
  published: boolean().notNull().default(false),
  authorName: text("author_name").notNull().default(""),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [index("studio_projects_user_updated_idx").on(t.userId, t.updatedAt), index("studio_projects_published_idx").on(t.published, t.publishedAt)]);
