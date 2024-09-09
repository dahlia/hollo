ALTER TABLE "posts" ADD COLUMN "quote_target_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_quote_target_id_posts_id_fk" FOREIGN KEY ("quote_target_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
