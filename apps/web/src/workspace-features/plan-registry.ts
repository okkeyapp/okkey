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
 * - Self-hosted with modules loaded: EE plan section (stored `plan_tier` is ignored)
 * - Self-hosted without modules: Core license request (FREE), for every stored `plan_tier`
 */
export type WorkspaceSettingsPlanModule = {
  PlanSection: ComponentType<WorkspaceSettingsPlanSectionProps> | null;
};
