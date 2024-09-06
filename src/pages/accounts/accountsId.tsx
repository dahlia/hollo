import { Delete, PUBLIC_COLLECTION, Update } from "@fedify/fedify";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { AccountForm } from "../../components/AccountForm.tsx";
import type { NewAccountPageProps } from "../../components/AccountNewPage.tsx";
import Layout from "../../components/Layout.tsx";
import db from "../../db.ts";
import federation from "../../federation";
import {
  type Account,
  type AccountOwner,
  type PostVisibility,
  accountOwners,
  accounts,
} from "../../schema.ts";
import { formatText } from "../../text.ts";

const accountsId = new Hono();

accountsId.get<"/:id">(async (c) => {
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

const AccountPage: FC<AccountPageProps> = (props) => {
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

accountsId.post<"/:id">(async (c) => {
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

accountsId.post<"/delete" | "/:id">("/delete", async (c) => {
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

export default accountsId;
