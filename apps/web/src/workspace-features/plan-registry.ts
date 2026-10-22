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
 * - Self-hosted with modules: licensed notice (ignore `plan_tier`)
 * - Stub / modules off: null → Core FREE notice + sales request (ignore `plan_tier`)
 */
export type WorkspaceSettingsPlanModule = {
  PlanSection: ComponentType<WorkspaceSettingsPlanSectionProps> | null;
};
