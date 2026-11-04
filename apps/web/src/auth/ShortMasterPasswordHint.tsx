import { MIN_MASTER_PASSWORD_LENGTH } from "@okkey/types";
import { Button } from "@okkey/ui";
import { useNavigate } from "react-router-dom";

import { useLocale } from "../locale/LocaleContext";
import { ITEMS_PATH } from "../routes/paths";
import { buildPopupQueryValue, popupQuerySearch, SETTINGS_POPUP_ID } from "../routes/popupQuery";
import { useAuthVault } from "./AuthVaultContext";

/**
 * Non-blocking suggestion after a master-password unlock whose typed length
 * is below the current minimum. Dismiss is stored locally and does not
 * include the password or its length.
 */
export default function ShortMasterPasswordHint() {
  const { suggestLongerMasterPassword, dismissLongerMasterPasswordHint } = useAuthVault();
  const { t } = useLocale();
  const navigate = useNavigate();

  if (!suggestLongerMasterPassword) {
    return null;
  }

  return (
    <div role="status" className="pointer-events-none fixed inset-x-0 bottom-0 z-sticky px-4 pb-4">
      <div className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col gap-3 rounded-lg border border-border bg-background p-3 shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm leading-5 text-foreground">
          {t("unlock.shortMasterPasswordHint", { min: MIN_MASTER_PASSWORD_LENGTH })}
        </p>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              navigate({
                pathname: ITEMS_PATH,
                search: popupQuerySearch("", buildPopupQueryValue(SETTINGS_POPUP_ID, "vault")),
              });
            }}
          >
            {t("unlock.shortMasterPasswordHint.change")}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={dismissLongerMasterPasswordHint}>
            {t("unlock.shortMasterPasswordHint.dismiss")}
          </Button>
        </div>
      </div>
    </div>
  );
}
