ALTER TABLE "applications" RENAME COLUMN "redirect_uri" TO "redirect_uris";--> statement-breakpoint
ALTER TABLE "applications" ALTER COLUMN "redirect_uris" SET DATA TYPE text[]
  USING ARRAY[redirect_uris];
