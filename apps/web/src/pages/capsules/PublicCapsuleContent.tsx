import type { ItemPlaintextV2 } from "@okkey/types";
import { serializeKeyFieldFileValue, type KeyFieldFileValue } from "@okkey/ui";
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
  item?: ItemPlaintextV2;
};

function guessMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  };
  return map[ext] ?? "application/octet-stream";
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
  const { locale } = useLocale();
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
              label: keyFormMessages.fieldLabels.secureNote,
              value: data.text ?? "",
              editableLabel: true,
              deletable: false,
            },
          ],
        },
      ];
    }
    if (data.type === "file" && fileBytes) {
      const fileName = data.name || "file";
      const fileValue: KeyFieldFileValue = {
        attachmentId: "capsule-file",
        name: fileName,
        mimeType: guessMimeType(fileName),
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
              label: keyFormMessages.fieldLabels.file,
              value: serializeKeyFieldFileValue(fileValue),
              editableLabel: true,
              deletable: false,
            },
          ],
        },
      ];
    }
    return [];
  }, [data, fileBytes, keyFormMessages]);

  const itemForFiles = data?.type === "item" ? data.item ?? null : null;

  const handleFileOpen = useCallback(async () => {
    if (!fileBytes) {
      throw new Error("missing file");
    }
    return URL.createObjectURL(new Blob([fileBytes]));
  }, [fileBytes]);

  const handleItemFileOpen = useCallback(
    async (file: KeyFieldFileValue) => {
      const attachmentId = file.attachmentId.trim();
      const embedded = attachmentFiles.get(attachmentId);
      if (embedded) {
        const mimeType = file.mimeType || guessMimeType(file.name);
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
    return <p className="text-sm text-muted-foreground">Пустая капсула</p>;
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
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ItemRecordFavicon categoryId="secure_note" title="Заметка" size={40} alt="" />
          <h2 className="min-w-0 flex-1 text-xl font-semibold leading-7 text-foreground">Заметка</h2>
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
    const fileName = data.name || "Файл";
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <ItemRecordFavicon categoryId="secure_files" title={fileName} size={40} alt="" />
          <h2 className="min-w-0 flex-1 text-xl font-semibold leading-7 text-foreground">{fileName}</h2>
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

  return <p className="text-sm text-muted-foreground">Неизвестный тип капсулы</p>;
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
