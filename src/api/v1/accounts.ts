import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { accounts } from "../../schema";

const app = new Hono<{ Variables: Variables }>();

app.get(
  "/verify_credentials",
  tokenRequired,
  scopeRequired(["read:accounts"]),
  async (c) => {
    const accountOwner = c.get("token").accountOwner;
    if (accountOwner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    return c.json(serializeAccountOwner(accountOwner));
  },
);

app.get("/:id", async (c) => {
  const id = c.req.param("id");
  const account = await db.query.accounts.findFirst({
    where: eq(accounts.id, id),
    with: { owner: true },
  });
  if (account == null) return c.json({ error: "Record not found" }, 404);
  if (account.owner != null) {
    return c.json(serializeAccountOwner({ ...account.owner, account }));
  }
  return c.json(serializeAccount(account));
});

export default app;
