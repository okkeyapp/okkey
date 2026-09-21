/// <reference types="vite/client" />

declare module "@okkey/crypto-wasm";

declare module "@okkey-enterprise/workspace-tenancy" {
  import type { WorkspaceTenancyModule } from "./workspace-features/tenancy-registry";
  const workspaceTenancyModule: WorkspaceTenancyModule;
  export default workspaceTenancyModule;
}

declare module "@okkey-enterprise/workspace-roles" {
  import type { WorkspaceSettingsRolesModule } from "./workspace-features/registry";
  const enterpriseRolesModule: WorkspaceSettingsRolesModule;
  export default enterpriseRolesModule;
}

declare module "@okkey-enterprise/workspace-profiles" {
  import type { WorkspaceSettingsProfilesModule } from "./workspace-features/registry";
  const enterpriseProfilesModule: WorkspaceSettingsProfilesModule;
  export default enterpriseProfilesModule;
}

declare module "@okkey-enterprise/workspace-members" {
  import type { CoreApiClient } from "@okkey/api";
  import type { WorkspaceSettingsMembersModule } from "./workspace-features/registry";
  const workspaceMembersModule: WorkspaceSettingsMembersModule;
  export default workspaceMembersModule;
  export function tryCompletePendingVaultWraps(input: {
    core: CoreApiClient;
    workspaceId: string;
    userId: string;
    accountVaultKey: Uint8Array;
  }): Promise<void>;
}

declare module "@okkey-enterprise/workspace-shared-vaults" {
  import type { WorkspaceSettingsSharedVaultsModule } from "./workspace-features/registry";
  const enterpriseSharedVaultsModule: WorkspaceSettingsSharedVaultsModule;
  export default enterpriseSharedVaultsModule;
}

declare module "@okkey-enterprise/account-recovery" {
  import type { AccountRecoveryEnterpriseModule } from "./account-recovery-features/registry";
  const accountRecoveryModule: AccountRecoveryEnterpriseModule;
  export default accountRecoveryModule;
}

declare module "@okkey-enterprise/recovery-crypto";
declare module "@okkey-enterprise/recovery-crypto-wasm";

interface ImportMetaEnv {
  /** Core API origin, e.g. http://localhost:4000 (must not be the Vite dev URL). */
  readonly VITE_API_BASE_URL?: string;
  /** Set to "true" to show dev-only nav links in production builds. */
  readonly VITE_SHOW_DEV_LINKS?: string;
  /** Load enterprise web modules from okkey-enterprise (default: false). */
  readonly VITE_ENTERPRISE_MODULES?: string;
  /** Deployment mode for UI gates: self_hosted (default) | saas. */
  readonly VITE_DEPLOYMENT_MODE?: string;
  /** GitHub repo slug for domain capabilities catalog (default: okkeyapp/domain-capabilities). */
  readonly VITE_DOMAIN_CAPABILITIES_REPO?: string;
  readonly VITE_DOMAIN_CAPABILITIES_BRANCH?: string;
  readonly VITE_DOMAIN_CAPABILITIES_MANIFEST_URL?: string;
  readonly VITE_DOMAIN_CAPABILITIES_CATALOG_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
