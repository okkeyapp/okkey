import { Navigate } from "react-router-dom";

import { ITEMS_PATH } from "../../routes/paths";
import {
  POPUP_QUERY_PARAM,
  SETTINGS_POPUP_ID,
  buildPopupQueryValue,
} from "../../routes/popupQuery";

/**
 * Email / help links use `/settings/devices`. That must open the personal
 * SettingsPopup Devices tab — not workspace settings (unknown slug → general).
 */
export default function PersonalDevicesSettingsRedirect() {
  const search = new URLSearchParams({
    [POPUP_QUERY_PARAM]: buildPopupQueryValue(SETTINGS_POPUP_ID, "devices"),
  });
  return <Navigate to={`${ITEMS_PATH}?${search.toString()}`} replace />;
}
