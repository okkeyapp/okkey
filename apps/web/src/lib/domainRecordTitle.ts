import { parseHostFromUrl } from "@okkey/ui";

import type { KeyFormEditorSection } from "../components/key-form/KeyFormEditor";

const HOST_READY_FOR_TITLE_RE = /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i;
const IPV4_HOST_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

function isIpv4Host(host: string): boolean {
  return IPV4_HOST_RE.test(host);
}

function capitalizeSegment(segment: string): string {
  if (!segment) {
    return "";
  }
  return segment.charAt(0).toLocaleUpperCase() + segment.slice(1);
}

/** Host is complete enough for auto-naming (domain, localhost, etc.). */
export function isHostReadyForRecordTitle(host: string): boolean {
  const normalized = host.replace(/^www\./i, "").toLowerCase();
  if (isIpv4Host(normalized)) {
    return true;
  }
  if (HOST_READY_FOR_TITLE_RE.test(normalized)) {
    return true;
  }
  // localhost, dev hostnames without a TLD
  if (/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/i.test(normalized) && normalized.length >= 2) {
    return true;
  }
  return false;
}

function domainToRecordTitleFromHost(host: string): string {
  const normalized = host.replace(/^www\./i, "").toLowerCase();
  if (isIpv4Host(normalized)) {
    return normalized;
  }
  const parts = normalized.split(".").filter(Boolean);
  if (parts.length === 0) {
    return "";
  }
  if (parts.length <= 2) {
    return capitalizeSegment(parts[0] ?? "");
  }

  return parts
    .slice(0, -1)
    .map(capitalizeSegment)
    .join(" ");
}

/** e.g. google.com → Google, app.yandex.ru → App Yandex */
export function domainToRecordTitle(hostOrUrl: string): string {
  const host = parseHostFromUrl(hostOrUrl);
  if (!host || !isHostReadyForRecordTitle(host)) {
    return "";
  }
  return domainToRecordTitleFromHost(host);
}

/** First website URL whose host is complete enough for auto-naming. */
export function suggestedRecordTitleFromWebsiteUrls(urls: readonly string[]): string {
  for (const url of urls) {
    const host = parseHostFromUrl(url);
    if (host && isHostReadyForRecordTitle(host)) {
      return domainToRecordTitleFromHost(host);
    }
  }
  return "";
}

export function collectWebsiteUrlsFromSections(sections: readonly KeyFormEditorSection[]): string[] {
  const websitesSection = sections.find((section) => section.id === "websites");
  if (!websitesSection) {
    return [];
  }

  return websitesSection.fields
    .filter((field) => field.type === "url" && typeof field.value === "string")
    .map((field) => (typeof field.value === "string" ? field.value.trim() : ""))
    .filter(Boolean);
}
