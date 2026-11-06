import type { IncomingMessage } from "node:http";
import { MldsaIdentityKeyError, MldsaIdentityKeyService } from "../account/mldsa-identity-key.ts";
import { json, readJsonBody, type RouteHandler } from "../http.ts";

function errorPayload(code: string, message: string, requestId: string) {
  return { error: code, message, requestId };
}

type UploadBody = {
  public_key?: unknown;
  encrypted_private_key?: unknown;
  signature?: unknown;
};

/** `POST /account/identity/mldsa-key` — publish an ML-DSA-65 verifying key. */
export function createAccountMlDsaIdentityKeyRoute(
  service: MldsaIdentityKeyService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const userId = await resolveUserId(ctx.req);
    if (!userId) {
      json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
      return;
    }
    let body: UploadBody;
    try {
      body = await readJsonBody<UploadBody>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("MLDSA_KEY_INVALID", "invalid json", ctx.requestId));
      return;
    }
    if (typeof body.public_key !== "string" || typeof body.signature !== "string") {
      json(ctx.res, 400, errorPayload("MLDSA_KEY_INVALID", "public_key and signature are required", ctx.requestId));
      return;
    }
    try {
      const result = await service.upload({
        userId,
        publicKeyBase64: body.public_key,
        encryptedPrivateKey: body.encrypted_private_key,
        signatureBase64: body.signature,
      });
      json(ctx.res, 200, result);
    } catch (error) {
      if (error instanceof MldsaIdentityKeyError) {
        json(ctx.res, error.statusCode, errorPayload(error.code, error.message, ctx.requestId));
        return;
      }
      throw error;
    }
  };
}
