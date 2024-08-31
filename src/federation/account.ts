import {
  type Actor,
  Article,
  type DocumentLoader,
  Link,
  Note,
  PropertyValue,
  getActorHandle,
  getActorTypeName,
  isActor,
  lookupObject,
} from "@fedify/fedify";
import { getLogger } from "@logtape/logtape";
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
import { persistPost } from "./post";

const logger = getLogger(["hollo", "federation", "account"]);

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
  } = {},
): Promise<schema.Account | null> {
  const opts = { ...options, suppressError: true };
  if (
    actor.id == null ||
    actor.inboxId == null ||
    (actor.name == null && actor.preferredUsername == null)
  ) {
    return null;
  }
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
    fieldHtmls,
    published: toDate(actor.published),
  };
  await db
    .insert(schema.accounts)
    .values({
      id: uuidv7(),
      iri: actor.id.href,
      ...values,
    } satisfies schema.NewAccount)
    .onConflictDoUpdate({
      target: schema.accounts.iri,
      set: values,
      setWhere: eq(schema.accounts.iri, actor.id.href),
    });
  const account = await db.query.accounts.findFirst({
    where: eq(schema.accounts.iri, actor.id.href),
  });
  if (account == null) return null;
  const featuredCollection = await actor.getFeatured(opts);
  if (featuredCollection != null) {
    const posts: Post[] = [];
    for await (const item of iterateCollection(featuredCollection, opts)) {
      if (item instanceof Note || item instanceof Article) {
        const post = await persistPost(db, search, item, {
          ...options,
          account,
        });
        if (post == null) continue;
        posts.unshift(post);
      }
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
  return await persistAccount(db, search, actor, options);
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
