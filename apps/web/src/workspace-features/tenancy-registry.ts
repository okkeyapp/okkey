import type { WebMessageValues } from "@okkey/i18n";
import type { ComponentType } from "react";

export type WorkspaceDangerZoneSectionProps = {
  workspaceId: string;
  /** Current workspace display name (for confirmation typing). */
  workspaceName: string;
  t: (messageKey: string, values?: WebMessageValues) => string;
};

export type WorkspaceTenancyModule = {
  /** True when SaaS multi-workspace create UI/API should be offered. */
  canCreateWorkspace: boolean;
  /**
   * Owner “danger zone” / delete-workspace UI.
   * Null in open-core and non-SaaS enterprise builds.
   */
  DangerZoneSection: ComponentType<WorkspaceDangerZoneSectionProps> | null;
};
