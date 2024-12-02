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

  if (!actorId) {
    logger.error("Actor ID is missing in the request");
    return c.json({ error: "Actor ID is required" }, 400);
  }

  try {
    // Parse the incoming multipart/form-data
    const formData = await c.req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      logger.error("No file uploaded or invalid file data");
      return c.json({ error: "No file uploaded" }, 400);
    }

    logger.info(`Received file: ${file.name}, size: ${file.size} bytes`);

    // Read the file content into a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.byteLength === 0) {
      logger.error("Uploaded file is empty");
      return c.json({ error: "Uploaded file is empty" }, 400);
    }

    // Pass the buffer to the importer
    const importer = new AccountImporter(actorId);
    await importer.importData(buffer, c);

    return c.html("<script>alert('Data imported successfully!');</script>");
  } catch (error) {
    logger.error("Account import failed:", { error });
    return c.json({ error: "Import failed" }, 500);
  }
};
