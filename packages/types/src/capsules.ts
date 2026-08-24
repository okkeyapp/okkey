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
  /** Item field attachments keyed by vault attachment id. */
  attachmentFilePayloads?: Record<string, EncryptedBlobDto>;
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

export interface CapsuleOwnerDetailDto extends CapsuleOwnerListEntryDto {
  encryptedPayload: EncryptedBlobDto;
  filePayload?: EncryptedBlobDto;
  /** Owner-only: emails used for access restriction (for edit form). */
  allowedRecipientEmails?: string[];
}

export interface CapsuleUpdateRequestDto extends CapsuleCreateRequestDto {
  keepExistingPassword?: boolean;
  keepExistingRecipients?: boolean;
  keepExistingFile?: boolean;
}

export interface CapsuleOpenResponseDto extends CapsuleMetadataDto {
  encryptedPayload: EncryptedBlobDto;
  filePayload?: EncryptedBlobDto;
  /** Item field attachments keyed by vault attachment id. */
  attachmentPayloads?: Record<string, EncryptedBlobDto>;
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
  requesterUserId: EntityId | null;
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

export type CapsuleSchedulePreset =
  | "never"
  | "now"
  | "15m"
  | "1h"
  | "6h"
  | "12h"
  | "24h";

/** Non-secret access defaults for the create-capsule form (per member, shared across types). */
export interface CapsuleAccessDefaultsDto {
  viewsEnabled: boolean;
  maxViews: number;
  viewLimitAction: CapsuleViewLimitAction;
  timeEnabled: boolean;
  activatePreset: CapsuleSchedulePreset;
  deactivatePreset: CapsuleSchedulePreset;
  deletePreset: CapsuleSchedulePreset;
  accessEnabled: boolean;
  passwordEnabled: boolean;
  attemptLimit: number;
  approvalRequired: boolean;
}

export interface CapsuleDefaultsEntryDto {
  type: CapsuleType;
  settings: CapsuleAccessDefaultsDto;
}

/** `GET /workspaces/:workspaceId/capsule-defaults` (Bearer). */
export interface CapsuleDefaultsListResponseDto {
  defaults: CapsuleDefaultsEntryDto[];
}

/** `PUT /workspaces/:workspaceId/capsule-defaults` (Bearer). */
export interface CapsuleDefaultsUpsertRequestDto {
  settings: CapsuleAccessDefaultsDto;
  /** Older API builds required a type; current API applies settings to all types. */
  type?: CapsuleType;
}

export interface CapsuleDefaultsUpsertResponseDto {
  settings: CapsuleAccessDefaultsDto;
}
