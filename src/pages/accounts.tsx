import {
  Delete,
  PUBLIC_COLLECTION,
  Update,
  exportJwk,
  generateCryptoKeyPair,
  getActorHandle,
  isActor,
} from "@fedify/fedify";
import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { AccountForm } from "../components/AccountForm.tsx";
import { AccountList } from "../components/AccountList.tsx";
import {
  NewAccountPage,
  type NewAccountPageProps,
} from "../components/AccountNewPage.tsx";
import { DashboardLayout } from "../components/DashboardLayout.tsx";
import db from "../db.ts";
import federation from "../federation";
import { loginRequired } from "../login.ts";
import {
  type Account,
  type AccountOwner,
  type PostVisibility,
  accountOwners,
  accounts as accountsTable,
} from "../schema.ts";
import { extractCustomEmojis, formatText } from "../text.ts";

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
      />,
      400,
    );
  }
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const bioResult = await formatText(db, bio ?? "", fedCtx);
  const nameEmojis = await extractCustomEmojis(db, name);
  const emojis = { ...nameEmojis, ...bioResult.emojis };
  await db.transaction(async (tx) => {
    const account = await tx
      .insert(accountsTable)
      .values({
        id: crypto.randomUUID(),
        iri: fedCtx.getActorUri(username).href,
        type: "Person",
        name,
        emojis: sql`${emojis}::jsonb`,
        handle: `@${username}@${fedCtx.url.host}`,
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
    await tx.insert(accountOwners).values({
      id: account[0].id,
      handle: username,
      rsaPrivateKeyJwk: await exportJwk(rsaKeyPair.privateKey),
      rsaPublicKeyJwk: await exportJwk(rsaKeyPair.publicKey),
      ed25519PrivateKeyJwk: await exportJwk(ed25519KeyPair.privateKey),
      ed25519PublicKeyJwk: await exportJwk(ed25519KeyPair.publicKey),
      bio: bio ?? "",
      language: language ?? "en",
      visibility: visibility ?? "public",
    });
  });
  const owners = await db.query.accountOwners.findMany({
    with: { account: true },
  });
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
  return c.html(<NewAccountPage values={{ language: "en" }} />);
});

accounts.get("/:id", async (c) => {
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, c.req.param("id")),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  return c.html(<AccountPage accountOwner={accountOwner} />);
});

interface AccountPageProps extends NewAccountPageProps {
  accountOwner: AccountOwner & { account: Account };
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
        }}
        errors={props.errors}
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
  if (name == null || name === "") {
    return c.html(
      <AccountPage
        accountOwner={accountOwner}
        values={{
          name,
          bio,
          protected: protected_,
          language,
          visibility,
        }}
        errors={{
          name: name == null || name === "" ? "Display name is required." : "",
        }}
      />,
      400,
    );
  }
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const fmtOpts = {
    url: fedCtx.url,
    contextLoader: fedCtx.contextLoader,
    documentLoader: await fedCtx.getDocumentLoader(accountOwner),
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
    { preferSharedInbox: true },
  );
  return c.redirect("/accounts");
});

accounts.post("/:id/delete", async (c) => {
  const accountId = c.req.param("id");
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, accountId),
  });
  if (accountOwner == null) return c.notFound();
  const fedCtx = federation.createContext(c.req.raw, undefined);
  await fedCtx.sendActivity(
    { handle: accountOwner.handle },
    "followers",
    new Delete({
      actor: fedCtx.getActorUri(accountOwner.handle),
      to: PUBLIC_COLLECTION,
      object: await fedCtx.getActor(accountOwner.handle),
    }),
    { preferSharedInbox: true },
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
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  const username = `@${accountOwner.handle}`;
  const aliases = await Promise.all(
    accountOwner.account.aliases.map(async (alias) => ({
      iri: alias,
      handle: await getActorHandle(new URL(alias)),
    })),
  );
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
              old account to {accountOwner.account.handle}.
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
        <form method="post">
          <fieldset role="group">
            <input
              type="text"
              name="handle"
              placeholder="@hollo@hollo.social"
              required
            />
            <button type="submit">Add</button>
          </fieldset>
          <small>
            A fediverse handle (e.g., <tt>@hollo@hollo.social</tt>) or an actor
            URI (e.g., <tt>https://hollo.social/@hollo</tt>) is allowed.
          </small>
        </form>
      </article>
    </DashboardLayout>,
  );
});

accounts.post("/:id/migrate", async (c) => {
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, c.req.param("id")),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const form = await c.req.formData();
  const handle = form.get("handle");
  if (typeof handle !== "string") return c.redirect(c.req.url);
  const documentLoader = await fedCtx.getDocumentLoader({
    username: accountOwner.handle,
  });
  const actor = await fedCtx.lookupObject(handle, { documentLoader });
  if (isActor(actor) && actor.id != null) {
    const aliases = [
      ...accountOwner.account.aliases,
      actor.id.href,
      ...actor.aliasIds.map((u) => u.href),
    ];
    await db
      .update(accountsTable)
      .set({ aliases })
      .where(eq(accountsTable.id, accountOwner.id));
  }
  return c.redirect(c.req.url);
});

export default accounts;
