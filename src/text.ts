import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import MarkdownIt from "markdown-it";
import xss from "xss";
import type * as schema from "./schema";

export interface FormatResult {
  html: string;
}

export async function formatText(
  _db: PgDatabase<
    PostgresJsQueryResultHKT,
    typeof schema,
    ExtractTablesWithRelations<typeof schema>
  >,
  text: string,
): Promise<FormatResult> {
  // TODO: deal with mentions
  const md = new MarkdownIt();
  return {
    html: xss(md.render(text)),
  };
}
