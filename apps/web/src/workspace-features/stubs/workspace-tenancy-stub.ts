import type { WorkspaceTenancyModule } from "../tenancy-registry";

/** FREE / self-hosted stub: no additional workspace create or delete UI. */
const workspaceTenancyModule: WorkspaceTenancyModule = {
  canCreateWorkspace: false,
  DangerZoneSection: null,
};

export default workspaceTenancyModule;
