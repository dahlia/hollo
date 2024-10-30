CREATE TABLE IF NOT EXISTS "instances" (
	"host" text PRIMARY KEY NOT NULL,
	"software" text,
	"software_version" text,
	"created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "instance_host" text;--> statement-breakpoint
INSERT INTO "instances" ("host", "software", "software_version")
SELECT
    regexp_replace("accounts"."handle", '^@[^@]+@', ''),
    any_value("accounts"."software"),
    any_value("accounts"."software_version")
FROM "accounts"
GROUP BY regexp_replace("accounts"."handle", '^@[^@]+@', '');--> statement-breakpoint
UPDATE "accounts" SET "instance_host" = regexp_replace("accounts"."handle", '^@[^@]+@', '');--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "instance_host" SET NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "accounts" ADD CONSTRAINT "accounts_instance_host_instances_host_fk" FOREIGN KEY ("instance_host") REFERENCES "public"."instances"("host") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "software";--> statement-breakpoint
ALTER TABLE "accounts" DROP COLUMN IF EXISTS "software_version";
