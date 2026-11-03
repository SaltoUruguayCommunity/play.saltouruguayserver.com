CREATE TABLE "game_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source_bytes" integer NOT NULL,
	"content_type" text NOT NULL,
	"artifact_key" text,
	"processing_token" text,
	"width" integer,
	"height" integer,
	"bytes" integer,
	"alt" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'awaiting_upload' NOT NULL,
	"error" text,
	"processing_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_releases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"from_build_id" uuid,
	"build_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hosted_builds" ALTER COLUMN "digest" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "hosted_builds" ALTER COLUMN "bytes" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "hosted_builds" ALTER COLUMN "file_count" SET DEFAULT 0;--> statement-breakpoint
ALTER TABLE "hosted_builds" ALTER COLUMN "status" SET DEFAULT 'awaiting_upload';--> statement-breakpoint
ALTER TABLE "hosted_builds" ADD COLUMN "version" text DEFAULT '1.0.0' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_builds" ADD COLUMN "notes" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_builds" ADD COLUMN "source_bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_builds" ADD COLUMN "artifact_id" text;--> statement-breakpoint
ALTER TABLE "hosted_builds" ADD COLUMN "processing_token" text;--> statement-breakpoint
ALTER TABLE "hosted_builds" ADD COLUMN "manifest" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "hosted_builds" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "hosted_builds" ADD COLUMN "processing_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN "screenshots" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "game_media" ADD CONSTRAINT "game_media_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_releases" ADD CONSTRAINT "game_releases_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_releases" ADD CONSTRAINT "game_releases_build_id_hosted_builds_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."hosted_builds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_releases" ADD CONSTRAINT "game_releases_actor_id_players_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."players"("id") ON DELETE no action ON UPDATE no action;