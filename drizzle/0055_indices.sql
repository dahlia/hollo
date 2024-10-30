CREATE INDEX IF NOT EXISTS "poll_options_poll_id_index_index" ON "poll_options" ("poll_id","index");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_visibility_actor_id_sharing_id_index" ON "posts" ("visibility","actor_id","sharing_id") WHERE "sharing_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_visibility_actor_id_reply_target_id_index" ON "posts" ("visibility","actor_id","reply_target_id") WHERE "reply_target_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reactions_post_id_account_id_index" ON "reactions" ("post_id","account_id");
