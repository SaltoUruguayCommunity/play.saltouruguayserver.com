ALTER TABLE "achievements" ADD COLUMN "score" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD COLUMN "tag_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "unlocks" ADD COLUMN "score_awarded" integer DEFAULT 0 NOT NULL;