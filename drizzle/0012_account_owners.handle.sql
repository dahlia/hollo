ALTER TABLE "account_owners" ADD COLUMN "handle" text;
UPDATE "account_owners"
  SET "handle" = regexp_replace("accounts"."handle", '^@|@[^@]+$', '', 'g')
  FROM "accounts" WHERE "account_owners"."id" = "accounts"."id";
