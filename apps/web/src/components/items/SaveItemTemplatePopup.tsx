import { Button, Checkbox, Input, Popup } from "@okkey/ui";
import { useEffect, useState } from "react";

import PopupSaveButton from "../ui/PopupSaveButton";

export type SaveItemTemplateInput = {
  templateName: string;
  addToFavorite: boolean;
};

type SaveItemTemplatePopupProps = {
  open: boolean;
  t: (messageKey: string) => string;
  saving: boolean;
  error: string | null;
  initialTemplateName?: string;
  onClose: () => void;
  onSave: (input: SaveItemTemplateInput) => void;
};

export default function SaveItemTemplatePopup({
  open,
  t,
  saving,
  error,
  initialTemplateName = "",
  onClose,
  onSave,
}: SaveItemTemplatePopupProps) {
  const [templateName, setTemplateName] = useState("");
  const [addToFavorite, setAddToFavorite] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  useEffect(() => {
    if (!open) {
      setTemplateName("");
      setAddToFavorite(false);
      setShowValidation(false);
      return;
    }
    setTemplateName(initialTemplateName.trim());
  }, [initialTemplateName, open]);

  if (!open) {
    return null;
  }

  const trimmedName = templateName.trim();
  const nameInvalid = showValidation && trimmedName.length === 0;

  function handleClose() {
    if (saving) {
      return;
    }
    setTemplateName("");
    setAddToFavorite(false);
    setShowValidation(false);
    onClose();
  }

  function handleSave() {
    if (!trimmedName) {
      setShowValidation(true);
      return;
    }
    onSave({ templateName: trimmedName, addToFavorite });
  }

  return (
    <Popup
      className="z-[60]"
      width={420}
      header={t("web.saveItemTemplatePopup.title")}
      description={t("web.saveItemTemplatePopup.hint")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={saving}
      panelClassName="min-h-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <PopupSaveButton
            saving={saving}
            saveLabel={t("web.newItemPopup.save")}
            savingLabel={t("web.newItemPopup.saving")}
            onClick={handleSave}
          />
        </>
      }
    >
      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="save-item-template-name" className="text-sm font-medium text-foreground">
            {t("web.saveItemTemplatePopup.nameLabel")}
          </label>
          <Input
            id="save-item-template-name"
            value={templateName}
            onChange={(event) => setTemplateName(event.target.value)}
            placeholder={t("web.saveItemTemplatePopup.namePlaceholder")}
            aria-invalid={nameInvalid || undefined}
            className={nameInvalid ? "border-destructive" : undefined}
            autoFocus
          />
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-foreground">
          <Checkbox checked={addToFavorite} onCheckedChange={(checked) => setAddToFavorite(checked === true)} />
          {t("web.saveItemTemplatePopup.addToFavorites")}
        </label>
      </div>
    </Popup>
  );
}
