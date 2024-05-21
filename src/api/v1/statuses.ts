import { Note } from "@fedify/fedify";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { uuidv7 } from "uuidv7-js";
import { z } from "zod";
import { db } from "../../db";
import { serializePost } from "../../entities/status";
import federation from "../../federation";
import { toCreate } from "../../federation/post";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { mentions, posts } from "../../schema";
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
    await db.transaction(async (tx) => {
      await tx.insert(posts).values({
        id,
        iri: url.href,
        type: "Note",
        accountId: owner.id,
        applicationId: token.applicationId,
        replyTargetId: data.in_reply_to_id,
        sharingId: null,
        visibility: data.visibility ?? "public", // TODO
        summaryHtml: summary?.html,
        contentHtml: content?.html,
        language: data.language ?? "en", // TODO
        tags: {}, // TODO
        sensitive: data.sensitive,
        url: url.href,
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
          },
        },
        mentions: { with: { account: { with: { owner: true } } } },
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
    return c.json(serializePost(post, c.req.url));
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
    await db.transaction(async (tx) => {
      const content =
        data.status == null ? null : await formatText(tx, data.status, fedCtx);
      const summary =
        data.spoiler_text == null
          ? null
          : await formatText(tx, data.spoiler_text, fedCtx);
      const result = await tx
        .update(posts)
        .set({
          contentHtml: content?.html,
          sensitive: data.sensitive,
          summaryHtml: summary?.html,
          language: data.language ?? "en", // TODO
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
          },
        },
        mentions: { with: { account: { with: { owner: true } } } },
      },
    });
    // biome-ignore lint/style/noNonNullAssertion: never null
    return c.json(serializePost(post!, c.req.url));
  },
);

app.get("/:id", tokenRequired, scopeRequired(["read:statuses"]), async (c) => {
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
        },
      },
      mentions: { with: { account: { with: { owner: true } } } },
    },
  });
  if (post == null) return c.json({ error: "Record not found" }, 404);
  return c.json(serializePost(post, c.req.url));
});

app.get(
  "/:id/context",
  tokenRequired,
  scopeRequired(["read:statuses"]),
  async (c) => {
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
        },
      },
      mentions: { with: { account: { with: { owner: true } } } },
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
      ancestors: ancestors.map((p) => serializePost(p, c.req.url)),
      descendants: descendants.map((p) => serializePost(p, c.req.url)),
    });
  },
);

export default app;
