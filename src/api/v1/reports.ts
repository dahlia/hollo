import { Hono } from "hono";
import * as vocab from "@fedify/fedify/vocab";

import { z } from "zod";
import { db } from "../../db";
import { zValidator } from "@hono/zod-validator";

import federation from "../../federation";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { accounts, posts, reports, type Post, type Report } from "../../schema";
import { uuidv7 } from "uuidv7-js";
import { serializeReport } from "../../entities/report";
import { eq, inArray } from "drizzle-orm";

const app = new Hono<{ Variables: Variables }>();

const reportSchema = z.object({
  comment: z.string().trim().min(1).max(1000).optional(),
  account_id: z.string().uuid(),
  status_ids: z.array(z.string().uuid()).min(1).optional(),
  // discarded by defined by the Mastodon API:
  category: z.string().optional(),
  rule_ids: z.string().array().optional(),
  forward: z.boolean().optional(),
  forward_to_domains: z.array(z.string()).optional()
});

app.post(
  "/",
  tokenRequired,
  scopeRequired(["write:reports"]),
  zValidator(
    "json",
    reportSchema
  ),
  async (c) => {
    const accountOwner = c.get("token").accountOwner;
    if (accountOwner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }

    const data = c.req.valid("json");

    const targetAccount = await db.query.accounts.findFirst({
      where: eq(accounts.id, data.account_id),
      with: { owner: true, successor: true }
    });

    if (targetAccount == null) {
      return c.json({ error: "Record not found" }, 404);
    }

    let targetPosts: Post[] = [];
    if (data.status_ids != null && data.status_ids.length > 0) {
      targetPosts = await db.query.posts.findMany({
        where: inArray(posts.id, data.status_ids)
      })

      if (targetPosts.length != data.status_ids.length) {
        return c.json({ error: "Record not found" }, 404);
      }
    }

    let report: Report;
    try {
      const result = await db
        .insert(reports)
        .values({
          id: uuidv7(),
          accountId: accountOwner.id,
          targetAccountId: targetAccount.id,
          comment: data.comment,
          posts: data.status_ids ?? []
        })
        .returning();
      report = result[0];
    } catch (_) {
      return c.json({ error: "Record not found" }, 404);
    }

    const fedCtx = federation.createContext(c.req.raw, undefined);
    await fedCtx.sendActivity(
      // FIXME: This should really be an Instance actor:
      { handle: accountOwner.handle },
      {
        id: new URL(targetAccount.iri),
        inboxId: new URL(targetAccount.inboxUrl),
      },
      new vocab.Flag({
        id: new URL(`#reports/${report.id}`, accountOwner.account.iri),
        actor: new URL(accountOwner.account.iri),
        // For Mastodon compatibility, objects must include the target account IRI along with the posts:
        objects: targetPosts.map((post) => new URL(post.iri)).concat(new URL(targetAccount.iri)),
      }),
      {
        preferSharedInbox: true,
        excludeBaseUris: [new URL(c.req.url)],
      },
    );

    return c.json(serializeReport(report, targetAccount, c.req.url));
  },
);

export default app;
