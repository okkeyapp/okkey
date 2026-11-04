import type { HybridSignatureEnvelopeV2 } from "@okkey/crypto";
import {
  SIGNATURE_INVALID,
  SIGNATURE_REQUIRED,
  SIGNATURE_STATUS_CODE,
  checkHybridSignatureForNewWrite,
  type SignatureContext,
} from "./hybrid-signature.ts";
import type { CryptoRolloutMode } from "./policy-matrix.ts";

/**
 * Operations that must carry a valid hybrid signature in `strict` rollout mode.
 * `compat` verifies a signature only when the caller presents one.
 *
 * `vault.create` and `vault.access_update` are signature contexts, but their
 * handlers are not in this service. They are omitted here so this list matches
 * operations that actually call {@link enforceOperationSignature}.
 */
export const CRITICAL_SIGNATURE_OPERATIONS = [
  "vault.share",
  "vault.revoke",
  "vault.rotate",
  "vault.member_role_update",
] as const;

export type CriticalSignatureOperation = (typeof CRITICAL_SIGNATURE_OPERATIONS)[number];

export type SignatureOperation = "sync.append" | CriticalSignatureOperation;

/**
 * Personal workspace sync is per-user folder and favorite metadata.
 * It does not grant, revoke, or rotate a shared vault key, so none of these
 * event types require a signature in either rollout mode.
 */
export const PERSONAL_WORKSPACE_EVENT_TYPES = [
  "FOLDER_CREATE",
  "FOLDER_UPDATE",
  "FOLDER_DELETE",
  "ITEM_FOLDER_ASSIGN",
  "ITEM_FAVORITE_SET",
] as const;

const CRITICAL_OPERATION_SET = new Set<string>(CRITICAL_SIGNATURE_OPERATIONS);

/** Sync event types that distribute or rotate a shared vault key. */
const SYNC_APPEND_CRITICAL_EVENT_TYPES = new Set(["VAULT_SHARE", "VAULT_KEY_ROTATION"]);

export interface SignerPublicKeys {
  publicKey: string;
  publicPqKey: string;
  /** ML-DSA-65 verifying key. Null when the account has not uploaded one yet. */
  publicMldsaKey: string | null;
}

export class OperationSignatureError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details: Record<string, unknown>;

  constructor(
    code: string,
    statusCode: number,
    message: string,
    details: Record<string, unknown>,
  ) {
    super(message);
    this.name = "OperationSignatureError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export function isCriticalSignatureOperation(
  operation: SignatureOperation,
  eventType?: string,
): boolean {
  if (operation === "sync.append") {
    return SYNC_APPEND_CRITICAL_EVENT_TYPES.has(eventType ?? "");
  }
  return CRITICAL_OPERATION_SET.has(operation);
}

/**
 * Single decision for "does this operation require a signature in this mode?".
 * New critical operations must be added to {@link CRITICAL_SIGNATURE_OPERATIONS}
 * (or the sync event set) and must call {@link enforceOperationSignature}.
 */
export function isSignatureRequired(input: {
  rolloutMode: CryptoRolloutMode;
  operation: SignatureOperation;
  eventType?: string;
}): boolean {
  return input.rolloutMode === "strict" && isCriticalSignatureOperation(input.operation, input.eventType);
}

function signatureContextFor(operation: SignatureOperation): SignatureContext {
  return operation;
}

/**
 * Applies the rollout decision and, when a signature is present on a critical
 * operation, verifies it with {@link checkHybridSignatureForNewWrite}.
 * New writes use the ML-DSA envelope; stored v1 history stays verifiable
 * through the historical verifier.
 *
 * Returns the verified envelope, or null when the mode does not require a
 * signature and none was sent. Non-critical operations are left unchanged
 * even if a signature object is attached.
 */
export function enforceOperationSignature(input: {
  rolloutMode: CryptoRolloutMode;
  operation: SignatureOperation;
  eventType?: string;
  signature: unknown;
  payload: unknown;
  signer: SignerPublicKeys | null;
}): HybridSignatureEnvelopeV2 | null {
  if (!isCriticalSignatureOperation(input.operation, input.eventType)) {
    return null;
  }

  const context = signatureContextFor(input.operation);
  const details: Record<string, unknown> = { context };
  if (input.operation === "sync.append" && input.eventType) {
    details.eventType = input.eventType;
  }

  if (!input.signature) {
    if (!isSignatureRequired(input)) {
      return null;
    }
    throw new OperationSignatureError(
      SIGNATURE_REQUIRED,
      SIGNATURE_STATUS_CODE,
      input.operation === "sync.append"
        ? "signature is required for this eventType"
        : "signature is required for this operation",
      details,
    );
  }

  if (!input.signer?.publicKey || !input.signer.publicPqKey) {
    throw new OperationSignatureError(
      SIGNATURE_INVALID,
      SIGNATURE_STATUS_CODE,
      "signer keys are unavailable",
      details,
    );
  }

  const checked = checkHybridSignatureForNewWrite({
    signature: input.signature,
    expectedContext: context,
    payload: input.payload,
    signerPublicKeyBase64: input.signer.publicKey,
    signerPqPublicKeyBase64: input.signer.publicPqKey,
    signerMldsaPublicKeyBase64: input.signer.publicMldsaKey,
  });
  if (!checked.ok) {
    throw new OperationSignatureError(
      checked.code,
      checked.statusCode,
      checked.message,
      details,
    );
  }
  return checked.envelope;
}
