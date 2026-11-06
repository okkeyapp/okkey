import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Popup } from "@okkey/ui";
import { useState } from "react";

import { applySystemUpdate, fetchSystemUpdateJob } from "./api";
import type { SystemUpdateAvailable, SystemUpdateJob, SystemUpdateStatus } from "./visibility";

type Translate = (key: string, values?: WebMessageValues) => string;

type Phase = "idle" | "downloading" | "running" | "succeeded" | "failed";

const ERROR_KEYS = new Set([
  "SIGNATURE_MISSING",
  "SIGNATURE_INVALID",
  "VERIFICATION_INTERRUPTED",
  "TRUST_KEY_MISSING",
  "FEED_UNAVAILABLE",
  "FEED_FETCH_FAILED",
  "UPDATE_AGENT_UNAVAILABLE",
  "ENTERPRISE_APPLY_UNAVAILABLE",
  "APPLY_FAILED",
  "PACKAGE_INVALID",
]);

export default function SystemUpdateModal({
  t,
  accessToken,
  status,
  updates,
  onClose,
  onIgnore,
  onApplied,
}: {
  t: Translate;
  accessToken: string;
  status: SystemUpdateStatus;
  updates: readonly SystemUpdateAvailable[];
  onClose: () => void;
  onIgnore: () => void;
  onApplied: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [document, setDocument] = useState<unknown>(null);
  const [fileError, setFileError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [job, setJob] = useState<SystemUpdateJob | null>(null);
  const [errorCode, setErrorCode] = useState("");

  const busy = phase === "downloading" || phase === "running";
  const progress =
    phase === "downloading" ? 30 : phase === "succeeded" ? 100 : job?.progress ?? (phase === "running" ? 15 : 0);

  async function track(jobId: string): Promise<SystemUpdateJob> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const next = await fetchSystemUpdateJob(accessToken, jobId);
      setJob(next);
      if (next.status === "succeeded" || next.status === "failed") {
        return next;
      }
      setPhase("running");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return {
      id: jobId,
      status: "failed",
      progress: 0,
      component: "okkey",
      fromVersion: "",
      toVersion: "",
      errorCode: "APPLY_FAILED",
    };
  }

  async function onUpdate() {
    if (!status.canApply || busy) {
      return;
    }
    setErrorCode("");
    setJob(null);
    try {
      if (document) {
        setPhase("running");
        const started = await applySystemUpdate(accessToken, { source: "file", document });
        setJob(started);
        const finished = await track(started.id);
        if (finished.status === "failed") {
          setPhase("failed");
          setErrorCode(finished.errorCode || "APPLY_FAILED");
          return;
        }
        setPhase("succeeded");
        onApplied();
        return;
      }
      if (updates.length === 0) {
        return;
      }
      setPhase("downloading");
      const ordered = [...updates].sort(
        (left, right) => Number(left.component !== "okkey") - Number(right.component !== "okkey"),
      );
      for (const update of ordered) {
        const started = await applySystemUpdate(accessToken, {
          source: "feed",
          component: update.component,
        });
        setJob(started);
        setPhase("running");
        const finished = await track(started.id);
        if (finished.status === "failed") {
          setPhase("failed");
          setErrorCode(finished.errorCode || "APPLY_FAILED");
          onApplied();
          return;
        }
      }
      setPhase("succeeded");
      onApplied();
    } catch (error) {
      setPhase("failed");
      setErrorCode(readCode(error));
    }
  }

  const errorText = errorCode
    ? t(ERROR_KEYS.has(errorCode) ? `web.systemUpdate.error.${errorCode}` : "web.systemUpdate.error.generic")
    : "";

  return (
    <Popup
      width={480}
      header={t("web.systemUpdate.modalTitle")}
      description={t("web.systemUpdate.modalDescription")}
      closeLabel={t("web.systemUpdate.close")}
      closeDisabled={busy}
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {updates.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {status.feedConfigured && !status.isolated
              ? t("web.systemUpdate.upToDate")
              : t("web.systemUpdate.emptyFeed")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {updates.map((update) => (
              <li key={update.component} className="rounded-lg bg-muted px-3 py-3">
                <p className="text-sm font-medium text-foreground">
                  {t(
                    update.component === "enterprise"
                      ? "web.systemUpdate.componentEnterprise"
                      : "web.systemUpdate.componentOkkey",
                  )}
                </p>
                <p className="mt-1 text-sm text-foreground">
                  {t("web.systemUpdate.fromTo", { from: update.fromVersion, to: update.toVersion })}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{update.summary}</p>
              </li>
            ))}
          </ul>
        )}

        {status.feedError ? (
          <p className="text-sm text-muted-foreground">{t("web.systemUpdate.error.FEED_FETCH_FAILED")}</p>
        ) : null}

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-foreground" htmlFor="system-update-file">
            {t("web.systemUpdate.fileLabel")}
          </label>
          <p className="text-sm text-muted-foreground">{t("web.systemUpdate.fileHint")}</p>
          <input
            id="system-update-file"
            className="text-sm text-foreground file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
            type="file"
            accept="application/json,.okpkg,.json"
            disabled={busy || !status.canApply}
            onChange={(event) => {
              const file = event.target.files?.[0];
              setFileError("");
              setDocument(null);
              setFileName("");
              if (!file) {
                return;
              }
              setFileName(file.name);
              void file.text().then((text) => {
                try {
                  setDocument(JSON.parse(text) as unknown);
                } catch {
                  setDocument(null);
                  setFileError(t("web.systemUpdate.error.PACKAGE_INVALID"));
                }
              });
            }}
          />
          {fileName ? (
            <p className="text-xs text-muted-foreground">
              {t("web.systemUpdate.fileSelected")}: {fileName}
            </p>
          ) : null}
          {fileError ? <p className="text-sm text-destructive">{fileError}</p> : null}
        </div>

        {phase !== "idle" ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-foreground">
              {phase === "downloading"
                ? t("web.systemUpdate.progressDownloading")
                : phase === "succeeded"
                  ? t("web.systemUpdate.progressSucceeded", {
                      version: job?.toVersion || updates[0]?.toVersion || "",
                    })
                  : phase === "failed"
                    ? t("web.systemUpdate.progressFailed")
                    : job?.status === "applying"
                      ? t("web.systemUpdate.progressApplying")
                      : t("web.systemUpdate.progressVerifying")}
            </p>
          </div>
        ) : null}

        {errorText ? (
          <Alert variant="error">
            <AlertTitle>{t("web.systemUpdate.progressFailed")}</AlertTitle>
            <AlertDescription>{errorText}</AlertDescription>
          </Alert>
        ) : null}

        {!status.canApply ? (
          <p className="text-sm text-muted-foreground">{t("web.systemUpdate.ownersOnly")}</p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onIgnore}>
            {t("web.systemUpdate.ignore")}
          </Button>
          {status.canApply ? (
            <Button
              type="button"
              disabled={busy || phase === "succeeded" || (!document && updates.length === 0)}
              onClick={() => {
                void onUpdate();
              }}
            >
              {t("web.systemUpdate.update")}
            </Button>
          ) : null}
        </div>
      </div>
    </Popup>
  );
}

function readCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "APPLY_FAILED";
}
