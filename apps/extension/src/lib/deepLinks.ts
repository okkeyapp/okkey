/** Deep links into the web app (edit / capsules / settings stay on web). */

export function joinWebPath(webBaseUrl: string, pathWithQuery: string): string {
  const base = webBaseUrl.replace(/\/+$/, "");
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return `${base}${path}`;
}

export function buildItemsDeepLink(input: {
  webBaseUrl: string;
  workspaceId?: string;
  itemId?: string;
}): string {
  const params = new URLSearchParams();
  if (input.workspaceId) {
    params.set("workspace", input.workspaceId);
  }
  if (input.itemId) {
    params.set("item", input.itemId);
  }
  const qs = params.toString();
  return joinWebPath(input.webBaseUrl, qs ? `/items?${qs}` : "/items");
}

export function buildEditItemDeepLink(input: {
  webBaseUrl: string;
  workspaceId: string;
  itemId: string;
}): string {
  const params = new URLSearchParams({
    workspace: input.workspaceId,
    item: input.itemId,
    popup: "editItem",
  });
  return joinWebPath(input.webBaseUrl, `/items?${params.toString()}`);
}

export function buildCapsulesDeepLink(webBaseUrl: string): string {
  return joinWebPath(webBaseUrl, "/capsules");
}

export function buildDevicesSettingsDeepLink(webBaseUrl: string): string {
  return joinWebPath(webBaseUrl, "/items?popup=settings%7Cdevices");
}

export async function openWebDeepLink(url: string): Promise<void> {
  await browser.tabs.create({ url });
}

export async function readActiveTabUrl(): Promise<string | null> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const url = tabs[0]?.url?.trim();
    if (!url || url.startsWith("chrome://") || url.startsWith("about:") || url.startsWith("moz-extension://")) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}
