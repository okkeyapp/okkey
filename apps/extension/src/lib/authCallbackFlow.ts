/**
 * PKCE callback decision for the extension auth tab.
 * The React page translates `errorKey` and only persists a session on success.
 */
import type { ExtensionPkcePending, ExtensionSession } from "./storage";

export const AUTH_CALLBACK_ERROR_KEY = {
  missingCode: "extension.authCallback.errorMissingCode",
  noPending: "extension.authCallback.errorNoPending",
  stateMismatch: "extension.authCallback.errorStateMismatch",
} as const;

export const AUTH_CALLBACK_SESSION_READY_KEY = "extension.authCallback.sessionReady";

export async function completeExtensionAuthCallback(input: {
  code: string;
  state: string;
  readPending: () => Promise<ExtensionPkcePending | null>;
  exchange: (pending: ExtensionPkcePending, code: string) => Promise<ExtensionSession>;
  persistSession: (session: ExtensionSession, pending: ExtensionPkcePending) => Promise<void>;
}): Promise<{ ok: true } | { ok: false; errorKey: string }> {
  const code = input.code.trim();
  const state = input.state.trim();
  if (!code || !state) {
    return { ok: false, errorKey: AUTH_CALLBACK_ERROR_KEY.missingCode };
  }
  const pending = await input.readPending();
  if (!pending) {
    return { ok: false, errorKey: AUTH_CALLBACK_ERROR_KEY.noPending };
  }
  if (pending.state !== state) {
    return { ok: false, errorKey: AUTH_CALLBACK_ERROR_KEY.stateMismatch };
  }
  const session = await input.exchange(pending, code);
  await input.persistSession(session, pending);
  return { ok: true };
}
