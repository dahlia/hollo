import xss from "xss";
import type { Account, AccountOwner } from "../schema";

export function serializeAccount(account: Account) {
  const username = account.handle.replaceAll(/(?:^@)|(?:@[^@]+$)/g, "");
  return {
    id: account.id,
    username,
    acct: username,
    display_name: account.name,
    locked: account.protected,
    bot: account.type === "Application" || account.type === "Service",
    created_at: account.published ?? account.updated,
    note: xss(account.bioHtml ?? ""),
    url: account.url ?? account.iri,
    avatar: account.avatarUrl,
    avatar_static: account.avatarUrl,
    header: account.coverUrl,
    header_static: account.coverUrl,
    followers_count: account.followers,
    following_count: account.following,
    statuses_count: account.posts,
    last_status_at: null,
    emojis: [],
    fields: [],
  };
}

export function serializeAccountOwner(
  accountOwner: AccountOwner & { account: Account },
) {
  return {
    ...serializeAccount(accountOwner.account),
    source: accountOwner && {
      note: accountOwner.bio,
      privacy: "public",
      sensitive: false,
      language: "en",
      follow_requests_count: 0,
      fields: [],
    },
  };
}
