const prefix = "okkey.workspace.current.u.";

export function currentWorkspaceStorageKey(userId: string): string {
  return `${prefix}${userId}`;
}

export function readStoredCurrentWorkspaceId(userId: string): string | null {
  try {
    const raw = localStorage.getItem(currentWorkspaceStorageKey(userId))?.trim();
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

export function writeStoredCurrentWorkspaceId(userId: string, workspaceId: string): void {
  try {
    localStorage.setItem(currentWorkspaceStorageKey(userId), workspaceId);
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredCurrentWorkspaceId(userId: string): void {
  try {
    localStorage.removeItem(currentWorkspaceStorageKey(userId));
  } catch {
    /* ignore */
  }
}
