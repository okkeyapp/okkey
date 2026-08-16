import { encryptCapsulePayload } from "@okkey/crypto";
import {
  hasPlanFeature,
  type CapsuleCreateRequestDto,
  type CapsuleType,
  type Workspace,
  type WorkspaceMemberDirectoryEntryDto,
} from "@okkey/types";
import {
  Button,
  Checkbox,
  Input,
  Popup,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@okkey/ui";
import {
  CalendarIcon,
  ChevronDownIcon,
  FileIcon,
  ListIcon,
  PencilLineIcon,
  SearchIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault, useAuthenticatedCoreClient } from "../../auth/AuthVaultContext";
import {
  buildEncryptedCapsule,
  bytesToBlob,
  releaseCapsuleKey,
} from "../../capsules/crypto";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import {
  CAPSULE_FROM_ITEM_QUERY_PARAM,
  NEW_CAPSULE_POPUP_ID,
  POPUP_QUERY_PARAM,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../../routes/popupQuery";

type SchedulePreset = "never" | "now" | "15m" | "1h" | "6h" | "12h" | "24h" | "custom";
type ScopeMode = "all" | "selected" | "all_except";

interface NewCapsulePopupProps {
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
  { value: "custom", label: "Конкретная дата и время" },
];

export default function NewCapsulePopup({ workspaceId, workspace, onCreated }: NewCapsulePopupProps) {
  const core = useAuthenticatedCoreClient();
  const { vaultKey } = useAuthVault();
  const { items } = useWorkspaceItems();
  const { canViewItem, canViewFieldType } = useWorkspaceVaultProfiles();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const popup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = popup?.popupId === NEW_CAPSULE_POPUP_ID;
  const sourceItemId = open ? searchParams.get(CAPSULE_FROM_ITEM_QUERY_PARAM)?.trim() ?? "" : "";
  const advancedAvailable = hasPlanFeature(workspace?.planTier, "capsuleAccessSettings");

  const [type, setType] = useState<CapsuleType>("text");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [fieldScope, setFieldScope] = useState<ScopeMode>("all");
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [viewsEnabled, setViewsEnabled] = useState(false);
  const [maxViews, setMaxViews] = useState(1);
  const [viewLimitAction, setViewLimitAction] = useState<"deactivate" | "delete">("deactivate");
  const [timeEnabled, setTimeEnabled] = useState(false);
  const [activatePreset, setActivatePreset] = useState<SchedulePreset>("now");
  const [deactivatePreset, setDeactivatePreset] = useState<SchedulePreset>("never");
  const [deletePreset, setDeletePreset] = useState<SchedulePreset>("never");
  const [activateCustom, setActivateCustom] = useState("");
  const [deactivateCustom, setDeactivateCustom] = useState("");
  const [deleteCustom, setDeleteCustom] = useState("");
  const [accessEnabled, setAccessEnabled] = useState(false);
  const [recipientInput, setRecipientInput] = useState("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [members, setMembers] = useState<WorkspaceMemberDirectoryEntryDto[]>([]);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [attemptLimit, setAttemptLimit] = useState(3);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [saveDefaults, setSaveDefaults] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableItems = useMemo(
    () =>
      items.filter(
        (item) =>
          !item.deleted &&
          canViewItem(item.vaultId, item.categoryId) &&
          item.title.toLocaleLowerCase().includes(itemSearch.trim().toLocaleLowerCase()),
      ),
    [canViewItem, itemSearch, items],
  );
  const selectedItem = items.find((item) => item.itemId === selectedItemId);
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
      void core.listWorkspaceMemberDirectory(workspaceId).then((result) => setMembers(result.members));
    }
  }, [advancedAvailable, core, open, sourceItemId, workspaceId]);

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
    name.trim().length > 0 &&
    (type === "text" ? text.trim().length > 0 : type === "file" ? Boolean(file) : Boolean(selectedItem)) &&
    (!passwordEnabled || (password.length >= 4 && password === passwordConfirm));
  const dirty = Boolean(
    name || text || file || selectedItemId || viewsEnabled || timeEnabled || accessEnabled ||
    passwordEnabled || approvalRequired,
  );
  const requestClose = () => {
    if (!dirty || window.confirm("Закрыть без сохранения изменений?")) {
      close();
    }
  };

  const addRecipient = (raw: string) => {
    const email = raw.trim().toLocaleLowerCase();
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) {
      setRecipients((current) => (current.includes(email) ? current : [...current, email]));
      setRecipientInput("");
    }
  };

  const save = async () => {
    if (!core || !vaultKey || !canSave) return;
    setSaving(true);
    setError(null);
    let generated: Awaited<ReturnType<typeof buildEncryptedCapsule>> | null = null;
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
        payload: type === "text" ? { type, text } : type === "file" ? { type, name: file?.name } : { type, item: itemPayload },
        metadata: { name: name.trim(), fileName: file?.name, itemTitle: selectedItem?.title },
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
              ...(toScheduleIso(activatePreset, activateCustom) ? { activateAt: toScheduleIso(activatePreset, activateCustom)! } : {}),
              ...(toScheduleIso(deactivatePreset, deactivateCustom) ? { deactivateAt: toScheduleIso(deactivatePreset, deactivateCustom)! } : {}),
              ...(toScheduleIso(deletePreset, deleteCustom) ? { deleteAt: toScheduleIso(deletePreset, deleteCustom)! } : {}),
            }
          : {}),
        ...(accessEnabled && recipients.length > 0 ? { allowedRecipientEmails: recipients } : {}),
        ...(passwordEnabled ? { password, passwordAttemptLimit: attemptLimit } : {}),
        ...(approvalRequired ? { approvalRequired: true } : {}),
      };
      if (type === "file" && file) {
        body.filePayload = bytesToBlob(
          await encryptCapsulePayload(generated.capsuleKey, new Uint8Array(await file.arrayBuffer())),
          "capsule_file_payload",
        );
      }
      const created = await core.createCapsule(workspaceId, body);
      const url = `${window.location.origin}/capsule/${created.capsuleId}#key=${generated.fragment}`;
      await navigator.clipboard.writeText(url);
      if (saveDefaults) {
        localStorage.setItem(
          `okkey:capsule-defaults:${type}`,
          JSON.stringify({ viewsEnabled, maxViews, viewLimitAction, timeEnabled, accessEnabled, passwordEnabled, approvalRequired }),
        );
      }
      toast.success("Капсула создана, ссылка скопирована");
      onCreated?.();
      close();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось создать капсулу");
    } finally {
      if (generated) releaseCapsuleKey(generated.capsuleKey);
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <Popup
      header="Новая капсула"
      width={720}
      onClose={close}
      onCloseRequest={() => !dirty || window.confirm("Закрыть без сохранения изменений?")}
      contentClassName="flex flex-col gap-4"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={requestClose}>Отмена</Button>
          <Button disabled={!canSave || saving} onClick={() => void save()}>
            {saving ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      }
    >
      <div className="flex w-fit rounded-lg bg-secondary p-1">
        {([
          ["text", PencilLineIcon, "Текст"],
          ["file", FileIcon, "Файл"],
          ["item", ListIcon, "Запись"],
        ] as const).map(([value, Icon, label]) => (
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

      <div className="overflow-hidden rounded-xl border">
        <label className="flex flex-col gap-1 px-4 py-2 text-xs">
          название
          <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Введите короткое название" />
        </label>
        <div className="border-t px-4 py-2">
          {type === "text" ? (
            <label className="flex flex-col gap-1 text-xs">
              секретный текст
              <textarea
                className="min-h-24 resize-y bg-transparent text-sm outline-none"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Введите текст, которым хотите поделиться"
              />
            </label>
          ) : type === "file" ? (
            <label className="flex cursor-pointer flex-col gap-1 text-xs">
              секретный файл
              <span className="flex h-20 items-center justify-center gap-2 rounded-lg border-2 border-dashed text-sm font-medium">
                <UploadIcon />
                {file?.name ?? "Загрузить файл"}
              </span>
              <input className="sr-only" type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
          ) : selectedItem ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{selectedItem.title}</p>
                  <p className="text-sm text-muted-foreground">{selectedItem.categoryId}</p>
                </div>
                <Button size="iconSm" variant="ghost" onClick={() => setSelectedItemId("")}><XIcon /></Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Доступные поля:</span>
                <CapsuleSelect value={fieldScope} onChange={(value) => setFieldScope(value as ScopeMode)} options={[
                  ["all", "Все"],
                  ["selected", "Только выбранные"],
                  ["all_except", "Все, кроме"],
                ]} />
                {fieldScope !== "all" ? (
                  <div className="flex flex-wrap gap-2">
                    {visibleFields.map((field) => (
                      <label key={field.id} className="flex items-center gap-1 text-sm">
                        <Checkbox
                          checked={selectedFieldIds.includes(field.id)}
                          onCheckedChange={(checked) =>
                            setSelectedFieldIds((current) =>
                              checked ? [...current, field.id] : current.filter((id) => id !== field.id),
                            )
                          }
                        />
                        {field.label || field.type}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="relative">
              <SearchIcon className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input className="pl-9" value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Поиск записи" />
              {itemSearch ? (
                <div className="mt-2 max-h-48 overflow-auto rounded-lg border bg-background p-1 shadow-sm">
                  {availableItems.length ? availableItems.map((item) => (
                    <button key={item.itemId} type="button" className="flex w-full rounded-md px-3 py-2 text-left text-sm hover:bg-muted" onClick={() => setSelectedItemId(item.itemId)}>
                      {item.title}
                    </button>
                  )) : <p className="px-3 py-4 text-sm text-muted-foreground">Записей не найдено</p>}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      <Button variant="secondary" className="w-full" onClick={() => setAdvancedOpen((value) => !value)}>
        Расширенные настройки
        <ChevronDownIcon data-icon="inline-end" className={advancedOpen ? "rotate-180" : undefined} />
      </Button>

      {advancedOpen ? (
        <div className="overflow-hidden rounded-xl bg-secondary">
          {!advancedAvailable ? (
            <>
              <p className="p-4 text-sm text-muted-foreground">Расширенные настройки доступны в тарифе Enterprise.</p>
              {["Просмотры", "Время", "Доступ", "Пароль", "Подтверждение"].map((title) => (
                <AdvancedRow key={title} title={title} description="Недоступно на текущем тарифе" checked={false} onChange={() => undefined} disabled />
              ))}
            </>
          ) : (
            <>
              <AdvancedRow title="Просмотры" description="Ограничьте просмотры и назначьте действие после достижения ограничения" checked={viewsEnabled} onChange={setViewsEnabled}>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="number" min={1} value={maxViews} onChange={(event) => setMaxViews(Math.max(1, Number(event.target.value)))} />
                  <CapsuleSelect value={viewLimitAction} onChange={(value) => setViewLimitAction(value as "deactivate" | "delete")} options={[["deactivate", "Деактивировать"], ["delete", "Удалить капсулу"]]} />
                </div>
              </AdvancedRow>
              <AdvancedRow title="Время" description="Активируйте, деактивируйте и удаляйте капсулу по времени" checked={timeEnabled} onChange={setTimeEnabled}>
                <div className="grid grid-cols-3 gap-3">
                  <ScheduleField label="Активировать" value={activatePreset} custom={activateCustom} onChange={setActivatePreset} onCustom={setActivateCustom} />
                  <ScheduleField label="Деактивировать" value={deactivatePreset} custom={deactivateCustom} onChange={setDeactivatePreset} onCustom={setDeactivateCustom} />
                  <ScheduleField label="Удалить" value={deletePreset} custom={deleteCustom} onChange={setDeletePreset} onCustom={setDeleteCustom} />
                </div>
              </AdvancedRow>
              <AdvancedRow title="Доступ" description="Разрешите просмотр только конкретным пользователям" checked={accessEnabled} onChange={setAccessEnabled}>
                <div className="flex flex-wrap gap-2 rounded-lg border bg-background p-2">
                  {recipients.map((email) => (
                    <span key={email} className="flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-sm">
                      {email}
                      <button type="button" onClick={() => setRecipients((current) => current.filter((value) => value !== email))}><XIcon className="size-3" /></button>
                    </span>
                  ))}
                  <input
                    className="min-w-48 flex-1 bg-transparent text-sm outline-none"
                    value={recipientInput}
                    placeholder="Email или имя участника"
                    onChange={(event) => setRecipientInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === ",") {
                        event.preventDefault();
                        addRecipient(recipientInput);
                      }
                    }}
                    onBlur={() => addRecipient(recipientInput)}
                  />
                </div>
                {recipientInput ? (
                  <div className="mt-1 rounded-lg border bg-background p-1">
                    {members.filter((member) => `${member.firstName ?? ""} ${member.lastName ?? ""} ${member.email}`.toLocaleLowerCase().includes(recipientInput.toLocaleLowerCase())).slice(0, 6).map((member) => (
                      <button type="button" key={member.userId} className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-muted" onMouseDown={(event) => event.preventDefault()} onClick={() => addRecipient(member.email)}>
                        {[member.firstName, member.lastName].filter(Boolean).join(" ") || member.email}
                        <span className="ml-2 text-muted-foreground">{member.email}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </AdvancedRow>
              <AdvancedRow title="Пароль" description="Требовать ввести пароль для просмотра" checked={passwordEnabled} onChange={setPasswordEnabled}>
                <div className="grid grid-cols-3 gap-3">
                  <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Пароль" />
                  <Input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} placeholder="Повторите пароль" />
                  <Input type="number" min={1} value={attemptLimit} onChange={(event) => setAttemptLimit(Math.max(1, Number(event.target.value)))} aria-label="Количество попыток" />
                </div>
              </AdvancedRow>
              <AdvancedRow title="Подтверждение" description="Требовать подтверждение владельца перед показом" checked={approvalRequired} onChange={setApprovalRequired} />
            </>
          )}
        </div>
      ) : null}

      {advancedOpen && advancedAvailable ? (
        <label className="flex items-center gap-2 px-4 text-sm">
          <Checkbox checked={saveDefaults} onCheckedChange={(checked) => setSaveDefaults(Boolean(checked))} />
          Установить эти настройки по умолчанию для выбранного типа (только для меня)
        </label>
      ) : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </Popup>
  );
}

function AdvancedRow({ title, description, checked, onChange, children, disabled }: {
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
        <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
      </div>
      {checked && children ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function CapsuleSelect({ value, onChange, options }: {
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent><SelectGroup>{options.map(([option, label]) => <SelectItem key={option} value={option}>{label}</SelectItem>)}</SelectGroup></SelectContent>
    </Select>
  );
}

function ScheduleField({ label, value, custom, onChange, onCustom }: {
  label: string;
  value: SchedulePreset;
  custom: string;
  onChange: (value: SchedulePreset) => void;
  onCustom: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium">
      {label}
      <CapsuleSelect value={value} onChange={(next) => onChange(next as SchedulePreset)} options={scheduleOptions.map((option) => [option.value, option.label] as const)} />
      {value === "custom" ? (
        <span className="relative">
          <Input type="datetime-local" value={custom} onChange={(event) => onCustom(event.target.value)} />
          <CalendarIcon className="pointer-events-none absolute right-3 top-2.5 size-4" />
        </span>
      ) : null}
    </label>
  );
}

function toScheduleIso(preset: SchedulePreset, custom: string): string | null {
  if (preset === "never" || preset === "now") return null;
  if (preset === "custom") return custom ? new Date(custom).toISOString() : null;
  const offsets: Record<Exclude<SchedulePreset, "never" | "now" | "custom">, number> = {
    "15m": 15,
    "1h": 60,
    "6h": 360,
    "12h": 720,
    "24h": 1440,
  };
  return new Date(Date.now() + offsets[preset] * 60_000).toISOString();
}
