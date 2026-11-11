import type { WorkspaceCapsulePolicies } from "@okkey/types";

import type { QueryExecutor } from "../storage/postgres.ts";

/** Fields of a capsule create/update that belong to access settings. */
export type CapsuleAccessWriteBody = {
  expiresAt?: string;
  activateAt?: string;
  deactivateAt?: string;
  deleteAt?: string;
  maxViews?: number;
  viewLimitAction?: "deactivate" | "delete";
  password?: string;
  passwordAttemptLimit?: number;
  allowedRecipientEmails?: string[];
  approvalRequired?: boolean;
  keepExistingPassword?: boolean;
  keepExistingRecipients?: boolean;
};

/**
 * Paid capsule access settings (time, recipients, password, approval,
 * and a caller-chosen view limit). Open core does not implement this.
 * A plugin registers one provider; without it, core rejects those fields
 * and refuses to open a capsule that already stores them.
 * Workspace `forceMaxViews` stays in core.
 */
export type CapsuleAccessWritePreparation = {
  /** Password and recipient material. Core sets `keyTransportMode` and file keys. */
  accessPolicy: Record<string, unknown>;
  activateAt: string | null;
  deactivateAt: string | null;
  deleteAt: string | null;
  maxViews: number | null;
  viewLimitAction: "deactivate" | "delete";
  passwordAttemptLimit: number | null;
  approvalRequired: boolean;
};

export type CapsuleAccessPrepareWriteInput = {
  mode: "create" | "update";
  actorId: string;
  policies: WorkspaceCapsulePolicies;
  sessionSecret: string;
  input: CapsuleAccessWriteBody;
  /** Present on update. Includes the stored access_policy JSON. */
  existing?: {
    accessPolicy: unknown;
    passwordAttemptLimit: number | null;
    approvalRequired: boolean;
  };
};

export type CapsuleAccessAssertOpenInput = {
  tx: QueryExecutor;
  capsule: {
    id: string;
    accessPolicy: unknown;
    approvalRequired: boolean;
    passwordAttemptLimit: number | null;
  };
  password?: string;
  recipientEmail?: string;
  approvalToken?: string;
  requesterUserId?: string;
  guestSessionId?: string;
  requestIp: string;
  sessionSecret: string;
  redis: {
    incr(key: string): Promise<number>;
    expire(key: string, seconds: number): Promise<boolean>;
  };
  passwordAttemptWindowSeconds: number;
};

export interface CapsuleAccessSettingsProvider {
  prepareWrite(input: CapsuleAccessPrepareWriteInput): Promise<CapsuleAccessWritePreparation>;
  /**
   * Check password, recipients, and approval.
   * Do not mark the approval row consumed; core does that in the same transaction
   * when `approvalRequestId` is set.
   */
  assertOpen(input: CapsuleAccessAssertOpenInput): Promise<{ approvalRequestId: string | null }>;
}

let provider: CapsuleAccessSettingsProvider | null = null;
let bindingsReady: Promise<void> = Promise.resolve();

export function registerCapsuleAccessSettingsProvider(
  next: CapsuleAccessSettingsProvider,
): void {
  provider = next;
}

export function getCapsuleAccessSettingsProvider(): CapsuleAccessSettingsProvider | null {
  return provider;
}

/**
 * Bind `capsuleAccessSettings` after `plugin.register`.
 * Plugins may replace the provider during register, including after an await.
 */
export function bindCapsuleAccessSettingsAfterRegister(
  registration: void | Promise<void>,
  bind: () => void,
): void {
  bind();
  if (registration instanceof Promise) {
    bindingsReady = bindingsReady.then(() => registration).then(bind);
  }
}

/** Resolves once every in-flight plugin register() has bound its provider. */
export function whenCapsuleAccessSettingsBound(): Promise<void> {
  return bindingsReady;
}

/** Tests only. */
export function resetCapsuleAccessSettingsProviderForTests(): void {
  provider = null;
}
