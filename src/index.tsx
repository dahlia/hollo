import "./logging";
import { join, relative } from "node:path";
import { federation } from "@fedify/fedify/x/hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { captureException } from "@sentry/core";
import { Hono } from "hono";
import { behindProxy } from "x-forwarded-fetch";
import api from "./api";
import fedi from "./federation";
import image from "./image";
import oauth, { oauthAuthorizationServer } from "./oauth";
import pages from "./pages";
import { configureSentry } from "./sentry";
import { DRIVE_DISK, assetPath } from "./storage";

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
configureSentry(process.env["SENTRY_DSN"]);

const app = new Hono();

app.onError((err, _) => {
  captureException(err);
  throw err;
});

if (DRIVE_DISK === "fs") {
  app.use(
    "/assets/*",
    serveStatic({
      root: relative(process.cwd(), assetPath!),
      rewriteRequestPath: (path) => path.substring("/assets".length),
    }),
  );
}

app.use(
  "/public/*",
  serveStatic({
    root: relative(process.cwd(), join(import.meta.dirname, "public")),
    rewriteRequestPath: (path) => path.substring("/public".length),
  }),
);

app.use(federation(fedi, (_) => undefined));
app.route("/", pages);
app.route("/oauth", oauth);
app.get("/.well-known/oauth-authorization-server", oauthAuthorizationServer);
app.route("/api", api);
app.route("/image", image);
app.get("/nodeinfo/2.0", (c) => c.redirect("/nodeinfo/2.1"));

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const BEHIND_PROXY = process.env["BEHIND_PROXY"] === "true";

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const PORT = Number.parseInt(process.env["PORT"] ?? "3000", 10);

if (!Number.isInteger(PORT)) {
  console.error("Invalid PORT: must be an integer");
  process.exit(1);
}

serve({
  fetch: BEHIND_PROXY ? behindProxy(app.fetch.bind(app)) : app.fetch.bind(app),
  port: PORT,
});
