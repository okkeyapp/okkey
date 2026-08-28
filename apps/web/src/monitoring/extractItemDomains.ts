import type { ItemFieldV2, ItemPlaintextV2 } from "@okkey/types";
import { parseHostFromUrl } from "@okkey/ui";

/** Same heuristic as domain-capabilities import script. */
export function normalizeDomainForCatalog(input: string): string {
  let raw = input.trim().toLowerCase();
  if (!raw) {
    return "";
  }
  raw = raw.replace(/^https?:\/\//, "");
  const host = raw.replace(/^www\./i, "").split("/")[0]?.split(":")[0] ?? "";
  if (!host) {
    return "";
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) {
    return host;
  }
  return parts.slice(-2).join(".");
}

function domainFromUrlField(field: ItemFieldV2): string | null {
  const { value } = field;
  if (value.kind === "url") {
    const host = parseHostFromUrl(value.url);
    if (!host) {
      return null;
    }
    const domain = normalizeDomainForCatalog(host);
    return domain.length > 0 ? domain : null;
  }
  if (field.type === "url" && value.kind === "text") {
    const host = parseHostFromUrl(value.text);
    if (!host) {
      return null;
    }
    const domain = normalizeDomainForCatalog(host);
    return domain.length > 0 ? domain : null;
  }
  return null;
}

export function extractItemDomains(item: ItemPlaintextV2): string[] {
  const domains = new Set<string>();
  for (const field of item.fields) {
    const domain = domainFromUrlField(field);
    if (domain) {
      domains.add(domain);
    }
  }
  return [...domains];
}

export function itemHasConfiguredTotp(item: ItemPlaintextV2): boolean {
  for (const field of item.fields) {
    if (field.value.kind === "totp") {
      const secret = field.value.secretBase32.trim();
      if (secret.length > 0) {
        return true;
      }
    }
    if (field.type === "totp" && field.value.kind === "unknown" && field.value.declaredType === "totp") {
      const raw = field.value.raw;
      if (raw && typeof raw === "object" && "secretBase32" in raw) {
        const secret = String((raw as { secretBase32?: string }).secretBase32 ?? "").trim();
        if (secret.length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}
