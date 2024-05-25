import { zValidator } from "@hono/zod-validator";
import {
  type SQL,
  and,
  desc,
  eq,
  gt,
  inArray,
  lt,
  ne,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { serializePost } from "../../entities/status";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import {
  accountOwners,
  bookmarks,
  follows,
  likes,
  mentions,
  posts,
} from "../../schema";

const app = new Hono<{ Variables: Variables }>();

app.use(tokenRequired);

export const timelineQuerySchema = z.object({
  max_id: z.string().uuid().optional(),
  since_id: z.string().uuid().optional(),
  min_id: z.string().uuid().optional(),
  limit: z
    .string()
    .default("20")
    .transform((v) => Number.parseInt(v)),
});

export const publicTimelineQuerySchema = timelineQuerySchema.merge(
  z.object({
    local: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
    remote: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  }),
);

app.get(
  "/public",
  zValidator("query", publicTimelineQuerySchema),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const query = c.req.valid("query");
    const timeline = await db.query.posts.findMany({
      where: and(
        eq(posts.visibility, "public"),
        query.local
          ? inArray(
              posts.accountId,
              db.select({ id: accountOwners.id }).from(accountOwners),
            )
          : undefined,
        query.remote
          ? notInArray(
              posts.accountId,
              db.select({ id: accountOwners.id }).from(accountOwners),
            )
          : undefined,
        query.max_id == null ? undefined : lt(posts.id, query.max_id),
        query.min_id == null ? undefined : gt(posts.id, query.min_id),
      ),
      with: {
        account: true,
        application: true,
        replyTarget: true,
        sharing: {
          with: {
            account: true,
            application: true,
            replyTarget: true,
            mentions: { with: { account: { with: { owner: true } } } },
            likes: {
              where: eq(likes.accountId, owner.id),
            },
            bookmarks: {
              where: eq(bookmarks.accountOwnerId, owner.id),
            },
          },
        },
        mentions: { with: { account: { with: { owner: true } } } },
        likes: {
          where: eq(likes.accountId, owner.id),
        },
        bookmarks: {
          where: eq(bookmarks.accountOwnerId, owner.id),
        },
      },
      orderBy: [desc(posts.id)],
      limit: query.limit,
    });
    return c.json(timeline.map((p) => serializePost(p, owner, c.req.url)));
  },
);

app.get(
  "/home",
  scopeRequired(["read:statuses"]),
  zValidator("query", timelineQuerySchema),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const query = c.req.valid("query");
    // biome-ignore lint/style/useTemplate: nested template strings are rather ugly
    const followedTags: SQL[] = owner.followedTags.map((t) => sql`${"#" + t}`);
    const timeline = await db.query.posts.findMany({
      where: and(
        or(
          eq(posts.accountId, owner.id),
          and(
            ne(posts.visibility, "direct"),
            inArray(
              posts.accountId,
              db
                .select({ id: follows.followingId })
                .from(follows)
                .where(eq(follows.followerId, owner.id)),
            ),
          ),
          and(
            ne(posts.visibility, "private"),
            inArray(
              posts.id,
              db
                .select({ id: mentions.postId })
                .from(mentions)
                .where(eq(mentions.accountId, owner.id)),
            ),
          ),
          owner.followedTags.length < 1
            ? undefined
            : and(
                eq(posts.visibility, "public"),
                sql`${posts.tags} ?| ARRAY[${sql.join(
                  followedTags,
                  sql.raw(","),
                )}]`,
              ),
        ),
        query.max_id == null ? undefined : lt(posts.id, query.max_id),
        query.min_id == null ? undefined : gt(posts.id, query.min_id),
      ),
      with: {
        account: true,
        application: true,
        replyTarget: true,
        sharing: {
          with: {
            account: true,
            application: true,
            replyTarget: true,
            mentions: { with: { account: { with: { owner: true } } } },
            likes: {
              where: eq(likes.accountId, owner.id),
            },
            bookmarks: {
              where: eq(bookmarks.accountOwnerId, owner.id),
            },
          },
        },
        mentions: { with: { account: { with: { owner: true } } } },
        likes: {
          where: eq(likes.accountId, owner.id),
        },
        bookmarks: {
          where: eq(bookmarks.accountOwnerId, owner.id),
        },
      },
      orderBy: [desc(posts.id)],
      limit: query.limit,
    });
    return c.json(timeline.map((p) => serializePost(p, owner, c.req.url)));
  },
);

app.get(
  "/tag/:hashtag",
  tokenRequired,
  scopeRequired(["read:statuses"]),
  zValidator("query", publicTimelineQuerySchema),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const query = c.req.valid("query");
    const hashtag = `#${c.req.param("hashtag")}`;
    const timeline = await db.query.posts.findMany({
      where: and(
        or(
          eq(posts.accountId, owner.id),
          and(
            ne(posts.visibility, "direct"),
            inArray(
              posts.accountId,
              db
                .select({ id: follows.followingId })
                .from(follows)
                .where(eq(follows.followerId, owner.id)),
            ),
          ),
          and(
            ne(posts.visibility, "private"),
            inArray(
              posts.id,
              db
                .select({ id: mentions.postId })
                .from(mentions)
                .where(eq(mentions.accountId, owner.id)),
            ),
          ),
        ),
        sql`${posts.tags} ? ${hashtag.toLowerCase()}`,
        query.local
          ? inArray(
              posts.accountId,
              db.select({ id: accountOwners.id }).from(accountOwners),
            )
          : undefined,
        query.remote
          ? notInArray(
              posts.accountId,
              db.select({ id: accountOwners.id }).from(accountOwners),
            )
          : undefined,
        query.max_id == null ? undefined : lt(posts.id, query.max_id),
        query.min_id == null ? undefined : gt(posts.id, query.min_id),
      ),
      with: {
        account: true,
        application: true,
        replyTarget: true,
        sharing: {
          with: {
            account: true,
            application: true,
            replyTarget: true,
            mentions: { with: { account: { with: { owner: true } } } },
            likes: {
              where: eq(likes.accountId, owner.id),
            },
            bookmarks: {
              where: eq(bookmarks.accountOwnerId, owner.id),
            },
          },
        },
        mentions: { with: { account: { with: { owner: true } } } },
        likes: {
          where: eq(likes.accountId, owner.id),
        },
        bookmarks: {
          where: eq(bookmarks.accountOwnerId, owner.id),
        },
      },
      orderBy: [desc(posts.id)],
      limit: query.limit,
    });
    return c.json(timeline.map((p) => serializePost(p, owner, c.req.url)));
  },
);

export default app;
