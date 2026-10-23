import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Popup, Spinner } from "@okkey/ui";
import { useState } from "react";

import {
  applySystemUpdate,
  type ApplySystemUpdateResult,
} from "../../workspace/applySystemUpdate";
import {
  okkeyReleaseNotesUrl,
  primaryUpdateTargetVersion,
  updateChangelogBullets,
  type UpdateCheckInfo,
} from "../../workspace/useUpdateCheck";

export type SystemUpdatesPopupMode = "loading" | "up_to_date" | "available";

type SystemUpdatesPopupProps = {
  open: boolean;
  mode: SystemUpdatesPopupMode;
  /** Required when mode === "available". */
  info: UpdateCheckInfo | null;
  t: (messageKey: string, values?: WebMessageValues) => string;
  /** Close without dismiss (X / overlay). */
  onClose: () => void;
  /** Ignore: dismiss notice until next target version. */
  onIgnore: () => void;
  /** Called after a successful apply (agent / hook / version_file). */
  onApplied?: () => void;
};

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
 * Self-host update modal.
 * - loading: check in progress
 * - up_to_date: Alert that latest is installed
 * - available: product version + short changelog + Ignore/Update
 */
export default function SystemUpdatesPopup({
  open,
  mode,
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
    if (applying || mode !== "available") {
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
    if (applying || mode === "loading") {
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

  const targetVersion = info ? primaryUpdateTargetVersion(info) : null;
  const bullets = info ? updateChangelogBullets(info) : [];
  const notesUrl = targetVersion ? okkeyReleaseNotesUrl(targetVersion) : null;

  const footer =
    mode === "available" ? (
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
    ) : mode === "up_to_date" ? (
      <div className="flex w-full items-center justify-end">
        <Button type="button" data-testid="system-updates-ok" onClick={handleClose}>
          {t("web.updatesPopup.ok")}
        </Button>
      </div>
    ) : null;

  return (
    <Popup
      id="system-updates"
      data-testid="system-updates-popup"
      width={420}
      header={
        mode === "up_to_date"
          ? t("web.updatesPopup.upToDateTitle")
          : t("web.updatesPopup.title")
      }
      description={
        mode === "loading"
          ? t("web.updatesPopup.checking")
          : mode === "up_to_date"
            ? undefined
            : t("web.updatesPopup.description")
      }
      closeLabel={t("web.settingsPopup.close")}
      onClose={handleClose}
      closeDisabled={applying || mode === "loading"}
      footer={footer}
    >
      <div className="flex w-full flex-col gap-3">
        {mode === "loading" ? (
          <div
            className="flex w-full items-center justify-center gap-2 py-6 text-sm text-muted-foreground"
            data-testid="system-updates-loading"
            role="status"
            aria-busy="true"
          >
            <Spinner className="size-5" />
            {t("web.updatesPopup.checking")}
          </div>
        ) : null}

        {mode === "up_to_date" ? (
          <Alert variant="info" data-testid="system-updates-up-to-date">
            <AlertTitle>{t("web.updatesPopup.upToDateTitle")}</AlertTitle>
            <AlertDescription>{t("web.updatesPopup.upToDateBody")}</AlertDescription>
          </Alert>
        ) : null}

        {mode === "available" && info && targetVersion ? (
          <>
            <p
              className="text-sm font-medium text-foreground"
              data-testid="system-updates-target-version"
            >
              {t("web.updatesPopup.versionLine", { version: targetVersion })}
            </p>
            {bullets.length > 0 ? (
              <ul
                className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground"
                data-testid="system-updates-changelog"
              >
                {bullets.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
            {notesUrl ? (
              <a
                href={notesUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                data-testid="system-updates-and-more"
              >
                {t("web.updatesPopup.andMore")}
              </a>
            ) : null}
            {applyError ? (
              <Alert variant="error" data-testid="system-updates-apply-error">
                <AlertDescription>{applyError}</AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : null}
      </div>
    </Popup>
  );
}
