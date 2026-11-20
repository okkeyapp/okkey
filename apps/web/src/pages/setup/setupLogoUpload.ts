/** Decide whether finish should upload a pending workspace logo. */
export function setupLogoUploadDecision(input: {
  hadPendingLogo: boolean;
  unlockOk: boolean;
  hasVaultKey: boolean;
  hasPlaintext: boolean;
}): "upload" | "fail" | "skip" {
  if (!input.hadPendingLogo) {
    return "skip";
  }
  if (!input.unlockOk || !input.hasVaultKey || !input.hasPlaintext) {
    return "fail";
  }
  return "upload";
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
