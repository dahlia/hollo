import { isActor } from "@fedify/fedify";
import { Hono } from "hono";
import { DashboardLayout } from "../components/DashboardLayout";
import db from "../db";
import federation from "../federation";
import { persistAccount } from "../federation/account";
import { isPost, persistPost } from "../federation/post";
import { loginRequired } from "../login";

const data = new Hono();

data.use(loginRequired);

data.get("/", (c) => {
  const done = c.req.query("done");
  const error = c.req.query("error");

  return c.html(
    <DashboardLayout title="Hollo: Federation" selectedMenu="federation">
      <hgroup>
        <h1>Federation</h1>
        <p>
          This control panel allows you to manage remote objects or interactions
          with the fediverse.
        </p>
      </hgroup>

      <article>
        <header>
          <hgroup>
            <h2>Force refresh account/post</h2>
            {done === "refresh:account" ? (
              <p>Account has been refreshed.</p>
            ) : done === "refresh:post" ? (
              <p>Post has been refreshed.</p>
            ) : (
              <p>Use this when you see outdated remote account/post data.</p>
            )}
          </hgroup>
        </header>
        <form
          method="post"
          action="/federation/refresh"
          onsubmit="this.submit.ariaBusy = 'true'"
        >
          <fieldset role="group">
            <input
              type="text"
              name="uri"
              placeholder="@hollo@hollo.social"
              required
              aria-invalid={error === "refresh" ? "true" : undefined}
            />
            <button name="submit" type="submit">
              Refresh
            </button>
          </fieldset>
          {error === "refresh" ? (
            <small>
              The given handle or URI is invalid or not found. Please try again.
            </small>
          ) : (
            <small>
              A fediverse handle (e.g., <tt>@hollo@hollo.social</tt>) or a
              post/actor URI (e.g.,{" "}
              <tt>
                https://hollo.social/@hollo/01904586-7b75-7ef6-ad31-bec40b8b1e66
              </tt>
              ) is allowed.
            </small>
          )}
        </form>
      </article>
    </DashboardLayout>,
  );
});

data.post("/refresh", async (c) => {
  const fedCtx = federation.createContext(c.req.raw, undefined);
  const form = await c.req.formData();
  const uri = form.get("uri");
  const owner = await db.query.accountOwners.findFirst({});
  if (owner != null && typeof uri === "string") {
    const documentLoader = await fedCtx.getDocumentLoader({
      username: owner.handle,
    });
    try {
      const object = await fedCtx.lookupObject(uri, { documentLoader });
      if (isActor(object)) {
        await persistAccount(db, object, { ...fedCtx, documentLoader });
        return c.redirect("/federation?done=refresh:account");
      }
      if (isPost(object)) {
        await persistPost(db, object, { ...fedCtx, documentLoader });
        return c.redirect("/federation?done=refresh:post");
      }
    } catch {}
  }
  return c.redirect("/federation?error=refresh");
});

export default data;
