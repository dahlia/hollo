import { Hono } from "hono";
import { serializeTag } from "../../entities/tag";
import { type Variables, tokenRequired } from "../../oauth";

const app = new Hono<{ Variables: Variables }>();

app.use(tokenRequired);

app.get("/:id", (c) => {
  const owner = c.get("token").accountOwner;
  return c.json(serializeTag(c.req.param("id"), owner, c.req.url));
});

export default app;
