CREATE INDEX IF NOT EXISTS "bookmarks_post_id_account_owner_id_index" ON "bookmarks" ("post_id","account_owner_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "media_post_id_index" ON "media" ("post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "poll_votes_poll_id_account_id_index" ON "poll_votes" ("poll_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_sharing_id_index" ON "posts" ("sharing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_actor_id_sharing_id_index" ON "posts" ("actor_id","sharing_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_reply_target_id_index" ON "posts" ("reply_target_id");