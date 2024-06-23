import { MeiliSearch } from "meilisearch";

// biome-ignore lint/complexity/useLiteralKeys: tsc rants about this (TS4111)
const meiliUrl = process.env["MEILI_URL"];
if (meiliUrl == null) throw new Error("MEILI_URL must be defined");

// biome-ignore lint/complexity/useLiteralKeys: tsc rants about this (TS4111)
const meiliMasterKey = process.env["MEILI_MASTER_KEY"];

export const search = new MeiliSearch({
  host: meiliUrl,
  apiKey: meiliMasterKey,
});

export default search;
