DO $$ BEGIN
 CREATE TYPE "public"."post_type" AS ENUM('Article', 'Note');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."post_visibility" AS ENUM('public', 'unlisted', 'private', 'direct');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mentions" (
	"post_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	CONSTRAINT "mentions_post_id_account_id_pk" PRIMARY KEY("post_id","account_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "posts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"iri" text NOT NULL,
	"type" "post_type" NOT NULL,
	"actor_id" uuid NOT NULL,
	"application_id" uuid,
	"reply_target_id" uuid,
	"sharing_id" uuid,
	"visibility" "post_visibility" NOT NULL,
	"summary_html" text,
	"content_html" text,
	"language" text,
	"tags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"url" text,
	"replies_count" bigint DEFAULT 0,
	"shares_count" bigint DEFAULT 0,
	"likes_count" bigint DEFAULT 0,
	"published" timestamp with time zone,
	"updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_iri_unique" UNIQUE("iri")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mentions" ADD CONSTRAINT "mentions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mentions" ADD CONSTRAINT "mentions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_actor_id_accounts_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_reply_target_id_posts_id_fk" FOREIGN KEY ("reply_target_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "posts" ADD CONSTRAINT "posts_sharing_id_posts_id_fk" FOREIGN KEY ("sharing_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
