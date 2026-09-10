import { Alert, AlertDescription, AlertTitle, Button, Input, Popup } from "@okkey/ui";
import { unwrapUnlockMaterialWithPin, wipeBytes } from "@okkey/crypto";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from "react";

import { useAuthVault } from "../../auth/AuthVaultContext";
import { tryUnlockWithBiometrics } from "../../auth/biometricUnlock";
import { useLocale } from "../../locale/LocaleContext";
import { clearPinFailures, isPinLocked, recordPinFailure } from "../../auth/pinRateLimit";
import { readVaultDevicePrefs, type SectionReauthZoneId } from "../../auth/vaultDevicePrefs";
import { readPinUnlockWrap } from "../../auth/vaultDeviceUnlockStore";

type UnlockMode = "biometric" | "pin" | "master";

type SectionReauthPopupProps = {
  zone: SectionReauthZoneId;
  onUnlocked: () => void;
  onCancel: () => void;
};

const PIN_LENGTH = 6;

const pinCellClassName =
  "h-[54px] w-full min-w-0 p-0 text-center text-lg font-semibold tabular-nums";

function emptyPinDigits(): string[] {
  return Array.from({ length: PIN_LENGTH }, () => "");
}

export default function SectionReauthPopup({ zone, onUnlocked, onCancel }: SectionReauthPopupProps) {
  const { t } = useLocale();
  const { userId, verifyMasterPassword } = useAuthVault();
  const formId = useId();
  const pinLabelId = useId();
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
  const [pinDigits, setPinDigits] = useState(emptyPinDigits);
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pinInputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const pinValue = pinDigits.join("");

  useEffect(() => {
    if (mode !== "biometric" || !userId) {
      return;
    }
    let cancelled = false;
    setBioBusy(true);
    void (async () => {
      const unlocked = await tryUnlockWithBiometrics(userId);
      if (cancelled) {
        return;
      }
      setBioBusy(false);
      if (unlocked) {
        wipeBytes(unlocked.vaultKey);
        wipeBytes(unlocked.passwordShareC);
        onUnlocked();
        return;
      }
      setMode(prefs.pinEnabled ? "pin" : "master");
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, userId, onUnlocked, prefs.pinEnabled]);

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
      setError(null);
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
    setError(null);
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LENGTH);
    if (!text) {
      return;
    }
    setPinDigits(Array.from({ length: PIN_LENGTH }, (_, i) => text[i] ?? ""));
    pinInputsRef.current[Math.min(text.length, PIN_LENGTH - 1)]?.focus();
  }, []);

  const fieldsDisabled = bioBusy || submitting || (mode === "pin" && userId !== null && isPinLocked(userId));
  const showUnlockSubmit = mode === "master" || mode === "pin";
  const unlockDisabled =
    fieldsDisabled ||
    (mode === "pin" ? pinValue.length !== PIN_LENGTH : !masterPassword.trim());

  return (
    <Popup
      className="z-[70]"
      width={420}
      header={t("web.settingsPopup.vault.reauth.title")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onCancel}
      panelClassName="min-h-0"
      contentClassName="pt-0 pb-1"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            {t("web.settingsPopup.vault.reauth.cancel")}
          </Button>
          {showUnlockSubmit ? (
            <Button type="submit" form={formId} disabled={unlockDisabled}>
              {t("web.settingsPopup.vault.reauth.unlock")}
            </Button>
          ) : null}
        </>
      }
    >
      <form
        id={formId}
        className="flex w-full flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!userId || unlockDisabled) {
            return;
          }
          void (async () => {
            setSubmitting(true);
            setError(null);
            try {
              if (mode === "pin") {
                if (isPinLocked(userId)) {
                  setError(t("unlock.pinLocked"));
                  return;
                }
                const wrap = readPinUnlockWrap(userId);
                if (!wrap) {
                  setMode("master");
                  return;
                }
                const pinBytes = new TextEncoder().encode(pinValue);
                try {
                  const unlocked = await unwrapUnlockMaterialWithPin({ wrap, pinUtf8: pinBytes });
                  wipeBytes(unlocked.vaultKey);
                  wipeBytes(unlocked.passwordShareC);
                  clearPinFailures(userId);
                  onUnlocked();
                } catch {
                  const result = recordPinFailure(userId);
                  setError(result.locked ? t("unlock.pinLocked") : t("unlock.pinIncorrect"));
                  setPinDigits(emptyPinDigits());
                  window.setTimeout(() => pinInputsRef.current[0]?.focus(), 0);
                } finally {
                  pinBytes.fill(0);
                }
                return;
              }
              const ok = await verifyMasterPassword(masterPassword);
              if (!ok) {
                setError(t("unlock.errorIncorrectPassword"));
                return;
              }
              onUnlocked();
            } finally {
              setSubmitting(false);
            }
          })();
        }}
      >
        <p className="w-full text-sm leading-5 text-muted-foreground">
          {t("web.settingsPopup.vault.reauth.description", {
            zone: t(`web.settingsPopup.vault.zones.${zone}`),
          })}
        </p>
        {bioBusy ? (
          <p className="text-sm text-muted-foreground">{t("unlock.biometricPending")}</p>
        ) : null}
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {mode === "pin" ? (
          <div className="flex w-full flex-col gap-3">
            <div className="flex items-center gap-2">
              <span id={pinLabelId} className="min-w-0 flex-1 text-sm font-medium text-foreground">
                {t("web.settingsPopup.vault.pin.label")}
              </span>
              <button
                type="button"
                className="shrink-0 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                disabled={bioBusy}
                onClick={() => {
                  setPinDigits(emptyPinDigits());
                  setMasterPassword("");
                  setError(null);
                  setMode("master");
                }}
              >
                {t("unlock.useMasterPassword")}
              </button>
            </div>
            <div
              role="group"
              aria-labelledby={pinLabelId}
              className="grid w-full grid-cols-6 gap-2.5"
            >
              {pinDigits.map((digit, index) => (
                <Input
                  key={index}
                  ref={(el) => {
                    pinInputsRef.current[index] = el;
                  }}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  name={`section-reauth-pin-${index}`}
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
              <label className="min-w-0 flex-1 text-sm font-medium text-foreground">
                {t("unlock.masterPassword")}
              </label>
              {prefs.pinEnabled ? (
                <button
                  type="button"
                  className="shrink-0 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  onClick={() => {
                    setPinDigits(emptyPinDigits());
                    setMasterPassword("");
                    setError(null);
                    setMode("pin");
                  }}
                >
                  {t("unlock.usePin")}
                </button>
              ) : null}
            </div>
            <Input
              type="password"
              className="font-normal"
              value={masterPassword}
              disabled={fieldsDisabled}
              autoFocus
              onChange={(e) => setMasterPassword(e.target.value)}
            />
          </div>
        ) : null}
      </form>
    </Popup>
  );
}
