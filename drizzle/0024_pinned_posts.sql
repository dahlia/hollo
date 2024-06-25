CREATE TABLE IF NOT EXISTS "pinned_posts" (
	"index" bigserial PRIMARY KEY NOT NULL,
	"post_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pinned_posts_post_id_account_id_unique" UNIQUE("post_id","account_id")
);
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_id_actor_id_unique" UNIQUE("id", "actor_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pinned_posts" ADD CONSTRAINT "pinned_posts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "pinned_posts" ADD CONSTRAINT "pinned_posts_post_id_account_id_posts_id_actor_id_fk" FOREIGN KEY ("post_id","account_id") REFERENCES "public"."posts"("id","actor_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
