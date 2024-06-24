import {
  Accept,
  Activity,
  Announce,
  Article,
  Create,
  Delete,
  Endpoints,
  Follow,
  Image,
  Like,
  Note,
  PropertyValue,
  Reject,
  Undo,
  Update,
  createFederation,
  getActorClassByTypeName,
  importJwk,
  isActor,
} from "@fedify/fedify";
import { RedisKvStore, RedisMessageQueue } from "@fedify/redis";
import { getLogger } from "@logtape/logtape";
import { parse } from "@std/semver";
import {
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  like,
} from "drizzle-orm";
import metadata from "../../package.json" with { type: "json" };
import db from "../db";
import redis, { createRedis } from "../redis";
import {
  type NewLike,
  accountOwners,
  accounts,
  follows,
  likes,
  posts,
} from "../schema";
import { search } from "../search";
import { persistAccount, updateAccountStats } from "./account";
import { toTemporalInstant } from "./date";
import {
  persistPost,
  persistSharingPost,
  toAnnounce,
  toCreate,
  toObject,
  updatePostStats,
} from "./post";

export const federation = createFederation({
  kv: new RedisKvStore(redis),
  queue: new RedisMessageQueue(createRedis, {
    loopInterval: { seconds: 2, milliseconds: 500 },
  }),
});

federation
  .setActorDispatcher("/@{handle}", async (ctx, handle) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
      with: { account: true },
    });
    if (owner == null) return null;
    const account = owner.account;
    const cls = getActorClassByTypeName(account.type);
    return new cls({
      id: new URL(account.iri),
      name: account.name,
      preferredUsername: handle,
      summary: account.bioHtml,
      url: account.url ? new URL(account.url) : null,
      manuallyApprovesFollowers: account.protected,
      icon: account.avatarUrl
        ? new Image({ url: new URL(account.avatarUrl) })
        : null,
      image: account.coverUrl
        ? new Image({ url: new URL(account.coverUrl) })
        : null,
      published: account.published
        ? toTemporalInstant(account.published)
        : null,
      publicKey: (await ctx.getActorKeyPairs(handle))[0].cryptographicKey,
      assertionMethods: (await ctx.getActorKeyPairs(handle)).map(
        (pair) => pair.multikey,
      ),
      followers: ctx.getFollowersUri(handle),
      following: ctx.getFollowingUri(handle),
      outbox: ctx.getOutboxUri(handle),
      liked: ctx.getLikedUri(handle),
      inbox: ctx.getInboxUri(handle),
      endpoints: new Endpoints({
        sharedInbox: ctx.getInboxUri(),
      }),
      attachments: Object.entries(account.fieldHtmls).map(
        ([name, value]) =>
          new PropertyValue({
            name,
            value,
          }),
      ),
    });
  })
  .setKeyPairsDispatcher(async (_ctx, handle) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
    });
    if (owner == null) return [];
    return [
      {
        privateKey: await importJwk(owner.rsaPrivateKeyJwk, "private"),
        publicKey: await importJwk(owner.rsaPublicKeyJwk, "public"),
      },
      {
        privateKey: await importJwk(owner.ed25519PrivateKeyJwk, "private"),
        publicKey: await importJwk(owner.ed25519PublicKeyJwk, "public"),
      },
    ];
  });

federation
  .setFollowersDispatcher(
    "/@{handle}/followers",
    async (_ctx, handle, cursor, filter) => {
      const owner = await db.query.accountOwners.findFirst({
        where: eq(accountOwners.handle, handle),
      });
      if (owner == null || cursor == null) return null;
      const offset = Number.parseInt(cursor);
      if (!Number.isInteger(offset)) return null;
      const followers = await db.query.accounts.findMany({
        where: and(
          inArray(
            accounts.id,
            db
              .select({ id: follows.followerId })
              .from(follows)
              .where(
                and(
                  eq(follows.followingId, owner.id),
                  isNotNull(follows.approved),
                ),
              ),
          ),
          filter == null
            ? undefined
            : ilike(accounts.iri, `${filter.origin}/%`),
        ),
        offset,
        orderBy: accounts.id,
        limit: 41,
      });
      return {
        items: followers.slice(0, 40).map((f) => ({
          id: new URL(f.iri),
          inboxId: new URL(f.inboxUrl),
          endpoints: {
            sharedInbox: f.sharedInboxUrl ? new URL(f.sharedInboxUrl) : null,
          },
        })),
        nextCursor: followers.length > 40 ? `${offset + 40}` : null,
      };
    },
  )
  .setFirstCursor(async (_ctx, _handle) => "0")
  .setCounter(async (_ctx, handle) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
      with: { account: true },
    });
    return owner == null ? 0 : owner.account.followersCount;
  });

federation
  .setFollowingDispatcher(
    "/@{handle}/following",
    async (_ctx, handle, cursor) => {
      const owner = await db.query.accountOwners.findFirst({
        where: eq(accountOwners.handle, handle),
      });
      if (owner == null || cursor == null) return null;
      const offset = Number.parseInt(cursor);
      if (!Number.isInteger(offset)) return null;
      const following = await db.query.accounts.findMany({
        where: inArray(
          accounts.id,
          db
            .select({ id: follows.followingId })
            .from(follows)
            .where(
              and(
                eq(follows.followerId, owner.id),
                isNotNull(follows.approved),
              ),
            ),
        ),
        offset,
        orderBy: accounts.id,
        limit: 41,
      });
      return {
        items: following.slice(0, 40).map((f) => new URL(f.iri)),
        nextCursor: following.length > 40 ? `${offset + 40}` : null,
      };
    },
  )
  .setFirstCursor(async (_ctx, _handle) => "0")
  .setCounter(async (_ctx, handle) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
      with: { account: true },
    });
    return owner == null ? 0 : owner.account.followingCount;
  });

federation
  .setOutboxDispatcher("/@{handle}/outbox", async (ctx, handle, cursor) => {
    if (cursor == null) return null;
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
    });
    if (owner == null) return null;
    const items = await db.query.posts.findMany({
      where: eq(posts.accountId, owner.id),
      orderBy: desc(posts.published),
      offset: Number.parseInt(cursor),
      limit: 41,
      with: {
        account: { with: { owner: true } },
        replyTarget: true,
        media: true,
        mentions: { with: { account: true } },
        sharing: { with: { account: true } },
      },
    });
    return {
      items: items
        .slice(0, 40)
        .map((p) =>
          p.sharing == null ? toCreate(p, ctx) : toAnnounce(p, ctx),
        ),
      nextCursor: items.length > 40 ? `${Number.parseInt(cursor) + 40}` : null,
    };
  })
  .setFirstCursor(async (_ctx, _handle) => "0")
  .setCounter(async (_ctx, handle) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
    });
    if (owner == null) return null;
    const result = await db
      .select({ cnt: count() })
      .from(posts)
      .where(eq(posts.accountId, owner.id));
    if (result.length < 1) return 0;
    return result[0].cnt;
  });

federation
  .setLikedDispatcher("/@{handle}/liked", async (_ctx, handle, cursor) => {
    if (cursor == null) return null;
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
      with: { account: true },
    });
    if (owner == null) return null;
    const items = await db.query.likes.findMany({
      where: eq(likes.accountId, owner.id),
      orderBy: desc(likes.created),
      offset: Number.parseInt(cursor),
      limit: 41,
      with: { post: true },
    });
    return {
      items: items.slice(0, 40).map(
        (like) =>
          new Like({
            id: new URL(
              `#likes/${like.created.toISOString()}`,
              owner.account.iri,
            ),
            actor: new URL(owner.account.iri),
            object: new URL(like.post.iri),
          }),
      ),
      nextCursor: items.length > 40 ? `${Number.parseInt(cursor) + 40}` : null,
    };
  })
  .setFirstCursor(async (_ctx, _handle) => "0")
  .setCounter(async (_ctx, handle) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
    });
    if (owner == null) return null;
    const result = await db
      .select({ cnt: count() })
      .from(likes)
      .where(eq(likes.accountId, owner.id));
    if (result.length < 1) return 0;
    return result[0].cnt;
  });

const inboxLogger = getLogger(["hollo", "inbox"]);

federation
  .setInboxListeners("/@{handle}/inbox", "/inbox")
  .setSharedKeyDispatcher(async (_) => {
    const anyOwner = await db.query.accountOwners.findFirst();
    return anyOwner ?? null;
  })
  .on(Follow, async (ctx, follow) => {
    if (follow.id == null) return;
    const actor = await follow.getActor();
    if (!isActor(actor) || actor.id == null) {
      inboxLogger.debug("Invalid actor: {actor}", { actor });
      return;
    }
    const object = await follow.getObject();
    if (!isActor(object) || object.id == null) {
      inboxLogger.debug("Invalid object: {object}", { object });
      return;
    }
    const following = await db.query.accounts.findFirst({
      where: eq(accounts.iri, object.id.href),
      with: { owner: true },
    });
    if (following?.owner == null) {
      inboxLogger.debug("Invalid following: {following}", { following });
      return;
    }
    const follower = await persistAccount(db, search, actor, ctx);
    if (follower == null) return;
    await db
      .insert(follows)
      .values({
        iri: follow.id.href,
        followingId: following.id,
        followerId: follower.id,
        approved: following.protected ? null : new Date(),
      })
      .onConflictDoNothing();
    if (!following.protected) {
      await ctx.sendActivity(
        following.owner,
        actor,
        new Accept({
          id: new URL(
            `#accepts/${follower.iri}`,
            ctx.getActorUri(following.owner.handle),
          ),
          actor: object.id,
          object: follow,
        }),
      );
      await updateAccountStats(db, { id: following.id });
    }
  })
  .on(Accept, async (ctx, accept) => {
    const actor = await accept.getActor();
    if (!isActor(actor) || actor.id == null) {
      inboxLogger.debug("Invalid actor: {actor}", { actor });
      return;
    }
    const account = await persistAccount(db, search, actor, ctx);
    if (account == null) return;
    if (accept.objectId != null) {
      const updated = await db
        .update(follows)
        .set({ approved: new Date() })
        .where(
          and(
            eq(follows.iri, accept.objectId.href),
            eq(follows.followingId, account.id),
          ),
        )
        .returning();
      if (updated.length > 0) {
        await updateAccountStats(db, { id: updated[0].followerId });
        return;
      }
    }
    const object = await accept.getObject();
    if (object instanceof Follow) {
      if (object.actorId == null) return;
      await db
        .update(follows)
        .set({ approved: new Date() })
        .where(
          and(
            eq(
              follows.followerId,
              db
                .select({ id: accounts.id })
                .from(accounts)
                .where(eq(accounts.iri, object.actorId.href)),
            ),
            eq(follows.followingId, account.id),
          ),
        );
      await updateAccountStats(db, { iri: object.actorId.href });
    }
  })
  .on(Reject, async (ctx, reject) => {
    const actor = await reject.getActor();
    if (!isActor(actor) || actor.id == null) {
      inboxLogger.debug("Invalid actor: {actor}", { actor });
      return;
    }
    const account = await persistAccount(db, search, actor, ctx);
    if (account == null) return;
    if (reject.objectId != null) {
      const deleted = await db
        .delete(follows)
        .where(
          and(
            eq(follows.iri, reject.objectId.href),
            eq(follows.followingId, account.id),
          ),
        )
        .returning();
      if (deleted.length > 0) {
        await updateAccountStats(db, { id: deleted[0].followerId });
        return;
      }
    }
    const object = await reject.getObject();
    if (object instanceof Follow) {
      if (object.actorId == null) return;
      await db
        .delete(follows)
        .where(
          and(
            eq(
              follows.followerId,
              db
                .select({ id: accounts.id })
                .from(accounts)
                .where(eq(accounts.iri, object.actorId.href)),
            ),
            eq(follows.followingId, account.id),
          ),
        );
      await updateAccountStats(db, { iri: object.actorId.href });
    }
  })
  .on(Create, async (ctx, create) => {
    const object = await create.getObject();
    if (object instanceof Article || object instanceof Note) {
      await db.transaction(async (tx) => {
        const post = await persistPost(tx, search, object, ctx);
        if (post?.replyTargetId != null) {
          await updatePostStats(tx, { id: post.replyTargetId });
        }
      });
    } else {
      inboxLogger.debug("Unsupported object on Create: {object}", { object });
    }
  })
  .on(Like, async (ctx, like) => {
    if (like.objectId == null) return;
    const parsed = ctx.parseUri(like.objectId);
    if (parsed == null) return;
    const { type } = parsed;
    if (
      type === "object" &&
      (parsed.class === Note || parsed.class === Article)
    ) {
      const actor = await like.getActor();
      if (actor == null) return;
      const account = await persistAccount(db, search, actor, ctx);
      if (account == null) return;
      // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
      const postId = parsed.values["id"];
      await db.transaction(async (tx) => {
        await tx
          .insert(likes)
          .values({ postId, accountId: account.id } satisfies NewLike);
        await updatePostStats(tx, { id: postId });
      });
    } else {
      inboxLogger.debug("Unsupported object on Like: {objectId}", {
        objectId: like.objectId,
      });
    }
  })
  .on(Announce, async (ctx, announce) => {
    const object = await announce.getObject();
    if (object instanceof Article || object instanceof Note) {
      await db.transaction(async (tx) => {
        const post = await persistSharingPost(
          tx,
          search,
          announce,
          object,
          ctx,
        );
        if (post?.sharingId != null) {
          await updatePostStats(tx, { id: post.sharingId });
        }
      });
    } else {
      inboxLogger.debug("Unsupported object on Announce: {object}", { object });
    }
  })
  .on(Update, async (ctx, update) => {
    const object = await update.getObject();
    if (isActor(object)) {
      await persistAccount(db, search, object, ctx);
    } else if (object instanceof Article || object instanceof Note) {
      await persistPost(db, search, object, ctx);
    } else {
      inboxLogger.debug("Unsupported object on Update: {object}", { object });
    }
  })
  .on(Delete, async (_ctx, del) => {
    const actorId = del.actorId;
    const objectId = del.objectId;
    if (actorId == null || objectId == null) return;
    if (objectId.href === actorId.href) {
      await db.delete(accounts).where(eq(accounts.iri, actorId.href));
    } else {
      await db.transaction(async (tx) => {
        const deletedPosts = await tx
          .delete(posts)
          .where(eq(posts.iri, objectId.href))
          .returning();
        if (deletedPosts.length > 0) {
          const deletedPost = deletedPosts[0];
          if (deletedPost.replyTargetId != null) {
            await updatePostStats(tx, { id: deletedPost.replyTargetId });
          }
          if (deletedPost.sharingId != null) {
            await updatePostStats(tx, { id: deletedPost.sharingId });
          }
        }
      });
    }
  })
  .on(Undo, async (ctx, undo) => {
    const object = await undo.getObject();
    if (
      object instanceof Activity &&
      object.actorId?.href !== undo.actorId?.href
    ) {
      return;
    }
    if (object instanceof Follow) {
      if (object.id == null) return;
      const actor = await undo.getActor();
      if (!isActor(actor) || actor.id == null) {
        inboxLogger.debug("Invalid actor: {actor}", { actor });
        return;
      }
      const account = await persistAccount(db, search, actor, ctx);
      if (account == null) return;
      const deleted = await db
        .delete(follows)
        .where(
          and(
            eq(follows.iri, object.id.href),
            eq(follows.followerId, account.id),
          ),
        )
        .returning({ followingId: follows.followingId });
      if (deleted.length > 0) {
        await updateAccountStats(db, { id: deleted[0].followingId });
      }
    } else if (object instanceof Like) {
      const like = object;
      if (like.objectId == null) return;
      const parsed = ctx.parseUri(like.objectId);
      if (parsed == null) return;
      const { type } = parsed;
      if (
        type === "object" &&
        (parsed.class === Note || parsed.class === Article)
      ) {
        const actor = await like.getActor();
        if (actor == null) return;
        const account = await persistAccount(db, search, actor, ctx);
        if (account == null) return;
        // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
        const postId = parsed.values["id"];
        await db.transaction(async (tx) => {
          await tx
            .delete(likes)
            .where(
              and(eq(likes.postId, postId), eq(likes.accountId, account.id)),
            );
          await updatePostStats(tx, { id: postId });
        });
      } else {
        inboxLogger.debug("Unsupported object on Undo<Like>: {objectId}", {
          objectId: like.objectId,
        });
      }
    } else if (object instanceof Announce) {
      const sharer = object.actorId;
      const originalPost = object.objectId;
      if (sharer == null || originalPost == null) return;
      await db.transaction(async (tx) => {
        const deleted = await tx
          .delete(posts)
          .where(
            and(
              eq(
                posts.accountId,
                db
                  .select({ id: accounts.id })
                  .from(accounts)
                  .where(eq(accounts.iri, sharer.href)),
              ),
              eq(
                posts.sharingId,
                db
                  .select({ id: posts.id })
                  .from(posts)
                  .where(eq(posts.iri, originalPost.href)),
              ),
            ),
          )
          .returning();
        if (deleted.length > 0 && deleted[0].sharingId != null) {
          await updatePostStats(tx, { id: deleted[0].sharingId });
        }
      });
    } else {
      inboxLogger.debug("Unsupported object on Undo: {object}", { object });
    }
  });

federation.setObjectDispatcher(Note, "/@{handle}/{id}", async (ctx, values) => {
  const owner = await db.query.accountOwners.findFirst({
    where: like(accountOwners.handle, values.handle),
    with: { account: true },
  });
  if (owner == null) return null;
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, values.id), eq(posts.accountId, owner.account.id)),
    with: {
      account: { with: { owner: true } },
      replyTarget: true,
      media: true,
      mentions: { with: { account: true } },
    },
  });
  if (post == null) return null;
  if (post.visibility === "private") {
    const keyOwner = await ctx.getSignedKeyOwner();
    if (keyOwner?.id == null) return null;
    const found = await db.query.follows.findFirst({
      where: and(
        eq(follows.followerId, keyOwner.id.href),
        eq(follows.followingId, owner.id),
      ),
    });
    if (found == null) return null;
  } else if (post.visibility === "direct") {
    const keyOwner = await ctx.getSignedKeyOwner();
    const keyOwnerId = keyOwner?.id;
    if (keyOwnerId == null) return null;
    const found = post.mentions.some((m) => m.account.iri === keyOwnerId.href);
    if (!found) return null;
  }
  return toObject(post, ctx);
});

federation.setNodeInfoDispatcher("/nodeinfo/2.1", async (_ctx) => {
  return {
    software: {
      name: "hollo",
      version: parse(metadata.version),
      repository: new URL("https://github.com/dahlia/hollo"),
    },
    protocols: ["activitypub"],
    usage: {
      users: {
        //TODO
        total: 1,
        activeMonth: 1,
        activeHalfyear: 1,
      },
      localComments: 0,
      localPosts: 0,
    },
  };
});

export default federation;

// cSpell: ignore halfyear
