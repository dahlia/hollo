CREATE TABLE IF NOT EXISTS "reports" (
  "id" uuid PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL,
  "target_account_id" uuid NOT NULL,
  "created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
  "comment" text,
  "posts" uuid [] DEFAULT '{}'::uuid [] NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "reports"
ADD CONSTRAINT "reports_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
ALTER TABLE "reports"
ADD CONSTRAINT "reports_target_account_id_accounts_id_fk" FOREIGN KEY ("target_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
WHEN duplicate_object THEN null;
END $$;
