import type { KeyFieldSecretKind } from "@okkey/ui";

export type { KeyFieldSecretKind };

export type KeyFormSecretFieldLike = {
  id?: string;
  type: string;
  value: unknown;
  secretKind?: KeyFieldSecretKind;
};

export function isPinField(field: KeyFormSecretFieldLike): boolean {
  return field.type === "pin";
}

export function shouldConcealPinField(field: KeyFormSecretFieldLike, isVisible: boolean): boolean {
  if (!isPinField(field)) {
    return false;
  }
  if (isVisible || isSecretFieldEmpty(field)) {
    return false;
  }
  return true;
}

export function isFixedPasswordField(field: KeyFormSecretFieldLike): boolean {
  return field.type === "password";
}

export function isSecretLikeField(field: KeyFormSecretFieldLike): boolean {
  return field.type === "secret" || field.type === "password";
}

export function isConfigurableSecretField(field: KeyFormSecretFieldLike): boolean {
  return field.type === "secret";
}

export function getSecretKind(field: KeyFormSecretFieldLike): KeyFieldSecretKind {
  if (field.type === "password") {
    return "password";
  }
  return field.secretKind ?? "password";
}

export function secretFieldShowsStrength(field: KeyFormSecretFieldLike): boolean {
  return isSecretLikeField(field) && getSecretKind(field) === "password";
}

export function isSecretFieldEmpty(field: KeyFormSecretFieldLike): boolean {
  return isSecretLikeField(field) && typeof field.value === "string" && field.value.trim().length === 0;
}

export function shouldConcealSecretField(
  field: KeyFormSecretFieldLike,
  isVisible: boolean,
  isGeneratorOpen: boolean,
): boolean {
  if (!isSecretLikeField(field)) {
    return false;
  }
  if (isVisible || isGeneratorOpen || isSecretFieldEmpty(field)) {
    return false;
  }
  return true;
}

export function shouldOpenGeneratorOnFocus(field: KeyFormSecretFieldLike): boolean {
  if (field.id !== "password") {
    return false;
  }
  return isFixedPasswordField(field) && isSecretFieldEmpty(field);
}

export function showSecretLabelKey(field: KeyFormSecretFieldLike): "password" | "secret" {
  return getSecretKind(field) === "password" ? "password" : "secret";
}
