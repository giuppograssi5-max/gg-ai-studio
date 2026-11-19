CREATE TABLE "vpn_devices" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"public_key" text NOT NULL UNIQUE,
	"address" text NOT NULL,
	"meshnet" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vpn_server_status" (
	"server_id" text PRIMARY KEY,
	"active_peers" integer DEFAULT 0 NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "vpn_devices_user_idx" ON "vpn_devices" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vpn_devices_server_address_idx" ON "vpn_devices" ("server_id","address");