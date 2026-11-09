import type { WorkspaceSettingsPlanModule } from "../plan-registry";

/** Open-core / modules-off: Core renders the self-hosted FREE plan notice and no tile badge. */
const workspacePlanModule: WorkspaceSettingsPlanModule = {
  PlanSection: null,
  ListTileBadge: null,
};

export default workspacePlanModule;
