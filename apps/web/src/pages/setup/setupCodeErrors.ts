/** Classify setup-code verify failures by API `body.error` (not `body.message`). */
export type SetupCodeErrorKind = "invalid" | "locked" | "generic";

export function setupCodeErrorKind(error: unknown): SetupCodeErrorKind {
  if (!error || typeof error !== "object" || !("body" in error)) {
    return "generic";
  }
  const body = (error as { body?: { error?: unknown }; status?: unknown }).body;
  const code = body?.error;
  if (code === "SETUP_CODE_INVALID") {
    return "invalid";
  }
  if (code === "SETUP_CODE_LOCKED") {
    return "locked";
  }
  const status = (error as { status?: unknown }).status;
  if (status === 429) {
    return "locked";
  }
  return "generic";
}
