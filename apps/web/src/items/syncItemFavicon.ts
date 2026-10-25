import type { ItemFaviconSource, ItemPlaintextV2 } from "@okkey/types";
import { ITEM_CATEGORY_LOGIN } from "@okkey/types";
import type { KeyFieldFileValue } from "@okkey/ui";
import { keyFieldFileValueFromFaviconId as faviconAttachmentValue } from "@okkey/vault";

import { downloadKeyFieldFileAttachmentBytes, uploadEncryptedAttachment } from "../api/key-field-files";
import { previewItemFavicon } from "../api/item-favicons";
import type { ItemFormFaviconSyncInput } from "./useItemFormFavicon";
import { seedItemFaviconAttachmentUrl } from "./useItemFaviconAttachmentUrl";

const FAVICON_ATTACHMENT_NAME = "favicon.png";
const FAVICON_ATTACHMENT_MIME_TYPE = "image/png";

function collectUrls(item: ItemPlaintextV2): string[] {
  return item.fields
    .filter((field) => field.type === "url" && field.value.kind === "url")
    .map((field) => (field.value.kind === "url" ? field.value.url.trim() : ""))
    .filter((url) => url.length > 0);
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

/** Persist favicon to MinIO only when saving the item (not during form preview). */
export async function syncItemFaviconForPlaintext(
  accessToken: string,
  vaultKey: Uint8Array,
  item: ItemPlaintextV2,
  previous?: ItemPlaintextV2,
  syncInput?: ItemFormFaviconSyncInput,
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

  const urls = collectUrls(item);

  if (urls.length === 0) {
    return { item: applyFaviconToItem(item, undefined, undefined) };
  }

  let pngBytes = syncInput?.websiteFaviconPng ?? null;
  if (!pngBytes || pngBytes.byteLength === 0) {
    const previewBlob = await previewItemFavicon(accessToken, urls);
    if (!previewBlob) {
      return { item: applyFaviconToItem(item, undefined, undefined) };
    }
    pngBytes = new Uint8Array(await previewBlob.arrayBuffer());
  }

  const uploadedFavicon = await uploadFaviconAttachment({
    accessToken,
    vaultKey,
    item,
    pngBytes,
  });
  return {
    item: applyFaviconToItem(item, uploadedFavicon.attachmentId, "website"),
    uploadedFavicon,
    uploadedPngBytes: pngBytes,
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
