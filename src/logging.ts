import { AsyncLocalStorage } from "node:async_hooks";
import { Writable } from "node:stream";
import {
  type LogLevel,
  configure,
  getAnsiColorFormatter,
  getFileSink,
  getStreamSink,
  parseLogLevel,
} from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const LOG_LEVEL: LogLevel = parseLogLevel(process.env["LOG_LEVEL"] ?? "info");
// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const LOG_QUERY: boolean = process.env["LOG_QUERY"] === "true";
// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const LOG_FILE: string | undefined = process.env["LOG_FILE"];

await configure({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getStreamSink(Writable.toWeb(process.stderr) as WritableStream, {
      formatter: getAnsiColorFormatter({
        timestamp: "time",
      }),
    }),
    sentry: getSentrySink(),
    file:
      LOG_FILE == null
        ? () => undefined
        : getFileSink(LOG_FILE, {
            formatter: JSON.stringify.bind(JSON),
          }),
  },
  filters: {},
  loggers: [
    {
      category: "fedify",
      lowestLevel: LOG_LEVEL,
      sinks: ["console", "sentry", "file"],
    },
    {
      category: ["fedify", "runtime", "docloader"],
      lowestLevel: "warning",
      sinks: ["console", "sentry", "file"],
    },
    {
      category: "hollo",
      lowestLevel: LOG_LEVEL,
      sinks: ["console", "sentry", "file"],
    },
    {
      category: "drizzle-orm",
      lowestLevel: LOG_QUERY ? "debug" : "fatal",
      sinks: ["console", "sentry", "file"],
    },
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console", "sentry", "file"],
    },
  ],
});
