import { ITEM_CATEGORY_LOGIN, type ItemFaviconSource, type WorkspaceItemTemplateDto } from "@okkey/types";
import type { KeyFieldFileValue } from "@okkey/ui";
import type { KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import type { NewItemFormPrefillValues } from "../components/items/NewItemForm";
import type { ItemFormFaviconSyncInput } from "./useItemFormFavicon";
import { downloadKeyFieldFileAttachmentBytes, uploadEncryptedAttachment } from "../api/key-field-files";
import { previewItemFavicon } from "../api/item-favicons";
import { collectWebsiteUrlsFromSections } from "../lib/domainRecordTitle";
import { keyFieldFileValueFromFaviconId } from "./syncItemFavicon";

const TEMPLATE_FAVICON_NAME = "favicon.png";
const TEMPLATE_FAVICON_MIME_TYPE = "image/png";

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return new Uint8Array(await blob.arrayBuffer());
  }
  return new Uint8Array(await new Response(blob).arrayBuffer());
}

export type ItemTemplateFormSnapshot = {
  categoryId: string;
  recordName: string;
  vaultId: string;
  folderId: string;
  sections: KeyFormEditorSection[];
  tags: string[];
  attachmentItemId?: string;
};

export function buildTemplateCreatePayload(
  templateId: string,
  snapshot: ItemTemplateFormSnapshot,
  templateName: string,
  faviconId?: string,
  faviconSource?: ItemFaviconSource,
) {
  return {
    id: templateId,
    name: templateName.trim(),
    category_id: snapshot.categoryId,
    payload: {
      record_name: snapshot.recordName,
      vault_id: snapshot.vaultId,
      folder_id: snapshot.folderId,
      sections: structuredClone(snapshot.sections),
      tags: [...snapshot.tags],
      ...(faviconSource ? { favicon_source: faviconSource } : {}),
    },
    ...(faviconId ? { favicon_id: faviconId } : {}),
  };
}

export async function syncTemplateFaviconForSnapshot(
  accessToken: string,
  vaultKey: Uint8Array,
  templateId: string,
  snapshot: ItemTemplateFormSnapshot,
  syncInput?: ItemFormFaviconSyncInput,
): Promise<{ faviconId?: string; faviconSource?: ItemFaviconSource; uploadedFavicon?: KeyFieldFileValue }> {
  async function uploadTemplateFavicon(pngBytes: Uint8Array, faviconSource: ItemFaviconSource) {
    const uploadedFavicon = await uploadEncryptedAttachment({
      accessToken,
      vaultId: snapshot.vaultId,
      itemId: templateId,
      vaultKey,
      plaintext: pngBytes,
      name: TEMPLATE_FAVICON_NAME,
      mimeType: TEMPLATE_FAVICON_MIME_TYPE,
      sizeBytes: pngBytes.byteLength,
    });
    return { faviconId: uploadedFavicon.attachmentId, faviconSource, uploadedFavicon };
  }

  if (syncInput?.manualFaviconPng && syncInput.manualFaviconPng.byteLength > 0) {
    return uploadTemplateFavicon(syncInput.manualFaviconPng, "manual");
  }
  if (syncInput?.faviconSource === "manual") {
    const reuseFaviconId = syncInput.reuseFaviconId?.trim();
    const reuseFaviconItemId = syncInput.reuseFaviconItemId?.trim();
    if (reuseFaviconId && reuseFaviconItemId && reuseFaviconItemId !== templateId) {
      const downloaded = await downloadKeyFieldFileAttachmentBytes({
        accessToken,
        vaultId: snapshot.vaultId,
        itemId: reuseFaviconItemId,
        vaultKey,
        file: keyFieldFileValueFromFaviconId(reuseFaviconId),
      });
      return uploadTemplateFavicon(downloaded.plaintext, "manual");
    }
    if (reuseFaviconId) {
      return { faviconId: reuseFaviconId, faviconSource: "manual" };
    }
    return { faviconSource: "manual" };
  }
  if (snapshot.categoryId === ITEM_CATEGORY_LOGIN) {
    const urls = collectWebsiteUrlsFromSections(snapshot.sections);
    if (urls.length > 0) {
      const previewBlob = await previewItemFavicon(accessToken, urls);
      if (previewBlob) {
        return uploadTemplateFavicon(await blobToBytes(previewBlob), "website");
      }
    }
  }
  return {};
}

export function buildTemplatePrefillValues(
  template: WorkspaceItemTemplateDto,
): NewItemFormPrefillValues {
  return {
    recordName: "",
    vaultId: template.payload.vault_id,
    folderId: template.payload.folder_id,
    sections: structuredClone(template.payload.sections) as KeyFormEditorSection[],
    tags: [...template.payload.tags],
    attachmentItemId: template.id,
    ...(template.favicon_id ? { faviconId: template.favicon_id } : {}),
    ...(template.favicon_id ? { faviconItemId: template.id } : {}),
    ...(template.payload.favicon_source ? { faviconSource: template.payload.favicon_source } : {}),
  };
}
