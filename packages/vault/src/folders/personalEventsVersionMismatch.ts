/**
 * Parse Core API VERSION_MISMATCH from workspace personal-events append failures
 * (`ApiRequestError` or body-shaped objects).
 */
export function parsePersonalEventsVersionMismatch(err: unknown): {
  expectedBaseVersion: number;
  latestVersion: number;
} | null {
  if (!err || typeof err !== "object") {
    return null;
  }
  const record = err as Record<string, unknown>;
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
    const d = details as Record<string, unknown>;
    if (typeof d.expectedBaseVersion === "number" && typeof d.latestVersion === "number") {
      return {
        expectedBaseVersion: d.expectedBaseVersion,
        latestVersion: d.latestVersion,
      };
    }
  }
  return null;
}
