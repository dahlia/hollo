import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { union } from "drizzle-orm/pg-core";
import { Hono } from "hono";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { serializePost } from "../../entities/status";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import {
  accounts,
  bookmarks,
  follows,
  likes,
  mentions,
  posts,
} from "../../schema";

const app = new Hono<{ Variables: Variables }>();

export type NotificationType =
  | "mention"
  | "status"
  | "reblog"
  | "follow"
  | "follow_request"
  | "favourite"
  | "poll"
  | "update"
  | "admin.sign_up"
  | "admin.report";

app.get(
  "/",
  tokenRequired,
  scopeRequired(["read:notifications"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    let types = c.req.queries("types[]") as NotificationType[];
    const excludeTypes = c.req.queries("exclude_types[]") as NotificationType[];
    const limit = Number.parseInt(c.req.query("limit") ?? "40");
    if (types == null || types.length < 1) {
      types = [
        "mention",
        "status",
        "reblog",
        "follow",
        "follow_request",
        "favourite",
        "poll",
        "update",
        "admin.sign_up",
        "admin.report",
      ];
    }
    types = types.filter((t) => !excludeTypes?.includes(t));
    const queries = {
      mention: db
        .select({
          id: sql<string>`'mention:' || ${posts.id}`,
          type: sql<NotificationType>`'mention'`,
          created: sql<Date>`coalesce(${posts.published}, ${posts.updated})`,
          accountId: posts.accountId,
          postId: sql<string | null>`${posts.id}`,
        })
        .from(posts)
        .leftJoin(mentions, eq(posts.id, mentions.postId))
        .where(eq(mentions.accountId, owner.id))
        .orderBy(desc(posts.published)),
      follow: db
        .select({
          id: sql<string>`'follow:' || ${follows.followerId}`,
          type: sql<NotificationType>`'follow'`,
          created: sql<Date>`${follows.approved}`,
          accountId: follows.followerId,
          postId: sql<string | null>`null`,
        })
        .from(follows)
        .where(
          and(eq(follows.followingId, owner.id), isNotNull(follows.approved)),
        )
        .orderBy(desc(follows.approved)),
      follow_request: db
        .select({
          id: sql<string>`'follow_request:' || ${follows.followerId}`,
          type: sql<NotificationType>`'follow_request'`,
          created: follows.created,
          accountId: follows.followerId,
          postId: sql<string | null>`null`,
        })
        .from(follows)
        .where(and(eq(follows.followingId, owner.id), isNull(follows.approved)))
        .orderBy(desc(follows.created)),
      favourite: db
        .select({
          id: sql<string>`'favourite:' || ${likes.postId} || ':' || ${likes.accountId}`,
          type: sql<NotificationType>`'favourite'`,
          created: likes.created,
          accountId: likes.accountId,
          postId: sql<string | null>`${likes.postId}`,
        })
        .from(likes)
        .leftJoin(posts, eq(likes.postId, posts.id))
        .where(eq(posts.accountId, owner.id))
        .orderBy(desc(likes.created)),
    };
    const qs = Object.entries(queries)
      .filter(([t]) => types.includes(t as NotificationType))
      .map(([, q]) => q);
    if (qs.length < 1) return c.json([]);
    // biome-ignore lint/suspicious/noExplicitAny: ...
    let q: any = qs[0];
    for (let i = 1; i < qs.length; i++) {
      // biome-ignore lint/suspicious/noExplicitAny: ...
      q = union(q, qs[i] as any);
    }
    const notifications = (await db
      .select({
        id: sql<string>`q.id`,
        type: sql<NotificationType>`q."type"`,
        created: sql<Date>`q.created`,
        accountId: sql<string>`q.accountId`,
        postId: sql<string | null>`q.postId`,
      })
      .from(sql`${q} AS q (id, "type", created, accountId, postId)`)
      .orderBy(desc(sql`q.created`))
      .limit(limit)) as {
      id: string;
      type: NotificationType;
      created: Date | string;
      accountId: string;
      postId: string | null;
    }[];
    const accountIds = notifications.map((n) => n.accountId);
    const postIds = notifications
      .filter((n) => n.postId != null)
      // biome-ignore lint/style/noNonNullAssertion: filtered
      .map((n) => n.postId!);
    const accountMap = Object.fromEntries(
      (accountIds.length > 0
        ? await db.query.accounts.findMany({
            where: inArray(accounts.id, accountIds),
            with: { owner: true },
          })
        : []
      ).map((a) => [a.id, a]),
    );
    const postMap = Object.fromEntries(
      (postIds.length > 0
        ? await db.query.posts.findMany({
            where: inArray(posts.id, postIds),
            with: {
              account: { with: { owner: true } },
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
          })
        : []
      ).map((p) => [p.id, p]),
    );
    return c.json(
      notifications.map((n) => ({
        id: n.id,
        type: n.type,
        created_at:
          n.created instanceof Date
            ? n.created.toISOString()
            : new Date(n.created).toISOString(),
        account:
          accountMap[n.accountId].owner == null
            ? serializeAccount(accountMap[n.accountId], c.req.url)
            : serializeAccountOwner(
                {
                  ...accountMap[n.accountId].owner,
                  account: accountMap[n.accountId],
                },
                c.req.url,
              ),
        status:
          n.postId == null
            ? null
            : serializePost(postMap[n.postId], owner, c.req.url),
      })),
    );
  },
);

export default app;
