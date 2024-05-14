import { Hono } from "hono";
import accounts from "./accounts";
import apps from "./apps";

const app = new Hono();

app.route("/apps", apps);
app.route("/accounts", accounts);

export default app;
