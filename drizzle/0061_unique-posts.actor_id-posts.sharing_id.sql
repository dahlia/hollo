DELETE FROM "posts" WHERE "posts"."id" NOT IN (
  SELECT any_value("posts"."id")
  FROM "posts"
  WHERE "posts"."sharing_id" IS NOT NULL
  GROUP BY "posts"."actor_id", "posts"."sharing_id"
) AND "posts"."sharing_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_actor_id_sharing_id_unique" UNIQUE("actor_id","sharing_id");
