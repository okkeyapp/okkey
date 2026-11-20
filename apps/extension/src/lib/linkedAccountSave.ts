/**
 * Helpers for attaching `linkedAccountItemId` when saving a login from the page.
 */
import type { ItemPlaintextV2 } from "@okkey/types";
// Subpath export — shared helpers without the vault-ui React barrel (safe for node:test).
import { normalizeLinkedAccountItemId } from "@okkey/vault-ui/items/linkedAccountItem";

/**
 * Apply (or clear) the encrypted-payload linked account id on a login item draft.
 * Does not mutate the input item.
 */
export function applyLinkedAccountItemId(
  item: ItemPlaintextV2,
  linkedAccountItemId: string | undefined | null,
  nowMs = Date.now(),
): ItemPlaintextV2 {
  const normalized = normalizeLinkedAccountItemId(linkedAccountItemId);
  if (!normalized) {
    if (!item.linkedAccountItemId) {
      return item;
    }
    const { linkedAccountItemId: _removed, ...rest } = item;
    return { ...rest, updatedAtMs: nowMs };
  }
  if (item.linkedAccountItemId === normalized) {
    return item;
  }
  return {
    ...item,
    linkedAccountItemId: normalized,
    updatedAtMs: nowMs,
  };
}

/**
 * Whether a save offer may proceed without a captured password
 * (OAuth / Sign-in-with flow, or an explicit linked account already chosen).
 */
export function allowPasswordlessLoginSave(input: {
  password: string;
  oauthDetected?: boolean;
  linkedAccountItemId?: string | null;
}): boolean {
  if (input.password.trim().length > 0) {
    return true;
  }
  if (input.oauthDetected) {
    return true;
  }
  return Boolean(normalizeLinkedAccountItemId(input.linkedAccountItemId));
}

/**
 * Build the list of login items eligible as "Sign in with" targets.
 * Login category only; excludes deleted/archived and optional self id.
 */
export function listLoginLinkTargetItems(
  items: readonly ItemPlaintextV2[],
  options?: { excludeItemId?: string },
): ItemPlaintextV2[] {
  const exclude = options?.excludeItemId?.trim() || "";
  return items
    .filter(
      (item) =>
        item.categoryId === "login" &&
        !item.deleted &&
        !item.archived &&
        (!exclude || item.itemId !== exclude),
    )
    .slice()
    .sort((a, b) =>
      (a.title || a.itemId).localeCompare(b.title || b.itemId, undefined, {
        sensitivity: "base",
      }),
    );
}

/** Minimal shape for OAuth-provider preselection against picker targets. */
export type LinkedAccountPreselectCandidate = {
  itemId: string;
  title: string;
  websiteUrls?: readonly string[];
  username?: string;
};

type ProviderMatchRule = {
  titleTokens: readonly string[];
  hostSuffixes: readonly string[];
};

/** Title/host cues that identify a saved login as belonging to a known IdP. */
const PROVIDER_MATCH_RULES: Record<string, ProviderMatchRule> = {
  Google: {
    titleTokens: ["google"],
    hostSuffixes: ["google.com", "accounts.google.com"],
  },
  Apple: {
    titleTokens: ["apple"],
    hostSuffixes: ["apple.com", "appleid.apple.com", "icloud.com"],
  },
  Facebook: {
    titleTokens: ["facebook", "meta"],
    hostSuffixes: ["facebook.com", "fb.com", "meta.com"],
  },
  Microsoft: {
    titleTokens: ["microsoft", "outlook", "hotmail", "live"],
    hostSuffixes: ["microsoft.com", "live.com", "microsoftonline.com", "outlook.com"],
  },
  GitHub: {
    titleTokens: ["github"],
    hostSuffixes: ["github.com"],
  },
  Yahoo: {
    titleTokens: ["yahoo"],
    hostSuffixes: ["yahoo.com", "login.yahoo.com"],
  },
  Twitter: {
    titleTokens: ["twitter", "x"],
    hostSuffixes: ["twitter.com", "x.com"],
  },
  Discord: {
    titleTokens: ["discord"],
    hostSuffixes: ["discord.com", "discordapp.com"],
  },
  LinkedIn: {
    titleTokens: ["linkedin"],
    hostSuffixes: ["linkedin.com"],
  },
  Yandex: {
    titleTokens: ["yandex", "яндекс"],
    hostSuffixes: ["yandex.ru", "yandex.com", "ya.ru"],
  },
  VK: {
    titleTokens: ["vk", "вконтакте", "вк"],
    hostSuffixes: ["vk.com", "vk.ru"],
  },
  "Mail.ru": {
    titleTokens: ["mail.ru", "mailru"],
    hostSuffixes: ["mail.ru"],
  },
  "OK.ru": {
    titleTokens: ["ok.ru", "одноклассники"],
    hostSuffixes: ["ok.ru"],
  },
};

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function hostMatchesSuffix(host: string, suffix: string): boolean {
  const h = normalizeHost(host);
  const s = normalizeHost(suffix);
  return Boolean(h) && (h === s || h.endsWith(`.${s}`));
}

function titleMatchesProviderToken(title: string, token: string): boolean {
  const t = title.trim();
  if (!t || !token) {
    return false;
  }
  if (t.toLowerCase() === token.toLowerCase()) {
    return true;
  }
  // Unicode-aware whole-token match (JS `\b` is ASCII-only).
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu");
  return re.test(t);
}

function candidateMatchesProvider(
  candidate: LinkedAccountPreselectCandidate,
  rule: ProviderMatchRule,
): boolean {
  if (rule.titleTokens.some((token) => titleMatchesProviderToken(candidate.title, token))) {
    return true;
  }
  for (const raw of candidate.websiteUrls ?? []) {
    try {
      const host = new URL(raw).hostname;
      if (rule.hostSuffixes.some((suffix) => hostMatchesSuffix(host, suffix))) {
        return true;
      }
    } catch {
      /* ignore invalid URL */
    }
  }
  return false;
}

/**
 * Filter login-link candidates that look like the given OAuth provider
 * (title token or known IdP host). Unknown / "Other" → empty list.
 */
export function matchLoginTargetsForProvider(
  candidates: readonly LinkedAccountPreselectCandidate[],
  providerHint: string | undefined | null,
): LinkedAccountPreselectCandidate[] {
  const key = typeof providerHint === "string" ? providerHint.trim() : "";
  if (!key || key === "Other") {
    return [];
  }
  const rule = PROVIDER_MATCH_RULES[key];
  if (!rule) {
    return [];
  }
  return candidates.filter((candidate) => candidateMatchesProvider(candidate, rule));
}

/**
 * Choose a default "Sign in with" selection for the save prompt.
 * Never silently links without UI — caller still shows the picker.
 *
 * - Keep an already-chosen link.
 * - Prefer a single candidate that matches the identified account (username/email).
 * - Else preselect when exactly one provider match exists.
 * - Ambiguous / no match → undefined ("No linked account").
 */
export function preselectLinkedAccountItemId(input: {
  providerHint?: string | null;
  candidates: readonly LinkedAccountPreselectCandidate[];
  /** Username/email captured on the page, when known. */
  identifiedAccountHint?: string | null;
  /** Already-chosen link — never override. */
  existingLinkedAccountItemId?: string | null;
}): string | undefined {
  const existing = normalizeLinkedAccountItemId(input.existingLinkedAccountItemId);
  if (existing) {
    return existing;
  }

  const matches = matchLoginTargetsForProvider(input.candidates, input.providerHint);
  const identity = (input.identifiedAccountHint ?? "").trim().toLowerCase();

  if (identity) {
    const identityAmongMatches = matches.filter(
      (candidate) => (candidate.username ?? "").trim().toLowerCase() === identity,
    );
    if (identityAmongMatches.length === 1) {
      return identityAmongMatches[0]?.itemId;
    }
    if (identityAmongMatches.length === 0) {
      const identityAmongAll = input.candidates.filter(
        (candidate) => (candidate.username ?? "").trim().toLowerCase() === identity,
      );
      if (identityAmongAll.length === 1) {
        return identityAmongAll[0]?.itemId;
      }
    }
  }

  if (matches.length === 1) {
    return matches[0]?.itemId;
  }
  return undefined;
}

/**
 * Whether the save UI should fetch/show login-link targets.
 * Locked vault: never load logins or show the picker.
 */
export function shouldLoadLoginLinkTargets(input: {
  locked: boolean;
  oauthDetected?: boolean;
  linkedAccountItemId?: string | null;
}): boolean {
  if (input.locked) {
    return false;
  }
  if (input.oauthDetected) {
    return true;
  }
  return Boolean(normalizeLinkedAccountItemId(input.linkedAccountItemId));
}
