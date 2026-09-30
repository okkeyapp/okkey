/**
 * Pure gate for mixed-key / stale-stream reseal (unit-tested).
 *
 * Callers MUST catch up personal-events (apply decryptable CREATE/UPDATE/DELETE)
 * before invoking this. Resealing from a stale local snapshot re-appends deleted
 * folders onto the server stream and breaks every client.
 *
 * After master-password restore, personal-events can mix old-C and new-C
 * envelopes. A single decryptable recent event (e.g. agent repair-probe) must
 * not suppress reseal when local IndexedDB still holds real folders missing
 * from the decryptable stream set.
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
