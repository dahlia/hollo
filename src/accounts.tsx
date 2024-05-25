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
  if (username == null || username === "" || name == null || name === "") {
    return c.html(
      <NewAccountPage
        values={{ username, name, bio, protected: protected_ }}
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
        published: new Date(),
      })
      .returning();
    const keyPair = await generateCryptoKeyPair();
    await tx.insert(accountOwners).values({
      id: account[0].id,
      handle: username,
      privateKeyJwk: await exportJwk(keyPair.privateKey),
      publicKeyJwk: await exportJwk(keyPair.publicKey),
      bio: bio ?? "",
    });
  });
  const owners = await db.query.accountOwners.findMany({
    with: { account: true },
  });
  return c.html(<AccountListPage accountOwners={owners} />);
});

app.get("/new", (c) => {
  return c.html(<NewAccountPage />);
});

export interface NewAccountPageProps {
  values?: {
    username?: string;
    name?: string;
    bio?: string;
    protected?: boolean;
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
  if (name == null || name === "") {
    return c.html(
      <AccountPage
        accountOwner={accountOwner}
        values={{ name, bio, protected: protected_ }}
        errors={{
          name: name == null || name === "" ? "Display name is required." : "",
        }}
      />,
      400,
    );
  }
  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({
        name,
        bioHtml: (await formatText(tx, bio ?? "", c.req)).html,
        protected: protected_,
      })
      .where(eq(accounts.id, c.req.param("id")));
    await tx
      .update(accountOwners)
      .set({ bio })
      .where(eq(accountOwners.id, c.req.param("id")));
  });
  const fedCtx = federation.createContext(c.req.raw, undefined);
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
