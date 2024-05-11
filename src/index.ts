import { Hono } from "hono";
import setup from "./setup";

const app = new Hono();

app.get("/", (c) => {
  return c.text("Welcome to Hollo!");
});

app.route("/setup", setup);

export default app;
