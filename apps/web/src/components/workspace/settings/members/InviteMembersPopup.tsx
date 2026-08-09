import type { CoreApiClient } from "@okkey/api";
import type { WorkspaceRoleSummary } from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import {
  Button,
  Input,
  Popup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";

import { runSaveWithToast } from "../../../../lib/saveWithToast";
import { localizedRoleLabel } from "../localizedWorkspaceLabels";

type InviteRow = {
  id: string;
  email: string;
  roleId: string;
};

type InviteMembersPopupProps = {
  popupId: string;
  workspaceId: string;
  core: CoreApiClient;
  roles: readonly WorkspaceRoleSummary[];
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSent: () => void | Promise<void>;
};

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M3.33337 8H12.6667M8.00004 3.33337V12.6667"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M2 4H14M6.66667 7.33333V11.3333M9.33333 7.33333V11.3333M3.33333 4L4 13.3333C4 13.687 4.14048 14.0261 4.39052 14.2761C4.64057 14.5262 4.97971 14.6667 5.33333 14.6667H10.6667C11.0203 14.6667 11.3594 14.5262 11.6095 14.2761C11.8595 14.0261 12 13.687 12 13.3333L12.6667 4M6 4V2.66667C6 2.31305 6.14048 1.97391 6.39052 1.72386C6.64057 1.47381 6.97971 1.33333 7.33333 1.33333H8.66667C9.02029 1.33333 9.35943 1.47381 9.60948 1.72386C9.85952 1.97391 10 2.31305 10 2.66667V4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M14.6667 1.33337L7.33337 8.66671M14.6667 1.33337L10 14.6667L7.33337 8.66671M14.6667 1.33337L1.33337 6.00004L7.33337 8.66671"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function newRowId(): string {
  return `row-${Math.random().toString(36).slice(2, 10)}`;
}

export default function InviteMembersPopup({
  popupId,
  workspaceId,
  core,
  roles,
  t,
  onClose,
  onSent,
}: InviteMembersPopupProps) {
  const invitableRoles = useMemo(
    () => roles.filter((role) => role.builtinId !== "owner" && role.id.length > 0),
    [roles],
  );
  const defaultRoleId = useMemo(() => {
    const userRole = invitableRoles.find((role) => role.builtinId === "user");
    return userRole?.id ?? invitableRoles[0]?.id ?? "";
  }, [invitableRoles]);

  const [rows, setRows] = useState<InviteRow[]>([{ id: newRowId(), email: "", roleId: "" }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows([{ id: newRowId(), email: "", roleId: defaultRoleId }]);
  }, [defaultRoleId, popupId]);

  const validCount = rows.filter((row) => row.email.trim().includes("@") && row.roleId).length;
  const canSubmit = validCount > 0 && !saving && invitableRoles.length > 0;

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }
    setSaving(true);
    try {
      await runSaveWithToast(
        {
          loading: t("web.workspaceSettings.members.invite.sending"),
          success: t("web.workspaceSettings.members.invite.sent"),
          error: t("web.toast.save.error"),
        },
        async () => {
          const invitations = rows
            .filter((row) => row.email.trim().includes("@") && row.roleId)
            .map((row) => ({ email: row.email.trim(), roleId: row.roleId }));
          await core.createWorkspaceInvitations(workspaceId, { invitations });
          await onSent();
          onClose();
        },
      );
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  }

  const header = (
    <div className="flex flex-col gap-1 pr-8">
      <h2 className="text-lg font-semibold text-foreground">
        {t("web.workspaceSettings.members.invite.title")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {t("web.workspaceSettings.members.invite.subtitle")}
      </p>
    </div>
  );

  const footer = (
    <div className="flex w-full items-center justify-end gap-2">
      <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
        {t("web.newItemPopup.cancel")}
      </Button>
      <Button type="button" disabled={!canSubmit} onClick={() => void handleSubmit()} className="gap-1.5">
        <SendIcon className="size-4" />
        {t("web.workspaceSettings.members.invite.submit", { count: validCount })}
      </Button>
    </div>
  );

  return (
    <Popup
      id={popupId}
      className="z-[60]"
      width={640}
      header={header}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onClose}
      closeDisabled={saving}
      footer={footer}
    >
      <div className="flex flex-col gap-3 pb-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-center gap-2">
            <span className="w-6 shrink-0 text-sm text-muted-foreground">{index + 1}.</span>
            <Input
              value={row.email}
              placeholder={t("web.workspaceSettings.members.invite.emailPlaceholder")}
              className="min-w-0 flex-1"
              disabled={saving}
              onChange={(event) => {
                const value = event.target.value;
                setRows((current) =>
                  current.map((item) => (item.id === row.id ? { ...item, email: value } : item)),
                );
              }}
            />
            <Select
              value={row.roleId || defaultRoleId}
              disabled={saving || invitableRoles.length === 0}
              onValueChange={(value) => {
                setRows((current) =>
                  current.map((item) => (item.id === row.id ? { ...item, roleId: value } : item)),
                );
              }}
            >
              <SelectTrigger className="h-9 w-[160px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {invitableRoles.map((role) => (
                  <SelectItem key={role.id} value={role.id}>
                    {localizedRoleLabel(role, t)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-destructive hover:text-destructive"
              disabled={saving || rows.length <= 1}
              aria-label={t("web.workspaceSettings.members.invite.removeRow")}
              onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))}
            >
              <TrashIcon className="size-4" />
            </Button>
          </div>
        ))}

        <Button
          type="button"
          variant="secondary"
          className="h-9 w-full gap-1"
          disabled={saving}
          onClick={() =>
            setRows((current) => [
              ...current,
              { id: newRowId(), email: "", roleId: defaultRoleId },
            ])
          }
        >
          <PlusIcon className="size-4" />
          {t("web.workspaceSettings.members.invite.addMore")}
        </Button>
      </div>
    </Popup>
  );
}
