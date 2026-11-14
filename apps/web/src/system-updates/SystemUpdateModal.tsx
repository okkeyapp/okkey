import type { WebMessageValues } from "@okkey/i18n";
import { Alert, AlertDescription, AlertTitle, Button, Popup } from "@okkey/ui";
import { useState } from "react";

import { applySystemUpdate, fetchSystemUpdateJob } from "./api";
import {
  classifyOfflineFile,
  OFFLINE_FILE_ACCEPT,
  type OfflineArchiveChoice,
  type OfflineChoice,
  type OfflinePackageChoice,
} from "./offline-files";
import { planComponentUpdateOrder } from "./update-order";
import type {
  SystemUpdateAvailable,
  SystemUpdateComponent,
  SystemUpdateComponentStatus,
  SystemUpdateJob,
  SystemUpdateStatus,
} from "./visibility";

type Translate = (key: string, values?: WebMessageValues) => string;

type Phase = "idle" | "downloading" | "running" | "succeeded" | "failed";

type UpdateRow = {
  component: SystemUpdateComponent;
  installedVersion: string;
  update: SystemUpdateAvailable | null;
  checkError: string | null;
  releaseNotesUrl: string | null;
  minCoreVersion: string | null;
};

const ERROR_KEYS = new Set([
  "SIGNATURE_MISSING",
  "SIGNATURE_INVALID",
  "VERIFICATION_INTERRUPTED",
  "TRUST_KEY_MISSING",
  "FEED_UNAVAILABLE",
  "FEED_FETCH_FAILED",
  "UPDATE_AGENT_UNAVAILABLE",
  "ENTERPRISE_APPLY_UNAVAILABLE",
  "CORE_UPDATE_REQUIRED",
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
  const [choices, setChoices] = useState<OfflineChoice[]>([]);
  const [fileError, setFileError] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [job, setJob] = useState<SystemUpdateJob | null>(null);
  const [errorCode, setErrorCode] = useState("");

  const busy = phase === "downloading" || phase === "running";
  const progress =
    phase === "downloading" ? 30 : phase === "succeeded" ? 100 : job?.progress ?? (phase === "running" ? 15 : 0);
  const rows = componentRows(status, updates);
  const packages = choices.filter((choice): choice is OfflinePackageChoice => choice.kind === "package");
  const archives = choices.filter((choice): choice is OfflineArchiveChoice => choice.kind === "archive");
  const usingFiles = packages.length > 0 || archives.length > 0;
  const feedPlan = planComponentUpdateOrder(updates, status.currentVersion);
  const filePlan = planComponentUpdateOrder(
    packages.map((choice) => ({
      component: choice.component,
      toVersion: choice.version,
      minCoreVersion: choice.minCoreVersion,
    })),
    status.currentVersion,
  );
  const notice = usingFiles ? filePlan.notice : feedPlan.notice;
  const applicableArchives =
    status.offlineArchiveSupported === true
      ? archives.filter((archive) => archive.document && typeof archive.document === "object")
      : [];
  const hasWork = usingFiles ? filePlan.order.length > 0 || applicableArchives.length > 0 : feedPlan.order.length > 0;

  async function track(jobId: string, component: SystemUpdateComponent): Promise<SystemUpdateJob> {
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
      component,
      fromVersion: "",
      toVersion: "",
      errorCode: "APPLY_FAILED",
    };
  }

  async function runJob(started: SystemUpdateJob): Promise<boolean> {
    setJob(started);
    setPhase("running");
    const finished = await track(started.id, started.component);
    if (finished.status === "failed") {
      setPhase("failed");
      setErrorCode(finished.errorCode || "APPLY_FAILED");
      onApplied();
      return false;
    }
    return true;
  }

  async function onUpdate(only?: SystemUpdateComponent) {
    if (!status.canApply || busy) {
      return;
    }
    setErrorCode("");
    setJob(null);
    try {
      if (usingFiles) {
        const selected = only ? packages.filter((choice) => choice.component === only) : packages;
        const plan = planComponentUpdateOrder(
          selected.map((choice) => ({
            component: choice.component,
            toVersion: choice.version,
            minCoreVersion: choice.minCoreVersion,
            document: choice.document,
          })),
          status.currentVersion,
        );
        const archiveDocs = only ? [] : applicableArchives;
        if (plan.order.length === 0 && archiveDocs.length === 0) {
          return;
        }
        setPhase("running");
        for (const choice of plan.order) {
          const started = await applySystemUpdate(accessToken, { source: "file", document: choice.document });
          const ok = await runJob(started);
          if (!ok) {
            return;
          }
        }
        for (const archive of archiveDocs) {
          const started = await applySystemUpdate(accessToken, {
            source: "file",
            document: archive.document,
          });
          const ok = await runJob(started);
          if (!ok) {
            return;
          }
        }
        setPhase("succeeded");
        onApplied();
        return;
      }

      const selected = only ? updates.filter((update) => update.component === only) : updates;
      const plan = planComponentUpdateOrder(selected, status.currentVersion);
      if (plan.order.length === 0) {
        return;
      }
      setPhase("downloading");
      for (const update of plan.order) {
        const started = await applySystemUpdate(accessToken, {
          source: "feed",
          component: update.component,
        });
        const ok = await runJob(started);
        if (!ok) {
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
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {status.feedConfigured && !status.isolated
              ? t("web.systemUpdate.upToDate")
              : t("web.systemUpdate.emptyFeed")}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((row) => {
              const name = componentName(t, row.component);
              const notes = safeHttpUrl(row.releaseNotesUrl);
              const alone = row.update
                ? planComponentUpdateOrder([row.update], status.currentVersion)
                : null;
              const fileAlone = planComponentUpdateOrder(
                packages
                  .filter((choice) => choice.component === row.component)
                  .map((choice) => ({
                    component: choice.component,
                    toVersion: choice.version,
                    minCoreVersion: choice.minCoreVersion,
                  })),
                status.currentVersion,
              );
              const rowBlocked = usingFiles ? fileAlone.order.length === 0 : alone ? alone.order.length === 0 : true;
              const showRowUpdate =
                status.canApply && (usingFiles ? packages.some((choice) => choice.component === row.component) : Boolean(row.update));
              return (
                <li
                  key={row.component}
                  className="rounded-lg bg-muted px-3 py-3"
                  data-testid={`system-update-row-${row.component}`}
                >
                  <p className="text-sm font-medium text-foreground">{name}</p>
                  <p className="mt-1 text-sm text-foreground">
                    {t("web.systemUpdate.currentVersion", { version: row.installedVersion })}
                  </p>
                  {row.update ? (
                    <p className="mt-1 text-sm text-foreground">
                      {t("web.systemUpdate.newVersion", { version: row.update.toVersion })}
                    </p>
                  ) : row.checkError ? (
                    <p
                      className="mt-1 text-sm text-muted-foreground"
                      data-testid={`system-update-check-error-${row.component}`}
                    >
                      {t("web.systemUpdate.checkFailed", { component: name })}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">{t("web.systemUpdate.rowUpToDate")}</p>
                  )}
                  {notes ? (
                    <a
                      className="mt-1 inline-flex text-sm text-foreground underline"
                      data-testid={`system-update-notes-${row.component}`}
                      href={notes}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("web.systemUpdate.releaseNotes")}
                    </a>
                  ) : null}
                  {row.update?.summary ? (
                    <p className="mt-1 text-sm text-muted-foreground">{row.update.summary}</p>
                  ) : null}
                  {showRowUpdate ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      data-testid={`system-update-apply-${row.component}`}
                      disabled={busy || phase === "succeeded" || rowBlocked}
                      onClick={() => {
                        void onUpdate(row.component);
                      }}
                    >
                      {t("web.systemUpdate.updateThis", { component: name })}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {notice ? (
          <p className="text-sm text-foreground" data-testid="system-update-order-notice">
            {notice.satisfiedBy
              ? t("web.systemUpdate.minCoreFirst", { min: notice.minCoreVersion })
              : t("web.systemUpdate.minCoreBlocked", { min: notice.minCoreVersion })}
          </p>
        ) : null}

        {!status.components && status.feedError ? (
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
            multiple
            accept={OFFLINE_FILE_ACCEPT}
            disabled={busy || !status.canApply}
            onChange={(event) => {
              const selected = [...(event.target.files ?? [])];
              setFileError("");
              setChoices([]);
              if (selected.length === 0) {
                return;
              }
              void Promise.all(selected.map(async (file) => classifyOfflineFile(file.name, await readFileText(file)))).then(
                (next) => {
                  setChoices(next);
                  if (next.some((choice) => choice.kind === "invalid")) {
                    setFileError(t("web.systemUpdate.error.PACKAGE_INVALID"));
                  }
                },
              );
            }}
          />
          {choices.length > 0 ? (
            <ul className="flex flex-col gap-1" data-testid="system-update-offline-list">
              {choices.map((choice) => (
                <li key={`${choice.kind}-${choice.fileName}`} className="text-xs text-muted-foreground">
                  {choice.kind === "package"
                    ? t("web.systemUpdate.offlinePackage", {
                        component: componentName(t, choice.component),
                        version: choice.version,
                      })
                    : choice.kind === "archive"
                      ? t("web.systemUpdate.offlineArchive", { name: choice.fileName })
                      : choice.fileName}
                </li>
              ))}
            </ul>
          ) : null}
          {archives.some((archive) => !applicableArchives.includes(archive)) ? (
            <p className="text-sm text-muted-foreground" data-testid="system-update-archive-pending">
              {t("web.systemUpdate.offlineArchivePending")}
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
              data-testid="system-update-apply-all"
              disabled={busy || phase === "succeeded" || !hasWork}
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

function componentRows(
  status: SystemUpdateStatus,
  updates: readonly SystemUpdateAvailable[],
): UpdateRow[] {
  const visible = updates.filter((update) => update.component !== "enterprise" || status.enterpriseInstalled);
  if (status.components && status.components.length > 0) {
    return status.components
      .filter((row) => row.component !== "enterprise" || status.enterpriseInstalled)
      .map((row) => rowFromStatus(row, visible));
  }
  return visible.map((update) => ({
    component: update.component,
    installedVersion: update.fromVersion,
    update,
    checkError: null,
    releaseNotesUrl: update.releaseNotesUrl ?? null,
    minCoreVersion: update.minCoreVersion ?? null,
  }));
}

function rowFromStatus(
  row: SystemUpdateComponentStatus,
  visible: readonly SystemUpdateAvailable[],
): UpdateRow {
  const update = visible.find((item) => item.component === row.component) ?? null;
  return {
    component: row.component,
    installedVersion: row.installedVersion,
    update,
    checkError: row.checkError,
    releaseNotesUrl: update?.releaseNotesUrl ?? row.releaseNotesUrl,
    minCoreVersion: update?.minCoreVersion ?? row.minCoreVersion,
  };
}

function componentName(t: Translate, component: SystemUpdateComponent): string {
  return t(
    component === "enterprise" ? "web.systemUpdate.componentEnterprise" : "web.systemUpdate.componentOkkey",
  );
}

function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function readFileText(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsText(file);
  });
}

function readCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "APPLY_FAILED";
}
