import { listCachedWorkspaceVaultItems } from "@okkey/vault";

import { ensureAutofillDeviceTrusted } from "./autofillBroker.ts";
import { readSession } from "./storage.ts";
import { touchExtensionUnlockSession } from "./extensionVaultSession.ts";
import { readStoredCurrentWorkspaceId } from "./vaultStorage.ts";
import type { HttpAuthMatch } from "./httpAuthDecision.ts";
import { collectHttpAuthCandidates } from "./httpAuthMatch.ts";

/**
 * Vault logins for one basic-auth challenge.
 * Locked, signed-out, or untrusted sessions yield no matches (native dialog).
 */
export async function loadHttpAuthCandidates(challengeUrl: string): Promise<HttpAuthMatch[]> {
  const trust = await ensureAutofillDeviceTrusted();
  if (trust !== "ok") {
    return [];
  }
  const session = await readSession();
  if (!session) {
    return [];
  }
  const workspaceId = await readStoredCurrentWorkspaceId(session.user_id);
  if (!workspaceId) {
    return [];
  }
  const items = await listCachedWorkspaceVaultItems({
    userId: session.user_id,
    workspaceId,
  });
  const matches = collectHttpAuthCandidates(items, challengeUrl);
  if (matches.length > 0) {
    await touchExtensionUnlockSession(session.user_id);
  }
  return matches;
}
