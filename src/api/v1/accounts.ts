import { PutObjectCommand } from "@aws-sdk/client-s3";
import { Block, Undo, isActor, lookupObject } from "@fedify/fedify";
import * as vocab from "@fedify/fedify/vocab";
import { zValidator } from "@hono/zod-validator";
import {
  and,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNull,
  lt,
  lte,
  notInArray,
  or,
  sql,
} from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
  serializeRelationship,
} from "../../entities/account";
import { serializeList } from "../../entities/list";
import { getPostRelations, serializePost } from "../../entities/status";
import { federation } from "../../federation";
import {
  REMOTE_ACTOR_FETCH_POSTS,
  followAccount,
  persistAccount,
  persistAccountPosts,
  removeFollower,
  unfollowAccount,
} from "../../federation/account";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { S3_BUCKET, S3_URL_BASE, s3 } from "../../s3";
import {
  type Account,
  type AccountOwner,
  type NewMute,
  accountOwners,
  accounts,
  blocks,
  follows,
  listMembers,
  lists,
  media,
  mentions,
  mutes,
  pinnedPosts,
  posts,
} from "../../schema";
import { extractCustomEmojis, formatText } from "../../text";
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
          ContentType: form.avatar.type,
          ACL: "public-read",
        }),
      );
      avatarUrl = new URL(`avatars/${account.id}?${Date.now()}`, S3_URL_BASE)
        .href;
    }
    let coverUrl = undefined;
    if (form.header instanceof File) {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: `covers/${account.id}`,
          Body: new Uint8Array(await form.header.arrayBuffer()),
          ContentType: form.header.type,
          ACL: "public-read",
        }),
      );
      coverUrl = new URL(`covers/${account.id}?${Date.now()}`, S3_URL_BASE)
        .href;
    }
    const fedCtx = federation.createContext(c.req.raw, undefined);
    const fmtOpts = {
      url: fedCtx.url,
      contextLoader: fedCtx.contextLoader,
      documentLoader: await fedCtx.getDocumentLoader({
        username: account.handle,
      }),
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
    const bioResult =
      form.note == null ? null : await formatText(db, form.note, fmtOpts);
    const name = form.display_name ?? account.name;
    const nameEmojis = await extractCustomEmojis(db, name);
    const emojis =
      bioResult == null
        ? { ...account.emojis, ...nameEmojis }
        : { ...nameEmojis, ...bioResult.emojis };
    const updatedAccounts = await db
      .update(accounts)
      .set({
        name,
        emojis: sql`${emojis}::jsonb`,
        bioHtml: bioResult == null ? account.bioHtml : bioResult.html,
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
      { preferSharedInbox: true, excludeBaseUris: [new URL(fedCtx.url)] },
    );
    const successor =
      updatedAccounts[0].successorId == null
        ? null
        : ((await db.query.accounts.findFirst({
            where: eq(accounts.id, updatedAccounts[0].successorId),
          })) ?? null);
    return c.json(
      serializeAccountOwner(
        {
          ...updatedOwners[0],
          account: { ...updatedAccounts[0], successor },
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
    const accountList =
      ids.length > 0
        ? await db.query.accounts.findMany({
            where: inArray(accounts.id, ids),
            with: {
              following: {
                where: eq(follows.followingId, owner.id),
              },
              followers: {
                where: eq(follows.followerId, owner.id),
              },
              mutedBy: {
                where: eq(mutes.accountId, owner.id),
              },
              blocks: {
                where: eq(blocks.blockedAccountId, owner.id),
              },
              blockedBy: {
                where: eq(blocks.accountId, owner.id),
              },
            },
          })
        : [];
    accountList.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
    return c.json(
      accountList.map((account) => serializeRelationship(account, owner)),
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
    let account:
      | (Account & {
          owner: AccountOwner | null;
          successor: Account | null;
        })
      | null =
      (await db.query.accounts.findFirst({
        where: eq(
          accounts.handle,
          acct.includes("@")
            ? `@${acct}`
            : `@${acct}@${new URL(c.req.url).host}`,
        ),
        with: { owner: true, successor: true },
      })) ?? null;
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
              documentLoader: await fedCtx.getDocumentLoader({
                username: owner.handle,
              }),
            };
      const actor = await lookupObject(acct, options);
      if (!isActor(actor)) return c.json({ error: "Record not found" }, 404);
      const loaded = await persistAccount(db, actor, options);
      if (loaded != null) {
        account = {
          ...loaded,
          owner: null,
          successor:
            (await db.query.accounts.findFirst({
              where: eq(accounts.successorId, loaded.id),
            })) ?? null,
        };
      }
    }
    if (account == null) {
      return c.json({ error: "Record not found" }, 404);
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
          documentLoader: await fedCtx.getDocumentLoader({
            username: exactMatch.handle,
          }),
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
      with: { owner: true, successor: true },
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
        with: { owner: true, successor: true },
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
    with: { owner: true, successor: true },
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
    const tokenOwner = c.get("token").accountOwner;
    if (tokenOwner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: {
        owner: true,
        blocks: {
          where: eq(blocks.blockedAccountId, tokenOwner.id),
        },
      },
    });
    if (account == null) return c.json({ error: "Record not found" }, 404);
    if (account.blocks.some((b) => b.blockedAccountId === tokenOwner.id)) {
      return c.json([]);
    }
    const [{ cnt }] = await db
      .select({ cnt: count() })
      .from(posts)
      .where(eq(posts.accountId, account.id));
    if (cnt < REMOTE_ACTOR_FETCH_POSTS) {
      const fedCtx = federation.createContext(c.req.raw, undefined);
      await persistAccountPosts(db, account, REMOTE_ACTOR_FETCH_POSTS, {
        documentLoader: await fedCtx.getDocumentLoader({
          username: tokenOwner.handle,
        }),
        contextLoader: fedCtx.contextLoader,
        suppressError: true,
      });
    }
    const query = c.req.valid("query");
    const limit = query.limit ?? 20;
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
        // Hide the posts from the muted accounts:
        notInArray(
          posts.accountId,
          db
            .select({ accountId: mutes.mutedAccountId })
            .from(mutes)
            .where(
              and(
                eq(mutes.accountId, tokenOwner.id),
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
        // Hide the posts from the blocked accounts:
        notInArray(
          posts.accountId,
          db
            .select({ accountId: blocks.blockedAccountId })
            .from(blocks)
            .where(eq(blocks.accountId, tokenOwner.id)),
        ),
        // Hide the posts from the accounts who blocked the owner:
        notInArray(
          posts.accountId,
          db
            .select({ accountId: blocks.accountId })
            .from(blocks)
            .where(eq(blocks.blockedAccountId, tokenOwner.id)),
        ),
        // Hide the shared posts from the muted accounts:
        or(
          isNull(posts.sharingId),
          notInArray(
            posts.sharingId,
            db
              .select({ id: posts.id })
              .from(posts)
              .innerJoin(mutes, eq(mutes.mutedAccountId, posts.accountId))
              .where(
                and(
                  eq(mutes.accountId, tokenOwner.id),
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
        query.only_media === "true"
          ? inArray(posts.id, db.select({ id: media.postId }).from(media))
          : undefined,
        query.max_id == null ? undefined : lt(posts.id, query.max_id),
        query.min_id == null ? undefined : gt(posts.id, query.min_id),
      ),
      with: getPostRelations(tokenOwner.id),
      orderBy: [desc(posts.published), desc(posts.id)],
      limit: limit + 1,
    });
    let next: URL | undefined;
    if (postList.length > limit) {
      next = new URL(c.req.url);
      next.searchParams.set("max_id", postList[limit].id);
    }
    return c.json(
      postList
        .slice(0, limit)
        .map((p) => serializePost(p, tokenOwner, c.req.url)),
      {
        headers: next == null ? undefined : { Link: `<${next}>; rel="next"` },
      },
    );
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
    const fedCtx = federation.createContext(c.req.raw, undefined);
    const follow = await followAccount(
      db,
      fedCtx,
      { ...owner.account, owner },
      following,
    );
    if (follow == null) {
      return c.json({ error: "The action is not allowed" }, 403);
    }
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, following.id),
      with: {
        following: {
          where: eq(follows.followingId, owner.id),
        },
        followers: {
          where: eq(follows.followerId, owner.id),
        },
        mutedBy: {
          where: eq(mutes.accountId, owner.id),
        },
        blocks: {
          where: eq(blocks.blockedAccountId, owner.id),
        },
        blockedBy: {
          where: eq(blocks.accountId, owner.id),
        },
      },
    });
    if (account == null) return c.json({ error: "Record not found" }, 404);
    return c.json(serializeRelationship(account, owner));
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
    const following = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: { owner: true },
    });
    if (following == null) return c.json({ error: "Record not found" }, 404);
    const fedCtx = federation.createContext(c.req.raw, undefined);
    await unfollowAccount(db, fedCtx, { ...owner.account, owner }, following);
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: {
        following: {
          where: eq(follows.followingId, owner.id),
        },
        followers: {
          where: eq(follows.followerId, owner.id),
        },
        mutedBy: {
          where: eq(mutes.accountId, owner.id),
        },
        blocks: {
          where: eq(blocks.blockedAccountId, owner.id),
        },
        blockedBy: {
          where: eq(blocks.accountId, owner.id),
        },
      },
    });
    if (account == null) return c.json({ error: "Record not found" }, 404);
    return c.json(serializeRelationship(account, owner));
  },
);

app.get("/:id/followers", async (c) => {
  const accountId = c.req.param("id");
  const followers = await db.query.follows.findMany({
    where: eq(follows.followingId, accountId),
    with: { follower: { with: { owner: true, successor: true } } },
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
    with: { following: { with: { owner: true, successor: true } } },
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

    if (muteList.length < 1) return c.json([]);

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
      with: { owner: true, successor: true },
      orderBy: [desc(accounts.id)],
      limit: query.limit ?? 40,
    });

    return c.json(mutedAccounts.map((a) => serializeAccount(a, c.req.url)));
  },
);

app.post(
  "/:id/mute",
  tokenRequired,
  scopeRequired(["write:mutes"]),
  zValidator(
    "json",
    z.object({
      notifications: z.boolean().default(true),
      duration: z.number().default(0),
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
    const { notifications, duration } = c.req.valid("json");
    const account = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: {
        owner: true,
        mutes: { where: eq(mutes.accountId, owner.id) },
        following: { where: eq(follows.followingId, owner.id) },
      },
    });
    if (account == null) return c.json({ error: "Record not found" }, 404);
    const durationStr =
      duration <= 0
        ? null
        : new Date(duration * 1000)
            .toISOString()
            .replace(/^[^T]+T|\.[^Z]+Z?$/g, "");
    await db
      .insert(mutes)
      .values({
        id: crypto.randomUUID(),
        accountId: owner.id,
        mutedAccountId: account.id,
        notifications,
        duration: durationStr,
      } satisfies NewMute)
      .onConflictDoUpdate({
        target: [mutes.accountId, mutes.mutedAccountId],
        set: {
          notifications,
          duration: durationStr,
          created: new Date(),
        },
      });
    const result = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: {
        following: {
          where: eq(follows.followingId, owner.id),
        },
        followers: {
          where: eq(follows.followerId, owner.id),
        },
        mutedBy: {
          where: eq(mutes.accountId, owner.id),
        },
        blocks: {
          where: eq(blocks.blockedAccountId, owner.id),
        },
        blockedBy: {
          where: eq(blocks.accountId, owner.id),
        },
      },
    });
    if (result == null) return c.json({ error: "Record not found" }, 404);
    return c.json(serializeRelationship(result, owner));
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
        following: {
          where: eq(follows.followingId, owner.id),
        },
        followers: {
          where: eq(follows.followerId, owner.id),
        },
        mutedBy: {
          where: eq(mutes.accountId, owner.id),
        },
        blocks: {
          where: eq(blocks.blockedAccountId, owner.id),
        },
        blockedBy: {
          where: eq(blocks.accountId, owner.id),
        },
      },
    });
    if (account == null) return c.json({ error: "Record not found" }, 404);
    return c.json(serializeRelationship(account, owner));
  },
);

app.post(
  "/:id/block",
  tokenRequired,
  scopeRequired(["read:blocks"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const acct = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: { owner: true },
    });
    if (acct == null) return c.json({ error: "Record not found" }, 404);
    await db.insert(blocks).values({
      accountId: owner.id,
      blockedAccountId: id,
    });
    if (acct.owner == null) {
      const fedCtx = federation.createContext(c.req.raw, undefined);
      await unfollowAccount(db, fedCtx, { ...owner.account, owner }, acct);
      await removeFollower(db, fedCtx, { ...owner.account, owner }, acct);
      await fedCtx.sendActivity(
        { username: owner.handle },
        { id: new URL(acct.iri), inboxId: new URL(acct.inboxUrl) },
        new Block({
          id: new URL(`#block/${acct.id}`, owner.account.iri),
          actor: new URL(owner.account.iri),
          object: new URL(acct.iri),
        }),
        { excludeBaseUris: [new URL(fedCtx.url)] },
      );
    }
    const result = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: {
        following: {
          where: eq(follows.followingId, owner.id),
        },
        followers: {
          where: eq(follows.followerId, owner.id),
        },
        mutedBy: {
          where: eq(mutes.accountId, owner.id),
        },
        blocks: {
          where: eq(blocks.blockedAccountId, owner.id),
        },
        blockedBy: {
          where: eq(blocks.accountId, owner.id),
        },
      },
    });
    if (result == null) return c.json({ error: "Record not found" }, 404);
    return c.json(serializeRelationship(result, owner));
  },
);

app.post(
  "/:id/unblock",
  tokenRequired,
  scopeRequired(["read:blocks"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const id = c.req.param("id");
    const acct = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: { owner: true },
    });
    if (acct == null) return c.json({ error: "Record not found" }, 404);
    await db
      .delete(blocks)
      .where(
        and(eq(blocks.accountId, owner.id), eq(blocks.blockedAccountId, id)),
      );
    if (acct.owner == null) {
      const fedCtx = federation.createContext(c.req.raw, undefined);
      await fedCtx.sendActivity(
        { username: owner.handle },
        {
          id: new URL(acct.iri),
          inboxId: new URL(acct.inboxUrl),
        },
        new Undo({
          id: new URL(`#unblock/${crypto.randomUUID()}`, owner.account.iri),
          actor: new URL(owner.account.iri),
          object: new Block({
            id: new URL(`#block/${acct.id}`, owner.account.iri),
            actor: new URL(owner.account.iri),
            object: new URL(acct.iri),
          }),
        }),
        { excludeBaseUris: [new URL(fedCtx.url)] },
      );
    }
    const result = await db.query.accounts.findFirst({
      where: eq(accounts.id, id),
      with: {
        following: {
          where: eq(follows.followingId, owner.id),
        },
        followers: {
          where: eq(follows.followerId, owner.id),
        },
        mutedBy: {
          where: eq(mutes.accountId, owner.id),
        },
        blocks: {
          where: eq(blocks.blockedAccountId, owner.id),
        },
        blockedBy: {
          where: eq(blocks.accountId, owner.id),
        },
      },
    });
    if (result == null) return c.json({ error: "Record not found" }, 404);
    return c.json(serializeRelationship(result, owner));
  },
);

export default app;
