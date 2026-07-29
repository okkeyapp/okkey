/// <reference types="vitest/config" />
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const enterpriseModules = env.VITE_ENTERPRISE_MODULES === "true";
  const enterpriseRoot = path.resolve(__dirname, "../../../okkey-enterprise");
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

  return {
    plugins: [react()],
    assetsInclude: ["**/*.wasm"],
    optimizeDeps: {
      exclude: ["@okkey/crypto", "@okkey/crypto-wasm"],
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
        "@workspace/ui": path.resolve(__dirname, "../../packages/ui/src"),
        "@okkey/types": path.resolve(__dirname, "../../packages/types/src"),
        "@okkey/api": path.resolve(__dirname, "../../packages/api/src"),
        "@okkey/auth": path.resolve(__dirname, "../../packages/auth/src"),
        "@okkey/crypto": path.resolve(__dirname, "../../packages/crypto/src"),
        "@okkey/crypto-wasm": path.resolve(__dirname, "../../packages/crypto/dist/okkey_crypto_engine.js"),
        "@okkey-enterprise/workspace-roles": enterpriseModules ? enterpriseRolesPath : enterpriseRolesStubPath,
        "@okkey-enterprise/workspace-profiles": enterpriseModules
          ? enterpriseProfilesPath
          : enterpriseProfilesStubPath,
        "@okkey-enterprise/workspace-tenancy": enterpriseModules
          ? enterpriseTenancyPath
          : enterpriseTenancyStubPath,
        "@okkey-enterprise/types": path.resolve(enterpriseRoot, "packages/types/src"),
        "@okkey-enterprise/api": path.resolve(enterpriseRoot, "packages/api/src"),
        "@okkey/popup-query": path.resolve(__dirname, "./src/routes/popupQuery.ts"),
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
