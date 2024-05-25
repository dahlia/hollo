ALTER TABLE "account_owners" ADD COLUMN "followed_tags" text[] DEFAULT '{}' NOT NULL;
