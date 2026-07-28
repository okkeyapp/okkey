/// <reference types="vite/client" />

declare module "@okkey/crypto-wasm";

declare module "@okkey-enterprise/workspace-tenancy" {
  import type { WorkspaceTenancyModule } from "./workspace-features/tenancy-registry";
  const workspaceTenancyModule: WorkspaceTenancyModule;
  export default workspaceTenancyModule;
}

interface ImportMetaEnv {
  /** Core API origin, e.g. http://localhost:4000 (must not be the Vite dev URL). */
  readonly VITE_API_BASE_URL?: string;
  /** Set to "true" to show dev-only nav links in production builds. */
  readonly VITE_SHOW_DEV_LINKS?: string;
  /** Load enterprise web modules from okkey-enterprise (default: false). */
  readonly VITE_ENTERPRISE_MODULES?: string;
  /** Deployment mode for UI gates: self_hosted (default) | saas. */
  readonly VITE_DEPLOYMENT_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
