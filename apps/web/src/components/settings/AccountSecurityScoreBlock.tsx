import type { WebMessageValues } from "@okkey/i18n";
import type {
  AccountSecurityColorBand,
  AccountSecurityLevel,
  AccountSecurityRecommendationId,
} from "@okkey/types";
import { Alert, AlertDescription, cn } from "@okkey/ui";
import { useLocation, useNavigate } from "react-router-dom";

import { MonitoringGaugeChart } from "../../monitoring/MonitoringCharts";
import {
  buildPopupQueryValue,
  popupQuerySearch,
  SETTINGS_POPUP_ID,
} from "../../routes/popupQuery";
import type { SettingsPopupItemId } from "./SettingsPopup";
import { useAccountSecurityScore } from "./useAccountSecurityScore";

type Translate = (messageKey: string, values?: WebMessageValues) => string;

type AccountSecurityScoreBlockProps = {
  t: Translate;
};

/** Progress stroke by score band (same thresholds as the former shield). */
const GAUGE_PROGRESS_CLASS: Record<AccountSecurityColorBand, string> = {
  good: "stroke-green-600 dark:stroke-green-400",
  almost: "stroke-lime-600 dark:stroke-lime-400",
  medium: "stroke-yellow-500 dark:stroke-yellow-400",
  weak: "stroke-orange-500 dark:stroke-orange-400",
  critical: "stroke-red-600 dark:stroke-red-400",
};

const LEVEL_MESSAGE: Record<AccountSecurityLevel, string> = {
  excellent: "web.settingsPopup.securityScore.level.excellent",
  good: "web.settingsPopup.securityScore.level.good",
  fair: "web.settingsPopup.securityScore.level.fair",
  poor: "web.settingsPopup.securityScore.level.poor",
  critical: "web.settingsPopup.securityScore.level.critical",
};

const RECOMMENDATION_MESSAGE: Record<AccountSecurityRecommendationId, string> = {
  enableTwoFactor: "web.settingsPopup.securityScore.rec.enableTwoFactor",
  downloadBackupCodes: "web.settingsPopup.securityScore.rec.downloadBackupCodes",
  refreshBackupCodes: "web.settingsPopup.securityScore.rec.refreshBackupCodes",
  enrollRecoveryKey: "web.settingsPopup.securityScore.rec.enrollRecoveryKey",
  exportRecoveryKey: "web.settingsPopup.securityScore.rec.exportRecoveryKey",
  refreshRecoveryKeyExport: "web.settingsPopup.securityScore.rec.refreshRecoveryKeyExport",
  enableTrustedDevicesRecovery: "web.settingsPopup.securityScore.rec.enableTrustedDevicesRecovery",
  confirmPendingDevices: "web.settingsPopup.securityScore.rec.confirmPendingDevices",
  enableTrustedContacts: "web.settingsPopup.securityScore.rec.enableTrustedContacts",
  confirmTrustedContacts: "web.settingsPopup.securityScore.rec.confirmTrustedContacts",
  addLoginMethod: "web.settingsPopup.securityScore.rec.addLoginMethod",
  shortenVaultIdleLock: "web.settingsPopup.securityScore.rec.shortenVaultIdleLock",
  enableVaultLockOnSleep: "web.settingsPopup.securityScore.rec.enableVaultLockOnSleep",
  shortenClipboardClear: "web.settingsPopup.securityScore.rec.shortenClipboardClear",
  refreshMasterPassword: "web.settingsPopup.securityScore.rec.refreshMasterPassword",
  requireReauthOnDeletion: "web.settingsPopup.securityScore.rec.requireReauthOnDeletion",
  enableBiometricOrPin: "web.settingsPopup.securityScore.rec.enableBiometricOrPin",
};

export default function AccountSecurityScoreBlock({ t }: AccountSecurityScoreBlockProps) {
  const { loading, partialError, result } = useAccountSecurityScore();
  const location = useLocation();
  const navigate = useNavigate();

  function goToSettingsItem(itemId: SettingsPopupItemId) {
    navigate(
      {
        pathname: location.pathname,
        search: popupQuerySearch(
          location.search,
          buildPopupQueryValue(SETTINGS_POPUP_ID, itemId),
        ),
        hash: location.hash,
      },
      { replace: false },
    );
  }

  if (loading || !result) {
    return (
      <section
        className="mb-2 rounded-xl bg-secondary/70 p-4"
        aria-busy="true"
        aria-label={t("web.settingsPopup.securityScore.title")}
      >
        <div className="flex items-center gap-4">
          <div className="size-24 shrink-0 animate-pulse rounded-full bg-muted" aria-hidden />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-4 w-56 max-w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      </section>
    );
  }

  const { score, level, colorBand, recommendations } = result;

  return (
    <section
      className="mb-2 rounded-xl bg-secondary/70 p-4"
      aria-label={t("web.settingsPopup.securityScore.title")}
    >
      <div className="flex items-center gap-4">
        <div className="relative size-24 shrink-0">
          <MonitoringGaugeChart
            score={score}
            className="size-24"
            trackClassName="stroke-white"
            progressClassName={GAUGE_PROGRESS_CLASS[colorBand]}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-base font-bold leading-5 text-foreground tabular-nums">
              {score}
              <span className="text-muted-foreground">/100</span>
            </p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-foreground">
            {t("web.settingsPopup.securityScore.title")}
          </p>
          <p className="mt-1 text-sm leading-5 text-muted-foreground">{t(LEVEL_MESSAGE[level])}</p>
        </div>
      </div>

      {partialError ? (
        <Alert variant="info" className="mt-3">
          <AlertDescription>{t("web.settingsPopup.securityScore.partialError")}</AlertDescription>
        </Alert>
      ) : null}

      {recommendations.length === 0 ? (
        <p className="mt-3 text-sm leading-5 text-muted-foreground">
          {t("web.settingsPopup.securityScore.allGood")}
        </p>
      ) : (
        <ul className="mt-3 flex flex-col items-start gap-1">
          {recommendations.map((rec) => (
            <li key={rec.id}>
              <button
                type="button"
                className={cn(
                  "account-security-score-rec",
                  "h-auto max-w-full px-0 py-0 text-left text-sm font-normal leading-5",
                  "bg-transparent text-primary underline-offset-4 hover:underline",
                  "outline-none focus:outline-none focus-visible:outline-none",
                  "shadow-none !shadow-none",
                  "focus:!shadow-none focus-visible:!shadow-none active:!shadow-none",
                  "dark:focus:!shadow-none dark:focus-visible:!shadow-none",
                  "focus:!ring-0 focus-visible:!ring-0",
                )}
                style={{ boxShadow: "none" }}
                onClick={() => goToSettingsItem(rec.target)}
              >
                {t(RECOMMENDATION_MESSAGE[rec.id])}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
