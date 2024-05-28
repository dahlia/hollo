DO $$ BEGIN
 CREATE TYPE "public"."marker_type" AS ENUM('notifications', 'home');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "markers" (
	"account_owner_id" uuid NOT NULL,
	"type" "marker_type" NOT NULL,
	"last_read_id" text NOT NULL,
	"version" bigint DEFAULT 1 NOT NULL,
	"updated" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markers_account_owner_id_type_pk" PRIMARY KEY("account_owner_id","type")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "markers" ADD CONSTRAINT "markers_account_owner_id_account_owners_id_fk" FOREIGN KEY ("account_owner_id") REFERENCES "public"."account_owners"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
