import type { Vault, Workspace, WorkspacePermissionsMatrixDto } from "@okkey/types";
import type { ComponentType } from "react";

/** Props for the optional password-monitoring workspace screen. */
export type PasswordMonitoringPageProps = {
  workspaceId: string;
  workspaceName: string;
  workspace?: Workspace;
  vaults: readonly Vault[];
  workspacePermissions: WorkspacePermissionsMatrixDto | null;
  patchWorkspace?: (workspaceId: string, patch: Partial<Workspace>) => void;
};

export type MonitoringIssueItemIdsInput = {
  workspaceId: string;
  /** Raw `filter` query value (`searchParams.get("filter")`), or null. */
  filter: string | null;
  /** Vault ids in the current items scope. Undefined means every accessible vault. */
  vaultIds?: ReadonlySet<string>;
  workspace?: Workspace;
};

/**
 * Optional password-monitoring web module.
 * `monitoringPath === null` means core registers neither the route nor the sidebar item.
 * A loaded path stays visible after a plan downgrade; the module page is read-only then.
 * `useMonitoringIssueItemIds` is always called. `undefined` means no list filtering;
 * a `Set` is the item ids for the active monitoring filter.
 */
export type PasswordMonitoringModule = {
  MonitoringPage: ComponentType<PasswordMonitoringPageProps> | null;
  monitoringPath: string | null;
  useMonitoringIssueItemIds(
    input: MonitoringIssueItemIdsInput,
  ): ReadonlySet<string> | undefined;
};
