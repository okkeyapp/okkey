import type { CoreApiClient } from "@okkey/api";
import type { PendingVaultWrapDto, WorkspacePermissionsMatrixDto } from "@okkey/types";

/** Ed25519 public key length (registration / pending wraps). */
const ED25519_PUBLIC_KEY_LEN = 32;
/** ML-KEM-768 encapsulation key length (FIPS 203). */
const MLKEM768_ENCAPSULATION_KEY_LEN = 1184;

function recipientPublicKeysAreValid(
  publicKey: string | null | undefined,
  publicPqKey: string | null | undefined,
  base64ToBytes: (value: string) => Uint8Array,
): boolean {
  if (typeof publicKey !== "string" || typeof publicPqKey !== "string") {
    return false;
  }
  try {
    const ed = base64ToBytes(publicKey.trim());
    const pq = base64ToBytes(publicPqKey.trim());
    return ed.length === ED25519_PUBLIC_KEY_LEN && pq.length === MLKEM768_ENCAPSULATION_KEY_LEN;
  } catch {
    return false;
  }
}

/**
 * Runtime used to finish staged vault-key wraps.
 * Production loads Core crypto and the web vault bundle.
 * Tests pass this explicitly so the module can run without Vite aliases.
 */
export type PendingVaultWrapRuntime = {
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
  unwrapVaultKeyForSelf: (input: {
    encryptedVaultKey: unknown;
    recipientPrivateKey: Uint8Array;
    recipientPqPrivateKey: Uint8Array;
  }) => Promise<Uint8Array>;
  wrapVaultKeyForRecipient: (input: {
    vaultKey: Uint8Array;
    recipientUserId: string;
    senderPrivateKey: Uint8Array;
    recipientPublicKey: Uint8Array;
    recipientPqPublicKey: Uint8Array;
  }) => Promise<unknown>;
  base64ToBytes: (value: string) => Uint8Array;
};

export type CompletePendingVaultWrapsResult = {
  skippedInvalidKeys: number;
};

/** Call site gate: only actors with `members:get` should hit pending-vault-wraps. */
export function canCompletePendingVaultWraps(
  permissions: WorkspacePermissionsMatrixDto | null | undefined,
): boolean {
  return (permissions?.members?.get ?? 0) >= 1;
}

function pendingWrapsDevLog(): boolean {
  try {
    const meta = import.meta as { env?: { DEV?: boolean } };
    if (meta.env?.DEV) {
      return true;
    }
  } catch {
    // ignore
  }
  return typeof process !== "undefined" && process.env.NODE_ENV === "development";
}

function apiErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function isIgnorableMembersApiError(error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== "ApiRequestError") {
    return false;
  }
  const status = apiErrorStatus(error);
  return status === 403 || status === 404;
}

function isExpectedSkip(error: unknown): boolean {
  const status = apiErrorStatus(error);
  // No vault key / member already gone / wrap already cleaned — quiet in prod.
  return status === 403 || status === 404;
}

function logPendingWrap(
  level: "expected" | "unexpected",
  message: string,
  detail?: unknown,
): void {
  if (level === "expected" && !pendingWrapsDevLog()) {
    return;
  }
  if (detail === undefined) {
    console.warn(`[pending-vault-wraps] ${message}`);
    return;
  }
  console.warn(`[pending-vault-wraps] ${message}`, detail);
}

async function loadDefaultPendingVaultWrapRuntime(): Promise<PendingVaultWrapRuntime> {
  const crypto = await import("@okkey/crypto");
  const base64 = await import("@/auth/base64");
  const bundle = await import("@/auth/localVaultBundle");
  return {
    readVaultBundle: bundle.readVaultBundle,
    decryptUserIdentityFromEncryptedBlob: crypto.decryptUserIdentityFromEncryptedBlob,
    unwrapVaultKeyForSelf: crypto.unwrapVaultKeyForSelf,
    wrapVaultKeyForRecipient: crypto.wrapVaultKeyForRecipient,
    base64ToBytes: base64.base64ToBytes,
  };
}

export async function tryCompletePendingVaultWraps(
  input: {
    core: CoreApiClient;
    workspaceId: string;
    userId: string;
    accountVaultKey: Uint8Array;
  },
  runtime?: PendingVaultWrapRuntime,
): Promise<CompletePendingVaultWrapsResult> {
  let wraps: PendingVaultWrapDto[];
  let skippedInvalidKeys = 0;
  try {
    const response = await input.core.listPendingVaultWraps(input.workspaceId);
    wraps = response.wraps;
    skippedInvalidKeys = Array.isArray(response.skippedInvalidKeyRecipients)
      ? response.skippedInvalidKeyRecipients.length
      : 0;
  } catch (error) {
    if (isIgnorableMembersApiError(error)) {
      logPendingWrap("expected", "list ignored", {
        status: apiErrorStatus(error),
        workspaceId: input.workspaceId,
      });
      return { skippedInvalidKeys: 0 };
    }
    throw error;
  }
  if (wraps.length === 0) {
    // Server may still report skipped invalid-key recipients with no wrappable rows.
    return { skippedInvalidKeys };
  }

  const deps = runtime ?? (await loadDefaultPendingVaultWrapRuntime());
  const bundle = deps.readVaultBundle(input.userId);
  if (!bundle) {
    logPendingWrap("expected", "no local vault bundle; skip", { userId: input.userId });
    // Preserve server-reported skips so the admin toast can still fire.
    return { skippedInvalidKeys };
  }
  const identity = await deps.decryptUserIdentityFromEncryptedBlob(
    input.accountVaultKey,
    bundle.encrypted_private_key.payload,
  );

  const byVault = new Map<string, PendingVaultWrapDto[]>();
  for (const wrap of wraps) {
    const list = byVault.get(wrap.vaultId) ?? [];
    list.push(wrap);
    byVault.set(wrap.vaultId, list);
  }

  for (const [vaultId, recipients] of byVault) {
    try {
      const currentWrapped = await input.core.getVaultKey(vaultId);
      const vaultKey = await deps.unwrapVaultKeyForSelf({
        encryptedVaultKey: currentWrapped.encryptedVaultKey,
        recipientPrivateKey: identity.ed25519SecretKey,
        recipientPqPrivateKey: identity.mlkem768DecapsulationKey,
      });
      for (const recipient of recipients) {
        if (!recipientPublicKeysAreValid(recipient.publicKey, recipient.publicPqKey, deps.base64ToBytes)) {
          skippedInvalidKeys += 1;
          logPendingWrap("unexpected", "skip recipient with invalid public key", {
            vaultId,
            userId: recipient.userId,
          });
          continue;
        }
        try {
          const encryptedVaultKey = await deps.wrapVaultKeyForRecipient({
            vaultKey,
            recipientUserId: recipient.userId,
            senderPrivateKey: identity.ed25519SecretKey,
            recipientPublicKey: deps.base64ToBytes(recipient.publicKey),
            recipientPqPublicKey: deps.base64ToBytes(recipient.publicPqKey!),
          });
          await input.core.updateMemberVaultAccess(input.workspaceId, recipient.userId, {
            changes: [
              {
                vaultId,
                profileId: recipient.profileId,
                encryptedVaultKey,
                baseVersion: 0,
              },
            ],
          });
        } catch (error) {
          logPendingWrap(
            isExpectedSkip(error) ? "expected" : "unexpected",
            "recipient wrap/update failed",
            {
              vaultId,
              userId: recipient.userId,
              status: apiErrorStatus(error),
              message: error instanceof Error ? error.message : String(error),
            },
          );
        }
      }
    } catch (error) {
      logPendingWrap(
        isExpectedSkip(error) ? "expected" : "unexpected",
        "vault unwrap/key read failed",
        {
          vaultId,
          status: apiErrorStatus(error),
          message: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  return { skippedInvalidKeys };
}
