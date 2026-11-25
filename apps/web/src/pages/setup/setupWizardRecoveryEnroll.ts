import { registrationStepAfterRecoveryEnroll } from "../auth/registrationRecoveryStep";

/**
 * After owner/device registration succeeds, recovery-key enroll must complete
 * before the wizard can show the export step or finish. Failure stays on a
 * blocking enrollFailed step with an in-memory retry (vault key + bootstrap
 * token) — never skip enroll or persist secrets in web storage.
 */
export type SetupWizardRecoveryEnrollStep = "recovery" | "enrollFailed";

export function wizardStepAfterRecoveryEnroll(
  enrolled: boolean,
): SetupWizardRecoveryEnrollStep {
  return registrationStepAfterRecoveryEnroll(enrolled) === "recoveryKey"
    ? "recovery"
    : "enrollFailed";
}
