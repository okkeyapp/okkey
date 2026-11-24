import type { CoreApiClient } from "@okkey/api";
import type { EncryptedBlobDto, WorkspaceMemberDto } from "@okkey/types";

import {
  bindClientMethod,
  bindWorkspaceKeyCore,
  isSwallowableWorkspaceKeyError,
  recipientPublicKeysAreValid,
} from "./workspaceKeyAccess";

export type PendingWorkspaceKeyRuntime = {
  readVaultBundle: (userId: string) => {
    encrypted_private_key: { payload: string };
  } | null;
  decryptUserIdentityFromEncryptedBlob: (
    accountVaultKey: Uint8Array,
    payload: string,
  ) => Promise<{
    ed25519SecretKey: Uint8Array;
    mlkem768DecapsulationKey: Uint8Array;
  }>;
  unwrapWorkspaceKeyForSelf: (input: {
    encryptedWorkspaceKey: unknown;
    recipientPrivateKey: Uint8Array;
    recipientPqPrivateKey: Uint8Array;
  }) => Promise<Uint8Array>;
  wrapWorkspaceKeyForMember: (input: {
    workspaceKey: Uint8Array;
    keyVersion: number;
    recipientUserId: string;
    recipientPublicKey: Uint8Array;
    recipientPqPublicKey: Uint8Array;
  }) => Promise<EncryptedBlobDto>;
  generateWorkspaceKey: () => Promise<Uint8Array>;
  base64ToBytes: (value: string) => Uint8Array;
};

export type CompletePendingWorkspaceKeyResult = {
  granted: number;
  skippedInvalidKeys: number;
};

async function loadDefaultRuntime(): Promise<PendingWorkspaceKeyRuntime> {
  const crypto = await import("@okkey/crypto");
  const base64 = await import("@/auth/base64");
  const bundle = await import("@/auth/localVaultBundle");
  return {
    readVaultBundle: bundle.readVaultBundle,
    decryptUserIdentityFromEncryptedBlob: crypto.decryptUserIdentityFromEncryptedBlob,
    unwrapWorkspaceKeyForSelf: crypto.unwrapWorkspaceKeyForSelf,
    wrapWorkspaceKeyForMember: crypto.wrapWorkspaceKeyForMember,
    generateWorkspaceKey: crypto.generateWorkspaceKey,
    base64ToBytes: base64.base64ToBytes,
  };
}

type PendingRotationsResponse = { removed_user_ids?: string[] };
type PendingRecipientsResponse = { user_ids?: string[] };

/**
 * On workspace open: rotate a queued removal first, then wrap the current key for members who lack it.
 * A member who does not hold the current key does nothing.
 * A 409 from an existing wrap is success. API 403/404 stops the pass quietly.
 */
export async function tryCompletePendingWorkspaceKey(
  input: {
    core: CoreApiClient;
    workspaceId: string;
    userId: string;
    accountVaultKey: Uint8Array;
  },
  runtime?: PendingWorkspaceKeyRuntime,
): Promise<CompletePendingWorkspaceKeyResult> {
  if (
    typeof input.core.getWorkspaceKey !== "function" ||
    typeof input.core.listWorkspaceMembers !== "function" ||
    typeof input.core.grantWorkspaceKeyWrap !== "function" ||
    typeof input.core.getHttpClient !== "function"
  ) {
    return { granted: 0, skippedInvalidKeys: 0 };
  }
  const bound = bindWorkspaceKeyCore(input.core);

  let state: Awaited<ReturnType<CoreApiClient["getWorkspaceKey"]>>;
  try {
    state = await bound.getWorkspaceKey(input.workspaceId);
  } catch (error) {
    if (isSwallowableWorkspaceKeyError(error)) {
      return { granted: 0, skippedInvalidKeys: 0 };
    }
    throw error;
  }
  if (state.current_version == null) {
    return { granted: 0, skippedInvalidKeys: 0 };
  }
  const currentWrap = state.wraps.find((wrap) => wrap.key_version === state.current_version);
  if (!currentWrap) {
    return { granted: 0, skippedInvalidKeys: 0 };
  }

  const deps = runtime ?? (await loadDefaultRuntime());
  const bundle = deps.readVaultBundle(input.userId);
  if (!bundle) {
    return { granted: 0, skippedInvalidKeys: 0 };
  }
  const identity = await deps.decryptUserIdentityFromEncryptedBlob(
    input.accountVaultKey,
    bundle.encrypted_private_key.payload,
  );
  let skippedInvalidKeys = 0;
  let workspaceKey = await deps.unwrapWorkspaceKeyForSelf({
    encryptedWorkspaceKey: currentWrap.encrypted_workspace_key,
    recipientPrivateKey: identity.ed25519SecretKey,
    recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
  });
  let keyVersion = state.current_version;

  const removed = new Set(await readRemovedUserIds(bound, input.workspaceId));
  if (removed.size > 0) {
    const listed = await bound.listWorkspaceMembers(input.workspaceId);
    const nextKey = await deps.generateWorkspaceKey();
    const nextVersion = keyVersion + 1;
    const wraps = [];
    for (const member of listed.members) {
      if (member.status !== "active" || !member.userId || removed.has(member.userId)) {
        continue;
      }
      if (
        !recipientPublicKeysAreValid(member.publicKey, member.publicPqKey, deps.base64ToBytes)
      ) {
        skippedInvalidKeys += 1;
        continue;
      }
      wraps.push({
        user_id: member.userId,
        encrypted_workspace_key: await deps.wrapWorkspaceKeyForMember({
          workspaceKey: nextKey,
          keyVersion: nextVersion,
          recipientUserId: member.userId,
          recipientPublicKey: deps.base64ToBytes(member.publicKey),
          recipientPqPublicKey: deps.base64ToBytes(member.publicPqKey!),
        }),
      });
    }
    const remaining = listed.members.filter(
      (member) => member.status === "active" && member.userId && !removed.has(member.userId),
    );
    if (skippedInvalidKeys === 0 && wraps.length === remaining.length && wraps.length > 0) {
      await bound.post(
        `/workspaces/${encodeURIComponent(input.workspaceId)}/workspace-key/deferred-rotation`,
        { wraps },
      );
      workspaceKey = nextKey;
      keyVersion = nextVersion;
    }
  }

  const pendingIds = new Set(await readPendingRecipientIds(bound, input.workspaceId));
  for (const userId of removed) {
    pendingIds.delete(userId);
  }
  pendingIds.delete(input.userId);
  if (pendingIds.size === 0) {
    return { granted: 0, skippedInvalidKeys };
  }
  const listed = await bound.listWorkspaceMembers(input.workspaceId);
  let granted = 0;
  for (const member of listed.members) {
    if (!member.userId || !pendingIds.has(member.userId)) {
      continue;
    }
    const added = await grantCurrentWrap({
      workspaceId: input.workspaceId,
      member,
      keyVersion,
      workspaceKey,
      deps,
      grantWorkspaceKeyWrap: bound.grantWorkspaceKeyWrap,
    });
    granted += added.granted;
    skippedInvalidKeys += added.skippedInvalidKeys;
  }
  return { granted, skippedInvalidKeys };
}

async function readRemovedUserIds(
  bound: ReturnType<typeof bindWorkspaceKeyCore>,
  workspaceId: string,
): Promise<string[]> {
  try {
    const body = await bound.get<PendingRotationsResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/workspace-key/pending-rotations`,
    );
    return Array.isArray(body.removed_user_ids) ? body.removed_user_ids : [];
  } catch (error) {
    if (isSwallowableWorkspaceKeyError(error)) {
      return [];
    }
    throw error;
  }
}

async function readPendingRecipientIds(
  bound: ReturnType<typeof bindWorkspaceKeyCore>,
  workspaceId: string,
): Promise<string[]> {
  try {
    const body = await bound.get<PendingRecipientsResponse>(
      `/workspaces/${encodeURIComponent(workspaceId)}/workspace-key/pending-recipients`,
    );
    return Array.isArray(body.user_ids) ? body.user_ids : [];
  } catch (error) {
    if (isSwallowableWorkspaceKeyError(error)) {
      return [];
    }
    throw error;
  }
}

/** Wrap the current key for one member who was just added. Missing key or an existing wrap is not a failure. */
export async function grantWorkspaceKeyToMember(
  input: {
    core: CoreApiClient;
    workspaceId: string;
    userId: string;
    accountVaultKey: Uint8Array;
    member: WorkspaceMemberDto;
  },
  runtime?: PendingWorkspaceKeyRuntime,
): Promise<void> {
  if (!input.member.userId || input.member.userId === input.userId || input.member.status !== "active") {
    return;
  }
  if (
    typeof input.core.getWorkspaceKey !== "function" ||
    typeof input.core.grantWorkspaceKeyWrap !== "function"
  ) {
    return;
  }
  const getWorkspaceKey = bindClientMethod(input.core, input.core.getWorkspaceKey);
  const grantWorkspaceKeyWrap = bindClientMethod(input.core, input.core.grantWorkspaceKeyWrap);
  let state: Awaited<ReturnType<CoreApiClient["getWorkspaceKey"]>>;
  try {
    state = await getWorkspaceKey(input.workspaceId);
  } catch (error) {
    if (isSwallowableWorkspaceKeyError(error)) {
      return;
    }
    throw error;
  }
  if (state.current_version == null) {
    return;
  }
  const currentWrap = state.wraps.find((wrap) => wrap.key_version === state.current_version);
  if (!currentWrap) {
    return;
  }
  const deps = runtime ?? (await loadDefaultRuntime());
  const bundle = deps.readVaultBundle(input.userId);
  if (!bundle) {
    return;
  }
  const identity = await deps.decryptUserIdentityFromEncryptedBlob(
    input.accountVaultKey,
    bundle.encrypted_private_key.payload,
  );
  const workspaceKey = await deps.unwrapWorkspaceKeyForSelf({
    encryptedWorkspaceKey: currentWrap.encrypted_workspace_key,
    recipientPrivateKey: identity.ed25519SecretKey,
    recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
  });
  await grantCurrentWrap({
    workspaceId: input.workspaceId,
    member: input.member,
    keyVersion: state.current_version,
    workspaceKey,
    deps,
    grantWorkspaceKeyWrap,
  });
}

async function grantCurrentWrap(input: {
  workspaceId: string;
  member: WorkspaceMemberDto;
  keyVersion: number;
  workspaceKey: Uint8Array;
  deps: PendingWorkspaceKeyRuntime;
  grantWorkspaceKeyWrap: (
    workspaceId: string,
    body: { user_id: string; encrypted_workspace_key: EncryptedBlobDto },
  ) => Promise<unknown>;
}): Promise<CompletePendingWorkspaceKeyResult> {
  if (!input.member.userId) {
    return { granted: 0, skippedInvalidKeys: 0 };
  }
  if (
    !recipientPublicKeysAreValid(
      input.member.publicKey,
      input.member.publicPqKey,
      input.deps.base64ToBytes,
    )
  ) {
    return { granted: 0, skippedInvalidKeys: 1 };
  }
  try {
    const encrypted = await input.deps.wrapWorkspaceKeyForMember({
      workspaceKey: input.workspaceKey,
      keyVersion: input.keyVersion,
      recipientUserId: input.member.userId,
      recipientPublicKey: input.deps.base64ToBytes(input.member.publicKey),
      recipientPqPublicKey: input.deps.base64ToBytes(input.member.publicPqKey!),
    });
    await input.grantWorkspaceKeyWrap(input.workspaceId, {
      user_id: input.member.userId,
      encrypted_workspace_key: encrypted,
    });
    return { granted: 1, skippedInvalidKeys: 0 };
  } catch (error) {
    if (isSwallowableWorkspaceKeyError(error)) {
      return { granted: 0, skippedInvalidKeys: 0 };
    }
    throw error;
  }
}
