import { createHash } from "node:crypto";

import {
  assertWorkspaceKeyPublishSet,
  assertWorkspaceKeyWrap,
  planDeferredWorkspaceKeyRotation,
  planWorkspaceKeyRotation,
  WorkspaceKeyRemoval,
  WorkspaceKeyRotationError,
  type WorkspaceKeyWrapInput,
} from "./removal.ts";
import { readWorkspaceCiphertextKeyVersion } from "./ciphertext.ts";
import { workspaceLogoQuotaDelta } from "../storage-quota/workspace-logo-bytes.ts";
import type { WorkspaceKeyStore, WorkspaceKeyWrapRecord } from "./store.ts";

/** Plaintext logo cap is 1 MiB. Ciphertext adds a version word, nonce, and tag. */
export const WORKSPACE_LOGO_CIPHERTEXT_MAX_BYTES = 1024 * 1024 + 64;
export const WORKSPACE_CLIENT_SETTINGS_CIPHERTEXT_MAX_BYTES = 64 * 1024;

export class WorkspaceKeyServiceError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;

  constructor(code: string, statusCode: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "WorkspaceKeyServiceError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export type WorkspaceLogoQuotaCheck = {
  assertLogoWrite(input: {
    workspaceId: string;
    additionalBytes: number;
    replacedBytes: number;
  }): Promise<void>;
};

export type WorkspaceKeyAuthorize = {
  assertMember(workspaceId: string, userId: string): Promise<void>;
  assertSettingsPut(workspaceId: string, userId: string): Promise<void>;
};

export type { WorkspaceKeyWrapInput } from "./removal.ts";
export { parseWorkspaceKeyWrap } from "./removal.ts";

export class WorkspaceKeyService {
  private readonly store: WorkspaceKeyStore;
  private readonly authorize: WorkspaceKeyAuthorize;
  private readonly logoQuota: WorkspaceLogoQuotaCheck | undefined;
  private readonly removal: WorkspaceKeyRemoval;

  constructor(
    store: WorkspaceKeyStore,
    authorize: WorkspaceKeyAuthorize,
    logoQuota?: WorkspaceLogoQuotaCheck,
  ) {
    this.store = store;
    this.authorize = authorize;
    this.logoQuota = logoQuota;
    this.removal = new WorkspaceKeyRemoval(store);
  }

  async getForMember(workspaceId: string, userId: string) {
    await this.authorize.assertMember(workspaceId, userId);
    const [currentVersion, wraps] = await Promise.all([
      this.store.currentVersion(workspaceId),
      this.store.wrapsForUser(workspaceId, userId),
    ]);
    return {
      currentVersion,
      wraps: wraps.map((wrap) => ({
        keyVersion: wrap.keyVersion,
        encryptedWorkspaceKey: wrap.encryptedWorkspaceKey,
      })),
    };
  }

  async publishVersion1(workspaceId: string, actorId: string, wraps: WorkspaceKeyWrapInput[]) {
    await this.authorize.assertMember(workspaceId, actorId);
    const current = await this.store.currentVersion(workspaceId);
    if (current != null) {
      throw new WorkspaceKeyServiceError("WORKSPACE_KEY_EXISTS", 409, "workspace key already exists");
    }
    const members = await this.store.activeMemberIds(workspaceId);
    if (!members.includes(actorId)) {
      throw new WorkspaceKeyServiceError("ACCESS_DENIED", 403, "access denied");
    }
    try {
      assertWorkspaceKeyPublishSet(
        members,
        wraps.map((wrap) => wrap.userId),
      );
    } catch (error) {
      throw asServiceError(error);
    }
    const records = wraps.map((wrap) => checkedWrap(wrap, 1));
    await this.store.insertWraps(workspaceId, records);
    return { currentVersion: 1 };
  }

  /** Store a wrap of the current version for a member who does not have one yet. */
  async grantCurrentWrap(workspaceId: string, actorId: string, wrap: WorkspaceKeyWrapInput) {
    await this.authorize.assertMember(workspaceId, actorId);
    const current = await this.store.currentVersion(workspaceId);
    if (current == null) {
      throw new WorkspaceKeyServiceError("WORKSPACE_KEY_MISSING", 409, "workspace key does not exist");
    }
    const members = await this.store.activeMemberIds(workspaceId);
    if (!members.includes(wrap.userId)) {
      throw new WorkspaceKeyServiceError("BAD_REQUEST", 400, "wrap target is not an active member");
    }
    const existing = await this.store.wrapsForUser(workspaceId, wrap.userId);
    if (existing.some((row) => row.keyVersion === current)) {
      throw new WorkspaceKeyServiceError("WORKSPACE_KEY_WRAP_EXISTS", 409, "member already has the current workspace key");
    }
    await this.store.insertWraps(workspaceId, [checkedWrap(wrap, current)]);
    return { keyVersion: current };
  }

  /**
   * Install version current+1 for the remaining members and drop every wrap of the removed member.
   * No-op when the workspace has no key. Throws when a key exists and rotation wraps are missing.
   */
  async rotateOnRemoval(
    workspaceId: string,
    removedUserId: string,
    wraps: WorkspaceKeyWrapInput[] | null,
  ): Promise<{ nextVersion: number } | null> {
    const current = await this.removal.readCurrentVersion(workspaceId);
    const members = await this.removal.activeMembers(workspaceId);
    let plan: { nextVersion: number; recipientIds: string[] } | null;
    try {
      plan = planWorkspaceKeyRotation({
        currentVersion: current,
        activeMemberIds: members,
        removedUserId,
        wrapUserIds: wraps ? wraps.map((wrap) => wrap.userId) : null,
      });
    } catch (error) {
      throw asServiceError(error);
    }
    if (!plan || !wraps) {
      return null;
    }
    const nextVersion = plan.nextVersion;
    const records = wraps.map((wrap) => checkedWrap(wrap, nextVersion));
    await this.removal.insertWraps(workspaceId, records);
    await this.removal.deleteWraps(workspaceId, removedUserId);
    await this.removal.clearQueue(workspaceId);
    return { nextVersion: plan.nextVersion };
  }

  /**
   * Membership removal when nobody present can wrap a new version.
   * Drops the removed member's wraps and queues a later rotation. Does not publish a new version.
   */
  async dropWrapAndEnqueue(workspaceId: string, removedUserId: string): Promise<void> {
    const current = await this.removal.readCurrentVersion(workspaceId);
    if (current == null) {
      return;
    }
    await this.removal.deleteWraps(workspaceId, removedUserId);
    await this.removal.enqueue(workspaceId, removedUserId);
  }

  async listPendingRecipients(workspaceId: string, actorId: string): Promise<string[]> {
    await this.authorize.assertMember(workspaceId, actorId);
    return this.removal.listMembersLackingCurrentWrap(workspaceId);
  }

  async listPendingRotations(workspaceId: string, actorId: string): Promise<string[]> {
    await this.authorize.assertMember(workspaceId, actorId);
    return this.removal.listQueue(workspaceId);
  }

  async applyDeferredRotation(
    workspaceId: string,
    actorId: string,
    wraps: WorkspaceKeyWrapInput[],
  ): Promise<{ nextVersion: number } | null> {
    await this.authorize.assertMember(workspaceId, actorId);
    const current = await this.removal.readCurrentVersion(workspaceId);
    const queued = await this.removal.listQueue(workspaceId);
    const members = await this.removal.activeMembers(workspaceId);
    let plan: { nextVersion: number; recipientIds: string[] } | null;
    try {
      plan = planDeferredWorkspaceKeyRotation({
        currentVersion: current,
        activeMemberIds: members,
        queuedRemovedUserIds: queued,
        wrapUserIds: wraps.map((wrap) => wrap.userId),
      });
    } catch (error) {
      throw asServiceError(error);
    }
    if (!plan) {
      return null;
    }
    const nextVersion = plan.nextVersion;
    const records = wraps.map((wrap) => checkedWrap(wrap, nextVersion));
    await this.removal.insertWraps(workspaceId, records);
    await this.removal.clearQueue(workspaceId);
    return { nextVersion: plan.nextVersion };
  }

  async putLogo(workspaceId: string, actorId: string, ciphertext: Uint8Array) {
    await this.authorize.assertSettingsPut(workspaceId, actorId);
    if (ciphertext.length === 0 || ciphertext.length > WORKSPACE_LOGO_CIPHERTEXT_MAX_BYTES) {
      throw new WorkspaceKeyServiceError("LOGO_TOO_LARGE", 413, "workspace logo ciphertext is empty or too large");
    }
    const keyVersion = requireCurrentCiphertext(ciphertext, await this.store.currentVersion(workspaceId));
    const previous = await this.store.getLogo(workspaceId);
    if (this.logoQuota) {
      await this.logoQuota.assertLogoWrite({
        workspaceId,
        additionalBytes: ciphertext.length,
        replacedBytes: previous?.ciphertextBytes ?? 0,
      });
    }
    const written = await this.store.putLogo(workspaceId, { keyVersion, ciphertext });
    const quota = workspaceLogoQuotaDelta(written.previousBytes, ciphertext.length);
    return {
      keyVersion,
      ciphertextBytes: ciphertext.length,
      etag: logoEtag(ciphertext),
      updatedAt: written.updatedAt,
      quota,
    };
  }

  async getLogo(workspaceId: string, actorId: string) {
    await this.authorize.assertMember(workspaceId, actorId);
    const logo = await this.store.getLogo(workspaceId);
    if (!logo) {
      throw new WorkspaceKeyServiceError("LOGO_NOT_FOUND", 404, "workspace logo not found");
    }
    return { ...logo, etag: logoEtag(logo.ciphertext) };
  }

  async deleteLogo(workspaceId: string, actorId: string) {
    await this.authorize.assertSettingsPut(workspaceId, actorId);
    const previousBytes = await this.store.deleteLogo(workspaceId);
    return workspaceLogoQuotaDelta(previousBytes, 0);
  }

  async getClientSettings(workspaceId: string, actorId: string) {
    await this.authorize.assertMember(workspaceId, actorId);
    return this.store.getClientSettings(workspaceId);
  }

  async putClientSettings(
    workspaceId: string,
    actorId: string,
    input: { ciphertext: Uint8Array; tileColor?: string | null },
  ) {
    await this.authorize.assertSettingsPut(workspaceId, actorId);
    if (
      input.ciphertext.length === 0 ||
      input.ciphertext.length > WORKSPACE_CLIENT_SETTINGS_CIPHERTEXT_MAX_BYTES
    ) {
      throw new WorkspaceKeyServiceError(
        "CLIENT_SETTINGS_TOO_LARGE",
        413,
        "workspace client settings ciphertext is empty or too large",
      );
    }
    const keyVersion = requireCurrentCiphertext(
      input.ciphertext,
      await this.store.currentVersion(workspaceId),
    );
    await this.store.putClientSettings(workspaceId, {
      keyVersion,
      ciphertext: input.ciphertext,
      tileColor: input.tileColor,
    });
    return { keyVersion };
  }
}

function checkedWrap(wrap: WorkspaceKeyWrapInput, keyVersion: number): WorkspaceKeyWrapRecord {
  try {
    return assertWorkspaceKeyWrap(wrap, keyVersion);
  } catch (error) {
    throw asServiceError(error);
  }
}

function requireCurrentCiphertext(ciphertext: Uint8Array, currentVersion: number | null): number {
  if (currentVersion == null) {
    throw new WorkspaceKeyServiceError("WORKSPACE_KEY_MISSING", 409, "workspace key does not exist");
  }
  let keyVersion: number;
  try {
    keyVersion = readWorkspaceCiphertextKeyVersion(ciphertext);
  } catch {
    throw new WorkspaceKeyServiceError("INVALID_CIPHERTEXT", 400, "invalid workspace ciphertext");
  }
  if (keyVersion !== currentVersion) {
    throw new WorkspaceKeyServiceError(
      "WORKSPACE_KEY_VERSION_MISMATCH",
      409,
      "ciphertext must use the current workspace key version",
    );
  }
  return keyVersion;
}

function logoEtag(ciphertext: Uint8Array): string {
  return createHash("sha256").update(ciphertext).digest("hex");
}

function asServiceError(error: unknown): WorkspaceKeyServiceError {
  if (error instanceof WorkspaceKeyServiceError) {
    return error;
  }
  if (error instanceof WorkspaceKeyRotationError) {
    return new WorkspaceKeyServiceError(error.code, error.statusCode, error.message);
  }
  throw error;
}
