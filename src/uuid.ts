import { uuidv7 as generateUuidV7 } from "uuidv7-js";
import { z } from "zod";

export type Uuid = ReturnType<typeof crypto.randomUUID>;

export function uuidv7(timestamp?: number): Uuid {
  return generateUuidV7(timestamp) as Uuid;
}

const UUID_REGEXP = /^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

export function isUuid(value: string): value is Uuid {
  return UUID_REGEXP.exec(value) != null;
}

export const uuid = z.custom<Uuid>(
  (v: unknown) => typeof v === "string" && isUuid(v),
  "expected a UUID",
);
