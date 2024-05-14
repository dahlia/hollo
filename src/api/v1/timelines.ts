import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { type Variables, scopeRequired, tokenRequired } from "../../oauth";

const app = new Hono<{ Variables: Variables }>();

app.get(
  "/home",
  tokenRequired,
  scopeRequired(["read:statuses"]),
  zValidator(
    "form",
    z.object({
      max_id: z.string().uuid().optional(),
      since_id: z.string().uuid().optional(),
      min_id: z.string().uuid().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }),
  ),
  (c) => {
    if (c.get("token").accountOwner == null) {
      return c.json(
        { error: "This method requires an authenticated user" },
        422,
      );
    }
    return c.json([]);
  },
);

export default app;
