import { Hono } from "hono";
import { serializeAccountOwner } from "../../entities/account";
import { type Variables, tokenRequired } from "../../oauth";

const app = new Hono<{ Variables: Variables }>();

app.get("/verify_credentials", tokenRequired, async (c) => {
  const accountOwner = c.get("token").accountOwner;
  if (accountOwner == null) {
    return c.json({ error: "This method requires an authenticated user" }, 422);
  }
  return c.json(serializeAccountOwner(accountOwner));
});

export default app;
