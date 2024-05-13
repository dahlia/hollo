DO $$ BEGIN
 CREATE TYPE "public"."scope" AS ENUM('read', 'read:accounts', 'read:blocks', 'read:bookmarks', 'read:favourites', 'read:filters', 'read:follows', 'read:lists', 'read:mutes', 'read:notifications', 'read:search', 'read:statuses', 'write', 'write:accounts', 'write:blocks', 'write:bookmarks', 'write:conversations', 'write:favourites', 'write:filters', 'write:follows', 'write:lists', 'write:media', 'write:mutes', 'write:notifications', 'write:reports', 'write:statuses', 'follow', 'push');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "applications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(256) NOT NULL,
	"redirect_uri" text NOT NULL,
	"scopes" scope[] NOT NULL,
	"website" text,
	"client_id" text NOT NULL,
	"client_secret" text NOT NULL,
	CONSTRAINT "applications_client_id_unique" UNIQUE("client_id")
);
