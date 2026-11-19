import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup, type PopupProps } from "@okkey/ui";

type PurgeItemsConfirmPopupProps = {
  open: boolean;
  /** `single` = one item; `multiple` = selected; `emptyTrash` = all purgeable trash items. */
  mode: "single" | "multiple" | "emptyTrash";
  purging?: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onClose: () => void;
  onConfirm: () => void;
  layout?: PopupProps["layout"];
  width?: PopupProps["width"];
};

const DEFAULT_WIDTH = 420;

export function PurgeItemsConfirmPopup({
  open,
  mode,
  purging = false,
  t,
  onClose,
  onConfirm,
  layout = "desktop",
  width = DEFAULT_WIDTH,
}: PurgeItemsConfirmPopupProps) {
  if (!open) {
    return null;
  }

  function handleClose() {
    if (purging) {
      return;
    }
    onClose();
  }

  const headerKey =
    mode === "emptyTrash"
      ? "web.purgeItemsConfirmPopup.emptyTrashTitle"
      : mode === "multiple"
        ? "web.purgeItemsConfirmPopup.titleMultiple"
        : "web.purgeItemsConfirmPopup.titleSingle";
  const descriptionKey =
    mode === "emptyTrash"
      ? "web.purgeItemsConfirmPopup.emptyTrashDescription"
      : mode === "multiple"
        ? "web.purgeItemsConfirmPopup.descriptionMultiple"
        : "web.purgeItemsConfirmPopup.descriptionSingle";
  const confirmKey =
    mode === "emptyTrash"
      ? "web.purgeItemsConfirmPopup.emptyTrashConfirm"
      : "web.purgeItemsConfirmPopup.deletePermanently";

  return (
    <Popup
      className="z-popup-nested"
      width={width}
      layout={layout}
      header={t(headerKey)}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={purging}
      panelClassName="min-h-0 max-w-full"
      contentClassName="pb-0 pt-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={handleClose} disabled={purging}>
            {t("web.newItemPopup.cancel")}
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirm} disabled={purging}>
            {t(confirmKey)}
          </Button>
        </>
      }
    >
      <p className="w-full text-sm leading-5 text-muted-foreground">{t(descriptionKey)}</p>
    </Popup>
  );
}
