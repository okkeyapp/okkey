import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, cn, useOkkeyAppShellLayout, useSidebar } from "@okkey/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";

import { useAuthVault } from "../auth/AuthVaultContext";
import { useLocale } from "../locale/LocaleContext";
import {
  POPUP_QUERY_PARAM,
  SYSTEM_UPDATE_POPUP_ID,
  parsePopupQueryValue,
  popupQuerySearch,
} from "../routes/popupQuery";
import { webDeploymentMode } from "../workspace/planEntitlements";
import { dismissSystemUpdate, fetchSystemUpdateStatus, markSystemUpdateSeen } from "./api";
import SystemUpdateModal from "./SystemUpdateModal";
import { SystemUpdateCurrentIcon, SystemUpdateIcon } from "./SystemUpdateIcon";
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
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<SystemUpdateStatus | null>(null);
  const [localDismissed, setLocalDismissed] = useState(readLocalDismissals);
  const [localSeen, setLocalSeen] = useState(readLocalSeen);

  const activePopup = parsePopupQueryValue(searchParams.get(POPUP_QUERY_PARAM));
  const open = activePopup?.popupId === SYSTEM_UPDATE_POPUP_ID;

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

  const openedSessionRef = useRef(false);

  useEffect(() => {
    if (!open) {
      openedSessionRef.current = false;
      return;
    }
    if (!accessToken || !status || openedSessionRef.current) {
      return;
    }
    openedSessionRef.current = true;
    for (const update of status.updates) {
      writeLocalSeen(update.component, update.toVersion);
      void markSystemUpdateSeen(accessToken, update.component, update.toVersion).catch(() => {
        // The browser copy still hides the update state after refresh.
      });
    }
    setLocalSeen(readLocalSeen());
    void reload();
  }, [open, accessToken, status, reload]);

  if (webDeploymentMode() === "saas" || !accessToken || !status || status.deploymentMode === "saas") {
    return null;
  }

  const updates = visibleUpdates(status.updates, status.dismissed, localDismissed);
  const updateAvailable = shouldShowVersionDot(status.updates, status.seen ?? {}, localSeen);
  const licenseExpired =
    status.enterpriseLicenseLapsed === true ||
    status.components?.some((row) => row.checkError === "LICENSE_EXPIRED") === true;
  const formatted = formatSidebarVersionLabel({
    version: status.currentVersion,
    commitSha: status.commitSha,
    enterpriseCommitSha: status.enterpriseCommitSha,
    releaseTag: status.releaseTag,
  });

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
    closePopup();
  }

  function openPopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, SYSTEM_UPDATE_POPUP_ID),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function closePopup() {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(location.search, null),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  return (
    <>
      <SystemUpdateVersionMenu
        label={formatted.label}
        commitSha={formatted.tooltip}
        enterpriseCommitSha={formatted.enterpriseTooltip}
        updateAvailable={updateAvailable}
        updateAvailableLabel={t("web.systemUpdate.notice")}
        licenseExpiredLabel={licenseExpired ? t("web.systemUpdate.error.LICENSE_EXPIRED") : null}
        collapsed={!showExpanded}
        onClick={openPopup}
      />
      {open ? (
        <SystemUpdateModal
          t={t}
          accessToken={accessToken}
          status={status}
          updates={updates}
          onClose={closePopup}
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
  commitSha,
  enterpriseCommitSha = null,
  updateAvailable,
  updateAvailableLabel,
  licenseExpiredLabel = null,
  collapsed,
  onClick,
}: {
  label: string;
  commitSha: string | null;
  enterpriseCommitSha?: string | null;
  updateAvailable: boolean;
  updateAvailableLabel: string;
  licenseExpiredLabel?: string | null;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          type="button"
          data-testid="system-update-version"
          data-update={updateAvailable ? "available" : "current"}
          data-commit-sha={commitSha ?? ""}
          data-enterprise-commit-sha={enterpriseCommitSha ?? ""}
          className={cn(collapsed && "relative h-9 min-h-9 justify-center px-0")}
          onClick={onClick}
        >
          {updateAvailable ? (
            <SystemUpdateIcon className="text-orange-500" data-testid="system-update-available-icon" />
          ) : (
            <SystemUpdateCurrentIcon data-testid="system-update-current-icon" />
          )}
          {collapsed ? (
            <span className="sr-only">{label}</span>
          ) : (
            <span className="min-w-0 truncate">{label}</span>
          )}
          {licenseExpiredLabel ? (
            <span
              className={cn("min-w-0 truncate text-muted-foreground", collapsed && "sr-only")}
              data-testid="system-update-sidebar-license-expired"
            >
              {licenseExpiredLabel}
            </span>
          ) : null}
          {updateAvailable ? <span className="sr-only">{updateAvailableLabel}</span> : null}
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
