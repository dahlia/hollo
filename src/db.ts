import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// biome-ignore lint/complexity/useLiteralKeys: tsc rants about this (TS4111)
const databaseUrl = process.env["DATABASE_URL"];
if (databaseUrl == null) throw new Error("DATABASE_URL must be defined");

const client = postgres(databaseUrl, { connect_timeout: 5 });
export const db = drizzle(client, { schema, logger: true });

export default db;
