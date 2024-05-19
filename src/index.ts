import { federation } from "@fedify/fedify/x/hono";
import { Hono } from "hono";
import accounts from "./accounts";
import api from "./api";
import fedi from "./federation";
import image from "./image";
import login from "./login";
import oauth from "./oauth";
import setup from "./setup";
import "./logging";
import { behindProxy } from "x-forwarded-fetch";

const app = new Hono();

app.use(federation(fedi, (_) => undefined));

app.route("/setup", setup);
app.route("/login", login);
app.route("/accounts", accounts);
app.route("/oauth", oauth);
app.route("/api", api);
app.route("/image", image);
app.get("/nodeinfo/2.0", (c) => c.redirect("/nodeinfo/2.1"));

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const BEHIND_PROXY = process.env["BEHIND_PROXY"] === "true";

export default BEHIND_PROXY ? { fetch: behindProxy(app.fetch.bind(app)) } : app;
