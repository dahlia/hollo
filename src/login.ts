import { getSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const SECRET_KEY = process.env["SECRET_KEY"];
if (SECRET_KEY == null) throw new Error("SECRET_KEY is required");

export const loginRequired = createMiddleware(async (c, next) => {
  const login = await getSignedCookie(c, SECRET_KEY, "login");
  if (login == null || login === false) {
    return c.redirect(`/login?next=${encodeURIComponent(c.req.url)}`);
  }
  await next();
});
