ALTER TABLE "cloud_saves" DROP COLUMN "slot";--> statement-breakpoint
ALTER TABLE "cloud_saves" ADD COLUMN "bytes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS "player_game_slot";--> statement-breakpoint
CREATE UNIQUE INDEX "player_game_save" ON "cloud_saves" ("player_id","game_id");
