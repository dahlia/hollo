import {
  Article,
  type Context,
  Create,
  type DocumentLoader,
  LanguageString,
  Link,
  Note,
  PUBLIC_COLLECTION,
  isActor,
} from "@fedify/fedify";
import * as vocab from "@fedify/fedify/vocab";
import { getLogger } from "@logtape/logtape";
import { type ExtractTablesWithRelations, eq } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { uuidv7 } from "uuidv7-js";
import {
  type Account,
  type AccountOwner,
  type Mention,
  type NewPost,
  type Post,
  posts,
} from "../schema";
import type * as schema from "../schema";
import { persistAccount } from "./account";
import { toDate, toTemporalInstant } from "./date";

const logger = getLogger(["hollo", "federation", "post"]);

export async function persistPost(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  object: Article | Note,
  options: {
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
  } = {},
): Promise<schema.Post | null> {
  if (object.id == null) return null;
  const actor = await object.getAttribution();
  logger.debug("Fetched actor: {actor}", { actor });
  if (!isActor(actor)) return null;
  const account = await persistAccount(db, actor, options);
  logger.debug("Persisted account: {account}", { account });
  if (account == null) return null;
  let replyTargetId: string | null = null;
  if (object.replyTargetId != null) {
    const result = await db
      .select({ id: posts.id })
      .from(posts)
      .where(eq(posts.iri, object.replyTargetId.href))
      .limit(1);
    if (result != null && result.length > 0) {
      replyTargetId = result[0].id;
      logger.debug("The reply target is already persisted: {replyTargetId}", {
        replyTargetId,
      });
    } else {
      logger.debug("Persisting the reply target...");
      const replyTarget = await object.getReplyTarget();
      if (replyTarget instanceof Note || replyTarget instanceof Article) {
        const replyTargetObj = await persistPost(db, replyTarget, options);
        logger.debug("Persisted the reply target: {replyTarget}", {
          replyTarget: replyTargetObj,
        });
        replyTargetId = replyTargetObj?.id ?? null;
      }
    }
  }
  const to = new Set(object.toIds.map((url) => url.href));
  const cc = new Set(object.ccIds.map((url) => url.href));
  const values: Omit<NewPost, "id" | "iri"> = {
    type: object instanceof Article ? "Article" : "Note",
    accountId: account.id,
    applicationId: null,
    replyTargetId,
    sharingId: null,
    visibility: to.has(PUBLIC_COLLECTION.href)
      ? "public"
      : cc.has(PUBLIC_COLLECTION.href)
        ? "unlisted"
        : account.followersUrl != null && to.has(account.followersUrl)
          ? "private"
          : "direct",
    summaryHtml: object.summary?.toString(),
    contentHtml: object.content?.toString(),
    language:
      object.content instanceof LanguageString
        ? object.content.language.compact()
        : object.summary instanceof LanguageString
          ? object.summary.language.compact()
          : null,
    tags: {}, // TODO
    sensitive: object.sensitive ?? false,
    url: object.url instanceof Link ? object.url.href?.href : object.url?.href,
    repliesCount: 0, // TODO
    sharesCount: 0, // TODO
    likesCount: 0, // TODO
    published: toDate(object.published),
    updated: toDate(object.published) ?? new Date(),
  };
  await db
    .insert(posts)
    .values({
      ...values,
      id: uuidv7(),
      iri: object.id.href,
    } satisfies NewPost)
    .onConflictDoUpdate({
      target: [posts.iri],
      set: values,
      setWhere: eq(posts.iri, object.id.href),
    });
  return (
    (await db.query.posts.findFirst({
      where: eq(posts.iri, object.id.href),
    })) ?? null
  );
}

export function toObject(
  post: Post & {
    account: Account & { owner: AccountOwner | null };
    replyTarget: Post | null;
    mentions: (Mention & { account: Account })[];
  },
  ctx: Context<unknown>,
): Note | Article {
  return new Note({
    id: new URL(post.iri),
    attribution: new URL(post.account.iri),
    tos:
      post.visibility === "public"
        ? [PUBLIC_COLLECTION]
        : post.visibility === "direct"
          ? post.mentions.map((m) => new URL(m.account.iri))
          : post.account.owner == null
            ? []
            : [ctx.getFollowersUri(post.account.owner.handle)],
    cc: post.visibility === "unlisted" ? PUBLIC_COLLECTION : null,
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
    sensitive: post.sensitive,
    tags: post.mentions.map(
      (m) =>
        new vocab.Mention({
          href: new URL(m.account.iri),
          name: m.account.handle,
        }),
    ),
    replyTarget:
      post.replyTarget == null ? null : new URL(post.replyTarget.iri),
    published: toTemporalInstant(post.published),
  });
}

export function toCreate(
  post: Post & {
    account: Account & { owner: AccountOwner | null };
    replyTarget: Post | null;
    mentions: (Mention & { account: Account })[];
  },
  ctx: Context<unknown>,
): Create {
  const object = toObject(post, ctx);
  return new Create({
    // biome-ignore lint/style/noNonNullAssertion: id is never null
    id: new URL("#create", object.id!),
    actor: object.attributionId,
    tos: object.toIds,
    ccs: object.ccIds,
    object,
    published: object.published,
  });
}
