import { SystemUpdateError } from "../system-updates/errors.ts";
import type { VerifiedOfflineBundle } from "../system-updates/offline-bundle.ts";
import { applyVerifiedCorePackage, type UpdateApplyEngine } from "./apply.ts";
import type { CosignProcessRunner, CosignVerifyEnv } from "./cosign-verify.ts";
import { applyVerifiedEnterprisePackage } from "./enterprise-apply.ts";

/**
 * Apply a bundle that has already been verified.
 * Core runs first. If enterprise fails, enterprise rolls back and core stays.
 * Each package path verifies cosign signatures of the images it is about to switch to.
 */
export async function applyVerifiedOfflineBundle(input: {
  bundle: VerifiedOfflineBundle;
  engine: UpdateApplyEngine;
  project: string;
  envFilePath: string;
  isolated: boolean;
  coreVersionHint: string;
  cosignRunner?: CosignProcessRunner;
  cosignEnv?: CosignVerifyEnv;
}): Promise<void> {
  await applyVerifiedCorePackage({
    payload: input.bundle.core,
    engine: input.engine,
    project: input.project,
    envFilePath: input.envFilePath,
    isolated: input.isolated,
    cosignRunner: input.cosignRunner,
    cosignEnv: input.cosignEnv,
  });
  try {
    await applyVerifiedEnterprisePackage({
      payload: input.bundle.enterprise,
      engine: input.engine,
      project: input.project,
      envFilePath: input.envFilePath,
      isolated: input.isolated,
      coreVersionHint: input.coreVersionHint,
      cosignRunner: input.cosignRunner,
      cosignEnv: input.cosignEnv,
    });
  } catch (error) {
    throw partialBundleFailure(input.bundle.core.version, input.bundle.enterprise.version, error);
  }
}

function partialBundleFailure(coreVersion: string, enterpriseVersion: string, error: unknown): SystemUpdateError {
  const reason = error instanceof Error ? error.message : "Enterprise apply failed";
  const cleaned = reason
    .replaceAll("Nothing was changed.", "")
    .replaceAll("Nothing was changed", "")
    .replaceAll("The previous version was restored", "Enterprise was rolled back")
    .replace(/\s+/g, " ")
    .trim();
  return new SystemUpdateError(
    409,
    "BUNDLE_PARTIAL",
    `Okkey ${coreVersion} was applied. Enterprise ${enterpriseVersion} was not applied. ${cleaned}`.trim(),
  );
}
