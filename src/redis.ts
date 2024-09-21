import { Redis } from "ioredis";

export function getRedisUrl(): string | null {
  // biome-ignore lint/complexity/useLiteralKeys: tsc rants about this (TS4111)
  const redisUrl = process.env["REDIS_URL"];
  return redisUrl ?? null;
}

export function createRedis(): Redis {
  const redisUrl = getRedisUrl();
  if (redisUrl == null) throw new Error("REDIS_URL must be defined");
  return new Redis(redisUrl);
}
