CREATE TABLE "place_partners" (
	"id" text PRIMARY KEY,
	"osm_id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"city" text NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"contact_name" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"website" text DEFAULT '' NOT NULL,
	"discount" text DEFAULT '' NOT NULL,
	"code" text NOT NULL,
	"promotes_gg" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "place_partners_status_city_idx" ON "place_partners" ("status","city");--> statement-breakpoint
CREATE INDEX "place_partners_osm_idx" ON "place_partners" ("osm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "place_partners_code_idx" ON "place_partners" ("code");