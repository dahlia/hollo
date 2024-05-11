import { Hono } from "hono";
import accounts from "./accounts";
import setup from "./setup";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Welcome to Hollo!");
});

app.route("/setup", setup);
app.route("/accounts", accounts);

export default app;
