import { encryptCapsulePayload } from "@okkey/crypto";
import type { WebMessageValues } from "@okkey/i18n";
import type { Locale } from "date-fns";
import {
  hasPlanFeature,
  type CapsuleCreateRequestDto,
  type CapsuleType,
  type Workspace,
  type WorkspaceMemberDirectoryEntryDto,
} from "@okkey/types";
import {
  Button,
  Calendar,
  Checkbox,
  ControlGroup,
  Input,
  KeyField,
  KeyForm,
  KeySection,
  MultiSelect,
  MultiSelectContent,
  MultiSelectItem,
  MultiSelectTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Popup,
  ScrollArea,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
  controlGroupItemFixedClassName,
  getKeyFieldSurfaceRounding,
  serializeKeyFieldFileValue,
  type KeyFieldFileValue,
} from "@okkey/ui";
import { ChevronDownIcon, Trash2Icon } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";
import { toast } from "sonner";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import {
  useAuthVault,
  useAuthenticatedCoreClient,
} from "../../auth/AuthVaultContext";
import {
  buildEncryptedCapsule,
  bytesToBlob,
  releaseCapsuleKey,
} from "../../capsules/crypto";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";
import { useResolvedVaultEncryptionKey } from "../../items/useResolvedVaultEncryptionKey";
import { getDatePickerLocale } from "../../lib/datePickerLocale";
import { useLocale } from "../../locale/LocaleContext";
import ExitNewItemFormConfirmPopup from "../items/ExitNewItemFormConfirmPopup";
import ItemRecordFavicon from "../items/ItemRecordFavicon";
import {
  CAPSULE_FROM_ITEM_QUERY_PARAM,
  NEW_CAPSULE_POPUP_ID,
  POPUP_QUERY_PARAM,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";

type SchedulePreset = "never" | "now" | "15m" | "1h" | "6h" | "12h" | "24h";
type ScopeMode = "all" | "selected" | "all_except";

interface NewCapsulePopupProps {
  t: (messageKey: string, values?: WebMessageValues) => string;
  workspaceId: string;
  workspace?: Workspace;
  onCreated?: () => void;
}

const scheduleOptions: { value: SchedulePreset; label: string }[] = [
  { value: "never", label: "Никогда" },
  { value: "now", label: "Сразу" },
  { value: "15m", label: "Через 15 минут" },
  { value: "1h", label: "Через 1 час" },
  { value: "6h", label: "Через 6 часов" },
  { value: "12h", label: "Через 12 часов" },
  { value: "24h", label: "Через 24 часа" },
];

export default function NewCapsulePopup({
  t,
  workspaceId,
  workspace,
  onCreated,
}: NewCapsulePopupProps) {
  const core = useAuthenticatedCoreClient();
  const { vaultKey } = useAuthVault();
  const { locale } = useLocale();
  const { items, records, fileUploadConstraints } = useWorkspaceItems();
  const { canViewItem, canViewFieldType } = useWorkspaceVaultProfiles();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const popup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = popup?.popupId === NEW_CAPSULE_POPUP_ID;
  const sourceItemId = open
    ? (searchParams.get(CAPSULE_FROM_ITEM_QUERY_PARAM)?.trim() ?? "")
    : "";
  const advancedAvailable = hasPlanFeature(
    workspace?.planTier,
    "capsuleAccessSettings",
  );
  const datePickerLocale = useMemo(() => getDatePickerLocale(locale), [locale]);

  const [type, setType] = useState<CapsuleType>("text");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [itemResultsOpen, setItemResultsOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState("");
  const [fieldScope, setFieldScope] = useState<ScopeMode>("all");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewsEnabled, setViewsEnabled] = useState(false);
  const [maxViews, setMaxViews] = useState(1);
  const [viewLimitAction, setViewLimitAction] = useState<
    "deactivate" | "delete"
  >("deactivate");
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [activatePreset, setActivatePreset] = useState<SchedulePreset>("now");
  const [deactivatePreset, setDeactivatePreset] =
    useState<SchedulePreset>("never");
  const [deletePreset, setDeletePreset] = useState<SchedulePreset>("never");
  const [activateCustom, setActivateCustom] = useState("");
  const [deactivateCustom, setDeactivateCustom] = useState("");
  const [deleteCustom, setDeleteCustom] = useState("");
  const [accessEnabled, setAccessEnabled] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberDirectoryEntryDto[]>(
    [],
  );
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [attemptLimit, setAttemptLimit] = useState(3);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [saveDefaults, setSaveDefaults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);

  const availableRecords = useMemo(
    () =>
      records.filter(
        (item) =>
          !item.deleted &&
          canViewItem(item.vaultId, item.categoryId) &&
          `${item.title} ${item.description}`
            .toLocaleLowerCase()
            .includes(itemSearch.trim().toLocaleLowerCase()),
      ),
    [canViewItem, itemSearch, records],
  );
  const selectedItem = items.find((item) => item.itemId === selectedItemId);
  const selectedRecord = records.find((item) => item.id === selectedItemId);
  const visibleFields = useMemo(
    () =>
      selectedItem?.fields.filter((field) =>
        canViewFieldType(selectedItem.vaultId, field.type),
      ) ?? [],
    [canViewFieldType, selectedItem],
  );

  useEffect(() => {
    if (!open) return;
    if (sourceItemId) {
      setType("item");
      setSelectedItemId(sourceItemId);
    }
    if (core && advancedAvailable) {
      void core
        .listWorkspaceMemberDirectory(workspaceId)
        .then((result) => setMembers(result.members));
    }
  }, [advancedAvailable, core, open, sourceItemId, workspaceId]);

  useEffect(() => {
    if (open) return;
    setType("text");
    setName("");
    setText("");
    setFile(null);
    setItemSearch("");
    setItemResultsOpen(false);
    setSelectedItemId("");
    setFieldScope("all");
    setSelectedFieldIds([]);
    setAdvancedOpen(false);
    setViewsEnabled(false);
    setMaxViews(1);
    setViewLimitAction("deactivate");
    setTimeEnabled(false);
    setActivatePreset("now");
    setDeactivatePreset("never");
    setDeletePreset("never");
    setActivateCustom("");
    setDeactivateCustom("");
    setDeleteCustom("");
    setAccessEnabled(false);
    setRecipientInput("");
    setRecipients([]);
    setPasswordEnabled(false);
    setPassword("");
    setAttemptLimit(3);
    setApprovalRequired(false);
    setSaveDefaults(false);
    setError(null);
    setExitConfirmOpen(false);
  }, [open]);

  const close = () => {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: true },
    );
  };

  const canSave =
    (type === "item" || name.trim().length > 0) &&
    (type === "text"
      ? text.trim().length > 0
      : type === "file"
        ? Boolean(file)
        : Boolean(selectedItem)) &&
    (!passwordEnabled || password.length >= 4);
  const dirty = Boolean(
    type !== "text" ||
    name ||
    text ||
    file ||
    itemSearch ||
    selectedItemId ||
    fieldScope !== "all" ||
    selectedFieldIds.length ||
    viewsEnabled ||
    timeEnabled ||
    accessEnabled ||
    recipientInput ||
    recipients.length ||
    passwordEnabled ||
    approvalRequired,
  );
  const requestClose = () => {
    if (dirty) {
      setExitConfirmOpen(true);
      return false;
    }
    return true;
  };
  const handleClose = () => {
    if (requestClose()) close();
  };
  const confirmExit = () => {
    setExitConfirmOpen(false);
    close();
  };

  const addRecipient = (raw: string): boolean => {
    const email = raw.trim().toLocaleLowerCase();
    if (!isValidEmail(email)) return false;
    setRecipients((current) =>
      current.includes(email) ? current : [...current, email],
    );
    setRecipientInput("");
    return true;
  };

  const save = async () => {
    if (!core || !vaultKey || !canSave) return;
    setSaving(true);
    setError(null);
    let generated: Awaited<ReturnType<typeof buildEncryptedCapsule>> | null =
      null;
    try {
      const itemPayload = selectedItem
        ? {
            ...selectedItem,
            fields: visibleFields.filter((field) =>
              fieldScope === "all"
                ? true
                : fieldScope === "selected"
                  ? selectedFieldIds.includes(field.id)
                  : !selectedFieldIds.includes(field.id),
            ),
          }
        : null;
      generated = await buildEncryptedCapsule({
        accountVaultKey: vaultKey,
        payload:
          type === "text"
            ? { type, text }
            : type === "file"
              ? { type, name: file?.name }
              : { type, item: itemPayload },
        metadata: {
          name: type === "item" ? (selectedItem?.title ?? "") : name.trim(),
          fileName: file?.name,
          itemTitle: selectedItem?.title,
        },
      });
      const body: CapsuleCreateRequestDto = {
        type,
        encryptedPayload: generated.encryptedPayload,
        encryptedMetadata: generated.encryptedMetadata,
        ownerKeyWrap: generated.ownerKeyWrap,
        keyTransportMode: "fragment",
        ...(viewsEnabled ? { maxViews, viewLimitAction } : {}),
        ...(timeEnabled
          ? {
              ...(toScheduleIso(activatePreset, activateCustom)
                ? { activateAt: toScheduleIso(activatePreset, activateCustom)! }
                : {}),
              ...(toScheduleIso(deactivatePreset, deactivateCustom)
                ? {
                    deactivateAt: toScheduleIso(
                      deactivatePreset,
                      deactivateCustom,
                    )!,
                  }
                : {}),
              ...(toScheduleIso(deletePreset, deleteCustom)
                ? { deleteAt: toScheduleIso(deletePreset, deleteCustom)! }
                : {}),
            }
          : {}),
        ...(accessEnabled && recipients.length > 0
          ? { allowedRecipientEmails: recipients }
          : {}),
        ...(passwordEnabled
          ? { password, passwordAttemptLimit: attemptLimit }
          : {}),
        ...(approvalRequired ? { approvalRequired: true } : {}),
      };
      if (type === "file" && file) {
        body.filePayload = bytesToBlob(
          await encryptCapsulePayload(
            generated.capsuleKey,
            new Uint8Array(await file.arrayBuffer()),
          ),
          "capsule_file_payload",
        );
      }
      const created = await core.createCapsule(workspaceId, body);
      const url = `${window.location.origin}/capsule/${created.capsuleId}#key=${generated.fragment}`;
      await navigator.clipboard.writeText(url);
      if (saveDefaults) {
        localStorage.setItem(
          `okkey:capsule-defaults:${type}`,
          JSON.stringify({
            viewsEnabled,
            maxViews,
            viewLimitAction,
            timeEnabled,
            accessEnabled,
            passwordEnabled,
            approvalRequired,
          }),
        );
      }
      toast.success("Капсула создана, ссылка скопирована");
      onCreated?.();
      close();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Не удалось создать капсулу",
      );
    } finally {
      if (generated) releaseCapsuleKey(generated.capsuleKey);
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <Popup
        header="Новая капсула"
        width={720}
        onClose={close}
        onCloseRequest={requestClose}
        panelClassName="min-h-[min(720px,calc(100dvh-32px))]"
        contentClassName="flex flex-col gap-4 overflow-visible"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Отмена
            </Button>
            <Button disabled={!canSave || saving} onClick={() => void save()}>
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        }
      >
        <div className="flex w-fit rounded-lg bg-secondary p-1">
          {(
            [
              ["text", CapsuleTextIcon, "Текст"],
              ["file", CapsuleFileIcon, "Файл"],
              ["item", CapsuleItemIcon, "Запись"],
            ] as const
          ).map(([value, Icon, label]) => (
            <Button
              key={value}
              size="sm"
              variant={type === value ? "outline" : "ghost"}
              onClick={() => setType(value)}
            >
              <Icon data-icon="inline-start" />
              {label}
            </Button>
          ))}
        </div>

        {type === "item" ? (
          <div className="flex flex-col gap-3">
            {selectedItem && selectedRecord ? (
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="flex min-w-0 items-center gap-3 px-4 py-3">
                  <CapsuleRecordFavicon record={selectedRecord} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="truncate text-sm font-medium">
                      {selectedRecord.title}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {selectedRecord.description}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="iconSm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    aria-label="Удалить выбранную запись"
                    onClick={() => {
                      setSelectedItemId("");
                      setSelectedFieldIds([]);
                    }}
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-10 border-t px-4 py-3">
                  <div className="flex shrink-0 items-center gap-3">
                    <FieldsAccessIcon className="shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">Доступные поля:</span>
                  </div>
                  <ControlGroup className="w-full max-w-[270px] flex-1">
                    <Select
                      value={fieldScope}
                      onValueChange={(value) => {
                        const scope = value as ScopeMode;
                        const previousScope = fieldScope;
                        setFieldScope(scope);
                        setSelectedFieldIds((current) =>
                          scope === "selected" && current.length === 0
                            ? visibleFields.map((field) => field.id)
                            : scope === "all_except" &&
                                previousScope !== "all_except"
                              ? []
                              : scope === "all"
                                ? []
                                : current,
                        );
                      }}
                    >
                      <SelectTrigger
                        className={cn(
                          controlGroupItemFixedClassName,
                          fieldScope === "all" ? "w-full" : "w-1/2",
                        )}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="all">Все</SelectItem>
                          <SelectItem value="all_except">Все кроме</SelectItem>
                          <SelectItem value="selected">Выбранные</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {fieldScope !== "all" ? (
                      <MultiSelect
                        displayMode="summary"
                        selectionCountLabel="Выбрано"
                        value={selectedFieldIds}
                        onValueChange={setSelectedFieldIds}
                        placeholder="Выбранные"
                      >
                        <MultiSelectTrigger
                          className={cn(
                            controlGroupItemFixedClassName,
                            "w-1/2",
                          )}
                        />
                        <MultiSelectContent>
                          {visibleFields.map((field) => (
                            <MultiSelectItem key={field.id} value={field.id}>
                              {field.label || field.type}
                            </MultiSelectItem>
                          ))}
                        </MultiSelectContent>
                      </MultiSelect>
                    ) : null}
                  </ControlGroup>
                </div>
              </div>
            ) : (
              <Popover
                open={itemResultsOpen && Boolean(itemSearch)}
                onOpenChange={setItemResultsOpen}
              >
                <PopoverTrigger asChild>
                  <div onClick={(event) => event.preventDefault()}>
                    <KeyForm mode="edit" className="gap-0">
                      <KeySection variant="primary" mode="edit">
                        <KeyField
                          className="border-b-transparent"
                          label="Поиск записи"
                          mode="edit"
                          editableValue
                          value={itemSearch}
                          onValueChange={(value) => {
                            setItemSearch(value);
                            setItemResultsOpen(Boolean(value));
                          }}
                          onValueFocus={() =>
                            setItemResultsOpen(Boolean(itemSearch))
                          }
                          valuePlaceholder="Введите название или описание"
                          surfaceRounding={capsuleFieldRounding(0, 1)}
                        />
                      </KeySection>
                    </KeyForm>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  sideOffset={8}
                  className="w-[var(--radix-popover-trigger-width)]"
                  onOpenAutoFocus={(event) => event.preventDefault()}
                >
                  <ScrollArea className="max-h-64">
                    <div className="flex flex-col p-1 pr-3">
                      {availableRecords.length ? (
                        availableRecords.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="flex w-full min-w-0 items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-muted"
                            onClick={() => {
                              setSelectedItemId(item.id);
                              setItemSearch("");
                              setItemResultsOpen(false);
                            }}
                          >
                            <CapsuleRecordFavicon record={item} />
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                              <span className="truncate text-sm font-medium">
                                {item.title}
                              </span>
                              <span className="truncate text-sm text-muted-foreground">
                                {item.description}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <p className="px-3 py-4 text-sm text-muted-foreground">
                          Записей не найдено
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
          </div>
        ) : (
          <KeyForm mode="edit" className="gap-0">
            <KeySection variant="primary" mode="edit">
              <KeyField
                label="Название"
                mode="edit"
                editableValue
                value={name}
                onValueChange={setName}
                valuePlaceholder="Введите короткое название"
                surfaceRounding={capsuleFieldRounding(0, 2)}
              />
              {type === "text" ? (
                <KeyField
                  className="border-b-transparent"
                  label="Секретный текст"
                  mode="edit"
                  editableValue
                  multilineValue
                  value={text}
                  onValueChange={setText}
                  valuePlaceholder="Введите текст, которым хотите поделиться"
                  surfaceRounding={capsuleFieldRounding(1, 2)}
                />
              ) : (
                <KeyField
                  className="border-b-transparent"
                  label="Файл"
                  mode="edit"
                  editableValue
                  fileValue
                  value={
                    file
                      ? serializeKeyFieldFileValue({
                          attachmentId: `capsule-local-${file.name}-${file.lastModified}`,
                          name: file.name,
                          mimeType: file.type || "application/octet-stream",
                          sizeBytes: file.size,
                        })
                      : ""
                  }
                  onValueChange={(value) => {
                    if (!value) setFile(null);
                  }}
                  onFileUpload={async (
                    nextFile,
                  ): Promise<KeyFieldFileValue> => {
                    setFile(nextFile);
                    return {
                      attachmentId: `capsule-local-${nextFile.name}-${nextFile.lastModified}`,
                      name: nextFile.name,
                      mimeType: nextFile.type || "application/octet-stream",
                      sizeBytes: nextFile.size,
                    };
                  }}
                  fileUploadConstraints={fileUploadConstraints}
                  fileUploadLabel="Загрузить файл"
                  fileClearLabel="Удалить файл"
                  surfaceRounding={capsuleFieldRounding(1, 2)}
                />
              )}
            </KeySection>
          </KeyForm>
        )}

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setAdvancedOpen((value) => !value)}
        >
          Расширенные настройки
          <ChevronDownIcon
            data-icon="inline-end"
            className={advancedOpen ? "rotate-180" : undefined}
          />
        </Button>

        {advancedOpen ? (
          <div className="overflow-hidden rounded-xl bg-secondary">
            {!advancedAvailable ? (
              <>
                <p className="p-4 text-sm text-muted-foreground">
                  Расширенные настройки доступны в тарифе Enterprise.
                </p>
                {[
                  "Просмотры",
                  "Время",
                  "Доступ",
                  "Пароль",
                  "Подтверждение",
                ].map((title) => (
                  <AdvancedRow
                    key={title}
                    title={title}
                    description="Недоступно на текущем тарифе"
                    checked={false}
                    onChange={() => undefined}
                    disabled
                  />
                ))}
              </>
            ) : (
              <>
                <AdvancedRow
                  title="Просмотры"
                  description="Ограничьте просмотры и назначьте действие после достижения ограничения"
                  checked={viewsEnabled}
                  onChange={setViewsEnabled}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-3 text-sm font-medium">
                      Количество просмотров:
                      <Input
                        type="number"
                        min={1}
                        value={maxViews}
                        onChange={(event) =>
                          setMaxViews(Math.max(1, Number(event.target.value)))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-3 text-sm font-medium">
                      Дальнейшее действие:
                      <CapsuleSelect
                        value={viewLimitAction}
                        onChange={(value) =>
                          setViewLimitAction(value as "deactivate" | "delete")
                        }
                        options={[
                          ["deactivate", "Деактивировать"],
                          ["delete", "Удалить капсулу"],
                        ]}
                      />
                    </label>
                  </div>
                </AdvancedRow>
                <AdvancedRow
                  title="Время"
                  description="Активируйте, деактивируйте и удаляйте капсулу по времени"
                  checked={timeEnabled}
                  onChange={setTimeEnabled}
                >
                  <div className="flex flex-col gap-4">
                    <ScheduleField
                      label="Активировать:"
                      allowNow
                      value={activatePreset}
                      custom={activateCustom}
                      datePickerLocale={datePickerLocale}
                      onChange={setActivatePreset}
                      onCustom={setActivateCustom}
                    />
                    <ScheduleField
                      label="Деактивировать:"
                      value={deactivatePreset}
                      custom={deactivateCustom}
                      datePickerLocale={datePickerLocale}
                      onChange={setDeactivatePreset}
                      onCustom={setDeactivateCustom}
                    />
                    <ScheduleField
                      label="Удалить:"
                      value={deletePreset}
                      custom={deleteCustom}
                      datePickerLocale={datePickerLocale}
                      onChange={setDeletePreset}
                      onCustom={setDeleteCustom}
                    />
                  </div>
                </AdvancedRow>
                <AdvancedRow
                  title="Доступ"
                  description="Разрешите просмотр только конкретным пользователям"
                  checked={accessEnabled}
                  onChange={setAccessEnabled}
                >
                  <MultiSelect
                    filterable
                    searchPlaceholder="Имя, фамилия или email…"
                    value={recipients}
                    onValueChange={setRecipients}
                    onSearchQueryChange={setRecipientInput}
                    placeholder="Выберите пользователей"
                    onSearchSubmit={addRecipient}
                    renderSearchEmpty={(query, submit) =>
                      isValidEmail(query) ? (
                        <button
                          type="button"
                          className="w-full text-left text-sm text-foreground"
                          onClick={submit}
                        >
                          Добавить {query}
                        </button>
                      ) : (
                        "Неверный емейл"
                      )
                    }
                  >
                    <MultiSelectTrigger />
                    <MultiSelectContent className="min-w-[min(100vw-2rem,22rem)]">
                      {members.map((member) => (
                        <MultiSelectItem
                          key={member.userId}
                          value={member.email.toLocaleLowerCase()}
                          chipLabel={member.email}
                          searchText={`${member.firstName ?? ""} ${member.lastName ?? ""} ${member.email}`}
                          className="items-start py-2"
                        >
                          <span className="flex min-w-0 flex-col gap-0.5 leading-tight">
                            <span className="font-medium text-foreground">
                              {[member.firstName, member.lastName]
                                .filter(Boolean)
                                .join(" ") || member.email}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {member.email}
                            </span>
                          </span>
                        </MultiSelectItem>
                      ))}
                    </MultiSelectContent>
                  </MultiSelect>
                </AdvancedRow>
                <AdvancedRow
                  title="Пароль"
                  description="Требовать ввести пароль для просмотра"
                  checked={passwordEnabled}
                  onChange={setPasswordEnabled}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-3 text-sm font-medium">
                      Задайте пароль
                      <Input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                    </label>
                    <label className="flex flex-col gap-3 text-sm font-medium">
                      Колличество неудачных попыток
                      <Input
                        type="number"
                        min={1}
                        value={attemptLimit}
                        onChange={(event) =>
                          setAttemptLimit(
                            Math.max(1, Number(event.target.value)),
                          )
                        }
                      />
                    </label>
                  </div>
                </AdvancedRow>
                <AdvancedRow
                  title="Подтверждение"
                  description="Требовать подтверждение владельца перед показом"
                  checked={approvalRequired}
                  onChange={setApprovalRequired}
                />
              </>
            )}
          </div>
        ) : null}

        {advancedOpen && advancedAvailable ? (
          <label className="flex items-center gap-2 px-4 text-sm">
            <Checkbox
              checked={saveDefaults}
              onCheckedChange={(checked) => setSaveDefaults(Boolean(checked))}
            />
            Установить эти настройки по умолчанию для выбранного типа (только
            для меня)
          </label>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </Popup>
      <ExitNewItemFormConfirmPopup
        open={exitConfirmOpen}
        t={t}
        onClose={() => setExitConfirmOpen(false)}
        onConfirm={confirmExit}
      />
    </>
  );
}

function AdvancedRow({
  title,
  description,
  checked,
  onChange,
  children,
  disabled,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <section className="border-b p-4 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Switch
          size="lg"
          checked={checked}
          onCheckedChange={onChange}
          disabled={disabled}
        />
      </div>
      {checked && children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function CapsuleSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map(([option, label]) => (
            <SelectItem key={option} value={option}>
              {label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ScheduleField({
  label,
  value,
  custom,
  datePickerLocale,
  allowNow = false,
  onChange,
  onCustom,
}: {
  label: string;
  value: SchedulePreset;
  custom: string;
  datePickerLocale: Locale;
  allowNow?: boolean;
  onChange: (value: SchedulePreset) => void;
  onCustom: (value: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedDate = custom ? new Date(custom) : undefined;
  const options = scheduleOptions
    .filter((option) => allowNow || option.value !== "now")
    .map((option) => [option.value, option.label] as const);

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">{label}</span>
      <div className="grid grid-cols-2 gap-3">
        <CapsuleSelect
          value={value}
          onChange={(next) => {
            onChange(next as SchedulePreset);
            onCustom("");
          }}
          options={options}
        />
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 justify-start px-3 font-normal"
            >
              <CapsuleCalendarIcon data-icon="inline-start" />
              <span className="truncate">
                {selectedDate
                  ? formatCapsuleDateTime(selectedDate)
                  : "Дата и время"}
              </span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-3">
            <div className="flex flex-col gap-3">
              <Calendar
                mode="single"
                selected={selectedDate}
                locale={datePickerLocale}
                disabled={{ before: startOfToday() }}
                onSelect={(date) => {
                  if (!date) return;
                  const previous =
                    selectedDate ?? new Date(Date.now() + 60 * 60_000);
                  date.setHours(
                    previous.getHours(),
                    previous.getMinutes(),
                    0,
                    0,
                  );
                  if (date.getTime() <= Date.now()) {
                    date.setTime(Date.now() + 5 * 60_000);
                  }
                  onCustom(toLocalDateTimeValue(date));
                }}
              />
              <label className="flex flex-col gap-2 text-sm font-medium">
                Время
                <Input
                  type="time"
                  value={selectedDate ? toTimeValue(selectedDate) : ""}
                  min={
                    selectedDate && isToday(selectedDate)
                      ? toTimeValue(new Date(Date.now() + 60_000))
                      : undefined
                  }
                  onChange={(event) => {
                    const date = selectedDate ?? new Date();
                    const [hours, minutes] = event.target.value
                      .split(":")
                      .map(Number);
                    const next = new Date(date);
                    next.setHours(hours, minutes, 0, 0);
                    if (next.getTime() > Date.now())
                      onCustom(toLocalDateTimeValue(next));
                  }}
                />
              </label>
              <Button
                type="button"
                onClick={() => setPickerOpen(false)}
                disabled={!selectedDate}
              >
                Готово
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function toScheduleIso(preset: SchedulePreset, custom: string): string | null {
  if (custom) return new Date(custom).toISOString();
  if (preset === "never" || preset === "now") return null;
  const offsets: Record<Exclude<SchedulePreset, "never" | "now">, number> = {
    "15m": 15,
    "1h": 60,
    "6h": 360,
    "12h": 720,
    "24h": 1440,
  };
  return new Date(Date.now() + offsets[preset] * 60_000).toISOString();
}

function capsuleFieldRounding(fieldIndex: number, fieldsCount: number) {
  return getKeyFieldSurfaceRounding({
    mode: "edit",
    sectionVariant: "primary",
    fieldIndex,
    fieldsCount,
    canAddField: false,
  });
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.trim());
}

function startOfToday(): Date {
  const value = new Date();
  value.setHours(0, 0, 0, 0);
  return value;
}

function isToday(value: Date): boolean {
  const today = new Date();
  return (
    value.getFullYear() === today.getFullYear() &&
    value.getMonth() === today.getMonth() &&
    value.getDate() === today.getDate()
  );
}

function toTimeValue(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function toLocalDateTimeValue(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}T${toTimeValue(value)}`;
}

function formatCapsuleDateTime(value: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function CapsuleRecordFavicon({
  record,
}: {
  record: {
    id: string;
    vaultId: string;
    categoryId: string;
    title: string;
    faviconId?: string;
  };
}) {
  const { accessToken } = useAuthVault();
  const itemEncryptionKey = useResolvedVaultEncryptionKey(record.vaultId);
  const faviconUrl = useItemFaviconAttachmentUrl({
    accessToken,
    vaultKey: itemEncryptionKey,
    vaultId: record.vaultId,
    itemId: record.id,
    faviconId: record.faviconId,
    enabled: Boolean(itemEncryptionKey),
  });

  return (
    <ItemRecordFavicon
      categoryId={record.categoryId}
      title={record.title}
      faviconId={record.faviconId}
      previewImageSrc={faviconUrl.imageSrc}
      previewLoading={faviconUrl.loading}
      size={32}
      className="shrink-0"
    />
  );
}

function CapsuleTextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M8.00008 13.3334H14.0001M10.0001 3.33341L12.0001 5.33341M10.9174 2.41473C11.1828 2.14934 11.5427 2.00024 11.9181 2.00024C12.2934 2.00024 12.6533 2.14934 12.9187 2.41473C13.1841 2.68013 13.3332 3.04008 13.3332 3.4154C13.3332 3.79072 13.1841 4.15067 12.9187 4.41607L4.91207 12.4234C4.75346 12.582 4.55741 12.698 4.34207 12.7607L2.4274 13.3194C2.37003 13.3361 2.30923 13.3371 2.25134 13.3223C2.19345 13.3075 2.14062 13.2774 2.09836 13.2351C2.05611 13.1929 2.02599 13.14 2.01116 13.0821C1.99633 13.0242 1.99733 12.9634 2.01407 12.9061L2.57273 10.9914C2.63555 10.7763 2.75156 10.5805 2.91007 10.4221L10.9174 2.41473Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CapsuleFileIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M9.33341 1.33325V3.99992C9.33341 4.35354 9.47389 4.69268 9.72394 4.94273C9.97399 5.19278 10.3131 5.33325 10.6667 5.33325H13.3334M10.0001 1.33325H4.00008C3.64646 1.33325 3.30732 1.47373 3.05727 1.72378C2.80722 1.97382 2.66675 2.31296 2.66675 2.66659V13.3333C2.66675 13.6869 2.80722 14.026 3.05727 14.2761C3.30732 14.5261 3.64646 14.6666 4.00008 14.6666H12.0001C12.3537 14.6666 12.6928 14.5261 12.9429 14.2761C13.1929 14.026 13.3334 13.6869 13.3334 13.3333V4.66659L10.0001 1.33325Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CapsuleItemIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M9.33333 2.66667H14M9.33333 6H14M9.33333 10H14M9.33333 13.3333H14M2.66667 2H6C6.36819 2 6.66667 2.29848 6.66667 2.66667V6C6.66667 6.36819 6.36819 6.66667 6 6.66667H2.66667C2.29848 6.66667 2 6.36819 2 6V2.66667C2 2.29848 2.29848 2 2.66667 2ZM2.66667 9.33333H6C6.36819 9.33333 6.66667 9.63181 6.66667 10V13.3333C6.66667 13.7015 6.36819 14 6 14H2.66667C2.29848 14 2 13.7015 2 13.3333V10C2 9.63181 2.29848 9.33333 2.66667 9.33333Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CapsuleCalendarIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M5.33333 1.33325V3.99992M10.6667 1.33325V3.99992M2 6.66658H14M3.33333 2.66659H12.6667C13.403 2.66659 14 3.26354 14 3.99992V13.3333C14 14.0696 13.403 14.6666 12.6667 14.6666H3.33333C2.59695 14.6666 2 14.0696 2 13.3333V3.99992C2 3.26354 2.59695 2.66659 3.33333 2.66659Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FieldsAccessIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      {...props}
    >
      <path
        d="M3.33325 2.66675H3.99992C4.53035 2.66675 5.03906 2.87746 5.41413 3.25253C5.7892 3.62761 5.99992 4.13632 5.99992 4.66675M5.99992 4.66675C5.99992 4.13632 6.21063 3.62761 6.5857 3.25253C6.96078 2.87746 7.46949 2.66675 7.99992 2.66675H8.66658M5.99992 4.66675V11.3334M8.66658 13.3334H7.99992C7.46949 13.3334 6.96078 13.1227 6.5857 12.7476C6.21063 12.3726 5.99992 11.8638 5.99992 11.3334M5.99992 11.3334C5.99992 11.8638 5.7892 12.3726 5.41413 12.7476C5.03906 13.1227 4.53035 13.3334 3.99992 13.3334H3.33325M3.33325 10.6667H2.66659C2.31296 10.6667 1.97382 10.5263 1.72378 10.2762C1.47373 10.0262 1.33325 9.68704 1.33325 9.33341V6.66675C1.33325 6.31313 1.47373 5.97399 1.72378 5.72394C1.97382 5.47389 2.31296 5.33341 2.66659 5.33341H3.33325M8.66658 5.33341H13.3333C13.6869 5.33341 14.026 5.47389 14.2761 5.72394C14.5261 5.97399 14.6666 6.31313 14.6666 6.66675V9.33341C14.6666 9.68704 14.5261 10.0262 14.2761 10.2762C14.026 10.5263 13.6869 10.6667 13.3333 10.6667H8.66658"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
