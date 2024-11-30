import { AsyncLocalStorage } from "node:async_hooks";
import {
  type LogLevel,
  configure,
  getAnsiColorFormatter,
  getStreamSink,
  parseLogLevel,
} from "@logtape/logtape";
import { getSentrySink } from "@logtape/sentry";
import type { FileSink } from "bun";

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const LOG_LEVEL: LogLevel = parseLogLevel(process.env["LOG_LEVEL"] ?? "info");
// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const LOG_QUERY: boolean = process.env["LOG_QUERY"] === "true";

let writer: FileSink | undefined = undefined;
const stdout = new WritableStream({
  start() {
    writer = Bun.stderr.writer();
  },
  write(chunk) {
    writer?.write(chunk);
  },
  close() {
    if (
      writer != null &&
      "close" in writer &&
      typeof writer.close === "function"
    ) {
      writer.close();
    }
  },
  abort() {},
});

await configure({
  contextLocalStorage: new AsyncLocalStorage(),
  sinks: {
    console: getStreamSink(stdout, {
      formatter: getAnsiColorFormatter({
        timestamp: "time",
      }),
    }),
    sentry: getSentrySink(),
  },
  filters: {},
  loggers: [
    {
      category: "fedify",
      lowestLevel: LOG_LEVEL,
      sinks: ["console", "sentry"],
    },
    {
      category: ["fedify", "runtime", "docloader"],
      lowestLevel: "warning",
      sinks: ["console", "sentry"],
    },
    { category: "hollo", lowestLevel: LOG_LEVEL, sinks: ["console", "sentry"] },
    {
      category: "drizzle-orm",
      lowestLevel: LOG_QUERY ? "debug" : "fatal",
      sinks: ["console", "sentry"],
    },
    {
      category: ["logtape", "meta"],
      lowestLevel: "warning",
      sinks: ["console", "sentry"],
    },
  ],
});
