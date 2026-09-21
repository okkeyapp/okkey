import { ApiRequestError } from "@okkey/api";
import {
  generateRecoverySecret,
  initCrypto,
  rebalanceServerShareForNewPassword,
  unwrapVaultKeyWithRecoverySecret,
  wipeBytes,
  wrapVaultKeyWithRecoverySecret,
} from "@okkey/crypto";
import type { AccountRecoveryStatusResponseDto } from "@okkey/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  ControlGroup,
  controlGroupItemGrowClassName,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@okkey/ui";
import accountRecoveryModule from "@okkey-enterprise/account-recovery";
import { Copy, Download, TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { createAuthenticatedCoreClient } from "../../api/client";
import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { downloadRecoveryKeyPdf } from "../../components/settings/recoveryKeyPdf";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { base64ToBytes, bytesToBase64 } from "../../auth/base64";
import { parseBrowserEnvironment } from "../../auth/browserEnvironment";
import { registerCurrentBrowserDevice } from "../../auth/deviceTrust";
import { getOrCreateDeviceFingerprint } from "../../auth/deviceFingerprint";
import { readVaultBundle, writeVaultBundle } from "../../auth/localVaultBundle";
import { safeRedirectPath } from "../../auth/safeRedirect";
import { useLocale } from "../../locale/LocaleContext";
import {
  ACCOUNT_DEVICE_PENDING_PATH,
  ACCOUNT_LOCK_PATH,
  AUTH_EMAIL_PATH,
  DEFAULT_AUTHENTICATED_PATH,
} from "../../routes/paths";

type RestoreMethod = "key" | "devices" | "contacts";
type RestoreStep = "methods" | "newRecoveryKey";

const MIN_MASTER_PASSWORD_LENGTH = 4;

const DevicesRestorePanel = accountRecoveryModule.DevicesRestorePanel;
const ContactsRestorePanel = accountRecoveryModule.ContactsRestorePanel;

export default function AccountRestorePage() {
  const { t } = useLocale();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    accessToken,
    userId,
    vaultUnlocked,
    hasVaultBundle,
    applyUnlockedSecrets,
    currentDeviceId,
    deviceTrustStatus,
    refreshDeviceTrust,
    markDeviceBlockedForever,
  } = useAuthVault();

  const browserEnv = useMemo(
    () => parseBrowserEnvironment(typeof navigator !== "undefined" ? navigator.userAgent : ""),
    [],
  );
  const deviceFingerprint = useMemo(() => getOrCreateDeviceFingerprint(), []);

  const onRequesterDeviceBlocked = useCallback(async () => {
    await refreshDeviceTrust();
    // Recovery forever-block: force blocked UI even if poll still sees a leftover trusted row.
    markDeviceBlockedForever();
    navigate(ACCOUNT_DEVICE_PENDING_PATH, { replace: true });
  }, [markDeviceBlockedForever, navigate, refreshDeviceTrust]);

  const [status, setStatus] = useState<AccountRecoveryStatusResponseDto | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [method, setMethod] = useState<RestoreMethod | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [step, setStep] = useState<RestoreStep>("methods");
  const [newRecoverySecret, setNewRecoverySecret] = useState<string | null>(null);
  const [newKeyExported, setNewKeyExported] = useState(false);
  const pendingUnlockRef = useRef<{
    vaultKey: Uint8Array;
    passwordShareC: Uint8Array;
  } | null>(null);

  const lockHref = useMemo(() => {
    const redirect = searchParams.get("redirect");
    if (redirect) {
      return `${ACCOUNT_LOCK_PATH}?redirect=${encodeURIComponent(redirect)}`;
    }
    return ACCOUNT_LOCK_PATH;
  }, [searchParams]);

  const redirectAfterUnlock = useMemo(
    () => safeRedirectPath(searchParams.get("redirect"), DEFAULT_AUTHENTICATED_PATH),
    [searchParams],
  );

  useEffect(() => {
    if (!accessToken) {
      setLoadingStatus(false);
      return;
    }
    let cancelled = false;
    const core = createAuthenticatedCoreClient(accessToken);
    void (async () => {
      try {
        const next = await core.getAccountRecoveryStatus();
        if (cancelled) {
          return;
        }
        setStatus(next);
        setStatusError(null);
        const available: RestoreMethod[] = [];
        if (next.settings.keyEnabled && next.key.enrolled) {
          available.push("key");
        }
        if (next.settings.devicesEnabled && next.entitlements.trustedDevices) {
          available.push("devices");
        }
        if (next.settings.contactsEnabled && next.entitlements.trustedContacts) {
          available.push("contacts");
        }
        if (available.length === 1) {
          setMethod(available[0]!);
        }
      } catch (err) {
        if (!cancelled) {
          setStatusError(
            err instanceof ApiRequestError
              ? t("account.restore.error.loadStatus")
              : t("account.restore.error.loadStatus"),
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingStatus(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, t]);

  useEffect(() => {
    return () => {
      const pending = pendingUnlockRef.current;
      if (pending) {
        wipeBytes(pending.vaultKey);
        wipeBytes(pending.passwordShareC);
        pendingUnlockRef.current = null;
      }
    };
  }, []);

  if (vaultUnlocked && step !== "newRecoveryKey") {
    return <Navigate to={redirectAfterUnlock} replace />;
  }

  if (!accessToken || !userId) {
    return <Navigate to={AUTH_EMAIL_PATH} replace />;
  }

  // Forever / timed block: same Phase 1 screen — never unlock MP or recovery entry.
  if (deviceTrustStatus === "blocked") {
    return <Navigate to={ACCOUNT_DEVICE_PENDING_PATH} replace />;
  }

  const keyAvailable = Boolean(status?.settings.keyEnabled && status.key.enrolled);
  const devicesAvailable = Boolean(
    status?.settings.devicesEnabled && status.entitlements.trustedDevices,
  );
  const contactsAvailable = Boolean(
    status?.settings.contactsEnabled && status.entitlements.trustedContacts,
  );
  const anyMethod =
    keyAvailable || devicesAvailable || contactsAvailable;

  const passwordValid =
    newPassword.length >= MIN_MASTER_PASSWORD_LENGTH && newPassword === repeatPassword;

  async function completeRestoreFromVaultKey(vaultKey: Uint8Array) {
    if (!accessToken || !userId || !passwordValid) {
      throw new Error("invalid restore state");
    }

    const existingBundle = readVaultBundle(userId);
    const freshBrowser = !existingBundle;

    const newPwd = new TextEncoder().encode(newPassword);
    let rebalanced: Awaited<ReturnType<typeof rebalanceServerShareForNewPassword>> | null = null;
    let deviceB: Uint8Array | null = null;
    let newSecretBytes: Uint8Array | null = null;
    let passwordChanged = false;
    let ownedVaultKey: Uint8Array | null = vaultKey;
    let mintedFreshShare = false;

    try {
      await initCrypto();
      const core = createAuthenticatedCoreClient(accessToken);

      if (existingBundle) {
        deviceB = base64ToBytes(existingBundle.device_share_b64);
      } else {
        // Fresh browser: mint a new device share B' and claim sole trusted device after MP change.
        deviceB = crypto.getRandomValues(new Uint8Array(32));
        mintedFreshShare = true;
      }

      rebalanced = await rebalanceServerShareForNewPassword({
        newMasterPasswordUtf8: newPwd,
        vaultKey: ownedVaultKey,
        deviceShare: deviceB,
        passwordKdfParamsVersion: existingBundle?.password_kdf_params_version ?? 2,
      });

      await core.changeMasterPassword({
        server_key_share: bytesToBase64(rebalanced.serverKeyShare),
        password_kdf_salt: bytesToBase64(rebalanced.passwordKdfSalt),
        password_kdf_params_version: rebalanced.passwordKdfParamsVersion,
      });
      passwordChanged = true;

      let encryptedPrivateKey = existingBundle?.encrypted_private_key ?? null;
      if (!encryptedPrivateKey) {
        const identity = await core.getAccountRecoveryIdentityEncryptedKey();
        encryptedPrivateKey = identity.encrypted_private_key;
      }

      writeVaultBundle(
        {
          server_key_share_b64: bytesToBase64(rebalanced.serverKeyShare),
          device_share_b64: bytesToBase64(deviceB),
          password_kdf_salt_b64: bytesToBase64(rebalanced.passwordKdfSalt),
          password_kdf_params_version: rebalanced.passwordKdfParamsVersion,
          encrypted_private_key: encryptedPrivateKey,
        },
        userId,
      );

      if (freshBrowser || mintedFreshShare) {
        await registerCurrentBrowserDevice(core, getOrCreateDeviceFingerprint(), {
          userId,
          claimAfterRecovery: true,
        });
      }

      const freshSecret = await generateRecoverySecret();
      newSecretBytes = new TextEncoder().encode(freshSecret);
      const encryptedBlob = await wrapVaultKeyWithRecoverySecret(ownedVaultKey, newSecretBytes);
      await core.rotateAccountRecoveryKey({ encryptedBlob });

      const previousPending = pendingUnlockRef.current;
      if (previousPending) {
        wipeBytes(previousPending.vaultKey);
        wipeBytes(previousPending.passwordShareC);
      }
      pendingUnlockRef.current = {
        vaultKey: ownedVaultKey,
        passwordShareC: rebalanced.passwordShareC,
      };
      ownedVaultKey = null;
      rebalanced = null;

      setNewRecoverySecret(freshSecret);
      setNewKeyExported(false);
      setStep("newRecoveryKey");
    } catch (err) {
      if (passwordChanged) {
        setFormError(t("account.restore.error.rotateFailed"));
      } else if (freshBrowser) {
        setFormError(t("account.restore.error.bootstrapFailed"));
      }
      throw err;
    } finally {
      wipeBytes(newPwd);
      if (newSecretBytes) {
        wipeBytes(newSecretBytes);
      }
      if (deviceB) {
        wipeBytes(deviceB);
      }
      if (ownedVaultKey) {
        wipeBytes(ownedVaultKey);
      }
      if (rebalanced) {
        wipeBytes(rebalanced.serverKeyShare);
        wipeBytes(rebalanced.passwordKdfSalt);
        wipeBytes(rebalanced.passwordShareC);
      }
    }
  }

  async function handleKeyRestore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accessToken || !userId || !passwordValid || !recoveryKey.trim()) {
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const secretBytes = new TextEncoder().encode(recoveryKey.trim());
    let vaultKey: Uint8Array | null = null;

    try {
      await initCrypto();
      const core = createAuthenticatedCoreClient(accessToken);
      const wrap = await core.getAccountRecoveryKeyWrap();
      vaultKey = await unwrapVaultKeyWithRecoverySecret(secretBytes, wrap.encryptedBlob);
      await completeRestoreFromVaultKey(vaultKey);
      vaultKey = null;
    } catch (err) {
      if (err instanceof ApiRequestError && err.body.error === "RECOVERY_KEY_NOT_AVAILABLE") {
        setFormError(t("account.restore.error.keyUnavailable"));
      } else if (!formError) {
        setFormError(t("account.restore.error.invalidKey"));
      }
    } finally {
      wipeBytes(secretBytes);
      if (vaultKey) {
        wipeBytes(vaultKey);
      }
      setSubmitting(false);
    }
  }

  async function handleNewKeyCopy() {
    if (!newRecoverySecret || !accessToken) {
      return;
    }
    try {
      await navigator.clipboard.writeText(newRecoverySecret);
      setNewKeyExported(true);
      const core = createAuthenticatedCoreClient(accessToken);
      await core.ackAccountRecoveryKeyExport();
      toast.success(t("web.toast.save.success"));
    } catch {
      setFormError(t("web.settingsPopup.recovery.error.copyFailed"));
    }
  }

  async function handleNewKeyDownload() {
    if (!newRecoverySecret || !accessToken) {
      return;
    }
    const toastId = toast.loading(t("web.settingsPopup.recovery.key.creatingPdf"));
    try {
      await downloadRecoveryKeyPdf(newRecoverySecret, {
        title: t("account.restore.newKey.pdfTitle"),
        description: t("account.restore.newKey.pdfDescription"),
      });
      setNewKeyExported(true);
      const core = createAuthenticatedCoreClient(accessToken);
      await core.ackAccountRecoveryKeyExport();
    } catch {
      setFormError(t("web.settingsPopup.recovery.error.generic"));
    } finally {
      toast.dismiss(toastId);
    }
  }

  function finishNewRecoveryKey() {
    const pending = pendingUnlockRef.current;
    if (pending) {
      applyUnlockedSecrets(pending.vaultKey, pending.passwordShareC);
      pendingUnlockRef.current = null;
    }
    setNewRecoverySecret(null);
    navigate(redirectAfterUnlock, { replace: true });
  }

  if (step === "newRecoveryKey" && newRecoverySecret) {
    return (
      <AppShellLayout
        title={t("account.restore.newKey.title")}
        description={t("account.restore.newKey.description")}
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      >
        <div className="flex w-full flex-col gap-6 rounded-xl border border-border bg-background p-4 shadow-sm">
          {formError ? (
            <Alert variant="error">
              <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}
          <div className="rounded-lg bg-secondary p-3">
            <p
              className="truncate font-mono text-sm leading-5 text-foreground"
              title={newRecoverySecret}
            >
              {newRecoverySecret}
            </p>
          </div>
          <ControlGroup aria-label={t("web.settingsPopup.recovery.key.actionsAria")}>
            <Button
              type="button"
              variant="outline"
              className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
              onClick={() => void handleNewKeyCopy()}
            >
              <Copy className="size-4 shrink-0" />
              {t("account.restore.newKey.copy")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={`${controlGroupItemGrowClassName} h-9 gap-2.5 bg-background`}
              onClick={() => void handleNewKeyDownload()}
            >
              <Download className="size-4 shrink-0" />
              {t("account.restore.newKey.downloadPdf")}
            </Button>
          </ControlGroup>
          <div className="flex items-start gap-1.5">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="min-w-0 flex-1 text-sm leading-5 text-muted-foreground">
              {t("account.restore.newKey.warning")}
            </p>
          </div>
          <Button type="button" className="w-full" onClick={finishNewRecoveryKey} disabled={!newKeyExported}>
            {t("account.restore.newKey.next")}
          </Button>
        </div>
      </AppShellLayout>
    );
  }

  return (
    <AppShellLayout
      title={t("account.restore.title")}
      description={t("account.restore.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <div className="flex w-full flex-col gap-6">
        <AccountUserBar />

        {statusError ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{statusError}</AlertDescription>
          </Alert>
        ) : null}

        {!loadingStatus && !statusError && !anyMethod ? (
          <Alert variant="info">
            <AlertTitle className="text-foreground">{t("account.restore.noneTitle")}</AlertTitle>
            <AlertDescription className="text-copy-secondary">
              {t("account.restore.noneBody")}
            </AlertDescription>
          </Alert>
        ) : null}

        {loadingStatus || anyMethod ? (
          <div
            className="flex w-full flex-col gap-4 rounded-xl border border-border bg-background p-4 shadow-sm"
            aria-busy={loadingStatus || undefined}
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="restore-method" className="text-sm font-medium text-foreground">
                {t("account.restore.chooseMethod")}
              </label>
              {loadingStatus ? (
                <Skeleton
                  id="restore-method"
                  className="h-10 w-full rounded-md"
                  role="status"
                  aria-label={t("account.restore.loading")}
                />
              ) : (
                <Select
                  value={method ?? undefined}
                  onValueChange={(value) => setMethod(value as RestoreMethod)}
                >
                  <SelectTrigger id="restore-method" className="h-auto min-h-10 w-full py-2">
                    <SelectValue placeholder={t("account.restore.chooseMethod")} />
                  </SelectTrigger>
                  <SelectContent>
                    {keyAvailable ? (
                      <SelectItem value="key" description={t("account.restore.method.keyHint")}>
                        {t("account.restore.method.key")}
                      </SelectItem>
                    ) : null}
                    {devicesAvailable ? (
                      <SelectItem
                        value="devices"
                        description={t("account.restore.method.devicesHint")}
                      >
                        {t("account.restore.method.devices")}
                      </SelectItem>
                    ) : null}
                    {contactsAvailable ? (
                      <SelectItem
                        value="contacts"
                        description={t("account.restore.method.contactsHint")}
                      >
                        {t("account.restore.method.contacts")}
                      </SelectItem>
                    ) : null}
                  </SelectContent>
                </Select>
              )}
            </div>

            {!loadingStatus && method === "key" ? (
              <form className="flex flex-col gap-4" onSubmit={(e) => void handleKeyRestore(e)} noValidate>
                {formError ? (
                  <Alert variant="error">
                    <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                ) : null}
                <div className="flex flex-col gap-2">
                  <label htmlFor="restore-recovery-key" className="okkey-small font-medium text-copy-primary">
                    {t("account.restore.keyLabel")}
                  </label>
                  <Input
                    id="restore-recovery-key"
                    name="recoveryKey"
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    placeholder={t("account.restore.keyPlaceholder")}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="restore-new-password" className="okkey-small font-medium text-copy-primary">
                    {t("account.restore.newPassword")}
                  </label>
                  <Input
                    id="restore-new-password"
                    name="newPassword"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label htmlFor="restore-repeat-password" className="okkey-small font-medium text-copy-primary">
                    {t("account.restore.repeatPassword")}
                  </label>
                  <Input
                    id="restore-repeat-password"
                    name="repeatPassword"
                    type="password"
                    autoComplete="new-password"
                    value={repeatPassword}
                    onChange={(e) => setRepeatPassword(e.target.value)}
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={submitting || !recoveryKey.trim() || !passwordValid}
                >
                  {t("account.restore.submitKey")}
                </Button>
              </form>
            ) : null}

            {!loadingStatus && method === "devices" ? (
              DevicesRestorePanel ? (
                <DevicesRestorePanel
                  accessToken={accessToken}
                  userId={userId}
                  t={t}
                  onVaultKeyRecovered={completeRestoreFromVaultKey}
                  formError={formError}
                  setFormError={setFormError}
                  newPassword={newPassword}
                  setNewPassword={setNewPassword}
                  repeatPassword={repeatPassword}
                  setRepeatPassword={setRepeatPassword}
                  passwordValid={passwordValid}
                  submitting={submitting}
                  setSubmitting={setSubmitting}
                  currentDeviceId={currentDeviceId}
                  deviceFingerprint={deviceFingerprint}
                  deviceName={browserEnv.deviceName}
                  platform={browserEnv.platform}
                  osName={browserEnv.osName}
                  osVersion={browserEnv.osVersion}
                  clientType={browserEnv.clientType}
                  userAgent={typeof navigator !== "undefined" ? navigator.userAgent : null}
                  onRequesterDeviceBlocked={onRequesterDeviceBlocked}
                />
              ) : (
                <Alert variant="info">
                  <AlertTitle className="text-foreground">{t("account.restore.method.devices")}</AlertTitle>
                  <AlertDescription className="text-copy-secondary">
                    {t("account.restore.devicesBody")}
                  </AlertDescription>
                </Alert>
              )
            ) : null}

            {!loadingStatus && method === "contacts" ? (
              ContactsRestorePanel ? (
                <ContactsRestorePanel
                  accessToken={accessToken}
                  userId={userId}
                  t={t}
                  onVaultKeyRecovered={completeRestoreFromVaultKey}
                  formError={formError}
                  setFormError={setFormError}
                  newPassword={newPassword}
                  setNewPassword={setNewPassword}
                  repeatPassword={repeatPassword}
                  setRepeatPassword={setRepeatPassword}
                  passwordValid={passwordValid}
                  submitting={submitting}
                  setSubmitting={setSubmitting}
                />
              ) : (
                <Alert variant="info">
                  <AlertTitle className="text-foreground">{t("account.restore.method.contacts")}</AlertTitle>
                  <AlertDescription className="text-copy-secondary">
                    {t("account.restore.contactsBody")}
                  </AlertDescription>
                </Alert>
              )
            ) : null}
          </div>
        ) : null}

        <p className="text-center">
          <Link
            to={lockHref}
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("account.restore.backToMasterPassword")}
          </Link>
        </p>
      </div>
    </AppShellLayout>
  );
}
