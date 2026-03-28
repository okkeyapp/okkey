import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCapabilityPolicyDetails,
  evaluateCapabilityDecision,
} from "../src/crypto/capability-policy.ts";

test("evaluateCapabilityDecision allows compat mode with missing capabilities", () => {
  const decision = evaluateCapabilityDecision({
    mode: "compat",
    operation: "vault.share",
    requirements: [
      { subject: "user", capability: "pq_identity", present: false },
      { subject: "device", capability: "pq_device", present: false },
    ],
  });
  assert.equal(decision.allowed, true);
  assert.deepEqual(decision.missing, []);
});

test("evaluateCapabilityDecision rejects strict mode when capability is missing", () => {
  const decision = evaluateCapabilityDecision({
    mode: "strict",
    operation: "registration.complete",
    requirements: [
      { subject: "user", capability: "pq_identity", present: true },
      { subject: "device", capability: "pq_device", present: false },
    ],
  });
  assert.equal(decision.allowed, false);
  assert.deepEqual(decision.missing, ["pq_device"]);
});

test("buildCapabilityPolicyDetails returns normalized payload", () => {
  assert.deepEqual(
    buildCapabilityPolicyDetails({
      mode: "strict",
      operation: "vault.rotate",
      missing: ["pq_identity"],
      subjectId: "user-1",
    }),
    {
      reason: "capability",
      rolloutMode: "strict",
      operation: "vault.rotate",
      missingCapabilities: ["pq_identity"],
      subjectId: "user-1",
    },
  );
});
