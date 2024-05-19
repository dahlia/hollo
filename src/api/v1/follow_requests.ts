import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import db from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { follows } from "../../schema";

const app = new Hono<{ Variables: Variables }>();

app.get("/", tokenRequired, scopeRequired(["read:follows"]), async (c) => {
  const owner = c.get("token").accountOwner;
  if (owner == null) {
    return c.json({ error: "This method requires an authenticated user" }, 422);
  }
  const followers = await db.query.follows.findMany({
    where: and(eq(follows.followingId, owner.id), isNull(follows.approved)),
    with: { follower: { with: { owner: true } } },
  });
  return c.json(
    followers.map((f) =>
      f.follower.owner == null
        ? serializeAccount(f.follower, c.req.url)
        : serializeAccountOwner(
            { ...f.follower.owner, account: f.follower },
            c.req.url,
          ),
    ),
  );
});

export default app;
