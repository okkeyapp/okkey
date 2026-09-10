import { Alert, AlertDescription, AlertTitle, Button, Input, Popup } from "@okkey/ui";
import { useEffect, useId, useState } from "react";
import { unwrapUnlockMaterialWithPin, wipeBytes } from "@okkey/crypto";

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
};

export default function SectionReauthPopup({ zone, onUnlocked }: SectionReauthPopupProps) {
  const { t } = useLocale();
  const { userId, verifyMasterPassword } = useAuthVault();
  const formId = useId();
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
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const fieldsDisabled = bioBusy || submitting || (mode === "pin" && userId !== null && isPinLocked(userId));

  return (
    <Popup
      className="z-[70]"
      width={420}
      header={t("web.settingsPopup.vault.reauth.title")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={() => {
        /* must unlock to proceed — stay open */
      }}
      closeDisabled
      panelClassName="min-h-0"
      contentClassName="pt-0 pb-1"
      footer={
        mode === "master" || mode === "pin" ? (
          <Button type="submit" form={formId} disabled={!value.trim() || fieldsDisabled} className="w-full">
            {t("web.settingsPopup.vault.reauth.unlock")}
          </Button>
        ) : null
      }
    >
      <form
        id={formId}
        className="flex w-full flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!userId || fieldsDisabled || !value.trim()) {
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
                const pinBytes = new TextEncoder().encode(value);
                try {
                  const unlocked = await unwrapUnlockMaterialWithPin({ wrap, pinUtf8: pinBytes });
                  wipeBytes(unlocked.vaultKey);
                  wipeBytes(unlocked.passwordShareC);
                  clearPinFailures(userId);
                  onUnlocked();
                } catch {
                  const result = recordPinFailure(userId);
                  setError(result.locked ? t("unlock.pinLocked") : t("unlock.pinIncorrect"));
                } finally {
                  pinBytes.fill(0);
                }
                return;
              }
              const ok = await verifyMasterPassword(value);
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
          {t("web.settingsPopup.vault.reauth.description", { zone: t(`web.settingsPopup.vault.zones.${zone === "toolsAndWorkspaceSettings" ? "toolsAndSettings" : zone}`) })}
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
          <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
            {t("web.settingsPopup.vault.pin.label")}
            <Input
              type="password"
              inputMode="numeric"
              className="font-normal tracking-widest"
              value={value}
              disabled={fieldsDisabled}
              autoFocus
              onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
            />
          </label>
        ) : null}
        {mode === "master" ? (
          <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
            {t("unlock.masterPassword")}
            <Input
              type="password"
              className="font-normal"
              value={value}
              disabled={fieldsDisabled}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
            />
          </label>
        ) : null}
        {mode !== "master" ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            disabled={bioBusy}
            onClick={() => {
              setValue("");
              setError(null);
              setMode("master");
            }}
          >
            {t("unlock.useMasterPassword")}
          </button>
        ) : null}
        {mode === "master" && prefs.pinEnabled ? (
          <button
            type="button"
            className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
            onClick={() => {
              setValue("");
              setError(null);
              setMode("pin");
            }}
          >
            {t("unlock.usePin")}
          </button>
        ) : null}
      </form>
    </Popup>
  );
}
