import { getLogger } from "@logtape/logtape";
import { type BunClient, init, initOpenTelemetry } from "@sentry/bun";
import { getGlobalScope, setCurrentClient } from "@sentry/core";

const logger = getLogger(["hollo", "sentry"]);

export function configureSentry(dsn?: string): BunClient | undefined {
  if (dsn == null) {
    logger.debug("SENTRY_DSN is not provided. Sentry will not be initialized.");
    return;
  }

  const client = init({
    dsn,
    tracesSampleRate: 1.0,
  });
  if (client == null) {
    logger.error("Failed to initialize Sentry.");
    return;
  }
  getGlobalScope().setClient(client);
  setCurrentClient(client);
  logger.debug("Sentry initialized.");

  initOpenTelemetry(client);
  return client;
}
