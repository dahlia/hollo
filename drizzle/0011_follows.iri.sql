ALTER TABLE "follows" ADD COLUMN "iri" text;
UPDATE "follows" SET "iri" = 'urn:uuid:' || gen_random_uuid()::text;
ALTER TABLE "follows" ALTER COLUMN "iri" SET NOT NULL;
