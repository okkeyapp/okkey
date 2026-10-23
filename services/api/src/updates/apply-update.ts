import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ApiConfig } from "../config.ts";
import {
  resolveInstanceVersion,
  type InstanceVersionPayload,
} from "../version/resolve-instance-version.ts";
import { diffAvailableUpdates, type AvailableUpdate } from "./feed-contract.ts";
import {
  isUpdateFeedConfigured,
  loadUpdateFeedDocument,
} from "./load-update-feed.ts";

export type UpdateApplyMode = "off" | "agent" | "hook" | "version_file";

export type ApplyUpdateResult =
  | {
      ok: true;
      applied: true;
      current: { okkey: string; enterprise: string | null };
      mode: Exclude<UpdateApplyMode, "off">;
    }
  | {
      ok: false;
      applied: false;
      error: "UPDATE_APPLY_UNAVAILABLE" | "UPDATE_APPLY_FAILED";
      message: string;
      current: { okkey: string; enterprise: string | null };
      status: 501 | 502;
    };

export function parseUpdateApplyMode(raw: string | undefined | null): UpdateApplyMode {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "agent" || value === "hook" || value === "version_file") {
    return value;
  }
  return "off";
}

function instanceCurrent(instance: InstanceVersionPayload): {
  okkey: string;
  enterprise: string | null;
} {
  return { okkey: instance.okkey, enterprise: instance.enterprise };
}

async function loadAvailableUpdates(config: ApiConfig): Promise<{
  instance: InstanceVersionPayload;
  available: AvailableUpdate[];
}> {
  const instance = resolveInstanceVersion({
    deploymentMode: config.deploymentMode,
    enterpriseModulesEnabled: config.enterpriseModulesEnabled,
    enterpriseModulesPath: config.enterpriseModulesPath,
    versionFilePath: config.updateVersionFilePath || null,
  });
  const source = {
    url: config.updateFeedUrl ?? "",
    path: config.updateFeedPath ?? "",
    timeoutMs: config.updateFeedTimeoutMs ?? 5000,
  };
  if (!isUpdateFeedConfigured(source)) {
    return { instance, available: [] };
  }
  const feed = await loadUpdateFeedDocument(source);
  const diff = diffAvailableUpdates({
    deploymentMode: config.deploymentMode,
    feedConfigured: true,
    currentOkkey: instance.okkey,
    currentEnterprise: instance.enterprise,
    feed,
    // Apply considers the full installed set; plan filtering is for check/UI.
    planTier: instance.enterprise ? "ENTERPRISE" : "FREE",
  });
  return { instance, available: diff.available };
}

function writeVersionFile(
  filePath: string,
  next: { okkey: string; enterprise: string | null },
): void {
  const dir = path.dirname(filePath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    filePath,
    `${JSON.stringify({ okkey: next.okkey, enterprise: next.enterprise }, null, 2)}\n`,
    "utf8",
  );
}

function nextVersionsFromAvailable(
  instance: InstanceVersionPayload,
  available: AvailableUpdate[],
): { okkey: string; enterprise: string | null } {
  const okkeyUpdate = available.find((u) => u.id === "okkey");
  const enterpriseUpdate = available.find((u) => u.id === "okkey-enterprise");
  return {
    okkey: okkeyUpdate?.to ?? instance.okkey,
    enterprise: enterpriseUpdate?.to ?? instance.enterprise,
  };
}

async function applyViaAgent(
  config: ApiConfig,
  instance: InstanceVersionPayload,
  available: AvailableUpdate[],
): Promise<ApplyUpdateResult> {
  const url = config.updateAgentUrl.trim();
  if (!url) {
    return {
      ok: false,
      applied: false,
      error: "UPDATE_APPLY_UNAVAILABLE",
      message: "OKKEY_UPDATE_AGENT_URL is not set.",
      current: instanceCurrent(instance),
      status: 501,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.updateAgentTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        current: instanceCurrent(instance),
        available,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        applied: false,
        error: "UPDATE_APPLY_FAILED",
        message: text.trim() || `Update agent HTTP ${response.status}`,
        current: instanceCurrent(instance),
        status: 502,
      };
    }
    let bodyApplied = true;
    try {
      const body = (await response.json()) as { applied?: unknown };
      if (body.applied === false) {
        bodyApplied = false;
      }
    } catch {
      // empty / non-JSON 2xx still counts as applied
    }
    if (!bodyApplied) {
      return {
        ok: false,
        applied: false,
        error: "UPDATE_APPLY_FAILED",
        message: "Update agent declined apply.",
        current: instanceCurrent(instance),
        status: 502,
      };
    }
    const next = nextVersionsFromAvailable(instance, available);
    if (config.updateVersionFilePath.trim()) {
      writeVersionFile(config.updateVersionFilePath, next);
    }
    return {
      ok: true,
      applied: true,
      current: next,
      mode: "agent",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update agent request failed";
    return {
      ok: false,
      applied: false,
      error: "UPDATE_APPLY_FAILED",
      message,
      current: instanceCurrent(instance),
      status: 502,
    };
  } finally {
    clearTimeout(timer);
  }
}

function applyViaHook(
  config: ApiConfig,
  instance: InstanceVersionPayload,
  available: AvailableUpdate[],
): Promise<ApplyUpdateResult> {
  const hook = config.updateApplyHook.trim();
  if (!hook) {
    return Promise.resolve({
      ok: false,
      applied: false,
      error: "UPDATE_APPLY_UNAVAILABLE",
      message: "OKKEY_UPDATE_APPLY_HOOK is not set.",
      current: instanceCurrent(instance),
      status: 501,
    });
  }
  const next = nextVersionsFromAvailable(instance, available);
  return new Promise((resolve) => {
    const child = spawn(hook, [], {
      env: {
        ...process.env,
        OKKEY_UPDATE_CURRENT_OKKEY: instance.okkey,
        OKKEY_UPDATE_CURRENT_ENTERPRISE: instance.enterprise ?? "",
        OKKEY_UPDATE_TARGET_OKKEY: next.okkey,
        OKKEY_UPDATE_TARGET_ENTERPRISE: next.enterprise ?? "",
        OKKEY_UPDATE_AVAILABLE_JSON: JSON.stringify(available),
        OKKEY_VERSION_FILE: config.updateVersionFilePath,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      resolve({
        ok: false,
        applied: false,
        error: "UPDATE_APPLY_FAILED",
        message: error.message,
        current: instanceCurrent(instance),
        status: 502,
      });
    });
    child.on("close", (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          applied: false,
          error: "UPDATE_APPLY_FAILED",
          message: stderr.trim() || `Update hook exited with code ${code ?? "null"}`,
          current: instanceCurrent(instance),
          status: 502,
        });
        return;
      }
      if (config.updateVersionFilePath.trim()) {
        writeVersionFile(config.updateVersionFilePath, next);
      }
      resolve({
        ok: true,
        applied: true,
        current: next,
        mode: "hook",
      });
    });
  });
}

function applyViaVersionFile(
  config: ApiConfig,
  instance: InstanceVersionPayload,
  available: AvailableUpdate[],
): ApplyUpdateResult {
  const filePath = config.updateVersionFilePath.trim();
  if (!filePath) {
    return {
      ok: false,
      applied: false,
      error: "UPDATE_APPLY_UNAVAILABLE",
      message: "OKKEY_VERSION_FILE is required for version_file apply mode.",
      current: instanceCurrent(instance),
      status: 501,
    };
  }
  if (available.length === 0) {
    return {
      ok: false,
      applied: false,
      error: "UPDATE_APPLY_FAILED",
      message: "No available updates to apply.",
      current: instanceCurrent(instance),
      status: 502,
    };
  }
  const next = nextVersionsFromAvailable(instance, available);
  writeVersionFile(filePath, next);
  return {
    ok: true,
    applied: true,
    current: next,
    mode: "version_file",
  };
}

/**
 * Apply available self-host updates without mounting docker.sock in the API process.
 *
 * Modes (`OKKEY_UPDATE_APPLY_MODE`):
 * - `agent` — POST to signed update agent (`OKKEY_UPDATE_AGENT_URL`)
 * - `hook` — run external script (`OKKEY_UPDATE_APPLY_HOOK`; may compose pull on the host)
 * - `version_file` — local/dev smoke: write target versions to `OKKEY_VERSION_FILE`
 * - `off` (default) — 501 until an apply path is configured
 */
export async function applySystemUpdates(config: ApiConfig): Promise<ApplyUpdateResult> {
  const instance = resolveInstanceVersion({
    deploymentMode: config.deploymentMode,
    enterpriseModulesEnabled: config.enterpriseModulesEnabled,
    enterpriseModulesPath: config.enterpriseModulesPath,
    versionFilePath: config.updateVersionFilePath || null,
  });
  const current = instanceCurrent(instance);

  if (config.deploymentMode !== "self_hosted") {
    return {
      ok: false,
      applied: false,
      error: "UPDATE_APPLY_UNAVAILABLE",
      message: "System updates apply is self-host only",
      current,
      status: 501,
    };
  }

  const mode = config.updateApplyMode;
  if (mode === "off") {
    return {
      ok: false,
      applied: false,
      error: "UPDATE_APPLY_UNAVAILABLE",
      message:
        "Update apply is not configured. Set OKKEY_UPDATE_APPLY_MODE=agent|hook|version_file (API does not use docker.sock).",
      current,
      status: 501,
    };
  }

  let available: AvailableUpdate[];
  try {
    ({ available } = await loadAvailableUpdates(config));
  } catch (error) {
    return {
      ok: false,
      applied: false,
      error: "UPDATE_APPLY_FAILED",
      message: error instanceof Error ? error.message : "Failed to load update feed",
      current,
      status: 502,
    };
  }

  if (mode === "agent") {
    return applyViaAgent(config, instance, available);
  }
  if (mode === "hook") {
    return applyViaHook(config, instance, available);
  }
  return applyViaVersionFile(config, instance, available);
}
