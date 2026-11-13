export const HTTP_AUTH_READY = "okkey.httpAuth.ready";
export const HTTP_AUTH_DECISION = "okkey.httpAuth.decision";
export const HTTP_AUTH_TIMEOUT = "okkey.httpAuth.timeout";
export const HTTP_AUTH_PORT_PREFIX = "okkey.httpAuth.";

/** How long the confirmation window may stay open before the challenge is declined. */
export const HTTP_AUTH_CONSENT_TIMEOUT_MS = 90_000;

export type HttpAuthPromptItem = {
  itemId: string;
  title: string;
  username: string;
};

/** Sent to the confirmation page. Passwords are never included. */
export type HttpAuthPromptView = {
  origin: string;
  insecureHttp: boolean;
  items: HttpAuthPromptItem[];
};

export type HttpAuthConsentResult =
  | { outcome: "decline" | "closed" | "timeout" }
  | { outcome: "confirm"; itemId: string; insecureHttpConfirmed: boolean };

export function toHttpAuthPromptView(input: {
  origin: string;
  insecureHttp: boolean;
  items: readonly {
    itemId: string;
    title: string;
    username: string;
    password?: string;
  }[];
}): HttpAuthPromptView {
  return {
    origin: input.origin,
    insecureHttp: input.insecureHttp,
    items: input.items.map((item) => ({
      itemId: item.itemId,
      title: item.title,
      username: item.username,
    })),
  };
}

function readRecord(message: unknown): Record<string, unknown> | null {
  if (!message || typeof message !== "object") {
    return null;
  }
  return message as Record<string, unknown>;
}

export function isHttpAuthRuntimeMessage(message: unknown): boolean {
  const record = readRecord(message);
  return typeof record?.type === "string" && record.type.startsWith("okkey.httpAuth.");
}

export function parseHttpAuthReady(message: unknown): { challengeId: string } | null {
  const record = readRecord(message);
  if (!record || record.type !== HTTP_AUTH_READY) {
    return null;
  }
  if (typeof record.challengeId !== "string" || record.challengeId.length === 0) {
    return null;
  }
  return { challengeId: record.challengeId };
}

/**
 * Accept only the fields the confirmation page is allowed to send.
 * A password property on the message is ignored and not returned.
 */
export function parseHttpAuthPromptResponse(response: unknown): HttpAuthPromptView | null {
  const record = readRecord(response);
  if (!record || record.ok !== true) {
    return null;
  }
  const prompt = readRecord(record.prompt);
  if (!prompt || typeof prompt.origin !== "string" || prompt.origin.length === 0) {
    return null;
  }
  if (!Array.isArray(prompt.items)) {
    return null;
  }
  const items: HttpAuthPromptItem[] = [];
  for (const entry of prompt.items) {
    const row = readRecord(entry);
    if (!row) {
      return null;
    }
    if (typeof row.itemId !== "string" || row.itemId.length === 0) {
      return null;
    }
    if (typeof row.title !== "string" || typeof row.username !== "string") {
      return null;
    }
    items.push({
      itemId: row.itemId,
      title: row.title,
      username: row.username,
    });
  }
  if (items.length === 0) {
    return null;
  }
  return {
    origin: prompt.origin,
    insecureHttp: prompt.insecureHttp === true,
    items,
  };
}

export function readHttpAuthDeadlineMs(response: unknown): number | null {
  const record = readRecord(response);
  if (!record || typeof record.deadlineMs !== "number" || !Number.isFinite(record.deadlineMs)) {
    return null;
  }
  return record.deadlineMs;
}

export function parseHttpAuthTimeout(message: unknown): { challengeId: string } | null {
  const record = readRecord(message);
  if (!record || record.type !== HTTP_AUTH_TIMEOUT) {
    return null;
  }
  if (typeof record.challengeId !== "string" || record.challengeId.length === 0) {
    return null;
  }
  return { challengeId: record.challengeId };
}

export function parseHttpAuthDecision(
  message: unknown,
): { challengeId: string; result: HttpAuthConsentResult } | null {
  const record = readRecord(message);
  if (!record || record.type !== HTTP_AUTH_DECISION) {
    return null;
  }
  if (typeof record.challengeId !== "string" || record.challengeId.length === 0) {
    return null;
  }
  if (record.outcome === "decline") {
    return { challengeId: record.challengeId, result: { outcome: "decline" } };
  }
  if (record.outcome !== "confirm") {
    return null;
  }
  if (typeof record.itemId !== "string" || record.itemId.length === 0) {
    return null;
  }
  return {
    challengeId: record.challengeId,
    result: {
      outcome: "confirm",
      itemId: record.itemId,
      insecureHttpConfirmed: record.insecureHttpConfirmed === true,
    },
  };
}
