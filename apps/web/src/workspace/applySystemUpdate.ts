import { getApiBaseUrl } from "../api/client";
import { readStoredSession } from "../auth/sessionAuthStorage";

export type ApplySystemUpdateResult =
  | { ok: true }
  | { ok: false; error: "UPDATE_APPLY_UNAVAILABLE" | "APPLY_FAILED"; message: string | null };

/**
 * POST /updates/apply. Until the signed update agent exists the API returns 501;
 * this helper maps that to a typed failure without mutating local state.
 */
export async function applySystemUpdate(): Promise<ApplySystemUpdateResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const token = readStoredSession()?.access_token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${getApiBaseUrl()}/updates/apply`, {
      method: "POST",
      headers,
      body: "{}",
    });
    if (response.ok) {
      return { ok: true };
    }
    let errorCode: string | null = null;
    let message: string | null = null;
    try {
      const body = (await response.json()) as { error?: unknown; message?: unknown };
      errorCode = typeof body.error === "string" ? body.error : null;
      message = typeof body.message === "string" ? body.message : null;
    } catch {
      // non-JSON body
    }
    if (response.status === 501 || errorCode === "UPDATE_APPLY_UNAVAILABLE") {
      return { ok: false, error: "UPDATE_APPLY_UNAVAILABLE", message };
    }
    return { ok: false, error: "APPLY_FAILED", message };
  } catch {
    return { ok: false, error: "APPLY_FAILED", message: null };
  }
}
