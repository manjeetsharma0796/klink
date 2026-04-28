import IORedis, { type Redis } from "ioredis";

let cached: Redis | null = null;

/**
 * Lazy Redis singleton. First call instantiates the connection; throws if
 * REDIS_URL is missing only when accessed (so /health and tests don't need
 * Redis to start the server).
 */
export function getRedis(): Redis {
  if (cached) return cached;
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error("REDIS_URL is not set — required for any Redis-touching endpoint");
  }
  cached = new IORedis(url, {
    // Avoid lazy connect — error early if Redis is unreachable instead of on first command.
    enableReadyCheck: true,
    // 1 attempt of reconnection per failed command
    maxRetriesPerRequest: 1,
  });
  return cached;
}

/** Test seam — used to drop the cached client between integration runs. */
export function _resetRedisForTests(): void {
  cached?.disconnect();
  cached = null;
}
