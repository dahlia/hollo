import { Hono } from "hono";
import Layout from "../../components/Layout.tsx";
import db from "../../db.ts";

const homePage = new Hono().basePath("/");

homePage.get("/", async (c) => {
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

export default homePage;
