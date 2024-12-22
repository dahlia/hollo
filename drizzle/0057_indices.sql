CREATE INDEX IF NOT EXISTS "blocks_account_id_index" ON "blocks" ("account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "blocks_blocked_account_id_index" ON "blocks" ("blocked_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "posts_actor_id_index" ON "posts" ("actor_id");