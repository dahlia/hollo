CREATE TABLE IF NOT EXISTS "totps" (
	"issuer" text NOT NULL,
	"label" text NOT NULL,
	"algorithm" text NOT NULL,
	"digits" smallint NOT NULL,
	"period" smallint NOT NULL,
	"secret" text NOT NULL,
	"created" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);
