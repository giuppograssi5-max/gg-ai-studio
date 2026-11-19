CREATE TABLE "community_members" (
	"user_id" text PRIMARY KEY,
	"display_name" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rules_version" integer DEFAULT 1 NOT NULL,
	"strikes" integer DEFAULT 0 NOT NULL,
	"last_strike_at" timestamp with time zone,
	"muted_until" timestamp with time zone,
	"banned" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_messages" (
	"id" text PRIMARY KEY,
	"room" text NOT NULL,
	"user_id" text NOT NULL,
	"author_name" text NOT NULL,
	"content" text NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"reports" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "community_reports" (
	"message_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "community_messages_room_created_idx" ON "community_messages" ("room","created_at");--> statement-breakpoint
CREATE INDEX "community_messages_user_created_idx" ON "community_messages" ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "community_reports_message_reporter_idx" ON "community_reports" ("message_id","reporter_id");