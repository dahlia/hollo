import {
  Add,
  Emoji,
  EmojiReact,
  Image,
  Note,
  PUBLIC_COLLECTION,
  Remove,
  Undo,
} from "@fedify/fedify";
import * as vocab from "@fedify/fedify/vocab";
import { zValidator } from "@hono/zod-validator";
import {
  and,
  eq,
  gt,
  isNotNull,
  isNull,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { type Context, Hono } from "hono";
import type { TypedResponse } from "hono/types";
import { uuidv7 } from "uuidv7-js";
import { z } from "zod";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { getPostRelations, serializePost } from "../../entities/status";
import federation from "../../federation";
import { updateAccountStats } from "../../federation/account";
import {
  getRecipients,
  persistPost,
  toAnnounce,
  toCreate,
  toDelete,
  toUpdate,
} from "../../federation/post";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { type PreviewCard, fetchPreviewCard } from "../../previewcard";
import { createRedis, getRedisUrl } from "../../redis";
import {
  type Like,
  type NewBookmark,
  type NewLike,
  type NewPinnedPost,
  type NewPollOption,
  type NewPost,
  type Poll,
  blocks,
  bookmarks,
  customEmojis,
  likes,
  media,
  mentions,
  mutes,
  pinnedPosts,
  pollOptions,
  polls,
  posts,
  reactions,
} from "../../schema";
import { formatText } from "../../text";

const app = new Hono<{ Variables: Variables }>();

const statusSchema = z.object({
  status: z.string().min(1).optional(),
  media_ids: z.array(z.string().uuid()).optional(),
  poll: z
    .object({
      options: z.array(z.string()),
      expires_in: z.union([
        z.number().int(),
        z
          .string()
          .regex(/^\d+$/)
          .transform((v) => Number.parseInt(v)),
      ]),
      multiple: z.boolean().default(false),
      hide_totals: z.boolean().default(false),
    })
    .optional(),
  sensitive: z.boolean().default(false),
  spoiler_text: z.string().optional(),
  language: z.string().min(2).optional(),
});

app.post(
  "/",
  tokenRequired,
  scopeRequired(["write:statuses"]),
  zValidator(
    "json",
    statusSchema.merge(
      z.object({
        in_reply_to_id: z.string().uuid().optional(),
        quote_id: z.string().uuid().optional(),
        visibility: z
          .enum(["public", "unlisted", "private", "direct"])
          .optional(),
        scheduled_at: z.string().datetime().optional(),
      }),
    ),
  ),
  async (c) => {
    const token = c.get("token");
    const owner = token.accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const idempotencyKey = c.req.header("Idempotency-Key");
    if (idempotencyKey != null && getRedisUrl() != null) {
      const redis = createRedis();
      const prevPostId = await redis.get(`idempotency:${idempotencyKey}`);
      if (prevPostId != null) {
        const post = await db.query.posts.findFirst({
          where: eq(posts.id, prevPostId),
          with: getPostRelations(owner.id),
        });
        if (post != null) return c.json(serializePost(post, owner, c.req.url));
      }
    }
    const fedCtx = federation.createContext(c.req.raw, undefined);
    const fmtOpts = {
      url: fedCtx.url,
      contextLoader: fedCtx.contextLoader,
      documentLoader: await fedCtx.getDocumentLoader({
        username: owner.handle,
      }),
    };
    const data = c.req.valid("json");
    const handle = owner.handle;
    const id = uuidv7();
    const url = fedCtx.getObjectUri(Note, { username: handle, id });
    const content =
      data.status == null ? null : await formatText(db, data.status, fmtOpts);
    const summary =
      data.spoiler_text == null || data.spoiler_text.trim() === ""
        ? null
        : data.spoiler_text;
    const mentionedIds = content?.mentions ?? [];
    const hashtags = content?.hashtags ?? [];
    const emojis = content?.emojis ?? {};
    const tags = Object.fromEntries(
      hashtags.map((tag) => [
        tag.toLowerCase(),
        new URL(`/tags/${encodeURIComponent(tag.substring(1))}`, c.req.url)
          .href,
      ]),
    );
    let previewCard: PreviewCard | null = null;
    if (content?.previewLink != null) {
      previewCard = await fetchPreviewCard(content.previewLink);
    }
    let quoteTargetId: string | null = null;
    if (data.quote_id != null) quoteTargetId = data.quote_id;
    else if (content?.quoteTarget != null) {
      const quoted = await persistPost(db, content.quoteTarget, fmtOpts);
      if (quoted != null) quoteTargetId = quoted.id;
    }
    await db.transaction(async (tx) => {
      let poll: Poll | null = null;
      if (data.poll != null) {
        const expires = new Date(
          new Date().getTime() + data.poll.expires_in * 1000,
        );
        [poll] = await tx
          .insert(polls)
          .values({
            id: uuidv7(),
            multiple: data.poll.multiple,
            expires,
          })
          .returning();
        await tx.insert(pollOptions).values(
          data.poll.options.map(
            (title, index) =>
              ({
                pollId: poll!.id,
                index,
                title,
              }) satisfies NewPollOption,
          ),
        );
      }
      await tx.insert(posts).values({
        id,
        iri: url.href,
        type: poll == null ? "Note" : "Question",
        accountId: owner.id,
        applicationId: token.applicationId,
        replyTargetId: data.in_reply_to_id,
        quoteTargetId,
        sharingId: null,
        visibility: data.visibility ?? owner.visibility,
        summary,
        content: data.status,
        contentHtml: content?.html,
        language: data.language ?? owner.language,
        pollId: poll == null ? null : poll.id,
        // https://github.com/drizzle-team/drizzle-orm/issues/724#issuecomment-1650670298
        tags: sql`${tags}::jsonb`,
        emojis: sql`${emojis}::jsonb`,
        sensitive: data.sensitive,
        url: url.href,
        previewCard,
        published: sql`CURRENT_TIMESTAMP`,
      });
      if (data.media_ids != null && data.media_ids.length > 0) {
        for (const mediaId of data.media_ids) {
          const result = await tx
            .update(media)
            .set({ postId: id })
            .where(and(eq(media.id, mediaId), isNull(media.postId)))
            .returning();
          if (result.length < 1) {
            tx.rollback();
            return c.json({ error: "Media not found" }, 422);
          }
        }
      }
      if (mentionedIds.length > 0) {
        await tx.insert(mentions).values(
          mentionedIds.map((accountId) => ({
            postId: id,
            accountId,
          })),
        );
      }
      await updateAccountStats(tx, owner);
    });
    const post = (await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: getPostRelations(owner.id),
    }))!;
    if (idempotencyKey != null && getRedisUrl() != null) {
      const redis = createRedis();
      await redis.set(`idempotency:${idempotencyKey}`, id);
      await redis.expire(`idempotency:${idempotencyKey}`, 60 * 60);
    }
    const activity = toCreate(post, fedCtx);
    await fedCtx.sendActivity({ handle }, getRecipients(post), activity, {
      excludeBaseUris: [new URL(c.req.url)],
    });
    if (post.visibility !== "direct") {
      await fedCtx.sendActivity({ handle }, "followers", activity, {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(c.req.url)],
      });
    }
    return c.json(serializePost(post, owner, c.req.url));
  },
);

app.put(
  "/:id",
  tokenRequired,
  scopeRequired(["write:statuses"]),
  zValidator("json", statusSchema),
  async (c) => {
    const token = c.get("token");
    const owner = token.accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const fedCtx = federation.createContext(c.req.raw, undefined);
    const fmtOpts = {
      url: fedCtx.url,
      contextLoader: fedCtx.contextLoader,
      documentLoader: await fedCtx.getDocumentLoader({
        username: owner.handle,
      }),
    };
    const content =
      data.status == null ? null : await formatText(db, data.status, fmtOpts);
    const summary =
      data.spoiler_text == null || data.spoiler_text.trim() === ""
        ? null
        : data.spoiler_text;
    const hashtags = content?.hashtags ?? [];
    const tags = Object.fromEntries(
      hashtags.map((tag) => [
        tag.toLowerCase(),
        new URL(`/tags/${encodeURIComponent(tag.substring(1))}`, c.req.url)
          .href,
      ]),
    );
    const emojis = content?.emojis ?? {};
    let previewCard: PreviewCard | null = null;
    if (content?.previewLink != null) {
      previewCard = await fetchPreviewCard(content.previewLink);
    }
    await db.transaction(async (tx) => {
      const result = await tx
        .update(posts)
        .set({
          content: data.status,
          contentHtml: content?.html,
          sensitive: data.sensitive,
          summary,
          language: data.language ?? owner.language,
          // https://github.com/drizzle-team/drizzle-orm/issues/724#issuecomment-1650670298
          tags: sql`${tags}::jsonb`,
          emojis: sql`${emojis}::jsonb`,
          previewCard,
          updated: new Date(),
        })
        .where(eq(posts.id, id))
        .returning();
      if (result.length < 1) return c.json({ error: "Record not found" }, 404);
      await tx.delete(mentions).where(eq(mentions.postId, id));
      const mentionedIds = content?.mentions ?? [];
      if (mentionedIds.length > 0) {
        await tx.insert(mentions).values(
          mentionedIds.map((accountId) => ({
            postId: id,
            accountId,
          })),
        );
      }
    });
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: getPostRelations(owner.id),
    });
    const activity = toUpdate(post!, fedCtx);
    await fedCtx.sendActivity(owner, getRecipients(post!), activity, {
      excludeBaseUris: [new URL(c.req.url)],
    });
    await fedCtx.sendActivity(owner, "followers", activity, {
      preferSharedInbox: true,
      excludeBaseUris: [new URL(c.req.url)],
    });
    return c.json(serializePost(post!, owner, c.req.url));
  },
);

app.get("/:id", tokenRequired, scopeRequired(["read:statuses"]), async (c) => {
  const owner = c.get("token").accountOwner;
  if (owner == null) {
    return c.json({ error: "This method requires an authenticated user" }, 422);
  }
  const id = c.req.param("id");
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, id),
    with: getPostRelations(owner.id),
  });
  if (post == null) return c.json({ error: "Record not found" }, 404);
  return c.json(serializePost(post, owner, c.req.url));
});

app.delete(
  "/:id",
  tokenRequired,
  scopeRequired(["write:statuses"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: getPostRelations(owner.id),
    });
    if (post == null) return c.json({ error: "Record not found" }, 404);
    await db.transaction(async (tx) => {
      await tx.delete(posts).where(eq(posts.id, id));
      await updateAccountStats(tx, owner);
    });
    const fedCtx = federation.createContext(c.req.raw, undefined);
    const activity = toDelete(post, fedCtx);
    await fedCtx.sendActivity(
      { handle: owner.handle },
      getRecipients(post),
      activity,
      {
        excludeBaseUris: [new URL(c.req.url)],
      },
    );
    if (post.visibility !== "direct") {
      await fedCtx.sendActivity(
        { handle: owner.handle },
        "followers",
        activity,
        {
          preferSharedInbox: true,
          excludeBaseUris: [new URL(c.req.url)],
        },
      );
    }
    return c.json({
      ...serializePost(post, owner, c.req.url),
      text: post.content ?? "",
      spoiler_text: post.summary ?? "",
    });
  },
);

app.get(
  "/:id/source",
  tokenRequired,
  scopeRequired(["read:statuses"]),
  async (c) => {
    const id = c.req.param("id");
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
    });
    if (post == null) return c.json({ error: "Record not found" }, 404);
    return c.json({
      id: post.id,
      text: post.content ?? "",
      spoiler_text: post.summary ?? "",
    });
  },
);

app.get(
  "/:id/context",
  tokenRequired,
  scopeRequired(["read:statuses"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: getPostRelations(owner.id),
    });
    if (post == null) return c.json({ error: "Record not found" }, 404);
    const ancestors: (typeof post)[] = [];
    let p: typeof post | undefined = post;
    while (p.replyTargetId != null) {
      p = await db.query.posts.findFirst({
        where: and(
          eq(posts.id, p.replyTargetId),
          notInArray(
            posts.accountId,
            db
              .select({ accountId: mutes.mutedAccountId })
              .from(mutes)
              .where(
                and(
                  eq(mutes.accountId, owner.id),
                  or(
                    isNull(mutes.duration),
                    gt(
                      sql`${mutes.created} + ${mutes.duration}`,
                      sql`CURRENT_TIMESTAMP`,
                    ),
                  ),
                ),
              ),
          ),
          notInArray(
            posts.accountId,
            db
              .select({ accountId: blocks.blockedAccountId })
              .from(blocks)
              .where(eq(blocks.accountId, owner.id)),
          ),
          notInArray(
            posts.accountId,
            db
              .select({ accountId: blocks.accountId })
              .from(blocks)
              .where(eq(blocks.blockedAccountId, owner.id)),
          ),
        ),
        with: getPostRelations(owner.id),
      });
      if (p == null) break;
      ancestors.unshift(p);
    }
    const descendants: (typeof post)[] = [];
    const ps: (typeof post)[] = [post];
    while (true) {
      const p = ps.shift();
      if (p == null) break;
      const replies = await db.query.posts.findMany({
        where: and(
          eq(posts.replyTargetId, p.id),
          notInArray(
            posts.accountId,
            db
              .select({ accountId: mutes.mutedAccountId })
              .from(mutes)
              .where(
                and(
                  eq(mutes.accountId, owner.id),
                  or(
                    isNull(mutes.duration),
                    gt(
                      sql`${mutes.created} + ${mutes.duration}`,
                      sql`CURRENT_TIMESTAMP`,
                    ),
                  ),
                ),
              ),
          ),
          notInArray(
            posts.accountId,
            db
              .select({ accountId: blocks.blockedAccountId })
              .from(blocks)
              .where(eq(blocks.accountId, owner.id)),
          ),
          notInArray(
            posts.accountId,
            db
              .select({ accountId: blocks.accountId })
              .from(blocks)
              .where(eq(blocks.blockedAccountId, owner.id)),
          ),
        ),
        with: getPostRelations(owner.id),
      });
      descendants.push(...replies);
      ps.push(...replies);
    }
    return c.json({
      ancestors: ancestors.map((p) => serializePost(p, owner, c.req.url)),
      descendants: descendants.map((p) => serializePost(p, owner, c.req.url)),
    });
  },
);

app.post(
  "/:id/favourite",
  tokenRequired,
  scopeRequired(["write:favourites"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const postId = c.req.param("id");
    let like: Like;
    try {
      const result = await db
        .insert(likes)
        .values({
          postId,
          accountId: owner.id,
        } as NewLike)
        .returning();
      like = result[0];
    } catch (_) {
      return c.json({ error: "Record not found" }, 404);
    }
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: getPostRelations(owner.id),
    });
    if (post == null) {
      return c.json({ error: "Record not found" }, 404);
    }
    const fedCtx = federation.createContext(c.req.raw, undefined);
    await fedCtx.sendActivity(
      { handle: owner.handle },
      {
        id: new URL(post.account.iri),
        inboxId: new URL(post.account.inboxUrl),
      },
      new vocab.Like({
        id: new URL(`#likes/${like.created.toISOString()}`, owner.account.iri),
        actor: new URL(owner.account.iri),
        object: new URL(post.iri),
      }),
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(c.req.url)],
      },
    );
    return c.json(serializePost(post, owner, c.req.url));
  },
);

app.post(
  "/:id/unfavourite",
  tokenRequired,
  scopeRequired(["write:favourites"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const postId = c.req.param("id");
    const result = await db
      .delete(likes)
      .where(and(eq(likes.postId, postId), eq(likes.accountId, owner.id)))
      .returning();
    if (result.length < 1) return c.json({ error: "Record not found" }, 404);
    const like = result[0];
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: getPostRelations(owner.id),
    });
    if (post == null) {
      return c.json({ error: "Record not found" }, 404);
    }
    const fedCtx = federation.createContext(c.req.raw, undefined);
    await fedCtx.sendActivity(
      { handle: owner.handle },
      {
        id: new URL(post.account.iri),
        inboxId: new URL(post.account.inboxUrl),
      },
      new vocab.Undo({
        actor: new URL(owner.account.iri),
        object: new vocab.Like({
          id: new URL(
            `#likes/${like.created.toISOString()}`,
            owner.account.iri,
          ),
          actor: new URL(owner.account.iri),
          object: new URL(post.iri),
        }),
      }),
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(c.req.url)],
      },
    );
    return c.json(serializePost(post, owner, c.req.url));
  },
);

app.get(
  "/:id/favourited_by",
  tokenRequired,
  scopeRequired(["read:statuses"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const likeList = await db.query.likes.findMany({
      where: eq(likes.postId, id),
      with: { account: { with: { owner: true, successor: true } } },
    });
    return c.json(
      likeList.map((l) =>
        l.account.owner == null
          ? serializeAccount(l.account, c.req.url)
          : serializeAccountOwner(
              { ...l.account.owner, account: l.account },
              c.req.url,
            ),
      ),
    );
  },
);

const reblogSchema = z.object({
  visibility: z.enum(["public", "unlisted", "private"]).default("public"),
});

app.post(
  "/:id/reblog",
  tokenRequired,
  scopeRequired(["write:statuses"]),
  async (c) => {
    const token = c.get("token");
    const owner = token.accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const originalPostId = c.req.param("id");
    const contentType = c.req.header("Content-Type");
    let data: z.infer<typeof reblogSchema>;
    if (contentType?.match(/^application\/json(\s*;|$)/)) {
      data = reblogSchema.parse(await c.req.json());
    } else if (contentType === "application/x-www-form-urlencoded") {
      data = reblogSchema.parse(await c.req.formData());
    } else if (contentType == null) {
      data = { visibility: "public" };
    } else {
      return c.json({ error: "Unsupported Media Type" }, 415);
    }
    const visibility = data.visibility;
    const originalPost = await db.query.posts.findFirst({
      where: eq(posts.id, originalPostId),
      with: { account: true },
    });
    if (
      originalPost == null ||
      originalPost.visibility === "private" ||
      originalPost.visibility === "direct"
    ) {
      return c.json({ error: "Record not found" }, 404);
    }
    const fedCtx = federation.createContext(c.req.raw, undefined);
    const id = uuidv7();
    const url = fedCtx.getObjectUri(Note, { username: owner.handle, id });
    const published = new Date();
    await db.transaction(async (tx) => {
      await tx.insert(posts).values({
        ...originalPost,
        id,
        iri: url.href,
        accountId: owner.id,
        applicationId: token.applicationId,
        replyTargetId: null,
        sharingId: originalPostId,
        visibility,
        url: url.href,
        published,
        updated: published,
      } satisfies NewPost);
      await tx
        .update(posts)
        .set({ sharesCount: sql`coalesce(${posts.sharesCount}, 0) + 1` })
        .where(eq(posts.id, originalPostId));
    });
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: getPostRelations(owner.id),
    });
    await fedCtx.sendActivity(
      { handle: owner.handle },
      "followers",
      toAnnounce(post!, fedCtx),
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(c.req.url)],
      },
    );
    return c.json(serializePost(post!, owner, c.req.url));
  },
);

app.post(
  "/:id/unreblog",
  tokenRequired,
  scopeRequired(["write:statuses"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const originalPostId = c.req.param("id");
    const postList = await db.query.posts.findMany({
      where: and(
        eq(posts.accountId, owner.id),
        eq(posts.sharingId, originalPostId),
      ),
      with: {
        account: true,
        sharing: {
          with: { account: true },
        },
      },
    });
    if (postList.length < 1) return c.json({ error: "Record not found" }, 404);
    await db
      .delete(posts)
      .where(
        and(eq(posts.accountId, owner.id), eq(posts.sharingId, originalPostId)),
      );
    await db
      .update(posts)
      .set({
        sharesCount: sql`coalesce(${posts.sharesCount} - ${postList.length}, 0)`,
      })
      .where(eq(posts.id, originalPostId));
    const fedCtx = federation.createContext(c.req.raw, undefined);
    for (const post of postList) {
      await fedCtx.sendActivity(
        { handle: owner.handle },
        "followers",
        new Undo({
          actor: new URL(owner.account.iri),
          object: toAnnounce(post, fedCtx),
        }),
        {
          preferSharedInbox: true,
          excludeBaseUris: [new URL(c.req.url)],
        },
      );
    }
    const originalPost = await db.query.posts.findFirst({
      where: eq(posts.id, originalPostId),
      with: getPostRelations(owner.id),
    });
    return c.json(serializePost(originalPost!, owner, c.req.url));
  },
);

app.post(
  "/:id/bookmark",
  tokenRequired,
  scopeRequired(["write:bookmarks"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const postId = c.req.param("id");
    try {
      await db.insert(bookmarks).values({
        postId,
        accountOwnerId: owner.id,
      } satisfies NewBookmark);
    } catch (_) {
      return c.json({ error: "Record not found" }, 404);
    }
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: getPostRelations(owner.id),
    });
    return c.json(serializePost(post!, owner, c.req.url));
  },
);

app.post(
  "/:id/unbookmark",
  tokenRequired,
  scopeRequired(["write:bookmarks"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const postId = c.req.param("id");
    const result = await db
      .delete(bookmarks)
      .where(
        and(
          eq(bookmarks.postId, postId),
          eq(bookmarks.accountOwnerId, owner.id),
        ),
      )
      .returning();
    if (result.length < 1) {
      return c.json({ error: "Record not found" }, 404);
    }
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: getPostRelations(owner.id),
    });
    return c.json(serializePost(post!, owner, c.req.url));
  },
);

app.post(
  "/:id/pin",
  tokenRequired,
  scopeRequired(["write:accounts"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const postId = c.req.param("id");
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
    });
    if (post == null) {
      return c.json({ error: "Record not found" }, 404);
    }
    if (post.accountId !== owner.id) {
      return c.json(
        { error: "Validation failed: Someone else's post cannot be pinned" },
        422,
      );
    }
    const result = await db
      .insert(pinnedPosts)
      .values({
        postId,
        accountId: owner.id,
      } satisfies NewPinnedPost)
      .returning();
    const fedCtx = federation.createContext(c.req.raw, undefined);
    await fedCtx.sendActivity(
      owner,
      "followers",
      new Add({
        id: new URL(
          `#add/${result[0].index}`,
          fedCtx.getFeaturedUri(owner.handle),
        ),
        actor: new URL(owner.account.iri),
        object: new URL(post.iri),
        target: fedCtx.getFeaturedUri(owner.handle),
      }),
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(c.req.url)],
      },
    );
    const resultPost = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: getPostRelations(owner.id),
    });
    return c.json(serializePost(resultPost!, owner, c.req.url));
  },
);

app.post(
  "/:id/unpin",
  tokenRequired,
  scopeRequired(["write:accounts"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const postId = c.req.param("id");
    const result = await db
      .delete(pinnedPosts)
      .where(
        and(
          eq(pinnedPosts.postId, postId),
          eq(pinnedPosts.accountId, owner.id),
        ),
      )
      .returning();
    if (result.length < 1) {
      return c.json({ error: "Record not found" }, 404);
    }
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, postId),
      with: getPostRelations(owner.id),
    });
    const fedCtx = federation.createContext(c.req.raw, undefined);
    await fedCtx.sendActivity(
      owner,
      "followers",
      new Remove({
        id: new URL(
          `#remove/${result[0].index}`,
          fedCtx.getFeaturedUri(owner.handle),
        ),
        actor: new URL(owner.account.iri),
        object: new URL(post!.iri),
        target: fedCtx.getFeaturedUri(owner.handle),
      }),
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(c.req.url)],
      },
    );
    return c.json(serializePost(post!, owner, c.req.url));
  },
);

async function addEmojiReaction(
  c: Context<{ Variables: Variables }, "/:id/emoji_reactions/:emoji">,
): Promise<Response | TypedResponse> {
  const owner = c.get("token").accountOwner;
  if (owner == null) {
    return c.json({ error: "This method requires an authenticated user" }, 422);
  }
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const postId = c.req.param("id");
  let emoji = c.req.param("emoji");
  const url = new URL(c.req.url);
  if (emoji.endsWith(`@${url.host}`)) emoji = emoji.replace(/@[^@]+$/, "");
  let emojiCode = "";
  let tag: Emoji | null = null;
  if (emoji.includes("@")) {
    // In case of using a remote custom emoji:
    const [shortcode, domain] = emoji.split("@", 2);
    const reactionList = await db.query.reactions.findMany({
      with: { account: true },
      where: and(
        eq(reactions.postId, postId),
        eq(reactions.emoji, `:${shortcode}:`),
        isNotNull(reactions.customEmoji),
        isNotNull(reactions.emojiIri),
      ),
    });
    for (const reaction of reactionList) {
      if (
        reaction.customEmoji == null ||
        reaction.emojiIri == null ||
        !reaction.account.handle.endsWith(`@${domain}`)
      ) {
        continue;
      }
      await db.insert(reactions).values({
        ...reaction,
        accountId: owner.id,
      });
      emojiCode = reaction.emoji;
      tag = new Emoji({
        id: new URL(reaction.emojiIri),
        name: emojiCode,
        icon: new Image({
          url: new URL(reaction.customEmoji),
        }),
      });
      break;
    }
    if (emojiCode === "") return c.notFound();
  } else {
    const customEmoji = await db.query.customEmojis.findFirst({
      where: eq(customEmojis.shortcode, emoji),
    });
    if (customEmoji == null) {
      if (!/^[\p{Emoji}]+$/u.test(emoji)) return c.notFound();
      // Unicode emoji:
      await db.insert(reactions).values({
        postId,
        accountId: owner.id,
        emoji,
        customEmoji: null,
      });
      emojiCode = emoji;
    } else {
      // Local custom emoji:
      emojiCode = `:${emoji}:`;
      const emojiIri = fedCtx.getObjectUri(Emoji, { shortcode: emoji });
      await db.insert(reactions).values({
        postId,
        accountId: owner.id,
        emoji: emojiCode,
        customEmoji: customEmoji.url,
        emojiIri: emojiIri.href,
      });
      tag = new Emoji({
        id: emojiIri,
        name: emojiCode,
        icon: new Image({
          url: new URL(customEmoji.url),
        }),
      });
    }
  }
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    with: getPostRelations(owner.id),
  });
  if (post == null) return c.notFound();
  const activity = new EmojiReact({
    id: new URL(`/#react/${owner.id}/${postId}/${emoji}`, url),
    actor: fedCtx.getActorUri(owner.handle),
    tos: [new URL(post.account.iri), fedCtx.getFollowersUri(owner.handle)],
    cc: PUBLIC_COLLECTION,
    object: new URL(post.iri),
    content: emojiCode,
    tags: tag == null ? [] : [tag],
  });
  await fedCtx.sendActivity({ username: owner.handle }, "followers", activity, {
    preferSharedInbox: true,
    excludeBaseUris: [new URL(c.req.url)],
  });
  await fedCtx.sendActivity(
    { username: owner.handle },
    {
      id: new URL(post.account.iri),
      inboxId: new URL(post.account.inboxUrl),
      endpoints:
        post.account.sharedInboxUrl == null
          ? null
          : {
              sharedInbox: new URL(post.account.sharedInboxUrl),
            },
    },
    activity,
    { preferSharedInbox: true, excludeBaseUris: [new URL(c.req.url)] },
  );
  return c.json(serializePost(post, owner, c.req.url));
}

app.put(
  "/:id/emoji_reactions/:emoji",
  tokenRequired,
  scopeRequired(["write:favourites"]),
  addEmojiReaction,
);

app.post(
  "/:id/react/:emoji",
  tokenRequired,
  scopeRequired(["write:favourites"]),
  addEmojiReaction,
);

async function removeEmojiReaction(
  c: Context<{ Variables: Variables }, "/:id/emoji_reactions/:emoji">,
): Promise<Response | TypedResponse> {
  const owner = c.get("token").accountOwner;
  if (owner == null) {
    return c.json({ error: "This method requires an authenticated user" }, 422);
  }
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const postId = c.req.param("id");
  let emoji = c.req.param("emoji");
  const url = new URL(c.req.url);
  if (emoji.endsWith(`@${url.host}`)) emoji = emoji.replace(/@[^@]+$/, "");
  const unicode = /^[\p{Emoji}]+$/u.test(emoji);
  const deleted = await db
    .delete(reactions)
    .where(
      and(
        eq(reactions.postId, postId),
        eq(reactions.accountId, owner.id),
        eq(reactions.emoji, unicode ? emoji : `:${emoji}:`),
      ),
    )
    .returning();
  if (deleted.length < 1) return c.notFound();
  const [reaction] = deleted;
  const post = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    with: getPostRelations(owner.id),
  });
  if (post == null) return c.notFound();
  const activity = new Undo({
    id: new URL(`/#react/undo/${owner.id}/${postId}/${emoji}`, url),
    actor: fedCtx.getActorUri(owner.handle),
    tos: [new URL(post.account.iri), fedCtx.getFollowersUri(owner.handle)],
    cc: PUBLIC_COLLECTION,
    object: new EmojiReact({
      id: new URL(`/#react/${owner.id}/${postId}/${emoji}`, url),
      actor: fedCtx.getActorUri(owner.handle),
      tos: [new URL(post.account.iri), fedCtx.getFollowersUri(owner.handle)],
      cc: PUBLIC_COLLECTION,
      object: new URL(post.iri),
      content: reaction.emoji,
      tags:
        reaction.emojiIri == null || reaction.customEmoji == null
          ? []
          : [
              new Emoji({
                id: new URL(reaction.emojiIri),
                name: reaction.emoji,
                icon: new Image({
                  url: new URL(reaction.customEmoji),
                }),
              }),
            ],
    }),
  });
  await fedCtx.sendActivity({ username: owner.handle }, "followers", activity, {
    preferSharedInbox: true,
    excludeBaseUris: [new URL(c.req.url)],
  });
  await fedCtx.sendActivity(
    { username: owner.handle },
    {
      id: new URL(post.account.iri),
      inboxId: new URL(post.account.inboxUrl),
      endpoints:
        post.account.sharedInboxUrl == null
          ? null
          : {
              sharedInbox: new URL(post.account.sharedInboxUrl),
            },
    },
    activity,
    { preferSharedInbox: true, excludeBaseUris: [new URL(c.req.url)] },
  );
  return c.json(serializePost(post, owner, c.req.url));
}

app.delete(
  "/:id/emoji_reactions/:emoji",
  tokenRequired,
  scopeRequired(["write:favourites"]),
  removeEmojiReaction,
);

app.post(
  "/:id/unreact/:emoji",
  tokenRequired,
  scopeRequired(["write:favourites"]),
  removeEmojiReaction,
);

export default app;
