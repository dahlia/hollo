ALTER TABLE "accounts" ADD COLUMN "successor_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_successor_id_accounts_id_fk" FOREIGN KEY ("successor_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
