import type { SectionReauthZoneId } from "./vaultDevicePrefs";
import {
  CAPSULES_PATH,
  MONITORING_PATH,
  SETTINGS_DEVICES_PATH,
  isSettingsPathname,
  isToolsPathname,
} from "../routes/paths";

/** Pathname-based zones only (personal settings is gated via the account settings popup). */
export function resolveSectionReauthZone(pathname: string): SectionReauthZoneId | null {
  if (pathname === CAPSULES_PATH || pathname.startsWith(`${CAPSULES_PATH}/`)) {
    return "capsules";
  }
  if (pathname === MONITORING_PATH || pathname.startsWith(`${MONITORING_PATH}/`)) {
    return "monitoring";
  }
  if (isToolsPathname(pathname)) {
    return "tools";
  }
  // Personal devices deep-link redirects into SettingsPopup — not workspace settings.
  if (pathname === SETTINGS_DEVICES_PATH) {
    return null;
  }
  if (isSettingsPathname(pathname)) {
    return "workspaceSettings";
  }
  return null;
}

export function sectionReauthZoneLabelKey(zone: SectionReauthZoneId): string {
  return `web.settingsPopup.vault.zones.${zone}`;
}
