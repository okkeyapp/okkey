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
 * - SaaS: full catalog + change-plan popup (`plan_tier`)
 * - Self-hosted with modules + ENTERPRISE: licensed notice
 * - Self-hosted FREE (modules on or off): Core FREE notice + sales request
 */
export type WorkspaceSettingsPlanModule = {
  PlanSection: ComponentType<WorkspaceSettingsPlanSectionProps> | null;
};
