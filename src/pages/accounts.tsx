import {
  Delete,
  Move,
  type Object,
  PUBLIC_COLLECTION,
  type Recipient,
  Update,
  exportJwk,
  generateCryptoKeyPair,
  getActorHandle,
  isActor,
} from "@fedify/fedify";
import { getLogger } from "@logtape/logtape";
import { and, eq, sql } from "drizzle-orm";
import { uniq } from "es-toolkit";
import { Hono } from "hono";
import { AccountForm } from "../components/AccountForm.tsx";
import { AccountList } from "../components/AccountList.tsx";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import {
  NewAccountPage,
  type NewAccountPageProps,
} from "../components/NewAccountPage.tsx";
import db from "../db.ts";
import federation from "../federation";
import {
  REMOTE_ACTOR_FETCH_POSTS,
  followAccount,
  persistAccount,
  persistAccountPosts,
  unfollowAccount,
} from "../federation/account.ts";
import { loginRequired } from "../login.ts";
import {
  type Account,
  type AccountOwner,
  type PostVisibility,
  accountOwners,
  accounts as accountsTable,
  follows,
  instances,
} from "../schema.ts";
import { extractCustomEmojis, formatText } from "../text.ts";

const HOLLO_OFFICIAL_ACCOUNT = "@hollo@hollo.social";

const logger = getLogger(["hollo", "pages", "accounts"]);

const accounts = new Hono();

accounts.use(loginRequired);

accounts.get("/", async (c) => {
  const owners = await db.query.accountOwners.findMany({
    with: { account: true },
  });
  return c.html(<AccountListPage accountOwners={owners} />);
});

accounts.post("/", async (c) => {
  const form = await c.req.formData();
  const username = form.get("username")?.toString()?.trim();
  const name = form.get("name")?.toString()?.trim();
  const bio = form.get("bio")?.toString()?.trim();
  const protected_ = form.get("protected") != null;
  const language = form.get("language")?.toString()?.trim();
  const visibility = form
    .get("visibility")
    ?.toString()
    ?.trim() as PostVisibility;
  const news = form.get("news") != null;
  if (username == null || username === "" || name == null || name === "") {
    return c.html(
      <NewAccountPage
        values={{
          username,
          name,
          bio,
          protected: protected_,
          language,
          visibility,
          news,
        }}
        errors={{
          username:
            username == null || username === ""
              ? "Username is required."
              : undefined,
          name:
            name == null || name === ""
              ? "Display name is required."
              : undefined,
        }}
        officialAccount={HOLLO_OFFICIAL_ACCOUNT}
      />,
      400,
    );
  }
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const bioResult = await formatText(db, bio ?? "", fedCtx);
  const nameEmojis = await extractCustomEmojis(db, name);
  const emojis = { ...nameEmojis, ...bioResult.emojis };
  const [account, owner] = await db.transaction(async (tx) => {
    await tx
      .insert(instances)
      .values({
        host: fedCtx.host,
        software: "hollo",
        softwareVersion: null,
      })
      .onConflictDoNothing();
    const account = await tx
      .insert(accountsTable)
      .values({
        id: crypto.randomUUID(),
        iri: fedCtx.getActorUri(username).href,
        instanceHost: fedCtx.host,
        type: "Person",
        name,
        emojis: sql`${emojis}::jsonb`,
        handle: `@${username}@${fedCtx.host}`,
        bioHtml: bioResult.html,
        url: fedCtx.getActorUri(username).href,
        protected: protected_,
        inboxUrl: fedCtx.getInboxUri(username).href,
        followersUrl: fedCtx.getFollowersUri(username).href,
        sharedInboxUrl: fedCtx.getInboxUri().href,
        featuredUrl: fedCtx.getFeaturedUri(username).href,
        published: new Date(),
      })
      .returning();
    const rsaKeyPair = await generateCryptoKeyPair("RSASSA-PKCS1-v1_5");
    const ed25519KeyPair = await generateCryptoKeyPair("Ed25519");
    const owner = await tx
      .insert(accountOwners)
      .values({
        id: account[0].id,
        handle: username,
        rsaPrivateKeyJwk: await exportJwk(rsaKeyPair.privateKey),
        rsaPublicKeyJwk: await exportJwk(rsaKeyPair.publicKey),
        ed25519PrivateKeyJwk: await exportJwk(ed25519KeyPair.privateKey),
        ed25519PublicKeyJwk: await exportJwk(ed25519KeyPair.publicKey),
        bio: bio ?? "",
        language: language ?? "en",
        visibility: visibility ?? "public",
      })
      .returning();
    return [account[0], owner[0]];
  });
  const owners = await db.query.accountOwners.findMany({
    with: { account: true },
  });
  if (news) {
    const actor = await fedCtx.lookupObject(HOLLO_OFFICIAL_ACCOUNT);
    if (isActor(actor)) {
      await db.transaction(async (tx) => {
        const following = await persistAccount(tx, actor, fedCtx);
        if (following != null) {
          await followAccount(tx, fedCtx, { ...account, owner }, following);
          await persistAccountPosts(tx, account, REMOTE_ACTOR_FETCH_POSTS, {
            ...fedCtx,
            suppressError: true,
          });
        }
      });
    }
  }
  return c.html(<AccountListPage accountOwners={owners} />);
});

interface AccountListPageProps {
  accountOwners: (AccountOwner & { account: Account })[];
}

function AccountListPage({ accountOwners }: AccountListPageProps) {
  return (
    <DashboardLayout title="Hollo: Accounts" selectedMenu="accounts">
      <hgroup>
        <h1>Accounts</h1>
        <p>
          You can have more than one account. Each account have its own handle,
          settings, and data, and you can switch between them at any time.
        </p>
      </hgroup>
      <AccountList accountOwners={accountOwners} />
      <a role="button" href="/accounts/new">
        Create a new account
      </a>
    </DashboardLayout>
  );
}

accounts.get("/new", (c) => {
  return c.html(
    <NewAccountPage
      values={{ language: "en", news: true }}
      officialAccount={HOLLO_OFFICIAL_ACCOUNT}
    />,
  );
});

accounts.get("/:id", async (c) => {
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, c.req.param("id")),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  const news = await db.query.follows.findFirst({
    where: and(
      eq(
        follows.followingId,
        db
          .select({ id: accountsTable.id })
          .from(accountsTable)
          .where(eq(accountsTable.handle, HOLLO_OFFICIAL_ACCOUNT)),
      ),
      eq(follows.followerId, accountOwner.id),
    ),
  });
  return c.html(
    <AccountPage
      accountOwner={accountOwner}
      news={news != null}
      officialAccount={HOLLO_OFFICIAL_ACCOUNT}
    />,
  );
});

interface AccountPageProps extends NewAccountPageProps {
  accountOwner: AccountOwner & { account: Account };
  news: boolean;
}

function AccountPage(props: AccountPageProps) {
  const username = `@${props.accountOwner.handle}`;
  return (
    <DashboardLayout title={`Hollo: Edit ${username}`} selectedMenu="accounts">
      <hgroup>
        <h1>Edit {username}</h1>
        <p>You can edit your account by filling out the form below.</p>
      </hgroup>
      <AccountForm
        action={`/accounts/${props.accountOwner.account.id}`}
        readOnly={{ username: true }}
        values={{
          username: username.replace(/^@/, ""),
          name: props.values?.name ?? props.accountOwner.account.name,
          bio: props.values?.bio ?? props.accountOwner.bio ?? undefined,
          protected:
            props.values?.protected ?? props.accountOwner.account.protected,
          language: props.values?.language ?? props.accountOwner.language,
          visibility: props.values?.visibility ?? props.accountOwner.visibility,
          news: props.values?.news ?? props.news,
        }}
        errors={props.errors}
        officialAccount={HOLLO_OFFICIAL_ACCOUNT}
        submitLabel="Save changes"
      />
    </DashboardLayout>
  );
}

accounts.post("/:id", async (c) => {
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, c.req.param("id")),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  const form = await c.req.formData();
  const name = form.get("name")?.toString()?.trim();
  const bio = form.get("bio")?.toString()?.trim();
  const protected_ = form.get("protected") != null;
  const language = form.get("language")?.toString()?.trim();
  const visibility = form
    .get("visibility")
    ?.toString()
    ?.trim() as PostVisibility;
  const news = form.get("news") != null;
  if (name == null || name === "") {
    return c.html(
      <AccountPage
        accountOwner={accountOwner}
        news={news}
        values={{
          name,
          bio,
          protected: protected_,
          language,
          visibility,
          news,
        }}
        errors={{
          name: name == null || name === "" ? "Display name is required." : "",
        }}
        officialAccount={HOLLO_OFFICIAL_ACCOUNT}
      />,
      400,
    );
  }
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const fmtOpts = {
    url: fedCtx.url,
    contextLoader: fedCtx.contextLoader,
    documentLoader: await fedCtx.getDocumentLoader({
      username: accountOwner.handle,
    }),
  };
  const bioResult = await formatText(db, bio ?? "", fmtOpts);
  const nameEmojis = await extractCustomEmojis(db, name);
  const emojis = { ...nameEmojis, ...bioResult.emojis };
  const accountId = c.req.param("id");
  await db.transaction(async (tx) => {
    await tx
      .update(accountsTable)
      .set({
        name,
        emojis: sql`${emojis}::jsonb`,
        bioHtml: bioResult.html,
        protected: protected_,
      })
      .where(eq(accountsTable.id, accountId));
    await tx
      .update(accountOwners)
      .set({ bio, language, visibility })
      .where(eq(accountOwners.id, accountId));
  });
  await fedCtx.sendActivity(
    { handle: accountOwner.handle },
    "followers",
    new Update({
      actor: fedCtx.getActorUri(accountOwner.handle),
      object: await fedCtx.getActor(accountOwner.handle),
    }),
    { preferSharedInbox: true, excludeBaseUris: [fedCtx.url] },
  );
  const account = { ...accountOwner.account, owner: accountOwner };
  const newsActor = await fedCtx.lookupObject(HOLLO_OFFICIAL_ACCOUNT);
  if (isActor(newsActor)) {
    const newsAccount = await persistAccount(db, newsActor, fedCtx);
    if (newsAccount != null) {
      if (news) {
        await followAccount(db, fedCtx, account, newsAccount);
        await persistAccountPosts(db, newsAccount, REMOTE_ACTOR_FETCH_POSTS, {
          ...fedCtx,
          suppressError: true,
        });
      } else await unfollowAccount(db, fedCtx, account, newsAccount);
    }
  }
  return c.redirect("/accounts");
});

accounts.post("/:id/delete", async (c) => {
  const accountId = c.req.param("id");
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, accountId),
  });
  if (accountOwner == null) return c.notFound();
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const activity = new Delete({
    actor: fedCtx.getActorUri(accountOwner.handle),
    to: PUBLIC_COLLECTION,
    object: await fedCtx.getActor(accountOwner.handle),
  });
  await fedCtx.sendActivity(
    { handle: accountOwner.handle },
    "followers",
    activity,
    { preferSharedInbox: true, excludeBaseUris: [fedCtx.url] },
  );
  const following = await db.query.follows.findMany({
    with: { following: true },
    where: eq(follows.followerId, accountId),
  });
  await fedCtx.sendActivity(
    { handle: accountOwner.handle },
    following.map(
      (f) =>
        ({
          id: new URL(f.following.iri),
          inboxId: new URL(f.following.inboxUrl),
          endpoints:
            f.following.sharedInboxUrl == null
              ? null
              : { sharedInbox: new URL(f.following.sharedInboxUrl) },
        }) satisfies Recipient,
    ),
    activity,
    { preferSharedInbox: true, excludeBaseUris: [fedCtx.url] },
  );
  await db.transaction(async (tx) => {
    await tx.delete(accountOwners).where(eq(accountOwners.id, accountId));
    await tx
      .delete(accountsTable)
      .where(eq(accountsTable.id, c.req.param("id")));
  });
  return c.redirect("/accounts");
});

accounts.get("/:id/migrate", async (c) => {
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, c.req.param("id")),
    with: { account: { with: { successor: true } } },
  });
  if (accountOwner == null) return c.notFound();
  const username = `@${accountOwner.handle}`;
  const aliases = await Promise.all(
    uniq(accountOwner.account.aliases).map(async (alias) => ({
      iri: alias,
      handle: await getActorHandle(new URL(alias)),
    })),
  );
  const error = c.req.query("error");
  const handle = c.req.query("handle");
  return c.html(
    <DashboardLayout
      title={`Hollo: Migrate ${username} from/to`}
      selectedMenu="accounts"
    >
      <hgroup>
        <h1>Migrate {username} from/to</h1>
        <p>
          You can migrate your account from one instance to another by filling
          out the form below.
        </p>
      </hgroup>

      <article>
        <header>
          <hgroup>
            <h2>Aliases</h2>
            <p>
              Configure aliases for your account. This purposes to migrate your
              old account to <tt>{accountOwner.account.handle}</tt>.
            </p>
          </hgroup>
        </header>
        {aliases && (
          <ul>
            {aliases.map(({ iri, handle }) => (
              <li>
                <tt>{handle}</tt> (<tt>{iri}</tt>)
              </li>
            ))}
          </ul>
        )}
        <form method="post" action="migrate/from">
          <fieldset role="group">
            <input
              type="text"
              name="handle"
              placeholder="@hollo@hollo.social"
              required
              {...(error === "from"
                ? { "aria-invalid": "true", value: handle }
                : {})}
            />
            <button type="submit">Add</button>
          </fieldset>
          <small>
            A fediverse handle (e.g., <tt>@hollo@hollo.social</tt>) or an actor
            URI (e.g., <tt>https://hollo.social/@hollo</tt>) is allowed.
          </small>
        </form>
      </article>

      <article>
        <header>
          <hgroup>
            <h2>Migrating {username} to new account</h2>
            <p>
              Migrate <tt>{accountOwner.account.handle}</tt> to your new
              account. Note that this action is <strong>irreversible</strong>.
            </p>
          </hgroup>
        </header>
        <form method="post" action="migrate/to">
          <fieldset role="group">
            <input
              type="text"
              name="handle"
              placeholder={HOLLO_OFFICIAL_ACCOUNT}
              required
              {...(error === "to"
                ? { "aria-invalid": "true", value: handle }
                : { value: accountOwner.account.successor?.handle })}
              {...(accountOwner.account.successorId == null
                ? {}
                : { disabled: true })}
            />
            {accountOwner.account.successorId == null ? (
              <button type="submit">Migrate</button>
            ) : (
              <button type="submit" disabled>
                Migrated
              </button>
            )}
          </fieldset>
          <small>
            A fediverse handle (e.g., <tt>@hollo@hollo.social</tt>) or an actor
            URI (e.g., <tt>https://hollo.social/@hollo</tt>) is allowed.{" "}
            <strong>
              The new account must have an alias to this old account.
            </strong>
          </small>
        </form>
      </article>
    </DashboardLayout>,
  );
});

accounts.post("/:id/migrate/from", async (c) => {
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, c.req.param("id")),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const form = await c.req.formData();
  const handle = form.get("handle");
  if (typeof handle !== "string") {
    return c.redirect(`/accounts/${accountOwner.id}/migrate?error=from`);
  }
  const errorPage = `/accounts/${accountOwner.id}/migrate?error=from&handle=${encodeURIComponent(handle)}`;
  const documentLoader = await fedCtx.getDocumentLoader({
    username: accountOwner.handle,
  });
  let actor: Object | null = null;
  try {
    actor = await fedCtx.lookupObject(handle, { documentLoader });
  } catch {
    return c.redirect(errorPage);
  }
  if (!isActor(actor) || actor.id == null) {
    return c.redirect(errorPage);
  }
  const aliases = uniq([
    ...accountOwner.account.aliases,
    actor.id.href,
    ...actor.aliasIds.map((u) => u.href),
  ]);
  await db
    .update(accountsTable)
    .set({ aliases })
    .where(eq(accountsTable.id, accountOwner.id));
  return c.redirect(`/accounts/${accountOwner.id}/migrate`);
});

accounts.post("/:id/migrate/to", async (c) => {
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, c.req.param("id")),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const form = await c.req.formData();
  const handle = form.get("handle");
  if (typeof handle !== "string") {
    logger.error("The handle is not a string: {handle}", { handle });
    return c.redirect(`/accounts/${accountOwner.id}/migrate?error=to`);
  }
  const errorPage = `/accounts/${accountOwner.id}/migrate?error=to&handle=${encodeURIComponent(handle)}`;
  const documentLoader = await fedCtx.getDocumentLoader({
    username: accountOwner.handle,
  });
  let target: Object | null = null;
  try {
    target = await fedCtx.lookupObject(handle, { documentLoader });
  } catch (error) {
    logger.error("Failed to lookup actor: {error}", { error });
    return c.redirect(errorPage);
  }
  if (
    !isActor(target) ||
    target.id == null ||
    !target.aliasIds.some((a) => a.href === accountOwner.account.iri)
  ) {
    logger.error(
      "The looked up object is either not an actor or does not have an alias to " +
        "the account: {object}",
      { object: target },
    );
    return c.redirect(errorPage);
  }
  const targetAccount = await persistAccount(db, target);
  if (targetAccount == null) {
    logger.error("Failed to persist the account: {actor}", { actor: target });
    return c.redirect(errorPage);
  }
  await db
    .update(accountsTable)
    .set({ successorId: targetAccount.id })
    .where(eq(accountsTable.id, accountOwner.id));
  await fedCtx.sendActivity(
    { username: accountOwner.handle },
    "followers",
    new Move({
      id: new URL("#move", accountOwner.account.iri),
      actor: new URL(accountOwner.account.iri),
      object: new URL(accountOwner.account.iri),
      target: target.id,
    }),
    { preferSharedInbox: true, excludeBaseUris: [fedCtx.url] },
  );
  return c.redirect(`/accounts/${accountOwner.id}/migrate`);
});

export default accounts;
