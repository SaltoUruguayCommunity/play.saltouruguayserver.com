ALTER TABLE "achievements" ADD COLUMN "image_id" uuid;--> statement-breakpoint
ALTER TABLE "game_media" ADD COLUMN "achievement_id" uuid;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_image_id_game_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."game_media"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_media" ADD CONSTRAINT "game_media_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;