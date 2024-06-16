ALTER TABLE "account_owners" RENAME COLUMN "private_key_jwk" TO "rsa_private_key_jwk";--> statement-breakpoint
ALTER TABLE "account_owners" RENAME COLUMN "public_key_jwk" TO "rsa_public_key_jwk";--> statement-breakpoint
ALTER TABLE "account_owners" ADD COLUMN "ed25519_private_key_jwk" jsonb NOT NULL DEFAULT 'null';--> statement-breakpoint
ALTER TABLE "account_owners" ALTER COLUMN "ed25519_private_key_jwk" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "account_owners" ADD COLUMN "ed25519_public_key_jwk" jsonb NOT NULL DEFAULT 'null';--> statement-breakpoint
ALTER TABLE "account_owners" ALTER COLUMN "ed25519_public_key_jwk" DROP DEFAULT;
