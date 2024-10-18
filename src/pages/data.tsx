import { isActor } from "@fedify/fedify";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout";
import db from "../db";
import federation from "../federation";
import { persistAccount } from "../federation/account";
import { loginRequired } from "../login";

const data = new Hono();

data.use(loginRequired);

data.get("/", (c) => {
  const done = c.req.query("done");

  return c.html(
    <DashboardLayout title="Hollo: Data" selectedMenu="data">
      <hgroup>
        <h1>Data</h1>
        <p>Here you can manage your data.</p>
      </hgroup>

      <article>
        <header>
          <hgroup>
            <h2>Force refresh account</h2>
            {done === "refresh-account" ? (
              <p>Account has been refreshed.</p>
            ) : (
              <p>Use this when you see outdated remote account data.</p>
            )}
          </hgroup>
        </header>
        <form
          method="post"
          action="/data/refresh-account"
          onsubmit="this.submit.ariaBusy = 'true'"
        >
          <fieldset role="group">
            <input
              type="text"
              name="handle"
              placeholder="@hollo@hollo.social"
              required
            />
            <button name="submit" type="submit">
              Refresh
            </button>
          </fieldset>
          <small>
            A fediverse handle (e.g., <tt>@hollo@hollo.social</tt>) or an actor
            URI (e.g., <tt>https://hollo.social/@hollo</tt>) is allowed.
          </small>
        </form>
      </article>
    </DashboardLayout>,
  );
});

data.post("/refresh-account", async (c) => {
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const form = await c.req.formData();
  const handle = form.get("handle");
  const owner = await db.query.accountOwners.findFirst({});
  if (owner != null && typeof handle === "string") {
    const documentLoader = await fedCtx.getDocumentLoader({
      username: owner.handle,
    });
    const actor = await fedCtx.lookupObject(handle, { documentLoader });
    if (isActor(actor)) {
      await persistAccount(db, actor, { ...fedCtx, documentLoader });
    }
  }
  return c.redirect("/data?done=refresh-account");
});

export default data;
