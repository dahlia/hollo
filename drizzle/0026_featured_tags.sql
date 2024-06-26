CREATE TABLE IF NOT EXISTS "featured_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"account_owner_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created" timestamp with time zone,
	CONSTRAINT "featured_tags_account_owner_id_name_unique" UNIQUE("account_owner_id","name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "featured_tags" ADD CONSTRAINT "featured_tags_account_owner_id_account_owners_id_fk" FOREIGN KEY ("account_owner_id") REFERENCES "public"."account_owners"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
