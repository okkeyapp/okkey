import { getApiBaseUrl } from "../api/client";
import type { SystemUpdateComponent, SystemUpdateJob, SystemUpdateStatus } from "./visibility";

async function request<T>(accessToken: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json()) as T & { error?: string; message?: string };
  if (!response.ok) {
    const error = new Error(body.message || "Request failed");
    (error as Error & { code?: string; status?: number }).code = body.error;
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return body;
}

export async function fetchSystemUpdateStatus(accessToken: string): Promise<SystemUpdateStatus> {
  return request<SystemUpdateStatus>(accessToken, "/system/updates");
}

export async function dismissSystemUpdate(
  accessToken: string,
  component: SystemUpdateComponent,
  version: string,
): Promise<void> {
  await request(accessToken, "/system/updates/dismiss", {
    method: "POST",
    body: JSON.stringify({ component, version }),
  });
}

export async function applySystemUpdate(
  accessToken: string,
  body: { source: "feed"; component: SystemUpdateComponent } | { source: "file"; document: unknown },
): Promise<SystemUpdateJob> {
  const response = await request<{ job: SystemUpdateJob }>(accessToken, "/system/updates/apply", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return response.job;
}

export async function fetchSystemUpdateJob(accessToken: string, jobId: string): Promise<SystemUpdateJob> {
  const response = await request<{ job: SystemUpdateJob }>(
    accessToken,
    `/system/updates/jobs/${encodeURIComponent(jobId)}`,
  );
  return response.job;
}
