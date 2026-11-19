import type { CoreApiClient } from "@okkey/api";
import type {
  WorkspaceInvitationDeliveryMethod,
  WorkspaceInvitationsCreateResponseDto,
  WorkspaceRoleSummary,
} from "@okkey/types";
import type { WebMessageValues } from "@okkey/i18n";
import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Popup,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@okkey/ui";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { runSaveWithToast } from "@/lib/saveWithToast";
import { settingsPath } from "@/routes/paths";
import { localizedRoleLabel } from "@/components/workspace/settings/localizedWorkspaceLabels";

type InviteRow = {
  id: string;
  email: string;
  roleId: string;
};

type CreatedLinkInvite = {
  invitationId: string;
  roleId: string;
  inviteUrl: string;
  expiresAt: string;
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
        d="M2 4H14M6.66667 7.33333V11.3333M9.33333 7.33333V11.3333M3.33333 4L4 13.3333C4 13.687 4.14048 14.0261 4.39052 14.2761C4.64057 14.5262 4.97971 14.6667 5.33333 14.6667H10.6667C11.0203 14.6667 11.3594 14.5262 11.6095 14.2761C11.8595 14.5262 12 13.687 12 13.3333L12.6667 4M6 4V2.66667C6 2.31305 6.14048 1.97391 6.39052 1.72386C6.64057 1.47381 6.97971 1.33333 7.33333 1.33333H8.66667C9.02029 1.33333 9.35943 1.47381 9.60948 1.72386C9.85952 1.97391 10 2.66667V4"
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

function LinkIcon({ className }: { className?: string }) {
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" fill="none" aria-hidden className={className}>
      <path
        d="M6.66667 8.66671C6.95297 9.04946 7.31826 9.36617 7.73773 9.59534C8.15719 9.8245 8.62105 9.96092 9.09851 9.99533C9.57598 10.0297 10.0555 9.9613 10.5041 9.79464C10.9526 9.62798 11.3597 9.36701 11.6967 9.03004L13.6967 7.03004C14.304 6.40072 14.6394 5.55615 14.6308 4.67873C14.6223 3.8013 14.2705 2.96341 13.6513 2.34427C13.0322 1.72512 12.1943 1.37335 11.3169 1.36481C10.4394 1.35626 9.59487 1.69162 8.96554 2.29871L7.81921 3.43871M9.33334 7.33337C9.04704 6.95063 8.68175 6.63391 8.26228 6.40475C7.84282 6.17559 7.37896 6.03916 6.9015 6.00476C6.42403 5.97035 5.94451 6.03879 5.49595 6.20545C5.0474 6.37211 4.6403 6.63308 4.30334 6.97004L2.30334 8.97004C1.69605 9.59937 1.36069 10.4439 1.36924 11.3214C1.37778 12.1988 1.72955 13.0367 2.3487 13.6558C2.96784 14.275 3.80573 14.6267 4.68316 14.6353C5.56058 14.6438 6.40515 14.3085 7.03447 13.7014L8.17447 12.5614"
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

  const [deliveryMethod, setDeliveryMethod] =
    useState<WorkspaceInvitationDeliveryMethod>("email");
  const [rows, setRows] = useState<InviteRow[]>([{ id: newRowId(), email: "", roleId: "" }]);
  const [saving, setSaving] = useState(false);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [mailActive, setMailActive] = useState<boolean | null>(null);
  const [createdLinks, setCreatedLinks] = useState<CreatedLinkInvite[] | null>(null);

  useEffect(() => {
    setRows([{ id: newRowId(), email: "", roleId: defaultRoleId }]);
    setDeliveryMethod("email");
    setCreatedLinks(null);
  }, [defaultRoleId, popupId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await core.getServerMailSettings(workspaceId);
        if (!cancelled) {
          setMailActive(settings.smtp_active === true);
        }
      } catch {
        // SaaS hides mail settings (404); treat outbound mail as available.
        if (!cancelled) {
          setMailActive(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [core, workspaceId, popupId]);

  const validEmailCount = rows.filter((row) => row.email.trim().includes("@") && row.roleId).length;
  const validLinkCount = rows.filter((row) => Boolean(row.roleId)).length;
  const validCount = deliveryMethod === "link" ? validLinkCount : validEmailCount;
  const canSubmit = validCount > 0 && !saving && invitableRoles.length > 0 && !createdLinks;
  const showMailInactiveBanner = deliveryMethod === "email" && mailActive === false;

  async function handleSubmit() {
    if (!canSubmit) {
      return;
    }
    setSaving(true);
    try {
      await runSaveWithToast(
        {
          loading:
            deliveryMethod === "link"
              ? t("web.workspaceSettings.members.invite.creatingLinks")
              : t("web.workspaceSettings.members.invite.sending"),
          success: (result) => {
            const response = result as WorkspaceInvitationsCreateResponseDto;
            if (deliveryMethod === "link") {
              return t("web.workspaceSettings.members.invite.linksCreated", {
                count: response.created.length,
              });
            }
            return response.deliveryStatus === "pending"
              ? t("web.workspaceSettings.members.invite.savedPendingDelivery")
              : t("web.workspaceSettings.members.invite.sent");
          },
          error: t("web.toast.save.error"),
        },
        async () => {
          const invitations =
            deliveryMethod === "link"
              ? rows
                  .filter((row) => Boolean(row.roleId))
                  .map((row) => ({
                    roleId: row.roleId,
                    deliveryMethod: "link" as const,
                  }))
              : rows
                  .filter((row) => row.email.trim().includes("@") && row.roleId)
                  .map((row) => ({
                    email: row.email.trim(),
                    roleId: row.roleId,
                    deliveryMethod: "email" as const,
                  }));
          const result = await core.createWorkspaceInvitations(workspaceId, { invitations });
          await onSent();
          if (deliveryMethod === "link") {
            const links: CreatedLinkInvite[] = result.created
              .filter(
                (item): item is typeof item & { inviteUrl: string; expiresAt: string } =>
                  item.deliveryMethod === "link" &&
                  typeof item.inviteUrl === "string" &&
                  typeof item.expiresAt === "string",
              )
              .map((item) => ({
                invitationId: item.invitationId,
                roleId: item.roleId,
                inviteUrl: item.inviteUrl,
                expiresAt: item.expiresAt,
              }));
            setCreatedLinks(links);
            if (links.length === 1 && links[0]) {
              await navigator.clipboard.writeText(links[0].inviteUrl);
            }
            return result;
          }
          onClose();
          return result;
        },
      );
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyCreatedLink(link: CreatedLinkInvite) {
    if (copyingId) {
      return;
    }
    setCopyingId(link.invitationId);
    try {
      await runSaveWithToast(
        {
          loading: t("web.workspaceSettings.members.invite.copyingLink"),
          success: t("web.workspaceSettings.members.invite.linkCopied"),
          error: t("web.toast.save.error"),
        },
        async () => {
          await navigator.clipboard.writeText(link.inviteUrl);
        },
      );
    } catch {
      /* toast */
    } finally {
      setCopyingId(null);
    }
  }

  const roleLabel = (roleId: string) => {
    const role = invitableRoles.find((item) => item.id === roleId);
    return role ? localizedRoleLabel(role, t) : t("web.workspaceSettings.members.roleUnknown");
  };

  const header = (
    <div className="flex flex-col gap-1 pr-8">
      <h2 className="text-lg font-semibold text-foreground">
        {t("web.workspaceSettings.members.invite.title")}
      </h2>
      <p className="text-sm text-muted-foreground">
        {createdLinks
          ? t("web.workspaceSettings.members.invite.linkResultsSubtitle")
          : deliveryMethod === "link"
            ? t("web.workspaceSettings.members.invite.linkSubtitle")
            : t("web.workspaceSettings.members.invite.subtitle")}
      </p>
    </div>
  );

  const footer = createdLinks ? (
    <div className="flex w-full items-center justify-end gap-2">
      <Button type="button" onClick={onClose}>
        {t("web.workspaceSettings.members.invite.done")}
      </Button>
    </div>
  ) : (
    <div className="flex w-full items-center justify-end gap-2">
      <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
        {t("web.newItemPopup.cancel")}
      </Button>
      <Button type="button" disabled={!canSubmit} onClick={() => void handleSubmit()} className="gap-1.5">
        {deliveryMethod === "link" ? (
          <LinkIcon className="size-4" />
        ) : (
          <SendIcon className="size-4" />
        )}
        {deliveryMethod === "link"
          ? t("web.workspaceSettings.members.invite.submitLinks", { count: validCount })
          : t("web.workspaceSettings.members.invite.submit", { count: validCount })}
      </Button>
    </div>
  );

  return (
    <Popup
      id={popupId}
      className="z-popup-nested"
      width={640}
      header={header}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onClose}
      closeDisabled={saving}
      footer={footer}
    >
      <div className="flex flex-col gap-3 pb-2">
        {!createdLinks ? (
          <div
            className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
            role="tablist"
            aria-label={t("web.workspaceSettings.members.invite.deliveryMethodAria")}
          >
            {(
              [
                ["email", "web.workspaceSettings.members.invite.modeEmail"],
                ["link", "web.workspaceSettings.members.invite.modeLink"],
              ] as const
            ).map(([mode, labelKey]) => (
              <button
                key={mode}
                type="button"
                role="tab"
                aria-selected={deliveryMethod === mode}
                data-testid={`invite-mode-${mode}`}
                disabled={saving}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  deliveryMethod === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => {
                  setDeliveryMethod(mode);
                  setRows([{ id: newRowId(), email: "", roleId: defaultRoleId }]);
                }}
              >
                {t(labelKey)}
              </button>
            ))}
          </div>
        ) : null}

        {showMailInactiveBanner ? (
          <Alert variant="info" data-testid="invite-mail-inactive-banner">
            <AlertDescription>
              <p>{t("web.workspaceSettings.members.invite.mailInactiveBanner")}</p>
              <p>
                <Link
                  to={settingsPath("mail")}
                  className="text-primary underline decoration-solid underline-offset-2 hover:no-underline"
                  onClick={onClose}
                >
                  {t("web.workspaceSettings.members.invite.mailInactiveBannerLink")}
                </Link>
              </p>
            </AlertDescription>
          </Alert>
        ) : null}

        {createdLinks ? (
          <div className="flex flex-col gap-2" data-testid="invite-link-results">
            {createdLinks.map((link, index) => (
              <div
                key={link.invitationId}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
              >
                <span className="w-6 shrink-0 text-sm text-muted-foreground">{index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {roleLabel(link.roleId)}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{link.inviteUrl}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={copyingId === link.invitationId}
                  data-testid={`invite-copy-created-${link.invitationId}`}
                  onClick={() => void handleCopyCreatedLink(link)}
                >
                  {t("web.workspaceSettings.members.invite.copyLink")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <>
            {rows.map((row, index) => (
              <div key={row.id} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-sm text-muted-foreground">{index + 1}.</span>
                {deliveryMethod === "email" ? (
                  <Input
                    value={row.email}
                    placeholder={t("web.workspaceSettings.members.invite.emailPlaceholder")}
                    className="min-w-0 flex-1"
                    disabled={saving}
                    onChange={(event) => {
                      const value = event.target.value;
                      setRows((current) =>
                        current.map((item) =>
                          item.id === row.id ? { ...item, email: value } : item,
                        ),
                      );
                    }}
                  />
                ) : (
                  <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                    {t("web.workspaceSettings.members.invite.linkRowLabel")}
                  </p>
                )}
                <Select
                  value={row.roleId || defaultRoleId}
                  disabled={saving || invitableRoles.length === 0}
                  onValueChange={(value) => {
                    setRows((current) =>
                      current.map((item) =>
                        item.id === row.id ? { ...item, roleId: value } : item,
                      ),
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
          </>
        )}
      </div>
    </Popup>
  );
}
