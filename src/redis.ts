import { Redis } from "ioredis";

export function createRedis(): Redis {
  // biome-ignore lint/complexity/useLiteralKeys: tsc rants about this (TS4111)
  const redisUrl = process.env["REDIS_URL"];
  if (redisUrl == null) throw new Error("REDIS_URL must be defined");
  return new Redis(redisUrl);
}

export default createRedis();
