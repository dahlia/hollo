ALTER TABLE "account_owners" ADD COLUMN "visibility" "post_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "account_owners" ADD COLUMN "language" text DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "sensitive" boolean DEFAULT false NOT NULL;