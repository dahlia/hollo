DO $$ BEGIN
 CREATE TYPE "public"."account_type" AS ENUM('Application', 'Group', 'Organization', 'Person', 'Service');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account_owners" (
	"id" uuid PRIMARY KEY NOT NULL,
	"private_key_jwk" jsonb NOT NULL,
	"public_key_jwk" jsonb NOT NULL,
	"bio" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"iri" text NOT NULL,
	"type" "account_type" NOT NULL,
	"name" varchar(100) NOT NULL,
	"handle" text NOT NULL,
	"bio_html" text,
	"url" text,
	"protected" boolean DEFAULT false NOT NULL,
	"avatar_url" text,
	"cover_url" text,
	"inbox_url" text NOT NULL,
	"followers_url" text,
	"shared_inbox_url" text,
	"following" bigint DEFAULT 0,
	"followers" bigint DEFAULT 0,
	"posts" bigint DEFAULT 0,
	"published" timestamp with time zone,
	"fetched" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_iri_unique" UNIQUE("iri"),
	CONSTRAINT "accounts_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account_owners" ADD CONSTRAINT "account_owners_id_accounts_id_fk" FOREIGN KEY ("id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
