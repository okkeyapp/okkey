import type { Workspace } from "@okkey/types";
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
 * Paid-plan mark on a workspace list tile.
 *
 * Core mounts `ListTileBadge` only when all of the following hold:
 * - the slot is non-null
 * - `paidPlanBadge` is granted for `workspace`
 * - the tile has no custom logo (`logoVaultId` and `logoAttachmentId` are not both set)
 *
 * The component is a direct child of a `relative` 60×60 logo frame, after the logo.
 * It owns the overlay (position, shape, glyph). Open core sets this slot to null,
 * so the tile renders with no badge.
 */
export type WorkspacePlanListTileBadgeProps = {
  workspace: Workspace;
};

/**
 * Enterprise may replace Core’s self-hosted FREE plan notice.
 * - SaaS: full catalog + change-plan popup (`plan_tier`)
 * - Self-hosted with modules: EE plan section (effective ENTERPRISE)
 * - Self-hosted without modules: Core FREE notice + sales request
 */
export type WorkspaceSettingsPlanModule = {
  PlanSection: ComponentType<WorkspaceSettingsPlanSectionProps> | null;
  ListTileBadge: ComponentType<WorkspacePlanListTileBadgeProps> | null;
};
