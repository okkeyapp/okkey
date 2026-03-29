export type DeployEnv = "dev" | "stage" | "prod";
export type CryptoRolloutMode = "strict" | "compat";
export type CryptoProfileLifecycleState = "active" | "deprecated" | "forbidden";

export interface CryptoPolicyDeprecationWindow {
  announcedOn: string;
  startsOn: string;
  graceEndsOn: string;
  removalTarget: string;
}

export interface CryptoProfilePolicyRow {
  version: number;
  configId: "v1" | "v2";
  state: CryptoProfileLifecycleState;
  allowedForWrite: boolean;
  encryptedBlobAlgorithm: "opaque";
  notes: string;
  deprecation?: CryptoPolicyDeprecationWindow;
}

export interface CryptoPolicyFeatureGates {
  rolloutModeEnvVar: "CRYPTO_ROLLOUT_MODE";
  rolloutEnabledEnvVar: "CRYPTO_ROLLOUT_ENABLED";
  rolloutStateEnvVar: "CRYPTO_ROLLOUT_STATE";
  rolloutStopWritePathsEnvVar: "CRYPTO_ROLLOUT_STOP_WRITE_PATHS";
}

export interface CryptoPolicyEnvironmentMatrix {
  deployEnv: DeployEnv;
  defaultRolloutMode: CryptoRolloutMode;
  profiles: readonly CryptoProfilePolicyRow[];
  featureGates: CryptoPolicyFeatureGates;
}

export interface CryptoPolicyMatrix {
  schemaVersion: number;
  canonicalSource: string;
  lifecyclePolicy: {
    owner: string;
    reviewCadence: string;
  };
  environments: Record<DeployEnv, CryptoPolicyEnvironmentMatrix>;
}

const FEATURE_GATES: CryptoPolicyFeatureGates = Object.freeze({
  rolloutModeEnvVar: "CRYPTO_ROLLOUT_MODE",
  rolloutEnabledEnvVar: "CRYPTO_ROLLOUT_ENABLED",
  rolloutStateEnvVar: "CRYPTO_ROLLOUT_STATE",
  rolloutStopWritePathsEnvVar: "CRYPTO_ROLLOUT_STOP_WRITE_PATHS",
});

const V1_DEPRECATION_WINDOW: CryptoPolicyDeprecationWindow = Object.freeze({
  announcedOn: "2026-03-29",
  startsOn: "2026-03-29",
  graceEndsOn: "2026-09-30",
  removalTarget: "2026-12-31",
});

export const CRYPTO_POLICY_MATRIX: Readonly<CryptoPolicyMatrix> = Object.freeze({
  schemaVersion: 1,
  canonicalSource: "services/api/src/crypto/policy-matrix.ts",
  lifecyclePolicy: Object.freeze({
    owner: "core-security",
    reviewCadence: "quarterly",
  }),
  environments: Object.freeze({
    dev: Object.freeze({
      deployEnv: "dev",
      defaultRolloutMode: "compat",
      featureGates: FEATURE_GATES,
      profiles: Object.freeze([
        Object.freeze({
          version: 1,
          configId: "v1",
          state: "deprecated",
          allowedForWrite: true,
          encryptedBlobAlgorithm: "opaque",
          notes: "Legacy profile for local development and fixtures only.",
          deprecation: V1_DEPRECATION_WINDOW,
        }),
        Object.freeze({
          version: 2,
          configId: "v2",
          state: "active",
          allowedForWrite: true,
          encryptedBlobAlgorithm: "opaque",
          notes: "Q-Day default profile.",
        }),
      ]),
    }),
    stage: Object.freeze({
      deployEnv: "stage",
      defaultRolloutMode: "compat",
      featureGates: FEATURE_GATES,
      profiles: Object.freeze([
        Object.freeze({
          version: 1,
          configId: "v1",
          state: "forbidden",
          allowedForWrite: false,
          encryptedBlobAlgorithm: "opaque",
          notes: "Legacy profile is blocked for stage write paths.",
          deprecation: V1_DEPRECATION_WINDOW,
        }),
        Object.freeze({
          version: 2,
          configId: "v2",
          state: "active",
          allowedForWrite: true,
          encryptedBlobAlgorithm: "opaque",
          notes: "Q-Day default profile.",
        }),
      ]),
    }),
    prod: Object.freeze({
      deployEnv: "prod",
      defaultRolloutMode: "strict",
      featureGates: FEATURE_GATES,
      profiles: Object.freeze([
        Object.freeze({
          version: 1,
          configId: "v1",
          state: "forbidden",
          allowedForWrite: false,
          encryptedBlobAlgorithm: "opaque",
          notes: "Legacy profile is blocked for production write paths.",
          deprecation: V1_DEPRECATION_WINDOW,
        }),
        Object.freeze({
          version: 2,
          configId: "v2",
          state: "active",
          allowedForWrite: true,
          encryptedBlobAlgorithm: "opaque",
          notes: "Q-Day default profile.",
        }),
      ]),
    }),
  }),
});

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  return Number.isFinite(Date.parse(`${value}T00:00:00.000Z`));
}

function assertDeprecationWindow(
  deprecation: CryptoPolicyDeprecationWindow | undefined,
  location: string,
): string[] {
  if (!deprecation) {
    return [];
  }

  const errors: string[] = [];
  const dates: Array<[keyof CryptoPolicyDeprecationWindow, string]> = [
    ["announcedOn", deprecation.announcedOn],
    ["startsOn", deprecation.startsOn],
    ["graceEndsOn", deprecation.graceEndsOn],
    ["removalTarget", deprecation.removalTarget],
  ];

  for (const [key, value] of dates) {
    if (!isIsoDate(value)) {
      errors.push(`${location}.${key} must be YYYY-MM-DD`);
    }
  }

  if (
    isIsoDate(deprecation.startsOn) &&
    isIsoDate(deprecation.graceEndsOn) &&
    deprecation.startsOn > deprecation.graceEndsOn
  ) {
    errors.push(`${location}.startsOn must be <= graceEndsOn`);
  }

  if (
    isIsoDate(deprecation.graceEndsOn) &&
    isIsoDate(deprecation.removalTarget) &&
    deprecation.graceEndsOn > deprecation.removalTarget
  ) {
    errors.push(`${location}.graceEndsOn must be <= removalTarget`);
  }

  return errors;
}

export function validateCryptoPolicyMatrix(matrix: CryptoPolicyMatrix): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(matrix.schemaVersion) || matrix.schemaVersion < 1) {
    errors.push("schemaVersion must be a positive integer");
  }

  const knownVersions = new Set<number>();
  for (const env of ["dev", "stage", "prod"] as const) {
    const envPolicy = matrix.environments[env];
    if (!envPolicy) {
      errors.push(`missing environments.${env}`);
      continue;
    }
    if (envPolicy.deployEnv !== env) {
      errors.push(`environments.${env}.deployEnv must match key`);
    }

    const versionsInEnv = new Set<number>();
    for (let i = 0; i < envPolicy.profiles.length; i += 1) {
      const row = envPolicy.profiles[i];
      const location = `environments.${env}.profiles[${i}]`;
      if (!Number.isInteger(row.version) || row.version <= 0) {
        errors.push(`${location}.version must be a positive integer`);
      }
      if (versionsInEnv.has(row.version)) {
        errors.push(`${location}.version is duplicated for ${env}`);
      }
      versionsInEnv.add(row.version);
      knownVersions.add(row.version);
      errors.push(...assertDeprecationWindow(row.deprecation, `${location}.deprecation`));
      if (row.state === "forbidden" && row.allowedForWrite) {
        errors.push(`${location} cannot be forbidden and allowedForWrite=true`);
      }
    }
  }

  if (!knownVersions.has(2)) {
    errors.push("matrix must define crypto profile v2");
  }
  if (!knownVersions.has(1)) {
    errors.push("matrix must define crypto profile v1 lifecycle");
  }

  return errors;
}

export function assertCryptoPolicyMatrix(
  matrix: CryptoPolicyMatrix = CRYPTO_POLICY_MATRIX,
): void {
  const errors = validateCryptoPolicyMatrix(matrix);
  if (errors.length > 0) {
    throw new Error(`Invalid crypto policy matrix: ${errors.join("; ")}`);
  }
}

export function getCryptoPolicyForDeployEnv(
  deployEnv: DeployEnv,
): Readonly<CryptoPolicyEnvironmentMatrix> {
  return CRYPTO_POLICY_MATRIX.environments[deployEnv];
}

export function getAllowedCryptoProfileVersionsByEnv(deployEnv: DeployEnv): number[] {
  return getCryptoPolicyForDeployEnv(deployEnv)
    .profiles.filter((row) => row.allowedForWrite)
    .map((row) => row.version)
    .sort((a, b) => a - b);
}

export function isCryptoProfileVersionAllowedByEnv(
  deployEnv: DeployEnv,
  version: number,
): boolean {
  return getAllowedCryptoProfileVersionsByEnv(deployEnv).includes(version);
}

export function getDefaultCryptoRolloutModeByEnv(deployEnv: DeployEnv): CryptoRolloutMode {
  return getCryptoPolicyForDeployEnv(deployEnv).defaultRolloutMode;
}
