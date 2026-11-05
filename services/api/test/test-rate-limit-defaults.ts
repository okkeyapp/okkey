/**
 * Register-complete budgets used by the API test runner.
 * Production `loadConfig()` fallbacks stay 10 per IP and 5 per email when these
 * variables are unset. An explicit value (including CI) is left alone.
 */
export const TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP = 100_000;
export const TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL = 100_000;

const TEST_RATE_LIMIT_ENV: Readonly<Record<string, string>> = {
  AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP: String(
    TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_IP,
  ),
  AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL: String(
    TEST_AUTH_RATE_LIMIT_REGISTER_COMPLETE_PER_EMAIL,
  ),
};

export function applyApiTestRateLimitDefaults(env: NodeJS.ProcessEnv = process.env): void {
  for (const [key, value] of Object.entries(TEST_RATE_LIMIT_ENV)) {
    if (env[key] === undefined || env[key] === "") {
      env[key] = value;
    }
  }
}
