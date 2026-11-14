import { canonicalHttpOrigin, formatHttpOriginForDisplay, httpOriginIsInsecure } from "./httpAuthOrigin.ts";
import {
  toHttpAuthPromptView,
  type HttpAuthConsentResult,
  type HttpAuthPromptView,
} from "./httpAuthMessages.ts";

export type HttpAuthChallengeDetails = {
  url?: string;
  scheme?: string;
  isProxy?: boolean;
};

export type HttpAuthMatch = {
  itemId: string;
  title: string;
  username: string;
  password: string;
};

export type HttpAuthBlockingResponse = {
  authCredentials: {
    username: string;
    password: string;
  };
};

export type DecideHttpBasicAuthInput = {
  enabled: boolean;
  details: HttpAuthChallengeDetails;
  findMatches: (challengeUrl: string) => Promise<readonly HttpAuthMatch[]>;
  requestConsent: (view: HttpAuthPromptView) => Promise<HttpAuthConsentResult>;
  log?: (line: string) => void;
};

const AUTHORIZATION_HEADER = /authorization\s*:/i;

/**
 * Drop a log line that contains a password or an Authorization header.
 * Returns null when the line must not be logged.
 */
export function sanitizeHttpAuthLog(message: string, secrets: readonly string[]): string | null {
  if (AUTHORIZATION_HEADER.test(message)) {
    return null;
  }
  for (const secret of secrets) {
    if (secret.length > 0 && message.includes(secret)) {
      return null;
    }
  }
  return message;
}

function isBasicScheme(scheme: string | undefined): boolean {
  return (scheme ?? "").trim().toLowerCase() === "basic";
}

/**
 * Decide whether this basic-auth challenge receives vault credentials.
 * Returns undefined (no credentials) unless the setting is on, an item matches
 * the exact origin, the user confirms, and an http:// challenge has a second confirmation.
 */
export async function decideHttpBasicAuth(
  input: DecideHttpBasicAuthInput,
): Promise<HttpAuthBlockingResponse | undefined> {
  const secrets: string[] = [];
  const log = (line: string) => {
    if (!input.log) {
      return;
    }
    const safe = sanitizeHttpAuthLog(line, secrets);
    if (safe !== null) {
      input.log(safe);
    }
  };

  if (!input.enabled) {
    log("http-auth ignored: setting off");
    return undefined;
  }
  if (input.details.isProxy) {
    log("http-auth ignored: proxy challenge");
    return undefined;
  }
  if (!isBasicScheme(input.details.scheme)) {
    log("http-auth ignored: scheme is not basic");
    return undefined;
  }
  const challengeUrl = input.details.url ?? "";
  const origin = canonicalHttpOrigin(challengeUrl);
  if (!origin) {
    log("http-auth ignored: challenge URL has no http(s) origin");
    return undefined;
  }

  let matches: readonly HttpAuthMatch[] = [];
  try {
    matches = await input.findMatches(challengeUrl);
  } catch {
    log("http-auth match failed");
    return undefined;
  }
  for (const match of matches) {
    if (match.password.length > 0) {
      secrets.push(match.password);
    }
  }
  if (matches.length === 0) {
    log(`http-auth no match origin=${origin}`);
    return undefined;
  }

  const insecureHttp = httpOriginIsInsecure(origin);
  const view = toHttpAuthPromptView({
    origin: formatHttpOriginForDisplay(challengeUrl) ?? origin,
    insecureHttp,
    items: matches,
  });

  let consent: HttpAuthConsentResult;
  try {
    consent = await input.requestConsent(view);
  } catch {
    log("http-auth consent failed");
    return undefined;
  }
  const decision = consent;

  if (decision.outcome === "decline") {
    log(`http-auth declined origin=${origin}`);
    return undefined;
  }
  if (decision.outcome === "closed") {
    log(`http-auth closed origin=${origin}`);
    return undefined;
  }
  if (decision.outcome === "timeout") {
    log(`http-auth timeout origin=${origin}`);
    return undefined;
  }

  const chosen = matches.find((match) => match.itemId === decision.itemId);
  if (!chosen || chosen.password.length === 0) {
    log(`http-auth no match origin=${origin}`);
    return undefined;
  }
  if (insecureHttp && !decision.insecureHttpConfirmed) {
    log(`http-auth http warning not confirmed origin=${origin}`);
    return undefined;
  }

  log(`http-auth confirmed origin=${origin} item=${chosen.itemId}`);
  return {
    authCredentials: {
      username: chosen.username,
      password: chosen.password,
    },
  };
}
