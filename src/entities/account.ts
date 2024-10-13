import xss from "xss";
import type { Account, AccountOwner } from "../schema";
import { serializeEmojis } from "./emoji";

export function serializeAccount(account: Account, baseUrl: URL | string) {
  // biome-ignore lint/style/noParameterAssign: make sure the URL is a URL
  baseUrl = new URL(baseUrl);
  const username = account.handle.replaceAll(/(?:^@)|(?:@[^@]+$)/g, "");
  const defaultAvatarUrl = new URL(
    "/image/avatars/original/missing.png",
    baseUrl,
  ).href;
  const defaultHeaderUrl = new URL(
    "/image/headers/original/missing.png",
    baseUrl,
  ).href;
  let acct = account.handle.replace(/^@/, "");
  if (acct.endsWith(`@${baseUrl.host}`)) {
    acct = acct.replace(/@[^@]+$/, "");
  }
  return {
    id: account.id,
    username,
    acct,
    display_name: account.name,
    locked: account.protected,
    bot: account.type === "Application" || account.type === "Service",
    created_at: account.published ?? account.updated,
    note: xss(account.bioHtml ?? ""),
    url: account.url ?? account.iri,
    avatar: account.avatarUrl ?? defaultAvatarUrl,
    avatar_static: account.avatarUrl ?? defaultAvatarUrl,
    header: account.coverUrl ?? defaultHeaderUrl,
    header_static: account.coverUrl ?? defaultHeaderUrl,
    followers_count: account.followersCount,
    following_count: account.followingCount,
    statuses_count: account.postsCount,
    last_status_at: null,
    emojis: serializeEmojis(account.emojis),
    fields: Object.entries(account.fieldHtmls).map(([name, value]) => ({
      name,
      value,
      verified_at: null,
    })),
  };
}

export function serializeAccountOwner(
  accountOwner: AccountOwner & { account: Account },
  baseUrl: URL | string,
) {
  return {
    ...serializeAccount(accountOwner.account, baseUrl),
    source: accountOwner && {
      note: accountOwner.bio,
      privacy: accountOwner.visibility,
      sensitive: accountOwner.account.sensitive,
      language: accountOwner.language,
      follow_requests_count: 0,
      fields: Object.entries(accountOwner.fields).map(([name, value]) => ({
        name,
        value,
        verified_at: null,
      })),
    },
  };
}
