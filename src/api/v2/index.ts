import { Hono } from "hono";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";
import { postMedia } from "../v1/media";
import instance from "./instance";

const app = new Hono<{ Variables: Variables }>();

app.route("/instance", instance);

app.post("/media", tokenRequired, scopeRequired(["write:media"]), postMedia);

export default app;
