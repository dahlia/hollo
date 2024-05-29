import { Note } from "@fedify/fedify";
import * as vocab from "@fedify/fedify/vocab";
import { zValidator } from "@hono/zod-validator";
import { and, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { uuidv7 } from "uuidv7-js";
import { z } from "zod";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { serializePost } from "../../entities/status";
import federation from "../../federation";
import { toCreate } from "../../federation/post";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { type PreviewCard, fetchPreviewCard } from "../../previewcard";
import {
  type Like,
  type NewBookmark,
  type NewLike,
  bookmarks,
  likes,
  mentions,
  posts,
} from "../../schema";
import { formatText } from "../../text";

const app = new Hono<{ Variables: Variables }>();

const statusSchema = z.object({
  status: z.string().min(1).optional(),
  media_ids: z.array(z.string().uuid()).optional(),
  poll: z
    .object({
      options: z.array(z.string()).optional(),
      expires_in: z.number().int().optional(),
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
        visibility: z
          .enum(["public", "unlisted", "private", "direct"])
          .optional(),
        scheduled_at: z.string().datetime().optional(),
      }),
    ),
  ),
  async (c) => {
    // TODO idempotency-key
    const token = c.get("token");
    const owner = token.accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const fedCtx = federation.createContext(c.req.raw, undefined);
    const data = c.req.valid("json");
    const handle = owner.handle;
    const id = uuidv7();
    const url = fedCtx.getObjectUri(Note, { handle, id });
    const published = new Date();
    const content =
      data.status == null ? null : await formatText(db, data.status, fedCtx);
    const summary =
      data.spoiler_text == null
        ? null
        : await formatText(db, data.spoiler_text, fedCtx);
    const mentionedIds = [
      ...(content?.mentions ?? []),
      ...(summary?.mentions ?? []),
    ];
    const hashtags = [
      ...(content?.hashtags ?? []),
      ...(summary?.hashtags ?? []),
    ];
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
    await db.transaction(async (tx) => {
      await tx.insert(posts).values({
        id,
        iri: url.href,
        type: "Note",
        accountId: owner.id,
        applicationId: token.applicationId,
        replyTargetId: data.in_reply_to_id,
        sharingId: null,
        visibility: data.visibility ?? owner.visibility,
        summary: data.spoiler_text,
        summaryHtml: summary?.html,
        content: data.status,
        contentHtml: content?.html,
        language: data.language ?? owner.language,
        // https://github.com/drizzle-team/drizzle-orm/issues/724#issuecomment-1650670298
        tags: sql`${tags}::jsonb`,
        sensitive: data.sensitive,
        url: url.href,
        previewCard,
        published,
      });
      if (mentionedIds.length > 0) {
        await tx.insert(mentions).values(
          mentionedIds.map((accountId) => ({
            postId: id,
            accountId,
          })),
        );
      }
    });
    // biome-ignore lint/style/noNonNullAssertion: post is never null
    const post = (await db.query.posts.findFirst({
      where: eq(posts.id, id),
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
    }))!;
    const activity = toCreate(post, fedCtx);
    if (post.visibility === "direct") {
      await fedCtx.sendActivity(
        { handle },
        post.mentions.map((m) => ({
          id: new URL(m.account.iri),
          inboxId: new URL(m.account.inboxUrl),
          endpoints:
            m.account.sharedInboxUrl == null
              ? null
              : { sharedInbox: new URL(m.account.sharedInboxUrl) },
        })),
        activity,
      );
    } else {
      await fedCtx.sendActivity({ handle }, "followers", activity, {
        preferSharedInbox: true,
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
    const content =
      data.status == null ? null : await formatText(db, data.status, fedCtx);
    const summary =
      data.spoiler_text == null
        ? null
        : await formatText(db, data.spoiler_text, fedCtx);
    const hashtags = [
      ...(content?.hashtags ?? []),
      ...(summary?.hashtags ?? []),
    ];
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
    await db.transaction(async (tx) => {
      const result = await tx
        .update(posts)
        .set({
          content: data.status,
          contentHtml: content?.html,
          sensitive: data.sensitive,
          summary: data.spoiler_text,
          summaryHtml: summary?.html,
          language: data.language ?? owner.language,
          // https://github.com/drizzle-team/drizzle-orm/issues/724#issuecomment-1650670298
          tags: sql`${tags}::jsonb`,
          previewCard,
        })
        .where(eq(posts.id, id))
        .returning();
      if (result.length < 1) return c.json({ error: "Record not found" }, 404);
      await tx.delete(mentions).where(eq(mentions.postId, id));
      const mentionedIds = [
        ...(content?.mentions ?? []),
        ...(summary?.mentions ?? []),
      ];
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
    });
    // biome-ignore lint/style/noNonNullAssertion: never null
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
    });
    if (post == null) return c.json({ error: "Record not found" }, 404);
    await db.delete(posts).where(eq(posts.id, id));
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
    const with_ = {
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
      replies: true,
    } as const;
    const post = await db.query.posts.findFirst({
      where: eq(posts.id, id),
      with: with_,
    });
    if (post == null) return c.json({ error: "Record not found" }, 404);
    const ancestors: (typeof post)[] = [];
    let p: typeof post | undefined = post;
    while (p.replyTargetId != null) {
      p = await db.query.posts.findFirst({
        where: eq(posts.id, p.replyTargetId),
        with: with_,
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
        where: eq(posts.replyTargetId, p.id),
        with: with_,
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
      with: { account: { with: { owner: true } } },
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
    });
    // biome-ignore lint/style/noNonNullAssertion: never null
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
    });
    // biome-ignore lint/style/noNonNullAssertion: never null
    return c.json(serializePost(post!, owner, c.req.url));
  },
);

export default app;
