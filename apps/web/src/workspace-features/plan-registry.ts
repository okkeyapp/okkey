import type { WebMessageValues } from "@okkey/i18n";
import type { ComponentType } from "react";

export type WorkspaceSettingsPlanSectionProps = {
  workspaceId: string;
  planTier: string | null | undefined;
  t: (messageKey: string, values?: WebMessageValues) => string;
  canRequest: boolean;
  /** Workspace display name for license-request auto fields (optional). */
  workspaceName?: string;
};

/**
 * Enterprise may replace Core’s self-hosted FREE plan notice.
 * Props stay backward compatible ({@link WorkspaceSettingsPlanSectionProps}).
 * - Confirmed hosted: full catalog + change-plan popup (`plan_tier`)
 * - Self-hosted with license management available (plugin loaded): EE license
 *   panel for every license state (absent / invalid / expired / active).
 *   `planTier` is still passed; the panel owns status / fingerprint / upload UI.
 * - Self-hosted without the plugin: Core sales request (FREE)
 */
export type WorkspaceSettingsPlanModule = {
  PlanSection: ComponentType<WorkspaceSettingsPlanSectionProps> | null;
};
