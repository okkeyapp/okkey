import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup, type PopupProps } from "@okkey/ui";

type CopyGuardConfirmPopupProps = {
  open: boolean;
  t: (messageKey: string, values?: WebMessageValues) => string;
  onCancel: () => void;
  onCopy: () => void;
  /** Defaults to `desktop` (centered card). Pass from extension hosts < `md`. */
  layout?: PopupProps["layout"];
  /** Defaults to 420. Extension confirms should stay compact (≈360). */
  width?: PopupProps["width"];
};

const DEFAULT_WIDTH = 420;

export function CopyGuardConfirmPopup({
  open,
  t,
  onCancel,
  onCopy,
  layout = "desktop",
  width = DEFAULT_WIDTH,
}: CopyGuardConfirmPopupProps) {
  if (!open) {
    return null;
  }

  return (
    <Popup
      className="z-popup-nested"
      width={width}
      layout={layout}
      header={t("extension.vault.copyGuardTitle")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onCancel}
      panelClassName="min-h-0 max-w-full"
      contentClassName="pb-0 pt-0"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("extension.vault.copyGuardCancel")}
          </Button>
          <Button type="button" onClick={onCopy}>
            {t("extension.vault.copyGuardConfirm")}
          </Button>
        </>
      }
    >
      <p className="w-full text-sm leading-5 text-muted-foreground">{t("extension.vault.copyGuardBody")}</p>
    </Popup>
  );
}
