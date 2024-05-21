import {
  type Article,
  type Context,
  Create,
  LanguageString,
  Note,
  PUBLIC_COLLECTION,
} from "@fedify/fedify";
import * as vocab from "@fedify/fedify/vocab";
import type { Account, AccountOwner, Mention, Post } from "../schema";
import { toTemporalInstant } from "./date";

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
