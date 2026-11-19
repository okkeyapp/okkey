/**
 * Sales inbox used by the API test runner when `OKKEY_SALES_EMAIL` is unset.
 * Production `loadConfig()` / `resolveSalesEmail()` still require an explicit
 * value — this default is applied only via the test preload (`--import`).
 */
export const TEST_OKKEY_SALES_EMAIL = "sales@okkey.test";

export function applyApiTestSalesEmailDefault(env: NodeJS.ProcessEnv = process.env): void {
  if (env.OKKEY_SALES_EMAIL === undefined || env.OKKEY_SALES_EMAIL === "") {
    env.OKKEY_SALES_EMAIL = TEST_OKKEY_SALES_EMAIL;
  }
}
