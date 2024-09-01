import {
  Delete,
  PUBLIC_COLLECTION,
  Update,
  exportJwk,
  generateCryptoKeyPair,
} from "@fedify/fedify";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { AccountForm } from "./components/AccountForm";
import { AccountList } from "./components/AccountList";
import Layout from "./components/Layout";
import db from "./db";
import federation from "./federation";
import { loginRequired } from "./login";
import {
  type Account,
  type AccountOwner,
  type PostVisibility,
  accountOwners,
  accounts,
} from "./schema";
import { formatText } from "./text";

const app = new Hono();

app.use(loginRequired);

app.get("/", async (c) => {
  const owners = await db.query.accountOwners.findMany({
    with: { account: true },
  });
  return c.html(<AccountListPage accountOwners={owners} />);
});

export interface AccountListPageProps {
  accountOwners: (AccountOwner & { account: Account })[];
}

export const AccountListPage: FC<AccountListPageProps> = ({
  accountOwners,
}) => {
  return (
    <Layout title="Hollo: Accounts">
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
    </Layout>
  );
};

app.post("/", async (c) => {
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
  await db.transaction(async (tx) => {
    const account = await tx
      .insert(accounts)
      .values({
        id: crypto.randomUUID(),
        iri: fedCtx.getActorUri(username).href,
        type: "Person",
        name,
        handle: `@${username}@${fedCtx.url.host}`,
        bioHtml: (await formatText(tx, bio ?? "", fedCtx)).html,
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

app.get("/new", (c) => {
  return c.html(<NewAccountPage values={{ language: "en" }} />);
});

export interface NewAccountPageProps {
  values?: {
    username?: string;
    name?: string;
    bio?: string;
    protected?: boolean;
    language?: string;
    visibility?: PostVisibility;
  };
  errors?: {
    username?: string;
    name?: string;
    bio?: string;
  };
}

export const NewAccountPage: FC<NewAccountPageProps> = (props) => {
  return (
    <Layout title="Hollo: New account">
      <hgroup>
        <h1>Create a new account</h1>
        <p>You can create a new account by filling out the form below.</p>
      </hgroup>
      <AccountForm
        action="/accounts"
        values={props.values}
        errors={props.errors}
        submitLabel="Create a new account"
      />
    </Layout>
  );
};

app.get("/:id", async (c) => {
  const accountOwner = await db.query.accountOwners.findFirst({
    where: eq(accountOwners.id, c.req.param("id")),
    with: { account: true },
  });
  if (accountOwner == null) return c.notFound();
  return c.html(<AccountPage accountOwner={accountOwner} />);
});

export interface AccountPageProps extends NewAccountPageProps {
  accountOwner: AccountOwner & { account: Account };
}

export const AccountPage: FC<AccountPageProps> = (props) => {
  const username = props.accountOwner.account.handle.replace(/@[^@]+$/, "");
  return (
    <Layout title="Hollo: New account">
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
    </Layout>
  );
};

app.post("/:id", async (c) => {
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
  const accountId = c.req.param("id");
  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({
        name,
        bioHtml: (await formatText(tx, bio ?? "", fmtOpts)).html,
        protected: protected_,
      })
      .where(eq(accounts.id, accountId));
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

app.post("/:id/delete", async (c) => {
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
    await tx.delete(accounts).where(eq(accounts.id, c.req.param("id")));
  });
  return c.redirect("/accounts");
});

export default app;
