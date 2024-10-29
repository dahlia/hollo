import {
  Accept,
  Activity,
  Add,
  Announce,
  Article,
  Block,
  Create,
  Delete,
  Emoji,
  EmojiReact,
  Endpoints,
  Flag,
  Follow,
  Hashtag,
  Image,
  type KvStore,
  Like,
  type MessageQueue,
  Move,
  Note,
  ParallelMessageQueue,
  PropertyValue,
  Reject,
  Remove,
  Undo,
  Update,
  createFederation,
  getActorClassByTypeName,
  importJwk,
  isActor,
} from "@fedify/fedify";
import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
import { RedisKvStore, RedisMessageQueue } from "@fedify/redis";
import { getLogger } from "@logtape/logtape";
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  sql,
} from "drizzle-orm";
import { uniq } from "es-toolkit";
import { parse } from "semver";
import metadata from "../../package.json" with { type: "json" };
import { db, postgres } from "../db";
import { createRedis, getRedisUrl } from "../redis";
import {
  type NewPinnedPost,
  accountOwners,
  accounts,
  blocks,
  customEmojis,
  follows,
  likes,
  pinnedPosts,
  pollOptions,
  posts,
  reports,
} from "../schema";
import { persistAccount, updateAccountStats } from "./account";
import { toTemporalInstant } from "./date";
import {
  onBlocked,
  onEmojiReactionAdded,
  onEmojiReactionRemoved,
  onLiked,
  onMove,
  onUnblocked,
  onUnliked,
} from "./inbox";
import {
  isPost,
  persistPollVote,
  persistPost,
  persistSharingPost,
  toAnnounce,
  toCreate,
  toObject,
  toUpdate,
  updatePostStats,
} from "./post";

const logger = getLogger(["hollo", "federation"]);

let kv: KvStore;
let queue: MessageQueue;

if (getRedisUrl() == null) {
  kv = new PostgresKvStore(postgres);
  queue = new ParallelMessageQueue(new PostgresMessageQueue(postgres), 10);
  logger.info(
    "No REDIS_URL is defined, using PostgresKvStore and PostgresMessageQueue.",
  );
} else {
  kv = new RedisKvStore(createRedis());
  queue = new RedisMessageQueue(createRedis, {
    loopInterval: { seconds: 2, milliseconds: 500 },
  });
}

export const federation = createFederation<void>({
  kv,
  queue,
});

federation
  .setActorDispatcher("/@{identifier}", async (ctx, identifier) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, identifier),
      with: { account: { with: { successor: true } } },
    });
    if (owner == null) return null;
    const account = owner.account;
    const cls = getActorClassByTypeName(account.type);
    return new cls({
      id: new URL(account.iri),
      name: account.name,
      preferredUsername: identifier,
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
      publicKey: (await ctx.getActorKeyPairs(identifier))[0].cryptographicKey,
      assertionMethods: (await ctx.getActorKeyPairs(identifier)).map(
        (pair) => pair.multikey,
      ),
      followers: ctx.getFollowersUri(identifier),
      following: ctx.getFollowingUri(identifier),
      outbox: ctx.getOutboxUri(identifier),
      liked: ctx.getLikedUri(identifier),
      featured: ctx.getFeaturedUri(identifier),
      featuredTags: ctx.getFeaturedTagsUri(identifier),
      inbox: ctx.getInboxUri(identifier),
      endpoints: new Endpoints({
        sharedInbox: ctx.getInboxUri(),
      }),
      successor:
        account.successor == null ? null : new URL(account.successor.iri),
      aliases: uniq(account.aliases).map((a) => new URL(a)),
      attachments: Object.entries(account.fieldHtmls).map(
        ([name, value]) =>
          new PropertyValue({
            name,
            value,
          }),
      ),
      tags: Object.entries(account.emojis).map(
        ([shortcode, url]) =>
          new Emoji({
            id: ctx.getObjectUri(Emoji, { shortcode }),
            name: `:${shortcode.replace(/^:|:$/g, "")}:`,
            icon: new Image({ url: new URL(url) }),
          }),
      ),
    });
  })
  .mapHandle((_, handle) => handle)
  .setKeyPairsDispatcher(async (_ctx, identifier) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, identifier),
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
    "/@{identifier}/followers",
    async (_ctx, identifier, cursor, filter) => {
      const owner = await db.query.accountOwners.findFirst({
        where: eq(accountOwners.handle, identifier),
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
  .setFirstCursor(async (_ctx, _identifier) => "0")
  .setCounter(async (_ctx, identifier) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, identifier),
      with: { account: true },
    });
    return owner == null ? 0 : owner.account.followersCount;
  });

federation
  .setFollowingDispatcher(
    "/@{identifier}/following",
    async (_ctx, identifier, cursor) => {
      const owner = await db.query.accountOwners.findFirst({
        where: eq(accountOwners.handle, identifier),
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
  .setFirstCursor(async (_ctx, _identifier) => "0")
  .setCounter(async (_ctx, identifier) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, identifier),
      with: { account: true },
    });
    return owner == null ? 0 : owner.account.followingCount;
  });

federation
  .setOutboxDispatcher(
    "/@{identifier}/outbox",
    async (ctx, identifier, cursor) => {
      if (cursor == null) return null;
      const owner = await db.query.accountOwners.findFirst({
        where: eq(accountOwners.handle, identifier),
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
          quoteTarget: true,
          media: true,
          poll: { with: { options: true } },
          mentions: { with: { account: true } },
          sharing: { with: { account: true } },
          replies: true,
        },
      });
      return {
        items: items
          .slice(0, 40)
          .map((p) =>
            p.sharing == null ? toCreate(p, ctx) : toAnnounce(p, ctx),
          ),
        nextCursor:
          items.length > 40 ? `${Number.parseInt(cursor) + 40}` : null,
      };
    },
  )
  .setFirstCursor(async (_ctx, _identifier) => "0")
  .setCounter(async (_ctx, identifier) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, identifier),
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
  .setLikedDispatcher(
    "/@{identifier}/liked",
    async (_ctx, identifier, cursor) => {
      if (cursor == null) return null;
      const owner = await db.query.accountOwners.findFirst({
        where: eq(accountOwners.handle, identifier),
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
        nextCursor:
          items.length > 40 ? `${Number.parseInt(cursor) + 40}` : null,
      };
    },
  )
  .setFirstCursor(async (_ctx, _identifier) => "0")
  .setCounter(async (_ctx, identifier) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, identifier),
    });
    if (owner == null) return null;
    const result = await db
      .select({ cnt: count() })
      .from(likes)
      .where(eq(likes.accountId, owner.id));
    if (result.length < 1) return 0;
    return result[0].cnt;
  });

federation.setFeaturedDispatcher(
  "/@{identifier}/pinned",
  async (ctx, identifier) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, identifier),
      with: { account: true },
    });
    if (owner == null) return null;
    const items = await db.query.pinnedPosts.findMany({
      where: eq(pinnedPosts.accountId, owner.id),
      orderBy: desc(pinnedPosts.index),
      with: {
        post: {
          with: {
            account: { with: { owner: true } },
            replyTarget: true,
            quoteTarget: true,
            media: true,
            poll: { with: { options: { orderBy: pollOptions.index } } },
            mentions: { with: { account: true } },
            replies: true,
          },
        },
      },
    });
    return {
      items: items
        .map((p) => p.post)
        .filter((p) => p.visibility === "public" || p.visibility === "unlisted")
        .map((p) => toObject(p, ctx)),
    };
  },
);

federation.setFeaturedTagsDispatcher(
  "/@{identifier}/tags",
  async (ctx, identifier) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, identifier),
      with: { account: true, featuredTags: true },
    });
    if (owner == null) return null;
    const items = owner.featuredTags.map(
      (tag) =>
        new Hashtag({
          name: `#${tag.name}`,
          href: new URL(`/tags/${tag.name}?handle=${owner.handle}`, ctx.url),
        }),
    );
    return { items };
  },
);

const inboxLogger = getLogger(["hollo", "inbox"]);

federation
  .setInboxListeners("/@{identifier}/inbox", "/inbox")
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
    const follower = await persistAccount(db, actor, ctx);
    if (follower == null) return;
    let approves = !following.protected;
    if (approves) {
      const block = await db.query.blocks.findFirst({
        where: and(
          eq(blocks.accountId, following.id),
          eq(blocks.blockedAccountId, follower.id),
        ),
      });
      approves = block == null;
    }
    await db
      .insert(follows)
      .values({
        iri: follow.id.href,
        followingId: following.id,
        followerId: follower.id,
        approved: approves ? new Date() : null,
      })
      .onConflictDoNothing();
    if (approves) {
      await ctx.sendActivity(
        { username: following.owner.handle },
        actor,
        new Accept({
          id: new URL(
            `#accepts/${follower.iri}`,
            ctx.getActorUri(following.owner.handle),
          ),
          actor: object.id,
          object: follow,
        }),
        { excludeBaseUris: [new URL(ctx.origin)] },
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
    const account = await persistAccount(db, actor, ctx);
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
    const account = await persistAccount(db, actor, ctx);
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
    if (
      object instanceof Note &&
      object.replyTargetId != null &&
      object.attributionId != null &&
      object.name != null
    ) {
      const vote = await db.transaction((tx) =>
        persistPollVote(tx, object, ctx),
      );
      if (vote == null) return;
      const post = await db.query.posts.findFirst({
        with: {
          account: { with: { owner: true } },
          replyTarget: true,
          quoteTarget: true,
          media: true,
          poll: {
            with: {
              options: { orderBy: pollOptions.index },
              votes: { with: { account: true } },
            },
          },
          mentions: { with: { account: true } },
          replies: true,
        },
        where: eq(posts.pollId, vote.pollId),
      });
      if (post?.account.owner == null || post.poll == null) return;
      await ctx.sendActivity(
        { username: post.account.owner.handle },
        post.poll.votes.map((v) => ({
          id: new URL(v.account.iri),
          inboxId: new URL(v.account.inboxUrl),
          endpoints:
            v.account.sharedInboxUrl == null
              ? null
              : {
                  sharedInbox: new URL(v.account.sharedInboxUrl),
                },
        })),
        toUpdate(post, ctx),
        { preferSharedInbox: true, excludeBaseUris: [new URL(ctx.origin)] },
      );
    } else if (isPost(object)) {
      const post = await db.transaction(async (tx) => {
        const post = await persistPost(tx, object, ctx);
        if (post?.replyTargetId != null) {
          await updatePostStats(tx, { id: post.replyTargetId });
        }
        return post;
      });
      if (post?.replyTargetId != null) {
        const replyTarget = await db.query.posts.findFirst({
          where: eq(posts.id, post.replyTargetId),
          with: {
            account: { with: { owner: true } },
            replyTarget: true,
            quoteTarget: true,
            media: true,
            poll: { with: { options: true } },
            mentions: { with: { account: true } },
            replies: true,
          },
        });
        if (replyTarget?.account.owner != null) {
          await ctx.forwardActivity(
            { username: replyTarget.account.owner.handle },
            "followers",
            {
              skipIfUnsigned: true,
              preferSharedInbox: true,
              excludeBaseUris: [new URL(ctx.origin)],
            },
          );
          await ctx.sendActivity(
            { username: replyTarget.account.owner.handle },
            "followers",
            toUpdate(replyTarget, ctx),
            { preferSharedInbox: true, excludeBaseUris: [new URL(ctx.origin)] },
          );
        }
      }
    } else {
      inboxLogger.debug("Unsupported object on Create: {object}", { object });
    }
  })
  .on(Like, onLiked)
  .on(EmojiReact, onEmojiReactionAdded)
  .on(Announce, async (ctx, announce) => {
    const object = await announce.getObject();
    if (isPost(object)) {
      await db.transaction(async (tx) => {
        const post = await persistSharingPost(tx, announce, object, ctx);
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
      await persistAccount(db, object, ctx);
    } else if (object instanceof Article || object instanceof Note) {
      await persistPost(db, object, ctx);
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
  .on(Add, async (ctx, add) => {
    if (add.targetId == null) return;
    const accountList = await db.query.accounts.findMany({
      where: eq(accounts.featuredUrl, add.targetId.href),
    });
    const object = await add.getObject();
    if (object instanceof Note || object instanceof Article) {
      await db.transaction(async (tx) => {
        const post = await persistPost(tx, object, ctx);
        if (post == null) return;
        for (const account of accountList) {
          await tx.insert(pinnedPosts).values({
            postId: post.id,
            accountId: account.id,
          } satisfies NewPinnedPost);
        }
      });
    }
  })
  .on(Remove, async (ctx, remove) => {
    if (remove.targetId == null) return;
    const accountList = await db.query.accounts.findMany({
      where: eq(accounts.featuredUrl, remove.targetId.href),
    });
    const object = await remove.getObject();
    if (object instanceof Note || object instanceof Article) {
      await db.transaction(async (tx) => {
        const post = await persistPost(tx, object, ctx);
        if (post == null) return;
        for (const account of accountList) {
          await tx
            .delete(pinnedPosts)
            .where(
              and(
                eq(pinnedPosts.postId, post.id),
                eq(pinnedPosts.accountId, account.id),
              ),
            );
        }
      });
    }
  })
  .on(Block, onBlocked)
  .on(Move, onMove)
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
      const account = await persistAccount(db, actor, ctx);
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
    } else if (object instanceof Block) {
      await onUnblocked(ctx, undo);
    } else if (object instanceof Like) {
      await onUnliked(ctx, undo);
    } else if (object instanceof EmojiReact) {
      await onEmojiReactionRemoved(ctx, undo);
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

federation.setObjectDispatcher(
  Note,
  "/@{username}/{id}",
  async (ctx, values) => {
    if (!values.id?.match(/^[-a-f0-9]+$/)) return null;
    const owner = await db.query.accountOwners.findFirst({
      where: like(accountOwners.handle, values.username),
      with: { account: true },
    });
    if (owner == null) return null;
    const post = await db.query.posts.findFirst({
      where: and(
        eq(posts.id, values.id),
        eq(posts.accountId, owner.account.id),
      ),
      with: {
        account: { with: { owner: true } },
        replyTarget: true,
        quoteTarget: true,
        media: true,
        poll: { with: { options: { orderBy: pollOptions.index } } },
        mentions: { with: { account: true } },
        replies: true,
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
      const found = post.mentions.some(
        (m) => m.account.iri === keyOwnerId.href,
      );
      if (!found) return null;
    }
    return toObject(post, ctx);
  },
);

federation.setObjectDispatcher(
  Emoji,
  "/emojis/:{shortcode}:",
  async (ctx, { shortcode }) => {
    const emoji = await db.query.customEmojis.findFirst({
      where: eq(customEmojis.shortcode, shortcode),
    });
    if (emoji == null) return null;
    return new Emoji({
      id: ctx.getObjectUri(Emoji, { shortcode }),
      name: `:${shortcode}:`,
      icon: new Image({
        url: new URL(emoji.url),
      }),
    });
  },
);

federation.setObjectDispatcher(Flag, "/reports/{id}", async (ctx, { id }) => {
  const report = await db.query.reports.findFirst({
    where: eq(reports.id, id),
    with: {
      account: {
        columns: { iri: true },
      },
      targetAccount: {
        columns: {
          iri: true,
        },
      },
    },
  });

  if (report == null) return null;

  // Perform some access control on fetching a Flag activity
  const keyOwner = await ctx.getSignedKeyOwner();
  const keyOwnerId = keyOwner?.id;
  if (keyOwnerId == null) return null;

  // compare the keyOwner who signed the request with the targetAccount
  // Note: this won't work if it's the instance actor doing the fetch and not the targetAccount:
  if (keyOwnerId.href !== report.targetAccount.iri) {
    return null;
  }

  // Fetch the posts for the Flag activity:
  let targetPosts: { iri: string }[] = [];
  if (report.posts.length > 0) {
    targetPosts = await db.query.posts.findMany({
      where: and(
        inArray(posts.id, report.posts),
        eq(posts.accountId, report.targetAccountId),
      ),
      columns: {
        iri: true,
      },
    });
  }

  return new Flag({
    id: new URL(report.iri),
    actor: new URL(report.account.iri),
    // For Mastodon compatibility, objects must include the target account IRI along with the posts:
    objects: targetPosts
      .map((post) => new URL(post.iri))
      .concat(new URL(report.targetAccount.iri)),
    content: report.comment,
  });
});

federation.setNodeInfoDispatcher("/nodeinfo/2.1", async (_ctx) => {
  const version = parse(metadata.version)!;
  const [{ total }] = await db.select({ total: count() }).from(accountOwners);
  const [{ activeMonth }] = await db
    .select({ activeMonth: countDistinct(accountOwners.id) })
    .from(accountOwners)
    .rightJoin(posts, eq(accountOwners.id, posts.accountId))
    .where(gt(posts.updated, sql`CURRENT_TIMESTAMP - INTERVAL '1 month'`));
  const [{ activeHalfyear }] = await db
    .select({ activeHalfyear: countDistinct(accountOwners.id) })
    .from(accountOwners)
    .rightJoin(posts, eq(accountOwners.id, posts.accountId))
    .where(gt(posts.updated, sql`CURRENT_TIMESTAMP - INTERVAL '6 months'`));
  const [{ localPosts }] = await db
    .select({ localPosts: countDistinct(posts.id) })
    .from(posts)
    .rightJoin(accountOwners, eq(posts.accountId, accountOwners.id))
    .where(isNull(posts.replyTargetId));
  const [{ localComments }] = await db
    .select({ localComments: countDistinct(posts.id) })
    .from(posts)
    .rightJoin(accountOwners, eq(posts.accountId, accountOwners.id))
    .where(isNotNull(posts.replyTargetId));
  return {
    software: {
      name: "hollo",
      version: {
        major: version.major,
        minor: version.minor,
        patch: version.patch,
        build: version.build == null ? undefined : [...version.build],
        prerelease:
          version.prerelease == null ? undefined : [...version.prerelease],
      },
      homepage: new URL("https://docs.hollo.social/"),
      repository: new URL("https://github.com/dahlia/hollo"),
    },
    protocols: ["activitypub"],
    services: {
      outbound: ["atom1.0"],
    },
    usage: {
      users: {
        total,
        activeMonth,
        activeHalfyear,
      },
      localComments,
      localPosts,
    },
  };
});

export default federation;

// cSpell: ignore halfyear
