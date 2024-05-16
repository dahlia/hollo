import { PutObjectCommand } from "@aws-sdk/client-s3";
import { zValidator } from "@hono/zod-validator";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import {
  serializeAccount,
  serializeAccountOwner,
} from "../../entities/account";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { S3_BUCKET, S3_URL_BASE, s3, urlBase } from "../../s3";
import { accountOwners, accounts } from "../../schema";
import { formatText } from "../../text";

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

app.patch(
  "/update_credentials",
  tokenRequired,
  scopeRequired(["write:accounts"]),
  zValidator(
    "form",
    z.object({
      display_name: z.string().optional(),
      note: z.string().optional(),
      avatar: z.any().optional(),
      header: z.any().optional(),
      locked: z.enum(["true", "false"]).optional(),
      bot: z.enum(["true", "false"]).optional(),
      discoverable: z.enum(["true", "false"]).optional(),
      hide_collections: z.enum(["true", "false"]).optional(),
      indexable: z.enum(["true", "false"]).optional(),
      "source[privacy]": z.enum(["public", "unlisted", "private"]).optional(),
      "source[sensitive]": z.enum(["true", "false"]).optional(),
      "source[language]": z.string().optional(),
      "fields_attributes[0][name]": z.string().optional(),
      "fields_attributes[0][value]": z.string().optional(),
      "fields_attributes[1][name]": z.string().optional(),
      "fields_attributes[1][value]": z.string().optional(),
      "fields_attributes[2][name]": z.string().optional(),
      "fields_attributes[2][value]": z.string().optional(),
      "fields_attributes[3][name]": z.string().optional(),
      "fields_attributes[3][value]": z.string().optional(),
    }),
  ),
  async (c) => {
    const owner = c.get("token").accountOwner;
    if (owner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    const account = owner.account;
    const form = c.req.valid("form");
    let avatarUrl = undefined;
    if (form.avatar instanceof File) {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: `avatars/${account.id}`,
          Body: new Uint8Array(await form.avatar.arrayBuffer()),
        }),
      );
      avatarUrl = new URL(`avatars/${account.id}`, S3_URL_BASE).href;
    }
    let coverUrl = undefined;
    if (form.header instanceof File) {
      await s3.send(
        new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: `covers/${account.id}`,
          Body: new Uint8Array(await form.header.arrayBuffer()),
        }),
      );
      coverUrl = new URL(`covers/${account.id}`, S3_URL_BASE).href;
    }
    const updatedAccounts = await db
      .update(accounts)
      .set({
        name: form.display_name ?? account.name,
        bioHtml:
          form.note == null
            ? account.bioHtml
            : (await formatText(db, form.note)).html,
        avatarUrl,
        coverUrl,
        protected:
          form.locked == null ? account.protected : form.locked === "true",
        type:
          form.bot == null
            ? account.type
            : form.bot === "true"
              ? "Service"
              : "Person",
      })
      .where(eq(accounts.id, owner.id))
      .returning();
    const updatedOwners = await db
      .update(accountOwners)
      .set({
        bio: form.note ?? owner.bio,
      })
      .where(eq(accountOwners.id, owner.id))
      .returning();
    return c.json(
      serializeAccountOwner({
        ...updatedOwners[0],
        account: updatedAccounts[0],
      }),
    );
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
