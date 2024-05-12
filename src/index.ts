import { federation } from "@fedify/fedify/x/hono";
import { Hono } from "hono";
import accounts from "./accounts";
import fedi from "./federation";
import setup from "./setup";

const app = new Hono();

app.use(federation(fedi, (_) => undefined));

app.get("/", (c) => {
  return c.text("Welcome to Hollo!");
});

app.route("/setup", setup);
app.route("/accounts", accounts);

export default app;
