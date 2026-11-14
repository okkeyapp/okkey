import { deriveLoginKey, wipeBytes } from "@okkey/crypto";

import { createAuthenticatedCoreClient } from "../api/client";
import { bytesToBase64 } from "./base64";
import { readLocalProfile } from "./localProfileStorage";

/** Base64 login key. Caller still owns `masterPasswordUtf8`. */
export async function loginKeyBase64(
  email: string,
  masterPasswordUtf8: Uint8Array,
): Promise<string | null> {
  if (!email.trim() || masterPasswordUtf8.length === 0) {
    return null;
  }
  const loginKey = await deriveLoginKey({
    masterPasswordUtf8,
    email,
  });
  try {
    return bytesToBase64(loginKey);
  } finally {
    wipeBytes(loginKey);
  }
}

/**
 * After a successful unlock, enroll a login verifier for accounts that have none.
 * Existing users keep the emailed-code path until this succeeds.
 */
export async function enrollLoginVerifierIfMissing(params: {
  accessToken: string;
  userId: string;
  masterPasswordUtf8: Uint8Array;
}): Promise<void> {
  const email = readLocalProfile(params.userId)?.email;
  if (!email) {
    return;
  }
  const core = createAuthenticatedCoreClient(params.accessToken);
  const status = await core.getLoginVerifierStatus();
  if (status.enrolled) {
    return;
  }
  const loginKey = await loginKeyBase64(email, params.masterPasswordUtf8);
  if (!loginKey) {
    return;
  }
  await core.enrollLoginVerifier({ login_key: loginKey });
}
