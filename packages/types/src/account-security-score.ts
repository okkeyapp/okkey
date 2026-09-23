/**
 * Client-side account security score (0–100).
 *
 * Personal account hygiene (2FA, recovery, vault device prefs, login methods) —
 * not vault item monitoring (weak/reused passwords).
 *
 * Paid factors (trusted devices / contacts recovery) and optional login-methods
 * are excluded from the denominator when unavailable (FREE renormalization).
 *
 * Device *count* is not part of the score — gating “≥2 trusted devices” belongs
 * to Recovery settings (enable method), not this formula.
 */

export const ACCOUNT_SECURITY_FACTOR_WEIGHTS = {
  /** A — TOTP 2FA enabled */
  twoFactorEnabled: 25,
  /** B — backup codes live + exported (download/copy tracked) */
  backupCodes: 15,
  /** C — recovery key enrolled + enabled */
  recoveryKeyEnrolled: 15,
  /** D — recovery key exported (copy/PDF), freshness-aware */
  recoveryKeyExported: 10,
  /** E — trusted devices recovery method enabled (paid) */
  trustedDevicesRecovery: 15,
  /** F — trusted contacts recovery (paid) */
  trustedContacts: 10,
  /** H — passkey / hardware login method */
  loginMethods: 5,
  /** V1 — idle lock ≤ 15 minutes */
  vaultIdleLock: 5,
  /** V2 — lock vault when device locks / sleeps */
  vaultLockOnSleep: 5,
  /** V3 — clipboard clear ≤ 1 minute (and not “never”) */
  vaultClipboardClear: 5,
  /** V4 — master password changed within the last year */
  vaultMasterPasswordFresh: 5,
  /** V5 — require reauth at least for deletion */
  vaultReauthOnDeletion: 5,
  /** V6 — biometric unlock and/or PIN enabled */
  vaultBiometricOrPin: 5,
} as const;

export type AccountSecurityFactorId = keyof typeof ACCOUNT_SECURITY_FACTOR_WEIGHTS;

/** Approved color bands for the gauge (by final score after renormalization). */
export type AccountSecurityColorBand =
  | "good" // ≥90
  | "almost" // 70–89
  | "medium" // 50–69
  | "weak" // 30–49
  | "critical"; // <30

export type AccountSecurityLevel =
  | "excellent"
  | "good"
  | "fair"
  | "poor"
  | "critical";

export type AccountSecurityRecommendationId =
  | "enableTwoFactor"
  | "downloadBackupCodes"
  | "refreshBackupCodes"
  | "enrollRecoveryKey"
  | "exportRecoveryKey"
  | "refreshRecoveryKeyExport"
  | "enableTrustedDevicesRecovery"
  | "confirmPendingDevices"
  | "enableTrustedContacts"
  | "confirmTrustedContacts"
  | "addLoginMethod"
  | "shortenVaultIdleLock"
  | "enableVaultLockOnSleep"
  | "shortenClipboardClear"
  | "refreshMasterPassword"
  | "requireReauthOnDeletion"
  | "enableBiometricOrPin";

/** Settings popup menu target for recommendation CTAs. */
export type AccountSecurityRecommendationTarget =
  | "twoFactor"
  | "recovery"
  | "devices"
  | "login"
  | "vault";

export type AccountSecurityRecommendation = {
  id: AccountSecurityRecommendationId;
  target: AccountSecurityRecommendationTarget;
  /** Factor weight used for top-N prioritization (higher = more urgent). */
  priority: number;
};

export const ACCOUNT_SECURITY_EXPORT_FRESH_DAYS = 90;
export const ACCOUNT_SECURITY_EXPORT_STALE_DAYS = 180;
/** Remaining backup codes below this are treated as low stock. */
export const ACCOUNT_SECURITY_BACKUP_CODES_LOW_THRESHOLD = 3;
/** Max recommendation links shown in the settings score block. */
export const ACCOUNT_SECURITY_MAX_RECOMMENDATIONS = 4;
/** V1: idle lock must be ≤ this many seconds (15 minutes). */
export const ACCOUNT_SECURITY_VAULT_IDLE_MAX_SECONDS = 15 * 60;
/** V3: clipboard clear must be > 0 and ≤ this many seconds (1 minute). */
export const ACCOUNT_SECURITY_VAULT_CLIPBOARD_MAX_SECONDS = 60;
/** V4: master password age must be ≤ this many days (1 year). */
export const ACCOUNT_SECURITY_MASTER_PASSWORD_MAX_AGE_DAYS = 365;

export type AccountSecurityScoreInput = {
  /** Override clock for tests (ms since epoch). */
  nowMs?: number;
  twoFactor: {
    enabled: boolean;
    backupCodesRemaining: number;
    backupCodesGeneratedAt: string | null;
    backupCodesExportedAt: string | null;
  };
  recovery: {
    entitlements: {
      trustedDevices: boolean;
      trustedContacts: boolean;
    };
    settings: {
      keyEnabled: boolean;
      devicesEnabled: boolean;
      contactsEnabled: boolean;
    };
    key: {
      enrolled: boolean;
      exportedAt: string | null;
    };
    confirmedContactCount: number;
    minConfirmedContacts: number;
  };
  devices: {
    /** Used for pending-device recommendations only (not scored). */
    pendingCount: number;
  };
  vault: {
    /** Server `vault_idle_lock_seconds`. */
    idleLockSeconds: number;
    lockOnDeviceSleep: boolean;
    /** 0 = never clear. */
    clipboardClearSeconds: number;
    masterPasswordChangedAt: string | null;
    /** True when `requireReauthZones` includes `deletion`. */
    requireReauthOnDeletion: boolean;
    biometricEnabled: boolean;
    pinEnabled: boolean;
  };
  /**
   * When `available` is false (feature/UI gated off), factor H is excluded
   * from the denominator — same pattern as paid E/F.
   */
  loginMethods?: {
    available: boolean;
    hasPasskeyOrHardware: boolean;
  };
};

export type AccountSecurityScoreResult = {
  score: number;
  rawPoints: number;
  availableMax: number;
  level: AccountSecurityLevel;
  colorBand: AccountSecurityColorBand;
  factorPoints: Record<AccountSecurityFactorId, number>;
  includedFactors: AccountSecurityFactorId[];
  recommendations: AccountSecurityRecommendation[];
};

function daysSince(iso: string | null, nowMs: number): number | null {
  if (!iso) {
    return null;
  }
  const t = Date.parse(iso);
  if (Number.isNaN(t)) {
    return null;
  }
  return Math.max(0, Math.floor((nowMs - t) / (24 * 60 * 60 * 1000)));
}

function scoreBackupCodes(
  input: AccountSecurityScoreInput["twoFactor"],
  nowMs: number,
): number {
  const max = ACCOUNT_SECURITY_FACTOR_WEIGHTS.backupCodes;
  if (!input.enabled || input.backupCodesRemaining <= 0 || !input.backupCodesExportedAt) {
    return 0;
  }
  const age = daysSince(input.backupCodesExportedAt, nowMs);
  if (age == null) {
    return 0;
  }
  const remainingOk = input.backupCodesRemaining >= ACCOUNT_SECURITY_BACKUP_CODES_LOW_THRESHOLD;
  const fresh = age <= ACCOUNT_SECURITY_EXPORT_FRESH_DAYS;
  const withinStale = age <= ACCOUNT_SECURITY_EXPORT_STALE_DAYS;
  if (remainingOk && fresh) {
    return max;
  }
  if (remainingOk && withinStale) {
    return 10;
  }
  if (remainingOk || fresh) {
    return 7;
  }
  return 3;
}

function scoreRecoveryKeyExport(
  key: AccountSecurityScoreInput["recovery"]["key"],
  nowMs: number,
): number {
  if (!key.enrolled) {
    return 0;
  }
  if (!key.exportedAt) {
    return 5;
  }
  const age = daysSince(key.exportedAt, nowMs);
  if (age == null) {
    return 5;
  }
  if (age <= ACCOUNT_SECURITY_EXPORT_FRESH_DAYS) {
    return ACCOUNT_SECURITY_FACTOR_WEIGHTS.recoveryKeyExported;
  }
  if (age <= ACCOUNT_SECURITY_EXPORT_STALE_DAYS) {
    return 7;
  }
  return 5;
}

function isMasterPasswordFresh(changedAt: string | null, nowMs: number): boolean {
  const age = daysSince(changedAt, nowMs);
  if (age == null) {
    return false;
  }
  return age <= ACCOUNT_SECURITY_MASTER_PASSWORD_MAX_AGE_DAYS;
}

function colorBandForScore(score: number): AccountSecurityColorBand {
  if (score >= 90) {
    return "good";
  }
  if (score >= 70) {
    return "almost";
  }
  if (score >= 50) {
    return "medium";
  }
  if (score >= 30) {
    return "weak";
  }
  return "critical";
}

function levelForBand(band: AccountSecurityColorBand): AccountSecurityLevel {
  switch (band) {
    case "good":
      return "excellent";
    case "almost":
      return "good";
    case "medium":
      return "fair";
    case "weak":
      return "poor";
    case "critical":
      return "critical";
  }
}

/**
 * Collect gaps, sort by factor weight (desc), keep
 * {@link ACCOUNT_SECURITY_MAX_RECOMMENDATIONS}.
 */
function buildRecommendations(
  input: AccountSecurityScoreInput,
  nowMs: number,
): AccountSecurityRecommendation[] {
  const out: AccountSecurityRecommendation[] = [];
  const push = (
    id: AccountSecurityRecommendationId,
    target: AccountSecurityRecommendationTarget,
    priority: number,
  ) => {
    if (out.some((r) => r.id === id)) {
      return;
    }
    out.push({ id, target, priority });
  };

  const { twoFactor, recovery, devices, vault, loginMethods } = input;
  const W = ACCOUNT_SECURITY_FACTOR_WEIGHTS;

  if (!twoFactor.enabled) {
    push("enableTwoFactor", "twoFactor", W.twoFactorEnabled);
  } else {
    if (!twoFactor.backupCodesExportedAt || twoFactor.backupCodesRemaining <= 0) {
      push("downloadBackupCodes", "twoFactor", W.backupCodes);
    } else {
      const age = daysSince(twoFactor.backupCodesExportedAt, nowMs);
      const low =
        twoFactor.backupCodesRemaining < ACCOUNT_SECURITY_BACKUP_CODES_LOW_THRESHOLD;
      if (low || (age != null && age > ACCOUNT_SECURITY_EXPORT_FRESH_DAYS)) {
        push("refreshBackupCodes", "twoFactor", W.backupCodes);
      }
    }
  }

  if (!recovery.key.enrolled || !recovery.settings.keyEnabled) {
    push("enrollRecoveryKey", "recovery", W.recoveryKeyEnrolled);
  } else if (!recovery.key.exportedAt) {
    push("exportRecoveryKey", "recovery", W.recoveryKeyExported);
  } else {
    const age = daysSince(recovery.key.exportedAt, nowMs);
    if (age != null && age > ACCOUNT_SECURITY_EXPORT_FRESH_DAYS) {
      push("refreshRecoveryKeyExport", "recovery", W.recoveryKeyExported);
    }
  }

  if (recovery.entitlements.trustedDevices && !recovery.settings.devicesEnabled) {
    push("enableTrustedDevicesRecovery", "recovery", W.trustedDevicesRecovery);
  }

  if (devices.pendingCount > 0) {
    // Same weight band as devices tab hygiene; slightly below method toggle.
    push("confirmPendingDevices", "devices", W.trustedDevicesRecovery - 1);
  }

  if (recovery.entitlements.trustedContacts) {
    if (recovery.confirmedContactCount < recovery.minConfirmedContacts) {
      push("confirmTrustedContacts", "recovery", W.trustedContacts);
    } else if (!recovery.settings.contactsEnabled) {
      push("enableTrustedContacts", "recovery", W.trustedContacts);
    }
  }

  if (loginMethods?.available && !loginMethods.hasPasskeyOrHardware) {
    push("addLoginMethod", "login", W.loginMethods);
  }

  if (vault.idleLockSeconds > ACCOUNT_SECURITY_VAULT_IDLE_MAX_SECONDS) {
    push("shortenVaultIdleLock", "vault", W.vaultIdleLock);
  }
  if (!vault.lockOnDeviceSleep) {
    push("enableVaultLockOnSleep", "vault", W.vaultLockOnSleep);
  }
  if (
    vault.clipboardClearSeconds <= 0 ||
    vault.clipboardClearSeconds > ACCOUNT_SECURITY_VAULT_CLIPBOARD_MAX_SECONDS
  ) {
    push("shortenClipboardClear", "vault", W.vaultClipboardClear);
  }
  if (!isMasterPasswordFresh(vault.masterPasswordChangedAt, nowMs)) {
    push("refreshMasterPassword", "vault", W.vaultMasterPasswordFresh);
  }
  if (!vault.requireReauthOnDeletion) {
    push("requireReauthOnDeletion", "vault", W.vaultReauthOnDeletion);
  }
  if (!vault.biometricEnabled && !vault.pinEnabled) {
    push("enableBiometricOrPin", "vault", W.vaultBiometricOrPin);
  }

  out.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return out.slice(0, ACCOUNT_SECURITY_MAX_RECOMMENDATIONS);
}

/**
 * Pure scorer. Rounding: `Math.round(raw / availableMax * 100)`, clamped 0–100.
 * When `availableMax` is 0 (degenerate), returns 0.
 */
export function computeAccountSecurityScore(
  input: AccountSecurityScoreInput,
): AccountSecurityScoreResult {
  const nowMs = input.nowMs ?? Date.now();
  const includeE = input.recovery.entitlements.trustedDevices;
  const includeF = input.recovery.entitlements.trustedContacts;
  const includeH = Boolean(input.loginMethods?.available);
  const vault = input.vault;

  const factorPoints: Record<AccountSecurityFactorId, number> = {
    twoFactorEnabled: input.twoFactor.enabled
      ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.twoFactorEnabled
      : 0,
    backupCodes: scoreBackupCodes(input.twoFactor, nowMs),
    recoveryKeyEnrolled:
      input.recovery.key.enrolled && input.recovery.settings.keyEnabled
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.recoveryKeyEnrolled
        : 0,
    recoveryKeyExported: scoreRecoveryKeyExport(input.recovery.key, nowMs),
    trustedDevicesRecovery:
      includeE && input.recovery.settings.devicesEnabled
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.trustedDevicesRecovery
        : 0,
    trustedContacts:
      includeF &&
      input.recovery.settings.contactsEnabled &&
      input.recovery.confirmedContactCount >= input.recovery.minConfirmedContacts
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.trustedContacts
        : 0,
    loginMethods:
      includeH && input.loginMethods?.hasPasskeyOrHardware
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.loginMethods
        : 0,
    vaultIdleLock:
      vault.idleLockSeconds > 0 &&
      vault.idleLockSeconds <= ACCOUNT_SECURITY_VAULT_IDLE_MAX_SECONDS
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultIdleLock
        : 0,
    vaultLockOnSleep: vault.lockOnDeviceSleep
      ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultLockOnSleep
      : 0,
    vaultClipboardClear:
      vault.clipboardClearSeconds > 0 &&
      vault.clipboardClearSeconds <= ACCOUNT_SECURITY_VAULT_CLIPBOARD_MAX_SECONDS
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultClipboardClear
        : 0,
    vaultMasterPasswordFresh: isMasterPasswordFresh(vault.masterPasswordChangedAt, nowMs)
      ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultMasterPasswordFresh
      : 0,
    vaultReauthOnDeletion: vault.requireReauthOnDeletion
      ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultReauthOnDeletion
      : 0,
    vaultBiometricOrPin:
      vault.biometricEnabled || vault.pinEnabled
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.vaultBiometricOrPin
        : 0,
  };

  const includedFactors: AccountSecurityFactorId[] = [
    "twoFactorEnabled",
    "backupCodes",
    "recoveryKeyEnrolled",
    "recoveryKeyExported",
    "vaultIdleLock",
    "vaultLockOnSleep",
    "vaultClipboardClear",
    "vaultMasterPasswordFresh",
    "vaultReauthOnDeletion",
    "vaultBiometricOrPin",
  ];
  if (includeE) {
    includedFactors.push("trustedDevicesRecovery");
  }
  if (includeF) {
    includedFactors.push("trustedContacts");
  }
  if (includeH) {
    includedFactors.push("loginMethods");
  }

  let rawPoints = 0;
  let availableMax = 0;
  for (const id of includedFactors) {
    rawPoints += factorPoints[id];
    availableMax += ACCOUNT_SECURITY_FACTOR_WEIGHTS[id];
  }

  const score =
    availableMax <= 0 ? 0 : Math.max(0, Math.min(100, Math.round((rawPoints / availableMax) * 100)));
  const colorBand = colorBandForScore(score);

  return {
    score,
    rawPoints,
    availableMax,
    level: levelForBand(colorBand),
    colorBand,
    factorPoints,
    includedFactors,
    recommendations: buildRecommendations(input, nowMs),
  };
}
