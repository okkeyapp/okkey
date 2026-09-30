import type {
  CapsuleCreateRequestDto,
  CapsuleOwnerDetailDto,
  CapsuleUpdateRequestDto,
  CapsuleApprovalListResponseDto,
  CapsuleApprovalResolveResponseDto,
  CapsuleApprovalEligibilityDto,
  CapsuleApprovalStatusDto,
  CapsuleDefaultsListResponseDto,
  CapsuleDefaultsUpsertRequestDto,
  CapsuleDefaultsUpsertResponseDto,
  CapsuleListResponseDto,
  CapsuleMetadataDto,
  CapsuleOpenResponseDto,
  ClientCryptoCapabilities,
  CoreApiErrorBody,
  CryptoRolloutMode,
  DeviceRegisterRequestDto,
  DeviceRegisterResponseDto,
  DeviceRejectResponseDto,
  DeviceBlockRequestDto,
  DeviceBlockResponseDto,
  DeviceUnblockRequestDto,
  DeviceUnblockResponseDto,
  DeviceListResponseDto,
  DevicePatchRequestDto,
  DevicePatchResponseDto,
  DeviceRevokeResponseDto,
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
  AccountMasterPasswordChangeRequestDto,
  AccountMasterPasswordChangeResponseDto,
  AccountEmailChangeConfirmRequestDto,
  AccountEmailChangeConfirmResponseDto,
  AccountEmailChangeResendRequestDto,
  AccountEmailChangeStartRequestDto,
  AccountEmailChangeStartResponseDto,
  AccountLoginMethodsPrimaryPatchDto,
  AccountLoginMethodsResponseDto,
  AccountRecoveryKeyEnrollRequestDto,
  AccountRecoveryKeyEnrollResponseDto,
  AccountRecoveryKeyWrapResponseDto,
  AccountRecoverySettingsUpdateRequestDto,
  AccountRecoveryStatusResponseDto,
  TrustedContactInviteRequestDto,
  TrustedContactInviteResponseDto,
  WebAuthnAuthenticatorAttachment,
  WebAuthnCeremonyOptionsResponseDto,
  WebAuthnRegisterOptionsRequestDto,
  WebAuthnRegisterVerifyRequestDto,
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
  WorkspacePlanChangeRequestDto,
  WorkspacePlanChangeRequestResponseDto,
  WorkspaceRolesListResponseDto,
  WorkspaceBuiltInProfilesListResponseDto,
  VaultCreateRequestDto,
  VaultUpdateRequestDto,
  WorkspaceMembersListResponseDto,
  WorkspaceMemberDirectoryResponseDto,
  WorkspaceMePermissionsResponseDto,
  MeVaultProfilesResponseDto,
  WorkspaceInvitationsCreateRequestDto,
  WorkspaceInvitationsCreateResponseDto,
  WorkspaceInvitationUpdateRequestDto,
  WorkspaceMemberUpdateRequestDto,
  MemberVaultAccessResponseDto,
  MemberVaultAccessUpdateRequestDto,
  InvitationVaultAccessResponseDto,
  InvitationVaultAccessUpdateRequestDto,
  InvitationPreviewDto,
  InvitationAcceptResponseDto,
  PendingVaultWrapsResponseDto,
  VaultAccessResponseDto,
  VaultAccessUpdateRequestDto,
} from "@okkey/types";
import { isClientPqCapable } from "@okkey/types";

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
export function createBearerApiClient(
  baseUrl: string,
  accessToken: string,
  defaultHeaders?: Record<string, string>,
): ApiClient {
  return new ApiClient({
    baseUrl,
    defaultHeaders: { Authorization: `Bearer ${accessToken}`, ...defaultHeaders },
  });
}

/** Typed helpers for authenticated Core HTTP API (vault metadata, sync, devices). */
export interface CoreApiClientOptions {
  cryptoRolloutMode?: CryptoRolloutMode;
  capabilities?: Partial<ClientCryptoCapabilities>;
  /** Extra default headers (e.g. `Accept-Language` from UI locale). */
  defaultHeaders?: Record<string, string>;
}

export class CoreApiClient {
  private readonly cryptoRolloutMode: CryptoRolloutMode;
  private readonly capabilities: Partial<ClientCryptoCapabilities> | undefined;

  constructor(private readonly api: ApiClient, options: CoreApiClientOptions = {}) {
    this.cryptoRolloutMode = options.cryptoRolloutMode ?? "compat";
    this.capabilities = options.capabilities;
  }

  /** Underlying HTTP client for enterprise API extensions. */
  getHttpClient(): ApiClient {
    return this.api;
  }

  listWorkspaces(): Promise<Workspace[]> {
    return this.api.get<Workspace[]>("/workspaces");
  }

  /** Requires enterprise SaaS tenancy plugin (`POST /workspaces`). OSS API returns 404. */
  createWorkspace(body: {
    name: string;
    /** Localized personal vault label; server default is `Personal vault`. */
    personal_vault_name?: string;
  }): Promise<{
    id: string;
    name: string;
    ownerId: string;
    planTier: string;
    vaultId: string;
  }> {
    return this.api.post("/workspaces", body);
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

  getLoginMethods(): Promise<AccountLoginMethodsResponseDto> {
    return this.api.get<AccountLoginMethodsResponseDto>("/account/login-methods");
  }

  setPrimaryLoginMethod(
    body: AccountLoginMethodsPrimaryPatchDto,
  ): Promise<AccountLoginMethodsResponseDto> {
    return this.api.patch<AccountLoginMethodsResponseDto>("/account/login-methods/primary", body);
  }

  webauthnRegisterOptions(
    body: WebAuthnRegisterOptionsRequestDto,
  ): Promise<WebAuthnCeremonyOptionsResponseDto> {
    return this.api.post<WebAuthnCeremonyOptionsResponseDto>(
      "/account/webauthn/register/options",
      body,
    );
  }

  webauthnRegisterVerify(
    body: WebAuthnRegisterVerifyRequestDto,
  ): Promise<AccountLoginMethodsResponseDto> {
    return this.api.post<AccountLoginMethodsResponseDto>(
      "/account/webauthn/register/verify",
      body,
    );
  }

  deleteWebauthnCredential(credentialId: string): Promise<AccountLoginMethodsResponseDto> {
    return this.api.delete<AccountLoginMethodsResponseDto>(
      `/account/webauthn/credentials/${encodeURIComponent(credentialId)}`,
    );
  }

  deleteWebauthnCredentialsByAttachment(
    attachment: WebAuthnAuthenticatorAttachment,
  ): Promise<AccountLoginMethodsResponseDto> {
    const q = new URLSearchParams({ attachment });
    return this.api.delete<AccountLoginMethodsResponseDto>(
      `/account/webauthn/credentials?${q.toString()}`,
    );
  }

  changeMasterPassword(
    body: AccountMasterPasswordChangeRequestDto,
  ): Promise<AccountMasterPasswordChangeResponseDto> {
    return this.api.post<AccountMasterPasswordChangeResponseDto>("/account/master-password/change", body);
  }

  /** Reports a successful master-password vault unlock (no secrets in the body). */
  recordVaultUnlock(): Promise<{ recorded: true }> {
    return this.api.post<{ recorded: true }>("/account/vault-unlock", {});
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

  createWorkspaceVault(workspaceId: string, body: VaultCreateRequestDto): Promise<Vault> {
    return this.api.post<Vault>(`/workspaces/${encodeURIComponent(workspaceId)}/vaults`, body);
  }

  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMembersListResponseDto> {
    return this.api.get<WorkspaceMembersListResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/members`,
    );
  }

  listWorkspaceMemberDirectory(workspaceId: string): Promise<WorkspaceMemberDirectoryResponseDto> {
    return this.api.get<WorkspaceMemberDirectoryResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/member-directory`,
    );
  }

  getWorkspaceMePermissions(workspaceId: string): Promise<WorkspaceMePermissionsResponseDto> {
    return this.api.get<WorkspaceMePermissionsResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/me/permissions`,
    );
  }

  getWorkspaceMeVaultProfiles(workspaceId: string): Promise<MeVaultProfilesResponseDto> {
    return this.api.get<MeVaultProfilesResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/me/vault-profiles`,
    );
  }

  getInvitationByToken(token: string): Promise<InvitationPreviewDto> {
    return this.api.get<InvitationPreviewDto>(
      `/invitations/${encodeURIComponent(token)}`,
    );
  }

  acceptInvitation(token: string): Promise<InvitationAcceptResponseDto> {
    return this.api.post<InvitationAcceptResponseDto>(
      `/invitations/${encodeURIComponent(token)}/accept`,
      {},
    );
  }

  listPendingVaultWraps(workspaceId: string): Promise<PendingVaultWrapsResponseDto> {
    return this.api.get<PendingVaultWrapsResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/pending-vault-wraps`,
    );
  }

  createWorkspaceInvitations(
    workspaceId: string,
    body: WorkspaceInvitationsCreateRequestDto,
  ): Promise<WorkspaceInvitationsCreateResponseDto> {
    return this.api.post<WorkspaceInvitationsCreateResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitations`,
      body,
    );
  }

  revokeWorkspaceInvitation(workspaceId: string, invitationId: string): Promise<{ revoked: true }> {
    return this.api.delete<{ revoked: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
    );
  }

  updateWorkspaceInvitation(
    workspaceId: string,
    invitationId: string,
    body: WorkspaceInvitationUpdateRequestDto,
  ): Promise<{ updated: true }> {
    return this.api.patch<{ updated: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}`,
      body,
    );
  }

  getInvitationVaultAccess(
    workspaceId: string,
    invitationId: string,
  ): Promise<InvitationVaultAccessResponseDto> {
    return this.api.get<InvitationVaultAccessResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}/vault-access`,
    );
  }

  updateInvitationVaultAccess(
    workspaceId: string,
    invitationId: string,
    body: InvitationVaultAccessUpdateRequestDto,
  ): Promise<{ updated: true }> {
    return this.api.put<{ updated: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/invitations/${encodeURIComponent(invitationId)}/vault-access`,
      body,
    );
  }

  updateWorkspaceMember(
    workspaceId: string,
    userId: string,
    body: WorkspaceMemberUpdateRequestDto,
  ): Promise<{ updated: true }> {
    return this.api.patch<{ updated: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
      body,
    );
  }

  deleteWorkspaceMember(workspaceId: string, userId: string): Promise<{ deleted: true }> {
    return this.api.delete<{ deleted: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}`,
    );
  }

  getMemberVaultAccess(workspaceId: string, userId: string): Promise<MemberVaultAccessResponseDto> {
    return this.api.get<MemberVaultAccessResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/vault-access`,
    );
  }

  updateMemberVaultAccess(
    workspaceId: string,
    userId: string,
    body: MemberVaultAccessUpdateRequestDto,
  ): Promise<{ updated: true }> {
    return this.api.put<{ updated: true }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/members/${encodeURIComponent(userId)}/vault-access`,
      body,
    );
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

  getWorkspaceCapsuleDefaults(
    workspaceId: string,
  ): Promise<CapsuleDefaultsListResponseDto> {
    return this.api.get<CapsuleDefaultsListResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/capsule-defaults`,
    );
  }

  updateWorkspaceCapsuleDefaults(
    workspaceId: string,
    body: CapsuleDefaultsUpsertRequestDto,
  ): Promise<CapsuleDefaultsUpsertResponseDto> {
    return this.api.put<CapsuleDefaultsUpsertResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/capsule-defaults`,
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

  requestWorkspacePlanChange(
    workspaceId: string,
    body: WorkspacePlanChangeRequestDto,
  ): Promise<WorkspacePlanChangeRequestResponseDto> {
    return this.api.post<WorkspacePlanChangeRequestResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/plan-change-requests`,
      body,
    );
  }

  listWorkspaceRoles(workspaceId: string): Promise<WorkspaceRolesListResponseDto> {
    return this.api.get<WorkspaceRolesListResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/roles`,
    );
  }

  listWorkspaceProfiles(workspaceId: string): Promise<WorkspaceBuiltInProfilesListResponseDto> {
    return this.api.get<WorkspaceBuiltInProfilesListResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/profiles`,
    );
  }

  getVault(vaultId: string): Promise<Vault> {
    return this.api.get<Vault>(`/vaults/${encodeURIComponent(vaultId)}`);
  }

  updateVault(vaultId: string, body: VaultUpdateRequestDto): Promise<Vault> {
    return this.api.patch<Vault>(`/vaults/${encodeURIComponent(vaultId)}`, body);
  }

  deleteVault(vaultId: string): Promise<{ deleted: true }> {
    return this.api.delete<{ deleted: true }>(`/vaults/${encodeURIComponent(vaultId)}`);
  }

  getVaultAccess(vaultId: string): Promise<VaultAccessResponseDto> {
    return this.api.get<VaultAccessResponseDto>(`/vaults/${encodeURIComponent(vaultId)}/access`);
  }

  updateVaultAccess(vaultId: string, body: VaultAccessUpdateRequestDto): Promise<{ updated: true }> {
    return this.api.put<{ updated: true }>(`/vaults/${encodeURIComponent(vaultId)}/access`, body);
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
    this.assertStrictWritePathCapability(body.encryptedMetadata, "capsule.create");
    this.assertStrictWritePathCapability(body.ownerKeyWrap, "capsule.create");
    if (body.filePayload) {
      this.assertStrictWritePathCapability(body.filePayload, "capsule.create");
    }
    return this.api.post<CapsuleMetadataDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/capsules`,
      body,
    );
  }

  getOwnerCapsule(capsuleId: string): Promise<CapsuleOwnerDetailDto> {
    return this.api.get<CapsuleOwnerDetailDto>(
      `/capsules/${encodeURIComponent(capsuleId)}/owner`,
    );
  }

  updateCapsule(capsuleId: string, body: CapsuleUpdateRequestDto): Promise<CapsuleMetadataDto> {
    this.assertStrictWritePathCapability(body.encryptedPayload, "capsule.create");
    this.assertStrictWritePathCapability(body.encryptedMetadata, "capsule.create");
    this.assertStrictWritePathCapability(body.ownerKeyWrap, "capsule.create");
    if (body.filePayload) {
      this.assertStrictWritePathCapability(body.filePayload, "capsule.create");
    }
    return this.api.put<CapsuleMetadataDto>(
      `/capsules/${encodeURIComponent(capsuleId)}`,
      body,
    );
  }

  getCapsule(capsuleId: string): Promise<CapsuleMetadataDto> {
    return this.api.get<CapsuleMetadataDto>(`/capsules/${encodeURIComponent(capsuleId)}`);
  }

  openCapsule(
    capsuleId: string,
    options?: { password?: string; approvalToken?: string; guestSessionId?: string },
  ): Promise<CapsuleOpenResponseDto> {
    const body: Record<string, string> = {};
    if (options?.password) body.password = options.password;
    if (options?.approvalToken) body.approvalToken = options.approvalToken;
    if (options?.guestSessionId) body.guestSessionId = options.guestSessionId;
    return this.api.post<CapsuleOpenResponseDto>(
      `/capsules/${encodeURIComponent(capsuleId)}/open`,
      Object.keys(body).length > 0 ? body : {},
    );
  }

  revokeCapsule(capsuleId: string): Promise<{ revoked: true }> {
    return this.api.post<{ revoked: true }>(`/capsules/${encodeURIComponent(capsuleId)}/revoke`, {});
  }

  listCapsules(workspaceId: string, page = 1): Promise<CapsuleListResponseDto> {
    return this.api.get<CapsuleListResponseDto>(
      `/workspaces/${encodeURIComponent(workspaceId)}/capsules?page=${page}`,
    );
  }

  setCapsuleState(capsuleId: string, state: "active" | "inactive"): Promise<CapsuleMetadataDto> {
    return this.api.patch<CapsuleMetadataDto>(
      `/capsules/${encodeURIComponent(capsuleId)}/state`,
      { state },
    );
  }

  deleteCapsule(capsuleId: string): Promise<{ deleted: true }> {
    return this.api.delete<{ deleted: true }>(`/capsules/${encodeURIComponent(capsuleId)}`);
  }

  requestCapsuleApproval(
    capsuleId: string,
    input: { deviceLabel?: string; platform?: string; guestSessionId?: string },
  ): Promise<CapsuleApprovalStatusDto> {
    return this.api.post<CapsuleApprovalStatusDto>(
      `/capsules/${encodeURIComponent(capsuleId)}/approval-requests`,
      input,
    );
  }

  getCapsuleApprovalEligibility(capsuleId: string): Promise<CapsuleApprovalEligibilityDto> {
    return this.api.get<CapsuleApprovalEligibilityDto>(
      `/capsules/${encodeURIComponent(capsuleId)}/approval-eligibility`,
    );
  }

  getCapsuleApprovalStatus(
    requestId: string,
    options?: { guestSessionId?: string },
  ): Promise<CapsuleApprovalStatusDto> {
    const query = options?.guestSessionId
      ? `?guestSessionId=${encodeURIComponent(options.guestSessionId)}`
      : "";
    return this.api.get<CapsuleApprovalStatusDto>(
      `/capsule-approval-requests/${encodeURIComponent(requestId)}${query}`,
    );
  }

  listPendingCapsuleApprovals(): Promise<CapsuleApprovalListResponseDto> {
    return this.api.get<CapsuleApprovalListResponseDto>("/capsule-approval-requests");
  }

  resolveCapsuleApproval(
    requestId: string,
    decision: "approve" | "deny" | "blacklist",
  ): Promise<CapsuleApprovalResolveResponseDto> {
    return this.api.post<CapsuleApprovalResolveResponseDto>(
      `/capsule-approval-requests/${encodeURIComponent(requestId)}/resolve`,
      { decision },
    );
  }

  registerDevice(body: DeviceRegisterRequestDto): Promise<DeviceRegisterResponseDto> {
    return this.api.post<DeviceRegisterResponseDto>("/devices/register", body);
  }

  listDevices(currentFingerprint?: string): Promise<DeviceListResponseDto> {
    const query = currentFingerprint
      ? `?device_fingerprint=${encodeURIComponent(currentFingerprint)}`
      : "";
    return this.api.get<DeviceListResponseDto>(`/devices${query}`, {
      headers: currentFingerprint
        ? { "X-Device-Fingerprint": currentFingerprint }
        : undefined,
    });
  }

  getAccountRecoveryStatus(): Promise<AccountRecoveryStatusResponseDto> {
    return this.api.get<AccountRecoveryStatusResponseDto>("/account/recovery");
  }

  patchAccountRecoverySettings(
    body: AccountRecoverySettingsUpdateRequestDto,
  ): Promise<AccountRecoveryStatusResponseDto> {
    return this.api.patch<AccountRecoveryStatusResponseDto>("/account/recovery/settings", body);
  }

  enrollAccountRecoveryKey(
    body: AccountRecoveryKeyEnrollRequestDto,
  ): Promise<AccountRecoveryKeyEnrollResponseDto> {
    return this.api.post<AccountRecoveryKeyEnrollResponseDto>("/account/recovery/key/enroll", body);
  }

  rotateAccountRecoveryKey(
    body: AccountRecoveryKeyEnrollRequestDto,
  ): Promise<AccountRecoveryKeyEnrollResponseDto> {
    return this.api.post<AccountRecoveryKeyEnrollResponseDto>("/account/recovery/key/rotate", body);
  }

  ackAccountRecoveryKeyExport(): Promise<AccountRecoveryStatusResponseDto> {
    return this.api.post<AccountRecoveryStatusResponseDto>("/account/recovery/key/ack-export", {});
  }

  getAccountRecoveryKeyWrap(): Promise<AccountRecoveryKeyWrapResponseDto> {
    return this.api.get<AccountRecoveryKeyWrapResponseDto>("/account/recovery/key/wrap");
  }

  /** Ciphertext identity key for post-recovery local vault bundle bootstrap. */
  getAccountRecoveryIdentityEncryptedKey(): Promise<{ encrypted_private_key: EncryptedBlobDto }> {
    return this.api.get<{ encrypted_private_key: EncryptedBlobDto }>(
      "/account/recovery/identity-encrypted-key",
    );
  }

  inviteTrustedContact(
    body: TrustedContactInviteRequestDto,
  ): Promise<TrustedContactInviteResponseDto> {
    return this.api.post<TrustedContactInviteResponseDto>("/account/recovery/contacts", body);
  }

  deleteTrustedContact(contactId: string): Promise<AccountRecoveryStatusResponseDto> {
    return this.api.delete<AccountRecoveryStatusResponseDto>(
      `/account/recovery/contacts/${encodeURIComponent(contactId)}`,
    );
  }

  acceptTrustedContactInvite(inviteId: string): Promise<AccountRecoveryStatusResponseDto> {
    return this.api.post<AccountRecoveryStatusResponseDto>(
      `/account/recovery/contacts/invites/${encodeURIComponent(inviteId)}/accept`,
      {},
    );
  }

  rejectTrustedContactInvite(inviteId: string): Promise<AccountRecoveryStatusResponseDto> {
    return this.api.post<AccountRecoveryStatusResponseDto>(
      `/account/recovery/contacts/invites/${encodeURIComponent(inviteId)}/reject`,
      {},
    );
  }

  /** Leave another owner's trusted-contact list (you are the contact). */
  leaveTrustedContactMembership(contactId: string): Promise<AccountRecoveryStatusResponseDto> {
    return this.api.delete<AccountRecoveryStatusResponseDto>(
      `/account/recovery/contacts/memberships/${encodeURIComponent(contactId)}`,
    );
  }

  patchDevice(deviceId: string, body: DevicePatchRequestDto): Promise<DevicePatchResponseDto> {
    return this.api.patch<DevicePatchResponseDto>(
      `/devices/${encodeURIComponent(deviceId)}`,
      body,
    );
  }

  revokeDevice(deviceId: string, reason?: string): Promise<DeviceRevokeResponseDto> {
    return this.api.post<DeviceRevokeResponseDto>(
      `/devices/${encodeURIComponent(deviceId)}/revoke`,
      reason !== undefined ? { reason } : {},
    );
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

  blockDevice(
    pendingDeviceId: string,
    approverDeviceId: string,
    body: DeviceBlockRequestDto,
  ): Promise<DeviceBlockResponseDto> {
    return this.api.post<DeviceBlockResponseDto>(
      `/devices/${encodeURIComponent(pendingDeviceId)}/block`,
      body,
      { headers: { "X-Device-Id": approverDeviceId } },
    );
  }

  unblockDevice(
    deviceId: string,
    body?: DeviceUnblockRequestDto,
  ): Promise<DeviceUnblockResponseDto> {
    return this.api.post<DeviceUnblockResponseDto>(
      `/devices/${encodeURIComponent(deviceId)}/unblock`,
      body ?? {},
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
  return new CoreApiClient(
    createBearerApiClient(baseUrl, accessToken, options?.defaultHeaders),
    options,
  );
}

/** @deprecated Prefer {@link CoreApiClient}; kept for existing app imports. */
export type CoreClient = CoreApiClient;
