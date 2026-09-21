import { ApiRequestError } from "@okkey/api";
import {
  generateRecoverySecret,
  initCrypto,
  wrapVaultKeyWithRecoverySecret,
} from "@okkey/crypto";
import type { WebMessageValues } from "@okkey/i18n";
import type {
  AccountRecoveryStatusResponseDto,
  TrustedContactDto,
  TrustedContactMembershipDto,
} from "@okkey/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ControlGroup,
  controlGroupItemGrowClassName,
  Input,
  Switch,
  cn,
  keyFormAdditionalDividerBorderTClassName,
} from "@okkey/ui";
import {
  Copy,
  Download,
  Info,
  Plus,
  RefreshCcw,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { useAuthenticatedCoreClient, useAuthVault } from "../../auth/AuthVaultContext";
import { calendarDaysBetween } from "../../lib/calendarDaysBetween";
import { useLocale } from "../../locale/LocaleContext";
import { settingsPath } from "../../routes/paths";
import { IconDelete16 } from "../items/itemCategoryIcons";
import { downloadRecoveryKeyPdf } from "./recoveryKeyPdf";
import { SettingsRow } from "./SettingsRows";
import DeleteTrustedContactConfirmPopup from "./DeleteTrustedContactConfirmPopup";
import accountRecoveryModule from "@okkey-enterprise/account-recovery";

const ContactsEnrollPanel = accountRecoveryModule.ContactsEnrollPanel;

/** Same contrast steps as «Добавить ещё» on secondary panel (resting → hover → active). */
const contactsPanelActionSurfaceClassName =
  "bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)] hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)] active:bg-[color-mix(in_hsl,hsl(var(--secondary))_90%,hsl(var(--foreground))_10%)] dark:bg-[color-mix(in_hsl,hsl(var(--secondary))_97%,hsl(var(--foreground))_3%)] dark:hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)] dark:active:bg-[color-mix(in_hsl,hsl(var(--secondary))_90%,hsl(var(--foreground))_10%)]";

/**
 * Destructive trash in gray panels — same as KeyFormEditor `ActionButton`
 * with `sectionVariant="additional"` (`/dev/ui/key-form`).
 */
const contactsTrashButtonClassName =
  "size-8 min-h-8 min-w-8 text-destructive hover:text-destructive hover:!bg-card";

/** Matches KeyForm «+ Add section with field» — standalone empty-state CTA. */
const contactsAddSectionButtonClassName =
  "mb-4 h-9 w-full gap-2.5 rounded-lg bg-secondary px-4 font-medium text-foreground shadow-none";

/** Matches KeySection «+ Add field» in gray (`additional`) sections — `/dev/ui/key-form`. */
const contactsAddFooterButtonClassName = cn(
  "-mt-px h-8 w-full gap-2.5 rounded-b-xl rounded-t-none border border-x-transparent border-b-transparent bg-secondary px-3 font-medium text-foreground shadow-none",
  keyFormAdditionalDividerBorderTClassName,
  "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)]",
  "focus:border-accent focus-visible:border-accent",
);

type SettingsRecoveryContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

function RecoveryKeyExportedCheckIcon({ className }: { className?: string }) {
  const reactId = useId();
  const clipId = `recovery-key-exported-check-clip-${reactId.replace(/:/g, "")}`;
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M6.00016 8.00016L7.3335 9.3335L10.0002 6.66683M14.6668 8.00016C14.6668 11.6821 11.6821 14.6668 8.00016 14.6668C4.31826 14.6668 1.3335 11.6821 1.3335 8.00016C1.3335 4.31826 4.31826 1.3335 8.00016 1.3335C11.6821 1.3335 14.6668 4.31826 14.6668 8.00016Z"
          stroke="#16A34A"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="16" height="16" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}

function recoveryErrorMessage(err: unknown, t: SettingsRecoveryContentProps["t"]): string {
  if (err instanceof ApiRequestError) {
    switch (err.body.error) {
      case "RECOVERY_ENTITLEMENT_REQUIRED":
        return t("web.settingsPopup.recovery.error.entitlement");
      case "RECOVERY_CONTACTS_INSUFFICIENT":
        return t("web.settingsPopup.recovery.error.contactsInsufficient");
      case "RECOVERY_CONTACT_NOT_FOUND":
        return t("web.settingsPopup.recovery.error.contactNotFound");
      case "RECOVERY_CONTACT_EXISTS":
        return t("web.settingsPopup.recovery.error.contactExists");
      case "RECOVERY_KEY_NOT_ENROLLED":
        return t("web.settingsPopup.recovery.error.keyNotEnrolled");
      case "RECOVERY_EMAIL_INVALID":
        return t("web.settingsPopup.recovery.error.invalidEmail");
      case "RECOVERY_SELF_INVITE":
        return t("web.settingsPopup.recovery.error.selfInvite");
      case "RECOVERY_BAD_REQUEST":
        if (err.body.message === "cannot invite yourself") {
          return t("web.settingsPopup.recovery.error.selfInvite");
        }
        if (err.body.message === "invalid email") {
          return t("web.settingsPopup.recovery.error.invalidEmail");
        }
        return t("web.settingsPopup.recovery.error.generic");
      default:
        return t("web.settingsPopup.recovery.error.generic");
    }
  }
  return t("web.settingsPopup.recovery.error.generic");
}

function extractInviteEmail(raw: string): string {
  const trimmed = raw.trim();
  const angle = trimmed.match(/<([^<>@\s]+@[^<>@\s]+\.[^<>@\s]+)>/);
  if (angle?.[1]) {
    return angle[1].trim().toLowerCase();
  }
  return trimmed.toLowerCase();
}

function isInviteEmailValid(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatGeneratedAt(
  iso: string | null | undefined,
  locale: string,
  t: SettingsRecoveryContentProps["t"],
): string {
  if (!iso) {
    return t("web.settingsPopup.recovery.key.never");
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return t("web.settingsPopup.recovery.key.never");
  }
  const absolute = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  const days = Math.max(0, calendarDaysBetween(date));
  if (days === 0) {
    return t("web.settingsPopup.recovery.key.generatedToday", { date: absolute });
  }
  if (days === 1) {
    return t("web.settingsPopup.recovery.key.generatedYesterday", { date: absolute });
  }
  return t("web.settingsPopup.recovery.key.generatedAgo", {
    date: absolute,
    days: String(days),
  });
}

function PaidMethodsUpsell({ t }: { t: SettingsRecoveryContentProps["t"] }) {
  return (
    <Alert variant="info" className="mt-4">
      <Info className="size-4" />
      <AlertTitle>{t("web.settingsPopup.recovery.upsell.title")}</AlertTitle>
      <AlertDescription>
        {t("web.settingsPopup.recovery.upsell.combinedPrefix")}
        <Link
          to={settingsPath("plan")}
          className="font-medium text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary"
        >
          {t("web.settingsPopup.recovery.upsell.combinedPlanLink")}
        </Link>
        {t("web.settingsPopup.recovery.upsell.combinedSuffix")}
      </AlertDescription>
    </Alert>
  );
}

export default function SettingsRecoveryContent({ t }: SettingsRecoveryContentProps) {
  const { locale } = useLocale();
  const core = useAuthenticatedCoreClient();
  const { accessToken, userId, vaultUnlocked, vaultKey, profile } = useAuthVault();
  const tRef = useRef(t);
  tRef.current = t;

  const [status, setStatus] = useState<AccountRecoveryStatusResponseDto | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRows, setInviteRows] = useState<{ id: string; email: string }[]>([
    { id: "invite-0", email: "" },
  ]);
  const [inviteSaving, setInviteSaving] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<TrustedContactDto | null>(null);
  const [membershipToLeave, setMembershipToLeave] = useState<TrustedContactMembershipDto | null>(
    null,
  );
  const settingsMutatingRef = useRef(false);

  const refreshStatus = useCallback(async (): Promise<AccountRecoveryStatusResponseDto | null> => {
    if (!core) {
      return null;
    }
    try {
      const next = await core.getAccountRecoveryStatus();
      setStatus(next);
      setError(null);
      return next;
    } catch (err) {
      setError(recoveryErrorMessage(err, tRef.current));
      return null;
    }
  }, [core]);

  useEffect(() => {
    let cancelled = false;
    async function loadInitial() {
      if (!core) {
        setInitialLoading(false);
        return;
      }
      try {
        const next = await core.getAccountRecoveryStatus();
        if (!cancelled) {
          setStatus(next);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(recoveryErrorMessage(err, tRef.current));
        }
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
        }
      }
    }
    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [core]);

  const notifySaved = useCallback(() => {
    toast.success(tRef.current("web.toast.save.success"));
  }, []);

  async function enrollOrRotate(rotate: boolean): Promise<string | null> {
    if (!core || !vaultKey) {
      setError(t("web.settingsPopup.recovery.error.vaultLocked"));
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      await initCrypto();
      const secret = await generateRecoverySecret();
      const secretBytes = new TextEncoder().encode(secret);
      const encryptedBlob = await wrapVaultKeyWithRecoverySecret(vaultKey, secretBytes);
      const result = rotate
        ? await core.rotateAccountRecoveryKey({ encryptedBlob })
        : await core.enrollAccountRecoveryKey({ encryptedBlob });
      setSessionKey(secret);
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              settings: result.settings,
              key: result.key,
            }
          : {
              entitlements: { recoveryKey: true, trustedDevices: false, trustedContacts: false },
              settings: result.settings,
              key: result.key,
              contacts: [],
              confirmedContactCount: 0,
              minConfirmedContacts: 3,
              pendingInvites: [],
              servingAsContact: [],
            },
      );
      void refreshStatus();
      return secret;
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleKeySwitch(checked: boolean) {
    if (!core || initialLoading || busy) {
      return;
    }
    if (checked) {
      if (status?.settings.keyEnabled && status.key.enrolled) {
        return;
      }
      const secret = await enrollOrRotate(false);
      if (secret) {
        notifySaved();
      }
      return;
    }
    setBusy(true);
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            settings: { ...prev.settings, keyEnabled: false },
            key: { enrolled: false, createdAt: null, rotatedAt: null, exportedAt: null },
          }
        : prev,
    );
    setSessionKey(null);
    try {
      const next = await core.patchAccountRecoverySettings({ keyEnabled: false });
      setStatus(next);
      notifySaved();
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
      void refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function handleDevicesSwitch(checked: boolean) {
    if (!core || !status?.entitlements.trustedDevices || settingsMutatingRef.current) {
      return;
    }
    settingsMutatingRef.current = true;
    setStatus((prev) =>
      prev ? { ...prev, settings: { ...prev.settings, devicesEnabled: checked } } : prev,
    );
    try {
      const next = await core.patchAccountRecoverySettings({ devicesEnabled: checked });
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              settings: next.settings,
              entitlements: next.entitlements,
            }
          : next,
      );
      notifySaved();
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
      void refreshStatus();
    } finally {
      settingsMutatingRef.current = false;
    }
  }

  async function handleContactsSwitch(checked: boolean) {
    if (!core || !status?.entitlements.trustedContacts || settingsMutatingRef.current) {
      return;
    }
    settingsMutatingRef.current = true;
    setStatus((prev) =>
      prev ? { ...prev, settings: { ...prev.settings, contactsEnabled: checked } } : prev,
    );
    try {
      const next = await core.patchAccountRecoverySettings({ contactsEnabled: checked });
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              settings: next.settings,
              entitlements: next.entitlements,
              confirmedContactCount: next.confirmedContactCount,
              minConfirmedContacts: next.minConfirmedContacts,
            }
          : next,
      );
      notifySaved();
      if (checked) {
        window.dispatchEvent(new CustomEvent("okkey:trusted-contacts-changed"));
      }
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
      void refreshStatus();
    } finally {
      settingsMutatingRef.current = false;
    }
  }

  async function handleCopy() {
    if (!sessionKey || !core) {
      return;
    }
    try {
      await navigator.clipboard.writeText(sessionKey);
      const next = await core.ackAccountRecoveryKeyExport();
      setStatus(next);
      notifySaved();
    } catch {
      setError(t("web.settingsPopup.recovery.error.copyFailed"));
    }
  }

  async function handleDownloadPdf() {
    if (!sessionKey || !core) {
      return;
    }
    const toastId = toast.loading(t("web.settingsPopup.recovery.key.creatingPdf"));
    try {
      await downloadRecoveryKeyPdf(sessionKey, {
        title: t("web.settingsPopup.recovery.key.pdfTitle"),
        description: t("web.settingsPopup.recovery.key.pdfDescription"),
      });
      const next = await core.ackAccountRecoveryKeyExport();
      setStatus(next);
    } catch {
      setError(t("web.settingsPopup.recovery.error.generic"));
    } finally {
      toast.dismiss(toastId);
    }
  }

  async function handleRegenerate() {
    const secret = await enrollOrRotate(true);
    if (secret) {
      try {
        await navigator.clipboard.writeText(secret);
      } catch {
        /* best-effort */
      }
      toast.success(t("web.settingsPopup.recovery.key.regeneratedToast"));
    }
  }

  async function handleInvite() {
    if (!core || inviteSaving) {
      return;
    }
    // Same shape as InviteMembersPopup: collect rows, then one API call with invitations[].
    const invitations = inviteRows
      .map((row) => ({ email: extractInviteEmail(row.email) }))
      .filter((row) => isInviteEmailValid(row.email));
    if (invitations.length === 0) {
      setError(t("web.settingsPopup.recovery.error.invalidEmail"));
      return;
    }
    const ownerEmail = profile?.email ? extractInviteEmail(profile.email) : null;
    if (ownerEmail && invitations.some((row) => row.email === ownerEmail)) {
      setError(t("web.settingsPopup.recovery.error.selfInvite"));
      return;
    }
    setInviteSaving(true);
    setError(null);
    try {
      const result = await core.inviteTrustedContact({ invitations, locale });
      const added = result.contacts?.length
        ? result.contacts
        : result.contact
          ? [result.contact]
          : [];
      if (added.length > 0) {
        setStatus((prev) =>
          prev ? { ...prev, contacts: [...prev.contacts, ...added] } : prev,
        );
        void refreshStatus();
        window.dispatchEvent(new CustomEvent("okkey:trusted-contacts-changed"));
        toast.success(t("web.settingsPopup.recovery.contacts.invitesSent"));
        setInviteOpen(false);
        setInviteRows([{ id: `invite-${Date.now()}`, email: "" }]);
      }
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
    } finally {
      setInviteSaving(false);
    }
  }

  function openInviteForm() {
    setInviteRows([{ id: `invite-${Date.now()}`, email: "" }]);
    setInviteOpen(true);
  }

  function closeInviteForm() {
    setInviteOpen(false);
    setInviteRows([{ id: `invite-${Date.now()}`, email: "" }]);
  }

  async function handleDeleteContact(contact: TrustedContactDto) {
    if (!core) {
      return;
    }
    setBusy(true);
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            contacts: prev.contacts.filter((item) => item.id !== contact.id),
            confirmedContactCount:
              contact.status === "confirmed"
                ? Math.max(0, prev.confirmedContactCount - 1)
                : prev.confirmedContactCount,
          }
        : prev,
    );
    try {
      const next = await core.deleteTrustedContact(contact.id);
      setStatus(next);
      setContactToDelete(null);
      window.dispatchEvent(new CustomEvent("okkey:trusted-contacts-changed"));
      notifySaved();
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
      void refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function handleLeaveMembership(membership: TrustedContactMembershipDto) {
    if (!core) {
      return;
    }
    setBusy(true);
    setStatus((prev) =>
      prev
        ? {
            ...prev,
            servingAsContact: prev.servingAsContact.filter((item) => item.id !== membership.id),
          }
        : prev,
    );
    try {
      const next = await core.leaveTrustedContactMembership(membership.id);
      setStatus(next);
      setMembershipToLeave(null);
      notifySaved();
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
      void refreshStatus();
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptInvite(inviteId: string) {
    if (!core) {
      return;
    }
    setBusy(true);
    try {
      const next = await core.acceptTrustedContactInvite(inviteId);
      setStatus(next);
      window.dispatchEvent(new CustomEvent("okkey:trusted-contacts-changed"));
      toast.success(t("web.settingsPopup.recovery.invites.toast.accepted"));
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectInvite(inviteId: string) {
    if (!core) {
      return;
    }
    setBusy(true);
    try {
      const next = await core.rejectTrustedContactInvite(inviteId);
      setStatus(next);
      toast.success(t("web.settingsPopup.recovery.invites.toast.rejected"));
    } catch (err) {
      setError(recoveryErrorMessage(err, t));
    } finally {
      setBusy(false);
    }
  }

  const keyEnabled = Boolean(status?.settings.keyEnabled && status.key.enrolled);
  const devicesEnabled = Boolean(status?.settings.devicesEnabled);
  const contactsEnabled = Boolean(status?.settings.contactsEnabled);
  const canDevices = Boolean(status?.entitlements.trustedDevices);
  const canContacts = Boolean(status?.entitlements.trustedContacts);
  const showPaidMethods = canDevices || canContacts;
  const showPaidUpsell = Boolean(status) && !canDevices && !canContacts;
  const showKeyPanel = keyEnabled;
  const showContactsPanel = canContacts;
  const generatedLabel = formatGeneratedAt(
    status?.key.rotatedAt ?? status?.key.createdAt,
    locale,
    t,
  );
  const keyExported = Boolean(status?.key.exportedAt);

  if (initialLoading) {
    return (
      <div
        className="flex min-h-[min(420px,calc(100dvh-32px))] flex-col"
        aria-label={t("web.settingsPopup.recovery.title")}
        aria-busy="true"
      >
        <p className="text-sm text-muted-foreground">{t("web.settingsPopup.recovery.loading")}</p>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-[min(420px,calc(100dvh-32px))] flex-col"
      aria-label={t("web.settingsPopup.recovery.title")}
    >
      {error ? (
        <Alert variant="error" className="mb-2">
          <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {status?.pendingInvites && status.pendingInvites.length > 0 ? (
        <div className="mb-4 flex flex-col gap-2 rounded-xl bg-secondary p-4">
          <p className="text-sm font-medium text-foreground">
            {t("web.settingsPopup.recovery.invites.title")}
          </p>
          {status.pendingInvites.map((invite) => (
            <div key={invite.id} className="flex items-center gap-2">
              <p className="min-w-0 flex-1 text-sm text-foreground">{invite.ownerEmail}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 bg-background"
                disabled={busy}
                onClick={() => void handleAcceptInvite(invite.id)}
              >
                {t("web.settingsPopup.recovery.invites.accept")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8"
                disabled={busy}
                onClick={() => void handleRejectInvite(invite.id)}
              >
                {t("web.settingsPopup.recovery.invites.reject")}
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <SettingsRow
        label={t("web.settingsPopup.recovery.key.label")}
        description={t("web.settingsPopup.recovery.key.description")}
        border={false}
        controlClassName="w-[100px]"
      >
        <Switch
          size="lg"
          checked={keyEnabled}
          disabled={!core || busy || initialLoading}
          onCheckedChange={(checked) => void handleKeySwitch(checked)}
          aria-label={t("web.settingsPopup.recovery.key.label")}
        />
      </SettingsRow>

      {showKeyPanel ? (
        <div className="mb-4 flex flex-col gap-4 rounded-xl bg-secondary p-4">
          <div className="flex flex-wrap items-center gap-3">
            {sessionKey ? (
              <ControlGroup
                className="min-w-0 flex-1"
                aria-label={t("web.settingsPopup.recovery.key.actionsAria")}
              >
                <Button
                  type="button"
                  variant="outline"
                  className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
                  onClick={() => void handleCopy()}
                >
                  <Copy className="size-4 shrink-0" />
                  {t("web.settingsPopup.recovery.key.copy")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
                  onClick={() => void handleDownloadPdf()}
                >
                  <Download className="size-4 shrink-0" />
                  {t("web.settingsPopup.recovery.key.downloadPdf")}
                </Button>
              </ControlGroup>
            ) : null}
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-2.5 bg-background px-4"
              disabled={busy || !vaultKey}
              onClick={() => void handleRegenerate()}
            >
              <RefreshCcw className="size-4 shrink-0" />
              {t("web.settingsPopup.recovery.key.regenerate")}
            </Button>
          </div>
          {!sessionKey ? (
            <p className="w-full text-sm leading-5 text-muted-foreground">
              {t("web.settingsPopup.recovery.key.sessionHint")}
            </p>
          ) : null}
          <div className="text-sm leading-5 text-muted-foreground">
            <p>
              <span className="text-muted-foreground">
                {t("web.settingsPopup.recovery.key.lastGeneratedPrefix")}
              </span>{" "}
              <span className="font-medium text-foreground">{generatedLabel}</span>
            </p>
            <p className="flex items-center gap-1.5">
              <span className="text-muted-foreground">
                {t("web.settingsPopup.recovery.key.exportedPrefix")}
              </span>{" "}
              {keyExported ? (
                <RecoveryKeyExportedCheckIcon className="size-4 shrink-0" />
              ) : (
                <span className="font-medium text-destructive">
                  {t("web.settingsPopup.recovery.key.never")}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-start gap-1.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
              {t("web.settingsPopup.recovery.key.regenerateWarning")}
            </p>
          </div>
        </div>
      ) : null}

      {showPaidMethods ? (
        <>
          {canDevices ? (
            <SettingsRow
              label={t("web.settingsPopup.recovery.devices.label")}
              description={t("web.settingsPopup.recovery.devices.description")}
              controlClassName="w-[100px]"
            >
              <Switch
                size="lg"
                checked={devicesEnabled}
                onCheckedChange={(checked) => void handleDevicesSwitch(checked)}
                aria-label={t("web.settingsPopup.recovery.devices.label")}
              />
            </SettingsRow>
          ) : null}

          {canContacts ? (
            <>
              <SettingsRow
                label={t("web.settingsPopup.recovery.contacts.label")}
                description={t("web.settingsPopup.recovery.contacts.description")}
                controlClassName="w-[100px]"
              >
                <Switch
                  size="lg"
                  checked={contactsEnabled}
                  disabled={
                    Boolean(status) &&
                    !contactsEnabled &&
                    (status?.confirmedContactCount ?? 0) < (status?.minConfirmedContacts ?? 3)
                  }
                  onCheckedChange={(checked) => void handleContactsSwitch(checked)}
                  aria-label={t("web.settingsPopup.recovery.contacts.label")}
                />
              </SettingsRow>

              {showContactsPanel ? (
                (status?.contacts ?? []).length > 0 || inviteOpen ? (
                  <div className="mb-4 flex flex-col overflow-visible rounded-xl bg-secondary">
                    {(status?.contacts ?? []).map((contact, index) => (
                      <div
                        key={contact.id}
                        className={`flex items-center gap-1.5 px-4 py-3 ${index > 0 ? "border-t border-border" : ""}`}
                      >
                        {contact.status === "confirmed" ? (
                          <RecoveryKeyExportedCheckIcon className="size-4 shrink-0" />
                        ) : (
                          <TriangleAlert className="size-4 shrink-0 text-amber-500" aria-hidden />
                        )}
                        <p className="min-w-0 flex-1 truncate text-sm font-normal leading-5 text-foreground">
                          {contact.email}
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="iconSm"
                          className={contactsTrashButtonClassName}
                          aria-label={t("web.settingsPopup.recovery.contacts.remove")}
                          disabled={busy || inviteSaving}
                          onClick={() => setContactToDelete(contact)}
                        >
                          <IconDelete16 className="size-4" />
                        </Button>
                      </div>
                    ))}
                    {inviteOpen ? (
                      <div
                        className={`flex flex-col gap-3 px-4 py-3 ${
                          (status?.contacts ?? []).length > 0 ? "border-t border-border" : ""
                        }`}
                      >
                        {inviteRows.map((row, index) => (
                          <div key={row.id} className="flex items-center gap-2">
                            <span className="w-6 shrink-0 text-sm text-muted-foreground">
                              {index + 1}.
                            </span>
                            <Input
                              type="email"
                              value={row.email}
                              disabled={inviteSaving}
                              autoComplete="email"
                              onChange={(e) => {
                                const value = e.target.value;
                                setInviteRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id ? { ...item, email: value } : item,
                                  ),
                                );
                              }}
                              onInput={(e) => {
                                // Safari/Mac autofill often skips React onChange.
                                const value = (e.target as HTMLInputElement).value;
                                setInviteRows((current) =>
                                  current.map((item) =>
                                    item.id === row.id ? { ...item, email: value } : item,
                                  ),
                                );
                              }}
                              placeholder={t("web.settingsPopup.recovery.contacts.emailPlaceholder")}
                              aria-label={t("web.settingsPopup.recovery.contacts.emailPlaceholder")}
                              className="min-w-0 flex-1 bg-background"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="iconSm"
                              className={contactsTrashButtonClassName}
                              disabled={inviteSaving || inviteRows.length <= 1}
                              aria-label={t("web.settingsPopup.recovery.contacts.removeRow")}
                              onClick={() =>
                                setInviteRows((current) =>
                                  current.filter((item) => item.id !== row.id),
                                )
                              }
                            >
                          <IconDelete16 className="size-4" />
                        </Button>
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="secondary"
                          className={cn("h-9 w-full gap-1.5", contactsPanelActionSurfaceClassName)}
                          disabled={inviteSaving}
                          onClick={() =>
                            setInviteRows((current) => [
                              ...current,
                              { id: `invite-${Date.now()}-${current.length}`, email: "" },
                            ])
                          }
                        >
                          <Plus className="size-4 shrink-0" />
                          {t("web.settingsPopup.recovery.contacts.addMore")}
                        </Button>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-9 bg-background"
                            disabled={inviteSaving}
                            onClick={closeInviteForm}
                          >
                            {t("web.settingsPopup.recovery.contacts.cancel")}
                          </Button>
                          <Button
                            type="button"
                            className="h-9"
                            disabled={
                              inviteSaving ||
                              inviteRows.every((row) => !row.email.trim().includes("@"))
                            }
                            onClick={() => void handleInvite()}
                          >
                            {t("web.settingsPopup.recovery.contacts.sendInvite", {
                              count: inviteRows.filter((row) => row.email.trim().includes("@"))
                                .length,
                            })}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        className={contactsAddFooterButtonClassName}
                        disabled={busy || inviteSaving}
                        onClick={openInviteForm}
                      >
                        <Plus className="size-4 shrink-0" />
                        {t("web.settingsPopup.recovery.contacts.add")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="secondary"
                    className={contactsAddSectionButtonClassName}
                    disabled={busy || inviteSaving}
                    onClick={openInviteForm}
                  >
                    <Plus className="size-4 shrink-0" />
                    {t("web.settingsPopup.recovery.contacts.add")}
                  </Button>
                )
              ) : null}
            </>
          ) : null}
        </>
      ) : null}

      {showPaidUpsell ? <PaidMethodsUpsell t={t} /> : null}

      {(status?.servingAsContact?.length ?? 0) > 0 ? (
        <>
          <SettingsRow
            label={t("web.settingsPopup.recovery.servingAs.label")}
            description={t("web.settingsPopup.recovery.servingAs.description")}
            controlClassName="hidden w-0 min-h-0"
          >
            <span className="sr-only" />
          </SettingsRow>
          <div className="mb-4 flex flex-col overflow-visible rounded-xl bg-secondary">
            {(status?.servingAsContact ?? []).map((membership, index) => (
              <div
                key={membership.id}
                className={`flex items-center gap-1.5 px-4 py-3 ${
                  index > 0 ? "border-t border-border" : ""
                }`}
              >
                <p className="min-w-0 flex-1 truncate text-sm font-normal leading-5 text-foreground">
                  {membership.ownerEmail}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="iconSm"
                  className={contactsTrashButtonClassName}
                  aria-label={t("web.settingsPopup.recovery.servingAs.remove")}
                  disabled={busy}
                  onClick={() => setMembershipToLeave(membership)}
                >
                  <IconDelete16 className="size-4" />
                </Button>
              </div>
            ))}
          </div>
        </>
      ) : null}

      {accessToken && userId && ContactsEnrollPanel && canContacts ? (
        <ContactsEnrollPanel
          accessToken={accessToken}
          userId={userId}
          t={t}
          vaultUnlocked={vaultUnlocked}
          vaultKey={vaultKey}
          contactsEnabled={contactsEnabled}
          minConfirmedContacts={status?.minConfirmedContacts ?? 3}
          confirmedContacts={(status?.contacts ?? [])
            .filter((c) => c.status === "confirmed" && c.contactUserId)
            .map((c) => ({
              id: c.id,
              contactUserId: c.contactUserId!,
              email: c.email,
            }))}
        />
      ) : null}

      <DeleteTrustedContactConfirmPopup
        open={contactToDelete !== null}
        contactEmail={contactToDelete?.email ?? ""}
        deleting={busy}
        t={t}
        onClose={() => {
          if (!busy) {
            setContactToDelete(null);
          }
        }}
        onConfirm={() => {
          if (contactToDelete) {
            void handleDeleteContact(contactToDelete);
          }
        }}
      />

      <DeleteTrustedContactConfirmPopup
        open={membershipToLeave !== null}
        contactEmail={membershipToLeave?.ownerEmail ?? ""}
        deleting={busy}
        titleKey="web.settingsPopup.recovery.servingAs.deleteConfirm.title"
        descriptionKey="web.settingsPopup.recovery.servingAs.deleteConfirm.description"
        deleteLabelKey="web.settingsPopup.recovery.servingAs.deleteConfirm.delete"
        t={t}
        onClose={() => {
          if (!busy) {
            setMembershipToLeave(null);
          }
        }}
        onConfirm={() => {
          if (membershipToLeave) {
            void handleLeaveMembership(membershipToLeave);
          }
        }}
      />
    </div>
  );
}
