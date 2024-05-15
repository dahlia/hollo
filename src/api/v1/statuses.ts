import { Note } from "@fedify/fedify";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { uuidv7 } from "uuidv7-js";
import { z } from "zod";
import { db } from "../../db";
import { serializePost } from "../../entities/status";
import federation from "../../federation";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { posts } from "../../schema";
import { formatText } from "../../text";

const app = new Hono<{ Variables: Variables }>();

app.post(
  "/",
  tokenRequired,
  scopeRequired(["write:statuses"]),
  zValidator(
    "json",
    z.object({
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
      in_reply_to_id: z.string().uuid().optional(),
      sensitive: z.boolean().default(false),
      spoiler_text: z.string().optional(),
      visibility: z
        .enum(["public", "unlisted", "private", "direct"])
        .optional(),
      language: z.string().min(2).optional(),
      scheduled_at: z.string().datetime().optional(),
    }),
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
    const handle = owner.account.handle.replaceAll(/(?:^@)|(?:@[^@]+$)/g, "");
    const id = uuidv7();
    const url = fedCtx.getObjectUri(Note, { handle, id });
    await db.insert(posts).values({
      id,
      iri: url.href,
      type: "Note",
      accountId: owner.id,
      applicationId: token.applicationId,
      replyTargetId: data.in_reply_to_id,
      sharingId: null,
      visibility: data.visibility ?? "public", // TODO
      summaryHtml:
        data.spoiler_text == null
          ? null
          : (await formatText(db, data.spoiler_text)).html,
      contentHtml:
        data.status == null ? null : (await formatText(db, data.status)).html,
      language: data.language ?? "en", // TODO
      tags: {}, // TODO
      sensitive: data.sensitive,
      url: url.href,
      published: new Date(),
    });
    // TODO: mentions
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
    return c.json(serializePost(post!));
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
  return c.json(serializePost(post));
});

export default app;
