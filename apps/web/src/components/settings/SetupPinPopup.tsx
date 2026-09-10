import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Input, Popup } from "@okkey/ui";
import { useId, useState } from "react";

type SetupPinPopupProps = {
  open: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSubmit: (pin: string) => void;
};

const PIN_MIN = 4;
const PIN_MAX = 8;

export default function SetupPinPopup({ open, t, onClose, onSubmit }: SetupPinPopupProps) {
  const formId = useId();
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  function handleClose() {
    setPin("");
    setConfirm("");
    setError(null);
    onClose();
  }

  const digitsOnly = (value: string) => value.replace(/\D/g, "").slice(0, PIN_MAX);

  return (
    <Popup
      className="z-[60]"
      width={420}
      header={t("web.settingsPopup.vault.pin.setupTitle")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      panelClassName="min-h-0"
      contentClassName="pt-0 pb-1"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={pin.length < PIN_MIN || confirm.length < PIN_MIN}>
            {t("web.settingsPopup.vault.pin.setupSubmit")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex w-full flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (pin.length < PIN_MIN) {
            setError(t("web.settingsPopup.vault.pin.tooShort"));
            return;
          }
          if (pin !== confirm) {
            setError(t("web.settingsPopup.vault.pin.mismatch"));
            return;
          }
          setError(null);
          onSubmit(pin);
          setPin("");
          setConfirm("");
        }}
      >
        <p className="w-full text-sm leading-5 text-muted-foreground">
          {t("web.settingsPopup.vault.pin.setupDescription")}
        </p>
        {error ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
          {t("web.settingsPopup.vault.pin.label")}
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            className="font-normal tracking-widest"
            value={pin}
            autoFocus
            onChange={(e) => setPin(digitsOnly(e.target.value))}
          />
        </label>
        <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
          {t("web.settingsPopup.vault.pin.confirmLabel")}
          <Input
            type="password"
            inputMode="numeric"
            autoComplete="new-password"
            className="font-normal tracking-widest"
            value={confirm}
            onChange={(e) => setConfirm(digitsOnly(e.target.value))}
          />
        </label>
      </form>
    </Popup>
  );
}
