CREATE INDEX IF NOT EXISTS "likes_account_id_post_id_index" ON "likes" ("account_id","post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mentions_post_id_account_id_index" ON "mentions" ("post_id","account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pinned_posts_account_id_post_id_index" ON "pinned_posts" ("account_id","post_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_visibility_actor_id_index" ON "posts" ("visibility","actor_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactions_post_id_index" ON "reactions" ("post_id");