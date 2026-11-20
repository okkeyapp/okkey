/**
 * Autofill rules for login items that use optional `linkedAccountItemId` ("Sign in with").
 *
 * Security: never return the linked provider item's username/password/TOTP for fill on the
 * relying-party site. Only the selected (target-site) item's own fields may be filled.
 *
 * Shared resolution helpers come from `@okkey/vault-ui/items/linkedAccountItem` (subpath,
 * not the React barrel). Local secret extraction is injected by the caller so node:test
 * does not load `@okkey/vault`'s UI-adjacent entry graph.
 */
import type { ItemPlaintextV2 } from "@okkey/types";
import {
  resolveLinkedAccountItem,
  type LinkedAccountResolution,
} from "@okkey/vault-ui/items/linkedAccountItem";

export type LinkedAutofillLinkStatus = "none" | "ok" | "lost";

export type LinkedAutofillSuggestionInfo = {
  linkStatus: LinkedAutofillLinkStatus;
  /** Subtitle for the suggestion row (username slot). */
  subtitle: string;
};

/** Minimal login secrets used by the linked-account fill policy. */
export type LinkedLoginLocalSecrets = {
  username: string;
  password: string;
  totpSecretBase32?: string;
};

/**
 * Build suggestion subtitle for a login item, resolving an optional linked account.
 * Does not read or expose provider secrets — only the linked item title (or lost label).
 */
export function linkedAccountSuggestionInfo(
  item: ItemPlaintextV2,
  lookup: (itemId: string) => ItemPlaintextV2 | undefined,
  labels: {
    /** e.g. (title) => `Sign in with ${title}` */
    signInWith: (title: string) => string;
    linkLost: string;
    /** Fallback when there is no link (usual username/email subtitle). */
    fallbackSubtitle: string;
  },
): LinkedAutofillSuggestionInfo {
  const resolution = resolveLinkedAccountItem(item.linkedAccountItemId, lookup);
  if (resolution.status === "none") {
    return { linkStatus: "none", subtitle: labels.fallbackSubtitle };
  }
  if (resolution.status === "lost") {
    return { linkStatus: "lost", subtitle: labels.linkLost };
  }
  const title = resolution.item.title.trim() || resolution.item.itemId;
  return {
    linkStatus: "ok",
    subtitle: labels.signInWith(title),
  };
}

export type LinkedLoginFillResult = {
  linkStatus: LinkedAutofillLinkStatus;
  /** Local (target-site item) secrets only — never from the provider item. */
  localSecrets: LinkedLoginLocalSecrets | null;
  /**
   * True when fill must not inject anything derived from the linked account.
   * Always true for linked items regarding the provider; local fields remain usable.
   */
  providerSecretsBlocked: boolean;
  resolution: LinkedAccountResolution;
};

/**
 * Resolve fill material for a login item.
 * When `linkedAccountItemId` is set, provider secrets must never be extracted — only the
 * selected item's own fields (passed in via `extractLocalSecrets(item)`).
 */
export function resolveLinkedLoginFill(
  item: ItemPlaintextV2,
  lookup: (itemId: string) => ItemPlaintextV2 | undefined,
  extractLocalSecrets: (item: ItemPlaintextV2) => LinkedLoginLocalSecrets | null,
): LinkedLoginFillResult {
  const resolution = resolveLinkedAccountItem(item.linkedAccountItemId, lookup);
  const localSecrets = extractLocalSecrets(item);
  if (resolution.status === "none") {
    return {
      linkStatus: "none",
      localSecrets,
      providerSecretsBlocked: false,
      resolution,
    };
  }
  // Linked (ok or lost): never touch the provider item for secrets.
  return {
    linkStatus: resolution.status === "ok" ? "ok" : "lost",
    localSecrets,
    providerSecretsBlocked: true,
    resolution,
  };
}

/**
 * Assert helper for tests: ensure a fill payload does not contain any of the
 * provider item's secret strings.
 */
export function fillLeaksProviderSecrets(
  fill: { username: string; password: string; totp?: string; values: Record<string, string> },
  providerSecrets: LinkedLoginLocalSecrets,
): boolean {
  const secrets = [
    providerSecrets.username,
    providerSecrets.password,
    providerSecrets.totpSecretBase32 ?? "",
  ].filter((value) => typeof value === "string" && value.length > 0);
  if (secrets.length === 0) {
    return false;
  }
  const haystack = [
    fill.username,
    fill.password,
    fill.totp ?? "",
    ...Object.values(fill.values),
  ]
    .join("\0")
    .toLowerCase();
  return secrets.some((secret) => haystack.includes(secret.toLowerCase()));
}
