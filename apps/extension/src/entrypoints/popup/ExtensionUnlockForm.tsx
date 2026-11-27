/**
 * Extension popup lock screen: biometric (WebAuthn PRF), PIN, or master password.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button, Input, Spinner } from "@okkey/ui";
import { unwrapUnlockMaterialWithPin, wipeBytes } from "@okkey/crypto";
import type { UnlockWithMasterPasswordResult } from "@okkey/vault";
import type { WebMessageValues } from "@okkey/i18n";

import {
  biometricErrorMessageKey,
  tryUnlockExtensionWithBiometrics,
} from "../../lib/extensionBiometricUnlock";
import { readExtensionPinUnlockWrap } from "../../lib/extensionDeviceUnlockStore";
import { initExtensionCrypto } from "../../lib/initExtensionCrypto";
import {
  createBiometricUnlockAttemptGate,
  fallbackUnlockMode,
  resolveExtensionUnlockGate,
  type ExtensionUnlockMode,
} from "../../lib/extensionPopupUnlock";
import { clearPinFailures, isPinLocked, recordPinFailure } from "../../lib/pinRateLimit";

const PIN_LENGTH = 6;

const pinCellClassName =
  "h-[54px] w-full min-w-0 p-0 text-center text-lg font-semibold tabular-nums";

function emptyPinDigits(): string[] {
  return Array.from({ length: PIN_LENGTH }, () => "");
}

export type ExtensionUnlockFormProps = {
  userId: string;
  identityBar: ReactNode;
  biometricEnabled: boolean;
  hasBioWrap: boolean;
  pinEnabled: boolean;
  hasPinWrap: boolean;
  /** Bumps when the vault is locked again so biometric can auto-run once more. */
  unlockEpoch: number;
  t: (key: string, values?: WebMessageValues) => string;
  onUnlocked: (secrets: UnlockWithMasterPasswordResult) => Promise<boolean>;
  onMasterPasswordUnlock: (masterPassword: string) => Promise<void>;
};

export function ExtensionUnlockForm({
  userId,
  identityBar,
  biometricEnabled,
  hasBioWrap,
  pinEnabled,
  hasPinWrap,
  unlockEpoch,
  t,
  onUnlocked,
  onMasterPasswordUnlock,
}: ExtensionUnlockFormProps) {
  const gate = resolveExtensionUnlockGate({
    biometricEnabled,
    hasBioWrap,
    pinEnabled,
    hasPinWrap,
  });
  const [unlockMode, setUnlockMode] = useState<ExtensionUnlockMode>(gate.initialMode);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);
  const [masterPassword, setMasterPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [pinDigits, setPinDigits] = useState(emptyPinDigits);
  const [pinError, setPinError] = useState<string | null>(null);
  const masterPasswordInputRef = useRef<HTMLInputElement>(null);
  const pinInputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const pinAutoSubmitEnabledRef = useRef(true);
  const pinSubmitInFlightRef = useRef(false);
  const bioGateRef = useRef(createBiometricUnlockAttemptGate(() => tryUnlockExtensionWithBiometrics(userId)));
  const onUnlockedRef = useRef(onUnlocked);
  const tRef = useRef(t);
  const pinAvailableRef = useRef(gate.pinAvailable);
  onUnlockedRef.current = onUnlocked;
  tRef.current = t;
  pinAvailableRef.current = gate.pinAvailable;
  const pinLabelId = "unlock-pin-label";
  const pinValue = pinDigits.join("");
  const pinAvailable = gate.pinAvailable;
  const biometricAvailable = gate.biometricAvailable;

  // Reset mode + biometric gate whenever the lock screen is shown again
  // (popup reopen after Lock, idle lock, or prefs resolve).
  useEffect(() => {
    const next = resolveExtensionUnlockGate({
      biometricEnabled,
      hasBioWrap,
      pinEnabled,
      hasPinWrap,
    });
    bioGateRef.current = createBiometricUnlockAttemptGate(() =>
      tryUnlockExtensionWithBiometrics(userId),
    );
    setUnlockMode(next.initialMode);
    setBioBusy(false);
    setBioError(null);
    setPinDigits(emptyPinDigits());
    setPinError(null);
    setMasterPassword("");
    pinAutoSubmitEnabledRef.current = true;
  }, [userId, biometricEnabled, hasBioWrap, pinEnabled, hasPinWrap, unlockEpoch]);

  useEffect(() => {
    if (unlockMode !== "biometric" || !biometricAvailable) {
      return;
    }
    let cancelled = false;
    setBioBusy(true);
    setBioError(null);
    void (async () => {
      await initExtensionCrypto();
      const unlocked = await bioGateRef.current.runOnce();
      if (cancelled) {
        return;
      }
      setBioBusy(false);
      if (!unlocked) {
        // Duplicate / already-completed attempt — stay on fallback if needed.
        setUnlockMode(fallbackUnlockMode(pinAvailableRef.current));
        return;
      }
      if (unlocked.ok) {
        const secrets: UnlockWithMasterPasswordResult = {
          vaultKey: unlocked.vaultKey,
          passwordShareC: unlocked.passwordShareC,
        };
        const ok = await onUnlockedRef.current(secrets);
        if (cancelled) {
          return;
        }
        if (!ok) {
          wipeBytes(secrets.vaultKey);
          wipeBytes(secrets.passwordShareC);
          setBioError(tRef.current("unlock.biometricFailed"));
          setUnlockMode(fallbackUnlockMode(pinAvailableRef.current));
        }
        return;
      }
      setBioError(tRef.current(biometricErrorMessageKey(unlocked.code)));
      pinAutoSubmitEnabledRef.current = true;
      setUnlockMode(fallbackUnlockMode(pinAvailableRef.current));
    })();
    return () => {
      cancelled = true;
    };
  }, [unlockMode, biometricAvailable]);

  useEffect(() => {
    if (unlockMode === "biometric" || bioBusy) {
      return;
    }
    const id = window.setTimeout(() => {
      const input =
        unlockMode === "pin" ? pinInputsRef.current[0] : masterPasswordInputRef.current;
      if (!input) {
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        active !== document.body &&
        active !== document.documentElement &&
        active !== input &&
        document.documentElement.contains(active)
      ) {
        return;
      }
      input.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(id);
  }, [unlockMode, bioBusy]);

  const setPinDigitAt = useCallback((index: number, char: string) => {
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

  const handlePinCellChange = useCallback(
    (index: number, value: string) => {
      setPinError(null);
      if (value.length > 1) {
        const pasted = value.replace(/\D/g, "").slice(0, PIN_LENGTH);
        if (pasted) {
          setPinDigits(Array.from({ length: PIN_LENGTH }, (_, i) => pasted[i] ?? ""));
          pinInputsRef.current[Math.min(pasted.length, PIN_LENGTH - 1)]?.focus();
        }
        return;
      }
      setPinDigitAt(index, value);
    },
    [setPinDigitAt],
  );

  const handlePinKeyDown = useCallback(
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

  const handlePinPaste = useCallback((e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    setPinError(null);
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (!text) {
      return;
    }
    setPinDigits(Array.from({ length: PIN_LENGTH }, (_, i) => text[i] ?? ""));
    pinInputsRef.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus();
  }, []);

  const submitPinUnlock = useCallback(async () => {
    if (pinSubmitInFlightRef.current || unlockBusy || bioBusy) {
      return;
    }
    const code = pinDigits.join("");
    if (code.length !== PIN_LENGTH) {
      return;
    }
    pinSubmitInFlightRef.current = true;
    setUnlockBusy(true);
    setPinError(null);
    try {
      if (isPinLocked(userId)) {
        setPinError(t("unlock.pinLocked"));
        return;
      }
      const wrap = await readExtensionPinUnlockWrap(userId);
      if (!wrap) {
        setUnlockMode("master");
        return;
      }
      await initExtensionCrypto();
      const pinBytes = new TextEncoder().encode(code);
      try {
        const unlocked = await unwrapUnlockMaterialWithPin({ wrap, pinUtf8: pinBytes });
        clearPinFailures(userId);
        const secrets: UnlockWithMasterPasswordResult = {
          vaultKey: unlocked.vaultKey,
          passwordShareC: unlocked.passwordShareC,
        };
        const ok = await onUnlocked(secrets);
        if (!ok) {
          wipeBytes(secrets.vaultKey);
          wipeBytes(secrets.passwordShareC);
        }
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
      setUnlockBusy(false);
    }
  }, [bioBusy, onUnlocked, pinDigits, t, unlockBusy, userId]);

  useEffect(() => {
    if (unlockMode !== "pin" || !pinAutoSubmitEnabledRef.current || unlockBusy || bioBusy) {
      return;
    }
    if (pinDigits.join("").length !== PIN_LENGTH) {
      return;
    }
    pinAutoSubmitEnabledRef.current = false;
    void submitPinUnlock();
  }, [unlockMode, pinDigits, unlockBusy, bioBusy, submitPinUnlock]);

  const retryBiometrics = useCallback(() => {
    if (!biometricAvailable || bioBusy || unlockBusy) {
      return;
    }
    bioGateRef.current.reset();
    setBioError(null);
    setPinError(null);
    setMasterPassword("");
    setPinDigits(emptyPinDigits());
    setUnlockMode("biometric");
  }, [biometricAvailable, bioBusy, unlockBusy]);

  const onUnlockSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (unlockBusy || bioBusy) {
      return;
    }
    if (unlockMode === "pin") {
      pinAutoSubmitEnabledRef.current = false;
      void submitPinUnlock();
      return;
    }
    if (unlockMode !== "master") {
      return;
    }
    if (!masterPassword.trim()) {
      return;
    }
    setUnlockBusy(true);
    void (async () => {
      try {
        await onMasterPasswordUnlock(masterPassword);
      } finally {
        setUnlockBusy(false);
      }
    })();
  };

  const pinLocked = isPinLocked(userId);
  const fieldsDisabled = unlockBusy || bioBusy || (unlockMode === "pin" && pinLocked);
  const unlockSubmitDisabled =
    fieldsDisabled ||
    (unlockMode === "pin" ? pinValue.length !== PIN_LENGTH || pinLocked : masterPassword.length === 0);
  const showUnlockSubmit = unlockMode === "pin" || unlockMode === "master";

  return (
    <form onSubmit={onUnlockSubmit} className="flex w-full flex-col gap-6" noValidate>
      {identityBar}

      {bioBusy ? (
        <p className="okkey-small text-center text-copy-secondary" role="status" aria-busy="true">
          {t("unlock.biometricPending")}
        </p>
      ) : null}

      {bioError && unlockMode !== "biometric" ? (
        <p className="okkey-small text-destructive" role="alert">
          {bioError}
        </p>
      ) : null}

      {unlockMode === "pin" ? (
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center gap-2">
            <span id={pinLabelId} className="min-w-0 flex-1 okkey-small font-medium text-copy-primary">
              {t("unlock.pin")}
            </span>
            <div className="flex shrink-0 items-center gap-2">
              {biometricAvailable ? (
                <button
                  type="button"
                  className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
                  disabled={fieldsDisabled}
                  onClick={retryBiometrics}
                >
                  {t("unlock.useBiometrics")}
                </button>
              ) : null}
              <button
                type="button"
                className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
                disabled={fieldsDisabled}
                onClick={() => {
                  setPinDigits(emptyPinDigits());
                  setMasterPassword("");
                  setPinError(null);
                  setUnlockMode("master");
                }}
              >
                {t("unlock.useMasterPassword")}
              </button>
            </div>
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
                onChange={(event) => handlePinCellChange(index, event.target.value)}
                onKeyDown={(event) => handlePinKeyDown(index, event)}
                onPaste={index === 0 ? handlePinPaste : undefined}
              />
            ))}
          </div>
        </div>
      ) : null}

      {unlockMode === "master" ? (
        <div className="flex w-full flex-col gap-3">
          <div className="flex items-center gap-2">
            <label
              htmlFor="unlock-master-password"
              className="min-w-0 flex-1 okkey-small font-medium text-copy-primary"
            >
              {t("unlock.masterPassword")}
            </label>
            <div className="flex shrink-0 items-center gap-2">
              {biometricAvailable ? (
                <button
                  type="button"
                  className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
                  disabled={fieldsDisabled}
                  onClick={retryBiometrics}
                >
                  {t("unlock.useBiometrics")}
                </button>
              ) : null}
              {pinAvailable ? (
                <button
                  type="button"
                  className="okkey-small text-copy-secondary underline decoration-solid underline-offset-2 hover:text-copy-primary"
                  disabled={fieldsDisabled}
                  onClick={() => {
                    setPinDigits(emptyPinDigits());
                    setMasterPassword("");
                    setPinError(null);
                    pinAutoSubmitEnabledRef.current = true;
                    setUnlockMode("pin");
                  }}
                >
                  {t("unlock.usePin")}
                </button>
              ) : null}
            </div>
          </div>
          <Input
            ref={masterPasswordInputRef}
            id="unlock-master-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            disabled={fieldsDisabled}
          />
        </div>
      ) : null}

      {pinError ? (
        <p className="okkey-small text-destructive" role="alert">
          {pinError}
        </p>
      ) : null}

      {showUnlockSubmit ? (
        <Button
          type="submit"
          variant="default"
          className="w-full"
          disabled={unlockSubmitDisabled}
          aria-busy={unlockBusy || undefined}
        >
          {unlockBusy ? <Spinner className="size-4" /> : null}
          {t("unlock.submit")}
        </Button>
      ) : null}
    </form>
  );
}
