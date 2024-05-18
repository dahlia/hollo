CREATE TABLE IF NOT EXISTS "follows" (
	"following_id" uuid NOT NULL,
	"follower_id" uuid NOT NULL,
	"shares" boolean DEFAULT true NOT NULL,
	"notify" boolean DEFAULT false NOT NULL,
	"languages" text[],
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_following_id_follower_id_pk" PRIMARY KEY("following_id","follower_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" RENAME COLUMN "following" TO "following_count";--> statement-breakpoint
ALTER TABLE "accounts" RENAME COLUMN "followers" TO "followers_count";--> statement-breakpoint
ALTER TABLE "accounts" RENAME COLUMN "posts" TO "posts_count";--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_accounts_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_accounts_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
