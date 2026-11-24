import { CoreApiClient } from "@okkey/api";
import type { DeviceApprovalStatusResponseDto, DeviceRegisterResponseDto } from "@okkey/types";

import { createPublicApiClient } from "../api/client";

const STORAGE_KEY = "okkey.deviceApprovalStatus";

export interface DeviceApprovalCredential {
  token: string;
  deviceId: string;
  expiresAt: string;
}

let memory: DeviceApprovalCredential | null = null;

function sessionStorageOk(): boolean {
  return (
    typeof sessionStorage !== "undefined" &&
    typeof sessionStorage.getItem === "function" &&
    typeof sessionStorage.setItem === "function" &&
    typeof sessionStorage.removeItem === "function"
  );
}

function isExpired(value: DeviceApprovalCredential, now = Date.now()): boolean {
  const exp = Date.parse(value.expiresAt);
  return !Number.isFinite(exp) || now >= exp;
}

function parseStored(raw: string | null): DeviceApprovalCredential | null {
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<DeviceApprovalCredential>;
    if (!parsed.token || !parsed.deviceId || !parsed.expiresAt) {
      return null;
    }
    return { token: parsed.token, deviceId: parsed.deviceId, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

/** Keep the credential in memory and sessionStorage. Never localStorage. */
export function rememberDeviceApprovalStatus(value: DeviceApprovalCredential): void {
  memory = value;
  if (sessionStorageOk()) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }
}

export function readDeviceApprovalStatus(): DeviceApprovalCredential | null {
  if (memory && !isExpired(memory)) {
    return memory;
  }
  memory = null;
  if (!sessionStorageOk()) {
    return null;
  }
  const stored = parseStored(sessionStorage.getItem(STORAGE_KEY));
  if (!stored || isExpired(stored)) {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
  memory = stored;
  return stored;
}

export function clearDeviceApprovalStatus(): void {
  memory = null;
  if (sessionStorageOk()) {
    sessionStorage.removeItem(STORAGE_KEY);
  }
}

export function rememberApprovalFromRegister(registered: DeviceRegisterResponseDto): void {
  if (
    registered.status === "pending_approval" &&
    registered.approval_status_token &&
    registered.approval_status_expires_at
  ) {
    rememberDeviceApprovalStatus({
      token: registered.approval_status_token,
      deviceId: registered.device_id,
      expiresAt: registered.approval_status_expires_at,
    });
    return;
  }
  if (registered.status === "trusted" || registered.status === "blocked") {
    clearDeviceApprovalStatus();
  }
}

export function trustFromApprovalStatus(body: DeviceApprovalStatusResponseDto): {
  status: "pending" | "trusted" | "rejected" | "blocked";
  blockedUntil: string | null;
  deviceId: string;
} {
  if (body.status === "approved") {
    return { status: "trusted", blockedUntil: null, deviceId: body.device_id };
  }
  if (body.status === "blocked") {
    return {
      status: "blocked",
      blockedUntil: body.blocked_until ?? null,
      deviceId: body.device_id,
    };
  }
  if (body.status === "rejected") {
    return { status: "rejected", blockedUntil: null, deviceId: body.device_id };
  }
  return { status: "pending", blockedUntil: null, deviceId: body.device_id };
}

function statusClient(): CoreApiClient {
  return new CoreApiClient(createPublicApiClient());
}

export async function fetchDeviceApprovalStatus(credential: DeviceApprovalCredential) {
  return statusClient().getDeviceApprovalStatus(credential.deviceId, credential.token);
}

export async function retryDeviceApprovalRequest(credential: DeviceApprovalCredential) {
  return statusClient().retryDeviceApproval(credential.deviceId, credential.token);
}
