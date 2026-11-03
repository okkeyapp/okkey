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

const SECTION_VARIANTS = new Set(["primary", "additional"]);
const SECRET_KINDS = new Set(["password", "single-line", "multi-line"]);
const URL_AUTOFILL_SCOPES = new Set(["entire-site", "exact-url", "none"]);

/** Keep known structural keys with expected types; omit pre-filled values and unknown keys. */
export function stripTemplateSectionValues(sections: KeyFormEditorSection[]): KeyFormEditorSection[] {
  const result: KeyFormEditorSection[] = [];
  for (const section of sections) {
    if (typeof section.id !== "string") {
      continue;
    }
    const nextSection: KeyFormEditorSection = {
      id: section.id,
      variant:
        typeof section.variant === "string" && SECTION_VARIANTS.has(section.variant)
          ? section.variant
          : "primary",
      fields: [],
    };
    if (typeof section.title === "string") {
      nextSection.title = section.title;
    }
    for (const field of section.fields ?? []) {
      if (
        typeof field.id !== "string" ||
        typeof field.type !== "string" ||
        typeof field.label !== "string"
      ) {
        continue;
      }
      const nextField: KeyFormEditorSection["fields"][number] = {
        id: field.id,
        type: field.type,
        label: field.label,
        value: "",
      };
      if (typeof field.editableLabel === "boolean") nextField.editableLabel = field.editableLabel;
      if (typeof field.secret === "boolean") nextField.secret = field.secret;
      if (typeof field.secretKind === "string" && SECRET_KINDS.has(field.secretKind)) {
        nextField.secretKind = field.secretKind;
      }
      if (typeof field.deletable === "boolean") nextField.deletable = field.deletable;
      if (typeof field.required === "boolean") nextField.required = field.required;
      if (typeof field.urlAutofillScope === "string" && URL_AUTOFILL_SCOPES.has(field.urlAutofillScope)) {
        nextField.urlAutofillScope = field.urlAutofillScope;
      }
      if (typeof field.disableClickCopy === "boolean") nextField.disableClickCopy = field.disableClickCopy;
      if (Array.isArray(field.selectOptions)) {
        nextField.selectOptions = field.selectOptions
          .filter(
            (option): option is { value: string; label: string } =>
              !!option &&
              typeof option === "object" &&
              typeof option.value === "string" &&
              typeof option.label === "string",
          )
          .map((option) => ({ value: option.value, label: option.label }));
      }
      nextSection.fields.push(nextField);
    }
    result.push(nextSection);
  }
  return result;
}

function buildStructureOnlyPayload(
  snapshot: ItemTemplateFormSnapshot,
  faviconSource?: ItemFaviconSource,
) {
  return {
    record_name: "",
    vault_id: snapshot.vaultId,
    folder_id: snapshot.folderId,
    sections: stripTemplateSectionValues(snapshot.sections),
    tags: [] as string[],
    ...(faviconSource ? { favicon_source: faviconSource } : {}),
  };
}

export function buildTemplateUpdatePayload(
  snapshot: ItemTemplateFormSnapshot,
  templateName: string,
  faviconId?: string | null,
  faviconSource?: ItemFaviconSource,
) {
  return {
    name: templateName.trim(),
    category_id: snapshot.categoryId,
    payload: buildStructureOnlyPayload(snapshot, faviconSource),
    favicon_id: faviconId ?? null,
  };
}

export function buildTemplateCreatePayload(
  snapshot: ItemTemplateFormSnapshot,
  templateName: string,
  faviconId?: string,
  faviconSource?: ItemFaviconSource,
) {
  return {
    name: templateName.trim(),
    category_id: snapshot.categoryId,
    payload: buildStructureOnlyPayload(snapshot, faviconSource),
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
      purpose: "item-favicon",
    });
    return { faviconId: uploadedFavicon.attachmentId, faviconSource, uploadedFavicon };
  }

  if (syncInput?.manualFaviconPng && syncInput.manualFaviconPng.byteLength > 0) {
    return uploadTemplateFavicon(syncInput.manualFaviconPng, "manual");
  }
  if (syncInput?.faviconSource === "manual") {
    const reuseFaviconId = syncInput.reuseFaviconId?.trim();
    const reuseFaviconItemId = syncInput.reuseFaviconItemId?.trim();
    if (reuseFaviconId && reuseFaviconItemId) {
      if (reuseFaviconItemId === templateId) {
        return { faviconId: reuseFaviconId, faviconSource: "manual" };
      }
      const downloaded = await downloadKeyFieldFileAttachmentBytes({
        accessToken,
        vaultId: snapshot.vaultId,
        itemId: reuseFaviconItemId,
        vaultKey,
        file: keyFieldFileValueFromFaviconId(reuseFaviconId),
      });
      return uploadTemplateFavicon(downloaded.plaintext, "manual");
    }
    return { faviconSource: "manual" };
  }
  if (syncInput?.websiteFaviconPng && syncInput.websiteFaviconPng.byteLength > 0) {
    return uploadTemplateFavicon(syncInput.websiteFaviconPng, "website");
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
    sections: stripTemplateSectionValues(
      structuredClone(template.payload.sections) as KeyFormEditorSection[],
    ),
    tags: [],
    attachmentItemId: template.id,
    ...(template.favicon_id ? { faviconId: template.favicon_id } : {}),
    ...(template.favicon_id ? { faviconItemId: template.id } : {}),
    ...(template.payload.favicon_source ? { faviconSource: template.payload.favicon_source } : {}),
  };
}
