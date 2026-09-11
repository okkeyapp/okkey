import { encryptCapsulePayload } from "@okkey/crypto";
import type { WebMessageValues } from "@okkey/i18n";
import type { Locale } from "date-fns";
import {
  hasPlanFeature,
  DEFAULT_WORKSPACE_CAPSULE_POLICIES,
  isCapsuleAllowedForMember,
  type CapsuleAccessDefaultsDto,
  type CapsuleCreateRequestDto,
  type CapsuleOwnerDetailDto,
  type CapsuleType,
  type CapsuleUpdateRequestDto,
  type Workspace,
  type WorkspaceCapsulePolicies,
  type WorkspaceMemberDirectoryEntryDto,
} from "@okkey/types";
import {
  Button,
  Calendar,
  CalendarMonthYearCaption,
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
  SelectLabel,
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
  Fragment,
  useEffect,
  useMemo,
  useRef,
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
import { useSectionReauth } from "../../auth/SectionReauthContext";
import { usePopupZoneGate } from "../../auth/usePopupZoneGate";
import { notifyCapsulesListRefresh } from "../../capsules/capsulesListRefresh";
import { buildItemCapsuleAttachmentPayloads } from "../../capsules/itemAttachments";
import {
  buildEncryptedCapsule,
  bytesToBlob,
  decryptOwnerCapsuleMetadata,
  decryptOwnerCapsulePayload,
  reencryptCapsuleWithOwnerKey,
  recoverOwnerCapsuleFragment,
  releaseCapsuleKey,
  type CapsuleOwnerMetadata,
} from "../../capsules/crypto";
import { useWorkspaceItems } from "../../items/WorkspaceItemsContext";
import { itemMatchesPrimaryFieldSearch } from "../../items/itemListRecordDescription";
import { scoreItemsListRecordSearch } from "../../items/workspaceItemSearch";
import { useWorkspaceVaultProfiles } from "../../items/WorkspaceVaultProfilesContext";
import { useItemFaviconAttachmentUrl } from "../../items/useItemFaviconAttachmentUrl";
import { useResolvedVaultEncryptionKey } from "../../items/useResolvedVaultEncryptionKey";
import { getDatePickerLocale } from "../../lib/datePickerLocale";
import { useLocale } from "../../locale/LocaleContext";
import { createKeyFormEditorMessages } from "../key-form/keyFormI18n";
import { resolveKeyFormFieldLabel } from "../key-form/keyFormFieldLabel";
import ExitNewItemFormConfirmPopup from "../items/ExitNewItemFormConfirmPopup";
import ItemRecordFavicon from "../items/ItemRecordFavicon";
import CapsuleActionsMenu from "./CapsuleActionsMenu";
import DeleteCapsulesConfirmPopup from "./DeleteCapsulesConfirmPopup";
import {
  CAPSULE_FROM_ITEM_QUERY_PARAM,
  EDIT_CAPSULE_POPUP_ID,
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

const scheduleOptionKeys: SchedulePreset[] = ["never", "now", "15m", "1h", "6h", "12h", "24h"];

function getScheduleOptions(t: (messageKey: string) => string): { value: SchedulePreset; label: string }[] {
  return scheduleOptionKeys.map((value) => ({
    value,
    label: t(`web.capsules.popup.schedule.${value}`),
  }));
}

const emptyCapsuleAccessDefaults: CapsuleAccessDefaultsDto = {
  viewsEnabled: false,
  maxViews: 1,
  viewLimitAction: "deactivate",
  timeEnabled: false,
  activatePreset: "now",
  deactivatePreset: "never",
  deletePreset: "never",
  accessEnabled: false,
  passwordEnabled: false,
  attemptLimit: 3,
  approvalRequired: false,
};

function applyWorkspacePoliciesToCapsuleDefaults(
  defaults: CapsuleAccessDefaultsDto,
  policies: WorkspaceCapsulePolicies,
): CapsuleAccessDefaultsDto {
  return {
    ...defaults,
    viewsEnabled: policies.forceMaxViews > 0 ? true : defaults.viewsEnabled,
    maxViews: policies.forceMaxViews > 0 ? policies.forceMaxViews : defaults.maxViews,
    timeEnabled: policies.requireTimeDeactivation ? true : defaults.timeEnabled,
    deactivatePreset:
      policies.requireTimeDeactivation && defaults.deactivatePreset === "never"
        ? "15m"
        : defaults.deactivatePreset,
    accessEnabled: policies.requireAccess ? true : defaults.accessEnabled,
    passwordEnabled: policies.requirePassword ? true : defaults.passwordEnabled,
    attemptLimit:
      policies.passwordAttemptLimit > 0
        ? policies.passwordAttemptLimit
        : defaults.attemptLimit,
    approvalRequired: policies.requireApproval ? true : defaults.approvalRequired,
  };
}
const scheduleHours = Array.from({ length: 24 }, (_, index) => index);
const scheduleMinutes = Array.from({ length: 60 }, (_, index) => index);
const capsuleCalendarStartMonth = new Date(new Date().getFullYear() - 100, 0);
const capsuleCalendarEndMonth = new Date(new Date().getFullYear() + 10, 11);

export default function NewCapsulePopup({
  t,
  workspaceId,
  workspace,
  onCreated,
}: NewCapsulePopupProps) {
  const core = useAuthenticatedCoreClient();
  const { vaultKey, accessToken, userId } = useAuthVault();
  const { locale } = useLocale();
  const { items, records, fileUploadConstraints, resolveVaultEncryptionKey } = useWorkspaceItems();
  const { canViewItem, canViewFieldType } = useWorkspaceVaultProfiles();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const popup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const editingCapsuleId =
    popup?.popupId === EDIT_CAPSULE_POPUP_ID ? popup.menuItemId?.trim() ?? "" : "";
  const isEditing = Boolean(editingCapsuleId);
  const urlOpen = popup?.popupId === NEW_CAPSULE_POPUP_ID || isEditing;
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
  const open = usePopupZoneGate("capsulePopups", urlOpen, close);
  const { requestZoneUnlock } = useSectionReauth();
  const sourceItemId = open
    ? (searchParams.get(CAPSULE_FROM_ITEM_QUERY_PARAM)?.trim() ?? "")
    : "";
  const advancedAvailable = hasPlanFeature(
    workspace?.planTier,
    "capsuleAccessSettings",
  );
  const capsulePolicies: WorkspaceCapsulePolicies =
    workspace?.capsulePolicies ?? DEFAULT_WORKSPACE_CAPSULE_POLICIES;
  const capsulesAllowedForMember = isCapsuleAllowedForMember(capsulePolicies, userId);
  const forceMaxViews = capsulePolicies.forceMaxViews > 0;
  const forceTimeDeactivation = capsulePolicies.requireTimeDeactivation;
  const forceAccess = capsulePolicies.requireAccess;
  const forcePassword = capsulePolicies.requirePassword;
  const forcePasswordAttemptLimit = capsulePolicies.passwordAttemptLimit > 0;
  const forceApproval = capsulePolicies.requireApproval;
  const membersOnlyAccess = capsulePolicies.accessAudience === "workspace_members_only";
  const datePickerLocale = useMemo(() => getDatePickerLocale(locale), [locale]);
  const keyFormMessages = useMemo(() => createKeyFormEditorMessages(locale), [locale]);
  const scheduleOptions = useMemo(() => getScheduleOptions(t), [t]);
  const deactivateScheduleOptions = useMemo(() => {
    if (!forceTimeDeactivation) {
      return scheduleOptions;
    }
    return scheduleOptions.filter((option) => option.value !== "never");
  }, [forceTimeDeactivation, scheduleOptions]);
  const capsuleTypeOptions = useMemo(
    () =>
      [
        ["text", CapsuleTextIcon, t("web.capsules.list.type.text")],
        ["file", CapsuleFileIcon, t("web.capsules.list.type.file")],
        ["item", CapsuleItemIcon, t("web.capsules.list.type.item")],
      ] as const,
    [t],
  );

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
  const [savedDefaults, setSavedDefaults] = useState<CapsuleAccessDefaultsDto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingDetail, setEditingDetail] = useState<CapsuleOwnerDetailDto | null>(null);
  const [existingFileMeta, setExistingFileMeta] = useState<KeyFieldFileValue | null>(null);
  const [hadPassword, setHadPassword] = useState(false);
  const [hadRecipients, setHadRecipients] = useState(false);
  const [editHydrated, setEditHydrated] = useState(false);
  const [editBaseline, setEditBaseline] = useState<string | null>(null);
  const popupIdentity = !open ? "closed" : isEditing ? `edit:${editingCapsuleId}` : "create";
  const activationMinimumDate = useMemo(
    () =>
      resolveScheduleDate(activatePreset, activateCustom, new Date()) ??
      new Date(),
    [activateCustom, activatePreset],
  );

  useEffect(() => {
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
    setSavedDefaults(null);
    setError(null);
    setExitConfirmOpen(false);
    setDeleteConfirmOpen(false);
    setDeleting(false);
    setEditingDetail(null);
    setExistingFileMeta(null);
    setHadPassword(false);
    setHadRecipients(false);
    setEditHydrated(false);
    setEditBaseline(null);
  }, [popupIdentity]);

  useEffect(() => {
    if (isEditing) return;
    const minimumTime = activationMinimumDate.getTime();
    if (
      deactivateCustom &&
      new Date(deactivateCustom).getTime() < minimumTime
    ) {
      setDeactivateCustom("");
    }
    if (deleteCustom && new Date(deleteCustom).getTime() < minimumTime) {
      setDeleteCustom("");
    }
  }, [activationMinimumDate, deactivateCustom, deleteCustom, isEditing]);

  const availableRecords = useMemo(() => {
    const needle = itemSearch.trim();
    const itemsById = new Map(items.map((item) => [item.itemId, item]));
    return records.filter((record) => {
      if (record.deleted || !canViewItem(record.vaultId, record.categoryId)) {
        return false;
      }
      if (!needle) {
        return true;
      }
      if (scoreItemsListRecordSearch(record, needle) > 0) {
        return true;
      }
      const item = itemsById.get(record.id);
      if (!item) {
        return false;
      }
      return itemMatchesPrimaryFieldSearch(item, needle, (fieldType) =>
        canViewFieldType(item.vaultId, fieldType),
      );
    });
  }, [canViewFieldType, canViewItem, itemSearch, items, records]);
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
    if (!isEditing && sourceItemId) {
      setType("item");
      setSelectedItemId(sourceItemId);
    }
    if (core && advancedAvailable) {
      void core
        .listWorkspaceMemberDirectory(workspaceId)
        .then((result) => setMembers(result.members));
      if (!isEditing) {
        void core
          .getWorkspaceCapsuleDefaults(workspaceId)
          .then((result) => {
            setSavedDefaults(pickSharedCapsuleDefaults(result.defaults));
          })
          .catch(() => {
            setSavedDefaults(null);
          });
      }
    }
  }, [advancedAvailable, core, isEditing, open, sourceItemId, workspaceId]);

  useEffect(() => {
    if (!open || !advancedAvailable || isEditing) return;
    applyCapsuleAccessDefaults(savedDefaults, {
      setViewsEnabled,
      setMaxViews,
      setViewLimitAction,
      setTimeEnabled,
      setActivatePreset,
      setDeactivatePreset,
      setDeletePreset,
      setAccessEnabled,
      setPasswordEnabled,
      setAttemptLimit,
      setApprovalRequired,
    });
  }, [advancedAvailable, isEditing, savedDefaults, open]);

  useEffect(() => {
    if (!open || !advancedAvailable) return;
    if (forceMaxViews) {
      setViewsEnabled(true);
      setMaxViews(capsulePolicies.forceMaxViews);
    }
    if (forceTimeDeactivation) {
      setTimeEnabled(true);
      setDeactivatePreset((prev) => (prev === "never" ? "15m" : prev));
    }
    if (forceAccess) {
      setAccessEnabled(true);
    }
    if (forcePassword) {
      setPasswordEnabled(true);
    }
    if (forcePasswordAttemptLimit) {
      setAttemptLimit(capsulePolicies.passwordAttemptLimit);
    }
    if (forceApproval) {
      setApprovalRequired(true);
    }
  }, [
    advancedAvailable,
    capsulePolicies.forceMaxViews,
    capsulePolicies.passwordAttemptLimit,
    forceAccess,
    forceApproval,
    forceMaxViews,
    forcePassword,
    forcePasswordAttemptLimit,
    forceTimeDeactivation,
    open,
    savedDefaults,
    editHydrated,
  ]);

  useEffect(() => {
    if (!open || isEditing || capsulesAllowedForMember) return;
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: true },
    );
  }, [
    capsulesAllowedForMember,
    isEditing,
    location.hash,
    location.pathname,
    location.search,
    navigate,
    open,
  ]);

  useEffect(() => {
    if (!open || !isEditing || !core || !vaultKey || !editingCapsuleId) return;
    let cancelled = false;
    void (async () => {
      try {
        const detail = await core.getOwnerCapsule(editingCapsuleId);
        const [payload, metadata] = await Promise.all([
          decryptOwnerCapsulePayload(vaultKey, detail.encryptedPayload, detail.ownerKeyWrap),
          decryptOwnerCapsuleMetadata(vaultKey, detail.encryptedMetadata, detail.ownerKeyWrap),
        ]);
        if (cancelled) return;
        const baseline = applyLoadedCapsule(detail, payload, metadata, {
          setType,
          setName,
          setText,
          setSelectedItemId,
          setFieldScope,
          setSelectedFieldIds,
          setViewsEnabled,
          setMaxViews,
          setViewLimitAction,
          setTimeEnabled,
          setActivatePreset,
          setDeactivatePreset,
          setDeletePreset,
          setActivateCustom,
          setDeactivateCustom,
          setDeleteCustom,
          setAccessEnabled,
          setPasswordEnabled,
          setAttemptLimit,
          setApprovalRequired,
          setAdvancedOpen,
          setExistingFileMeta,
          setHadPassword,
          setHadRecipients,
          setRecipients,
          setEditingDetail,
        });
        setEditBaseline(baseline);
        setEditHydrated(true);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : t("web.capsules.popup.loadError"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, editingCapsuleId, isEditing, open, vaultKey]);

  const effectiveViewsEnabled = forceMaxViews || viewsEnabled;
  const effectiveMaxViews = forceMaxViews ? capsulePolicies.forceMaxViews : maxViews;
  const effectiveTimeEnabled = forceTimeDeactivation || timeEnabled;
  const effectiveAccessEnabled = forceAccess || accessEnabled;
  const effectivePasswordEnabled = forcePassword || passwordEnabled;
  const effectiveAttemptLimit = forcePasswordAttemptLimit
    ? capsulePolicies.passwordAttemptLimit
    : attemptLimit;
  const effectiveApprovalRequired = forceApproval || approvalRequired;
  const passwordInvalid =
    effectivePasswordEnabled &&
    password.length < 4 &&
    !(isEditing && hadPassword && password.length === 0);
  const recipientsInvalid =
    effectiveAccessEnabled && recipients.length === 0 && !(isEditing && hadRecipients);
  const activateSchedulePast = effectiveTimeEnabled && isPastCustomDate(activateCustom);
  const deactivateSchedulePast = effectiveTimeEnabled && isPastCustomDate(deactivateCustom);
  const deleteSchedulePast = effectiveTimeEnabled && isPastCustomDate(deleteCustom);
  const schedulePast = activateSchedulePast || deactivateSchedulePast || deleteSchedulePast;
  const editorFingerprint = capsuleEditorFingerprint({
    type,
    name,
    text,
    fileKey: file
      ? `upload:${file.name}:${file.size}:${file.lastModified}`
      : existingFileMeta
        ? `keep:${existingFileMeta.name}`
        : "",
    selectedItemId,
    fieldScope,
    selectedFieldIds,
    viewsEnabled,
    maxViews,
    viewLimitAction,
    timeEnabled,
    activatePreset,
    deactivatePreset,
    deletePreset,
    activateCustom,
    deactivateCustom,
    deleteCustom,
    accessEnabled,
    recipients,
    passwordEnabled,
    password,
    attemptLimit,
    approvalRequired,
    saveDefaults,
  });
  const createDirty = useMemo(() => {
    const advancedBase = savedDefaults ?? emptyCapsuleAccessDefaults;
    const advanced = advancedAvailable
      ? applyWorkspacePoliciesToCapsuleDefaults(advancedBase, capsulePolicies)
      : advancedBase;
    const baselineType: CapsuleType = sourceItemId ? "item" : "text";
    const baselineItemId = sourceItemId || "";
    const stillApplyingSourceItem =
      Boolean(sourceItemId) && type === "text" && selectedItemId === "";
    return (
      (!stillApplyingSourceItem && type !== baselineType) ||
      name !== "" ||
      text !== "" ||
      file !== null ||
      itemSearch !== "" ||
      selectedItemId !== baselineItemId ||
      fieldScope !== "all" ||
      selectedFieldIds.length > 0 ||
      viewsEnabled !== advanced.viewsEnabled ||
      maxViews !== advanced.maxViews ||
      viewLimitAction !== advanced.viewLimitAction ||
      timeEnabled !== advanced.timeEnabled ||
      activatePreset !== advanced.activatePreset ||
      deactivatePreset !== advanced.deactivatePreset ||
      deletePreset !== advanced.deletePreset ||
      activateCustom !== "" ||
      deactivateCustom !== "" ||
      deleteCustom !== "" ||
      accessEnabled !== advanced.accessEnabled ||
      recipientInput !== "" ||
      recipients.length > 0 ||
      passwordEnabled !== advanced.passwordEnabled ||
      password !== "" ||
      attemptLimit !== advanced.attemptLimit ||
      approvalRequired !== advanced.approvalRequired ||
      saveDefaults
    );
  }, [
    accessEnabled,
    activateCustom,
    activatePreset,
    advancedAvailable,
    approvalRequired,
    attemptLimit,
    capsulePolicies,
    deactivateCustom,
    deactivatePreset,
    deleteCustom,
    deletePreset,
    fieldScope,
    file,
    itemSearch,
    maxViews,
    name,
    password,
    passwordEnabled,
    recipientInput,
    recipients,
    saveDefaults,
    savedDefaults,
    selectedFieldIds,
    selectedItemId,
    sourceItemId,
    text,
    timeEnabled,
    type,
    viewLimitAction,
    viewsEnabled,
  ]);
  const dirty = isEditing
    ? editBaseline !== null && editorFingerprint !== editBaseline
    : createDirty;
  const canSave =
    (!isEditing || editHydrated) &&
    (!isEditing || dirty) &&
    (type === "item" || name.trim().length > 0) &&
    (type === "text"
      ? text.trim().length > 0
      : type === "file"
        ? Boolean(file) || Boolean(existingFileMeta)
        : Boolean(selectedItem)) &&
    !passwordInvalid &&
    !recipientsInvalid &&
    !schedulePast;
  const advancedSettingsSummary = useMemo(
    () =>
      summarizeCapsuleAdvancedSettings({
        viewsEnabled: effectiveViewsEnabled,
        maxViews: effectiveMaxViews,
        timeEnabled: effectiveTimeEnabled,
        accessEnabled: effectiveAccessEnabled,
        recipients,
        passwordEnabled: effectivePasswordEnabled,
        password,
        passwordKept: isEditing && hadPassword && password.length === 0,
        recipientsKept: isEditing && hadRecipients && recipients.length === 0,
        approvalRequired: effectiveApprovalRequired,
      }),
    [
      effectiveAccessEnabled,
      effectiveApprovalRequired,
      effectiveMaxViews,
      effectivePasswordEnabled,
      effectiveTimeEnabled,
      effectiveViewsEnabled,
      hadPassword,
      hadRecipients,
      isEditing,
      password,
      recipients,
    ],
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
    if (
      membersOnlyAccess &&
      !members.some((member) => member.email.toLocaleLowerCase() === email)
    ) {
      return false;
    }
    setRecipients((current) =>
      current.includes(email) ? current : [...current, email],
    );
    setRecipientInput("");
    return true;
  };

  const copyEditingLink = async () => {
    if (!vaultKey || !editingDetail) return;
    const fragment = await recoverOwnerCapsuleFragment(vaultKey, editingDetail.ownerKeyWrap);
    await navigator.clipboard.writeText(
      `${window.location.origin}/capsule/${editingDetail.capsuleId}#key=${fragment}`,
    );
    toast.success(t("web.capsules.list.toast.linkCopiedSingle"));
  };

  const changeEditingState = async (state: "active" | "inactive") => {
    if (!core || !editingDetail) return;
    const updated = await core.setCapsuleState(editingDetail.capsuleId, state);
    setEditingDetail({ ...editingDetail, ...updated });
    toast.success(
      state === "inactive"
        ? t("web.capsules.list.toast.deactivatedSingle")
        : t("web.capsules.list.toast.activatedSingle"),
    );
    notifyCapsulesListRefresh();
    if (state === "active") {
      const nextActivatePreset = activateSchedulePast ? "now" : activatePreset;
      const nextActivateCustom = activateSchedulePast ? "" : activateCustom;
      const nextDeactivatePreset = deactivateSchedulePast ? "never" : deactivatePreset;
      const nextDeactivateCustom = deactivateSchedulePast ? "" : deactivateCustom;
      const nextDeletePreset = deleteSchedulePast ? "never" : deletePreset;
      const nextDeleteCustom = deleteSchedulePast ? "" : deleteCustom;
      if (timeEnabled || forceTimeDeactivation) {
        if (activateSchedulePast) {
          setActivatePreset("now");
          setActivateCustom("");
        }
        if (deactivateSchedulePast) {
          setDeactivatePreset(forceTimeDeactivation ? "15m" : "never");
          setDeactivateCustom("");
        }
        if (deleteSchedulePast) {
          setDeletePreset("never");
          setDeleteCustom("");
        }
      }
      if (editBaseline) {
        const previous = JSON.parse(editBaseline) as Parameters<typeof capsuleEditorFingerprint>[0];
        setEditBaseline(
          capsuleEditorFingerprint({
            ...previous,
            activatePreset: nextActivatePreset,
            deactivatePreset: nextDeactivatePreset,
            deletePreset: nextDeletePreset,
            activateCustom: nextActivateCustom,
            deactivateCustom: nextDeactivateCustom,
            deleteCustom: nextDeleteCustom,
          }),
        );
      }
    }
  };

  const deleteEditing = async () => {
    if (!core || !editingDetail) return;
    if (!(await requestZoneUnlock("deletion", { persist: false }))) {
      return;
    }
    setDeleting(true);
    try {
      await core.deleteCapsule(editingDetail.capsuleId);
      toast.success(t("web.capsules.list.toast.deletedSingle"));
      notifyCapsulesListRefresh();
      setDeleteConfirmOpen(false);
      close();
    } finally {
      setDeleting(false);
    }
  };

  const save = async () => {
    if (!core || !vaultKey || !canSave) return;
    setSaving(true);
    setError(null);
    let generated:
      | Awaited<ReturnType<typeof buildEncryptedCapsule>>
      | Awaited<ReturnType<typeof reencryptCapsuleWithOwnerKey>>
      | null = null;
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
      const payload =
        type === "text"
          ? { type, text, name: name.trim() }
          : type === "file"
            ? {
                type,
                name: name.trim(),
                fileName: file?.name ?? existingFileMeta?.name,
              }
            : { type, item: itemPayload };
      const metadata = {
        name: type === "item" ? (selectedItem?.title ?? "") : name.trim(),
        fileName: file?.name ?? existingFileMeta?.name,
        itemTitle: selectedItem?.title,
      };
      generated = isEditing && editingDetail
        ? await reencryptCapsuleWithOwnerKey({
            accountVaultKey: vaultKey,
            ownerKeyWrap: editingDetail.ownerKeyWrap,
            payload,
            metadata,
          })
        : await buildEncryptedCapsule({
            accountVaultKey: vaultKey,
            payload,
            metadata,
          });
      const scheduleBase = new Date();
      const resolvedActivationDate =
        resolveScheduleDate(activatePreset, activateCustom, scheduleBase) ??
        scheduleBase;
      const activateAt = toScheduleIso(
        activatePreset,
        activateCustom,
        scheduleBase,
      );
      const resolvedDeactivatePreset =
        forceTimeDeactivation && deactivatePreset === "never" ? "15m" : deactivatePreset;
      const deactivateAt = toScheduleIso(
        resolvedDeactivatePreset,
        deactivateCustom,
        resolvedActivationDate,
      );
      const deleteAt = toScheduleIso(
        deletePreset,
        deleteCustom,
        resolvedActivationDate,
      );
      if (forceTimeDeactivation && !deactivateAt) {
        throw new Error(t("web.capsules.popup.time.description"));
      }
      if (
        deactivateAt &&
        new Date(deactivateAt).getTime() < resolvedActivationDate.getTime()
      ) {
        throw new Error(t("web.capsules.popup.deactivateBeforeActivateError"));
      }
      if (
        deleteAt &&
        new Date(deleteAt).getTime() < resolvedActivationDate.getTime()
      ) {
        throw new Error(t("web.capsules.popup.deleteBeforeActivateError"));
      }
      const keepExistingPassword = Boolean(
        isEditing && effectivePasswordEnabled && hadPassword && password.length === 0,
      );
      const keepExistingRecipients = Boolean(
        isEditing && effectiveAccessEnabled && hadRecipients && recipients.length === 0,
      );
      const keepExistingFile = Boolean(isEditing && type === "file" && !file && existingFileMeta);
      const body: CapsuleCreateRequestDto & CapsuleUpdateRequestDto = {
        type,
        encryptedPayload: generated.encryptedPayload,
        encryptedMetadata: generated.encryptedMetadata,
        ownerKeyWrap: generated.ownerKeyWrap,
        keyTransportMode: "fragment",
        ...(effectiveViewsEnabled ? { maxViews: effectiveMaxViews, viewLimitAction } : {}),
        ...(effectiveTimeEnabled
          ? {
              ...(activateAt ? { activateAt } : {}),
              ...(deactivateAt ? { deactivateAt } : {}),
              ...(deleteAt ? { deleteAt } : {}),
            }
          : {}),
        ...(effectiveAccessEnabled && recipients.length > 0
          ? { allowedRecipientEmails: recipients }
          : {}),
        ...(effectivePasswordEnabled && password.length >= 4
          ? { password, passwordAttemptLimit: effectiveAttemptLimit }
          : keepExistingPassword
            ? { passwordAttemptLimit: effectiveAttemptLimit }
            : {}),
        approvalRequired: effectiveApprovalRequired,
        ...(isEditing
          ? { keepExistingPassword, keepExistingRecipients, keepExistingFile }
          : {}),
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
      if (type === "item" && itemPayload) {
        if (!accessToken) {
          throw new Error(t("web.capsules.popup.attachmentsAuthError"));
        }
        const itemVaultKey = await resolveVaultEncryptionKey(itemPayload.vaultId);
        const attachmentFilePayloads = await buildItemCapsuleAttachmentPayloads({
          accessToken,
          vaultKey: itemVaultKey,
          item: itemPayload,
          capsuleKey: generated.capsuleKey,
        });
        if (Object.keys(attachmentFilePayloads).length > 0) {
          body.attachmentFilePayloads = attachmentFilePayloads;
        }
      }
      if (isEditing && editingCapsuleId) {
        await core.updateCapsule(editingCapsuleId, body);
        toast.success(t("web.capsules.list.toast.saved"));
      } else {
        const created = await core.createCapsule(workspaceId, body);
        const url = `${window.location.origin}/capsule/${created.capsuleId}#key=${generated.fragment}`;
        await navigator.clipboard.writeText(url);
        toast.success(t("web.capsules.list.toast.createdWithLink"));
        onCreated?.();
      }
      if (saveDefaults) {
        const settings: CapsuleAccessDefaultsDto = {
          viewsEnabled: effectiveViewsEnabled,
          maxViews: effectiveMaxViews,
          viewLimitAction,
          timeEnabled: effectiveTimeEnabled,
          activatePreset,
          deactivatePreset:
            forceTimeDeactivation && deactivatePreset === "never" ? "15m" : deactivatePreset,
          deletePreset,
          accessEnabled: effectiveAccessEnabled,
          passwordEnabled: effectivePasswordEnabled,
          attemptLimit: effectiveAttemptLimit,
          approvalRequired: effectiveApprovalRequired,
        };
        try {
          for (const capsuleType of ["text", "file", "item"] as const) {
            await core.updateWorkspaceCapsuleDefaults(workspaceId, {
              type: capsuleType,
              settings,
            });
          }
          setSavedDefaults(settings);
        } catch {
          /* Capsule is already saved; defaults persist can retry next time. */
        }
      }
      notifyCapsulesListRefresh();
      close();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : isEditing
            ? t("web.capsules.popup.saveError")
            : t("web.capsules.popup.createError"),
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
        header={isEditing ? t("web.capsules.popup.editTitle") : t("web.capsules.popup.newTitle")}
        width={720}
        onClose={close}
        onCloseRequest={requestClose}
        panelClassName="min-h-[min(720px,calc(100dvh-32px))]"
        contentClassName="flex flex-col gap-4 overflow-visible"
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            {isEditing && editingDetail ? (
              <CapsuleActionsMenu
                t={t}
                variant="button"
                align="start"
                canActivate={editingDetail.state !== "active"}
                canDeactivate={editingDetail.state === "active"}
                onCopy={() => void copyEditingLink()}
                onActivate={() => void changeEditingState("active")}
                onDeactivate={() => void changeEditingState("inactive")}
                onDelete={() => setDeleteConfirmOpen(true)}
              />
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleClose}>
                {t("web.newItemPopup.cancel")}
              </Button>
              <Button disabled={!canSave || saving} onClick={() => void save()}>
                {saving ? t("web.newItemPopup.saving") : t("web.newItemPopup.save")}
              </Button>
            </div>
          </div>
        }
      >
        {isEditing && !editHydrated ? (
          <p className={error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {error ?? t("web.capsules.popup.loading")}
          </p>
        ) : (
          <>
        <div className="relative flex w-fit rounded-lg bg-secondary p-1">
          {capsuleTypeOptions.map(([value, Icon, label]) => {
            const active = type === value;
            return (
              <Button
                key={value}
                size="sm"
                variant={active ? "outline" : "ghost"}
                className={cn(
                  "relative border",
                  active
                    ? cn(
                        "z-10",
                        "!bg-background hover:!bg-background active:!bg-background",
                        "hover:!border-input focus:!border-input focus-visible:!border-input",
                        "focus:hover:!border-input focus-visible:hover:!border-input",
                        "!shadow-[0_1px_2px_rgba(0,0,0,0.05)] hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                        "focus:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                        "focus:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)] focus-visible:hover:!shadow-[0_1px_2px_rgba(0,0,0,0.05)]",
                        "dark:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                        "dark:focus:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                        "dark:focus:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)] dark:focus-visible:hover:!shadow-[0_1px_2px_rgba(255,255,255,0.05)]",
                      )
                    : cn(
                        "z-0 border-transparent shadow-none",
                        "hover:border-transparent hover:bg-foreground/5",
                        "focus:shadow-none focus-visible:shadow-none",
                        "dark:focus:shadow-none dark:focus-visible:shadow-none",
                        "focus:bg-foreground/10 focus-visible:bg-foreground/10",
                        "active:bg-foreground/10",
                      ),
                )}
                onClick={() => setType(value)}
              >
                <Icon data-icon="inline-start" />
                {label}
              </Button>
            );
          })}
        </div>

        {type === "item" ? (
          <div className="flex flex-col gap-4">
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
                    aria-label={t("web.capsules.popup.removeSelectedItemAria")}
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
                    <span className="text-sm font-medium">{t("web.capsules.popup.availableFields")}</span>
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
                          <SelectItem value="all">{t("web.capsules.popup.scope.all")}</SelectItem>
                          <SelectItem value="all_except">{t("web.capsules.popup.scope.allExcept")}</SelectItem>
                          <SelectItem value="selected">{t("web.capsules.popup.scope.selected")}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {fieldScope !== "all" ? (
                      <MultiSelect
                        displayMode="summary"
                        selectionCountLabel={t("web.capsules.popup.selectedCount")}
                        value={selectedFieldIds}
                        onValueChange={setSelectedFieldIds}
                        placeholder={t("web.capsules.popup.scope.selected")}
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
                              {resolveKeyFormFieldLabel(
                                { id: field.id, type: field.type, label: field.label },
                                keyFormMessages,
                                { sectionId: field.sectionId },
                              )}
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
                          label={t("web.capsules.popup.itemSearchLabel")}
                          mode="edit"
                          editableValue
                          leading={<CapsuleSearchIcon />}
                          value={itemSearch}
                          onValueChange={(value) => {
                            setItemSearch(value);
                            setItemResultsOpen(Boolean(value));
                          }}
                          onValueFocus={() =>
                            setItemResultsOpen(Boolean(itemSearch))
                          }
                          valuePlaceholder={t("web.capsules.popup.itemSearchPlaceholder")}
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
                          {t("web.capsules.popup.itemsNotFound")}
                        </p>
                      )}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-4">
              <div className="relative size-10 shrink-0">
                <ItemRecordFavicon
                  categoryId={type === "file" ? "secure_files" : "secure_note"}
                  title={name.trim() || undefined}
                  size={40}
                  alt=""
                />
              </div>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("web.capsules.popup.namePlaceholder")}
                className="h-10 min-w-0 flex-1 text-xl font-semibold leading-6"
                aria-label={t("web.capsules.popup.namePlaceholder")}
              />
            </div>

            <KeyForm mode="edit" className="gap-0">
              <KeySection variant="primary" mode="edit">
                {type === "text" ? (
                  <KeyField
                    className="border-b-transparent"
                    label={t("web.capsules.public.secretText")}
                    mode="edit"
                    editableValue
                    multilineValue
                    value={text}
                    onValueChange={setText}
                    valuePlaceholder={t("web.capsules.popup.textValuePlaceholder")}
                    surfaceRounding={capsuleFieldRounding(0, 1)}
                  />
                ) : (
                  <KeyField
                    className="border-b-transparent"
                    label={t("web.capsules.public.secretFile")}
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
                        : existingFileMeta
                          ? serializeKeyFieldFileValue(existingFileMeta)
                          : ""
                    }
                    onValueChange={(value) => {
                      if (!value) {
                        setFile(null);
                        setExistingFileMeta(null);
                      }
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
                    fileUploadLabel={t("web.capsules.popup.fileUploadLabel")}
                    fileClearLabel={t("web.capsules.popup.fileClearLabel")}
                    surfaceRounding={capsuleFieldRounding(0, 1)}
                  />
                )}
              </KeySection>
            </KeyForm>
          </>
        )}

        <Button
          variant="secondary"
          className="w-full"
          onClick={() => setAdvancedOpen((value) => !value)}
        >
          {t("web.capsules.popup.advancedSettings")}
          <span
            className={cn(
              "inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none",
              advancedSettingsSummary.enabledCount === 0
                ? "bg-input text-muted-foreground"
                : advancedSettingsSummary.fieldsComplete
                  ? "bg-primary text-primary-foreground"
                  : "bg-destructive text-destructive-foreground",
            )}
          >
            {advancedSettingsSummary.enabledCount}
          </span>
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
                  {t("web.capsules.popup.enterpriseHint")}
                </p>
                {(
                  [
                    "web.capsules.popup.settings.views",
                    "web.capsules.popup.settings.time",
                    "web.capsules.popup.settings.access",
                    "web.capsules.popup.settings.password",
                    "web.capsules.popup.settings.approval",
                  ] as const
                ).map((titleKey) => (
                  <AdvancedRow
                    key={titleKey}
                    title={t(titleKey)}
                    description={t("web.capsules.popup.planUnavailable")}
                    checked={false}
                    onChange={() => undefined}
                    disabled
                  />
                ))}
              </>
            ) : (
              <>
                <AdvancedRow
                  title={t("web.capsules.popup.views.title")}
                  description={t("web.capsules.popup.views.description")}
                  checked={effectiveViewsEnabled}
                  onChange={setViewsEnabled}
                  disabled={forceMaxViews}
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-3 text-sm font-normal">
                      {t("web.capsules.popup.views.maxViews")}
                      <Input
                        type="number"
                        min={1}
                        value={effectiveMaxViews}
                        disabled={forceMaxViews}
                        onChange={(event) =>
                          setMaxViews(Math.max(1, Number(event.target.value)))
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-3 text-sm font-normal">
                      {t("web.capsules.popup.views.limitAction")}
                      <CapsuleSelect
                        value={viewLimitAction}
                        onChange={(value) =>
                          setViewLimitAction(value as "deactivate" | "delete")
                        }
                        options={[
                          ["deactivate", t("web.capsules.popup.views.action.deactivate")],
                          ["delete", t("web.capsules.popup.views.action.delete")],
                        ]}
                      />
                    </label>
                  </div>
                </AdvancedRow>
                <AdvancedRow
                  title={t("web.capsules.popup.time.title")}
                  description={t("web.capsules.popup.time.description")}
                  checked={effectiveTimeEnabled}
                  onChange={setTimeEnabled}
                  disabled={forceTimeDeactivation}
                >
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <ScheduleField
                      t={t}
                      scheduleOptions={scheduleOptions}
                      label={t("web.capsules.popup.time.activate")}
                      allowNow
                      value={activatePreset}
                      custom={activateCustom}
                      invalid={activateSchedulePast}
                      datePickerLocale={datePickerLocale}
                      onChange={setActivatePreset}
                      onCustom={setActivateCustom}
                    />
                    <ScheduleField
                      t={t}
                      scheduleOptions={deactivateScheduleOptions}
                      label={t("web.capsules.popup.time.deactivate")}
                      value={deactivatePreset}
                      custom={deactivateCustom}
                      invalid={deactivateSchedulePast}
                      minimumDate={activationMinimumDate}
                      relativeToActivation
                      datePickerLocale={datePickerLocale}
                      onChange={setDeactivatePreset}
                      onCustom={setDeactivateCustom}
                    />
                    <ScheduleField
                      t={t}
                      scheduleOptions={scheduleOptions}
                      label={t("web.capsules.popup.time.delete")}
                      value={deletePreset}
                      custom={deleteCustom}
                      invalid={deleteSchedulePast}
                      minimumDate={activationMinimumDate}
                      relativeToActivation
                      datePickerLocale={datePickerLocale}
                      onChange={setDeletePreset}
                      onCustom={setDeleteCustom}
                    />
                  </div>
                </AdvancedRow>
                <AdvancedRow
                  title={t("web.capsules.popup.access.title")}
                  description={t("web.capsules.popup.access.description")}
                  checked={effectiveAccessEnabled}
                  onChange={setAccessEnabled}
                  disabled={forceAccess}
                >
                  <MultiSelect
                    filterable
                    searchPlaceholder={t("web.capsules.popup.access.searchPlaceholder")}
                    searchEmptyMessage={t("web.capsules.popup.access.membersEmpty")}
                    value={recipients}
                    onValueChange={setRecipients}
                    onSearchQueryChange={setRecipientInput}
                    placeholder={t("web.capsules.popup.access.placeholder")}
                    onSearchSubmit={membersOnlyAccess ? undefined : addRecipient}
                    renderSearchEmpty={
                      membersOnlyAccess
                        ? undefined
                        : (query, submit) =>
                            isValidEmail(query) ? (
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="w-full gap-1 font-medium"
                                onClick={submit}
                              >
                                <CapsulePlusIcon className="size-4" />
                                {t("web.capsules.popup.access.addEmail", { query })}
                              </Button>
                            ) : (
                              <div className="flex h-8 w-full items-center justify-center text-sm leading-5 text-destructive">
                                {t("web.capsules.popup.access.invalidEmail")}
                              </div>
                            )
                    }
                  >
                    <MultiSelectTrigger
                      aria-invalid={recipientsInvalid || undefined}
                      className={cn(
                        "font-normal",
                        recipientsInvalid ? capsuleFieldErrorClassName : undefined,
                      )}
                    />
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
                  title={t("web.capsules.popup.password.title")}
                  description={t("web.capsules.popup.password.description")}
                  checked={effectivePasswordEnabled}
                  onChange={setPasswordEnabled}
                  disabled={forcePassword}
                >
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <label className="flex flex-col gap-3 text-sm font-normal">
                      {t("web.capsules.popup.password.setLabel")}
                      <Input
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={
                          isEditing && hadPassword
                            ? t("web.capsules.popup.password.keepPlaceholder")
                            : undefined
                        }
                        aria-invalid={passwordInvalid || undefined}
                        className={passwordInvalid ? capsuleFieldErrorClassName : undefined}
                      />
                    </label>
                    <label className="flex flex-col gap-3 text-sm font-normal">
                      {t("web.capsules.popup.password.attemptLimit")}
                      <Input
                        type="number"
                        min={1}
                        value={effectiveAttemptLimit}
                        disabled={forcePasswordAttemptLimit}
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
                  title={t("web.capsules.popup.approval.title")}
                  description={t("web.capsules.popup.approval.description")}
                  checked={effectiveApprovalRequired}
                  onChange={setApprovalRequired}
                  disabled={forceApproval}
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
            {t("web.capsules.popup.saveDefaults")}
          </label>
        ) : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </>
        )}
      </Popup>
      <ExitNewItemFormConfirmPopup
        open={exitConfirmOpen}
        t={t}
        onClose={() => setExitConfirmOpen(false)}
        onConfirm={confirmExit}
      />
      <DeleteCapsulesConfirmPopup
        open={deleteConfirmOpen}
        multiple={false}
        deleting={deleting}
        t={t}
        onClose={() => {
          if (!deleting) setDeleteConfirmOpen(false);
        }}
        onConfirm={() => void deleteEditing()}
      />
    </>
  );
}

function pickSharedCapsuleDefaults(
  entries: readonly { type: CapsuleType; settings: CapsuleAccessDefaultsDto }[],
): CapsuleAccessDefaultsDto | null {
  const byType = new Map(entries.map((entry) => [entry.type, entry.settings]));
  return byType.get("text") ?? byType.get("file") ?? byType.get("item") ?? entries[0]?.settings ?? null;
}

const capsuleFieldErrorClassName =
  "border-destructive shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] hover:border-destructive " +
  "focus:border-destructive focus:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] " +
  "focus-visible:border-destructive focus-visible:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] " +
  "data-[state=open]:border-destructive data-[state=open]:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)] " +
  "data-[state=open]:hover:border-destructive data-[state=open]:hover:shadow-[0_0_0_2px_hsl(var(--destructive)_/_0.4)]";

function summarizeCapsuleAdvancedSettings(input: {
  viewsEnabled: boolean;
  maxViews: number;
  timeEnabled: boolean;
  accessEnabled: boolean;
  recipients: readonly string[];
  passwordEnabled: boolean;
  password: string;
  passwordKept?: boolean;
  recipientsKept?: boolean;
  approvalRequired: boolean;
}): { enabledCount: number; fieldsComplete: boolean } {
  let enabledCount = 0;
  let fieldsComplete = true;

  if (input.viewsEnabled) {
    enabledCount += 1;
    if (!(input.maxViews >= 1)) {
      fieldsComplete = false;
    }
  }
  if (input.timeEnabled) {
    enabledCount += 1;
  }
  if (input.accessEnabled) {
    enabledCount += 1;
    if (input.recipients.length === 0 && !input.recipientsKept) {
      fieldsComplete = false;
    }
  }
  if (input.passwordEnabled) {
    enabledCount += 1;
    if (input.password.length < 4 && !input.passwordKept) {
      fieldsComplete = false;
    }
  }
  if (input.approvalRequired) {
    enabledCount += 1;
  }

  return { enabledCount, fieldsComplete };
}

function applyCapsuleAccessDefaults(
  defaults: CapsuleAccessDefaultsDto | null,
  setters: {
    setViewsEnabled: (value: boolean) => void;
    setMaxViews: (value: number) => void;
    setViewLimitAction: (value: "deactivate" | "delete") => void;
    setTimeEnabled: (value: boolean) => void;
    setActivatePreset: (value: SchedulePreset) => void;
    setDeactivatePreset: (value: SchedulePreset) => void;
    setDeletePreset: (value: SchedulePreset) => void;
    setAccessEnabled: (value: boolean) => void;
    setPasswordEnabled: (value: boolean) => void;
    setAttemptLimit: (value: number) => void;
    setApprovalRequired: (value: boolean) => void;
  },
): void {
  if (!defaults) {
    setters.setViewsEnabled(false);
    setters.setMaxViews(1);
    setters.setViewLimitAction("deactivate");
    setters.setTimeEnabled(false);
    setters.setActivatePreset("now");
    setters.setDeactivatePreset("never");
    setters.setDeletePreset("never");
    setters.setAccessEnabled(false);
    setters.setPasswordEnabled(false);
    setters.setAttemptLimit(3);
    setters.setApprovalRequired(false);
    return;
  }
  setters.setViewsEnabled(defaults.viewsEnabled);
  setters.setMaxViews(defaults.maxViews);
  setters.setViewLimitAction(defaults.viewLimitAction);
  setters.setTimeEnabled(defaults.timeEnabled);
  setters.setActivatePreset(defaults.activatePreset);
  setters.setDeactivatePreset(defaults.deactivatePreset);
  setters.setDeletePreset(defaults.deletePreset);
  setters.setAccessEnabled(defaults.accessEnabled);
  setters.setPasswordEnabled(defaults.passwordEnabled);
  setters.setAttemptLimit(defaults.attemptLimit);
  setters.setApprovalRequired(defaults.approvalRequired);
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
  triggerClassName,
  sectionLabelAfterNever,
  invalid = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  triggerClassName?: string;
  sectionLabelAfterNever?: string;
  invalid?: boolean;
}) {
  const hasNeverOption = options.some(([option]) => option === "never");
  const firstRelativeOption = options.find(
    ([option]) => option !== "custom" && option !== "never" && option !== "now",
  )?.[0];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        aria-invalid={invalid || undefined}
        className={cn("font-normal", triggerClassName)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map(([option, label]) => (
            <Fragment key={option}>
              {!hasNeverOption &&
              sectionLabelAfterNever &&
              option === firstRelativeOption ? (
                <SelectLabel className="px-2 pb-1 pt-2 text-xs font-normal text-muted-foreground">
                  {sectionLabelAfterNever}
                </SelectLabel>
              ) : null}
              <SelectItem value={option}>{label}</SelectItem>
              {option === "never" && sectionLabelAfterNever ? (
                <SelectLabel className="px-2 pb-1 pt-2 text-xs font-normal text-muted-foreground">
                  {sectionLabelAfterNever}
                </SelectLabel>
              ) : null}
            </Fragment>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

function ScheduleField({
  t,
  scheduleOptions,
  label,
  value,
  custom,
  datePickerLocale,
  minimumDate,
  allowNow = false,
  relativeToActivation = false,
  invalid = false,
  onChange,
  onCustom,
}: {
  t: (messageKey: string) => string;
  scheduleOptions: { value: SchedulePreset; label: string }[];
  label: string;
  value: SchedulePreset;
  custom: string;
  datePickerLocale: Locale;
  minimumDate?: Date;
  allowNow?: boolean;
  relativeToActivation?: boolean;
  invalid?: boolean;
  onChange: (value: SchedulePreset) => void;
  onCustom: (value: string) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const earliestDate = minimumDate ?? new Date();
  const selectedDate = custom ? new Date(custom) : undefined;
  const [draftDate, setDraftDate] = useState<Date>(
    () => selectedDate ?? nextAvailableDateTime(earliestDate),
  );
  const [calendarMonth, setCalendarMonth] = useState<Date>(draftDate);
  const options = scheduleOptions
    .filter((option) => allowNow || option.value !== "now")
    .map((option) => [option.value, option.label] as const);
  const selectOptions = custom
    ? ([["custom", formatCapsuleDateTime(selectedDate!)], ...options] as const)
    : options;

  function handlePickerOpenChange(open: boolean) {
    if (open) {
      const next =
        selectedDate && selectedDate.getTime() >= earliestDate.getTime()
          ? selectedDate
          : nextAvailableDateTime(earliestDate);
      setDraftDate(next);
      setCalendarMonth(next);
    }
    setPickerOpen(open);
  }

  function updateDraftTime(part: "hours" | "minutes", nextValue: number) {
    setDraftDate((current) => {
      const next = new Date(current);
      if (part === "hours") next.setHours(nextValue);
      else next.setMinutes(nextValue);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-normal">{label}</span>
      <ControlGroup className="w-full">
        <CapsuleSelect
          value={custom ? "custom" : value}
          onChange={(next) => {
            if (next === "custom") return;
            onChange(next as SchedulePreset);
            onCustom("");
          }}
          options={selectOptions}
          invalid={invalid}
          sectionLabelAfterNever={
            relativeToActivation ? t("web.capsules.popup.schedule.afterActivation") : undefined
          }
          triggerClassName={cn(
            controlGroupItemFixedClassName,
            "min-w-0 flex-1",
            invalid && capsuleFieldErrorClassName,
          )}
        />
        <Popover open={pickerOpen} onOpenChange={handlePickerOpenChange}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={invalid ? "danger" : "outline"}
              size="icon"
              className={cn(
                controlGroupItemFixedClassName,
                "h-9 w-10 shrink-0 font-normal",
              )}
              aria-label={t("web.capsules.popup.datePicker.selectAria")}
            >
              <CapsuleCalendarIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-auto p-0">
            <div className="flex h-[352px]">
              <Calendar
                mode="single"
                captionLayout="label"
                selected={draftDate}
                month={calendarMonth}
                onMonthChange={setCalendarMonth}
                locale={datePickerLocale}
                startMonth={capsuleCalendarStartMonth}
                endMonth={capsuleCalendarEndMonth}
                disabled={{ before: startOfDay(earliestDate) }}
                onSelect={(date) => {
                  if (!date) return;
                  const next = new Date(date);
                  next.setHours(
                    draftDate.getHours(),
                    draftDate.getMinutes(),
                    0,
                    0,
                  );
                  setDraftDate(
                    next.getTime() >= earliestDate.getTime()
                      ? next
                      : nextAvailableDateTime(earliestDate),
                  );
                }}
                classNames={{ nav: "hidden" }}
                components={{ MonthCaption: CalendarMonthYearCaption }}
              />
              <div className="flex min-h-0 flex-col border-l">
                <div className="border-b px-3 py-2 text-center text-sm font-medium">
                  {t("web.capsules.popup.datePicker.time")}
                </div>
                <div className="grid grid-cols-2 border-b text-center text-xs text-muted-foreground">
                  <span className="px-2 py-1.5">{t("web.capsules.popup.datePicker.hour")}</span>
                  <span className="border-l px-2 py-1.5">{t("web.capsules.popup.datePicker.minute")}</span>
                </div>
                <div className="flex min-h-0 flex-1">
                  <TimeValueScroll
                    values={scheduleHours}
                    selected={draftDate.getHours()}
                    date={draftDate}
                    minimumDate={earliestDate}
                    part="hours"
                    onSelect={(hours) => updateDraftTime("hours", hours)}
                  />
                  <TimeValueScroll
                    values={scheduleMinutes}
                    selected={draftDate.getMinutes()}
                    date={draftDate}
                    minimumDate={earliestDate}
                    part="minutes"
                    onSelect={(minutes) => updateDraftTime("minutes", minutes)}
                    className="border-l"
                  />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t p-3">
              <Button
                type="button"
                variant="ghost"
                disabled={
                  startOfDay(earliestDate).getTime() > startOfToday().getTime()
                }
                onClick={() => {
                  const next = nextAvailableDateTime(earliestDate);
                  setDraftDate(next);
                  setCalendarMonth(next);
                }}
              >
                {t("web.capsules.popup.datePicker.today")}
              </Button>
              <Button
                type="button"
                disabled={draftDate.getTime() < earliestDate.getTime()}
                onClick={() => {
                  onCustom(toLocalDateTimeValue(draftDate));
                  setPickerOpen(false);
                }}
              >
                {t("web.capsules.popup.datePicker.done")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </ControlGroup>
    </div>
  );
}

function TimeValueScroll({
  values,
  selected,
  date,
  minimumDate,
  part,
  onSelect,
  className,
}: {
  values: readonly number[];
  selected: number;
  date: Date;
  minimumDate: Date;
  part: "hours" | "minutes";
  onSelect: (value: number) => void;
  className?: string;
}) {
  const selectedRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center" });
  }, [selected]);

  return (
    <ScrollArea className={cn("h-full min-h-0 w-14", className)}>
      <div className="flex flex-col p-1">
        {values.map((value) => {
          const candidate = new Date(date);
          if (part === "hours") candidate.setHours(value);
          else candidate.setMinutes(value);
          const disabled = candidate.getTime() < minimumDate.getTime();

          return (
            <button
              key={value}
              ref={selected === value ? selectedRef : undefined}
              type="button"
              disabled={disabled}
              className={cn(
                "flex h-10 w-full shrink-0 items-center justify-center rounded-md text-sm font-normal tabular-nums",
                "hover:bg-muted disabled:pointer-events-none disabled:text-muted-foreground/40",
                selected === value && "bg-muted text-foreground",
              )}
              onClick={() => onSelect(value)}
            >
              {String(value).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function resolveScheduleDate(
  preset: SchedulePreset,
  custom: string,
  baseDate: Date,
): Date | null {
  if (custom) {
    const customDate = new Date(custom);
    return Number.isNaN(customDate.getTime()) ? null : customDate;
  }
  if (preset === "never") return null;
  if (preset === "now") return new Date(baseDate);
  const offsets: Record<Exclude<SchedulePreset, "never" | "now">, number> = {
    "15m": 15,
    "1h": 60,
    "6h": 360,
    "12h": 720,
    "24h": 1440,
  };
  return new Date(baseDate.getTime() + offsets[preset] * 60_000);
}

function toScheduleIso(
  preset: SchedulePreset,
  custom: string,
  baseDate: Date,
): string | null {
  if (!custom && (preset === "never" || preset === "now")) return null;
  return resolveScheduleDate(preset, custom, baseDate)?.toISOString() ?? null;
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
  return startOfDay(new Date());
}

function startOfDay(date: Date): Date {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function toTimeValue(value: Date): string {
  return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
}

function toLocalDateTimeValue(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}T${toTimeValue(value)}`;
}

function isPastCustomDate(custom: string, now = Date.now()): boolean {
  if (!custom) return false;
  const time = new Date(custom).getTime();
  return Number.isFinite(time) && time < now;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function applyLoadedCapsule(
  detail: CapsuleOwnerDetailDto,
  payload: unknown,
  metadata: CapsuleOwnerMetadata,
  setters: {
    setType: (value: CapsuleType) => void;
    setName: (value: string) => void;
    setText: (value: string) => void;
    setSelectedItemId: (value: string) => void;
    setFieldScope: (value: ScopeMode) => void;
    setSelectedFieldIds: (value: string[]) => void;
    setViewsEnabled: (value: boolean) => void;
    setMaxViews: (value: number) => void;
    setViewLimitAction: (value: "deactivate" | "delete") => void;
    setTimeEnabled: (value: boolean) => void;
    setActivatePreset: (value: SchedulePreset) => void;
    setDeactivatePreset: (value: SchedulePreset) => void;
    setDeletePreset: (value: SchedulePreset) => void;
    setActivateCustom: (value: string) => void;
    setDeactivateCustom: (value: string) => void;
    setDeleteCustom: (value: string) => void;
    setAccessEnabled: (value: boolean) => void;
    setPasswordEnabled: (value: boolean) => void;
    setAttemptLimit: (value: number) => void;
    setApprovalRequired: (value: boolean) => void;
    setAdvancedOpen: (value: boolean) => void;
    setExistingFileMeta: (value: KeyFieldFileValue | null) => void;
    setHadPassword: (value: boolean) => void;
    setHadRecipients: (value: boolean) => void;
    setRecipients: (value: string[]) => void;
    setEditingDetail: (value: CapsuleOwnerDetailDto) => void;
  },
): string {
  const record = asRecord(payload);
  const itemRecord = asRecord(record?.item);
  const type = detail.type;
  const name = metadata.name;
  const text = type === "text" && typeof record?.text === "string" ? record.text : "";
  const loadedItemId =
    typeof itemRecord?.itemId === "string"
      ? itemRecord.itemId
      : typeof itemRecord?.id === "string"
        ? itemRecord.id
        : "";
  const rawFields = itemRecord && Array.isArray(itemRecord.fields) ? itemRecord.fields : [];
  const fieldIds =
    type === "item"
      ? rawFields.flatMap((field) => {
          const fieldRecord = asRecord(field);
          return typeof fieldRecord?.id === "string" ? [fieldRecord.id] : [];
        })
      : [];
  const fieldScope: ScopeMode = type === "item" && fieldIds.length > 0 ? "selected" : "all";
  const fileName =
    type === "file"
      ? metadata.fileName ||
        (typeof record?.fileName === "string" && record.fileName) ||
        (typeof record?.name === "string" && record.name) ||
        "file"
      : "";
  const viewsEnabled = detail.maxViews !== null;
  const maxViews = detail.maxViews ?? 1;
  const timeEnabled = Boolean(detail.activateAt || detail.deactivateAt || detail.deleteAt);
  const activateCustom = detail.activateAt
    ? toLocalDateTimeValue(new Date(detail.activateAt))
    : "";
  const deactivateCustom = detail.deactivateAt
    ? toLocalDateTimeValue(new Date(detail.deactivateAt))
    : "";
  const deleteCustom = detail.deleteAt
    ? toLocalDateTimeValue(new Date(detail.deleteAt))
    : "";
  const recipients = (detail.allowedRecipientEmails ?? [])
    .map((email) => email.trim().toLocaleLowerCase())
    .filter(Boolean);
  setters.setType(type);
  setters.setName(name);
  setters.setEditingDetail(detail);
  setters.setText(text);
  if (type === "item" && loadedItemId) {
    setters.setSelectedItemId(loadedItemId);
    if (fieldIds.length > 0) {
      setters.setFieldScope("selected");
      setters.setSelectedFieldIds(fieldIds);
    }
  }
  if (type === "file") {
    setters.setExistingFileMeta({
      attachmentId: `capsule-existing-${detail.capsuleId}`,
      name: fileName,
      mimeType: "application/octet-stream",
      sizeBytes: 0,
    });
  }
  setters.setViewsEnabled(viewsEnabled);
  if (viewsEnabled) {
    setters.setMaxViews(maxViews);
  }
  setters.setViewLimitAction(detail.viewLimitAction);
  setters.setTimeEnabled(timeEnabled);
  setters.setActivatePreset("now");
  setters.setActivateCustom(activateCustom);
  setters.setDeactivatePreset("never");
  setters.setDeactivateCustom(deactivateCustom);
  setters.setDeletePreset("never");
  setters.setDeleteCustom(deleteCustom);
  setters.setAccessEnabled(detail.recipientRestricted);
  setters.setRecipients(recipients);
  setters.setPasswordEnabled(detail.passwordRequired);
  setters.setAttemptLimit(detail.passwordAttemptLimit ?? 3);
  setters.setApprovalRequired(detail.approvalRequired);
  setters.setHadPassword(detail.passwordRequired);
  setters.setHadRecipients(detail.recipientRestricted);
  setters.setAdvancedOpen(false);
  return capsuleEditorFingerprint({
    type,
    name,
    text,
    fileKey: type === "file" ? `keep:${fileName}` : "",
    selectedItemId: loadedItemId,
    fieldScope,
    selectedFieldIds: fieldIds,
    viewsEnabled,
    maxViews,
    viewLimitAction: detail.viewLimitAction,
    timeEnabled,
    activatePreset: "now",
    deactivatePreset: "never",
    deletePreset: "never",
    activateCustom,
    deactivateCustom,
    deleteCustom,
    accessEnabled: detail.recipientRestricted,
    recipients,
    passwordEnabled: detail.passwordRequired,
    password: "",
    attemptLimit: detail.passwordAttemptLimit ?? 3,
    approvalRequired: detail.approvalRequired,
    saveDefaults: false,
  });
}

function capsuleEditorFingerprint(input: {
  type: CapsuleType;
  name: string;
  text: string;
  fileKey: string;
  selectedItemId: string;
  fieldScope: ScopeMode;
  selectedFieldIds: readonly string[];
  viewsEnabled: boolean;
  maxViews: number;
  viewLimitAction: string;
  timeEnabled: boolean;
  activatePreset: SchedulePreset;
  deactivatePreset: SchedulePreset;
  deletePreset: SchedulePreset;
  activateCustom: string;
  deactivateCustom: string;
  deleteCustom: string;
  accessEnabled: boolean;
  recipients: readonly string[];
  passwordEnabled: boolean;
  password: string;
  attemptLimit: number;
  approvalRequired: boolean;
  saveDefaults: boolean;
}): string {
  return JSON.stringify({
    ...input,
    selectedFieldIds: [...input.selectedFieldIds].sort(),
    recipients: [...input.recipients].sort(),
  });
}

function nextAvailableDateTime(minimumDate: Date = new Date()): Date {
  const value = new Date(
    Math.max(Date.now(), minimumDate.getTime()) + 5 * 60_000,
  );
  value.setSeconds(0, 0);
  return value;
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

function CapsulePlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      {...props}
    >
      <path
        d="M3.33337 8H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CapsuleSearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="size-4 shrink-0"
      {...props}
    >
      <path
        d="M7.33333 12.6667C10.2789 12.6667 12.6667 10.2789 12.6667 7.33333C12.6667 4.38781 10.2789 2 7.33333 2C4.38781 2 2 4.38781 2 7.33333C2 10.2789 4.38781 12.6667 7.33333 12.6667Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 14L11.1 11.1"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden
      className="size-4 shrink-0"
      {...props}
    >
      <path
        d="M2.50001 3.83334C2.50001 3.47972 2.64048 3.14058 2.89053 2.89054C3.14058 2.64049 3.47972 2.50001 3.83334 2.50001L12.1667 2.49999C12.5203 2.49999 12.8594 2.64047 13.1095 2.89052C13.3595 3.14056 13.5 3.4797 13.5 3.83333V5.16666C13.5 5.52028 13.3595 5.85942 13.1095 6.10947C12.8594 6.35952 12.5203 6.49999 12.1667 6.49999L3.83334 6.50001C3.47972 6.50001 3.14058 6.35954 2.89053 6.10949C2.64048 5.85944 2.50001 5.5203 2.50001 5.16668V3.83334Z"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M2.37801 10.8333C2.37801 10.4797 2.51848 10.1406 2.76853 9.89052C3.01858 9.64048 3.35772 9.5 3.71134 9.5L12.1667 9.5C12.5203 9.5 12.8594 9.64048 13.1095 9.89052C13.3595 10.1406 13.5 10.4797 13.5 10.8333V12.1667C13.5 12.5203 13.3595 12.8594 13.1095 13.1095C12.8594 13.3595 12.5203 13.5 12.1667 13.5H3.71134C3.35772 13.5 3.01858 13.3595 2.76853 13.1095C2.51848 12.8594 2.37801 12.5203 2.37801 12.1667V10.8333Z"
        stroke="currentColor"
        strokeWidth="1"
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
