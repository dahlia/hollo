CREATE TABLE IF NOT EXISTS "mutes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"muted_account_id" uuid NOT NULL,
	"notifications" boolean DEFAULT true NOT NULL,
	"duration" integer DEFAULT 0 NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mutes_account_id_muted_account_id_unique" UNIQUE("account_id","muted_account_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mutes" ADD CONSTRAINT "mutes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "mutes" ADD CONSTRAINT "mutes_muted_account_id_accounts_id_fk" FOREIGN KEY ("muted_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
