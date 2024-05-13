import { verify } from "@stdext/crypto/hash";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { FC } from "hono/jsx";
import Layout from "./components/Layout";
import { LoginForm } from "./components/LoginForm";
import { db } from "./db";
import { credentials } from "./schema";

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

const app = new Hono();

app.get("/", (c) => {
  const next = c.req.query("next");
  return c.html(<LoginPage next={next} />);
});

app.post("/", async (c) => {
  const form = await c.req.formData();
  const email = form.get("email")?.toString();
  const password = form.get("password")?.toString();
  const next = form.get("next")?.toString();
  if (email == null || password == null) {
    return c.html(
      <LoginPage
        next={next}
        values={{ email }}
        errors={{
          email: email == null ? "Email is required." : undefined,
          password: password == null ? "Password is required." : undefined,
        }}
      />,
      400,
    );
  }
  const credential = await db.query.credentials.findFirst({
    where: eq(credentials.email, email),
  });
  if (
    credential == null ||
    !verify("argon2", password, credential.passwordHash)
  ) {
    return c.html(
      <LoginPage
        next={next}
        values={{ email }}
        errors={{
          email: "Invalid email or password.",
          password: "Invalid email or password.",
        }}
      />,
      400,
    );
  }
  await setSignedCookie(c, "login", new Date().toISOString(), SECRET_KEY);
  return c.redirect(next ?? "/");
});

export interface LoginPageProps {
  next?: string;
  values?: {
    email?: string;
  };
  errors?: {
    email?: string;
    password?: string;
  };
}

export const LoginPage: FC<LoginPageProps> = (props) => {
  return (
    <Layout title="Sign in to Hollo">
      <hgroup>
        <h1>Sign in to Hollo</h1>
        <p>To continue, sign in with your Hollo account.</p>
      </hgroup>
      <LoginForm
        action="/login"
        next={props.next}
        values={props.values}
        errors={props.errors}
      />
    </Layout>
  );
};

export default app;
