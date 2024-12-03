import { getLogger } from "@logtape/logtape";
import type { Context } from "hono";
import { AccountExporter } from "../../../entities/exportAccount";

// Export controller function
export const exportController = async (c: Context) => {
  const logger = getLogger(["hollo", "api", "v2", "accountExport"]);
  logger.info("Received account export request");

  const actorId = c.req.param("actorId");
  if (!actorId) {
    return c.json({ error: "Actor ID not provided" }, 400);
  }

  try {
    const exporter = new AccountExporter(actorId);
    return await exporter.exportData(c);
  } catch (error) {
    logger.error("Account export failed: {error}", { error });
    return c.json({ error: "Export failed" }, 500);
  }
};
