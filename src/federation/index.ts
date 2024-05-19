import {
  Accept,
  Endpoints,
  Federation,
  Follow,
  Hashtag,
  LanguageString,
  MemoryKvStore,
  Mention,
  Note,
  PUBLIC_COLLECTION,
  Reject,
  Undo,
  getActorClassByTypeName,
  importJwk,
  isActor,
} from "@fedify/fedify";
import { getLogger } from "@logtape/logtape";
import { parse } from "@std/semver";
import { and, eq, like } from "drizzle-orm";
import metadata from "../../package.json" with { type: "json" };
import db from "../db";
import { accountOwners, accounts, follows, posts } from "../schema";
import { persistAccount } from "./account";
import { toTemporalInstant } from "./date";

export const federation = new Federation({
  kv: new MemoryKvStore(),
});

federation
  .setActorDispatcher("/@{handle}", async (ctx, handle, key) => {
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
      icon: account.avatarUrl ? new URL(account.avatarUrl) : null,
      image: account.coverUrl ? new URL(account.coverUrl) : null,
      published: account.published
        ? toTemporalInstant(account.published)
        : null,
      publicKey: key,
      followers: ctx.getFollowersUri(handle),
      following: ctx.getFollowingUri(handle),
      outbox: ctx.getOutboxUri(handle),
      inbox: ctx.getInboxUri(handle),
      endpoints: new Endpoints({
        sharedInbox: ctx.getInboxUri(),
      }),
    });
  })
  .setKeyPairDispatcher(async (_ctx, handle) => {
    const owner = await db.query.accountOwners.findFirst({
      where: eq(accountOwners.handle, handle),
    });
    if (owner == null) return null;
    return {
      privateKey: await importJwk(owner.privateKeyJwk, "private"),
      publicKey: await importJwk(owner.publicKeyJwk, "public"),
    };
  });

federation.setFollowersDispatcher("/@{handle}/followers", async (_ctx, _) => {
  return {
    items: [], // TODO: Implement this
  };
});

federation.setFollowingDispatcher("/@{handle}/following", async (_ctx, _) => {
  return {
    items: [], // TODO: Implement this
  };
});

federation.setOutboxDispatcher("/@{handle}/outbox", async (_ctx, _) => {
  return {
    items: [], // TODO: Implement this
  };
});

const inboxLogger = getLogger(["hollo", "inbox"]);

federation
  .setInboxListeners("/@{handle}/inbox", "/inbox")
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
          actor: object.id,
          object: follow,
        }),
      );
    }
  })
  .on(Accept, async (ctx, accept) => {
    const object = await accept.getObject();
    if (object instanceof Follow) {
      if (object.id == null) return;
      const actor = await accept.getActor();
      if (!isActor(actor) || actor.id == null) {
        inboxLogger.debug("Invalid actor: {actor}", { actor });
        return;
      }
      const account = await persistAccount(db, actor, ctx);
      if (account == null) return;
      await db
        .update(follows)
        .set({ approved: new Date() })
        .where(
          and(
            eq(follows.iri, object.id.href),
            eq(follows.followingId, account.id),
          ),
        );
    }
  })
  .on(Reject, async (ctx, reject) => {
    const object = await reject.getObject();
    if (object instanceof Follow) {
      if (object.id == null) return;
      const actor = await reject.getActor();
      if (!isActor(actor) || actor.id == null) {
        inboxLogger.debug("Invalid actor: {actor}", { actor });
        return;
      }
      const account = await persistAccount(db, actor, ctx);
      if (account == null) return;
      await db
        .delete(follows)
        .where(
          and(
            eq(follows.iri, object.id.href),
            eq(follows.followingId, account.id),
          ),
        );
    }
  })
  .on(Undo, async (ctx, undo) => {
    const object = await undo.getObject();
    if (object instanceof Follow) {
      if (object.id == null) return;
      const actor = await undo.getActor();
      if (!isActor(actor) || actor.id == null) {
        inboxLogger.debug("Invalid actor: {actor}", { actor });
        return;
      }
      const account = await persistAccount(db, actor, ctx);
      if (account == null) return;
      await db
        .delete(follows)
        .where(
          and(
            eq(follows.iri, object.id.href),
            eq(follows.followerId, account.id),
          ),
        );
    }
  });

federation.setObjectDispatcher(Note, "/@{handle}/{id}", async (ctx, values) => {
  const owner = await db.query.accountOwners.findFirst({
    where: like(accounts.handle, `@${values.handle}@%`),
    with: { account: true },
  });
  if (owner == null) return null;
  const post = await db.query.posts.findFirst({
    where: and(eq(posts.id, values.id), eq(posts.accountId, owner.account.id)),
    with: { replyTarget: true, mentions: { with: { account: true } } },
  });
  if (post == null) return null;
  return new Note({
    id: ctx.getObjectUri(Note, values),
    attribution: ctx.getActorUri(values.handle),
    replyTarget:
      post.replyTarget == null ? null : new URL(post.replyTarget.iri),
    tos:
      post.visibility === "direct"
        ? post.mentions.map((m) => new URL(m.account.iri))
        : post.visibility === "public"
          ? [PUBLIC_COLLECTION]
          : post.visibility === "private"
            ? [ctx.getFollowersUri(values.handle)]
            : [],
    cc: post.visibility === "direct" ? PUBLIC_COLLECTION : null,
    summary:
      post.summaryHtml == null
        ? null
        : post.language == null
          ? post.summaryHtml
          : new LanguageString(post.summaryHtml, post.language),
    content:
      post.contentHtml == null
        ? null
        : post.language == null
          ? post.contentHtml
          : new LanguageString(post.contentHtml, post.language),
    tags: [
      ...Object.entries(post.tags).map(
        ([name, url]) => new Hashtag({ name: `#${name}`, href: new URL(url) }),
      ),
      ...post.mentions.map(
        (m) =>
          new Mention({ name: m.account.handle, href: new URL(m.account.iri) }),
      ),
    ],
    sensitive: post.sensitive,
    url: post.url ? new URL(post.url) : null,
    published: post.published ? toTemporalInstant(post.published) : null,
    updated: toTemporalInstant(post.updated),
  });
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
