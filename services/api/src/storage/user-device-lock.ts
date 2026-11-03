import type { QueryExecutor } from "./postgres.ts";

const tails = new Map<string, Promise<void>>();

/** Serializes device status changes and session binds for one user inside this process. */
export function userDeviceLockKey(userId: string): string {
  return `okkey-user-devices:${userId}`;
}

export async function withUserDeviceLock<T>(
  userId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const key = userDeviceLockKey(userId);
  const previous = tails.get(key) ?? Promise.resolve();
  let release: () => void = () => undefined;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  tails.set(
    key,
    previous.then(
      () => current,
      () => current,
    ),
  );
  await previous.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
  }
}

/** Same key as `withUserDeviceLock`, held until the surrounding transaction commits. */
export async function lockUserDevices(db: Pick<QueryExecutor, "query">, userId: string): Promise<void> {
  await db.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
    userDeviceLockKey(userId),
  ]);
}
