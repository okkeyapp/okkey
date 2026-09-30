/**
 * Pure gate for mixed-key / stale-stream reseal (unit-tested).
 *
 * NOT used by refresh()/unlock/open/switch anymore — those paths are API-first
 * (empty → personal-events from 0). Kept for the explicit opt-in rebaseline /
 * recovery tooling and for documenting when a local-plaintext reseal would have
 * been justified historically.
 *
 * Callers that still invoke resealing MUST catch up personal-events (apply
 * decryptable CREATE/UPDATE/DELETE) before invoking this. Resealing from a
 * stale local snapshot re-appends deleted folders onto the server stream.
 */
export function shouldResealLocalFoldersForStreamKey(input: {
  localFolderCount: number;
  decrypts: boolean;
  tipVersion: number;
  folderDecryptFail: number;
  localMissingOnStream: boolean;
}): boolean {
  if (input.localFolderCount <= 0) {
    return false;
  }
  if (!input.decrypts && input.tipVersion > 0) {
    return true;
  }
  return input.folderDecryptFail > 0 && input.localMissingOnStream;
}

/**
 * Folder ids present on a decryptable stream materialization that are not in the
 * desired local plaintext set (and should be tombstoned during rebaseline).
 */
export function folderIdsToTombstoneForRebaseline(
  streamFolderIds: Iterable<string>,
  desiredFolderIds: ReadonlySet<string>,
): string[] {
  const extras: string[] = [];
  for (const id of streamFolderIds) {
    if (!desiredFolderIds.has(id)) {
      extras.push(id);
    }
  }
  return extras.sort((a, b) => a.localeCompare(b));
}
