import type { SectionReauthZoneId } from "./vaultDevicePrefs";
import {
  CAPSULES_PATH,
  ITEMS_PATH,
  MONITORING_PATH,
  isSettingsPathname,
  isToolsPathname,
} from "../routes/paths";

export function resolveSectionReauthZone(pathname: string): SectionReauthZoneId | null {
  if (pathname === ITEMS_PATH || pathname.startsWith(`${ITEMS_PATH}/`)) {
    return "items";
  }
  if (pathname === CAPSULES_PATH || pathname.startsWith(`${CAPSULES_PATH}/`)) {
    return "capsules";
  }
  if (pathname === MONITORING_PATH || pathname.startsWith(`${MONITORING_PATH}/`)) {
    return "monitoring";
  }
  if (isToolsPathname(pathname) || isSettingsPathname(pathname)) {
    return "toolsAndWorkspaceSettings";
  }
  return null;
}
