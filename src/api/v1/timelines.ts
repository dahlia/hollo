import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { serializePost } from "../../entities/status";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { posts } from "../../schema";

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

app.get("/public", zValidator("query", timelineQuerySchema), async (c) => {
  const query = c.req.valid("query");
  const timeline = await db.query.posts.findMany({
    where: and(
      eq(posts.visibility, "public"),
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
});

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
          eq(posts.visibility, "public"), // FIXME
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
