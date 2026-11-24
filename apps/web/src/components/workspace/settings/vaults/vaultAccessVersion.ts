/**
 * Helpers for vault-access updates that require an event-log baseVersion.
 */

export function readLatestVaultAccessVersion(access: { latestVersion?: unknown }): number {
  return typeof access.latestVersion === "number" && Number.isFinite(access.latestVersion)
    ? access.latestVersion
    : 0;
}

export function parseVaultAccessVersionMismatch(error: unknown): { latestVersion: number } | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const record = error as Record<string, unknown>;
  const candidates: unknown[] = [record];
  if (record.body && typeof record.body === "object") {
    candidates.push(record.body);
  }
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "object") {
      continue;
    }
    const body = candidate as Record<string, unknown>;
    const code =
      (typeof body.error === "string" ? body.error : undefined) ??
      (typeof body.code === "string" ? body.code : undefined);
    if (code !== "VERSION_MISMATCH") {
      continue;
    }
    const details = body.details;
    if (!details || typeof details !== "object") {
      continue;
    }
    const latestVersion = (details as { latestVersion?: unknown }).latestVersion;
    if (typeof latestVersion === "number" && Number.isFinite(latestVersion)) {
      return { latestVersion };
    }
  }
  return null;
}

/** Run once; on VERSION_MISMATCH retry once with `details.latestVersion`. */
export async function runWithVaultAccessVersionRetry(
  initialBaseVersion: number,
  run: (baseVersion: number) => Promise<void>,
): Promise<void> {
  try {
    await run(initialBaseVersion);
  } catch (error) {
    const mismatch = parseVaultAccessVersionMismatch(error);
    if (!mismatch) {
      throw error;
    }
    await run(mismatch.latestVersion);
  }
}
