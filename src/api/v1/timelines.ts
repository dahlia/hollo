import { zValidator } from "@hono/zod-validator";
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  ne,
  notInArray,
  or,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { serializePost } from "../../entities/status";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { accountOwners, follows, mentions, posts } from "../../schema";

const app = new Hono<{ Variables: Variables }>();

export const timelineQuerySchema = z.object({
  max_id: z.string().uuid().optional(),
  since_id: z.string().uuid().optional(),
  min_id: z.string().uuid().optional(),
  limit: z
    .string()
    .transform((v) => Number.parseInt(v))
    .optional(),
});

app.get(
  "/public",
  zValidator(
    "query",
    timelineQuerySchema.merge(
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
    ),
  ),
  async (c) => {
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
        query.max_id == null ? undefined : lte(posts.id, query.max_id),
        query.min_id == null ? undefined : gte(posts.id, query.min_id),
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
          },
        },
        mentions: { with: { account: { with: { owner: true } } } },
      },
      orderBy: [desc(posts.id)],
      limit: query.limit ?? 20,
    });
    return c.json(timeline.map(serializePost));
  },
);

app.get(
  "/home",
  tokenRequired,
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
        query.max_id == null ? undefined : lte(posts.id, query.max_id),
        query.min_id == null ? undefined : gte(posts.id, query.min_id),
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
          },
        },
        mentions: { with: { account: { with: { owner: true } } } },
      },
      orderBy: [desc(posts.id)],
      limit: query.limit ?? 20,
    });
    return c.json(timeline.map(serializePost));
  },
);

export default app;
