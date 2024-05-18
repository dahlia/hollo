import {
  Endpoints,
  Federation,
  Hashtag,
  LanguageString,
  MemoryKvStore,
  Mention,
  Note,
  PUBLIC_COLLECTION,
  getActorClassByTypeName,
  importJwk,
} from "@fedify/fedify";
import { parse } from "@std/semver";
import { and, eq, like } from "drizzle-orm";
import metadata from "../../package.json" with { type: "json" };
import db from "../db";
import { accounts, posts } from "../schema";
import { toTemporalInstant } from "./date";

export const federation = new Federation({
  kv: new MemoryKvStore(),
});

federation
  .setActorDispatcher("/@{handle}", async (ctx, handle, key) => {
    const owner = await db.query.accountOwners.findFirst({
      where: like(accounts.handle, `@${handle}@%`),
      with: { account: true },
    });
    if (owner == null) return null;
    const cls = getActorClassByTypeName(owner.account.type);
    return new cls({
      id: new URL(owner.account.iri),
      name: owner.account.name,
      preferredUsername: handle,
      summary: owner.account.bioHtml,
      url: owner.account.url ? new URL(owner.account.url) : null,
      manuallyApprovesFollowers: owner.account.protected,
      icon: owner.account.avatarUrl ? new URL(owner.account.avatarUrl) : null,
      image: owner.account.coverUrl ? new URL(owner.account.coverUrl) : null,
      published: owner.account.published
        ? toTemporalInstant(owner.account.published)
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
  .setKeyPairDispatcher(async (_, handle) => {
    const owner = await db.query.accountOwners.findFirst({
      where: like(accounts.handle, `@${handle}@%`),
      with: { account: true },
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

federation.setInboxListeners("/@{handle}/inbox", "/inbox");

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
