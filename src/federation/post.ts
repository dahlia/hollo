import {
  type Announce,
  Article,
  Collection,
  type Context,
  Create,
  type DocumentLoader,
  Hashtag,
  LanguageString,
  Link,
  Note,
  PUBLIC_COLLECTION,
  Question,
  Update,
  isActor,
} from "@fedify/fedify";
import * as vocab from "@fedify/fedify/vocab";
import { getLogger } from "@logtape/logtape";
import {
  type ExtractTablesWithRelations,
  and,
  count,
  eq,
  gte,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import type MeiliSearch from "meilisearch";
import { MeiliSearchCommunicationError } from "meilisearch";
import sharp from "sharp";
// @ts-ignore: No type definitions available
import { isSSRFSafeURL } from "ssrfcheck";
import { uuidv7 } from "uuidv7-js";
import { type Thumbnail, uploadThumbnail } from "../media";
import { fetchPreviewCard } from "../previewcard";
import {
  type Account,
  type AccountOwner,
  type Medium,
  type Mention,
  type NewMedium,
  type NewPost,
  type Poll,
  type PollOption,
  type PollVote,
  type Post,
  accountOwners,
  likes,
  media,
  mentions,
  pollOptions,
  pollVotes,
  polls,
  posts,
} from "../schema";
import type * as schema from "../schema";
import { extractPreviewLink } from "../text";
import { persistAccount, persistAccountByIri } from "./account";
import { toDate, toTemporalInstant } from "./date";

const logger = getLogger(["hollo", "federation", "post"]);

export async function persistPost(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  search: MeiliSearch,
  object: Article | Note | Question,
  options: {
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
    account?: Account;
  } = {},
): Promise<schema.Post | null> {
  if (object.id == null) return null;
  const actor = await object.getAttribution();
  logger.debug("Fetched actor: {actor}", { actor });
  if (!isActor(actor)) return null;
  const account =
    options?.account != null && options.account.iri === actor.id?.href
      ? options.account
      : await persistAccount(db, search, actor, options);
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
        const replyTargetObj = await persistPost(
          db,
          search,
          replyTarget,
          options,
        );
        logger.debug("Persisted the reply target: {replyTarget}", {
          replyTarget: replyTargetObj,
        });
        replyTargetId = replyTargetObj?.id ?? null;
      }
    }
  }
  const to = new Set(object.toIds.map((url) => url.href));
  const cc = new Set(object.ccIds.map((url) => url.href));
  const tags: Record<string, string> = {};
  for await (const tag of object.getTags()) {
    if (tag instanceof Hashtag && tag.name != null && tag.href != null) {
      tags[tag.name.toString()] = tag.href.href;
    }
  }
  const previewLink =
    object.content == null
      ? null
      : extractPreviewLink(object.content.toString());
  const previewCard =
    previewLink == null ? null : await fetchPreviewCard(previewLink);
  const values = {
    type:
      object instanceof Question
        ? "Question"
        : object instanceof Article
          ? "Article"
          : "Note",
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
    previewCard,
    // https://github.com/drizzle-team/drizzle-orm/issues/724#issuecomment-1650670298
    tags: sql`${tags}::jsonb`,
    sensitive: object.sensitive ?? false,
    url: object.url instanceof Link ? object.url.href?.href : object.url?.href,
    repliesCount: 0, // TODO
    sharesCount: 0, // TODO
    likesCount: 0, // TODO
    published: toDate(object.published),
    updated: toDate(object.published) ?? new Date(),
  } as const;
  await db
    .insert(posts)
    .values({
      ...values,
      id: uuidv7(),
      iri: object.id.href,
    })
    .onConflictDoUpdate({
      target: [posts.iri],
      set: values,
      setWhere: eq(posts.iri, object.id.href),
    });
  let post = await db.query.posts.findFirst({
    where: eq(posts.iri, object.id.href),
  });
  if (post == null) return null;
  if (object instanceof Question) {
    const options: [string, number][] = [];
    let multiple = false;
    for await (const option of object.getExclusiveOptions()) {
      if (option instanceof Note && option.name != null) {
        const replies = await option.getReplies();
        options.push([option.name.toString(), replies?.totalItems ?? 0]);
      }
    }
    if (options.length < 1) {
      for await (const option of object.getInclusiveOptions()) {
        if (option instanceof Note && option.name != null) {
          const replies = await option.getReplies();
          options.push([option.name.toString(), replies?.totalItems ?? 0]);
        }
        multiple = true;
      }
    }
    if (options.length < 1 || object.endTime == null) return post;
    if (post.pollId == null) {
      const [poll] = await db
        .insert(polls)
        .values({
          id: uuidv7(),
          multiple,
          votersCount: object.voters ?? 0,
          expires: toDate(object.endTime),
        })
        .returning();
      await db.insert(pollOptions).values(
        options.map(([title, votesCount], index) => ({
          pollId: poll.id,
          index,
          title,
          votesCount,
        })),
      );
      await db
        .update(posts)
        .set({ pollId: poll.id })
        .where(eq(posts.id, post.id));
    } else {
      const [poll] = await db
        .update(polls)
        .set({
          multiple,
          votersCount: object.voters ?? 0,
          expires: toDate(object.endTime),
        })
        .where(eq(polls.id, post.pollId))
        .returning();
      for (let index = 0; index < options.length; index++) {
        const [title, votesCount] = options[index];
        await db
          .insert(pollOptions)
          .values({ pollId: poll.id, index, title, votesCount })
          .onConflictDoUpdate({
            target: [pollOptions.pollId, pollOptions.index],
            set: { title, votesCount },
            setWhere: and(
              eq(pollOptions.pollId, poll.id),
              eq(pollOptions.index, index),
            ),
          });
      }
      await db
        .delete(pollOptions)
        .where(
          and(
            eq(pollOptions.pollId, post.pollId),
            gte(pollOptions.index, options.length),
          ),
        );
    }
  }
  await db.delete(mentions).where(eq(mentions.postId, post.id));
  for await (const tag of object.getTags(options)) {
    if (tag instanceof vocab.Mention && tag.name != null && tag.href != null) {
      const account = await persistAccountByIri(
        db,
        search,
        tag.href.href,
        options,
      );
      if (account == null) continue;
      await db.insert(mentions).values({
        accountId: account.id,
        postId: post.id,
      });
    }
  }
  await db.delete(media).where(eq(media.postId, post.id));
  for await (const attachment of object.getAttachments(options)) {
    if (
      !(
        attachment instanceof vocab.Image ||
        attachment instanceof vocab.Document
      )
    ) {
      continue;
    }
    const url =
      attachment.url instanceof Link
        ? attachment.url.href?.href
        : attachment.url?.href;
    if (url == null || !isSSRFSafeURL(url)) continue;
    const response = await fetch(url);
    const mediaType =
      response.headers.get("Content-Type") ?? attachment.mediaType;
    if (mediaType == null) continue;
    const id = uuidv7();
    let thumbnail: Thumbnail;
    let metadata: { width?: number; height?: number };
    try {
      const image = sharp(await response.arrayBuffer());
      metadata = await image.metadata();
      thumbnail = await uploadThumbnail(id, image);
    } catch (_) {
      metadata = {
        width: attachment.width ?? 512,
        height: attachment.height ?? 512,
      };
      thumbnail = {
        thumbnailUrl: url,
        thumbnailType: mediaType,
        thumbnailWidth: metadata.width!,
        thumbnailHeight: metadata.height!,
      };
    }
    await db.insert(media).values({
      id,
      postId: post.id,
      type: mediaType,
      url,
      description: attachment.name?.toString(),
      width: attachment.width ?? metadata.width!,
      height: attachment.height ?? metadata.height!,
      ...thumbnail,
    } satisfies NewMedium);
  }
  post = await db.query.posts.findFirst({
    where: eq(posts.iri, object.id.href),
    with: { account: true, media: true },
  });
  try {
    await search.index("posts").addDocuments([post!], { primaryKey: "id" });
  } catch (e) {
    if (!(e instanceof MeiliSearchCommunicationError)) throw e;
  }
  return post!;
}

export async function persistSharingPost(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  search: MeiliSearch,
  announce: Announce,
  object: Article | Note,
  options: {
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
  } = {},
): Promise<Post | null> {
  if (announce.id == null) return null;
  const actor = await announce.getActor(options);
  if (actor == null) return null;
  const account = await persistAccount(db, search, actor, options);
  if (account == null) return null;
  const originalPost = await persistPost(db, search, object, options);
  if (originalPost == null) return null;
  const id = uuidv7();
  const updated = new Date();
  const result = await db
    .insert(posts)
    .values({
      ...originalPost,
      id,
      iri: announce.id.href,
      accountId: account.id,
      applicationId: null,
      replyTargetId: null,
      sharingId: originalPost.id,
      visibility: announce.toIds
        .map((iri) => iri.href)
        .includes(PUBLIC_COLLECTION.href)
        ? "public"
        : announce.ccIds.map((iri) => iri.href).includes(PUBLIC_COLLECTION.href)
          ? "unlisted"
          : "private",
      url: originalPost.url,
      published: toDate(announce.published) ?? updated,
      updated,
    } satisfies NewPost)
    .returning();
  await db
    .update(posts)
    .set({ sharesCount: sql`coalesce(${posts.sharesCount}, 0) + 1` })
    .where(eq(posts.id, originalPost.id));
  return result[0] ?? null;
}

export async function persistPollVote(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  search: MeiliSearch,
  object: Note,
  options: {
    contextLoader?: DocumentLoader;
    documentLoader?: DocumentLoader;
    account?: Account;
  } = {},
): Promise<PollVote | null> {
  if (
    object.replyTargetId == null ||
    object.attributionId == null ||
    object.name == null
  ) {
    return null;
  }
  const post = await db.query.posts.findFirst({
    with: {
      poll: { with: { options: { orderBy: pollOptions.index } } },
    },
    where: and(
      eq(posts.iri, object.replyTargetId.href),
      eq(posts.type, "Question"),
      isNotNull(posts.pollId),
    ),
  });
  if (post == null) return null;
  const poll = post.poll;
  if (poll == null) return null;
  const voter = await persistAccountByIri(
    db,
    search,
    object.attributionId.href,
    options,
  );
  if (voter == null) return null;
  if (!poll.multiple) {
    const deleted = await db
      .delete(pollVotes)
      .where(
        and(eq(pollVotes.accountId, voter.id), eq(pollVotes.pollId, poll.id)),
      )
      .returning();
    for (const vote of deleted) {
      await db
        .update(pollOptions)
        .set({
          votesCount: sql`${pollOptions.votesCount} - 1`,
        })
        .where(
          and(
            eq(pollOptions.pollId, poll.id),
            eq(pollOptions.index, vote.optionIndex),
          ),
        );
    }
    if (deleted.length > 0) {
      await db
        .update(polls)
        .set({
          votersCount: sql`${polls.votersCount} - 1`,
        })
        .where(eq(polls.id, poll.id));
    }
  }
  const optionTitle = object.name.toString();
  const optionIndex = poll.options.findIndex((o) => o.title === optionTitle);
  const votes = await db
    .insert(pollVotes)
    .values({
      accountId: voter.id,
      pollId: poll.id,
      optionIndex,
    })
    .returning();
  if (votes.length < 1) return null;
  await db
    .update(pollOptions)
    .set({
      votesCount: sql`${pollOptions.votesCount} + 1`,
    })
    .where(
      and(
        eq(pollOptions.pollId, poll.id),
        eq(pollOptions.index, votes[0].optionIndex),
      ),
    );
  await db
    .update(polls)
    .set({
      votersCount: sql`${polls.votersCount} + 1`,
    })
    .where(eq(polls.id, poll.id));
  return votes[0];
}

export async function updatePostStats(
  db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  { id }: { id: string },
): Promise<void> {
  const repliesCount = db
    .select({ cnt: count() })
    .from(posts)
    .where(eq(posts.replyTargetId, id));
  const sharesCount = db
    .select({ cnt: count() })
    .from(posts)
    .where(eq(posts.sharingId, id));
  const likesCount = db
    .select({ cnt: count() })
    .from(likes)
    .where(eq(likes.postId, id));
  await db
    .update(posts)
    .set({
      repliesCount: sql`${repliesCount}`,
      sharesCount: sql`${sharesCount}`,
      likesCount: sql`${likesCount}`,
    })
    .where(
      and(
        eq(posts.id, id),
        inArray(
          posts.accountId,
          db.select({ id: accountOwners.id }).from(accountOwners),
        ),
      ),
    );
}

export function toObject(
  post: Post & {
    account: Account & { owner: AccountOwner | null };
    replyTarget: Post | null;
    media: Medium[];
    poll: (Poll & { options: PollOption[] }) | null;
    mentions: (Mention & { account: Account })[];
  },
  ctx: Context<unknown>,
): Note | Article | Question {
  const cls =
    post.type === "Question"
      ? Question
      : post.type === "Article"
        ? Article
        : Note;
  const options =
    post.poll == null
      ? []
      : post.poll.options
          .toSorted((a, b) => (a.index < b.index ? -1 : 1))
          .map(
            (o) =>
              new Note({
                name: o.title,
                replies: new Collection({ totalItems: o.votesCount }),
              }),
          );
  return new cls({
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
    summaries:
      post.summaryHtml == null
        ? []
        : post.language == null
          ? [post.summaryHtml]
          : [
              post.summaryHtml,
              new LanguageString(post.summaryHtml, post.language),
            ],
    contents:
      post.contentHtml == null
        ? []
        : post.language == null
          ? [post.contentHtml]
          : [
              post.contentHtml,
              new LanguageString(post.contentHtml, post.language),
            ],
    sensitive: post.sensitive,
    tags: [
      ...post.mentions.map(
        (m) =>
          new vocab.Mention({
            href: new URL(m.account.iri),
            name: m.account.handle,
          }),
      ),
      ...Object.entries(post.tags).map(
        ([name, url]) =>
          new vocab.Hashtag({
            name,
            href: new URL(url),
          }),
      ),
    ],
    replyTarget:
      post.replyTarget == null ? null : new URL(post.replyTarget.iri),
    attachments: post.media.map(
      (medium) =>
        new vocab.Image({
          mediaType: medium.type,
          url: new URL(medium.url),
          name: medium.description,
          width: medium.width,
          height: medium.height,
        }),
    ),
    published: toTemporalInstant(post.published),
    url: post.url ? new URL(post.url) : null,
    updated: toTemporalInstant(
      post.published == null
        ? post.updated
        : +post.updated === +post.published
          ? null
          : post.updated,
    ),
    exclusiveOptions: post.poll == null || post.poll.multiple ? [] : options,
    inclusiveOptions: post.poll == null || !post.poll.multiple ? [] : options,
    voters: post.poll == null ? null : post.poll.votersCount,
    endTime: post.poll == null ? null : toTemporalInstant(post.poll.expires),
    closed:
      post.poll == null || post.poll.expires > new Date()
        ? null
        : toTemporalInstant(post.poll.expires),
  });
}

export function toCreate(
  post: Post & {
    account: Account & { owner: AccountOwner | null };
    replyTarget: Post | null;
    media: Medium[];
    poll: (Poll & { options: PollOption[] }) | null;
    mentions: (Mention & { account: Account })[];
  },
  ctx: Context<unknown>,
): Create {
  const object = toObject(post, ctx);
  return new Create({
    id: new URL("#create", object.id!),
    actor: object.attributionId,
    tos: object.toIds,
    ccs: object.ccIds,
    object,
    published: object.published,
  });
}

export function toUpdate(
  post: Post & {
    account: Account & { owner: AccountOwner | null };
    replyTarget: Post | null;
    media: Medium[];
    poll: (Poll & { options: PollOption[] }) | null;
    mentions: (Mention & { account: Account })[];
  },
  ctx: Context<unknown>,
  updated?: Date,
): Update {
  const object = toObject(post, ctx);
  return new Update({
    id: new URL(
      `#update-${(updated ?? object.updated)?.toString()}`,
      object.id!,
    ),
    actor: object.attributionId,
    tos: object.toIds,
    ccs: object.ccIds,
    object,
    published: object.updated,
  });
}

export function toAnnounce(
  post: Post & {
    account: Account;
    sharing: (Post & { account: Account }) | null;
  },
  ctx: Context<unknown>,
): Announce {
  if (post.sharing == null) throw new Error("The post is not shared");
  const handle = post.account.handle.replaceAll(/(?:^@)|(?:@[^@]+$)/g, "");
  return new vocab.Announce({
    id: new URL("#activity", post.iri),
    actor: new URL(post.account.iri),
    object: new URL(post.sharing.iri),
    published: toTemporalInstant(post.published),
    to:
      post.visibility === "public"
        ? vocab.PUBLIC_COLLECTION
        : ctx.getFollowersUri(handle),
    ccs: [
      new URL(post.sharing.account.iri),
      ...(post.visibility === "private"
        ? []
        : [
            post.visibility === "public"
              ? ctx.getFollowersUri(handle)
              : vocab.PUBLIC_COLLECTION,
            new URL(post.sharing.account.iri),
          ]),
    ],
  });
}
