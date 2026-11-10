export type WorkspaceKeyRotationWrapRef = {
  userId: string;
};

export class WorkspaceKeyRotationError extends Error {
  readonly code: string;
  readonly statusCode: number;

  constructor(code: string, statusCode: number, message: string) {
    super(message);
    this.name = "WorkspaceKeyRotationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Decide whether member removal must install a new workspace-key version.
 * Returns null when the workspace has no key yet.
 */
export function planWorkspaceKeyRotation(input: {
  currentVersion: number | null;
  activeMemberIds: readonly string[];
  removedUserId: string;
  wrapUserIds: readonly string[] | null;
}): { nextVersion: number; recipientIds: string[] } | null {
  if (input.currentVersion == null) {
    return null;
  }
  if (input.wrapUserIds == null) {
    throw new WorkspaceKeyRotationError(
      "WORKSPACE_KEY_ROTATION_REQUIRED",
      409,
      "removing a member requires a new workspace key version wrapped for the remaining members",
    );
  }
  const recipients = new Set(
    input.activeMemberIds.filter((userId) => userId !== input.removedUserId),
  );
  if (recipients.has(input.removedUserId)) {
    throw new WorkspaceKeyRotationError("BAD_REQUEST", 400, "removed member must not keep a workspace key wrap");
  }
  const provided = new Set(input.wrapUserIds);
  if (provided.has(input.removedUserId)) {
    throw new WorkspaceKeyRotationError(
      "WORKSPACE_KEY_WRAP_SET_MISMATCH",
      400,
      "workspace key rotation must not include the removed member",
    );
  }
  if (provided.size !== input.wrapUserIds.length) {
    throw new WorkspaceKeyRotationError(
      "WORKSPACE_KEY_WRAP_SET_MISMATCH",
      400,
      "workspace key rotation wraps must be unique per member",
    );
  }
  if (provided.size !== recipients.size || [...recipients].some((userId) => !provided.has(userId))) {
    throw new WorkspaceKeyRotationError(
      "WORKSPACE_KEY_WRAP_SET_MISMATCH",
      400,
      "workspace key rotation must wrap the key for every remaining member",
    );
  }
  return {
    nextVersion: input.currentVersion + 1,
    recipientIds: [...recipients],
  };
}

/** Publish of version 1 must wrap every active member exactly once. */
export function assertWorkspaceKeyPublishSet(
  activeMemberIds: readonly string[],
  wrapUserIds: readonly string[],
): void {
  const expected = new Set(activeMemberIds);
  const provided = new Set(wrapUserIds);
  if (provided.size !== wrapUserIds.length || provided.size !== expected.size) {
    throw new WorkspaceKeyRotationError(
      "WORKSPACE_KEY_WRAP_SET_MISMATCH",
      400,
      "workspace key publish must wrap the key for every active member",
    );
  }
  for (const userId of expected) {
    if (!provided.has(userId)) {
      throw new WorkspaceKeyRotationError(
        "WORKSPACE_KEY_WRAP_SET_MISMATCH",
        400,
        "workspace key publish must wrap the key for every active member",
      );
    }
  }
}
