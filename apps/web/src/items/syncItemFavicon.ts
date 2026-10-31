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

export type SyncItemFaviconResult = {
  item: ItemPlaintextV2;
  uploadedFavicon?: KeyFieldFileValue;
  /** PNG bytes uploaded in this call — seed the favicon URL cache to skip a GET. */
  uploadedPngBytes?: Uint8Array;
};

export type SyncItemFaviconOptions = {
  /**
   * When true, may call `/favicon/preview` (import / background attach).
   * Form Save must leave this false so a slow site never blocks the toast.
   */
  allowNetworkFetch?: boolean;
};

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
 * (preview was in flight or skipped). Callers should schedule {@link attachWebsiteFaviconFromNetwork}
 * without awaiting it in the Save toast path.
 */
export function shouldAttachWebsiteFaviconInBackground(
  item: ItemPlaintextV2,
  syncInput?: ItemFormFaviconSyncInput,
): boolean {
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
  if (item.categoryId !== ITEM_CATEGORY_LOGIN) {
    return null;
  }
  const urls = collectWebsiteUrlsFromItem(item);
  if (urls.length === 0) {
    return null;
  }
  const previewBlob = await previewItemFavicon(accessToken, urls);
  if (!previewBlob) {
    return null;
  }
  return normalizeAndUploadWebsiteFavicon({
    accessToken,
    vaultKey,
    item,
    rawBytes: new Uint8Array(await previewBlob.arrayBuffer()),
  });
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

  if (urls.length === 0) {
    return { item: applyFaviconToItem(item, undefined, undefined) };
  }

  if (syncInput?.websiteFaviconPng && syncInput.websiteFaviconPng.byteLength > 0) {
    return normalizeAndUploadWebsiteFavicon({
      accessToken,
      vaultKey,
      item,
      rawBytes: syncInput.websiteFaviconPng,
    });
  }

  // Edit with unchanged website URLs: keep the stored icon (do not re-fetch / re-upload).
  if (urlsUnchanged && previous?.faviconId) {
    return {
      item: applyFaviconToItem(item, previous.faviconId, previous.faviconSource ?? "website"),
    };
  }

  if (options?.allowNetworkFetch) {
    const previewBlob = await previewItemFavicon(accessToken, urls);
    if (!previewBlob) {
      if (urlsUnchanged && previous?.faviconId) {
        return {
          item: applyFaviconToItem(item, previous.faviconId, previous.faviconSource ?? "website"),
        };
      }
      return { item: applyFaviconToItem(item, undefined, undefined) };
    }
    return normalizeAndUploadWebsiteFavicon({
      accessToken,
      vaultKey,
      item,
      rawBytes: new Uint8Array(await previewBlob.arrayBuffer()),
    });
  }

  // Form Save path: never await /favicon/preview. Caller may attach in the background.
  if (urlsUnchanged && previous) {
    return {
      item: applyFaviconToItem(item, previous.faviconId, previous.faviconSource),
    };
  }

  return { item: applyFaviconToItem(item, undefined, undefined) };
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
