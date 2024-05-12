import {
  type LogLevel,
  configure,
  getConsoleSink,
  parseLogLevel,
} from "@logtape/logtape";

// biome-ignore lint/complexity/useLiteralKeys: tsc complains about this (TS4111)
const LOG_LEVEL: LogLevel = parseLogLevel(process.env["LOG_LEVEL"] ?? "info");

await configure({
  sinks: {
    console: getConsoleSink(),
  },
  filters: {},
  loggers: [
    { category: "fedify", level: LOG_LEVEL, sinks: ["console"] },
    { category: "hollo", level: LOG_LEVEL, sinks: ["console"] },
    { category: ["logtape", "meta"], level: "warning", sinks: ["console"] },
  ],
});
