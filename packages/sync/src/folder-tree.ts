/**
 * UI-agnostic folder hierarchy helpers (client-side validation before append).
 */

export interface FolderParentRef {
  parentFolderId: string | null;
}

/**
 * Returns true if setting `movingFolderId`'s parent to `newParentId` would create a cycle.
 * `folders` is the current materialized map (before applying the move).
 */
export function wouldIntroduceFolderParentCycle(
  folders: ReadonlyMap<string, FolderParentRef>,
  movingFolderId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === movingFolderId) return true;
  let cur: string | null = newParentId;
  const seen = new Set<string>();
  while (cur !== null) {
    if (cur === movingFolderId) return true;
    if (seen.has(cur)) return true;
    seen.add(cur);
    cur = folders.get(cur)?.parentFolderId ?? null;
  }
  return false;
}
