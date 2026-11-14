import { wipeBytes } from "@okkey/crypto";
import type { WebMessageValues } from "@okkey/i18n";
import type {
  AccountLoginMethodsResponseDto,
  PrimaryLoginMethod,
  WebAuthnAuthenticatorAttachment,
  WebAuthnCredentialPublicDto,
} from "@okkey/types";
import {
  Alert,
  AlertDescription,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Switch,
} from "@okkey/ui";
import {
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
} from "@simplewebauthn/browser";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  accountWebAuthnErrorMessageKey,
  getAccountWebAuthnCapability,
  getHardwareKeyLoginCapability,
  getPasskeyLoginCapability,
  mapAccountWebAuthnError,
  type AccountWebAuthnCapability,
  type AccountWebAuthnErrorCode,
} from "../../auth/accountWebAuthnCapability";
import { useAuthenticatedCoreClient, useAuthVault } from "../../auth/AuthVaultContext";
import { readVaultBundle } from "../../auth/localVaultBundle";
import { base64ToBytes } from "../../auth/base64";
import {
  establishPasskeyShareWrap,
  passkeyWrapErrorMessageKey,
} from "../../auth/passkeyDeviceApproval";
import { SettingsRow } from "./SettingsRows";
import { useSettingsPopupCacheEntry } from "./useSettingsPopupCache";

type SettingsLoginContentProps = {
  t: (messageKey: string, values?: WebMessageValues) => string;
};

function methodLabel(t: SettingsLoginContentProps["t"], method: PrimaryLoginMethod): string {
  switch (method) {
    case "passkey":
      return t("web.settingsLogin.method.passkey");
    case "hardware_key":
      return t("web.settingsLogin.method.hardware");
    default:
      return t("web.settingsLogin.method.email");
  }
}

function PasskeyCard({
  credential,
  busy,
  deleteLabel,
  allowLabel,
  readyLabel,
  revokeLabel,
  onDelete,
  onAllow,
  onRevoke,
}: {
  credential: WebAuthnCredentialPublicDto;
  busy: boolean;
  deleteLabel: string;
  allowLabel: string;
  readyLabel: string;
  revokeLabel: string;
  onDelete: () => void;
  onAllow: () => void;
  onRevoke: () => void;
}) {
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-xl bg-secondary">
      <div className="flex items-center gap-1.5 px-4 py-3">
        <CheckCircle2 className="size-4 shrink-0 text-green-600" aria-hidden />
        <p className="min-w-0 flex-1 text-sm font-normal leading-5 text-foreground">
          {credential.name}
        </p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onDelete}
          aria-label={deleteLabel}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {credential.has_share_wrap ? (
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{readyLabel}</p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-muted-foreground"
            disabled={busy}
            onClick={onRevoke}
            aria-label={revokeLabel}
          >
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="flex w-full items-center gap-2 border-t border-border px-4 py-3 text-left text-sm text-foreground disabled:opacity-50"
          disabled={busy}
          onClick={onAllow}
        >
          <Plus className="size-4 shrink-0" aria-hidden />
          <span>{allowLabel}</span>
        </button>
      )}
    </div>
  );
}

function CredentialCard({
  credential,
  onDelete,
  busy,
  showDelete,
  deleteLabel,
}: {
  credential: WebAuthnCredentialPublicDto;
  onDelete?: () => void;
  busy: boolean;
  showDelete: boolean;
  deleteLabel: string;
}) {
  return (
    <div className="flex w-full items-center gap-1.5 rounded-xl bg-secondary px-4 py-3">
      <CheckCircle2 className="size-4 shrink-0 text-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-normal leading-5 text-foreground">
        {credential.name}
      </p>
      {showDelete ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-6 shrink-0 text-destructive hover:text-destructive"
          disabled={busy}
          onClick={onDelete}
          aria-label={deleteLabel}
        >
          <Trash2 className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}

function EmailCredentialCard({ email }: { email: string }) {
  return (
    <div className="flex min-h-12 w-full items-center gap-1.5 rounded-xl bg-secondary px-4 py-3">
      <CheckCircle2 className="size-4 shrink-0 text-foreground" aria-hidden />
      <p className="min-w-0 flex-1 text-sm font-normal leading-5 text-foreground">{email}</p>
    </div>
  );
}

function capabilityBlockedCode(cap: AccountWebAuthnCapability | null): AccountWebAuthnErrorCode | null {
  if (!cap || cap.status === "ready") {
    return null;
  }
  return cap.code;
}

export default function SettingsLoginContent({ t }: SettingsLoginContentProps) {
  const core = useAuthenticatedCoreClient();
  const { userId, vaultUnlocked } = useAuthVault();
  const mapLoginError = useCallback(() => t("web.settingsLogin.error.load"), [t]);
  const ensureLogin = useCallback(async () => {
    if (!core) {
      throw new Error("no core client");
    }
    return core.getLoginMethods();
  }, [core]);
  const {
    data: methods,
    error: cacheError,
    needsSkeleton: loading,
    setData: setMethods,
  } = useSettingsPopupCacheEntry("login", ensureLogin, mapLoginError);

  const [busy, setBusy] = useState(false);
  const [busyAttachment, setBusyAttachment] = useState<WebAuthnAuthenticatorAttachment | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [errorAttachment, setErrorAttachment] = useState<WebAuthnAuthenticatorAttachment | null>(
    null,
  );
  const [passkeyCap, setPasskeyCap] = useState<AccountWebAuthnCapability | null>(null);
  const [hardwareCap, setHardwareCap] = useState<AccountWebAuthnCapability | null>(null);

  const messageForCode = useCallback(
    (code: AccountWebAuthnErrorCode) => t(accountWebAuthnErrorMessageKey(code)),
    [t],
  );

  useEffect(() => {
    if (cacheError) {
      setError(cacheError);
    }
  }, [cacheError]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getPasskeyLoginCapability(), getHardwareKeyLoginCapability()]).then(
      ([passkey, hardware]) => {
        if (!cancelled) {
          setPasskeyCap(passkey);
          setHardwareCap(hardware);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const primaryOptions = useMemo(() => {
    if (!methods) {
      return ["email"] as PrimaryLoginMethod[];
    }
    const opts: PrimaryLoginMethod[] = ["email"];
    if (methods.passkeys.length > 0) {
      opts.push("passkey");
    }
    if (methods.hardware_keys.length > 0) {
      opts.push("hardware_key");
    }
    return opts;
  }, [methods]);

  async function applyMethods(next: AccountLoginMethodsResponseDto) {
    setMethods(next);
    toast.success(t("web.toast.save.success"));
  }

  async function handlePrimaryChange(value: string) {
    if (!core || !methods) {
      return;
    }
    if (value !== "email" && value !== "passkey" && value !== "hardware_key") {
      return;
    }
    if (value === methods.primary) {
      return;
    }
    setBusy(true);
    setError(null);
    setErrorAttachment(null);
    try {
      const next = await core.setPrimaryLoginMethod({ primary: value });
      await applyMethods(next);
    } catch {
      setError(t("web.settingsLogin.error.save"));
    } finally {
      setBusy(false);
    }
  }

  async function enroll(attachment: WebAuthnAuthenticatorAttachment) {
    if (!core) {
      return;
    }
    setError(null);
    setErrorAttachment(attachment);

    const capability = await getAccountWebAuthnCapability(attachment);
    if (attachment === "platform") {
      setPasskeyCap(capability);
    } else {
      setHardwareCap(capability);
    }
    if (capability.status !== "ready") {
      setError(messageForCode(capability.code));
      return;
    }

    setBusy(true);
    setBusyAttachment(attachment);
    try {
      const { challengeId, options } = await core.webauthnRegisterOptions({ attachment });
      const attestation = await startRegistration({
        optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
      });
      const next = await core.webauthnRegisterVerify({
        challengeId,
        response: attestation as unknown as Record<string, unknown>,
      });
      setErrorAttachment(null);
      await applyMethods(next);
    } catch (err) {
      setError(messageForCode(mapAccountWebAuthnError(err)));
    } finally {
      setBusy(false);
      setBusyAttachment(null);
    }
  }

  async function allowPasskeyToApprove(credentialRowId: string) {
    if (!core) {
      return;
    }
    setBusy(true);
    setBusyAttachment("platform");
    setError(null);
    setErrorAttachment("platform");
    try {
      if (!vaultUnlocked || !userId) {
        setError(t(passkeyWrapErrorMessageKey("needs_unlock")));
        return;
      }
      const shareB64 = readVaultBundle(userId)?.device_share_b64?.trim() ?? "";
      if (!shareB64) {
        setError(t(passkeyWrapErrorMessageKey("needs_unlock")));
        return;
      }
      const deviceShare = base64ToBytes(shareB64);
      let result: Awaited<ReturnType<typeof establishPasskeyShareWrap>>;
      try {
        result = await establishPasskeyShareWrap(core, {
          credentialRowId,
          deviceShare,
        });
      } finally {
        wipeBytes(deviceShare);
      }
      if (!result.ok) {
        setError(t(passkeyWrapErrorMessageKey(result.code)));
        return;
      }
      const next = await core.getLoginMethods();
      setMethods(next);
      setError(null);
      setErrorAttachment(null);
      toast.success(t("web.settingsLogin.passkeyWrap.saved"));
    } catch {
      setError(t(passkeyWrapErrorMessageKey("failed")));
    } finally {
      setBusy(false);
      setBusyAttachment(null);
    }
  }

  async function revokePasskeyApproval(credentialRowId: string) {
    if (!core) {
      return;
    }
    setBusy(true);
    setBusyAttachment("platform");
    setError(null);
    setErrorAttachment("platform");
    try {
      await core.deletePasskeyShareWrap(credentialRowId);
      const next = await core.getLoginMethods();
      setMethods(next);
      setError(null);
      setErrorAttachment(null);
    } catch {
      setError(t(passkeyWrapErrorMessageKey("failed")));
    } finally {
      setBusy(false);
      setBusyAttachment(null);
    }
  }

  async function deleteCredential(id: string, attachment: WebAuthnAuthenticatorAttachment) {
    if (!core) {
      return;
    }
    setBusy(true);
    setBusyAttachment(attachment);
    setError(null);
    setErrorAttachment(null);
    try {
      const next = await core.deleteWebauthnCredential(id);
      await applyMethods(next);
    } catch {
      setErrorAttachment(attachment);
      setError(t("web.settingsLogin.error.delete"));
    } finally {
      setBusy(false);
      setBusyAttachment(null);
    }
  }

  async function setAttachmentEnabled(
    attachment: WebAuthnAuthenticatorAttachment,
    enabled: boolean,
    currentCount: number,
  ) {
    if (!core) {
      return;
    }
    if (enabled) {
      if (currentCount === 0) {
        await enroll(attachment);
      }
      return;
    }
    if (currentCount === 0) {
      return;
    }
    const confirmed = window.confirm(t("web.settingsLogin.confirmDisable"));
    if (!confirmed) {
      return;
    }
    setBusy(true);
    setBusyAttachment(attachment);
    setError(null);
    setErrorAttachment(null);
    try {
      const next = await core.deleteWebauthnCredentialsByAttachment(attachment);
      await applyMethods(next);
    } catch {
      setErrorAttachment(attachment);
      setError(t("web.settingsLogin.error.delete"));
    } finally {
      setBusy(false);
      setBusyAttachment(null);
    }
  }

  if (!core) {
    return (
      <div className="min-h-[min(420px,calc(100dvh-32px))] py-4">
        <Alert variant="error">
          <AlertDescription>{t("web.settingsLogin.error.auth")}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="flex min-h-[min(420px,calc(100dvh-32px))] flex-col gap-4"
        aria-busy
        aria-label={t("web.settingsPopup.login.title")}
        role="status"
      >
        <div className="flex items-center justify-between gap-3 py-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Skeleton className="h-5 w-40 max-w-full" />
            <Skeleton className="h-5 w-full max-w-md" />
          </div>
          <Skeleton className="h-9 w-[150px] shrink-0 rounded-md" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  const passkeys = methods?.passkeys ?? [];
  const hardwareKeys = methods?.hardware_keys ?? [];
  const email = methods?.email ?? "";
  const primary = methods?.primary ?? "email";

  const passkeyBlocked = capabilityBlockedCode(passkeyCap);
  const hardwareBlocked = capabilityBlockedCode(hardwareCap);
  const passkeyReady = passkeyCap?.status === "ready";
  const hardwareReady = hardwareCap?.status === "ready";
  const passkeyBusy = busy && busyAttachment === "platform";
  const hardwareBusy = busy && busyAttachment === "cross-platform";

  return (
    <div className="min-h-[min(420px,calc(100dvh-32px))]">
      {error && !errorAttachment ? (
        <Alert variant="error" className="mb-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <SettingsRow
        border={false}
        label={t("web.settingsLogin.primary.label")}
        description={t("web.settingsLogin.primary.description")}
      >
        <Select value={primary} onValueChange={(v) => void handlePrimaryChange(v)} disabled={busy}>
          <SelectTrigger className="w-full font-normal">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {primaryOptions.map((method) => (
              <SelectItem key={method} value={method} className="font-normal">
                {methodLabel(t, method)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsRow>

      <SettingsRow
        label={t("web.settingsLogin.passkey.label")}
        description={t("web.settingsLogin.passkey.description")}
        controlClassName="w-[100px]"
      >
        <Switch
          size="lg"
          checked={passkeys.length > 0}
          disabled={
            busy || (passkeys.length === 0 && passkeyCap !== null && !passkeyReady)
          }
          onCheckedChange={(checked) =>
            void setAttachmentEnabled("platform", checked, passkeys.length)
          }
        />
      </SettingsRow>
      <div className="flex flex-col gap-4 pb-4">
        {passkeyBusy ? (
          <p className="text-sm text-muted-foreground">{t("web.settingsLogin.webauthn.busy")}</p>
        ) : null}
        {error && errorAttachment === "platform" ? (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : passkeys.length === 0 && passkeyBlocked ? (
          <Alert variant="info">
            <AlertDescription>{messageForCode(passkeyBlocked)}</AlertDescription>
          </Alert>
        ) : null}
        {passkeys.length === 0 && passkeyReady ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void enroll("platform")}
          >
            <Plus className="size-4" />
            {t("web.settingsLogin.add")}
          </Button>
        ) : null}
        {passkeys.map((cred) => (
          <PasskeyCard
            key={cred.id}
            credential={cred}
            busy={busy}
            deleteLabel={t("web.settingsLogin.deleteCredential")}
            allowLabel={t("web.settingsLogin.passkeyWrap.action")}
            readyLabel={t("web.settingsLogin.passkeyWrap.ready")}
            revokeLabel={t("web.settingsLogin.passkeyWrap.revoke")}
            onDelete={() => void deleteCredential(cred.id, "platform")}
            onAllow={() => void allowPasskeyToApprove(cred.id)}
            onRevoke={() => void revokePasskeyApproval(cred.id)}
          />
        ))}
        {passkeys.length > 0 && passkeyReady ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void enroll("platform")}
          >
            <Plus className="size-4" />
            {t("web.settingsLogin.add")}
          </Button>
        ) : null}
      </div>

      <SettingsRow
        label={t("web.settingsLogin.hardware.label")}
        description={t("web.settingsLogin.hardware.description")}
        controlClassName="w-[100px]"
      >
        <Switch
          size="lg"
          checked={hardwareKeys.length > 0}
          disabled={
            busy || (hardwareKeys.length === 0 && hardwareCap !== null && !hardwareReady)
          }
          onCheckedChange={(checked) =>
            void setAttachmentEnabled("cross-platform", checked, hardwareKeys.length)
          }
        />
      </SettingsRow>
      <div className="flex flex-col gap-4 pb-4">
        {hardwareBusy ? (
          <p className="text-sm text-muted-foreground">{t("web.settingsLogin.webauthn.busy")}</p>
        ) : null}
        {error && errorAttachment === "cross-platform" ? (
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : hardwareKeys.length === 0 && hardwareBlocked ? (
          <Alert variant="info">
            <AlertDescription>{messageForCode(hardwareBlocked)}</AlertDescription>
          </Alert>
        ) : null}
        {hardwareKeys.length === 0 && hardwareReady ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void enroll("cross-platform")}
          >
            <Plus className="size-4" />
            {t("web.settingsLogin.add")}
          </Button>
        ) : null}
        {hardwareKeys.map((cred) => (
          <CredentialCard
            key={cred.id}
            credential={cred}
            busy={busy}
            showDelete
            deleteLabel={t("web.settingsLogin.deleteCredential")}
            onDelete={() => void deleteCredential(cred.id, "cross-platform")}
          />
        ))}
        {hardwareKeys.length > 0 && hardwareReady ? (
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={busy}
            onClick={() => void enroll("cross-platform")}
          >
            <Plus className="size-4" />
            {t("web.settingsLogin.add")}
          </Button>
        ) : null}
      </div>

      <SettingsRow
        label={t("web.settingsLogin.email.label")}
        description={t("web.settingsLogin.email.description")}
        controlClassName="w-[100px]"
      >
        <Switch size="lg" checked disabled aria-readonly />
      </SettingsRow>
      <div className="pb-4">
        {email ? <EmailCredentialCard email={email} /> : null}
      </div>
    </div>
  );
}
