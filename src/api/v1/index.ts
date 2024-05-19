import { Hono } from "hono";
import { scopeRequired, tokenRequired } from "../../oauth";
import accounts from "./accounts";
import apps from "./apps";
import follow_requests from "./follow_requests";
import instance from "./instance";
import notifications from "./notifications";
import statuses from "./statuses";
import timelines from "./timelines";

const app = new Hono();

app.route("/apps", apps);
app.route("/accounts", accounts);
app.route("/follow_requests", follow_requests);
app.route("/instance", instance);
app.route("/notifications", notifications);
app.route("/statuses", statuses);
app.route("/timelines", timelines);

app.get(
  "/preferences",
  tokenRequired,
  scopeRequired(["read:accounts"]),
  (c) => {
    return c.json({
      // TODO
      "posting:default:visibility": "public",
      "posting:default:sensitive": false,
      "posting:default:language": null,
      "reading:expand:media": "default",
      "reading:expand:spoilers": false,
    });
  },
);

app.get("/custom_emojis", (c) => {
  return c.json([]);
});

app.get("/announcements", (c) => {
  return c.json([]);
});

export default app;
