import type {
  CoreApiErrorBody,
  DeviceRegisterRequestDto,
  DeviceRegisterResponseDto,
  DeviceRejectResponseDto,
  SyncAppendEventRequestDto,
  SyncEventWireDto,
  SyncEventsListResponseDto,
  VaultKeyGetResponseDto,
  VaultShareRevokeRequestDto,
  VaultShareUpsertRequestDto,
  VaultSharesListResponseDto,
  Vault,
} from "../../types/src/index.js";

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
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultHeaders = options.defaultHeaders ?? {};
  }

  async get<T>(path: string, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("GET", path, undefined, options);
  }

  async post<T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> {
    return this.request<T>("POST", path, body, options);
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

    return (await res.json()) as T;
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
export class CoreApiClient {
  constructor(private readonly api: ApiClient) {}

  listWorkspaceVaults(workspaceId: string): Promise<Vault[]> {
    return this.api.get<Vault[]>(`/workspaces/${encodeURIComponent(workspaceId)}/vaults`);
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
    return this.api.post<SyncEventWireDto>(
      `/vaults/${encodeURIComponent(vaultId)}/events`,
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
    return this.api.post<{ shared: true }>(`/vaults/${encodeURIComponent(vaultId)}/shares`, body);
  }

  revokeVaultShare(
    vaultId: string,
    body: VaultShareRevokeRequestDto,
  ): Promise<{ revoked: true }> {
    return this.api.post<{ revoked: true }>(
      `/vaults/${encodeURIComponent(vaultId)}/shares/revoke`,
      body,
    );
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
}

export function createCoreApiClient(baseUrl: string, accessToken: string): CoreApiClient {
  return new CoreApiClient(createBearerApiClient(baseUrl, accessToken));
}
