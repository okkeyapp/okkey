import type { EntityId } from "./entity-id.js";
import type { EncryptedBlobDto } from "./index.js";

export type CapsuleType = "text" | "file" | "item";
export type CapsuleState = "active" | "inactive";
export type CapsuleViewLimitAction = "deactivate" | "delete";
export type CapsuleKeyTransportMode = "fragment" | "out_of_band";
export type CapsuleApprovalStatus = "pending" | "approved" | "denied" | "consumed" | "expired";

export interface CapsuleMetadataDto {
  capsuleId: EntityId;
  workspaceId?: EntityId;
  type: CapsuleType;
  state: CapsuleState;
  activateAt: string | null;
  deactivateAt: string | null;
  deleteAt: string | null;
  maxViews: number | null;
  viewCount: number;
  viewLimitAction: CapsuleViewLimitAction;
  passwordRequired: boolean;
  passwordAttemptLimit: number | null;
  recipientRestricted: boolean;
  approvalRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CapsuleOwnerListEntryDto extends CapsuleMetadataDto {
  encryptedMetadata: EncryptedBlobDto;
  ownerKeyWrap: EncryptedBlobDto;
}

export interface CapsuleListResponseDto {
  capsules: CapsuleOwnerListEntryDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface CapsuleCreateRequestDto {
  type: CapsuleType;
  encryptedPayload: EncryptedBlobDto;
  encryptedMetadata: EncryptedBlobDto;
  ownerKeyWrap: EncryptedBlobDto;
  filePayload?: EncryptedBlobDto;
  keyTransportMode?: CapsuleKeyTransportMode;
  activateAt?: string;
  deactivateAt?: string;
  deleteAt?: string;
  maxViews?: number;
  viewLimitAction?: CapsuleViewLimitAction;
  password?: string;
  passwordAttemptLimit?: number;
  allowedRecipientEmails?: string[];
  approvalRequired?: boolean;
}

export interface CapsuleOpenResponseDto extends CapsuleMetadataDto {
  encryptedPayload: EncryptedBlobDto;
  filePayload?: EncryptedBlobDto;
  approvalRequestId?: EntityId;
}

export interface CapsuleOpenRequestDto {
  password?: string;
  keyTransportMode?: CapsuleKeyTransportMode;
  approvalToken?: string;
}

export interface CapsuleStateUpdateRequestDto {
  state: CapsuleState;
}

export interface CapsuleApprovalRequestCreateDto {
  deviceLabel?: string;
  platform?: string;
}

export interface CapsuleApprovalRequestDto {
  requestId: EntityId;
  capsuleId: EntityId;
  capsuleType: CapsuleType;
  encryptedCapsuleMetadata?: EncryptedBlobDto;
  ownerKeyWrap?: EncryptedBlobDto;
  requesterUserId: EntityId;
  requesterEmail: string;
  requesterName: string | null;
  deviceLabel: string;
  platform: string;
  ipAddress: string;
  country: string | null;
  city: string | null;
  requestedAt: string;
  status: CapsuleApprovalStatus;
}

export interface CapsuleApprovalListResponseDto {
  requests: CapsuleApprovalRequestDto[];
}

export interface CapsuleApprovalResolveRequestDto {
  decision: "approve" | "deny";
}

export interface CapsuleApprovalResolveResponseDto {
  requestId: EntityId;
  status: "approved" | "denied";
}

export interface CapsuleApprovalStatusDto {
  requestId: EntityId;
  status: CapsuleApprovalStatus;
  approvalToken?: string;
}
