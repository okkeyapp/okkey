import { formatWebMessage, type WebLocale } from "@okkey/i18n";
import { ITEM_CATEGORY_LOGIN, type ItemPlaintextV2 } from "@okkey/types";
import {
  Input,
  PortalContainerProvider,
  ScrollArea,
  Spinner,
  cn,
  getScrollAreaViewport,
  readPopupScrollEdges,
} from "@okkey/ui";
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
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { AUTOFILL_MSG, type AutofillSaveFormDraftItem } from "../../lib/autofillMessages";
import { useRadixScrollAreaScrollEdges } from "../../lib/useRadixScrollAreaScrolled";

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
  /** Extension UI locale from chrome.storage (not navigator.language). */
  locale: WebLocale;
  /** Site / stored favicon preview (same source as the compact save card). */
  iconUrl?: string;
  /** Create-mode vault id from the panel picker (read at submit — picker stays outside). */
  getVaultId?: () => string | undefined;
  /** Outside the scroll area so portaled overlays are not clipped. */
  portalContainer?: Element | null;
  /** Fires when `[data-save-path]` is in the DOM (content script fills vault breadcrumbs). */
  onPathHostReady?: () => void;
  /** Closes the vault menu when the form body scrolls (menu is portaled). */
  onScrollBody?: () => void;
  onSaved: () => void;
  onLocked: () => void;
};

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

function applySaveChromeShadows(
  scrollRoot: HTMLElement | null,
  edges: { fromTop: boolean; fromBottom: boolean },
): void {
  const panel = scrollRoot?.closest(".panel-save-form");
  if (!(panel instanceof HTMLElement)) {
    return;
  }
  const header = panel.querySelector(".save-header");
  const footer = panel.querySelector(".save-actions");
  if (header instanceof HTMLElement) {
    header.toggleAttribute("data-scroll-shadow", edges.fromTop);
  }
  if (footer instanceof HTMLElement) {
    footer.toggleAttribute("data-scroll-shadow", edges.fromBottom);
  }
}

export const SavePromptKeyForm = forwardRef<SavePromptKeyFormHandle, SavePromptKeyFormProps>(
  function SavePromptKeyForm(
    {
      query,
      locale,
      iconUrl,
      getVaultId,
      portalContainer,
      onPathHostReady,
      onScrollBody,
      onSaved,
      onLocked,
    },
    ref,
  ) {
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

    const scrollAreaRef = useRef<HTMLDivElement>(null);
    const pathHostRef = useRef<HTMLDivElement>(null);
    const scrollEdges = useRadixScrollAreaScrollEdges(scrollAreaRef);
    const lastScrollTopRef = useRef(0);

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

    useLayoutEffect(() => {
      applySaveChromeShadows(scrollAreaRef.current, scrollEdges);
    }, [scrollEdges]);

    // Recompute sticky chrome shadows after draft/form content replaces the spinner.
    useLayoutEffect(() => {
      const root = scrollAreaRef.current;
      if (!root) {
        return;
      }
      const viewport = getScrollAreaViewport(root);
      if (!viewport) {
        return;
      }
      applySaveChromeShadows(root, readPopupScrollEdges(viewport));
    }, [loading, sections]);

    useLayoutEffect(() => {
      if (pathHostRef.current) {
        onPathHostReady?.();
      }
    }, [loading, onPathHostReady, sections]);

    useEffect(() => {
      const root = scrollAreaRef.current;
      if (!root || !onScrollBody) {
        return;
      }
      const viewport = root.querySelector("[data-radix-scroll-area-viewport]");
      if (!(viewport instanceof HTMLElement)) {
        return;
      }
      lastScrollTopRef.current = viewport.scrollTop;
      const onScroll = () => {
        if (viewport.scrollTop !== lastScrollTopRef.current) {
          lastScrollTopRef.current = viewport.scrollTop;
          onScrollBody();
        }
      };
      viewport.addEventListener("scroll", onScroll, { passive: true });
      return () => viewport.removeEventListener("scroll", onScroll);
    }, [onScrollBody]);

    useEffect(() => {
      return () => {
        applySaveChromeShadows(scrollAreaRef.current, { fromTop: false, fromBottom: false });
      };
    }, []);

    const recordNameInvalid = showValidation && !recordName.trim();

    return (
      <PortalContainerProvider container={portalContainer}>
        {/*
          ScrollArea must own max-height (not h-full). Parent .save-form-body only has
          max-height + overflow clip — percentage height never resolves, so the viewport
          grew with content and wheel-scroll stayed dead.
        */}
        <div className="okkey-tw relative w-full text-foreground" data-okkey-save-scroll-root="">
          <ScrollArea
            ref={scrollAreaRef}
            className="w-full max-h-[min(560px,calc(100vh-160px))]"
            data-okkey-save-scroll=""
          >
            <div className="flex flex-col gap-4 px-4 py-3">
              {loading ? (
                <div
                  className="flex min-h-[180px] flex-1 items-center justify-center py-8"
                  role="status"
                  aria-busy="true"
                  aria-label={t(locale, "extension.autofill.saveFormLoading")}
                >
                  <Spinner />
                </div>
              ) : error && !sections ? (
                <p className="py-2 text-sm text-destructive">{error}</p>
              ) : (
                <>
                  <div className="flex items-center gap-3">
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

                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                </>
              )}

              {/* Gray breadcrumbs only — form sits on popup bg (web NewItemSaveLocationSection). */}
              <div className="overflow-hidden rounded-[10px] bg-secondary text-secondary-foreground">
                <div ref={pathHostRef} data-save-path />
              </div>
            </div>
          </ScrollArea>
        </div>
      </PortalContainerProvider>
    );
  },
);
