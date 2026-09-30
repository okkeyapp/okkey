/** Deep links into the web app (edit / capsules / settings stay on web). */

export function joinWebPath(webBaseUrl: string, pathWithQuery: string): string {
  const base = webBaseUrl.replace(/\/+$/, "");
  const path = pathWithQuery.startsWith("/") ? pathWithQuery : `/${pathWithQuery}`;
  return `${base}${path}`;
}

/** Encode popup query values but keep `|` literal (web `popupQuerySearch` convention). */
function encodePopupQueryParam(value: string): string {
  return encodeURIComponent(value).replaceAll("%7C", "|");
}

export function buildItemsDeepLink(input: {
  webBaseUrl: string;
  workspaceId?: string;
  itemId?: string;
  vaultId?: string;
  popup?: string;
}): string {
  const params = new URLSearchParams();
  if (input.workspaceId) {
    params.set("workspace", input.workspaceId);
  }
  if (input.itemId) {
    params.set("item", input.itemId);
  }
  if (input.vaultId) {
    params.set("vault", input.vaultId);
  }
  if (input.popup) {
    params.set("popup", input.popup);
  }
  const qs = params.toString();
  return joinWebPath(input.webBaseUrl, qs ? `/items?${qs}` : "/items");
}

export function buildNewItemDeepLink(input: {
  webBaseUrl: string;
  workspaceId?: string;
}): string {
  return buildItemsDeepLink({
    webBaseUrl: input.webBaseUrl,
    workspaceId: input.workspaceId,
    popup: "newItem",
  });
}

/** `/items?item={id}&popup=editItem|{id}` (+ optional workspace). */
export function buildEditItemDeepLink(input: {
  webBaseUrl: string;
  workspaceId?: string;
  itemId: string;
}): string {
  const parts: string[] = [];
  if (input.workspaceId) {
    parts.push(`workspace=${encodeURIComponent(input.workspaceId)}`);
  }
  parts.push(`item=${encodeURIComponent(input.itemId)}`);
  parts.push(`popup=${encodePopupQueryParam(`editItem|${input.itemId}`)}`);
  return joinWebPath(input.webBaseUrl, `/items?${parts.join("&")}`);
}

/** `/items?item={id}&popup=newCapsule&capsuleFromItem={id}` (+ optional workspace). */
export function buildNewCapsuleDeepLink(input: {
  webBaseUrl: string;
  workspaceId?: string;
  itemId: string;
}): string {
  const parts: string[] = [];
  if (input.workspaceId) {
    parts.push(`workspace=${encodeURIComponent(input.workspaceId)}`);
  }
  parts.push(`item=${encodeURIComponent(input.itemId)}`);
  parts.push("popup=newCapsule");
  parts.push(`capsuleFromItem=${encodeURIComponent(input.itemId)}`);
  return joinWebPath(input.webBaseUrl, `/items?${parts.join("&")}`);
}

export function buildCapsulesDeepLink(webBaseUrl: string): string {
  return joinWebPath(webBaseUrl, "/capsules");
}

export function buildDevicesSettingsDeepLink(webBaseUrl: string): string {
  return joinWebPath(webBaseUrl, `/items?popup=${encodePopupQueryParam("settings|devices")}`);
}

/** `/items?popup=settings|main` — account settings entry from extension. */
export function buildSettingsMainDeepLink(webBaseUrl: string): string {
  return joinWebPath(webBaseUrl, `/items?popup=${encodePopupQueryParam("settings|main")}`);
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
