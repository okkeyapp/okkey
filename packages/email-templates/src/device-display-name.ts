/**
 * Single device detail for approval emails: avoid “Device: Web Chrome” +
 * “Platform: Web · Chrome · macOS” when the client name was built from the same fields.
 */
export function resolveDeviceDetailName(
  deviceName: string,
  platform: string,
  osName: string,
): string {
  const platformOs = `${platform} · ${osName}`.trim();
  const name = deviceName.trim();
  if (!name) {
    return platformOs;
  }
  const nameTokens = tokenize(name);
  const platformTokens = tokenize(platformOs);
  if (nameTokens.size === 0) {
    return platformOs;
  }
  let overlap = 0;
  for (const token of nameTokens) {
    if (platformTokens.has(token)) {
      overlap += 1;
    }
  }
  // Generic auto-names (e.g. "Web Chrome") overlap heavily with platform · OS.
  if (overlap >= Math.min(2, nameTokens.size) && nameTokens.size <= platformTokens.size) {
    return platformOs;
  }
  if (name.toLowerCase().includes(osName.trim().toLowerCase())) {
    return name;
  }
  return `${name} · ${platformOs}`;
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/u)
      .filter((part) => part.length > 0),
  );
}
