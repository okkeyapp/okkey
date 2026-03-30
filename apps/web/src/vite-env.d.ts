/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to show dev-only nav links in production builds. */
  readonly VITE_SHOW_DEV_LINKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
