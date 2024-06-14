import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import { serializeMedium } from "../../entities/medium";
import type { Variables } from "../../oauth";
import { media } from "../../schema";

const app = new Hono<{ Variables: Variables }>();

app.get("/:id", async (c) => {
  const medium = await db.query.media.findFirst({
    where: eq(media.id, c.req.param("id")),
  });
  if (medium == null) return c.json({ error: "Not found" }, 404);
  return c.json(serializeMedium(medium));
});

export default app;
