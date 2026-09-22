import type { WebMessageValues } from "@okkey/i18n";
import type {
  AccountSecurityColorBand,
  AccountSecurityLevel,
  AccountSecurityRecommendationId,
} from "@okkey/types";
import { Alert, AlertDescription, Button, cn } from "@okkey/ui";
import { useLocation, useNavigate } from "react-router-dom";

import {
  buildPopupQueryValue,
  popupQuerySearch,
  SETTINGS_POPUP_ID,
} from "../../routes/popupQuery";
import {
  AccountSecurityShield,
  AccountSecurityShieldSkeleton,
} from "./AccountSecurityShield";
import type { SettingsPopupItemId } from "./SettingsPopup";
import { useAccountSecurityScore } from "./useAccountSecurityScore";

type Translate = (messageKey: string, values?: WebMessageValues) => string;

type AccountSecurityScoreBlockProps = {
  t: Translate;
};

/** Matches KeySection «+ Add field» in gray (`additional`) sections — `/dev/ui/key-form`. */
const recommendationButtonClassName = cn(
  "h-8 w-full justify-start gap-2.5 rounded-lg bg-secondary px-3 text-left font-medium text-foreground shadow-none",
  "hover:bg-[color-mix(in_hsl,hsl(var(--secondary))_94%,hsl(var(--foreground))_6%)]",
  "focus:border-accent focus-visible:border-accent",
);

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
  addTrustedDevice: "web.settingsPopup.securityScore.rec.addTrustedDevice",
  confirmPendingDevices: "web.settingsPopup.securityScore.rec.confirmPendingDevices",
  enableTrustedContacts: "web.settingsPopup.securityScore.rec.enableTrustedContacts",
  confirmTrustedContacts: "web.settingsPopup.securityScore.rec.confirmTrustedContacts",
  addLoginMethod: "web.settingsPopup.securityScore.rec.addLoginMethod",
};

function bandLabelClass(band: AccountSecurityColorBand): string {
  switch (band) {
    case "good":
      return "text-green-700 dark:text-green-400";
    case "almost":
      return "text-lime-700 dark:text-lime-400";
    case "medium":
      return "text-yellow-700 dark:text-yellow-400";
    case "weak":
      return "text-orange-600 dark:text-orange-400";
    case "critical":
      return "text-red-700 dark:text-red-400";
  }
}

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
        <div className="flex items-start gap-3">
          <AccountSecurityShieldSkeleton />
          <div className="min-w-0 flex-1 space-y-2 pt-0.5">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-8 w-24 animate-pulse rounded bg-muted" />
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
      <div className="flex items-start gap-3">
        <AccountSecurityShield colorBand={colorBand} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium leading-5 text-muted-foreground">
            {t("web.settingsPopup.securityScore.title")}
          </p>
          <p className={cn("mt-0.5 text-3xl font-semibold leading-9 tracking-tight", bandLabelClass(colorBand))}>
            <span className="tabular-nums">{score}</span>
            <span className="text-lg font-medium text-muted-foreground">/100</span>
          </p>
          <p className="mt-1 text-sm leading-5 text-foreground">{t(LEVEL_MESSAGE[level])}</p>
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
        <ul className="mt-3 flex flex-col items-stretch gap-1.5">
          {recommendations.map((rec) => (
            <li key={rec.id} className="w-full">
              <Button
                type="button"
                variant="secondary"
                className={recommendationButtonClassName}
                onClick={() => goToSettingsItem(rec.target)}
              >
                <span className="min-w-0 flex-1 truncate text-left text-sm leading-5">
                  {t(RECOMMENDATION_MESSAGE[rec.id])}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
