CREATE TABLE IF NOT EXISTS "access_tokens" (
	"code" text PRIMARY KEY NOT NULL,
	"application_id" uuid NOT NULL,
	"scopes" scope[] NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "applications" ADD COLUMN "created" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "access_tokens" ADD CONSTRAINT "access_tokens_application_id_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
