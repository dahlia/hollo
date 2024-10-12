import { exportJwk, generateCryptoKeyPair } from "@fedify/fedify";
import { sql } from "drizzle-orm";
import { Hono } from "hono";
import { AccountList } from "../../components/AccountList.tsx";
import { NewAccountPage } from "../../components/AccountNewPage.tsx";
import { DashboardLayout } from "../../components/DashboardLayout.tsx";
import db from "../../db.ts";
import federation from "../../federation";
import { loginRequired } from "../../login.ts";
import {
  type Account,
  type AccountOwner,
  type PostVisibility,
  accountOwners,
  accounts as accountsTable,
} from "../../schema.ts";
import { extractCustomEmojis, formatText } from "../../text.ts";
import accountsId from "./accountsId";

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

accounts.route("/:id", accountsId);

export default accounts;
