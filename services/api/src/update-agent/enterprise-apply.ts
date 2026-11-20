import { SystemUpdateError } from "../system-updates/errors.ts";
import {
  COMPOSE_IMAGE_ENV_KEYS,
  ENTERPRISE_COMPOSE_SERVICES,
  ENTERPRISE_IMAGE_SERVICES,
  type OfflinePackagePayload,
  type RegistryPullCredentials,
} from "../system-updates/package-format.ts";
import { coreSatisfiesMinimum } from "../system-updates/versions.ts";
import {
  imageRepository,
  setEnvValue,
  type ServiceContainer,
  type UpdateApplyEngine,
} from "./apply.ts";
import {
  resolveApplyCosignOfflineMaterial,
  type CosignOfflineMaterial,
} from "./cosign-offline.ts";
import {
  verifyPackageImageSignatures,
  type CosignRunner,
  type VerifiedImageDigests,
} from "./cosign-verify.ts";
import { credentialSecrets, scrubSecrets } from "./registry-auth.ts";

type EnterpriseTarget = {
  packageService: (typeof ENTERPRISE_IMAGE_SERVICES)[number];
  composeService: (typeof ENTERPRISE_COMPOSE_SERVICES)[(typeof ENTERPRISE_IMAGE_SERVICES)[number]];
  container: ServiceContainer;
  image: string;
};

/**
 * Apply a verified enterprise package.
 * Callers must verify the package signature with the enterprise trusted key first.
 * Before replacing containers, each image is cosign-verified (enterprise
 * publish identity) and pinned by digest.
 * `minCoreVersion` is checked before any tag, pull, or container change.
 * Registry credentials are passed only to the image pull.
 *
 * Package image keys stay `enterprise-api|web|worker`. Runtime replaces the
 * production compose services `api|web|worker` and writes `OKKEY_*_IMAGE`.
 */
/**
 * Enterprise air-gap cosign material uses the same conventional layout as core
 * (`OKKEY_COSIGN_OFFLINE_DIR/trusted_root.json` + `cosign/enterprise-*`).
 * Enterprise package builders live outside this repository (TSK-317).
 */
export async function applyVerifiedEnterprisePackage(input: {
  payload: OfflinePackagePayload;
  engine: UpdateApplyEngine;
  project: string;
  envFilePath: string;
  isolated: boolean;
  coreVersionHint: string;
  registryCredentials?: RegistryPullCredentials;
  /** Test hook: override cosign CLI. */
  runCosign?: CosignRunner;
  /** Test hook: supply already-verified digest refs (skips cosign). */
  verifiedDigests?: VerifiedImageDigests;
  /** Test hook: absolute offline cosign material (TSK-317). */
  offlineMaterial?: CosignOfflineMaterial;
  /** Override material root; defaults to OKKEY_COSIGN_OFFLINE_DIR. */
  cosignOfflineRoot?: string;
  processEnv?: NodeJS.ProcessEnv;
}): Promise<void> {
  if (input.payload.component !== "enterprise") {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package is not an enterprise update");
  }
  const minimum = input.payload.minCoreVersion ?? "";
  if (!minimum) {
    throw new SystemUpdateError(400, "PACKAGE_INVALID", "Enterprise package is missing minCoreVersion");
  }
  const images = input.payload.images;
  for (const service of ENTERPRISE_IMAGE_SERVICES) {
    if (!images[service]) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", `Enterprise package is missing the ${service} image`);
    }
  }

  const coreVersion = await resolveRunningCoreVersion(input);
  if (!coreSatisfiesMinimum(coreVersion, minimum)) {
    const running = coreVersion || "unknown";
    throw new SystemUpdateError(
      409,
      "CORE_UPDATE_REQUIRED",
      `Update core first. This enterprise package requires core ${minimum} or newer. Running core is ${running}. Nothing was changed`,
    );
  }

  const targets: EnterpriseTarget[] = [];
  for (const packageService of ENTERPRISE_IMAGE_SERVICES) {
    const composeService = ENTERPRISE_COMPOSE_SERVICES[packageService];
    const image = images[packageService];
    if (!image) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", `Enterprise package is missing the ${packageService} image`);
    }
    const container = await input.engine.findServiceContainer(input.project, composeService);
    if (!container) {
      throw new SystemUpdateError(
        409,
        "APPLY_FAILED",
        `Compose service ${composeService} is not running in project ${input.project}. Nothing was changed`,
      );
    }
    targets.push({ packageService, composeService, container, image });
  }

  const secrets = credentialSecrets(input.registryCredentials);
  const previousEnv = await input.engine.readEnvFile(input.envFilePath);

  for (const target of targets) {
    if (input.isolated) {
      if (!(await input.engine.imageExists(target.image))) {
        throw new SystemUpdateError(
          400,
          "APPLY_FAILED",
          `Image ${target.image} is not present locally, and isolated mode will not download it`,
        );
      }
    } else {
      await input.engine.pullImage(target.image, input.registryCredentials);
    }
  }

  const offlineMaterial =
    input.verifiedDigests === undefined
      ? await resolveApplyCosignOfflineMaterial({
          payload: input.payload,
          isolated: input.isolated,
          offlineMaterial: input.offlineMaterial,
          cosignOfflineRoot: input.cosignOfflineRoot,
          processEnv: input.processEnv,
        })
      : undefined;
  const digests =
    input.verifiedDigests ??
    (await verifyPackageImageSignatures({
      images: Object.fromEntries(targets.map((target) => [target.packageService, target.image])),
      component: "enterprise",
      envFileContents: previousEnv,
      engine: input.engine,
      runCosign: input.runCosign,
      registryCredentials: input.registryCredentials,
      isolated: input.isolated,
      offlineMaterial,
      processEnv: input.processEnv,
    }));

  let envWritten = false;
  const replaced: Array<{ rollback: () => Promise<void>; commit: () => Promise<void> }> = [];
  try {
    let next = previousEnv;
    next = setEnvValue(next, "OKKEY_ENTERPRISE_IMAGE_TAG", input.payload.imageTag);
    next = setEnvValue(next, "OKKEY_ENTERPRISE_VERSION", input.payload.version);
    for (const target of targets) {
      next = setEnvValue(next, COMPOSE_IMAGE_ENV_KEYS[target.composeService], imageRepository(target.image));
    }
    if (secrets.some((secret) => secret.length >= 6 && next.includes(secret))) {
      throw new SystemUpdateError(500, "APPLY_FAILED", "Refusing to store registry credentials");
    }
    await input.engine.writeEnvFile(input.envFilePath, next);
    envWritten = true;

    for (const target of targets) {
      const pinned = digests[target.packageService] ?? target.image;
      replaced.push(
        await input.engine.replaceContainer(
          target.container,
          pinned,
          {
            OKKEY_ENTERPRISE_VERSION: input.payload.version,
            OKKEY_ENTERPRISE_IMAGE_TAG: input.payload.imageTag,
          },
          { requireHealthy: true },
        ),
      );
    }
    for (const item of replaced) {
      try {
        await item.commit();
      } catch {
        // The new containers are already running. A parked container can be removed later.
      }
    }
  } catch (error) {
    for (const item of replaced.reverse()) {
      try {
        await item.rollback();
      } catch {
        // Keep going so a later service can still return to the previous image.
      }
    }
    if (envWritten) {
      try {
        await input.engine.writeEnvFile(input.envFilePath, previousEnv);
      } catch {
        throw new SystemUpdateError(
          500,
          "APPLY_FAILED",
          "Apply failed and the previous enterprise image tags could not be restored",
        );
      }
    }
    if (error instanceof SystemUpdateError) {
      const restored =
        error.message.includes("restored") || error.message.includes("Nothing was changed")
          ? error.message
          : envWritten
            ? `${error.message}. The previous version was restored`
            : error.message;
      throw new SystemUpdateError(error.statusCode, error.code, scrubSecrets(restored, secrets));
    }
    const message = error instanceof Error ? error.message : "apply failed";
    const restored = envWritten
      ? `Apply failed (${message}). The previous version was restored`
      : `Apply failed (${message})`;
    throw new SystemUpdateError(500, "APPLY_FAILED", scrubSecrets(restored, secrets));
  }
}

export async function resolveRunningCoreVersion(input: {
  engine: UpdateApplyEngine;
  project: string;
  envFilePath: string;
  coreVersionHint: string;
}): Promise<string> {
  if (input.engine.readRunningCoreVersion) {
    try {
      const running = (await input.engine.readRunningCoreVersion(input.project))?.trim() ?? "";
      if (running) {
        return running;
      }
    } catch {
      // The env file and the process hint still name the installed core.
    }
  }
  const file = await input.engine.readEnvFile(input.envFilePath);
  const tag = readEnvValue(file, "OKKEY_IMAGE_TAG");
  if (tag) {
    return tag;
  }
  return input.coreVersionHint.trim();
}

function readEnvValue(contents: string, key: string): string {
  for (const line of contents.split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) {
      return line.slice(key.length + 1).trim();
    }
  }
  return "";
}
