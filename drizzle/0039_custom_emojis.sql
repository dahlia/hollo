CREATE TABLE IF NOT EXISTS "custom_emojis" (
	"shortcode" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"category" text,
	"created" timestamp with time zone DEFAULT now() NOT NULL
);
