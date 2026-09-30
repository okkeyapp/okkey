/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

import {
  applyEnterpriseWebViteEnvToProcess,
  enterpriseWebViteEnvDefines,
  loadEnterpriseWebViteEnv,
} from "./vite.enterpriseEnv";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const enterpriseModules = env.VITE_ENTERPRISE_MODULES === "true";
  const enterpriseRoot = path.resolve(__dirname, "../../../okkey-enterprise");
  const enterpriseWebEnvDir = path.resolve(enterpriseRoot, "web");

  /** SaaS / legal env lives in okkey-enterprise/web/.env — not in public Core examples. */
  const enterpriseWebEnvOverlay = enterpriseModules
    ? loadEnterpriseWebViteEnv(mode, enterpriseWebEnvDir)
    : {};
  if (enterpriseModules) {
    applyEnterpriseWebViteEnvToProcess(enterpriseWebEnvOverlay);
  }

  const enterpriseRolesPath = path.resolve(
    enterpriseRoot,
    "web/workspace-roles/src/index.ts",
  );
  const enterpriseRolesStubPath = path.resolve(
    __dirname,
    "./src/workspace-features/stubs/enterprise-roles-stub.ts",
  );
  const enterpriseProfilesPath = path.resolve(
    enterpriseRoot,
    "web/workspace-profiles/src/index.ts",
  );
  const enterpriseProfilesStubPath = path.resolve(
    __dirname,
    "./src/workspace-features/stubs/enterprise-profiles-stub.ts",
  );
  const enterpriseTenancyPath = path.resolve(
    enterpriseRoot,
    "web/workspace-tenancy/src/index.ts",
  );
  const enterpriseTenancyStubPath = path.resolve(
    __dirname,
    "./src/workspace-features/stubs/workspace-tenancy-stub.ts",
  );
  const enterpriseMembersPath = path.resolve(
    enterpriseRoot,
    "web/workspace-members/src/index.ts",
  );
  const enterpriseMembersStubPath = path.resolve(
    __dirname,
    "./src/workspace-features/stubs/enterprise-members-stub.ts",
  );
  const enterpriseSharedVaultsPath = path.resolve(
    enterpriseRoot,
    "web/workspace-shared-vaults/src/index.ts",
  );
  const enterpriseSharedVaultsStubPath = path.resolve(
    __dirname,
    "./src/workspace-features/stubs/enterprise-shared-vaults-stub.ts",
  );
  const enterpriseLegalPath = path.resolve(enterpriseRoot, "web/legal/src/index.ts");
  const enterpriseLegalStubPath = path.resolve(
    __dirname,
    "./src/workspace-features/stubs/enterprise-legal-stub.ts",
  );
  const enterprisePlanPath = path.resolve(enterpriseRoot, "web/workspace-plan/src/index.ts");
  const enterprisePlanStubPath = path.resolve(
    __dirname,
    "./src/workspace-features/stubs/enterprise-plan-stub.ts",
  );
  const enterpriseAccountRecoveryPath = path.resolve(
    enterpriseRoot,
    "web/account-recovery/src/index.ts",
  );
  const enterpriseAccountRecoveryStubPath = path.resolve(
    __dirname,
    "./src/account-recovery-features/stubs/enterprise-account-recovery-stub.ts",
  );
  const enterpriseRecoveryCryptoPath = path.resolve(
    enterpriseRoot,
    "packages/recovery-crypto/src/index.ts",
  );
  const enterpriseRecoveryCryptoWasmPath = path.resolve(
    enterpriseRoot,
    "packages/recovery-crypto/dist/okkey_enterprise_recovery_crypto.js",
  );

  return {
    plugins: [react()],
    define: enterpriseWebViteEnvDefines(enterpriseWebEnvOverlay),
    assetsInclude: ["**/*.wasm"],
    optimizeDeps: {
      exclude: [
        "@okkey/crypto",
        "@okkey/crypto-wasm",
        "@okkey-enterprise/recovery-crypto",
        "@okkey-enterprise/recovery-crypto-wasm",
      ],
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: {
        allow: [
          path.resolve(__dirname, "."),
          path.resolve(__dirname, "../../packages/crypto/dist"),
          enterpriseRoot,
        ],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@okkey/i18n": path.resolve(__dirname, "../../packages/i18n/src"),
        "@okkey/ui": path.resolve(__dirname, "../../packages/ui/src"),
        "@okkey/vault-ui": path.resolve(__dirname, "../../packages/vault-ui/src"),
        "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
        "@okkey/import": path.resolve(__dirname, "../../packages/import/src"),
        "@okkey/types": path.resolve(__dirname, "../../packages/types/src"),
        "@okkey/api": path.resolve(__dirname, "../../packages/api/src"),
        "@okkey/auth": path.resolve(__dirname, "../../packages/auth/src"),
        "@okkey/crypto": path.resolve(__dirname, "../../packages/crypto/src"),
        "@okkey/crypto-wasm": path.resolve(__dirname, "../../packages/crypto/dist/okkey_crypto_engine.js"),
        "@okkey/vault": path.resolve(__dirname, "../../packages/vault/src"),
        "@okkey/sync": path.resolve(__dirname, "../../packages/sync/src"),
        "@okkey-enterprise/workspace-roles": enterpriseModules ? enterpriseRolesPath : enterpriseRolesStubPath,
        "@okkey-enterprise/workspace-profiles": enterpriseModules
          ? enterpriseProfilesPath
          : enterpriseProfilesStubPath,
        "@okkey-enterprise/workspace-tenancy": enterpriseModules
          ? enterpriseTenancyPath
          : enterpriseTenancyStubPath,
        "@okkey-enterprise/workspace-members": enterpriseModules
          ? enterpriseMembersPath
          : enterpriseMembersStubPath,
        "@okkey-enterprise/workspace-shared-vaults": enterpriseModules
          ? enterpriseSharedVaultsPath
          : enterpriseSharedVaultsStubPath,
        "@okkey-enterprise/legal": enterpriseModules ? enterpriseLegalPath : enterpriseLegalStubPath,
        "@okkey-enterprise/workspace-plan": enterpriseModules
          ? enterprisePlanPath
          : enterprisePlanStubPath,
        "@okkey-enterprise/account-recovery": enterpriseModules
          ? enterpriseAccountRecoveryPath
          : enterpriseAccountRecoveryStubPath,
        "@okkey-enterprise/recovery-crypto": enterpriseRecoveryCryptoPath,
        "@okkey-enterprise/recovery-crypto-wasm": enterpriseRecoveryCryptoWasmPath,
        "@okkey-enterprise/types": path.resolve(enterpriseRoot, "packages/types/src"),
        "@okkey-enterprise/api": path.resolve(enterpriseRoot, "packages/api/src"),
        "@okkey/popup-query": path.resolve(__dirname, "./src/routes/popupQuery.ts"),
        "date-fns": path.resolve(__dirname, "../../node_modules/date-fns"),
        "react-router-dom": path.resolve(__dirname, "../../node_modules/react-router-dom"),
      },
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      passWithNoTests: false,
    },
  };
});
