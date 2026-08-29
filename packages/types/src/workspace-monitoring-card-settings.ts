/** Monitoring dashboard card ids (workspace-wide visibility / feature toggles). */
export const MONITORING_CARD_IDS = [
  "overall",
  "strength",
  "reused",
  "weak",
  "compromised",
  "stale",
  "passkeyGap",
  "twoFactorGap",
] as const;

export type MonitoringCardId = (typeof MONITORING_CARD_IDS)[number];

/** Per-card enable flags; all true by default. */
export type WorkspaceMonitoringCardSettings = Record<MonitoringCardId, boolean>;

export const DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS: WorkspaceMonitoringCardSettings = {
  overall: true,
  strength: true,
  reused: true,
  weak: true,
  compromised: true,
  stale: true,
  passkeyGap: true,
  twoFactorGap: true,
};

/** Snake_case wire shape for workspace settings API / DB jsonb. */
export interface WorkspaceMonitoringCardSettingsDto {
  enabled_cards: Partial<Record<MonitoringCardId, boolean>>;
}

export function workspaceMonitoringCardSettingsToDto(
  settings: WorkspaceMonitoringCardSettings,
): WorkspaceMonitoringCardSettingsDto {
  return {
    enabled_cards: { ...settings },
  };
}

export function workspaceMonitoringCardSettingsFromDto(
  dto: Partial<WorkspaceMonitoringCardSettingsDto> | null | undefined,
): WorkspaceMonitoringCardSettings {
  const enabled = dto?.enabled_cards;
  if (!enabled || typeof enabled !== "object") {
    return { ...DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS };
  }
  const next: WorkspaceMonitoringCardSettings = { ...DEFAULT_WORKSPACE_MONITORING_CARD_SETTINGS };
  for (const id of MONITORING_CARD_IDS) {
    if (typeof enabled[id] === "boolean") {
      next[id] = enabled[id];
    }
  }
  return next;
}

export function isMonitoringCardId(value: unknown): value is MonitoringCardId {
  return typeof value === "string" && (MONITORING_CARD_IDS as readonly string[]).includes(value);
}
