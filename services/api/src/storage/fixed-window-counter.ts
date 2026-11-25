/**
 * Redis ops for a fixed-window counter: open the window with TTL, then increment.
 * Keys without a TTL are self-healed on the next hit.
 */
export type FixedWindowCounterRedis = {
  setIfNotExistsWithTtl(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  incr(key: string): Promise<number>;
  /** Remaining TTL in seconds; `-1` means no expiry, `-2` means missing (Redis semantics). */
  ttl(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<boolean>;
};

/**
 * Increment a fixed-window counter and keep a TTL on the key.
 *
 * Sequence: `SET key 0 NX EX <window>` → `INCR` → if `TTL == -1` then `EXPIRE`
 * (self-heal for keys that lost their expiry). Redis errors propagate unchanged.
 */
export async function incrementFixedWindow(
  redis: FixedWindowCounterRedis,
  key: string,
  windowSeconds: number,
): Promise<number> {
  await redis.setIfNotExistsWithTtl(key, "0", windowSeconds);
  const count = await redis.incr(key);
  const remainingTtl = await redis.ttl(key);
  if (remainingTtl === -1) {
    await redis.expire(key, windowSeconds);
  }
  return count;
}
