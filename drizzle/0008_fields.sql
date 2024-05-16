ALTER TABLE "account_owners" ADD COLUMN "fields" json DEFAULT '{}'::json NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "field_htmls" json DEFAULT '{}'::json NOT NULL;
