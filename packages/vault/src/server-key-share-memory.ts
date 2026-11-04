/**
 * Server share (A) for the current JS realm.
 * Not written to localStorage, sessionStorage, or extension local storage.
 * A full page load, a closed extension popup, or an MV3 service-worker restart
 * drops this map; the next master-password unlock fetches A again.
 */

export type ServerKeyShareSource = "memory" | "server" | "legacy";

export type AcquiredServerKeyShare = {
  shareB64: string;
  source: ServerKeyShareSource;
};

const shares = new Map<string, string>();

/**
 * Bumped on every committed share and on clear.
 * An in-flight fetch captures the epoch and must not apply its result if a
 * newer commit (password change, logout) happened while it was awaiting.
 */
let epoch = 0;

function normalizedShare(shareB64: string): string | null {
  const trimmed = shareB64.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function readRememberedServerKeyShare(userId: string): string | null {
  return shares.get(userId) ?? null;
}

export function rememberServerKeyShare(userId: string, shareB64: string): void {
  const share = normalizedShare(shareB64);
  if (!userId || !share) {
    return;
  }
  epoch += 1;
  shares.set(userId, share);
}

export function clearRememberedServerKeyShares(): void {
  epoch += 1;
  shares.clear();
}

export function beginServerKeyShareFetch(): number {
  return epoch;
}

/**
 * Commit a share fetched at `begunAt`. Returns false when a newer commit won
 * the race; the caller must ignore the fetched payload, including storage writes.
 */
export function commitFetchedServerKeyShare(
  userId: string,
  shareB64: string,
  begunAt: number,
): boolean {
  const share = normalizedShare(shareB64);
  if (!userId || !share || begunAt !== epoch) {
    return false;
  }
  epoch += 1;
  shares.set(userId, share);
  return true;
}

export async function acquireServerKeyShare(input: {
  userId: string;
  /** Legacy extractable copy already on disk. Used only when the server cannot be reached. */
  legacyShareB64?: string | null;
  /** Return the server share, or null when the device is offline / not allowed to fetch. */
  fetchFromServer?: () => Promise<string | null>;
}): Promise<AcquiredServerKeyShare | null> {
  const cached = readRememberedServerKeyShare(input.userId);
  if (cached) {
    return { shareB64: cached, source: "memory" };
  }

  if (input.fetchFromServer) {
    const begunAt = beginServerKeyShareFetch();
    try {
      const fetched = await input.fetchFromServer();
      const share = fetched ? normalizedShare(fetched) : null;
      if (share && commitFetchedServerKeyShare(input.userId, share, begunAt)) {
        return { shareB64: share, source: "server" };
      }
      const newer = readRememberedServerKeyShare(input.userId);
      if (newer) {
        return { shareB64: newer, source: "memory" };
      }
    } catch {
      /* Offline or the device is not allowed to read bootstrap yet. */
    }
  }

  const legacy = input.legacyShareB64 ? normalizedShare(input.legacyShareB64) : null;
  if (legacy) {
    return { shareB64: legacy, source: "legacy" };
  }
  return null;
}
