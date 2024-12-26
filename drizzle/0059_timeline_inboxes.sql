CREATE TABLE "list_posts" (
	"list_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	CONSTRAINT "list_posts_list_id_post_id_pk" PRIMARY KEY("list_id","post_id")
);
--> statement-breakpoint
CREATE TABLE "timeline_posts" (
	"account_id" uuid NOT NULL,
	"post_id" uuid NOT NULL,
	CONSTRAINT "timeline_posts_account_id_post_id_pk" PRIMARY KEY("account_id","post_id")
);
--> statement-breakpoint
ALTER TABLE "list_posts" ADD CONSTRAINT "list_posts_list_id_lists_id_fk" FOREIGN KEY ("list_id") REFERENCES "public"."lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "list_posts" ADD CONSTRAINT "list_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_posts" ADD CONSTRAINT "timeline_posts_account_id_account_owners_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account_owners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeline_posts" ADD CONSTRAINT "timeline_posts_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "list_posts_list_id_post_id_index" ON "list_posts" USING btree ("list_id","post_id");--> statement-breakpoint
CREATE INDEX "timeline_posts_account_id_post_id_index" ON "timeline_posts" USING btree ("account_id","post_id");