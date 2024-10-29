import "./logging";
import { join } from "node:path";
import { federation } from "@fedify/fedify/x/hono";
import { Hono } from "hono";
import { behindProxy } from "x-forwarded-fetch";
import api from "./api";
import fedi from "./federation";
import image from "./image";
import oauth, { oauthAuthorizationServer } from "./oauth";
import pages from "./pages";
const app = new Hono();

app.use(federation(fedi, (_) => undefined));

app.route("/", pages);
app.route("/oauth", oauth);
app.get("/.well-known/oauth-authorization-server", oauthAuthorizationServer);
app.route("/api", api);
app.route("/image", image);
app.get("/nodeinfo/2.0", (c) => c.redirect("/nodeinfo/2.1"));

app.get("/favicon.png", async (c) => {
  const file = Bun.file(join(import.meta.dirname, "public", "favicon.png"));
  return c.body(await file.arrayBuffer(), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000",
    },
  });
});

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const BEHIND_PROXY = process.env["BEHIND_PROXY"] === "true";

export default BEHIND_PROXY ? { fetch: behindProxy(app.fetch.bind(app)) } : app;
