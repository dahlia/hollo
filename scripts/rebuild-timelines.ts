import "../src/logging";
import db from "../src/db";
import { rebuildTimelines } from "../src/federation/timeline";

await rebuildTimelines(db);
process.exit();
