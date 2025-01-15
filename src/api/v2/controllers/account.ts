import { getLogger } from "@logtape/logtape";
import type { Context } from "hono";
import { AccountExporter } from "../../../entities/export";
import { AccountImporter } from "../../../entities/import";

// Export controller function
export const exportController = async (c: Context) => {
  const logger = getLogger(["hollo", "api", "v2", "accountExport"]);
  logger.info("Received account export request");

  const actorId = c.req.param("actorId");

  try {
    const exporter = new AccountExporter(actorId as ActorIdType);
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
    const importer = new AccountImporter(actorId as ActorIdType);
    await importer.importData(buffer);

    return c.html("<script>alert('Data imported successfully!');</script>");
  } catch (error) {
    logger.error("Account import failed:", { error });
    if (
      error instanceof Error &&
      error.message.toLowerCase().includes("mismatch")
    ) {
      return c.html(
        `
        <script>
          alert('Invalid file format. Please upload a valid account export file.');
          window.history.back();
        </script>

      `,
        400,
      );
    }
    return c.json({ error: "Import failed" }, 500);
  }
};
