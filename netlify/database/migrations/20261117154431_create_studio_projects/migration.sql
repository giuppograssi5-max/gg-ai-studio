CREATE TABLE "studio_projects" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"format" text NOT NULL,
	"brief" jsonb NOT NULL,
	"script" jsonb NOT NULL,
	"images" jsonb DEFAULT '[]' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"author_name" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "studio_projects_user_updated_idx" ON "studio_projects" ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "studio_projects_published_idx" ON "studio_projects" ("published","published_at");