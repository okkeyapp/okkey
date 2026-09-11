import type { IncomingMessage } from "node:http";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { getHeader, json, readJsonBody, type RouteHandler } from "../http.ts";
import {
  WebAuthnError,
  type WebAuthnService,
  type LoginMethodsResponse,
} from "../webauthn/service.ts";
import type { PrimaryLoginMethod, WebAuthnAttachment } from "../webauthn/repository.ts";

function requestIpFromHeaders(forwardedFor: string | undefined): string {
  if (!forwardedFor) {
    return "unknown";
  }
  const first = forwardedFor.split(",")[0]?.trim();
  return first || "unknown";
}

function getRequestIp(req: IncomingMessage): string {
  return requestIpFromHeaders(getHeader(req, "x-forwarded-for"));
}

function errorPayload(
  code: string,
  message: string,
  requestId: string,
  details?: Record<string, unknown>,
) {
  return {
    error: code,
    message,
    requestId,
    ...(details ? { details } : {}),
  };
}

function handleWebAuthnError(
  requestId: string,
  res: Parameters<typeof json>[0],
  error: unknown,
): void {
  if (error instanceof WebAuthnError) {
    json(
      res,
      error.statusCode,
      errorPayload(error.code, error.message, requestId, error.details),
    );
    return;
  }
  json(res, 500, errorPayload("INTERNAL_SERVER_ERROR", "internal server error", requestId));
}

function wireLoginMethods(methods: LoginMethodsResponse) {
  return {
    primary: methods.primary,
    email: methods.email,
    passkeys: methods.passkeys.map((c) => ({
      id: c.id,
      name: c.name,
      created_at: c.createdAt,
      last_used_at: c.lastUsedAt,
    })),
    hardware_keys: methods.hardwareKeys.map((c) => ({
      id: c.id,
      name: c.name,
      created_at: c.createdAt,
      last_used_at: c.lastUsedAt,
    })),
  };
}

function parseAttachment(raw: unknown): WebAuthnAttachment | null {
  if (raw === "platform" || raw === "cross-platform") {
    return raw;
  }
  return null;
}

function parsePrimary(raw: unknown): PrimaryLoginMethod | null {
  if (raw === "email" || raw === "passkey" || raw === "hardware_key") {
    return raw;
  }
  return null;
}

export function createLoginMethodsGetRoute(
  webauthnService: WebAuthnService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const methods = await webauthnService.getLoginMethods(userId);
      json(ctx.res, 200, wireLoginMethods(methods));
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createLoginMethodsPrimaryPatchRoute(
  webauthnService: WebAuthnService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    let body: { primary?: string };
    try {
      body = await readJsonBody<{ primary?: string }>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    const primary = parsePrimary(body.primary);
    if (!primary) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "primary must be email|passkey|hardware_key", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const methods = await webauthnService.setPrimary(userId, primary);
      json(ctx.res, 200, wireLoginMethods(methods));
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWebAuthnRegisterOptionsRoute(
  webauthnService: WebAuthnService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    let body: { attachment?: string };
    try {
      body = await readJsonBody<{ attachment?: string }>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    const attachment = parseAttachment(body.attachment);
    if (!attachment) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "attachment must be platform|cross-platform", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const result = await webauthnService.registrationOptions(userId, attachment);
      json(ctx.res, 200, {
        challengeId: result.challengeId,
        options: result.options,
      });
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWebAuthnRegisterVerifyRoute(
  webauthnService: WebAuthnService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    let body: {
      challengeId?: string;
      response?: RegistrationResponseJSON;
      name?: string;
    };
    try {
      body = await readJsonBody(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (!body.challengeId?.trim() || !body.response) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "challengeId and response are required", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const methods = await webauthnService.registrationVerify(userId, {
        challengeId: body.challengeId.trim(),
        response: body.response,
        name: body.name,
      });
      json(ctx.res, 200, wireLoginMethods(methods));
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWebAuthnCredentialDeleteRoute(
  webauthnService: WebAuthnService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const credentialId = ctx.params.credentialId?.trim() ?? "";
    if (!credentialId) {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "credentialId is required", ctx.requestId));
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const methods = await webauthnService.deleteCredential(userId, credentialId);
      json(ctx.res, 200, wireLoginMethods(methods));
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWebAuthnCredentialsBulkDeleteRoute(
  webauthnService: WebAuthnService,
  resolveUserId: (req: IncomingMessage) => Promise<string | null>,
): RouteHandler {
  return async (ctx) => {
    const url = new URL(ctx.req.url ?? "", "http://localhost");
    const attachment = parseAttachment(url.searchParams.get("attachment"));
    if (!attachment) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "attachment query must be platform|cross-platform", ctx.requestId),
      );
      return;
    }
    try {
      const userId = await resolveUserId(ctx.req);
      if (!userId) {
        json(ctx.res, 401, errorPayload("AUTH_REQUIRED", "auth required", ctx.requestId));
        return;
      }
      const methods = await webauthnService.deleteCredentialsByAttachment(userId, attachment);
      json(ctx.res, 200, wireLoginMethods(methods));
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createAuthLoginDiscoverRoute(webauthnService: WebAuthnService): RouteHandler {
  return async (ctx) => {
    let body: { email?: string };
    try {
      body = await readJsonBody<{ email?: string }>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (!body.email?.trim()) {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "email is required", ctx.requestId));
      return;
    }
    try {
      const result = await webauthnService.discoverLoginMethods(body.email);
      json(ctx.res, 200, result);
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWebAuthnLoginOptionsRoute(webauthnService: WebAuthnService): RouteHandler {
  return async (ctx) => {
    let body: { email?: string; attachment?: string };
    try {
      body = await readJsonBody<{ email?: string; attachment?: string }>(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    const attachment = body.attachment ? parseAttachment(body.attachment) : undefined;
    if (body.attachment && !attachment) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "attachment must be platform|cross-platform", ctx.requestId),
      );
      return;
    }
    try {
      // Touch IP for future rate-limit hooks (parity with email auth).
      void getRequestIp(ctx.req);
      const result = await webauthnService.authenticationOptions({
        email: body.email,
        attachment: attachment ?? undefined,
      });
      json(ctx.res, 200, {
        challengeId: result.challengeId,
        options: result.options,
      });
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}

export function createWebAuthnLoginVerifyRoute(webauthnService: WebAuthnService): RouteHandler {
  return async (ctx) => {
    let body: {
      challengeId?: string;
      response?: AuthenticationResponseJSON;
    };
    try {
      body = await readJsonBody(ctx.req);
    } catch {
      json(ctx.res, 400, errorPayload("AUTH_BAD_REQUEST", "invalid json", ctx.requestId));
      return;
    }
    if (!body.challengeId?.trim() || !body.response) {
      json(
        ctx.res,
        400,
        errorPayload("AUTH_BAD_REQUEST", "challengeId and response are required", ctx.requestId),
      );
      return;
    }
    try {
      const result = await webauthnService.authenticationVerify({
        challengeId: body.challengeId.trim(),
        response: body.response,
      });
      json(ctx.res, 200, {
        authStateId: result.authStateId,
        userExists: result.userExists,
        nextStep: result.nextStep,
      });
    } catch (error) {
      handleWebAuthnError(ctx.requestId, ctx.res, error);
    }
  };
}
