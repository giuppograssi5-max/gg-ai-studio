CREATE TABLE "community_blocks" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_messages" (
	"id" text PRIMARY KEY,
	"thread_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"meetup" jsonb,
	"reported" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dm_threads" (
	"id" text PRIMARY KEY,
	"user_a" text NOT NULL,
	"user_b" text NOT NULL,
	"read_a" timestamp with time zone DEFAULT now() NOT NULL,
	"read_b" timestamp with time zone DEFAULT now() NOT NULL,
	"last_preview" text DEFAULT '' NOT NULL,
	"last_sender" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "handle" text;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "city" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "bio" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "community_members" ADD COLUMN "allow_dms" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "community_members" ADD CONSTRAINT "community_members_handle_key" UNIQUE("handle");--> statement-breakpoint
CREATE UNIQUE INDEX "community_blocks_pair_idx" ON "community_blocks" ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "community_blocks_blocked_idx" ON "community_blocks" ("blocked_id");--> statement-breakpoint
CREATE INDEX "dm_messages_thread_created_idx" ON "dm_messages" ("thread_id","created_at");--> statement-breakpoint
CREATE INDEX "dm_messages_sender_created_idx" ON "dm_messages" ("sender_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "dm_threads_pair_idx" ON "dm_threads" ("user_a","user_b");--> statement-breakpoint
CREATE INDEX "dm_threads_a_updated_idx" ON "dm_threads" ("user_a","updated_at");--> statement-breakpoint
CREATE INDEX "dm_threads_b_updated_idx" ON "dm_threads" ("user_b","updated_at");--> statement-breakpoint
UPDATE "community_members" SET "handle" = substr(md5(random()::text || "user_id" || clock_timestamp()::text), 1, 16) WHERE "handle" IS NULL;
