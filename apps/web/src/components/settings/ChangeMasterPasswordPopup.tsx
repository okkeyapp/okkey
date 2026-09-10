import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Input, Popup } from "@okkey/ui";
import { useId, useState } from "react";

type ChangeMasterPasswordPopupProps = {
  open: boolean;
  submitting?: boolean;
  errorMessage?: string | null;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSubmit: (input: { oldPassword: string; newPassword: string }) => void;
};

export default function ChangeMasterPasswordPopup({
  open,
  submitting = false,
  errorMessage = null,
  t,
  onClose,
  onSubmit,
}: ChangeMasterPasswordPopupProps) {
  const formId = useId();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  function handleClose() {
    if (submitting) {
      return;
    }
    setOldPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setLocalError(null);
    onClose();
  }

  const canSubmit =
    oldPassword.length > 0 &&
    newPassword.length >= 4 &&
    confirmPassword.length > 0 &&
    !submitting;

  return (
    <Popup
      className="z-[60]"
      width={420}
      header={t("web.settingsPopup.vault.changePassword.title")}
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
          <Button type="submit" form={formId} disabled={!canSubmit}>
            {t("web.settingsPopup.vault.changePassword.submit")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex w-full flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) {
            return;
          }
          if (newPassword !== confirmPassword) {
            setLocalError(t("web.settingsPopup.vault.changePassword.mismatch"));
            return;
          }
          if (newPassword.length < 4) {
            setLocalError(t("web.settingsPopup.vault.changePassword.tooShort"));
            return;
          }
          setLocalError(null);
          onSubmit({ oldPassword, newPassword });
        }}
      >
        <p className="w-full text-sm leading-5 text-muted-foreground">
          {t("web.settingsPopup.vault.changePassword.description")}
        </p>
        {errorMessage || localError ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{errorMessage ?? localError}</AlertDescription>
          </Alert>
        ) : null}
        <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
          {t("web.settingsPopup.vault.changePassword.oldLabel")}
          <Input
            type="password"
            className="font-normal"
            value={oldPassword}
            disabled={submitting}
            autoFocus
            autoComplete="current-password"
            onChange={(event) => setOldPassword(event.target.value)}
          />
        </label>
        <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
          {t("web.settingsPopup.vault.changePassword.newLabel")}
          <Input
            type="password"
            className="font-normal"
            value={newPassword}
            disabled={submitting}
            autoComplete="new-password"
            onChange={(event) => setNewPassword(event.target.value)}
          />
        </label>
        <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
          {t("web.settingsPopup.vault.changePassword.confirmLabel")}
          <Input
            type="password"
            className="font-normal"
            value={confirmPassword}
            disabled={submitting}
            autoComplete="new-password"
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </label>
      </form>
    </Popup>
  );
}
