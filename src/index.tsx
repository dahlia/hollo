import "./logging";
import { join } from "node:path";
import { federation } from "@fedify/fedify/x/hono";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { behindProxy } from "x-forwarded-fetch";
import api from "./api";
import fedi from "./federation";
import image from "./image";
import oauth, { oauthAuthorizationServer } from "./oauth";
import pages from "./pages";
import { DRIVE_DISK, assetPath } from "./storage";

const app = new Hono();

if (DRIVE_DISK === "fs") {
  app.use(
    "/assets/*",
    serveStatic({
      root: assetPath,
      rewriteRequestPath: (path) => path.substring("/assets".length),
    }),
  );
}

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

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const PORT = Number.parseInt(process.env["PORT"] ?? "3000", 10);

if (!Number.isInteger(PORT)) {
  console.error("Invalid PORT: must be an integer");
  process.exit(1);
}

export default {
  fetch: BEHIND_PROXY ? behindProxy(app.fetch.bind(app)) : app.fetch.bind(app),
  port: PORT,
};
