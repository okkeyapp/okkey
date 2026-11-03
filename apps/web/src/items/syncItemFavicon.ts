import type { ItemFaviconSource, ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import type { KeyFieldFileValue } from "@okkey/ui";
import { keyFieldFileValueFromFaviconId as faviconAttachmentValue } from "@okkey/vault";

import { downloadKeyFieldFileAttachmentBytes, uploadEncryptedAttachment } from "../api/key-field-files";
import { previewItemFavicon } from "../api/item-favicons";
import { normalizeFaviconImageBytesToPng } from "../lib/resizeFaviconImage";
import type { ItemFormFaviconSyncInput } from "./useItemFormFavicon";
import { seedItemFaviconAttachmentUrl } from "./useItemFaviconAttachmentUrl";
import { websiteUrlsLookupKey } from "./useItemFormFaviconPreview";

const FAVICON_ATTACHMENT_NAME = "favicon.png";
const FAVICON_ATTACHMENT_MIME_TYPE = "image/png";

/** Client-side deadline for background / import `/favicon/preview` lookups. */
export const WEBSITE_FAVICON_LOOKUP_TIMEOUT_MS = 12_000;

async function readPreviewBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  // jsdom / odd Blob shims: Response can still materialize bytes.
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

export function collectWebsiteUrlsFromItem(item: ItemPlaintextV2): string[] {
  return item.fields
    .filter((field) => field.type === "url" && field.value.kind === "url")
    .map((field) => (field.value.kind === "url" ? field.value.url.trim() : ""))
    .filter((url) => url.length > 0);
}

export function websiteFaviconUrlsEqual(a: readonly string[], b: readonly string[]): boolean {
  return websiteUrlsLookupKey(a) === websiteUrlsLookupKey(b);
}

export function applyFaviconToItem(
  item: ItemPlaintextV2,
  faviconId?: string,
  faviconSource?: ItemFaviconSource,
): ItemPlaintextV2 {
  const next: ItemPlaintextV2 = { ...item };
  if (faviconId) {
    next.faviconId = faviconId;
  } else {
    delete next.faviconId;
  }
  if (faviconSource) {
    next.faviconSource = faviconSource;
  } else {
    delete next.faviconSource;
  }
  return next;
}

function keepPreviousWebsiteFavicon(item: ItemPlaintextV2, previous: ItemPlaintextV2): ItemPlaintextV2 {
  return applyFaviconToItem(item, previous.faviconId, previous.faviconSource ?? "website");
}

export type SyncItemFaviconResult = {
  item: ItemPlaintextV2;
  uploadedFavicon?: KeyFieldFileValue;
  /** PNG bytes uploaded in this call — seed the favicon URL cache to skip a GET. */
  uploadedPngBytes?: Uint8Array;
  /**
   * Save left the login needing a non-blocking `/favicon/preview` (create, or edit after a
   * website URL change without preview bytes yet).
   */
  needsBackgroundWebsiteFavicon?: boolean;
  /**
   * When background lookup positively returns no icon (HTTP 404), clear the favicon that was
   * kept from `previous` for this save. Never clear on network errors / timeouts / 5xx.
   */
  clearFaviconIfBackgroundAbsent?: boolean;
};

export type SyncItemFaviconOptions = {
  /**
   * When true, may call `/favicon/preview` (import / background attach).
   * Form Save must leave this false so a slow site never blocks the toast.
   */
  allowNetworkFetch?: boolean;
};

/** Outcome of a network favicon lookup (import / post-save background). */
export type WebsiteFaviconLookupResult =
  | { status: "found"; sync: SyncItemFaviconResult }
  | { status: "absent" }
  | { status: "unavailable" };

async function uploadFaviconAttachment(input: {
  accessToken: string;
  vaultKey: Uint8Array;
  item: ItemPlaintextV2;
  pngBytes: Uint8Array;
}): Promise<KeyFieldFileValue> {
  return uploadEncryptedAttachment({
    accessToken: input.accessToken,
    vaultId: input.item.vaultId,
    itemId: input.item.itemId,
    vaultKey: input.vaultKey,
    plaintext: input.pngBytes,
    name: FAVICON_ATTACHMENT_NAME,
    mimeType: FAVICON_ATTACHMENT_MIME_TYPE,
    sizeBytes: input.pngBytes.byteLength,
    purpose: "item-favicon",
  });
}

async function normalizeAndUploadWebsiteFavicon(input: {
  accessToken: string;
  vaultKey: Uint8Array;
  item: ItemPlaintextV2;
  rawBytes: Uint8Array;
}): Promise<SyncItemFaviconResult> {
  let pngBytes = input.rawBytes;
  try {
    pngBytes = await normalizeFaviconImageBytesToPng(input.rawBytes);
  } catch {
    // Fall back to original bytes if the browser cannot decode (tests / exotic formats).
  }
  const uploadedFavicon = await uploadFaviconAttachment({
    accessToken: input.accessToken,
    vaultKey: input.vaultKey,
    item: input.item,
    pngBytes,
  });
  return {
    item: applyFaviconToItem(input.item, uploadedFavicon.attachmentId, "website"),
    uploadedFavicon,
    uploadedPngBytes: pngBytes,
  };
}

/**
 * True when Save left the login without a website icon but URLs still need a fetch
 * (preview was in flight or skipped). Callers should schedule {@link lookupWebsiteFaviconFromNetwork}
 * without awaiting it in the Save toast path.
 */
export function shouldAttachWebsiteFaviconInBackground(
  item: ItemPlaintextV2,
  syncInput?: ItemFormFaviconSyncInput,
  syncResult?: Pick<SyncItemFaviconResult, "needsBackgroundWebsiteFavicon">,
): boolean {
  if (syncResult?.needsBackgroundWebsiteFavicon) {
    return true;
  }
  if (syncInput?.manualFaviconPng && syncInput.manualFaviconPng.byteLength > 0) {
    return false;
  }
  if (syncInput?.faviconSource === "manual" || item.faviconSource === "manual") {
    return false;
  }
  if (syncInput?.websiteFaviconPng && syncInput.websiteFaviconPng.byteLength > 0) {
    return false;
  }
  if (item.categoryId !== ITEM_CATEGORY_LOGIN) {
    return false;
  }
  if (collectWebsiteUrlsFromItem(item).length === 0) {
    return false;
  }
  return !item.faviconId;
}

/** Network favicon attach for import / post-save background work. */
export async function attachWebsiteFaviconFromNetwork(
  accessToken: string,
  vaultKey: Uint8Array,
  item: ItemPlaintextV2,
): Promise<SyncItemFaviconResult | null> {
  const result = await lookupWebsiteFaviconFromNetwork(accessToken, vaultKey, item);
  return result.status === "found" ? result.sync : null;
}

/**
 * Distinguishes a positive "no icon" (404) from a failed lookup so callers can keep a
 * previously stored favicon when the site is temporarily unreachable (503 / timeout / 5xx).
 *
 * Client timeout uses Promise.race (not a locally constructed AbortSignal) so background
 * lookups work under jsdom/undici realm mismatches; callers may still pass a same-realm
 * `signal` to cancel the underlying fetch.
 */
export async function lookupWebsiteFaviconFromNetwork(
  accessToken: string,
  vaultKey: Uint8Array,
  item: ItemPlaintextV2,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<WebsiteFaviconLookupResult> {
  if (item.categoryId !== ITEM_CATEGORY_LOGIN) {
    return { status: "absent" };
  }
  const urls = collectWebsiteUrlsFromItem(item);
  if (urls.length === 0) {
    return { status: "absent" };
  }

  if (options?.signal?.aborted) {
    return { status: "unavailable" };
  }

  const timeoutMs = options?.timeoutMs ?? WEBSITE_FAVICON_LOOKUP_TIMEOUT_MS;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("FAVICON_LOOKUP_TIMEOUT"));
    }, timeoutMs);
  });

  try {
    const previewBlob = await Promise.race([
      previewItemFavicon(accessToken, urls, options?.signal ? { signal: options.signal } : undefined),
      timeoutPromise,
    ]);
    if (!previewBlob) {
      return { status: "absent" };
    }
    const sync = await normalizeAndUploadWebsiteFavicon({
      accessToken,
      vaultKey,
      item,
      rawBytes: await readPreviewBlobBytes(previewBlob),
    });
    return { status: "found", sync };
  } catch {
    // Network / client timeout / 503 FAVICON_UNAVAILABLE / 5xx — keep previous icon.
    return { status: "unavailable" };
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

/** Persist favicon to MinIO only when saving the item (not during form preview). */
export async function syncItemFaviconForPlaintext(
  accessToken: string,
  vaultKey: Uint8Array,
  item: ItemPlaintextV2,
  previous?: ItemPlaintextV2,
  syncInput?: ItemFormFaviconSyncInput,
  options?: SyncItemFaviconOptions,
): Promise<SyncItemFaviconResult> {
  const faviconSource = syncInput?.faviconSource ?? item.faviconSource;

  if (syncInput?.manualFaviconPng && syncInput.manualFaviconPng.byteLength > 0) {
    const pngBytes = syncInput.manualFaviconPng;
    const uploadedFavicon = await uploadFaviconAttachment({
      accessToken,
      vaultKey,
      item,
      pngBytes,
    });
    const uploadedSource = syncInput.faviconSource ?? faviconSource ?? "manual";
    return {
      item: applyFaviconToItem(item, uploadedFavicon.attachmentId, uploadedSource),
      uploadedFavicon,
      uploadedPngBytes: pngBytes,
    };
  }

  if (faviconSource === "manual") {
    const faviconId =
      item.faviconId ??
      previous?.faviconId ??
      (syncInput?.reuseFaviconId?.trim() || undefined);
    const reuseFaviconItemId = syncInput?.reuseFaviconItemId?.trim();
    if (faviconId && reuseFaviconItemId && reuseFaviconItemId !== item.itemId) {
      const downloaded = await downloadKeyFieldFileAttachmentBytes({
        accessToken,
        vaultId: item.vaultId,
        itemId: reuseFaviconItemId,
        vaultKey,
        file: faviconAttachmentValue(faviconId),
      });
      const pngBytes = downloaded.plaintext;
      const uploadedFavicon = await uploadFaviconAttachment({
        accessToken,
        vaultKey,
        item,
        pngBytes,
      });
      return {
        item: applyFaviconToItem(item, uploadedFavicon.attachmentId, "manual"),
        uploadedFavicon,
        uploadedPngBytes: pngBytes,
      };
    }
    return { item: applyFaviconToItem(item, faviconId, "manual") };
  }

  if (item.categoryId !== ITEM_CATEGORY_LOGIN) {
    return { item: applyFaviconToItem(item, undefined, undefined) };
  }

  const urls = collectWebsiteUrlsFromItem(item);
  const previousUrls = previous ? collectWebsiteUrlsFromItem(previous) : [];
  const urlsUnchanged = previous != null && websiteFaviconUrlsEqual(urls, previousUrls);
  const previousHasWebsiteIcon = Boolean(previous?.faviconId);

  if (urls.length === 0) {
    return { item: applyFaviconToItem(item, undefined, undefined) };
  }

  // Unchanged website URL list: never re-upload or clear the stored icon (edit username, etc.).
  // Preview bytes from a name-triggered re-fetch must not churn the attachment either.
  if (urlsUnchanged && previousHasWebsiteIcon && previous) {
    return { item: keepPreviousWebsiteFavicon(item, previous) };
  }

  if (syncInput?.websiteFaviconPng && syncInput.websiteFaviconPng.byteLength > 0) {
    return normalizeAndUploadWebsiteFavicon({
      accessToken,
      vaultKey,
      item,
      rawBytes: syncInput.websiteFaviconPng,
    });
  }

  if (options?.allowNetworkFetch) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("FAVICON_LOOKUP_TIMEOUT"));
      }, WEBSITE_FAVICON_LOOKUP_TIMEOUT_MS);
    });
    try {
      const previewBlob = await Promise.race([
        previewItemFavicon(accessToken, urls),
        timeoutPromise,
      ]);
      if (!previewBlob) {
        // Positive "no icon" (HTTP 404). Unchanged URLs already returned above; when the URL
        // list changed, clear any previous icon. Keep only if we somehow still have unchanged URLs.
        if (urlsUnchanged && previousHasWebsiteIcon && previous) {
          return { item: keepPreviousWebsiteFavicon(item, previous) };
        }
        return { item: applyFaviconToItem(item, undefined, undefined) };
      }
      return await normalizeAndUploadWebsiteFavicon({
        accessToken,
        vaultKey,
        item,
        rawBytes: await readPreviewBlobBytes(previewBlob),
      });
    } catch {
      // Network / client timeout / 503 FAVICON_UNAVAILABLE / 5xx — never treat as absence.
      if (previousHasWebsiteIcon && previous) {
        return { item: keepPreviousWebsiteFavicon(item, previous) };
      }
      return { item: applyFaviconToItem(item, undefined, undefined) };
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  // Form Save path: never await /favicon/preview.
  // Keep a previous icon when present; refresh in the background after a URL change.
  if (previousHasWebsiteIcon && previous) {
    return {
      item: keepPreviousWebsiteFavicon(item, previous),
      needsBackgroundWebsiteFavicon: !urlsUnchanged,
      clearFaviconIfBackgroundAbsent: !urlsUnchanged,
    };
  }

  return {
    item: applyFaviconToItem(item, undefined, undefined),
    needsBackgroundWebsiteFavicon: true,
  };
}

/** Prefer local PNG bytes over an immediate GET /attachments after upload. */
export function seedFaviconUrlCacheAfterUpload(input: {
  vaultId: string;
  itemId: string;
  uploadedFavicon?: KeyFieldFileValue;
  uploadedPngBytes?: Uint8Array;
}): void {
  const faviconId = input.uploadedFavicon?.attachmentId?.trim();
  if (!faviconId || !input.uploadedPngBytes || input.uploadedPngBytes.byteLength === 0) {
    return;
  }
  seedItemFaviconAttachmentUrl({
    vaultId: input.vaultId,
    itemId: input.itemId,
    faviconId,
    pngBytes: input.uploadedPngBytes,
  });
}

export { keyFieldFileValueFromFaviconId } from "@okkey/vault";
