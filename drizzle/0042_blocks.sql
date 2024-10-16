CREATE TABLE IF NOT EXISTS "blocks" (
	"account_id" uuid NOT NULL,
	"blocked_account_id" uuid NOT NULL,
	"created" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_account_id_blocked_account_id_pk" PRIMARY KEY("account_id","blocked_account_id")
);
