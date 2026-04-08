import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import { RegistrationError, type RegistrationService } from "../registration/service.ts";
import type { EncryptedBlob } from "../crypto/encrypted-blob.ts";

interface RegisterCompleteBody {
  auth_state_id?: string;
  user_public_key?: string;
  user_public_pq_key?: string;
  encrypted_private_key?: unknown;
  server_key_share?: string;
  password_kdf_salt?: string;
  password_kdf_params_version?: number;
  device_public_key?: string;
  device_share?: string;
  device_fingerprint?: string;
  device_name?: string;
  platform?: string;
  os_name?: string;
  os_version?: string;
  app_version?: string;
  client_type?: string;
  user_agent?: string;
  /** Optional display name for the default personal workspace and personal vault (e.g. localized "Personal" / "Личный"). */
  personal_workspace_name?: string;
  /** Optional; persisted for UI when client storage is cleared. */
  first_name?: string;
  last_name?: string;
  metadata?: {
    platform?: string;
    os_name?: string;
    os_version?: string;
    app_version?: string;
    client_type?: string;
    user_agent?: string;
    crypto_capable?: boolean;
  };
}

const PERSONAL_WORKSPACE_NAME_MAX_LEN = 128;
const PROFILE_NAME_MAX_LEN = 128;

function parsePersonalWorkspaceName(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const t = raw.trim();
  if (t.length === 0) {
    return null;
  }
  if (t.length > PERSONAL_WORKSPACE_NAME_MAX_LEN) {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(t)) {
    return null;
  }
  return t;
}

function parseOptionalProfileName(raw: string | undefined): string | null {
  if (raw === undefined) {
    return null;
  }
  const t = raw.trim();
  if (t.length === 0) {
    return null;
  }
  if (t.length > PROFILE_NAME_MAX_LEN) {
    return null;
  }
  if (/[\u0000-\u001f\u007f]/.test(t)) {
    return null;
  }
  return t;
}

function requestIpFromHeaders(forwardedFor: string | undefined): string {
  if (!forwardedFor) {
    return "unknown";
  }
  const first = forwardedFor.split(",")[0]?.trim();
  return first || "unknown";
}

function getRequestIp(req: Parameters<typeof getHeader>[0]): string {
  return requestIpFromHeaders(getHeader(req, "x-forwarded-for"));
}

function resolveMetadata(body: RegisterCompleteBody): {
  platform: string;
  osName: string;
  osVersion: string;
  appVersion: string;
  clientType: string;
  userAgent: string;
  deviceCryptoCapable: boolean;
} {
  const metadata = body.metadata ?? {};
  return {
    platform: metadata.platform ?? body.platform ?? "unknown",
    osName: metadata.os_name ?? body.os_name ?? "unknown",
    osVersion: metadata.os_version ?? body.os_version ?? "unknown",
    appVersion: metadata.app_version ?? body.app_version ?? "unknown",
    clientType: metadata.client_type ?? body.client_type ?? "unknown",
    userAgent: metadata.user_agent ?? body.user_agent ?? "",
    deviceCryptoCapable: metadata.crypto_capable === true,
  };
}

function decodeRequiredBase64(value: string | undefined): Uint8Array | null {
  if (!value?.trim()) {
    return null;
  }
  try {
    const buf = Uint8Array.from(Buffer.from(value.trim(), "base64"));
    return buf;
  } catch {
    return null;
  }
}

export function createRegisterCompleteRoute(
  registrationService: RegistrationService,
): RouteHandler {
  return async (ctx) => {
    let body: RegisterCompleteBody;
    try {
      body = await readJsonBody<RegisterCompleteBody>(ctx.req);
    } catch {
      json(
        ctx.res,
        400,
        errorPayload("REGISTRATION_BAD_REQUEST", "invalid json", ctx.requestId),
      );
      return;
    }

    if (!body.auth_state_id?.trim()) {
      json(
        ctx.res,
        400,
        errorPayload("REGISTRATION_BAD_REQUEST", "auth_state_id is required", ctx.requestId),
      );
      return;
    }

    const requiredString = [
      ["user_public_key", body.user_public_key],
      ["user_public_pq_key", body.user_public_pq_key],
      ["encrypted_private_key", body.encrypted_private_key],
      ["server_key_share", body.server_key_share],
      ["password_kdf_salt", body.password_kdf_salt],
      ["device_public_key", body.device_public_key],
      ["device_share", body.device_share],
      ["device_fingerprint", body.device_fingerprint],
      ["device_name", body.device_name],
    ] as const;
    for (const [name, val] of requiredString) {
      if (!val || (typeof val === "string" && !val.trim())) {
        json(
          ctx.res,
          400,
          errorPayload(
            "REGISTRATION_BAD_REQUEST",
            `${name} is required`,
            ctx.requestId,
          ),
        );
        return;
      }
    }

    if (body.password_kdf_params_version === undefined) {
      json(
        ctx.res,
        400,
        errorPayload(
          "REGISTRATION_BAD_REQUEST",
          "password_kdf_params_version is required",
          ctx.requestId,
        ),
      );
      return;
    }

    if (!body.encrypted_private_key || typeof body.encrypted_private_key !== "object") {
      json(
        ctx.res,
        400,
        errorPayload(
          "REGISTRATION_BAD_REQUEST",
          "encrypted_private_key must be an EncryptedBlob object",
          ctx.requestId,
        ),
      );
      return;
    }

    const personalWorkspaceName = parsePersonalWorkspaceName(body.personal_workspace_name);
    if (
      body.personal_workspace_name !== undefined &&
      body.personal_workspace_name.trim() !== "" &&
      personalWorkspaceName === null
    ) {
      json(
        ctx.res,
        400,
        errorPayload(
          "REGISTRATION_BAD_REQUEST",
          "personal_workspace_name is invalid (length, control characters)",
          ctx.requestId,
        ),
      );
      return;
    }

    const firstNameForDb = parseOptionalProfileName(body.first_name);
    if (
      body.first_name !== undefined &&
      body.first_name.trim() !== "" &&
      firstNameForDb === null
    ) {
      json(
        ctx.res,
        400,
        errorPayload(
          "REGISTRATION_BAD_REQUEST",
          "first_name is invalid (length, control characters)",
          ctx.requestId,
        ),
      );
      return;
    }

    const lastNameForDb = parseOptionalProfileName(body.last_name);
    if (
      body.last_name !== undefined &&
      body.last_name.trim() !== "" &&
      lastNameForDb === null
    ) {
      json(
        ctx.res,
        400,
        errorPayload(
          "REGISTRATION_BAD_REQUEST",
          "last_name is invalid (length, control characters)",
          ctx.requestId,
        ),
      );
      return;
    }

    const srvShare = decodeRequiredBase64(body.server_key_share);
    const kdfSalt = decodeRequiredBase64(body.password_kdf_salt);
    const devShare = decodeRequiredBase64(body.device_share);

    if (!srvShare || !kdfSalt || !devShare) {
      json(
        ctx.res,
        400,
        errorPayload(
          "REGISTRATION_BAD_REQUEST",
          "invalid base64 in binary fields",
          ctx.requestId,
        ),
      );
      return;
    }

    const meta = resolveMetadata(body);
    const userAgent =
      meta.userAgent.trim() || getHeader(ctx.req, "user-agent") || "unknown";

    try {
      const result = await registrationService.completeRegistration({
        authStateId: body.auth_state_id.trim(),
        userPublicKey: body.user_public_key!.trim(),
        userPublicPqKey: body.user_public_pq_key!.trim(),
        encryptedPrivateKey: body.encrypted_private_key as EncryptedBlob,
        serverKeyShare: srvShare,
        passwordKdfSalt: kdfSalt,
        passwordKdfParamsVersion: body.password_kdf_params_version,
        deviceFingerprint: body.device_fingerprint!.trim(),
        deviceName: body.device_name!.trim(),
        devicePublicKey: body.device_public_key!.trim(),
        deviceShare: devShare,
        platform: meta.platform,
        osName: meta.osName,
        osVersion: meta.osVersion,
        appVersion: meta.appVersion,
        clientType: meta.clientType,
        userAgent,
        requestIp: getRequestIp(ctx.req),
        deviceCryptoCapable: meta.deviceCryptoCapable,
        personalWorkspaceName: personalWorkspaceName ?? undefined,
        firstName: firstNameForDb,
        lastName: lastNameForDb,
      });

      json(ctx.res, 201, {
        user_id: result.userId,
        workspace_id: result.workspaceId,
        vault_id: result.vaultId,
        device_id: result.deviceId,
        device_status: result.deviceStatus,
        access_token: result.accessToken,
        expires_at: result.expiresAt,
        token_type: result.tokenType,
      });
    } catch (error) {
      handleRegistrationError(ctx.requestId, ctx.res, error);
    }
  };
}

function handleRegistrationError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof RegistrationError) {
    json(res, error.statusCode, {
      error: error.code,
      message: error.message,
      requestId,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }

  json(
    res,
    500,
    errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId),
  );
}

function errorPayload(code: string, message: string, requestId: string) {
  return {
    error: code,
    message,
    requestId,
  };
}
