import type { CrackTimeLabelKey, PasswordStrengthLabelKey } from "../components/key-form/keyFormI18n";

export type PasswordStrength = {
  labelKey: PasswordStrengthLabelKey;
  value: number;
  tone: "success" | "warning" | "danger";
  entropyBits: number;
};

export const passwordStrengthTextClassName: Record<PasswordStrengthLabelKey, string> = {
  weak: "text-destructive",
  fair: "text-amber-600",
  good: "text-amber-600",
  strong: "text-lime-600",
  excellent: "text-lime-700",
};

/** Bucket for monitoring donut (3 segments). */
export type MonitoringStrengthBucket = "strong" | "medium" | "weak";

export function getPasswordEntropyBits(password: string): number {
  if (password.length === 0) {
    return 0;
  }

  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSymbols = /[^A-Za-z0-9]/.test(password);
  const characterPoolSize =
    (hasLowercase ? 26 : 0) +
    (hasUppercase ? 26 : 0) +
    (hasNumbers ? 10 : 0) +
    (hasSymbols ? 16 : 0);
  const uniqueRatio = new Set(password).size / password.length;
  const hasPassphraseShape = /[A-Za-z0-9]+[-_\s][A-Za-z0-9]+[-_\s][A-Za-z0-9]+/.test(password);
  const repeatedRuns = password.match(/(.)\1{2,}/g) ?? [];
  const hasCommonSequence = /(1234|abcd|qwerty|password|admin|letmein)/i.test(password);
  const hasKeyboardWalk = /(qwer|asdf|zxcv|йцу|фыв)/i.test(password);
  const hasMostlySingleCharacter = uniqueRatio <= 0.25 && password.length >= 6;

  let entropyBits = password.length * Math.log2(Math.max(characterPoolSize, 1));
  entropyBits *= Math.max(0.35, Math.min(1, uniqueRatio + 0.25));
  entropyBits += hasPassphraseShape ? 10 : 0;
  entropyBits -= repeatedRuns.reduce((penalty, run) => penalty + run.length * 2, 0);
  entropyBits -= hasCommonSequence ? 20 : 0;
  entropyBits -= hasKeyboardWalk ? 14 : 0;
  entropyBits -= hasMostlySingleCharacter ? 24 : 0;

  return Math.max(1, entropyBits);
}

export function getPasswordStrength(password: string): PasswordStrength | null {
  if (password.length === 0) {
    return null;
  }

  const entropyBits = getPasswordEntropyBits(password);
  const value = Math.min(10, Math.max(1, Math.round(entropyBits / 8)));
  if (entropyBits < 36) {
    return { labelKey: "weak", value, tone: "danger", entropyBits };
  }
  if (entropyBits < 50) {
    return { labelKey: "fair", value, tone: "warning", entropyBits };
  }
  if (entropyBits < 64) {
    return { labelKey: "good", value, tone: "warning", entropyBits };
  }
  if (entropyBits < 80) {
    return { labelKey: "strong", value, tone: "success", entropyBits };
  }
  return { labelKey: "excellent", value, tone: "success", entropyBits };
}

export function estimatePasswordCrackTimeKey(password: string): CrackTimeLabelKey {
  if (!password) {
    return "instantly";
  }

  const entropyBits = getPasswordEntropyBits(password);
  if (entropyBits < 28) return "instantly";
  if (entropyBits < 36) return "hours";
  if (entropyBits < 44) return "days";
  if (entropyBits < 52) return "months";
  if (entropyBits < 60) return "years";
  if (entropyBits < 72) return "decades";
  if (entropyBits < 84) return "centuries";
  return "forever";
}

export function toMonitoringStrengthBucket(labelKey: PasswordStrengthLabelKey): MonitoringStrengthBucket {
  if (labelKey === "weak") {
    return "weak";
  }
  if (labelKey === "fair" || labelKey === "good") {
    return "medium";
  }
  return "strong";
}
