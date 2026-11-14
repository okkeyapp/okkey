import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { isSystemUpdateError, SystemUpdateError } from "../system-updates/errors.ts";
import {
  claimedPackageComponent,
  takeRegistryCredentials,
  verifyOfflinePackage,
  type OfflinePackagePayload,
  type RegistryPullCredentials,
} from "../system-updates/package-format.ts";
import type { UpdateJob } from "../system-updates/service.ts";
import { applyVerifiedCorePackage, nodeEnvFileEngine, type UpdateApplyEngine } from "./apply.ts";
import { applyVerifiedEnterprisePackage } from "./enterprise-apply.ts";
import { credentialSecrets, scrubSecrets } from "./registry-auth.ts";

export type UpdateAgentOptions = {
  token: string;
  /** Trusted public key for core (`okkey`) packages. */
  publicKeyPem: string;
  /** Trusted public key for enterprise packages. Core packages are never checked with this key. */
  enterprisePublicKeyPem?: string;
  /** Fallback core version when the api container and env file do not name one. */
  coreVersion?: string;
  isolated: boolean;
  project: string;
  envFilePath: string;
  engine: Omit<UpdateApplyEngine, "readEnvFile" | "writeEnvFile">;
  /**
   * Test hook. When it throws, verification is treated as interrupted and apply is not called.
   */
  verify?: typeof verifyOfflinePackage;
};

type StoredJob = UpdateJob & { rollbackStarted?: boolean };

export function createUpdateAgent(options: UpdateAgentOptions) {
  const jobs = new Map<string, StoredJob>();
  let active = false;
  const verify = options.verify ?? verifyOfflinePackage;
  const engine = nodeEnvFileEngine(options.engine);

  async function readBody(req: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > 1_000_000) {
        throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package exceeds the size limit");
      }
      chunks.push(buffer);
    }
    if (chunks.length === 0) {
      return {};
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      throw new SystemUpdateError(400, "PACKAGE_INVALID", "Package must be JSON");
    }
  }

  async function execute(job: StoredJob, document: unknown): Promise<void> {
    job.status = "verifying";
    job.progress = 15;
    let registryCredentials: RegistryPullCredentials | undefined;
    try {
      registryCredentials = takeRegistryCredentials(document);
    } catch (error) {
      fail(job, error, "PACKAGE_INVALID");
      return;
    }
    const secrets = credentialSecrets(registryCredentials);
    const claimed = claimedPackageComponent(document);
    let payload: OfflinePackagePayload;
    try {
      const publicKey =
        claimed === "enterprise" ? (options.enterprisePublicKeyPem ?? "") : options.publicKeyPem;
      payload = verify(document, publicKey).payload;
    } catch (error) {
      if (claimed === "enterprise" && isSystemUpdateError(error) && error.code === "TRUST_KEY_MISSING") {
        fail(
          job,
          new SystemUpdateError(
            400,
            "TRUST_KEY_MISSING",
            "No trusted enterprise public key is configured, so the package was not applied",
          ),
          secrets,
        );
        return;
      }
      fail(job, error, "VERIFICATION_INTERRUPTED", secrets);
      return;
    }
    job.component = payload.component;
    job.fromVersion = payload.fromVersion;
    job.toVersion = payload.version;
    if (payload.component !== "enterprise") {
      registryCredentials = undefined;
    }
    job.status = "applying";
    job.progress = 60;
    try {
      if (payload.component === "enterprise") {
        await applyVerifiedEnterprisePackage({
          payload,
          engine,
          project: options.project,
          envFilePath: options.envFilePath,
          isolated: options.isolated,
          coreVersionHint: options.coreVersion ?? "",
          registryCredentials,
        });
      } else {
        await applyVerifiedCorePackage({
          payload,
          engine,
          project: options.project,
          envFilePath: options.envFilePath,
          isolated: options.isolated,
        });
      }
      job.status = "succeeded";
      job.progress = 100;
    } catch (error) {
      fail(job, error, "APPLY_FAILED", secrets);
    }
  }

  function fail(job: StoredJob, error: unknown, fallback: string, secrets: readonly string[] = []): void {
    job.status = "failed";
    if (isSystemUpdateError(error)) {
      job.errorCode = error.code;
      job.errorMessage = scrubSecrets(error.message, secrets);
      return;
    }
    job.errorCode = fallback;
    job.errorMessage = scrubSecrets(
      error instanceof Error
        ? error.message
        : "Verification or apply failed. The previous version was kept",
      secrets,
    );
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      if (!authorized(req, options.token)) {
        send(res, 401, { error: "AUTH_REQUIRED", message: "update agent token required" });
        return;
      }
      const url = new URL(req.url ?? "/", "http://update-agent");
      if (req.method === "POST" && url.pathname === "/v1/jobs") {
        if (active) {
          send(res, 409, {
            error: "APPLY_IN_PROGRESS",
            message: "An update is already running",
          });
          return;
        }
        const document = await readBody(req);
        const job: StoredJob = {
          id: randomUUID(),
          status: "verifying",
          progress: 5,
          component: "okkey",
          fromVersion: "",
          toVersion: "",
        };
        jobs.set(job.id, job);
        active = true;
        void execute(job, document).finally(() => {
          active = false;
        });
        send(res, 202, { job: publicJob(job) });
        return;
      }
      const match = /^\/v1\/jobs\/([0-9a-f-]{36})$/i.exec(url.pathname);
      if (req.method === "GET" && match) {
        const job = jobs.get(match[1] ?? "");
        if (!job) {
          send(res, 404, { error: "NOT_FOUND", message: "Update job not found" });
          return;
        }
        send(res, 200, { job: publicJob(job) });
        return;
      }
      send(res, 404, { error: "NOT_FOUND", message: "Route not found" });
    } catch (error) {
      if (isSystemUpdateError(error)) {
        send(res, error.statusCode, { error: error.code, message: error.message });
        return;
      }
      send(res, 500, { error: "APPLY_FAILED", message: "Update agent failed" });
    }
  }

  return {
    handler: handle,
    jobs,
    /** Test helper: wait until the in-flight job settles. */
    async settle(): Promise<void> {
      for (let attempt = 0; attempt < 50 && active; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    },
  };
}

export function startUpdateAgentServer(options: UpdateAgentOptions & { port: number }) {
  const agent = createUpdateAgent(options);
  const server = createServer((req, res) => {
    void agent.handler(req, res);
  });
  server.listen(options.port);
  return server;
}

function publicJob(job: StoredJob): UpdateJob {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    component: job.component,
    fromVersion: job.fromVersion,
    toVersion: job.toVersion,
    ...(job.errorCode ? { errorCode: job.errorCode, errorMessage: job.errorMessage } : {}),
  };
}

function authorized(req: IncomingMessage, token: string): boolean {
  const expected = token.trim();
  if (!expected) {
    return false;
  }
  const header = req.headers.authorization ?? "";
  const presented = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  const a = createHash("sha256").update(presented).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}
