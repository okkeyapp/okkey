import type { ItemFaviconSource, WorkspaceItemTemplateDto } from "@okkey/types";
import type { KeyFormEditorSection } from "../components/key-form/KeyFormEditor";
import type { NewItemFormPrefillValues } from "../components/items/NewItemForm";
import type { ItemFormFaviconSyncInput } from "./useItemFormFavicon";
import { upsertItemFaviconPng } from "../api/item-favicons";

export type ItemTemplateFormSnapshot = {
  categoryId: string;
  recordName: string;
  vaultId: string;
  folderId: string;
  sections: KeyFormEditorSection[];
  tags: string[];
};

export function buildTemplateCreatePayload(
  snapshot: ItemTemplateFormSnapshot,
  templateName: string,
  faviconId?: string,
  faviconSource?: ItemFaviconSource,
) {
  return {
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
  templateId: string,
  snapshot: ItemTemplateFormSnapshot,
  syncInput?: ItemFormFaviconSyncInput,
): Promise<{ faviconId?: string; faviconSource?: ItemFaviconSource }> {
  if (syncInput?.manualFaviconPng && syncInput.manualFaviconPng.byteLength > 0) {
    const result = await upsertItemFaviconPng(
      accessToken,
      snapshot.vaultId,
      templateId,
      syncInput.manualFaviconPng,
    );
    const faviconId = result.faviconId?.trim();
    if (!faviconId) {
      throw new Error("FAVICON_MANUAL_UPLOAD_FAILED");
    }
    return { faviconId, faviconSource: "manual" };
  }
  if (syncInput?.faviconSource === "manual") {
    return { faviconSource: "manual" };
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
    ...(template.favicon_id ? { faviconId: template.favicon_id } : {}),
    ...(template.payload.favicon_source ? { faviconSource: template.payload.favicon_source } : {}),
  };
}
