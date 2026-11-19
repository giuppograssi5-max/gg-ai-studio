ALTER TABLE "community_members" ADD COLUMN "public_action_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_messages" ADD COLUMN "is_public" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "community_messages" ADD COLUMN "remix_link" text;