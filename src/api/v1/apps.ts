import { zValidator } from "@hono/zod-validator";
import { encodeAscii85 } from "@std/encoding/ascii85";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { type Scope, applications, scopeEnum } from "../../schema";

const app = new Hono();

app.post(
  "/",
  zValidator(
    "form",
    z.object({
      client_name: z.string(),
      redirect_uris: z.string().url(),
      scopes: z
        .string()
        .transform((v) => v.split(/\s+/g))
        .nullable(),
      website: z.string().url().nullable(),
    }),
  ),
  async (c) => {
    const form = c.req.valid("form");
    const scopes: Scope[] = [];
    for (const scope of form.scopes ?? ["read"]) {
      if (!scopeEnum.enumValues.includes(scope as Scope)) {
        return c.json({ error: "Invalid scope" }, 422);
      }
      scopes.push(scope as Scope);
    }
    const clientId = encodeAscii85(crypto.getRandomValues(new Uint8Array(16)));
    const clientSecret = encodeAscii85(
      crypto.getRandomValues(new Uint8Array(32)),
    );
    const apps = await db
      .insert(applications)
      .values({
        id: crypto.randomUUID(),
        name: form.client_name,
        redirectUri: form.redirect_uris,
        scopes,
        website: form.website,
        clientId,
        clientSecret,
      })
      .returning();
    const app = apps[0];
    return c.json({
      id: app.id,
      name: app.name,
      website: app.website,
      redirect_uri: app.redirectUri,
      client_id: app.clientId,
      client_secret: app.clientSecret,
    });
  },
);

export default app;
