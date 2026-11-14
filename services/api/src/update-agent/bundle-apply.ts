import { SystemUpdateError } from "../system-updates/errors.ts";
import type { VerifiedOfflineBundle } from "../system-updates/offline-bundle.ts";
import { applyVerifiedCorePackage, type UpdateApplyEngine } from "./apply.ts";
import { applyVerifiedEnterprisePackage } from "./enterprise-apply.ts";

/**
 * Apply a bundle that has already been verified.
 * Core runs first. If enterprise fails, enterprise rolls back and core stays.
 */
export async function applyVerifiedOfflineBundle(input: {
  bundle: VerifiedOfflineBundle;
  engine: UpdateApplyEngine;
  project: string;
  envFilePath: string;
  isolated: boolean;
  coreVersionHint: string;
}): Promise<void> {
  await applyVerifiedCorePackage({
    payload: input.bundle.core,
    engine: input.engine,
    project: input.project,
    envFilePath: input.envFilePath,
    isolated: input.isolated,
  });
  try {
    await applyVerifiedEnterprisePackage({
      payload: input.bundle.enterprise,
      engine: input.engine,
      project: input.project,
      envFilePath: input.envFilePath,
      isolated: input.isolated,
      coreVersionHint: input.coreVersionHint,
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
