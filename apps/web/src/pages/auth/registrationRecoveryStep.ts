/**
 * Post-signup recovery export stays on `/account/new` while enroll / export run.
 * Keep `registrationAuthStateId` until finishRegistration so AuthSessionGate and
 * guestEntryPaths still treat this path as an allowed guest entry.
 */
export type RegistrationStep = "form" | "enrolling" | "enrollFailed" | "recoveryKey";

export function shouldRedirectAwayFromRegistrationForm(args: {
  step: RegistrationStep;
  registrationAuthStateId: string | null;
  email: string;
}): boolean {
  if (args.step !== "form") {
    return false;
  }
  return !args.registrationAuthStateId || !args.email;
}

/** Enroll must succeed before leave/handoff; failure stays on a blocking step. */
export function registrationStepAfterRecoveryEnroll(enrolled: boolean): "recoveryKey" | "enrollFailed" {
  return enrolled ? "recoveryKey" : "enrollFailed";
}
