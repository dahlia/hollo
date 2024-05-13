import { federation } from "@fedify/fedify/x/hono";
import { Hono } from "hono";
import accounts from "./accounts";
import fedi from "./federation";
import login from "./login";
import setup from "./setup";
import "./logging";
import { behindProxy } from "x-forwarded-fetch";

const app = new Hono();

app.use(federation(fedi, (_) => undefined));

app.get("/", (c) => {
  return c.text("Welcome to Hollo!");
});

app.route("/setup", setup);
app.route("/login", login);
app.route("/accounts", accounts);

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const BEHIND_PROXY = process.env["BEHIND_PROXY"] === "true";

export default BEHIND_PROXY ? { fetch: behindProxy(app.fetch.bind(app)) } : app;
