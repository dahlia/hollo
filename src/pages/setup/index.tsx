import { hash } from "argon2";
import { count } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { Layout } from "../../components/Layout.tsx";
import { SetupForm } from "../../components/SetupForm.tsx";
import db from "../../db.ts";
import { credentials } from "../../schema.ts";

const setup = new Hono();

function showsProxyWarning(c: Context): boolean {
  const url = new URL(c.req.url);
  return (
    url.protocol === "http:" &&
    url.hostname !== "localhost" &&
    !url.hostname.startsWith("127.") &&
    // biome-ignore lint/complexity/useLiteralKeys: tsc rants about this (TS4111)
    process.env["BEHIND_PROXY"] !== "true"
  );
}

setup.get("/", async (c) => {
  const [{ value: exist }] = await db
    .select({ value: count() })
    .from(credentials);
  if (exist > 0) return c.redirect("/accounts");
  return c.html(<SetupPage proxyWarning={showsProxyWarning(c)} />);
});

setup.post("/", async (c) => {
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
        proxyWarning={showsProxyWarning(c)}
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
      400,
    );
  }
  await db.insert(credentials).values({
    email,
    passwordHash: await hash(password),
  });
  return c.redirect("/accounts");
});

interface SetupPageProps {
  proxyWarning?: boolean;
  values?: {
    email?: string;
  };
  errors?: {
    email?: string;
    password?: string;
    passwordConfirm?: string;
  };
}

function SetupPage(props: SetupPageProps) {
  return (
    <Layout title="Welcome to Hollo!">
      {props.proxyWarning && (
        <article class="pico-background-red-700">
          <p class="pico-background-red-700" style="margin: 0">
            <strong>Warning:</strong> Your Hollo server apparently runs behind a
            reverse proxy or L7 load balancer. Please configure environment
            variable{" "}
            <a href="https://docs.hollo.social/install/env/#behind_proxy-">
              <code class="pico-background-red-800">BEHIND_PROXY</code>
            </a>{" "}
            to <code class="pico-background-red-800">true</code> to prevent
            federation issues.
          </p>
        </article>
      )}
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
}

export default setup;
