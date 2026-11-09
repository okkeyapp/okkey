import { useOkkeyAppShellLayout, useSidebar } from "@okkey/ui";
import { useCallback, useEffect, useState } from "react";

import { useAuthVault } from "../auth/AuthVaultContext";
import { useLocale } from "../locale/LocaleContext";
import { webDeploymentMode } from "../workspace/planEntitlements";
import { dismissSystemUpdate, fetchSystemUpdateStatus } from "./api";
import SystemUpdateModal from "./SystemUpdateModal";
import {
  readLocalDismissals,
  visibleUpdates,
  writeLocalDismissal,
  type SystemUpdateStatus,
} from "./visibility";

export default function SystemUpdateSidebarNotice() {
  const { t } = useLocale();
  const { accessToken } = useAuthVault();
  const { expanded } = useSidebar();
  const shell = useOkkeyAppShellLayout();
  const showExpanded = shell.isMobile || expanded;
  const [status, setStatus] = useState<SystemUpdateStatus | null>(null);
  const [localDismissed, setLocalDismissed] = useState(readLocalDismissals);
  const [open, setOpen] = useState(false);

  const reload = useCallback(async () => {
    if (!accessToken || webDeploymentMode() === "saas") {
      return;
    }
    try {
      const next = await fetchSystemUpdateStatus(accessToken);
      setStatus(next);
    } catch {
      setStatus(null);
    }
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken || webDeploymentMode() === "saas") {
      return;
    }
    void reload();
    const timer = window.setInterval(() => {
      void reload();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [accessToken, reload]);

  if (webDeploymentMode() === "saas" || !accessToken || !status || status.deploymentMode === "saas") {
    return null;
  }

  const updates = visibleUpdates(status.updates, status.dismissed, localDismissed);
  const notice = updates.length > 0;

  async function ignore() {
    const next = { ...localDismissed };
    for (const update of updates) {
      writeLocalDismissal(update.component, update.toVersion);
      next[update.component] = update.toVersion;
      if (status?.canApply && accessToken) {
        try {
          await dismissSystemUpdate(accessToken, update.component, update.toVersion);
        } catch {
          // The browser copy still hides this version after refresh.
        }
      }
    }
    setLocalDismissed(next);
    setOpen(false);
  }

  const versionLabel = t("web.systemUpdate.version", { version: status.currentVersion });

  return (
    <>
      <button
        type="button"
        data-testid="system-update-notice"
        data-update={notice ? "available" : "current"}
        className={
          notice
            ? "flex w-full flex-col gap-0.5 rounded-lg bg-accent/15 px-2 py-2 text-left text-sm font-medium text-foreground ring-1 ring-accent/40 hover:bg-accent/25"
            : "flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
        }
        onClick={() => setOpen(true)}
      >
        {showExpanded ? <span>{versionLabel}</span> : <span className="sr-only">{versionLabel}</span>}
        {notice ? (
          <span className={showExpanded ? "text-xs font-semibold" : "text-center text-xs font-semibold"}>
            {showExpanded ? t("web.systemUpdate.notice") : t("web.systemUpdate.noticeShort")}
          </span>
        ) : showExpanded ? null : (
          <span aria-hidden className="text-center text-xs">
            v
          </span>
        )}
      </button>
      {open ? (
        <SystemUpdateModal
          t={t}
          accessToken={accessToken}
          status={status}
          updates={updates}
          onClose={() => setOpen(false)}
          onIgnore={() => {
            void ignore();
          }}
          onApplied={() => {
            void reload();
          }}
        />
      ) : null}
    </>
  );
}
