import { Hono } from "hono";
import { tokenRequired } from "../../oauth";
import accounts from "./accounts";
import apps from "./apps";

const app = new Hono();

app.route("/apps", apps);
app.route("/accounts", accounts);

app.get("/preferences", tokenRequired, (c) => {
  return c.json({
    // TODO
    "posting:default:visibility": "public",
    "posting:default:sensitive": false,
    "posting:default:language": null,
    "reading:expand:media": "default",
    "reading:expand:spoilers": false,
  });
});

export default app;
