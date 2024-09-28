ALTER TABLE "accounts" ADD COLUMN "emojis" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "emojis" jsonb DEFAULT '{}'::jsonb NOT NULL;