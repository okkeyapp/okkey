import type { WorkspaceTenancyModule } from "../tenancy-registry";

/** FREE / self-hosted stub: no additional workspace create. */
const workspaceTenancyModule: WorkspaceTenancyModule = {
  canCreateWorkspace: false,
};

export default workspaceTenancyModule;
