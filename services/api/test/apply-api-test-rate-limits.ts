import { applyApiTestCosignBypass } from "./test-cosign-default.ts";
import { applyApiTestRateLimitDefaults } from "./test-rate-limit-defaults.ts";
import { applyApiTestSalesEmailDefault } from "./test-sales-email-default.ts";

applyApiTestRateLimitDefaults();
applyApiTestSalesEmailDefault();
applyApiTestCosignBypass();
