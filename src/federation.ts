import {
  Endpoints,
  Federation,
  MemoryKvStore,
  getActorClassByTypeName,
  importJwk,
} from "@fedify/fedify";
import { Temporal } from "@js-temporal/polyfill";
import { like } from "drizzle-orm";
import db from "./db";
import { accounts } from "./schema";

export const federation = new Federation({
  kv: new MemoryKvStore(),
  treatHttps: true,
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

function toTemporalInstant(value: Date): Temporal.Instant {
  return Temporal.Instant.from(value.toISOString());
}

export default federation;
