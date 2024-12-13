import {
  type Actor,
  Announce,
  Create,
  type DocumentLoader,
  Emoji,
  Link,
  PropertyValue,
  formatSemVer,
  getActorHandle,
  getActorTypeName,
  getNodeInfo,
  isActor,
  lookupObject,
} from "@fedify/fedify";
import {
  type ExtractTablesWithRelations,
  and,
  count,
  eq,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { uuidv7 } from "uuidv7-js";
import * as schema from "../schema";
import type { NewPinnedPost, Post } from "../schema";
import { iterateCollection } from "./collection";
import { toDate } from "./date";
import {
  isPost,
  persistPost,
  persistSharingPost,
  updatePostStats,
} from "./post";

export async function persistAccount(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  actor: Actor,
  options: {
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
    skipUpdate?: boolean;
  } = {},
): Promise<(schema.Account & { owner: schema.AccountOwner | null }) | null> {
  const opts = { ...options, suppressError: true };
  if (
    actor.id == null ||
    actor.inboxId == null ||
    (actor.name == null && actor.preferredUsername == null)
  ) {
    return null;
  }
  const existingAccount = await db.query.accounts.findFirst({
    with: { owner: true },
    where: eq(schema.accounts.iri, actor.id.href),
  });
  if (options.skipUpdate && existingAccount != null) return existingAccount;
  if (existingAccount?.owner != null) return existingAccount;
  let handle: string;
  try {
    handle = await getActorHandle(actor);
  } catch (e) {
    if (e instanceof TypeError) return null;
    throw e;
  }
  const avatar = await actor.getIcon(opts);
  const cover = await actor.getImage(opts);
  const followers = await actor.getFollowers(opts);
  const successor = await actor.getSuccessor(opts);
  const successorId =
    successor == null
      ? null
      : ((await persistAccount(db, successor, { ...options, skipUpdate: true }))
          ?.id ?? null);
  const fieldHtmls: Record<string, string> = {};
  for await (const attachment of actor.getAttachments(opts)) {
    if (
      attachment instanceof PropertyValue &&
      attachment.name != null &&
      attachment.value != null
    ) {
      fieldHtmls[attachment.name.toString()] = attachment.value.toString();
    }
  }
  const emojis: Record<string, string> = {};
  for await (const tag of actor.getTags(opts)) {
    if (tag instanceof Emoji && tag.name != null) {
      const icon = await tag.getIcon(opts);
      if (icon?.url == null) continue;
      let href: string;
      if (icon.url instanceof Link) {
        if (icon.url.href == null) continue;
        href = icon.url.href.href;
      } else href = icon.url.href;
      emojis[tag.name.toString()] = href;
    }
  }
  const nodeInfo = await getNodeInfo(actor.id, {
    parse: "best-effort",
  });
  const values: Omit<schema.NewAccount, "id" | "iri"> = {
    type: getActorTypeName(actor),
    name: actor?.name?.toString() ?? actor?.preferredUsername?.toString() ?? "",
    handle,
    bioHtml: actor.summary?.toString(),
    url: actor.url instanceof Link ? actor.url.href?.href : actor.url?.href,
    protected: actor.manuallyApprovesFollowers ?? false,
    avatarUrl:
      avatar?.url instanceof Link ? avatar.url.href?.href : avatar?.url?.href,
    coverUrl:
      cover?.url instanceof Link ? cover.url.href?.href : cover?.url?.href,
    inboxUrl: actor.inboxId.href,
    followersUrl: followers?.id?.href,
    sharedInboxUrl: actor.endpoints?.sharedInbox?.href,
    featuredUrl: actor.featuredId?.href,
    followingCount: (await actor.getFollowing(opts))?.totalItems ?? 0,
    followersCount: followers?.totalItems ?? 0,
    postsCount: (await actor.getOutbox(opts))?.totalItems ?? 0,
    successorId,
    aliases: actor?.aliasIds?.map((alias) => alias.href) ?? [],
    software: nodeInfo?.software.name ?? null,
    softwareVersion:
      nodeInfo?.software == null ||
      formatSemVer(nodeInfo.software.version) === "0.0.0"
        ? null
        : formatSemVer(nodeInfo.software.version),
    fieldHtmls,
    published: toDate(actor.published),
  };
  await db
    .insert(schema.accounts)
    .values({
      id: uuidv7(),
      iri: actor.id.href,
      ...values,
      emojis: sql`${emojis}::jsonb`,
    })
    .onConflictDoUpdate({
      target: schema.accounts.iri,
      set: {
        ...values,
        emojis: sql`${emojis}::jsonb`,
      },
      setWhere: eq(schema.accounts.iri, actor.id.href),
    });
  const account = await db.query.accounts.findFirst({
    with: { owner: true },
    where: eq(schema.accounts.iri, actor.id.href),
  });
  if (account == null) return null;
  const [{ posts }] = await db
    .select({ posts: count() })
    .from(schema.posts)
    .where(eq(schema.posts.accountId, account.id));
  if (posts > 0) return account;
  const featuredCollection = await actor.getFeatured(opts);
  if (featuredCollection != null) {
    const posts: Post[] = [];
    for await (const item of iterateCollection(featuredCollection, opts)) {
      if (!isPost(item)) continue;
      const post = await persistPost(db, item, {
        ...options,
        account,
        skipUpdate: true,
      });
      if (post == null) continue;
      posts.unshift(post);
    }
    for (const post of posts) {
      await db
        .insert(schema.pinnedPosts)
        .values({
          postId: post.id,
          accountId: post.accountId,
        } satisfies NewPinnedPost)
        .onConflictDoNothing();
    }
  }
  return account;
}

export async function persistAccountPosts(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  account: schema.Account,
  fetchPosts: number,
  options: {
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
    suppressError?: boolean;
  } = {},
): Promise<void> {
  if (fetchPosts < 1) return;
  const actor = await lookupObject(account.iri, options);
  if (!isActor(actor)) return;
  const outboxCollection = await actor.getOutbox(options);
  if (outboxCollection != null) {
    let i = 0;
    for await (const activity of iterateCollection(outboxCollection, options)) {
      if (activity instanceof Create) {
        const item = await activity.getObject(options);
        if (!isPost(item)) continue;
        const post = await persistPost(db, item, {
          ...options,
          account,
          skipUpdate: true,
        });
        if (post?.replyTargetId != null) i++;
      } else if (activity instanceof Announce) {
        const item = await activity.getObject(options);
        if (!isPost(item)) continue;
        await db.transaction(async (tx) => {
          const post = await persistSharingPost(tx, activity, item, {
            ...options,
            account,
          });
          if (post?.sharingId != null) {
            await updatePostStats(tx, { id: post.sharingId });
          }
          if (post != null) i++;
        });
      }
      if (i >= fetchPosts) break;
    }
  }
}

export async function persistAccountByIri(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  iri: string,
  options: {
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
  } = {},
): Promise<schema.Account | null> {
  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.iri, iri),
  });
  if (account != null) return account;
  const actor = await lookupObject(iri, options);
  if (!isActor(actor) || actor.id == null) return null;
  return await persistAccount(db, actor, options);
}

export async function updateAccountStats(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  account: { id: string } | { iri: string },
): Promise<void> {
  const id =
    "id" in account
      ? account.id
      : db
          .select({ id: schema.accounts.id })
          .from(schema.accounts)
          .where(eq(schema.accounts.iri, account.iri));
  const followingCount = db
    .select({ cnt: count() })
    .from(schema.follows)
    .where(
      and(
        eq(schema.follows.followerId, id),
        isNotNull(schema.follows.approved),
      ),
    );
  const followersCount = db
    .select({ cnt: count() })
    .from(schema.follows)
    .where(
      and(
        eq(schema.follows.followingId, id),
        isNotNull(schema.follows.approved),
      ),
    );
  const postsCount = db
    .select({ cnt: count() })
    .from(schema.posts)
    .where(eq(schema.posts.accountId, id));
  await db
    .update(schema.accounts)
    .set({
      followingCount: sql`${followingCount}`,
      followersCount: sql`${followersCount}`,
      postsCount: sql`${postsCount}`,
    })
    .where(
      and(
        "id" in account
          ? eq(schema.accounts.id, account.id)
          : eq(schema.accounts.iri, account.iri),
        inArray(
          schema.accounts.id,
          db.select({ id: schema.accountOwners.id }).from(schema.accountOwners),
        ),
      ),
    );
}
