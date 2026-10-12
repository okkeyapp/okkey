/** Core-only stub when `okkey-enterprise` is not present (self-host Docker / OSS build). */

export type EnterpriseEncryptedBlobDto = {
  crypto_version: number;
  algorithm: string;
  payload: string;
  meta?: Record<string, unknown>;
};

export type EnterpriseDeviceRecoveryRequestDto = {
  id: string;
  status: "pending" | "approved" | "revoked" | "expired";
  createdAt: string;
  expiresAt: string;
  approvedAt: string | null;
  requestEphemeralPublicB64: string;
  wrapBlob?: EnterpriseEncryptedBlobDto | null;
  requestingDeviceId: string | null;
  deviceName: string | null;
  platform: string | null;
  osName: string | null;
  osVersion: string | null;
  clientType: string | null;
  userAgent: string | null;
  requestIp: string | null;
  country: string | null;
  city: string | null;
  closedReason: "rejected" | "blocked" | "owner_revoked" | null;
};

export type EnterpriseContactRecoveryRequestDto = {
  id: string;
  status: "pending" | "ready" | "revoked" | "expired";
  generationId: string;
  threshold: number;
  createdAt: string;
  expiresAt: string;
  requestEphemeralPublicB64: string;
  releaseCount: number;
  ownerEmail?: string | null;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
  releases?: Array<{
    contactId: string;
    contactUserId: string;
    shareIndex: number;
    releaseWrapBlob: EnterpriseEncryptedBlobDto;
    createdAt: string;
  }>;
};

export type EnterpriseContactsEnrollStatusDto = {
  enrolled: boolean;
  generation: number | null;
  threshold: number | null;
  shareCount: number | null;
  confirmedContactCount: number;
  minContacts: number;
};

export type EnterpriseDeviceRecoveryRequesterInput = {
  requestingDeviceId?: string;
  deviceFingerprint?: string;
  deviceName?: string;
  platform?: string;
  osName?: string;
  osVersion?: string;
  clientType?: string;
  userAgent?: string;
};
