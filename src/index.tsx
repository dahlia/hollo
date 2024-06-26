import { federation } from "@fedify/fedify/x/hono";
import { Hono } from "hono";
import accounts from "./accounts";
import api from "./api";
import fedi from "./federation";
import image from "./image";
import login from "./login";
import oauth from "./oauth";
import profile from "./profile";
import setup from "./setup";
import tags from "./tags";
import "./logging";
import { behindProxy } from "x-forwarded-fetch";
import { Layout } from "./components/Layout";
import { db } from "./db";

const app = new Hono();

app.use(federation(fedi, (_) => undefined));

app.get("/", async (c) => {
  const credential = await db.query.credentials.findFirst();
  if (credential == null) return c.redirect("/setup");
  const owners = await db.query.accountOwners.findMany({
    with: { account: true },
  });
  if (owners.length < 1) return c.redirect("/accounts");
  if (
    "HOME_URL" in process.env &&
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    process.env["HOME_URL"] != null &&
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    process.env["HOME_URL"].trim() !== ""
  ) {
    // biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
    return c.redirect(process.env["HOME_URL"]);
  }
  const host = new URL(c.req.url).host;
  return c.html(
    <Layout title={host}>
      <hgroup>
        <h1>{host}</h1>
        <p>This Hollo instance has the below accounts.</p>
      </hgroup>
      {owners.map((owner) => (
        <article>
          <hgroup>
            {owner.account.avatarUrl && (
              <a href={owner.account.url ?? owner.account.iri}>
                <img
                  src={owner.account.avatarUrl}
                  alt={`${owner.account.name}'s avatar`}
                  width={72}
                  height={72}
                  style="float: left; margin-right: 1em;"
                />
              </a>
            )}
            <h3>
              <a href={owner.account.url ?? owner.account.iri}>
                {owner.account.name}
              </a>
            </h3>
            <p style="user-select: all;">{owner.account.handle}</p>
          </hgroup>
          <div
            // biome-ignore lint/security/noDangerouslySetInnerHtml: <explanation>
            dangerouslySetInnerHTML={{ __html: owner.account.bioHtml ?? "" }}
          />
        </article>
      ))}
      <div>
        <a role="button" href="/accounts">
          Manage accounts (signing in required)
        </a>
      </div>
    </Layout>,
  );
});

app.route("/:handle{@[^/]+}", profile);
app.route("/setup", setup);
app.route("/login", login);
app.route("/accounts", accounts);
app.route("/oauth", oauth);
app.route("/tags", tags);
app.route("/api", api);
app.route("/image", image);
app.get("/nodeinfo/2.0", (c) => c.redirect("/nodeinfo/2.1"));

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const BEHIND_PROXY = process.env["BEHIND_PROXY"] === "true";

export default BEHIND_PROXY ? { fetch: behindProxy(app.fetch.bind(app)) } : app;
