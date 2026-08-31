import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Input, Popup } from "@okkey/ui";
import { useId, useState } from "react";

type ImportExportPasswordPopupProps = {
  open: boolean;
  submitting?: boolean;
  errorMessage?: string | null;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSubmit: (password: string) => void;
};

export default function ImportExportPasswordPopup({
  open,
  submitting = false,
  errorMessage = null,
  t,
  onClose,
  onSubmit,
}: ImportExportPasswordPopupProps) {
  const formId = useId();
  const [password, setPassword] = useState("");

  if (!open) {
    return null;
  }

  function handleClose() {
    if (submitting) {
      return;
    }
    setPassword("");
    onClose();
  }

  return (
    <Popup
      className="z-[60]"
      width={420}
      header={t("web.tools.import.exportPassword.title")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={submitting}
      panelClassName="min-h-0"
      contentClassName="pt-0 pb-1"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={submitting}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={!password.trim() || submitting}>
            {t("web.tools.import.exportPassword.unlock")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex w-full flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (submitting || !password.trim()) {
            return;
          }
          onSubmit(password);
        }}
      >
        <p className="w-full text-sm leading-5 text-muted-foreground">
          {t("web.tools.import.exportPassword.description")}
        </p>
        {errorMessage ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
          {t("web.tools.import.exportPassword.label")}
          <Input
            type="password"
            className="font-normal"
            value={password}
            placeholder={t("web.tools.import.exportPassword.placeholder")}
            disabled={submitting}
            autoFocus
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      </form>
    </Popup>
  );
}
