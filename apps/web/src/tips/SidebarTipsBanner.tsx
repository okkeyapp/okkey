import { AuthClient } from "@okkey/auth";
import { cn, useOkkeyAppShellLayout, useSidebar } from "@okkey/ui";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuthVault, useAuthenticatedCoreClient } from "../auth/AuthVaultContext";
import { readVaultDevicePrefs } from "../auth/vaultDevicePrefs";
import { useLocale } from "../locale/LocaleContext";
import {
  SETTINGS_POPUP_ID,
  buildPopupQueryValue,
  popupQuerySearch,
} from "../routes/popupQuery";
import { settingsPath } from "../routes/paths";
import { webDeploymentMode } from "../workspace/planEntitlements";
import { readTipsBannerDismissed, writeTipsBannerDismissed } from "./dismissStorage";
import {
  mayFetchServerMailForTips,
  visibleSidebarTips,
  type SidebarTipId,
} from "./visibility";

/** Same 24×24 control size + hover tint as sidebar section/settings buttons. */
const tipsControlButtonClassName =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-none ring-sidebar-ring transition hover:bg-[rgba(0,0,0,0.05)] hover:text-foreground focus-visible:ring-2 dark:hover:bg-[rgba(255,255,255,0.08)]";

function TipsLabelIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        d="M2 8H2.66667M8 2V2.66667M13.3333 8H14M3.73333 3.73333L4.2 4.2M12.2667 3.73333L11.8 4.2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5.99996 10.6665C5.44027 10.2467 5.02685 9.66151 4.81825 8.99373C4.60965 8.32594 4.61645 7.60945 4.83768 6.94574C5.05892 6.28204 5.48337 5.70476 6.05092 5.2957C6.61848 4.88663 7.30035 4.6665 7.99996 4.6665C8.69957 4.6665 9.38144 4.88663 9.94899 5.2957C10.5165 5.70476 10.941 6.28204 11.1622 6.94574C11.3835 7.60945 11.3903 8.32594 11.1817 8.99373C10.9731 9.66151 10.5596 10.2467 9.99996 10.6665C9.73967 10.9242 9.54369 11.2395 9.42787 11.5869C9.31206 11.9344 9.27966 12.3042 9.33329 12.6665C9.33329 13.0201 9.19282 13.3593 8.94277 13.6093C8.69272 13.8594 8.35358 13.9998 7.99996 13.9998C7.64634 13.9998 7.3072 13.8594 7.05715 13.6093C6.8071 13.3593 6.66663 13.0201 6.66663 12.6665C6.72026 12.3042 6.68786 11.9344 6.57204 11.5869C6.45623 11.2395 6.26025 10.9242 5.99996 10.6665Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M6.46667 11.3335H9.53334"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type SidebarTipsBannerProps = {
  workspaceId: string;
  isWorkspaceOwner: boolean;
};

type TipAction =
  | { kind: "settingsPopup"; menuItemId: "deviceUnlock" | "twoFactor" | "deviceSecurity" }
  | { kind: "settingsPath"; section: "mail" };

const TIP_ACTIONS: Record<SidebarTipId, TipAction> = {
  setupPin: { kind: "settingsPopup", menuItemId: "deviceUnlock" },
  enableTwoFactor: { kind: "settingsPopup", menuItemId: "twoFactor" },
  lockOnDeviceLock: { kind: "settingsPopup", menuItemId: "deviceSecurity" },
  serverEmail: { kind: "settingsPath", section: "mail" },
};

const TIP_TITLE_KEYS: Record<SidebarTipId, string> = {
  setupPin: "web.tips.setupPin.title",
  enableTwoFactor: "web.tips.enableTwoFactor.title",
  lockOnDeviceLock: "web.tips.lockOnDeviceLock.title",
  serverEmail: "web.tips.serverEmail.title",
};

const TIP_BODY_KEYS: Record<SidebarTipId, string> = {
  setupPin: "web.tips.setupPin.body",
  enableTwoFactor: "web.tips.enableTwoFactor.body",
  lockOnDeviceLock: "web.tips.lockOnDeviceLock.body",
  serverEmail: "web.tips.serverEmail.body",
};

/**
 * Compact Get-started-style tips slider above the version / Documentation footer links.
 * Completed tips drop out from real state; dismiss persists per user in localStorage.
 */
export default function SidebarTipsBanner({ workspaceId, isWorkspaceOwner }: SidebarTipsBannerProps) {
  const { t } = useLocale();
  const { userId } = useAuthVault();
  const core = useAuthenticatedCoreClient();
  const { expanded } = useSidebar();
  const shell = useOkkeyAppShellLayout();
  const showExpanded = shell.isMobile || expanded;
  const location = useLocation();
  const navigate = useNavigate();

  const deploymentMode = webDeploymentMode();
  const [dismissed, setDismissed] = useState(() => readTipsBannerDismissed(userId));
  const [pinEnabled, setPinEnabled] = useState(false);
  const [lockOnDeviceSleep, setLockOnDeviceSleep] = useState(false);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorReady, setTwoFactorReady] = useState(false);
  const [smtpActive, setSmtpActive] = useState<boolean | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const refreshDevicePrefs = useCallback(() => {
    const prefs = readVaultDevicePrefs(userId ?? null);
    setPinEnabled(prefs.pinEnabled);
    setLockOnDeviceSleep(prefs.lockOnDeviceSleep);
  }, [userId]);

  useEffect(() => {
    setDismissed(readTipsBannerDismissed(userId));
    refreshDevicePrefs();
  }, [userId, refreshDevicePrefs]);

  useEffect(() => {
    if (!userId) {
      return;
    }
    const onPrefs = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== userId) {
        return;
      }
      refreshDevicePrefs();
    };
    window.addEventListener("okkey:vault-device-prefs", onPrefs);
    return () => window.removeEventListener("okkey:vault-device-prefs", onPrefs);
  }, [userId, refreshDevicePrefs]);

  useEffect(() => {
    let cancelled = false;
    if (!core) {
      setTwoFactorReady(false);
      return;
    }
    const auth = new AuthClient(core.getHttpClient());
    void auth
      .getTwoFactorStatus()
      .then((status) => {
        if (!cancelled) {
          setTwoFactorEnabled(status.enabled === true);
          setTwoFactorReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Fail closed for 2FA tip until status is known (avoid nagging on transient errors).
          setTwoFactorEnabled(true);
          setTwoFactorReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [core]);

  useEffect(() => {
    let cancelled = false;
    const canFetch = mayFetchServerMailForTips({ deploymentMode, isWorkspaceOwner });
    if (!canFetch || !core || !workspaceId) {
      setSmtpActive(null);
      return;
    }
    void core
      .getServerMailSettings(workspaceId)
      .then((settings) => {
        if (!cancelled) {
          setSmtpActive(settings.smtp_active === true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          // Owner-gated fetch failed — do not show server-email tip from a failed status.
          setSmtpActive(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [core, workspaceId, deploymentMode, isWorkspaceOwner]);

  const tips = useMemo(() => {
    if (!userId || !twoFactorReady) {
      return [];
    }
    return visibleSidebarTips({
      dismissed,
      pinEnabled,
      twoFactorEnabled,
      lockOnDeviceSleep,
      deploymentMode,
      isWorkspaceOwner,
      smtpActive,
    });
  }, [
    userId,
    twoFactorReady,
    dismissed,
    pinEnabled,
    twoFactorEnabled,
    lockOnDeviceSleep,
    deploymentMode,
    isWorkspaceOwner,
    smtpActive,
  ]);

  useEffect(() => {
    if (activeIndex >= tips.length) {
      setActiveIndex(0);
    }
  }, [tips.length, activeIndex]);

  if (!showExpanded || tips.length === 0) {
    return null;
  }

  const tip = tips[Math.min(activeIndex, tips.length - 1)]!;
  const action = TIP_ACTIONS[tip];

  function openTip() {
    if (action.kind === "settingsPath") {
      navigate(settingsPath(action.section));
      return;
    }
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(
          location.search,
          buildPopupQueryValue(SETTINGS_POPUP_ID, action.menuItemId),
        ),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  function dismiss() {
    if (userId) {
      writeTipsBannerDismissed(userId, true);
    }
    setDismissed(true);
  }

  function goPrev() {
    setActiveIndex((index) => (index <= 0 ? tips.length - 1 : index - 1));
  }

  function goNext() {
    setActiveIndex((index) => (index >= tips.length - 1 ? 0 : index + 1));
  }

  return (
    <div
      data-testid="sidebar-tips-banner"
      data-tip-id={tip}
      data-tip-count={tips.length}
      // mb-3 (12px) + parent footer gap-1 (4px) = 16px before version/docs menu
      className="mb-3 rounded-lg border border-primary/30 bg-primary/5 p-2 text-foreground dark:border-primary/40 dark:bg-primary/10"
    >
      <div className="flex items-center justify-between gap-1">
        <div className="flex min-w-0 items-center gap-1.5 pl-2">
          <TipsLabelIcon className="size-5 -ml-1 shrink-0 text-primary" />
          <p className="truncate text-xs font-medium leading-4 text-foreground">{t("web.tips.title")}</p>
        </div>
        <button
          type="button"
          className={tipsControlButtonClassName}
          aria-label={t("web.tips.dismiss")}
          data-testid="sidebar-tips-dismiss"
          onClick={dismiss}
        >
          <X className="size-4" />
        </button>
      </div>
      <button
        type="button"
        data-testid="sidebar-tips-cta"
        className="mt-1 w-full rounded-md px-2 py-1.5 text-left outline-none ring-sidebar-ring transition hover:bg-[rgba(0,0,0,0.05)] focus-visible:ring-2 dark:hover:bg-[rgba(255,255,255,0.08)]"
        onClick={openTip}
      >
        <p className="text-sm font-medium leading-5 text-foreground">{t(TIP_TITLE_KEYS[tip])}</p>
        <p className="mt-0.5 text-xs leading-4 text-muted-foreground">{t(TIP_BODY_KEYS[tip])}</p>
      </button>
      {tips.length > 1 ? (
        <div className="mt-1.5 flex items-center justify-between gap-1">
          <button
            type="button"
            className={tipsControlButtonClassName}
            aria-label={t("web.tips.prev")}
            data-testid="sidebar-tips-prev"
            onClick={goPrev}
          >
            <ChevronLeft className="size-4" />
          </button>
          <div className="flex items-center gap-1" aria-hidden>
            {tips.map((id, index) => (
              <span
                key={id}
                className={cn(
                  "size-1.5 rounded-full",
                  index === activeIndex ? "bg-primary" : "bg-muted-foreground/40",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            className={tipsControlButtonClassName}
            aria-label={t("web.tips.next")}
            data-testid="sidebar-tips-next"
            onClick={goNext}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
