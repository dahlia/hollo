import { PutObjectCommand } from "@aws-sdk/client-s3";
import { isActor, lookupObject } from "@fedify/fedify";
import { zValidator } from "@hono/zod-validator";
import { and, desc, eq, gte, isNull, lte, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { serializePost } from "../../entities/status";
import { federation } from "../../federation";
import { persistAccount } from "../../federation/account";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { S3_BUCKET, S3_URL_BASE, s3 } from "../../s3";
import { accountOwners, accounts, posts } from "../../schema";
import { formatText } from "../../text";
import { timelineQuerySchema } from "./timelines";

const app = new Hono<{ Variables: Variables }>();

app.get(
  "/verify_credentials",
  tokenRequired,
  scopeRequired(["read:accounts"]),
  async (c) => {
    const accountOwner = c.get("token").accountOwner;
    if (accountOwner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    return c.json(serializeAccountOwner(accountOwner));
  },
);

app.patch(
  "/update_credentials",
  tokenRequired,
  scopeRequired(["write:accounts"]),
  zValidator(
    "form",
    z.object({
      display_name: z.string().optional(),
      note: z.string().optional(),
      avatar: z.any().optional(),
      header: z.any().optional(),
      locked: z.enum(["true", "false"]).optional(),
      bot: z.enum(["true", "false"]).optional(),
      discoverable: z.enum(["true", "false"]).optional(),
      hide_collections: z.enum(["true", "false"]).optional(),
      indexable: z.enum(["true", "false"]).optional(),
      "source[privacy]": z.enum(["public", "unlisted", "private"]).optional(),
      "source[sensitive]": z.enum(["true", "false"]).optional(),
      "source[language]": z.string().optional(),
      "fields_attributes[0][name]": z.string().optional(),
      "fields_attributes[0][value]": z.string().optional(),
      "fields_attributes[1][name]": z.string().optional(),
      "fields_attributes[1][value]": z.string().optional(),
      "fields_attributes[2][name]": z.string().optional(),
      "fields_attributes[2][value]": z.string().optional(),
      "fields_attributes[3][name]": z.string().optional(),
      "fields_attributes[3][value]": z.string().optional(),
    }),
  ),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const account = owner.account;
    const form = c.req.valid("form");
    let avatarUrl = undefined;
    if (form.avatar instanceof File) {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: `avatars/${account.id}`,
          Body: new Uint8Array(await form.avatar.arrayBuffer()),
        }),
      );
      avatarUrl = new URL(`avatars/${account.id}`, S3_URL_BASE).href;
    }
    let coverUrl = undefined;
    if (form.header instanceof File) {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: `covers/${account.id}`,
          Body: new Uint8Array(await form.header.arrayBuffer()),
        }),
      );
      coverUrl = new URL(`covers/${account.id}`, S3_URL_BASE).href;
    }
    const fields = Object.entries(owner.fields);
    const fieldHtmls: [string, string][] = [];
    for (const i of [0, 1, 2, 3] as const) {
      const name = form[`fields_attributes[${i}][name]`];
      const value = form[`fields_attributes[${i}][value]`];
      if (name != null && value != null) {
        fields[i] = [name, value];
      }
      const contentHtml = (await formatText(db, fields[i][1])).html;
      fieldHtmls.push([fields[i][0], contentHtml]);
    }
    const updatedAccounts = await db
      .update(accounts)
      .set({
        name: form.display_name ?? account.name,
        bioHtml:
          form.note == null
            ? account.bioHtml
            : (await formatText(db, form.note)).html,
        avatarUrl,
        coverUrl,
        fieldHtmls: Object.fromEntries(fieldHtmls),
        protected:
          form.locked == null ? account.protected : form.locked === "true",
        type:
          form.bot == null
            ? account.type
            : form.bot === "true"
              ? "Service"
              : "Person",
      })
      .where(eq(accounts.id, owner.id))
      .returning();
    const updatedOwners = await db
      .update(accountOwners)
      .set({
        bio: form.note ?? owner.bio,
        fields: Object.fromEntries(fields),
      })
      .where(eq(accountOwners.id, owner.id))
      .returning();
    return c.json(
      serializeAccountOwner({
        ...updatedOwners[0],
        account: updatedAccounts[0],
      }),
    );
  },
);

app.get(
  "/relationships",
  tokenRequired,
  scopeRequired(["read:follows"]),
  (c) => {
    if (c.get("token").accountOwner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const ids = c.req.queries("id[]") ?? [];
    return c.json(
      ids.map((id) => ({
        id,
        following: false,
        showing_reblogs: false,
        notifying: false,
        languages: null,
        followed_by: false,
        blocking: false,
        blocked_by: false,
        muting: false,
        muting_notifications: false,
        requested: false,
        requested_by: false,
        domain_blocking: false,
        endorsed: false,
        note: "",
      })),
    );
  },
);

app.get(
  "/lookup",
  zValidator(
    "query",
    z.object({
      acct: z.string(),
      skip_webfinger: z.enum(["true", "false"]).default("true"),
    }),
  ),
  async (c) => {
    const query = c.req.valid("query");
    const acct = query.acct;
    const account = await db.query.accounts.findFirst({
      where: eq(
        accounts.handle,
        acct.includes("@") ? `@${acct}` : `@${acct}@${new URL(c.req.url).host}`,
      ),
      with: { owner: true },
    });
    if (account == null) {
      if (query.skip_webfinger !== "false") {
        return c.json({ error: "Record not found" }, 404);
      }
      const fedCtx = federation.createContext(c.req.raw, undefined);
      const actor = await lookupObject(acct, fedCtx);
      if (!isActor(actor)) return c.json({ error: "Record not found" }, 404);
      const loadedAccount = await persistAccount(db, actor, fedCtx);
      if (loadedAccount == null) {
        return c.json({ error: "Record not found" }, 404);
      }
      return c.json(serializeAccount(loadedAccount));
    }
    if (account.owner == null) return c.json(serializeAccount(account));
    return c.json(serializeAccountOwner({ ...account.owner, account }));
  },
);

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: { owner: true },
  });
  if (account == null) return c.json({ error: "Record not found" }, 404);
  if (account.owner != null) {
    return c.json(serializeAccountOwner({ ...account.owner, account }));
  }
  return c.json(serializeAccount(account));
});

app.get(
  "/:id/statuses",
  tokenRequired,
  scopeRequired(["read:statuses"]),
  zValidator(
    "query",
    timelineQuerySchema.merge(
      z.object({
        only_media: z.enum(["true", "false"]).optional(),
        exclude_replies: z.enum(["true", "false"]).optional(),
        exclude_reblogs: z.enum(["true", "false"]).optional(),
        pinned: z.enum(["true", "false"]).optional(),
        tagged: z.string().optional(),
      }),
    ),
  ),
  async (c) => {
    const id = c.req.param("id");
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: { owner: true },
    });
    if (account == null) return c.json({ error: "Record not found" }, 404);
    const tokenOwner = c.get("token").accountOwner;
    if (tokenOwner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const query = c.req.valid("query");
    if (query.pinned || query.only_media) {
      return c.json([]); // FIXME
    }
    const postList = await db.query.posts.findMany({
      where: and(
        eq(posts.accountId, id),
        or(
          eq(posts.accountId, tokenOwner.id),
          eq(posts.visibility, "public"),
          eq(posts.visibility, "unlisted"),
          // TODO: private, direct
        ),
        query.exclude_replies === "true"
          ? isNull(posts.replyTargetId)
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
    return c.json(postList.map(serializePost));
  },
);

export default app;
