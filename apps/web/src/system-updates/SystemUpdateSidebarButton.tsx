import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  useOkkeyAppShellLayout,
  useSidebar,
} from "@okkey/ui";
import { useCallback, useEffect, useState } from "react";

import { useAuthVault } from "../auth/AuthVaultContext";
import { useLocale } from "../locale/LocaleContext";
import { webDeploymentMode } from "../workspace/planEntitlements";
import { dismissSystemUpdate, fetchSystemUpdateStatus, markSystemUpdateSeen } from "./api";
import SystemUpdateModal from "./SystemUpdateModal";
import { SystemUpdateIcon } from "./SystemUpdateIcon";
import { formatSidebarVersionLabel } from "./version-label";
import {
  readLocalDismissals,
  readLocalSeen,
  shouldShowVersionDot,
  visibleUpdates,
  writeLocalDismissal,
  writeLocalSeen,
  type SystemUpdateStatus,
} from "./visibility";

export default function SystemUpdateSidebarButton() {
  const { t } = useLocale();
  const { accessToken } = useAuthVault();
  const { expanded } = useSidebar();
  const shell = useOkkeyAppShellLayout();
  const showExpanded = shell.isMobile || expanded;
  const [status, setStatus] = useState<SystemUpdateStatus | null>(null);
  const [localDismissed, setLocalDismissed] = useState(readLocalDismissals);
  const [localSeen, setLocalSeen] = useState(readLocalSeen);
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
  }, [accessToken, reload]);

  if (webDeploymentMode() === "saas" || !accessToken || !status || status.deploymentMode === "saas") {
    return null;
  }

  const updates = visibleUpdates(status.updates, status.dismissed, localDismissed);
  const updateAvailable = shouldShowVersionDot(status.updates, status.seen ?? {}, localSeen);
  const formatted = formatSidebarVersionLabel({
    version: status.currentVersion,
    commitSha: status.commitSha,
    releaseTag: status.releaseTag,
  });
  const hoverText = formatted.tooltip
    ? showExpanded
      ? formatted.tooltip
      : `${formatted.label} · ${formatted.tooltip}`
    : showExpanded
      ? null
      : formatted.label;

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

  function rememberSeen() {
    for (const update of status?.updates ?? []) {
      writeLocalSeen(update.component, update.toVersion);
      if (accessToken) {
        void markSystemUpdateSeen(accessToken, update.component, update.toVersion).catch(() => {
          // The browser copy still hides the dot after refresh.
        });
      }
    }
    setLocalSeen(readLocalSeen());
  }

  function openPopup() {
    setOpen(true);
    rememberSeen();
    void reload();
  }

  return (
    <>
      <SystemUpdateVersionMenu
        label={formatted.label}
        hoverText={hoverText}
        commitSha={formatted.tooltip}
        updateAvailable={updateAvailable}
        updateAvailableLabel={t("web.systemUpdate.notice")}
        collapsed={!showExpanded}
        onClick={openPopup}
      />
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

export function SystemUpdateVersionMenu({
  label,
  hoverText,
  commitSha,
  updateAvailable,
  updateAvailableLabel,
  collapsed,
  onClick,
}: {
  label: string;
  hoverText: string | null;
  commitSha: string | null;
  updateAvailable: boolean;
  updateAvailableLabel: string;
  collapsed: boolean;
  onClick: () => void;
}) {
  const button = (
    <SidebarMenuButton
      type="button"
      data-testid="system-update-version"
      data-update={updateAvailable ? "available" : "current"}
      data-commit-sha={commitSha ?? ""}
      title={hoverText ?? undefined}
      className={cn(collapsed && "relative h-9 min-h-9 justify-center px-0")}
      onClick={onClick}
    >
      <SystemUpdateIcon />
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="min-w-0 truncate">{label}</span>
      )}
      {updateAvailable ? (
        <span
          data-testid="system-update-dot"
          className={cn(
            "size-2 shrink-0 rounded-full bg-yellow-400",
            collapsed ? "absolute end-1 top-1" : "ms-auto",
          )}
        >
          <span className="sr-only">{updateAvailableLabel}</span>
        </span>
      ) : null}
    </SidebarMenuButton>
  );

  return (
    <TooltipProvider delayDuration={0} skipDelayDuration={0}>
      <SidebarMenu>
        <SidebarMenuItem>
          {hoverText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex w-full min-w-0">{button}</span>
              </TooltipTrigger>
              <TooltipContent side="right" align="center">
                {hoverText}
              </TooltipContent>
            </Tooltip>
          ) : (
            button
          )}
        </SidebarMenuItem>
      </SidebarMenu>
    </TooltipProvider>
  );
}
