import { PutObjectCommand } from "@aws-sdk/client-s3";
import { isActor, lookupObject } from "@fedify/fedify";
import * as vocab from "@fedify/fedify/vocab";
import { zValidator } from "@hono/zod-validator";
import {
  and,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { serializeList } from "../../entities/list";
import { getPostRelations, serializePost } from "../../entities/status";
import { federation } from "../../federation";
import { persistAccount } from "../../federation/account";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { S3_BUCKET, S3_URL_BASE, s3 } from "../../s3";
import {
  type Mute,
  type NewFollow,
  type NewMute,
  accountOwners,
  accounts,
  follows,
  listMembers,
  lists,
  mentions,
  mutes,
  pinnedPosts,
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
    return c.json(serializeAccountOwner(accountOwner, c.req.url));
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
          ACL: "public-read",
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
          ACL: "public-read",
        }),
      );
      coverUrl = new URL(`covers/${account.id}`, S3_URL_BASE).href;
    }
    const fedCtx = federation.createContext(c.req.raw, undefined);
    const fmtOpts = {
      url: fedCtx.url,
      contextLoader: fedCtx.contextLoader,
      documentLoader: await fedCtx.getDocumentLoader(owner),
    };
    const fields = Object.entries(owner.fields);
    const fieldHtmls: [string, string][] = [];
    for (const i of [0, 1, 2, 3] as const) {
      const name = form[`fields_attributes[${i}][name]`];
      const value = form[`fields_attributes[${i}][value]`];
      if (
        name == null ||
        name.trim() === "" ||
        value == null ||
        value.trim() === ""
      ) {
        continue;
      }
      fields[i] = [name, value];
      const contentHtml = (await formatText(db, fields[i][1], fmtOpts)).html;
      fieldHtmls.push([fields[i][0], contentHtml]);
    }
    const updatedAccounts = await db
      .update(accounts)
      .set({
        name: form.display_name ?? account.name,
        bioHtml:
          form.note == null
            ? account.bioHtml
            : (await formatText(db, form.note, fmtOpts)).html,
        avatarUrl,
        coverUrl,
        fieldHtmls: Object.fromEntries(fieldHtmls),
        protected:
          form.locked == null ? account.protected : form.locked === "true",
        sensitive:
          form["source[sensitive]"] == null
            ? account.sensitive
            : form["source[sensitive]"] === "true",
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
        visibility: form["source[privacy]"] ?? owner.visibility,
        language: form["source[language]"] ?? owner.language,
      })
      .where(eq(accountOwners.id, owner.id))
      .returning();
    await fedCtx.sendActivity(
      { handle: updatedOwners[0].handle },
      "followers",
      new vocab.Update({
        actor: fedCtx.getActorUri(updatedOwners[0].handle),
        object: await fedCtx.getActor(updatedOwners[0].handle),
      }),
      { preferSharedInbox: true },
    );
    return c.json(
      serializeAccountOwner(
        {
          ...updatedOwners[0],
          account: updatedAccounts[0],
        },
        c.req.url,
      ),
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
        mutes: {
          where: eq(mutes.accountId, owner.id),
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
        muting: isCurrentlyMuted(account.mutes[0]),
        muting_notifications:
          isCurrentlyMuted(account.mutes[0]) && account.mutes[0].notifications,
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
    const owner = c.get("token")?.accountOwner;
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
      const options =
        owner == null
          ? fedCtx
          : {
              contextLoader: fedCtx.contextLoader,
              documentLoader: await fedCtx.getDocumentLoader(owner),
            };
      const actor = await lookupObject(acct, options);
      if (!isActor(actor)) return c.json({ error: "Record not found" }, 404);
      const loadedAccount = await persistAccount(db, actor, options);
      if (loadedAccount == null) {
        return c.json({ error: "Record not found" }, 404);
      }
      return c.json(serializeAccount(loadedAccount, c.req.url));
    }
    if (account.owner == null) {
      return c.json(serializeAccount(account, c.req.url));
    }
    return c.json(
      serializeAccountOwner({ ...account.owner, account }, c.req.url),
    );
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
        const options = {
          contextLoader: fedCtx.contextLoader,
          documentLoader: await fedCtx.getDocumentLoader(exactMatch),
        };
        const actor = await lookupObject(query.q, options);
        if (isActor(actor)) await persistAccount(db, actor, options);
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
          ? serializeAccount(a, c.req.url)
          : serializeAccountOwner({ ...a.owner, account: a }, c.req.url),
      ),
    );
  },
);

app.get(
  "/familiar_followers",
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
    const ids: string[] = c.req.queries("id[]") ?? [];
    const result: {
      id: string;
      accounts: ReturnType<typeof serializeAccount>[];
    }[] = [];
    for (const id of ids) {
      const accountList = await db.query.accounts.findMany({
        where: and(
          inArray(
            accounts.id,
            db
              .select({ id: follows.followerId })
              .from(follows)
              .where(eq(follows.followingId, id)),
          ),
          inArray(
            accounts.id,
            db
              .select({ id: follows.followingId })
              .from(follows)
              .where(eq(follows.followerId, owner.id)),
          ),
        ),
        with: { owner: true },
      });
      result.push({
        id,
        accounts: accountList.map((a) =>
          a.owner == null
            ? serializeAccount(a, c.req.url)
            : serializeAccountOwner({ ...a.owner, account: a }, c.req.url),
        ),
      });
    }
    return c.json(result);
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
    return c.json(
      serializeAccountOwner({ ...account.owner, account }, c.req.url),
    );
  }
  return c.json(serializeAccount(account, c.req.url));
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
    if (query.only_media) {
      return c.json([]); // FIXME
    }
    const following = await db
      .select({ id: follows.followingId })
      .from(follows)
      .where(
        and(eq(follows.followerId, tokenOwner.id), eq(follows.followingId, id)),
      );
    const postList = await db.query.posts.findMany({
      where: and(
        eq(posts.accountId, id),
        or(
          eq(posts.accountId, tokenOwner.id),
          eq(posts.visibility, "public"),
          eq(posts.visibility, "unlisted"),
          following.length > 0 ? eq(posts.visibility, "private") : undefined,
          and(
            eq(posts.visibility, "direct"),
            inArray(
              posts.id,
              db
                .select({ id: mentions.postId })
                .from(mentions)
                .where(eq(mentions.accountId, tokenOwner.id)),
            ),
          ),
        ),
        query.pinned === "true"
          ? inArray(
              posts.id,
              db
                .select({ id: pinnedPosts.postId })
                .from(pinnedPosts)
                .where(eq(pinnedPosts.accountId, id)),
            )
          : undefined,
        query.exclude_replies === "true"
          ? isNull(posts.replyTargetId)
          : undefined,
        query.max_id == null ? undefined : lte(posts.id, query.max_id),
        query.min_id == null ? undefined : gte(posts.id, query.min_id),
      ),
      with: getPostRelations(tokenOwner.id),
      orderBy: [desc(posts.id)],
      limit: query.limit ?? 20,
    });
    return c.json(postList.map((p) => serializePost(p, tokenOwner, c.req.url)));
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
      with: { owner: true, mutes: { where: eq(mutes.accountId, owner.id) } },
    });
    if (following == null) return c.json({ error: "Record not found" }, 404);
    const result = await db
      .insert(follows)
      .values({
        iri: new URL(`#follows/${crypto.randomUUID()}`, owner.account.iri).href,
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

    const mute = await db.query.mutes.findFirst({
      where: and(eq(mutes.accountId, owner.id), eq(mutes.mutedAccountId, id)),
    });

    const muting = isCurrentlyMuted(mute);
    return c.json({
      id: follow.followingId,
      following: follow.approved != null,
      showing_reblogs: follow.shares,
      notifying: follow.notify,
      languages: follow.languages,
      followed_by: reverse?.approved != null,
      blocking: false, // TODO
      blocked_by: false, // TODO
      muting,
      muting_notifications: muting && mute?.notifications,
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
        with: {
          owner: true,
          mutes: {
            where: eq(mutes.accountId, owner.id),
          },
        },
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
            id: new URL(`#unfollows/${crypto.randomUUID()}`, owner.account.iri),
            actor: new URL(owner.account.iri),
            object: new vocab.Follow({
              id: new URL(result[0].iri),
              actor: new URL(owner.account.iri),
              object: new URL(following.iri),
            }),
          }),
        );
      }
      await db
        .update(accounts)
        .set({
          followingCount: sql`${db
            .select({ cnt: count() })
            .from(follows)
            .where(
              and(
                eq(follows.followerId, owner.id),
                isNotNull(follows.approved),
              ),
            )}`,
        })
        .where(eq(accounts.id, owner.id));
    }
    const reverse = await db.query.follows.findFirst({
      where: and(eq(follows.followingId, owner.id), eq(follows.followerId, id)),
    });

    const mute = await db.query.mutes.findFirst({
      where: and(eq(mutes.accountId, owner.id), eq(mutes.mutedAccountId, id)),
    });

    const muting = isCurrentlyMuted(mute);

    return c.json({
      id,
      following: false,
      showing_reblogs: false,
      notifying: false,
      languages: null,
      followed_by: reverse?.approved != null,
      blocking: false, // TODO
      blocked_by: false, // TODO
      muting,
      muting_notifications: muting && mute?.notifications,
      requested: false,
      requested_by: reverse != null && reverse.approved == null,
      domain_blocking: false, // TODO
      endorsed: false, // TODO
      note: "", // TODO
    });
  },
);

app.get("/:id/followers", async (c) => {
  const accountId = c.req.param("id");
  const followers = await db.query.follows.findMany({
    where: eq(follows.followingId, accountId),
    with: { follower: { with: { owner: true } } },
  });
  return c.json(
    followers.map((f) =>
      f.follower.owner == null
        ? serializeAccount(f.follower, c.req.url)
        : serializeAccountOwner(
            { ...f.follower.owner, account: f.follower },
            c.req.url,
          ),
    ),
  );
});

app.get("/:id/following", async (c) => {
  const accountId = c.req.param("id");
  const followers = await db.query.follows.findMany({
    where: eq(follows.followerId, accountId),
    with: { following: { with: { owner: true } } },
  });
  return c.json(
    followers.map((f) =>
      f.following.owner == null
        ? serializeAccount(f.following, c.req.url)
        : serializeAccountOwner(
            { ...f.following.owner, account: f.following },
            c.req.url,
          ),
    ),
  );
});

app.get(
  "/:id/lists",
  tokenRequired,
  scopeRequired(["read:lists"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const listList = await db.query.lists.findMany({
      where: and(
        eq(lists.accountOwnerId, owner.id),
        inArray(
          lists.id,
          db
            .select({ id: listMembers.listId })
            .from(listMembers)
            .where(eq(listMembers.accountId, c.req.param("id"))),
        ),
      ),
    });
    return c.json(listList.map(serializeList));
  },
);

app.get(
  "/mutes",
  tokenRequired,
  scopeRequired(["read:mutes"]),
  zValidator(
    "query",
    z.object({
      max_id: z.string().uuid().optional(),
      since_id: z.string().uuid().optional(),
      limit: z
        .string()
        .default("40")
        .transform((v) => {
          const parsed = Number.parseInt(v);
          return Math.min(parsed, 80);
        }),
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

    const muteList = await db.query.mutes.findMany({
      where: eq(mutes.accountId, owner.id),
    });

    const query = c.req.valid("query");

    const mutedAccounts = await db.query.accounts.findMany({
      where: and(
        inArray(
          accounts.id,
          muteList.map((m) => m.mutedAccountId),
        ),
        query.max_id == null ? undefined : lte(accounts.id, query.max_id),
        query.since_id == null ? undefined : gte(accounts.id, query.since_id),
      ),
      with: { owner: true },
      orderBy: [desc(accounts.id)],
      limit: query.limit ?? 40,
    });

    return c.json(mutedAccounts.map((a) => serializeAccount(a, c.req.url)));
  },
);

app.post(
  "/:id/mute",
  zValidator(
    "form",
    z.object({
      notifications: z.boolean().default(true),
      duration: z.number().int().nonnegative().default(0),
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
    const id = c.req.param("id");
    const { notifications, duration } = c.req.valid("form");
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: {
        owner: true,
        mutes: { where: eq(mutes.accountId, owner.id) },
        following: { where: eq(follows.followingId, owner.id) },
      },
    });
    if (account == null) return c.json({ error: "Record not found" }, 404);
    const alreadyMuted = account.mutes.some((m) => m.accountId === owner.id);
    if (!alreadyMuted) {
      await db
        .insert(mutes)
        .values({
          id: crypto.randomUUID(),
          accountId: owner.id,
          mutedAccountId: account.id,
          notifications,
          duration,
        } satisfies NewMute)
        .onConflictDoNothing();
    }

    const reverse = await db.query.follows.findFirst({
      where: and(eq(follows.followingId, owner.id), eq(follows.followerId, id)),
    });
    return c.json({
      id,
      following: account.following.some((f) => f.followerId === owner.id),
      showing_reblogs: false,
      notifying: false,
      languages: null,
      followed_by: reverse?.approved != null,
      blocking: false, // TODO
      blocked_by: false, // TODO
      muting: true,
      muting_notifications: notifications,
      requested: false,
      domain_blocking: false, // TODO
      endorsed: false, // TODO
      note: "", // TODO
    });
  },
);

app.post(
  "/:id/unmute",
  tokenRequired,
  scopeRequired(["write:mutes"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    await db
      .delete(mutes)
      .where(and(eq(mutes.accountId, owner.id), eq(mutes.mutedAccountId, id)));

    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: {
        owner: true,
        following: { where: eq(mutes.accountId, owner.id) },
      },
    });
    if (account == null) return c.json({ error: "Record not found" }, 404);

    const reverse = await db.query.follows.findFirst({
      where: and(eq(follows.followingId, owner.id), eq(follows.followerId, id)),
    });
    return c.json({
      id,
      following: account.following.some((f) => f.followerId === owner.id),
      showing_reblogs: false,
      notifying: false,
      languages: null,
      followed_by: reverse?.approved != null,
      blocking: false, // TODO
      blocked_by: false, // TODO
      muting: false,
      muting_notifications: false,
      requested: false,
      requested_by: reverse != null && reverse.approved == null,
      domain_blocking: false, // TODO
      endorsed: false, // TODO
      note: "", // TODO
    });
  },
);

function isCurrentlyMuted(mute: Mute | undefined): boolean {
  if (!mute) return false;
  if (mute.duration === 0) return true;
  return new Date() < new Date(mute.created.getTime() + mute.duration * 1000);
}

export default app;
