import type { WebMessageValues } from "@okkey/i18n";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  KeyField,
  KeyForm,
  KeySection,
  Popup,
  buildKeyFieldFileUploadConstraints,
  getKeyFieldSurfaceRounding,
  serializeKeyFieldFileValue,
  type KeyFieldFileUploadHintLabels,
  type KeyFieldFileValue,
} from "@okkey/ui";
import { useMemo, useRef, useState } from "react";

import { applySystemUpdate, fetchSystemUpdateJob, fetchSystemUpdateStatus } from "./api";
import {
  classifyOfflineFile,
  OFFLINE_FILE_ACCEPT,
  OFFLINE_PACKAGE_EXTENSIONS,
  OFFLINE_PACKAGE_MAX_SIZE_MB,
  type OfflineArchiveChoice,
  type OfflineChoice,
  type OfflinePackageChoice,
} from "./offline-files";
import { offlineBundleDocumentFromBytes } from "./read-offline-upload";
import { planComponentUpdateOrder } from "./update-order";
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
  "UPDATE_AGENT_UNAVAILABLE",
  "ENTERPRISE_APPLY_UNAVAILABLE",
  "CORE_UPDATE_REQUIRED",
  "CORE_RESTART_TIMEOUT",
  "APPLY_FAILED",
  "PACKAGE_INVALID",
  "BUNDLE_PARTIAL",
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
  const [errorMessage, setErrorMessage] = useState("");
  const [partialComponents, setPartialComponents] = useState<NonNullable<SystemUpdateJob["components"]>>([]);
  const [restartTarget, setRestartTarget] = useState("");

  const busy = phase === "downloading" || phase === "running";
  const progress =
    phase === "downloading" ? 30 : phase === "succeeded" ? 100 : job?.progress ?? (phase === "running" ? 15 : 0);
  const rows = componentRows(status, updates);
  const packages = choices
    .map((item) => item.choice)
    .filter((choice): choice is OfflinePackageChoice => choice.kind === "package");
  const archives = choices
    .map((item) => item.choice)
    .filter((choice): choice is OfflineArchiveChoice => choice.kind === "archive");
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
      const code = finished.errorCode || "APPLY_FAILED";
      setErrorCode(code);
      setErrorMessage(finished.errorMessage?.trim() ?? "");
      setPartialComponents(code === "BUNDLE_PARTIAL" ? (finished.components ?? []) : []);
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

  async function onUpdate(only?: SystemUpdateComponent) {
    if (!status.canApply || busy) {
      return;
    }
    setErrorCode("");
    setErrorMessage("");
    setPartialComponents([]);
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

  const fileUploadConstraints = useMemo(
    () => buildKeyFieldFileUploadConstraints(OFFLINE_PACKAGE_EXTENSIONS, OFFLINE_PACKAGE_MAX_SIZE_MB),
    [],
  );
  const fileUploadHintLabels = useMemo<KeyFieldFileUploadHintLabels>(
    () => ({
      maxPrefix: t("web.keyForm.file.uploadHintMaxPrefix"),
      maxSizeOnlyPrefix: t("web.keyForm.file.uploadHintMaxSizeOnlyPrefix"),
    }),
    [t],
  );
  const fieldRounding = useMemo(
    () =>
      getKeyFieldSurfaceRounding({
        mode: "edit",
        sectionVariant: "primary",
        fieldIndex: 0,
        fieldsCount: 1,
        canAddField: false,
      }),
    [],
  );

  const fileContentError = choices.some((item) => item.choice.kind === "invalid")
    ? t("web.systemUpdate.error.PACKAGE_INVALID")
    : "";

  async function onOfflineFile(file: File): Promise<KeyFieldFileValue> {
    fileIdRef.current += 1;
    const id = `offline-${fileIdRef.current}`;
    const choice = await choiceForOfflineFile(file);
    setChoices((current) => [...current, { id, file, choice }]);
    return {
      attachmentId: id,
      name: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    };
  }

  function clearOfflineFile(id: string) {
    setChoices((current) => current.filter((item) => item.id !== id));
  }

  const errorText = errorCode
    ? errorMessage ||
      t(ERROR_KEYS.has(errorCode) ? `web.systemUpdate.error.${errorCode}` : "web.systemUpdate.error.generic", {
        version: restartTarget,
      })
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
          <p className="text-sm text-muted-foreground">{t("web.systemUpdate.fileHint")}</p>
          <KeyForm mode="edit" className="gap-0">
            <KeySection variant="primary" mode="edit">
              <KeyField
                className="border-b-transparent"
                label={t("web.systemUpdate.fileLabel")}
                mode="edit"
                editableValue
                fileValue
                value=""
                fileUploadMultiple
                fileAccept={OFFLINE_FILE_ACCEPT}
                fileInputId="system-update-file"
                fileUploadDisabled={busy || !status.canApply}
                onFileUpload={(file) => onOfflineFile(file)}
                fileUploadConstraints={fileUploadConstraints}
                fileUploadHintLabels={fileUploadHintLabels}
                fileUploadLabel={t("web.tools.import.uploadFile")}
                fileClearLabel={t("web.tools.import.fileClearLabel")}
                surfaceRounding={fieldRounding}
              />
              {choices.map((item, index) => (
                <KeyField
                  key={item.id}
                  className="border-b-transparent"
                  label={t("web.systemUpdate.fileSelected")}
                  mode="edit"
                  editableValue
                  fileValue
                  value={serializeKeyFieldFileValue({
                    attachmentId: item.id,
                    name: item.file.name,
                    mimeType: item.file.type || "application/octet-stream",
                    sizeBytes: item.file.size,
                  })}
                  onValueChange={(value) => {
                    if (!value) {
                      clearOfflineFile(item.id);
                    }
                  }}
                  fileClearEnabled={!busy}
                  fileClearLabel={t("web.tools.import.fileClearLabel")}
                  surfaceRounding={getKeyFieldSurfaceRounding({
                    mode: "edit",
                    sectionVariant: "primary",
                    fieldIndex: index + 1,
                    fieldsCount: choices.length + 1,
                    canAddField: false,
                  })}
                />
              ))}
            </KeySection>
          </KeyForm>
          {choices.length > 0 ? (
            <ul className="flex flex-col gap-1" data-testid="system-update-offline-list">
              {choices.map((item) => (
                <li key={item.id} className="text-xs text-muted-foreground">
                  {item.choice.kind === "package"
                    ? t("web.systemUpdate.offlinePackage", {
                        component: componentName(t, item.choice.component),
                        version: item.choice.version,
                      })
                    : item.choice.kind === "archive"
                      ? t("web.systemUpdate.offlineArchive", { name: item.choice.fileName })
                      : item.choice.fileName}
                </li>
              ))}
            </ul>
          ) : null}
          {archives.some((archive) => !applicableArchives.includes(archive)) ? (
            <p className="text-sm text-muted-foreground" data-testid="system-update-archive-pending">
              {t("web.systemUpdate.offlineArchivePending")}
            </p>
          ) : null}
          {fileContentError ? <p className="text-sm text-destructive">{fileContentError}</p> : null}
        </div>

        {phase !== "idle" ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-accent" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-foreground">
              {phase === "failed"
                ? errorCode === "BUNDLE_PARTIAL"
                  ? t("web.systemUpdate.progressBundlePartial")
                  : t("web.systemUpdate.progressFailed")
                : restartTarget
                  ? t("web.systemUpdate.progressRestarting", { version: restartTarget })
                  : phase === "downloading"
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
            <AlertDescription>
              <span>{errorText}</span>
              {partialComponents.length > 0 ? (
                <ul className="mt-2 flex flex-col gap-1" data-testid="system-update-partial-components">
                  {partialComponents.map((item) => (
                    <li key={item.component}>
                      {item.applied
                        ? t("web.systemUpdate.partialApplied", {
                            component: componentName(t, item.component),
                            version: item.version,
                          })
                        : t("web.systemUpdate.partialRolledBack", {
                            component: componentName(t, item.component),
                            version: item.version,
                          })}
                    </li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
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

async function choiceForOfflineFile(file: File): Promise<OfflineChoice> {
  const text = await readFileText(file);
  const choice = classifyOfflineFile(file.name, text);
  if (choice.kind !== "archive" || choice.document) {
    return choice;
  }
  const bytes = new Uint8Array(await readFileBytes(file));
  return {
    kind: "archive",
    fileName: file.name,
    document: offlineBundleDocumentFromBytes(bytes),
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

function readFileBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") {
    return file.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result instanceof ArrayBuffer ? reader.result : new ArrayBuffer(0));
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsArrayBuffer(file);
  });
}

function readCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return "APPLY_FAILED";
}
