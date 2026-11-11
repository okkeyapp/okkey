import type { EncryptedBlob } from "../crypto/encrypted-blob.ts";
import { parseEncryptedBlobInput } from "../crypto/encrypted-blob.ts";
import type { WorkspaceKeyStore, WorkspaceKeyWrapRecord } from "./store.ts";

const WRAP_PAYLOAD_MAX_BYTES = 64 * 1024;

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

export type WorkspaceKeyWrapInput = {
  userId: string;
  encryptedWorkspaceKey: EncryptedBlob;
};

/**
 * Decide whether member removal must install a new workspace-key version.
 * Returns null when the workspace has no key yet.
 * A live key with no wrap set is a 409 and must not remove the membership.
 * The wrap set is exactly the remaining members, never the removed member, at version current+1.
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
  return planWrapSet({
    currentVersion: input.currentVersion,
    recipientIds: input.activeMemberIds.filter((userId) => userId !== input.removedUserId),
    excludedUserIds: [input.removedUserId],
    wrapUserIds: input.wrapUserIds,
  });
}

/**
 * A queued removal installs one new version for everyone still a member.
 * Returns null when there is no key or the queue is empty.
 */
export function planDeferredWorkspaceKeyRotation(input: {
  currentVersion: number | null;
  activeMemberIds: readonly string[];
  queuedRemovedUserIds: readonly string[];
  wrapUserIds: readonly string[] | null;
}): { nextVersion: number; recipientIds: string[] } | null {
  if (input.currentVersion == null || input.queuedRemovedUserIds.length === 0) {
    return null;
  }
  if (input.wrapUserIds == null) {
    throw new WorkspaceKeyRotationError(
      "WORKSPACE_KEY_ROTATION_REQUIRED",
      409,
      "deferred workspace key rotation requires wraps for the remaining members",
    );
  }
  const excluded = new Set(input.queuedRemovedUserIds);
  return planWrapSet({
    currentVersion: input.currentVersion,
    recipientIds: input.activeMemberIds.filter((userId) => !excluded.has(userId)),
    excludedUserIds: input.queuedRemovedUserIds,
    wrapUserIds: input.wrapUserIds,
  });
}

function planWrapSet(input: {
  currentVersion: number;
  recipientIds: readonly string[];
  excludedUserIds: readonly string[];
  wrapUserIds: readonly string[];
}): { nextVersion: number; recipientIds: string[] } {
  const recipients = new Set(input.recipientIds);
  const excluded = new Set(input.excludedUserIds);
  for (const userId of excluded) {
    recipients.delete(userId);
  }
  const provided = new Set(input.wrapUserIds);
  if ([...provided].some((userId) => excluded.has(userId))) {
    throw new WorkspaceKeyRotationError(
      "WORKSPACE_KEY_WRAP_SET_MISMATCH",
      400,
      "workspace key rotation must not include a removed member",
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

export function parseWorkspaceKeyWrap(value: unknown): WorkspaceKeyWrapInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WorkspaceKeyRotationError("BAD_REQUEST", 400, "workspace key wrap must be an object");
  }
  const userId = (value as { user_id?: unknown }).user_id;
  if (typeof userId !== "string" || userId.length === 0) {
    throw new WorkspaceKeyRotationError("BAD_REQUEST", 400, "workspace key wrap user_id is required");
  }
  let parsed: { blob: EncryptedBlob };
  try {
    parsed = parseEncryptedBlobInput((value as { encrypted_workspace_key?: unknown }).encrypted_workspace_key, {
      fieldName: "encrypted_workspace_key",
      maxPayloadBytes: WRAP_PAYLOAD_MAX_BYTES,
      allowLegacyString: false,
    });
  } catch (error) {
    throw new WorkspaceKeyRotationError(
      "BAD_REQUEST",
      400,
      error instanceof Error ? error.message : "invalid workspace key wrap",
    );
  }
  return { userId, encryptedWorkspaceKey: parsed.blob };
}

/** Reject a wrap whose entity, key version, or recipient does not match the write. */
export function assertWorkspaceKeyWrap(wrap: WorkspaceKeyWrapInput, keyVersion: number): WorkspaceKeyWrapRecord {
  const meta = wrap.encryptedWorkspaceKey.meta ?? {};
  if (meta["entity"] !== "workspace_key_wrap") {
    throw new WorkspaceKeyRotationError("BAD_REQUEST", 400, "encrypted blob is not a workspace key wrap");
  }
  if (meta["key_version"] !== keyVersion) {
    throw new WorkspaceKeyRotationError(
      "WORKSPACE_KEY_VERSION_MISMATCH",
      409,
      "workspace key wrap version does not match the required version",
    );
  }
  if (meta["recipient_user_id"] != null && meta["recipient_user_id"] !== wrap.userId) {
    throw new WorkspaceKeyRotationError(
      "BAD_REQUEST",
      400,
      "workspace key wrap recipient does not match user_id",
    );
  }
  return {
    userId: wrap.userId,
    keyVersion,
    encryptedWorkspaceKey: wrap.encryptedWorkspaceKey,
  };
}

/** Store operations used when a member leaves and when a later rotation is applied. */
export class WorkspaceKeyRemoval {
  private readonly store: WorkspaceKeyStore;

  constructor(store: WorkspaceKeyStore) {
    this.store = store;
  }

  readCurrentVersion(workspaceId: string): Promise<number | null> {
    return this.store.currentVersion(workspaceId);
  }

  activeMembers(workspaceId: string): Promise<string[]> {
    return this.store.activeMemberIds(workspaceId);
  }

  enqueue(workspaceId: string, removedUserId: string): Promise<void> {
    return this.store.enqueueRotation(workspaceId, removedUserId);
  }

  listQueue(workspaceId: string): Promise<string[]> {
    return this.store.listRotationQueue(workspaceId);
  }

  clearQueue(workspaceId: string): Promise<void> {
    return this.store.clearRotationQueue(workspaceId);
  }

  insertWraps(workspaceId: string, wraps: WorkspaceKeyWrapRecord[]): Promise<void> {
    return this.store.insertWraps(workspaceId, wraps);
  }

  deleteWraps(workspaceId: string, userId: string): Promise<void> {
    return this.store.deleteUserWraps(workspaceId, userId);
  }

  listMembersLackingCurrentWrap(workspaceId: string): Promise<string[]> {
    return this.store.listMembersLackingCurrentWrap(workspaceId);
  }
}
