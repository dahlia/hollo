import { hash } from "@stdext/crypto/hash";
import { count } from "drizzle-orm";
import { Hono } from "hono";
import type { FC } from "hono/jsx";
import { Layout } from "./components/Layout";
import { SetupForm } from "./components/SetupForm";
import db from "./db";
import { credentials } from "./schema";

const app = new Hono();

app.get("/", async (c) => {
  const [{ value: exist }] = await db
    .select({ value: count() })
    .from(credentials);
  if (exist > 0) return c.redirect("/accounts");
  return c.html(<SetupPage />);
});

app.post("/", async (c) => {
  const [{ value: exist }] = await db
    .select({ value: count() })
    .from(credentials);
  if (exist > 0) return c.redirect("/accounts");
  const form = await c.req.formData();
  const email = form.get("email")?.toString();
  const password = form.get("password")?.toString();
  const passwordConfirm = form.get("password_confirm")?.toString();
  if (
    email == null ||
    password == null ||
    passwordConfirm == null ||
    password !== passwordConfirm
  ) {
    return c.html(
      <SetupPage
        values={{ email }}
        errors={{
          email: email == null ? "Email is required." : undefined,
          password: password == null ? "Password is required." : undefined,
          passwordConfirm:
            password !== passwordConfirm
              ? "Passwords do not match."
              : undefined,
        }}
      />,
    );
  }
  await db.insert(credentials).values({
    email,
    passwordHash: hash("argon2", password),
  });
  return c.redirect("/");
});

export interface SetupPageProps {
  values?: {
    email?: string;
  };
  errors?: {
    email?: string;
    password?: string;
    passwordConfirm?: string;
  };
}

export const SetupPage: FC<SetupPageProps> = (props: SetupPageProps) => {
  return (
    <Layout title="Welcome to Hollo!">
      <hgroup>
        <h1>Welcome to Hollo!</h1>
        <p>
          It's the first time to use Hollo, let's set up your account. The email
          and password you set here will be used to sign in to Hollo.
        </p>
      </hgroup>
      <SetupForm action="/setup" values={props.values} errors={props.errors} />
    </Layout>
  );
};

export default app;
