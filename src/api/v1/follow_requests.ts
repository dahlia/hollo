import { Accept, Follow } from "@fedify/fedify";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import db from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { federation } from "../../federation";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { accounts, follows } from "../../schema";

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

app.post(
  "/:account_id/authorize",
  tokenRequired,
  scopeRequired(["write:follows"]),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const followerId = c.req.param("account_id");
    const follower = await db.query.accounts.findFirst({
      where: eq(accounts.id, followerId),
      with: { owner: true },
    });
    if (follower == null) return c.json({ error: "Record not found" }, 404);
    const result = await db
      .update(follows)
      .set({ approved: new Date() })
      .where(
        and(
          eq(follows.followingId, owner.id),
          eq(follows.followerId, followerId),
          isNull(follows.approved),
        ),
      )
      .returning({ iri: follows.iri });
    if (result.length < 1) return c.json({ error: "Record not found" }, 404);
    if (follower.owner == null) {
      const fedCtx = federation.createContext(c.req.raw, undefined);
      await fedCtx.sendActivity(
        owner,
        { id: new URL(follower.iri), inboxId: new URL(follower.inboxUrl) },
        new Accept({
          actor: new URL(owner.account.iri),
          object: new Follow({
            id: new URL(result[0].iri),
            actor: new URL(follower.iri),
            object: new URL(owner.account.iri),
          }),
        }),
      );
    }
    const follow = await db.query.follows.findFirst({
      where: and(
        eq(follows.followingId, followerId),
        eq(follows.followerId, owner.id),
      ),
    });
    return c.json({
      id: followerId,
      following: follow?.approved != null,
      showing_reblogs: follow?.shares ?? false,
      notifying: follow?.notify ?? false,
      languages: follow?.languages ?? null,
      followed_by: true,
      blocking: false, // TODO
      blocked_by: false, // TODO
      muting: false, // TODO
      muting_notifications: false, // TODO
      requested: follow != null && follow.approved == null,
      requested_by: false,
      domain_blocking: false, // TODO
      endorsed: false, // TODO
      note: "", // TODO
    });
  },
);

export default app;
