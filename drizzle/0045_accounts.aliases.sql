ALTER TABLE "accounts" ADD COLUMN "aliases" text[] DEFAULT (ARRAY[]::text[]) NOT NULL;
