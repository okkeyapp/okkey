/// <reference types="vite/client" />

declare module "@okkey/crypto-wasm";

interface ImportMetaEnv {
  /** Core API origin, e.g. http://localhost:4000 (must not be the Vite dev URL). */
  readonly VITE_API_BASE_URL?: string;
  /** Set to "true" to show dev-only nav links in production builds. */
  readonly VITE_SHOW_DEV_LINKS?: string;
  /** Load enterprise web modules from okkey-enterprise (default: false). */
  readonly VITE_ENTERPRISE_MODULES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
