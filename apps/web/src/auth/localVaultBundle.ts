/**
 * Split-key unlock material: per-user localStorage (survives logout + new tabs) plus session mirror.
 * XSS-sensitive; master password still required to derive keys.
 */
import type { EncryptedBlobDto, VaultUnlockBootstrapResponseDto } from "@okkey/types";

import {
  VAULT_BUNDLE_PENDING_KEY,
  VAULT_BUNDLE_STORAGE_KEY,
  vaultBundleScopedStorageKey,
} from "./storageKeys";

export interface StoredVaultBundle {
  server_key_share_b64: string;
  device_share_b64: string;
  password_kdf_salt_b64: string;
  password_kdf_params_version: number;
  encrypted_private_key: EncryptedBlobDto;
}

function parseBundle(raw: string | null): StoredVaultBundle | null {
  if (!raw) {
    return null;
  }
  try {
    const o = JSON.parse(raw) as StoredVaultBundle;
    if (
      !o.server_key_share_b64 ||
      !o.device_share_b64 ||
      !o.password_kdf_salt_b64 ||
      typeof o.password_kdf_params_version !== "number" ||
      !o.encrypted_private_key ||
      typeof o.encrypted_private_key !== "object"
    ) {
      return null;
    }
    return o;
  } catch {
    return null;
  }
}

function sessionStorageOk(): boolean {
  return (
    typeof sessionStorage !== "undefined" &&
    typeof sessionStorage.getItem === "function" &&
    typeof sessionStorage.setItem === "function" &&
    typeof sessionStorage.removeItem === "function"
  );
}

function localStorageOk(): boolean {
  return (
    typeof localStorage !== "undefined" &&
    typeof localStorage.getItem === "function" &&
    typeof localStorage.setItem === "function" &&
    typeof localStorage.removeItem === "function"
  );
}

function readLocalKey(key: string): StoredVaultBundle | null {
  if (!localStorageOk()) {
    return null;
  }
  return parseBundle(localStorage.getItem(key));
}

function syncSessionMirror(bundle: StoredVaultBundle): void {
  if (sessionStorageOk()) {
    sessionStorage.setItem(VAULT_BUNDLE_STORAGE_KEY, JSON.stringify(bundle));
  }
}

/**
 * @param userId — текущий пользователь из сессии; `null` на шаге регистрации до выдачи токена.
 */
export function readVaultBundle(userId: string | null): StoredVaultBundle | null {
  if (userId) {
    const scopedKey = vaultBundleScopedStorageKey(userId);
    let bundle = readLocalKey(scopedKey);

    if (!bundle && localStorageOk()) {
      const legacy = readLocalKey(VAULT_BUNDLE_STORAGE_KEY);
      if (legacy) {
        try {
          localStorage.setItem(scopedKey, JSON.stringify(legacy));
          localStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
        } catch {
          /* ignore */
        }
        bundle = legacy;
      }
    }

    if (bundle) {
      syncSessionMirror(bundle);
      return bundle;
    }

    if (sessionStorageOk()) {
      return parseBundle(sessionStorage.getItem(VAULT_BUNDLE_STORAGE_KEY));
    }
    return null;
  }

  if (sessionStorageOk()) {
    const s = parseBundle(sessionStorage.getItem(VAULT_BUNDLE_STORAGE_KEY));
    if (s) {
      return s;
    }
  }
  return readLocalKey(VAULT_BUNDLE_PENDING_KEY);
}

export function writeVaultBundle(bundle: StoredVaultBundle, userId: string | null): void {
  const json = JSON.stringify(bundle);
  syncSessionMirror(bundle);
  if (!localStorageOk()) {
    return;
  }
  try {
    if (userId) {
      localStorage.setItem(vaultBundleScopedStorageKey(userId), json);
    } else {
      localStorage.setItem(VAULT_BUNDLE_PENDING_KEY, json);
    }
  } catch {
    /* quota / private mode */
  }
}

/** После регистрации: переносит pending bundle в хранилище пользователя. */
export function finalizePendingVaultBundle(userId: string): void {
  if (!localStorageOk()) {
    return;
  }
  const pendingRaw = localStorage.getItem(VAULT_BUNDLE_PENDING_KEY);
  if (!pendingRaw) {
    return;
  }
  const scopedKey = vaultBundleScopedStorageKey(userId);
  try {
    localStorage.setItem(scopedKey, pendingRaw);
    localStorage.removeItem(VAULT_BUNDLE_PENDING_KEY);
    localStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Подтягивает старый единый ключ `okkey.vault.bundle` к пользователю (один аккаунт на профиль браузера). */
export function migrateLegacyVaultBundleToUser(userId: string): void {
  if (!localStorageOk()) {
    return;
  }
  const scopedKey = vaultBundleScopedStorageKey(userId);
  if (localStorage.getItem(scopedKey)) {
    return;
  }
  const legacy = localStorage.getItem(VAULT_BUNDLE_STORAGE_KEY);
  if (!legacy) {
    return;
  }
  try {
    localStorage.setItem(scopedKey, legacy);
    localStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Выход из аккаунта: убираем только зеркало в sessionStorage, локальные ключи пользователя оставляем. */
export function clearVaultBundleSessionMirror(): void {
  if (sessionStorageOk()) {
    sessionStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
  }
}

/** Незавершённая регистрация — не оставляем pending другому аккаунту на этом браузере. */
export function clearPendingVaultBundle(): void {
  if (!localStorageOk()) {
    return;
  }
  try {
    localStorage.removeItem(VAULT_BUNDLE_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Полная очистка (редко): legacy + pending + scoped для одного userId. */
export function clearVaultBundleForUser(userId: string): void {
  clearVaultBundleSessionMirror();
  if (!localStorageOk()) {
    return;
  }
  try {
    localStorage.removeItem(vaultBundleScopedStorageKey(userId));
    localStorage.removeItem(VAULT_BUNDLE_PENDING_KEY);
    localStorage.removeItem(VAULT_BUNDLE_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function mapVaultUnlockBootstrapToStored(dto: VaultUnlockBootstrapResponseDto): StoredVaultBundle {
  return {
    server_key_share_b64: dto.server_key_share,
    device_share_b64: dto.device_share,
    password_kdf_salt_b64: dto.password_kdf_salt,
    password_kdf_params_version: dto.password_kdf_params_version,
    encrypted_private_key: dto.encrypted_private_key,
  };
}
