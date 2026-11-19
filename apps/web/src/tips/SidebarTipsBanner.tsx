import { AuthClient } from "@okkey/auth";
import { Button, cn, useOkkeyAppShellLayout, useSidebar } from "@okkey/ui";
import { ChevronLeft, ChevronRight, Lightbulb, X } from "lucide-react";
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
 * Compact Get-started-style tips slider between Documentation and the account menu.
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
      className="rounded-lg border border-border bg-muted/40 p-2 text-foreground"
    >
      <div className="flex items-start gap-1.5">
        <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <p className="truncate text-xs font-semibold leading-4">{t("web.tips.title")}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label={t("web.tips.dismiss")}
              data-testid="sidebar-tips-dismiss"
              onClick={dismiss}
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <button
            type="button"
            data-testid="sidebar-tips-cta"
            className="mt-1 w-full rounded-md text-left outline-none ring-sidebar-ring transition hover:bg-black/[0.03] focus-visible:ring-2 dark:hover:bg-white/[0.04]"
            onClick={openTip}
          >
            <p className="text-xs font-medium leading-4 text-foreground">{t(TIP_TITLE_KEYS[tip])}</p>
            <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">{t(TIP_BODY_KEYS[tip])}</p>
          </button>
          {tips.length > 1 ? (
            <div className="mt-1.5 flex items-center justify-between gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground"
                aria-label={t("web.tips.prev")}
                data-testid="sidebar-tips-prev"
                onClick={goPrev}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
              <div className="flex items-center gap-1" aria-hidden>
                {tips.map((id, index) => (
                  <span
                    key={id}
                    className={cn(
                      "size-1.5 rounded-full",
                      index === activeIndex ? "bg-foreground" : "bg-muted-foreground/40",
                    )}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground"
                aria-label={t("web.tips.next")}
                data-testid="sidebar-tips-next"
                onClick={goNext}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
