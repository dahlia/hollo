import type {
  Account,
  AccountOwner,
  Application,
  Mention,
  Post,
} from "../schema";
import { serializeAccount } from "./account";

export function serializePost(
  post: Post & {
    account: Account;
    application: Application | null;
    replyTarget: Post | null;
    sharing:
      | (Post & {
          account: Account;
          application: Application | null;
          replyTarget: Post | null;
          mentions: (Mention & {
            account: Account & { owner: AccountOwner | null };
          })[];
        })
      | null;
    mentions: (Mention & {
      account: Account & { owner: AccountOwner | null };
    })[];
  },
  // biome-ignore lint/suspicious/noExplicitAny: JSON
): Record<string, any> {
  return {
    id: post.id,
    created_at: post.published ?? post.updated,
    in_reply_to_id: post.replyTargetId,
    in_reply_to_account_id: post.replyTarget?.accountId,
    sensitive: post.sensitive,
    spoiler_text: post.summaryHtml ?? "",
    visibility: post.visibility,
    language: post.language,
    uri: post.iri,
    url: post.url,
    replies_count: post.repliesCount,
    reblogs_count: post.sharesCount,
    favourites_count: post.likesCount,
    favourited: false, // TODO
    reblogged: false, // TODO
    muted: false, // TODO
    bookmarked: false, // TODO
    content: post.contentHtml ?? "",
    reblog:
      post.sharing == null
        ? null
        : serializePost({ ...post.sharing, sharing: null }),
    application:
      post.application == null
        ? null
        : {
            name: post.application.name,
            website: post.application.website,
          },
    account: serializeAccount(post.account),
    media_attachments: [], // TODO
    mentions: post.mentions.map((mention) => ({
      id: mention.accountId,
      username: mention.account.handle.replaceAll(/(?:^@)|(?:@[^@]+$)/g, ""),
      url: mention.account.url,
      acct:
        mention.account.owner == null
          ? mention.account.handle.replace(/^@/, "")
          : mention.account.handle.replaceAll(/(?:^@)|(?:@[^@]+$)/g, ""),
    })),
    tags: Object.entries(post.tags).map(([name, url]) => ({ name, url })),
    emojis: [], // TODO
    card: null, // TODO
    poll: null, // TODO
  };
}
