import { exportJwk, generateCryptoKeyPair } from "@fedify/fedify";
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { AccountList } from "./components/AccountList";
import Layout from "./components/Layout";
import { NewAccountForm } from "./components/NewAccountForm";
import db from "./db";
import federation from "./federation";
import {
  accountOwners,
  accounts,
  type Account,
  type AccountOwner,
} from "./schema";
import { formatText } from "./text";

const app = new Hono();

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
        bioHtml: formatText(tx, bio ?? "").html,
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

export const NewAccountPage: FC = () => {
  return (
    <Layout title="Hollo: New account">
      <hgroup>
        <h1>Create a new account</h1>
        <p>You can create a new account by filling out the form below.</p>
      </hgroup>
      <NewAccountForm action="/accounts" />
    </Layout>
  );
};

export default app;
