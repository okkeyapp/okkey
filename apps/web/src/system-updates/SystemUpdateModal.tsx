import type { WebMessageValues } from "@okkey/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Popup,
} from "@okkey/ui";
import { useRef, useState, type SVGProps } from "react";

import { applySystemUpdate, fetchSystemUpdateJob, fetchSystemUpdateStatus } from "./api";
import {
  classifyOfflineFile,
  isCombinedArchiveName,
  OFFLINE_FILE_ACCEPT,
  offlineFileExceedsSizeLimit,
  type OfflineArchiveChoice,
  type OfflineChoice,
  type OfflinePackageChoice,
} from "./offline-files";
import { readOfflineUpload } from "./read-offline-upload";
import { planComponentUpdateOrder } from "./update-order";
import { formatVersionWithCommitShas } from "./version-label";
import { waitForRunningCore, type CoreRestartPoll } from "./wait-for-core";
import type {
  SystemUpdateAvailable,
  SystemUpdateComponent,
  SystemUpdateComponentStatus,
  SystemUpdateJob,
  SystemUpdateStatus,
} from "./visibility";

type Translate = (key: string, values?: WebMessageValues) => string;

type Phase = "idle" | "downloading" | "running" | "succeeded" | "failed";

type StoredOfflineFile = {
  id: string;
  file: File;
  choice: OfflineChoice;
};

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
  "FEED_UNAUTHORIZED",
  "FEED_REDIRECT_FORBIDDEN",
  "FEED_TOO_MANY_REDIRECTS",
  "PACKAGE_REDIRECT_FORBIDDEN",
  "PACKAGE_TOO_MANY_REDIRECTS",
  "PACKAGE_DOWNLOAD_FAILED",
  "UPDATE_AGENT_UNAVAILABLE",
  "ENTERPRISE_APPLY_UNAVAILABLE",
  "CORE_UPDATE_REQUIRED",
  "CORE_RESTART_TIMEOUT",
  "APPLY_FAILED",
  "BUNDLE_PARTIAL",
  "PACKAGE_INVALID",
  "PACKAGE_TOO_LARGE",
]);

/** Status-row check errors that have a dedicated translation. */
const CHECK_ERROR_KEYS = new Set([
  "FEED_FETCH_FAILED",
  "FEED_INVALID",
  "FEED_UNAUTHORIZED",
  "FEED_REDIRECT_FORBIDDEN",
  "FEED_TOO_MANY_REDIRECTS",
  "LICENSE_EXPIRED",
]);

export default function SystemUpdateModal({
  t,
  accessToken,
  status,
  updates,
  onClose,
  onIgnore,
  onApplied,
  coreRestart,
}: {
  t: Translate;
  accessToken: string;
  status: SystemUpdateStatus;
  updates: readonly SystemUpdateAvailable[];
  onClose: () => void;
  onIgnore: () => void;
  onApplied: () => void;
  /** Tests shorten the restart poll. Production uses the defaults. */
  coreRestart?: CoreRestartPoll;
}) {
  const [choices, setChoices] = useState<StoredOfflineFile[]>([]);
  const fileIdRef = useRef(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [job, setJob] = useState<SystemUpdateJob | null>(null);
  const [errorCode, setErrorCode] = useState("");
  const [offlineError, setOfflineError] = useState("");
  const [restartTarget, setRestartTarget] = useState("");
  const [applySource, setApplySource] = useState<"feed" | "file" | null>(null);

  const busy = phase === "downloading" || phase === "running";
  const progress =
    phase === "downloading" ? 30 : phase === "succeeded" ? 100 : job?.progress ?? (phase === "running" ? 15 : 0);
  const rows = componentRows(status, updates);
  const feedPlan = planComponentUpdateOrder(updates, status.currentVersion);
  const notice = feedPlan.notice;
  const feedHasWork = feedPlan.order.length > 0;

  async function track(jobId: string, component: SystemUpdateComponent): Promise<SystemUpdateJob> {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      try {
        const next = await fetchSystemUpdateJob(accessToken, jobId);
        setJob(next);
        if (next.status === "succeeded" || next.status === "failed") {
          return next;
        }
        setPhase("running");
      } catch (error) {
        // Core apply restarts the API before this poll can read the terminal job.
        // A dropped connection is not an apply failure; keep the job id and read it again.
        if (!isTransientJobPollError(error)) {
          throw error;
        }
      }
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

  async function coreIsRunning(targetVersion: string): Promise<boolean> {
    setRestartTarget(targetVersion);
    setPhase("running");
    const result = await waitForRunningCore(
      targetVersion,
      async () => {
        const next = await fetchSystemUpdateStatus(accessToken);
        return next.currentVersion;
      },
      coreRestart,
    );
    if (result === "ready") {
      setRestartTarget("");
      return true;
    }
    setPhase("failed");
    setErrorCode("CORE_RESTART_TIMEOUT");
    onApplied();
    return false;
  }

  async function onFeedUpdate(only?: SystemUpdateComponent) {
    if (!status.canApply || busy) {
      return;
    }
    setErrorCode("");
    setOfflineError("");
    setApplySource("feed");
    setJob(null);
    try {
      const selected = only ? updates.filter((update) => update.component === only) : updates;
      const plan = planComponentUpdateOrder(selected, status.currentVersion);
      if (plan.order.length === 0) {
        return;
      }
      setPhase("downloading");
      const coreUpdate = plan.order.find((update) => update.component === "okkey");
      for (const update of plan.order) {
        if (update.component === "enterprise" && coreUpdate) {
          const ready = await coreIsRunning(coreUpdate.toVersion);
          if (!ready) {
            return;
          }
        }
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

  async function applyOfflineItems(items: readonly StoredOfflineFile[]): Promise<void> {
    if (!status.canApply || busy) {
      return;
    }
    const packages = items
      .map((item) => item.choice)
      .filter((choice): choice is OfflinePackageChoice => choice.kind === "package");
    const archives = items
      .map((item) => item.choice)
      .filter((choice): choice is OfflineArchiveChoice => choice.kind === "archive");
    const applicableArchives =
      status.offlineArchiveSupported === true
        ? archives.filter((archive) => archive.document && typeof archive.document === "object")
        : [];
    const plan = planComponentUpdateOrder(
      packages.map((choice) => ({
        component: choice.component,
        toVersion: choice.version,
        minCoreVersion: choice.minCoreVersion,
        document: choice.document,
      })),
      status.currentVersion,
    );
    if (plan.order.length === 0 && applicableArchives.length === 0) {
      setOfflineError(t("web.systemUpdate.error.OFFLINE_NOTHING_TO_APPLY"));
      return;
    }
    setErrorCode("");
    setOfflineError("");
    setApplySource("file");
    setJob(null);
    try {
      setPhase("running");
      const coreFile = plan.order.find((choice) => choice.component === "okkey");
      for (const choice of plan.order) {
        if (choice.component === "enterprise" && coreFile) {
          const ready = await coreIsRunning(coreFile.toVersion);
          if (!ready) {
            return;
          }
        }
        const started = await applySystemUpdate(accessToken, { source: "file", document: choice.document });
        const ok = await runJob(started);
        if (!ok) {
          return;
        }
      }
      for (const archive of applicableArchives) {
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
    } catch (error) {
      setPhase("failed");
      setErrorCode(readCode(error));
    }
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pendingArchives = choices
    .map((item) => item.choice)
    .filter((choice): choice is OfflineArchiveChoice => choice.kind === "archive")
    .filter((archive) => {
      if (status.offlineArchiveSupported !== true) {
        return true;
      }
      return !(archive.document && typeof archive.document === "object");
    });

  function clearOfflineFile(id: string) {
    setChoices((current) => current.filter((item) => item.id !== id));
    setOfflineError("");
  }

  async function onOfflineFilesSelected(files: readonly File[]): Promise<void> {
    setOfflineError("");
    setErrorCode("");
    if (files.length === 0) {
      return;
    }
    if (busy) {
      return;
    }
    if (!status.canApply) {
      setOfflineError(t("web.systemUpdate.ownersOnly"));
      return;
    }
    const next: StoredOfflineFile[] = [];
    let skippedOversized = false;
    try {
      for (const file of files) {
        if (offlineFileExceedsSizeLimit(file)) {
          skippedOversized = true;
          continue;
        }
        fileIdRef.current += 1;
        const id = `offline-${fileIdRef.current}`;
        const choice = await choiceForOfflineFile(file);
        next.push({ id, file, choice });
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      setOfflineError(
        t(
          code === "PACKAGE_TOO_LARGE"
            ? "web.systemUpdate.error.PACKAGE_TOO_LARGE"
            : "web.systemUpdate.error.PACKAGE_INVALID",
        ),
      );
      return;
    }
    if (next.length === 0) {
      setOfflineError(
        skippedOversized
          ? t("web.systemUpdate.error.PACKAGE_TOO_LARGE")
          : t("web.systemUpdate.error.PACKAGE_INVALID"),
      );
      return;
    }
    setChoices((current) => [...current, ...next]);
    if (next.some((item) => item.choice.kind === "invalid")) {
      setOfflineError(t("web.systemUpdate.error.PACKAGE_INVALID"));
      return;
    }
    const hasPendingArchive = next.some((item) => {
      if (item.choice.kind !== "archive") {
        return false;
      }
      if (status.offlineArchiveSupported !== true) {
        return true;
      }
      return !(item.choice.document && typeof item.choice.document === "object");
    });
    if (hasPendingArchive) {
      return;
    }
    await applyOfflineItems(next);
  }

  function renderProgress() {
    if (phase === "idle") {
      return null;
    }
    return (
      <div className="flex flex-col gap-2" aria-live="polite">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-foreground">
          {phase === "failed"
            ? errorCode === "BUNDLE_PARTIAL"
              ? t("web.systemUpdate.progressBundlePartial", { core: partialCoreVersion(job) })
              : t("web.systemUpdate.progressFailed")
            : restartTarget
              ? t("web.systemUpdate.progressRestarting", { version: restartTarget })
              : phase === "downloading"
                ? t("web.systemUpdate.progressDownloading")
                : phase === "succeeded"
                  ? successText(t, job, updates)
                  : job?.status === "applying"
                    ? t("web.systemUpdate.progressApplying")
                    : t("web.systemUpdate.progressVerifying")}
        </p>
      </div>
    );
  }

  const errorText = errorCode
    ? t(ERROR_KEYS.has(errorCode) ? `web.systemUpdate.error.${errorCode}` : "web.systemUpdate.error.generic", {
        version: restartTarget,
      })
    : "";

  function renderFailure() {
    const partial = errorCode === "BUNDLE_PARTIAL";
    const message = applySource === "feed" ? errorText : offlineError || errorText;
    if (!message) {
      return null;
    }
    if (partial && errorText) {
      return (
        <Alert variant="warning" data-testid="system-update-partial">
          <AlertTitle>{t("web.systemUpdate.progressBundlePartial", { core: partialCoreVersion(job) })}</AlertTitle>
          <AlertDescription>
            <p>{errorText}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              data-testid="system-update-retry-enterprise"
              disabled={busy}
              onClick={() => {
                void onFeedUpdate("enterprise");
              }}
            >
              {t("web.systemUpdate.retryEnterprise")}
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <Alert variant="error" data-testid={applySource === "feed" ? undefined : "system-update-offline-error"}>
        <AlertTitle>{t("web.systemUpdate.progressFailed")}</AlertTitle>
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Popup
      width={480}
      header={t("web.systemUpdate.modalTitle")}
      description={t("web.systemUpdate.modalDescription")}
      closeLabel={t("web.systemUpdate.close")}
      closeDisabled={busy}
      onClose={onClose}
      contentClassName="pb-6"
    >
      <div className="flex flex-col">
        <div className="flex flex-col gap-4">
          <h3 className="text-base font-semibold text-foreground">{t("web.systemUpdate.onlineLabel")}</h3>
          {status.isolated ? (
            <div
              className="rounded-lg bg-muted px-3 py-3"
              data-testid="system-update-online-disabled"
            >
              <p className="text-sm text-foreground">{t("web.systemUpdate.onlineDisabled")}</p>
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {status.feedConfigured
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
                const rowBlocked = alone ? alone.order.length === 0 : true;
                const showRowUpdate = status.canApply && Boolean(row.update);
                return (
                  <li
                    key={row.component}
                    className="rounded-lg bg-muted px-3 py-3"
                    data-testid={`system-update-row-${row.component}`}
                  >
                    <p className="text-sm font-medium text-foreground">{name}</p>
                    <p className="mt-1 text-sm text-foreground">
                      {t("web.systemUpdate.currentVersion", {
                        version: formatInstalledVersion(
                          row.installedVersion,
                          row.component,
                          status.commitSha,
                          status.enterpriseInstalled ? (status.enterpriseCommitSha ?? null) : null,
                        ),
                      })}
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
                        {CHECK_ERROR_KEYS.has(row.checkError)
                          ? t(`web.systemUpdate.error.${row.checkError}`)
                          : t("web.systemUpdate.checkFailed", { component: name })}
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
                          void onFeedUpdate(row.component);
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
            <p className="text-sm text-muted-foreground">
              {t(
                ERROR_KEYS.has(status.feedError) || CHECK_ERROR_KEYS.has(status.feedError)
                  ? `web.systemUpdate.error.${status.feedError}`
                  : "web.systemUpdate.error.FEED_FETCH_FAILED",
              )}
            </p>
          ) : null}

          {applySource !== "file" ? renderProgress() : null}

          {applySource === "feed" ? renderFailure() : null}

          {!status.canApply ? (
            <p className="text-sm text-muted-foreground">{t("web.systemUpdate.ownersOnly")}</p>
          ) : null}

          {feedHasWork ? (
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={onIgnore}>
                {t("web.systemUpdate.ignore")}
              </Button>
              {status.canApply ? (
                <Button
                  type="button"
                  data-testid="system-update-apply-all"
                  disabled={busy || phase === "succeeded"}
                  onClick={() => {
                    void onFeedUpdate();
                  }}
                >
                  {t("web.systemUpdate.update")}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div
          className="-mx-6 my-6 border-t border-border max-md:-mx-4"
          data-testid="system-update-section-divider"
          role="separator"
        />

        <div className="flex flex-col gap-2">
          <h3 className="text-base font-semibold text-foreground">{t("web.systemUpdate.fileLabel")}</h3>
          <p className="text-sm text-muted-foreground">{t("web.systemUpdate.fileHint")}</p>
          <input
            ref={fileInputRef}
            id="system-update-file"
            type="file"
            accept={OFFLINE_FILE_ACCEPT}
            multiple
            className="hidden"
            disabled={busy || !status.canApply}
            onChange={(event) => {
              // FileList is live — copy before clearing value, or the selection becomes empty.
              const files = event.target.files ? Array.from(event.target.files) : [];
              event.target.value = "";
              void onOfflineFilesSelected(files);
            }}
          />
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              className="h-9 gap-1.5 px-3"
              disabled={busy || !status.canApply}
              onClick={() => fileInputRef.current?.click()}
            >
              <UploadIcon />
              {t("web.systemUpdate.uploadOfflinePackage")}
            </Button>
          </div>
          {choices.length > 0 ? (
            <ul className="flex flex-col gap-1" data-testid="system-update-offline-list">
              {choices.map((item) => (
                <li key={item.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 flex-1 truncate">
                    {item.choice.kind === "package"
                      ? t("web.systemUpdate.offlinePackage", {
                          component: componentName(t, item.choice.component),
                          version: item.choice.version,
                        })
                      : item.choice.kind === "archive"
                        ? t("web.systemUpdate.offlineArchive", { name: item.choice.fileName })
                        : item.choice.fileName}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 shrink-0 px-2 text-xs"
                    disabled={busy}
                    onClick={() => clearOfflineFile(item.id)}
                  >
                    {t("web.tools.import.fileClearLabel")}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {pendingArchives.length > 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="system-update-archive-pending">
              {t("web.systemUpdate.offlineArchivePending")}
            </p>
          ) : null}
          {applySource === "file" ? renderProgress() : null}
          {applySource === "file" || offlineError ? renderFailure() : null}
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

function partialCoreVersion(job: SystemUpdateJob | null): string {
  return job?.result?.coreVersion || job?.components?.find((item) => item.component === "okkey")?.version || job?.toVersion || "";
}

function successText(
  t: Translate,
  job: SystemUpdateJob | null,
  updates: readonly SystemUpdateAvailable[],
): string {
  const parts = job?.components ?? [];
  const bundle = job?.result?.scope === "bundle" || (parts.length > 1 && parts.every((item) => item.applied));
  if (bundle) {
    return t("web.systemUpdate.progressBundleSucceeded", {
      core: job?.result?.coreVersion || parts.find((item) => item.component === "okkey")?.version || "",
      enterprise:
        job?.result?.enterpriseVersion || parts.find((item) => item.component === "enterprise")?.version || "",
    });
  }
  if (job?.result?.scope === "enterprise" || job?.component === "enterprise") {
    return t("web.systemUpdate.progressEnterpriseSucceeded", {
      version: job.result?.enterpriseVersion || job.toVersion || "",
    });
  }
  return t("web.systemUpdate.progressSucceeded", {
    version: job?.result?.coreVersion || job?.toVersion || updates[0]?.toVersion || "",
  });
}

function componentName(t: Translate, component: SystemUpdateComponent): string {
  return t(
    component === "enterprise" ? "web.systemUpdate.componentEnterprise" : "web.systemUpdate.componentOkkey",
  );
}

/**
 * Append short commit SHA(s) for the System update window.
 * Okkey row: core only, or labeled core + enterprise when both are known.
 * Enterprise row: enterprise SHA only (unlabeled parentheses, same as before).
 */
function formatInstalledVersion(
  version: string,
  component: SystemUpdateComponent,
  commitSha: string | null | undefined,
  enterpriseCommitSha: string | null | undefined,
): string {
  if (component === "enterprise") {
    return formatVersionWithCommitShas({
      version,
      commitSha: enterpriseCommitSha,
      shortShaLen: 7,
    });
  }
  return formatVersionWithCommitShas({
    version,
    commitSha,
    enterpriseCommitSha,
    shortShaLen: 7,
  });
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

function UploadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="size-4 shrink-0"
      aria-hidden
      {...props}
    >
      <path
        d="M14 10V12.6667C14 13.0203 13.8595 13.3594 13.6095 13.6095C13.3594 13.8595 13.0203 14 12.6667 14H3.33333C2.97971 14 2.64057 13.8595 2.39052 13.6095C2.14048 13.3594 2 13.0203 2 12.6667V10M4.66667 5.33333L8 2L11.3333 5.33333M8 2V10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** JSON archives stay as parsed documents. A binary zip is wrapped for the update agent. */
async function choiceForOfflineFile(file: File): Promise<OfflineChoice> {
  if (!isCombinedArchiveName(file.name)) {
    return classifyOfflineFile(file.name, await readFileText(file));
  }
  const document = await readOfflineUpload(file);
  return {
    kind: "archive",
    fileName: file.name,
    document: document && typeof document === "object" ? document : null,
  };
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

/** Network loss and gateway errors while the API process is coming back. */
export function isTransientJobPollError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return true;
  }
  const record = error as { code?: unknown; status?: unknown };
  if (record.code === "UPDATE_AGENT_UNAVAILABLE") {
    return true;
  }
  const status = typeof record.status === "number" ? record.status : 0;
  if (status === 0) {
    return true;
  }
  return status === 502 || status === 503 || status === 504;
}

function readCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "APPLY_FAILED";
}
