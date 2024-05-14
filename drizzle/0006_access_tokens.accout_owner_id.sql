DO $$ BEGIN
 CREATE TYPE "public"."grant_type" AS ENUM('authorization_code', 'client_credentials');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "account_owner_id" uuid;--> statement-breakpoint
ALTER TABLE "access_tokens" ADD COLUMN "grant_type" "grant_type" DEFAULT 'authorization_code' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_account_owner_id_account_owners_id_fk" FOREIGN KEY ("account_owner_id") REFERENCES "public"."account_owners"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
