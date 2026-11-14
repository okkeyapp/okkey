import { readFile, writeFile } from "node:fs/promises";

import { SystemUpdateError } from "../system-updates/errors.ts";
import {
  CORE_IMAGE_SERVICES,
  type OfflinePackagePayload,
  type RegistryPullCredentials,
} from "../system-updates/package-format.ts";

export type ServiceContainer = {
  id: string;
  name: string;
  service: string;
  image: string;
};

export type UpdateApplyEngine = {
  pullImage(image: string, credentials?: RegistryPullCredentials): Promise<void>;
  imageExists(image: string): Promise<boolean>;
  findServiceContainer(project: string, service: string): Promise<ServiceContainer | null>;
  /** Running core version from the api container, when the engine can see it. */
  readRunningCoreVersion?(project: string): Promise<string | null>;
  replaceContainer(
    container: ServiceContainer,
    image: string,
    envUpdates: Record<string, string>,
    options?: { requireHealthy?: boolean },
  ): Promise<{
    /** Restore the previous container. */
    rollback: () => Promise<void>;
    /** Drop the parked previous container after the whole apply succeeds. */
    commit: () => Promise<void>;
  }>;
  readEnvFile(path: string): Promise<string>;
  writeEnvFile(path: string, contents: string): Promise<void>;
};

export function setEnvValue(contents: string, key: string, value: string): string {
  const lines = contents.length > 0 ? contents.split(/\r?\n/) : [];
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) {
    if (next.length > 0 && next[next.length - 1] === "") {
      next.splice(next.length - 1, 0, `${key}=${value}`);
    } else {
      next.push(`${key}=${value}`);
    }
  }
  const joined = next.join("\n");
  return joined.endsWith("\n") || joined === "" ? joined : `${joined}\n`;
}

/**
 * Apply a verified core package. Callers must verify the signature first.
 * A failure rolls back containers that were already replaced and leaves the env file unchanged.
 */
export async function applyVerifiedCorePackage(input: {
  payload: OfflinePackagePayload;
  engine: UpdateApplyEngine;
  project: string;
  envFilePath: string;
  isolated: boolean;
}): Promise<void> {
  if (input.payload.component !== "okkey") {
    throw new SystemUpdateError(
      409,
      "ENTERPRISE_APPLY_UNAVAILABLE",
      "The enterprise package was checked, but this installation cannot apply the enterprise module. Okkey was not changed",
    );
  }
  const images = input.payload.images;
  for (const service of CORE_IMAGE_SERVICES) {
    const image = images[service];
    if (!image) {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", `Core package is missing the ${service} image`);
    }
    if (input.isolated) {
      if (!(await input.engine.imageExists(image))) {
        throw new SystemUpdateError(
          400,
          "APPLY_FAILED",
          `Image ${image} is not present locally, and isolated mode will not download it`,
        );
      }
    } else {
      await input.engine.pullImage(image);
    }
  }

  const containers: ServiceContainer[] = [];
  for (const service of CORE_IMAGE_SERVICES) {
    const container = await input.engine.findServiceContainer(input.project, service);
    if (!container) {
      throw new SystemUpdateError(
        409,
        "APPLY_FAILED",
        `Compose service ${service} is not running in project ${input.project}. Nothing was changed`,
      );
    }
    containers.push(container);
  }

  const replaced: Array<{ rollback: () => Promise<void>; commit: () => Promise<void> }> = [];
  try {
    for (const container of containers) {
      const image = images[container.service];
      if (!image) {
        throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package image disappeared");
      }
      replaced.push(
        await input.engine.replaceContainer(container, image, {
          OKKEY_VERSION: input.payload.version,
          OKKEY_IMAGE_TAG: input.payload.imageTag,
        }),
      );
    }
    const current = await input.engine.readEnvFile(input.envFilePath);
    const next = setEnvValue(current, "OKKEY_IMAGE_TAG", input.payload.imageTag);
    await input.engine.writeEnvFile(input.envFilePath, next);
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
    if (error instanceof SystemUpdateError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : "apply failed";
    throw new SystemUpdateError(
      500,
      "APPLY_FAILED",
      `Apply failed (${message}). The previous version was restored`,
    );
  }
}

export function nodeEnvFileEngine(engine: Omit<UpdateApplyEngine, "readEnvFile" | "writeEnvFile">): UpdateApplyEngine {
  return {
    ...engine,
    async readEnvFile(path: string) {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : "";
        if (code === "ENOENT") {
          return "";
        }
        throw error;
      }
    },
    async writeEnvFile(path: string, contents: string) {
      await writeFile(path, contents, "utf8");
    },
  };
}
