ALTER TABLE "mutes" ALTER COLUMN "duration" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "mutes" ALTER COLUMN "duration" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "mutes" ALTER COLUMN "duration" SET DATA TYPE interval USING CASE "duration" WHEN 0 THEN NULL ELSE ("duration" || ' seconds')::interval END;
