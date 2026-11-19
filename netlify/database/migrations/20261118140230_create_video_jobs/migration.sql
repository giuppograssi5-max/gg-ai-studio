CREATE TABLE "video_jobs" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"prompt" text NOT NULL,
	"duration" integer NOT NULL,
	"aspect" text NOT NULL,
	"status" text DEFAULT 'submitting' NOT NULL,
	"output_url" text,
	"error" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "video_jobs_user_created_idx" ON "video_jobs" ("user_id","created_at");