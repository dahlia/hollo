import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { AccountList } from "../components/AccountList";
import Layout from "../components/Layout";
import db from "../db";
import type { Account, AccountOwner } from "../schema";

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
    </Layout>
  );
};

export default app;
