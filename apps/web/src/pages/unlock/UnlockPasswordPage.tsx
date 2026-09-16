import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type SVGProps,
} from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { initCrypto, unwrapUnlockMaterialWithPin, wipeBytes } from "@okkey/crypto";
import { Alert, AlertDescription, AlertTitle, Button, Input, Spinner } from "@okkey/ui";

import AccountUserBar from "../../components/account/AccountUserBar";
import AppShellLayout from "../../components/app-shell/AppShellLayout";
import OkkeyLogoMark from "../../components/app-shell/OkkeyLogoMark";
import { ACCOUNT_RESTORE_PATH, AUTH_EMAIL_PATH, DEFAULT_AUTHENTICATED_PATH, accountDevicePendingWithRedirectQuery } from "../../routes/paths";
import { useAuthVault } from "../../auth/AuthVaultContext";
import { tryUnlockWithBiometrics, biometricErrorMessageKey } from "../../auth/biometricUnlock";
import { clearPinFailures, isPinLocked, recordPinFailure } from "../../auth/pinRateLimit";
import { safeRedirectPath } from "../../auth/safeRedirect";
import { readVaultDevicePrefs } from "../../auth/vaultDevicePrefs";
import { readPinUnlockWrap } from "../../auth/vaultDeviceUnlockStore";
import { useLocale } from "../../locale/LocaleContext";

function AlertErrorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

type UnlockMode = "biometric" | "pin" | "master";

const PIN_LENGTH = 6;

const pinCellClassName =
  "h-[54px] w-full min-w-0 p-0 text-center text-lg font-semibold tabular-nums";

function emptyPinDigits(): string[] {
  return Array.from({ length: PIN_LENGTH }, () => "");
}

export default function UnlockPasswordPage() {
  const { t } = useLocale();
  const [searchParams] = useSearchParams();
  const {
    accessToken,
    userId,
    tryUnlockWithMasterPassword,
    applyUnlockedSecrets,
    hasVaultBundle,
    vaultUnlockBootstrapLoading,
    vaultUnlocked,
    touchActivity,
    deviceTrustStatus,
  } = useAuthVault();

  const prefs = readVaultDevicePrefs(userId);
  const [mode, setMode] = useState<UnlockMode>(() => {
    if (prefs.biometricEnabled) {
      return "biometric";
    }
    if (prefs.pinEnabled) {
      return "pin";
    }
    return "master";
  });
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [pinDigits, setPinDigits] = useState(emptyPinDigits);
  const [masterPassword, setMasterPassword] = useState("");
  const [showUnlockError, setShowUnlockError] = useState(false);
  const [noBundleError, setNoBundleError] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const pinInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const pinAutoSubmitEnabledRef = useRef(true);
  const pinSubmitInFlightRef = useRef(false);
  const pinLabelId = "unlock-pin-label";

  const pinValue = pinDigits.join("");

  const restoreHref = useMemo(() => {
    const q = searchParams.toString();
    return q ? `${ACCOUNT_RESTORE_PATH}?${q}` : ACCOUNT_RESTORE_PATH;
  }, [searchParams]);

  useEffect(() => {
    if (mode !== "biometric" || !userId || vaultUnlocked) {
      return;
    }
    let cancelled = false;
    setBioBusy(true);
    setBioError(null);
    void (async () => {
      await initCrypto();
      const unlocked = await tryUnlockWithBiometrics(userId);
      if (cancelled) {
        return;
      }
      setBioBusy(false);
      if (unlocked.ok) {
        applyUnlockedSecrets(unlocked.vaultKey, unlocked.passwordShareC);
        touchActivity();
        return;
      }
      setBioError(t(biometricErrorMessageKey(unlocked.code)));
      if (prefs.pinEnabled) {
        pinAutoSubmitEnabledRef.current = true;
        setMode("pin");
      } else {
        setMode("master");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, userId, vaultUnlocked, applyUnlockedSecrets, touchActivity, prefs.pinEnabled, t]);

  useEffect(() => {
    if (mode !== "pin") {
      return;
    }
    const handle = window.setTimeout(() => {
      pinInputsRef.current[0]?.focus();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [mode]);

  const setDigitAt = useCallback((index: number, char: string) => {
    const d = char.replace(/\D/g, "").slice(-1);
    setPinDigits((prev) => {
      const next = [...prev];
      next[index] = d;
      return next;
    });
    if (d && index < PIN_LENGTH - 1) {
      pinInputsRef.current[index + 1]?.focus();
    }
  }, []);

  const handleCellChange = useCallback(
    (index: number, value: string) => {
      setPinError(null);
      setNoBundleError(false);
      if (value.length > 1) {
        const pasted = value.replace(/\D/g, "").slice(0, PIN_LENGTH);
        if (pasted) {
          setPinDigits(Array.from({ length: PIN_LENGTH }, (_, i) => pasted[i] ?? ""));
          pinInputsRef.current[Math.min(pasted.length, PIN_LENGTH - 1)]?.focus();
        }
        return;
      }
      setDigitAt(index, value);
    },
    [setDigitAt],
  );

  const handleKeyDown = useCallback(
    (index: number, e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" && !pinDigits[index] && index > 0) {
        pinInputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowLeft" && index > 0) {
        pinInputsRef.current[index - 1]?.focus();
      }
      if (e.key === "ArrowRight" && index < PIN_LENGTH - 1) {
        pinInputsRef.current[index + 1]?.focus();
      }
    },
    [pinDigits],
  );

  const handlePaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setPinError(null);
    setNoBundleError(false);
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (!text) {
      return;
    }
    setPinDigits(Array.from({ length: PIN_LENGTH }, (_, i) => text[i] ?? ""));
    pinInputsRef.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus();
  }, []);

  const submitPin = useCallback(async () => {
    if (pinSubmitInFlightRef.current || vaultUnlockBootstrapLoading || bioBusy) {
      return;
    }
    const code = pinDigits.join("");
    if (code.length !== PIN_LENGTH || !userId) {
      return;
    }
    pinSubmitInFlightRef.current = true;
    setPinSubmitting(true);
    setShowUnlockError(false);
    setNoBundleError(false);
    setPinError(null);
    try {
      if (!hasVaultBundle) {
        setNoBundleError(true);
        return;
      }
      await initCrypto();
      if (isPinLocked(userId)) {
        setPinError(t("unlock.pinLocked"));
        return;
      }
      const wrap = readPinUnlockWrap(userId);
      if (!wrap) {
        setMode("master");
        return;
      }
      const pinBytes = new TextEncoder().encode(code);
      try {
        const unlocked = await unwrapUnlockMaterialWithPin({ wrap, pinUtf8: pinBytes });
        clearPinFailures(userId);
        applyUnlockedSecrets(unlocked.vaultKey, unlocked.passwordShareC);
        touchActivity();
      } catch {
        const result = recordPinFailure(userId);
        setPinError(result.locked ? t("unlock.pinLocked") : t("unlock.pinIncorrect"));
        setPinDigits(emptyPinDigits());
        window.setTimeout(() => pinInputsRef.current[0]?.focus(), 0);
      } finally {
        wipeBytes(pinBytes);
      }
    } finally {
      pinSubmitInFlightRef.current = false;
      setPinSubmitting(false);
    }
  }, [
    applyUnlockedSecrets,
    bioBusy,
    hasVaultBundle,
    pinDigits,
    t,
    touchActivity,
    userId,
    vaultUnlockBootstrapLoading,
  ]);

  useEffect(() => {
    if (mode !== "pin" || !pinAutoSubmitEnabledRef.current || pinSubmitting) {
      return;
    }
    if (pinDigits.join("").length !== PIN_LENGTH) {
      return;
    }
    pinAutoSubmitEnabledRef.current = false;
    void submitPin();
  }, [mode, pinDigits, pinSubmitting, submitPin]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (mode === "pin") {
      pinAutoSubmitEnabledRef.current = false;
      await submitPin();
      return;
    }
    setShowUnlockError(false);
    setNoBundleError(false);
    setPinError(null);
    if (vaultUnlockBootstrapLoading || bioBusy) {
      return;
    }
    if (!hasVaultBundle) {
      setNoBundleError(true);
      return;
    }
    await initCrypto();
    const ok = await tryUnlockWithMasterPassword(masterPassword);
    if (!ok) {
      setShowUnlockError(true);
      return;
    }
    touchActivity();
  }

  if (vaultUnlocked) {
    const redirect = safeRedirectPath(searchParams.get("redirect"), DEFAULT_AUTHENTICATED_PATH);
    return <Navigate to={redirect} replace />;
  }

  if (!accessToken) {
    return <Navigate to={AUTH_EMAIL_PATH} replace />;
  }

  if (
    deviceTrustStatus === "pending" ||
    deviceTrustStatus === "rejected" ||
    deviceTrustStatus === "error"
  ) {
    const rawRedirect = searchParams.get("redirect");
    const encoded =
      rawRedirect && rawRedirect.startsWith("/")
        ? encodeURIComponent(rawRedirect)
        : undefined;
    return <Navigate to={accountDevicePendingWithRedirectQuery(encoded)} replace />;
  }

  if (deviceTrustStatus === "checking" || deviceTrustStatus === "idle") {
    return (
      <AppShellLayout
        title={t("unlock.title")}
        description={t("unlock.description")}
        logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
      >
        <div className="flex flex-col items-center gap-3 py-8" role="status" aria-busy="true">
          <Spinner />
        </div>
      </AppShellLayout>
    );
  }

  const fieldsDisabled =
    bioBusy ||
    vaultUnlockBootstrapLoading ||
    pinSubmitting ||
    (mode === "pin" && userId !== null && isPinLocked(userId));
  const submitDisabled =
    fieldsDisabled ||
    (mode === "pin" ? pinValue.length !== PIN_LENGTH : masterPassword.length === 0);

  return (
    <AppShellLayout
      title={t("unlock.title")}
      description={t("unlock.description")}
      logo={<OkkeyLogoMark className="h-[60px] w-[61px]" />}
    >
      <form onSubmit={handleSubmit} className="flex w-full flex-col gap-6" noValidate>
        <AccountUserBar />

        {vaultUnlockBootstrapLoading ? (
          <div className="flex flex-col items-center gap-3 py-1" role="status" aria-busy="true">
            <Spinner />
            <p className="okkey-small text-center text-copy-secondary">{t("unlock.syncingVault")}</p>
          </div>
        ) : null}

        {bioBusy ? (
          <p className="okkey-small text-center text-copy-secondary">{t("unlock.biometricPending")}</p>
        ) : null}

        {bioError && mode !== "biometric" ? (
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>{t("unlock.biometricFailed")}</AlertTitle>
            <AlertDescription>{bioError}</AlertDescription>
          </Alert>
        ) : null}

        {mode === "pin" ? (
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <span id={pinLabelId} className="min-w-0 flex-1 okkey-small font-medium text-copy-primary">
                {t("unlock.pin")}
              </span>
              <button
                type="button"
                className="okkey-small shrink-0 text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
                disabled={bioBusy}
                onClick={() => {
                  setPinDigits(emptyPinDigits());
                  setMasterPassword("");
                  setShowUnlockError(false);
                  setPinError(null);
                  setMode("master");
                }}
              >
                {t("unlock.useMasterPassword")}
              </button>
            </div>
            <div role="group" aria-labelledby={pinLabelId} className="grid w-full grid-cols-6 gap-2.5">
              {pinDigits.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => {
                    pinInputsRef.current[index] = el;
                  }}
                  type="password"
                  inputMode="numeric"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  name={`unlock-pin-${index}`}
                  maxLength={1}
                  value={digit}
                  disabled={fieldsDisabled}
                  aria-label={t("auth.otp.digitAriaLabel", { n: index + 1, total: PIN_LENGTH })}
                  className={pinCellClassName}
                  onChange={(event) => handleCellChange(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(index, event)}
                  onPaste={index === 0 ? handlePaste : undefined}
                />
              ))}
            </div>
          </div>
        ) : null}

        {mode === "master" ? (
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <label htmlFor="unlock-master-password" className="min-w-0 flex-1 okkey-small font-medium text-copy-primary">
                {t("unlock.masterPassword")}
              </label>
              {prefs.pinEnabled ? (
                <button
                  type="button"
                  className="okkey-small shrink-0 text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
                  onClick={() => {
                    setPinDigits(emptyPinDigits());
                    setMasterPassword("");
                    setShowUnlockError(false);
                    setPinError(null);
                    pinAutoSubmitEnabledRef.current = true;
                    setMode("pin");
                  }}
                >
                  {t("unlock.usePin")}
                </button>
              ) : null}
            </div>
            <Input
              id="unlock-master-password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={masterPassword}
              disabled={fieldsDisabled}
              onChange={(e) => {
                setMasterPassword(e.target.value);
                setShowUnlockError(false);
                setNoBundleError(false);
              }}
            />
          </div>
        ) : null}

        {noBundleError ? (
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{t("unlock.errorNoLocalVault")}</AlertDescription>
          </Alert>
        ) : null}

        {showUnlockError ? (
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{t("unlock.errorIncorrectPassword")}</AlertDescription>
          </Alert>
        ) : null}

        {pinError ? (
          <Alert variant="error">
            <AlertErrorIcon className="size-4" />
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{pinError}</AlertDescription>
          </Alert>
        ) : null}

        {mode === "master" || mode === "pin" ? (
          <Button type="submit" variant="default" className="w-full" disabled={submitDisabled}>
            {t("unlock.submit")}
          </Button>
        ) : null}

        <p className="text-center">
          <Link
            to={restoreHref}
            className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
          >
            {t("unlock.forgotPassword")}
          </Link>
        </p>
      </form>
    </AppShellLayout>
  );
}
