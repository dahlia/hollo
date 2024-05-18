import { encodeBase64Url } from "@std/encoding/base64url";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { type Scope, applications, scopeEnum } from "../../schema";

const app = new Hono<{ Variables: Variables }>();

const applicationSchema = z.object({
  client_name: z.string(),
  redirect_uris: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const uris = v.split(/\s+/g);
      for (const uri of uris) {
        const parsed = z.string().url().safeParse(uri);
        if (parsed.error != null) {
          for (const error of parsed.error.errors) {
            ctx.addIssue(error);
          }
          return z.NEVER;
        }
      }
      return uris;
    }),
  scopes: z
    .string()
    .trim()
    .transform((v, ctx) => {
      const scopes: Scope[] = [];
      for (const scope of v.split(/\s+/g)) {
        if (!scopeEnum.enumValues.includes(scope as Scope)) {
          ctx.addIssue({
            code: z.ZodIssueCode.invalid_enum_value,
            options: scopeEnum.enumValues,
            received: scope,
          });
          return z.NEVER;
        }
        scopes.push(scope as Scope);
      }
      return scopes;
    })
    .optional(),
  website: z.string().url().optional(),
});

app.post("/", async (c) => {
  let form: z.infer<typeof applicationSchema>;
  if (c.req.header("Content-Type") === "application/json") {
    const json = await c.req.json();
    const result = await applicationSchema.safeParseAsync(json);
    if (!result.success) {
      return c.json({ error: "Invalid request", zod_error: result.error }, 400);
    }
    form = result.data;
  } else {
    const formData = await c.req.parseBody();
    const result = await applicationSchema.safeParseAsync(formData);
    if (!result.success) {
      return c.json({ error: "Invalid request", zod_error: result.error }, 400);
    }
    form = result.data;
  }
  if (form == null) {
    return c.json({ error: "Invalid request" }, 400);
  }
  const clientId = encodeBase64Url(crypto.getRandomValues(new Uint8Array(16)));
  const clientSecret = encodeBase64Url(
    crypto.getRandomValues(new Uint8Array(32)),
  );
  const apps = await db
    .insert(applications)
    .values({
      id: crypto.randomUUID(),
      name: form.client_name,
      redirectUris: form.redirect_uris,
      scopes: form.scopes ?? (["read"] satisfies Scope[]),
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
    redirect_uri: app.redirectUris.join(" "),
    client_id: app.clientId,
    client_secret: app.clientSecret,
  });
});

app.get(
  "/verify_credentials",
  tokenRequired,
  scopeRequired(["read"]),
  async (c) => {
    const token = c.get("token");
    const app = token.application;
    return c.json({
      id: app.id,
      name: app.name,
      website: app.website,
    });
  },
);

export default app;
