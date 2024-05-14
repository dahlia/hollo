import { Hono } from "hono";
import xss from "xss";
import { type Variables, tokenRequired } from "../../oauth";

const app = new Hono<{ Variables: Variables }>();

app.get("/verify_credentials", tokenRequired, async (c) => {
  const accountOwner = c.get("token").accountOwner;
  if (accountOwner == null) {
    return c.json({ error: "This method requires an authenticated user" }, 422);
  }
  const username = accountOwner.account.handle.replaceAll(
    /(?:^@)|(?:@[^@]+$)/g,
    "",
  );
  const account = accountOwner.account;
  return c.json({
    id: accountOwner.id,
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
    source: {
      note: accountOwner.bio,
      privacy: "public",
      sensitive: false,
      language: "en",
      follow_requests_count: 0,
      fields: [],
    },
    emojis: [],
    fields: [],
  });
});

export default app;
