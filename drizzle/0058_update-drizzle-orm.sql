DROP INDEX "posts_visibility_actor_id_sharing_id_index";--> statement-breakpoint
DROP INDEX "posts_visibility_actor_id_reply_target_id_index";--> statement-breakpoint
ALTER TABLE "account_owners" ALTER COLUMN "followed_tags" SET DEFAULT '{}';--> statement-breakpoint
CREATE INDEX "posts_visibility_actor_id_sharing_id_index" ON "posts" USING btree ("visibility","actor_id","sharing_id") WHERE "posts"."sharing_id" is not null;--> statement-breakpoint
CREATE INDEX "posts_visibility_actor_id_reply_target_id_index" ON "posts" USING btree ("visibility","actor_id","reply_target_id") WHERE "posts"."reply_target_id" is not null;--> statement-breakpoint
DELETE FROM "follows" WHERE "follows"."following_id" = "follows"."follower_id";--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "ck_follows_self" CHECK ("follows"."following_id" != "follows"."follower_id");
