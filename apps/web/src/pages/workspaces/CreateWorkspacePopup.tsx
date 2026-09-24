import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Input, Popup } from "@okkey/ui";
import { useEffect, useId, useState } from "react";

type CreateWorkspacePopupProps = {
  open: boolean;
  submitting?: boolean;
  errorMessage?: string | null;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onSubmit: (name: string) => void;
};

/**
 * SaaS multi-workspace create dialog (shared UI `Popup`, product-sized chrome).
 * New workspaces are created as FREE on the server.
 */
export default function CreateWorkspacePopup({
  open,
  submitting = false,
  errorMessage = null,
  t,
  onClose,
  onSubmit,
}: CreateWorkspacePopupProps) {
  const formId = useId();
  const [name, setName] = useState("");

  useEffect(() => {
    if (open) {
      setName(t("workspaces.createDefaultName"));
    } else {
      setName("");
    }
  }, [open, t]);

  if (!open) {
    return null;
  }

  function handleClose() {
    if (submitting) {
      return;
    }
    onClose();
  }

  const trimmed = name.trim();

  return (
    <Popup
      className="z-[60]"
      width={560}
      header={t("workspaces.createPopup.title")}
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
          <Button type="submit" form={formId} disabled={!trimmed || submitting}>
            {submitting ? t("workspaces.createPopup.creating") : t("workspaces.createPopup.submit")}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className="flex w-full flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          if (submitting || !trimmed) {
            return;
          }
          onSubmit(trimmed);
        }}
      >
        <p className="w-full text-sm leading-5 text-muted-foreground">
          {t("workspaces.createPopup.description")}
        </p>
        {errorMessage ? (
          <Alert variant="error">
            <AlertTitle>{t("unlock.errorTitle")}</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}
        <label className="flex w-full flex-col gap-3 text-sm font-medium text-foreground">
          {t("workspaces.createPopup.nameLabel")}
          <Input
            type="text"
            className="font-normal"
            value={name}
            placeholder={t("workspaces.createDefaultName")}
            disabled={submitting}
            autoFocus
            maxLength={120}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
      </form>
    </Popup>
  );
}
