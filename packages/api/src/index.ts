import type {
  CapsuleCreateRequestDto,
  CapsuleMetadataDto,
  CapsuleOpenResponseDto,
  ClientCryptoCapabilities,
  CoreApiErrorBody,
  CryptoRolloutMode,
  DeviceRegisterRequestDto,
  DeviceRegisterResponseDto,
  DeviceRejectResponseDto,
  EncryptedBlobDto,
  SyncAppendEventRequestDto,
  SyncEventWireDto,
  SyncEventsListResponseDto,
  WorkspacePersonalEventWireDto,
  WorkspacePersonalEventsListResponseDto,
  VaultKeyGetResponseDto,
  VaultShareRevokeRequestDto,
  VaultShareUpsertRequestDto,
  VaultSharesListResponseDto,
  Vault,
  VaultUnlockBootstrapResponseDto,
  Workspace,
  AccountProfileResponseDto,
  AccountProfileUpdateRequestDto,
  AccountEmailChangeConfirmRequestDto,
  AccountEmailChangeConfirmResponseDto,
  AccountEmailChangeResendRequestDto,
  AccountEmailChangeStartRequestDto,
  AccountEmailChangeStartResponseDto,
  WorkspaceItemCategoryPreferencesResponseDto,
  WorkspaceItemCategoryPreferencesUpdateRequestDto,
  WorkspaceItemTemplateCreateRequestDto,
  WorkspaceItemTemplateCreateResponseDto,
  WorkspaceItemTemplateUpdateRequestDto,
  WorkspaceItemTemplateUpdateResponseDto,
  WorkspaceItemTemplatesListResponseDto,
  WorkspaceSettingsResponseDto,
  WorkspaceSettingsUpdateRequestDto,
  WorkspaceDeleteRequestDto,
} from "../../types/src/index.js";
import { isClientPqCapable } from "../../types/src/index.js";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /** Merged into every request after defaults (e.g. `X-User-Id` for authenticated routes). */
  defaultHeaders?: Record<string, string>;
}

export class ApiRequestError extends Error {
  readonly status: number;
  readonly body: CoreApiErrorBody;

  constructor(status: number, body: CoreApiErrorBody) {
    super(`${body.error}: ${body.message}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

export interface ApiRequestOptions {
  /** Merged over defaultHeaders for this request only. */
  headers?: Record<string, string>;
}

export class ApiClient {
  private baseUrl: string;
  private fetchImpl: typeof fetch;
  private defaultHeaders: Record<string, string>;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    // Native `fetch` must be bound; storing it unbound causes "Illegal invocation" when called.
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  async patch<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("PATCH", path, body, options);
  }

  async put<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("PUT", path, body, options);
  }

  async delete<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("DELETE", path, body, options);
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: ApiRequestOptions,
  ): Promise<T> {
    const headers: Record<string, string> = { ...this.defaultHeaders, ...options?.headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const raw: unknown = await res.json().catch(() => null);
      throw new ApiRequestError(res.status, parseCoreApiErrorBody(raw, res));
    }

    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed) {
      throw new SyntaxError("empty API response body");
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      throw new SyntaxError("API response is not valid JSON");
    }
  }
}

function parseCoreApiErrorBody(raw: unknown, res: Response): CoreApiErrorBody {
  if (
    raw &&
    typeof raw === "object" &&
    "error" in raw &&
    "message" in raw &&
    "requestId" in raw
  ) {
    const o = raw as Record<string, unknown>;
    const details = o.details;
    return {
      error: String(o.error),
      message: String(o.message),
      requestId: String(o.requestId),
      ...(details !== undefined &&
      details !== null &&
      typeof details === "object" &&
      !Array.isArray(details)
        ? { details: details as Record<string, unknown> }
        : {}),
    };
  }

  return {
    error: "UNKNOWN",
    message: res.statusText || "request failed",
    requestId: "unknown",
  };
}

/** API client with `Authorization: Bearer` for Vault, Sync, and Device routes. */
export function createBearerApiClient(baseUrl: string, accessToken: string): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: { Authorization: `Bearer ${accessToken}` },
  });
}

/** Typed helpers for authenticated Core HTTP API (vault metadata, sync, devices). */
export interface CoreApiClientOptions {
  cryptoRolloutMode?: CryptoRolloutMode;
  capabilities?: Partial<ClientCryptoCapabilities>;
}

export class CoreApiClient {
  private readonly cryptoRolloutMode: CryptoRolloutMode;
  private readonly capabilities: Partial<ClientCryptoCapabilities> | undefined;

  constructor(private readonly api: ApiClient, options: CoreApiClientOptions = {}) {
    this.cryptoRolloutMode = options.cryptoRolloutMode ?? "compat";
    this.capabilities = options.capabilities;
  }

  listWorkspaces(): Promise<Workspace[]> {
    return this.api.get<Workspace[]>("/workspaces");
  }

  getVaultUnlockBootstrap(deviceFingerprint: string): Promise<VaultUnlockBootstrapResponseDto> {
    const q = new URLSearchParams({ device_fingerprint: deviceFingerprint });
    return this.api.get<VaultUnlockBootstrapResponseDto>(`/vault/unlock-bootstrap?${q.toString()}`);
  }

  getAccountProfile(): Promise<AccountProfileResponseDto> {
    return this.api.get<AccountProfileResponseDto>("/account/profile");
  }

  updateAccountProfile(body: AccountProfileUpdateRequestDto): Promise<AccountProfileResponseDto> {
    return this.api.patch<AccountProfileResponseDto>("/account/profile", body);
  }

  startAccountEmailChange(
    body: AccountEmailChangeStartRequestDto,
  ): Promise<AccountEmailChangeStartResponseDto> {
    return this.api.post<AccountEmailChangeStartResponseDto>("/account/email-change/start", body);
  }

  resendAccountEmailChangeCode(
    body: AccountEmailChangeResendRequestDto,
  ): Promise<AccountEmailChangeStartResponseDto> {
    return this.api.post<AccountEmailChangeStartResponseDto>("/account/email-change/resend", body);
  }

  confirmAccountEmailChange(
    body: AccountEmailChangeConfirmRequestDto,
  ): Promise<AccountEmailChangeConfirmResponseDto> {
    return this.api.post<AccountEmailChangeConfirmResponseDto>("/account/email-change/confirm", body);
  }

  listWorkspaceVaults(workspaceId: string): Promise<Vault[]> {
    return this.api.get<Vault[]>(`/workspaces/${encodeURIComponent(workspaceId)}/vaults`);
  }

  getWorkspaceItemCategoryPreferences(
    workspaceId: string,
  ): Promise<WorkspaceItemCategoryPreferencesResponseDto> {
    return this.api.get<WorkspaceItemCategoryPreferencesResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/item-category-preferences`,
    );
  }

  updateWorkspaceItemCategoryPreferences(
    workspaceId: string,
    body: WorkspaceItemCategoryPreferencesUpdateRequestDto,
  ): Promise<WorkspaceItemCategoryPreferencesResponseDto> {
    return this.api.put<WorkspaceItemCategoryPreferencesResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/item-category-preferences`,
      body,
    );
  }

  listWorkspaceItemTemplates(workspaceId: string): Promise<WorkspaceItemTemplatesListResponseDto> {
    return this.api.get<WorkspaceItemTemplatesListResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/item-templates`,
    );
  }

  createWorkspaceItemTemplate(
    workspaceId: string,
    body: WorkspaceItemTemplateCreateRequestDto,
  ): Promise<WorkspaceItemTemplateCreateResponseDto> {
    return this.api.post<WorkspaceItemTemplateCreateResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/item-templates`,
      body,
    );
  }

  updateWorkspaceItemTemplate(
    workspaceId: string,
    templateId: string,
    body: WorkspaceItemTemplateUpdateRequestDto,
  ): Promise<WorkspaceItemTemplateUpdateResponseDto> {
    return this.api.patch<WorkspaceItemTemplateUpdateResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/item-templates/${encodeURIComponent(templateId)}`,
      body,
    );
  }

  deleteWorkspaceItemTemplate(workspaceId: string, templateId: string): Promise<{ ok: true }> {
    return this.api.delete<{ ok: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/item-templates/${encodeURIComponent(templateId)}`,
    );
  }

  getWorkspaceSettings(workspaceId: string): Promise<WorkspaceSettingsResponseDto> {
    return this.api.get<WorkspaceSettingsResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/settings`,
    );
  }

  updateWorkspaceSettings(
    workspaceId: string,
    body: WorkspaceSettingsUpdateRequestDto,
  ): Promise<WorkspaceSettingsResponseDto> {
    return this.api.patch<WorkspaceSettingsResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/settings`,
      body,
    );
  }

  deleteWorkspace(workspaceId: string, body: WorkspaceDeleteRequestDto): Promise<{ ok: true }> {
    return this.api.delete<{ ok: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/settings`,
      body,
    );
  }

  getVault(vaultId: string): Promise<Vault> {
    return this.api.get<Vault>(`/vaults/${encodeURIComponent(vaultId)}`);
  }

  listVaultEvents(vaultId: string, afterVersion = 0): Promise<SyncEventsListResponseDto> {
    const q = new URLSearchParams({ afterVersion: String(afterVersion) });
    return this.api.get<SyncEventsListResponseDto>(
      `/vaults/${encodeURIComponent(vaultId)}/events?${q.toString()}`,
    );
  }

  appendVaultEvent(vaultId: string, body: SyncAppendEventRequestDto): Promise<SyncEventWireDto> {
    this.assertStrictWritePathCapability(body.encryptedBlob, "sync.append");
    return this.api.post<SyncEventWireDto>(
      `/vaults/${encodeURIComponent(vaultId)}/events`,
      body,
    );
  }

  listWorkspacePersonalEvents(
    workspaceId: string,
    afterVersion = 0,
  ): Promise<WorkspacePersonalEventsListResponseDto> {
    const q = new URLSearchParams({ afterVersion: String(afterVersion) });
    return this.api.get<WorkspacePersonalEventsListResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/personal-events?${q.toString()}`,
    );
  }

  appendWorkspacePersonalEvent(
    workspaceId: string,
    body: SyncAppendEventRequestDto,
  ): Promise<WorkspacePersonalEventWireDto> {
    this.assertStrictWritePathCapability(body.encryptedBlob, "workspace-personal-sync.append");
    return this.api.post<WorkspacePersonalEventWireDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/personal-events`,
      body,
    );
  }

  getVaultKey(vaultId: string): Promise<VaultKeyGetResponseDto> {
    return this.api.get<VaultKeyGetResponseDto>(`/vaults/${encodeURIComponent(vaultId)}/key`);
  }

  listVaultShares(vaultId: string): Promise<VaultSharesListResponseDto> {
    return this.api.get<VaultSharesListResponseDto>(
      `/vaults/${encodeURIComponent(vaultId)}/shares`,
    );
  }

  shareVault(vaultId: string, body: VaultShareUpsertRequestDto): Promise<{ shared: true }> {
    this.assertStrictWritePathCapability(body.encryptedPayload, "vault.share");
    this.assertStrictWritePathCapability(body.encryptedVaultKey, "vault.share");
    return this.api.post<{ shared: true }>(`/vaults/${encodeURIComponent(vaultId)}/shares`, body);
  }

  revokeVaultShare(
    vaultId: string,
    body: VaultShareRevokeRequestDto,
  ): Promise<{ revoked: true }> {
    this.assertStrictWritePathCapability(body.encryptedPayload, "vault.revoke");
    for (const rotated of body.rotatedVaultKeys) {
      this.assertStrictWritePathCapability(rotated.encryptedVaultKey, "vault.revoke");
    }
    return this.api.post<{ revoked: true }>(
      `/vaults/${encodeURIComponent(vaultId)}/shares/revoke`,
      body,
    );
  }

  createCapsule(
    workspaceId: string,
    body: CapsuleCreateRequestDto,
  ): Promise<CapsuleMetadataDto> {
    this.assertStrictWritePathCapability(body.encryptedPayload, "capsule.create");
    if (body.filePayload) {
      this.assertStrictWritePathCapability(body.filePayload, "capsule.create");
    }
    return this.api.post<CapsuleMetadataDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/capsules`,
      body,
    );
  }

  getCapsule(capsuleId: string): Promise<CapsuleMetadataDto> {
    return this.api.get<CapsuleMetadataDto>(`/capsules/${encodeURIComponent(capsuleId)}`);
  }

  openCapsule(
    capsuleId: string,
    options?: { password?: string; recipientEmail?: string },
  ): Promise<CapsuleOpenResponseDto> {
    return this.api.post<CapsuleOpenResponseDto>(
      `/capsules/${encodeURIComponent(capsuleId)}/open`,
      options?.password || options?.recipientEmail
        ? { ...(options.password ? { password: options.password } : {}), ...(options.recipientEmail ? { recipientEmail: options.recipientEmail } : {}) }
        : {},
    );
  }

  revokeCapsule(capsuleId: string): Promise<{ revoked: true }> {
    return this.api.post<{ revoked: true }>(`/capsules/${encodeURIComponent(capsuleId)}/revoke`, {});
  }

  registerDevice(body: DeviceRegisterRequestDto): Promise<DeviceRegisterResponseDto> {
    return this.api.post<DeviceRegisterResponseDto>("/devices/register", body);
  }

  approveDevice(pendingDeviceId: string, approverDeviceId: string): Promise<DeviceRegisterResponseDto> {
    return this.api.post<DeviceRegisterResponseDto>(
      `/devices/${encodeURIComponent(pendingDeviceId)}/approve`,
      {},
      { headers: { "X-Device-Id": approverDeviceId } },
    );
  }

  rejectDevice(
    pendingDeviceId: string,
    approverDeviceId: string,
    reason?: string,
  ): Promise<DeviceRejectResponseDto> {
    return this.api.post<DeviceRejectResponseDto>(
      `/devices/${encodeURIComponent(pendingDeviceId)}/reject`,
      reason !== undefined ? { reason } : {},
      { headers: { "X-Device-Id": approverDeviceId } },
    );
  }

  private assertStrictWritePathCapability(
    blob: EncryptedBlobDto,
    operation: string,
  ): void {
    if (this.cryptoRolloutMode !== "strict") {
      return;
    }
    if (!isClientPqCapable(this.capabilities) || blob.crypto_version < 2) {
      throw new Error(
        `strict rollout mode requires PQ-capable client for ${operation}`,
      );
    }
  }
}

export function createCoreApiClient(
  baseUrl: string,
  accessToken: string,
  options?: CoreApiClientOptions,
): CoreApiClient {
  return new CoreApiClient(createBearerApiClient(baseUrl, accessToken), options);
}
