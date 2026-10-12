import { formatWebMessage, type WebLocale } from "@okkey/i18n";
import { ITEM_CATEGORY_LOGIN, type ItemPlaintextV2 } from "@okkey/types";
import { Button, Input, Popup } from "@okkey/ui";
import {
  KeyFormEditor,
  createKeyFormEditorMessages,
  createLocalizedKeyFieldTypes,
  filterKeyFieldTypesForFilesEnabled,
  itemPlaintextToKeyFormSections,
  keyFormSectionsToItemPlaintext,
  type KeyFormEditorSection,
} from "@okkey/vault-ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AUTOFILL_MSG, type AutofillSaveFormDraftItem, type AutofillSaveVaultOption } from "../../lib/autofillMessages";
import {
  SAVE_PROMPT_FORM_MSG,
  isSavePromptFormMessage,
  type SavePromptFormKind,
  type SavePromptFormQuery,
} from "../../lib/savePromptFormBridge";

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

export function SavePromptFormApp() {
  const locale = useMemo(() => resolveLocale(), []);
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const fieldTypes = useMemo(
    () => filterKeyFieldTypesForFilesEnabled(createLocalizedKeyFieldTypes(locale), false),
    [locale],
  );

  const [query, setQuery] = useState<SavePromptFormQuery | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SavePromptFormKind>("create");
  const [recordName, setRecordName] = useState("");
  const [vaultId, setVaultId] = useState("");
  const [vaults, setVaults] = useState<AutofillSaveVaultOption[]>([]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [baseItem, setBaseItem] = useState<ItemPlaintextV2 | null>(null);
  const [sections, setSections] = useState<KeyFormEditorSection[] | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [saving, setSaving] = useState(false);

  const postToParent = useCallback((type: string) => {
    try {
      window.parent.postMessage({ type, source: "okkey-save-prompt-form" }, "*");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!isSavePromptFormMessage(event.data)) {
        return;
      }
      if (event.data.type !== SAVE_PROMPT_FORM_MSG.init || !event.data.payload) {
        return;
      }
      setQuery(event.data.payload);
    }
    window.addEventListener("message", onMessage);
    postToParent(SAVE_PROMPT_FORM_MSG.ready);
    return () => window.removeEventListener("message", onMessage);
  }, [postToParent]);

  useEffect(() => {
    if (!query) {
      return;
    }
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
          return;
        }
        const item = draftToItem(response.item);
        setKind(response.kind);
        setBaseItem(item);
        setRecordName(item.title);
        setVaultId(item.vaultId);
        setVaults(response.vaults);
        setWorkspaceName(response.workspaceName);
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
  }, [keyFormMessages, locale, query]);

  const header =
    kind === "update"
      ? t(locale, "extension.autofill.updateFormTitle")
      : t(locale, "extension.autofill.saveFormTitle");
  const confirmLabel =
    kind === "update"
      ? t(locale, "extension.autofill.updateConfirm")
      : t(locale, "extension.autofill.saveConfirm");

  function handleClose() {
    postToParent(SAVE_PROMPT_FORM_MSG.cancel);
  }

  async function handleSave() {
    if (!baseItem || !sections) {
      return;
    }
    const title = recordName.trim() || baseItem.title || "Login";
    if (!title.trim()) {
      setShowValidation(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const built = keyFormSectionsToItemPlaintext({
        sections,
        itemId: baseItem.itemId,
        vaultId: kind === "create" ? vaultId || baseItem.vaultId : baseItem.vaultId,
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
        postToParent(SAVE_PROMPT_FORM_MSG.saved);
        return;
      }
      if (result?.status === "locked") {
        setError(t(locale, "extension.autofill.saveLocked"));
        void browser.runtime.sendMessage({ type: AUTOFILL_MSG.unlock });
        return;
      }
      setError(t(locale, "extension.autofill.saveFormError"));
    } catch {
      setError(t(locale, "extension.autofill.saveFormError"));
    } finally {
      setSaving(false);
    }
  }

  if (!query || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black/40 p-4 text-sm text-white">
        …
      </div>
    );
  }

  if (error && !sections) {
    return (
      <Popup
        header={header}
        closeLabel={t(locale, "extension.autofill.saveCancel")}
        onClose={handleClose}
        layout="desktop"
        width={560}
        footer={
          <div className="flex w-full justify-end">
            <Button type="button" variant="secondary" onClick={handleClose}>
              {t(locale, "extension.autofill.saveCancel")}
            </Button>
          </div>
        }
      >
        <p className="px-1 py-2 text-sm text-destructive">{error}</p>
      </Popup>
    );
  }

  return (
    <Popup
      header={header}
      closeLabel={t(locale, "extension.autofill.saveCancel")}
      onClose={handleClose}
      closeDisabled={saving}
      layout="desktop"
      width={560}
      panelClassName="max-h-[min(720px,calc(100dvh-32px))]"
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          {error ? <span className="mr-auto text-sm text-destructive">{error}</span> : null}
          <Button type="button" disabled={saving || !sections} onClick={() => void handleSave()}>
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-1 py-2">
        <Input
          value={recordName}
          onChange={(event) => setRecordName(event.target.value)}
          placeholder={t(locale, "extension.autofill.recordNamePlaceholder")}
          className="h-10 text-xl font-semibold leading-6"
          aria-invalid={showValidation && !recordName.trim() ? true : undefined}
        />

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
            onSectionsChange={setSections}
            showValidation={showValidation}
            allowFileFields={false}
          />
        ) : null}

        {kind === "create" && vaults.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span className="font-medium">{workspaceName || "Workspace"}</span>
            <span aria-hidden>→</span>
            <select
              className="h-9 max-w-full rounded-md border border-input bg-background px-2"
              value={vaultId}
              onChange={(event) => setVaultId(event.target.value)}
              disabled={saving}
            >
              {vaults.map((vault) => (
                <option key={vault.vaultId} value={vault.vaultId}>
                  {vault.icon ? `${vault.icon} ` : ""}
                  {vault.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </Popup>
  );
}
