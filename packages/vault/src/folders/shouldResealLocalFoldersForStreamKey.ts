/**
 * Pure gate for mixed-key / stale-stream reseal (unit-tested).
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

/**
 * Prefer peer-origin plaintext (e.g. web IndexedDB read by the extension) when
 * the local cache is empty/probe-only and the peer still has real folders.
 */
export function shouldImportPeerFolderCache(input: {
  localRealFolderCount: number;
  peerRealFolderCount: number;
}): boolean {
  return input.peerRealFolderCount > 0 && input.peerRealFolderCount > input.localRealFolderCount;
}
