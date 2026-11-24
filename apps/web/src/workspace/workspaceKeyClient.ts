import type { CoreApiClient } from "@okkey/api";
import {
  decryptUserIdentityFromEncryptedBlob,
  decryptWorkspaceScopedBytes,
  encryptWorkspaceScopedBytes,
  generateWorkspaceKey,
  unwrapWorkspaceKeyForSelf,
  wrapWorkspaceKeyForMember,
} from "@okkey/crypto";
import type { Workspace } from "@okkey/types";
import { base64ToBytes, bytesToBase64 } from "@okkey/vault";

import { readVaultBundle } from "../auth/localVaultBundle";

type IdentityKeys = {
  ed25519SecretKey: Uint8Array;
  mlkem768DecapsulationKey: Uint8Array;
};

export type WorkspaceKeyMaterial = {
  currentVersion: number;
  currentKey: Uint8Array;
  keysByVersion: Map<number, Uint8Array>;
};

type ClientSettingsPlaintext = {
  tileColor: string | null;
};

async function loadIdentity(vaultKey: Uint8Array, userId: string | null): Promise<IdentityKeys> {
  const bundle = readVaultBundle(userId);
  if (!bundle?.encrypted_private_key?.payload) {
    throw new Error("VAULT_IDENTITY_BUNDLE_MISSING");
  }
  return decryptUserIdentityFromEncryptedBlob(vaultKey, bundle.encrypted_private_key.payload);
}

async function unwrapHeldKeys(
  core: CoreApiClient,
  workspaceId: string,
  identity: IdentityKeys,
): Promise<{ currentVersion: number | null; keysByVersion: Map<number, Uint8Array> }> {
  const state = await core.getWorkspaceKey(workspaceId);
  const keysByVersion = new Map<number, Uint8Array>();
  for (const wrap of state.wraps) {
    const key = await unwrapWorkspaceKeyForSelf({
      encryptedWorkspaceKey: wrap.encrypted_workspace_key,
      recipientPrivateKey: identity.ed25519SecretKey,
      recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
    });
    keysByVersion.set(wrap.key_version, key);
  }
  return { currentVersion: state.current_version, keysByVersion };
}

export async function loadWorkspaceKey(input: {
  core: CoreApiClient;
  workspaceId: string;
  vaultKey: Uint8Array;
  userId: string | null;
}): Promise<WorkspaceKeyMaterial> {
  const identity = await loadIdentity(input.vaultKey, input.userId);
  const held = await unwrapHeldKeys(input.core, input.workspaceId, identity);
  if (held.currentVersion == null) {
    throw new Error("WORKSPACE_KEY_MISSING");
  }
  const currentKey = held.keysByVersion.get(held.currentVersion);
  if (!currentKey) {
    throw new Error("WORKSPACE_KEY_WRAP_MISSING");
  }
  return {
    currentVersion: held.currentVersion,
    currentKey,
    keysByVersion: held.keysByVersion,
  };
}

export async function ensureWorkspaceKey(input: {
  core: CoreApiClient;
  workspaceId: string;
  vaultKey: Uint8Array;
  userId: string | null;
}): Promise<WorkspaceKeyMaterial> {
  try {
    return await loadWorkspaceKey(input);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "WORKSPACE_KEY_MISSING") {
      throw error;
    }
  }

  const listed = await input.core.listWorkspaceMembers(input.workspaceId);
  const recipients = listed.members.filter((member) => member.status === "active" && member.userId);
  if (recipients.length === 0) {
    throw new Error("WORKSPACE_KEY_RECIPIENTS_MISSING");
  }
  const workspaceKey = await generateWorkspaceKey();
  const wraps = [];
  for (const member of recipients) {
    if (!member.userId || !member.publicKey || !member.publicPqKey) {
      throw new Error("WORKSPACE_KEY_RECIPIENT_MISSING_PQ");
    }
    wraps.push({
      user_id: member.userId,
      encrypted_workspace_key: await wrapWorkspaceKeyForMember({
        workspaceKey,
        keyVersion: 1,
        recipientUserId: member.userId,
        recipientPublicKey: base64ToBytes(member.publicKey),
        recipientPqPublicKey: base64ToBytes(member.publicPqKey),
      }),
    });
  }
  await input.core.publishWorkspaceKey(input.workspaceId, { wraps });
  return {
    currentVersion: 1,
    currentKey: workspaceKey,
    keysByVersion: new Map([[1, workspaceKey]]),
  };
}

export async function encryptWorkspaceLogo(input: {
  core: CoreApiClient;
  workspaceId: string;
  vaultKey: Uint8Array;
  userId: string | null;
  plaintext: Uint8Array;
}): Promise<Uint8Array> {
  const material = await ensureWorkspaceKey(input);
  return encryptWorkspaceScopedBytes({
    key: material.currentKey,
    keyVersion: material.currentVersion,
    domain: "logo",
    plaintext: input.plaintext,
  });
}

export async function decryptWorkspaceLogo(input: {
  core: CoreApiClient;
  workspaceId: string;
  vaultKey: Uint8Array;
  userId: string | null;
}): Promise<Uint8Array> {
  const material = await loadWorkspaceKey(input);
  const logo = await input.core.getWorkspaceLogo(input.workspaceId);
  const version = new DataView(logo.bytes.buffer, logo.bytes.byteOffset, logo.bytes.byteLength).getUint32(0, false);
  const key = material.keysByVersion.get(version) ?? material.currentKey;
  const opened = await decryptWorkspaceScopedBytes({
    key,
    domain: "logo",
    ciphertext: logo.bytes,
  });
  return opened.plaintext;
}

function parseClientSettings(bytes: Uint8Array, fallback: ClientSettingsPlaintext): ClientSettingsPlaintext {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object") {
      return fallback;
    }
    const record = parsed as { tileColor?: unknown };
    return {
      tileColor: typeof record.tileColor === "string" || record.tileColor === null
        ? record.tileColor
        : fallback.tileColor,
    };
  } catch {
    return fallback;
  }
}

export async function saveWorkspaceClientSettings(input: {
  core: CoreApiClient;
  workspace: Pick<Workspace, "id" | "tileColor" | "clientSettingsCiphertext">;
  vaultKey: Uint8Array;
  userId: string | null;
  patch: {
    tileColor?: string | null;
  };
}): Promise<{ keyVersion: number; ciphertext: string; tileColor: string | null }> {
  const material = await ensureWorkspaceKey({
    core: input.core,
    workspaceId: input.workspace.id,
    vaultKey: input.vaultKey,
    userId: input.userId,
  });
  const fallback: ClientSettingsPlaintext = {
    tileColor: input.workspace.tileColor ?? null,
  };
  let current = fallback;
  let previous: Uint8Array | null = null;
  if (input.workspace.clientSettingsCiphertext) {
    previous = base64ToBytes(input.workspace.clientSettingsCiphertext);
    const version = new DataView(previous.buffer, previous.byteOffset, previous.byteLength).getUint32(0, false);
    const key = material.keysByVersion.get(version);
    if (key) {
      const opened = await decryptWorkspaceScopedBytes({
        key,
        domain: "client-settings",
        ciphertext: previous,
      });
      current = parseClientSettings(opened.plaintext, fallback);
    }
  }
  const next: ClientSettingsPlaintext = {
    tileColor: input.patch.tileColor !== undefined ? input.patch.tileColor : current.tileColor,
  };
  const plaintext = new TextEncoder().encode(JSON.stringify(next));
  const sealed = await encryptWorkspaceScopedBytes({
    key: material.currentKey,
    keyVersion: material.currentVersion,
    domain: "client-settings",
    plaintext,
  });
  const ciphertext = bytesToBase64(sealed);
  await input.core.putWorkspaceClientSettings(input.workspace.id, {
    ciphertext,
    tile_color: next.tileColor,
  });
  return {
    keyVersion: material.currentVersion,
    ciphertext,
    tileColor: next.tileColor,
  };
}

export async function buildWorkspaceKeyRotation(input: {
  core: CoreApiClient;
  workspaceId: string;
  vaultKey: Uint8Array;
  userId: string | null;
  removedUserId: string;
}): Promise<{ wraps: Array<{ user_id: string; encrypted_workspace_key: Awaited<ReturnType<typeof wrapWorkspaceKeyForMember>> }> } | null> {
  const state = await input.core.getWorkspaceKey(input.workspaceId);
  if (state.current_version == null) {
    return null;
  }
  const identity = await loadIdentity(input.vaultKey, input.userId);
  const currentWrap = state.wraps.find((wrap) => wrap.key_version === state.current_version);
  if (!currentWrap) {
    throw new Error("WORKSPACE_KEY_WRAP_MISSING");
  }
  const currentKey = await unwrapWorkspaceKeyForSelf({
    encryptedWorkspaceKey: currentWrap.encrypted_workspace_key,
    recipientPrivateKey: identity.ed25519SecretKey,
    recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
  });
  if (currentKey.length !== 32) {
    throw new Error("invalid workspace key");
  }
  const nextKey = await generateWorkspaceKey();
  const nextVersion = state.current_version + 1;
  const listed = await input.core.listWorkspaceMembers(input.workspaceId);
  const wraps = [];
  for (const member of listed.members) {
    if (member.status !== "active" || !member.userId || member.userId === input.removedUserId) {
      continue;
    }
    if (!member.publicKey || !member.publicPqKey) {
      throw new Error("WORKSPACE_KEY_RECIPIENT_MISSING_PQ");
    }
    wraps.push({
      user_id: member.userId,
      encrypted_workspace_key: await wrapWorkspaceKeyForMember({
        workspaceKey: nextKey,
        keyVersion: nextVersion,
        recipientUserId: member.userId,
        recipientPublicKey: base64ToBytes(member.publicKey),
        recipientPqPublicKey: base64ToBytes(member.publicPqKey),
      }),
    });
  }
  void currentKey;
  return { wraps };
}
