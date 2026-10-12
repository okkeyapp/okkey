import { formatWebMessage, type WebLocale } from "@okkey/i18n";
import { ITEM_CATEGORY_LOGIN, type ItemPlaintextV2 } from "@okkey/types";
import { Input, PortalContainerProvider, cn } from "@okkey/ui";
import {
  ItemRecordFavicon,
  KeyFormEditor,
  createKeyFormEditorMessages,
  createLocalizedKeyFieldTypes,
  filterKeyFieldTypesForFilesEnabled,
  itemPlaintextToKeyFormSections,
  keyFormSectionsToItemPlaintext,
  type KeyFormEditorSection,
} from "@okkey/vault-ui";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";

import { AUTOFILL_MSG, type AutofillSaveFormDraftItem } from "../../lib/autofillMessages";

export type SavePromptKeyFormQuery = {
  kind: "create" | "update";
  title: string;
  username: string;
  password: string;
  websiteUrl: string;
  vaultId?: string;
  itemId?: string;
};

export type SavePromptKeyFormHandle = {
  submit: () => Promise<boolean>;
};

export type SavePromptKeyFormProps = {
  query: SavePromptKeyFormQuery;
  /** Site / stored favicon preview (same source as the compact save card). */
  iconUrl?: string;
  /** Create-mode vault id from the panel picker (read at submit — picker stays outside). */
  getVaultId?: () => string | undefined;
  /** Outside the scroll area so portaled overlays are not clipped. */
  portalContainer?: Element | null;
  onSaved: () => void;
  onLocked: () => void;
};

function resolveLocale(): WebLocale {
  return (navigator.language || "").toLowerCase().startsWith("ru") ? "ru" : "en";
}

function t(locale: WebLocale, key: string, values?: Record<string, string | number | boolean>): string {
  try {
    return formatWebMessage(locale, key, values);
  } catch {
    return key;
  }
}

function draftToItem(draft: AutofillSaveFormDraftItem): ItemPlaintextV2 {
  return {
    schemaVersion: draft.schemaVersion as ItemPlaintextV2["schemaVersion"],
    itemId: draft.itemId,
    vaultId: draft.vaultId,
    title: draft.title,
    categoryId: draft.categoryId,
    createdAtMs: draft.createdAtMs,
    updatedAtMs: draft.updatedAtMs,
    sections: draft.sections as ItemPlaintextV2["sections"],
    fields: draft.fields as ItemPlaintextV2["fields"],
    ...(draft.tags ? { tags: draft.tags } : {}),
    ...(draft.faviconId ? { faviconId: draft.faviconId } : {}),
    ...(draft.faviconSource
      ? { faviconSource: draft.faviconSource as ItemPlaintextV2["faviconSource"] }
      : {}),
  };
}

function itemToDraft(item: ItemPlaintextV2): AutofillSaveFormDraftItem {
  return {
    itemId: item.itemId,
    vaultId: item.vaultId,
    title: item.title,
    categoryId: item.categoryId,
    createdAtMs: item.createdAtMs,
    updatedAtMs: item.updatedAtMs,
    schemaVersion: item.schemaVersion,
    sections: item.sections,
    fields: item.fields,
    ...(item.tags ? { tags: item.tags } : {}),
    ...(item.faviconId ? { faviconId: item.faviconId } : {}),
    ...(item.faviconSource ? { faviconSource: item.faviconSource } : {}),
  };
}

function collectWebsiteUrlsFromSections(sections: readonly KeyFormEditorSection[]): string[] {
  const websitesSection = sections.find((section) => section.id === "websites");
  if (!websitesSection) {
    return [];
  }
  return websitesSection.fields
    .filter((field) => field.type === "url" && typeof field.value === "string")
    .map((field) => (typeof field.value === "string" ? field.value.trim() : ""))
    .filter(Boolean);
}

export const SavePromptKeyForm = forwardRef<SavePromptKeyFormHandle, SavePromptKeyFormProps>(
  function SavePromptKeyForm({ query, iconUrl, getVaultId, portalContainer, onSaved, onLocked }, ref) {
    const locale = useMemo(() => resolveLocale(), []);
    const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
    const fieldTypes = useMemo(
      () => filterKeyFieldTypesForFilesEnabled(createLocalizedKeyFieldTypes(locale), false),
      [locale],
    );

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [kind, setKind] = useState<"create" | "update">(query.kind);
    const [recordName, setRecordName] = useState(query.title);
    const [baseItem, setBaseItem] = useState<ItemPlaintextV2 | null>(null);
    const [sections, setSections] = useState<KeyFormEditorSection[] | null>(null);
    const [showValidation, setShowValidation] = useState(false);
    const [saving, setSaving] = useState(false);
    const [previewIconUrl, setPreviewIconUrl] = useState<string | undefined>(iconUrl);
    const [iconLoading, setIconLoading] = useState(false);

    useEffect(() => {
      setPreviewIconUrl(iconUrl);
    }, [iconUrl]);

    useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      void (async () => {
        try {
          const response = await browser.runtime.sendMessage({
            type: AUTOFILL_MSG.saveFormDraft,
            kind: query.kind,
            title: query.title,
            username: query.username,
            password: query.password,
            websiteUrl: query.websiteUrl,
            vaultId: query.vaultId,
            itemId: query.itemId,
          });
          if (cancelled) {
            return;
          }
          if (!response || response.status !== "ok") {
            setError(
              response?.status === "locked"
                ? t(locale, "extension.autofill.saveLocked")
                : t(locale, "extension.autofill.saveFormError"),
            );
            setLoading(false);
            if (response?.status === "locked") {
              onLocked();
            }
            return;
          }
          const item = draftToItem(response.item);
          setKind(response.kind);
          setBaseItem(item);
          setRecordName(item.title);
          setSections(itemPlaintextToKeyFormSections(item, keyFormMessages, { includeEmptyFields: true }));
          setLoading(false);
        } catch {
          if (!cancelled) {
            setError(t(locale, "extension.autofill.saveFormError"));
            setLoading(false);
          }
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [keyFormMessages, locale, onLocked, query]);

    const refreshFaviconFromUrls = useCallback(async (urls: readonly string[]) => {
      const websiteUrl = urls[0] || query.websiteUrl;
      if (!websiteUrl) {
        return;
      }
      setIconLoading(true);
      try {
        const result = await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.siteIcon,
          websiteUrl,
          urls: urls.length > 0 ? [...urls] : undefined,
        });
        if (result?.status === "ok" && typeof result.iconUrl === "string") {
          setPreviewIconUrl(result.iconUrl);
        }
      } catch {
        /* keep previous icon */
      } finally {
        setIconLoading(false);
      }
    }, [query.websiteUrl]);

    const faviconTimerRef = useRef(0);
    const scheduleFaviconRefresh = useCallback(
      (urls: readonly string[]) => {
        window.clearTimeout(faviconTimerRef.current);
        faviconTimerRef.current = window.setTimeout(() => {
          void refreshFaviconFromUrls(urls.length > 0 ? urls : [query.websiteUrl]);
        }, 280);
      },
      [query.websiteUrl, refreshFaviconFromUrls],
    );

    useEffect(() => () => window.clearTimeout(faviconTimerRef.current), []);

    const handleSectionsChange = useCallback(
      (next: KeyFormEditorSection[]) => {
        setSections(next);
        scheduleFaviconRefresh(collectWebsiteUrlsFromSections(next));
      },
      [scheduleFaviconRefresh],
    );

    const handleWebsiteUrlsBlur = useCallback(
      (nextSections: KeyFormEditorSection[]) => {
        window.clearTimeout(faviconTimerRef.current);
        const urls = collectWebsiteUrlsFromSections(nextSections);
        void refreshFaviconFromUrls(urls.length > 0 ? urls : [query.websiteUrl]);
      },
      [query.websiteUrl, refreshFaviconFromUrls],
    );

    const submit = useCallback(async (): Promise<boolean> => {
      if (!baseItem || !sections) {
        return false;
      }
      const title = recordName.trim() || baseItem.title || "Login";
      if (!title.trim()) {
        setShowValidation(true);
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const built = keyFormSectionsToItemPlaintext({
          sections,
          itemId: baseItem.itemId,
          vaultId:
            kind === "create"
              ? getVaultId?.() || query.vaultId || baseItem.vaultId
              : baseItem.vaultId,
          title,
          categoryId: ITEM_CATEGORY_LOGIN,
          nowMs: Date.now(),
          tags: baseItem.tags,
        });
        const item: ItemPlaintextV2 = {
          ...built,
          createdAtMs: baseItem.createdAtMs,
          updatedAtMs: Date.now(),
          ...(baseItem.faviconId ? { faviconId: baseItem.faviconId } : {}),
          ...(baseItem.faviconSource ? { faviconSource: baseItem.faviconSource } : {}),
        };
        const result = await browser.runtime.sendMessage({
          type: AUTOFILL_MSG.saveFormCommit,
          kind,
          item: itemToDraft(item),
        });
        if (result?.status === "ok") {
          onSaved();
          return true;
        }
        if (result?.status === "locked") {
          setError(t(locale, "extension.autofill.saveLocked"));
          onLocked();
          return false;
        }
        setError(t(locale, "extension.autofill.saveFormError"));
        return false;
      } catch {
        setError(t(locale, "extension.autofill.saveFormError"));
        return false;
      } finally {
        setSaving(false);
      }
    }, [baseItem, getVaultId, kind, locale, onLocked, onSaved, query.vaultId, recordName, sections]);

    useImperativeHandle(ref, () => ({ submit }), [submit]);

    const recordNameInvalid = showValidation && !recordName.trim();

    return (
      <PortalContainerProvider container={portalContainer}>
        <div className="okkey-tw relative flex flex-col gap-3 text-foreground">
          {loading ? (
            <div className="px-1 py-3 text-sm text-muted-foreground">…</div>
          ) : error && !sections ? (
            <p className="px-1 py-2 text-sm text-destructive">{error}</p>
          ) : (
            <>
              <div className="flex items-center gap-3 px-1">
                <ItemRecordFavicon
                  categoryId={ITEM_CATEGORY_LOGIN}
                  title={recordName.trim() || undefined}
                  previewImageSrc={previewIconUrl}
                  previewLoading={iconLoading && !previewIconUrl}
                  size={32}
                  alt=""
                />
                <Input
                  value={recordName}
                  onChange={(event) => setRecordName(event.target.value)}
                  placeholder={t(locale, "extension.autofill.recordNamePlaceholder")}
                  className={cn(
                    "h-9 min-w-0 flex-1 text-base font-semibold leading-6",
                    recordNameInvalid &&
                      "border-destructive shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] focus-visible:ring-0",
                  )}
                  aria-invalid={recordNameInvalid || undefined}
                  disabled={saving}
                />
              </div>

              {sections ? (
                <KeyFormEditor
                  key={baseItem?.itemId ?? "draft"}
                  mode="edit"
                  initialSections={sections}
                  addSectionLabel={t(locale, "extension.autofill.addSectionWithField")}
                  addFieldLabel={t(locale, "extension.autofill.addField")}
                  fieldTypes={fieldTypes}
                  messages={keyFormMessages}
                  countryLocale={locale}
                  onSectionsChange={handleSectionsChange}
                  onWebsiteUrlsBlur={handleWebsiteUrlsBlur}
                  showValidation={showValidation}
                  allowFileFields={false}
                />
              ) : null}

              {error ? <p className="px-1 text-sm text-destructive">{error}</p> : null}
            </>
          )}
        </div>
      </PortalContainerProvider>
    );
  },
);
