import type { CoreApiClient } from "@okkey/api";
import type { EncryptedBlobDto, WorkspaceMemberDto } from "@okkey/types";

import {
  bindClientMethod,
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
    base64ToBytes: base64.base64ToBytes,
  };
}

/**
 * Give the current workspace key to active members who do not have it yet.
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
    typeof input.core.grantWorkspaceKeyWrap !== "function"
  ) {
    return { granted: 0, skippedInvalidKeys: 0 };
  }
  const getWorkspaceKey = bindClientMethod(input.core, input.core.getWorkspaceKey);
  const listWorkspaceMembers = bindClientMethod(input.core, input.core.listWorkspaceMembers);
  const grantWorkspaceKeyWrap = bindClientMethod(input.core, input.core.grantWorkspaceKeyWrap);

  let state: Awaited<ReturnType<CoreApiClient["getWorkspaceKey"]>>;
  try {
    state = await getWorkspaceKey(input.workspaceId);
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
  const workspaceKey = await deps.unwrapWorkspaceKeyForSelf({
    encryptedWorkspaceKey: currentWrap.encrypted_workspace_key,
    recipientPrivateKey: identity.ed25519SecretKey,
    recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
  });

  const listed = await listWorkspaceMembers(input.workspaceId);
  let granted = 0;
  let skippedInvalidKeys = 0;
  for (const member of listed.members) {
    if (member.status !== "active" || !member.userId || member.userId === input.userId) {
      continue;
    }
    const added = await grantCurrentWrap({
      workspaceId: input.workspaceId,
      member,
      keyVersion: state.current_version,
      workspaceKey,
      deps,
      grantWorkspaceKeyWrap,
    });
    granted += added.granted;
    skippedInvalidKeys += added.skippedInvalidKeys;
  }
  return { granted, skippedInvalidKeys };
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
