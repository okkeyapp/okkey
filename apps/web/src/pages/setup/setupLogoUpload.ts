/**
 * Decide whether finish should upload a pending workspace logo.
 * Uses the in-memory registration vault key only — finish must not unlock the vault session.
 */
export function setupLogoUploadDecision(input: {
  hadPendingLogo: boolean;
  hasVaultKey: boolean;
  hasPlaintext: boolean;
}): "upload" | "fail" | "skip" {
  if (!input.hadPendingLogo) {
    return "skip";
  }
  if (!input.hasVaultKey || !input.hasPlaintext) {
    return "fail";
  }
  return "upload";
}

/**
 * Snapshot logo materials before applying the finish session.
 * `flushSync(applyAccessTokenResponse)` remounts away from `/setup` (GuestAuthOnly),
 * and the page unmount cleanup can wipe refs before the upload runs — locals survive.
 */
export function capturePendingLogoForFinish(input: {
  vaultKey: Uint8Array | null;
  plaintext: Uint8Array | null;
}): {
  vaultKey: Uint8Array | null;
  plaintext: Uint8Array | null;
  hadPendingLogo: boolean;
} {
  return {
    vaultKey: input.vaultKey,
    plaintext: input.plaintext,
    hadPendingLogo: Boolean(input.plaintext),
  };
}

/**
 * Unmount cleanup must not wipe logo materials while finish is still uploading.
 * After capture + session apply the refs may already be null; this only protects
 * the in-flight window before capture completes.
 */
export function shouldWipeLogoMaterialsOnUnmount(finishInFlight: boolean): boolean {
  return !finishInFlight;
}

/**
 * Run the post-finish logo upload when materials are present.
 * Callers surface `"failed"` to the user (never silent skip after a selection).
 */
export async function runSetupLogoUpload(input: {
  decision: ReturnType<typeof setupLogoUploadDecision>;
  vaultKey: Uint8Array | null;
  plaintext: Uint8Array | null;
  upload: (vaultKey: Uint8Array, plaintext: Uint8Array) => Promise<void>;
}): Promise<"uploaded" | "failed" | "skipped"> {
  if (input.decision === "skip") {
    return "skipped";
  }
  if (input.decision === "fail" || !input.vaultKey || !input.plaintext) {
    return "failed";
  }
  try {
    await input.upload(input.vaultKey, input.plaintext);
    return "uploaded";
  } catch {
    return "failed";
  }
}
