import { Hono } from "hono";
import instance from "./instance";

const app = new Hono();

app.route("/instance", instance);

export default app;
