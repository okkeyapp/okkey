import { ApiRequestError } from "@okkey/api";
import {
  initCrypto,
  rebalanceServerShareForNewPassword,
  unwrapVaultKeyWithRecoverySecret,
  wipeBytes,
} from "@okkey/crypto";
import type { AccountRecoveryStatusResponseDto } from "@okkey/types";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Input,
} from "@okkey/ui";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";

import { createAuthenticatedCoreClient } from "../../api/client";
import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { base64ToBytes, bytesToBase64 } from "../../auth/base64";
import { readVaultBundle, writeVaultBundle } from "../../auth/localVaultBundle";
import { safeRedirectPath } from "../../auth/safeRedirect";
import { useLocale } from "../../locale/LocaleContext";
import {
  ACCOUNT_LOCK_PATH,
  AUTH_EMAIL_PATH,
  DEFAULT_AUTHENTICATED_PATH,
} from "../../routes/paths";

type RestoreMethod = "key" | "devices" | "contacts";

const MIN_MASTER_PASSWORD_LENGTH = 4;

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
  } = useAuthVault();

  const [status, setStatus] = useState<AccountRecoveryStatusResponseDto | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [method, setMethod] = useState<RestoreMethod | null>(null);
  const [recoveryKey, setRecoveryKey] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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

  if (vaultUnlocked) {
    return <Navigate to={redirectAfterUnlock} replace />;
  }

  if (!accessToken || !userId) {
    return <Navigate to={AUTH_EMAIL_PATH} replace />;
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

  async function handleKeyRestore(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!accessToken || !userId || !passwordValid || !recoveryKey.trim()) {
      return;
    }
    if (!hasVaultBundle) {
      setFormError(t("account.restore.error.noBundle"));
      return;
    }
    const bundle = readVaultBundle(userId);
    if (!bundle) {
      setFormError(t("account.restore.error.noBundle"));
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const secretBytes = new TextEncoder().encode(recoveryKey.trim());
    const newPwd = new TextEncoder().encode(newPassword);
    let vaultKey: Uint8Array | null = null;
    let rebalanced: Awaited<ReturnType<typeof rebalanceServerShareForNewPassword>> | null = null;
    let deviceB: Uint8Array | null = null;

    try {
      await initCrypto();
      const core = createAuthenticatedCoreClient(accessToken);
      const wrap = await core.getAccountRecoveryKeyWrap();
      vaultKey = await unwrapVaultKeyWithRecoverySecret(secretBytes, wrap.encryptedBlob);
      deviceB = base64ToBytes(bundle.device_share_b64);
      rebalanced = await rebalanceServerShareForNewPassword({
        newMasterPasswordUtf8: newPwd,
        vaultKey,
        deviceShare: deviceB,
        passwordKdfParamsVersion: bundle.password_kdf_params_version,
      });

      await core.changeMasterPassword({
        server_key_share: bytesToBase64(rebalanced.serverKeyShare),
        password_kdf_salt: bytesToBase64(rebalanced.passwordKdfSalt),
        password_kdf_params_version: rebalanced.passwordKdfParamsVersion,
      });

      writeVaultBundle(
        {
          ...bundle,
          server_key_share_b64: bytesToBase64(rebalanced.serverKeyShare),
          password_kdf_salt_b64: bytesToBase64(rebalanced.passwordKdfSalt),
          password_kdf_params_version: rebalanced.passwordKdfParamsVersion,
        },
        userId,
      );

      applyUnlockedSecrets(vaultKey, rebalanced.passwordShareC);
      vaultKey = null;
      navigate(redirectAfterUnlock, { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.body.error === "RECOVERY_KEY_NOT_AVAILABLE") {
        setFormError(t("account.restore.error.keyUnavailable"));
      } else {
        setFormError(t("account.restore.error.invalidKey"));
      }
    } finally {
      wipeBytes(secretBytes);
      wipeBytes(newPwd);
      if (deviceB) {
        wipeBytes(deviceB);
      }
      if (vaultKey) {
        wipeBytes(vaultKey);
      }
      if (rebalanced) {
        wipeBytes(rebalanced.serverKeyShare);
        wipeBytes(rebalanced.passwordKdfSalt);
        wipeBytes(rebalanced.passwordShareC);
      }
      setSubmitting(false);
    }
  }

  return (
    <AppShellLayout
      title={t("account.restore.title")}
      description={t("account.restore.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <div className="flex w-full flex-col gap-6">
        <AccountUserBar />

        {loadingStatus ? (
          <p className="text-sm text-muted-foreground">{t("account.restore.loading")}</p>
        ) : null}

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

        {!loadingStatus && anyMethod ? (
          <div className="flex w-full flex-col gap-4 rounded-xl border border-border bg-background p-4 shadow-sm">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium text-foreground">{t("account.restore.chooseMethod")}</p>
              <div className="flex flex-col gap-2">
                {keyAvailable ? (
                  <Button
                    type="button"
                    variant={method === "key" ? "default" : "outline"}
                    className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
                    onClick={() => setMethod("key")}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{t("account.restore.method.key")}</span>
                      <span className="text-xs font-normal opacity-80">
                        {t("account.restore.method.keyHint")}
                      </span>
                    </span>
                  </Button>
                ) : null}
                {devicesAvailable ? (
                  <Button
                    type="button"
                    variant={method === "devices" ? "default" : "outline"}
                    className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
                    onClick={() => setMethod("devices")}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{t("account.restore.method.devices")}</span>
                      <span className="text-xs font-normal opacity-80">
                        {t("account.restore.method.devicesHint")}
                      </span>
                    </span>
                  </Button>
                ) : null}
                {contactsAvailable ? (
                  <Button
                    type="button"
                    variant={method === "contacts" ? "default" : "outline"}
                    className="h-auto justify-start whitespace-normal px-3 py-2 text-left"
                    onClick={() => setMethod("contacts")}
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="text-sm font-medium">{t("account.restore.method.contacts")}</span>
                      <span className="text-xs font-normal opacity-80">
                        {t("account.restore.method.contactsHint")}
                      </span>
                    </span>
                  </Button>
                ) : null}
              </div>
            </div>

            {method === "key" ? (
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

            {method === "devices" ? (
              <Alert variant="info">
                <AlertTitle className="text-foreground">{t("account.restore.method.devices")}</AlertTitle>
                <AlertDescription className="text-copy-secondary">
                  {t("account.restore.devicesBody")}
                </AlertDescription>
              </Alert>
            ) : null}

            {method === "contacts" ? (
              <Alert variant="info">
                <AlertTitle className="text-foreground">{t("account.restore.method.contacts")}</AlertTitle>
                <AlertDescription className="text-copy-secondary">
                  {t("account.restore.contactsBody")}
                </AlertDescription>
              </Alert>
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
