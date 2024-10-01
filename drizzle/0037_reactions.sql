CREATE TABLE IF NOT EXISTS "reactions" (
	"post_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"custom_emoji" text,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reactions_post_id_account_id_emoji_pk" PRIMARY KEY("post_id","account_id","emoji")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reactions" ADD CONSTRAINT "reactions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
