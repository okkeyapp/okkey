import type { ItemPlaintextV2 } from "@okkey/types";
import { serializeKeyFieldFileValue, resolveKeyFieldFileMimeType, type KeyFieldFileValue } from "@okkey/ui";
import { useCallback, useMemo } from "react";

import { KeyFormEditor } from "../../components/key-form/KeyFormEditor";
import {
  createKeyFormEditorMessages,
  createLocalizedKeyFieldTypes,
} from "../../components/key-form/keyFormI18n";
import {
  SECURE_FILES_SECTION_ID,
  SECURE_NOTE_SECTION_ID,
} from "../../components/items/itemCategoryDefaultSections";
import { isItemCategoryId } from "../../components/items/itemCategoryCatalog";
import ItemRecordFavicon from "../../components/items/ItemRecordFavicon";
import { itemPlaintextToKeyFormSections } from "../../items/itemPlaintextToKeyFormSections";
import { getDatePickerLocale } from "../../lib/datePickerLocale";
import { useLocale } from "../../locale/LocaleContext";
import { useCapsuleItemFavicon } from "./useCapsuleItemFavicon";

type CapsulePayload = {
  type?: string;
  text?: string;
  name?: string;
  fileName?: string;
  item?: ItemPlaintextV2;
};

function resolveFileCapsuleNames(data: CapsulePayload): { title: string; fileName: string } {
  const fileName = data.fileName?.trim() || data.name?.trim() || "file";
  const title = data.fileName ? data.name?.trim() || fileName : fileName;
  return { title, fileName };
}

export default function PublicCapsuleContent({
  payload,
  fileBytes,
  attachmentFiles,
  onVaultFileOpen,
}: {
  payload: unknown;
  fileBytes: Uint8Array | null;
  attachmentFiles: Map<string, Uint8Array>;
  onVaultFileOpen?: (file: KeyFieldFileValue, item: ItemPlaintextV2) => Promise<string>;
}) {
  const { locale, t } = useLocale();
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const datePickerLocale = useMemo(() => getDatePickerLocale(locale), [locale]);
  const keyFormFieldTypes = useMemo(() => createLocalizedKeyFieldTypes(locale), [locale]);

  const data =
    payload && typeof payload === "object" ? (payload as CapsulePayload) : null;

  const formSections = useMemo(() => {
    if (!data) return [];
    if (data.type === "item" && data.item) {
      return itemPlaintextToKeyFormSections(data.item, keyFormMessages);
    }
    if (data.type === "text") {
      return [
        {
          id: SECURE_NOTE_SECTION_ID,
          variant: "primary" as const,
          fields: [
            {
              id: "note",
              type: "multiline-text",
              label: t("web.capsules.public.secretText"),
              value: data.text ?? "",
              editableLabel: true,
              deletable: false,
            },
          ],
        },
      ];
    }
    if (data.type === "file" && fileBytes) {
      const { fileName } = resolveFileCapsuleNames(data);
      const fileValue: KeyFieldFileValue = {
        attachmentId: "capsule-file",
        name: fileName,
        mimeType: resolveKeyFieldFileMimeType(fileName),
        sizeBytes: fileBytes.length,
      };
      return [
        {
          id: SECURE_FILES_SECTION_ID,
          variant: "primary" as const,
          fields: [
            {
              id: "secure-file",
              type: "file",
              label: t("web.capsules.public.secretFile"),
              value: serializeKeyFieldFileValue(fileValue),
              editableLabel: true,
              deletable: false,
            },
          ],
        },
      ];
    }
    return [];
  }, [data, fileBytes, keyFormMessages, t]);

  const itemForFiles = data?.type === "item" ? data.item ?? null : null;

  const handleFileOpen = useCallback(
    async (file: KeyFieldFileValue) => {
      if (!fileBytes) {
        throw new Error("missing file");
      }
      const mimeType = resolveKeyFieldFileMimeType(file.name, file.mimeType);
      return URL.createObjectURL(new Blob([fileBytes], { type: mimeType }));
    },
    [fileBytes],
  );

  const handleItemFileOpen = useCallback(
    async (file: KeyFieldFileValue) => {
      const attachmentId = file.attachmentId.trim();
      const embedded = attachmentFiles.get(attachmentId);
      if (embedded) {
        const mimeType = resolveKeyFieldFileMimeType(file.name, file.mimeType);
        return URL.createObjectURL(new Blob([embedded], { type: mimeType }));
      }
      if (itemForFiles && onVaultFileOpen) {
        return onVaultFileOpen(file, itemForFiles);
      }
      throw new Error("missing file");
    },
    [attachmentFiles, itemForFiles, onVaultFileOpen],
  );

  if (!data) {
    return <p className="text-sm text-muted-foreground">{t("web.capsules.public.empty")}</p>;
  }

  if (data.type === "item" && data.item) {
    const item = data.item;
    return (
      <div className="flex flex-col gap-4">
        <CapsuleItemHeader item={item} />
        <KeyFormEditor
          key={item.itemId}
          mode="view"
          initialSections={formSections}
          fieldTypes={keyFormFieldTypes}
          messages={keyFormMessages}
          datePickerLocale={datePickerLocale}
          onFileOpen={handleItemFileOpen}
        />
      </div>
    );
  }

  if (data.type === "text") {
    const textTitle = data.name?.trim() ?? "";
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ItemRecordFavicon categoryId="secure_note" title={textTitle} size={40} alt="" />
          <h2 className="min-w-0 flex-1 text-xl font-semibold leading-7 text-foreground">{textTitle}</h2>
        </div>
        <KeyFormEditor
          mode="view"
          initialSections={formSections}
          fieldTypes={keyFormFieldTypes}
          messages={keyFormMessages}
          datePickerLocale={datePickerLocale}
        />
      </div>
    );
  }

  if (data.type === "file" && fileBytes) {
    const { title } = resolveFileCapsuleNames(data);
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ItemRecordFavicon categoryId="secure_files" title={title} size={40} alt="" />
          <h2 className="min-w-0 flex-1 text-xl font-semibold leading-7 text-foreground">{title}</h2>
        </div>
        <KeyFormEditor
          mode="view"
          initialSections={formSections}
          fieldTypes={keyFormFieldTypes}
          messages={keyFormMessages}
          datePickerLocale={datePickerLocale}
          onFileOpen={handleFileOpen}
        />
      </div>
    );
  }

  return <p className="text-sm text-muted-foreground">{t("web.capsules.public.unknownType")}</p>;
}

function CapsuleItemHeader({ item }: { item: ItemPlaintextV2 }) {
  const categoryId = isItemCategoryId(item.categoryId) ? item.categoryId : "login";
  const favicon = useCapsuleItemFavicon(item);

  return (
    <div className="flex items-center gap-4">
      <ItemRecordFavicon
        categoryId={categoryId}
        title={item.title}
        faviconId={item.faviconId}
        previewImageSrc={favicon.previewImageSrc}
        previewLoading={favicon.previewLoading}
        size={40}
        alt=""
      />
      <h2 className="min-w-0 flex-1 text-xl font-semibold leading-7 text-foreground">{item.title}</h2>
    </div>
  );
}
