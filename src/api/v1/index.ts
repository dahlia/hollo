import { Hono } from "hono";
import apps from "./apps";

const app = new Hono();

app.route("/apps", apps);

export default app;
