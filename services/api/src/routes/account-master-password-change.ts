import type { IncomingMessage } from "node:http";
import { isCurrentMasterPasswordPolicyVersion } from "@okkey/types";

import { createLoginVerifier, decodeLoginKey } from "../crypto/login-verifier.ts";
import { json, readJsonBody, type RouteHandler } from "../http.ts";
import type { UsersRepository } from "../storage/repositories.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

const SHARE_LEN = 32;
const KDF_SALT_LEN = 16;
const SUPPORTED_KDF_PARAMS_VERSIONS = new Set([1, 2]);

type MasterPasswordChangeBody = {
  server_key_share?: unknown;
  password_kdf_salt?: unknown;
  password_kdf_params_version?: unknown;
  /** Client attestation of the current new-password policy. Not a password or length. */
  master_password_policy_version?: unknown;
  /** Base64 32-byte login key for the new master password. Not the password. */
  login_key?: unknown;
};

function decodeBase64Exact(value: unknown, expectedLen: number, label: string): Uint8Array | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const bytes = Uint8Array.from(Buffer.from(trimmed, "base64"));
    if (bytes.length !== expectedLen) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * `POST /account/master-password/change` — client sends rebalanced server share A' + new KDF salt.
 * Does not accept master password, C, VaultKey, or device share B.
 */
export function createAccountMasterPasswordChangeRoute(
  users: Pick<UsersRepository, "updateMasterPasswordShares">,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }

    const body = await readJsonBody<MasterPasswordChangeBody>(ctx.req);
    const serverKeyShare = decodeBase64Exact(body.server_key_share, SHARE_LEN, "server_key_share");
    const passwordKdfSalt = decodeBase64Exact(body.password_kdf_salt, KDF_SALT_LEN, "password_kdf_salt");
    const paramsVersion =
      typeof body.password_kdf_params_version === "number"
        ? body.password_kdf_params_version
        : typeof body.password_kdf_params_version === "string"
          ? Number(body.password_kdf_params_version)
          : NaN;

    if (
      !serverKeyShare ||
      !passwordKdfSalt ||
      !Number.isInteger(paramsVersion) ||
      !SUPPORTED_KDF_PARAMS_VERSIONS.has(paramsVersion)
    ) {
      json(
        ctx.res,
        400,
        errorPayload("INVALID_MASTER_PASSWORD_CHANGE", "master password change payload is invalid", ctx.requestId),
      );
      return;
    }

    let loginVerifier: {
      verifier: Uint8Array;
      salt: Uint8Array;
      paramsVersion: number;
    } | null = null;
    if (body.login_key !== undefined && body.login_key !== "") {
      const loginKey = decodeLoginKey(body.login_key);
      if (!loginKey) {
        json(
          ctx.res,
          400,
          errorPayload("INVALID_MASTER_PASSWORD_CHANGE", "login_key must be 32 bytes", ctx.requestId),
        );
        return;
      }
      loginVerifier = createLoginVerifier(loginKey);
    }

    if (!isCurrentMasterPasswordPolicyVersion(body.master_password_policy_version)) {
      json(
        ctx.res,
        400,
        errorPayload(
          "MASTER_PASSWORD_POLICY_REJECTED",
          "master_password_policy_version is not the current policy",
          ctx.requestId,
        ),
      );
      return;
    }

    const changedAt = await users.updateMasterPasswordShares(userId, {
      serverKeyShare,
      passwordKdfSalt,
      passwordKdfParamsVersion: paramsVersion,
      // Absent login_key clears a verifier tied to the previous password.
      loginVerifier,
    });
    if (!changedAt) {
      json(ctx.res, 404, errorPayload("USER_NOT_FOUND", "user not found", ctx.requestId));
      return;
    }

    json(ctx.res, 200, { master_password_changed_at: changedAt });
  };
}
