import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, Button, Popup, Spinner } from "@okkey/ui";
import { useState } from "react";

import {
  applySystemUpdate,
  type ApplySystemUpdateResult,
} from "../../workspace/applySystemUpdate";
import type { AvailableUpdateInfo, UpdateCheckInfo } from "../../workspace/useUpdateCheck";

type SystemUpdatesPopupProps = {
  open: boolean;
  info: UpdateCheckInfo;
  t: (messageKey: string, values?: WebMessageValues) => string;
  /** Close without dismiss (X / overlay). */
  onClose: () => void;
  /** Ignore: dismiss notice until next target version. */
  onIgnore: () => void;
  /** Called after a successful apply (u5 agent path). */
  onApplied?: () => void;
};

function componentLabel(
  id: AvailableUpdateInfo["id"],
  t: SystemUpdatesPopupProps["t"],
): string {
  return id === "okkey-enterprise"
    ? t("web.updatesPopup.componentEnterprise")
    : t("web.updatesPopup.componentOkkey");
}

function applyErrorMessage(
  result: Extract<ApplySystemUpdateResult, { ok: false }>,
  t: SystemUpdatesPopupProps["t"],
): string {
  if (result.error === "UPDATE_APPLY_UNAVAILABLE") {
    return t("web.updatesPopup.applyUnavailable");
  }
  return t("web.updatesPopup.applyError");
}

/**
 * Self-host update modal: lists available from→to (+ notes).
 * Ignore dismisses; Update calls POST /updates/apply (501 until signed agent).
 */
export default function SystemUpdatesPopup({
  open,
  info,
  t,
  onClose,
  onIgnore,
  onApplied,
}: SystemUpdatesPopupProps) {
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  if (!open) {
    return null;
  }

  async function handleUpdate() {
    if (applying) {
      return;
    }
    setApplying(true);
    setApplyError(null);
    const result = await applySystemUpdate();
    setApplying(false);
    if (result.ok) {
      onApplied?.();
      onClose();
      return;
    }
    setApplyError(applyErrorMessage(result, t));
  }

  function handleClose() {
    if (applying) {
      return;
    }
    setApplyError(null);
    onClose();
  }

  function handleIgnore() {
    if (applying) {
      return;
    }
    setApplyError(null);
    onIgnore();
  }

  return (
    <Popup
      id="system-updates"
      data-testid="system-updates-popup"
      width={420}
      header={t("web.updatesPopup.title")}
      description={t("web.updatesPopup.description")}
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={applying}
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            data-testid="system-updates-ignore"
            onClick={handleIgnore}
            disabled={applying}
          >
            {t("web.updatesPopup.ignore")}
          </Button>
          <Button
            type="button"
            data-testid="system-updates-update"
            onClick={() => void handleUpdate()}
            disabled={applying}
          >
            {applying ? (
              <span className="inline-flex items-center gap-2">
                <Spinner className="size-4" />
                {t("web.updatesPopup.applying")}
              </span>
            ) : (
              t("web.updatesPopup.update")
            )}
          </Button>
        </div>
      }
    >
      <div className="flex w-full flex-col gap-3">
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
        {applyError ? (
          <Alert variant="error" data-testid="system-updates-apply-error">
            <AlertDescription>{applyError}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </Popup>
  );
}
