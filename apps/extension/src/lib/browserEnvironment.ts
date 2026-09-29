/** Re-export shared device environment (source: packages/ui — works in node tests + WXT). */
export {
  buildDefaultDeviceName,
  buildDeviceFingerprintId,
  formatClientLabelFromType,
  formatDeviceChannel,
  formatDeviceClientOs,
  formatDeviceTitle,
  parseBrowserEnvironment,
  type BrowserClientId,
  type DeviceChannel,
  type DeviceDisplayHints,
  type ParseBrowserEnvironmentOptions,
  type ParsedBrowserEnvironment,
} from "../../../../packages/ui/src/lib/device-environment.ts";

export {
  EXTENSION_DEVICE_CHANNEL,
  EXTENSION_FINGERPRINT_PREFIX,
  OKKEY_SAAS_WEB_BASE_URL,
} from "./deviceChannel.ts";
