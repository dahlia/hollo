CREATE TABLE IF NOT EXISTS "credentials" (
	"email" varchar(254) PRIMARY KEY NOT NULL,
	"password_hash" text NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL
);
