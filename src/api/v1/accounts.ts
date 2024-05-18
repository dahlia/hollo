import { PutObjectCommand } from "@aws-sdk/client-s3";
import { isActor, lookupObject } from "@fedify/fedify";
import * as vocab from "@fedify/fedify/vocab";
import { zValidator } from "@hono/zod-validator";
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
} from "drizzle-orm";
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
import {
  type NewFollow,
  accountOwners,
  accounts,
  follows,
  posts,
} from "../../schema";
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
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const ids = c.req.queries("id[]") ?? [];
    const accountList = await db.query.accounts.findMany({
      where: inArray(accounts.id, ids),
      with: {
        owner: true,
        following: {
          where: eq(follows.followingId, owner.id),
        },
        followers: {
          where: eq(follows.followerId, owner.id),
        },
      },
    });
    accountList.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return c.json(
      accountList.map((account) => ({
        id: account.id,
        following:
          account.followers.length > 0 && account.followers[0].approved != null,
        showing_reblogs:
          account.followers.length > 0 && account.followers[0].shares,
        notifying: account.followers.length > 0 && account.followers[0].notify,
        languages:
          account.followers.length > 0 ? account.followers[0].languages : null,
        followed_by:
          account.following.length > 0 && account.following[0].approved != null,
        blocking: false, // TODO
        blocked_by: false, // TODO
        muting: false, // TODO
        muting_notifications: false, // TODO
        requested:
          account.followers.length > 0 && account.followers[0].approved == null,
        requested_by:
          account.following.length > 0 && account.following[0].approved == null,
        domain_blocking: false, // TODO
        endorsed: false, // TODO
        note: "", // TODO
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

const HANDLE_PATTERN =
  /^@?[\p{L}\p{N}._-]+@(?:[\p{L}\p{N}][\p{L}\p{N}_-]*\.)+[\p{L}\p{N}]{2,}$/giu;

app.get(
  "/search",
  tokenRequired,
  scopeRequired(["read:accounts"]),
  zValidator(
    "query",
    z.object({
      q: z.string().min(1),
      limit: z
        .string()
        .default("40")
        .transform((v) => Number.parseInt(v)),
      offset: z
        .string()
        .default("0")
        .transform((v) => Number.parseInt(v)),
      resolve: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
      following: z
        .enum(["true", "false"])
        .default("false")
        .transform((v) => v === "true"),
    }),
  ),
  async (c) => {
    const query = c.req.valid("query");
    if (query.resolve && HANDLE_PATTERN.test(query.q) && query.offset < 1) {
      const exactMatch = await db.query.accounts.findFirst({
        where: ilike(accounts.handle, `@${query.q.replace(/^@/, "")}`),
      });
      if (exactMatch != null) {
        const fedCtx = federation.createContext(c.req.raw, undefined);
        const actor = await lookupObject(query.q, fedCtx);
        if (isActor(actor)) await persistAccount(db, actor, fedCtx);
      }
    }
    const accountList = await db.query.accounts.findMany({
      where: or(
        ilike(accounts.handle, `%${query.q}%`),
        ilike(accounts.name, `%${query.q}%`),
      ),
      with: { owner: true },
      orderBy: [
        desc(ilike(accounts.handle, `@${query.q.replace(/^@/, "")}`)),
        desc(ilike(accounts.name, query.q)),
        desc(ilike(accounts.handle, `@${query.q.replace(/^@/, "")}%`)),
        desc(ilike(accounts.name, `${query.q}%`)),
      ],
      offset: query.offset,
      limit: query.limit,
    });
    return c.json(
      accountList.map((a) =>
        a.owner == null
          ? serializeAccount(a)
          : serializeAccountOwner({ ...a.owner, account: a }),
      ),
    );
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

app.post(
  "/:id/follow",
  tokenRequired,
  scopeRequired(["write:follows"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const following = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: { owner: true },
    });
    if (following == null) return c.json({ error: "Record not found" }, 404);
    const result = await db
      .insert(follows)
      .values({
        iri: `urn:uuid:${crypto.randomUUID()}`,
        followingId: following.id,
        followerId: owner.id,
        shares: true,
        notify: false,
        languages: null,
        approved:
          following.owner == null || following.protected ? null : new Date(),
      } satisfies NewFollow)
      .onConflictDoNothing()
      .returning();
    // TODO: respond with 403 if the following blocks the follower
    if (result.length < 1) {
      return c.json({ error: "The action is not allowed" }, 403);
    }
    const follow = result[0];
    if (following.owner == null) {
      const fedCtx = federation.createContext(c.req.raw, undefined);
      await fedCtx.sendActivity(
        owner,
        [
          {
            id: new URL(following.iri),
            inboxId: new URL(following.inboxUrl),
          },
        ],
        new vocab.Follow({
          id: new URL(follow.iri),
          actor: new URL(owner.account.iri),
          object: new URL(following.iri),
        }),
      );
    }
    const reverse = await db.query.follows.findFirst({
      where: and(
        eq(follows.followingId, owner.id),
        eq(follows.followerId, following.id),
      ),
    });
    return c.json({
      id: follow.followingId,
      following: follow.approved != null,
      showing_reblogs: follow.shares,
      notifying: follow.notify,
      languages: follow.languages,
      followed_by: reverse?.approved != null,
      blocking: false, // TODO
      blocked_by: false, // TODO
      muting: false, // TODO
      muting_notifications: false, // TODO
      requested: follow.approved == null,
      requested_by: reverse != null && reverse.approved == null,
      domain_blocking: false, // TODO
      endorsed: false, // TODO
      note: "", // TODO
    });
  },
);

app.post(
  "/:id/unfollow",
  tokenRequired,
  scopeRequired(["write:follows"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const result = await db
      .delete(follows)
      .where(and(eq(follows.followingId, id), eq(follows.followerId, owner.id)))
      .returning({ iri: follows.iri });
    if (result.length > 0) {
      const fedCtx = federation.createContext(c.req.raw, undefined);
      const following = await db.query.accounts.findFirst({
        where: eq(accounts.id, id),
        with: { owner: true },
      });
      if (following != null && following.owner == null) {
        await fedCtx.sendActivity(
          owner,
          [
            {
              id: new URL(following.iri),
              inboxId: new URL(following.inboxUrl),
            },
          ],
          new vocab.Undo({
            actor: new URL(owner.account.iri),
            object: new vocab.Follow({
              id: new URL(result[0].iri),
              actor: new URL(owner.account.iri),
              object: new URL(following.iri),
            }),
          }),
        );
      }
    }
    const reverse = await db.query.follows.findFirst({
      where: and(eq(follows.followingId, owner.id), eq(follows.followerId, id)),
    });
    return c.json({
      id,
      following: false,
      showing_reblogs: false,
      notifying: false,
      languages: null,
      followed_by: reverse?.approved != null,
      blocking: false, // TODO
      blocked_by: false, // TODO
      muting: false, // TODO
      muting_notifications: false, // TODO
      requested: false,
      requested_by: reverse != null && reverse.approved == null,
      domain_blocking: false, // TODO
      endorsed: false, // TODO
      note: "", // TODO
    });
  },
);

export default app;
