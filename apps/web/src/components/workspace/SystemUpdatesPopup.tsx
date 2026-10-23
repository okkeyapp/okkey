import type { WebMessageValues } from "@okkey/i18n";
import { Button, Popup } from "@okkey/ui";

import type { AvailableUpdateInfo, UpdateCheckInfo } from "../../workspace/useUpdateCheck";

type SystemUpdatesPopupProps = {
  open: boolean;
  info: UpdateCheckInfo;
  t: (messageKey: string, values?: WebMessageValues) => string;
  /** Close without dismiss (X / overlay). */
  onClose: () => void;
  /** Ignore: dismiss notice until next target version. */
  onIgnore: () => void;
  /** Stub until apply flow (u5); host may no-op or close. */
  onUpdate: () => void;
};

function componentLabel(
  id: AvailableUpdateInfo["id"],
  t: SystemUpdatesPopupProps["t"],
): string {
  return id === "okkey-enterprise"
    ? t("web.updatesPopup.componentEnterprise")
    : t("web.updatesPopup.componentOkkey");
}

/**
 * Self-host update modal shell: lists available from→to (+ notes).
 * Ignore closes; Update is a stub until apply flow.
 */
export default function SystemUpdatesPopup({
  open,
  info,
  t,
  onClose,
  onIgnore,
  onUpdate,
}: SystemUpdatesPopupProps) {
  if (!open) {
    return null;
  }

  return (
    <Popup
      id="system-updates"
      data-testid="system-updates-popup"
      width={420}
      header={t("web.updatesPopup.title")}
      description={t("web.updatesPopup.description")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="system-updates-ignore"
            onClick={onIgnore}
          >
            {t("web.updatesPopup.ignore")}
          </Button>
          <Button
            type="button"
            data-testid="system-updates-update"
            onClick={onUpdate}
          >
            {t("web.updatesPopup.update")}
          </Button>
        </div>
      }
    >
      <ul className="flex w-full flex-col gap-3" data-testid="system-updates-list">
        {info.available.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1 text-sm"
            data-testid={`system-updates-item-${item.id}`}
          >
            <span className="font-medium text-foreground">{componentLabel(item.id, t)}</span>
            <span className="text-muted-foreground">
              {t("web.updatesPopup.fromTo", { from: item.from, to: item.to })}
            </span>
            {item.notes ? (
              <span className="text-muted-foreground">{item.notes}</span>
            ) : null}
          </li>
        ))}
      </ul>
    </Popup>
  );
}
