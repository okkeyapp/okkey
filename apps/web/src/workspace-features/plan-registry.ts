import type { WebMessageValues } from "@okkey/i18n";
import type { ComponentType } from "react";

export type WorkspaceSettingsPlanSectionProps = {
  workspaceId: string;
  planTier: string | null | undefined;
  t: (messageKey: string, values?: WebMessageValues) => string;
  canRequest: boolean;
};

/**
 * Enterprise may replace Core’s self-hosted FREE plan notice.
 * - SaaS: full catalog + change-plan popup
 * - Self-hosted licensed: active license notice
 * Stub / open-core: null → Core FREE notice
 */
export type WorkspaceSettingsPlanModule = {
  PlanSection: ComponentType<WorkspaceSettingsPlanSectionProps> | null;
};
