/**
 * Client-side account security score (0–100).
 *
 * Personal account hygiene only (2FA, recovery, devices, login methods) —
 * not vault item monitoring (weak/reused passwords).
 *
 * Paid factors (trusted devices / contacts recovery) and optional login-methods
 * are excluded from the denominator when unavailable (FREE renormalization).
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
  /** E — trusted devices recovery method enabled (paid; devices presence is G) */
  trustedDevicesRecovery: 15,
  /** F — trusted contacts recovery (paid) */
  trustedContacts: 10,
  /**
   * G — at least one trusted device.
   * Included only when device recovery is entitled **and** the method is enabled
   * (same renormalization gate as E).
   */
  trustedDevicesPresent: 5,
  /** H — passkey / hardware login method */
  loginMethods: 5,
} as const;

export type AccountSecurityFactorId = keyof typeof ACCOUNT_SECURITY_FACTOR_WEIGHTS;

/** Approved color bands for the shield (by final score after renormalization). */
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
  | "addTrustedDevice"
  | "confirmPendingDevices"
  | "enableTrustedContacts"
  | "confirmTrustedContacts"
  | "addLoginMethod";

/** Settings popup menu target for recommendation CTAs. */
export type AccountSecurityRecommendationTarget =
  | "twoFactor"
  | "recovery"
  | "devices"
  | "login";

export type AccountSecurityRecommendation = {
  id: AccountSecurityRecommendationId;
  target: AccountSecurityRecommendationTarget;
};

export const ACCOUNT_SECURITY_EXPORT_FRESH_DAYS = 90;
export const ACCOUNT_SECURITY_EXPORT_STALE_DAYS = 180;
/** Remaining backup codes below this are treated as low stock. */
export const ACCOUNT_SECURITY_BACKUP_CODES_LOW_THRESHOLD = 3;

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
    trustedCount: number;
    pendingCount: number;
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

function buildRecommendations(input: AccountSecurityScoreInput, nowMs: number): AccountSecurityRecommendation[] {
  const out: AccountSecurityRecommendation[] = [];
  const push = (id: AccountSecurityRecommendationId, target: AccountSecurityRecommendationTarget) => {
    if (out.some((r) => r.id === id)) {
      return;
    }
    out.push({ id, target });
  };

  const { twoFactor, recovery, devices, loginMethods } = input;

  if (!twoFactor.enabled) {
    push("enableTwoFactor", "twoFactor");
  } else {
    if (!twoFactor.backupCodesExportedAt || twoFactor.backupCodesRemaining <= 0) {
      push("downloadBackupCodes", "twoFactor");
    } else {
      const age = daysSince(twoFactor.backupCodesExportedAt, nowMs);
      const low =
        twoFactor.backupCodesRemaining < ACCOUNT_SECURITY_BACKUP_CODES_LOW_THRESHOLD;
      if (low || (age != null && age > ACCOUNT_SECURITY_EXPORT_FRESH_DAYS)) {
        push("refreshBackupCodes", "twoFactor");
      }
    }
  }

  // Device recovery: surface trusted-device gap early when the method is on
  // (must not be dropped by the recommendation cap).
  if (recovery.entitlements.trustedDevices && recovery.settings.devicesEnabled) {
    if (devices.trustedCount < 1) {
      push("addTrustedDevice", "devices");
    } else if (devices.pendingCount > 0) {
      push("confirmPendingDevices", "devices");
    }
  }

  if (!recovery.key.enrolled || !recovery.settings.keyEnabled) {
    push("enrollRecoveryKey", "recovery");
  } else if (!recovery.key.exportedAt) {
    push("exportRecoveryKey", "recovery");
  } else {
    const age = daysSince(recovery.key.exportedAt, nowMs);
    if (age != null && age > ACCOUNT_SECURITY_EXPORT_FRESH_DAYS) {
      push("refreshRecoveryKeyExport", "recovery");
    }
  }

  if (recovery.entitlements.trustedDevices && !recovery.settings.devicesEnabled) {
    push("enableTrustedDevicesRecovery", "recovery");
  }

  if (!recovery.entitlements.trustedDevices && devices.pendingCount > 0) {
    push("confirmPendingDevices", "devices");
  }

  if (recovery.entitlements.trustedContacts) {
    if (recovery.confirmedContactCount < recovery.minConfirmedContacts) {
      push("confirmTrustedContacts", "recovery");
    } else if (!recovery.settings.contactsEnabled) {
      push("enableTrustedContacts", "recovery");
    }
  }

  if (loginMethods?.available && !loginMethods.hasPasskeyOrHardware) {
    push("addLoginMethod", "login");
  }

  return out.slice(0, 4);
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
  /** G counts only when device recovery is available and the method is on. */
  const includeG = includeE && input.recovery.settings.devicesEnabled;

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
    /** Method toggle only — trusted-device count is factor G. */
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
    trustedDevicesPresent:
      includeG && input.devices.trustedCount >= 1
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.trustedDevicesPresent
        : 0,
    loginMethods:
      includeH && input.loginMethods?.hasPasskeyOrHardware
        ? ACCOUNT_SECURITY_FACTOR_WEIGHTS.loginMethods
        : 0,
  };

  const includedFactors: AccountSecurityFactorId[] = [
    "twoFactorEnabled",
    "backupCodes",
    "recoveryKeyEnrolled",
    "recoveryKeyExported",
  ];
  if (includeE) {
    includedFactors.push("trustedDevicesRecovery");
  }
  if (includeG) {
    includedFactors.push("trustedDevicesPresent");
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
