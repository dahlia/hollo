import { getLogger } from "@logtape/logtape";
import type { Context } from "hono";
import { AccountExporter } from "../../../entities/exportAccount";

// Export controller function
export const exportController = async (c: Context) => {
  const logger = getLogger(["hollo", "api", "v2", "accountExport"]);
  logger.info("Received account export request");

  const actorId = c.req.param("actorId");
  // const owner = c.get("token").accountOwner;

  // Authorization check (uncomment if needed)
  // if (owner == null) {
  //   return c.json({ error: "Unauthorized" }, 401);
  // }
  // if (owner.handle !== actorId) {
  //   return c.json({ error: "Forbidden" }, 403);
  // }

  try {
    const exporter = new AccountExporter(actorId);
    return await exporter.exportData(c);
  } catch (error) {
    logger.error("Account export failed: {error}", { error });
    return c.json({ error: "Export failed" }, 500);
  }
};
