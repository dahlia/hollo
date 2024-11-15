import { getLogger } from "@logtape/logtape";
import type { Context } from "hono";
import { AccountExporter } from "../../../entities/exportAccount";
import { AccountImporter } from "../../../entities/importAccount";

// Export controller function
export const exportController = async (c: Context) => {
  const logger = getLogger(["hollo", "api", "v2", "accountExport"]);
  logger.info("Received account export request");

  const actorId = c.req.param("actorId");
  // const owner = c.get("token").accountOwner;

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

export const importController = async (c: Context) => {
  const logger = getLogger(["hollo", "api", "v2", "accountImport"]);
  logger.info("Received account import request");

  const actorId = c.req.param("actorId");

  try {
    const importer = new AccountImporter(actorId);

    // Get the buffer from the request
    const tarballBuffer = await c.req.arrayBuffer();
    console.log("🚀 ~ importController ~ tarballBuffer:", tarballBuffer);
    if (tarballBuffer.byteLength === 0) {
      return c.json({ error: "No data provided" }, 400);
    }
    const buffer = Buffer.from(tarballBuffer);

    return await importer.importData(buffer, c);
  } catch (error) {
    logger.error("Account import failed:", { error });
    return c.json({ error: "Import failed" }, 500);
  }
};
